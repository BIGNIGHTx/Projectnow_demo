import json
import re

BRAND_DETAIL_STOPWORDS = {
    "lotus", "omazz", "midas", "dunlopillo", "bedgear", "lalabed", "zinus",
    "eastman house", "malouf", "loto mobili", "woodfield", "restonic",
    "โลตัส", "โอมาซ", "ดันลอป", "ไมดาส", "เบดเกียร์", "ลาลาเบด",
}

PRODUCT_DETAIL_STOPWORDS = {
    "mattress", "pillow", "bedding", "bed frame", "topper", "protector",
    "ที่นอน", "ฟูก", "หมอน", "เครื่องนอน", "ผ้าปู", "ผ้านวม", "ชุดเครื่องนอน",
    "โครงเตียง", "เตียง", "หัวเตียง", "ท็อปเปอร์", "แผ่นรองนอน", "แผ่นกันเปื้อน",
}

GENERIC_DETAIL_STOPWORDS = {
    "unknown", "n/a", "-", "สินค้า", "ปัญหา", "สอบถาม", "ตรวจสอบ", "แจ้งปัญหา",
    "แจ้งสินค้าชำรุด/เสียหาย", "สินค้าชำรุด", "เสียหาย", "ชำรุด",
    "สอบถามสถานะจัดส่ง", "จัดส่ง", "การจัดส่ง", "เปลี่ยนสินค้า", "คืนสินค้า",
    "ประกัน", "การรับประกัน", "ตารางเวลา",
    "official store", "online", "department store", "dealer",
}

ISSUE_TERMS = [
    ("สปริง", "สปริง"), ("สปิง", "สปริง"), ("ที่นอน", "ที่นอน"), ("ฟูก", "ฟูก"),
    ("หมอน", "หมอน"), ("โครงเตียง", "โครงเตียง"), ("เตียง", "เตียง"),
    ("หัก", "หัก"), ("ยุบ", "ยุบ"), ("ยวบ", "ยุบ"), ("บุบ", "บุบ"),
    ("แตก", "แตก"), ("ขาด", "ขาด"), ("ฉีก", "ฉีก"), ("เสียงดัง", "เสียงดัง"),
    ("กลิ่นสารเคมี", "กลิ่นสารเคมี"), ("สารเคมี", "กลิ่นสารเคมี"),
    ("กลิ่นฉุน", "กลิ่นฉุน"), ("กลิ่น", "มีกลิ่น"), ("เหม็น", "มีกลิ่น"),
    ("ผื่นคัน", "ผื่นคัน"), ("แพ้", "อาการแพ้"), ("เปื้อน", "เปื้อน"), ("สกปรก", "สกปรก"),
    ("อาการคัน", "อาการคัน"), ("คัน", "อาการคัน"),
    ("นอนไม่สบาย", "นอนไม่สบาย"), ("ไม่สบาย", "นอนไม่สบาย"),
    ("ใช้งานไม่ได้", "ใช้งานไม่ได้"), ("เสียหาย", "เสียหาย"), ("ชำรุด", "ชำรุด"),
    ("ไม่ตรงตามสเปค", "คุณภาพไม่ตรงสเปค"), ("ไม่ตรงสเปค", "คุณภาพไม่ตรงสเปค"),
    ("ข้อบกพร่องจากโรงงาน", "ข้อบกพร่องจากโรงงาน"), ("ข้อบกพร่อง", "ข้อบกพร่องจากโรงงาน"),
    ("ส่งช้า", "ส่งล่าช้า"), ("ล่าช้า", "ส่งล่าช้า"), ("ยังไม่ได้รับ", "ยังไม่ได้รับสินค้า"),
    ("วันรับสินค้า", "วันรับสินค้า"), ("ตารางเวลา", "ตารางเวลาจัดส่ง"),
]


def normalize_detail_label(value: str) -> str:
    label = re.sub(r"[\n\r\t]+", " ", str(value or "")).strip(" -:•,./()[]{}\"'")
    label = re.sub(r"\s+", " ", label)
    return label.lower()


def _parse_json_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _clean_detail_label(value: str) -> str:
    label = re.sub(r"[\n\r\t]+", " ", str(value or "")).strip(" -:•,./()[]{}\"'")
    label = re.sub(r"\s+", " ", label)
    return label[:60].strip()


def _is_detail_noise(label: str, blocked_terms: set[str]) -> bool:
    normalized = label.strip().lower()
    if len(normalized) < 2:
        return True
    if len(label) > 42:
        return True
    if normalized in blocked_terms:
        return True
    if normalized.isdigit():
        return True
    if re.fullmatch(r"[\d\s:/.,-]+", normalized):
        return True
    return False


def _issue_labels_from_text(text: str) -> list[str]:
    text = text or ""
    found: list[str] = []
    seen: set[str] = set()
    for needle, label in ISSUE_TERMS:
        if needle in text and label not in seen:
            found.append(label)
            seen.add(label)
    details: list[str] = []

    product_terms = {"สปริง", "ที่นอน", "ฟูก", "หมอน", "โครงเตียง", "เตียง"}
    damage_terms = {
        "หัก", "ยุบ", "บุบ", "แตก", "ขาด", "ฉีก", "เสียงดัง", "กลิ่นสารเคมี",
        "กลิ่นฉุน", "มีกลิ่น", "เปื้อน", "สกปรก", "ใช้งานไม่ได้", "เสียหาย", "ชำรุด",
    }
    health_terms = {"อาการแพ้", "ผื่นคัน", "อาการคัน", "นอนไม่สบาย"}
    quality_terms = {"คุณภาพไม่ตรงสเปค", "ข้อบกพร่องจากโรงงาน"}
    product_labels = [p for p in ["สปริง", "ที่นอน", "ฟูก", "หมอน", "โครงเตียง", "เตียง"] if p in found]
    damage_labels = [i for i in found if i in damage_terms]
    health_labels = [i for i in found if i in health_terms]
    quality_labels = [i for i in found if i in quality_terms]
    standalone_labels = [
        i for i in found
        if i not in product_terms and i not in damage_terms and i not in health_terms and i not in quality_terms
    ]

    if "ที่นอน" in product_labels and "ฟูก" in product_labels:
        product_labels.remove("ฟูก")
    if "โครงเตียง" in product_labels and "เตียง" in product_labels:
        product_labels.remove("เตียง")
    if "เสียหาย" in damage_labels and "ชำรุด" in damage_labels:
        damage_labels.remove("ชำรุด")
    if any(issue not in {"เสียหาย", "ชำรุด"} for issue in damage_labels):
        damage_labels = [issue for issue in damage_labels if issue not in {"เสียหาย", "ชำรุด"}]
    if "กลิ่นสารเคมี" in damage_labels and "กลิ่นฉุน" in damage_labels:
        damage_labels.remove("กลิ่นฉุน")
    if "กลิ่นสารเคมี" in damage_labels and "มีกลิ่น" in damage_labels:
        damage_labels.remove("มีกลิ่น")
    if "กลิ่นฉุน" in damage_labels and "มีกลิ่น" in damage_labels:
        damage_labels.remove("มีกลิ่น")
    if "ผื่นคัน" in health_labels and "อาการคัน" in health_labels:
        health_labels.remove("อาการคัน")

    for product in product_labels:
        for issue in damage_labels:
            details.append(f"{product}{issue}")

    if not details:
        details.extend(damage_labels)
    details.extend(health_labels)
    details.extend(quality_labels)
    details.extend(standalone_labels)
    if "สปริง" in found and not any("สปริง" in item for item in details):
        details.append("สปริงมีปัญหา")

    return details


def _is_redundant_detail(key: str, seen: set[str]) -> bool:
    odor_markers = ("กลิ่นสารเคมี", "กลิ่นฉุน", "มีกลิ่น")
    if any(marker in key for marker in odor_markers):
        return any(any(marker in existing for marker in odor_markers) for existing in seen)
    if key in {"เสียหาย", "ชำรุด"}:
        return any(existing.endswith("เสียหาย") or existing.endswith("ชำรุด") for existing in seen)
    return False


def extract_problem_details(row, parse_list) -> list[str]:
    topic = row["intent"] or ""
    brands = parse_list(row["brand_names"])
    product = row["product_category"] or ""
    channel = row["sale_channel"] or ""
    keywords = parse_list(row["keywords"])
    deep = _parse_json_dict(row["deep_insight"])

    blocked_terms = set(BRAND_DETAIL_STOPWORDS | PRODUCT_DETAIL_STOPWORDS | GENERIC_DETAIL_STOPWORDS)
    blocked_terms.update(str(item).strip().lower() for item in brands if item)
    blocked_terms.update(str(item).strip().lower() for item in [product, channel, topic] if item)

    text_parts = [
        topic, product, channel, row["summary_text"] or "", row["key_insights"] or "",
        deep.get("pain_point", ""), deep.get("root_cause", ""), deep.get("customer_need", ""),
        " ".join(str(kw) for kw in keywords),
    ]
    issue_text = " ".join(text_parts)

    raw_candidates: list[str] = []
    raw_candidates.extend(_issue_labels_from_text(issue_text))
    for key in ("pain_point", "root_cause", "customer_need"):
        value = deep.get(key)
        if value:
            raw_candidates.append(str(value))
    raw_candidates.extend(str(kw) for kw in keywords)

    details: list[str] = []
    seen: set[str] = set()
    for raw in raw_candidates:
        label = _clean_detail_label(raw)
        key = normalize_detail_label(label)
        if _is_detail_noise(label, blocked_terms) or key in seen:
            continue
        if _is_redundant_detail(key, seen):
            continue
        if any(key in existing_key for existing_key in seen):
            continue
        seen.add(key)
        details.append(label)
        if len(details) >= 5:
            break
    return details


def build_file_problem_label(row, parse_list) -> str:
    details = extract_problem_details(row, parse_list)
    if details:
        return " / ".join(details)

    deep = _parse_json_dict(row["deep_insight"])
    for key in ("pain_point", "root_cause", "customer_need"):
        label = _clean_detail_label(deep.get(key, ""))
        if label and normalize_detail_label(label) != normalize_detail_label(row["intent"] or ""):
            return label

    for key in ("summary_text", "key_insights"):
        label = _clean_detail_label(row[key] or "")
        if label and normalize_detail_label(label) != normalize_detail_label(row["intent"] or ""):
            return label

    return row["intent"] or "-"
