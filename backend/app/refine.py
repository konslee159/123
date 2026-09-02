"""
우선순위 4번: 수어 인식 결과(글로스 나열) → TTS로 보내기 전에
ChatGPT API로 자연스러운 한국어 문장으로 한 번 다듬어주는 모듈.

수어는 보통 조사/어미가 생략된 "글로스(gloss)" 형태로 인식됩니다.
예) ["병원", "어디", "있어요"] → "병원이 어디에 있나요?"

OPENAI_API_KEY가 없거나 호출에 실패하면, 서비스가 멈추지 않도록
간단한 규칙 기반 다듬기로 자동 대체(fallback)합니다.
"""

import os
from typing import List

try:
    from openai import OpenAI
except ImportError:  # openai 패키지 미설치 환경에서도 서버가 죽지 않도록
    OpenAI = None

SYSTEM_PROMPT = (
    "너는 한국 수어 통역 보조 AI야. 입력은 수어 인식 모델이 뽑아낸 글로스(단어) 나열이며 "
    "조사, 어미, 띄어쓰기가 없을 수 있어. 이걸 문맥에 맞는 자연스러운 한국어 존댓말 문장 "
    "1개로 다듬어줘. 원래 의미를 추가하거나 빼지 말고, 결과 문장만 출력해."
)


def _rule_based_fallback(glosses: List[str]) -> str:
    """API 키가 없을 때 쓰는 아주 단순한 규칙 기반 다듬기 (데모/오프라인용)."""
    text = " ".join(g.strip() for g in glosses if g.strip())
    if not text:
        return ""
    if text[-1] not in ".!?":
        text += "."
    return text


def refine_gloss_sequence(glosses: List[str]) -> str:
    """글로스 리스트를 자연스러운 한국어 문장으로 변환."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or OpenAI is None:
        return _rule_based_fallback(glosses)

    client = OpenAI(api_key=api_key)
    joined = " / ".join(glosses)
    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_REFINE_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"글로스: {joined}"},
            ],
            temperature=0.3,
            max_tokens=120,
        )
        content = response.choices[0].message.content
        return content.strip() if content else _rule_based_fallback(glosses)
    except Exception:
        # 네트워크/키 오류 시에도 통화가 끊기지 않도록 규칙 기반으로 대체
        return _rule_based_fallback(glosses)
