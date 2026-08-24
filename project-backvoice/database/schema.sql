-- =============================================================================
-- FontAI Database Schema (SQLite)
-- รวม Warranty Registration System + Audio AI Analysis
-- =============================================================================

-- ===================== WARRANTY SYSTEM (จาก db_schema.xlsx) =====================

CREATE TABLE IF NOT EXISTS customers (
    customer_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    nick_name       TEXT,
    email           TEXT UNIQUE,
    phone           TEXT,
    gender          TEXT CHECK(gender IN ('MALE','FEMALE','OTHER')),
    date_of_birth   TEXT,
    created_at      TEXT DEFAULT (datetime('now','localtime')),
    updated_at      TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS addresses (
    address_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER NOT NULL REFERENCES customers(customer_id),
    address_line    TEXT,
    subdistrict     TEXT,
    district        TEXT,
    city_province   TEXT,
    country         TEXT DEFAULT 'Thailand',
    postcode        TEXT
);

CREATE TABLE IF NOT EXISTS brands (
    brand_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_name      TEXT NOT NULL UNIQUE,
    channel_name    TEXT,
    is_active       INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
    category_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name   TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
    product_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id        INTEGER NOT NULL REFERENCES brands(brand_id),
    category_id     INTEGER NOT NULL REFERENCES categories(category_id),
    model           TEXT,
    size            TEXT,
    sku             TEXT UNIQUE,
    serial_no       TEXT UNIQUE,
    label_no        TEXT UNIQUE,
    created_at      TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS channels (
    channel_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_name    TEXT NOT NULL UNIQUE,
    channel_type    TEXT NOT NULL CHECK(channel_type IN ('ONLINE','OFFLINE','DEALER'))
);

CREATE TABLE IF NOT EXISTS warranty_registrations (
    registration_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    registration_no         TEXT NOT NULL UNIQUE,
    ref_id                  TEXT,
    certificate_no          TEXT UNIQUE,
    customer_id             INTEGER NOT NULL REFERENCES customers(customer_id),
    product_id              INTEGER NOT NULL REFERENCES products(product_id),
    channel_id              INTEGER NOT NULL REFERENCES channels(channel_id),
    warranty_period_months  INTEGER NOT NULL,
    date_of_purchase        TEXT NOT NULL,
    date_of_delivery        TEXT,
    order_number            TEXT,
    expiry_date             TEXT,
    status                  TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','CANCELLED')),
    remark                  TEXT,
    created_at              TEXT DEFAULT (datetime('now','localtime')),
    updated_at              TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS proof_of_purchase (
    proof_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    registration_id INTEGER NOT NULL REFERENCES warranty_registrations(registration_id),
    file_url        TEXT NOT NULL,
    file_type       TEXT,
    uploaded_at     TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS activities (
    activity_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    registration_id INTEGER NOT NULL REFERENCES warranty_registrations(registration_id),
    admin_user_id   INTEGER REFERENCES admin_users(admin_user_id),
    comment         TEXT NOT NULL,
    is_internal_note INTEGER DEFAULT 0,
    attached_file_url TEXT,
    created_at      TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS admin_users (
    admin_user_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT DEFAULT '',
    full_name       TEXT NOT NULL,
    email           TEXT UNIQUE,
    role            TEXT NOT NULL CHECK(role IN ('ADMIN','STAFF','VIEWER')),
    is_active       INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now','localtime')),
    updated_at      TEXT
);

-- ===================== AUDIO AI ANALYSIS (ใหม่) =====================

CREATE TABLE IF NOT EXISTS agents (
    agent_id        TEXT PRIMARY KEY,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    phone           TEXT,
    is_active       INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now','localtime')),
    updated_at      TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(first_name, last_name);

CREATE TABLE IF NOT EXISTS audio_files (
    file_id             TEXT PRIMARY KEY,
    original_filename   TEXT NOT NULL,
    uploaded_path       TEXT,
    converted_path      TEXT,
    customer_phone      TEXT DEFAULT 'N/A',
    agent_id            TEXT DEFAULT 'N/A',
    agent_name          TEXT DEFAULT '',
    call_direction      TEXT DEFAULT 'Unknown',
    call_date           TEXT,
    duration_seconds    REAL DEFAULT 0,
    file_size_mb        REAL DEFAULT 0,
    status              TEXT DEFAULT 'processing' CHECK(status IN ('processing','analyzed','failed')),
    file_hash           TEXT,
    created_by          INTEGER REFERENCES admin_users(admin_user_id),
    updated_by          INTEGER REFERENCES admin_users(admin_user_id),
    created_at          TEXT DEFAULT (datetime('now','localtime')),
    updated_at          TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS audio_analyses (
    analysis_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id             TEXT NOT NULL REFERENCES audio_files(file_id) ON DELETE CASCADE,
    task_id             TEXT,
    is_retest           INTEGER DEFAULT 0,

    -- Whisper results
    transcript          TEXT,
    corrected_transcript TEXT,
    audio_duration_seconds REAL DEFAULT 0,

    -- Llama results
    sentiment           TEXT DEFAULT 'neutral',
    sentiment_score     REAL DEFAULT 0.5,
    intent              TEXT DEFAULT '',
    brand_names         TEXT DEFAULT '[]',       -- JSON array: ["Lotus","Omazz"]
    product_category    TEXT DEFAULT 'Unknown',
    sale_channel        TEXT DEFAULT 'Unknown',
    qa_score            REAL DEFAULT 0,
    csat_score          INTEGER DEFAULT 0,
    summary_text        TEXT DEFAULT '',
    summary_points      TEXT DEFAULT '[]',       -- JSON array
    key_insights        TEXT DEFAULT '',
    keywords            TEXT DEFAULT '[]',       -- JSON array
    action_items        TEXT DEFAULT '[]',       -- JSON array

    -- Deep customer insight (second-pass AI) — JSON blob
    -- รูปแบบ: {customer_need, pain_point, root_cause, expectation,
    --          risk_level, recommended_action, recommended_steps, confidence}
    deep_insight        TEXT DEFAULT '{}',

    -- Transcription segments (Whisper timestamps)
    segments            TEXT DEFAULT '[]',       -- JSON array of {id, start, end, text}

    -- Metadata
    model_version       TEXT DEFAULT '',
    pipeline_duration   REAL DEFAULT 0,
    created_by          INTEGER REFERENCES admin_users(admin_user_id),
    created_at          TEXT DEFAULT (datetime('now','localtime'))
);

-- Index สำหรับ query ที่ใช้บ่อย
CREATE INDEX IF NOT EXISTS idx_audio_files_status ON audio_files(status);
CREATE INDEX IF NOT EXISTS idx_audio_files_call_date ON audio_files(call_date);
CREATE INDEX IF NOT EXISTS idx_audio_analyses_file_id ON audio_analyses(file_id);
CREATE INDEX IF NOT EXISTS idx_audio_analyses_sentiment ON audio_analyses(sentiment);
CREATE INDEX IF NOT EXISTS idx_audio_analyses_created ON audio_analyses(created_at);

-- ===================== SEED DATA =====================

-- Brands (12 แบรนด์)
INSERT OR IGNORE INTO brands (brand_name) VALUES
    ('Lotus'), ('Omazz'), ('Midas'), ('Dunlopillo'), ('Bedgear'), ('LaLaBed'),
    ('Zinus'), ('Eastman House'), ('Malouf'), ('Loto Mobili'), ('Woodfield'), ('Restonic');

-- Categories (6 หมวด)
INSERT OR IGNORE INTO categories (category_name) VALUES
    ('Mattress'), ('Pillow'), ('Bedding'), ('Bed Frame'), ('Topper'), ('Protector');

-- Channels (4 ช่องทาง)
INSERT OR IGNORE INTO channels (channel_name, channel_type) VALUES
    ('Official Store', 'OFFLINE'),
    ('Online', 'ONLINE'),
    ('Department Store', 'OFFLINE'),
    ('Dealer', 'DEALER');

-- Agents (3 คนเริ่มต้น — สอดคล้องกับ agent_id ที่ parse จากชื่อไฟล์: AGENT-102, AGENT-104, AGENT-202)
INSERT OR IGNORE INTO agents (agent_id, first_name, last_name, phone) VALUES
    ('AGENT-202', 'สมสมัย', 'ธนบุรี', '0911111111'),
    ('AGENT-104', 'สมพร',   'ปากดี',  '0922222222'),
    ('AGENT-102', 'สมบัติ', 'ใจหาญ',  '0933333333');
