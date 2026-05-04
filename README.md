# ProctorAI — AI-Based Online Exam Proctoring System

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-blue?logo=python" alt="Python">
  <img src="https://img.shields.io/badge/Flask-3.1-green?logo=flask" alt="Flask">
  <img src="https://img.shields.io/badge/ML-Isolation_Forest-red?logo=scikit-learn" alt="ML">
  <img src="https://img.shields.io/badge/Webcam-MediaPipe-orange?logo=google" alt="MediaPipe">
</p>

An AI-powered exam proctoring system that detects cheating using **Isolation Forest** anomaly detection and **MediaPipe Face Mesh** webcam monitoring. Built with a hacker/terminal-themed UI.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **Authentication** | Secure login/signup with role selection (Student / Examiner) |
| 📝 **MCQ + Writing Questions** | 10 multiple-choice + 5 written answer questions |
| 📷 **Webcam Proctoring** | Real-time head pose detection using MediaPipe Face Mesh (runs in browser) |
| 🚫 **Copy/Paste Blocking** | All copy, cut, paste events blocked with violation warnings |
| ⚡ **5-Strike Auto-Exit** | 5 violations (tab switch, copy/paste, head movement) = automatic exam termination |
| 🤖 **ML Anomaly Detection** | Isolation Forest model trained on 6 behavioral features |
| 📊 **Admin Dashboard** | Examiner view with student records, metrics, and flagged students |
| 🎨 **Hacker Theme** | Matrix rain background, terminal aesthetic, glassmorphism |

## 🔬 ML Model — 6 Behavioral Features

| Feature | What it Tracks |
|---------|---------------|
| `time_per_question` | Average seconds per question |
| `tab_switch_count` | Browser tab switches |
| `idle_time` | Seconds of inactivity |
| `answer_change_count` | Re-selections on answers |
| `copy_paste_attempts` | Copy/paste/cut attempts |
| `head_movement_count` | Looking away from screen (via webcam) |

## 🚀 Quick Start

### 1. Clone
```bash
git clone https://github.com/IstiyaqAhmad/ProctorAI.git
cd ProctorAI
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run
```bash
python app.py
```
Open **http://127.0.0.1:5000** in your browser.

> The ML model auto-trains on first run using synthetic data.

### 4. Usage
1. **Register** as Student or Examiner
2. **Student**: Take exam → webcam required → answer questions → get results
3. **Examiner**: View admin dashboard at `/admin` → see all student records + anomaly flags

## 📁 Project Structure

```
ProctorAI/
├── app.py                  # Flask backend (routes, auth, ML integration)
├── model.py                # Isolation Forest ML module
├── requirements.txt        # Python dependencies
├── templates/
│   ├── login.html          # Auth page (Matrix rain theme)
│   ├── exam.html           # Exam portal (webcam + monitoring)
│   ├── result.html         # Results page (score + behavior metrics)
│   └── admin.html          # Admin dashboard
└── static/
    ├── style.css           # Unified hacker theme CSS
    └── script.js           # Behavior tracker + MediaPipe head detection
```

## 🛡️ Anti-Cheat System

- **Webcam Gate**: Exam won't start without camera access
- **Face Detection**: No face = violation + warning
- **Head Tracking**: Looking away triggers violation
- **Tab Monitoring**: Switching tabs = violation
- **Paste Blocking**: Copy/paste blocked with keyboard shortcut prevention
- **5-Strike Rule**: 5 violations → auto-submit + "EXAM TERMINATED" screen

## 🧪 Tech Stack

- **Backend**: Python, Flask
- **ML**: scikit-learn (Isolation Forest), NumPy, Pandas
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Webcam**: MediaPipe Face Mesh (CDN, runs client-side)
- **Storage**: JSON file (demo purposes)

## 📜 License

MIT License — feel free to use for educational projects.
