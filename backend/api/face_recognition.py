import os
import sys
import cv2
import pickle
import numpy as np
import threading
import time
from django.conf import settings
from django.utils import timezone
from django.db import close_old_connections

# Safeguard console encoding on Windows to prevent DeepFace emoji / charmap crashes
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Suppress verbose TensorFlow / oneDNN messages
os.environ.setdefault('TF_ENABLE_ONEDNN_OPTS', '0')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')

# Fallback-safe BASE_DIR for standalone scripts and tests
if getattr(settings, 'configured', False):
    BASE_DIR = settings.BASE_DIR
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATASET_DIR = os.path.normpath(os.path.join(BASE_DIR, '..', 'dataset'))
EMBEDDINGS_DIR = os.path.normpath(os.path.join(BASE_DIR, '..', 'embeddings'))
EMBEDDINGS_FILE = os.path.join(EMBEDDINGS_DIR, 'embeddings.pkl')

# Ensure directories exist
os.makedirs(DATASET_DIR, exist_ok=True)
os.makedirs(EMBEDDINGS_DIR, exist_ok=True)

# Lazy-loaded DeepFace singleton so Django startup is instant
_deepface = None

def get_deepface():
    """Lazily load DeepFace so startup and migrations do not stall for 25 seconds."""
    global _deepface
    if _deepface is None:
        try:
            from deepface import DeepFace
            _deepface = DeepFace
        except Exception as e:
            print(f"Warning: DeepFace could not be loaded: {e}. Running in simulation mode.")
            _deepface = False
    return _deepface if _deepface is not False else None

def get_face_cascade():
    """Retrieve frontal face cascade with fallback paths."""
    paths = [
        os.path.join(BASE_DIR, 'api', 'haarcascade_frontalface_default.xml'),
        cv2.data.haarcascades + 'haarcascade_frontalface_default.xml',
        os.path.join(os.path.expanduser('~'), '.deepface', 'weights', 'haarcascade_frontalface_default.xml'),
    ]
    for p in paths:
        if os.path.exists(p):
            cc = cv2.CascadeClassifier(p)
            if not cc.empty():
                return cc
    return cv2.CascadeClassifier()

# Thread control for active attendance camera
camera_thread = None
camera_running = False
camera_stop_event = threading.Event()
latest_frame_lock = threading.Lock()
latest_frame_jpeg = None
latest_detection_info = None

def get_latest_frame():
    """Retrieve the latest JPEG encoded video frame for web streaming."""
    with latest_frame_lock:
        return latest_frame_jpeg

def get_latest_detection():
    """Retrieve the latest detected recognition info within the past 4 seconds."""
    global latest_detection_info
    if latest_detection_info and (time.time() - latest_detection_info.get("timestamp", 0) < 4.0):
        return latest_detection_info
    return None

def load_embeddings():
    """Load the embeddings dictionary from the pkl file."""
    if os.path.exists(EMBEDDINGS_FILE):
        try:
            with open(EMBEDDINGS_FILE, 'rb') as f:
                data = pickle.load(f)
                if isinstance(data, dict):
                    return data
        except Exception as e:
            print(f"Error loading embeddings file: {e}")
    return {}

def save_embeddings(embeddings_dict):
    """Save the embeddings dictionary to the pkl file."""
    try:
        with open(EMBEDDINGS_FILE, 'wb') as f:
            pickle.dump(embeddings_dict, f)
        print("Embeddings saved successfully.")
        return True
    except Exception as e:
        print(f"Error saving embeddings: {e}")
        return False

def get_face_embedding(img):
    """
    Get 128-d FaceNet embedding for a face image.
    Accepts path or numpy array (image).
    """
    df = get_deepface()
    if df is None:
        # Simulation mode: return dummy embedding
        return list(np.random.rand(128))
    
    try:
        # Use Facenet model (128-dimensional default)
        representations = df.represent(
            img_path=img,
            model_name="Facenet",
            enforce_detection=False
        )
        if representations and len(representations) > 0:
            return representations[0]["embedding"]
    except Exception as e:
        print(f"Error extracting embedding: {e}")
    return None

def cosine_similarity(v1, v2):
    """Calculate cosine similarity between two vectors."""
    v1 = np.array(v1, dtype=np.float32)
    v2 = np.array(v2, dtype=np.float32)
    dot_product = np.dot(v1, v2)
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)
    if norm_v1 == 0 or norm_v2 == 0:
        return 0.0
    return float(dot_product / (norm_v1 * norm_v2))

def capture_registration_images(employee_name, employee_id, num_images=10):
    """
    Opens the webcam to capture multiple face images of an employee.
    Saves cropped faces to dataset/{employee_id}_{employee_name}/ and extracts embeddings.
    """
    global camera_running
    if camera_running:
        return False, "Live attendance camera is currently running. Please stop scanning before opening webcam registration."

    # Create employee-specific dataset folder
    emp_dataset_dir = os.path.join(DATASET_DIR, f"{employee_id}_{employee_name}")
    os.makedirs(emp_dataset_dir, exist_ok=True)
    
    face_cascade = get_face_cascade()
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: Could not open webcam for registration.")
        return False, "Could not open webcam. Make sure it is connected and not in use by another application."
    
    saved_count = 0
    saved_paths = []
    
    print(f"Starting face registration for {employee_name}...")
    
    start_time = time.time()
    last_capture_time = 0
    
    try:
        while saved_count < num_images:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.05)
                continue
                
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.3, 5)
            
            # Display instructions
            display_frame = frame.copy()
            cv2.putText(display_frame, f"Registering: {employee_name}", (30, 40), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
            cv2.putText(display_frame, f"Captured: {saved_count}/{num_images} faces", (30, 80), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(display_frame, "Look directly at the camera with natural expressions", (30, 120), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            cv2.putText(display_frame, "Press 'q' to abort registration", (30, 450), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
                        
            for (x, y, w, h) in faces:
                cv2.rectangle(display_frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
                
                # Capture a frame every 0.8 seconds to get distinct angles/expressions
                current_time = time.time()
                if current_time - last_capture_time > 0.8 and saved_count < num_images:
                    face_crop = frame[y:y+h, x:x+w]
                    face_crop_resized = cv2.resize(face_crop, (200, 200))
                    
                    img_name = f"face_{saved_count + 1}.jpg"
                    img_path = os.path.join(emp_dataset_dir, img_name)
                    cv2.imwrite(img_path, face_crop_resized)
                    
                    saved_paths.append(img_path)
                    saved_count += 1
                    last_capture_time = current_time
                    print(f"Captured {saved_count}/{num_images}: {img_path}")
            
            try:
                cv2.imshow("Employee Face Registration", display_frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    print("Registration aborted by user.")
                    break
            except Exception:
                pass
                
            # Timeout after 45 seconds to prevent hanging
            if time.time() - start_time > 45:
                print("Registration timed out.")
                break
    finally:
        cap.release()
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass
        
    if saved_count < num_images:
        return False, f"Registration aborted or timed out. Only captured {saved_count}/{num_images} images."
        
    # Generate and store embeddings
    print("Generating embeddings...")
    embeddings_dict = load_embeddings()
    emp_embeddings = []
    
    for path in saved_paths:
        emb = get_face_embedding(path)
        if emb is not None:
            emp_embeddings.append(emb)
            
    if len(emp_embeddings) == 0:
        return False, "Failed to extract embeddings from captured faces. Make sure the lighting is good."
        
    embeddings_dict[str(employee_id)] = emp_embeddings
    save_embeddings(embeddings_dict)
    
    # Save a primary avatar to media/employees/ directory
    media_emp_dir = os.path.join(settings.MEDIA_ROOT, 'employees')
    os.makedirs(media_emp_dir, exist_ok=True)
    
    relative_img_path = f"employees/{employee_id}_{employee_name}_face_1.jpg"
    dest_path = os.path.join(settings.MEDIA_ROOT, relative_img_path)
    try:
        first_face = cv2.imread(saved_paths[0])
        cv2.imwrite(dest_path, first_face)
    except Exception as e:
        print(f"Could not copy face image to media root: {e}")
        
    return True, relative_img_path

class AttendanceCameraThread(threading.Thread):
    def __init__(self, threshold=0.55):
        super().__init__()
        self.threshold = threshold
        self.daemon = True
        
    def run(self):
        global camera_running, latest_frame_jpeg, latest_detection_info
        camera_running = True
        
        from .models import Employee, Attendance
        
        face_cascade = get_face_cascade()
        cap = cv2.VideoCapture(0)
        
        if not cap.isOpened():
            print("Error: Could not open webcam for attendance.")
            camera_running = False
            return
            
        print("Attendance Camera started.")
        embeddings_dict = load_embeddings()
        last_emb_reload = time.time()
        
        # Keep track of recently marked employees (cooldown in seconds)
        marked_recently = {}
        last_face_match_time = 0
        cached_face_results = []
        
        try:
            while not camera_stop_event.is_set():
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.03)
                    continue
                    
                now = time.time()
                # Refresh embeddings periodically so newly registered employees are recognized immediately
                if now - last_emb_reload > 3.0:
                    embeddings_dict = load_embeddings()
                    last_emb_reload = now
                    
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.3, 5)
                
                display_frame = frame.copy()
                cv2.putText(display_frame, "LIVE Attendance Camera", (20, 30), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                cv2.putText(display_frame, f"Tracking {len(faces)} face(s)", (20, 60), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                            
                should_compute = (now - last_face_match_time > 0.4) or (len(cached_face_results) != len(faces))
                
                if should_compute and len(faces) > 0:
                    last_face_match_time = now
                    cached_face_results = []
                    
                    for (x, y, w, h) in faces:
                        face_crop = frame[y:y+h, x:x+w]
                        emb = get_face_embedding(face_crop)
                        
                        matched_id = None
                        max_sim = -1.0
                        
                        if emb is not None and len(embeddings_dict) > 0:
                            for emp_id, emp_embs in embeddings_dict.items():
                                for saved_emb in emp_embs:
                                    sim = cosine_similarity(emb, saved_emb)
                                    if sim > max_sim:
                                        max_sim = sim
                                        matched_id = emp_id
                                        
                        if matched_id is not None and max_sim >= self.threshold:
                            label_name = f"ID: {matched_id}"
                            try:
                                close_old_connections()
                                employee = Employee.objects.get(id=int(matched_id))
                                label_name = employee.name
                                
                                today = timezone.now().date()
                                last_marked = marked_recently.get(employee.id, 0)
                                
                                # Cooldown: check-in marked once every 10 seconds, but in DB once per day
                                if now - last_marked > 10.0:
                                    if not Attendance.objects.filter(employee=employee, time__date=today).exists():
                                        Attendance.objects.create(employee=employee)
                                        print(f"Attendance marked for: {label_name} (Similarity: {max_sim:.2f})")
                                    marked_recently[employee.id] = now
                                    
                                latest_detection_info = {
                                    "employee_id": employee.id,
                                    "name": employee.name,
                                    "similarity": round(float(max_sim), 2),
                                    "timestamp": now
                                }
                            except Exception as ex:
                                print(f"Error handling employee detection: {ex}")
                                
                            cached_face_results.append({
                                'box': (x, y, w, h),
                                'label': f"{label_name} ({max_sim:.2f})",
                                'color': (0, 255, 0)
                            })
                        else:
                            cached_face_results.append({
                                'box': (x, y, w, h),
                                'label': "Unknown",
                                'color': (0, 0, 255)
                            })
                elif len(faces) == 0:
                    cached_face_results = []
                    
                # Render bounding boxes and labels
                for result in cached_face_results:
                    rx, ry, rw, rh = result['box']
                    rcol = result['color']
                    cv2.rectangle(display_frame, (rx, ry), (rx+rw, ry+rh), rcol, 2)
                    cv2.putText(display_frame, result['label'], (rx, max(20, ry - 10)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, rcol, 2)
                                
                # Save JPEG buffer for live MJPEG web streaming
                try:
                    _, buffer = cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    with latest_frame_lock:
                        latest_frame_jpeg = buffer.tobytes()
                except Exception:
                    pass
                    
                # Display in OpenCV desktop window if GUI is supported
                try:
                    cv2.imshow("Attendance System - Webcam", display_frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break
                except Exception:
                    pass
        finally:
            cap.release()
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass
            with latest_frame_lock:
                latest_frame_jpeg = None
            camera_running = False
            print("Attendance Camera stopped.")

def start_attendance_camera():
    """Starts the real-time attendance camera in a background thread."""
    global camera_thread, camera_running, camera_stop_event
    if camera_running:
        return False, "Camera is already running."
        
    camera_stop_event.clear()
    camera_thread = AttendanceCameraThread()
    camera_thread.start()
    return True, "Camera started successfully."

def stop_attendance_camera():
    """Stops the running attendance camera thread."""
    global camera_running, camera_stop_event
    if not camera_running:
        return False, "Camera is not running."
        
    camera_stop_event.set()
    return True, "Stop signal sent to camera."
