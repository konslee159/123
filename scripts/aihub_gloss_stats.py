#!/usr/bin/env python3
"""
AIHub 수어영상 문장(SEN) 형태소 라벨(*_morpheme.json) 묶음을 분석해서
1) 전체 글로스(단어) 빈도표
2) data/daily_conversation_vocab.json에 정의된 "일상 대화" 어휘가 실제로
   등장하는 문장(SEN) 목록
을 뽑아내는 스크립트입니다.

이 저장소의 data/aihub_real_sen_gloss_stats.json은 사용자가 실제로 제공한
AIHub 문장 라벨 20,000개(제공자 17/18 × 문장 2,000개 × 카메라 5각도)를
이 스크립트로 분석한 결과입니다. 우선순위 3번(AIHub는 일상 대화에 필요한
것만 골라 쓰기)을 실제 데이터 기준으로 검증하는 데 씁니다.

사용법:
  python3 scripts/aihub_gloss_stats.py \
      --morpheme-dir /path/to/01_real_sen_morpheme/morpheme \
      --out data/aihub_real_sen_gloss_stats.json
"""

import argparse
import collections
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
VOCAB_PATH = HERE.parent / "data" / "daily_conversation_vocab.json"


def load_daily_glosses() -> set[str]:
    vocab = json.loads(VOCAB_PATH.read_text(encoding="utf-8"))
    return {w["gloss"] for w in vocab["words"]}


def analyze(morpheme_dir: Path) -> dict:
    files = sorted(morpheme_dir.rglob("*_morpheme.json"))
    if not files:
        raise SystemExit(f"'{morpheme_dir}' 아래에서 *_morpheme.json 파일을 찾지 못했습니다.")

    gloss_counter: collections.Counter[str] = collections.Counter()
    sen_to_words: dict[str, set[str]] = collections.defaultdict(set)

    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        # 파일명: NIA_SL_SEN0001_REAL17_F_morpheme.json -> SEN0001
        sen_id = path.name.split("_")[2]
        for segment in data.get("data", []):
            for attr in segment.get("attributes", []):
                name = attr.get("name")
                if name:
                    gloss_counter[name] += 1
                    sen_to_words[sen_id].add(name)

    daily_glosses = load_daily_glosses()
    # 완전 일치는 아니어도 일상 대화 어휘의 활용형(예: 도와주세요 vs 도와주다)까지
    # 대략 잡아내기 위해 부분일치도 함께 확인
    relevant = {
        sen_id: sorted(words)
        for sen_id, words in sen_to_words.items()
        if words & daily_glosses
        or any(any(g[:2] in w for w in words) for g in daily_glosses if len(g) >= 2)
    }

    return {
        "source": f"{morpheme_dir}",
        "total_label_files": len(files),
        "total_sentences": len(sen_to_words),
        "unique_glosses": len(gloss_counter),
        "gloss_frequency": dict(gloss_counter.most_common()),
        "daily_conversation_relevant_sentences": relevant,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--morpheme-dir", type=Path, required=True, help="*_morpheme.json 파일들이 있는 폴더")
    parser.add_argument("--out", type=Path, default=Path("data/aihub_real_sen_gloss_stats.json"))
    args = parser.parse_args()

    result = analyze(args.morpheme_dir)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"라벨 파일: {result['total_label_files']}개, 문장: {result['total_sentences']}개")
    print(f"고유 글로스: {result['unique_glosses']}개")
    print(f"일상 대화 관련 문장: {len(result['daily_conversation_relevant_sentences'])}개")
    print(f"결과 저장: {args.out}")


if __name__ == "__main__":
    main()
