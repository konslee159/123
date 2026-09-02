/**
 * 우선순위 1번: 실시간 수어 인식.
 *
 * MediaPipe Hands(브라우저 CDN)로 손 랜드마크를 뽑아 슬라이딩 윈도우로
 * 버퍼링하고, 사용자가 직접 등록해 둔 "단어 템플릿"과 DTW로 비교해
 * 가장 가까운 단어를 실시간으로 인식한다.
 *
 * 실제 AIHub 데이터로 학습한 CNN+Transformer 분류기가 준비되면,
 * recognizeFrame()의 내부 구현만 그 모델 추론 호출로 바꾸면 된다.
 */

import { dtwDistance } from "./dtw.js";

const STORAGE_KEY = "signbridge_templates_v1";
const WINDOW_MS = 1400; // 한 단어 동작으로 볼 시간 창
const MATCH_THRESHOLD = 0.18; // 이 값보다 작아야 인식으로 인정 (경험적 값, 조정 가능)
const COOLDOWN_MS = 1200; // 같은 단어 연속 인식을 막는 최소 간격

function flattenLandmarks(handsLandmarks) {
  // handsLandmarks: [[{x,y,z}, ...21개], [{x,y,z}, ...21개]] (최대 2손)
  const wrist = handsLandmarks[0]?.[0];
  const vec = [];
  for (const hand of handsLandmarks.slice(0, 2)) {
    for (const pt of hand) {
      // 손목 기준 상대 좌표로 정규화 → 화면 내 위치가 달라져도 같은 동작으로 인식
      vec.push(pt.x - (wrist?.x ?? 0), pt.y - (wrist?.y ?? 0));
    }
  }
  return vec;
}

export class SignRecognizer {
  constructor() {
    this.templates = this._loadTemplates();
    this.buffer = []; // { t, vec }
    this.lastRecognizedAt = 0;
    this.onRecognized = null; // (gloss) => void
  }

  _loadTemplates() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  _saveTemplates() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.templates));
  }

  listTemplates() {
    return Object.keys(this.templates);
  }

  deleteTemplate(gloss) {
    delete this.templates[gloss];
    this._saveTemplates();
  }

  /** 등록 모드: recordBuffer(직전 WINDOW_MS 프레임들)를 gloss 이름으로 저장 */
  registerTemplate(gloss, recordedFrames) {
    if (!recordedFrames.length) return false;
    this.templates[gloss] = recordedFrames.map((f) => f.vec);
    this._saveTemplates();
    return true;
  }

  /** 매 프레임 호출: 손 랜드마크를 버퍼에 쌓고, 등록 모드일 땐 그대로 반환 */
  pushFrame(handsLandmarks) {
    if (!handsLandmarks || handsLandmarks.length === 0) return;
    const vec = flattenLandmarks(handsLandmarks);
    const now = performance.now();
    this.buffer.push({ t: now, vec });
    this.buffer = this.buffer.filter((f) => now - f.t <= WINDOW_MS);
  }

  getRecordableFrames() {
    return this.buffer.slice();
  }

  /** 인식 모드: 현재 버퍼를 템플릿들과 비교해 가장 유사한 단어를 찾는다 */
  tryRecognize() {
    const now = performance.now();
    if (now - this.lastRecognizedAt < COOLDOWN_MS) return null;
    if (this.buffer.length < 5) return null;

    const currentSeq = this.buffer.map((f) => f.vec);
    let best = null;
    let bestDist = Infinity;

    for (const [gloss, templateSeq] of Object.entries(this.templates)) {
      const dist = dtwDistance(templateSeq, currentSeq);
      if (dist < bestDist) {
        bestDist = dist;
        best = gloss;
      }
    }

    if (best !== null && bestDist < MATCH_THRESHOLD) {
      this.lastRecognizedAt = now;
      this.buffer = []; // 같은 동작이 중복 인식되지 않도록 버퍼 비움
      if (this.onRecognized) this.onRecognized(best);
      return { gloss: best, distance: bestDist };
    }
    return null;
  }
}
