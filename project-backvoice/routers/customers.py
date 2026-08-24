# =============================================================================
# routers/customers.py — Customer Information API
# =============================================================================

from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from database.db import list_customers, get_customer_detail, get_warranty_detail, get_db, dict_from_row

router = APIRouter()


@router.get("/list", summary="📋 รายชื่อลูกค้าทั้งหมด")
async def get_customers(search: Optional[str] = None):
    customers = list_customers(search=search)
    return {
        "total": len(customers),
        "customers": customers,
    }


@router.get("/detail/{customer_id}", summary="🔍 ข้อมูลลูกค้าครบ")
async def get_customer(customer_id: int):
    result = get_customer_detail(customer_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"ไม่พบลูกค้า ID: {customer_id}")
    return result


@router.get("/warranty/{registration_id}", summary="🛡️ ข้อมูลการรับประกันครบ")
async def get_warranty(registration_id: int):
    result = get_warranty_detail(registration_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"ไม่พบการลงทะเบียน ID: {registration_id}")
    return result


@router.get("/proof/{proof_id}", summary="📎 ดูไฟล์หลักฐานการซื้อ")
async def get_proof_file(proof_id: int):
    """Serve ไฟล์ proof of purchase จาก file_url ที่เก็บใน DB"""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM proof_of_purchase WHERE proof_id = ?", (proof_id,)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"ไม่พบหลักฐาน ID: {proof_id}")

    proof = dict_from_row(row)
    file_path = Path(proof["file_url"])

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"ไม่พบไฟล์: {proof['file_url']}")

    # Detect media type
    ext = file_path.suffix.lower()
    media_types = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf',
    }
    media_type = media_types.get(ext, 'application/octet-stream')

    return FileResponse(path=str(file_path), media_type=media_type)


# =============================================================================
# GET /warranty-list — รายการรับประกันทั้งหมด (search ได้)
# =============================================================================

@router.get("/warranty-list", summary="📋 รายการรับประกันทั้งหมด")
async def get_warranty_list(search: Optional[str] = None):
    with get_db() as conn:
        query = """
            SELECT w.registration_id, w.registration_no, w.status,
                   w.warranty_period_months, w.date_of_purchase, w.date_of_delivery, w.expiry_date,
                   w.order_number, w.created_at,
                   c.customer_id, c.first_name, c.last_name, c.phone, c.email,
                   p.model, p.size,
                   b.brand_name, cat.category_name,
                   ch.channel_name
            FROM warranty_registrations w
            LEFT JOIN customers c ON w.customer_id = c.customer_id
            LEFT JOIN products p ON w.product_id = p.product_id
            LEFT JOIN brands b ON p.brand_id = b.brand_id
            LEFT JOIN categories cat ON p.category_id = cat.category_id
            LEFT JOIN channels ch ON w.channel_id = ch.channel_id
            WHERE 1=1
        """
        params = []
        if search:
            query += """ AND (
                c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?
                OR w.registration_no LIKE ? OR b.brand_name LIKE ? OR p.model LIKE ?
            )"""
            s = f"%{search}%"
            params = [s, s, s, s, s, s]

        query += " ORDER BY w.created_at DESC"
        rows = conn.execute(query, params).fetchall()

    return {
        "total": len(rows),
        "warranties": [dict_from_row(r) for r in rows],
    }
