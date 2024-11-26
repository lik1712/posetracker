import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
  } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0" ;
  
  const demosSection = document.getElementById("demos");
  
  let poseLandmarker;
  let runningMode = "IMAGE";
  let enableWebcamButton;
  let cameraSelect;
  let webcamRunning = false;
  const videoHeight = "360px";
  const videoWidth = "480px";
  
  // Create PoseLandmarker instance
  const createPoseLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/models/pose_landmarker_full.task",
        delegate: "GPU"
      },
      runningMode: runningMode,
      numPoses: 2
    });
    demosSection.classList.remove("invisible");
  };
  createPoseLandmarker();
  
  // Function to populate camera selection dropdown
  const populateCameraSelect = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameraSelect = document.getElementById("cameraSelect");
    
    // Filter out video input devices
    devices.forEach(device => {
      if (device.kind === 'videoinput') {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${cameraSelect.length + 1}`;
        cameraSelect.appendChild(option);
      }
    });
  };
  
  // Call function to populate camera dropdown
  populateCameraSelect();
  
  /********************************************************************
  // Demo 2: Continuous pose detection from webcam.
  ********************************************************************/
  
  const video = document.getElementById("webcam");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const drawingUtils = new DrawingUtils(canvasCtx);
  
  const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
  
  if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);
  } else {
    console.warn("getUserMedia() is not supported by your browser");
  }
  
  function enableCam(event) {
    if (!poseLandmarker) {
      console.log("Wait! poseLandmarker not loaded yet.");
      return;
    }
  
    if (webcamRunning === true) {
      webcamRunning = false;
      enableWebcamButton.innerText = "ENABLE PREDICTIONS";
      cameraSelect.disabled = false; // Enable camera selection when predictions are stopped
    } else {
      webcamRunning = true;
      enableWebcamButton.innerText = "DISABLE PREDICTIONS";
      cameraSelect.disabled = true; // Disable camera selection when predictions are running
    }
  
    const constraints = {
      video: {
        deviceId: { exact: cameraSelect.value } // Use selected camera ID
      }
    };
  
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      video.srcObject = stream;
      video.addEventListener("loadeddata", predictWebcam);
    });
  }
  
  let lastVideoTime = -1;
  async function predictWebcam() {
    canvasElement.style.height = videoHeight;
    video.style.height = videoHeight;
    canvasElement.style.width = videoWidth;
    video.style.width = videoWidth;
  
    if (runningMode === "IMAGE") {
      runningMode = "VIDEO";
      await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }
    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
      lastVideoTime = video.currentTime;
      poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        for (const landmark of result.landmarks) {
          drawingUtils.drawLandmarks(landmark, {
            radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1)
          });
          drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
        }
        canvasCtx.restore();
  
        // Extract the pose landmarks and world landmarks and send them to Node.js server
        const landmarks = result.landmarks[0].map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
        const worldLandmarks = result.worldLandmarks[0].map(wlm => ({ x: wlm.x, y: wlm.y, z: wlm.z }));
  
        console.log('Sending pose data:', { landmarks, worldLandmarks });
  
        // Send pose data to Node.js server
        fetch('http://localhost:5000/send-pose-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            landmarks: landmarks,
            worldLandmarks: worldLandmarks
          })
        })
        .then(response => {
          if (!response.ok) {
            return response.text().then(text => {
              throw new Error(`HTTP error! status: ${response.status}, message: ${text}`);
            });
          }
          return response.json();
        })
        .then(data => {
          console.log('Pose data sent successfully:', data);
        })
        .catch((error) => {
          console.error('Error sending pose data:', error);
        });
      });
    }
  
    if (webcamRunning === true) {
      window.requestAnimationFrame(predictWebcam);
    }
  }
  