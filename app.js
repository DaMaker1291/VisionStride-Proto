let model;
let isRunning = false;
let lastAlertTime = 0;
let lastDirectionTime = 0;
let lastGuidanceTime = 0;
let navigationHistory = [];
let lastSpokenMessage = '';
let continuousGuidanceCount = 0;
const video = document.getElementById('webcam');
const startBtn = document.getElementById('startBtn');
const statusDiv = document.getElementById('status');
const overlay = document.getElementById('detectionOverlay');
const guidanceText = document.getElementById('guidanceText');
const directionIndicator = document.getElementById('directionIndicator');
const pathClearance = document.getElementById('pathClearance');

// Load the AI Model
async function init() {
    try {
        statusDiv.textContent = "Loading AI Model...";
        
        // Mobile performance optimizations
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            // Use lighter model for mobile devices
            model = await cocoSsd.load({
                base: 'mobilenet_v2',
                modelUrl: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2/dist/model.json'
            });
        } else {
            model = await cocoSsd.load();
        }
        
        statusDiv.textContent = "System Ready";
    } catch (error) {
        console.error('Model loading failed:', error);
        statusDiv.textContent = "Model loading failed. Please refresh.";
    }
}

async function startCamera() {
    try {
        // Mobile device camera configuration
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        let constraints = {
            video: {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                facingMode: isMobile ? 'environment' : 'user'
            },
            audio: false
        };
        
        // Try to get camera with environment (back) camera first for mobile
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            return new Promise((resolve) => video.onloadedmetadata = resolve);
        } catch (envError) {
            console.log('Environment camera failed, trying user camera:', envError);
            
            // Fallback to user (front) camera
            constraints.video.facingMode = 'user';
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            return new Promise((resolve) => video.onloadedmetadata = resolve);
        }
    } catch (error) {
        console.error('Camera access failed:', error);
        
        // Final fallback with basic constraints
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
            video.srcObject = stream;
            return new Promise((resolve) => video.onloadedmetadata = resolve);
        } catch (fallbackError) {
            throw new Error('Camera access denied. Please allow camera permissions to use this app.');
        }
    }
}

async function detectionLoop() {
    if (!isRunning) return;

    try {
        const predictions = await model.detect(video);
        renderDetections(predictions);
        processNavigation(predictions);
    } catch (error) {
        console.error('Detection error:', error);
        // Continue running even if detection fails
    }
    
    // Use setTimeout for better mobile performance instead of requestAnimationFrame
    setTimeout(() => detectionLoop(), 100); // 10 FPS for mobile
}

function renderDetections(predictions) {
    overlay.innerHTML = '';
    predictions.forEach(p => {
        const [x, y, width, height] = p.bbox;
        const box = document.createElement('div');
        box.className = 'detection-box';
        // Scaling for display
        const scaleX = overlay.offsetWidth / video.videoWidth;
        const scaleY = overlay.offsetHeight / video.videoHeight;
        
        box.style.left = `${x * scaleX}px`;
        box.style.top = `${y * scaleY}px`;
        box.style.width = `${width * scaleX}px`;
        box.style.height = `${height * scaleY}px`;
        
        // Enhanced classification and color coding
        const classification = classifyObjectForNavigation(p);
        const proximity = width / video.videoWidth;
        
        box.style.borderColor = classification.color;
        box.style.borderWidth = classification.isCritical ? '3px' : '2px';
        
        // Add label for important objects
        if (classification.showLabel) {
            const label = document.createElement('div');
            label.className = 'absolute text-xs font-bold text-white bg-black/70 px-1 rounded';
            label.style.top = '-20px';
            label.style.left = '0';
            label.textContent = classification.displayName;
            box.appendChild(label);
        }
        
        overlay.appendChild(box);
    });
}

function classifyObjectForNavigation(prediction) {
    const className = prediction.class.toLowerCase();
    const confidence = prediction.score;
    const bbox = prediction.bbox;
    const relativeSize = bbox[2] / video.videoWidth;
    
    // Navigation-relevant classifications
    const navigationClasses = {
        // Immediate dangers
        'car': { priority: 'critical', displayName: 'Vehicle', color: '#dc2626', showLabel: true },
        'truck': { priority: 'critical', displayName: 'Vehicle', color: '#dc2626', showLabel: true },
        'bus': { priority: 'critical', displayName: 'Vehicle', color: '#dc2626', showLabel: true },
        'motorcycle': { priority: 'critical', displayName: 'Vehicle', color: '#dc2626', showLabel: true },
        'bicycle': { priority: 'high', displayName: 'Bike', color: '#ea580c', showLabel: true },
        
        // People and animals
        'person': { priority: 'high', displayName: 'Person', color: '#f59e0b', showLabel: true },
        
        // Barriers and walls
        'chair': { priority: 'medium', displayName: 'Chair', color: '#3b82f6', showLabel: false },
        'couch': { priority: 'medium', displayName: 'Couch', color: '#3b82f6', showLabel: false },
        'dining table': { priority: 'medium', displayName: 'Table', color: '#3b82f6', showLabel: false },
        'bench': { priority: 'medium', displayName: 'Bench', color: '#3b82f6', showLabel: false },
        'wall': { priority: 'high', displayName: 'Wall', color: '#dc2626', showLabel: true },
        'barrier': { priority: 'high', displayName: 'Barrier', color: '#dc2626', showLabel: true },
        'potential_wall': { priority: 'medium', displayName: 'Wall', color: '#f59e0b', showLabel: false },
        
        // Potential obstacles
        'potted plant': { priority: 'low', displayName: 'Plant', color: '#10b981', showLabel: false },
        'backpack': { priority: 'low', displayName: 'Bag', color: '#10b981', showLabel: false },
        'handbag': { priority: 'low', displayName: 'Bag', color: '#10b981', showLabel: false },
        'suitcase': { priority: 'low', displayName: 'Luggage', color: '#10b981', showLabel: false },
        
        // Doors and passages
        'door': { priority: 'info', displayName: 'Door', color: '#8b5cf6', showLabel: true },
        'window': { priority: 'info', displayName: 'Window', color: '#8b5cf6', showLabel: false },
        
        // Traffic elements
        'traffic light': { priority: 'high', displayName: 'Traffic', color: '#ef4444', showLabel: true },
        'stop sign': { priority: 'high', displayName: 'Stop Sign', color: '#ef4444', showLabel: true },
        
        // Default
        'default': { priority: 'low', displayName: className, color: '#22c55e', showLabel: false }
    };
    
    const classification = navigationClasses[className] || navigationClasses['default'];
    
    // Adjust priority based on size and confidence
    const isCritical = classification.priority === 'critical' || 
                      (relativeSize > 0.3 && classification.priority === 'high') ||
                      (relativeSize > 0.4 && classification.priority === 'medium');
    
    // Adjust color based on proximity
    let color = classification.color;
    if (relativeSize > 0.4) {
        color = '#dc2626'; // Red for very close
    } else if (relativeSize > 0.2) {
        color = '#f59e0b'; // Orange for close
    }
    
    return {
        ...classification,
        isCritical,
        color,
        relativeSize,
        confidence
    };
}

function processNavigation(predictions) {
    const analysis = analyzeSpatialEnvironment(predictions);
    
    if (analysis.isPathClear && analysis.criticalObstacles.length === 0) {
        updateUI("Path clear. Continue straight.", "SAFE");
        provideDirectionalGuidance("straight", analysis);
    } else {
        handleObstacles(analysis);
    }
    
    updatePathVisualization(analysis);
}

function updateUI(text, urgency) {
    guidanceText.textContent = text;
    const panel = document.getElementById('guidancePanel');
    const badge = document.getElementById('urgencyLevel');
    
    panel.style.opacity = "1";
    badge.textContent = urgency;
    badge.className = `text-xs font-black px-2 py-1 rounded ${
        urgency === 'DANGER' ? 'bg-red-600 text-white pulse-red' : 
        urgency === 'CAUTION' ? 'bg-yellow-500 text-black' : 'bg-green-600 text-white'
    }`;
}

function analyzeSpatialEnvironment(predictions) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Create spatial zones
    const zones = {
        left: { x: 0, w: width * 0.33, objects: [] },
        center: { x: width * 0.33, w: width * 0.34, objects: [] },
        right: { x: width * 0.67, w: width * 0.33, objects: [] },
        near: { distance: 0, objects: [] },
        medium: { distance: 0, objects: [] },
        far: { distance: 0, objects: [] }
    };
    
    // Add wall detection
    const wallObjects = detectWallsAndBarriers(predictions);
    const allObjects = [...predictions, ...wallObjects];
    
    // Categorize objects by position and distance
    allObjects.forEach(pred => {
        const [x, y, w, h] = pred.bbox;
        const objCenterX = x + w/2;
        const objCenterY = y + h/2;
        const size = w / width;
        const distance = estimateDistance(size, h);
        
        // Horizontal positioning
        if (objCenterX < width * 0.33) zones.left.objects.push({ ...pred, distance, zone: 'left' });
        else if (objCenterX < width * 0.67) zones.center.objects.push({ ...pred, distance, zone: 'center' });
        else zones.right.objects.push({ ...pred, distance, zone: 'right' });
        
        // Distance categorization
        if (distance < 2) zones.near.objects.push({ ...pred, distance });
        else if (distance < 5) zones.medium.objects.push({ ...pred, distance });
        else zones.far.objects.push({ ...pred, distance });
    });
    
    // Analyze path clearance
    const pathAnalysis = analyzePathClearance(zones, width, height);
    
    return {
        zones,
        isPathClear: pathAnalysis.isClear,
        recommendedDirection: pathAnalysis.direction,
        obstacles: zones.near.objects.concat(zones.medium.objects),
        criticalObstacles: zones.near.objects.filter(obj => obj.distance < 1.5),
        pathWidth: pathAnalysis.width,
        confidence: calculateNavigationConfidence(zones),
        hasWalls: wallObjects.length > 0
    };
}

function detectWallsAndBarriers(predictions) {
    const walls = [];
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    // Detect large horizontal objects that might be walls or barriers
    predictions.forEach(pred => {
        const [x, y, w, h] = pred.bbox;
        const aspectRatio = w / h;
        const relativeWidth = w / width;
        const relativeHeight = h / height;
        
        // Wall characteristics: very wide, not too tall, covering significant width
        if (relativeWidth > 0.6 && aspectRatio > 2.0 && relativeHeight < 0.8) {
            walls.push({
                ...pred,
                class: 'wall',
                bbox: pred.bbox,
                score: pred.score,
                isWall: true
            });
        }
        
        // Detect potential barriers (large objects blocking path)
        if (relativeWidth > 0.4 && relativeHeight > 0.3) {
            const centerX = x + w/2;
            if (centerX > width * 0.25 && centerX < width * 0.75) {
                walls.push({
                    ...pred,
                    class: 'barrier',
                    bbox: pred.bbox,
                    score: pred.score,
                    isBarrier: true
                });
            }
        }
    });
    
    // Add virtual wall detection for empty spaces (edge detection simulation)
    if (predictions.length === 0) {
        // If no objects detected, check if we might be facing a wall
        walls.push({
            class: 'potential_wall',
            bbox: [width * 0.1, height * 0.1, width * 0.8, height * 0.8],
            score: 0.3,
            isPotentialWall: true
        });
    }
    
    return walls;
}

function estimateDistance(relativeWidth, relativeHeight) {
    // Simple distance estimation based on object size
    const avgSize = (relativeWidth + relativeHeight) / 2;
    if (avgSize > 0.4) return 0.5; // Very close
    if (avgSize > 0.2) return 1.5; // Close
    if (avgSize > 0.1) return 3;   // Medium
    if (avgSize > 0.05) return 5;  // Far
    return 8; // Very far
}

function analyzePathClearance(zones, videoWidth, videoHeight) {
    const centerZone = zones.center;
    const leftZone = zones.left;
    const rightZone = zones.right;
    
    // Check if center path is blocked
    const centerBlocked = centerZone.objects.some(obj => obj.distance < 2);
    
    if (!centerBlocked) {
        return { isClear: true, direction: 'straight', width: 'wide' };
    }
    
    // Check alternative paths
    const leftClear = leftZone.objects.filter(obj => obj.distance < 2).length === 0;
    const rightClear = rightZone.objects.filter(obj => obj.distance < 2).length === 0;
    
    if (leftClear && !rightClear) {
        return { isClear: false, direction: 'left', width: 'narrow' };
    } else if (rightClear && !leftClear) {
        return { isClear: false, direction: 'right', width: 'narrow' };
    } else if (leftClear && rightClear) {
        // Choose the side with fewer obstacles
        const leftObstacles = leftZone.objects.length;
        const rightObstacles = rightZone.objects.length;
        return { 
            isClear: false, 
            direction: leftObstacles < rightObstacles ? 'left' : 'right', 
            width: 'medium' 
        };
    }
    
    return { isClear: false, direction: 'stop', width: 'blocked' };
}

function calculateNavigationConfidence(zones) {
    const totalObjects = zones.left.objects.length + zones.center.objects.length + zones.right.objects.length;
    const nearObjects = zones.near.objects.length;
    
    if (nearObjects > 2) return 'low';
    if (totalObjects > 5) return 'medium';
    return 'high';
}

function handleObstacles(analysis) {
    const critical = analysis.criticalObstacles;
    
    if (critical.length > 0) {
        const closest = critical[0];
        const direction = getDirection(closest);
        triggerFeedback(`STOP! ${closest.class} ${direction}`, "DANGER");
        continuousGuidanceCount = 0; // Reset counter on danger
    } else if (analysis.obstacles.length > 0) {
        const guidance = getNavigationGuidance(analysis);
        updateUI(guidance.text, "CAUTION");
        provideDirectionalGuidance(guidance.direction, analysis);
    } else if (analysis.hasWalls) {
        updateUI("Wall detected. Find alternative route.", "CAUTION");
        provideDirectionalGuidance("stop", analysis);
        continuousGuidanceCount = 0; // Reset counter on wall detection
    }
}

function getDirection(object) {
    const [x, y, w, h] = object.bbox;
    const objCenterX = x + w/2;
    const videoWidth = video.videoWidth;
    const relativeX = objCenterX / videoWidth;
    
    if (relativeX < 0.33) return 'to your left';
    if (relativeX > 0.67) return 'to your right';
    return 'ahead';
}

function getNavigationGuidance(analysis) {
    const direction = analysis.recommendedDirection;
    const obstacles = analysis.obstacles;
    
    switch(direction) {
        case 'left':
            return { 
                text: 'Obstacle ahead. Turn left.', 
                direction: 'left',
                reason: obstacles[0]?.class || 'object'
            };
        case 'right':
            return { 
                text: 'Obstacle ahead. Turn right.', 
                direction: 'right',
                reason: obstacles[0]?.class || 'object'
            };
        case 'stop':
            return { 
                text: 'Path blocked. Find alternative route.', 
                direction: 'stop',
                reason: 'multiple obstacles'
            };
        default:
            return { text: 'Proceed with caution.', direction: 'straight' };
    }
}

function provideDirectionalGuidance(direction, analysis) {
    const now = Date.now();
    
    let message = '';
    let hapticPattern = [];
    let shouldSpeak = false;
    
    switch(direction) {
        case 'left':
            message = 'Turn left';
            hapticPattern = [100, 50, 100];
            shouldSpeak = true;
            break;
        case 'right':
            message = 'Turn right';
            hapticPattern = [50, 100, 50];
            shouldSpeak = true;
            break;
        case 'straight':
            // Only say "go straight" if it's the first time or if direction changed
            if (lastSpokenMessage !== 'Go straight' && now - lastDirectionTime > 5000) {
                message = 'Go straight';
                hapticPattern = [200];
                shouldSpeak = true;
                continuousGuidanceCount++;
                
                // After 3 continuous "go straight", stop speaking it
                if (continuousGuidanceCount > 3) {
                    shouldSpeak = false;
                    message = '';
                }
            } else {
                // Just provide haptic feedback
                hapticPattern = [50];
                shouldSpeak = false;
            }
            break;
        case 'stop':
            message = 'Stop';
            hapticPattern = [200, 100, 200, 100, 200];
            shouldSpeak = true;
            continuousGuidanceCount = 0; // Reset counter on stop
            break;
    }
    
    if (message && navigator.vibrate) {
        try {
            navigator.vibrate(hapticPattern);
        } catch (vibrateError) {
            console.log('Vibration failed:', vibrateError);
        }
    }
    
    if (message && shouldSpeak && now - lastDirectionTime > 3000) {
        try {
            // Cancel any previous speech to avoid overlap
            window.speechSynthesis.cancel();
            
            const speech = new SpeechSynthesisUtterance(message);
            speech.rate = 1.1;
            speech.volume = 0.8; // Lower volume for mobile
            window.speechSynthesis.speak(speech);
            lastSpokenMessage = message;
            lastDirectionTime = now;
        } catch (speechError) {
            console.log('Speech failed:', speechError);
        }
    }
    
    updateDirectionIndicator(direction);
}

function updateDirectionIndicator(direction) {
    if (!directionIndicator) return;
    
    directionIndicator.className = 'absolute top-4 left-4 bg-black/60 px-3 py-2 rounded-full text-sm font-bold ';
    
    switch(direction) {
        case 'left':
            directionIndicator.innerHTML = '← LEFT';
            directionIndicator.classList.add('text-blue-400');
            break;
        case 'right':
            directionIndicator.innerHTML = 'RIGHT →';
            directionIndicator.classList.add('text-blue-400');
            break;
        case 'straight':
            directionIndicator.innerHTML = '↑ STRAIGHT';
            directionIndicator.classList.add('text-green-400');
            break;
        case 'stop':
            directionIndicator.innerHTML = '✕ STOP';
            directionIndicator.classList.add('text-red-400', 'pulse-red');
            break;
    }
}

function triggerFeedback(message, urgency) {
    updateUI(message, urgency);
    const now = Date.now();
    
    if (now - lastAlertTime > 3000) { // Throttle speech to every 3 seconds
        // Haptics - mobile compatible
        if (navigator.vibrate) {
            const pattern = urgency === "DANGER" ? [200, 100, 200] : [100];
            try {
                navigator.vibrate(pattern);
            } catch (vibrateError) {
                console.log('Vibration not supported:', vibrateError);
            }
        }
        
        // Voice - mobile compatible
        try {
            const speech = new SpeechSynthesisUtterance(message);
            speech.rate = 1.1;
            speech.pitch = urgency === "DANGER" ? 1.2 : 1.0;
            speech.volume = 0.8; // Lower volume for mobile
            
            // Cancel any previous speech to avoid overlap
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(speech);
        } catch (speechError) {
            console.log('Speech synthesis not supported:', speechError);
        }
        
        lastAlertTime = now;
    }
}

function updatePathVisualization(analysis) {
    if (!pathClearance) return;
    
    const clearance = analysis.pathWidth;
    let html = '';
    
    // Show path zones with obstacle counts
    html += `<div class="flex justify-between text-xs mb-1">`;
    html += `<span class="${analysis.zones.left.objects.length > 0 ? 'text-red-400' : 'text-green-400'}">L(${analysis.zones.left.objects.length})</span>`;
    html += `<span class="${analysis.zones.center.objects.length > 0 ? 'text-red-400' : 'text-green-400'}">C(${analysis.zones.center.objects.length})</span>`;
    html += `<span class="${analysis.zones.right.objects.length > 0 ? 'text-red-400' : 'text-green-400'}">R(${analysis.zones.right.objects.length})</span>`;
    html += `</div>`;
    
    // Show confidence level
    const confidenceColor = analysis.confidence === 'high' ? 'text-green-400' : 
                           analysis.confidence === 'medium' ? 'text-yellow-400' : 'text-red-400';
    html += `<div class="text-xs ${confidenceColor}">${analysis.confidence.toUpperCase()}</div>`;
    
    pathClearance.innerHTML = html;
}

startBtn.addEventListener('click', async () => {
    if (!isRunning) {
        try {
            statusDiv.textContent = "Starting camera...";
            await startCamera();
            isRunning = true;
            startBtn.classList.add('running');
            detectionLoop();
        } catch (error) {
            console.error('Camera start failed:', error);
            statusDiv.textContent = "Camera failed. Check permissions.";
            alert('Camera access required. Please allow camera permissions and try again.');
        }
    } else {
        // Stop camera stream
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        location.reload(); // Simple stop
    }
});

init();