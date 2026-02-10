// script.js - النسخة المحسنة

// حالة التطبيق
const appState = {
    isModelLoaded: false,
    isDetecting: false,
    isCameraActive: false,
    isLogPaused: false,
    currentStream: null,
    currentCamera: 'user', // 'user' أو 'environment'
    detectionInterval: null,
    model: null,
    videoElement: null,
    canvasElement: null,
    canvasContext: null,
    stats: {
        totalDetections: 0,
        currentDetections: 0,
        highestConfidence: 0,
        fps: 0,
        lastFrameTime: 0
    },
    detectionLog: [],
    maxLogItems: 50,
    objectColors: {} // ألوان ثابتة لكل نوع من الأشياء
};

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', async () => {
    console.log('جاري تهيئة تطبيق كشف الأشياء...');
    
    // الحصول على عناصر DOM
    appState.videoElement = document.getElementById('webcam-video');
    appState.canvasElement = document.getElementById('detection-canvas');
    appState.canvasContext = appState.canvasElement.getContext('2d');
    
    // تهيئة العناصر
    initializeElements();
    
    // تحميل النموذج
    await loadModel();
    
    // تهيئة الكاميرا
    await initializeCamera();
    
    // إعداد معالجات الأحداث
    setupEventListeners();
    
    console.log('تم تهيئة التطبيق بنجاح!');
});

// تهيئة العناصر
function initializeElements() {
    // تعيين حجم Canvas لمطابقة حجم الفيديو
    const resizeCanvas = () => {
        if (appState.videoElement.videoWidth) {
            appState.canvasElement.width = appState.videoElement.videoWidth;
            appState.canvasElement.height = appState.videoElement.videoHeight;
        }
    };
    
    // تحديث حجم Canvas عند تغيير حجم النافذة
    window.addEventListener('resize', resizeCanvas);
    
    // تحديث حجم Canvas عند تحميل بيانات الفيديو
    appState.videoElement.addEventListener('loadeddata', resizeCanvas);
}

// تحميل نموذج COCO-SSD
async function loadModel() {
    try {
        updateStatus('جاري تحميل نموذج الذكاء الاصطناعي...');
        
        // تحميل النموذج
        appState.model = await cocoSsd.load();
        appState.isModelLoaded = true;
        
        console.log('✅ تم تحميل النموذج بنجاح!');
        updateStatus('النموذج جاهز!');
        updateToggleButton();
        
    } catch (error) {
        console.error('❌ فشل تحميل النموذج:', error);
        updateStatus('فشل تحميل النموذج. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
    }
}

// تهيئة الكاميرا
async function initializeCamera() {
    try {
        updateStatus('جاري تهيئة الكاميرا...');
        
        // الحصول على صلاحيات الوصول للكاميرا
        const constraints = {
            video: {
                facingMode: appState.currentCamera,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        // بدء تشغيل الكاميرا
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        appState.videoElement.srcObject = stream;
        appState.currentStream = stream;
        appState.isCameraActive = true;
        
        // تحديث حالة الكاميرا
        updateCameraStatus();
        
        console.log('✅ تم تشغيل الكاميرا بنجاح!');
        updateStatus('الكاميرا جاهزة!');
        updateToggleButton();
        
    } catch (error) {
        console.error('❌ فشل تشغيل الكاميرا:', error);
        
        // عرض رسالة خطأ مناسبة
        let errorMessage = 'فشل الوصول إلى الكاميرا. ';
        
        if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMessage += 'لم يتم العثور على كاميرا.';
        } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            errorMessage += 'تم رفض الإذن للوصول إلى الكاميرا.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            errorMessage += 'الكاميرا قيد الاستخدام حالياً من قبل تطبيق آخر.';
        } else {
            errorMessage += `خطأ: ${error.message}`;
        }
        
        updateStatus(errorMessage);
    }
}

// تبديل الكاميرا
async function switchCamera() {
    if (!appState.currentStream) return;
    
    // إيقاف الكاميرا الحالية
    appState.currentStream.getTracks().forEach(track => track.stop());
    appState.isCameraActive = false;
    
    // تبديل نوع الكاميرا
    appState.currentCamera = appState.currentCamera === 'user' ? 'environment' : 'user';
    
    // إعادة تهيئة الكاميرا
    await initializeCamera();
    
    // إذا كان الكشف قيد التشغيل، إعادة تشغيله
    if (appState.isDetecting) {
        startDetection();
    }
}

// بدء الكشف
function startDetection() {
    if (!appState.isModelLoaded || !appState.isCameraActive || appState.isDetecting) {
        return;
    }
    
    appState.isDetecting = true;
    updateToggleButton();
    updateStatus('جاري الكشف عن الأشياء...');
    
    // إظهار قسم الإحصائيات
    document.getElementById('stats-section').classList.remove('hidden');
    
    // بدء حلقة الكشف
    appState.detectionInterval = setInterval(detectObjects, 100); // 10 FPS
    
    console.log('🚀 بدء الكشف عن الأشياء');
}

// إيقاف الكشف
function stopDetection() {
    if (!appState.isDetecting) return;
    
    appState.isDetecting = false;
    clearInterval(appState.detectionInterval);
    updateToggleButton();
    updateStatus('تم إيقاف الكشف');
    
    // مسح Canvas
    appState.canvasContext.clearRect(0, 0, appState.canvasElement.width, appState.canvasElement.height);
    
    console.log('⏹️ إيقاف الكشف عن الأشياء');
}

// الكشف عن الأشياء
async function detectObjects() {
    if (!appState.model || !appState.isCameraActive) return;
    
    // حساب الـ FPS
    calculateFPS();
    
    // الكشف عن الأشياء في الإطار الحالي
    const predictions = await appState.model.detect(appState.videoElement);
    
    // تحديث الإحصائيات
    updateStats(predictions);
    
    // رسم المربعات على Canvas
    drawDetections(predictions);
    
    // تسجيل الاكتشافات الجديدة
    logDetections(predictions);
}

// رسم الاكتشافات على Canvas
function drawDetections(predictions) {
    // مسح Canvas السابق
    appState.canvasContext.clearRect(0, 0, appState.canvasElement.width, appState.canvasElement.height);
    
    // تحديث عداد الاكتشافات الحية
    document.getElementById('live-counter').textContent = predictions.length;
    
    // رسم مربع لكل كشف
    predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        const label = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;
        
        // الحصول على لون ثابت لهذا النوع من الأشياء
        const color = getObjectColor(prediction.class);
        
        // رسم المربع
        appState.canvasContext.strokeStyle = color;
        appState.canvasContext.lineWidth = 3;
        appState.canvasContext.strokeRect(x, y, width, height);
        
        // رسم خلفية للنص
        appState.canvasContext.fillStyle = color;
        appState.canvasContext.fillRect(x, y - 25, label.length * 10, 25);
        
        // كتابة النص
        appState.canvasContext.fillStyle = '#FFFFFF';
        appState.canvasContext.font = '16px Arial';
        appState.canvasContext.fillText(label, x + 5, y - 7);
    });
}

// تسجيل الاكتشافات
function logDetections(predictions) {
    if (appState.isLogPaused) return;
    
    const timestamp = new Date();
    predictions.forEach(prediction => {
        // زيادة العداد الإجمالي
        appState.stats.totalDetections++;
        
        // إضافة الاكتشاف للسجل
        const logEntry = {
            id: Date.now() + Math.random(),
            class: prediction.class,
            confidence: prediction.score,
            time: timestamp,
            x: prediction.bbox[0],
            y: prediction.bbox[1],
            width: prediction.bbox[2],
            height: prediction.bbox[3]
        };
        
        appState.detectionLog.unshift(logEntry);
        
        // الحفاظ على الحد الأقصى لعدد العناصر في السجل
        if (appState.detectionLog.length > appState.maxLogItems) {
            appState.detectionLog.pop();
        }
    });
    
    // تحديث عرض السجل
    updateLogDisplay();
}

// تحديث عرض السجل
function updateLogDisplay() {
    const logList = document.getElementById('detection-log-list');
    const emptyMessage = document.getElementById('empty-log-message');
    
    // التحقق إذا كان السجل فارغاً
    if (appState.detectionLog.length === 0) {
        logList.innerHTML = '';
        emptyMessage.classList.remove('hidden');
        return;
    }
    
    emptyMessage.classList.add('hidden');
    
    // تحديث السجل
    logList.innerHTML = '';
    
    appState.detectionLog.forEach(entry => {
        const li = document.createElement('li');
        li.className = 'new-detection';
        
        // إزالة التأثير بعد فترة
        setTimeout(() => {
            li.classList.remove('new-detection');
        }, 500);
        
        const confidencePercent = Math.round(entry.confidence * 100);
        const timeString = entry.time.toLocaleTimeString('ar-EG');
        
        li.innerHTML = `
            <div>
                <span class="log-item-class">${entry.class}</span>
                <span class="log-item-confidence">${confidencePercent}%</span>
            </div>
            <div class="log-item-time">
                <i class="far fa-clock"></i> ${timeString}
            </div>
            <div style="font-size: 0.8rem; color: #aaa; width: 100%; margin-top: 5px;">
                الموقع: (${Math.round(entry.x)}, ${Math.round(entry.y)}) - الحجم: ${Math.round(entry.width)}×${Math.round(entry.height)}
            </div>
        `;
        
        logList.appendChild(li);
    });
}

// تحديث الإحصائيات
function updateStats(predictions) {
    // تحديث العداد الحالي
    appState.stats.currentDetections = predictions.length;
    
    // تحديث أعلى دقة
    if (predictions.length > 0) {
        const maxConfidence = Math.max(...predictions.map(p => p.score));
        if (maxConfidence > appState.stats.highestConfidence) {
            appState.stats.highestConfidence = maxConfidence;
        }
    }
    
    // تحديث عرض الإحصائيات
    document.getElementById('total-detections').textContent = appState.stats.totalDetections;
    document.getElementById('current-detections').textContent = appState.stats.currentDetections;
    document.getElementById('fps-counter').textContent = `${Math.round(appState.stats.fps)} FPS`;
    document.getElementById('highest-confidence').textContent = `${Math.round(appState.stats.highestConfidence * 100)}%`;
}

// حساب معدل الإطارات
function calculateFPS() {
    const now = performance.now();
    
    if (appState.stats.lastFrameTime) {
        const delta = now - appState.stats.lastFrameTime;
        appState.stats.fps = 1000 / delta;
    }
    
    appState.stats.lastFrameTime = now;
}

// الحصول على لون ثابت لكل نوع من الأشياء
function getObjectColor(className) {
    if (!appState.objectColors[className]) {
        // توليد لون عشوائي ثابت بناءً على اسم الكلاس
        const hue = hashCode(className) % 360;
        appState.objectColors[className] = `hsl(${hue}, 70%, 50%)`;
    }
    
    return appState.objectColors[className];
}

// دالة مساعدة لإنشاء hash من نص
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // تحويل إلى عدد صحيح 32-bit
    }
    return Math.abs(hash);
}

// تحديث حالة زر التبديل
function updateToggleButton() {
    const toggleButton = document.getElementById('toggle-button');
    const cameraButton = document.getElementById('camera-switch');
    const screenshotButton = document.getElementById('screenshot-button');
    
    if (!appState.isModelLoaded || !appState.isCameraActive) {
        toggleButton.disabled = true;
        toggleButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>جاري التحميل...</span>';
        cameraButton.classList.add('hidden');
        screenshotButton.classList.add('hidden');
        return;
    }
    
    toggleButton.disabled = false;
    cameraButton.classList.remove('hidden');
    screenshotButton.classList.remove('hidden');
    
    if (appState.isDetecting) {
        toggleButton.innerHTML = '<i class="fas fa-pause"></i><span>إيقاف الكشف</span>';
        toggleButton.style.background = 'linear-gradient(45deg, #e74c3c, #c0392b)';
    } else {
        toggleButton.innerHTML = '<i class="fas fa-play"></i><span>بدء الكشف</span>';
        toggleButton.style.background = 'linear-gradient(45deg, #4CAF50, #2E7D32)';
    }
}

// تحديث حالة الكاميرا
function updateCameraStatus() {
    const cameraStatus = document.getElementById('camera-status');
    const cameraType = appState.currentCamera === 'user' ? 'أمامية' : 'خلفية';
    cameraStatus.textContent = `كاميرا: ${cameraType} (${appState.videoElement.videoWidth}×${appState.videoElement.videoHeight})`;
}

// تحديث حالة التطبيق
function updateStatus(message) {
    const statusElement = document.getElementById('status');
    statusElement.innerHTML = `<i class="fas fa-info-circle"></i> <span>${message}</span>`;
}

// إعداد معالجات الأحداث
function setupEventListeners() {
    // زر التبديل بين التشغيل والإيقاف
    document.getElementById('toggle-button').addEventListener('click', () => {
        if (appState.isDetecting) {
            stopDetection();
        } else {
            startDetection();
        }
    });
    
    // زر تبديل الكاميرا
    document.getElementById('camera-switch').addEventListener('click', switchCamera);
    
    // زر مسح السجل
    document.getElementById('clear-log-button').addEventListener('click', () => {
        if (confirm('هل أنت متأكد من مسح سجل الاكتشافات؟')) {
            appState.detectionLog = [];
            updateLogDisplay();
            
            // إعادة تعيين بعض الإحصائيات
            appState.stats.totalDetections = 0;
            appState.stats.highestConfidence = 0;
            updateStats([]);
            
            console.log('🗑️ تم مسح سجل الاكتشافات');
        }
    });
    
    // زر تصدير السجل
    document.getElementById('export-log-button').addEventListener('click', () => {
        exportLog();
    });
    
    // زر إيقاف/استئناف السجل
    document.getElementById('pause-log-button').addEventListener('click', function() {
        appState.isLogPaused = !appState.isLogPaused;
        
        if (appState.isLogPaused) {
            this.innerHTML = '<i class="fas fa-play"></i><span>استئناف السجل</span>';
            this.style.background = 'linear-gradient(45deg, #4CAF50, #2E7D32)';
        } else {
            this.innerHTML = '<i class="fas fa-pause"></i><span>إيقاف السجل</span>';
            this.style.background = 'linear-gradient(45deg, #e74c3c, #c0392b)';
        }
        
        console.log(appState.isLogPaused ? '⏸️ تم إيقاف السجل' : '▶️ تم استئناف السجل');
    });
    
    // زر التقاط صورة
    document.getElementById('screenshot-button').addEventListener('click', takeScreenshot);
}

// التقاط صورة من الكاميرا
function takeScreenshot() {
    if (!appState.isCameraActive) return;
    
    // إنشاء canvas جديد للصورة
    const canvas = document.createElement('canvas');
    canvas.width = appState.videoElement.videoWidth;
    canvas.height = appState.videoElement.videoHeight;
    
    const ctx = canvas.getContext('2d');
    
    // رسم الفيديو على canvas
    ctx.drawImage(appState.videoElement, 0, 0, canvas.width, canvas.height);
    
    // رسم الاكتشافات إذا كانت نشطة
    if (appState.isDetecting && appState.model) {
        // نستخدم نفس أسلوب الرسم المستخدم في العرض الرئيسي
        // (في تطبيق حقيقي، قد نعيد استخدام كود drawDetections)
    }
    
    // تحويل canvas إلى صورة
    const imageUrl = canvas.toDataURL('image/png');
    
    // تنزيل الصورة
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `كشف-أشياء-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    link.click();
    
    console.log('📸 تم التقاط صورة');
}

// تصدير سجل الاكتشافات
function exportLog() {
    if (appState.detectionLog.length === 0) {
        alert('لا توجد بيانات للتصدير!');
        return;
    }
    
    // تحويل السجل إلى نص CSV
    let csvContent = "الوقت,النوع,الدقة,الموقع X,الموقع Y,العرض,الارتفاع\n";
    
    appState.detectionLog.forEach(entry => {
        const time = entry.time.toLocaleString('ar-EG');
        const confidence = Math.round(entry.confidence * 100);
        const row = `${time},${entry.class},${confidence}%,${Math.round(entry.x)},${Math.round(entry.y)},${Math.round(entry.width)},${Math.round(entry.height)}`;
        csvContent += row + "\n";
    });
    
    // إنشاء ملف للتنزيل
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.href = url;
    link.download = `سجل-اكتشاف-أشياء-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    
    // تحرير الذاكرة
    URL.revokeObjectURL(url);
    
    console.log('📥 تم تصدير سجل الاكتشافات');
}

// إدارة الذاكرة عند إغلاق الصفحة
window.addEventListener('beforeunload', () => {
    if (appState.currentStream) {
        appState.currentStream.getTracks().forEach(track => track.stop());
    }
    
    if (appState.isDetecting) {
        clearInterval(appState.detectionInterval);
    }
    
    console.log('🧹 تم تنظيف الموارد قبل إغلاق الصفحة');
});

// رسالة ترحيب في الكونسول
console.log(`
╔══════════════════════════════════════╗
║   تطبيق كشف الأشياء - الإصدار المحسن   ║
║      تم التطوير بواسطة HAMZA         ║
║      (The Coder)                     ║
╚══════════════════════════════════════╝
`);
