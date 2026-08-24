# =============================================================================
# routers/audit_helper.py — Helpers สำหรับ log admin actions จาก HTTP request
# =============================================================================

from typing import Optional
from fastapi import Request

from database.db import log_admin_action


def get_client_ip(request: Request) -> str:
    """ดึง IP จาก request (รองรับ proxy)"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_actor_from_request(request: Request) -> dict:
    """
    ดึงข้อมูล actor จาก HTTP headers ที่ frontend ส่งมา:
    - X-Actor-Id (admin_user_id)
    - X-Actor-Username
    - X-Actor-Role

    คืน dict {actor_user_id, actor_username, actor_role}
    ถ้าไม่มี header → ใช้ค่า default 'system'/'SYSTEM'
    """
    actor_id_str = request.headers.get("x-actor-id") or ""
    actor_user_id: Optional[int] = None
    if actor_id_str.isdigit():
        actor_user_id = int(actor_id_str)

    return {
        "actor_user_id":  actor_user_id,
        "actor_username": request.headers.get("x-actor-username") or "system",
        "actor_role":     (request.headers.get("x-actor-role") or "SYSTEM").upper(),
        "ip_address":     get_client_ip(request),
    }


def log_from_request(
    request: Request,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    target_label: Optional[str] = None,
    detail: Optional[str] = None,
) -> Optional[int]:
    """
    บันทึก log โดยดึง actor จาก request headers อัตโนมัติ
    คืน log_id หรือ None ถ้า fail (ไม่ throw — ป้องกัน main flow พัง)
    """
    try:
        actor = get_actor_from_request(request)
        return log_admin_action(
            actor_user_id=actor["actor_user_id"],
            actor_username=actor["actor_username"],
            actor_role=actor["actor_role"],
            action=action.upper(),
            target_type=target_type,
            target_id=target_id,
            target_label=target_label,
            detail=detail,
            ip_address=actor["ip_address"],
        )
    except Exception as e:
        # ★ Log fail แต่ไม่ throw — protected main business logic
        print(f"⚠️ log_from_request failed [{action}]: {e}")
        return None
