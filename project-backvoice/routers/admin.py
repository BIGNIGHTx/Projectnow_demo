# =============================================================================
# routers/admin.py — Admin Management (Users + Activity Logs)
# =============================================================================

from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

from database.db import (
    list_admin_users,
    update_admin_user_role,
    update_admin_user_active,
    log_admin_action,
    list_admin_logs,
    get_admin_log_stats,
)

router = APIRouter()


# =============================================================================
# Pydantic Models
# =============================================================================

class UpdateRoleRequest(BaseModel):
    new_role: str  # ADMIN | STAFF | VIEWER
    actor_user_id: Optional[int] = None  # คน update (ใช้ log)
    actor_username: Optional[str] = None
    actor_role: Optional[str] = None


class UpdateActiveRequest(BaseModel):
    is_active: bool
    actor_user_id: Optional[int] = None
    actor_username: Optional[str] = None
    actor_role: Optional[str] = None


class CreateLogRequest(BaseModel):
    """สำหรับ frontend log action โดยตรง (เช่น LOGIN/LOGOUT)"""
    actor_user_id: Optional[int] = None
    actor_username: str
    actor_role: str
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    target_label: Optional[str] = None
    detail: Optional[str] = None


# =============================================================================
# Helper: ดึง IP จาก request
# =============================================================================

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# =============================================================================
# Endpoints: Users
# =============================================================================

@router.get("/users", summary="📋 รายชื่อ admin users ทั้งหมด")
async def list_users(
    search: str = Query("", description="ค้นหา username, full_name, email"),
    role: str = Query("", description="filter ตาม role: ADMIN/STAFF/VIEWER"),
    limit: int = Query(100, ge=1, le=500),
):
    users = list_admin_users(search=search, role=role, limit=limit)
    # ลบ password_hash ออกก่อนส่งกลับ
    for u in users:
        u.pop("password_hash", None)
    return {"users": users, "total": len(users)}


@router.patch("/users/{admin_user_id}/role", summary="🔧 แก้ไข role ของ user")
async def update_user_role(admin_user_id: int, req: UpdateRoleRequest, request: Request):
    result = update_admin_user_role(admin_user_id, req.new_role)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "ไม่สามารถแก้ไขได้"))

    # บันทึก log ถ้าเปลี่ยนจริง
    if not result.get("unchanged"):
        user = result["user"]
        log_admin_action(
            actor_user_id=req.actor_user_id,
            actor_username=req.actor_username or "system",
            actor_role=req.actor_role or "ADMIN",
            action="UPDATE_ROLE",
            target_type="user",
            target_id=str(admin_user_id),
            target_label=f"{user['username']} ({user['full_name']})",
            detail=f"{result['old_role']} → {result['new_role']}",
            ip_address=_get_client_ip(request),
        )

    # ลบ password_hash ก่อนส่งกลับ
    user = result["user"]
    user.pop("password_hash", None)
    return {"success": True, "user": user, "unchanged": result.get("unchanged", False)}


@router.patch("/users/{admin_user_id}/active", summary="⚡ เปิด/ปิดบัญชี user")
async def update_user_active(admin_user_id: int, req: UpdateActiveRequest, request: Request):
    result = update_admin_user_active(admin_user_id, req.is_active)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "ไม่สามารถแก้ไขได้"))

    user = result["user"]
    log_admin_action(
        actor_user_id=req.actor_user_id,
        actor_username=req.actor_username or "system",
        actor_role=req.actor_role or "ADMIN",
        action="ACTIVATE_USER" if req.is_active else "DEACTIVATE_USER",
        target_type="user",
        target_id=str(admin_user_id),
        target_label=f"{user['username']} ({user['full_name']})",
        ip_address=_get_client_ip(request),
    )

    user.pop("password_hash", None)
    return {"success": True, "user": user}


# =============================================================================
# Endpoints: Activity Logs
# =============================================================================

@router.get("/logs", summary="📜 ดู activity logs ของ admin/staff ทั้งหมด")
async def get_logs(
    search: str = Query("", description="ค้นหาใน action/actor/target/detail"),
    action: str = Query("", description="filter action เช่น LOGIN, UPDATE_ROLE"),
    actor_username: str = Query("", description="filter user คนกระทำ"),
    date_from: str = Query("", description="YYYY-MM-DD"),
    date_to: str = Query("", description="YYYY-MM-DD"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    return list_admin_logs(
        search=search,
        action=action,
        actor_username=actor_username,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/logs/stats", summary="📊 สถิติ activity logs ภาพรวม")
async def get_log_stats():
    return get_admin_log_stats()


@router.post("/logs", summary="📝 บันทึก log จาก frontend (เช่น LOGIN, LOGOUT)")
async def create_log(req: CreateLogRequest, request: Request):
    log_id = log_admin_action(
        actor_user_id=req.actor_user_id,
        actor_username=req.actor_username,
        actor_role=req.actor_role,
        action=req.action.upper(),
        target_type=req.target_type,
        target_id=req.target_id,
        target_label=req.target_label,
        detail=req.detail,
        ip_address=_get_client_ip(request),
    )
    return {"success": True, "log_id": log_id}
