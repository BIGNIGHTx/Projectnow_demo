# FontAI — AI Voice Intelligence System

ระบบวิเคราะห์เสียง Call Center ด้วย AI สำหรับบริษัทเครื่องนอน

## สรุปการแก้ไขล่าสุด

อัปเดตนี้สรุปจากสถานะโปรเจกต์ปัจจุบัน ณ 19 พฤษภาคม 2026

### Frontend
- ปรับหน้าหลักหลายหน้าให้เป็น UI โทนสว่างและอ่านง่ายขึ้น: Dashboard, Files, Customers, Customer Detail, Warranty, Warranty Detail, Agents และ Agent Detail
- เพิ่มฟอนต์ผ่าน `next/font/google`: Montserrat, Sarabun และ Great Vibes แล้วผูกเข้ากับ `app/layout.tsx` และ `app/globals.css`
- ปรับ Dashboard ใหม่ให้เริ่มที่มุมมองรายวัน มีตัวเลื่อนช่วงเวลา Day / Month / Year, ปุ่มเลื่อนไปช่วงก่อนหน้า/ถัดไป และปุ่มกลับช่วงเวลาปัจจุบัน
- ปรับการ์ด KPI, Topic Distribution, Keyword Frequency, Brand Volume / Brand Issues และ Agent Performance ให้เป็น layout ตารางและกราฟที่สแกนง่ายขึ้น
- ปรับหน้า Files เป็น “Files Library” เพิ่มคอลัมน์ Call Type, แสดง Agent ID ชัดขึ้น และเพิ่ม upload queue overlay สำหรับติดตามสถานะการอัปโหลดหลายไฟล์
- ปรับหน้า Customer ให้แสดงสถานะ warranty ในตารางรายชื่อลูกค้า และออกแบบหน้า Customer Detail ใหม่ให้มี summary cards, ข้อมูลส่วนตัว, warranty และ call history ในหน้าเดียว
- เพิ่มการเปิดหน้า Customer Detail ด้วยรูปแบบ `phone-{เบอร์โทร}` เพื่อรวมข้อมูลลูกค้า/สายโทร/warranty จากเบอร์โทร แม้ยังไม่มี customer_id ตรง ๆ
- ปรับหน้า Warranty Storage และ Warranty Detail เป็นตาราง/การ์ดใหม่ พร้อม asset ไอคอน warranty จาก `public/waran.jpg`
- ปรับส่วน Warranty ในหน้า File Detail ให้เด่นขึ้นด้วยโทนสีเขียว และคลิกไปหน้า Warranty Detail ได้ง่ายขึ้น
- เพิ่ม asset ใหม่ใน `public/`: `iconkey.png`, `total.png`, `waran.jpg`

### Backend
- เพิ่ม `services/env_loader.py` สำหรับอ่านไฟล์ `.env` แบบง่ายโดยไม่ต้องเพิ่ม dependency ใหม่
- เรียก `load_env_file()` ใน `main.py`, `services/groq_ai_service.py` และ `services/typhoon_service.py` เพื่อให้ backend โหลด `GROQ_API_KEY`, `TYPHOON_API_KEY`, `HF_TOKEN` จาก `.env` ได้อัตโนมัติ
- เพิ่ม `.gitignore` ฝั่ง backend เพื่อกัน `.env`, `__pycache__/` และไฟล์ Python cache ไม่ให้หลุดเข้า git
- มีการเปลี่ยนแปลงไฟล์ฐานข้อมูล local `database/fontai.db` จากการรัน/ทดสอบในเครื่อง

### ไฟล์สำคัญที่ถูกแก้ไข
- Frontend: `app/dashboard/page.tsx`, `app/files/page.tsx`, `app/files/[id]/page.tsx`, `app/customers/page.tsx`, `app/customers/[id]/page.tsx`, `app/customers/warranty/[id]/page.tsx`, `app/warranty/page.tsx`, `app/agents/page.tsx`, `app/agents/[id]/page.tsx`, `app/layout.tsx`, `app/globals.css`
- Backend: `project-backend/main.py`, `project-backend/services/env_loader.py`, `project-backend/services/groq_ai_service.py`, `project-backend/services/typhoon_service.py`, `project-backend/.gitignore`
- Assets / lockfile: `public/iconkey.png`, `public/total.png`, `public/waran.jpg`, `bun.lock`

---

## สถาปัตยกรรมระบบ

```
Frontend (Next.js 16 + React 19 + Tailwind 4)
  │
  │  HTTP REST API
  │
Backend (FastAPI + Python)
  │
  ├── Groq Whisper large-v3  → ถอดเสียงเป็นข้อความ
  ├── Groq Llama 3.3 70B     → แก้ transcript + วิเคราะห์ + สรุป
  ├── SQLite (fontai.db)      → เก็บข้อมูลถาวร (ไม่หายเมื่อ restart)
  └── Local Storage           → เก็บไฟล์เสียง (storage/uploads/)
```

---

## วิธีติดตั้งและรัน

### 1. สมัคร Groq API Key (ฟรี)

ไปที่ https://console.groq.com/keys แล้วสร้าง key

### 2. Backend

```bash
cd project-backend

# ติดตั้ง dependencies
pip install fastapi uvicorn python-multipart groq openai requests pandas openpyxl

# สำหรับ Speaker Diarization (pyannote — ต้องมี NVIDIA GPU แนะนำ)
# ติดตั้ง PyTorch ก่อน: https://pytorch.org/get-started/locally/
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install pyannote.audio

# ตั้งค่า API Key (Windows PowerShell)
$env:GROQ_API_KEY="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
$env:TYPHOON_API_KEY="typ_xxxxxxxxxxxxxxxxxxxxxxxx"
$env:HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxxxxxx"

# ตั้งค่า API Key (Windows CMD)
set GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
set TYPHOON_API_KEY=typ_xxxxxxxxxxxxxxxxxxxxxxxx
set HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxx

# หรือสร้างไฟล์ .env ใน project-backend/
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
TYPHOON_API_KEY=typ_xxxxxxxxxxxxxxxxxxxxxxxx
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxx

# รัน server
uvicorn main:app --reload --port 8000
```

เปิด API Docs: http://localhost:8000/docs

### 3. Frontend

```bash
cd project-frontend

npm install
npm run dev
```

เปิดเว็บ: http://localhost:3000

---

## หน้าจอหลัก (Frontend)

| หน้า | Path | ฟีเจอร์ |
|------|------|---------|
| Login | `/login` (หน้าแรก) | ★ เข้าสู่ระบบ (username + password), ลิงก์ไปสมัคร |
| Register | `/register` | ★ สมัครสมาชิก (ชื่อ, username, email, password), role = STAFF |
| Dashboard | `/dashboard` | KPI Cards, Daily Call Volume (ปฏิทิน), Top Intents — ดึงข้อมูลจริงจาก DB |
| Upload | `/upload` | Drag & Drop หลายไฟล์, File Queue, อัปโหลด+วิเคราะห์อัตโนมัติ (จำกัด 60MB) |
| Files | `/files` | รายการไฟล์, ค้นหา, Dropdown filter, Pagination, auto-refresh, **Select Mode** (ลบหลายไฟล์), **Export** (Call Analysis Report + Agent Performance → xlsx/csv) |
| File Detail | `/files/[id]` | Conversation Summary, Transcription+Audio Player, Metadata+Inbound/Outbound, หลายแบรนด์, ปุ่มลิงก์ไปลูกค้า, re-Analyze, Delete, Failed state (rate limit) |
| Customer List | `/customers` | รายชื่อลูกค้า, ค้นหา (ชื่อ/นามสกุล/เบอร์/email), คลิกดู detail |
| Customer Detail | `/customers/[id]` | ข้อมูลลูกค้า, ที่อยู่, Warranty Products (กดดู detail), ประวัติการโทร (ใหม่→เก่า) |
| Warranty Storage | `/warranty` | ★ รายการรับประกันทั้งหมด, ค้นหา (ชื่อ/เบอร์/รหัสรับประกัน/แบรนด์), กดเข้าดู Warranty Detail |
| Warranty Detail | `/customers/warranty/[id]` | ข้อมูลประกัน (17 fields), ข้อมูลผู้ลงทะเบียน+ที่อยู่, รูปหลักฐานซื้อ, Activities |

---

## Flow การทำงาน

```
User อัปโหลดไฟล์เสียง (.wav/.mp3 ฯลฯ)
        │
        ▼
  POST /api/v1/audio/upload
        │
        ├── ★ ดึง date/customer/agent/direction จากชื่อไฟล์อัตโนมัติ
        ├── บันทึกไฟล์ + แปลงเป็น .wav (ถ้าจำเป็น)
        ├── สร้าง file_id, status = "processing"
        └── ★ เข้าคิววิเคราะห์อัตโนมัติ
                │
                ▼
        ┌────────────────────────────┐
        │  Queue Worker              │
        │  ประมวลผลทีละ 1 ไฟล์       │
        │  พัก 15 วินาทีระหว่างไฟล์   │
        └─────────┬──────────────────┘
                  │
                  ▼
        ┌───────────────────────────────────┐
        │  ตรวจขนาดไฟล์                      │
        │  < 5 นาที / < 24MB → ส่งทั้งไฟล์   │
        │  ≥ 5 นาที / ≥ 24MB → ตัด chunk     │
        └───────────────┬───────────────────┘
                        │
                        ▼
        ┌───────────────────┐
        │  Groq Whisper API │  Speech-to-Text
        │  (large-v3)       │  ส่งทีละ chunk / ทั้งไฟล์
        └───────┬───────────┘
                │
                ▼
        ┌───────────────────────────────┐
        │  Language Filter (3 ชั้น)      │
        │  1. กรอง segment ภาษาอื่นทิ้ง  │
        │  2. ลบคำแปลกในแต่ละ segment   │
        │  3. ลบ hallucination words     │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  Groq Llama 3.3 70B          │
        │  (รวม 2 งานใน call เดียว)      │
        │  1. แก้ transcript ให้ถูกต้อง  │
        │  2. วิเคราะห์ + สรุปบทสนทนา   │
        └───────────────┬───────────────┘
                        │
                        ▼
        บันทึกผลลง SQLite (fontai.db)
        File status → "analyzed"
        │
        ▼
  Frontend auto-poll → แสดงผล
```

---

## ฟีเจอร์หลัก

### AI Pipeline (Whisper + Llama)
- **Whisper large-v3** — ถอดเสียงภาษาไทย/อังกฤษ, temperature 0.0 (deterministic)
- **Llama 3.3 70B** — แก้คำผิด + แก้ชื่อแบรนด์/สินค้าเป็นอังกฤษ + วิเคราะห์รวมใน call เดียว:
  - Conversation Summary (4 จุดสรุป)
  - Sentiment (positive / neutral / negative)
  - Intent (สอบถามสินค้า, แจ้งชำรุด, สอบถามจัดส่ง ฯลฯ)
  - Brand (รองรับหลายแบรนด์ต่อไฟล์) / Product Category / Sale Channel
  - QA Score (เกณฑ์ 6 ข้อ, คะแนน 0-10)
  - CSAT Prediction (1-5)
  - Key Insights + Keywords
- **re-Analyze** — กดวิเคราะห์ซ้ำได้ เข้าคิวอัตโนมัติ แสดงผลล่าสุดเสมอ

### Filename Parser — ดึงข้อมูลจากชื่อไฟล์อัตโนมัติ
- Pattern: `{yyyyMMddHHmmss}-{ids}-{numA}-{numB}-{direction}.wav`
- **Outbound**: `...-{agent}-{customer}-Outbound.wav`
- **Inbound**: `...-{customer}-{agent}-Inbound.wav`
- ดึงได้: วันที่โทร, เบอร์ลูกค้า (format xxx-xxx-xxxx), Agent ID, ทิศทางสาย
- ไม่ต้องกรอก customer/agent เอง — parse จากชื่อไฟล์ให้ทันที

### หน้า Files — Search + Dropdown Filters
- **Search bar** — ค้นหาด้วย: ชื่อไฟล์, เบอร์โทร, Agent, Brand
- **Date filter** — dropdown เลือกช่วงวันที่ (date picker from ~ to)
- **Brand filter** — dropdown 12 แบรนด์
- **Product filter** — dropdown 6 หมวดสินค้า
- ปุ่ม "ล้างตัวกรอง" เมื่อมี filter active
- Filter ส่งไป backend จริง (server-side filtering)

### หน้า File Detail
- **Inbound/Outbound badge** ข้าง Customer Phone (สีเขียว/ส้ม)
- **หลายแบรนด์** แสดงเป็น tag badges สีฟ้า
- **Audio Player** หยุดอัตโนมัติเมื่อออกจากหน้า (ไม่เล่นต่อเมื่อกลับไปหน้าอื่น)
- **Failed state** — ถ้าวิเคราะห์ล้มเหลว (rate limit) แสดงกล่องแดง + ปุ่ม "วิเคราะห์ใหม่"
- **3 สถานะ**: Processing (กำลังวิเคราะห์ animation), Failed (ล้มเหลว + ปุ่มลองใหม่), ยังไม่วิเคราะห์ (ปุ่มเริ่มวิเคราะห์)

### Audio Chunking
- ไฟล์ > 5 นาที หรือ > 24MB → ตัดเป็น chunk ละ 5 นาทีอัตโนมัติ
- ใช้ Python `wave` module (built-in ไม่ต้องติดตั้งเพิ่ม)
- รวม transcript + ปรับ timestamp ให้ต่อเนื่อง

### Language Filter
- กรอง segment ที่ไม่ใช่ไทย/อังกฤษออก (Cyrillic, CJK, Arabic ฯลฯ)
- ลบคำแปลก / Whisper hallucination ~80 คำ (ฝรั่งเศส, สเปน, เยอรมัน ฯลฯ)
- เพิ่มคำ hallucination ได้ที่ `_WHISPER_HALLUCINATIONS` ใน `groq_ai_service.py`

### Queue System
- อัปโหลดหลายไฟล์พร้อมกัน → เข้าคิวอัตโนมัติ
- ประมวลผลทีละ 1 ไฟล์ → ป้องกัน Groq rate limit
- พัก 15 วินาทีระหว่างไฟล์
- แสดงลำดับคิว ("รอคิว ลำดับที่ 2 จาก 5")

### Multi API Key Rotation
- ใส่ได้หลาย key → สลับอัตโนมัติแบบ round-robin
- เจอ rate limit 429 → **fail ทันที** (ไม่ retry) → status = `failed` → user กด re-Analyze เมื่อพร้อม
- วิธีตั้งค่า:

```bash
# วิธี 1: ใส่ทีละ key
$env:GROQ_API_KEY="gsk_key1"
$env:GROQ_API_KEY_2="gsk_key2"
$env:GROQ_API_KEY_3="gsk_key3"

# วิธี 2: ใส่หลาย key คั่นด้วย comma
$env:GROQ_API_KEYS="gsk_key1,gsk_key2,gsk_key3"
```

### Auto-Analyze หลังอัปโหลด
- อัปโหลดเสร็จ → เข้าคิววิเคราะห์ทันที (ไม่ต้องกดปุ่ม)
- Upload API คืน `task_id` ให้ frontend poll สถานะ
- จำกัดขนาดไฟล์ 60MB

### Frontend Auto-Polling
- หน้า Files — auto-refresh ทุก 5 วินาทีถ้ามีไฟล์ PROCESSING
- หน้า File Detail — poll ทุก 3 วินาที + หยุด poll เมื่อ analyzed หรือ failed
- Audio Player — play/pause, seek, skip ±10 วินาที, subtitle sync auto-scroll

---

## โครงสร้างไฟล์

```
project-backend/
├── main.py                          # FastAPI entry point (4 routers)
├── database/
│   ├── db.py                        # ★ SQLite database module (แทน mock_db)
│   ├── schema.sql                   # ★ SQL schema (12 ตาราง warranty + 2 ตาราง audio)
│   ├── fontai.db                    # ★ SQLite database file (สร้างอัตโนมัติ)
│   └── mock_db.py                   # Mock DB เดิม (เก็บไว้เป็น reference)
├── routers/
│   ├── audio.py                     # Upload+auto-analyze, Filename parser, List+filters, Detail+customer match, Play, Delete, Batch delete
│   ├── ai_task.py                   # Queue worker (15s delay), Analyze, re-Analyze, Status, Tasks
│   ├── dashboard.py                 # Filters, Summary, Overview, Trends, Intent, Recommendations, Export
│   ├── customers.py                 # ★ Customer list+search, Detail, Warranty detail+list, Proof serve
│   └── auth.py                      # ★ Authentication (login, register)
├── services/
│   ├── groq_ai_service.py           # ★ Groq AI Pipeline (Whisper+Llama) + Typhoon Pipeline
│   ├── typhoon_service.py           # ★ Typhoon ASR (Speech-to-Text ภาษาไทย)
│   ├── diarization_service.py       # ★ pyannote Speaker Diarization (แยก Agent/Customer)
│   ├── ai_mock_service.py           # Mock AI Pipeline (fallback)
│   └── file_converter.py            # แปลงไฟล์เสียง → .wav (ffmpeg)
├── storage/
│   ├── uploads/                     # ไฟล์เสียงที่อัปโหลด (เก็บ local)
│   ├── converted/                   # ไฟล์ที่แปลงแล้ว
│   └── exports/                     # ไฟล์ export CSV/XLSX

project-frontend/
├── app/
│   ├── dashboard/page.tsx           # ★ Dashboard: KPI Cards, Daily Call Volume, Top Intents
│   ├── upload/page.tsx              # Upload: Drag&Drop, File Queue (60MB limit)
│   ├── files/page.tsx               # Files: Search+Dropdown filters (Date/Brand/Product), auto-refresh
│   ├── files/[id]/page.tsx          # File Detail: Summary, Transcription+Audio, multi-brand, customer link
│   ├── customers/page.tsx           # ★ Customer List: search (ชื่อ/เบอร์/email)
│   ├── customers/[id]/page.tsx      # ★ Customer Detail: info, address, warranty, ประวัติโทร
│   ├── customers/warranty/[id]/..   # ★ Warranty Detail: ข้อมูลประกัน, ผู้ลงทะเบียน, หลักฐาน, activities
│   ├── warranty/page.tsx            # ★ Warranty Storage: รายการรับประกันทั้งหมด, search
│   ├── login/page.tsx               # ★ Login: username + password
│   ├── register/page.tsx            # ★ Register: สมัครสมาชิก
│   ├── layout.tsx                   # Root layout (ThemeProvider + AuthProvider)
│   ├── page.tsx                     # Home (redirect → /login)
│   └── globals.css                  # Tailwind styles
├── components/
│   ├── Sidebar.tsx                  # Navigation + User info + Logout button
│   ├── AuthProvider.tsx             # ★ Session management (sessionStorage, redirect)
│   └── ThemeProvider.tsx            # ★ Dark/Light theme toggle + context
├── package.json                     # Next.js 16, React 19, Tailwind 4, Lucide React
└── tsconfig.json
```

---

## Database (SQLite)

DB file: `database/fontai.db` (สร้างอัตโนมัติตอน startup จาก `schema.sql`)

### Warranty System (จาก db_schema.xlsx)

| ตาราง | คำอธิบาย |
|-------|----------|
| `customers` | ข้อมูลลูกค้า (ชื่อ, เบอร์, email) |
| `addresses` | ที่อยู่ลูกค้า |
| `brands` | แบรนด์สินค้า (12 แบรนด์ seed) |
| `categories` | หมวดหมู่สินค้า (6 หมวด seed) |
| `products` | สินค้า (brand + category + SKU) |
| `channels` | ช่องทางซื้อ (4 ช่องทาง seed) |
| `warranty_registrations` | การลงทะเบียนรับประกัน |
| `proof_of_purchase` | หลักฐานการซื้อ (รูปภาพ/PDF) |
| `activities` | กิจกรรม/ความคิดเห็น |
| `admin_users` | ผู้ดูแลระบบ |

### Audio AI System (ใหม่)

| ตาราง | คำอธิบาย |
|-------|----------|
| `audio_files` | ข้อมูลไฟล์เสียง (path, customer, agent, call direction, status) |
| `audio_analyses` | ผลวิเคราะห์ AI (transcript, sentiment, brand_names, QA, segments) |

### การเก็บข้อมูล

| ข้อมูล | เก็บที่ | เหตุผล |
|--------|--------|--------|
| Metadata + Analysis | SQLite `fontai.db` | Query เร็ว, ไม่หายเมื่อ restart |
| ไฟล์เสียง .wav | Local `storage/uploads/` | ไฟล์ใหญ่ 10-60MB ไม่เหมาะเก็บใน DB |
| JSON fields (brand_names, segments ฯลฯ) | SQLite TEXT column | `json.dumps()` / `json.loads()` |

---

## API Endpoints

### Audio (`/api/v1/audio`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| GET | `/list` | รายการไฟล์ (search, brand, product, date_from, date_to, status, pagination) |
| GET | `/detail/{file_id}` | ข้อมูลไฟล์ + ผลวิเคราะห์ AI + matched_customer (ถ้าเบอร์ match) |
| POST | `/upload` | อัปโหลด (60MB limit) + parse ชื่อไฟล์ + เข้าคิววิเคราะห์ (คืน task_id) |
| GET | `/play/{file_id}` | Stream เล่นไฟล์เสียง |
| GET | `/info/{file_id}` | ข้อมูลไฟล์ (metadata) |
| DELETE | `/delete/{file_id}` | ลบไฟล์ + analysis จาก DB + ไฟล์จาก disk |
| POST | `/delete-batch` | ★ ลบหลายไฟล์พร้อมกัน (รับ `{ file_ids: [...] }`) |

### AI Analysis (`/api/v1/ai`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| POST | `/analyze/{file_id}` | สั่งวิเคราะห์ / re-Analyze (เข้าคิว, คืน task_id) |
| POST | `/retest/{file_id}` | วิเคราะห์ซ้ำ (flag retest) |
| GET | `/status/{task_id}` | ตรวจสถานะ Task + ลำดับคิว |
| GET | `/tasks` | รายการ Task ทั้งหมด + stats |

### Dashboard (`/api/v1/dashboard`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| GET | `/stats` | ★ Dashboard data ครบใน call เดียว (KPI + Top Intents + Daily Volume) |
| GET | `/filters` | ตัวเลือก Brand/Product/Channel สำหรับ filter |
| GET | `/summary` | สรุป KPIs (filter ได้) |
| GET | `/overview` | ภาพรวม KPIs + distribution |
| GET | `/trends` | แนวโน้มรายวัน |
| GET | `/intent-analysis` | วิเคราะห์ประเภทปัญหา |
| GET | `/recommendations` | คำแนะนำ AI |
| GET | `/export` | Export CSV / XLSX (legacy) |
| GET | `/export-calls?format=xlsx\|csv` | ★ Export Call Analysis Report (ทุกสาย + metadata + AI results) |
| GET | `/export-agents?format=xlsx\|csv` | ★ Export Agent Performance (สรุปผลงาน agent: QA, CSAT, sentiment) |

### Customers (`/api/v1/customers`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| GET | `/list?search=` | รายชื่อลูกค้า (search ชื่อ/นามสกุล/เบอร์/email) |
| GET | `/detail/{customer_id}` | ข้อมูลลูกค้าครบ (info + address + warranty + ประวัติโทร) |
| GET | `/warranty/{registration_id}` | ข้อมูลประกันครบ (warranty + product + customer + proof + activities) |
| GET | `/proof/{proof_id}` | Serve ไฟล์รูปหลักฐานการซื้อ |
| GET | `/warranty-list?search=` | ★ รายการรับประกันทั้งหมด (search ชื่อ/เบอร์/รหัส/แบรนด์/รุ่น) |


### Authentication (`/api/v1/auth`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| POST | `/login` | ★ เข้าสู่ระบบ (username + password → return user info) |
| POST | `/register` | ★ สมัครสมาชิก (username, password, full_name, email, role) |

---

## Environment Variables

Backend รองรับการอ่านค่าจากไฟล์ `project-backend/.env` แล้วผ่าน `services/env_loader.py` โดยไฟล์ `.env` ถูก ignore จาก git เพื่อไม่ให้ API key หลุดขึ้น repository

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ | Groq API Key หลัก (Llama analysis) |
| `GROQ_API_KEY_2` ... `_20` | Optional | Key เพิ่มเติม (สลับ round-robin) |
| `GROQ_API_KEYS` | Optional | หลาย key คั่นด้วย comma |
| `TYPHOON_API_KEY` | ★ แนะนำ | Typhoon ASR API Key (ถ้าไม่มี → fallback ไป Groq Whisper) |
| `HF_TOKEN` | ★ แนะนำ | HuggingFace Token สำหรับ pyannote speaker diarization |
| `NEXT_PUBLIC_API_URL` | Optional | URL Backend (default: `http://localhost:8000`) |

```bash
# ตั้งค่า environment variables (Windows CMD)
set GROQ_API_KEY=gsk_xxx
set TYPHOON_API_KEY=typ_xxx
set HF_TOKEN=hf_xxx

# ตั้งค่า environment variables (Windows PowerShell)
$env:GROQ_API_KEY="gsk_xxx"
$env:TYPHOON_API_KEY="typ_xxx"
$env:HF_TOKEN="hf_xxx"
```

### Prerequisites — pyannote Speaker Diarization

```bash
# 1. ติดตั้ง PyTorch (Windows + CUDA) — ไปเลือกเวอร์ชันที่:
#    https://pytorch.org/get-started/locally/
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# 2. ติดตั้ง pyannote
pip install pyannote.audio

# 3. Accept license ที่ HuggingFace (ต้องทำทั้ง 2 links):
#    https://huggingface.co/pyannote/speaker-diarization-3.1
#    https://huggingface.co/pyannote/segmentation-3.0

# 4. ตรวจว่า GPU พร้อม
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}, GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"CPU only\"}')"
```

---

## AI Models

| Model | Provider | Task | หมายเหตุ |
|-------|----------|------|----------|
| `typhoon-asr-realtime` | Typhoon API (Cloud) | Speech-to-Text | ★ ภาษาไทยแม่น, สร้างมาเพื่อไทยโดยเฉพาะ |
| `pyannote/speaker-diarization-3.1` | Local (GPU) | Speaker Diarization | ★ แยก Agent/Customer จากเสียง |
| `whisper-large-v3` | Groq (Cloud) | Speech-to-Text | Fallback ถ้าไม่มี Typhoon API Key |
| `llama-3.3-70b-versatile` | Groq (Cloud) | NLP Analysis | แก้ transcript + วิเคราะห์ |

### AI Pipeline Flow

```
มี TYPHOON_API_KEY:
  Audio → Typhoon STT → pyannote (แยกผู้พูด) → Groq Llama (วิเคราะห์)
  ผลลัพธ์: "[00:00] Agent: สวัสดีครับ\n[00:03] Customer: สอบถามค่ะ"

ไม่มี TYPHOON_API_KEY (fallback):
  Audio → Groq Whisper → Groq Llama (วิเคราะห์)
  ผลลัพธ์: "สวัสดีครับ สอบถามค่ะ" (ไม่แยกผู้พูด)
```

---

## Config ที่ปรับได้ (`groq_ai_service.py`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `WHISPER_MODEL` | `whisper-large-v3` | Groq Whisper model |
| `LLAMA_MODEL` | `llama-3.3-70b-versatile` | Groq Llama model |
| `WHISPER_MAX_FILE_SIZE_MB` | 24 | chunk ถ้าเกินขนาดนี้ |
| `CHUNK_DURATION_SECONDS` | 300 | ตัดทุกกี่วินาที (300 = 5 นาที) |
| `DELAY_BETWEEN_STEPS` | 1 | พักระหว่าง Whisper → Llama (วินาที) |
| `_WHISPER_HALLUCINATIONS` | ~80 คำ | คำที่ Whisper มักถอดผิด (เพิ่มได้) |

---

## รูปแบบชื่อไฟล์ (Filename Pattern)

ระบบดึง date, customer, agent, call direction จากชื่อไฟล์อัตโนมัติ:

```
Outbound: {yyyyMMddHHmmss}-{ids}-{agent}-{customer}-Outbound.wav
Inbound:  {yyyyMMddHHmmss}-{ids}-{customer}-{agent}-Inbound.wav
```

| ตัวอย่าง | ได้ |
|---------|-----|
| `20251104173706-...-104-0819979336-Outbound.wav` | date=Nov 4 2025, agent=AGENT-104, phone=081-997-9336, Outbound |
| `20251201175254-...-0634654956-102-Inbound.wav` | date=Dec 1 2025, phone=063-465-4956, agent=AGENT-102, Inbound |

ไฟล์ที่ชื่อไม่ตรง pattern → fallback เป็น N/A ทุกค่า

---

## แบรนด์ที่รองรับ (12 แบรนด์)

Lotus, Omazz, Midas, Dunlopillo, Bedgear, LaLaBed, Zinus, Eastman House, Malouf, Loto Mobili, Woodfield, Restonic

รองรับหลายแบรนด์ต่อ 1 ไฟล์ (เก็บเป็น `brand_names` array)

## หมวดสินค้า (6 หมวด)

| ภาษาไทย | เก็บเป็น (English) |
|----------|-------------------|
| ที่นอน, ฟูก | Mattress |
| หมอน | Pillow |
| เครื่องนอน, ผ้าปู, ผ้านวม, ชุดเครื่องนอน | Bedding |
| โครงเตียง, เตียง, หัวเตียง | Bed Frame |
| ท็อปเปอร์, แผ่นรองนอน | Topper |
| แผ่นกันเปื้อน, ผ้ารองกันเปื้อน, กันไรฝุ่น | Protector |

AI จะแปลงชื่อสินค้าภาษาไทยเป็นภาษาอังกฤษก่อนบันทึกเสมอ

## ช่องทางขาย (4 ช่องทาง)

Official Store, Online, Department Store, Dealer

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 (Dark/Light mode), Lucide React |
| Backend | FastAPI, Python 3.12+, Uvicorn |
| AI (STT) | Typhoon ASR API (ภาษาไทย) / Groq Whisper (fallback) |
| AI (Diarization) | pyannote/speaker-diarization-3.1 (Local GPU) |
| AI (Analysis) | Groq Llama 3.3 70B (แก้ transcript + วิเคราะห์) |
| Database | SQLite (fontai.db) |
| Audio | Python `wave` module (chunking), ffmpeg (conversion) |

---

## สำหรับนักพัฒนาที่รับต่อ

### สิ่งที่ต้องรู้
1. **SQLite DB (`database/fontai.db`)** — สร้างอัตโนมัติตอน startup, ข้อมูลเก็บถาวร ไม่หายเมื่อ restart
2. **ไฟล์เสียงเก็บ local** — `storage/uploads/`, DB เก็บแค่ path ไม่ได้เก็บตัวไฟล์
3. **Groq Rate Limit → fail ทันที** — ไม่ retry, status เปลี่ยนเป็น `failed`, user กด re-Analyze เมื่อพร้อม
4. **AI Pipeline เลือกอัตโนมัติ** — มี `TYPHOON_API_KEY` → Typhoon+pyannote+Llama / ไม่มี → Groq Whisper+Llama (fallback)
5. **Speaker Diarization** — pyannote แยก Agent/Customer อัตโนมัติ, โหลด model ครั้งแรกช้า ~30s, ต้อง accept license ที่ HuggingFace
4. **Queue ทำงานทีละ 1 ไฟล์** — พัก 15 วินาทีระหว่างไฟล์
5. **File status 3 สถานะ** — `processing`, `analyzed`, `failed`
6. **Dashboard ดึงข้อมูลจริงจาก DB** — KPI, Daily Call Volume (ปฏิทินเลือกเดือน/ปี), Top Intents
7. **Dark/Light Theme** — ปุ่มสลับมุมขวาบน ทำงานทุกหน้า จำค่าใน localStorage
8. **Filename parser** — ดึง date/customer/agent/direction จากชื่อไฟล์อัตโนมัติ
9. **Brand เก็บเป็น JSON array** — `brand_names: ["Lotus", "Omazz"]` รองรับหลายแบรนด์ต่อไฟล์
10. **re-Analyze** — กดแล้วเข้าคิว ระบบคืนผลวิเคราะห์ล่าสุดเสมอ (ORDER BY created_at DESC)
11. **Upload limit** — 60MB
12. **ลบหลายไฟล์พร้อมกัน** — Select Mode → เลือกไฟล์ → ยืนยันพิมพ์ "DELETE" (ป้องกัน 4 ชั้น)
13. **Export** — หน้า Files ปุ่ม Export → dropdown เลือก Call Analysis Report / Agent Performance → xlsx หรือ csv
14. **Customer ↔ Audio เชื่อมด้วยเบอร์โทร** — match เบอร์ → ปุ่มลิงก์ไป customer detail
15. **Proof of Purchase** — รูปหลักฐานเก็บ local, serve ผ่าน API
16. **ปิด DB Browser ก่อนใช้ backend** — SQLite ถูก lock ถ้า DB Browser เปิดอยู่
17. **Authentication** — Login/Register ผ่าน admin_users table, password hash (SHA256), session เก็บใน sessionStorage (ปิด browser = หลุด)
18. **Audit log** — `audio_files.created_by`, `audio_files.updated_by`, `audio_analyses.created_by` เก็บ admin_user_id ผู้ดำเนินการ
19. **Default password** — user เดิม (somchai, somsri) password = `1234`

### สิ่งที่ยังไม่ได้ทำ
- ย้ายจาก SQLite → Supabase (PostgreSQL + pgvector) สำหรับ production
