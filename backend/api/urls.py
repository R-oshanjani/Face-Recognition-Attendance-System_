from django.urls import path
from . import views

urlpatterns = [
    path('employees/', views.employee_list, name='employee-list'),
    path('attendance/', views.attendance_list, name='attendance-list'),
    path('register/', views.register_employee, name='register-employee'),
    path('start-camera/', views.start_camera, name='start-camera'),
    path('stop-camera/', views.stop_camera, name='stop-camera'),
    path('camera-status/', views.camera_status, name='camera-status'),
    path('video-feed/', views.video_feed, name='video-feed'),
    path('stats/', views.stats_dashboard, name='stats-dashboard'),
    path('employees/<int:pk>/', views.employee_detail, name='employee-detail'),
    path('attendance/<int:pk>/', views.attendance_detail, name='attendance-detail'),
    path('attendance/export/', views.export_attendance_csv, name='attendance-export'),
    path('attendance/clear/', views.clear_attendance, name='attendance-clear'),
    path('attendance/mark/', views.mark_attendance_manual, name='attendance-mark'),
    path('scan-frame/', views.scan_frame, name='scan-frame'),
]
