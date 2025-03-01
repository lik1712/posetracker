import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
  } from '/libs/@mediapipe/tasks-vision/vision_bundle.mjs';
  
  const demosSection = document.getElementById("demos");
  
  let poseLandmarker;
  let runningMode = "VIDEO";
  let enableWebcamButton;
  let cameraSelect;
  let webcamRunning = false;
  let isSavingPoseData = false; 
  const videoHeight = "360px";
  const videoWidth = "480px";
 
  // Create PoseLandmarker instance
  const createPoseLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "http://localhost:5000/libs/@mediapipe/tasks-vision/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/models/pose_landmarker_full.task",
        delegate: "GPU"
      },
      runningMode: runningMode,
      numPoses: 1
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
  // Continuous pose detection from webcam.
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
        if (result.landmarks.length >0 ){
        
          // Extract the pose landmarks and world landmarks and send them to Node.js server
          const landmarks = result.landmarks[0].map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
          const worldLandmarks = result.worldLandmarks[0].map(wlm => ({ x: wlm.x, y: wlm.y, z: wlm.z }));
    
          // console.log('Sending pose data:', { landmarks, worldLandmarks });
    
          fetch("http://localhost:5000/send-pose-data", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ landmarks, worldLandmarks }),
          }).catch((err) => console.error("Error sending pose data:", err));      
        }
      });
    }
  
    if (webcamRunning === true) {
      window.requestAnimationFrame(predictWebcam);
    }
  }

// Toggle Pose Data Saving Button
const togglePoseSaveButton = document.getElementById('togglePoseSave');
togglePoseSaveButton.addEventListener('click', async () => {
  isSavingPoseData = !isSavingPoseData;
  togglePoseSaveButton.innerText = isSavingPoseData
    ? 'Stop Pose Data Saving'
    : 'Start Pose Data Saving';

  // Notify backend to toggle saving
  try {
    const response = await fetch('http://localhost:5000/toggle-save-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pose' }),
    });

    if (!response.ok) {
      throw new Error('Failed to toggle pose saving on server');
    }
    const result = await response.json();
    console.log(result.message);
  } catch (err) {
    console.error('Error toggling saving on server:', err);
  }
});

