'use client';

import Sidebar from '@/components/Sidebar';
import { ArrowLeft, User, MapPin, FileImage, MessageSquare } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WARRANTY_ICON_STYLE = { 
  backgroundImage: "url('/waran.jpg')",
  filter: "grayscale(100%) contrast(500%) brightness(120%)",
  mixBlendMode: "multiply" as const
};

interface WarrantyInfo {
  registration_no: string;
  ref_id?: string | null;
  certificate_no?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  model?: string | null;
  size?: string | null;
  sku?: string | null;
  serial_no?: string | null;
  label_no?: string | null;
  warranty_period_months?: number | null;
  date_of_purchase?: string | null;
  date_of_delivery?: string | null;
  channel_name?: string | null;
  order_number?: string | null;
  expiry_date?: string | null;
  remark?: string | null;
  status: string;
  created_at: string;
}

interface WarrantyCustomer {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
}

interface WarrantyAddress {
  address_line?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  city_province?: string | null;
  postcode?: string | null;
}

interface WarrantyProof {
  proof_id: number | string;
  file_type?: string | null;
}

interface WarrantyActivity {
  activity_id: number | string;
  admin_name?: string | null;
  is_internal_note?: boolean;
  created_at?: string | null;
  comment?: string | null;
  attached_file_url?: string | null;
}

interface WarrantyDetailData {
  warranty: WarrantyInfo;
  customer?: WarrantyCustomer | null;
  address?: WarrantyAddress | null;
  proofs?: WarrantyProof[];
  activities?: WarrantyActivity[];
}

export default function WarrantyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const regId = params.id as string;

  // เก็บข้อมูลรายละเอียด warranty ทั้งชุด (อ่านค่า: บรรทัด 133, 144, 145, 146, 147, 148; อัปเดต: บรรทัด 94, 96)
  const [data, setData] = useState<WarrantyDetailData | null>(null);
  // เก็บสถานะโหลดรายละเอียด warranty (อ่านค่า: บรรทัด 122; อัปเดต: บรรทัด 90, 98)
  const [loading, setLoading] = useState(true);

  // Effect: โหลดรายละเอียด warranty ใหม่เมื่อ registration id เปลี่ยน
  useEffect(() => {
    // API: ดึงข้อมูล warranty detail จาก backend ตาม registration id (ถูกเรียกใช้ที่บรรทัด 101)
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/v1/customers/warranty/${regId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [regId]);

  // แปลงวันที่แบบ date-only ให้เป็นข้อความอ่านง่าย (ถูกเรียกใช้ที่บรรทัด 162, 163, 166, 242)
  const formatDate = (d?: string | null) => {
    if (!d || d === 'N/A') return 'N/A';
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return d; }
  };

  // แปลงวันที่พร้อมเวลาให้เป็นข้อความอ่านง่าย (ถูกเรียกใช้ที่บรรทัด 204, 318)
  const formatDateTime = (d?: string | null) => {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ', ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch { return d; }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-[#F8FAFC] text-slate-900" style={{ colorScheme: 'light' }}> {/* Loading layout ของหน้า Warranty Detail */}
        {/* Sidebar เมนูนำทาง */}<Sidebar />
        <main className="flex-1 p-6 flex items-center justify-center"> {/* แสดง spinner ระหว่างโหลด warranty detail */}
          <p className="text-sm font-medium text-slate-400">กำลังโหลดข้อมูล...</p>
        </main>
      </div>
    );
  }

  if (!data?.warranty) {
    return (
      <div className="flex h-screen bg-[#F8FAFC] text-slate-900" style={{ colorScheme: 'light' }}> {/* Empty layout เมื่อไม่พบ warranty */}
        {/* Sidebar เมนูนำทาง */}<Sidebar />
        <main className="flex-1 p-6 flex items-center justify-center"> {/* แสดงข้อความไม่พบข้อมูล */}
          <p className="text-sm font-medium text-slate-400">ไม่พบข้อมูลการรับประกัน</p>
        </main>
      </div>
    );
  }

  const w = data.warranty;
  const c = data.customer;
  const addr = data.address;
  const proofs = data.proofs || [];
  const activities = data.activities || [];

  const warrantyFields = [
    ['Registration No.', w.registration_no],
    ['Ref ID', w.ref_id || 'N/A'],
    ['Certificate No.', w.certificate_no || 'N/A'],
    ['Brand', w.brand_name],
    ['Category', w.category_name],
    ['Model', w.model || 'N/A'],
    ['Size', w.size || 'N/A'],
    ['SKU', w.sku || 'N/A'],
    ['Serial No.', w.serial_no || 'N/A'],
    ['Label No.', w.label_no || 'N/A'],
    ['Warranty Period', w.warranty_period_months ? `${w.warranty_period_months} Months` : 'N/A'],
    ['Date of Purchase', formatDate(w.date_of_purchase)],
    ['Date of Delivery', formatDate(w.date_of_delivery)],
    ['Purchase Channel', w.channel_name || 'N/A'],
    ['Order Number', w.order_number || 'N/A'],
    ['Expiry Date', formatDate(w.expiry_date)],
    ['Remark', w.remark || '-'],
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] text-slate-900" style={{ colorScheme: 'light' }}> {/* Layout หลักหน้า Warranty Detail */}
      {/* Sidebar เมนูนำทาง */}<Sidebar />
      <main className="flex-1 overflow-auto p-6"> {/* พื้นที่ scroll ของรายละเอียด warranty */}
        <div className="mx-auto max-w-full space-y-6"> {/* container รวม header, warranty info, customer, images และ activity */}

          {/* Back */}
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] transition-colors hover:bg-indigo-50 hover:text-indigo-600"
          >
            <ArrowLeft size={16} /> Back
          </button>

          {/* Header */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]"> {/* Header card: สรุปสินค้า serial และสถานะ warranty */}
            <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-indigo-50 blur-2xl" />
            <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 rounded-[1.25rem] bg-white bg-cover bg-center shadow-sm ring-1 ring-amber-100" style={WARRANTY_ICON_STYLE} />
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#818CF8]">Warranty Detail</p>
                  <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">#{w.registration_no}</h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  w.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' :
                  w.status === 'EXPIRED' ? 'bg-red-50 text-red-500 ring-1 ring-red-100' :
                  'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                }`}>
                  {w.status}
                </span>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-100">
                  Created {formatDateTime(w.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Warranty Information: รายละเอียดสินค้า วันซื้อ วันหมดประกัน และระยะเวลาประกัน */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
            <div className="mb-5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-white bg-cover bg-center shadow-sm ring-1 ring-amber-100" style={WARRANTY_ICON_STYLE} />
              <h2 className="text-sm font-bold text-slate-800">Warranty Information</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {warrantyFields.map(([label, value], idx) => (
                <div key={label as string} className={`rounded-xl px-4 py-3 ${idx % 2 === 0 ? 'bg-slate-50' : 'bg-white ring-1 ring-slate-100'}`}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
                  <p className="break-words text-sm font-medium text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Registrant Information */}
          {c && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]"> {/* Customer card: ข้อมูลลูกค้าและที่อยู่ที่ผูกกับ warranty */}
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <User size={16} />
                </div>
                <h2 className="text-sm font-bold text-slate-800">Registrant Information</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  ['First Name', c.first_name],
                  ['Last Name', c.last_name],
                  ['Phone', c.phone],
                  ['Email', c.email],
                  ['Gender', c.gender],
                  ['Date of Birth', formatDate(c.date_of_birth)],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
                    <p className="text-sm font-medium text-slate-800">{value || '-'}</p>
                  </div>
                ))}
              </div>

              {/* Address */}
              {addr && (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <div className="mb-3 flex items-center gap-2">
                    <MapPin size={14} className="text-slate-400" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Address</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm leading-relaxed text-slate-700">
                      {addr.address_line}
                      {addr.subdistrict && `, ${addr.subdistrict}`}
                      {addr.district && `, ${addr.district}`}
                      {addr.city_province && `, ${addr.city_province}`}
                      {addr.postcode && ` ${addr.postcode}`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Proof of Purchase */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]"> {/* Image section: แสดงรูปประกอบ warranty registration */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <FileImage size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-800">Proof / Evidence of Purchase</h2>
            </div>
            {proofs.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {proofs.map((p) => (
                  <a key={p.proof_id} href={`${API_BASE}/api/v1/customers/proof/${p.proof_id}`} target="_blank" rel="noopener noreferrer" className="block group">
                    <div className="h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-colors group-hover:border-indigo-300">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${API_BASE}/api/v1/customers/proof/${p.proof_id}`}
                        alt="proof"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className="mt-1 w-28 truncate text-[10px] text-slate-400">{p.file_type}</p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">ไม่มีหลักฐานการซื้อ</p>
            )}
          </div>

          {/* Activities */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]"> {/* Activity section: timeline เหตุการณ์ของ warranty */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                <MessageSquare size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-800">Activities</h2>
            </div>
            {activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map((act) => (
                  <div key={act.activity_id} className="rounded-xl bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-slate-700">
                        {act.admin_name || 'System'}
                        {act.is_internal_note ? <span className="ml-2 text-[10px] text-amber-500 font-bold">Internal Note</span> : null}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{formatDateTime(act.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-600">{act.comment}</p>
                    {act.attached_file_url && (
                      <p className="text-xs text-blue-500 mt-1 truncate">📎 {act.attached_file_url}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">ยังไม่มีกิจกรรม</p>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
