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

// Endpoint to receive face expression data from the frontend
app.post('/send-face-expression-data', express.json(), (req, res) => {
  const { faceData } = req.body;

  console.log('Face expression data received:', faceData);

  if (!faceData || !Array.isArray(faceData) || faceData.length === 0) {
    return res.status(400).send('Invalid face expression data');
  }

  const emotionMap = {
    neutral: 'FE_TYPE_NEUTRAL',
    happy: 'FE_TYPE_HAPPY',
    sad: 'FE_TYPE_SAD',
    angry: 'FE_TYPE_ANGRY',
    fearful: 'FE_TYPE_FEARFUL',
    disgusted: 'FE_TYPE_DISGUSTED',
    surprised: 'FE_TYPE_SURPRISED',
  };

  const grpcFaceData = {
    expressions: faceData
      .map((face, index) => {
        // Check if face is an object and has the required properties
        if (
          typeof face !== 'object' ||
          !face.expression ||
          typeof face.expression !== 'string' ||
          !('probability' in face) ||
          typeof face.probability !== 'number'
        ) {
          console.warn(`Invalid face data at index ${index}:`, face);
          return null; // Skip invalid data
        }

        // Map emotion to the corresponding enum value
        const emotionEnum = emotionMap[face.expression.toLowerCase()];
        if (!emotionEnum) {
          console.warn(`Unknown emotion at index ${index}: ${face.expression}`);
          return null; // Skip unknown emotions
        }

        return {
          emotion: emotionEnum, // Use the Protobuf enum value
          probability: face.probability,
        };
      })
      .filter(Boolean), // Remove any null values
  };

  if (grpcFaceData.expressions.length === 0) {
    return res.status(400).send('No valid face expressions to process');
  }

  faceClient.SendFaceExpressionData(grpcFaceData, (err, response) => {
    if (err) {
      console.error('gRPC FaceService error:', err.details);
      return res.status(500).send('Error sending face expression data');
    }
    console.log('Face expression data sent successfully. Response:', response.message);
    res.json({ message: response.message });
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
