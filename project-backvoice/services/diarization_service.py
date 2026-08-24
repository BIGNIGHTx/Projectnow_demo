# =============================================================================
# services/diarization_service.py — Speaker Diarization (pyannote)
# =============================================================================
# ใช้ pyannote/speaker-diarization-3.1 แยกผู้พูดจากไฟล์เสียง
# รัน local บน GPU (NVIDIA) หรือ CPU
#
# ต้องติดตั้ง:
#   pip install pyannote.audio torch torchaudio
#
# ต้องมี HuggingFace Token + accept license ที่:
#   https://huggingface.co/pyannote/speaker-diarization-3.1
#   https://huggingface.co/pyannote/segmentation-3.0
# =============================================================================

import os
import torch
from pathlib import Path

HF_TOKEN = os.environ.get("HF_TOKEN", "")
DIARIZATION_MODEL = "pyannote/speaker-diarization-3.1"

_pipeline = None


def _get_pipeline():
    """โหลด pyannote pipeline (lazy load — โหลดครั้งแรกช้า ~30s)"""
    global _pipeline
    if _pipeline is None:
        if not HF_TOKEN:
            raise RuntimeError("HF_TOKEN not set — ตั้งค่า environment variable ก่อน (HuggingFace Token)")

        from pyannote.audio import Pipeline

        print(f"  🔄 Loading pyannote model: {DIARIZATION_MODEL}")
        _pipeline = Pipeline.from_pretrained(
            DIARIZATION_MODEL,
            token=HF_TOKEN,
        )

        # ใช้ GPU ถ้ามี
        if torch.cuda.is_available():
            _pipeline.to(torch.device("cuda"))
            print(f"  ✅ pyannote loaded on GPU ({torch.cuda.get_device_name(0)})")
        else:
            print(f"  ⚠️ pyannote loaded on CPU (จะช้ากว่า GPU)")

    return _pipeline


async def diarize_audio(file_path: str, num_speakers: int = 2) -> list:
    """
    แยกผู้พูดจากไฟล์เสียง

    Args:
        file_path: path ไฟล์เสียง (.wav)
        num_speakers: จำนวนผู้พูดที่คาดว่ามี (default 2 = agent + customer)

    Returns:
        [
            {"start": 0.0, "end": 2.5, "speaker": "SPEAKER_00"},
            {"start": 2.5, "end": 5.0, "speaker": "SPEAKER_01"},
            ...
        ]
    """
    import asyncio

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"ไม่พบไฟล์: {file_path}")

    loop = asyncio.get_event_loop()

    def _diarize():
        pipeline = _get_pipeline()
        diarization = pipeline(
            str(file_path),
            num_speakers=num_speakers,
        )
        return diarization

    print(f"  🎤 pyannote diarization: {path.name} (expecting {num_speakers} speakers)")
    diarization = await loop.run_in_executor(None, _diarize)

    # แปลงผลลัพธ์เป็น list of segments
    speaker_segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        speaker_segments.append({
            "start": round(turn.start, 2),
            "end": round(turn.end, 2),
            "speaker": speaker,
        })

    print(f"  ✅ pyannote: {len(speaker_segments)} speaker segments, {len(set(s['speaker'] for s in speaker_segments))} unique speakers")

    return speaker_segments


def merge_transcript_with_speakers(
    transcript_segments: list,
    speaker_segments: list,
    call_direction: str = "Unknown",
) -> str:
    """
    รวม transcript segments กับ speaker segments เข้าด้วยกัน

    ใช้ overlap-based matching:
    - หา speaker segment ที่ overlap มากสุดกับแต่ละ transcript segment
    - Map speaker labels → Agent / Customer ตาม call direction

    Args:
        transcript_segments: [{"start": 0.0, "end": 2.5, "text": "..."}]
        speaker_segments: [{"start": 0.0, "end": 2.5, "speaker": "SPEAKER_00"}]
        call_direction: "Inbound" หรือ "Outbound" (ช่วย map speaker → role)

    Returns:
        merged transcript string:
        "Agent: สวัสดีครับ\nCustomer: โทรมาสอบถาม..."
    """
    if not transcript_segments or not speaker_segments:
        # ถ้าไม่มี speaker data ให้คืน transcript ธรรมดา
        return "\n".join(s.get("text", "") for s in transcript_segments)

    # 1. Map แต่ละ transcript segment → speaker (overlap มากสุด)
    labeled_segments = []
    for tseg in transcript_segments:
        t_start = tseg.get("start", 0)
        t_end = tseg.get("end", t_start + 0.1)
        text = tseg.get("text", "").strip()
        if not text:
            continue

        # หา speaker segment ที่ overlap มากสุด
        best_speaker = "Unknown"
        best_overlap = 0

        for sseg in speaker_segments:
            s_start = sseg["start"]
            s_end = sseg["end"]
            # คำนวณ overlap
            overlap_start = max(t_start, s_start)
            overlap_end = min(t_end, s_end)
            overlap = max(0, overlap_end - overlap_start)

            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = sseg["speaker"]

        labeled_segments.append({
            "start": t_start,
            "end": t_end,
            "text": text,
            "speaker": best_speaker,
        })

    # 2. Map speaker labels → roles
    # นับจำนวน segments ต่อ speaker เพื่อหาว่าใครพูดก่อน
    speaker_order = []
    for seg in labeled_segments:
        if seg["speaker"] not in speaker_order:
            speaker_order.append(seg["speaker"])

    # สำหรับ call center: คนพูดก่อน = Agent (Inbound) หรือ Agent (Outbound)
    # Inbound: ลูกค้าโทรเข้า → Agent รับสาย → Agent พูดก่อน (สวัสดีครับ)
    # Outbound: Agent โทรออก → Agent พูดก่อน
    # ทั้ง 2 กรณี: คนพูดก่อน = Agent
    role_map = {}
    if len(speaker_order) >= 2:
        role_map[speaker_order[0]] = "Agent"
        role_map[speaker_order[1]] = "Customer"
        for i, sp in enumerate(speaker_order[2:], 3):
            role_map[sp] = f"Speaker_{i}"
    elif len(speaker_order) == 1:
        role_map[speaker_order[0]] = "Agent"

    # 3. สร้าง merged transcript
    lines = []
    prev_role = None
    for seg in labeled_segments:
        role = role_map.get(seg["speaker"], seg["speaker"])
        timestamp = _format_time(seg["start"])

        if role == prev_role and lines:
            # ต่อข้อความกับบรรทัดก่อนหน้า (speaker เดียวกัน)
            lines[-1] += " " + seg["text"]
        else:
            lines.append(f"{role}: {seg['text']}")
            prev_role = role

    return "\n".join(lines)


def _format_time(seconds: float) -> str:
    """แปลงวินาที → mm:ss"""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"


def check_diarization_available() -> dict:
    """ตรวจสอบว่า pyannote พร้อมใช้งาน"""
    result = {
        "hf_token": bool(HF_TOKEN),
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "model_loaded": _pipeline is not None,
    }
    result["ready"] = result["hf_token"]
    return result
