"""
app.py
======
Flask backend for ProctorAI — AI-Based Exam Malpractice Detection System.

Routes:
  /             -> Login/Signup page
  /register     -> POST: create new user
  /login        -> POST: authenticate user
  /logout       -> Clear session
  /exam         -> Exam interface (student only)
  /submit_exam  -> POST: receive answers + behavior data, run ML prediction
  /result       -> Exam result page
  /admin        -> Admin dashboard (examiner only)
  /api/students -> JSON API for dashboard
"""

import os
import json
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from model import predict_behavior, train_model, load_model, MODEL_PATH, FEATURE_COLS

app = Flask(__name__)
app.secret_key = "proctorAI_secret_2026_exam"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_FILE = os.path.join(BASE_DIR, "users.json")

# In-memory exam records
exam_records = []

# ─── Questions ────────────────────────────────────────────────────────────────
# type: "mcq" (multiple choice) or "text" (writing answer)
QUESTIONS = [
    {"id": 1, "type": "mcq", "question": "What is the time complexity of binary search?",
     "options": ["O(n)", "O(log n)", "O(n²)", "O(1)"], "answer": "O(log n)"},
    {"id": 2, "type": "mcq", "question": "Which data structure uses FIFO ordering?",
     "options": ["Stack", "Queue", "Tree", "Graph"], "answer": "Queue"},
    {"id": 3, "type": "mcq", "question": "What does CPU stand for?",
     "options": ["Central Processing Unit", "Central Program Utility", "Computer Personal Unit", "Central Processor Unifier"],
     "answer": "Central Processing Unit"},
    {"id": 4, "type": "mcq", "question": "Which sorting algorithm has the best average-case time complexity?",
     "options": ["Bubble Sort", "Selection Sort", "Merge Sort", "Insertion Sort"], "answer": "Merge Sort"},
    {"id": 5, "type": "mcq", "question": "What is the primary function of an operating system?",
     "options": ["Compile code", "Manage hardware resources", "Browse the internet", "Design databases"],
     "answer": "Manage hardware resources"},
    {"id": 6, "type": "mcq", "question": "Which protocol is used for secure web browsing?",
     "options": ["HTTP", "FTP", "HTTPS", "SMTP"], "answer": "HTTPS"},
    {"id": 7, "type": "mcq", "question": "What is a primary key in a database?",
     "options": ["A key used for encryption", "A unique identifier for records", "A foreign reference", "A backup key"],
     "answer": "A unique identifier for records"},
    {"id": 8, "type": "mcq", "question": "Which ML technique is used for anomaly detection?",
     "options": ["Linear Regression", "Isolation Forest", "K-Means Clustering", "Naive Bayes"],
     "answer": "Isolation Forest"},
    {"id": 9, "type": "mcq", "question": "What does HTML stand for?",
     "options": ["Hyper Text Markup Language", "High Tech Machine Learning", "Hyper Transfer Markup Language", "Home Tool Markup Language"],
     "answer": "Hyper Text Markup Language"},
    {"id": 10, "type": "mcq", "question": "Which of the following is NOT a programming language?",
     "options": ["Python", "Java", "HTML", "C++"], "answer": "HTML"},
    # ─── Writing Questions ─────────────────────────────────────────────────
    {"id": 11, "type": "text", "question": "Explain how a stack data structure works. Give an example of where it is used.",
     "keywords": ["lifo", "last in first out", "push", "pop", "function call", "recursion", "undo"]},
    {"id": 12, "type": "text", "question": "What is the difference between TCP and UDP? When would you use each?",
     "keywords": ["reliable", "connection", "connectionless", "packet", "streaming", "handshake", "order"]},
    {"id": 13, "type": "text", "question": "Describe what an operating system kernel does and why it is important.",
     "keywords": ["kernel", "hardware", "memory", "process", "system call", "driver", "resource"]},
    {"id": 14, "type": "text", "question": "What is normalization in databases? Why is it needed?",
     "keywords": ["redundancy", "duplicate", "table", "normal form", "1nf", "2nf", "3nf", "dependency"]},
    {"id": 15, "type": "text", "question": "Explain how the Isolation Forest algorithm detects anomalies.",
     "keywords": ["tree", "isolation", "split", "path", "outlier", "anomaly", "random", "fewer"]},
]

# ─── User helpers ─────────────────────────────────────────────────────────────
def get_users():
    if not os.path.exists(USERS_FILE):
        return []
    with open(USERS_FILE, "r") as f:
        return json.load(f)

def save_users(users):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

# ─── Ensure model ────────────────────────────────────────────────────────────
def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print("[..] Training ML model for the first time ...")
        train_model()
        print("[OK] Model ready.\n")

# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("login.html")

@app.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    fn = data.get("fname", "").strip()
    ln = data.get("lname", "").strip()
    rn = data.get("roll", "").strip()
    em = data.get("email", "").strip().lower()
    pw = data.get("password", "")
    role = data.get("role", "student")

    if not fn or not ln:
        return jsonify({"ok": False, "msg": "Full name required."})
    if not rn:
        return jsonify({"ok": False, "msg": "Roll number required."})
    if not em or "@" not in em:
        return jsonify({"ok": False, "msg": "Valid email required."})
    if len(pw) < 8:
        return jsonify({"ok": False, "msg": "Password must be 8+ characters."})

    users = get_users()
    if any(u["email"] == em for u in users):
        return jsonify({"ok": False, "msg": "Email already registered."})

    users.append({
        "fname": fn, "lname": ln, "roll": rn,
        "email": em, "password": pw, "role": role,
    })
    save_users(users)
    return jsonify({"ok": True, "msg": "Account registered successfully."})

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    em = data.get("email", "").strip().lower()
    pw = data.get("password", "")

    users = get_users()
    user = next((u for u in users if u["email"] == em and u["password"] == pw), None)

    if not user:
        return jsonify({"ok": False, "msg": "Invalid credentials."})

    session["user"] = user
    redirect_url = "/admin" if user["role"] == "examiner" else "/exam"
    return jsonify({"ok": True, "msg": f"Welcome, {user['fname']}!", "redirect": redirect_url})

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.route("/exam")
def exam():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("exam.html", questions=QUESTIONS, user=session["user"])

@app.route("/submit_exam", methods=["POST"])
def submit_exam():
    if "user" not in session:
        return jsonify({"status": "error", "msg": "Not logged in"})

    data = request.get_json()
    user = session["user"]

    behavior = {
        "time_per_question":   round(float(data.get("time_per_question", 30)), 2),
        "tab_switch_count":    int(data.get("tab_switch_count", 0)),
        "idle_time":           round(float(data.get("idle_time", 0)), 2),
        "answer_change_count": int(data.get("answer_change_count", 0)),
        "copy_paste_attempts": int(data.get("copy_paste_attempts", 0)),
        "head_movement_count": int(data.get("head_movement_count", 0)),
    }

    result = predict_behavior(behavior)

    answers = data.get("answers", {})
    text_answers = data.get("text_answers", {})
    violation_count = int(data.get("violation_count", 0))
    auto_submitted = bool(data.get("auto_submitted", False))

    # Score MCQ questions (exact match)
    correct = sum(1 for q in QUESTIONS if q["type"] == "mcq" and answers.get(str(q["id"])) == q["answer"])

    # Score text questions (keyword matching — at least 2 keywords = 1 point)
    for q in QUESTIONS:
        if q["type"] == "text":
            student_text = text_answers.get(str(q["id"]), "").lower()
            matched = sum(1 for kw in q["keywords"] if kw in student_text)
            if matched >= 2:
                correct += 1

    total = len(QUESTIONS)

    record = {
        "student_id":   user.get("roll", "N/A"),
        "student_name": f"{user['fname']} {user['lname']}",
        "score":        f"{correct}/{total}",
        "correct":      correct,
        "total":        total,
        **behavior,
        "violation_count": violation_count,
        "auto_submitted":  auto_submitted,
        "prediction":    result["prediction"],
        "anomaly_score": result["anomaly_score"],
        "label":         result["label"],
    }
    exam_records.append(record)
    session["exam_result"] = record

    return jsonify({"status": "ok", "redirect": url_for("result")})

@app.route("/result")
def result():
    if "exam_result" not in session:
        return redirect(url_for("index"))
    return render_template("result.html", result=session["exam_result"])

@app.route("/admin")
def admin():
    if "user" not in session:
        return redirect(url_for("index"))
    return render_template("admin.html", user=session["user"])

@app.route("/api/students")
def api_students():
    return jsonify(exam_records)

# ─── Entry Point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    ensure_model()
    print("\n" + "=" * 50)
    print("  ProctorAI — Exam Malpractice Detection System")
    print("  http://127.0.0.1:5000")
    print("=" * 50 + "\n")
    app.run(debug=True, host="127.0.0.1", port=5000)
