"""
model.py
========
ML module for ProctorAI — Exam Malpractice Detection System.

Uses Isolation Forest (unsupervised anomaly detection) to identify
suspicious student behavior during online exams.

Features tracked:
  - time_per_question     (avg seconds per question)
  - tab_switch_count      (browser tab switches)
  - idle_time             (seconds of inactivity)
  - answer_change_count   (re-selections)
  - copy_paste_attempts   (Ctrl+C / Ctrl+V events)
  - head_movement_count   (looking away from screen detected by webcam)
"""

import pickle
import os
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# ── Constants ────────────────────────────────────────────────────────────────
FEATURE_COLS = [
    "time_per_question",
    "tab_switch_count",
    "idle_time",
    "answer_change_count",
    "copy_paste_attempts",
    "head_movement_count",
]

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH   = os.path.join(BASE_DIR, "model.pkl")
SCALER_PATH  = os.path.join(BASE_DIR, "scaler.pkl")
DATASET_PATH = os.path.join(BASE_DIR, "dataset.csv")


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic Dataset Generator
# ─────────────────────────────────────────────────────────────────────────────
def generate_dataset(num_samples=500):
    """
    Generate synthetic student behavior data.
    ~80% normal, ~20% suspicious.
    """
    np.random.seed(42)
    n_normal = int(num_samples * 0.80)
    n_suspicious = num_samples - n_normal

    # Normal students: moderate behavior
    normal = {
        "student_id":          [f"STU-{i:04d}" for i in range(1, n_normal + 1)],
        "time_per_question":   np.random.normal(30, 8, n_normal).clip(5),
        "tab_switch_count":    np.random.poisson(1, n_normal),
        "idle_time":           np.random.normal(10, 5, n_normal).clip(0),
        "answer_change_count": np.random.poisson(2, n_normal),
        "copy_paste_attempts": np.random.poisson(0.3, n_normal),
        "head_movement_count": np.random.poisson(2, n_normal),
    }

    # Suspicious students: outlier behavior
    suspicious = {
        "student_id":          [f"STU-{i:04d}" for i in range(n_normal + 1, num_samples + 1)],
        "time_per_question":   np.random.normal(8, 3, n_suspicious).clip(1),
        "tab_switch_count":    np.random.poisson(12, n_suspicious),
        "idle_time":           np.random.normal(60, 20, n_suspicious).clip(5),
        "answer_change_count": np.random.poisson(8, n_suspicious),
        "copy_paste_attempts": np.random.poisson(5, n_suspicious),
        "head_movement_count": np.random.poisson(15, n_suspicious),
    }

    df = pd.concat([pd.DataFrame(normal), pd.DataFrame(suspicious)], ignore_index=True)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    df["time_per_question"] = df["time_per_question"].round(2)
    df["idle_time"] = df["idle_time"].round(2)
    df.to_csv(DATASET_PATH, index=False)
    print(f"[OK] Dataset generated -> {num_samples} records saved to {DATASET_PATH}")
    return df


# ─────────────────────────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────────────────────────
def train_model():
    """Train Isolation Forest on synthetic behavioral data."""
    if os.path.exists(DATASET_PATH):
        df = pd.read_csv(DATASET_PATH)
        print(f"[OK] Loaded existing dataset -> {len(df)} records")
    else:
        df = generate_dataset()

    X = df[FEATURE_COLS].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(
        n_estimators=100,
        contamination=0.2,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)
    with open(SCALER_PATH, "wb") as f:
        pickle.dump(scaler, f)

    df["prediction"] = model.predict(X_scaled)
    normal_count = (df["prediction"] == 1).sum()
    suspicious_count = (df["prediction"] == -1).sum()

    print(f"[OK] Model trained   -> Normal: {normal_count} | Suspicious: {suspicious_count}")
    print(f"[OK] Model saved     -> {MODEL_PATH}")
    print(f"[OK] Scaler saved    -> {SCALER_PATH}")
    return model, scaler, df


# ─────────────────────────────────────────────────────────────────────────────
# Inference
# ─────────────────────────────────────────────────────────────────────────────
def load_model():
    """Load trained model and scaler from disk."""
    with open(MODEL_PATH, "rb") as f:
        model = pickle.load(f)
    with open(SCALER_PATH, "rb") as f:
        scaler = pickle.load(f)
    return model, scaler


def predict_behavior(features: dict) -> dict:
    """
    Predict if behavior is normal or suspicious.

    Parameters: dict with keys matching FEATURE_COLS
    Returns: { prediction: 1/-1, anomaly_score: float, label: str }
    """
    model, scaler = load_model()
    X = np.array([[features[col] for col in FEATURE_COLS]])
    X_scaled = scaler.transform(X)

    prediction = int(model.predict(X_scaled)[0])
    anomaly_score = float(model.decision_function(X_scaled)[0])

    return {
        "prediction":    prediction,
        "anomaly_score": round(anomaly_score, 4),
        "label":         "Normal" if prediction == 1 else "Suspicious",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Standalone test
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  Isolation Forest — ProctorAI Malpractice Detection")
    print("=" * 60)

    model, scaler, df = train_model()

    # Test suspicious
    result = predict_behavior({
        "time_per_question": 5, "tab_switch_count": 15,
        "idle_time": 80, "answer_change_count": 10,
        "copy_paste_attempts": 8, "head_movement_count": 20,
    })
    print(f"\n[Test] Suspicious -> {result}")

    # Test normal
    result = predict_behavior({
        "time_per_question": 28, "tab_switch_count": 1,
        "idle_time": 8, "answer_change_count": 2,
        "copy_paste_attempts": 0, "head_movement_count": 1,
    })
    print(f"[Test] Normal     -> {result}")
