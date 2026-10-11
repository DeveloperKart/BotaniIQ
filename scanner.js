
"use strict";

/* ==========================================
   BOTANIIQ — ANDROID CAMERA DIAGNOSTIC FIX
   ========================================== */

const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/mIiK1Xitk/";

const CONFIDENCE_THRESHOLD = 0.70;
const CAMERA_TIMEOUT_MS = 12000;

const PLANT_INFO = {
    "tulsi (medicinal plant)": {
        name: "Tulsi",
        type: "Medicinal Plant",
        description:
            "Tulsi, also known as holy basil, is an aromatic herb commonly grown in India.",
        benefits: [
            "Traditionally used in herbal preparations.",
            "Contains plant compounds studied for antioxidant activity.",
            "Commonly used in traditional drinks and household preparations."
        ]
    },

    "bryophyllum pinnatum(medicinal plant)": {
        name: "Bryophyllum Pinnatum",
        type: "Medicinal Plant",
        description:
            "Bryophyllum pinnatum is a succulent plant known for producing tiny plantlets along the edges of its leaves.",
        benefits: [
            "Traditionally used in some folk-medicine systems.",
            "Contains plant compounds being studied for biological properties.",
            "Its leaf plantlets demonstrate vegetative reproduction."
        ]
    },

    "aloe vera (medicinal plant)": {
        name: "Aloe Vera",
        type: "Medicinal Plant",
        description:
            "Aloe vera is a succulent plant with thick, fleshy leaves containing a clear inner gel.",
        benefits: [
            "The gel is commonly used in skincare products.",
            "Some aloe vera gel preparations have been studied for skin-related uses.",
            "Widely grown as an ornamental and household plant."
        ]
    },

    "crab grass (weed)": {
        name: "Crab Grass",
        type: "Weed",
        description:
            "Crab grass is a spreading grass commonly found in lawns, gardens and open areas.",
        benefits: null
    },

    "background / noise": {
        name: "Background / Noise",
        type: "Unrecognized",
        description:
            "The model detected background or noise rather than a recognized plant.",
        benefits: null
    }
};


// ==========================================
// 1. HTML ELEMENTS
// ==========================================

const startButton = document.getElementById("start-camera");
const stopButton = document.getElementById("stop-camera");
const switchButton = document.getElementById("switch-camera");
const uploadInput = document.getElementById("image-upload");
const speakButton = document.getElementById("speak-result");

const webcamContainer = document.getElementById("webcam-container");
const cameraPlaceholder = document.getElementById("camera-placeholder");
const uploadedPreview = document.getElementById("uploaded-preview");

const scannerMessage = document.getElementById("scanner-message");
const cameraStatus = document.getElementById("camera-status");

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


// ==========================================
// 2. STATE
// ==========================================

let model = null;
let cameraStream = null;
let cameraVideo = null;

let cameraRunning = false;
let predictionBusy = false;
let animationFrame = null;

let cameraRequestId = 0;
let cameraFacingMode = "user";

let latestPrediction = null;
let currentObjectURL = null;
let imageRequestId = 0;

let lastAutoSpokenName = "";
let lastAutoSpokenTime = 0;
let stableName = "";
let stableCount = 0;


// ==========================================
// 3. GENERAL HELPERS
// ==========================================

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

function normalizeName(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function isNoise(name) {
    const key = normalizeName(name);

    return (
        key === "background / noise" ||
        key === "background/noise" ||
        key === "background noise"
    );
}

function getPlantInfo(className) {
    const key = normalizeName(className);

    if (PLANT_INFO[key]) {
        return PLANT_INFO[key];
    }

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

function releaseObjectURL() {
    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
    }
}

function resetSpeech() {
    stableName = "";
    stableCount = 0;
    lastAutoSpokenName = "";
    lastAutoSpokenTime = 0;

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
}


// ==========================================
// 4. PLANT INFORMATION
// ==========================================

function updatePlantInfo(className, confidence) {
    const info = getPlantInfo(className);

    if (plantInfoTitle) {
        plantInfoTitle.textContent = "Plant information";
    }

    if (plantInfoDescription) {
        plantInfoDescription.textContent =
            "Identify a plant to see its information.";
    }

    if (plantBenefits) {
        plantBenefits.replaceChildren();
    }

    if (confidence < CONFIDENCE_THRESHOLD) {
        return;
    }

    if (isNoise(className)) {
        if (plantInfoTitle) {
            plantInfoTitle.textContent = "Background / Noise";
        }

        if (plantInfoDescription) {
            plantInfoDescription.textContent =
                "Background or noise was detected. No recognized plant was identified.";
        }

        return;
    }

    if (!info) return;

    if (plantInfoTitle) {
        plantInfoTitle.textContent = info.name;
    }

    if (plantInfoDescription) {
        plantInfoDescription.textContent = info.description;
    }

    if (plantBenefits && info.benefits) {
        info.benefits.forEach(function (benefit) {
            const li = document.createElement("li");
            li.textContent = benefit;
            plantBenefits.appendChild(li);
        });
    }
}


// ==========================================
// 5. VOICE OUTPUT
// ==========================================

function speakText(text) {
    if (!("speechSynthesis" in window)) {
        setMessage("Voice output is unavailable in this browser.");
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.9;

    window.speechSynthesis.speak(utterance);
}

function automaticSpeech(className, confidence) {
    if (confidence < CONFIDENCE_THRESHOLD) {
        stableName = "";
        stableCount = 0;
        return;
    }

    if (className === stableName) {
        stableCount++;
    } else {
        stableName = className;
        stableCount = 1;
    }

    if (stableCount < 3) return;

    if (className === lastAutoSpokenName) return;

    if (Date.now() - lastAutoSpokenTime < 1500) return;

    lastAutoSpokenName = className;
    lastAutoSpokenTime = Date.now();

    if (isNoise(className)) {
        speakText(
            "BotaniIQ detected background or noise. No recognized plant was identified."
        );
        return;
    }

    const info = getPlantInfo(className);

    if (!info) return;

    let message =
        "BotaniIQ identifies this plant as " +
        info.name + ". " + info.description;

    if (info.benefits) {
        message +=
            " Some information about its uses. " +
            info.benefits.slice(0, 2).join(". ") +
            ". This is educational information, not medical advice.";
    }

    speakText(message);
}


// ==========================================
// 6. DISPLAY PREDICTIONS
// ==========================================

function showPredictions(predictions, speakImmediately = false) {
    if (!predictions || !predictions.length) {
        setMessage("No predictions received.");
        return;
    }

    const sorted = [...predictions].sort(
        (a, b) => b.probability - a.probability
    );

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

    if (predictedName) {
        if (confidence < CONFIDENCE_THRESHOLD) {
            predictedName.textContent = "Uncertain result";
        } else if (isNoise(best.className)) {
            predictedName.textContent = "Background / Noise";
        } else {
            predictedName.textContent =
                info ? info.name : best.className;
        }
    }

    if (confidenceText) {
        confidenceText.textContent =
            "Confidence: " + percent + "%";
    }

    if (confidenceFill) {
        confidenceFill.style.width =
            Math.max(0, Math.min(100, percent)) + "%";
    }

    if (confidence < CONFIDENCE_THRESHOLD) {
        setMessage(
            "Uncertain prediction. Try a clearer image with better lighting."
        );
    } else if (isNoise(best.className)) {
        setMessage(
            "Background or noise detected. No recognized plant identified."
        );
    } else {
        setMessage("Plant prediction updated.");
    }

    if (predictionList) {
        predictionList.replaceChildren();

        sorted.forEach(function (prediction) {
            const row = document.createElement("div");
            row.className = "prediction-row";

            const heading = document.createElement("div");
            heading.className = "prediction-row-top";

            const label = document.createElement("span");
            const predictionInfo = getPlantInfo(
                prediction.className
            );

            label.textContent = isNoise(prediction.className)
                ? "Background / Noise"
                : (
                    predictionInfo
                        ? predictionInfo.name
                        : prediction.className
                );

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

            heading.append(label, value);
            track.appendChild(fill);
            row.append(heading, track);
            predictionList.appendChild(row);
        });
    }

    updatePlantInfo(best.className, confidence);

    if (speakImmediately) {
        if (confidence >= CONFIDENCE_THRESHOLD) {
            if (isNoise(best.className)) {
                speakText(
                    "Background or noise detected. No recognized plant identified."
                );
            } else if (info) {
                speakText(
                    "BotaniIQ identifies this plant as " +
                    info.name + ". " + info.description
                );
            }
        }
    } else {
        automaticSpeech(best.className, confidence);
    }
}


// ==========================================
// 7. LOAD MODEL
// ==========================================

async function loadModel() {
    setStatus("Loading model...");
    setMessage("Loading BotaniIQ AI model...");

    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = true;
    if (switchButton) switchButton.disabled = true;
    if (speakButton) speakButton.disabled = true;

    try {
        if (typeof tmImage === "undefined") {
            throw new Error(
                "Teachable Machine library did not load. Check scanner.html."
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
            "Ready! Start the camera or upload a plant photo."
        );

    } catch (error) {
        console.error("Model loading failed:", error);

        setStatus("Model failed to load");
        setMessage(
            "Could not load the AI model. Check the model URL and internet connection."
        );
    }
}


// ==========================================
// 8. CAMERA TIMEOUT HELPER
// ==========================================

function getUserMediaWithTimeout(
    constraints,
    timeoutMs = CAMERA_TIMEOUT_MS
) {
    return new Promise(function (resolve, reject) {
        let finished = false;

        const timer = setTimeout(function () {
            finished = true;

            const error = new Error(
                "Camera request timed out."
            );

            error.name = "CameraTimeoutError";

            reject(error);
        }, timeoutMs);

        navigator.mediaDevices
            .getUserMedia(constraints)
            .then(function (stream) {
                if (finished) {
                    stream.getTracks().forEach(function (track) {
                        track.stop();
                    });
                    return;
                }

                finished = true;
                clearTimeout(timer);
                resolve(stream);
            })
            .catch(function (error) {
                if (finished) return;

                finished = true;
                clearTimeout(timer);
                reject(error);
            });
    });
}


// ==========================================
// 9. RELEASE CAMERA
// ==========================================

function releaseCameraTracks() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(function (track) {
            track.stop();
        });

        cameraStream = null;
    }

    if (cameraVideo) {
        cameraVideo.pause();
        cameraVideo.srcObject = null;
        cameraVideo.remove();
        cameraVideo = null;
    }
}

function stopCamera() {
    cameraRequestId++;
    cameraRunning = false;

    if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    releaseCameraTracks();

    predictionBusy = false;

    if (webcamContainer) {
        webcamContainer.replaceChildren();
    }

    if (startButton) {
        startButton.disabled = !model;
    }

    if (stopButton) stopButton.disabled = true;
    if (switchButton) switchButton.disabled = true;

    if (cameraPlaceholder) {
        cameraPlaceholder.hidden = false;
    }

    if (model) setStatus("Model ready");
}


// ==========================================
// 10. START FRONT CAMERA
// ==========================================

async function startCamera() {
    if (!model) {
        setMessage("Please wait for the AI model to load.");
        return;
    }

    // Stop any previous camera before beginning a new request.
    stopCamera();

    // This ID belongs only to this request.
    const requestId = ++cameraRequestId;

    imageRequestId++;
    resetSpeech();
    releaseObjectURL();

    if (uploadedPreview) {
        uploadedPreview.hidden = true;
        uploadedPreview.removeAttribute("src");
    }

    if (cameraPlaceholder) {
        cameraPlaceholder.hidden = true;
    }

    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;
    if (switchButton) switchButton.disabled = true;

    // Diagnostic: always request the FRONT camera here.
    cameraFacingMode = "user";

    console.log(
        "[BotaniIQ] Start Camera pressed. Requesting FRONT camera."
    );

    setStatus("Requesting front camera...");
    setMessage("Requesting FRONT camera...");

    try {
        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error(
                "Camera API unavailable. Open the HTTPS website in Chrome."
            );
        }

        // Explicitly request the FRONT camera.
        const stream = await getUserMediaWithTimeout({
            audio: false,
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });

        // If this request is no longer current, release the stream.
        if (requestId !== cameraRequestId) {
            stream.getTracks().forEach(function (track) {
                track.stop();
            });
            return;
        }

        cameraStream = stream;

        cameraVideo = document.createElement("video");
        cameraVideo.autoplay = true;
        cameraVideo.muted = true;
        cameraVideo.playsInline = true;

        cameraVideo.setAttribute("playsinline", "");
        cameraVideo.setAttribute("aria-label", "BotaniIQ live camera");

        cameraVideo.style.width = "100%";
        cameraVideo.style.height = "100%";
        cameraVideo.style.display = "block";
        cameraVideo.style.objectFit = "cover";

        webcamContainer.replaceChildren(cameraVideo);
        cameraVideo.srcObject = cameraStream;

        await cameraVideo.play();

        if (requestId !== cameraRequestId) {
            releaseCameraTracks();
            return;
        }

        cameraRunning = true;

        const videoTrack = cameraStream.getVideoTracks()[0];

        const settings = videoTrack &&
            videoTrack.getSettings
            ? videoTrack.getSettings()
            : {};

        console.log(
            "[BotaniIQ] Actual camera settings:",
            settings
        );

        if (settings.facingMode) {
            console.log(
                "[BotaniIQ] Browser reports facingMode:",
                settings.facingMode
            );
        }

        if (startButton) startButton.disabled = true;
        if (stopButton) stopButton.disabled = false;
        if (switchButton) switchButton.disabled = false;

        setStatus("Front camera active");
        setMessage(
            "Front camera active. Point it at one plant."
        );

        animationFrame = requestAnimationFrame(function () {
            predictionLoop(requestId);
        });

    } catch (error) {
        console.error(
            "[BotaniIQ] Front camera error:",
            error.name,
            error.message
        );

        if (requestId !== cameraRequestId) return;

        cameraRunning = false;
        releaseCameraTracks();

        if (webcamContainer) {
            webcamContainer.replaceChildren();
        }

        if (cameraPlaceholder) {
            cameraPlaceholder.hidden = false;
        }

        if (startButton) startButton.disabled = !model;
        if (stopButton) stopButton.disabled = true;
        if (switchButton) switchButton.disabled = true;

        setStatus("Camera unavailable");

        if (
            error.name === "NotAllowedError" ||
            error.name === "SecurityError"
        ) {
            setMessage(
                "Camera permission denied. Allow camera access in Android Chrome site settings."
            );
        } else if (
            error.name === "CameraTimeoutError"
        ) {
            setMessage(
                "Front camera request timed out. Check Chrome camera permission and close other apps using the camera."
            );
        } else if (error.name === "NotFoundError") {
            setMessage(
                "No camera was found. You can upload a plant photo instead."
            );
        } else if (error.name === "NotReadableError") {
            setMessage(
                "The camera may be busy. Close other camera apps and try again."
            );
        } else {
            setMessage(
                "Front camera failed: " +
                error.name +
                ". Check camera permission and reload the page."
            );
        }
    }
}


// ==========================================
// 11. SWITCH CAMERA
// ==========================================

async function switchCamera() {
    if (!model || !cameraRunning) return;

    // Stop the existing camera.
    stopCamera();

    // Select the opposite camera for the next request.
    cameraFacingMode =
        cameraFacingMode === "user"
            ? "environment"
            : "user";

    // This diagnostic build deliberately starts with the front camera.
    // Back-camera testing will be restored after front-camera testing.
    setMessage(
        "Camera switching is temporarily disabled for diagnosis. Start the front camera first."
    );

    console.log(
        "[BotaniIQ] Camera switch clicked. Requested mode:",
        cameraFacingMode
    );

    cameraFacingMode = "user";

    if (startButton) startButton.disabled = !model;
}


// ==========================================
// 12. LIVE PREDICTION
// ==========================================

async function predictionLoop(requestId) {
    if (
        !cameraRunning ||
        !cameraVideo ||
        requestId !== cameraRequestId
    ) {
        return;
    }

    if (
        cameraVideo.readyState <
        HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
        animationFrame = requestAnimationFrame(function () {
            predictionLoop(requestId);
        });
        return;
    }

    if (predictionBusy) {
        animationFrame = requestAnimationFrame(function () {
            predictionLoop(requestId);
        });
        return;
    }

    predictionBusy = true;

    try {
        const predictions = await model.predict(cameraVideo);

        if (
            cameraRunning &&
            requestId === cameraRequestId
        ) {
            showPredictions(predictions);
        }
    } catch (error) {
        console.error("Prediction failed:", error);

        if (requestId === cameraRequestId) {
            setMessage("Prediction failed. Try again.");
        }
    } finally {
        predictionBusy = false;

        if (
            cameraRunning &&
            requestId === cameraRequestId
        ) {
            animationFrame = requestAnimationFrame(function () {
                predictionLoop(requestId);
            });
        }
    }
}


// ==========================================
// 13. UPLOAD PHOTO
// ==========================================

async function handleImageUpload(event) {
    const file = event.target.files &&
        event.target.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        setMessage("Please choose a valid image file.");
        uploadInput.value = "";
        return;
    }

    if (!model) {
        setMessage("Wait for the AI model to load first.");
        uploadInput.value = "";
        return;
    }

    stopCamera();
    resetSpeech();

    const requestId = ++imageRequestId;

    releaseObjectURL();

    const objectURL = URL.createObjectURL(file);
    currentObjectURL = objectURL;

    const image = new Image();

    setStatus("Analyzing photo");
    setMessage("Analyzing the uploaded photo...");

    image.onload = async function () {
        try {
            if (requestId !== imageRequestId) return;

            if (uploadedPreview) {
                uploadedPreview.src = objectURL;
                uploadedPreview.hidden = false;
            }

            if (cameraPlaceholder) {
                cameraPlaceholder.hidden = true;
            }

            const predictions = await model.predict(image);

            if (requestId !== imageRequestId) return;

            showPredictions(predictions, true);
            setStatus("Photo analyzed");

        } catch (error) {
            console.error("Image analysis failed:", error);

            if (requestId === imageRequestId) {
                setStatus("Analysis failed");
                setMessage(
                    "Could not analyze the photo. Try another image."
                );
            }
        } finally {
            uploadInput.value = "";
        }
    };

    image.onerror = function () {
        if (requestId !== imageRequestId) return;

        setStatus("Image error");
        setMessage("Could not open this image. Choose another.");
        releaseObjectURL();
        uploadInput.value = "";
    };

    image.src = objectURL;
}


// ==========================================
// 14. MANUAL VOICE BUTTON
// ==========================================

function speakResult() {
    if (!latestPrediction) {
        setMessage("Identify a plant first.");
        return;
    }

    const name = latestPrediction.name;
    const confidence = latestPrediction.confidence;

    if (confidence < CONFIDENCE_THRESHOLD) {
        speakText(
            "BotaniIQ is uncertain about this result. Try another image."
        );
        return;
    }

    if (isNoise(name)) {
        speakText(
            "Background or noise detected. No recognized plant identified."
        );
        return;
    }

    const info = getPlantInfo(name);

    if (!info) {
        speakText("Plant information is unavailable.");
        return;
    }

    let message = info.name + ". " + info.description;

    if (info.benefits) {
        message += " " + info.benefits.slice(0, 2).join(". ");
    }

    message += " This is educational information, not medical advice.";

    speakText(message);
}


// ==========================================
// 15. INITIALIZE
// ==========================================

function initializeScanner() {
    if (
        !startButton ||
        !stopButton ||
        !uploadInput ||
        !webcamContainer
    ) {
        console.error(
            "[BotaniIQ] Required scanner HTML elements are missing."
        );

        setMessage(
            "Scanner setup error. Check the IDs in scanner.html."
        );

        return;
    }

    startButton.type = "button";
    stopButton.type = "button";

    if (switchButton) {
        switchButton.type = "button";
    }

    if (speakButton) {
        speakButton.type = "button";
    }

    startButton.addEventListener("click", function (event) {
        event.preventDefault();
        startCamera();
    });

    stopButton.addEventListener("click", function (event) {
        event.preventDefault();
        stopCamera();
    });

    if (switchButton) {
        switchButton.addEventListener("click", function (event) {
            event.preventDefault();
            switchCamera();
        });

        switchButton.disabled = true;
    }

    uploadInput.addEventListener(
        "change",
        handleImageUpload
    );

    if (speakButton) {
        speakButton.addEventListener(
            "click",
            speakResult
        );

        speakButton.disabled = true;
    }

    stopButton.disabled = true;
    startButton.disabled = true;

    if (cameraPlaceholder) {
        cameraPlaceholder.hidden = false;
    }

    console.log(
        "[BotaniIQ] Diagnostic scanner loaded. Default camera: FRONT."
    );

    loadModel();
}


// ==========================================
// 16. CLEANUP
// ==========================================

window.addEventListener("pagehide", function () {
    stopCamera();

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    releaseObjectURL();
});

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeScanner,
        { once: true }
    );
} else {
    initializeScanner();
}
