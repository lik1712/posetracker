import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

// Convert __filename and __dirname to work with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 5000;

// gRPC setup for pose service
const POSE_PROTO_PATH = path.join(__dirname, 'protos', 'pose.proto');
const poseDefinition = protoLoader.loadSync(POSE_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const poseProto = grpc.loadPackageDefinition(poseDefinition).FSR.DigitalTwin.App.GRPC;
const poseClient = new poseProto.PoseService('localhost:5001', grpc.credentials.createInsecure());

// gRPC setup for face service
const FACE_PROTO_PATH = path.join(__dirname, 'protos', 'FaceService.proto');
const faceDefinition = protoLoader.loadSync(FACE_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const faceProto = grpc.loadPackageDefinition(faceDefinition).FSR.DigitalTwin.App.GRPC;
const faceClient = new faceProto.FaceService('localhost:5001', grpc.credentials.createInsecure());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve specific @mediapipe/tasks-vision directory from node_modules
app.use('/libs/@mediapipe/tasks-vision', express.static(path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision')));
app.use('/libs/@mediapipe/tasks-vision/wasm', express.static(path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint to receive pose data from script.js
app.post('/send-pose-data', express.json(), (req, res) => {
  const { landmarks, worldLandmarks } = req.body;

  console.log('Pose data received:', req.body);

  // Basic validation to ensure we have valid pose data
  if (!landmarks || !worldLandmarks || landmarks.length === 0 || worldLandmarks.length === 0) {
    return res.status(400).send('Invalid pose data');
  }

  // Prepare the pose data to send via gRPC
  const poseData = {
    landmarks: landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z })),
    worldLandmarks: worldLandmarks.map(wlm => ({ x: wlm.x, y: wlm.y, z: wlm.z }))
  };

  // Send pose data to the .NET server via gRPC
  poseClient.SendPoseData(poseData, (err, response) => {
    if (err) {
      console.error('gRPC PoseService error:', err.details);
      return res.status(500).send('Error sending pose data');
    }
    console.log('Pose data sent successfully:', response.message);
    res.json(response.message);
  });
});

const emotionMap = {
  neutral: 0, // FE_TYPE_NEUTRAL
  happy: 1,   // FE_TYPE_HAPPY
  sad: 2,     // FE_TYPE_SAD
  angry: 3,   // FE_TYPE_ANGRY
  fearful: 4, // FE_TYPE_FEARFUL
  disgusted: 5, // FE_TYPE_DISGUSTED
  surprised: 6 // FE_TYPE_SURPRISED
};

// Endpoint to receive face expression data from the frontend
app.post('/send-face-expression-data', express.json(), (req, res) => {
  const { faceData } = req.body;

  if (!faceData || !Array.isArray(faceData) || faceData.length === 0) {
      console.warn('Invalid face expression data: Empty or invalid structure');
      return res.status(400).json({ error: 'Invalid face expression data' });
  }

  const grpcFaceData = {
      expressions: faceData
          .map((face, index) => {
              if (!face || typeof face.expression !== 'string' || typeof face.probability !== 'number') {
                  console.warn(`Invalid face data at index ${index}:`, face);
                  return null;
              }

              const emotionKey = face.expression.toLowerCase().trim();

              const emotionEnum = emotionMap[emotionKey];
              if (emotionEnum === undefined) {
                  console.warn(`Unknown emotion at index ${index}: "${emotionKey}"`);
                  return null;
              }

              return {
                  emotion: emotionEnum,
                  probability: face.probability
              };
          })
          .filter(Boolean)
  };


  if (grpcFaceData.expressions.length === 0) {
      console.warn('No valid face expressions to process.');
      return res.status(400).json({ error: 'No valid face expressions to process' });
  }

  faceClient.SendFaceExpressionData(grpcFaceData, (err, response) => {
      if (err) {
          console.error('gRPC FaceService error:', err.details);
          return res.status(500).json({ error: 'Error sending face expression data' });
      }
      console.log('Face expression data sent successfully:', response.message);
      res.json({ message: response.message });
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
