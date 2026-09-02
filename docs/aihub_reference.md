# AIHub 수어영상 AI 데이터 참고 (실제 가이드라인/샘플 기반)

사용자가 제공한 "인공지능 데이터 구축·활용 가이드라인 - 수어영상 AI 데이터 구축 분야"와
실제 AIHub 샘플 파일(`NIA_SL_WORD1501_REAL01_D_000000000000_keypoints.json`)을 바탕으로
정리한, 이번 프로토타입이 참고하는 실제 데이터셋 사실관계입니다.

## 데이터 규모 및 구성 (dataSetSn=103)

| 수집방법 | 구분 | 개수 | 클립 수 |
|---|---|---|---|
| 직접촬영 (나사렛대) | 단어 | 3,000 | 300,000 (20명 × 5각도) |
| 직접촬영 | 문장 | 2,000 | 200,000 (20명 × 5각도) |
| 가상데이터 (아바타, EQ4ALL) | 단어 | 2,000 | 10,000 |
| 가상데이터 | 문장 | 1,000 | 5,000 |
| 크라우드소싱 (aiWorks) | 지숫자 | 200 | 4,200 |
| 크라우드소싱 | 지문자 | 800 | 16,800 |
| **합계** | | | **536,000 클립** |

- 도메인은 "길찾기/교통/주소"로 명확히 한정됨 (예: 서울교통공사, T-Map 협조 자료 기반).
  → 우리 프로젝트의 "일상 대화" 초점과는 다른 도메인이므로, 그대로 쓰기보다
    `data/daily_conversation_vocab.json`의 카테고리로 다시 선별해야 함(우선순위 3번).
- 언어제공자는 19세 이상, 한국수어를 제1언어로 쓰는 농인(초·중·고 농학교 졸업)만 참여.

## 파일 구조 (실제 배포본)

디렉터리: 대분류(REAL/SYN/CROWD) / 중분류(SEN/WORD/FS) / 소분류(keypoint/morpheme/video)

```
NIA_SL_WORD1501_REAL01_D.mp4                          # 단어 1501, 직접촬영 1번 제공자, 정면하단 각도
NIA_SL_WORD1501_REAL01_D_morpheme.json                # 형태소/비수지 구간 라벨
NIA_SL_WORD1501_REAL01_D_000000000000_keypoints.json  # 0번째 프레임의 키포인트(OpenPose 포맷)
```

촬영 각도 5종: F(정면) / U(정면상단) / D(정면하단) / R(우측면) / L(좌측면).
크라우드소싱(지화)은 단방향 촬영이라 F만 존재.

## 키포인트 JSON 스키마 (OpenPose 확장, 실제 예시로 검증함)

`data/aihub_samples/NIA_SL_WORD1501_REAL01_D_000000000000_keypoints.json`에 실제 샘플이 있습니다.

- `people.pose_keypoints_2d` — 25개 관절 × (x, y, confidence)
- `people.hand_left_keypoints_2d` / `hand_right_keypoints_2d` — 각 21개 관절 × (x, y, confidence)
- `people.face_keypoints_2d` — 70개 관절 × (x, y, confidence)
- 위 4개의 `_3d` 버전 + `camparam`(카메라 파라미터, 5각도 멀티캠 보정용)

`scripts/aihub_keypoint_parse.py`가 이 포맷을 읽어 `frontend/js/signRecognizer.js`와 동일한
"손목 기준 상대좌표, 양손 21포인트씩" 벡터로 변환합니다 — 즉 실제 AIHub 데이터가 준비되면
지금의 DTW 템플릿을 이 벡터들로 그대로 대체하거나, 이 벡터들로 CNN+Transformer를 학습시켜
`signRecognizer.js`의 추론 로직만 서버 API 호출로 바꾸면 됩니다.

## 형태소/비수지 라벨 JSON 스키마

```json
{
  "metaData": {"url": "...mp4", "duration": 5.117, "exportedOn": "2020/12/10"},
  "data": [
    {"start": 1.517, "end": 3.364,
     "attributes": [{"name": "돈얼마", "attribute": ["1형태소 의문사 있는 의문형"]}]}
  ]
}
```

`name`이 곧 우리 `daily_conversation_vocab.json`의 `gloss`에 해당합니다. `attribute`는 비수지
요소(표정·고개짓 등)로, 이번 프로토타입 범위에서는 사용하지 않습니다(다음 단계 항목).

## 이번 프로토타입 반영 사항

1. `scripts/aihub_filter.py` — 위 실제 파일명 규칙과 디렉터리 구조를 문서화하고, 실제 배포본을
   받았을 때 "일상 대화" 카테고리만 골라내는 필터 로직의 전제로 사용.
2. `scripts/aihub_keypoint_parse.py` — 실제 keypoints.json → 우리 인식기 벡터 포맷 변환기.
   실제 샘플 파일로 동작 검증 완료 (프레임당 84차원 벡터: 양손 21포인트 × (x,y)).
3. `scripts/extract_keypoints_from_video.py` — mp4 원본 영상에서 MediaPipe HandLandmarker로
   손 키포인트 "시퀀스"를 직접 추출해 DTW 템플릿을 만드는 오프라인 스크립트. 키포인트 JSON이
   프레임 1장뿐이라 템플릿을 못 만드는 경우에도, mp4만 있으면 이 스크립트로 대체 가능. 사용자가
   제공한 실제 샘플(`NIA_SL_WORD1501_REAL01_D.mp4`)로 139프레임 시퀀스 추출까지 검증 완료.

## 실제 문장(SEN) 라벨 20,000개 분석 결과 (우선순위 3번 검증)

사용자가 제공한 `01_real_sen_morpheme.zip`(AIHub 문장 형태소 라벨, 제공자 17/18 × 문장 2,000개 ×
카메라 5각도 = 라벨 파일 20,000개)을 `scripts/aihub_gloss_stats.py`로 분석했습니다. 결과는
`data/aihub_real_sen_gloss_stats.json`에 저장되어 있습니다.

- 문장 2,000개에서 **고유 글로스(단어) 319개**가 등장합니다.
- 최빈 단어는 예상대로 "길찾기/교통/주소" 도메인 어휘입니다: `곳`(5,370), `다음`(4,000),
  `내리다`(3,485), `도착`(2,550), `지하철`(1,100), `버스`(820), `택시`(350) 등.
- 그런데 **일상 대화/긴급상황 관련 글로스도 실제로 존재**합니다 — 이전 문서에서 "원본은 길찾기
  도메인이라 없을 수 있다"고 적었던 우려가 부분적으로는 틀렸습니다:

  | 글로스 | 빈도 | 비고 |
  |---|---|---|
  | 은행 | 280 | 관공서/행정 |
  | 경찰 | 240 | 긴급상황 |
  | 병원 | 220 | 병원/건강 |
  | 119 | 210 | 긴급상황 |
  | 응급실 | 100 | 병원/건강 |
  | 화장실 | 60 | 일상표현 |
  | 도와주다 | 30 | 긴급상황 (사전형; "도와주세요"의 원형) |
  | 아프다 | 20 | 병원/건강 (사전형; "아파요"의 원형) |
  | 안녕하세요 | 10 | 인사/일상표현 |
  | 감사합니다 | 10 | 인사/일상표현 |

- 이 10개 글로스 중 하나 이상을 포함하는 문장은 **118개**(`SEN0203`, `SEN0276`, `SEN0301`,
  `SEN0354`(안녕하세요), `SEN0355`(감사합니다) 등) — `data/aihub_real_sen_gloss_stats.json`의
  `daily_conversation_relevant_sentences`에 문장 ID별로 전체 목록이 있습니다.
- `data/daily_conversation_vocab.json`에 이 6개 확정 어휘(경찰/119/응급실/은행/도와주다/아프다)를
  `confirmed_in_aihub_real_sen_sample: true`로 표시해 추가했습니다. AIHub 데이터가 실제로 더
  확보되면, 이 문장 ID들(그리고 대응하는 mp4/keypoints)만 받아서 `scripts/aihub_filter.py` 없이도
  바로 `scripts/extract_keypoints_from_video.py`로 템플릿을 만들 수 있습니다.

정리하면: 원본 AIHub 데이터는 여전히 "길찾기/교통" 중심이지만, **일상 대화·긴급상황 어휘가
소수 섞여 있어 그 부분만 골라 쓰는 것이 실제로 가능**합니다. 나머지(자기소개, 잡담 등 완전한
일상 대화)는 원본에 없으므로, 우선순위 3번대로 자체 촬영을 기본값으로 하고 AIHub는 이렇게
확인된 교집합만 보조로 씁니다.
