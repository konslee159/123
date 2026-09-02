#!/usr/bin/env python3
"""
AIHub "수어 영상" 데이터셋(dataSetSn=103)에서 이 프로젝트가 필요한
"일상 대화" 카테고리만 골라내는 전처리 스크립트.

전제:
  - AIHub 데이터는 로그인 + AIHub Shell 다운로드가 필요해 이 환경에서는
    실제 데이터를 내려받아 실행할 수 없습니다. 이 스크립트는 팀이 실제
    데이터를 받은 뒤 그대로 실행할 수 있도록 만든 "실행 가능한 설계도"입니다.
  - 실제 AIHub 배포본(수어영상 AI 데이터 구축 가이드라인, dataSetSn=103) 구조는
    대분류(REAL/SYN/CROWD, 수집방법) / 중분류(SEN/WORD/FS, 문장·단어·지화) /
    소분류(keypoint/morpheme/video) 로 이어지는 depth-3 디렉터리이며, 파일명은
      NIA_SL_{SEN|WORD|FS}{4자리}_{REAL|SYN|CROWD}{제공자2자리}_{F|U|D|R|L}.mp4
      NIA_SL_{...}_morpheme.json                     (형태소/비수지 구간 라벨)
      NIA_SL_{...}_{프레임12자리}_keypoints.json      (OpenPose 포맷, 프레임별)
    형식을 따릅니다. (data/aihub_samples/ 에 실제 keypoints.json 예시가 있고,
    scripts/aihub_keypoint_parse.py가 이 포맷을 읽어 벡터 시퀀스로 바꿔줍니다.)
  - 이 필터 스크립트가 가정하는 raw_root 레이아웃(위 실제 구조를 단순화):
      raw_root/
        videos/<category>/<word_or_sentence>/*.mp4
        keypoints/<category>/<word_or_sentence>/*_keypoints.json
        labels/<category>/<word_or_sentence>/*_morpheme.json
    실제 AIHub 배포 구조(대/중/소분류 depth-3)를 그대로 쓴다면 --raw-root 아래
    구조에 맞춰 category 매핑 부분만 조정하면 됩니다.

사용법:
  python3 aihub_filter.py --raw-root /path/to/aihub_raw --out data/aihub_filtered

동작:
  1. data/daily_conversation_vocab.json 의 aihub_categories_to_include 목록만 통과시킴
  2. 나머지(전문용어, 스포츠 등)는 건드리지 않고 건너뜀 → 다운로드/저장 용량 절약
  3. 선택된 항목만 out 디렉터리로 복사(또는 심볼릭 링크)
"""

import argparse
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
VOCAB_PATH = HERE.parent / "data" / "daily_conversation_vocab.json"


def load_include_categories() -> set[str]:
    vocab = json.loads(VOCAB_PATH.read_text(encoding="utf-8"))
    return set(vocab["aihub_categories_to_include"])


def filter_dataset(raw_root: Path, out_root: Path, link: bool = False) -> None:
    include = load_include_categories()
    videos_root = raw_root / "videos"
    if not videos_root.exists():
        raise SystemExit(f"raw-root 아래 videos/ 폴더가 없습니다: {videos_root}")

    copied, skipped = 0, 0
    for category_dir in sorted(videos_root.iterdir()):
        if not category_dir.is_dir():
            continue
        if category_dir.name not in include:
            skipped += 1
            continue

        for subset in ("videos", "keypoints", "labels"):
            src = raw_root / subset / category_dir.name
            if not src.exists():
                continue
            dst = out_root / subset / category_dir.name
            dst.parent.mkdir(parents=True, exist_ok=True)
            if dst.exists():
                continue
            if link:
                dst.symlink_to(src, target_is_directory=True)
            else:
                shutil.copytree(src, dst)
        copied += 1

    print(f"[aihub_filter] 포함된 카테고리: {copied}개, 제외된 카테고리: {skipped}개")
    print(f"[aihub_filter] 결과 경로: {out_root}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-root", type=Path, required=True, help="AIHub 원본 데이터 루트")
    parser.add_argument("--out", type=Path, default=Path("data/aihub_filtered"), help="필터링 결과 저장 경로")
    parser.add_argument("--link", action="store_true", help="복사 대신 심볼릭 링크 생성(용량 절약)")
    args = parser.parse_args()

    filter_dataset(args.raw_root, args.out, link=args.link)


if __name__ == "__main__":
    main()
