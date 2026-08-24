# =============================================================================
# services/groq_ai_service.py — v1.1.0
# Real AI Service — Groq API (Whisper + Llama)
#
# Whisper: ถอดเสียงเป็นข้อความ (Speech-to-Text) — รองรับ Chunking ไฟล์ยาว
# Llama:   สรุปบทสนทนา + วิเคราะห์ Sentiment, Intent, Brand, Product, Channel
#
# Chunking: ไฟล์เสียง >5 นาที หรือ >24MB จะถูกตัดเป็น chunk ละ 5 นาที
#           ส่ง Whisper ทีละ chunk แล้วรวม transcript กลับเป็นอันเดียว
#
# ⚠️ ต้องตั้งค่า Environment Variable:
#   GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#
# ติดตั้ง:
#   pip install groq httpx
# =============================================================================

import os
import asyncio
import json
import random
import re
import wave
import math
import tempfile
import struct
from datetime import datetime
from pathlib import Path
from typing import Optional, List

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    print("⚠️ groq package not installed. Run: pip install groq")

# =============================================================================
# CONFIG
# =============================================================================

WHISPER_MODEL = "whisper-large-v3"         # Groq Whisper model (full — แม่นกว่า turbo)
LLAMA_MODEL = "llama-3.3-70b-versatile"    # Groq Llama model

# =============================================================================
# ★ MULTI API KEY ROTATION — สลับ key อัตโนมัติเมื่อชน rate limit
# =============================================================================
# วิธีใช้: set environment variables แบบนี้
#   $env:GROQ_API_KEY="gsk_key1"
#   $env:GROQ_API_KEY_2="gsk_key2"
#   $env:GROQ_API_KEY_3="gsk_key3"
#   (เพิ่มได้เรื่อยๆ: GROQ_API_KEY_4, GROQ_API_KEY_5, ...)
#
# หรือใส่หลาย key คั่นด้วย comma ใน GROQ_API_KEYS:
#   $env:GROQ_API_KEYS="gsk_key1,gsk_key2,gsk_key3"
# =============================================================================

def _load_api_keys() -> list:
    """โหลด API keys ทั้งหมดจาก environment variables"""
    keys = []

    # วิธี 1: GROQ_API_KEYS (comma-separated)
    multi_keys = os.environ.get("GROQ_API_KEYS", "")
    if multi_keys:
        keys.extend([k.strip() for k in multi_keys.split(",") if k.strip()])

    # วิธี 2: GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, ...
    main_key = os.environ.get("GROQ_API_KEY", "")
    if main_key and main_key not in keys:
        keys.insert(0, main_key)

    for i in range(2, 20):  # รองรับสูงสุด 20 keys
        key = os.environ.get(f"GROQ_API_KEY_{i}", "")
        if key and key not in keys:
            keys.append(key)

    return keys


_ALL_API_KEYS = _load_api_keys()
_current_key_index = 0

if _ALL_API_KEYS:
    print(f"🔑 Loaded {len(_ALL_API_KEYS)} Groq API key(s)")
    for i, k in enumerate(_ALL_API_KEYS):
        print(f"   Key {i+1}: {k[:10]}...{k[-4:]}")
else:
    print("⚠️ No Groq API keys found! Set GROQ_API_KEY environment variable.")

# Backward compatibility
GROQ_API_KEY = _ALL_API_KEYS[0] if _ALL_API_KEYS else ""


def _get_next_client() -> "Groq":
    """สร้าง Groq client โดยสลับ key แบบ round-robin"""
    global _current_key_index

    if not _ALL_API_KEYS:
        raise RuntimeError("No Groq API keys configured.")

    key = _ALL_API_KEYS[_current_key_index % len(_ALL_API_KEYS)]
    _current_key_index += 1

    key_num = ((_current_key_index - 1) % len(_ALL_API_KEYS)) + 1
    print(f"   🔑 Using Key {key_num}/{len(_ALL_API_KEYS)}: {key[:10]}...")

    return Groq(api_key=key)


def _get_client_for_retry() -> "Groq":
    """เมื่อเจอ rate limit → สลับไปใช้ key ถัดไป"""
    return _get_next_client()


# Chunking Config
WHISPER_MAX_FILE_SIZE_MB = 24          # Groq limit = 25MB, ใช้ 24 เผื่อ overhead
CHUNK_DURATION_SECONDS = 300           # ตัดทุก 5 นาที (ปลอดภัยสำหรับไฟล์ทุกขนาด)

# Delay ระหว่าง step (วินาที)
DELAY_BETWEEN_STEPS = 1               # พักเล็กน้อยระหว่าง Whisper → Llama


# =============================================================================
# RATE LIMIT HANDLER — ไม่ retry ให้ fail ทันที
# =============================================================================

def _retry_on_rate_limit(func, *args, **kwargs):
    """
    เรียก function — ถ้าเจอ 429 rate limit ให้ fail ทันที (ไม่ retry)
    ★ user กด re-Analyze เมื่อพร้อมได้เอง
    """
    try:
        return func(*args, **kwargs)
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "rate_limit" in error_str.lower() or "Rate limit" in error_str:
            print(f"  ❌ Rate limit hit — ยกเลิกการวิเคราะห์")
            raise RuntimeError(f"Rate limit exceeded — กรุณารอสักครู่แล้วกด re-Analyze ใหม่")
        raise

# QA Criteria (ใช้ให้ Llama ประเมิน)
QA_CRITERIA = [
    "การทักทายและแนะนำตัว",
    "การรับฟังและทำความเข้าใจปัญหา",
    "ความถูกต้องของข้อมูลที่ให้",
    "การเสนอทางแก้ไขที่เหมาะสม",
    "การยืนยันความพึงพอใจก่อนวางสาย",
    "ความสุภาพและมืออาชีพตลอดการสนทนา",
]


# =============================================================================
# LANGUAGE FILTER — เอาเฉพาะภาษาไทยกับอังกฤษ
# =============================================================================
# Whisper บางครั้งถอดเสียงผิดเป็นภาษาอื่น (ฝรั่งเศส, รัสเซีย, จีน ฯลฯ)
# Filter นี้จะกรองเอาเฉพาะ segment ที่เป็นไทย/อังกฤษเท่านั้น

# Unicode ranges
_THAI_RANGE = range(0x0E00, 0x0E7F + 1)          # Thai script
_ENGLISH_RANGE_UPPER = range(0x0041, 0x005A + 1)  # A-Z
_ENGLISH_RANGE_LOWER = range(0x0061, 0x007A + 1)  # a-z
_DIGIT_RANGE = range(0x0030, 0x0039 + 1)          # 0-9

# ตัวอักษร/สัญลักษณ์ที่อนุญาต (นอกจากไทย/อังกฤษ/ตัวเลข)
_ALLOWED_SYMBOLS = set(' .,!?;:\'"-()[]{}@#$%&*+=/\\<>~`^_|฿๏๐๑๒๓๔๕๖๗๘๙\n\t')


def _is_thai_or_english_char(ch: str) -> bool:
    """ตรวจว่าตัวอักษรเป็นไทย, อังกฤษ, ตัวเลข, หรือสัญลักษณ์ที่อนุญาต"""
    code = ord(ch)
    if code in _THAI_RANGE:
        return True
    if code in _ENGLISH_RANGE_UPPER or code in _ENGLISH_RANGE_LOWER:
        return True
    if code in _DIGIT_RANGE:
        return True
    if ch in _ALLOWED_SYMBOLS:
        return True
    return False


def _is_thai_or_english(text: str) -> bool:
    """
    ตรวจว่า segment นี้เป็นภาษาไทย/อังกฤษหรือไม่
    
    Rule: ≥60% ของตัวอักษร (ไม่นับ space/เลข/สัญลักษณ์) ต้องเป็นไทยหรืออังกฤษ
    ถ้าสั้นมาก (<3 ตัวอักษรที่นับได้) → ตรวจว่าทุกตัวผ่าน
    """
    if not text.strip():
        return False

    countable = 0
    valid = 0
    for ch in text:
        if ch in _ALLOWED_SYMBOLS:
            continue  # ไม่นับ space/สัญลักษณ์
        code = ord(ch)
        if code in _DIGIT_RANGE:
            continue  # ไม่นับตัวเลข
        countable += 1
        if code in _THAI_RANGE or code in _ENGLISH_RANGE_UPPER or code in _ENGLISH_RANGE_LOWER:
            valid += 1

    if countable == 0:
        return True  # มีแต่ตัวเลข/สัญลักษณ์ → ผ่าน
    if countable < 3:
        return valid == countable  # สั้นมาก → ต้อง 100%

    return (valid / countable) >= 0.6


def _clean_foreign_text(text: str) -> str:
    """
    กรองคำแปลกออก — เน้นว่าบทสนทนาเป็นภาษาไทยเป็นหลัก:
    1. ลบคำที่มีอักษรแปลก (Cyrillic, CJK, Arabic)
    2. ลบ hallucination ภาษาต่างประเทศ
    3. ★ คำอังกฤษล้วน 3+ ตัวอักษร ต้องอยู่ใน whitelist ถึงจะผ่าน
    4. คำอังกฤษสั้น 1-2 ตัว → ปล่อยผ่าน (อาจเป็นส่วนของคำไทย)
    5. คำที่มีไทยปน → ปล่อยผ่านเสมอ
    """
    words = text.split()
    cleaned_words = []

    for word in words:
        stripped = word.strip('.,!?;:\'"()-[]{}')
        if not stripped:
            cleaned_words.append(word)
            continue

        # ตรวจ hallucination
        if stripped.lower() in _WHISPER_HALLUCINATIONS:
            continue

        # ตรวจอักษรแปลก + นับไทย/อังกฤษ
        has_foreign = False
        thai_count = 0
        eng_count = 0
        letter_count = 0

        for ch in stripped:
            if ch in _ALLOWED_SYMBOLS:
                continue
            code = ord(ch)
            if code in _DIGIT_RANGE:
                continue
            letter_count += 1
            if code in _THAI_RANGE:
                thai_count += 1
            elif code in _ENGLISH_RANGE_UPPER or code in _ENGLISH_RANGE_LOWER:
                eng_count += 1
            else:
                has_foreign = True
                break

        if has_foreign:
            continue

        # ★ มีไทยปนอยู่ → ผ่านเสมอ (เช่น "โอมาซ", "เบดเกียร์5")
        if thai_count > 0:
            cleaned_words.append(word)
            continue

        # ★ คำอังกฤษล้วน 3+ ตัว → ต้องอยู่ใน whitelist
        if eng_count >= 3 and thai_count == 0:
            if stripped.lower() not in _ENGLISH_WHITELIST:
                continue  # hallucination

        cleaned_words.append(word)

    return " ".join(cleaned_words).strip()


# ★ คำอังกฤษที่อนุญาตให้ผ่าน (ครอบคลุมคำที่ใช้จริงในบทสนทนา)
_ENGLISH_WHITELIST = {
    # ชื่อแบรนด์
    "lotus", "omazz", "midas", "dunlopillo", "bedgear", "lalabed",
    "zinus", "malouf", "woodfield", "restonic", "eastman", "house",
    "loto", "mobili",
    # สินค้า / วัสดุ
    "mattress", "pillow", "bedding", "topper", "bed", "frame",
    "protector", "pocket", "spring", "coil", "latex", "memory", "foam",
    "king", "queen", "single", "size", "super", "firm", "soft", "medium",
    "panel", "pannte", "cover", "sheet", "pad", "set",
    # คำที่คนไทยใช้บ่อย
    "call", "center", "line", "email", "website", "online", "offline",
    "order", "tracking", "delivery", "cancel", "refund", "return",
    "promotion", "sale", "discount", "warranty", "guarantee",
    "bill", "receipt", "invoice", "card", "credit", "debit", "transfer",
    "code", "number", "model", "type", "brand", "price",
    "service", "customer", "agent", "support",
    "yes", "yep", "nope", "okay",
    # ห้าง / ช่องทาง
    "central", "robinson", "lazada", "shopee", "homepro", "ikea",
    "facebook", "instagram", "tiktok", "google", "youtube",
    # ที่อยู่ / สถานที่
    "express", "post", "flash", "kerry",
}


# Whisper hallucination words — ภาษาต่างประเทศ + Whisper artifacts
_WHISPER_HALLUCINATIONS = {
    # ภาษาฝรั่งเศส
    "merci", "bonjour", "bonsoir", "voilà", "très",
    "laisse", "laissez", "avec", "dans", "pour", "comme",
    "cette", "être", "avoir", "faire", "aller",
    "sont", "suis", "êtes", "sommes",
    "pourquoi", "quand", "comment",
    "mencionar", "entonces", "también",
    "passe", "tiem",
    # ภาษาสเปน
    "hola", "gracias", "buenos", "buenas", "señor", "señora",
    "favor", "está", "aquí", "puede", "tiene", "quiero",
    "gasido", "tantito", "los",
    # ภาษาเยอรมัน
    "danke", "bitte", "guten", "morgen", "herr", "frau",
    "nicht", "auch", "noch", "schon",
    "kaufen", "kosting",
    # ภาษาดัตช์/แอฟริกัน
    "lekker", "mae",
    # ภาษาอิตาเลียน
    "grazie", "buongiorno", "buonasera", "prego", "signore",
    # ภาษาโปรตุเกส
    "obrigado", "obrigada", "senhora", "ajuda",
    # Whisper artifacts
    "subtitle", "subtitles", "subtítulos", "sous-titres",
    "subscribe", "subscribed", "subscription",
    "copyright", "reserved",
    "ethnicity", "contestant",
    "bastards", "bastard", "outro", "preview", "walls",
    "listing", "content", "clear", "please",
    "people", "ohio", "appar", "umber",
    "labor", "doing",
}


# =============================================================================
# AUDIO CHUNKING — ตัดไฟล์เสียงเป็นท่อนๆ สำหรับไฟล์ใหญ่
# =============================================================================

def _get_wav_info(audio_file_path: str) -> dict:
    """อ่านข้อมูลพื้นฐานของไฟล์ .wav"""
    try:
        with wave.open(audio_file_path, 'rb') as wf:
            return {
                "channels": wf.getnchannels(),
                "sample_width": wf.getsampwidth(),
                "frame_rate": wf.getframerate(),
                "n_frames": wf.getnframes(),
                "duration_seconds": wf.getnframes() / wf.getframerate(),
            }
    except wave.Error:
        # ไม่ใช่ .wav หรืออ่านไม่ได้ — ใช้ file size ประมาณ
        file_size = os.path.getsize(audio_file_path)
        return {
            "channels": 1,
            "sample_width": 2,
            "frame_rate": 16000,
            "n_frames": 0,
            "duration_seconds": 0,
            "file_size_bytes": file_size,
            "is_non_wav": True,
        }


def _needs_chunking(audio_file_path: str) -> bool:
    """ตรวจว่าไฟล์ต้องตัด chunk หรือไม่"""
    file_size_mb = os.path.getsize(audio_file_path) / (1024 * 1024)
    if file_size_mb > WHISPER_MAX_FILE_SIZE_MB:
        return True

    info = _get_wav_info(audio_file_path)
    if info.get("duration_seconds", 0) > CHUNK_DURATION_SECONDS:
        return True

    return False


def _split_wav_to_chunks(audio_file_path: str, chunk_seconds: int = CHUNK_DURATION_SECONDS) -> List[str]:
    """
    ตัดไฟล์ .wav เป็นท่อนๆ ละ chunk_seconds วินาที
    
    Returns:
        list ของ path ไปยัง chunk files (temp files)
    """
    chunk_paths = []

    try:
        with wave.open(audio_file_path, 'rb') as wf:
            channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            frame_rate = wf.getframerate()
            total_frames = wf.getnframes()
            
            frames_per_chunk = chunk_seconds * frame_rate
            num_chunks = math.ceil(total_frames / frames_per_chunk)

            for i in range(num_chunks):
                # อ่าน frames สำหรับ chunk นี้
                frames_to_read = min(frames_per_chunk, total_frames - (i * frames_per_chunk))
                audio_data = wf.readframes(frames_to_read)

                # เขียนลง temp file
                tmp = tempfile.NamedTemporaryFile(
                    suffix=f"_chunk{i:03d}.wav",
                    delete=False,
                    dir=tempfile.gettempdir(),
                )
                with wave.open(tmp.name, 'wb') as chunk_wf:
                    chunk_wf.setnchannels(channels)
                    chunk_wf.setsampwidth(sample_width)
                    chunk_wf.setframerate(frame_rate)
                    chunk_wf.writeframes(audio_data)

                chunk_paths.append(tmp.name)

    except wave.Error:
        # ไม่ใช่ .wav → ส่งไฟล์เดิมกลับไป (ไม่ chunk)
        return [audio_file_path]

    return chunk_paths


def _cleanup_chunks(chunk_paths: List[str], original_path: str):
    """ลบ temp chunk files"""
    for path in chunk_paths:
        if path != original_path:
            try:
                os.unlink(path)
            except OSError:
                pass


# =============================================================================
# STEP 1: Whisper — Speech-to-Text via Groq (with Chunking)
# =============================================================================

def _transcribe_single_file(file_path: str, time_offset: float = 0.0) -> dict:
    """
    ส่งไฟล์เดียวไปให้ Groq Whisper API (sync function)
    ★ ใช้ _get_next_client() สลับ key อัตโนมัติ

    Args:
        file_path: path ไปยังไฟล์เสียง
        time_offset: offset เวลา (วินาที) สำหรับ chunk ที่ไม่ใช่ chunk แรก

    Returns:
        dict: { text, segments, duration, language }
    """
    with open(file_path, "rb") as audio_file:
        audio_data = audio_file.read()

    def _whisper_call():
        c = _get_next_client()  # ★ สลับ key ทุกครั้งที่ retry
        return c.audio.transcriptions.create(
            file=(Path(file_path).name, audio_data),
            model=WHISPER_MODEL,
            response_format="verbose_json",
            language="th",
            temperature=0.0,
            prompt="สวัสดีครับ สวัสดีค่ะ ฮัลโหลครับ ขอบคุณที่โทรมาครับ ได้ค่ะ ได้ครับ รบกวนด้วยค่ะ ที่นอน หมอน ผ้าปูที่นอน ท็อปเปอร์ ผ้าห่ม โลตัส โอมาซ ไมดาส เบดเกียร์ ดันลอปพิลโล่ ลาลาเบด ซีนัส มารูฟ เรสโทนิค วูดฟิลด์ โลโต้โมบิลี่ อีสแมนเฮาส์ เครื่องนอน โปรโมชั่น การจัดส่ง รับประกัน",
        )

    transcription = _retry_on_rate_limit(_whisper_call)

    text = ""
    if hasattr(transcription, 'text'):
        text = transcription.text
    elif isinstance(transcription, dict):
        text = transcription.get("text", str(transcription))
    else:
        text = str(transcription)

    # ดึง segments — รองรับทั้ง object (Pydantic) และ dict format
    raw_segments = None
    if hasattr(transcription, 'segments'):
        raw_segments = transcription.segments
    elif isinstance(transcription, dict):
        raw_segments = transcription.get("segments")

    segments = []
    if raw_segments:
        for seg in raw_segments:
            # รองรับทั้ง dict และ object access
            if isinstance(seg, dict):
                seg_start = float(seg.get("start", 0))
                seg_end = float(seg.get("end", 0))
                seg_text = seg.get("text", "")
            else:
                seg_start = float(getattr(seg, 'start', 0) or 0)
                seg_end = float(getattr(seg, 'end', 0) or 0)
                seg_text = getattr(seg, 'text', "") or ""

            segments.append({
                "start": round(seg_start + time_offset, 2),
                "end": round(seg_end + time_offset, 2),
                "text": seg_text.strip(),
            })

    # ดึง duration
    duration = 0.0
    if hasattr(transcription, 'duration') and transcription.duration:
        duration = float(transcription.duration)
    elif isinstance(transcription, dict) and transcription.get("duration"):
        duration = float(transcription["duration"])
    elif segments:
        duration = segments[-1]["end"] - time_offset

    # ดึงภาษา
    language = "th"
    if hasattr(transcription, 'language') and transcription.language:
        language = transcription.language
    elif isinstance(transcription, dict):
        language = transcription.get("language", "th")

    # ถ้าไม่มี segments แต่มี text → สร้าง segment เดียวครอบทั้งหมด
    if not segments and text.strip():
        segments = [{
            "start": round(time_offset, 2),
            "end": round(time_offset + duration, 2),
            "text": text.strip(),
        }]

    return {
        "text": text,
        "segments": segments,
        "duration": duration,
        "language": language,
    }


async def groq_whisper_transcribe(file_id: str, audio_file_path: str) -> dict:
    """
    ใช้ Groq Whisper API ถอดเสียงเป็นข้อความ — รองรับ Chunking สำหรับไฟล์ยาว

    ไฟล์สั้น (<5 นาที หรือ <24MB):
        → ส่งทั้งไฟล์ไป Whisper ครั้งเดียว

    ไฟล์ยาว (>5 นาที หรือ >24MB):
        → ตัดเป็น chunk ละ 5 นาที
        → ส่ง Whisper ทีละ chunk
        → รวม transcript + segments กลับเป็นอันเดียว (ปรับ timestamp ให้ต่อเนื่อง)

    Args:
        file_id: ID ของไฟล์
        audio_file_path: path ไปยังไฟล์เสียง (.wav)
    """
    start_time = datetime.now()

    if not GROQ_AVAILABLE or not _ALL_API_KEYS:
        raise RuntimeError(
            "Groq API not configured. "
            "Set GROQ_API_KEY environment variable and install: pip install groq"
        )

    loop = asyncio.get_event_loop()

    needs_chunk = _needs_chunking(audio_file_path)
    chunk_paths = []

    try:
        if needs_chunk:
            # === CHUNKED MODE ===
            wav_info = _get_wav_info(audio_file_path)
            total_duration = wav_info.get("duration_seconds", 0)
            num_expected = math.ceil(total_duration / CHUNK_DURATION_SECONDS) if total_duration > 0 else 1
            print(f"📦 Chunking: {total_duration:.0f}s → {num_expected} chunks (ทีละ {CHUNK_DURATION_SECONDS}s)")

            chunk_paths = await loop.run_in_executor(
                None, _split_wav_to_chunks, audio_file_path, CHUNK_DURATION_SECONDS
            )

            all_text_parts = []
            all_segments = []
            total_audio_duration = 0.0
            detected_language = "th"

            for i, chunk_path in enumerate(chunk_paths):
                time_offset = i * CHUNK_DURATION_SECONDS
                print(f"  🎙️ Transcribing chunk {i+1}/{len(chunk_paths)} (offset={time_offset}s)...")

                chunk_result = await loop.run_in_executor(
                    None, _transcribe_single_file, chunk_path, time_offset
                )

                all_text_parts.append(chunk_result["text"])
                all_segments.extend(chunk_result["segments"])
                total_audio_duration += chunk_result["duration"]
                detected_language = chunk_result["language"]

            transcript_text = " ".join(all_text_parts)
            segments = all_segments
            duration = total_audio_duration
            language = detected_language

        else:
            # === SINGLE FILE MODE ===
            print(f"🎙️ Transcribing single file (no chunking needed)")
            result = await loop.run_in_executor(
                None, _transcribe_single_file, audio_file_path, 0.0
            )
            transcript_text = result["text"]
            segments = result["segments"]
            duration = result["duration"]
            language = result["language"]

    finally:
        # ลบ temp chunk files
        if chunk_paths:
            _cleanup_chunks(chunk_paths, audio_file_path)

    # === Post-process: filter + unique IDs ===
    final_segments = []
    idx = 0
    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue
        if not _is_thai_or_english(text):
            continue  # ข้าม segment ที่ไม่ใช่ภาษาไทย/อังกฤษ (Cyrillic, CJK ฯลฯ)
        # ลบคำ hallucination + อักษรแปลก
        cleaned = _clean_foreign_text(text)
        if not cleaned:
            continue
        # ★ ลบ segment ที่มีไทยน้อยกว่า 30% (มักเป็น hallucination ยาวๆ)
        thai_chars = sum(1 for ch in cleaned if ord(ch) in _THAI_RANGE)
        total_letters = sum(1 for ch in cleaned if not ch.isspace() and ch not in '.,!?;:\'"()-[]{}')
        if total_letters > 5 and thai_chars / max(total_letters, 1) < 0.3:
            print(f"  ⚠️ Filtered (low Thai %): {cleaned[:60]}...")
            continue
        final_segments.append({
            "id": idx,
            "start": seg.get("start", 0),
            "end": seg.get("end", 0),
            "text": cleaned,
        })
        idx += 1

    # รวม transcript ใหม่จาก segments ที่ผ่าน filter แล้ว
    transcript_text = " ".join(s["text"] for s in final_segments)

    processing_time = (datetime.now() - start_time).total_seconds()

    return {
        "model": WHISPER_MODEL,
        "status": "completed",
        "file_id": file_id,
        "transcript": transcript_text,
        "segments": final_segments,
        "language_detected": language,
        "language_confidence": 0.95,
        "audio_duration_seconds": round(duration, 1),
        "processing_time_seconds": round(processing_time, 2),
        "word_count": len(transcript_text.split()),
        "chunked": needs_chunk,
        "num_chunks": len(chunk_paths) if needs_chunk else 1,
        "completed_at": datetime.now().isoformat(),
    }


# =============================================================================
# STEP 2: Llama — NLP Analysis + Summary via Groq
# =============================================================================

async def groq_llama_analyze(
    file_id: str,
    transcript: str,
    segments: list = None,
) -> dict:
    """
    ใช้ Groq Llama API วิเคราะห์บทสนทนา:
    - สรุปบทสนทนา (Conversation Summary)
    - วิเคราะห์ Sentiment
    - ตรวจจับ Intent
    - สกัด Brand, Product Category, Sale Channel
    - ให้คะแนน QA
    
    หมายเหตุ: Transcription Detail ใช้ segments จาก Whisper โดยตรง (ไม่ใช่ Llama)

    Args:
        file_id: ID ของไฟล์
        transcript: ข้อความที่ถอดจาก Whisper
        segments: segments จาก Whisper (ถ้ามี)
    """
    start_time = datetime.now()

    if not GROQ_AVAILABLE or not _ALL_API_KEYS:
        raise RuntimeError("Groq API not configured.")

    loop = asyncio.get_event_loop()
    system_prompt = """คุณเป็น AI ผู้เชี่ยวชาญด้านการวิเคราะห์บทสนทนา Call Center ของบริษัทเครื่องนอน
คุณต้องทำ 2 งานพร้อมกัน แล้วส่งผลลัพธ์เป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอกจาก JSON

★ งานที่ 1: แก้ไข Transcript
- แก้คำที่สะกดผิด/ถอดผิดให้ถูกต้อง
- แก้ชื่อแบรนด์เป็นภาษาอังกฤษเสมอ (ดูรายชื่อด้านล่าง)
- ลบคำที่เป็น noise / ไม่มีความหมายออก

★ งานที่ 2: วิเคราะห์บทสนทนา
- สรุปบทสนทนา, Sentiment, Intent, Brand, Product, QA Score

★ แบรนด์ที่รองรับ (ต้องตอบเป็นชื่อภาษาอังกฤษเท่านั้น):
- โลตัส = Lotus
- โอมาซ = Omazz
- ดันลอปพิลโล่ / ดันลอป = Dunlopillo
- ไมดาส = Midas
- เบดเกียร์ / เบสเกียร์ = Bedgear
- ลาลาเบด = LaLaBed
- ซีนัส = Zinus
- อีสแมน เฮาส์ = Eastman House
- มารูฟ / มาลูฟ = Malouf
- โลโต้ โมบิลี่ = Loto Mobili
- วูดฟิลด์ = Woodfield
- เรสโทนิค = Restonic

หมวดสินค้า (ต้องตอบเป็นชื่อภาษาอังกฤษเท่านั้น):
- ที่นอน / ฟูก = Mattress
- หมอน = Pillow
- เครื่องนอน / ผ้าปู / ผ้านวม / ชุดเครื่องนอน = Bedding
- โครงเตียง / เตียง / หัวเตียง = Bed Frame
- ท็อปเปอร์ / แผ่นรองนอน = Topper
- แผ่นกันเปื้อน / ผ้ารองกันเปื้อน / กันไรฝุ่น = Protector
ช่องทางขาย: Official Store, Online, Department Store, Dealer

Intent ที่เป็นไปได้:
- สอบถามข้อมูลสินค้า
- แจ้งสินค้าชำรุด/เสียหาย
- สอบถามสถานะจัดส่ง
- สอบถามโปรโมชั่น
- สอบถามการรับประกัน
- ขอเปลี่ยนสินค้า
- ชมเชยเจ้าหน้าที่/สินค้า
- สอบถามทั่วไป
- ขอยกเลิก/คืนสินค้า"""

    user_prompt = f"""วิเคราะห์บทสนทนา Call Center ต่อไปนี้ ทำ 2 งานพร้อมกัน แล้วตอบเป็น JSON เท่านั้น:

--- บทสนทนา (จาก ASR อาจมีคำผิด) ---
{transcript}
--- จบบทสนทนา ---

ส่งผลลัพธ์เป็น JSON format ดังนี้ (ตอบเป็น JSON เท่านั้น ไม่ต้องมี markdown):
{{
  "summary_points": ["จุดสรุปที่ 1", "จุดสรุปที่ 2", "จุดสรุปที่ 3", "จุดสรุปที่ 4"],
  "summary_text": "สรุปรวมสั้นๆ 1-2 ประโยค",
  "sentiment": "positive" หรือ "neutral" หรือ "negative",
  "sentiment_score": 0.0 ถึง 1.0,
  "intent": "intent ภาษาไทย",
  "brand_names": ["แบรนด์ที่ 1", "แบรนด์ที่ 2"] หรือ ["Unknown"] (ตอบเป็น array ภาษาอังกฤษ — อาจมีหลายแบรนด์ในบทสนทนาเดียว),
  "product_category": "Mattress/Pillow/Bedding/Bed Frame/Topper/Protector หรือ Unknown",
  "sale_channel": "ช่องทาง หรือ Unknown",
  "qa_scores": {{
    "การทักทายและแนะนำตัว": 0.0-10.0,
    "การรับฟังและทำความเข้าใจปัญหา": 0.0-10.0,
    "ความถูกต้องของข้อมูลที่ให้": 0.0-10.0,
    "การเสนอทางแก้ไขที่เหมาะสม": 0.0-10.0,
    "การยืนยันความพึงพอใจก่อนวางสาย": 0.0-10.0,
    "ความสุภาพและมืออาชีพตลอดการสนทนา": 0.0-10.0
  }},
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "key_insights": "ข้อมูลเชิงลึกที่สำคัญ 1-2 ประโยค"
}}"""

    def _analyze():
        c = _get_next_client()  # ★ สลับ key อัตโนมัติ
        chat_completion = c.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=LLAMA_MODEL,
            temperature=0.1,
            max_tokens=8192,                          # ★ เพิ่มจาก 4096 เผื่อ transcript ยาว
            response_format={"type": "json_object"},
        )
        return chat_completion.choices[0].message.content

    raw_response = await loop.run_in_executor(None, lambda: _retry_on_rate_limit(_analyze))

    # Parse JSON response
    try:
        result = json.loads(raw_response)
    except json.JSONDecodeError:
        # ลอง extract JSON จาก response
        json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            raise ValueError(f"Cannot parse Llama response as JSON: {raw_response[:200]}")

    # Extract & normalize fields
    sentiment = result.get("sentiment", "neutral").lower()
    sentiment_score = float(result.get("sentiment_score", 0.5))

    qa_scores = result.get("qa_scores", {})
    qa_values = [float(v) for v in qa_scores.values() if isinstance(v, (int, float))]
    final_qa = round(sum(qa_values) / max(len(qa_values), 1), 2)

    # CSAT prediction based on QA
    if final_qa >= 8.5:
        csat = 5
    elif final_qa >= 7.0:
        csat = 4
    elif final_qa >= 5.5:
        csat = 3
    elif final_qa >= 4.0:
        csat = 2
    else:
        csat = 1

    # Grade
    grade = _score_to_grade(final_qa)

    # Action items based on analysis
    action_items = []
    if sentiment == "negative":
        action_items.append("🔴 ติดตามลูกค้าภายใน 24 ชั่วโมง")
    intent_text = result.get("intent", "")
    if "ยกเลิก" in intent_text or "คืน" in intent_text:
        action_items.append("⚠️ ส่งต่อทีม Retention")
    if final_qa < 6.0:
        action_items.append("📋 แจ้ง Supervisor ตรวจสอบคุณภาพ")
    if not action_items:
        action_items.append("✅ ปิดเคสได้")

    processing_time = (datetime.now() - start_time).total_seconds()

    return {
        "model": LLAMA_MODEL,
        "status": "completed",
        "file_id": file_id,
        "corrected_transcript": result.get("corrected_transcript", transcript),  # ★ transcript ที่แก้แล้ว
        "summary_text": result.get("summary_text", ""),
        "summary_points": result.get("summary_points", []),
        "sentiment": sentiment,
        "sentiment_score": sentiment_score,
        "sentiment_confidence": sentiment_score,
        "intent": result.get("intent", "สอบถามทั่วไป"),
        "brand_name": _parse_brand_names(result)[0] if _parse_brand_names(result) else "Unknown",
        "brand_names": _parse_brand_names(result),
        "product_category": result.get("product_category", "Unknown"),
        "sale_channel": result.get("sale_channel", "Unknown"),
        "qa_scoring": {
            "final_score": final_qa,
            "max_score": 10.0,
            "grade": grade,
            "criteria_breakdown": qa_scores,
        },
        "csat_predicted": csat,
        "keywords": result.get("keywords", []),
        "key_insights": result.get("key_insights", ""),
        "action_items": action_items,
        "processing_time_seconds": round(processing_time, 2),
        "completed_at": datetime.now().isoformat(),
    }


# =============================================================================
# STEP 2.6: Llama — Deep Customer Insight (Second-Pass)
# =============================================================================

async def groq_llama_deep_insight(
    file_id: str,
    transcript: str,
    base_analysis: dict = None,
) -> dict:
    """
    Second-pass AI analysis: ขุดลึก customer insight จาก transcript
    โดยไม่ rewrite ผลการวิเคราะห์เดิม — แค่เพิ่มข้อมูล insight ให้ละเอียดขึ้น

    Returns:
        {
            "customer_need": str,
            "pain_point": str,
            "root_cause": str,
            "expectation": str,
            "risk_level": "low" | "medium" | "high",
            "recommended_action": str,   # detailed text
            "recommended_steps": [str],  # หั่น recommended_action เป็น list (post-process)
            "confidence": int (0-100),
        }
    """
    start_time = datetime.now()

    if not GROQ_AVAILABLE or not _ALL_API_KEYS:
        return {
            "customer_need": "",
            "pain_point": "",
            "root_cause": "",
            "expectation": "",
            "risk_level": "low",
            "recommended_action": "",
            "recommended_steps": [],
            "confidence": 0,
            "status": "skipped",
        }

    loop = asyncio.get_event_loop()

    # ★ Prompt ตาม spec ที่ user กำหนด
    system_prompt = """You are a Thai customer insight analyst.

Your task is to extract the customer's real need from the conversation.

Do NOT rewrite or change the existing base analysis.
Do NOT summarize the conversation again.
Focus only on deeper customer insight.
Write every text field in Thai. Keep brand names, product names, model names,
order numbers, and serial numbers exactly as they appear.
Only risk_level must stay in English as one of: low, medium, high.
Return JSON only:
{
  "customer_need": "",
  "pain_point": "",
  "root_cause": "",
  "expectation": "",
  "risk_level": "low|medium|high",
  "recommended_action": "",
  "confidence": 0
}

Rules:
- customer_need = สิ่งที่ลูกค้าต้องการจริงในประโยคเดียวที่รวมบริบท (เช่น "การคืนเงินที่ถูกต้องและรวดเร็วเนื่องจากปัญหาการชำระเงินที่ซับซ้อน") โดยควรรวม: สิ่งที่ลูกค้าต้องการ + เหตุผล/ปัญหาที่ทำให้ต้องการ
- pain_point = ปัญหาหลักที่ลูกค้ากำลังเจอ (สั้น ๆ)
- root_cause = สาเหตุที่น่าจะทำให้เกิดปัญหา (สั้น ๆ)
- expectation = สิ่งที่ลูกค้าคาดหวังจากบริษัท (สั้น ๆ)
- recommended_action = สิ่งที่บริษัทควรทำต่ออย่างเป็นขั้นตอน (ใส่เป็นข้อ ๆ ขึ้นต้นด้วยตัวเลข 1. 2. 3.)
- confidence = 0 to 100
- Be specific and actionable.
- Avoid vague answers like "ปรับปรุงบริการ" or "ดูแลลูกค้าให้ดีขึ้น".
- Use concise Thai that a customer service team can act on immediately.
- Return valid JSON only"""

    # สร้าง user prompt จาก transcript + base analysis เพื่อให้มี context
    base_context = ""
    if base_analysis:
        base_context = f"""
=== ผลวิเคราะห์เดิม (ใช้เป็นบริบทเท่านั้น ห้ามแก้ไข) ===
- Intent: {base_analysis.get('intent', '-')}
- Sentiment: {base_analysis.get('sentiment', '-')}
- Brand: {', '.join(base_analysis.get('brand_names', []) or ['-'])}
- QA Score: {base_analysis.get('qa_scoring', {}).get('final_score', '-')}/10
- Summary: {base_analysis.get('summary_text', '-')}
"""

    user_prompt = f"""{base_context}
=== Transcript ===
{transcript}

=== Task ===
วิเคราะห์ลูกค้าเชิงลึก ส่งกลับ JSON ตามรูปแบบที่กำหนด"""

    def _analyze():
        c = _get_next_client()
        chat_completion = c.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=LLAMA_MODEL,
            temperature=0.2,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )
        return chat_completion.choices[0].message.content

    try:
        raw_response = await loop.run_in_executor(None, lambda: _retry_on_rate_limit(_analyze))
    except Exception as e:
        print(f"⚠️ Deep insight failed: {e}")
        return {
            "customer_need": "",
            "pain_point": "",
            "root_cause": "",
            "expectation": "",
            "risk_level": "low",
            "recommended_action": "",
            "recommended_steps": [],
            "confidence": 0,
            "status": "failed",
            "error": str(e),
        }

    # Parse JSON
    try:
        result = json.loads(raw_response)
    except json.JSONDecodeError:
        m = re.search(r'\{.*\}', raw_response, re.DOTALL)
        if not m:
            print(f"⚠️ Deep insight: cannot parse JSON")
            return {
                "customer_need": "",
                "pain_point": "",
                "root_cause": "",
                "expectation": "",
                "risk_level": "low",
                "recommended_action": "",
                "recommended_steps": [],
                "confidence": 0,
                "status": "parse_error",
            }
        result = json.loads(m.group())

    # Normalize fields
    risk = (result.get("risk_level", "low") or "low").lower()
    if risk not in ("low", "medium", "high"):
        risk = "low"

    # ★ recommended_action — รองรับทั้งกรณีที่ AI ส่งเป็น string หรือ list
    raw_action_field = result.get("recommended_action", "") or ""
    if isinstance(raw_action_field, list):
        # AI ส่งกลับเป็น list — แปลงเป็น string โดย join + เก็บ list ไว้เป็น steps
        steps_from_list = [str(s).strip().lstrip("0123456789.)-•* ").strip() for s in raw_action_field if s and str(s).strip()]
        raw_action = " ".join(f"{i+1}. {s}" for i, s in enumerate(steps_from_list))
        steps: list = steps_from_list
    else:
        raw_action = str(raw_action_field).strip()
        # หั่น recommended_action เป็น steps — แยกตาม "1." "2." หรือ newline
        steps = []
        if raw_action:
            # ลอง split ด้วย numbered pattern ก่อน: "1. xxx 2. yyy" หรือบรรทัด "1. xxx\n2. yyy"
            numbered = re.split(r'(?:^|\s|\n)(?=\d+[.)\s])', raw_action)
            steps = [s.strip().lstrip("0123456789.)-• ").strip() for s in numbered if s.strip()]
            # ถ้า split ไม่ได้ ลอง split ด้วย newline
            if len(steps) <= 1:
                steps = [s.strip().lstrip("•-* ").strip() for s in raw_action.split("\n") if s.strip()]
            # ถ้ายัง 1 ก้อน เก็บไว้ทั้งก้อน
            if not steps:
                steps = [raw_action]

    confidence = int(result.get("confidence", 0) or 0)
    confidence = max(0, min(100, confidence))

    processing_time = (datetime.now() - start_time).total_seconds()
    print(f"💡 Deep insight done: risk={risk} confidence={confidence} steps={len(steps)} ({processing_time:.1f}s)")

    # helper: ถ้า AI ส่ง list มาในช่อง text → join เป็น string
    def _ensure_str(v):
        if v is None:
            return ""
        if isinstance(v, list):
            return " ".join(str(x) for x in v if x).strip()
        return str(v).strip()

    return {
        "customer_need": _ensure_str(result.get("customer_need")),
        "pain_point": _ensure_str(result.get("pain_point")),
        "root_cause": _ensure_str(result.get("root_cause")),
        "expectation": _ensure_str(result.get("expectation")),
        "risk_level": risk,
        "recommended_action": raw_action,
        "recommended_steps": steps,
        "confidence": confidence,
        "status": "completed",
        "processing_time_seconds": round(processing_time, 2),
    }


# =============================================================================
# STEP 2.5: Llama — แก้ไข Transcript ให้ถูกต้อง
# =============================================================================

# =============================================================================
# STEP 2.6: Llama — PII Masking (Privacy Layer)
# =============================================================================

async def mask_pii_with_llama(
    file_id: str,
    transcript: str,
) -> dict:
    """
    Mask ข้อมูลส่วนตัว (PII) ก่อนส่ง transcript ไปวิเคราะห์ลึก
    ตอนนี้ mask: ชื่อบุคคล + เบอร์โทรศัพท์

    Returns:
        {
            "masked_transcript": str,        # text ที่ mask แล้ว (เต็มความยาว)
            "mask_count": {"name": int, "phone": int},
            "status": "completed" | "skipped" | "failed",
        }

    NOTE: ฟังก์ชันนี้ไม่แก้ raw transcript ใน DB — แค่คืน masked version
    NOTE: รองรับ transcript ยาวด้วย chunked processing (แบ่งชิ้นละ ~2000 chars)
    """
    start_time = datetime.now()

    if not GROQ_AVAILABLE or not _ALL_API_KEYS:
        return {
            "masked_transcript": transcript,
            "mask_count": {"name": 0, "phone": 0},
            "status": "skipped",
        }

    if not transcript or not transcript.strip():
        return {
            "masked_transcript": transcript,
            "mask_count": {"name": 0, "phone": 0},
            "status": "skipped",
        }

    # ★ Split transcript เป็น chunks ถ้ายาว
    # ภาษาไทย ~3 chars/token → 2000 chars ≈ 700 tokens input + 700 tokens output = 1400 tokens
    # max_tokens=4096 มีที่เหลือเฟือ ป้องกัน output ถูกตัด
    CHUNK_SIZE = 2000
    chunks = _split_text_for_masking(transcript, CHUNK_SIZE)

    masked_parts = []
    total_name_count = 0
    total_phone_count = 0
    has_failure = False

    for i, chunk in enumerate(chunks):
        chunk_result = await _mask_single_chunk(chunk, file_id, chunk_idx=i+1, total_chunks=len(chunks))
        masked_parts.append(chunk_result["masked"])
        total_name_count += chunk_result["names"]
        total_phone_count += chunk_result["phones"]
        if chunk_result["failed"]:
            has_failure = True
        # delay เล็กน้อยระหว่าง chunks
        if i < len(chunks) - 1:
            await asyncio.sleep(0.5)

    # ★ ต่อ chunks กลับเข้าด้วยกัน
    masked_transcript = "".join(masked_parts)

    # Safety check: ถ้า output สั้นกว่า input มาก > 30% → fallback (น่าจะมี error)
    if len(masked_transcript) < len(transcript) * 0.7:
        print(f"⚠️ PII mask output suspicious: input={len(transcript)} chars, output={len(masked_transcript)} chars")
        print(f"   Fallback to original transcript")
        return {
            "masked_transcript": transcript,
            "mask_count": {"name": 0, "phone": 0},
            "status": "failed_length_mismatch",
        }

    processing_time = (datetime.now() - start_time).total_seconds()
    status = "partial" if has_failure else "completed"
    print(f"🔒 PII masked ({len(chunks)} chunks): names={total_name_count}, phones={total_phone_count} ({processing_time:.1f}s) [{status}]")

    return {
        "masked_transcript": masked_transcript,
        "mask_count": {"name": total_name_count, "phone": total_phone_count},
        "status": status,
        "processing_time_seconds": round(processing_time, 2),
        "chunks_processed": len(chunks),
    }


def _split_text_for_masking(text: str, chunk_size: int = 2000) -> list[str]:
    """
    แบ่ง text เป็น chunks โดยพยายามตัดที่ขอบประโยค (จุด/ตัวอักษรวรรค)
    ไม่ตัดกลางคำ
    """
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunks.append(text[start:])
            break

        # หาจุดตัดที่ดี: ภายใน 200 chars ก่อน end ขอบประโยค/space
        search_start = max(start, end - 200)
        cut_at = end
        for marker in [' ', '\n', 'ครับ', 'ค่ะ', '. ', '? ', '! ']:
            idx = text.rfind(marker, search_start, end)
            if idx != -1 and idx > search_start:
                cut_at = idx + len(marker)
                break

        chunks.append(text[start:cut_at])
        start = cut_at

    return chunks


async def _mask_single_chunk(chunk: str, file_id: str, chunk_idx: int, total_chunks: int) -> dict:
    """Mask 1 chunk — คืน plain text (ไม่ใช่ JSON เพื่อประหยัด tokens)"""
    loop = asyncio.get_event_loop()

    system_prompt = """You are a Thai PII masking tool.

Replace these in the input text:
- Personal names (ชื่อคน เช่น สมศรี, สมชาย, John) → [NAME]
- Phone numbers (เบอร์โทร 8-12 หลัก รวม dash) → [PHONE]

KEEP everything else exactly the same:
- Same length, same words, same order
- Keep brand names (Lotus, Bedgear, Dunlopillo, Midas, Topper)
- Keep titles (คุณ, นาย, นาง, พี่, น้อง) — only mask the name after them
- Keep agent codes (AGENT-104), product codes, dates, prices
- Keep ALL other text exactly as is

Return ONLY the masked text — no JSON, no markdown, no explanation."""

    user_prompt = f"Mask PII in this text:\n\n{chunk}"

    def _mask():
        c = _get_next_client()
        chat_completion = c.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=LLAMA_MODEL,
            temperature=0.0,
            max_tokens=4096,
            # ★ ไม่ใช้ response_format JSON — ใช้ plain text ลด overhead
        )
        return chat_completion.choices[0].message.content

    try:
        raw_response = await loop.run_in_executor(None, lambda: _retry_on_rate_limit(_mask))
    except Exception as e:
        print(f"  ⚠️ Chunk {chunk_idx}/{total_chunks} mask failed: {e} — using original")
        return {
            "masked": chunk,           # ★ fallback ใช้ original
            "names": 0,
            "phones": 0,
            "failed": True,
        }

    masked = (raw_response or "").strip()

    # Safety: ถ้า output ว่างหรือสั้นผิดปกติ → ใช้ original
    if not masked or len(masked) < len(chunk) * 0.5:
        print(f"  ⚠️ Chunk {chunk_idx}/{total_chunks} output suspicious (in={len(chunk)} out={len(masked)}) — using original")
        return {
            "masked": chunk,
            "names": 0,
            "phones": 0,
            "failed": True,
        }

    # นับ tag ที่ใส่
    names = masked.count("[NAME]")
    phones = masked.count("[PHONE]")

    return {
        "masked": masked,
        "names": names,
        "phones": phones,
        "failed": False,
    }


# =============================================================================
# STEP 2.5: Llama — แก้ไข Transcript (Chunked Version)
# =============================================================================

async def fix_transcript_chunked(
    file_id: str,
    transcript: str,
) -> dict:
    """
    แก้ไข transcript จาก Whisper/Typhoon โดยแบ่ง chunks ทำทีละชิ้น
    - แก้คำผิด ชื่อแบรนด์ ลบ noise
    - Output เป็น plain text (ไม่ใช่ JSON) — ลด token overhead
    - รองรับ transcript ยาวเป็น 60+ นาที

    Returns:
        {
            "corrected_transcript": str,
            "status": "completed" | "partial" | "skipped" | "failed",
            "chunks_processed": int,
        }
    """
    start_time = datetime.now()

    if not GROQ_AVAILABLE or not _ALL_API_KEYS:
        return {
            "corrected_transcript": transcript,
            "status": "skipped",
            "chunks_processed": 0,
        }

    if not transcript or not transcript.strip():
        return {
            "corrected_transcript": transcript,
            "status": "skipped",
            "chunks_processed": 0,
        }

    # แบ่ง chunks ขนาด 2000 chars (ตัดที่ขอบประโยค)
    CHUNK_SIZE = 2000
    chunks = _split_text_for_masking(transcript, CHUNK_SIZE)

    fixed_parts = []
    has_failure = False

    for i, chunk in enumerate(chunks):
        result = await _fix_single_chunk(chunk, file_id, chunk_idx=i+1, total_chunks=len(chunks))
        fixed_parts.append(result["fixed"])
        if result["failed"]:
            has_failure = True
        if i < len(chunks) - 1:
            await asyncio.sleep(0.5)

    fixed_transcript = "".join(fixed_parts)

    # Safety: ถ้าผลลัพธ์สั้นกว่า input มาก → fallback
    if len(fixed_transcript) < len(transcript) * 0.7:
        print(f"⚠️ Fix transcript output suspicious: in={len(transcript)} out={len(fixed_transcript)} chars — fallback")
        return {
            "corrected_transcript": transcript,
            "status": "failed_length_mismatch",
            "chunks_processed": len(chunks),
        }

    processing_time = (datetime.now() - start_time).total_seconds()
    status = "partial" if has_failure else "completed"
    print(f"✏️ Transcript fixed ({len(chunks)} chunks, {processing_time:.1f}s) [{status}]")

    return {
        "corrected_transcript": fixed_transcript,
        "status": status,
        "chunks_processed": len(chunks),
        "processing_time_seconds": round(processing_time, 2),
    }


async def _fix_single_chunk(chunk: str, file_id: str, chunk_idx: int, total_chunks: int) -> dict:
    """แก้ไข 1 chunk — คืน plain text"""
    loop = asyncio.get_event_loop()

    system_prompt = """คุณเป็น AI แก้ไขข้อความภาษาไทยจาก ASR (Speech-to-Text)

หน้าที่:
- แก้คำผิด/สะกดผิด (เช่น "ครับ จากท" → "ครับ จากทาง")
- แก้ชื่อแบรนด์ให้ถูกต้อง: Lotus, Bedgear, Dunlopillo, Midas, Topper, Omazz
- ลบ noise/คำต่างประเทศที่หลุดมา
- เติมเครื่องหมายวรรคตอนเล็กน้อย
- เพิ่มเว้นวรรคให้อ่านง่ายขึ้น

ข้อห้าม:
- ห้ามย่อ ห้ามสรุป ห้ามแปล ห้ามตัดข้อความออก
- ห้ามเพิ่มข้อความใหม่ที่ไม่มีใน input
- รักษาความยาวให้ใกล้เคียงเดิม

ตอบเป็น plain text เท่านั้น — ไม่มี JSON, ไม่มี markdown, ไม่มีคำอธิบาย"""

    user_prompt = f"แก้ไข transcript นี้:\n\n{chunk}"

    def _fix():
        c = _get_next_client()
        chat_completion = c.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=LLAMA_MODEL,
            temperature=0.1,
            max_tokens=4096,
        )
        return chat_completion.choices[0].message.content

    try:
        raw_response = await loop.run_in_executor(None, lambda: _retry_on_rate_limit(_fix))
    except Exception as e:
        print(f"  ⚠️ Fix chunk {chunk_idx}/{total_chunks} failed: {e} — using original")
        return {"fixed": chunk, "failed": True}

    fixed = (raw_response or "").strip()

    # Safety
    if not fixed or len(fixed) < len(chunk) * 0.5:
        print(f"  ⚠️ Fix chunk {chunk_idx}/{total_chunks} output suspicious (in={len(chunk)} out={len(fixed)}) — using original")
        return {"fixed": chunk, "failed": True}

    return {"fixed": fixed, "failed": False}


# =============================================================================
# STEP 2.5 (Legacy): Llama — แก้ไข Transcript ให้ถูกต้อง
# =============================================================================

async def groq_llama_fix_transcript(
    file_id: str,
    transcript: str,
    segments: list = None,
) -> dict:
    """
    ใช้ Llama แก้ไข transcript ที่ Whisper ถอดมา:
    - แก้คำผิด / สะกดผิด
    - แก้คำที่ถอดไม่ครบ (เช่น "ครับ จากท" → "ครับ จากทาง")
    - แก้ชื่อแบรนด์/สินค้าให้ถูกต้อง
    - ลบส่วนที่เป็น noise/hallucination ที่ filter ไม่หลุด
    - เติมเครื่องหมายวรรคตอนที่เหมาะสม

    Args:
        file_id: ID ของไฟล์
        transcript: transcript ดิบจาก Whisper (ผ่าน filter แล้ว)
        segments: segments จาก Whisper
    """
    start_time = datetime.now()

    if not GROQ_AVAILABLE or not GROQ_API_KEY:
        raise RuntimeError("Groq API not configured.")

    loop = asyncio.get_event_loop()

    # สร้าง segment text พร้อม timestamp สำหรับ Llama
    segments_text = ""
    if segments:
        for seg in segments:
            start = seg.get("start", 0)
            end = seg.get("end", 0)
            text = seg.get("text", "")
            segments_text += f"[{start:.1f}s - {end:.1f}s] {text}\n"

    system_prompt = """คุณเป็น AI ผู้เชี่ยวชาญด้านการแก้ไขบทสนทนาภาษาไทยจากระบบถอดเสียงอัตโนมัติ (ASR)

งานของคุณ:
1. แก้คำที่สะกดผิด/ถอดผิดให้ถูกต้อง (เช่น "เถะมาศ" → "ที่โทรมา", "นอนโรตักข้า" → "นอนโรตักซ์")
2. ★ แก้ชื่อแบรนด์ให้ถูกต้อง — ถ้าพบชื่อแบรนด์เป็นภาษาไทย ให้แปลงเป็นชื่อภาษาอังกฤษเสมอ:
   - โลตัส → Lotus
   - โอมาซ → Omazz
   - ดันลอปพิลโล่ / ดันลอป → Dunlopillo
   - ไมดาส → Midas
   - เบดเกียร์ / เบสเกียร์ / เบดเกีย → Bedgear
   - ลาลาเบด → LaLaBed
   - ซีนัส → Zinus
   - อีสแมน เฮาส์ / อีสแมนเฮ้าส์ → Eastman House
   - มารูฟ / มาลูฟ → Malouf
   - โลโต้ โมบิลี่ / โลโตโมบิลี่ → Loto Mobili
   - วูดฟิลด์ → Woodfield
   - เรสโทนิค / เรสโทนิก → Restonic
3. แก้ชื่อสินค้าให้ถูกต้อง — ถ้าพบชื่อภาษาไทย ให้แปลงเป็นภาษาอังกฤษเสมอ:
   - ที่นอน / ฟูก → Mattress
   - หมอน → Pillow
   - เครื่องนอน / ผ้าปู / ผ้านวม / ชุดเครื่องนอน → Bedding
   - โครงเตียง / เตียง / หัวเตียง → Bed Frame
   - ท็อปเปอร์ / แผ่นรองนอน → Topper
   - แผ่นกันเปื้อน / ผ้ารองกันเปื้อน / กันไรฝุ่น → Protector
4. ลบคำที่ไม่มีความหมาย / เป็น noise ออก
5. เติมคำที่หายไปถ้าเดาได้จาก context (เช่น "ครับ จากท" → "ครับ จากทาง")
6. ห้ามเพิ่มเนื้อหาใหม่ที่ไม่ได้อยู่ใน transcript เดิม — แก้เท่าที่จำเป็น

ตอบเป็น JSON เท่านั้น:
{
  "corrected_segments": [
    {"id": 0, "start": 0.0, "end": 1.5, "text": "ข้อความที่แก้แล้ว"},
    ...
  ],
  "corrections_made": ["อธิบายสิ่งที่แก้ทีละจุด"]
}"""

    user_prompt = f"""แก้ไข transcript จากระบบถอดเสียง Call Center ต่อไปนี้:

--- Transcript (พร้อม timestamp) ---
{segments_text}
--- จบ Transcript ---

กรุณา:
1. แก้คำผิด/สะกดผิดทุกจุด
2. แก้ชื่อแบรนด์/สินค้าให้ถูก
3. ลบ noise ออก
4. เก็บ timestamp (start, end) ไว้เหมือนเดิม
5. ตอบเป็น JSON เท่านั้น"""

    def _fix():
        c = _get_next_client()  # ★ สลับ key อัตโนมัติ
        chat_completion = c.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=LLAMA_MODEL,
            temperature=0.1,
            max_tokens=8192,                          # ★ เพิ่มจาก 4096
            response_format={"type": "json_object"},
        )
        return chat_completion.choices[0].message.content

    raw_response = await loop.run_in_executor(None, lambda: _retry_on_rate_limit(_fix))

    # Parse JSON response
    try:
        result = json.loads(raw_response)
    except json.JSONDecodeError:
        json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            # ถ้า parse ไม่ได้ → ใช้ transcript เดิม
            print(f"  ⚠️ Llama fix parse failed, using original transcript")
            return {
                "corrected_transcript": transcript,
                "corrected_segments": segments or [],
                "corrections_made": [],
                "processing_time_seconds": 0,
                "fix_applied": False,
            }

    # ดึง corrected segments
    corrected_segments = result.get("corrected_segments", [])
    corrections = result.get("corrections_made", [])

    # สร้าง transcript ใหม่จาก corrected segments
    if corrected_segments:
        corrected_transcript = " ".join(
            seg.get("text", "").strip()
            for seg in corrected_segments
            if seg.get("text", "").strip()
        )
        # อัปเดต segments ให้มี format เดียวกับ Whisper
        final_segments = []
        for i, seg in enumerate(corrected_segments):
            text = seg.get("text", "").strip()
            if not text:
                continue
            final_segments.append({
                "id": i,
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
                "text": text,
            })
    else:
        corrected_transcript = transcript
        final_segments = segments or []

    processing_time = (datetime.now() - start_time).total_seconds()

    return {
        "corrected_transcript": corrected_transcript,
        "corrected_segments": final_segments,
        "corrections_made": corrections,
        "processing_time_seconds": round(processing_time, 2),
        "fix_applied": True,
    }


# =============================================================================
# STEP 3: Full Pipeline — Whisper → Llama (Fix + Analyze ใน call เดียว)
# =============================================================================

async def run_groq_analysis_pipeline(
    file_id: str,
    audio_file_path: str,
    on_step_complete=None,
) -> dict:
    """
    Full AI Pipeline (2 Steps — เร็วขึ้น ชน rate limit น้อยลง):
    1. Whisper  — ถอดเสียงเป็นข้อความ
    2. Llama    — แก้ transcript + วิเคราะห์ + สรุป (รวมใน call เดียว)

    Args:
        file_id: ID ของไฟล์
        audio_file_path: path ไปยังไฟล์เสียง
        on_step_complete: callback (optional)
    """
    pipeline_start = datetime.now()

    # --- Step 1: Whisper Transcription ---
    print(f"🚀 Pipeline START: {file_id}")
    print(f"  Step 1/2: Whisper (Speech-to-Text)...")

    whisper_result = await groq_whisper_transcribe(
        file_id=file_id,
        audio_file_path=audio_file_path,
    )

    print(f"  ✅ Step 1 done: {whisper_result['word_count']} words, "
          f"{whisper_result['audio_duration_seconds']}s audio")

    if on_step_complete:
        await on_step_complete("whisper", whisper_result)

    # --- Step 1.5: Fix Transcript (chunked) ---
    # ★ แก้คำผิด/ลบ noise แบบ chunked → รองรับเสียงยาว
    raw_transcript_from_whisper = whisper_result["transcript"]

    await asyncio.sleep(DELAY_BETWEEN_STEPS)
    print(f"  Step 1.5/4: Fix Transcript (chunked)...")
    fix_result = await fix_transcript_chunked(
        file_id=file_id,
        transcript=raw_transcript_from_whisper,
    )
    fixed_transcript = fix_result["corrected_transcript"]
    print(f"  ✅ Step 1.5 done: {fix_result['status']}")

    # --- Step 2: PII Masking (chunked) ---
    await asyncio.sleep(DELAY_BETWEEN_STEPS)
    print(f"  Step 2/4: PII Masking (chunked)...")
    mask_result = await mask_pii_with_llama(
        file_id=file_id,
        transcript=fixed_transcript,
    )
    masked_transcript = mask_result["masked_transcript"]
    print(f"  ✅ Step 2 done: {mask_result['mask_count']}")

    # --- Step 3: Llama Analyze (ใช้ masked + ไม่ต้องคืน transcript ใน JSON) ---
    await asyncio.sleep(DELAY_BETWEEN_STEPS)
    print(f"  Step 3/4: Llama Analyze...")

    llama_result = await groq_llama_analyze(
        file_id=file_id,
        transcript=masked_transcript,
        segments=whisper_result.get("segments", []),
    )

    # ★ corrected_transcript ใช้ masked (ผ่าน fix แล้ว + mask แล้ว) — frontend แสดงตัวนี้
    # ไม่ใช้ corrected_transcript จาก analyze แล้ว (ไม่ต้องคืนใน JSON)
    corrected_transcript = masked_transcript

    whisper_result["transcript_original"] = raw_transcript_from_whisper
    whisper_result["transcript_fixed"] = fixed_transcript
    whisper_result["transcript_masked"] = masked_transcript
    whisper_result["transcript"] = corrected_transcript
    whisper_result["transcript_corrected"] = True
    whisper_result["pii_mask_count"] = mask_result["mask_count"]

    print(f"  ✅ Step 3 done: sentiment={llama_result['sentiment']}, "
          f"QA={llama_result['qa_scoring']['final_score']}, "
          f"brand={llama_result['brand_name']}")

    if on_step_complete:
        await on_step_complete("llama", llama_result)

    # ===== Step 4: Deep Customer Insight =====
    await asyncio.sleep(DELAY_BETWEEN_STEPS)
    print(f"  Step 4/4: Deep Customer Insight...")
    deep_insight = await groq_llama_deep_insight(
        file_id=file_id,
        transcript=corrected_transcript,
        base_analysis=llama_result,
    )
    print(f"  ✅ Step 4 done: risk={deep_insight.get('risk_level')}, confidence={deep_insight.get('confidence')}")

    pipeline_duration = (datetime.now() - pipeline_start).total_seconds()
    print(f"🏁 Pipeline DONE: {pipeline_duration:.1f}s total")

    return {
        "file_id": file_id,
        "pipeline_status": "completed",
        "pipeline_duration_seconds": round(pipeline_duration, 2),
        "completed_at": datetime.now().isoformat(),
        "summary": {
            "transcript": corrected_transcript,
            "language": whisper_result["language_detected"],
            "sentiment": llama_result["sentiment"],
            "sentiment_confidence": llama_result["sentiment_confidence"],
            "intent": llama_result["intent"],
            "qa_score": llama_result["qa_scoring"]["final_score"],
            "qa_grade": llama_result["qa_scoring"]["grade"],
            "csat_predicted": llama_result["csat_predicted"],
            "summary_text": llama_result["summary_text"],
            "summary_points": llama_result["summary_points"],
            "action_items": llama_result["action_items"],
            "brand_name": llama_result["brand_name"],
            "brand_names": llama_result.get("brand_names", []),
            "product_category": llama_result["product_category"],
            "sale_channel": llama_result["sale_channel"],
            "deep_insight": deep_insight,
        },
        "model_results": {
            "whisper": whisper_result,
            "llama": llama_result,
            "deep_insight": deep_insight,
        },
    }


# =============================================================================
# Helpers
# =============================================================================

# =============================================================================
# Brand Whitelist + Normalization
# =============================================================================

# ★ Brand ที่อนุญาต — รายชื่อ canonical (ต้องตรงกับใน Llama prompt)
ALLOWED_BRANDS = {
    "Lotus", "Bedgear", "Dunlopillo", "Midas", "Topper", "Omazz",
    "LaLaBed", "Zinus", "Eastman House", "Malouf", "Loto Mobili",
    "Woodfield", "Restonic",
    "Slumberland", "Synda", "Theraflex", "Serta", "Sealy", "Simmons",
}

# ★ คำที่ Whisper/Llama มักถอดผิด → canonical brand
# เพิ่มตัวสะกดผิดที่เคยเจอที่นี่ — สามารถเพิ่มได้เรื่อยๆ
BRAND_ALIASES = {
    # Dunlopillo aliases (Whisper ถอดผิดเป็น...)
    "daloxxfiro": "Dunlopillo",
    "danlopilo":  "Dunlopillo",
    "dunlopilo":  "Dunlopillo",
    "dunlop":     "Dunlopillo",
    "dunlopi":    "Dunlopillo",
    "dunlopillow":"Dunlopillo",
    "ดันลอป":     "Dunlopillo",
    "ดันลอปิลโล": "Dunlopillo",
    "ดันลอปปิลโล":"Dunlopillo",
    # Lotus aliases
    "โลตัส":      "Lotus",
    # Bedgear aliases
    "เบ็ดเกียร์": "Bedgear",
    "bedgea":     "Bedgear",
    "betgear":    "Bedgear",
    # Midas
    "ไมดาส":      "Midas",
    # Topper
    "ท็อปเปอร์":  "Topper",
    # Omazz
    "โอมาซ":      "Omazz",
    "omaz":       "Omazz",
}


def _normalize_brand(name: str) -> str | None:
    """
    Normalize brand name:
    - ถ้า exact match กับ canonical → คืนเลย
    - ถ้าตรงกับ alias (case-insensitive) → คืน canonical
    - ถ้าใกล้เคียง canonical (Levenshtein-ish ratio > 0.7) → คืน canonical
    - ถ้าไม่ตรงเลย → คืน None (ถูกกรองออก)
    """
    if not name or not isinstance(name, str):
        return None

    cleaned = name.strip()
    if not cleaned or cleaned.lower() == "unknown":
        return None

    cleaned_lower = cleaned.lower()

    # 1. Exact match ใน allowed list (case-insensitive)
    for brand in ALLOWED_BRANDS:
        if cleaned_lower == brand.lower():
            return brand

    # 2. ตรงกับ alias
    if cleaned_lower in BRAND_ALIASES:
        return BRAND_ALIASES[cleaned_lower]

    # 3. Fuzzy match — ดูความใกล้เคียง prefix
    # เช่น "DUNLO" → "Dunlopillo" (prefix 5 ตัว match)
    for brand in ALLOWED_BRANDS:
        brand_lower = brand.lower()
        # prefix match อย่างน้อย 4 ตัวขึ้นไป + ความยาวใกล้กัน
        if len(cleaned_lower) >= 4 and len(brand_lower) >= 4:
            # เริ่มเหมือนกัน 4 ตัวขึ้นไป
            if cleaned_lower[:4] == brand_lower[:4]:
                return brand
            # หรือ brand อยู่ใน cleaned (เช่น "DUNLOPILOW" contains "dunlop")
            if brand_lower in cleaned_lower or cleaned_lower in brand_lower:
                return brand

    # 4. Fuzzy character ratio (similarity > 70%)
    for brand in ALLOWED_BRANDS:
        sim = _similarity_ratio(cleaned_lower, brand.lower())
        if sim >= 0.7:
            return brand

    # ไม่ตรงเลย → ถือว่าไม่ใช่ brand ที่อนุญาต
    return None


def _similarity_ratio(a: str, b: str) -> float:
    """คำนวณความใกล้เคียงของ 2 strings ด้วย difflib (0.0 - 1.0)"""
    from difflib import SequenceMatcher
    return SequenceMatcher(None, a, b).ratio()


def _parse_brand_names(result: dict) -> list:
    """
    Parse brand จาก Llama response — รองรับทั้ง array และ string
    + Normalize ตาม whitelist (กรองคำที่ Whisper ถอดผิด เช่น DALOXXFIRO)

    Llama อาจตอบเป็น:
    - brand_names: ["Lotus", "Omazz"]     → array (ต้องการ)
    - brand_name: "Lotus"                  → string เดี่ยว (backward compat)
    - brand_name: "Lotus, Omazz"           → string หลายแบรนด์คั่นด้วย comma
    """
    raw_brands = []

    # ลอง brand_names (array) ก่อน
    names = result.get("brand_names")
    if isinstance(names, list) and names:
        # flatten ถ้า AI ส่ง list-in-list มา + บังคับเป็น string
        for n in names:
            if isinstance(n, list):
                raw_brands.extend(str(x) for x in n if x)
            elif n is not None:
                raw_brands.append(str(n))
    else:
        # Fallback: brand_name (string)
        name = result.get("brand_name", "")
        if isinstance(name, list):
            raw_brands = [str(n) for n in name if n]
        elif name:
            name = str(name)
            if "," in name:
                raw_brands = [n.strip() for n in name.split(",")]
            else:
                raw_brands = [name]

    # ★ Normalize + dedupe
    normalized = []
    seen = set()
    for raw in raw_brands:
        canonical = _normalize_brand(raw)
        if canonical and canonical not in seen:
            normalized.append(canonical)
            seen.add(canonical)
        elif canonical is None and raw.strip() and raw.strip().lower() != "unknown":
            # Log brand ที่ถูกกรองออก (เผื่อเอาไป tune aliases ทีหลัง)
            print(f"  ⚠️ Filtered out unknown brand: {raw.strip()!r}")

    return normalized


def _score_to_grade(s):
    if s >= 9.0:
        return "A+ (ยอดเยี่ยม)"
    if s >= 8.0:
        return "A  (ดีมาก)"
    if s >= 7.0:
        return "B  (ดี)"
    if s >= 6.0:
        return "C  (พอใช้)"
    if s >= 5.0:
        return "D  (ต้องปรับปรุง)"
    return "F  (ต่ำกว่ามาตรฐาน)"


# =============================================================================
# TYPHOON + PYANNOTE PIPELINE
# =============================================================================
# Flow: Typhoon STT → pyannote diarization → merge → Groq Llama analyze
# =============================================================================

async def run_typhoon_pipeline(
    file_id: str,
    audio_file_path: str,
    call_direction: str = "Unknown",
    on_step_complete=None,
) -> dict:
    """
    Full AI Pipeline (3 Steps — Typhoon + pyannote + Llama):
    1. Typhoon ASR  — ถอดเสียงภาษาไทย (timestamps)
    2. pyannote     — แยกผู้พูด (speaker diarization)
    3. Groq Llama   — แก้ transcript + วิเคราะห์

    Args:
        file_id: ID ของไฟล์
        audio_file_path: path ไปยังไฟล์เสียง (.wav)
        call_direction: "Inbound" / "Outbound" / "Unknown"
        on_step_complete: callback (optional)
    """
    from services.typhoon_service import transcribe_audio
    from services.diarization_service import diarize_audio, merge_transcript_with_speakers

    pipeline_start = datetime.now()
    print(f"🚀 Typhoon Pipeline START: {file_id}")

    # --- Step 1: Typhoon STT ---
    print(f"  Step 1/3: Typhoon ASR (Speech-to-Text)...")
    typhoon_result = await transcribe_audio(audio_file_path)

    transcript_text = typhoon_result["text"]
    transcript_segments = typhoon_result["segments"]
    audio_duration = typhoon_result["duration"]

    print(f"  ✅ Step 1 done: {len(transcript_segments)} segments, {audio_duration:.1f}s")

    if on_step_complete:
        await on_step_complete("typhoon", typhoon_result)

    # --- Step 2: pyannote Speaker Diarization ---
    print(f"  Step 2/3: pyannote (Speaker Diarization)...")
    try:
        speaker_segments = await diarize_audio(audio_file_path, num_speakers=2)

        # Merge transcript + speakers
        merged_transcript = merge_transcript_with_speakers(
            transcript_segments=transcript_segments,
            speaker_segments=speaker_segments,
            call_direction=call_direction,
        )
        print(f"  ✅ Step 2 done: {len(speaker_segments)} speaker segments")
    except Exception as e:
        print(f"  ⚠️ pyannote failed: {str(e)[:80]} — ใช้ transcript ธรรมดา")
        merged_transcript = transcript_text
        speaker_segments = []

    if on_step_complete:
        await on_step_complete("diarization", speaker_segments)

    # --- Step 2.5: Fix Transcript (chunked) ---
    raw_transcript_merged = merged_transcript

    await asyncio.sleep(DELAY_BETWEEN_STEPS)
    print(f"  Step 2.5/5: Fix Transcript (chunked)...")
    fix_result = await fix_transcript_chunked(
        file_id=file_id,
        transcript=raw_transcript_merged,
    )
    fixed_transcript = fix_result["corrected_transcript"]
    print(f"  ✅ Step 2.5 done: {fix_result['status']}")

    # --- Step 3: PII Masking (chunked) ---
    await asyncio.sleep(DELAY_BETWEEN_STEPS)
    print(f"  Step 3/5: PII Masking (chunked)...")
    mask_result = await mask_pii_with_llama(
        file_id=file_id,
        transcript=fixed_transcript,
    )
    masked_transcript = mask_result["masked_transcript"]
    print(f"  ✅ Step 3 done: {mask_result['mask_count']}")

    # --- Step 4: Groq Llama Analyze (ไม่ต้องคืน corrected_transcript) ---
    await asyncio.sleep(DELAY_BETWEEN_STEPS)
    print(f"  Step 4/5: Llama Analyze...")

    llama_result = await groq_llama_analyze(
        file_id=file_id,
        transcript=masked_transcript,
        segments=transcript_segments,
    )

    # ★ ใช้ masked (ผ่าน fix+mask แล้ว) เป็น corrected ที่ frontend แสดง
    corrected_transcript = masked_transcript

    print(f"  ✅ Step 4 done: sentiment={llama_result['sentiment']}, "
          f"QA={llama_result['qa_scoring']['final_score']}, "
          f"brand={llama_result['brand_name']}")

    if on_step_complete:
        await on_step_complete("llama", llama_result)

    # ===== Step 5: Deep Customer Insight =====
    await asyncio.sleep(DELAY_BETWEEN_STEPS)
    print(f"  Step 5/5: Deep Customer Insight...")
    deep_insight = await groq_llama_deep_insight(
        file_id=file_id,
        transcript=corrected_transcript,
        base_analysis=llama_result,
    )
    print(f"  ✅ Step 4 done: risk={deep_insight.get('risk_level')}, confidence={deep_insight.get('confidence')}")

    pipeline_duration = (datetime.now() - pipeline_start).total_seconds()
    print(f"🏁 Typhoon Pipeline DONE: {pipeline_duration:.1f}s total")

    # สร้าง whisper_result-compatible format (ให้ใช้ร่วมกับ code เดิมได้)
    stt_result = {
        "file_id": file_id,
        "transcript": corrected_transcript,
        "transcript_original": raw_transcript_merged,    # ★ raw จาก Typhoon+diarization
        "transcript_fixed": fixed_transcript,             # ★ หลัง fix (ยังไม่ mask)
        "transcript_masked": masked_transcript,           # ★ หลัง fix + mask
        "transcript_corrected": True,
        "language_detected": "th",
        "segments": transcript_segments,
        "speaker_segments": speaker_segments,
        "audio_duration_seconds": audio_duration,
        "word_count": len(transcript_text.split()),
        "stt_engine": "typhoon",
        "diarization_engine": "pyannote" if speaker_segments else "none",
        "pii_mask_count": mask_result["mask_count"],
    }

    return {
        "file_id": file_id,
        "pipeline_status": "completed",
        "pipeline_duration_seconds": round(pipeline_duration, 2),
        "completed_at": datetime.now().isoformat(),
        "summary": {
            "transcript": corrected_transcript,
            "language": "th",
            "sentiment": llama_result["sentiment"],
            "sentiment_confidence": llama_result["sentiment_confidence"],
            "intent": llama_result["intent"],
            "qa_score": llama_result["qa_scoring"]["final_score"],
            "qa_grade": llama_result["qa_scoring"]["grade"],
            "csat_predicted": llama_result["csat_predicted"],
            "summary_text": llama_result["summary_text"],
            "summary_points": llama_result["summary_points"],
            "action_items": llama_result["action_items"],
            "brand_name": llama_result["brand_name"],
            "brand_names": llama_result.get("brand_names", []),
            "product_category": llama_result["product_category"],
            "sale_channel": llama_result["sale_channel"],
            "deep_insight": deep_insight,
        },
        "model_results": {
            "whisper": stt_result,  # ใช้ key เดิม "whisper" เพื่อ backward compat
            "llama": llama_result,
            "deep_insight": deep_insight,
        },
    }
