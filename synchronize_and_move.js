import fs from 'fs/promises';
import path from 'path';

// Define paths
const DATA_DIR = './data';
const OUTPUT_DIR = './data/actions';

// Ensure output directory exists
async function ensureDir(directory) {
    try {
        await fs.mkdir(directory, { recursive: true });
    } catch (err) {
        console.error(`Error creating directory ${directory}:`, err);
    }
}

// Load JSON data from a file
async function loadJSONFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return data.trim().split('\n').map(line => JSON.parse(line));
    } catch (err) {
        console.error(`Error reading file ${filePath}:`, err);
        return [];
    }
}

// Synchronize pose and emotion data
function synchronizeData(poseData, emotionData) {
    const synchronizedData = [];
    let poseIndex = 0;
    let emotionIndex = 0;

    while (poseIndex < poseData.length && emotionIndex < emotionData.length) {
        const pose = poseData[poseIndex];
        const emotion = emotionData[emotionIndex];

        const poseTime = new Date(pose.timestamp).getTime();
        const emotionTime = new Date(emotion.timestamp).getTime();

        if (Math.abs(poseTime - emotionTime) <= 500) { // 500ms tolerance
            synchronizedData.push({
                timestamp: pose.timestamp,
                pose: {
                    rawLandmarks: pose.rawLandmarks,
                    rawWorldLandmarks: pose.rawWorldLandmarks
                },
                emotion: emotion.emotion[0] || {}
            });
            poseIndex++;
            emotionIndex++;
        } else if (poseTime < emotionTime) {
            poseIndex++;
        } else {
            emotionIndex++;
        }
    }

    return synchronizedData;
}

// Save synchronized data to a new JSON file
async function saveSynchronizedData(actionFolder, synchronizedData) {
    const outputFilePath = path.join(OUTPUT_DIR, actionFolder, `action_${Date.now()}.json`);
    await ensureDir(path.dirname(outputFilePath));

    try {
        await fs.writeFile(outputFilePath, JSON.stringify(synchronizedData, null, 2));
        console.log(`Synchronized data saved to ${outputFilePath}`);
    } catch (err) {
        console.error(`Error saving synchronized data:`, err);
    }
}

// Main Function
async function main() {
    const action = process.argv[2];
    if (!action) {
        console.error('Please provide an action folder name (e.g., "standing")');
        process.exit(1);
    }

    const poseData = await loadJSONFile(path.join(DATA_DIR, 'pose_data.json'));
    const emotionData = await loadJSONFile(path.join(DATA_DIR, 'emotion_data.json'));

    if (poseData.length === 0 || emotionData.length === 0) {
        console.error('No pose or emotion data found.');
        process.exit(1);
    }

    const synchronizedData = synchronizeData(poseData, emotionData);
    if (synchronizedData.length === 0) {
        console.warn('No synchronized data found. Ensure timestamps are close enough.');
        return;
    }

    await saveSynchronizedData(action, synchronizedData);
}

main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
