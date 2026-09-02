"""
우선순위 2번: 일반 사용자의 음성(→텍스트) 문장을 아바타가 아니라
실제로 촬영된 수어 영상 클립의 나열로 바꿔주는 모듈.

문장을 형태소 수준까지 정교하게 분석하는 대신(외부 형태소 분석기 의존 없이도
동작하도록), data/daily_conversation_vocab.json에 등록된 글로스 목록과
단순 부분일치 방식으로 매칭합니다. 실제 서비스에서는 이 부분을 KoNLPy 등
형태소 분석기 + 수어 문법 변환기로 교체하면 됩니다.
"""

import json
from pathlib import Path
from typing import List, TypedDict

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
VOCAB_PATH = DATA_DIR / "daily_conversation_vocab.json"
CLIPS_DIR = DATA_DIR / "sign_clips"


class SignMatch(TypedDict):
    gloss: str
    clip: str
    clip_exists: bool


def _load_vocab() -> list[dict]:
    return json.loads(VOCAB_PATH.read_text(encoding="utf-8"))["words"]


def lookup_sign_clips(text: str) -> List[SignMatch]:
    """문장에서 등록된 일상 대화 어휘를 찾아 매칭되는 수어 영상 클립 목록을 반환."""
    vocab = _load_vocab()
    matches: List[SignMatch] = []

    remaining = text
    # 긴 글로스부터 매칭해야 "안녕" 같은 부분 문자열이 "안녕하세요"를 가로채지 않음
    for entry in sorted(vocab, key=lambda e: -len(e["gloss"])):
        gloss = entry["gloss"]
        if gloss in remaining:
            clip_path = CLIPS_DIR / entry["clip"]
            matches.append(
                {
                    "gloss": gloss,
                    "clip": entry["clip"],
                    "clip_exists": clip_path.exists(),
                }
            )
            remaining = remaining.replace(gloss, " ")

    return matches
