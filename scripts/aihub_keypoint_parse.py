#!/usr/bin/env python3
"""
실제 AIHub "수어 영상"(dataSetSn=103) 키포인트 JSON을 우리 인식기가 쓰는
벡터 시퀀스로 바꿔주는 파서.

파일명 규칙(가이드라인 원문 기준):
  NIA_SL_{SEN|WORD|FS}{번호4자리}_{REAL|SYN|CROWD}{제공자번호2자리}_{F|U|D|R|L}
    _{프레임번호12자리}_keypoints.json      ← OpenPose 포맷 키포인트
  NIA_SL_{SEN|WORD|FS}{번호4자리}_{REAL|SYN|CROWD}{제공자번호2자리}_{F|U|D|R|L}
    _morpheme.json                          ← 형태소/비수지 구간 라벨
  NIA_SL_{SEN|WORD|FS}{번호4자리}_{REAL|SYN|CROWD}{제공자번호2자리}_{F|U|D|R|L}.mp4

예: NIA_SL_WORD1501_REAL01_D_000000000000_keypoints.json
    (단어 1501번, 직접촬영 1번 제공자, 카메라 각도 D(정면하단), 0번째 프레임)

키포인트 JSON 구조 (OpenPose 확장):
  people.pose_keypoints_2d       25개 관절 * (x, y, confidence)
  people.hand_left_keypoints_2d  21개 관절 * (x, y, confidence)
  people.hand_right_keypoints_2d 21개 관절 * (x, y, confidence)
  people.face_keypoints_2d       70개 관절 * (x, y, confidence)
  (각각 3d/camparam 버전도 포함될 수 있음)

이 스크립트는 위 JSON들을 프레임 순서(파일명의 12자리 프레임 번호)로 정렬해
읽어, frontend/js/signRecognizer.js의 DTW 매칭기와 같은 방식으로 손목 기준
상대좌표 벡터 시퀀스를 만든다. 즉, AIHub 데이터로 실제 학습을 시작할 때
이 벡터들을 바로 CNN+Transformer 등 시퀀스 모델의 입력으로 쓸 수 있다.
"""

import argparse
import json
import re
from pathlib import Path
from typing import Optional

FRAME_RE = re.compile(r"_(\d{12})_keypoints\.json$")


def _xy_pairs(flat: list[float]) -> list[tuple[float, float]]:
    """OpenPose 포맷([x1,y1,c1,x2,y2,c2,...])에서 (x, y) 쌍만 추출."""
    return [(flat[i], flat[i + 1]) for i in range(0, len(flat), 3)]


def load_frame_vector(keypoints_json_path: Path) -> Optional[list[float]]:
    """
    한 프레임의 keypoints.json을 읽어, signRecognizer.js와 동일한 방식으로
    양손 21개 관절을 손목(0번 포인트) 기준 상대좌표로 정규화한 벡터를 반환.
    손이 검출되지 않은 프레임이면 None.
    """
    data = json.loads(keypoints_json_path.read_text(encoding="utf-8"))
    people = data.get("people")
    if not people:
        return None

    left = _xy_pairs(people.get("hand_left_keypoints_2d") or [])
    right = _xy_pairs(people.get("hand_right_keypoints_2d") or [])
    if not left and not right:
        return None

    vec: list[float] = []
    for hand in (left, right):
        if not hand:
            continue
        wrist_x, wrist_y = hand[0]
        for x, y in hand:
            vec.append(x - wrist_x)
            vec.append(y - wrist_y)
    return vec


def load_clip_sequence(clip_dir: Path, clip_prefix: str) -> list[list[float]]:
    """
    한 클립(NIA_SL_WORD1501_REAL01_D)에 속한 모든 프레임 keypoints.json을
    프레임 번호 순서로 읽어 벡터 시퀀스로 반환. signRecognizer.js의
    registerTemplate()에 그대로 넣을 수 있는 형태.
    """
    frames = []
    for path in clip_dir.glob(f"{clip_prefix}_*_keypoints.json"):
        m = FRAME_RE.search(path.name)
        if not m:
            continue
        frame_no = int(m.group(1))
        vec = load_frame_vector(path)
        if vec is not None:
            frames.append((frame_no, vec))

    frames.sort(key=lambda item: item[0])
    return [vec for _, vec in frames]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clip_dir", type=Path, help="keypoints.json들이 있는 폴더")
    parser.add_argument("clip_prefix", help="예: NIA_SL_WORD1501_REAL01_D")
    args = parser.parse_args()

    sequence = load_clip_sequence(args.clip_dir, args.clip_prefix)
    print(f"프레임 수: {len(sequence)}")
    if sequence:
        print(f"프레임당 벡터 차원: {len(sequence[0])} (양손 각 21포인트 * xy)")


if __name__ == "__main__":
    main()
