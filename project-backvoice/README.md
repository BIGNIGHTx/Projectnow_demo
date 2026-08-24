# FontAI — AI Voice Intelligence System

ระบบวิเคราะห์เสียง Call Center ด้วย AI สำหรับบริษัทเครื่องนอน
รองรับการถอดเสียงภาษาไทย, แยกผู้พูด (Agent/Customer), แก้ transcript, mask PII,
วิเคราะห์ NLP + QA + Deep Customer Insight, จัดการลูกค้าและการรับประกัน
พร้อมระบบ Authentication + Role-based Access Control + Audit Log

---

## สถาปัตยกรรมระบบ

```
Frontend (Next.js 16 + React 19 + Tailwind 4)
  │
  │  HTTP REST API (มี X-Actor-* headers สำหรับ audit log)
  │
Backend (FastAPI + Python 3.12+)
  │
  ├── AI Pipeline (เลือกอัตโนมัติ)
  │   ├── Typhoon ASR + pyannote diarization + Groq Llama   (ถ้ามี TYPHOON_API_KEY)
  │   └── Groq Whisper large-v3 + Groq Llama 3.3 70B        (fallback)
  │
  ├── SQLite (database/fontai.db)
  │   └── 13 tables: customers, addresses, brands, categories, products,
  │                  channels, warranty_registrations, proof_of_purchase,
  │                  activities, admin_users, agents, audio_files,
  │                  audio_analyses, admin_activity_logs
  │
  └── Local Storage (storage/uploads/, storage/converted/, storage/exports/)
```

---

## วิธีติดตั้งและรัน

### 1. สมัคร API Keys

| Service | URL | ใช้ทำอะไร |
|---------|-----|----------|
| Groq | https://console.groq.com/keys | Whisper STT (fallback) + Llama analysis |
| Typhoon | https://opentyphoon.ai | Thai ASR (แนะนำ ถ้ามีจะคุณภาพดีกว่า Whisper สำหรับภาษาไทย) |
| HuggingFace | https://huggingface.co/settings/tokens | โหลด pyannote model (ต้อง accept license ที่ลิงก์ด้านล่าง) |

### 2. Backend

```bash
cd project-backend

# Dependencies หลัก
pip install fastapi uvicorn python-multipart groq openai requests pandas openpyxl

# สำหรับ Speaker Diarization (pyannote — แนะนำให้มี NVIDIA GPU)
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install pyannote.audio

# ตั้งค่า API Keys (Windows PowerShell)
$env:GROQ_API_KEY="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
$env:TYPHOON_API_KEY="typ_xxxxxxxxxxxxxxxxxxxxxxxx"   # optional แต่แนะนำ
$env:HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxxxxxx"            # optional (สำหรับ pyannote)

# Windows CMD
set GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
set TYPHOON_API_KEY=typ_xxxxxxxxxxxxxxxxxxxxxxxx
set HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxx

# รัน server
uvicorn main:app --reload --port 8000
```

นอกจาก env var ระบบยังรองรับไฟล์ `.env` วางคู่กับ `main.py` ได้ (`_load_local_env()` ใน main.py จะโหลดให้อัตโนมัติ)

เปิด API Docs: http://localhost:8000/docs

### 3. Frontend

```bash
cd project-frontend
npm install
npm run dev
```

เปิดเว็บ: http://localhost:3000

---

## Default Users (สำหรับ login ครั้งแรก)

ระบบ seed user 2 คนตอน startup (`database/db.py` → `init_db()`):

| Username | Password | Role | ชื่อ |
|----------|----------|------|-----|
| `somchai` | `somchai123` | ADMIN | สมชาย มีหมาย |
| `somsri`  | `somsri123`  | STAFF | สมศรี หมีหาย |

Password hash = `sha256("fontai_<password>_salt")`

---

## หน้าจอหลัก (Frontend)

| หน้า | Path | Role | ฟีเจอร์ |
|------|------|------|---------|
| Login | `/login` | public | username + password → return user, redirect ไป /dashboard |
| Register | `/register` | public | สมัครสมาชิก (default role = STAFF) |
| Dashboard | `/dashboard` | ทุก role | KPI Cards, Sentiment, Topic Donut, Keyword Top 10, Brand Volume/Issues, **Agent Performance (ADMIN เท่านั้น)**, Date filter (Day/Month/Year) |
| Files | `/files` | ทุก role | รายการไฟล์, search, dropdown filter (Date/Brand/Product), Pagination, auto-refresh ทุก 5s (เมื่อมี PROCESSING), Upload ตรงในหน้านี้, **Select Mode + Batch Delete**, Export menu |
| Upload | `/upload` | ทุก role | Drag & Drop, File Queue, auto-analyze (60MB limit) |
| File Detail | `/files/[id]` | ทุก role | Summary Insight (Intent + Keywords + Anomaly), **Key Insight (Deep Customer Insight)** — ความเสี่ยง + ลูกค้าต้องการอะไร + สิ่งที่ควรทำต่อ, Transcription พร้อม Audio Player sync subtitle, Metadata, Warranty list ของลูกค้า (ถ้า match เบอร์), re-Analyze, Delete |
| Customer List | `/customers` | ทุก role | รายชื่อลูกค้า, ค้นหา, badge บอกว่ามีประกันหรือไม่ |
| Customer Detail | `/customers/[id]` | ทุก role | ข้อมูลลูกค้า, ที่อยู่, Warranty Products, ประวัติการโทร (รองรับ `phone-xxx` route สำหรับลูกค้าที่ไม่อยู่ใน DB) |
| Warranty Storage | `/warranty` | ทุก role | รายการรับประกันทั้งหมด, ค้นหา |
| Warranty Detail | `/customers/warranty/[id]` | ทุก role | ข้อมูลประกัน 17 fields + ผู้ลงทะเบียน + รูปหลักฐาน + Activities |
| Agents | `/agents` | **ADMIN only** | รายการ Agents + QA/CSAT, sort, search |
| Agent Detail | `/agents/[id]` | **ADMIN only** | Stats + Call Log ของ agent |
| Admin Management | `/admin` | **ADMIN only** | จัดการ user (เปลี่ยน role, suspend/activate), ดู Activity Logs ทั้งหมด |

หน้า `/agents` และ `/admin` มี layout guard (`app/agents/layout.tsx`, `app/admin/layout.tsx`) — STAFF/VIEWER เข้าไม่ได้

---

## Flow การทำงาน

```
User อัปโหลดไฟล์เสียง (.wav/.mp3/.m4a/.aac/.ogg/.flac/.wma/.opus + video formats)
        │
        ▼
  POST /api/v1/audio/upload
        │
        ├── ★ SHA256 hash dedup — ไฟล์ซ้ำ → 409 Conflict
        ├── ★ Parse ชื่อไฟล์ → date/customer/agent/direction
        ├── บันทึกไฟล์ + แปลงเป็น .wav (ffmpeg, 16kHz mono) ถ้าจำเป็น
        ├── สร้าง file_id (UUID), status = "processing"
        ├── เข้าคิววิเคราะห์อัตโนมัติ
        └── Log UPLOAD_FILE action (admin_activity_logs)
                │
                ▼
        ┌────────────────────────────┐
        │  AI Queue Worker           │
        │  ทีละ 1 ไฟล์, พัก 15s        │
        └─────────┬──────────────────┘
                  │
                  ▼
        ┌────────────────────────────────────────┐
        │  Pipeline (เลือกอัตโนมัติ)                 │
        │  มี TYPHOON_API_KEY → Typhoon Pipeline  │
        │  ไม่มี → Groq Pipeline                   │
        └────────────────────────────────────────┘
            │                                     |                         
            │ใช้งานหลัก                             | Fall Back
            │                                     |      
            ▼                                     ▼
  Typhoon Pipeline (5 steps):                  Groq Pipeline (4 steps):
  ───────────────────────────                  ────────────────────────
  1. Typhoon ASR (Speech-to-Text)              1. Groq Whisper (Speech-to-Text)
  2. pyannote (Speaker Diarization)               (รองรับ chunking 5 นาที/ไฟล์)
     → merge transcript + speakers
     → "Agent: ... / Customer: ..."
  2.5 Fix Transcript (chunked, plain text)     1.5 Fix Transcript (chunked, plain text)
  3. PII Masking (chunked, [NAME]/[PHONE])     2. PII Masking (chunked, [NAME]/[PHONE])
  4. Groq Llama Analyze                        3. Groq Llama Analyze
     → sentiment, intent, brand_names,            → (เหมือนกัน)
       product, channel, QA, CSAT, summary,
       keywords, key_insights, action_items
  5. Llama Deep Customer Insight               4. Llama Deep Customer Insight
     → customer_need (รวมบริบทเหตุผล),            → (เหมือนกัน)
       pain_point, root_cause, expectation,
       risk_level, recommended_steps,
       confidence
        |
        ▼
  บันทึกลง SQLite (audio_analyses)
  File status → "analyzed" (หรือ "failed" ถ้า rate limit)
        │
        ▼
  Frontend auto-poll → แสดงผล (poll 3s ที่หน้า detail, 5s ที่หน้า list)
```

---

## ฟีเจอร์หลัก

### AI Pipeline

**STT (Speech-to-Text):**
- **Typhoon ASR** (`typhoon-asr-realtime`) — ภาษาไทยแม่นกว่า, มี timestamps
- **Groq Whisper** (`whisper-large-v3`) — fallback, temperature 0.0, มี Thai prompt
- รองรับไฟล์ยาว: chunk ละ 5 นาทีอัตโนมัติเมื่อ > 5 นาที หรือ > 24MB (ใช้ Python `wave` module — ไม่ต้องติดตั้งเพิ่ม)

**Speaker Diarization (เฉพาะ Typhoon pipeline):**
- `pyannote/speaker-diarization-3.1` รัน local บน GPU/CPU
- Overlap-based matching: หา speaker segment ที่ overlap มากสุดกับแต่ละ transcript segment
- คนพูดก่อน = Agent, คนถัดมา = Customer (สำหรับ call center)

**Language Filter (เฉพาะ Groq pipeline):**
- 3 ชั้น: filter ทั้ง segment / กรองคำในแต่ละ segment / drop segment ที่มีไทย < 30%
- กรองคำต่างชาติ (Cyrillic, CJK, ฯลฯ) + ลบ Whisper hallucination ~80 คำ (ฝรั่งเศส/สเปน/เยอรมัน/อิตาเลียน/โปรตุเกส)
- คำอังกฤษ ≥ 3 ตัวอักษรต้องอยู่ใน `_ENGLISH_WHITELIST` (ชื่อแบรนด์, คำ business ที่คนไทยใช้)
- เพิ่มคำ hallucination ได้ที่ `_WHISPER_HALLUCINATIONS` ใน `groq_ai_service.py`

**Fix Transcript (Chunked):**
- หั่น transcript เป็น chunks ~2000 chars ตัดที่ขอบประโยค (`ครับ`/`ค่ะ`/`.`/`\n`)
- Llama แก้คำผิด/ลบ noise/แปลงชื่อแบรนด์ไทย → อังกฤษ (เช่น `ดันลอปพิลโล่` → `Dunlopillo`)
- Output เป็น plain text (ไม่ใช่ JSON) เพื่อประหยัด tokens
- Safety check: ถ้า output สั้นกว่า input 30%+ → fallback ใช้ original

**PII Masking:**
- Mask `ชื่อบุคคล` → `[NAME]` และ `เบอร์โทร` → `[PHONE]`
- Chunked เหมือน Fix Transcript
- Keep แบรนด์, AGENT-104, รหัสสินค้า, วันที่, ราคา ไว้เหมือนเดิม
- Mask ก่อนส่งให้ Llama วิเคราะห์ → ลด PII leakage

**NLP Analysis (Llama 3.3 70B):**
ใน call เดียวคืนค่าครบ:
- **Conversation Summary** — 4 จุดสรุป + 1-2 ประโยครวม
- **Sentiment** — positive / neutral / negative + score 0.0-1.0
- **Intent** — สอบถามสินค้า, แจ้งชำรุด, สอบถามจัดส่ง, สอบถามโปรโมชั่น, สอบถามการรับประกัน, ขอเปลี่ยน, ชมเชย, สอบถามทั่วไป, ขอยกเลิก/คืน
- **brand_names** — array (รองรับหลายแบรนด์ต่อไฟล์) ผ่าน `_normalize_brand()`: exact match → alias → prefix 4 ตัว → fuzzy similarity 0.7
- **Product Category** / **Sale Channel**
- **QA Score** — เกณฑ์ 6 ข้อ คะแนน 0-10, แปลงเป็น grade A+/A/B/C/D/F
- **CSAT Prediction** — 1-5 ดาว (จาก QA score)
- **Keywords** + **Key Insights** + **Action Items** (auto: ติดตามถ้า negative, ส่ง Retention ถ้ายกเลิก, แจ้ง Supervisor ถ้า QA < 6)

**Deep Customer Insight (second-pass AI):**
Llama รอบที่ 2 โดยไม่แก้ผล base analysis — คืน JSON:
- `customer_need` — รวมสิ่งที่ลูกค้าต้องการ + บริบทเหตุผลในประโยคเดียว
- `pain_point` / `root_cause` / `expectation`
- `risk_level` — `low` / `medium` / `high`
- `recommended_action` + `recommended_steps` (หั่นเป็น list)
- `confidence` 0-100

### Filename Parser — ดึงข้อมูลจากชื่อไฟล์อัตโนมัติ

```
Pattern: {yyyyMMddHHmmss}-{ids}-{numA}-{numB}-{direction}.{ext}

Outbound: ...-{agent}-{customer}-Outbound.ext      → numA=agent, numB=phone
Inbound:  ...-{customer}-{agent}-Inbound.ext       → numA=phone, numB=agent
```

| ตัวอย่าง | parse ได้ |
|---------|---------|
| `20251104173706-1762252614.105999-104-0819979336-Outbound.wav` | date=Nov 4 2025, agent=AGENT-104, phone=081-997-9336, Outbound |
| `20251201175254-1764586296.121193-0634654956-102-Inbound.wav`  | date=Dec 1 2025, phone=063-465-4956, agent=AGENT-102, Inbound |

ชื่อไฟล์ที่ไม่ตรง pattern → call_date = now(), customer/agent = "N/A", direction = "Unknown"

### Authentication + Role-based Access Control

**3 Roles:**

| Role | สิทธิ์ |
|------|------|
| `ADMIN` | ทุกหน้า + Agents + Admin Management (ดู/แก้ user, ดู activity logs) |
| `STAFF` | ทุกหน้ายกเว้น Agents และ Admin Management |
| `VIEWER` | (สงวนไว้ — เหมือน STAFF ใน UI ปัจจุบัน) |

**Session:**
- เก็บใน `sessionStorage` (`fontai_user`) → ปิด browser = หลุดอัตโนมัติ
- `AuthProvider` ตอน mount จะ patch `window.fetch` ฉีด `X-Actor-Id` / `X-Actor-Username` / `X-Actor-Role` headers ทุก request ที่ไป backend
- Logout ใช้ `navigator.sendBeacon` เพื่อให้บันทึก LOGOUT log สำเร็จแม้กำลังเปลี่ยน page

**Layout Guard:**
- `/agents/layout.tsx` และ `/admin/layout.tsx` redirect ไป `/dashboard` ถ้า role ≠ ADMIN

### Audit Log (Admin Activity Logs)

ทุก action สำคัญถูกบันทึกใน table `admin_activity_logs`:
- `LOGIN`, `LOGOUT`, `REGISTER`
- `UPDATE_ROLE`, `ACTIVATE_USER`, `DEACTIVATE_USER`
- `UPLOAD_FILE`, `ANALYZE_FILE`, `REANALYZE_FILE`, `DELETE_FILE`, `DELETE_FILE_BATCH`

เก็บ: `actor_user_id`, `actor_username`, `actor_role`, `action`, `target_type/id/label`, `detail`, `ip_address`, `created_at`

ดูที่หน้า `/admin` → tab "Activity Logs" (filter ตาม search/action/user/วันที่)

### หน้า Files

- Search ครอบคลุม: ชื่อไฟล์, เบอร์โทร, Agent ID, brand_names (JSON), intent
- Dropdown filters: Date range, Brand (12 แบรนด์), Product (6 หมวด) — ส่งไป backend จริง (server-side filtering)
- ปุ่ม "ล้างตัวกรอง" เมื่อมี filter active
- **Auto-refresh ทุก 5 วินาที** เมื่อมีไฟล์ status = PROCESSING
- **Upload toast (มุมขวาล่าง)** — ลากไฟล์/กดปุ่ม Upload ในหน้า Files ได้เลย, แสดง progress, auto-clear done items ใน 4 วินาที
- **Select Mode** — กดปุ่ม Delete (สีแดง) เข้า Select Mode → tick ไฟล์ที่จะลบ → ยืนยันพิมพ์ `Delete`
- **Export** ผ่าน endpoint `/dashboard/export-calls` และ `/dashboard/export-agents` (xlsx/csv)

### หน้า File Detail

- 3 สถานะ: PROCESSING (loading animation + bouncing dots), FAILED (กล่องแดง + ปุ่มวิเคราะห์ใหม่), ยังไม่วิเคราะห์ (กล่องเหลือง + ปุ่มเริ่มวิเคราะห์)
- Inbound/Outbound badge (สีเขียว/ส้ม)
- หลายแบรนด์ → tag badges สีฟ้า
- Audio Player: play/pause, seek, skip ±10s, subtitle sync auto-scroll
- **หยุดเสียงอัตโนมัติเมื่อออกจากหน้า** (cleanup ใน useEffect)
- Transcription รองรับ 2 format: timestamp segments (Whisper) + speaker-labeled lines (Typhoon+pyannote — Agent/Customer)
- Re-Analyze: กดแล้วเข้าคิว, poll status ทุก 2s, รอได้สูงสุด 5 นาที (150 ครั้ง × 2s)
- Auto-poll สำหรับไฟล์ที่ยัง processing: poll detail ทุก 3 วินาที จนกว่าจะ analyzed/failed
- Warranty card: ถ้าเบอร์โทร match ลูกค้า → แสดงรายการประกันของลูกค้าคนนั้น

### Multi API Key Rotation (Groq)

ใส่ได้หลาย key → สลับ round-robin ทุก request:

```bash
# วิธี 1: ใส่ทีละ key (รองรับสูงสุด 20 keys)
$env:GROQ_API_KEY="gsk_key1"
$env:GROQ_API_KEY_2="gsk_key2"
$env:GROQ_API_KEY_3="gsk_key3"

# วิธี 2: comma-separated
$env:GROQ_API_KEYS="gsk_key1,gsk_key2,gsk_key3"
```

เจอ rate limit 429 → **fail ทันที** (ไม่ retry) → status = `failed` → user กด re-Analyze เมื่อพร้อม

### Queue System

- อัปโหลดหลายไฟล์พร้อมกัน → เข้าคิวอัตโนมัติ
- ประมวลผลทีละ 1 ไฟล์ → ป้องกัน Groq rate limit
- พัก 15 วินาทีระหว่างไฟล์
- แสดงลำดับคิว ("รอคิว ลำดับที่ 2 จาก 5")
- Worker เริ่มอัตโนมัติเมื่อมี task เข้ามาครั้งแรก (`_ensure_worker_started`)

---

## API Endpoints

### Audio (`/api/v1/audio`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| GET | `/list` | รายการไฟล์ (search, brand, product, date_from, date_to, status, page, per_page) |
| GET | `/detail/{file_id}` | ข้อมูลไฟล์ + analysis ล่าสุด + matched_customer + warranties |
| POST | `/upload` | อัปโหลด (60MB limit, SHA256 dedup) + parse ชื่อไฟล์ + เข้าคิว |
| GET | `/play/{file_id}` | Stream เล่นไฟล์เสียง |
| GET | `/info/{file_id}` | ข้อมูลไฟล์ดิบ |
| DELETE | `/delete/{file_id}` | ลบไฟล์ + analysis + ไฟล์จาก disk + log DELETE_FILE |
| POST | `/delete-batch` | ลบหลายไฟล์ (`{ file_ids: [...] }`) + log DELETE_FILE_BATCH |

### AI Analysis (`/api/v1/ai`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| POST | `/analyze/{file_id}` | สั่งวิเคราะห์ / re-Analyze (เข้าคิว, คืน `task_id`) |
| POST | `/retest/{file_id}` | วิเคราะห์ซ้ำ (flag `is_retest`, มี `retest_reason`) |
| GET | `/status/{task_id}` | สถานะ Task + queue_position |
| GET | `/tasks` | รายการ Task + stats (queued/processing/completed/failed) |

### Dashboard (`/api/v1/dashboard`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| GET | `/stats` | KPI + Top Intents + Top Keywords + Daily Volume + Agent Performance + Anomalies (call เดียว) |
| GET | `/insights?period=day\|month\|year&date=...` | ★ Dashboard ใหม่: KPI + sentiment + topics + keywords + brand_volume + brand_issues + agent_performance (filter ตาม period) |
| GET | `/insights/available-years` | ปีที่มีข้อมูลใน DB (สำหรับ dropdown) |
| GET | `/filters` | Brand / Product / Channel สำหรับ dropdown |
| GET | `/summary?brand=&product=&channel=` | KPIs + filter 3 มิติ |
| GET | `/overview` | KPIs + distribution (brand/product/channel) |
| GET | `/trends?days=` | แนวโน้มรายวัน |
| GET | `/intent-analysis` | วิเคราะห์ประเภทปัญหา |
| GET | `/recommendations` | คำแนะนำ AI (rule-based: CSAT/QA/escalation) |
| GET | `/export?format=xlsx\|csv` | Export legacy (สูตรเก่า) |
| GET | `/export-calls?format=xlsx\|csv` | ★ Export Call Analysis Report (ทุกสาย + metadata + AI results) |
| GET | `/export-agents?format=xlsx\|csv` | ★ Export Agent Performance (QA, CSAT, sentiment summary) |

### Customers (`/api/v1/customers`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| GET | `/list?search=` | รายชื่อลูกค้า (search ชื่อ/นามสกุล/เบอร์/email) |
| GET | `/detail/{customer_id}` | ข้อมูลครบ: info + address + warranties + call_history |
| GET | `/warranty/{registration_id}` | ข้อมูลประกันครบ: warranty + product + customer + address + proofs + activities |
| GET | `/proof/{proof_id}` | Serve ไฟล์รูปหลักฐาน (auto-detect media type) |
| GET | `/warranty-list?search=` | รายการประกันทั้งหมด (search ชื่อ/เบอร์/รหัส/แบรนด์/รุ่น) |

### Agents (`/api/v1/agents`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| GET | `/list?search=&sort_by=qa\|csat\|name&order=asc\|desc` | รายการ agents + avg_qa/avg_csat คำนวณสดจาก audio_analyses |
| GET | `/detail/{agent_id}` | Agent info + stats + call_log |

### Authentication (`/api/v1/auth`)

| Method | URL | หน้าที่ |
|--------|-----|---------|
| POST | `/login` | username + password → return user info + log LOGIN |
| POST | `/register` | สมัครสมาชิก (username, password, full_name, email, role) — default role = STAFF |

### Admin Management (`/api/v1/admin`) — ADMIN only

| Method | URL | หน้าที่ |
|--------|-----|---------|
| GET | `/users?search=&role=&limit=` | รายชื่อ admin users (ลบ password_hash ก่อนส่ง) |
| PATCH | `/users/{id}/role` | เปลี่ยน role (ADMIN/STAFF/VIEWER) + log UPDATE_ROLE |
| PATCH | `/users/{id}/active` | เปิด/ปิดบัญชี + log ACTIVATE_USER / DEACTIVATE_USER |
| GET | `/logs?search=&action=&actor_username=&date_from=&date_to=&limit=&offset=` | Activity logs + filter |
| GET | `/logs/stats` | สถิติ log 30 วัน (top_actions, top_actors, total, last_7_days) |
| POST | `/logs` | บันทึก log จาก frontend (เช่น LOGOUT ผ่าน sendBeacon) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ | Groq API Key หลัก (Llama analysis + Whisper fallback) |
| `GROQ_API_KEY_2` ... `_20` | Optional | Key เพิ่มเติม (สลับ round-robin) |
| `GROQ_API_KEYS` | Optional | หลาย key คั่นด้วย comma |
| `TYPHOON_API_KEY` | แนะนำ | Typhoon ASR (ภาษาไทยแม่นกว่า) — ถ้าไม่มี → fallback ไป Groq Whisper |
| `HF_TOKEN` | แนะนำ | HuggingFace Token สำหรับ pyannote speaker diarization |
| `NEXT_PUBLIC_API_URL` | Optional | URL Backend (default: `http://localhost:8000`) |

ระบบจะอ่านไฟล์ `.env` ที่วางคู่กับ `main.py` อัตโนมัติ (`_load_local_env()`)

### Prerequisites — pyannote Speaker Diarization

```bash
# 1. ติดตั้ง PyTorch (Windows + CUDA)
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# 2. ติดตั้ง pyannote
pip install pyannote.audio

# 3. Accept license ที่ HuggingFace (ต้องทำทั้ง 2 ลิงก์)
#    https://huggingface.co/pyannote/speaker-diarization-3.1
#    https://huggingface.co/pyannote/segmentation-3.0

# 4. ตรวจว่า GPU พร้อม
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}, GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"CPU only\"}')"
```

ถ้าไม่มี GPU จะรันบน CPU ได้ (ช้ากว่า) — model โหลดครั้งแรก ~30 วินาที (lazy load)

---

## AI Models

| Model | Provider | Task | หมายเหตุ |
|-------|----------|------|----------|
| `typhoon-asr-realtime` | Typhoon API (Cloud) | Speech-to-Text | ★ ภาษาไทยแม่น สร้างมาเพื่อไทยโดยเฉพาะ |
| `pyannote/speaker-diarization-3.1` | Local (GPU/CPU) | Speaker Diarization | แยก Agent/Customer จากเสียง |
| `whisper-large-v3` | Groq (Cloud) | Speech-to-Text | Fallback ถ้าไม่มี Typhoon API Key |
| `llama-3.3-70b-versatile` | Groq (Cloud) | NLP Analysis | แก้ transcript (chunked) + mask PII (chunked) + วิเคราะห์ + Deep Insight |

### Pipeline Decision

```
มี TYPHOON_API_KEY (check_typhoon_available()):
  → run_typhoon_pipeline()
  ผลลัพธ์ transcript: "Agent: สวัสดีครับ\nCustomer: สอบถามค่ะ"

ไม่มี TYPHOON_API_KEY:
  → run_groq_analysis_pipeline()
  ผลลัพธ์ transcript: "สวัสดีครับ สอบถามค่ะ" (ไม่แยกผู้พูด)
```

---

## Config ที่ปรับได้ (`services/groq_ai_service.py`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `WHISPER_MODEL` | `whisper-large-v3` | Groq Whisper model |
| `LLAMA_MODEL` | `llama-3.3-70b-versatile` | Groq Llama model |
| `WHISPER_MAX_FILE_SIZE_MB` | 24 | chunk ถ้าเกินขนาดนี้ (Groq limit = 25MB) |
| `CHUNK_DURATION_SECONDS` | 300 | ตัดทุกกี่วินาที (5 นาที) |
| `DELAY_BETWEEN_STEPS` | 1 | พักระหว่าง step (วินาที) |
| `_WHISPER_HALLUCINATIONS` | ~80 คำ | คำต่างประเทศที่ Whisper มักหลุดมา |
| `_ENGLISH_WHITELIST` | ~80 คำ | คำอังกฤษที่อนุญาตให้ผ่าน language filter |
| `ALLOWED_BRANDS` | 19 brands | brand whitelist สำหรับ normalize |
| `BRAND_ALIASES` | ~20 entries | mapping คำที่ Whisper ถอดผิด → canonical brand |

ใน `routers/ai_task.py`:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Delay ระหว่างไฟล์ในคิว | 15 วินาที | กัน Groq rate limit |

---

## Database (SQLite)

DB file: `database/fontai.db` (สร้างอัตโนมัติตอน startup จาก `schema.sql` + migration ใน `db.py`)
ตอน startup `init_db()` จะ:
1. Run `schema.sql`
2. Migration: เพิ่มคอลัมน์ `audio_analyses.deep_insight` ถ้ายังไม่มี
3. Migration: สร้างตาราง `admin_activity_logs` + indexes
4. Seed default users (somchai/somsri) ถ้ายังไม่มี
5. Seed warranty data จาก reference DB (idempotent — `INSERT OR IGNORE`)

### Warranty System (10 tables)

| ตาราง | คำอธิบาย |
|-------|----------|
| `customers` | ข้อมูลลูกค้า (ชื่อ, เบอร์, email, gender, dob) |
| `addresses` | ที่อยู่ลูกค้า |
| `brands` | 12 แบรนด์ seed (Lotus, Omazz, …) |
| `categories` | 6 หมวด seed (Mattress, Pillow, Bedding, Bed Frame, Topper, Protector) |
| `channels` | 9 channels seed (Shopee, Lazada, Mattress City, SB Store, Official Website, Official Store, Online, Department Store, Dealer) |
| `products` | สินค้า (brand + category + SKU + serial_no + label_no) |
| `warranty_registrations` | การลงทะเบียนรับประกัน (17 fields) |
| `proof_of_purchase` | หลักฐานการซื้อ (รูปภาพ/PDF) |
| `activities` | กิจกรรม/comments |
| `admin_users` | ผู้ดูแลระบบ + role + is_active |

### Audio AI System (3 tables)

| ตาราง | คำอธิบาย |
|-------|----------|
| `agents` | Agent info (agent_id, name, phone) — seed 3 คน (AGENT-102/104/202) |
| `audio_files` | path, customer_phone, agent_id, call_direction, status, file_hash, created_by, updated_by |
| `audio_analyses` | ผลวิเคราะห์ AI ครบ (transcript, corrected_transcript, sentiment, brand_names JSON, qa_score, csat_score, summary_points JSON, keywords JSON, action_items JSON, **deep_insight JSON**, segments JSON, …) |

### Audit System (1 table)

| ตาราง | คำอธิบาย |
|-------|----------|
| `admin_activity_logs` | actor_user_id, actor_username, actor_role, action, target_type/id/label, detail, ip_address, created_at |

### การเก็บข้อมูล

| ข้อมูล | เก็บที่ | เหตุผล |
|--------|--------|--------|
| Metadata + Analysis | SQLite `fontai.db` | Query เร็ว, ไม่หายเมื่อ restart |
| ไฟล์เสียง .wav | Local `storage/uploads/` | ไฟล์ใหญ่ 10-60MB ไม่เหมาะเก็บ DB |
| ไฟล์ที่แปลงแล้ว | `storage/converted/` | output ของ ffmpeg |
| Export files | `storage/exports/` | ผลลัพธ์ xlsx/csv |
| JSON fields (brand_names, segments, deep_insight, ฯลฯ) | SQLite TEXT column | `json.dumps()` / `json.loads()` |
| Proof of purchase รูป | Path ใน DB ชี้ไป disk | serve ผ่าน `/customers/proof/{id}` |

---

## รูปแบบชื่อไฟล์ (Filename Pattern)

```
Outbound: {yyyyMMddHHmmss}-{ids}-{agent}-{customer}-Outbound.{ext}
Inbound:  {yyyyMMddHHmmss}-{ids}-{customer}-{agent}-Inbound.{ext}
```

`ids` คือชุดตัวเลข + จุด (เช่น `1762252614.105999`) จะถูกข้ามไป
รองรับนามสกุล: `.wav .mp3 .m4a .aac .ogg .flac .wma .opus` + video (`.mp4 .mkv .avi .mov .webm .3gp` → แปลงเป็น .wav ด้วย ffmpeg)

---

## แบรนด์ที่รองรับ (12 แบรนด์ใน DB)

Lotus, Omazz, Midas, Dunlopillo, Bedgear, LaLaBed, Zinus, Eastman House, Malouf, Loto Mobili, Woodfield, Restonic

Brand normalization (`ALLOWED_BRANDS` ใน `groq_ai_service.py`) ยังรองรับเพิ่ม:
Slumberland, Synda, Theraflex, Serta, Sealy, Simmons (สำรองเผื่อพบใน transcript)

รองรับหลายแบรนด์ต่อ 1 ไฟล์ (เก็บเป็น `brand_names` JSON array)

## หมวดสินค้า (6 หมวด)

| ภาษาไทย | เก็บเป็น (English) |
|----------|-------------------|
| ที่นอน, ฟูก | Mattress |
| หมอน | Pillow |
| เครื่องนอน, ผ้าปู, ผ้านวม, ชุดเครื่องนอน | Bedding |
| โครงเตียง, เตียง, หัวเตียง | Bed Frame |
| ท็อปเปอร์, แผ่นรองนอน | Topper |
| แผ่นกันเปื้อน, ผ้ารองกันเปื้อน, กันไรฝุ่น | Protector |

AI จะแปลงชื่อภาษาไทยเป็นภาษาอังกฤษก่อนบันทึกเสมอ

## ช่องทางขาย

ใน Llama prompt: Official Store, Online, Department Store, Dealer
ใน DB seed มี 9 channels (รวม Shopee, Lazada, Mattress City, SB Store, Official Website)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Lucide React, Montserrat + Sarabun fonts |
| Backend | FastAPI, Python 3.12+, Uvicorn |
| AI (STT) | Typhoon ASR (ภาษาไทย) / Groq Whisper large-v3 (fallback) |
| AI (Diarization) | pyannote/speaker-diarization-3.1 (Local GPU/CPU) |
| AI (Analysis) | Groq Llama 3.3 70B versatile |
| Database | SQLite (WAL mode, foreign_keys ON) |
| Audio | Python `wave` (chunking), ffmpeg (conversion → 16kHz mono PCM) |
| Auth | SHA256 hash (salt = `fontai_<password>_salt`), sessionStorage |
| Theme | Dark/Light + localStorage |

---

## โครงสร้างไฟล์

```
project-backend/
├── main.py                          # FastAPI entry (7 routers + .env loader)
├── database/
│   ├── db.py                        # SQLite module + migration + seed
│   ├── schema.sql                   # 13 tables + seed (brands/categories/channels/agents)
│   └── fontai.db                    # SQLite file (สร้างอัตโนมัติ)
├── routers/
│   ├── audio.py                     # Upload (SHA256 dedup, filename parser) + List + Detail + Play + Delete + Batch delete
│   ├── ai_task.py                   # Queue worker (15s delay) + Analyze + Retest + Status + Tasks
│   ├── dashboard.py                 # Stats + Insights (period filter) + Filters + Summary + Overview + Trends + Export
│   ├── customers.py                 # Customer list + Detail + Warranty detail + Proof serve + Warranty list
│   ├── agents.py                    # Agent list (avg_qa/csat) + Detail (call log)
│   ├── auth.py                      # Login + Register + log LOGIN
│   ├── admin.py                     # User management + Activity logs
│   └── audit_helper.py              # Helpers: get IP, log from request headers
├── services/
│   ├── groq_ai_service.py           # Groq Pipeline + Typhoon Pipeline + brand normalize + language filter
│   ├── typhoon_service.py           # Typhoon ASR (OpenAI-compatible client)
│   ├── diarization_service.py       # pyannote (lazy load, overlap-based matching)
│   ├── file_converter.py            # save upload + ffmpeg → 16kHz mono wav
│   └── ai_mock_service.py           # Mock pipeline (legacy, ไม่ใช้ใน prod)
└── storage/
    ├── uploads/                     # ไฟล์ต้นฉบับ (named โดย UUID)
    ├── converted/                   # ไฟล์ที่ ffmpeg แปลงแล้ว
    └── exports/                     # xlsx/csv exports

project-frontend/
├── app/
│   ├── layout.tsx                   # Root (ThemeProvider + AuthProvider + ThemeToggle)
│   ├── page.tsx                     # redirect → /login
│   ├── globals.css                  # Tailwind + dark mode overrides + sizing tweaks
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── dashboard/page.tsx           # KPI + Sentiment + Topic donut + Keywords + Brand + Agent Performance (ADMIN)
│   ├── upload/page.tsx              # Drag&Drop + queue
│   ├── files/
│   │   ├── page.tsx                 # List + Search + Filters + Select Mode + Upload toast
│   │   └── [id]/page.tsx            # Summary Insight + Deep Insight + Transcription + Audio Player + Warranty card
│   ├── customers/
│   │   ├── page.tsx                 # List + warranty badge
│   │   ├── [id]/page.tsx            # Detail + รองรับ phone-xxx route
│   │   └── warranty/[id]/page.tsx
│   ├── warranty/page.tsx            # Warranty Storage list
│   ├── agents/
│   │   ├── layout.tsx               # ★ ADMIN guard
│   │   ├── page.tsx                 # List + sort + search
│   │   └── [id]/page.tsx            # Agent Detail + Call Log
│   └── admin/
│       ├── layout.tsx               # ★ ADMIN guard
│       └── page.tsx                 # Users + Activity Logs (2 tabs)
├── components/
│   ├── Sidebar.tsx                  # Navigation (role-based: hide Agents/Admin สำหรับ non-ADMIN)
│   ├── AuthProvider.tsx             # Session + global fetch patch (X-Actor-* headers) + sendBeacon logout
│   └── ThemeProvider.tsx            # Dark/Light + localStorage
├── lib/
│   └── api.ts                       # apiFetch (auto-attach X-Actor-*) + logAction
├── package.json                     # Next.js 16, React 19, Tailwind 4, Lucide React
└── tsconfig.json
```

---

## สำหรับนักพัฒนาที่รับต่อ

### สิ่งที่ต้องรู้

1. **SQLite DB** (`database/fontai.db`) — สร้างอัตโนมัติตอน startup, ข้อมูลถาวร, **ปิด DB Browser ก่อนรัน backend** (SQLite จะ lock)
2. **WAL mode + foreign_keys ON** — ทำให้อ่าน/เขียนพร้อมกันได้
3. **Migration อัตโนมัติ** — เพิ่มคอลัมน์ `deep_insight` และสร้างตาราง `admin_activity_logs` ตอน `init_db()`
4. **ไฟล์เสียงเก็บ local** — `storage/uploads/` (DB เก็บแค่ path)
5. **AI Pipeline เลือกอัตโนมัติ** — มี `TYPHOON_API_KEY` → Typhoon+pyannote+Llama / ไม่มี → Groq Whisper+Llama
6. **Speaker Diarization lazy load** — pyannote โหลด model ครั้งแรกช้า ~30s, ต้อง accept license ที่ HuggingFace
7. **Groq Rate Limit → fail ทันที** — ไม่ retry, status = `failed`, user กด re-Analyze เมื่อพร้อม
8. **Multi API Key Rotation** — Round-robin ทุก request (ทั้ง Whisper, fix, mask, analyze, deep insight)
9. **Queue ทีละ 1 ไฟล์ + พัก 15s** ระหว่างไฟล์
10. **File status 3 สถานะ** — `processing`, `analyzed`, `failed`
11. **File hash dedup (SHA256)** — อัปโหลดไฟล์เดิมซ้ำ → 409 Conflict
12. **Filename parser** — ดึง date/customer/agent/direction จากชื่อไฟล์อัตโนมัติ (regex `_PATTERN_LONG`)
13. **brand_names เป็น JSON array** — รองรับหลายแบรนด์ต่อไฟล์ผ่าน `_normalize_brand()` (whitelist + alias + fuzzy)
14. **PII Masking + Fix Transcript chunked** — ป้องกัน output ถูก truncate, มี safety fallback (output < 70% input → ใช้ original)
15. **Deep Customer Insight** — second-pass AI ไม่แก้ผลเดิม, เก็บใน `audio_analyses.deep_insight` (JSON)
16. **re-Analyze** — กดแล้วเข้าคิว ระบบคืน analysis ล่าสุดเสมอ (`ORDER BY created_at DESC LIMIT 1`)
17. **Upload limit** — 60MB
18. **Select Mode + Batch Delete** — ยืนยันพิมพ์ `Delete` (case-sensitive)
19. **Export** — `/dashboard/export-calls` และ `/dashboard/export-agents` (xlsx ใส่ formula sheet/column width auto)
20. **Customer ↔ Audio match** — ด้วยเบอร์โทร (clean dashes), แสดงปุ่มลิงก์ใน file detail
21. **Customer Detail รองรับ `phone-xxx` route** — กรณีเบอร์โทรไม่อยู่ใน DB ลูกค้า (สร้าง stub จากเบอร์)
22. **Proof of Purchase** — เก็บ path ใน DB, serve ผ่าน API (auto-detect media type)
23. **Authentication** — SHA256 hash, sessionStorage (ปิด browser = หลุด)
24. **X-Actor-\* headers** — `AuthProvider` patch `window.fetch` ฉีดให้ทุก request ที่ไป backend
25. **LOGOUT ใช้ sendBeacon** — บันทึก log สำเร็จแม้กำลังเปลี่ยน page
26. **Audit log** — ทุก action สำคัญใน `admin_activity_logs`, ดูที่ `/admin` (ADMIN only)
27. **Role-based UI** — Sidebar ซ่อนเมนู Agents + Admin Management สำหรับ non-ADMIN, layout guard redirect ถ้าเข้าตรงๆ
28. **Dashboard `/insights`** — endpoint ใหม่ที่ filter ตาม Day/Month/Year (เทียบกับ `/stats` ที่เป็น all-time)
29. **Auto-poll** — files list ทุก 5s (เฉพาะตอนมี PROCESSING), file detail ทุก 3s จนกว่าจะ analyzed/failed
30. **Default password** — somchai/somchai123 (ADMIN), somsri/somsri123 (STAFF) ระบบ seed อัตโนมัติถ้ายังไม่มี

### สิ่งที่ยังไม่ได้ทำ
- ย้ายจาก SQLite → Supabase (PostgreSQL + pgvector) สำหรับ production
- VIEWER role ในปัจจุบันแยกจาก STAFF เฉพาะใน schema CHECK constraint — UI ยังไม่ได้ทำ permission แยกระหว่าง STAFF กับ VIEWER
- Reset password / forgot password flow
- File path ใน `proof_of_purchase` เป็น Windows absolute path (`D:\\Omazz\\…`) — ต้องเปลี่ยนเมื่อ deploy บน server อื่น
