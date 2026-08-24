# =============================================================================
# routers/auth.py — Authentication (Login + Register)
# =============================================================================

import hashlib
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from database.db import get_db, log_admin_action

router = APIRouter()


def _hash_password(password: str) -> str:
    return hashlib.sha256(f"fontai_{password}_salt".encode()).hexdigest()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str
    email: Optional[str] = None
    role: str = "STAFF"


@router.post("/login", summary="🔐 Login")
async def login(req: LoginRequest, request: Request):
    username = req.username.strip()
    password = req.password.strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="กรุณากรอก username และ password")

    with get_db() as conn:
        user = conn.execute(
            "SELECT * FROM admin_users WHERE username = ?", (username,)
        ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="ไม่พบ username นี้ในระบบ")

    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="บัญชีนี้ถูกระงับ")

    if user["password_hash"] != _hash_password(password):
        raise HTTPException(status_code=401, detail="รหัสผ่านไม่ถูกต้อง")

    # ★ Log LOGIN action
    try:
        log_admin_action(
            actor_user_id=user["admin_user_id"],
            actor_username=user["username"],
            actor_role=user["role"],
            action="LOGIN",
            target_type="user",
            target_id=str(user["admin_user_id"]),
            target_label=user["full_name"],
            ip_address=_get_client_ip(request),
        )
    except Exception as e:
        print(f"⚠️ log_admin_action LOGIN failed: {e}")

    return {
        "success": True,
        "user": {
            "admin_user_id": user["admin_user_id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"],
        },
    }


@router.post("/register", summary="📝 Register")
async def register(req: RegisterRequest, request: Request):
    username = req.username.strip()
    password = req.password.strip()
    full_name = req.full_name.strip()

    if not username or not password or not full_name:
        raise HTTPException(status_code=400, detail="กรุณากรอกข้อมูลให้ครบ")

    if len(password) < 4:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร")

    if req.role not in ("ADMIN", "STAFF", "VIEWER"):
        raise HTTPException(status_code=400, detail="role ต้องเป็น ADMIN, STAFF หรือ VIEWER")

    with get_db() as conn:
        existing = conn.execute(
            "SELECT admin_user_id FROM admin_users WHERE username = ?", (username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="username นี้ถูกใช้แล้ว")

        if req.email:
            existing_email = conn.execute(
                "SELECT admin_user_id FROM admin_users WHERE email = ?", (req.email,)
            ).fetchone()
            if existing_email:
                raise HTTPException(status_code=409, detail="email นี้ถูกใช้แล้ว")

        cur = conn.execute(
            """INSERT INTO admin_users (username, password_hash, full_name, email, role, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, 1, ?)""",
            (username, _hash_password(password), full_name, req.email, req.role, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        new_user_id = cur.lastrowid

    # ★ Log REGISTER action
    try:
        log_admin_action(
            actor_user_id=new_user_id,
            actor_username=username,
            actor_role=req.role,
            action="REGISTER",
            target_type="user",
            target_id=str(new_user_id),
            target_label=full_name,
            ip_address=_get_client_ip(request),
        )
    except Exception as e:
        print(f"⚠️ log_admin_action REGISTER failed: {e}")

    return {"success": True, "message": f"สมัครสำเร็จ — ใช้ username '{username}' เข้าสู่ระบบได้เลย"}
