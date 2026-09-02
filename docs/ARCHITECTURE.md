# 아키텍처 (프로토타입 기준)

```
[수어 사용자 브라우저]                          [일반 사용자 브라우저]
  webcam ──▶ MediaPipe Hands/Pose (JS, 클라이언트단 실시간 추론)
              │ 키포인트 시퀀스(관절 좌표)
              ▼
      DTW 템플릿 매칭기 (signRecognizer.js)
         - 직접 등록한 "일상 대화 단어" 템플릿과 비교
         - 추후 CNN+Transformer 분류기로 교체 가능한 인터페이스
              │ 인식된 단어(글로스) 나열
              ▼
   POST /api/refine  ───────────▶  FastAPI 백엔드 (backend/app/refine.py)
                                     - ChatGPT API로 자연스러운 문장으로 다듬기
                                     - 우선순위 4번
              ◀───────────────── 다듬어진 한국어 문장
              │
              ├─▶ 자막 표시 (본인 화면 확인용)
              └─▶ 상대방 화면으로 문장 전달 (데모: postMessage/BroadcastChannel,
                   실제 서비스: WebRTC DataChannel)
                        │
                        ▼
             상대 화면에서 speechSynthesis(TTS)로 읽어줌   ← 우선순위 1번 완료

──────────────────────────────────────────────────────────────────

  마이크 ──▶ Web Speech API (STT, 브라우저 내장)
              │ 인식된 문장
              ▼
   POST /api/refine (선택) ──▶ ChatGPT로 다듬기
              │ 최종 문장
              ▼
   POST /api/sign-lookup ──▶ FastAPI (backend/app/sign_lookup.py)
              │ 문장을 형태소 단위로 쪼개 data/daily_conversation_vocab.json에서
              │ 매칭되는 단어를 찾고, data/sign_clips/manifest.json의 영상 파일명을 반환
              ▼
   signPlayer.js가 반환된 영상 클립을 순서대로 재생 (아바타 X, 실촬영 영상 O) ← 우선순위 2번 완료
```

## 데이터 파이프라인 (우선순위 3번)

- **자체 촬영 기본값**: `frontend`의 "단어 등록" 모드로 팀이 직접 웹캠 앞에서 단어를 수행하면
  키포인트 시퀀스가 템플릿으로 저장됩니다. 실제 서비스 단계에서는 이렇게 모은 영상을
  `data/sign_clips/`에 넣고 `manifest.json`에 등록하면 반대 방향(음성→수어) 재생에 바로 쓰입니다.
- **AIHub는 "일상 대화"만**: AIHub 수어 영상(dataSetSn=103)은 수어문장 2,000종·단어 3,000종으로
  전체를 쓰기엔 이번 프로젝트 범위(병원/관공서/일상 인사 등 생활 밀착형 대화)에 비해 과합니다.
  `scripts/aihub_filter.py` + `data/daily_conversation_vocab.json`의 카테고리 목록으로 필요한
  카테고리만 골라 로컬 `data/aihub_filtered/`로 복사하고, 나머지는 내려받지 않거나 무시합니다.

## 다음 단계 (이번 프로토타입 범위 밖)

- 실시간 통신 서버(WebRTC signaling)로 실제 두 기기 간 영상통화 연결
- DTW 템플릿 매칭기 → AIHub 필터링 데이터로 학습한 CNN+Transformer 분류기로 교체
- 통화 로그 저장/요약(KoBART), 로그인/세션, 통합 DB (원본 계획서 4,7번 항목)
