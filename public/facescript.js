const video = document.getElementById('video')
const showBoundingBox = document.getElementById('showBoundingBox')
const showLandmarks = document.getElementById('showLandmarks')
const showAgeGender = document.getElementById('showAgeGender')
const showExpressions = document.getElementById('showExpressions')

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
  faceapi.nets.faceExpressionNet.loadFromUri('/models'),
  faceapi.nets.ageGenderNet.loadFromUri('/models')
]).then(startVideo)

function startVideo() {
  navigator.getUserMedia(
    { video: {} },
    stream => video.srcObject = stream,
    err => console.error('Error accessing webcam:', err)
  )
}

video.addEventListener('play', () => {
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const displaySize = { width: video.width, height: video.height }
  faceapi.matchDimensions(canvas, displaySize)

  setInterval(async () => {
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender()
    
    const resizedDetections = faceapi.resizeResults(detections, displaySize)
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)

    // Draw the face detection and landmarks based on checkbox state
    if (showBoundingBox.checked) {
      faceapi.draw.drawDetections(canvas, resizedDetections)
    }
    if (showLandmarks.checked) {
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)
    }
    if (showExpressions.checked) {
      faceapi.draw.drawFaceExpressions(canvas, resizedDetections)
    }
    
    // Draw age/gender label
    if (showAgeGender.checked) {
      resizedDetections.forEach(detection => {
        const box = detection.detection.box
        const drawBox = new faceapi.draw.DrawBox(box, {
          label: `${Math.round(detection.age)} years old, ${detection.gender}`
        })
        drawBox.draw(canvas)
      })
    }
  }, 1000 / 30) // 30 frames per second
})
