/**
 * 우선순위 2번: 아바타 대신 "실제 촬영된 수어 영상 클립"을 순서대로 재생.
 *
 * data/sign_clips/에 실제 mp4가 없는 동안에는(팀이 아직 촬영 전이라면)
 * 텍스트 플레이스홀더 애니메이션으로 자동 대체해, UI 흐름은 그대로
 * 확인할 수 있게 한다. mp4가 준비되면 파일만 넣으면 자동으로 실제
 * 영상이 재생된다.
 */

const CLIPS_BASE_URL = "http://localhost:8000/clips";

export class SignPlayer {
  constructor(containerEl) {
    this.container = containerEl;
    this.queue = [];
    this.playing = false;
  }

  enqueue(matches) {
    this.queue.push(...matches);
    if (!this.playing) this._playNext();
  }

  _playNext() {
    const next = this.queue.shift();
    if (!next) {
      this.playing = false;
      this._renderIdle();
      return;
    }
    this.playing = true;
    this._playClip(next);
  }

  _renderIdle() {
    this.container.innerHTML = `<div class="sign-placeholder">수어 영상 대기 중…</div>`;
  }

  _playClip({ gloss, clip, clip_exists: clipExists }) {
    this.container.innerHTML = "";

    if (clipExists) {
      const video = document.createElement("video");
      video.src = `${CLIPS_BASE_URL}/${clip}`;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.className = "sign-clip-video";
      video.addEventListener("ended", () => this._playNext());
      video.addEventListener("error", () => this._playPlaceholder(gloss));
      this.container.appendChild(video);
    } else {
      this._playPlaceholder(gloss);
    }
  }

  _playPlaceholder(gloss) {
    // 실제 촬영본이 준비되기 전까지 쓰는 임시 대체 화면.
    const el = document.createElement("div");
    el.className = "sign-placeholder sign-placeholder-active";
    el.innerHTML = `
      <div class="sign-placeholder-hand">🤟</div>
      <div class="sign-placeholder-gloss">${gloss}</div>
      <div class="sign-placeholder-note">(실제 촬영 영상 준비 전 임시 화면)</div>
    `;
    this.container.appendChild(el);
    setTimeout(() => this._playNext(), 900);
  }
}
