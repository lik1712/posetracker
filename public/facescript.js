const video = document.getElementById('video');
const showBoundingBox = document.getElementById('showBoundingBox');
const showLandmarks = document.getElementById('showLandmarks');
const showAgeGender = document.getElementById('showAgeGender');
const showExpressions = document.getElementById('showExpressions');
const cameraSelect = document.getElementById('cameraSelect'); 

let currentStream = null; // Variable to keep track of the current stream

// Models are loaded only once and reused
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
  faceapi.nets.faceExpressionNet.loadFromUri('/models'),
  faceapi.nets.ageGenderNet.loadFromUri('/models')
]).then(() => {
  loadAvailableCameras();
  startVideo(); // Start with the default camera
});

// Function to load available cameras
async function loadAvailableCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');
  
  // Populate the camera dropdown
  videoDevices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || `Camera ${cameraSelect.length + 1}`;
    cameraSelect.appendChild(option);
  });

  // Add event listener to switch camera
  cameraSelect.addEventListener('change', switchCamera);
}

// Function to start video stream
function startVideo(deviceId = null) {
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
    },
  };

  // Stop the current stream if it exists
  if (currentStream) {
    const tracks = currentStream.getTracks();
    tracks.forEach(track => track.stop());
  }

  // Start the new video stream
  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      video.srcObject = stream;
      currentStream = stream;
    })
    .catch(err => console.error('Error accessing webcam:', err));
}

// Switch camera when the user selects a new one
function switchCamera() {
  const deviceId = cameraSelect.value;
  startVideo(deviceId);
}

video.addEventListener('play', () => {
  const canvas = faceapi.createCanvasFromMedia(video);
  document.body.append(canvas);
  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(canvas, displaySize);

  function detectFaces() {
    faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender()
      .then(detections => {
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        // Draw the face detection and landmarks based on checkbox state
        if (showBoundingBox.checked) {
          faceapi.draw.drawDetections(canvas, resizedDetections);
        }
        if (showLandmarks.checked) {
          faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        }
        if (showExpressions.checked) {
          faceapi.draw.drawFaceExpressions(canvas, resizedDetections);
        }

        // Draw age/gender label
        if (showAgeGender.checked) {
          resizedDetections.forEach(detection => {
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, {
              label: `${Math.round(detection.age)} years old, ${detection.gender}`
            });
            drawBox.draw(canvas);
          });
        }

        requestAnimationFrame(detectFaces);
      });
  }

  requestAnimationFrame(detectFaces);
});
