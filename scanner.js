
"use strict";

// =============================================
// BOTANI IQ — PLANT SCANNER
// =============================================

const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/mIiK1Xitk/";

const PLANT_THRESHOLD = 0.70;
const BACKGROUND_THRESHOLD = 0.80;
const REQUIRED_STABLE_CHECKS = 3;
const PREDICTION_INTERVAL = 250;

// =============================================
// ELEMENTS
// =============================================

const $ = (id) => document.getElementById(id);

const startButton = $("start-camera");
const stopButton = $("stop-camera");
const switchButton = $("switch-camera");
const imageUpload = $("image-upload");
const speakButton = $("speak-result");

const webcamContainer = $("webcam-container");
const cameraPlaceholder = $("camera-placeholder");
const uploadedPreview = $("uploaded-preview");

const cameraStatus = $("camera-status");
const scannerMessage = $("scanner-message");

const resultEmpty = $("result-empty");
const resultContent = $("result-content");

const predictedName = $("predicted-name");
const confidenceText = $("confidence-text");
const confidenceFill = $("confidence-fill");

const predictionList = $("prediction-list");
const predictionPlaceholder = $("prediction-placeholder");

const plantInfoTitle = $("plant-info-title");
const plantInfoDescription = $("plant-info-description");
const plantBenefits = $("plant-benefits");

// =============================================
// STATE
// =============================================

let model = null;
let mediaStream = null;
let video = null;

let cameraRunning = false;
let predictionInProgress = false;
let animationFrameId = null;
let lastPredictionTime = 0;

let cameraFacingMode = "environment";

let stablePlantName = "";
let stablePlantCount = 0;
let stableBackgroundCount = 0;
let lastDetectionState = "";

let currentPlantResult = null;
let uploadGeneration = 0;

// =============================================
// PLANT INFORMATION
// =============================================

const PLANT_DATA = {
    tulsi: {
        name: "Tulsi",
        description:
            "Tulsi, also known as holy basil, is an aromatic herb traditionally used in Indian households.",
        benefits: [
            "Traditionally used in herbal preparations.",
            "Contains naturally occurring plant compounds.",
            "Commonly grown in home gardens."
        ]
    },

    bryophyllum: {
        name: "Bryophyllum Pinnatum",
        description:
            "Bryophyllum pinnatum is a succulent plant known for its fleshy leaves and its ability to produce small plantlets along leaf margins.",
        benefits: [
            "Used in traditional herbal practices.",
            "Known for its distinctive leaf plantlets.",
            "Easy to propagate and grow."
        ]
    },

    aloe: {
        name: "Aloe Vera",
        description:
            "Aloe vera is a succulent plant with thick leaves containing a clear inner gel. It is widely used in skincare products.",
        benefits: [
            "Its gel is commonly used in skincare products.",
            "The plant stores water in its fleshy leaves.",
            "It is well suited to growing in containers."
        ]
    },

    crabgrass: {
        name: "Crab Grass",
        description:
            "Crab grass is a grass commonly found in lawns, gardens and disturbed ground. It can grow rapidly under suitable conditions.",
        benefits: [
            "Provides ground cover in suitable environments.",
            "Can be part of the diet of some grazing animals.",
            "Identifying it helps distinguish it from the target plants."
        ]
    }
};

// =============================================
// UTILITIES
// =============================================

function setMessage(message) {
    scannerMessage.textContent = message;
}

function setCameraStatus(message) {
    cameraStatus.textContent = message;
}

function normalizeName(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/[()[\]]/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function identifyClass(className) {
    const name = normalizeName(className);

    if (name.includes("background") || name.includes("noise")) {
        return { type: "background", key: null };
    }

    if (name.includes("bryophyllum")) {
        return { type: "plant", key: "bryophyllum" };
    }

    if (name.includes("aloe vera") || name === "aloe") {
        return { type: "plant", key: "aloe" };
    }

    if (name.includes("tulsi")) {
        return { type: "plant", key: "tulsi" };
    }

    if (name.includes("crab grass") || name.includes("crabgrass")) {
        return { type: "plant", key: "crabgrass" };
    }

    return { type: "unknown", key: null };
}

function resetStability() {
    stablePlantName = "";
    stablePlantCount = 0;
    stableBackgroundCount = 0;
}

function speechSupported() {
    return (
        "speechSynthesis" in window &&
        "SpeechSynthesisUtterance" in window
    );
}

// =============================================
// VOICE
// =============================================

function speakText(text) {
    if (!speechSupported() || !text) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
}

function speakNoPlantDetected() {
    if (lastDetectionState === "background") return;

    lastDetectionState = "background";

    speakText(
        "No plant detected. Please point the camera at a supported plant."
    );
}

function speakPlantAutomatically(plant, confidence) {
    if (lastDetectionState === plant.name) return;

    lastDetectionState = plant.name;

    const message =
        `${plant.name} detected. ` +
        `${plant.description} ` +
        `Confidence ${Math.round(confidence * 100)} percent. ` +
        `Additional information. ${plant.benefits.join(" ")}`;

    speakText(message);
}

// =============================================
// RESULT DISPLAY
// =============================================

function clearPlantResult() {
    currentPlantResult = null;

    resultEmpty.hidden = false;
    resultContent.hidden = true;

    predictedName.textContent = "Waiting for a prediction";
    confidenceText.textContent = "Confidence: --";
    confidenceFill.style.width = "0%";

    plantInfoTitle.textContent = "Plant information";
    plantInfoDescription.textContent =
        "Identify a plant to see its information.";

    plantBenefits.replaceChildren();

    speakButton.disabled = true;
}

function displayPlantResult(className, confidence) {
    const identification = identifyClass(className);

    if (
        identification.type !== "plant" ||
        !PLANT_DATA[identification.key]
    ) {
        return;
    }

    const plant = PLANT_DATA[identification.key];

    currentPlantResult = {
        name: plant.name,
        className,
        confidence,
        plant
    };

    resultEmpty.hidden = true;
    resultContent.hidden = false;

    predictedName.textContent = plant.name;

    confidenceText.textContent =
        `Confidence: ${Math.round(confidence * 100)}%`;

    confidenceFill.style.width =
        `${Math.round(confidence * 100)}%`;

    plantInfoTitle.textContent = plant.name;
    plantInfoDescription.textContent = plant.description;

    plantBenefits.replaceChildren();

    plant.benefits.forEach((benefit) => {
        const item = document.createElement("li");
        item.textContent = benefit;
        plantBenefits.appendChild(item);
    });

    speakButton.disabled = false;
}

// =============================================
// LIVE CONFIDENCE BARS
// =============================================

function showPredictions(predictions) {
    predictionPlaceholder.hidden = true;
    predictionList.replaceChildren();

    predictions.forEach((prediction) => {
        const percentage = Math.round(prediction.probability * 100);

        const item = document.createElement("div");
        item.className = "prediction-item";

        const label = document.createElement("span");
        label.className = "prediction-label";
        label.textContent = prediction.className;

        const score = document.createElement("span");
        score.className = "prediction-score";
        score.textContent = `${percentage}%`;

        const bar = document.createElement("div");
        bar.className = "prediction-bar";

        const fill = document.createElement("div");
        fill.className = "prediction-fill";
        fill.style.width = `${percentage}%`;

        bar.appendChild(fill);
        item.append(label, score, bar);

        predictionList.appendChild(item);
    });
}

// =============================================
// PREDICTION PROCESSING
// =============================================

function processPredictions(rawPredictions, source = "camera") {
    if (!rawPredictions || rawPredictions.length === 0) {
        return;
    }

    const predictions = [...rawPredictions].sort(
        (a, b) => b.probability - a.probability
    );

    showPredictions(predictions);

    // Identify the highest-scoring known plant independently.
    const plantPredictions = predictions.filter((prediction) => {
        return identifyClass(prediction.className).type === "plant";
    });

    const bestPlant = plantPredictions[0] || null;
    const bestOverall = predictions[0];

    const backgroundPrediction = predictions.find((prediction) => {
        return identifyClass(prediction.className).type === "background";
    });

    const plantConfidence = bestPlant
        ? bestPlant.probability
        : 0;

    const backgroundConfidence = backgroundPrediction
        ? backgroundPrediction.probability
        : 0;

    // CASE 1: A plant has strong confidence.
    // A strong plant prediction takes priority over background.

    if (bestPlant && plantConfidence >= PLANT_THRESHOLD) {
        stableBackgroundCount = 0;

        if (source === "image") {
            stablePlantName = bestPlant.className;
            stablePlantCount = REQUIRED_STABLE_CHECKS;
        } else if (stablePlantName === bestPlant.className) {
            stablePlantCount++;
        } else {
            stablePlantName = bestPlant.className;
            stablePlantCount = 1;
        }

        if (stablePlantCount >= REQUIRED_STABLE_CHECKS) {
            const identification = identifyClass(bestPlant.className);
            const plant = PLANT_DATA[identification.key];

            displayPlantResult(bestPlant.className, plantConfidence);

            setMessage(
                `${plant.name} detected. Confidence: ` +
                `${Math.round(plantConfidence * 100)}%.`
            );

            if (source === "camera") {
                speakPlantAutomatically(plant, plantConfidence);
            } else {
                lastDetectionState = plant.name;
            }
        } else {
            setMessage(
                `Checking plant prediction... ` +
                `${stablePlantCount}/${REQUIRED_STABLE_CHECKS}`
            );
        }

        return;
    }

    // CASE 2: Announce background only when background is
    // the top class, highly confident, and plant confidence
    // is low. Camera predictions must persist across checks.

    const backgroundIsTop =
        backgroundPrediction &&
        bestOverall.className === backgroundPrediction.className;

    const confidentlyBackground =
        backgroundIsTop &&
        backgroundConfidence >= BACKGROUND_THRESHOLD &&
        plantConfidence < 0.25;

    if (confidentlyBackground) {
        stablePlantName = "";
        stablePlantCount = 0;
        stableBackgroundCount++;

        setMessage(
            "Background detected. Point the camera at a supported plant."
        );

        if (
            source === "image" ||
            stableBackgroundCount >= REQUIRED_STABLE_CHECKS
        ) {
            speakNoPlantDetected();
        }

        return;
    }

    // CASE 3: Prediction is uncertain.
    // Do not announce "No plant detected".

    stablePlantName = "";
    stablePlantCount = 0;
    stableBackgroundCount = 0;

    if (bestPlant) {
        const identification = identifyClass(bestPlant.className);
        const plant = PLANT_DATA[identification.key];

        setMessage(
            `Possible ${plant.name} detected, but confidence is ` +
            `${Math.round(plantConfidence * 100)}%. ` +
            "Move closer and improve the lighting."
        );
    } else {
        setMessage(
            "Prediction uncertain. Point the camera clearly at a supported plant."
        );
    }
}

// =============================================
// LOAD AI MODEL
// =============================================

async function loadModel() {
    if (model) return model;

    if (typeof tmImage === "undefined") {
        throw new Error(
            "Teachable Machine library not loaded. Check scanner.html."
        );
    }

    setMessage("Loading BotaniIQ AI model...");

    model = await tmImage.load(
        MODEL_URL + "model.json",
        MODEL_URL + "metadata.json"
    );

    console.log(
        "[BotaniIQ] Model loaded:",
        model.getTotalClasses(),
        "classes"
    );

    return model;
}

// =============================================
// CAMERA
// =============================================

async function startCamera() {
    if (cameraRunning) return;

    try {
        await loadModel();

        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "Camera access requires HTTPS or localhost."
            );
        }

        setCameraStatus("Starting camera...");
        setMessage("Allow camera access if prompted.");

        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: { ideal: cameraFacingMode },
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });

        video = document.createElement("video");
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;

        video.srcObject = mediaStream;

        webcamContainer.replaceChildren(video);

        await video.play();

        cameraRunning = true;
        predictionInProgress = false;
        lastPredictionTime = 0;

        resetStability();
        lastDetectionState = "";

        uploadedPreview.hidden = true;
        cameraPlaceholder.hidden = true;

        clearPlantResult();

        startButton.disabled = true;
        stopButton.disabled = false;
        switchButton.disabled = false;

        setCameraStatus("Camera is active");
        setMessage("Point the camera at a supported plant.");

        animationFrameId = requestAnimationFrame(scanLoop);
    } catch (error) {
        console.error("[BotaniIQ] Camera error:", error);

        stopCamera();

        setCameraStatus("Camera unavailable");
        setMessage(
            `Unable to start the camera: ${error.message}`
        );
    }
}

// =============================================
// SCAN LOOP
// =============================================

async function scanLoop(timestamp) {
    if (!cameraRunning || !video) return;

    animationFrameId = requestAnimationFrame(scanLoop);

    if (
        predictionInProgress ||
        timestamp - lastPredictionTime < PREDICTION_INTERVAL ||
        video.readyState < 2
    ) {
        return;
    }

    predictionInProgress = true;
    lastPredictionTime = timestamp;

    try {
        const predictions = await model.predict(video);
        processPredictions(predictions, "camera");
    } catch (error) {
        console.error("[BotaniIQ] Prediction error:", error);
        setMessage("Could not analyze this frame. Try again.");
    } finally {
        predictionInProgress = false;
    }
}

// =============================================
// STOP CAMERA
// =============================================

function stopCamera() {
    cameraRunning = false;
    predictionInProgress = false;

    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
    }

    if (video) {
        video.pause();
        video.srcObject = null;
        video = null;
    }

    webcamContainer.replaceChildren();

    startButton.disabled = false;
    stopButton.disabled = true;
    switchButton.disabled = true;

    cameraPlaceholder.hidden = false;

    setCameraStatus("Camera stopped");

    if (speechSupported()) {
        window.speechSynthesis.cancel();
    }
}

// =============================================
// SWITCH CAMERA
// =============================================

async function switchCamera() {
    if (!cameraRunning) return;

    stopCamera();

    cameraFacingMode =
        cameraFacingMode === "environment"
            ? "user"
            : "environment";

    await startCamera();
}

// =============================================
// UPLOAD IMAGE
// =============================================

async function handleImageUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        setMessage("Please choose a valid image file.");
        event.target.value = "";
        return;
    }

    const generation = ++uploadGeneration;
    const imageURL = URL.createObjectURL(file);
    const image = new Image();

    resetStability();
    lastDetectionState = "";
    clearPlantResult();

    if (speechSupported()) {
        window.speechSynthesis.cancel();
    }

    uploadedPreview.hidden = true;
    setMessage("Loading uploaded image...");

    try {
        await loadModel();

        image.src = imageURL;

        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(
                new Error("Could not open the selected image.")
            );
        });

        if (generation !== uploadGeneration) return;

        uploadedPreview.src = imageURL;
        uploadedPreview.hidden = false;
        cameraPlaceholder.hidden = true;

        setMessage("Analyzing uploaded image...");

        const predictions = await model.predict(image);

        if (generation !== uploadGeneration) return;

        processPredictions(predictions, "image");
    } catch (error) {
        console.error("[BotaniIQ] Image error:", error);

        if (generation === uploadGeneration) {
            setMessage(
                `Could not analyze the image: ${error.message}`
            );
        }
    } finally {
        URL.revokeObjectURL(imageURL);
    }
}

// =============================================
// SPEAK BUTTON
// =============================================

function speakCurrentResult() {
    if (!currentPlantResult) {
        setMessage("Identify a supported plant before using Speak Result.");
        return;
    }

    const result = currentPlantResult;
    const plant = result.plant;

    speakText(
        `${plant.name}. ${plant.description} ` +
        `Confidence ${Math.round(result.confidence * 100)} percent. ` +
        `Additional information. ${plant.benefits.join(" ")}`
    );
}

// =============================================
// EVENTS
// =============================================

startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
switchButton.addEventListener("click", switchCamera);
imageUpload.addEventListener("change", handleImageUpload);
speakButton.addEventListener("click", speakCurrentResult);

// =============================================
// INITIALIZE
// =============================================

clearPlantResult();

stopButton.disabled = true;
switchButton.disabled = true;

setCameraStatus("Ready");
setMessage("Ready! Press Start Camera to begin.");

console.log("[BotaniIQ] Scanner initialized.");
