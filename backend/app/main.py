"""
손잇다(SignBridge) 프로토타입 백엔드.

엔드포인트:
  POST /api/refine       수어 인식 글로스 나열 → ChatGPT로 자연스러운 문장 다듬기 (우선순위 4)
  POST /api/sign-lookup  일반 사용자 문장 → 실제 수어 영상 클립 나열 (우선순위 2)
  GET  /clips/{filename} 수어 영상 클립 정적 파일 서빙
"""

from pathlib import Path
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .refine import refine_gloss_sequence
from .sign_lookup import lookup_sign_clips

app = FastAPI(title="SignBridge Prototype API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 프로토타입 단계이므로 전체 허용, 배포 시 제한 필요
    allow_methods=["*"],
    allow_headers=["*"],
)

CLIPS_DIR = Path(__file__).resolve().parents[2] / "data" / "sign_clips"
CLIPS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/clips", StaticFiles(directory=str(CLIPS_DIR)), name="clips")


class RefineRequest(BaseModel):
    glosses: List[str]


class RefineResponse(BaseModel):
    sentence: str


class SignLookupRequest(BaseModel):
    text: str


class SignLookupResponse(BaseModel):
    matches: list


@app.post("/api/refine", response_model=RefineResponse)
def refine(req: RefineRequest) -> RefineResponse:
    sentence = refine_gloss_sequence(req.glosses)
    return RefineResponse(sentence=sentence)


@app.post("/api/sign-lookup", response_model=SignLookupResponse)
def sign_lookup(req: SignLookupRequest) -> SignLookupResponse:
    matches = lookup_sign_clips(req.text)
    return SignLookupResponse(matches=matches)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
