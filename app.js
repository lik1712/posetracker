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

// gRPC setup: Load pose.proto and create a gRPC client
const PROTO_PATH = path.join(__dirname, 'protos','pose.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const poseProto = grpc.loadPackageDefinition(packageDefinition).FSR.DigitalTwin.App.GRPC;

// Create a gRPC client to communicate with the .NET server 
const grpcClient = new poseProto.PoseService('localhost:5001', grpc.credentials.createInsecure());

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
  // console.log("Sending pose data:", poseData);
  grpcClient.SendPoseData(poseData, (err, response) => {
    if (err) {
      console.error('gRPC call error:', err.details); 
      return res.status(500).send('Error sending pose data');
    }
    console.log('Pose data sent successfully, response:', response.message);
    res.json(response.message);
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
