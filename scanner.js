
"use strict";

/* =========================================
   BOTANIIQ — PLANT SCANNER
   Teachable Machine + voice + plant information
   ========================================= */

const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/mIiK1Xitk/";

const CONFIDENCE_THRESHOLD = 0.70;
const REQUIRED_STABLE_PREDICTIONS = 3;

const DEFAULT_BENEFITS_MESSAGE =
    "Benefits will appear here if a plant is recognized.";


// ---------- PLANT INFORMATION ----------

const PLANT_INFO = {
    "tulsi (medicinal plant)": {
        displayName: "Tulsi",
        category: "Medicinal Plant",
        description:
            "Tulsi, also known as holy basil, is an aromatic herb commonly grown in India.",
        benefits: [
            "Traditionally used in herbal preparations.",
            "Contains plant compounds studied for antioxidant activity.",
            "Leaves are commonly used in traditional drinks and household preparations."
        ]
    },

    // Matches your exact Teachable Machine label:
    // Bryophyllum Pinnatum(Medicinal Plant)
    "bryophyllum pinnatum(medicinal plant)": {
        displayName: "Bryophyllum Pinnatum",
        category: "Medicinal Plant",
        description:
            "Bryophyllum pinnatum is a succulent plant known for producing tiny plantlets along the edges of its leaves.",
        benefits: [
            "Traditionally used in some folk-medicine systems.",
            "Contains plant compounds being studied for biological properties.",
            "Its leaf plantlets demonstrate vegetative reproduction."
        ]
    },

    "aloe vera (medicinal plant)": {
        displayName: "Aloe Vera",
        category: "Medicinal Plant",
        description:
            "Aloe vera is a succulent plant with thick, fleshy leaves containing a clear inner gel.",
        benefits: [
            "The gel is commonly used in skincare products.",
            "Certain aloe vera gel preparations have been studied for skin-related uses.",
            "It is widely grown as an ornamental and household plant."
        ]
    },

    "crab grass (weed)": {
        displayName: "Crab Grass",
        category: "Weed",
        description:
            "Crab grass is a spreading grass commonly found in lawns, gardens and open areas. It grows close to the ground and can spread outward. It is often considered a weed in lawns and cultivated fields."
    },

    "background / noise": {
        displayName: "Background / Noise",
        category: "Unrecognized",
        description:
            "This appears to be background or noise, not a recognized plant."
    }
};


// ---------- DOM ELEMENTS ----------

const startButton = document.getElementById("start-camera");
const stopButton = document.getElementById("stop-camera");
const uploadInput = document.getElementById("image-upload");
const speakButton = document.getElementById("speak-result");

const webcamContainer = document.getElementById("webcam-container");
const cameraPlaceholder = document.getElementById("camera-placeholder");
const uploadedPreview = document.getElementById("uploaded-preview");

const cameraStatus = document.getElementById("camera-status");
const scannerMessage = document.getElementById("scanner-message");

const resultEmpty = document.getElementById("result-empty");
const resultContent = document.getElementById("result-content");
const predictedName = document.getElementById("predicted-name");
const confidenceText = document.getElementById("confidence-text");
const confidenceFill = document.getElementById("confidence-fill");
const predictionList = document.getElementById("prediction-list");

const plantInfoTitle = document.getElementById("plant-info-title");
const plantInfoDescription =
    document.getElementById("plant-info-description");
const plantBenefits = document.getElementById("plant-benefits");


// ---------- STATE ----------

let model = null;
let webcam = null;
let webcamRunning = false;
let predictionBusy = false;
let animationFrame = null;

let latestPrediction = null;
let candidatePlant = "";
let candidateCount = 0;
let lastSpokenPlant = "";
let lastSpokenAt = 0;
let currentSession = 0;
let currentPreviewURL = null;


// ---------- HELPERS ----------

function normalizeName(name) {
    return String(name || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

function isBackgroundNoise(name) {
    const key = normalizeName(name);

    return (
        key === "background / noise" ||
        key === "background/noise" ||
        key === "background noise"
    );
}

function getPlantInfo(name) {
    const key = normalizeName(name);

    // First try an exact match.
    if (PLANT_INFO[key]) {
        return PLANT_INFO[key];
    }

    // Support small differences in Teachable Machine labels.
    if (key.includes("bryophyllum pinnatum")) {
        return PLANT_INFO[
            "bryophyllum pinnatum(medicinal plant)"
        ];
    }

    if (key.includes("tulsi")) {
        return PLANT_INFO["tulsi (medicinal plant)"];
    }

    if (key.includes("aloe vera")) {
        return PLANT_INFO["aloe vera (medicinal plant)"];
    }

    if (key.includes("crab grass")) {
        return PLANT_INFO["crab grass (weed)"];
    }

    return null;
}

function setMessage(message) {
    if (scannerMessage) {
        scannerMessage.textContent = message;
    }
}

function setStatus(message) {
    if (cameraStatus) {
        cameraStatus.textContent = message;
    }
}

function resetSpeechTracking() {
    candidatePlant = "";
    candidateCount = 0;
    lastSpokenPlant = "";
    lastSpokenAt = 0;

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
}

function releasePreviewURL() {
    if (currentPreviewURL) {
        URL.revokeObjectURL(currentPreviewURL);
        currentPreviewURL = null;
    }
}

function showDefaultBenefits() {
    if (!plantBenefits) return;

    plantBenefits.replaceChildren();

    const item = document.createElement("li");
    item.textContent = DEFAULT_BENEFITS_MESSAGE;

    plantBenefits.appendChild(item);
}


// ---------- PLANT INFORMATION DISPLAY ----------

function updatePlantInformation(className, confidence) {
    const info = getPlantInfo(className);
    const isConfident = confidence >= CONFIDENCE_THRESHOLD;

    // Default for weeds, noise, uncertain results and unknown classes.
    showDefaultBenefits();

    if (!isConfident) {
        if (plantInfoTitle) {
            plantInfoTitle.textContent = "Plant information";
        }

        if (plantInfoDescription) {
            plantInfoDescription.textContent =
                "Identify a plant to see its information.";
        }

        return;
    }

    if (isBackgroundNoise(className)) {
        if (plantInfoTitle) {
            plantInfoTitle.textContent = "Background / Noise";
        }

        if (plantInfoDescription) {
            plantInfoDescription.textContent =
                "This appears to be background or noise, not a recognized plant.";
        }

        return;
    }

    if (!info) {
        if (plantInfoTitle) {
            plantInfoTitle.textContent = "Plant information";
        }

        if (plantInfoDescription) {
            plantInfoDescription.textContent =
                "Information for this model category has not been added yet.";
        }

        return;
    }

    if (plantInfoTitle) {
        plantInfoTitle.textContent = info.displayName;
    }

    if (plantInfoDescription) {
        plantInfoDescription.textContent = info.description;
    }

    // Only medicinal plants have benefits.
    // Crab Grass has no benefits array.
    if (Array.isArray(info.benefits) && plantBenefits) {
        plantBenefits.replaceChildren();

        info.benefits.forEach(function (benefit) {
            const item = document.createElement("li");
            item.textContent = benefit;
            plantBenefits.appendChild(item);
        });
    }
}


// ---------- VOICE OUTPUT ----------

function speakText(message) {
    if (!("speechSynthesis" in window)) {
        setMessage(
            "Voice output is not supported in this browser."
        );
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);

    utterance.lang = "en-IN";
    utterance.rate = 0.9;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
}

function handleAutomaticSpeech(className, confidence, force) {
    if (confidence < CONFIDENCE_THRESHOLD) {
        candidatePlant = "";
        candidateCount = 0;
        return;
    }

    const now = Date.now();

    if (className !== candidatePlant) {
        candidatePlant = className;
        candidateCount = 1;
    } else {
        candidateCount++;
    }

    if (!force && candidateCount < REQUIRED_STABLE_PREDICTIONS) {
        return;
    }

    if (className === lastSpokenPlant) {
        return;
    }

    if (now - lastSpokenAt < 1500) {
        return;
    }

    const info = getPlantInfo(className);
    let message;

    if (isBackgroundNoise(className)) {
        message =
            "BotaniIQ detected background or noise. " +
            "No recognized plant was identified.";
    } else if (!info) {
        message =
            "BotaniIQ could not find information for this category.";
    } else {
        message =
            "BotaniIQ identifies this plant as " +
            info.displayName + ". " +
            "Confidence " + Math.round(confidence * 100) +
            " percent. " + info.description + " ";

        if (Array.isArray(info.benefits)) {
            message +=
                "Some information about its uses. " +
                info.benefits.slice(0, 2).join(". ") + ". " +
                "This is educational information, not medical advice.";
        }
    }

    lastSpokenPlant = className;
    lastSpokenAt = now;

    speakText(message);
}


// ---------- DISPLAY PREDICTIONS ----------

function showPredictions(predictions, forceSpeech = false) {
    if (!predictions || predictions.length === 0) {
        setMessage("No predictions were returned. Try another image.");
        return;
    }

    const sorted = [...predictions].sort(function (a, b) {
        return b.probability - a.probability;
    });

    const best = sorted[0];
    const confidence = best.probability;
    const percent = Math.round(confidence * 100);
    const info = getPlantInfo(best.className);

    latestPrediction = {
        name: best.className,
        confidence: confidence
    };

    if (resultEmpty) resultEmpty.hidden = true;
    if (resultContent) resultContent.hidden = false;

    if (confidence >= CONFIDENCE_THRESHOLD) {
        if (predictedName) {
            predictedName.textContent = isBackgroundNoise(best.className)
                ? "Background / Noise"
                : (info ? info.displayName : best.className);
        }

        if (confidenceText) {
            confidenceText.textContent =
                "Confidence: " + percent + "%";
        }

        if (isBackgroundNoise(best.className)) {
            setMessage(
                "Background or noise detected. No recognized plant identified."
            );
        } else if (info && info.category === "Weed") {
            setMessage("Weed identified.");
        } else {
            setMessage("Plant prediction updated.");
        }
    } else {
        if (predictedName) {
            predictedName.textContent = "Uncertain result";
        }

        if (confidenceText) {
            confidenceText.textContent =
                "Best match: " + best.className +
                " (" + percent + "%)";
        }

        setMessage(
            "The model is uncertain. Try a clearer photo with better lighting."
        );
    }

    if (confidenceFill) {
        confidenceFill.style.width = percent + "%";
    }

    // Show probabilities for every model class.
    if (predictionList) {
        predictionList.replaceChildren();

        sorted.forEach(function (prediction) {
            const row = document.createElement("div");
            row.className = "prediction-row";

            const top = document.createElement("div");
            top.className = "prediction-row-top";

            const name = document.createElement("span");
            const predictionInfo = getPlantInfo(prediction.className);

            name.textContent = isBackgroundNoise(prediction.className)
                ? "Background / Noise"
                : (predictionInfo
                    ? predictionInfo.displayName
                    : prediction.className);

            const value = document.createElement("span");
            value.textContent =
                Math.round(prediction.probability * 100) + "%";

            const track = document.createElement("div");
            track.className = "confidence-track";

            const fill = document.createElement("div");
            fill.className = "confidence-fill";

            fill.style.width =
                Math.max(
                    0,
                    Math.min(100, prediction.probability * 100)
                ) + "%";

            top.append(name, value);
            track.appendChild(fill);
            row.append(top, track);
            predictionList.appendChild(row);
        });
    }

    updatePlantInformation(best.className, confidence);

    handleAutomaticSpeech(
        best.className,
        confidence,
        forceSpeech
    );
}


// ---------- LOAD AI MODEL ----------

async function loadModel() {
    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = true;
    if (speakButton) speakButton.disabled = true;

    setStatus("Loading model...");
    setMessage("Connecting to your Teachable Machine model...");

    try {
        if (
            !MODEL_URL.startsWith("https://") ||
            MODEL_URL.includes("PASTE_YOUR_MODEL_URL_HERE")
        ) {
            throw new Error(
                "Replace MODEL_URL with your exported model URL."
            );
        }

        if (typeof tmImage === "undefined") {
            throw new Error(
                "Teachable Machine library did not load. Check scanner.html and your internet connection."
            );
        }

        const baseURL = MODEL_URL.endsWith("/")
            ? MODEL_URL
            : MODEL_URL + "/";

        model = await tmImage.load(
            baseURL + "model.json",
            baseURL + "metadata.json"
        );

        if (startButton) startButton.disabled = false;
        if (speakButton) speakButton.disabled = false;

        setStatus("Model ready");

        setMessage(
            "AI model loaded. Start the camera or upload a plant photo."
        );
    } catch (error) {
        console.error("BotaniIQ model loading error:", error);

        model = null;

        if (startButton) startButton.disabled = true;

        setStatus("Model failed to load");

        setMessage(
            "Could not load AI model: " +
            (error.message || "Unknown error") +
            " Check MODEL_URL, model files, and internet connection."
        );
    }
}


// ---------- CAMERA ----------

async function startCamera() {
    if (!model) {
        setMessage("Please wait until the AI model is ready.");
        return;
    }

    stopCamera();

    currentSession++;
    resetSpeechTracking();
    releasePreviewURL();

    if (uploadedPreview) {
        uploadedPreview.hidden = true;
        uploadedPreview.removeAttribute("src");
    }

    try {
        webcam = new tmImage.Webcam(320, 320, true);

        setMessage("Requesting camera permission...");
        setStatus("Starting camera...");

        await webcam.setup();
        await webcam.play();

        webcamRunning = true;

        if (webcamContainer) {
            webcamContainer.replaceChildren(webcam.canvas);
        }

        if (cameraPlaceholder) {
            cameraPlaceholder.hidden = true;
        }

        if (startButton) startButton.disabled = true;
        if (stopButton) stopButton.disabled = false;

        setStatus("Camera on");
        setMessage("Camera active. Point it at one plant.");

        webcam.update();

        animationFrame = requestAnimationFrame(predictLoop);
    } catch (error) {
        console.error("BotaniIQ camera error:", error);

        webcamRunning = false;

        if (webcam) {
            try {
                webcam.stop();
            } catch (cleanupError) {
                console.warn(cleanupError);
            }
        }

        webcam = null;

        if (webcamContainer) {
            webcamContainer.replaceChildren();
        }

        if (cameraPlaceholder) {
            cameraPlaceholder.hidden = false;
        }

        if (startButton) startButton.disabled = false;
        if (stopButton) stopButton.disabled = true;

        setStatus("Camera unavailable");

        setMessage(
            "Camera could not start. Allow camera permission or upload a photo instead."
        );
    }
}

async function predictLoop() {
    if (!webcamRunning || !webcam || predictionBusy) {
        if (webcamRunning) {
            animationFrame = requestAnimationFrame(predictLoop);
        }

        return;
    }

    predictionBusy = true;

    try {
        webcam.update();

        const predictions = await model.predict(webcam.canvas);

        if (webcamRunning) {
            showPredictions(predictions);
        }
    } catch (error) {
        console.error("BotaniIQ prediction error:", error);
        setMessage("Prediction failed. Please try again.");
    } finally {
        predictionBusy = false;

        if (webcamRunning) {
            animationFrame = requestAnimationFrame(predictLoop);
        }
    }
}

function stopCamera() {
    webcamRunning = false;

    if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    if (webcam) {
        try {
            webcam.stop();
        } catch (error) {
            console.warn("Camera cleanup error:", error);
        }
    }

    webcam = null;
    predictionBusy = false;

    if (webcamContainer) {
        webcamContainer.replaceChildren();
    }

    if (startButton) {
        startButton.disabled = !model;
    }

    if (stopButton) {
        stopButton.disabled = true;
    }

    if (cameraPlaceholder) {
        cameraPlaceholder.hidden =
            uploadedPreview ? !uploadedPreview.hidden : false;
    }

    if (cameraStatus && cameraStatus.textContent === "Camera on") {
        setStatus(model ? "Model ready" : "Loading model...");
    }
}


// ---------- UPLOAD PHOTO ----------

async function handleImageUpload(event) {
    const file = event.target.files &&
        event.target.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        setMessage("Please select a valid image file.");
        uploadInput.value = "";
        return;
    }

    if (!model) {
        setMessage("Wait for the AI model to load before uploading.");
        uploadInput.value = "";
        return;
    }

    stopCamera();

    currentSession++;
    resetSpeechTracking();
    releasePreviewURL();

    const sessionAtStart = currentSession;
    const objectURL = URL.createObjectURL(file);

    currentPreviewURL = objectURL;

    setStatus("Analyzing photo");
    setMessage("Analyzing your photo...");

    const image = new Image();

    image.onload = async function () {
        try {
            if (sessionAtStart !== currentSession) return;

            if (uploadedPreview) {
                uploadedPreview.src = objectURL;
                uploadedPreview.hidden = false;
            }

            if (cameraPlaceholder) {
                cameraPlaceholder.hidden = true;
            }

            const predictions = await model.predict(image);

            if (sessionAtStart !== currentSession) return;

            showPredictions(predictions, true);

            setStatus("Photo analyzed");
        } catch (error) {
            console.error("BotaniIQ image prediction error:", error);

            setStatus("Analysis failed");

            setMessage(
                "Could not analyze this photo. Please try another image."
            );
        } finally {
            if (uploadInput) uploadInput.value = "";
        }
    };

    image.onerror = function () {
        setStatus("Image error");

        setMessage(
            "Could not open this image. Please choose another."
        );

        releasePreviewURL();

        if (uploadInput) uploadInput.value = "";
    };

    image.src = objectURL;
}


// ---------- MANUAL SPEAK BUTTON ----------

function speakResult() {
    if (!latestPrediction) {
        setMessage("Identify a plant first.");
        return;
    }

    const name = latestPrediction.name;
    const confidence = latestPrediction.confidence;

    if (confidence < CONFIDENCE_THRESHOLD) {
        speakText(
            "BotaniIQ is uncertain about this result. " +
            "Please try another image."
        );

        return;
    }

    if (isBackgroundNoise(name)) {
        speakText(
            "BotaniIQ detected background or noise. " +
            "No recognized plant was identified."
        );

        return;
    }

    const info = getPlantInfo(name);

    if (!info) {
        speakText(
            "Information for this category is unavailable."
        );

        return;
    }

    let message =
        "BotaniIQ identifies this plant as " +
        info.displayName + ". " +
        info.description + " ";

    if (Array.isArray(info.benefits)) {
        message +=
            "Some information about its uses. " +
            info.benefits.slice(0, 2).join(". ") + ". " +
            "This is educational information, not medical advice.";
    }

    speakText(message);
}


// ---------- INITIALIZE ----------

function initializeScanner() {
    if (
        !startButton ||
        !stopButton ||
        !uploadInput ||
        !webcamContainer
    ) {
        console.error(
            "BotaniIQ: One or more required scanner HTML elements are missing."
        );

        setMessage(
            "Scanner setup error. Check the element IDs in scanner.html."
        );

        return;
    }

    startButton.addEventListener("click", startCamera);
    stopButton.addEventListener("click", stopCamera);
    uploadInput.addEventListener("change", handleImageUpload);

    if (speakButton) {
        speakButton.addEventListener("click", speakResult);
        speakButton.disabled = true;
    }

    stopButton.disabled = true;
    startButton.disabled = true;

    showDefaultBenefits();
    loadModel();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeScanner,
        { once: true }
    );
} else {
    initializeScanner();
}

window.addEventListener("pagehide", function () {
    stopCamera();

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    releasePreviewURL();
});
