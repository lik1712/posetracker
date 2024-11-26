const video = document.getElementById('video');
let expressionsData = [];

// Load the face-api models
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  faceapi.nets.faceExpressionNet.loadFromUri('/models'),
]).then(startVideo);

// Start video streaming from webcam
function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: {} })
    .then(stream => {
      video.srcObject = stream;
    })
    .catch(err => console.error('Error accessing the camera: ', err));
}

// Get the play and pause buttons
const playButton = document.getElementById('v-play');
const pauseButton = document.getElementById('v-pause');

// Play button functionality
playButton.addEventListener('click', function() {
  video.play(); 
}, false);

// Pause button functionality
pauseButton.addEventListener('click', function() {
  video.pause(); 
}, false);

// Update button state on pause
video.addEventListener('pause', function() {
  playButton.disabled = false;
  pauseButton.disabled = true;
}, false);

// Update button state on video end
video.addEventListener('ended', function() {
  playButton.disabled = false;
  pauseButton.disabled = true;
}, false);

// Main event listener for video play
video.addEventListener('play', () => {
  playButton.disabled = true;
  pauseButton.disabled = false;

  const canvas = faceapi.createCanvasFromMedia(video);
  document.body.append(canvas);
  
  // Ensure video dimensions are dynamically set
  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  // Process video frames for face detection
  setInterval(async () => {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 });

    // Detect faces, landmarks, and expressions
    const detections = await faceapi.detectAllFaces(video, options)
                                     .withFaceLandmarks()
                                     .withFaceExpressions();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    // Clear the canvas for the next frame
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    // Draw face detections, landmarks, and expressions
    faceapi.draw.drawDetections(canvas, resizedDetections);
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
    faceapi.draw.drawFaceExpressions(canvas, resizedDetections);
  }, 100);
});
