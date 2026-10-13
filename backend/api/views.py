from django.shortcuts import render
from django.conf import settings
from django.utils import timezone
from django.core.files.storage import default_storage
from django.db import close_old_connections, transaction
from django.http import HttpResponse, StreamingHttpResponse
from rest_framework.decorators import api_view, parser_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
import os
import shutil
import csv
import time
import cv2
import numpy as np

from .models import Employee, Attendance
from .serializers import EmployeeSerializer, AttendanceSerializer
from .face_recognition import (
    capture_registration_images,
    start_attendance_camera,
    stop_attendance_camera,
    camera_running,
    get_face_embedding,
    load_embeddings,
    save_embeddings,
    get_latest_frame,
    get_latest_detection,
    cosine_similarity
)
import api.face_recognition as fr_module


@api_view(['GET', 'POST'])
@parser_classes([MultiPartParser, FormParser])
def employee_list(request):
    """
    GET: List all registered employees.
    POST: Create a new employee with standard single image upload.
    """
    if request.method == 'GET':
        employees = Employee.objects.all().order_by('id')
        serializer = EmployeeSerializer(employees, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = EmployeeSerializer(data=request.data)
        if serializer.is_valid():
            employee = serializer.save()
            
            # Generate embedding for this uploaded file
            if employee.image:
                try:
                    img_path = employee.image.path
                    emb = get_face_embedding(img_path)
                    if emb is not None:
                        embeddings_dict = load_embeddings()
                        embeddings_dict[str(employee.id)] = [emb]
                        save_embeddings(embeddings_dict)
                except Exception as e:
                    print(f"Error computing embedding for uploaded image: {e}")
                    
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
def attendance_list(request):
    """GET: List all attendance logs sorted by time descending."""
    attendance = Attendance.objects.all().order_by('-time')
    serializer = AttendanceSerializer(attendance, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def register_employee(request):
    """
    POST: Register a new employee.
    Requires: name.
    If 'images' (multipart files) are uploaded, generate embeddings from them.
    Otherwise, open OpenCV webcam to capture 10 face frames in real-time.
    """
    name = request.data.get('name', '').strip()
    if not name:
        return Response({"error": "Employee name is required."}, status=status.HTTP_400_BAD_REQUEST)
    
    uploaded_files = request.FILES.getlist('images') or request.FILES.getlist('image')
    
    if uploaded_files:
        # Option A/B: Uploaded images or browser webcam snaps
        try:
            # Create employee record
            employee = Employee.objects.create(name=name)
            employee.image = uploaded_files[0]
            employee.save()
            
            # Save uploaded files to dataset folder and extract embeddings
            emp_dataset_dir = os.path.join(os.path.dirname(settings.BASE_DIR), 'dataset', f"{employee.id}_{name}")
            os.makedirs(emp_dataset_dir, exist_ok=True)
            
            emp_embeddings = []
            for idx, file in enumerate(uploaded_files):
                temp_name = default_storage.save(f"temp/{employee.id}_{idx}_{file.name}", file)
                temp_path = default_storage.path(temp_name)
                
                dest_name = f"uploaded_{idx}_{file.name}"
                dest_path = os.path.join(emp_dataset_dir, dest_name)
                shutil.copy(temp_path, dest_path)
                
                emb = get_face_embedding(dest_path)
                if emb is not None:
                    emp_embeddings.append(emb)
                    
                try:
                    default_storage.delete(temp_name)
                except Exception as e:
                    print(f"Error deleting temp file: {e}")
                    
            if len(emp_embeddings) == 0:
                # Rollback on failure to prevent empty employee records
                employee.delete()
                if os.path.exists(emp_dataset_dir):
                    shutil.rmtree(emp_dataset_dir, ignore_errors=True)
                return Response(
                    {"error": "Could not extract face embeddings from the image(s). Please ensure your face is well-lit and clearly visible."}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
                
            # Save embeddings
            embeddings_dict = load_embeddings()
            embeddings_dict[str(employee.id)] = emp_embeddings
            save_embeddings(embeddings_dict)
            
            serializer = EmployeeSerializer(employee)
            return Response({
                "status": "success",
                "message": f"Successfully enrolled {name} with {len(emp_embeddings)} facial vector snapshots.",
                "employee": serializer.data
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            if 'employee' in locals() and employee.id:
                employee.delete()
            return Response({"error": f"Registration failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    else:
        # Option C: Desktop OpenCV Webcam Capture
        if fr_module.camera_running:
            return Response(
                {"error": "Attendance camera scanner is currently active. Please stop scanning before launching desktop webcam registration."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        employee = Employee.objects.create(name=name)
        success, result_or_error = capture_registration_images(name, employee.id)
        if not success:
            employee.delete()
            return Response({"error": result_or_error}, status=status.HTTP_400_BAD_REQUEST)
            
        employee.image = result_or_error
        employee.save()
        
        serializer = EmployeeSerializer(employee)
        return Response({
            "status": "success",
            "message": f"Successfully captured faces and enrolled {name}.",
            "employee": serializer.data
        }, status=status.HTTP_201_CREATED)

@api_view(['POST', 'GET'])
def start_camera(request):
    """Start the real-time background webcam recognition system."""
    success, message = start_attendance_camera()
    if success:
        return Response({"status": "success", "message": message})
    else:
        return Response({"status": "error", "message": message}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST', 'GET'])
def stop_camera(request):
    """Stop the running face recognition camera."""
    success, message = stop_attendance_camera()
    if success:
        return Response({"status": "success", "message": message})
    else:
        return Response({"status": "error", "message": message}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
def camera_status(request):
    """GET: Return status of webcam scanning thread and latest recognition event."""
    return Response({
        "status": "success",
        "camera_running": fr_module.camera_running,
        "latest_detection": get_latest_detection()
    })

def generate_stream_frames():
    """Generator yielding MJPEG frames for live web streaming."""
    try:
        while True:
            frame_bytes = get_latest_frame()
            if frame_bytes:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                time.sleep(0.04)
            else:
                time.sleep(0.1)
    except GeneratorExit:
        pass

def video_feed(request):
    """Live webcam MJPEG stream endpoint for the web dashboard."""
    return StreamingHttpResponse(
        generate_stream_frames(),
        content_type='multipart/x-mixed-replace; boundary=frame'
    )

@api_view(['GET'])
def stats_dashboard(request):
    """GET: Return analytics numbers for total, present, and absent employees."""
    today = timezone.now().date()
    total_employees = Employee.objects.count()
    
    # Calculate present employees: unique employees who marked attendance today
    present_employees = Attendance.objects.filter(time__date=today).values('employee').distinct().count()
    absent_employees = max(0, total_employees - present_employees)
    rate = round((present_employees / total_employees * 100), 1) if total_employees > 0 else 0
    total_logs = Attendance.objects.count()
    
    return Response({
        "total_employees": total_employees,
        "present_employees": present_employees,
        "absent_employees": absent_employees,
        "attendance_rate": rate,
        "total_logs": total_logs,
        "today": today.isoformat()
    })

@api_view(['GET', 'DELETE'])
def employee_detail(request, pk):
    """GET or DELETE an employee, their image files, and their face embeddings."""
    try:
        employee = Employee.objects.get(pk=pk)
    except Employee.DoesNotExist:
        return Response({"error": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)
        
    if request.method == 'GET':
        serializer = EmployeeSerializer(employee)
        return Response(serializer.data)
        
    elif request.method == 'DELETE':
        # Delete embeddings from embeddings.pkl
        embeddings_dict = load_embeddings()
        if str(pk) in embeddings_dict:
            del embeddings_dict[str(pk)]
            save_embeddings(embeddings_dict)
            
        # Delete dataset folder
        name = employee.name
        emp_dataset_dir = os.path.join(os.path.dirname(settings.BASE_DIR), 'dataset', f"{pk}_{name}")
        if os.path.exists(emp_dataset_dir):
            try:
                shutil.rmtree(emp_dataset_dir)
            except Exception as e:
                print(f"Error deleting dataset directory: {e}")
                
        # Delete profile image copy from media/employees/
        if employee.image:
            try:
                if os.path.exists(employee.image.path):
                    os.remove(employee.image.path)
            except Exception as e:
                print(f"Error deleting image file: {e}")
                
        # Delete from DB
        employee.delete()
        return Response({"status": "success", "message": f"Successfully deleted {name} and their face credentials."})

@api_view(['DELETE'])
def attendance_detail(request, pk):
    """DELETE: Remove a specific attendance log entry."""
    try:
        log = Attendance.objects.get(pk=pk)
        log.delete()
        return Response({"status": "success", "message": "Attendance record deleted from database."})
    except Attendance.DoesNotExist:
        return Response({"error": "Record not found."}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET'])
def export_attendance_csv(request):
    """GET: Download attendance records as a formatted CSV spreadsheet."""
    date_filter = request.GET.get('date')
    queryset = Attendance.objects.select_related('employee').all().order_by('-time')
    if date_filter:
        queryset = queryset.filter(time__date=date_filter)

    response = HttpResponse(content_type='text/csv')
    filename = f"attendance_report_{date_filter if date_filter else 'all'}.csv"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'

    writer = csv.writer(response)
    writer.writerow(['Record ID', 'Employee ID', 'Employee Name', 'Date', 'Time (UTC)', 'Status'])

    for item in queryset:
        writer.writerow([
            item.id,
            item.employee.id,
            item.employee.name,
            item.time.strftime('%Y-%m-%d'),
            item.time.strftime('%H:%M:%S'),
            'Present'
        ])

    return response

@api_view(['POST', 'DELETE'])
def clear_attendance(request):
    """Clear all attendance logs or logs for a specific date."""
    date_filter = request.data.get('date') or request.GET.get('date')
    if date_filter:
        deleted_count, _ = Attendance.objects.filter(time__date=date_filter).delete()
        msg = f"Cleared {deleted_count} logs for date {date_filter}."
    else:
        deleted_count, _ = Attendance.objects.all().delete()
        msg = f"Cleared all {deleted_count} attendance records."
    return Response({"status": "success", "message": msg, "deleted_count": deleted_count})

@api_view(['POST'])
def mark_attendance_manual(request):
    """Manually mark attendance for an employee."""
    emp_id = request.data.get('employee_id')
    if not emp_id:
        return Response({"error": "employee_id is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        employee = Employee.objects.get(pk=emp_id)
        today = timezone.now().date()
        existing = Attendance.objects.filter(employee=employee, time__date=today).first()
        if existing and not request.data.get('force', False):
            serializer = AttendanceSerializer(existing)
            return Response({
                "status": "info",
                "message": f"{employee.name} is already marked present today ({existing.time.strftime('%I:%M %p')}).",
                "attendance": serializer.data,
                "already_marked": True
            })

        log = Attendance.objects.create(employee=employee)
        serializer = AttendanceSerializer(log)
        return Response({"status": "success", "message": f"Marked {employee.name} as present.", "attendance": serializer.data})
    except Employee.DoesNotExist:
        return Response({"error": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

def get_face_cascade():
    """Retrieve frontal face cascade with fallback paths."""
    paths = [
        os.path.join(settings.BASE_DIR, 'api', 'haarcascade_frontalface_default.xml'),
        cv2.data.haarcascades + 'haarcascade_frontalface_default.xml',
        os.path.join(os.path.expanduser('~'), '.deepface', 'weights', 'haarcascade_frontalface_default.xml'),
    ]
    for p in paths:
        if os.path.exists(p):
            cc = cv2.CascadeClassifier(p)
            if not cc.empty():
                return cc
    return cv2.CascadeClassifier()

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def scan_frame(request):
    """
    Accepts a single webcam frame image from the frontend camera stream.
    Detects faces, computes FaceNet embeddings, matches against database,
    and logs attendance if matched (with once-per-day duplicate prevention).
    """
    uploaded_file = request.FILES.get('frame') or request.FILES.get('image')
    if not uploaded_file:
        return Response({"error": "No video frame provided."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        file_bytes = np.frombuffer(uploaded_file.read(), np.uint8)
        frame = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        if frame is None:
            return Response({"error": "Could not decode video frame."}, status=status.HTTP_400_BAD_REQUEST)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        face_cascade = get_face_cascade()
        faces = face_cascade.detectMultiScale(gray, 1.25, 4) if not face_cascade.empty() else []

        embeddings_dict = load_embeddings()
        if not embeddings_dict:
            return Response({"matched": False, "faces_count": len(faces), "message": "No enrolled employee facial vectors."})

        best_match = None
        max_sim = -1.0
        best_box = None

        if len(faces) > 0:
            for (x, y, w, h) in faces:
                face_crop = frame[y:y+h, x:x+w]
                emb = get_face_embedding(face_crop)
                if emb is not None:
                    for emp_id, emp_embs in embeddings_dict.items():
                        for saved_emb in emp_embs:
                            sim = cosine_similarity(emb, saved_emb)
                            if sim > max_sim:
                                max_sim = sim
                                best_match = emp_id
                                best_box = [int(x), int(y), int(w), int(h)]
        else:
            # Fallback: extract embedding directly from the full frame
            emb = get_face_embedding(frame)
            if emb is not None:
                for emp_id, emp_embs in embeddings_dict.items():
                    for saved_emb in emp_embs:
                        sim = cosine_similarity(emb, saved_emb)
                        if sim > max_sim:
                            max_sim = sim
                            best_match = emp_id

        THRESHOLD = 0.55
        if best_match is not None and max_sim >= THRESHOLD:
            try:
                employee = Employee.objects.get(id=int(best_match))
                today = timezone.now().date()
                existing = Attendance.objects.filter(employee=employee, time__date=today).first()

                if not existing:
                    attendance = Attendance.objects.create(employee=employee)
                    already_marked = False
                    msg = f"Attendance marked for {employee.name}"
                else:
                    attendance = existing
                    already_marked = True
                    msg = f"{employee.name} is already marked present today."

                serializer = AttendanceSerializer(attendance)
                return Response({
                    "matched": True,
                    "already_marked": already_marked,
                    "employee_id": employee.id,
                    "employee_name": employee.name,
                    "similarity": round(float(max_sim), 2),
                    "box": best_box,
                    "message": msg,
                    "attendance": serializer.data
                })
            except Employee.DoesNotExist:
                pass

        return Response({
            "matched": False,
            "faces_count": len(faces),
            "max_similarity": round(float(max_sim), 2) if max_sim > 0 else 0,
            "message": "Face detected but does not match any enrolled staff."
        })

    except Exception as e:
        return Response({"error": f"Error scanning frame: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)