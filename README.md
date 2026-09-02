# 손잇다 (SignBridge) — 실시간 AI 수어 영상통화 프로토타입

청각장애인(수어 사용자)과 비수어 사용자가 영상통화 안에서 통역사 없이 대화할 수 있도록 만드는
프로토타입입니다. 원본 개발계획서(`docs/plan_reference.md`)의 틀을 따르되, 실제 구현 우선순위는
아래 5가지 지시사항을 기준으로 잡았습니다.

## 이번 프로토타입에서 지킨 우선순위

1. **수어 → 문자 → TTS**: 웹캠으로 수어를 인식해 한국어 문장으로 바꾸고, 그 문장을 음성(TTS)으로
   출력합니다. → `frontend/js/signRecognizer.js`, `backend/app/refine.py`, 브라우저 `speechSynthesis`
2. **일반인 음성 → 수어 영상 재생 (아바타 X)**: 일반 사용자가 말하면 아바타를 그리지 않고, **실제로
   촬영해 둔 수어 영상 클립**을 이어 붙여 재생합니다. → `frontend/js/signPlayer.js`,
   `backend/app/sign_lookup.py`, `data/sign_clips/manifest.json`
3. **데이터는 직접 촬영이 기본, AIHub는 일상 대화에 필요한 것만 선별**: 자체 촬영 파이프라인
   (`frontend`의 "단어 등록" 모드)과, AIHub `수어 영상`(dataSetSn=103) 중 일상 대화 카테고리만
   골라내는 필터 스크립트를 함께 둡니다. → `data/daily_conversation_vocab.json`,
   `scripts/aihub_filter.py`
4. **수어→TTS 사이 ChatGPT로 문장 다듬기**: 인식된 단어(글로스) 나열을 그대로 TTS로 읽지 않고,
   ChatGPT API(`gpt-4o-mini` 등)로 자연스러운 한국어 문장으로 다듬은 뒤 TTS로 보냅니다.
   → `backend/app/refine.py`
5. 이 저장소 구조 자체가 PDF 계획서의 "시스템 구조"를 뼈대로 삼되, 위 1~4번을 실제로 동작하는
   코드로 우선 구현한 결과물입니다.

## 왜 이런 구조인가 (제약사항 반영)

- 실제 AIHub 데이터셋(수십 GB, 로그인 필요)과 GPU 학습 환경은 이 세션에서 접근할 수 없습니다.
  그래서 수어 인식은 "CNN+Transformer 완제품 모델"이 아니라, **직접 등록한 단어 템플릿과 실시간
  키포인트를 DTW(Dynamic Time Warping)로 비교하는 방식**으로 구현했습니다. 원리는 같습니다
  (관절 좌표 시퀀스 → 패턴 매칭 → 단어), 학습 데이터를 모으면 그대로 CNN/Transformer 분류기로
  교체할 수 있도록 인터페이스를 분리해 두었습니다 (`docs/ARCHITECTURE.md` 참고).
- 실제 수어 영상 촬영본이 없으므로, 반대 방향(음성→수어) 결과 화면은 `data/sign_clips/manifest.json`
  에 있는 자리표시자 클립을 재생합니다. 팀에서 촬영한 mp4를 같은 파일명으로 넣으면 바로
  실사용 영상으로 교체됩니다.

## 폴더 구조

```
backend/            FastAPI 서버 (ChatGPT 문장 다듬기, 수어 단어→영상 매칭 API)
frontend/           브라우저 프로토타입 (영상통화 UI, 수어 인식, 수어 영상 재생)
data/               일상 대화 어휘 목록, AIHub 매핑표, 수어 영상 클립 매니페스트
scripts/            AIHub 원본 데이터에서 "일상 대화"만 골라내는 전처리 스크립트
docs/               아키텍처 설명, 우선순위 매핑 문서
```

## 실행 방법

### 1) 백엔드 (ChatGPT 문장 다듬기 + 영상 매칭 API)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...   # 없으면 자동으로 규칙 기반 다듬기로 대체 동작
uvicorn app.main:app --reload --port 8000
```

### 2) 프론트엔드 (브라우저 프로토타입)

정적 파일이라 별도 빌드가 필요 없습니다.

```bash
cd frontend
python3 -m http.server 5500
```

브라우저에서 `http://localhost:5500` 접속 → 카메라/마이크 권한 허용.

- **왼쪽 화면 (수어 사용자)**: "단어 등록" 버튼으로 자주 쓰는 단어 3~5개(안녕하세요, 감사합니다,
  병원, 도와주세요, 네/아니오 등)를 직접 손동작으로 등록한 뒤, "인식 시작"을 누르면 실시간으로
  손 움직임을 캡처해 등록된 단어와 비교합니다. 인식된 단어들이 모이면 ChatGPT로 문장을 다듬고,
  자막 + 음성(TTS)으로 오른쪽 화면에 전달됩니다.
- **오른쪽 화면 (일반 사용자)**: 마이크 버튼을 눌러 말하면 브라우저 음성인식(STT)으로 문장을 얻고,
  ChatGPT로 다듬은 뒤 단어 단위로 쪼개 `data/sign_clips`의 영상을 순서대로 재생합니다.

## 다음 단계 (AIHub 데이터 반영 시)

`scripts/aihub_filter.py`에 AIHub `수어 영상`(dataSetSn=103) 다운로드 경로를 넣고 실행하면,
`data/daily_conversation_vocab.json`에 정의된 일상 대화 카테고리(인사, 병원, 관공서, 감정표현 등)에
해당하는 영상/키포인트 JSON만 별도 폴더로 골라냅니다. 이후 그 데이터로 CNN(공간 특징) +
Transformer(시간축 문맥) 분류기를 학습시켜, 지금의 DTW 템플릿 매칭기를 교체하면 계획서 6장의
"AI 추론 서버(수어 인식 모델)" 구조로 그대로 이어집니다.

실제 AIHub 배포본의 파일명 규칙, 디렉터리 구조, 키포인트 JSON 스키마(OpenPose 포맷: pose 25,
손 21×2, 얼굴 70)는 팀이 제공한 가이드라인 문서와 실제 샘플 파일로 검증해 `docs/aihub_reference.md`에
정리해 두었습니다. `scripts/aihub_keypoint_parse.py`는 그 실제 포맷을 읽어 지금 프로토타입의
DTW 인식기가 쓰는 벡터로 바로 변환하며, `data/aihub_samples/`의 실제 샘플로 동작을 확인했습니다.
