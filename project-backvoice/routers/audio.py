# =============================================================================
# routers/audio.py — v0.8.0
# Router สำหรับจัดการไฟล์เสียง: Upload, Play, Delete, List
# =============================================================================

import os
import re
import uuid
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks, Form, Request
from fastapi.responses import FileResponse, JSONResponse

from routers.audit_helper import log_from_request

from services.file_converter import (
    save_uploaded_file,
    convert_to_wav,
    find_converted_file,
    find_uploaded_file,
    delete_files_by_id,
    check_ffmpeg_available,
    ALL_SUPPORTED_EXTENSIONS,
    UPLOAD_DIR,
    CONVERTED_DIR,
)
from database.db import (
    save_audio_file,
    get_audio_file_by_id,
    get_analysis_by_file_id,
    delete_audio_file,
    update_audio_file_status,
    list_audio_files,
)

router = APIRouter()


# =============================================================================
# FILENAME PARSER — ดึงข้อมูลจากชื่อไฟล์
# =============================================================================
# Pattern:
#   20251104173706-1762252614_105999-104-0819979336-Outbound.wav
#   {yyyyMMddHHmmss}-{id}_{id}-{agent}-{customer}-{direction}.{ext}
# =============================================================================

# Pattern: yyyyMMddHHmmss-{ids}-{numA}-{numB}-{direction}.ext
# Outbound: numA=agent, numB=customer
# Inbound:  numA=customer, numB=agent
_PATTERN_LONG = re.compile(
    r'^(\d{14})'                     # group 1: datetime (yyyyMMddHHmmss)
    r'-[\d.]+'                       # skip IDs (digits + dots)
    r'-(\d+)'                        # group 2: number A
    r'-(\d+)'                        # group 3: number B
    r'-(Inbound|Outbound|inbound|outbound)'  # group 4: call direction
    r'\.\w+$'                        # .ext
)


def _parse_filename(filename: str) -> dict:
    """
    ดึง date, customer, agent, call_direction จากชื่อไฟล์
    
    Pattern:
      20251104173706-1762252614.105999-104-0819979336-Outbound.wav
      20251201175254-1764586296.121193-0634654956-102-Inbound.wav
    
    Outbound: ...-{agent}-{customer}-Outbound
    Inbound:  ...-{customer}-{agent}-Inbound
    """
    result = {
        "call_date": None,
        "customer_phone": None,
        "agent_id": None,
        "call_direction": None,
    }

    m = _PATTERN_LONG.match(filename)
    if m:
        dt_str = m.group(1)
        try:
            dt = datetime.strptime(dt_str, "%Y%m%d%H%M%S")
            result["call_date"] = dt.isoformat()
        except ValueError:
            pass

        num_a = m.group(2)
        num_b = m.group(3)
        direction = m.group(4).capitalize()
        result["call_direction"] = direction

        if direction == "Outbound":
            # Outbound: agent-customer
            agent_num = num_a
            phone = num_b
        else:
            # Inbound: customer-agent
            phone = num_a
            agent_num = num_b

        result["agent_id"] = f"AGENT-{agent_num}"
        if len(phone) == 10:
            result["customer_phone"] = f"{phone[:3]}-{phone[3:6]}-{phone[6:]}"
        else:
            result["customer_phone"] = phone

    return result


# =============================================================================
# GET /list — รายการไฟล์ทั้งหมด (sample + uploaded)
# =============================================================================
@router.get("/list", summary="📋 ดูรายการไฟล์ทั้งหมด")
async def list_files(
    search: Optional[str] = None,
    brand: Optional[str] = None,
    product: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    per_page: int = 10,
):
    return list_audio_files(
        search=search, brand=brand, product=product,
        date_from=date_from, date_to=date_to, status=status,
        page=page, per_page=per_page,
    )


# =============================================================================
# GET /detail/{file_id} — ข้อมูลละเอียดพร้อม AI analysis
# =============================================================================
@router.get("/detail/{file_id}", summary="🔍 ดูรายละเอียดไฟล์พร้อมผลวิเคราะห์ AI")
async def get_file_detail(file_id: str):
    audio = get_audio_file_by_id(file_id)
    if not audio:
        raise HTTPException(status_code=404, detail=f"ไม่พบไฟล์ ID: {file_id}")

    analysis = get_analysis_by_file_id(file_id)

    # ★ ตรวจว่าเบอร์โทรนี้มีในฐานข้อมูลลูกค้าหรือไม่
    matched_customer = None
    warranties = []
    phone = audio.get("customer_phone", "")
    if phone and phone != "N/A":
        from database.db import find_customer_by_phone, get_db, dict_from_row
        phone_clean = phone.replace("-", "")
        matched_customer = find_customer_by_phone(phone_clean)
        if not matched_customer:
            matched_customer = find_customer_by_phone(phone)

        # ★ ถ้า match ลูกค้าได้ → ดึงรายการรับประกันของลูกค้าคนนี้
        if matched_customer:
            with get_db() as conn:
                rows = conn.execute("""
                    SELECT w.registration_id, w.registration_no, w.status,
                           w.warranty_period_months, w.date_of_purchase, w.expiry_date,
                           p.model, p.size, b.brand_name, c.category_name
                    FROM warranty_registrations w
                    LEFT JOIN products p ON w.product_id = p.product_id
                    LEFT JOIN brands b ON p.brand_id = b.brand_id
                    LEFT JOIN categories c ON p.category_id = c.category_id
                    WHERE w.customer_id = ?
                    ORDER BY w.date_of_purchase DESC
                """, (matched_customer["customer_id"],)).fetchall()
                warranties = [dict_from_row(r) for r in rows]

    return {
        "file": audio,
        "analysis": analysis,
        "play_url": f"/api/v1/audio/play/{file_id}",
        "matched_customer": matched_customer,
        "warranties": warranties,
    }


# =============================================================================
# POST /upload — อัปโหลดไฟล์เสียง
# =============================================================================
@router.post("/upload", summary="📤 อัปโหลดไฟล์เสียง + เริ่มวิเคราะห์อัตโนมัติ", status_code=201)
async def upload_audio(
    request: Request,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    customer_phone: str = Form(default="N/A"),
    agent_id: str = Form(default="N/A"),
    agent_name: str = Form(default=""),
    created_by: Optional[int] = Form(default=None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="กรุณาเลือกไฟล์")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALL_SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"นามสกุล '{ext}' ไม่รองรับ")

    content = await file.read()
    if len(content) > 60 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="ไฟล์ใหญ่เกิน 60MB")

    # ★ ตรวจไฟล์ซ้ำด้วย SHA256 hash
    import hashlib
    file_hash = hashlib.sha256(content).hexdigest()
    from database.db import get_db
    with get_db() as conn:
        existing = conn.execute(
            "SELECT file_id, original_filename FROM audio_files WHERE file_hash = ?", (file_hash,)
        ).fetchone()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"ไฟล์นี้ถูกอัปโหลดแล้ว (ชื่อเดิม: {existing['original_filename']})"
        )

    try:
        file_id, uploaded_path = save_uploaded_file(content, file.filename)
    except (ValueError, IOError) as e:
        raise HTTPException(status_code=500, detail=str(e))

    converted_path = uploaded_path
    conversion_metadata = {
        "original_format": ext,
        "original_size_mb": round(len(content) / (1024 * 1024), 2),
        "converted_size_mb": round(len(content) / (1024 * 1024), 2),
        "sample_rate": 16000, "channels": 1, "conversion_time_seconds": 0.0,
    }

    if ext != ".wav" and check_ffmpeg_available():
        try:
            converted_path, conversion_metadata = convert_to_wav(uploaded_path)
        except Exception:
            pass

    # ★ Parse ข้อมูลจากชื่อไฟล์ (date, customer, agent, call direction)
    parsed = _parse_filename(file.filename)

    file_record = {
        "file_id": file_id,
        "original_filename": file.filename,
        "uploaded_path": str(uploaded_path),
        "converted_path": str(converted_path),
        "status": "processing",
        "customer_phone": parsed["customer_phone"] or customer_phone,
        "agent_id": parsed["agent_id"] or agent_id,
        "agent_name": agent_name,
        "call_direction": parsed["call_direction"] or "Unknown",
        "call_date": parsed["call_date"] or datetime.now().isoformat(),
        "file_size_mb": round(len(content) / (1024 * 1024), 2),
        "file_hash": file_hash,
        "created_by": created_by,
    }
    save_audio_file(file_record)

    # =================================================================
    # AUTO-ANALYZE: เข้าคิววิเคราะห์ AI อัตโนมัติ (ทีละ 1 ไฟล์)
    # =================================================================
    task_id = None
    try:
        import uuid
        from routers.ai_task import TASK_STORE, TaskStatus, _add_to_queue

        task_id = str(uuid.uuid4())
        TASK_STORE[task_id] = {
            "task_id": task_id,
            "file_id": file_id,
            "customer_id": None,
            "priority": "normal",
            "status": TaskStatus.QUEUED,
            "is_retest": False,
            "created_by": created_by,
            "created_at": datetime.now().isoformat(),
            "started_at": None,
            "completed_at": None,
            "message": "📋 อัปโหลดเสร็จ — รอคิววิเคราะห์...",
            "result": None,
            "error": None,
        }

        # ★ เข้าคิวแทน background_tasks — ประมวลผลทีละ 1 ไฟล์
        await _add_to_queue(
            task_id=task_id,
            file_id=file_id,
            audio_file_path=str(converted_path),
            customer_id=None,
            retest=False,
            created_by=created_by,
        )
    except Exception as e:
        print(f"⚠️ Auto-analyze queue error: {e}")

    # ★ Log UPLOAD_FILE action
    log_from_request(
        request,
        action="UPLOAD_FILE",
        target_type="file",
        target_id=file_id,
        target_label=file.filename,
        detail=f"size={len(content)} bytes, ext={ext}",
    )

    return JSONResponse(status_code=201, content={
        "success": True,
        "message": "อัปโหลดสำเร็จ — กำลังเริ่มวิเคราะห์อัตโนมัติ",
        "file_id": file_id,
        "original_filename": file.filename,
        "task_id": task_id,  # ส่ง task_id กลับเพื่อให้ frontend poll สถานะได้
        "auto_analyze": True,
    })


# =============================================================================
# GET /play/{file_id} — เล่นไฟล์เสียง
# =============================================================================
@router.get("/play/{file_id}", summary="▶️ เล่นไฟล์เสียง")
async def play_audio(file_id: str):
    audio = get_audio_file_by_id(file_id)
    if audio:
        # ลอง converted_path ก่อน แล้ว fallback เป็น uploaded_path
        for key in ["converted_path", "uploaded_path"]:
            p = audio.get(key, "")
            if p:
                path = Path(p)
                if not path.is_absolute():
                    path = Path(__file__).resolve().parent.parent / p
                if path.exists():
                    return FileResponse(
                        path=str(path), media_type="audio/wav",
                        filename=audio.get("original_filename", "audio.wav"),
                        headers={"Accept-Ranges": "bytes"},
                    )

    raise HTTPException(status_code=404, detail=f"ไม่พบไฟล์ ID: {file_id}")


# =============================================================================
# DELETE /delete/{file_id}
# =============================================================================
@router.delete("/delete/{file_id}", summary="🗑️ ลบไฟล์เสียง")
async def delete_audio_endpoint(file_id: str, request: Request):
    audio = get_audio_file_by_id(file_id)
    if not audio:
        raise HTTPException(status_code=404, detail=f"ไม่พบไฟล์ ID: {file_id}")

    filename = audio.get("original_filename", "(unknown)")

    # ลบไฟล์จาก disk
    delete_files_by_id(file_id)

    # ลบจาก DB (audio_files + audio_analyses)
    delete_audio_file(file_id)

    # ★ Log DELETE_FILE
    log_from_request(
        request,
        action="DELETE_FILE",
        target_type="file",
        target_id=file_id,
        target_label=filename,
    )

    return {"success": True, "message": f"ลบไฟล์ {file_id} สำเร็จ"}


# =============================================================================
# POST /delete-batch — ลบหลายไฟล์พร้อมกัน
# =============================================================================
@router.post("/delete-batch", summary="🗑️ ลบหลายไฟล์พร้อมกัน")
async def delete_batch(payload: dict, request: Request):
    file_ids = payload.get("file_ids", [])
    if not file_ids:
        raise HTTPException(status_code=400, detail="กรุณาระบุไฟล์ที่ต้องการลบ")

    deleted = 0
    not_found = 0
    deleted_files = []
    for fid in file_ids:
        audio = get_audio_file_by_id(fid)
        if audio:
            deleted_files.append(audio.get("original_filename", fid))
            delete_files_by_id(fid)
            delete_audio_file(fid)
            deleted += 1
        else:
            not_found += 1

    # ★ Log DELETE_FILE_BATCH
    if deleted > 0:
        log_from_request(
            request,
            action="DELETE_FILE_BATCH",
            target_type="file",
            target_id=",".join(file_ids[:10]),  # cap first 10
            target_label=f"{deleted} files",
            detail=f"deleted={deleted}, not_found={not_found}; first: {', '.join(deleted_files[:3])}",
        )

    return {
        "success": True,
        "deleted": deleted,
        "not_found": not_found,
        "message": f"ลบสำเร็จ {deleted} ไฟล์" + (f" (ไม่พบ {not_found} ไฟล์)" if not_found else ""),
    }


# =============================================================================
# GET /info/{file_id}
# =============================================================================
@router.get("/info/{file_id}", summary="ℹ️ ดูข้อมูลไฟล์")
async def get_file_info(file_id: str):
    audio = get_audio_file_by_id(file_id)
    if audio:
        return audio
    raise HTTPException(status_code=404, detail=f"ไม่พบไฟล์ ID: {file_id}")
