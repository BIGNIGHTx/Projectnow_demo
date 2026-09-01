# Deploy Guide

โปรเจคนี้ deploy ได้แบบแยก 2 service:

- Frontend: `project-frontvoice` เป็น Next.js
- Backend: `project-backvoice` เป็น FastAPI

## Backend บน Render

สร้าง Web Service ใหม่จาก GitHub repo นี้ แล้วตั้งค่า:

| Setting | Value |
| --- | --- |
| Root Directory | `project-backvoice` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

Environment variables ที่ควรตั้ง:

```env
PYTHON_VERSION=3.12.8
GROQ_API_KEY=your_groq_key
GROQ_API_KEY_2=optional_second_key
GROQ_API_KEY_3=optional_third_key
GROQ_API_KEY_4=optional_fourth_key
TYPHOON_API_KEY=optional_typhoon_key
FRONTEND_URL=https://your-frontend.vercel.app
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app
```

หลัง deploy ให้เช็ก:

```text
https://your-backend.onrender.com/health
https://your-backend.onrender.com/docs
```

หมายเหตุ: `requirements.txt` ไม่รวม `torch` และ `pyannote.audio` เพื่อให้ deploy เร็วและเบากว่าสำหรับ demo. ถ้าต้องการ speaker diarization จริงบนเครื่อง/host ที่รองรับ GPU ให้ใช้ `requirements-diarization.txt` แทน.

## Frontend บน Vercel

Import GitHub repo นี้ใน Vercel แล้วตั้งค่า:

| Setting | Value |
| --- | --- |
| Root Directory | `project-frontvoice` |
| Build Command | `npm run build` |

Environment variable:

```env
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

หลังเปลี่ยน `NEXT_PUBLIC_API_URL` ต้อง redeploy frontend เพราะค่าที่ขึ้นต้นด้วย `NEXT_PUBLIC_` จะถูกฝังตอน build.

## Demo Backup แบบรันจากเครื่อง

ถ้า internet ในงานไม่นิ่ง ให้เตรียมรัน local ไว้อีกทาง:

```powershell
cd project-backvoice
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

อีก terminal:

```powershell
cd project-frontvoice
npm.cmd install
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
npm.cmd run build
npm.cmd run start
```

Login demo:

```text
ADMIN: somchai / somchai123
STAFF: somsri / somsri123
```
