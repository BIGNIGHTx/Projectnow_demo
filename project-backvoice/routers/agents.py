# =============================================================================
# routers/agents.py — Agent Information API
# =============================================================================
# Endpoints:
#   GET  /list                 รายการ agents + search + sort
#   GET  /detail/{agent_id}    ข้อมูล agent + call log (พร้อม QA/CSAT ต่อสาย)
# =============================================================================

from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, Query

from database.db import get_db, dict_from_row, _parse_json

router = APIRouter()


# =============================================================================
# GET /list — รายการ agents (พร้อม avg_qa, avg_csat คำนวณสดจาก audio_analyses)
# =============================================================================
@router.get("/list", summary="📋 รายการ Agents ทั้งหมด")
async def list_agents(
    search: Optional[str] = Query(default=None, description="ค้นหาจาก ชื่อ / นามสกุล / รหัส"),
    sort_by: Literal["qa", "csat", "name"] = Query(default="qa", description="เรียงตาม qa / csat / name"),
    order: Literal["asc", "desc"] = Query(default="desc", description="asc = น้อย→มาก, desc = มาก→น้อย"),
):
    """
    ดึงรายการ agents ทั้งหมด พร้อม avg_qa และ avg_csat คำนวณจาก audio_analyses
    ล่าสุดของแต่ละไฟล์ (one analysis per file).
    """
    with get_db() as conn:
        # JOIN agents กับ analysis ล่าสุดของแต่ละไฟล์
        # คำนวณ avg_qa, avg_csat, total_calls ของแต่ละ agent
        query = """
            SELECT
                a.agent_id, a.first_name, a.last_name, a.phone, a.is_active,
                COUNT(DISTINCT f.file_id) as total_calls,
                ROUND(AVG(an.qa_score), 2) as avg_qa,
                ROUND(AVG(an.csat_score), 2) as avg_csat,
                SUM(CASE WHEN an.sentiment = 'positive' THEN 1 ELSE 0 END) as positive_calls,
                SUM(CASE WHEN an.sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral_calls,
                SUM(CASE WHEN an.sentiment = 'negative' THEN 1 ELSE 0 END) as negative_calls
            FROM agents a
            LEFT JOIN audio_files f ON f.agent_id = a.agent_id
            LEFT JOIN (
                SELECT file_id, qa_score, csat_score, sentiment,
                       ROW_NUMBER() OVER (PARTITION BY file_id ORDER BY created_at DESC) as rn
                FROM audio_analyses
            ) an ON an.file_id = f.file_id AND an.rn = 1
            WHERE 1=1
        """
        params = []

        if search:
            query += """ AND (
                a.first_name LIKE ? OR a.last_name LIKE ? OR a.agent_id LIKE ?
                OR (a.first_name || ' ' || a.last_name) LIKE ?
            )"""
            s = f"%{search}%"
            params.extend([s, s, s, s])

        query += " GROUP BY a.agent_id, a.first_name, a.last_name, a.phone, a.is_active"

        # ORDER BY: NULL ค่าเฉลี่ยให้ลงท้ายเสมอ (ใช้ COALESCE)
        if sort_by == "qa":
            order_col = "COALESCE(avg_qa, -1)"
        elif sort_by == "csat":
            order_col = "COALESCE(avg_csat, -1)"
        else:
            order_col = "a.first_name"

        direction = "DESC" if order == "desc" else "ASC"
        query += f" ORDER BY {order_col} {direction}, a.agent_id ASC"

        rows = conn.execute(query, params).fetchall()

    agents = []
    for r in rows:
        d = dict_from_row(r)
        agents.append({
            "agent_id": d["agent_id"],
            "first_name": d["first_name"],
            "last_name": d["last_name"],
            "full_name": f"{d['first_name']} {d['last_name']}",
            "phone": d["phone"] or "",
            "is_active": bool(d["is_active"]),
            "total_calls": d["total_calls"] or 0,
            "avg_qa": d["avg_qa"],
            "avg_csat": d["avg_csat"],
            "positive_calls": d["positive_calls"] or 0,
            "neutral_calls": d["neutral_calls"] or 0,
            "negative_calls": d["negative_calls"] or 0,
        })

    return {
        "total": len(agents),
        "sort_by": sort_by,
        "order": order,
        "agents": agents,
    }


# =============================================================================
# GET /detail/{agent_id} — ข้อมูล Agent + Call Log
# =============================================================================
@router.get("/detail/{agent_id}", summary="🔍 ข้อมูล Agent + รายการสาย")
async def get_agent_detail(agent_id: str):
    """
    คืนข้อมูล agent (ชื่อ, รหัส, เบอร์) + ค่าเฉลี่ย QA/CSAT + call log ทั้งหมด
    ของ agent คนนั้น (เรียงใหม่→เก่า)
    """
    with get_db() as conn:
        # 1. ข้อมูล agent
        agent_row = conn.execute(
            "SELECT * FROM agents WHERE agent_id = ?", (agent_id,)
        ).fetchone()

        if not agent_row:
            raise HTTPException(status_code=404, detail=f"ไม่พบ Agent ID: {agent_id}")

        agent = dict_from_row(agent_row)

        # 2. สรุป KPI ของ agent (อิงจาก analysis ล่าสุดของแต่ละไฟล์)
        stats_row = conn.execute("""
            SELECT
                COUNT(DISTINCT f.file_id) as total_calls,
                ROUND(AVG(an.qa_score), 2) as avg_qa,
                ROUND(AVG(an.csat_score), 2) as avg_csat,
                SUM(CASE WHEN an.sentiment = 'positive' THEN 1 ELSE 0 END) as positive_calls,
                SUM(CASE WHEN an.sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral_calls,
                SUM(CASE WHEN an.sentiment = 'negative' THEN 1 ELSE 0 END) as negative_calls
            FROM audio_files f
            LEFT JOIN (
                SELECT file_id, qa_score, csat_score, sentiment,
                       ROW_NUMBER() OVER (PARTITION BY file_id ORDER BY created_at DESC) as rn
                FROM audio_analyses
            ) an ON an.file_id = f.file_id AND an.rn = 1
            WHERE f.agent_id = ?
        """, (agent_id,)).fetchone()
        stats = dict_from_row(stats_row) or {}

        # 3. Call log
        call_rows = conn.execute("""
            SELECT
                f.file_id, f.original_filename, f.customer_phone,
                f.call_direction, f.call_date, f.status, f.duration_seconds,
                an.sentiment, an.qa_score, an.csat_score, an.intent,
                an.brand_names, an.summary_text
            FROM audio_files f
            LEFT JOIN (
                SELECT file_id, sentiment, qa_score, csat_score, intent,
                       brand_names, summary_text,
                       ROW_NUMBER() OVER (PARTITION BY file_id ORDER BY created_at DESC) as rn
                FROM audio_analyses
            ) an ON an.file_id = f.file_id AND an.rn = 1
            WHERE f.agent_id = ?
            ORDER BY f.call_date DESC, f.created_at DESC
        """, (agent_id,)).fetchall()

    calls = []
    for r in call_rows:
        d = dict_from_row(r)
        calls.append({
            "file_id": d["file_id"],
            "original_filename": d["original_filename"],
            "customer_phone": d["customer_phone"] or "N/A",
            "call_direction": d["call_direction"] or "Unknown",
            "call_date": d["call_date"],
            "status": d["status"],
            "duration_seconds": d["duration_seconds"] or 0,
            "sentiment": d["sentiment"],
            "qa_score": d["qa_score"],
            "csat_score": d["csat_score"],
            "intent": d["intent"] or "",
            "brand_names": _parse_json(d.get("brand_names", "[]")),
            "summary_text": d["summary_text"] or "",
        })

    return {
        "agent": {
            "agent_id": agent["agent_id"],
            "first_name": agent["first_name"],
            "last_name": agent["last_name"],
            "full_name": f"{agent['first_name']} {agent['last_name']}",
            "phone": agent["phone"] or "",
            "is_active": bool(agent["is_active"]),
            "created_at": agent["created_at"],
        },
        "stats": {
            "total_calls": stats.get("total_calls") or 0,
            "avg_qa": stats.get("avg_qa"),
            "avg_csat": stats.get("avg_csat"),
            "positive_calls": stats.get("positive_calls") or 0,
            "neutral_calls": stats.get("neutral_calls") or 0,
            "negative_calls": stats.get("negative_calls") or 0,
        },
        "calls": calls,
    }
