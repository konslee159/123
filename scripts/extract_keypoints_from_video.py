#!/usr/bin/env python3
"""
직접 촬영(또는 AIHub 등에서 받은) mp4 영상 파일에서 손 키포인트 시퀀스를 뽑아,
frontend/js/signRecognizer.js의 registerTemplate()이 쓰는 것과 같은 포맷의
JSON 템플릿으로 저장하는 오프라인 스크립트입니다.

한 프레임짜리 keypoints.json 하나만으로는 "동작(움직임)"을 담을 수 없어서
DTW 템플릿으로 쓸 수 없지만, 원본 mp4가 있으면 이 스크립트로 영상 전체를
훑어서 진짜 시퀀스 템플릿을 만들 수 있습니다.

사용법:
  python3 scripts/extract_keypoints_from_video.py \
      --video /path/to/NIA_SL_WORD1501_REAL01_D.mp4 \
      --gloss 단어이름 \
      --out template.json

  # 여러 영상을 한 번에 처리해서 브라우저 localStorage로 바로 가져갈 수 있는
  # signbridge_templates_v1 포맷으로 합치고 싶다면:
  python3 scripts/extract_keypoints_from_video.py \
      --video clip1.mp4 --gloss 안녕하세요 \
      --video clip2.mp4 --gloss 감사합니다 \
      --out templates_bundle.json --bundle

의존성: pip install mediapipe opencv-python
최초 실행 시 hand_landmarker.task 모델을 자동으로 내려받습니다(인터넷 필요).
"""

import argparse
import json
import urllib.request
from pathlib import Path

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_PATH = Path(__file__).resolve().parent / ".cache" / "hand_landmarker.task"


def ensure_model() -> Path:
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not MODEL_PATH.exists():
        print(f"[extract] 손 랜드마크 모델 다운로드 중... -> {MODEL_PATH}")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    return MODEL_PATH


def frame_to_vector(hand_landmarks_list) -> list[float] | None:
    """
    mediapipe HandLandmarker 결과(최대 2손, 각 21개 landmark)를
    signRecognizer.js의 flattenLandmarks()와 동일하게
    "첫 번째 손의 손목(0번) 기준 상대좌표"로 정규화한 벡터로 변환.
    """
    if not hand_landmarks_list:
        return None

    wrist = hand_landmarks_list[0][0]
    vec: list[float] = []
    for hand in hand_landmarks_list[:2]:
        for pt in hand:
            vec.append(pt.x - wrist.x)
            vec.append(pt.y - wrist.y)
    return vec


def extract_sequence(video_path: Path) -> list[list[float]]:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    model_path = ensure_model()
    options = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
    )

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_ms = int(1000 / fps)

    sequence: list[list[float]] = []
    with vision.HandLandmarker.create_from_options(options) as landmarker:
        frame_idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(mp_image, frame_idx * frame_ms)

            vec = frame_to_vector(result.hand_landmarks)
            if vec is not None:
                sequence.append(vec)
            frame_idx += 1

    cap.release()
    return sequence


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--video", action="append", required=True, help="mp4 파일 경로 (여러 번 지정 가능)")
    parser.add_argument("--gloss", action="append", required=True, help="해당 영상의 단어(글로스) 이름 (--video와 같은 순서/개수)")
    parser.add_argument("--out", required=True, help="출력 JSON 경로")
    parser.add_argument("--bundle", action="store_true",
                         help="signRecognizer.js localStorage 포맷({gloss: [[...], ...]})으로 여러 영상을 합쳐서 저장")
    args = parser.parse_args()

    if len(args.video) != len(args.gloss):
        raise SystemExit("--video 개수와 --gloss 개수가 같아야 합니다.")

    bundle: dict[str, list[list[float]]] = {}
    for video_str, gloss in zip(args.video, args.gloss):
        video_path = Path(video_str)
        print(f"[extract] {video_path.name} ({gloss}) 처리 중...")
        sequence = extract_sequence(video_path)
        print(f"[extract]   -> 손이 검출된 프레임 {len(sequence)}개")
        bundle[gloss] = sequence

    out_path = Path(args.out)
    if args.bundle or len(args.video) > 1:
        out_path.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
        print(f"[extract] 완료: {out_path} (브라우저 콘솔에서 아래처럼 불러오면 바로 등록됩니다)")
        print(f"           localStorage.setItem('signbridge_templates_v1', await (await fetch('{out_path.name}')).text())")
    else:
        gloss, sequence = next(iter(bundle.items()))
        out_path.write_text(json.dumps({gloss: sequence}, ensure_ascii=False), encoding="utf-8")
        print(f"[extract] 완료: {out_path}")


if __name__ == "__main__":
    main()
