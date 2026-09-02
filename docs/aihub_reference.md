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
3. 도메인 불일치 — 원본 AIHub 데이터는 "길찾기/교통" 중심이라, 우리가 필요한 "병원/관공서/인사"
   같은 일상 대화 어휘는 원본에 없을 수 있습니다. 그래서 우선순위 3번대로 자체 촬영을 기본값으로
   하고, AIHub는 겹치는 항목(숫자, 인사 등 일부 공통 어휘)만 보조로 씁니다.
