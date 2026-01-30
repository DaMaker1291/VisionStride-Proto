let objectDetector;
const video = document.getElementById('webcam');
const startBtn = document.getElementById('startBtn');
const statusDiv = document.getElementById('status');
const outputDiv = document.getElementById('output');
const synth = window.speechSynthesis; // For AirPods voice
let isRunning = false;
let stream = null;

// 1. Load the AI Model (MediaPipe)
async function setupAI() {
    try {
        statusDiv.textContent = "Loading AI model...";
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
        objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite" },
            scoreThreshold: 0.5,
            runningMode: "VIDEO"
        });
        statusDiv.textContent = "AI model loaded successfully";
        statusDiv.className = "text-green-500 mb-4 font-mono";
    } catch (error) {
        console.error("Error loading AI model:", error);
        statusDiv.textContent = "Error loading AI model";
        statusDiv.className = "text-red-500 mb-4 font-mono";
    }
}

// 2. Setup webcam
async function setupWebcam() {
    try {
        statusDiv.textContent = "Setting up webcam...";
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        video.srcObject = stream;
        statusDiv.textContent = "Webcam ready";
        statusDiv.className = "text-green-500 mb-4 font-mono";
    } catch (error) {
        console.error("Error accessing webcam:", error);
        statusDiv.textContent = "Error accessing webcam";
        statusDiv.className = "text-red-500 mb-4 font-mono";
    }
}

// 3. The Danger Logic Loop
function predictLoop() {
    if (!objectDetector || !isRunning) return;
    
    try {
        const detections = objectDetector.detectForVideo(video, performance.now());
        
        detections.detections.forEach(obj => {
            const label = obj.categories[0].categoryName;
            const box = obj.boundingBox;
            
            // Use bounding box width as a "Poor Man's Distance Sensor"
            // If the box fills >40% of the screen, it's close!
            if (box.width > (video.videoWidth * 0.4)) {
                triggerAlert(label);
            }
        });
    } catch (error) {
        console.error("Error in prediction loop:", error);
    }
    
    window.requestAnimationFrame(predictLoop);
}

// 4. Multi-Modal Feedback (AirPods + Phone Vibe)
function triggerAlert(objectName) {
    // Vibrate phone pattern: Short-Gap-Short (Warning)
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
    }
    
    // Voice feedback via AirPods
    const utterance = new SpeechSynthesisUtterance(`Danger: ${objectName} ahead`);
    utterance.rate = 1.2;
    utterance.pitch = 1.1;
    synth.speak(utterance);
    
    outputDiv.innerText = `CRITICAL: ${objectName.toUpperCase()} DETECTED`;
    outputDiv.className = "mt-8 text-xl text-center px-4 text-red-500 font-bold";
    
    // Reset output after 3 seconds
    setTimeout(() => {
        outputDiv.innerText = "Scanning for dangers...";
        outputDiv.className = "mt-8 text-xl text-center px-4 italic opacity-80";
    }, 3000);
}

// 5. Start/Stop functionality
async function startDetection() {
    if (!isRunning) {
        // Start detection
        await setupWebcam();
        await setupAI();
        
        if (objectDetector && stream) {
            isRunning = true;
            startBtn.textContent = "STOP RUN";
            startBtn.className = "bg-gray-600 hover:bg-gray-500 w-48 h-48 rounded-full text-2xl font-bold shadow-[0_0_50px_rgba(107,114,128,0.5)] transition-all";
            statusDiv.textContent = "Detection active";
            statusDiv.className = "text-yellow-500 mb-4 font-mono animate-pulse";
            outputDiv.innerText = "Scanning for dangers...";
            
            predictLoop();
        }
    } else {
        // Stop detection
        isRunning = false;
        startBtn.textContent = "START RUN";
        startBtn.className = "bg-red-600 hover:bg-red-500 w-48 h-48 rounded-full text-2xl font-bold shadow-[0_0_50px_rgba(220,38,38,0.5)] transition-all animate-pulse";
        statusDiv.textContent = "System Ready...";
        statusDiv.className = "text-green-500 mb-4 font-mono";
        outputDiv.innerText = "Waiting for activation...";
        outputDiv.className = "mt-8 text-xl text-center px-4 italic opacity-80";
        
        // Stop webcam
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        video.srcObject = null;
    }
}

// 6. Event listeners
startBtn.addEventListener('click', startDetection);

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    statusDiv.textContent = "System Ready...";
    console.log("VisionStride Proto initialized");
});
