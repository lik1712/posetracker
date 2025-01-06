const video = document.getElementById('video');
const showBoundingBox = document.getElementById('showBoundingBox');
const showLandmarks = document.getElementById('showLandmarks');
const showAgeGender = document.getElementById('showAgeGender');
const showExpressions = document.getElementById('showExpressions');
const cameraSelect = document.getElementById('cameraSelect'); 
const toggleEmotionSaveButton = document.getElementById("toggleEmotionSave");

let currentStream = null; // Variable to keep track of the current stream
let isSavingEmotionData = false; // Flag for emotion data saving

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

        // Extract and send the highest probability expression to the server
        const faceData = resizedDetections.map(detection => {
          if (!detection.expressions) {
            return null;
          }
        
          // Find the highest probability emotion
          const highestExpression = Object.entries(detection.expressions)
            .reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0]);
        
          // Ensure emotion string is clean and lowercase
          const emotion = highestExpression[0]?.toLowerCase().trim() || 'neutral';
          const probability = highestExpression[1] || 0;
        
          return {
            expression: emotion,
            probability: probability
          };
        }).filter(Boolean);

        if (faceData.length > 0) {
          const payload = { faceData };

          // Always send data to .NET
          fetch('http://localhost:5000/send-face-expression-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(err => console.error('Error sending face expression data:', err));
        } 

        requestAnimationFrame(detectFaces);
      });
  }

  requestAnimationFrame(detectFaces);
});

// Toggle Saving Button
toggleEmotionSaveButton.addEventListener('click', async () => {
  isSavingEmotionData = !isSavingEmotionData;

  // Update button text
  toggleEmotionSaveButton.innerText = isSavingEmotionData ? 'Stop Emotion Data Saving' : 'Start Emotion Data Saving';

  // Notify the backend
  try {
    const response = await fetch('http://localhost:5000/toggle-save-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'emotion' }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to toggle emotion saving on server:', errorData.error);
    } else {
      const result = await response.json();
      console.log(result.message);
    }
  } catch (error) {
    console.error('Error communicating with the server:', error);
  }
});

