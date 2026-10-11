
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/mIiK1Xitk/";

const PLANT_THRESHOLD = 0.85;
const REQUIRED_STABLE_CHECKS = 3;
const PREDICTION_INTERVAL = 250;

const PLANTS = {
    "Tulsi (Medicinal Plant)": {
        name: "Tulsi",
        title: "Tulsi",
        description:
            "Tulsi, also known as Holy Basil, is an aromatic plant widely used in traditional Indian practices.",
        benefits: [
            "Traditionally used in herbal preparations.",
            "Its leaves are used to prepare herbal tea.",
            "It is valued for its aromatic properties."
        ]
    },

    "Bryophyllum Pinnatum(Medicinal Plant)": {
        name: "Bryophyllum Pinnatum",
        title: "Bryophyllum Pinnatum",
        description:
            "Bryophyllum pinnatum is a succulent plant known for producing small plantlets along the edges of its leaves.",
        benefits: [
            "It is commonly grown as an ornamental succulent.",
            "Its distinctive leaves help in plant identification.",
            "It has a history of use in traditional herbal practices."
        ]
    },

    "Aloe Vera (Medicinal Plant)": {
        name: "Aloe Vera",
        title: "Aloe Vera",
        description:
            "Aloe vera is a succulent plant whose thick leaves contain a clear gel.",
        benefits: [
            "Aloe vera gel is commonly used in skincare products.",
            "The plant is well adapted to relatively dry conditions.",
            "It is a popular plant for home gardens."
        ]
    },

    "Crab Grass (Weed)": {
        name: "Crab Grass",
        title: "Crab Grass",
        description:
            "Crab grass is a fast-growing grass that commonly appears in lawns, gardens and disturbed soil.",
        benefits: [
            "It can provide ground cover in suitable environments.",
            "It is useful for learning about common weeds.",
            "Its growth can compete with cultivated plants for resources."
        ]
    }
};

// DOM ELEMENTS
const startCameraBtn = document.getElementById("start-camera");
const stopCameraBtn = document.getElementById("stop-camera");
const switchCameraBtn = document.getElementById("switch-camera");
const imageUpload = document.getElementById("image-upload");
const speakResultBtn = document.getElementById("speak-result");

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
const predictionPlaceholder = document.getElementById("prediction-placeholder");

const plantInfoTitle = document.getElementById("plant-info-title");
const plantInfoDescription = document.getElementById("plant-info-description");
const plantBenefits = document.getElementById("plant-benefits");

// STATE
let model = null;
let webcam = null;
let cameraStream = null;
let isRunning = false;
let isPredicting = false;
let isUsingFrontCamera = false;

let predictionTimer = null;
let stableLabel = null;
let stableCount = 0;

// Stores the last plant announced during the current camera session.
// Temporary low confidence will NOT clear this value.
let lastAnnouncedLabel = null;

// LOAD MODEL
async function loadModel() {
    if (model) return model;

    if (!window.tmImage) {
        throw new Error("Teachable Machine library has not loaded.");
    }

    model = await tmImage.load(
        MODEL_URL + "model.json",
        MODEL_URL + "metadata.json"
    );

    return model;
}

// CAMERA START
async function startCamera() {
    if (isRunning) return;

    try {
        setMessage("Loading plant recognition model...");
        cameraStatus.textContent = "Starting camera...";

        await loadModel();

        webcam = new tmImage.Webcam(400, 400, true);

        await webcam.setup({
            facingMode: isUsingFrontCamera ? "user" : "environment"
        });

        await webcam.play();

        cameraStream = webcam.webcam?.srcObject || null;

        webcamContainer.innerHTML = "";
        webcamContainer.appendChild(webcam.canvas);
        webcamContainer.style.display = "block";

        if (cameraPlaceholder) {
            cameraPlaceholder.style.display = "none";
        }

        if (uploadedPreview) {
            uploadedPreview.hidden = true;
        }

        isRunning = true;
        resetStability();

        // A new camera session can announce a plant again.
        lastAnnouncedLabel = null;

        startCameraBtn.disabled = true;
        stopCameraBtn.disabled = false;
        switchCameraBtn.disabled = false;

        cameraStatus.textContent = "Camera active";
        setMessage("Point the camera at a plant.");

        predictionTimer = setInterval(async () => {
            if (!isRunning || isPredicting || !webcam) return;

            isPredicting = true;

            try {
                webcam.update();
                await predictImage(webcam.canvas);
            } catch (error) {
                console.error("Prediction error:", error);
            } finally {
                isPredicting = false;
            }
        }, PREDICTION_INTERVAL);

    } catch (error) {
        console.error("Camera error:", error);

        cameraStatus.textContent = "Camera unavailable";

        stopCamera();

        if (error.name === "NotAllowedError") {
            setMessage("Camera permission was denied. Allow camera access in your browser settings.");
        } else if (error.name === "NotFoundError") {
            setMessage("No suitable camera was found on this device.");
        } else {
            setMessage("Unable to start the camera. Check permissions and try again.");
        }
    }
}

// CAMERA STOP
function stopCamera() {
    isRunning = false;
    isPredicting = false;

    if (predictionTimer) {
        clearInterval(predictionTimer);
        predictionTimer = null;
    }

    if (webcam) {
        try {
            webcam.stop();
        } catch (error) {
            console.warn("Webcam stop warning:", error);
        }

        webcam = null;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    if (webcamContainer) {
        webcamContainer.innerHTML = "";
        webcamContainer.style.display = "none";
    }

    if (cameraPlaceholder) {
        cameraPlaceholder.style.display = "grid";
    }

    if (uploadedPreview) {
        uploadedPreview.hidden = true;
    }

    startCameraBtn.disabled = false;
    stopCameraBtn.disabled = true;
    switchCameraBtn.disabled = true;

    cameraStatus.textContent = "Camera stopped";

    resetStability();

    // Intentionally preserve lastAnnouncedLabel until the next
    // camera session starts.
}

// SWITCH CAMERA
async function switchCamera() {
    if (!isRunning) return;

    isUsingFrontCamera = !isUsingFrontCamera;

    stopCamera();
    await startCamera();
}

// IMAGE UPLOAD
async function handleImageUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        setMessage("Please upload a valid image file.");
        imageUpload.value = "";
        return;
    }

    try {
        setMessage("Analyzing uploaded image...");

        await loadModel();

        const imageURL = URL.createObjectURL(file);
        const image = new Image();

        image.onload = async () => {
            try {
                stopCamera();

                if (uploadedPreview) {
                    uploadedPreview.src = imageURL;
                    uploadedPreview.hidden = false;
                }

                if (webcamContainer) {
                    webcamContainer.style.display = "none";
                }

                if (cameraPlaceholder) {
                    cameraPlaceholder.style.display = "none";
                }

                await predictImage(image, true);

            } catch (error) {
                console.error("Image analysis error:", error);
                setMessage("Could not analyze this image. Please try another.");
            } finally {
                URL.revokeObjectURL(imageURL);
                imageUpload.value = "";
            }
        };

        image.onerror = () => {
            URL.revokeObjectURL(imageURL);
            imageUpload.value = "";
            setMessage("Unable to open this image. Please try another.");
        };

        image.src = imageURL;

    } catch (error) {
        console.error("Image upload error:", error);
        setMessage("Unable to load the recognition model.");
        imageUpload.value = "";
    }
}

// PREDICT IMAGE
async function predictImage(image, isUploadedImage = false) {
    if (!model) await loadModel();

    const predictions = await model.predict(image);

    showPredictions(predictions);

    const bestPrediction = predictions.reduce((best, current) =>
        current.probability > best.probability ? current : best
    );

    const label = bestPrediction.className;
    const confidence = bestPrediction.probability;

    if (
        label === "Background / Noise" ||
        confidence < PLANT_THRESHOLD ||
        !PLANTS[label]
    ) {
        showBackgroundResult();

        if (isUploadedImage) {
            setMessage("No plant identified confidently. Try a clearer plant image.");
        } else {
            setMessage("No plant identified confidently. Keep the plant centered and try again.");
        }

        return;
    }

    if (isUploadedImage) {
        displayPlantResult(label, confidence);

        // An uploaded image announces its result once per upload.
        announcePlant(label);

        lastAnnouncedLabel = label;
        setMessage("Image analysis complete.");
        return;
    }

    if (stableLabel === label) {
        stableCount++;
    } else {
        stableLabel = label;
        stableCount = 1;
    }

    if (stableCount >= REQUIRED_STABLE_CHECKS) {
        displayPlantResult(label, confidence);

        // Speak only if the recognized plant differs from the
        // last plant announced in this camera session.
        if (lastAnnouncedLabel !== label) {
            announcePlant(label);
            lastAnnouncedLabel = label;
        }

        setMessage("Plant identified successfully.");
    }
}

// SHOW PREDICTION SCORES
function showPredictions(predictions) {
    if (!predictionList) return;

    predictionList.innerHTML = "";

    if (predictionPlaceholder) {
        predictionPlaceholder.hidden = true;
    }

    predictions
        .slice()
        .sort((a, b) => b.probability - a.probability)
        .forEach(prediction => {
            const item = document.createElement("div");
            item.className = "prediction-item";

            const label = document.createElement("span");
            label.className = "prediction-label";
            label.textContent = prediction.className;

            const percentage = document.createElement("span");
            percentage.className = "prediction-score";
            percentage.textContent =
                `${(prediction.probability * 100).toFixed(1)}%`;

            const bar = document.createElement("div");
            bar.className = "prediction-bar";

            const fill = document.createElement("div");
            fill.className = "prediction-bar-fill";
            fill.style.width =
                `${Math.min(100, prediction.probability * 100)}%`;

            bar.appendChild(fill);
            item.appendChild(label);
            item.appendChild(percentage);
            item.appendChild(bar);

            predictionList.appendChild(item);
        });
}

// DISPLAY PLANT RESULT
function displayPlantResult(label, confidence) {
    const plant = PLANTS[label];

    if (!plant) return;

    if (resultContent) {
        resultContent.hidden = false;
    }

    if (resultEmpty) {
        resultEmpty.hidden = true;
    }

    if (predictedName) {
        predictedName.textContent = plant.title;
    }

    if (confidenceText) {
        confidenceText.textContent =
            `${(confidence * 100).toFixed(1)}% confidence`;
    }

    if (confidenceFill) {
        confidenceFill.style.width =
            `${Math.min(100, confidence * 100)}%`;
    }

    if (plantInfoTitle) {
        plantInfoTitle.textContent = plant.title;
    }

    if (plantInfoDescription) {
        plantInfoDescription.textContent = plant.description;
    }

    if (plantBenefits) {
        plantBenefits.innerHTML = "";

        plant.benefits.forEach(benefit => {
            const li = document.createElement("li");
            li.textContent = benefit;
            plantBenefits.appendChild(li);
        });
    }

    if (speakResultBtn) {
        speakResultBtn.disabled = false;
    }
}

// BACKGROUND / LOW-CONFIDENCE RESULT
function showBackgroundResult() {
    if (resultEmpty) {
        resultEmpty.hidden = false;
    }

    if (resultContent) {
        resultContent.hidden = true;
    }

    if (speakResultBtn) {
        speakResultBtn.disabled = true;
    }

    // Reset consecutive prediction checks only.
    // Do NOT clear lastAnnouncedLabel here.
    resetStability();
}

// RESET STABILITY
function resetStability() {
    stableLabel = null;
    stableCount = 0;

    // Do not reset lastAnnouncedLabel in this function.
}

// STATUS MESSAGE
function setMessage(message) {
    if (scannerMessage) {
        scannerMessage.textContent = message;
    }
}

// ANNOUNCE PLANT NAME, DESCRIPTION AND BENEFITS
function announcePlant(label) {
    const plant = PLANTS[label];

    if (!plant) return;

    const benefitsText = plant.benefits.join(". ");

    const announcement =
        `BotaniIQ detected ${plant.name}. ` +
        `${plant.description} ` +
        `Additional information. ${benefitsText}`;

    speakAnnouncement(announcement);
}

// TEXT TO SPEECH
function speakAnnouncement(message) {
    if (!("speechSynthesis" in window)) {
        setMessage("Voice output is not supported by this browser.");
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "en-IN";
    utterance.rate = 0.9;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
}

// SPEAK CURRENT RESULT BUTTON
function speakCurrentResult() {
    if (!predictedName) return;

    const displayedTitle = predictedName.textContent.trim();

    const entry = Object.entries(PLANTS).find(
        ([, plant]) => plant.title === displayedTitle
    );

    if (entry) {
        // Manual button presses always speak the current result.
        announcePlant(entry[0]);
    }
}

// EVENT LISTENERS
if (startCameraBtn) {
    startCameraBtn.addEventListener("click", startCamera);
}

if (stopCameraBtn) {
    stopCameraBtn.addEventListener("click", stopCamera);
    stopCameraBtn.disabled = true;
}

if (switchCameraBtn) {
    switchCameraBtn.addEventListener("click", switchCamera);
    switchCameraBtn.disabled = true;
}

if (imageUpload) {
    imageUpload.addEventListener("change", handleImageUpload);
}

if (speakResultBtn) {
    speakResultBtn.addEventListener("click", speakCurrentResult);
    speakResultBtn.disabled = true;
}

// INITIAL STATE
if (resultContent) {
    resultContent.hidden = true;
}

if (resultEmpty) {
    resultEmpty.hidden = false;
}

if (webcamContainer) {
    webcamContainer.style.display = "none";
}

if (stopCameraBtn) {
    stopCameraBtn.disabled = true;
}

if (switchCameraBtn) {
    switchCameraBtn.disabled = true;
}

if (speakResultBtn) {
    speakResultBtn.disabled = true;
}

setMessage("Start the camera or upload a plant image to begin.");

