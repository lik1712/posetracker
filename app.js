import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

// Convert __filename and __dirname to work with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 5000;

// Data Saving Flags
let isSavingPoseData = false;
let isSavingEmotionData = false;

// Data Directory
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    console.log('Creating data directory...');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Data directory created at: ${DATA_DIR}`);
}

const POSE_DATA_FILE = path.join(DATA_DIR, 'pose_data.json');
const EMOTION_DATA_FILE = path.join(DATA_DIR, 'emotion_data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// gRPC setup
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

// Toggle Data Saving Endpoint
app.post('/toggle-save-data', (req, res) => {
    const { type } = req.body;

    if (type === 'pose') {
        isSavingPoseData = !isSavingPoseData;
        console.log(isSavingPoseData ? 'Pose data saving started.' : 'Pose data saving stopped.');
        return res.json({
            message: isSavingPoseData ? 'Pose data saving started.' : 'Pose data saving stopped.',
            isSaving: isSavingPoseData,
        });
    } else if (type === 'emotion') {
        isSavingEmotionData = !isSavingEmotionData;
        console.log(isSavingEmotionData ? 'Emotion data saving started.' : 'Emotion data saving stopped.');
        return res.json({
            message: isSavingEmotionData ? 'Emotion data saving started.' : 'Emotion data saving stopped.',
            isSaving: isSavingEmotionData,
        });
    }
    return res.status(400).json({ error: 'Invalid data type. Use "pose" or "emotion".' });
});

// Serve specific @mediapipe/tasks-vision directory from node_modules
app.use('/libs/@mediapipe/tasks-vision', express.static(path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision')));
app.use('/libs/@mediapipe/tasks-vision/wasm', express.static(path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Save Pose Data Endpoint
app.post('/send-pose-data', (req, res) => {
    const { landmarks, worldLandmarks } = req.body;

    console.log('Pose data received:', req.body);

    if (!landmarks || !worldLandmarks || landmarks.length === 0 || worldLandmarks.length === 0) {
        console.warn('Invalid pose data');
        return res.status(400).send('Invalid pose data');
    }

    // Save Raw Pose Data Locally
    const poseDataToSave = {
        timestamp: new Date().toISOString(),
        rawLandmarks: landmarks,
        rawWorldLandmarks: worldLandmarks,
    };

    if (isSavingPoseData) {
        fs.appendFile(POSE_DATA_FILE, JSON.stringify(poseDataToSave) + '\n', (err) => {
            if (err) {
                console.error('Failed to save pose data:', err);
            } else {
                console.log('Pose data saved successfully.');
            }
        });
    }

    // Transform Pose Data for gRPC
    const poseDataForGrpc = {
      landmarks: landmarks.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z })),
      worldLandmarks: worldLandmarks.map((wlm) => ({ x: wlm.x, y: wlm.y, z: wlm.z })),
    };

    // Send to .NET via gRPC
    poseClient.SendPoseData(poseDataForGrpc, (err, response) => {
        if (err) {
            console.error('gRPC PoseService error:', err.details);
            return res.status(500).send('Error sending pose data');
        }
        console.log('Pose data sent successfully:', response.message);
        res.json(response.message);
    });
});

// Save Emotion Data Endpoint
const emotionMap = {
  neutral: 0,
  happy: 1,
  sad: 2,
  angry: 3,
  fearful: 4,
  disgusted: 5,
  surprised: 6
};

app.post('/send-face-expression-data', (req, res) => {
  const { faceData } = req.body;

  console.log('Emotion data received:', faceData);

  if (!faceData || !Array.isArray(faceData) || faceData.length === 0) {
      console.warn('Invalid face expression data');
      return res.status(400).json({ error: 'Invalid face expression data' });
  }

    const grpcFaceData = {
        expressions: faceData.map(face => ({
            emotion: emotionMap[face.expression.toLowerCase()] || 0,
            probability: face.probability
        }))
    };

    const emotionData = {
        timestamp: new Date().toISOString(),
        emotion: grpcFaceData.expressions
    };

    if (isSavingEmotionData) {
        fs.appendFile(EMOTION_DATA_FILE, JSON.stringify(emotionData) + '\n', (err) => {
            if (err) {
                console.error('Failed to save emotion data:', err);
            } else {
                console.log('Emotion data saved successfully.');
            }
        });
    }

    // Send to .NET via gRPC
    faceClient.SendFaceExpressionData(grpcFaceData, (err, response) => {
        if (err) {
            console.error('gRPC FaceService error:', err.details);
            return res.status(500).json({ error: 'Error sending face expression data' });
        }
        console.log('Emotion data sent successfully:', response.message);
        res.json(response.message);
    });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
