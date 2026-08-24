# =============================================================================
# services/typhoon_service.py — Typhoon ASR (Speech-to-Text)
# =============================================================================
# ใช้ Typhoon API (OpenAI-compatible) สำหรับถอดเสียงภาษาไทย
# Model: typhoon-asr-realtime
# Base URL: https://api.opentyphoon.ai/v1
# =============================================================================

import os
import json
from pathlib import Path
from openai import OpenAI

TYPHOON_API_KEY = os.environ.get("TYPHOON_API_KEY", "")
TYPHOON_BASE_URL = "https://api.opentyphoon.ai/v1"
TYPHOON_MODEL = "typhoon-asr-realtime"

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        key = TYPHOON_API_KEY
        if not key:
            raise RuntimeError("TYPHOON_API_KEY not set — ตั้งค่า environment variable ก่อน")
        _client = OpenAI(api_key=key, base_url=TYPHOON_BASE_URL)
    return _client


async def transcribe_audio(file_path: str) -> dict:
    """
    ถอดเสียงด้วย Typhoon ASR API

    Args:
        file_path: path ไฟล์เสียง (.wav, .mp3, .m4a)

    Returns:
        {
            "text": "full transcript",
            "segments": [{"start": 0.0, "end": 2.5, "text": "สวัสดีครับ"}, ...],
            "duration": 120.5,
        }
    """
    import asyncio

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"ไม่พบไฟล์: {file_path}")

    loop = asyncio.get_event_loop()

    def _transcribe():
        client = _get_client()
        with open(file_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                file=audio_file,
                model=TYPHOON_MODEL,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
        return response

    print(f"  🌊 Typhoon STT: {path.name}")
    response = await loop.run_in_executor(None, _transcribe)

    # Parse response
    segments = []
    full_text = ""

    if hasattr(response, "segments") and response.segments:
        for seg in response.segments:
            segments.append({
                "start": getattr(seg, "start", 0.0),
                "end": getattr(seg, "end", 0.0),
                "text": getattr(seg, "text", "").strip(),
            })
        full_text = " ".join(s["text"] for s in segments)
    elif hasattr(response, "text"):
        full_text = response.text
        # ถ้าไม่มี segments ให้สร้าง segment เดียว
        segments = [{"start": 0.0, "end": 0.0, "text": full_text}]

    duration = getattr(response, "duration", 0.0)
    if not duration and segments:
        ends = [s["end"] for s in segments if s["end"] > 0]
        duration = max(ends) if ends else 0.0

    print(f"  ✅ Typhoon: {len(segments)} segments, {duration:.1f}s, {len(full_text)} chars")

    return {
        "text": full_text,
        "segments": segments,
        "duration": duration or 0.0,
    }


def check_typhoon_available() -> bool:
    """ตรวจว่า Typhoon API key ถูกตั้งค่าแล้ว"""
    return bool(TYPHOON_API_KEY)
