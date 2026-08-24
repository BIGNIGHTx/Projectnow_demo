# =============================================================================
# routers/ai_task.py — v2.0.0
# Router สำหรับสั่งงาน AI — ใช้ Queue ประมวลผลทีละ 1 ไฟล์
#
# Pipeline:
#   1. Whisper (Groq) — ถอดเสียงเป็นข้อความ
#   2. Llama #1 (Groq) — แก้ไข Transcript
#   3. Llama #2 (Groq) — วิเคราะห์ NLP + สรุป + QA Score
#
# ★ Queue System:
#   - อัปโหลดหลายไฟล์พร้อมกัน → เข้าคิวอัตโนมัติ
#   - ประมวลผลทีละ 1 ไฟล์ → ป้องกัน Groq rate limit
# =============================================================================

import asyncio
import uuid
from datetime import datetime
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse

from routers.audit_helper import log_from_request

from services.groq_ai_service import run_groq_analysis_pipeline
from database.db import save_analysis_result, find_customer_by_id, update_audio_file_status, get_audio_file_by_id

# =============================================================================
# Router & Task Store & Queue
# =============================================================================

router = APIRouter()

TASK_STORE: dict = {}

# ★ Queue สำหรับประมวลผลทีละ 1 ไฟล์
_task_queue: asyncio.Queue = None
_worker_started: bool = False


class TaskStatus:
    QUEUED     = "queued"
    PROCESSING = "processing"
    COMPLETED  = "completed"
    FAILED     = "failed"


# =============================================================================
# Queue Worker — ทำงานทีละ 1 task เท่านั้น
# =============================================================================

async def _queue_worker():
    """
    Worker loop ที่ดึง task จาก queue มาทำทีละ 1 ตัว
    ทำงานตลอดเวลาที่ server รันอยู่
    """
    global _task_queue
    print("🏭 AI Queue Worker started — ประมวลผลทีละ 1 ไฟล์")

    while True:
        try:
            # รอ task จาก queue (blocking จนกว่าจะมี task เข้ามา)
            task_info = await _task_queue.get()

            task_id = task_info["task_id"]
            file_id = task_info["file_id"]
            audio_file_path = task_info["audio_file_path"]
            customer_id = task_info.get("customer_id")
            retest = task_info.get("retest", False)
            created_by = task_info.get("created_by")

            # แสดงจำนวนที่เหลือในคิว
            remaining = _task_queue.qsize()
            print(f"\n🔄 Processing: {file_id} (เหลือในคิว: {remaining})")

            # อัปเดต status
            if task_id in TASK_STORE:
                TASK_STORE[task_id].update({
                    "status": TaskStatus.PROCESSING,
                    "started_at": datetime.now().isoformat(),
                    "message": "🔄 AI กำลังประมวลผล...",
                })

            try:
                # ★ เลือก pipeline: Typhoon+pyannote (ถ้ามี) หรือ Groq Whisper (fallback)
                use_typhoon = False
                try:
                    from services.typhoon_service import check_typhoon_available
                    use_typhoon = check_typhoon_available()
                except ImportError:
                    pass

                if use_typhoon:
                    # Pipeline ใหม่: Typhoon STT → pyannote → Llama
                    from services.groq_ai_service import run_typhoon_pipeline
                    from database.db import get_audio_file_by_id
                    file_info = get_audio_file_by_id(file_id)
                    call_dir = file_info.get("call_direction", "Unknown") if file_info else "Unknown"

                    if task_id in TASK_STORE:
                        TASK_STORE[task_id]["message"] = "🌊 Typhoon STT → 🎤 pyannote → 🧠 Llama..."

                    result = await run_typhoon_pipeline(
                        file_id=file_id,
                        audio_file_path=audio_file_path,
                        call_direction=call_dir,
                    )
                else:
                    # Pipeline เดิม: Groq Whisper → Llama
                    if task_id in TASK_STORE:
                        TASK_STORE[task_id]["message"] = "🔄 Whisper → Llama..."

                    result = await run_groq_analysis_pipeline(
                        file_id=file_id,
                        audio_file_path=audio_file_path,
                    )

                llama_result = result["model_results"]["llama"]
                whisper_result = result["model_results"]["whisper"]

                # ★ Transcript ที่บันทึก DB:
                # - transcript = raw จาก Whisper/Typhoon (ก่อน mask, ก่อน fix)
                # - corrected_transcript = หลัง mask + fix (ใช้แสดง UI ได้ถ้าต้องการ)
                raw_transcript = whisper_result.get(
                    "transcript_original",
                    result["summary"]["transcript"]
                )
                corrected_transcript = result["summary"]["transcript"]

                db_record = {
                    "task_id": task_id,
                    "file_id": file_id,
                    "customer_id": customer_id,
                    "is_retest": retest,
                    "transcript": raw_transcript,                       # ★ raw จาก STT
                    "corrected_transcript": corrected_transcript,        # ★ หลัง mask+fix
                    "sentiment": result["summary"]["sentiment"],
                    "sentiment_confidence": result["summary"]["sentiment_confidence"],
                    "sentiment_score": llama_result.get("sentiment_score", 0.5),
                    "intent": result["summary"]["intent"],
                    "qa_score": result["summary"]["qa_score"],
                    "csat_predicted": result["summary"]["csat_predicted"],
                    "csat_score": result["summary"]["csat_predicted"],
                    "summary": result["summary"]["summary_text"],
                    "summary_points": result["summary"].get("summary_points", []),
                    "action_items": result["summary"]["action_items"],
                    "brand_name": result["summary"]["brand_name"],
                    "brand_names": result["summary"].get("brand_names", []),
                    "product_category": result["summary"]["product_category"],
                    "sale_channel": result["summary"]["sale_channel"],
                    "transcription": whisper_result.get("segments", []),
                    "audio_duration_seconds": whisper_result.get("audio_duration_seconds", 0),
                    "key_insights": llama_result.get("key_insights", ""),
                    "keywords": llama_result.get("keywords", []),
                    "deep_insight": result["summary"].get("deep_insight", {}),
                    "model_results": result["model_results"],
                    "created_by": created_by,
                }
                saved = save_analysis_result(db_record)

                TASK_STORE[task_id].update({
                    "status": TaskStatus.COMPLETED,
                    "completed_at": datetime.now().isoformat(),
                    "message": "✅ วิเคราะห์เสร็จสมบูรณ์",
                    "result": result["summary"],
                    "analysis_id": saved.get("analysis_id"),
                    "pipeline_duration_seconds": result["pipeline_duration_seconds"],
                })

                # อัปเดต status ของไฟล์เป็น analyzed
                try:
                    update_audio_file_status(file_id, "analyzed")
                except Exception:
                    pass

                print(f"✅ Completed: {file_id}")

            except Exception as e:
                TASK_STORE[task_id].update({
                    "status": TaskStatus.FAILED,
                    "failed_at": datetime.now().isoformat(),
                    "message": f"❌ เกิดข้อผิดพลาด: {str(e)}",
                    "error": str(e),
                })

                # ★ อัปเดต status ของไฟล์เป็น failed
                try:
                    update_audio_file_status(file_id, "failed")
                except Exception:
                    pass

                print(f"❌ Failed: {file_id} — {str(e)[:100]}")

            finally:
                _task_queue.task_done()

                # อัปเดต message ของ task ถัดไปในคิว
                _update_queue_messages()

                # ★ พัก 15 วินาทีก่อนทำ task ถัดไป (ป้องกัน rate limit)
                if _task_queue.qsize() > 0:
                    print(f"  ⏳ รอ 15 วินาทีก่อนทำไฟล์ถัดไป...")
                    await asyncio.sleep(15)

        except Exception as e:
            print(f"❌ Queue Worker error: {e}")
            await asyncio.sleep(1)


def _update_queue_messages():
    """อัปเดต message ของ tasks ที่ยังอยู่ในคิวให้แสดงลำดับที่ถูกต้อง"""
    queued_tasks = [
        t for t in TASK_STORE.values()
        if t["status"] == TaskStatus.QUEUED
    ]
    queued_tasks.sort(key=lambda t: t["created_at"])

    for i, task in enumerate(queued_tasks):
        task["message"] = f"📋 รอคิว (ลำดับที่ {i + 1} จาก {len(queued_tasks)})"


async def _ensure_worker_started():
    """เริ่ม worker ถ้ายังไม่ได้เริ่ม"""
    global _task_queue, _worker_started
    if not _worker_started:
        _task_queue = asyncio.Queue()
        asyncio.create_task(_queue_worker())
        _worker_started = True


async def _add_to_queue(
    task_id: str,
    file_id: str,
    audio_file_path: str,
    customer_id: Optional[str] = None,
    retest: bool = False,
    created_by: int = None,
):
    """เพิ่ม task เข้า queue"""
    await _ensure_worker_started()

    await _task_queue.put({
        "task_id": task_id,
        "file_id": file_id,
        "audio_file_path": audio_file_path,
        "customer_id": customer_id,
        "retest": retest,
        "created_by": created_by,
    })

    queue_size = _task_queue.qsize()
    print(f"📥 Queued: {file_id} (คิวทั้งหมด: {queue_size})")

    # อัปเดต message ทุก task ในคิว
    _update_queue_messages()


# =============================================================================
# Helper: ค้นหา audio file path จาก file_id
# =============================================================================

def _resolve_audio_path(file_id: str) -> str:
    """ค้นหา path ของไฟล์เสียงจาก file_id (SQLite)"""
    audio = get_audio_file_by_id(file_id)
    if audio:
        for key in ["converted_path", "uploaded_path"]:
            p = audio.get(key, "")
            if p:
                path = Path(p)
                if not path.is_absolute():
                    path = Path(__file__).resolve().parent.parent / p
                if path.exists():
                    return str(path)

    raise FileNotFoundError(f"ไม่พบไฟล์เสียง ID: {file_id}")


# =============================================================================
# ENDPOINT 1: POST /analyze/{file_id}
# =============================================================================

@router.post(
    "/analyze/{file_id}",
    status_code=202,
    summary="🚀 สั่งวิเคราะห์ไฟล์เสียง (Queue — ประมวลผลทีละ 1 ไฟล์)",
)
async def analyze_audio(
    file_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    customer_id: Optional[str] = None,
    priority: str = "normal",
    created_by: Optional[int] = None,
):
    if priority not in ("high", "normal", "low"):
        raise HTTPException(status_code=400, detail="priority ต้องเป็น high, normal, หรือ low")

    try:
        audio_path = _resolve_audio_path(file_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    task_id = str(uuid.uuid4())

    TASK_STORE[task_id] = {
        "task_id": task_id,
        "file_id": file_id,
        "customer_id": customer_id,
        "priority": priority,
        "status": TaskStatus.QUEUED,
        "is_retest": False,
        "created_by": created_by,
        "created_at": datetime.now().isoformat(),
        "started_at": None,
        "completed_at": None,
        "message": "📋 กำลังเข้าคิว...",
        "result": None,
        "error": None,
    }

    # ★ เพิ่มเข้า queue แทน background_tasks
    await _add_to_queue(
        task_id=task_id,
        file_id=file_id,
        audio_file_path=audio_path,
        customer_id=customer_id,
        retest=False,
        created_by=created_by,
    )

    # ★ เปลี่ยน file status กลับเป็น processing
    try:
        update_audio_file_status(file_id, "processing")
    except Exception:
        pass

    # ★ Log ANALYZE_FILE
    log_from_request(
        request,
        action="ANALYZE_FILE",
        target_type="file",
        target_id=file_id,
        detail=f"task_id={task_id}, priority={priority}",
    )

    return JSONResponse(
        status_code=202,
        content={
            "accepted": True,
            "message": "📋 รับคำสั่งแล้ว เข้าคิวประมวลผล",
            "task_id": task_id,
            "file_id": file_id,
            "priority": priority,
            "queue_size": _task_queue.qsize() if _task_queue else 0,
            "estimated_time_seconds": "30-90",
            "how_to_check_status": f"GET /api/v1/ai/status/{task_id}",
            "created_at": TASK_STORE[task_id]["created_at"],
        }
    )


# =============================================================================
# ENDPOINT 2: POST /retest/{file_id}
# =============================================================================

@router.post("/retest/{file_id}", status_code=202, summary="🔄 วิเคราะห์ซ้ำ (Retest)")
async def retest_audio(
    file_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    customer_id: Optional[str] = None,
    reason: Optional[str] = None,
    created_by: Optional[int] = None,
):
    try:
        audio_path = _resolve_audio_path(file_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    task_id = str(uuid.uuid4())

    TASK_STORE[task_id] = {
        "task_id": task_id,
        "file_id": file_id,
        "customer_id": customer_id,
        "priority": "normal",
        "status": TaskStatus.QUEUED,
        "is_retest": True,
        "retest_reason": reason or "ไม่ระบุเหตุผล",
        "created_by": created_by,
        "created_at": datetime.now().isoformat(),
        "started_at": None,
        "completed_at": None,
        "message": "📋 [RETEST] กำลังเข้าคิว...",
        "result": None,
        "error": None,
    }

    # ★ เพิ่มเข้า queue
    await _add_to_queue(
        task_id=task_id,
        file_id=file_id,
        audio_file_path=audio_path,
        customer_id=customer_id,
        retest=True,
        created_by=created_by,
    )

    # ★ Log REANALYZE_FILE
    log_from_request(
        request,
        action="REANALYZE_FILE",
        target_type="file",
        target_id=file_id,
        detail=f"task_id={task_id}, reason={reason or 'ไม่ระบุ'}",
    )

    return JSONResponse(
        status_code=202,
        content={
            "accepted": True,
            "message": "🔄 [RETEST] เข้าคิวประมวลผล",
            "task_id": task_id,
            "file_id": file_id,
            "is_retest": True,
            "queue_size": _task_queue.qsize() if _task_queue else 0,
            "how_to_check_status": f"GET /api/v1/ai/status/{task_id}",
            "created_at": TASK_STORE[task_id]["created_at"],
        }
    )


# =============================================================================
# ENDPOINT 3: GET /status/{task_id}
# =============================================================================

@router.get("/status/{task_id}", summary="📊 ตรวจสอบสถานะ Task")
async def get_task_status(task_id: str):
    task = TASK_STORE.get(task_id)
    if not task:
        raise HTTPException(
            status_code=404,
            detail={"error": "task_not_found", "message": f"ไม่พบ Task ID: {task_id}"}
        )

    created_at = datetime.fromisoformat(task["created_at"])
    elapsed_seconds = round((datetime.now() - created_at).total_seconds(), 1)

    response = {
        "task_id": task_id,
        "file_id": task["file_id"],
        "status": task["status"],
        "is_retest": task.get("is_retest", False),
        "message": task["message"],
        "elapsed_seconds": elapsed_seconds,
        "created_at": task["created_at"],
        "started_at": task.get("started_at"),
        "completed_at": task.get("completed_at"),
    }

    # แสดงจำนวนคิว
    if task["status"] == TaskStatus.QUEUED:
        queue_ahead = sum(
            1 for t in TASK_STORE.values()
            if t["status"] in (TaskStatus.QUEUED, TaskStatus.PROCESSING)
            and t["created_at"] < task["created_at"]
        )
        response["queue_position"] = queue_ahead + 1
        response["queue_total"] = _task_queue.qsize() if _task_queue else 0

    if task["status"] == TaskStatus.COMPLETED:
        response["result"] = task.get("result")
        response["analysis_id"] = task.get("analysis_id")
        response["pipeline_duration_seconds"] = task.get("pipeline_duration_seconds")

    if task["status"] == TaskStatus.FAILED:
        response["error"] = task.get("error")

    return response


# =============================================================================
# ENDPOINT 4: GET /tasks
# =============================================================================

@router.get("/tasks", summary="📋 รายการ Task ทั้งหมด")
async def list_tasks(
    status_filter: Optional[str] = None,
    limit: int = 20,
):
    tasks = list(TASK_STORE.values())

    if status_filter:
        tasks = [t for t in tasks if t["status"] == status_filter]

    tasks.sort(key=lambda t: t["created_at"], reverse=True)
    tasks = tasks[:limit]

    all_tasks = list(TASK_STORE.values())
    stats = {
        "total": len(all_tasks),
        "queued":     sum(1 for t in all_tasks if t["status"] == TaskStatus.QUEUED),
        "processing": sum(1 for t in all_tasks if t["status"] == TaskStatus.PROCESSING),
        "completed":  sum(1 for t in all_tasks if t["status"] == TaskStatus.COMPLETED),
        "failed":     sum(1 for t in all_tasks if t["status"] == TaskStatus.FAILED),
        "queue_size": _task_queue.qsize() if _task_queue else 0,
    }

    return {
        "stats": stats,
        "filter": status_filter,
        "showing": len(tasks),
        "tasks": [
            {
                "task_id": t["task_id"],
                "file_id": t["file_id"],
                "status": t["status"],
                "is_retest": t.get("is_retest", False),
                "created_at": t["created_at"],
                "message": t["message"],
            }
            for t in tasks
        ],
    }
