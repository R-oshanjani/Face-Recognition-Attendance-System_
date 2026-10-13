import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Camera,
  CameraOff,
  UserPlus,
  Users,
  Calendar,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Shield,
  Activity,
  Search,
  Clock,
  Sparkles,
  Video,
  Check,
  X,
  UserCheck,
  Volume2,
  VolumeX,
  History,
  ArrowRight,
  Eye,
  RotateCcw,
  Zap
} from 'lucide-react';
import './App.css';

const API_BASE_URL = 'http://127.0.0.1:8000';

export default function App() {
  // Navigation tabs: 'dashboard', 'attendance', 'register'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Dashboard Stats
  const [stats, setStats] = useState({
    total_employees: 0,
    present_employees: 0,
    absent_employees: 0,
    attendance_rate: 0,
    total_logs: 0,
    today: new Date().toISOString().split('T')[0]
  });

  // Live Attendance Camera Scanner State (Dashboard)
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [latestDetection, setLatestDetection] = useState(null);
  const [lastCapturedThumb, setLastCapturedThumb] = useState(null);
  const [scannerStatusMsg, setScannerStatusMsg] = useState('Camera is idle');
  const [apiConnected, setApiConnected] = useState(false);

  // Audio effects enabled
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Live Clock
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // Attendance & Employees Data
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Filters
  const [searchLogQuery, setSearchLogQuery] = useState('');
  const [logDateFilter, setLogDateFilter] = useState('');

  // Enrollment State (Single Photo with Eye Blink Verification)
  const [regName, setRegName] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [capturedSnap, setCapturedSnap] = useState(null); // { blob, url, blinkVerified }
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [blinkGuidance, setBlinkGuidance] = useState('Look at the camera and blink your eyes to capture');

  // Video Refs & Streams
  const enrollVideoRef = useRef(null);
  const enrollCanvasRef = useRef(null);
  const [enrollStream, setEnrollStream] = useState(null);
  const prevEnrollBrightness = useRef(null);

  const scannerVideoRef = useRef(null);
  const scannerCanvasRef = useRef(null);
  const [scannerStream, setScannerStream] = useState(null);
  const autoScanRunningRef = useRef(false);

  // Modals & Toasts
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });
  const [toasts, setToasts] = useState([]);

  // Safely format media image URLs
  const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${cleanPath}`;
  };

  // Synthesized Biometric Chime via Web Audio API
  const playRecognitionSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.12);
      
      osc2.frequency.setValueAtTime(880.00, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 0.4);
    } catch {}
  }, [soundEnabled]);

  // Shutter click sound for photo capture
  const playShutterSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  }, [soundEnabled]);

  // Toast Helper
  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Dashboard Stats
  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/stats/`);
      setStats(res.data);
      setApiConnected(true);
    } catch {
      setApiConnected(false);
    }
  };

  // Fetch Attendance Logs
  const fetchAttendance = async () => {
    setLogsLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/attendance/`);
      setAttendanceLogs(res.data);
    } catch {
      addToast('Failed to load attendance logs.', 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  // Fetch Employees
  const fetchEmployees = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/employees/`);
      setEmployees(res.data);
    } catch {
      addToast('Failed to load employee directory.', 'error');
    }
  };

  // Initial Data Load
  useEffect(() => {
    fetchStats();
    fetchAttendance();
    fetchEmployees();
    const statsInterval = setInterval(fetchStats, 6000);
    return () => clearInterval(statsInterval);
  }, []);

  // -------------------------------------------------------------
  // ATTENDANCE SCANNER CAMERA (DASHBOARD)
  // -------------------------------------------------------------

  // Bind scanner video stream whenever scannerStream updates
  useEffect(() => {
    if (scannerVideoRef.current && scannerStream) {
      scannerVideoRef.current.srcObject = scannerStream;
      scannerVideoRef.current.play().catch(e => {
        console.warn('Scanner video play warning:', e);
      });
    }
  }, [scannerStream, scannerActive]);

  const startScannerWebcam = async () => {
    setScannerLoading(true);
    setScannerStatusMsg('Opening camera...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      setScannerStream(stream);
      setScannerActive(true);
      setScannerStatusMsg('Camera ready! Look at the camera and click Take Photo.');
      addToast('Attendance camera is on!', 'info');
    } catch (err) {
      console.error('Failed to open camera:', err);
      addToast('Could not open camera: ' + (err.message || 'Permission denied'), 'error');
      setScannerActive(false);
      setScannerStatusMsg('Failed to open camera');
    } finally {
      setScannerLoading(false);
    }
  };

  const stopScannerWebcam = () => {
    if (scannerStream) {
      scannerStream.getTracks().forEach(track => track.stop());
      setScannerStream(null);
    }
    setScannerActive(false);
    setScannerLoading(false);
    setAutoScanEnabled(false);
    setLatestDetection(null);
    setLastCapturedThumb(null);
    setScannerStatusMsg('Camera is idle');
    addToast('Attendance camera turned off.', 'info');
  };

  // Turn off camera if navigating away from dashboard
  useEffect(() => {
    if (activeTab !== 'dashboard' && scannerActive) {
      stopScannerWebcam();
    }
  }, [activeTab]);

  // CORE ACTION: Take Photo and Mark Present
  const handleCaptureAndMarkPresent = async () => {
    if (!scannerVideoRef.current || !scannerCanvasRef.current || !scannerActive) {
      addToast('Please turn on the camera first.', 'error');
      return;
    }

    const video = scannerVideoRef.current;
    const canvas = scannerCanvasRef.current;
    if (video.videoWidth === 0) {
      addToast('Camera feed is initializing, please wait 1 second...', 'info');
      return;
    }

    setCaptureLoading(true);
    setScannerStatusMsg('Analyzing facial biometrics...');
    playShutterSound();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setCaptureLoading(false);
        return;
      }

      const thumbUrl = URL.createObjectURL(blob);
      setLastCapturedThumb(thumbUrl);

      const formData = new FormData();
      formData.append('frame', blob, 'attendance_capture.jpg');

      try {
        const res = await axios.post(`${API_BASE_URL}/api/scan-frame/`, formData);
        if (res.data.matched) {
          setLatestDetection({
            name: res.data.employee_name,
            similarity: res.data.similarity,
            already_marked: res.data.already_marked,
            timestamp: Date.now()
          });
          playRecognitionSound();
          if (res.data.already_marked) {
            addToast(`${res.data.employee_name} is already marked present today.`, 'info');
          } else {
            addToast(`Verified & Marked Present: ${res.data.employee_name} (${(res.data.similarity * 100).toFixed(0)}%)!`, 'success');
          }
          setScannerStatusMsg(`Verified: ${res.data.employee_name} (${(res.data.similarity * 100).toFixed(0)}%)`);
          fetchAttendance();
          fetchStats();
        } else {
          setLatestDetection(null);
          const msg = res.data.message || 'Face not recognized. Please face the camera directly.';
          setScannerStatusMsg(msg);
          addToast(msg, 'error');
        }
      } catch (err) {
        addToast(err.response?.data?.error || 'Verification request failed.', 'error');
        setScannerStatusMsg('Verification error');
      } finally {
        setCaptureLoading(false);
      }
    }, 'image/jpeg', 0.92);
  };

  // Optional Continuous Auto-Scan Loop
  useEffect(() => {
    if (!scannerActive || !autoScanEnabled || !scannerStream) return;

    autoScanRunningRef.current = true;
    let isProcessing = false;

    const autoScanInterval = setInterval(async () => {
      if (!autoScanRunningRef.current || isProcessing) return;
      if (!scannerVideoRef.current || !scannerCanvasRef.current) return;
      const video = scannerVideoRef.current;
      const canvas = scannerCanvasRef.current;
      if (video.videoWidth === 0) return;

      isProcessing = true;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob || !autoScanRunningRef.current) {
          isProcessing = false;
          return;
        }

        const formData = new FormData();
        formData.append('frame', blob, 'frame.jpg');

        try {
          const res = await axios.post(`${API_BASE_URL}/api/scan-frame/`, formData);
          if (res.data.matched) {
            setLatestDetection({
              name: res.data.employee_name,
              similarity: res.data.similarity,
              already_marked: res.data.already_marked,
              timestamp: Date.now()
            });
            if (!res.data.already_marked) {
              playRecognitionSound();
              addToast(`Verified & Marked Present: ${res.data.employee_name}`, 'success');
              fetchAttendance();
              fetchStats();
            }
            setScannerStatusMsg(`Verified: ${res.data.employee_name} (${(res.data.similarity * 100).toFixed(0)}%)`);
          }
        } catch {
        } finally {
          isProcessing = false;
        }
      }, 'image/jpeg', 0.85);
    }, 1400);

    return () => {
      autoScanRunningRef.current = false;
      clearInterval(autoScanInterval);
    };
  }, [scannerActive, autoScanEnabled, scannerStream, playRecognitionSound]);

  // -------------------------------------------------------------
  // ENROLLMENT CAMERA & EYE BLINK LOGIC
  // -------------------------------------------------------------
  useEffect(() => {
    if (enrollVideoRef.current && enrollStream) {
      enrollVideoRef.current.srcObject = enrollStream;
      enrollVideoRef.current.play().catch(e => console.warn('Enroll video play warning:', e));
    }
  }, [enrollStream, activeTab, capturedSnap]);

  const startEnrollWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      setEnrollStream(stream);
      setBlinkGuidance('Look at the camera and blink your eyes to capture');
    } catch (err) {
      addToast('Could not access camera for enrollment: ' + err.message, 'error');
    }
  };

  const stopEnrollWebcam = () => {
    if (enrollStream) {
      enrollStream.getTracks().forEach(track => track.stop());
      setEnrollStream(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'register' && !capturedSnap) {
      startEnrollWebcam();
    } else {
      stopEnrollWebcam();
    }
    return () => stopEnrollWebcam();
  }, [activeTab, capturedSnap]);

  // Capture Single Photo during enrollment
  const handleCaptureSinglePhoto = useCallback((verifiedByBlink = false) => {
    if (!enrollVideoRef.current || !enrollCanvasRef.current) return;
    const video = enrollVideoRef.current;
    const canvas = enrollCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setCapturedSnap({ blob, url, blinkVerified: verifiedByBlink });
        playShutterSound();
        addToast(
          verifiedByBlink
            ? 'Eye blink detected! 1 facial photo captured.'
            : 'Photo captured with eye blink verification.',
          'success'
        );
        stopEnrollWebcam();
      }
    }, 'image/jpeg', 0.95);
  }, [playShutterSound]);

  // Eye Blink Detection Loop during Enrollment
  useEffect(() => {
    if (activeTab !== 'register' || capturedSnap || !enrollStream) return;

    let timeoutId;
    const interval = setInterval(() => {
      if (!enrollVideoRef.current || !enrollCanvasRef.current || capturedSnap) return;
      const video = enrollVideoRef.current;
      const canvas = enrollCanvasRef.current;
      if (video.videoWidth === 0) return;

      canvas.width = 160;
      canvas.height = 120;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, 160, 120);

      const eyeBandY = Math.floor(120 * 0.32);
      const eyeBandH = Math.floor(120 * 0.22);
      const frameData = ctx.getImageData(35, eyeBandY, 90, eyeBandH);
      const data = frameData.data;

      let brightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        brightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      brightness = brightness / (data.length / 4);

      if (prevEnrollBrightness.current !== null) {
        const diff = Math.abs(brightness - prevEnrollBrightness.current);
        if (diff > 5.5 && !blinkDetected) {
          setBlinkDetected(true);
          setBlinkGuidance('Eye blink detected! Capturing photo...');
          timeoutId = setTimeout(() => {
            handleCaptureSinglePhoto(true);
          }, 250);
        }
      }
      prevEnrollBrightness.current = brightness;
    }, 120);

    return () => {
      clearInterval(interval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [activeTab, capturedSnap, enrollStream, blinkDetected, handleCaptureSinglePhoto]);

  // Retake Enrollment Photo
  const handleRetakePhoto = () => {
    setCapturedSnap(null);
    setBlinkDetected(false);
    setBlinkGuidance('Look at the camera and blink your eyes to capture');
    startEnrollWebcam();
  };

  // Submit Enrollment (Enrolls ONLY - DOES NOT mark present)
  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    if (!regName.trim()) {
      addToast('Please enter the employee name.', 'error');
      return;
    }
    if (!capturedSnap) {
      addToast('Please blink to capture 1 photo before submitting.', 'error');
      return;
    }

    setRegSubmitting(true);
    const formData = new FormData();
    formData.append('name', regName.trim());
    formData.append('images', capturedSnap.blob, `${regName.trim().replace(/\s+/g, '_')}_face.jpg`);

    try {
      const res = await axios.post(`${API_BASE_URL}/api/register/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      addToast(`Successfully enrolled ${regName.trim()} to the system!`, 'success');
      playRecognitionSound();
      setRegName('');
      setCapturedSnap(null);
      setBlinkDetected(false);
      fetchEmployees();
      fetchStats();
      setActiveTab('dashboard');
    } catch (err) {
      addToast(err.response?.data?.error || 'Enrollment failed.', 'error');
    } finally {
      setRegSubmitting(false);
    }
  };

  // Manually mark attendance from Staff Directory
  const handleMarkAttendance = async empId => {
    try {
      const res = await axios.post(`${API_BASE_URL}/api/attendance/mark/`, {
        employee_id: empId
      });
      if (res.data.already_marked) {
        addToast(res.data.message, 'info');
      } else {
        addToast(res.data.message, 'success');
        playRecognitionSound();
      }
      fetchAttendance();
      fetchStats();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to mark attendance.', 'error');
    }
  };

  // Delete an attendance log
  const handleDeleteAttendance = async id => {
    try {
      await axios.delete(`${API_BASE_URL}/api/attendance/${id}/`);
      addToast('Record deleted.', 'info');
      setAttendanceLogs(prev => prev.filter(item => item.id !== id));
      fetchStats();
    } catch {
      addToast('Failed to delete attendance record.', 'error');
    }
  };

  // Delete employee
  const requestDeleteEmployee = employee => {
    setConfirmModal({
      isOpen: true,
      title: `Delete ${employee.name}?`,
      message: `This will permanently delete ${employee.name}, their saved face dataset photos, and biometric vector embeddings from the system.`,
      onConfirm: async () => {
        try {
          const res = await axios.delete(`${API_BASE_URL}/api/employees/${employee.id}/`);
          addToast(res.data.message || 'Employee deleted', 'success');
          setEmployees(prev => prev.filter(e => e.id !== employee.id));
          fetchAttendance();
          fetchStats();
        } catch {
          addToast('Failed to delete employee.', 'error');
        } finally {
          setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
        }
      }
    });
  };

  // Clear Attendance History
  const requestClearAttendance = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Clear Attendance Records?',
      message: logDateFilter
        ? `Are you sure you want to delete all attendance records for date ${logDateFilter}?`
        : 'Are you sure you want to delete ALL attendance records from the entire database?',
      onConfirm: async () => {
        try {
          const res = await axios.post(`${API_BASE_URL}/api/attendance/clear/`, {
            date: logDateFilter || undefined
          });
          addToast(res.data.message, 'success');
          fetchAttendance();
          fetchStats();
        } catch {
          addToast('Failed to clear records.', 'error');
        } finally {
          setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
        }
      }
    });
  };

  // Export Attendance CSV
  const handleExportCSV = () => {
    const url = logDateFilter
      ? `${API_BASE_URL}/api/attendance/export/?date=${logDateFilter}`
      : `${API_BASE_URL}/api/attendance/export/`;
    window.open(url, '_blank');
    addToast('Downloading Attendance Report CSV...', 'info');
  };

  // Filter logs by specific employee
  const handleFilterEmployeeLogs = employeeName => {
    setSearchLogQuery(employeeName);
    setActiveTab('attendance');
  };

  // Filtered Attendance Logs
  const filteredLogs = attendanceLogs.filter(log => {
    const matchesName = (log.employee_name || '')
      .toLowerCase()
      .includes(searchLogQuery.toLowerCase());
    const matchesDate = logDateFilter
      ? log.time && log.time.startsWith(logDateFilter)
      : true;
    return matchesName && matchesDate;
  });



  return (
    <div className="app-wrapper">
      {/* Top Header */}
      <header className="glass-panel app-header">
        <div className="brand-section">
          <div className="brand-logo-icon">
            <Shield size={26} />
          </div>
          <div>
            <h1 className="brand-title">AuraFace</h1>
            <p className="brand-subtitle">AI Face Biometrics System</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs-bar" aria-label="Main Navigation">
          <button
            id="tab-dashboard"
            className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={18} />
            Dashboard
          </button>

          <button
            id="tab-attendance"
            className={`nav-tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
          >
            <Calendar size={18} />
            Attendance Logs ({attendanceLogs.length})
          </button>
          <button
            id="tab-register"
            className={`nav-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
          >
            <UserPlus size={18} />
            Enroll Face
          </button>
        </nav>

        {/* Live System Status & Controls */}
        <div className="header-status-bar">
          <button
            className="btn btn-ghost"
            style={{ padding: '0.4rem 0.6rem' }}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute Audio Chimes' : 'Enable Audio Chimes'}
          >
            {soundEnabled ? <Volume2 size={16} color="var(--cyan-400)" /> : <VolumeX size={16} />}
          </button>

          <div className="status-pill">
            <Clock size={15} />
            <span>{currentTime}</span>
          </div>

          <div className="status-pill">
            <span
              className={`status-indicator-dot ${
                apiConnected
                  ? scannerActive
                    ? 'scanning'
                    : 'online'
                  : 'offline'
              }`}
            />
            <span>
              {apiConnected
                ? scannerActive
                  ? 'Scanner Active'
                  : 'System Online'
                : 'Connecting...'}
            </span>
          </div>
        </div>
      </header>

      {/* Hero Metrics Strip */}
      <section className="metrics-grid">
        <div 
          className="glass-card metric-card primary"
          onClick={() => setActiveTab('register')}
          style={{ cursor: 'pointer' }}
          title="Click to enroll new employee"
        >
          <div className="metric-content">
            <p className="metric-label">Enrolled Employees</p>
            <h2 className="metric-value">{stats.total_employees}</h2>
            <p className="metric-subtext">Biometrics registered</p>
          </div>
          <div className="metric-icon-box primary">
            <Users size={28} />
          </div>
        </div>

        <div 
          className="glass-card metric-card emerald"
          onClick={() => {
            setLogDateFilter(stats.today || '');
            setActiveTab('attendance');
          }}
          style={{ cursor: 'pointer' }}
          title="Click to view today's attendance logs"
        >
          <div className="metric-content">
            <p className="metric-label">Present Today</p>
            <h2 className="metric-value">{stats.present_employees}</h2>
            <p className="metric-subtext">Verified on camera</p>
          </div>
          <div className="metric-icon-box emerald">
            <UserCheck size={28} />
          </div>
        </div>

        <div className="glass-card metric-card rose">
          <div className="metric-content">
            <p className="metric-label">Absent Today</p>
            <h2 className="metric-value">{stats.absent_employees}</h2>
            <p className="metric-subtext">Pending check-in</p>
          </div>
          <div className="metric-icon-box rose">
            <AlertCircle size={28} />
          </div>
        </div>

        <div className="glass-card metric-card cyan">
          <div className="metric-content">
            <p className="metric-label">Attendance Rate</p>
            <h2 className="metric-value">{stats.attendance_rate}%</h2>
            <p className="metric-subtext">Turnout for {stats.today}</p>
          </div>
          <div className="metric-icon-box cyan">
            <Sparkles size={28} />
          </div>
        </div>
      </section>

      {/* Tab Content 1: Dashboard & Live Attendance Camera */}
      {activeTab === 'dashboard' && (
        <section className="dashboard-main-row">
          {/* Camera Viewport */}
          <div className="glass-panel camera-card">
            <div className="card-header-row">
              <div className="card-title-group">
                <Video className="card-title-icon" size={22} />
                <h3 className="card-title">Attendance Camera Scanner</h3>
              </div>
              <span className={`badge ${scannerActive ? 'badge-cyan' : 'badge-amber'}`}>
                {scannerActive ? 'LIVE SCANNER ACTIVE' : 'STANDBY'}
              </span>
            </div>

            <div className="camera-viewport-container" style={{ position: 'relative' }}>
              {/* Always mount video so ref is never null, toggle display */}
              <video
                ref={scannerVideoRef}
                autoPlay
                playsInline
                muted
                className="camera-stream-img"
                style={{ display: scannerActive ? 'block' : 'none' }}
              />
              <canvas ref={scannerCanvasRef} style={{ display: 'none' }} />

              {scannerActive ? (
                /* Augmented Biometric HUD Overlay when Camera is On */
                <div className="camera-hud-overlay">
                  <div className="hud-corner top-left" />
                  <div className="hud-corner top-right" />
                  <div className="hud-corner bottom-left" />
                  <div className="hud-corner bottom-right" />
                  <div className="scan-laser-line" />
                  <div className="hud-status-badge">
                    <span className="status-indicator-dot scanning" />
                    LIVE CAMERA READY
                  </div>
                </div>
              ) : (
                /* Standby View when Camera is Off */
                <div className="camera-standby-view">
                  <div className="standby-radar-wrapper">
                    <div className="standby-radar-ring" />
                    <div className="standby-radar-icon">
                      <Camera size={34} />
                    </div>
                  </div>
                  <h4 className="standby-title">Attendance Camera is Off</h4>
                  <p className="standby-desc">
                    Turn on the camera, look into the lens, and click <strong>Take Photo & Mark Present</strong> to verify your face and mark attendance.
                  </p>
                  <button
                    id="btn-launch-camera"
                    className="btn btn-cyan"
                    onClick={startScannerWebcam}
                    disabled={scannerLoading}
                  >
                    <Camera size={18} />
                    {scannerLoading ? 'Starting Camera...' : 'Turn On Attendance Camera'}
                  </button>
                </div>
              )}
            </div>

            {/* Recognition Banner when face detected */}
            {latestDetection && (
              <div className="detection-banner animate-fade-in">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                  {lastCapturedThumb && (
                    <img
                      src={lastCapturedThumb}
                      alt="Captured Face"
                      className="snapshot-preview-thumb"
                    />
                  )}
                  <div className="detection-info">
                    <span className="detection-badge">
                      {latestDetection.already_marked ? 'ALREADY PRESENT' : 'MATCH CONFIRMED'}
                    </span>
                    <span className="detection-name">{latestDetection.name}</span>
                    <span className="detection-score">
                      Cosine Similarity: {(latestDetection.similarity * 100).toFixed(1)}% •{' '}
                      {latestDetection.already_marked ? 'Logged for today' : 'Attendance Marked!'}
                    </span>
                  </div>
                </div>
                <CheckCircle2 size={24} color="var(--emerald-400)" />
              </div>
            )}

            {/* Camera Controls Strip */}
            <div className="camera-controls-strip">
              <div className="camera-controls-left" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                {scannerActive ? (
                  <>
                    {/* PRIMARY ACTION BUTTON: Take Photo & Mark Present */}
                    <button
                      id="btn-capture-attendance"
                      className="btn-capture-attendance"
                      onClick={handleCaptureAndMarkPresent}
                      disabled={captureLoading}
                    >
                      <Camera size={19} />
                      {captureLoading ? 'Verifying Face...' : '📸 Take Photo & Mark Present'}
                    </button>

                    <button
                      id="btn-stop-camera"
                      className="btn btn-rose"
                      onClick={stopScannerWebcam}
                      disabled={captureLoading}
                    >
                      <CameraOff size={16} />
                      Turn Off Camera
                    </button>

                    {/* Continuous Auto-Scan Toggle */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        color: 'var(--text-muted)',
                        padding: '0.4rem 0.8rem',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px'
                      }}
                      title="Automatically scan every 1.4 seconds"
                    >
                      <input
                        type="checkbox"
                        checked={autoScanEnabled}
                        onChange={e => setAutoScanEnabled(e.target.checked)}
                        style={{ accentColor: 'var(--cyan-400)' }}
                      />
                      <span>⚡ Auto-Scan Loop</span>
                    </label>
                  </>
                ) : (
                  <button
                    id="btn-start-camera-strip"
                    className="btn btn-primary"
                    onClick={startScannerWebcam}
                    disabled={scannerLoading}
                  >
                    <Camera size={18} />
                    {scannerLoading ? 'Starting Camera...' : 'Turn On Attendance Camera'}
                  </button>
                )}
              </div>

              <div className="camera-hint">
                <Shield size={14} />
                {scannerStatusMsg}
              </div>
            </div>
          </div>

          {/* Quick Attendance Activity Stream */}
          <div className="glass-panel table-card">
            <div className="card-header-row">
              <div className="card-title-group">
                <Calendar className="card-title-icon" size={20} />
                <h3 className="card-title">Today's Live Check-Ins</h3>
              </div>
              <button
                className="btn btn-ghost"
                onClick={fetchAttendance}
                disabled={logsLoading}
              >
                <RefreshCw size={15} className={logsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {attendanceLogs.length === 0 ? (
                <div className="empty-state">
                  <Clock className="empty-icon" size={42} />
                  <p className="empty-text">No attendance records logged yet today.</p>
                </div>
              ) : (
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceLogs.slice(0, 8).map(item => (
                      <tr key={item.id}>
                        <td>
                          <div className="employee-cell">
                            {item.employee_image ? (
                              <img
                                src={getImageUrl(item.employee_image)}
                                alt={item.employee_name}
                                className="emp-avatar"
                              />
                            ) : (
                              <div className="emp-avatar-placeholder">
                                {(item.employee_name || 'E')[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 600 }}>{item.employee_name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                ID #{item.employee}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>{new Date(item.time).toLocaleTimeString()}</td>
                        <td>
                          <span className="badge badge-emerald">
                            <Check size={12} /> Present
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setActiveTab('attendance')}
                style={{ fontSize: '0.85rem' }}
              >
                View Full Attendance History <ArrowRight size={14} style={{ marginLeft: '4px' }} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Tab Content 2: Employee Enrollment Studio (Single Photo + Eye Blink) */}
      {activeTab === 'register' && (
        <section className="glass-panel register-card">
          <div className="card-header-row" style={{ marginBottom: '1.5rem' }}>
            <div className="card-title-group">
              <UserPlus className="card-title-icon" size={24} />
              <div>
                <h3 className="card-title">Enroll Employee Face</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Capture 1 verified photo with eye blink liveness detection to register biometrics
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleEnrollSubmit}>
            <div className="form-group" style={{ maxWidth: '500px', marginBottom: '1.5rem' }}>
              <label className="form-label" htmlFor="reg-name-input">
                Employee Full Name *
              </label>
              <input
                id="reg-name-input"
                type="text"
                className="glass-input"
                placeholder="e.g. Syed Roshan Jani"
                value={regName}
                onChange={e => setRegName(e.target.value)}
                required
              />
            </div>

            {/* Live Camera View with Eye Blink Guidance */}
            {!capturedSnap ? (
              <div>
                <div className="browser-webcam-stage" style={{ position: 'relative' }}>
                  <video
                    ref={enrollVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="browser-video-preview"
                  />
                  <canvas ref={enrollCanvasRef} style={{ display: 'none' }} />

                  {/* Liveness Indicator Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '1rem',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: blinkDetected ? 'rgba(16, 185, 129, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(8px)',
                      border: `1px solid ${blinkDetected ? 'var(--emerald-400)' : 'var(--cyan-400)'}`,
                      borderRadius: '9999px',
                      padding: '0.5rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      color: '#fff',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      zIndex: 10,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                      transition: 'all 0.25s ease'
                    }}
                  >
                    <Eye size={16} color={blinkDetected ? '#fff' : 'var(--cyan-400)'} />
                    <span>{blinkGuidance}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    id="btn-snap-blink"
                    className="btn btn-cyan"
                    onClick={() => handleCaptureSinglePhoto(true)}
                  >
                    <Eye size={18} />
                    👁️ Blink & Capture Photo (1 Photo)
                  </button>

                  <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                    Blink naturally or click above to capture 1 high-resolution facial embedding photo.
                  </span>
                </div>
              </div>
            ) : (
              /* Single Captured Photo Preview */
              <div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <p className="form-label">Captured Biometric Photo (1 Photo):</p>
                  <div
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      border: '2px solid var(--emerald-400)',
                      boxShadow: '0 0 25px rgba(16, 185, 129, 0.35)'
                    }}
                  >
                    <img
                      src={capturedSnap.url}
                      alt="Enrolled Snap"
                      style={{
                        width: '320px',
                        height: '240px',
                        objectFit: 'cover',
                        display: 'block'
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'linear-gradient(to top, rgba(10,14,23,0.95), transparent)',
                        padding: '1rem 0.75rem 0.6rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span className="badge badge-emerald" style={{ fontSize: '0.78rem' }}>
                        <Check size={13} /> Eye Blink Verified (1 Photo)
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={handleRetakePhoto}
                      >
                        <RotateCcw size={13} /> Retake
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button
                    id="btn-submit-registration"
                    type="submit"
                    className="btn btn-primary"
                    disabled={regSubmitting}
                    style={{ minWidth: '220px' }}
                  >
                    <Sparkles size={18} />
                    {regSubmitting ? 'Enrolling Biometrics...' : 'Complete Biometric Enrollment'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleRetakePhoto}
                    disabled={regSubmitting}
                  >
                    Retake Photo
                  </button>
                </div>
              </div>
            )}
          </form>
        </section>
      )}

      {/* Tab Content 3: Full Attendance Logs */}
      {activeTab === 'attendance' && (
        <section className="glass-panel table-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <Calendar className="card-title-icon" size={24} />
              <div>
                <h3 className="card-title">Official Attendance Records</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Detailed audit trail of biometric recognitions
                </p>
              </div>
            </div>

            <div className="header-actions">
              <button id="btn-export-csv" className="btn btn-emerald" onClick={handleExportCSV}>
                <Download size={16} />
                Export CSV Report
              </button>
              <button
                id="btn-clear-attendance"
                className="btn btn-rose"
                onClick={requestClearAttendance}
                disabled={attendanceLogs.length === 0}
              >
                <Trash2 size={16} />
                Clear Logs
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="table-filter-bar">
            <div className="filter-group-left">
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  id="search-logs-input"
                  type="text"
                  className="glass-input"
                  placeholder="Filter by employee name..."
                  value={searchLogQuery}
                  onChange={e => setSearchLogQuery(e.target.value)}
                />
              </div>

              <input
                id="filter-date-input"
                type="date"
                className="glass-input"
                style={{ maxWidth: '180px' }}
                value={logDateFilter}
                onChange={e => setLogDateFilter(e.target.value)}
              />

              {logDateFilter && (
                <button
                  className="btn btn-ghost"
                  onClick={() => setLogDateFilter('')}
                  title="Clear Date Filter"
                >
                  <X size={15} /> All Dates
                </button>
              )}
            </div>

            <button className="btn btn-ghost" onClick={fetchAttendance} disabled={logsLoading}>
              <RefreshCw size={15} className={logsLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Table */}
          <div className="table-container">
            {filteredLogs.length === 0 ? (
              <div className="empty-state">
                <Calendar className="empty-icon" size={48} />
                <p className="empty-text">No attendance records matching your criteria.</p>
              </div>
            ) : (
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Record ID</th>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Timestamp</th>
                    <th>Verification</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(item => (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>#{item.id}</td>
                      <td>
                        <div className="employee-cell">
                          {item.employee_image ? (
                            <img
                              src={getImageUrl(item.employee_image)}
                              alt={item.employee_name}
                              className="emp-avatar"
                            />
                          ) : (
                            <div className="emp-avatar-placeholder">
                              {(item.employee_name || 'E')[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.employee_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                              Personnel ID #{item.employee}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{new Date(item.time).toLocaleDateString()}</td>
                      <td>{new Date(item.time).toLocaleTimeString()}</td>
                      <td>
                        <span className="badge badge-emerald">
                          <Check size={12} /> Present
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '0.4rem 0.6rem', color: 'var(--rose-400)' }}
                          onClick={() => handleDeleteAttendance(item.id)}
                          title="Delete Record"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}



      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="modal-backdrop" onClick={() => setConfirmModal({ isOpen: false })}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <AlertCircle size={24} className="modal-icon" />
              <h3 className="modal-title">{confirmModal.title}</h3>
            </div>
            <p className="modal-body">{confirmModal.message}</p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmModal({ isOpen: false })}
              >
                Cancel
              </button>
              <button className="btn btn-rose" onClick={confirmModal.onConfirm}>
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div className="toast-container" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'success' && <CheckCircle2 size={18} className="toast-icon" />}
            {toast.type === 'error' && <AlertCircle size={18} className="toast-icon" />}
            {toast.type === 'info' && <Sparkles size={18} className="toast-icon" />}
            <span className="toast-msg">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
