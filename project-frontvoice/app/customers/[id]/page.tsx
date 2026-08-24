'use client';

import Sidebar from '@/components/Sidebar';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CheckCircle2,
  HelpCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface CustomerInfo {
  customer_id: number;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  email: string;
  phone: string;
  gender: string;
  date_of_birth: string;
}

interface Address {
  address_line: string;
  subdistrict: string;
  district: string;
  city_province: string;
  country: string;
  postcode: string;
}

interface Warranty {
  registration_id: number;
  registration_no: string;
  certificate_no: string | null;
  brand_name: string;
  category_name: string;
  model: string;
  size: string;
  channel_name: string;
  warranty_period_months: number;
  date_of_purchase: string;
  date_of_delivery?: string | null;
  expiry_date: string;
  status: string;
}

interface CallRecord {
  file_id: string;
  original_filename: string;
  call_direction: string;
  call_date: string;
  agent_id: string;
  sentiment: string;
  summary_text: string;
  key_insights: string;
}

interface AudioListRecord {
  file_id: string;
  name: string;
  customer: string;
  agent: string;
  sentiment: string;
  date: string;
  call_direction: string;
}

interface WarrantyListRecord {
  registration_id: number;
  registration_no: string;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
  warranty_period_months: number;
  date_of_purchase: string;
  date_of_delivery?: string | null;
  expiry_date: string;
  model: string;
  size: string;
  brand_name: string;
  category_name: string;
  channel_name: string;
}

// ล้างเบอร์โทรให้เหลือเฉพาะตัวเลขเพื่อใช้ match ข้อมูลลูกค้า (ถูกเรียกใช้ที่บรรทัด 106, 161, 174, 176, 179)
const cleanPhone = (phone?: string) => (phone || '').replace(/\D/g, '');

// จัดรูปแบบเบอร์โทรให้แสดงแบบอ่านง่าย (ถูกเรียกใช้ที่บรรทัด 199, 202)
const formatPhone = (phone?: string) => {
  const cleaned = cleanPhone(phone);
  if (cleaned.length === 10) return `${cleaned.slice(0, 3)}${cleaned.slice(3, 6)}${cleaned.slice(6)}`;
  return phone || '-';
};

// แปลงวันที่เป็น timestamp เพื่อใช้ sort ประวัติการโทร (ถูกเรียกใช้ที่บรรทัด 177)
const getDateTime = (value?: string) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params.id as string;

  // เก็บข้อมูลหลักของลูกค้า (อ่านค่า: บรรทัด 75, 176, 232, 287, 334, 392, 396, 400, 404, 408, 412, 416; อัปเดต: บรรทัด 196, 232, 237)
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  // เก็บที่อยู่ของลูกค้า (อ่านค่า: บรรทัด 233, 299, 300, 301, 302, 303, 421, 426, 430, 434, 438; อัปเดต: บรรทัด 206, 233)
  const [address, setAddress] = useState<Address | null>(null);
  // เก็บรายการ warranty ของลูกค้า (อ่านค่า: บรรทัด 178, 234, 254, 337, 467; อัปเดต: บรรทัด 207, 234)
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  // เก็บประวัติการโทรของลูกค้า (อ่านค่า: บรรทัด 361, 546, 549, 551; อัปเดต: บรรทัด 208, 235)
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  // เก็บสถานะโหลดหน้ารายละเอียดลูกค้า (อ่านค่า: บรรทัด 276; อัปเดต: บรรทัด 222, 239)
  const [loading, setLoading] = useState(true);

  // Effect: โหลดข้อมูลลูกค้า, ที่อยู่, warranty และประวัติการโทรเมื่อ customerId เปลี่ยน
  useEffect(() => {
    // API: ดึงไฟล์เสียงทุกหน้าเพื่อหา call history ของเบอร์โทรนี้ (ถูกเรียกใช้ที่บรรทัด 163)
    const fetchAllAudioFiles = async () => {
      const perPage = 500;
      let page = 1;
      let totalPages = 1;
      const files: AudioListRecord[] = [];

      do {
        const params = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
        });
        const res = await fetch(`${API_BASE}/api/v1/audio/list?${params}`);
        if (!res.ok) throw new Error(`audio/list HTTP ${res.status}`);
        const data = await res.json();
        files.push(...(data.files || []));
        totalPages = data.total_pages || 1;
        page += 1;
      } while (page <= totalPages);

      return files;
    };

    // API: สร้างหน้ารายละเอียดลูกค้าจากเบอร์โทรเมื่อ customerId เป็น phone-* (ถูกเรียกใช้ที่บรรทัด 225)
    const fetchPhoneDetail = async (phoneKey: string) => {
      const phoneClean = cleanPhone(phoneKey);
      const [files, customerRes, warrantyRes] = await Promise.all([
        fetchAllAudioFiles(),
        fetch(`${API_BASE}/api/v1/customers/list`),
        fetch(`${API_BASE}/api/v1/customers/warranty-list`),
      ]);

      if (!customerRes.ok) throw new Error(`customers/list HTTP ${customerRes.status}`);
      if (!warrantyRes.ok) throw new Error(`warranty-list HTTP ${warrantyRes.status}`);

      const customerData = await customerRes.json();
      const warrantyData = await warrantyRes.json();
      const customers: CustomerInfo[] = customerData.customers || [];
      const matchedCustomer = customers.find((item) => cleanPhone(item.phone) === phoneClean);
      const phoneFiles = files
        .filter((file) => cleanPhone(file.customer) === phoneClean)
        .sort((a, b) => getDateTime(b.date) - getDateTime(a.date));
      const phoneWarranties: Warranty[] = (warrantyData.warranties || [])
        .filter((item: WarrantyListRecord) => cleanPhone(item.phone) === phoneClean)
        .map((item: WarrantyListRecord) => ({
          registration_id: item.registration_id,
          registration_no: item.registration_no,
          certificate_no: null,
          brand_name: item.brand_name,
          category_name: item.category_name,
          model: item.model,
          size: item.size,
          channel_name: item.channel_name,
          warranty_period_months: item.warranty_period_months,
          date_of_purchase: item.date_of_purchase,
          date_of_delivery: item.date_of_delivery,
          expiry_date: item.expiry_date,
          status: item.status,
        }));

      setCustomer(matchedCustomer || {
        customer_id: 0,
        first_name: 'Customer',
        last_name: formatPhone(phoneClean),
        nick_name: null,
        email: '',
        phone: formatPhone(phoneClean),
        gender: '',
        date_of_birth: '',
      });
      setAddress(null);
      setWarranties(phoneWarranties);
      setCallHistory(phoneFiles.map((file) => ({
        file_id: file.file_id,
        original_filename: file.name,
        call_direction: file.call_direction,
        call_date: file.date,
        agent_id: file.agent,
        sentiment: file.sentiment,
        summary_text: '',
        key_insights: '',
      })));
    };

    // API: ดึงรายละเอียดลูกค้าจาก backend หรือ fallback เป็นข้อมูลจากเบอร์โทร (ถูกเรียกใช้ที่บรรทัด 242)
    const fetchDetail = async () => {
      setLoading(true);
      try {
        if (customerId.startsWith('phone-')) {
          await fetchPhoneDetail(customerId.replace(/^phone-/, ''));
          return;
        }

        const res = await fetch(`${API_BASE}/api/v1/customers/detail/${customerId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCustomer(data.customer);
        setAddress(data.address);
        setWarranties(data.warranties || []);
        setCallHistory(data.call_history || []);
      } catch {
        setCustomer(null);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [customerId]);

  // แปลงวันที่ซื้อ/หมดประกันให้เป็นข้อความอ่านง่าย (ถูกเรียกใช้ที่บรรทัด 412)
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return dateStr; }
  };

  const hasWarranty = warranties.length > 0;

  // แปลงวันที่และเวลา call history ให้เป็นข้อความอ่านง่าย (ถูกเรียกใช้ที่บรรทัด 577)
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch { return dateStr; }
  };

  // แปลงค่า gender จาก backend เป็น label ภาษาอังกฤษที่แสดงใน UI (ถูกเรียกใช้ที่บรรทัด 408)
  const formatGender = (g: string) => {
    if (!g) return '-';
    switch (g.toUpperCase()) {
      case 'MALE': return 'ชาย';
      case 'FEMALE': return 'หญิง';
      default: return g;
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-50 dark:bg-slate-800"> {/* Loading layout ของหน้า Customer Detail */}
        {/* Sidebar เมนูนำทาง */}<Sidebar />
        <main className="flex-1 p-6 flex items-center justify-center"> {/* แสดง loading ระหว่างดึงข้อมูลลูกค้า */}
          <p className="text-slate-400 dark:text-slate-500 text-sm">กำลังโหลดข้อมูล...</p>
        </main>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex h-screen bg-slate-50 dark:bg-slate-800"> {/* Empty/error layout เมื่อไม่พบลูกค้า */}
        {/* Sidebar เมนูนำทาง */}<Sidebar />
        <main className="flex-1 p-6 flex items-center justify-center"> {/* แสดงข้อความไม่พบข้อมูลลูกค้า */}
          <p className="text-slate-400 dark:text-slate-500 text-sm">ไม่พบข้อมูลลูกค้า</p>
        </main>
      </div>
    );
  }

  const addressSummary = [
    address?.address_line,
    address?.subdistrict,
    address?.district,
    address?.city_province,
    address?.postcode,
  ].filter(Boolean).join(' ') || '-';

  return (
    <div className="page-bg-dark flex h-screen overflow-hidden bg-slate-50 text-slate-900" style={{ colorScheme: 'light' }}> {/* Layout หลักหน้า Customer Detail */}
      {/* Sidebar เมนูนำทาง */}<Sidebar />
      <main className="page-bg-dark flex flex-1 flex-col overflow-hidden"> {/* พื้นที่หลักของรายละเอียดลูกค้า */}
        <div className="page-bg-dark flex-1 overflow-auto p-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"> {/* พื้นที่ scroll แบบซ่อน scrollbar */}
          <div className="mx-auto max-w-[1280px] space-y-6"> {/* container รวม profile, warranty และ call history */}
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 cursor-pointer"
            >
              <ArrowLeft size={16} /> Back
            </button>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6"> {/* แถวสรุปลูกค้า: profile, warranty count และ contact summary */}
              <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-sm md:col-span-7"> {/* Profile card: ชื่อ เบอร์ อีเมล และปุ่ม action */}
                <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center">
                  <div className="relative shrink-0">
                    <div className="h-[90px] w-[90px] rounded-full bg-gradient-to-tr from-slate-200 to-slate-100 p-1">
                      <div className="flex h-full w-full items-center justify-center rounded-full border-[3px] border-white bg-slate-50 text-slate-600 shadow-sm">
                        <User size={40} />
                      </div>
                    </div>
                    <div className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-[3px] border-white bg-green-500 shadow-sm" />
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="mb-1 text-2xl font-bold text-slate-800">{customer.first_name} {customer.last_name}</h2>
                        {hasWarranty && (
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 size={14} /> WARRANTY: มีประกัน {warranties.length}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 cursor-pointer"
                        >
                          <Pencil size={14} /> แก้ไขข้อมูล
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pointer-events-none absolute right-0 top-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-slate-50 opacity-50 blur-3xl" />
              </div>

              {/* CALLS Card */}
              <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-sm md:col-span-2 cursor-pointer transition-shadow hover:shadow-md"> {/* Summary card: จำนวน warranty ของลูกค้า */}
                <div className="h-10 w-10 flex items-center justify-center rounded-2xl bg-purple-50 text-purple-600 mb-6 shadow-sm">
                  <Phone size={18} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">CALLS</p>
                <p className="text-3xl font-black text-slate-800 mb-1">{callHistory.length}</p>
                <p className="text-[10px] font-medium text-slate-500">ประวัติการติดต่อศูนย์บริการ</p>
              </div>

              {/* ADDRESS Card */}
              <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-sm md:col-span-3 cursor-pointer transition-shadow hover:shadow-md"> {/* Summary card: เบอร์โทร/ช่องทางติดต่อหลัก */}
                <div className="h-10 w-10 flex items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-6 shadow-sm">
                  <MapPin size={18} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">ADDRESS</p>
                <p className="text-sm font-semibold text-slate-800 leading-relaxed">{addressSummary}</p>
              </div>
            </div>



            <div className={`grid grid-cols-1 gap-6 ${hasWarranty ? 'lg:grid-cols-3' : ''}`}> {/* Layout ส่วนข้อมูลส่วนตัวและ warranty list */}
              <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-8 shadow-sm lg:col-span-1"> {/* Personal information card: ข้อมูลลูกค้าและที่อยู่ */}
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">ข้อมูลส่วนตัว</h3>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
                  >
                    <Pencil size={14} /> แก้ไขข้อมูล
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70 flex items-center gap-1"><User size={12}/> FIRST NAME / ชื่อ</p>
                    <p className="text-sm font-semibold text-slate-800">{customer.first_name || '-'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70">LAST NAME / นามสกุล</p>
                    <p className="text-sm font-semibold text-slate-800">{customer.last_name || '-'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70">@ NICKNAME / ชื่อเล่น</p>
                    <p className="text-sm font-semibold text-slate-800">{customer.nick_name || '-'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70">PHONE / เบอร์โทร</p>
                    <p className="text-sm font-semibold text-slate-800">{customer.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70 flex items-center gap-1"><User size={12}/> GENDER / เพศ</p>
                    <p className="text-sm font-semibold text-slate-800">{formatGender(customer.gender)}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70 flex items-center gap-1"><CalendarDays size={12}/> BIRTHDAY / วันเกิด</p>
                    <p className="text-sm font-semibold text-slate-800">{formatDate(customer.date_of_birth)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70 flex items-center gap-1"><Mail size={12}/> EMAIL / อีเมล</p>
                    <p className="text-sm font-semibold text-slate-800">{customer.email || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70 flex items-center gap-1"><MapPin size={12}/> ADDRESS / ที่อยู่</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {address?.address_line || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70">SUBDISTRICT / ตำบล</p>
                    <p className="text-sm font-semibold text-slate-800">{address?.subdistrict || '-'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70">DISTRICT / อำเภอ</p>
                    <p className="text-sm font-semibold text-slate-800">{address?.district || '-'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70">PROVINCE / จังหวัด</p>
                    <p className="text-sm font-semibold text-slate-800">{address?.city_province || '-'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70">POSTCODE / รหัสไปรษณีย์</p>
                    <p className="text-sm font-semibold text-slate-800">{address?.postcode || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-600/70 flex items-center gap-1"><CalendarDays size={12}/> REGISTERED / ลงทะเบียนเมื่อ</p>
                    <p className="text-sm font-semibold text-slate-800">-</p>
                  </div>
                </div>
              </div>

              {hasWarranty && (
                <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-8 shadow-sm lg:col-span-2"> {/* Warranty card list: รายการสินค้าที่ลูกค้าลงทะเบียนรับประกัน */}
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-500">
                        <ShieldCheck size={20} strokeWidth={2.2} className="text-slate-700 dark:text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-800">รายการการรับประกันสินค้า</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 cursor-pointer"
                      >
                        <Plus size={14} /> Create ประกัน
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {warranties.map((w) => (
                      <div
                        key={w.registration_id}
                        onClick={() => router.push(`/customers/warranty/${w.registration_id}`)}
                        className="overflow-hidden rounded-2xl border border-slate-100 transition-shadow hover:shadow-md cursor-pointer"
                      >
                        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/50 p-6 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-400 shadow-sm">
                              <ShieldCheck size={24} strokeWidth={2.2} className="text-slate-700 dark:text-white" />
                            </div>
                            <div>
                              <h4 className="text-base font-medium text-slate-800">
                                {w.brand_name || 'Unknown'} - {w.model || w.category_name || '-'}
                              </h4>
                              {w.size && <p className="mt-0.5 text-sm text-slate-500">Size: {w.size}</p>}
                            </div>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wider ${
                            w.status === 'ACTIVE'
                              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                              : w.status === 'EXPIRED'
                                ? 'border-red-100 bg-red-50 text-red-600'
                                : 'border-slate-200 bg-slate-100 text-slate-500'
                          }`}>
                            {w.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-6 md:grid-cols-3">
                          <div>
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">Serial Code</p>
                            <p className="text-sm font-semibold text-slate-800">{w.registration_no || '-'}</p>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">Product Code</p>
                            <p className="text-sm font-semibold text-slate-800">{w.certificate_no || '-'}</p>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">Duration</p>
                            <p className="text-sm font-semibold text-slate-800">
                              {w.warranty_period_months ? `${w.warranty_period_months} เดือน` : '-'}
                            </p>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">Channel</p>
                            <p className="text-sm font-semibold text-slate-800">{w.channel_name || '-'}</p>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">Date of delivery</p>
                            <p className="text-sm font-medium text-slate-600">
                              {(w.date_of_delivery || w.date_of_purchase)
                                ? new Date(w.date_of_delivery || w.date_of_purchase).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                                : '-'}
                            </p>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">Expiry Date</p>
                            <p className="text-sm font-semibold text-red-600">
                              {w.expiry_date
                                ? new Date(w.expiry_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                                : '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          {/* Call History */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-6"> {/* Call history: ประวัติไฟล์เสียง/สายโทรที่ match กับลูกค้าคนนี้ */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                <PhoneCall size={16} />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">ประวัติการโทร</h3>
              <span className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">({callHistory.length} รายการ)</span>
            </div>

            {callHistory.length > 0 ? (
              <div className="space-y-3">
                {callHistory.map((call, idx) => (
                  <div
                    key={call.file_id}
                    onClick={() => router.push(`/files/${call.file_id}`)}
                    className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-800 transition-all cursor-pointer group"
                  >
                    {/* Row 1: Direction, Agent, Sentiment, Date */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium w-5">{idx + 1}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          call.call_direction === 'Inbound'
                            ? 'bg-green-50 text-green-600'
                            : 'bg-orange-50 text-orange-600'
                        }`}>
                          {call.call_direction || 'Unknown'}
                        </span>
                        <span className="text-sm text-slate-600 dark:text-slate-300 dark:text-slate-600">{call.agent_id || '-'}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          call.sentiment?.toUpperCase() === 'POSITIVE' ? 'bg-emerald-50 text-emerald-500' :
                          call.sentiment?.toUpperCase() === 'NEGATIVE' ? 'bg-red-50 text-red-500' :
                          'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                        }`}>
                          {(call.sentiment || 'NEUTRAL').toUpperCase()}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">{formatDateTime(call.call_date)}</span>
                    </div>

                    {/* Row 2: Key Insights */}
                    {call.key_insights && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed pl-8">
                        💡 {call.key_insights}
                      </p>
                    )}
                    {!call.key_insights && call.summary_text && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed pl-8">
                        {call.summary_text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500">ไม่มีประวัติการโทร</p>
            )}
          </div>

          </div>
        </div>
      </main>
    </div>
  );
}
