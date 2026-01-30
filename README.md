# VisionStride-Proto

A computer vision accessibility app that helps users navigate safely by detecting nearby objects and providing multi-modal feedback (haptic and audio alerts).

## Features

- **Real-time Object Detection**: Uses MediaPipe's EfficientDet Lite0 model to detect objects in the user's path
- **Multi-modal Feedback**: 
  - Haptic feedback (vibration patterns) for immediate alerts
  - Audio feedback via speech synthesis through connected devices (AirPods, etc.)
- **Dark Mode UI**: Modern, high-contrast interface built with Tailwind CSS
- **Distance-based Alerts**: Objects that appear too large (close) trigger danger alerts

## How It Works

1. The app accesses the device's camera (preferably rear-facing for navigation)
2. MediaPipe's object detection model continuously analyzes the video feed
3. When an object's bounding box occupies >40% of the screen width, it's considered "too close"
4. The app triggers:
   - Vibration pattern: Short-Gap-Short (200ms, 100ms gap, 200ms)
   - Voice alert: "Danger: [object name] ahead"
   - Visual alert in the UI

## Technical Stack

- **Frontend**: HTML5, Tailwind CSS (Dark Mode)
- **Computer Vision**: MediaPipe Tasks Vision (EfficientDet Lite0)
- **Audio**: Web Speech API
- **Haptics**: Vibration API
- **Real-time Processing**: RequestAnimationFrame loop

## Usage

1. Open `index.html` in a modern web browser
2. Grant camera permissions when prompted
3. Click the "START RUN" button to begin detection
4. Point the camera where you're walking
5. The app will alert you to nearby obstacles

## Browser Compatibility

- Chrome/Edge (recommended)
- Safari (limited haptic support)
- Firefox (basic support)

## Security Notes

- All processing happens locally in the browser
- No data is sent to external servers
- Camera feed is only processed locally

## Future Enhancements

- [ ] Add more sophisticated distance estimation
- [ ] Support for custom alert thresholds
- [ ] Offline model loading
- [ ] Mobile app wrapper (PWA)
- [ ] Additional object categories for accessibility
