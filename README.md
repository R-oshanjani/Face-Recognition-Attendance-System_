# AuraFace: AI-Powered Face Recognition Attendance System

AuraFace is an enterprise-grade AI face recognition attendance system designed with a decoupled architecture: a **Django REST Framework (DRF)** backend and a **React 19 + Vite** glassmorphic dashboard client.

It utilizes **OpenCV** for computer vision and **DeepFace (FaceNet 128-d model)** to extract facial biometric embeddings, matching records with cosine similarity metrics in real time.

---

## ⚡ Quick Start (One-Click Launch)

On Windows, double-click or run:
```bash
# Using Batch file:
start_system.bat

# Or using PowerShell:
.\start_system.ps1
```
This automatically starts:
- **Backend API**: `http://127.0.0.1:8000/api/`
- **Frontend Web Portal**: `http://localhost:3000/`

---

## 📂 Project Architecture

```text
Face-Recognition-Attendance-System/
│
├── backend/                       # Django REST Framework backend
│   ├── attendance_system/         # Settings, WSGI, URLs
│   ├── api/                       # REST endpoints, models, serializers, views
│   │   ├── face_recognition.py    # OpenCV & DeepFace recognition engine
│   │   ├── models.py              # Employee & Attendance schemas
│   │   ├── serializers.py         # DRF Model serializers
│   │   ├── urls.py                # REST API routes
│   │   └── views.py               # API request controllers
│   ├── media/employees/           # Stored employee profile photos
│   ├── manage.py                  # Django management entry point
│   └── db.sqlite3                 # SQLite database
│
├── frontend/                      # React 19 + Vite client application
│   ├── src/                       # React components & glassmorphism styles
│   │   ├── App.jsx                # Main portal component
│   │   ├── App.css                # Glassmorphic component styles
│   │   └── index.css              # Design system tokens & typography
│   ├── index.html                 # App shell with Outfit & Plus Jakarta Sans
│   ├── package.json               # Node dependencies
│   └── vite.config.js             # Vite configuration
│
├── dataset/                       # Stored facial angle images for enrolled staff
├── embeddings/                    # Vector embeddings database (embeddings.pkl)
├── venv/                          # Python virtual environment
├── start_system.bat               # Windows one-click batch launcher
└── start_system.ps1               # PowerShell one-click launcher
```

---

## 🛠️ Manual Installation & Setup

### Prerequisites
- **Python 3.10+** (Virtual environment provided in `venv/`)
- **Node.js 18+**

### 1. Backend Setup
From the repository root:
```bash
# Activate virtual environment (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Run database migrations
cd backend
..\venv\Scripts\python.exe manage.py migrate

# Start backend server
..\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

### 2. Frontend Setup
From the `frontend/` directory:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000/` in your browser.

---

## ⚙️ Core Features & Workflow

1. **Biometric Face Enrollment (`Enroll Face` Tab)**:
   - Enter employee name and look at the camera.
   - **Eye Blink Liveness Detection**: The camera guides you to blink your eyes, or click **👁️ Blink & Capture Photo (1 Photo)** to capture 1 verified face frame.
   - Click **Enroll Employee**: Saves the employee to the Staff Directory with their FaceNet biometric vector. *(Does NOT mark them present upon registration)*.
2. **Taking Attendance (`Dashboard` Tab)**:
   - Click **Turn On Attendance Camera** to begin real-time scanning.
   - The scanner analyzes frames against enrolled biometric embeddings using cosine similarity (`≥ 0.55`).
   - Automatically marks attendance **Present** for today with once-per-day duplicate throttling.
   - Plays an audio confirmation chime and updates today's check-ins live.
   - Click **Turn Off Camera** when finished.
3. **Staff Directory (`Staff` Tab)**:
   - Search enrolled personnel, view avatars, view individual logs, or delete credentials.
4. **Audit Logs & Export (`Attendance Logs` Tab)**:
   - Filter logs by employee name and date, download CSV report, or clear records.

---

## 🚀 Key Optimizations & Stability Improvements

- **Instant Startup**: DeepFace model loading is lazily instantiated to eliminate 30-second Django startup delays.
- **Windows UTF-8 Safeguard**: Safe stdout/stderr reconfiguring prevents UnicodeEncodeError crashes on Windows consoles.
- **Atomic Registration**: Prevents empty or orphan employee records if image extraction fails.
- **Audio Biometrics**: Synthesized audio chimes via Web Audio API without requiring external audio assets.
