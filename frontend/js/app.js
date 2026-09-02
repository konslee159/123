import { SignRecognizer } from "./signRecognizer.js";
import { SignPlayer } from "./signPlayer.js";

const API_BASE = "http://localhost:8000";

// ---------- DOM ----------
const signerVideo = document.getElementById("signerVideo");
const signerCanvas = document.getElementById("signerCanvas");
const canvasCtx = signerCanvas.getContext("2d");

const btnRegisterMode = document.getElementById("btnRegisterMode");
const btnStartRecognize = document.getElementById("btnStartRecognize");
const btnStopRecognize = document.getElementById("btnStopRecognize");
const registerBox = document.getElementById("registerBox");
const glossInput = document.getElementById("glossInput");
const btnRecordTemplate = document.getElementById("btnRecordTemplate");
const templateList = document.getElementById("templateList");

const glossStreamEl = document.getElementById("glossStream");
const refinedSentenceEl = document.getElementById("refinedSentence");

const btnMic = document.getElementById("btnMic");
const sttTextEl = document.getElementById("sttText");
const refinedForSignerEl = document.getElementById("refinedForSigner");
const signPlayerContainer = document.getElementById("signPlayerContainer");

document.getElementById("apiBaseLabel").textContent = API_BASE;

// ---------- 상태 ----------
const recognizer = new SignRecognizer();
const signPlayer = new SignPlayer(signPlayerContainer);

let recognizing = false;
let recognizeIntervalId = null;
let sentenceFlushTimeoutId = null;
let collectedGlosses = [];
let latestHandsLandmarks = null;
let isRecording = false;
let recordingFrames = [];

renderTemplateList();

// ---------- MediaPipe Hands 설정 ----------
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.5,
});
hands.onResults(onHandsResults);

function onHandsResults(results) {
  signerCanvas.width = signerVideo.videoWidth || 640;
  signerCanvas.height = signerVideo.videoHeight || 480;
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, signerCanvas.width, signerCanvas.height);

  const handsLandmarks = results.multiHandLandmarks || [];
  for (const landmarks of handsLandmarks) {
    drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, {
      color: "#4dd0e1",
      lineWidth: 2,
    });
    drawLandmarks(canvasCtx, landmarks, { color: "#ff8a65", radius: 2 });
  }
  canvasCtx.restore();

  latestHandsLandmarks = handsLandmarks;

  if (isRecording) {
    recordingFrames.push({ t: performance.now(), vec: flattenForRecording(handsLandmarks) });
  }
  if (recognizing) {
    recognizer.pushFrame(handsLandmarks);
  }
}

function flattenForRecording(handsLandmarks) {
  const wrist = handsLandmarks[0]?.[0];
  const vec = [];
  for (const hand of handsLandmarks.slice(0, 2)) {
    for (const pt of hand) vec.push(pt.x - (wrist?.x ?? 0), pt.y - (wrist?.y ?? 0));
  }
  return vec;
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  signerVideo.srcObject = stream;
  await signerVideo.play();

  const camera = new Camera(signerVideo, {
    onFrame: async () => {
      await hands.send({ image: signerVideo });
    },
    width: 640,
    height: 480,
  });
  camera.start();
}

startCamera().catch((err) => {
  console.error("카메라 접근 실패:", err);
  alert("카메라 권한을 허용해야 수어 인식 데모를 사용할 수 있습니다.");
});

// ---------- 단어 등록 모드 ----------
btnRegisterMode.addEventListener("click", () => {
  registerBox.classList.toggle("hidden");
});

btnRecordTemplate.addEventListener("click", () => {
  const gloss = glossInput.value.trim();
  if (!gloss) {
    alert("등록할 단어를 입력하세요.");
    return;
  }
  isRecording = true;
  recordingFrames = [];
  btnRecordTemplate.disabled = true;
  btnRecordTemplate.textContent = "녹화 중… (3초)";

  setTimeout(() => {
    isRecording = false;
    btnRecordTemplate.disabled = false;
    btnRecordTemplate.textContent = "3초간 손동작 녹화";

    const ok = recognizer.registerTemplate(gloss, recordingFrames);
    if (ok) {
      glossInput.value = "";
      renderTemplateList();
    } else {
      alert("손이 인식되지 않았습니다. 카메라 앞에서 다시 시도해주세요.");
    }
  }, 3000);
});

function renderTemplateList() {
  const templates = recognizer.listTemplates();
  templateList.innerHTML = "";
  if (templates.length === 0) {
    templateList.innerHTML = `<span style="color:#93a0b4;font-size:12px;">등록된 단어가 없습니다.</span>`;
    return;
  }
  for (const gloss of templates) {
    const chip = document.createElement("span");
    chip.className = "template-chip";
    chip.innerHTML = `${gloss} <button data-gloss="${gloss}">✕</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      recognizer.deleteTemplate(gloss);
      renderTemplateList();
    });
    templateList.appendChild(chip);
  }
}

// ---------- 인식 시작/중지 ----------
recognizer.onRecognized = (gloss) => {
  collectedGlosses.push(gloss);
  glossStreamEl.textContent = collectedGlosses.join(" · ");

  clearTimeout(sentenceFlushTimeoutId);
  sentenceFlushTimeoutId = setTimeout(flushSentence, 2200);
};

btnStartRecognize.addEventListener("click", () => {
  if (recognizer.listTemplates().length === 0) {
    alert("먼저 '단어 등록 모드'에서 손동작을 최소 1개 이상 등록해주세요.");
    return;
  }
  recognizing = true;
  btnStartRecognize.disabled = true;
  btnStopRecognize.disabled = false;
  recognizeIntervalId = setInterval(() => recognizer.tryRecognize(), 250);
});

btnStopRecognize.addEventListener("click", () => {
  recognizing = false;
  btnStartRecognize.disabled = false;
  btnStopRecognize.disabled = true;
  clearInterval(recognizeIntervalId);
});

async function flushSentence() {
  if (collectedGlosses.length === 0) return;
  const glosses = collectedGlosses.slice();
  collectedGlosses = [];

  try {
    const res = await fetch(`${API_BASE}/api/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ glosses }),
    });
    const data = await res.json();
    refinedSentenceEl.textContent = data.sentence || glosses.join(" ");
    speak(data.sentence || glosses.join(" "));
  } catch (err) {
    console.error("refine API 호출 실패:", err);
    const fallback = glosses.join(" ");
    refinedSentenceEl.textContent = fallback + " (⚠ 백엔드 미연결, 원문 그대로 표시)";
    speak(fallback);
  }
  glossStreamEl.textContent = "-";
}

function speak(text) {
  if (!text || !("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ko-KR";
  window.speechSynthesis.speak(utter);
}

// ---------- 오른쪽 패널: 음성 → 수어 영상 ----------
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let sttEngine = null;
let listening = false;

if (SpeechRecognitionCtor) {
  sttEngine = new SpeechRecognitionCtor();
  sttEngine.lang = "ko-KR";
  sttEngine.continuous = false;
  sttEngine.interimResults = true;

  sttEngine.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += transcript;
      else interim += transcript;
    }
    sttTextEl.textContent = final || interim || "-";
    if (final) handleFinalSpeech(final.trim());
  };

  sttEngine.onend = () => {
    listening = false;
    btnMic.textContent = "🎤 말하기 시작";
  };
} else {
  btnMic.disabled = true;
  btnMic.title = "이 브라우저는 음성 인식(Web Speech API)을 지원하지 않습니다. Chrome을 사용해주세요.";
}

btnMic.addEventListener("click", () => {
  if (!sttEngine) return;
  if (listening) {
    sttEngine.stop();
    return;
  }
  listening = true;
  btnMic.textContent = "⏹ 말하기 중지";
  sttEngine.start();
});

async function handleFinalSpeech(text) {
  let refined = text;
  try {
    // STT 문장도 (자막/기록 일관성을 위해) 같은 다듬기 API를 통과시킨다.
    const res = await fetch(`${API_BASE}/api/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ glosses: text.split(" ") }),
    });
    const data = await res.json();
    if (data.sentence) refined = data.sentence;
  } catch (err) {
    console.warn("refine API 미연결, 원문 사용:", err);
  }
  refinedForSignerEl.textContent = refined;

  try {
    const res = await fetch(`${API_BASE}/api/sign-lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: refined }),
    });
    const data = await res.json();
    if (data.matches && data.matches.length > 0) {
      signPlayer.enqueue(data.matches);
    } else {
      signPlayerContainer.innerHTML = `<div class="sign-placeholder">일치하는 등록 단어가 없습니다.<br/>(현재 사전: 안녕하세요/감사합니다/병원/도와주세요 등)</div>`;
    }
  } catch (err) {
    console.error("sign-lookup API 호출 실패:", err);
    signPlayerContainer.innerHTML = `<div class="sign-placeholder">⚠ 백엔드(8000)에 연결할 수 없습니다.</div>`;
  }
}
