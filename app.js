let objectDetector;
let camera;
const video = document.getElementById('webcam');
const startBtn = document.getElementById('startBtn');
const statusDiv = document.getElementById('status');
const fpsDiv = document.getElementById('fps');
const guidancePanel = document.getElementById('guidancePanel');
const guidanceText = document.getElementById('guidanceText');
const urgencyLevel = document.getElementById('urgencyLevel');
const objectCount = document.getElementById('objectCount');
const detectionOverlay = document.getElementById('detectionOverlay');
const audioIndicator = document.getElementById('audioIndicator');
const synth = window.speechSynthesis;

let isRunning = false;
let lastFrameTime = performance.now();
let frameCount = 0;
let fps = 0;
let detectionHistory = [];
let lastAlertTime = 0;

// Navigation system
const navigationSystem = {
    safePath: { direction: 'center', confidence: 1.0 },
    obstacles: [],
    lastUpdate: 0,
    
    analyzeObstacles(detections) {
        this.obstacles = [];
        let safeZones = ['left', 'center', 'right'];
        
        detections.forEach(detection => {
            const box = detection.boundingBox;
            const centerX = box.originX + box.width / 2;
            const videoWidth = video.videoWidth || 640;
            
            // Determine which zone the obstacle is in
            let zone;
            if (centerX < videoWidth * 0.33) zone = 'left';
            else if (centerX > videoWidth * 0.67) zone = 'right';
            else zone = 'center';
            
            // Calculate distance based on bounding box size
            const distance = this.estimateDistance(box);
            
            this.obstacles.push({
                zone,
                distance,
                object: detection.categories[0].categoryName,
                confidence: detection.categories[0].score,
                box
            });
            
            // Remove safe zones with obstacles
            if (distance < 3) {
                safeZones = safeZones.filter(z => z !== zone);
            }
        });
        
        // Determine best path
        if (safeZones.includes('center')) {
            this.safePath = { direction: 'center', confidence: 1.0 };
        } else if (safeZones.includes('left')) {
            this.safePath = { direction: 'left', confidence: 0.8 };
        } else if (safeZones.includes('right')) {
            this.safePath = { direction: 'right', confidence: 0.8 };
        } else {
            this.safePath = { direction: 'stop', confidence: 0.3 };
        }
        
        return this.getNavigationGuidance();
    },
    
    estimateDistance(box) {
        // Simple distance estimation based on object size
        const videoWidth = video.videoWidth || 640;
        const relativeSize = box.width / videoWidth;
        
        if (relativeSize > 0.4) return 0.5; // Very close
        if (relativeSize > 0.25) return 1.0; // Close
        if (relativeSize > 0.15) return 2.0; // Medium
        if (relativeSize > 0.08) return 3.5; // Far
        return 5.0; // Very far
    },
    
    getNavigationGuidance() {
        const closestObstacle = this.obstacles.reduce((closest, obs) => 
            obs.distance < closest.distance ? obs : closest, 
            { distance: Infinity }
        );
        
        let guidance = {
            text: "Path is clear. Proceed with confidence.",
            urgency: "SAFE",
            directions: { center: true, left: false, right: false },
            audioAlert: false
        };
        
        if (closestObstacle.distance < 1) {
            guidance = {
                text: `STOP! ${closestObstacle.object} directly ahead!`,
                urgency: "DANGER",
                directions: { center: false, left: false, right: false },
                audioAlert: true
            };
        } else if (closestObstacle.distance < 2) {
            const safeDir = this.safePath.direction;
            guidance = {
                text: `Caution: ${closestObstacle.object} nearby. Move ${safeDir}.`,
                urgency: "CAUTION",
                directions: { 
                    center: safeDir === 'center', 
                    left: safeDir === 'left', 
                    right: safeDir === 'right' 
                },
                audioAlert: true
            };
        } else if (this.obstacles.length > 0) {
            guidance = {
                text: `${this.obstacles.length} objects detected. Path clear ahead.`,
                urgency: "SAFE",
                directions: { center: true, left: false, right: false },
                audioAlert: false
            };
        }
        
        return guidance;
    }
};

// 1. Load the AI Model (MediaPipe)
async function setupAI() {
    try {
        statusDiv.textContent = "Loading AI model...";
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
                delegate: "GPU"
            },
            scoreThreshold: 0.35,
            maxResults: 10,
            runningMode: "VIDEO"
        });
        
        statusDiv.textContent = "AI model loaded";
        statusDiv.className = "text-green-500 font-mono";
        return true;
    } catch (error) {
        console.error("Error loading AI model:", error);
        statusDiv.textContent = "AI model failed";
        statusDiv.className = "text-red-500 font-mono";
        return false;
    }
}

// 2. Setup camera with MediaPipe Camera Utils
async function setupCamera() {
    try {
        statusDiv.textContent = "Setting up camera...";
        
        camera = new Camera(video, {
            onFrame: async () => {
                if (objectDetector && isRunning) {
                    await detectObjects();
                }
            },
            width: 640,
            height: 480
        });
        
        await camera.start();
        statusDiv.textContent = "Camera active";
        statusDiv.className = "text-green-500 font-mono";
        return true;
    } catch (error) {
        console.error("Error setting up camera:", error);
        statusDiv.textContent = "Camera failed";
        statusDiv.className = "text-red-500 font-mono";
        return false;
    }
}

// 3. Real-time object detection
async function detectObjects() {
    if (!objectDetector || !isRunning) return;
    
    const now = performance.now();
    const detections = objectDetector.detectForVideo(video, now);
    
    // Update FPS
    frameCount++;
    if (now - lastFrameTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFrameTime = now;
        fpsDiv.textContent = fps;
    }
    
    // Clear previous overlays
    detectionOverlay.innerHTML = '';
    
    if (detections.detections.length > 0) {
        // Update object count
        objectCount.innerHTML = `Objects detected: <span class="text-white font-bold">${detections.detections.length}</span>`;
        
        // Draw detection boxes
        detections.detections.forEach(detection => {
            drawDetectionBox(detection);
        });
        
        // Analyze for navigation
        const guidance = navigationSystem.analyzeObstacles(detections.detections);
        updateNavigationUI(guidance);
        
        // Trigger alerts if needed
        if (guidance.audioAlert && now - lastAlertTime > 3000) {
            triggerAlert(guidance.text, guidance.urgency);
            lastAlertTime = now;
        }
    } else {
        objectCount.innerHTML = 'Objects detected: <span class="text-white font-bold">0</span>';
        updateNavigationUI({
            text: "Path is clear. Proceed with confidence.",
            urgency: "SAFE",
            directions: { center: true, left: false, right: false },
            audioAlert: false
        });
    }
}

// 4. Draw detection boxes
function drawDetectionBox(detection) {
    const box = detection.boundingBox;
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;
    const containerWidth = 320; // Video display width
    const containerHeight = 320; // Video display height
    
    // Scale coordinates to display size
    const scaleX = containerWidth / videoWidth;
    const scaleY = containerHeight / videoHeight;
    
    const div = document.createElement('div');
    div.className = 'detection-overlay';
    div.style.left = `${box.originX * scaleX}px`;
    div.style.top = `${box.originY * scaleY}px`;
    div.style.width = `${box.width * scaleX}px`;
    div.style.height = `${box.height * scaleY}px`;
    
    // Color code by distance
    const distance = navigationSystem.estimateDistance(box);
    if (distance < 1) {
        div.style.borderColor = '#ef4444';
        div.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
    } else if (distance < 3) {
        div.style.borderColor = '#eab308';
        div.style.backgroundColor = 'rgba(234, 179, 8, 0.1)';
    } else {
        div.style.borderColor = '#22c55e';
        div.style.backgroundColor = 'rgba(34, 197, 94, 0.05)';
    }
    
    detectionOverlay.appendChild(div);
}

// 5. Update navigation UI
function updateNavigationUI(guidance) {
    guidancePanel.classList.remove('hidden');
    guidanceText.textContent = guidance.text;
    
    // Update urgency level
    urgencyLevel.textContent = guidance.urgency;
    urgencyLevel.className = `px-3 py-1 rounded-full text-xs font-bold ${
        guidance.urgency === 'DANGER' ? 'bg-red-500/20 text-red-400' :
        guidance.urgency === 'CAUTION' ? 'bg-yellow-500/20 text-yellow-400' :
        'bg-green-500/20 text-green-400'
    }`;
    
    // Update directional indicators
    const directions = {
        up: document.getElementById('upDirection'),
        left: document.getElementById('leftDirection'),
        center: document.getElementById('centerDirection'),
        right: document.getElementById('rightDirection')
    };
    
    // Reset all directions
    Object.values(directions).forEach(dir => {
        dir.className = 'bg-gray-800 rounded-lg p-3 opacity-50';
    });
    
    // Highlight safe directions
    if (guidance.directions.center) {
        directions.center.className = 'bg-green-600 rounded-lg p-3';
    }
    if (guidance.directions.left) {
        directions.left.className = 'bg-blue-600 rounded-lg p-3';
    }
    if (guidance.directions.right) {
        directions.right.className = 'bg-blue-600 rounded-lg p-3';
    }
}

// 6. Multi-modal alerts
function triggerAlert(message, urgency) {
    // Vibration patterns
    if ('vibrate' in navigator) {
        if (urgency === 'DANGER') {
            navigator.vibrate([300, 100, 300, 100, 300]);
        } else if (urgency === 'CAUTION') {
            navigator.vibrate([200, 100, 200]);
        }
    }
    
    // Voice feedback
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = urgency === 'DANGER' ? 1.4 : 1.2;
    utterance.pitch = urgency === 'DANGER' ? 1.3 : 1.1;
    utterance.volume = 0.9;
    synth.speak(utterance);
    
    // Visual indicator
    audioIndicator.classList.remove('hidden');
    audioIndicator.className = `fixed bottom-4 right-4 border rounded-full p-3 ${
        urgency === 'DANGER' ? 'bg-red-500/20 border-red-500' :
        urgency === 'CAUTION' ? 'bg-yellow-500/20 border-yellow-500' :
        'bg-green-500/20 border-green-500'
    }`;
    
    setTimeout(() => {
        audioIndicator.classList.add('hidden');
    }, 2000);
}

// 7. Start/Stop functionality
async function startDetection() {
    if (!isRunning) {
        // Initialize systems
        const aiReady = await setupAI();
        const cameraReady = await setupCamera();
        
        if (aiReady && cameraReady) {
            isRunning = true;
            startBtn.innerHTML = '<i class="fas fa-stop mr-3"></i><span>STOP RUN</span>';
            startBtn.className = 'relative group';
            startBtn.querySelector('div').className = 'absolute inset-0 bg-gradient-to-r from-gray-600 to-gray-500 rounded-full blur-lg opacity-75 group-hover:opacity-100 transition-all pulse-ring';
            startBtn.querySelector('div:last-child').className = 'relative bg-gray-600 hover:bg-gray-500 w-56 h-56 rounded-full text-2xl font-bold transition-all transform hover:scale-105 flex items-center justify-center';
            
            statusDiv.textContent = "Detection active";
            statusDiv.className = "text-yellow-500 font-mono animate-pulse";
            guidancePanel.classList.remove('hidden');
        }
    } else {
        // Stop detection
        isRunning = false;
        if (camera) {
            camera.stop();
        }
        
        startBtn.innerHTML = '<i class="fas fa-play mr-3"></i><span>START RUN</span>';
        startBtn.className = 'relative group';
        startBtn.querySelector('div').className = 'absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 rounded-full blur-lg opacity-75 group-hover:opacity-100 transition-all pulse-ring';
        startBtn.querySelector('div:last-child').className = 'relative bg-red-600 hover:bg-red-500 w-56 h-56 rounded-full text-2xl font-bold transition-all transform hover:scale-105 flex items-center justify-center';
        
        statusDiv.textContent = "System Ready...";
        statusDiv.className = "text-green-500 font-mono";
        guidancePanel.classList.add('hidden');
        detectionOverlay.innerHTML = '';
        fpsDiv.textContent = '0';
    }
}

// 8. Event listeners
startBtn.addEventListener('click', startDetection);

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    statusDiv.textContent = "System Ready...";
    console.log("VisionStride AI Navigation Assistant initialized");
});
