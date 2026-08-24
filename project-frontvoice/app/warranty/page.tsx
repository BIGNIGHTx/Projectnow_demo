'use client';

import Sidebar from '@/components/Sidebar';
import { Search, RotateCw, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WARRANTY_ICON_STYLE = { 
  backgroundColor: "#fff",
  backgroundImage: "url('/waran.jpg')", 
  filter: "grayscale(100%) contrast(500%) brightness(120%)",
  mixBlendMode: "multiply" as const
};

interface WarrantyRecord {
  registration_id: number;
  registration_no: string;
  status: string;
  warranty_period_months: number;
  date_of_purchase: string;
  date_of_delivery: string;
  expiry_date: string;
  order_number: string;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  brand_name: string;
  category_name: string;
  model: string;
  size: string;
  channel_name: string;
  created_at: string;
}

export default function WarrantyPage() {
  const router = useRouter();
  // เก็บรายการ warranty ทั้งหมดที่ดึงจาก backend (อ่านค่า: บรรทัด 56, 108, 111, 161, 169; อัปเดต: บรรทัด 56, 58)
  const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
  // เก็บสถานะโหลดรายการ warranty (อ่านค่า: บรรทัด 108, 134, 154; อัปเดต: บรรทัด 49, 60)
  const [loading, setLoading] = useState(true);
  // เก็บคำค้นหา warranty (อ่านค่า: บรรทัด 52, 62, 124; อัปเดต: บรรทัด 125)
  const [search, setSearch] = useState('');

  // API: ดึงรายการ warranty จาก backend ตามคำค้นหาปัจจุบัน (ถูกเรียกใช้ที่บรรทัด 66, 126)
  const fetchWarranties = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`${API_BASE}/api/v1/customers/warranty-list?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWarranties(data.warranties || []);
    } catch {
      setWarranties([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  // Effect: โหลดรายการ warranty ใหม่เมื่อคำค้นหาเปลี่ยน
  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchWarranties(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchWarranties]);

  // แปลงวันที่ warranty ให้เป็นข้อความอ่านง่าย (ถูกเรียกใช้ที่บรรทัด 214, 216)
  const formatDate = (d: string) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return d; }
  };

  // คืนค่า class สีของ badge สถานะ warranty (ถูกเรียกใช้ที่บรรทัด 204)
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
      case 'EXPIRED': return 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-slate-50 to-white text-slate-900" style={{ colorScheme: 'light' }}> {/* Layout หลักหน้า Warranty: sidebar + ตาราง warranty */}
      {/* Sidebar เมนูนำทาง */}<Sidebar />
      <main className="flex-1 overflow-auto p-6"> {/* พื้นที่ scroll ของ warranty list */}
        <div className="mx-auto max-w-full space-y-6"> {/* container รวม header, search และ table */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"> {/* Header: ชื่อหน้าและจำนวน warranty */}
            <div className="relative pl-6">
              <div className="absolute left-0 top-1 bottom-1 w-px bg-gradient-to-b from-indigo-400 to-transparent opacity-60" />
              <svg className="absolute -left-[5.5px] top-0 h-3 w-3 text-indigo-500 opacity-80" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C12 0 12 10.5 24 12C24 12 12 13.5 12 24C12 24 12 13.5 0 12C0 12 12 10.5 12 0Z" />
              </svg>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#818CF8]">
                <span className="h-4 w-4 rounded-md bg-[#fff] bg-cover bg-center shadow-sm ring-1 ring-amber-100" style={WARRANTY_ICON_STYLE} />
                Warranty Storage
              </div>
              <h1 className="text-[28px] font-black leading-none tracking-tight text-[#0F172A] sm:text-[32px]">
                Warranty
              </h1>
              <p className="mt-2 text-sm font-medium text-slate-500">รายการลงทะเบียนประกันสินค้าทั้งหมด</p>
            </div>

            {!loading && warranties.length > 0 && (
              <div className="agent-count-pill inline-flex w-fit items-center gap-2 rounded-xl border border-indigo-100 bg-white px-4 py-2 text-xs font-bold text-indigo-700 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                ทั้งหมด {warranties.length} รายการ
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]"> {/* Search bar: ค้นหา warranty ตามลูกค้า/สินค้า/serial */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="ค้นหา (ชื่อ, นามสกุล, เบอร์โทร, รหัสรับประกัน, แบรนด์)..."
                  className="w-full rounded-xl border border-slate-100 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-100 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') fetchWarranties(); }}
                />
              </div>
              <button
                onClick={fetchWarranties}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                title="Refresh"
              >
                <RotateCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]"> {/* Warranty table: แสดงข้อมูลการรับประกันและปุ่มดูรายละเอียด */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                    <th className="p-4 pl-6">Warranty</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Product</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-center">Period</th>
                    <th className="p-4 text-center">Expiry</th>
                    <th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400">
                        <RotateCw size={24} className="mx-auto mb-2 animate-spin" />
                        <p className="text-sm font-medium">กำลังโหลดข้อมูล...</p>
                      </td>
                    </tr>
                  ) : warranties.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400">
                        <span className="mx-auto mb-3 block h-11 w-11 rounded-xl bg-[#fff] bg-cover bg-center shadow-sm ring-1 ring-amber-100" style={WARRANTY_ICON_STYLE} />
                        <p className="text-sm font-bold">ไม่พบข้อมูลการรับประกัน</p>
                      </td>
                    </tr>
                  ) : (
                    warranties.map((w) => (
                      <tr
                        key={w.registration_id}
                        onClick={() => router.push(`/customers/warranty/${w.registration_id}`)}
                        className="group cursor-pointer transition-colors hover:bg-indigo-50/30"
                      >
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-[#fff] bg-cover bg-center shadow-sm ring-1 ring-amber-100" style={WARRANTY_ICON_STYLE} />
                            <div className="min-w-0">
                              <p className="inline-flex items-center gap-1 truncate text-sm font-bold text-slate-800 group-hover:text-indigo-700">
                                {w.registration_no}
                                <ExternalLink size={11} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                              </p>
                              <p className="truncate text-[11px] font-medium text-slate-400">
                                Order {w.order_number || '-'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="truncate text-sm font-bold text-slate-700">
                            {w.first_name} {w.last_name}
                          </p>
                          <p className="font-mono text-[11px] font-medium text-slate-400">{w.phone || '-'}</p>
                        </td>
                        <td className="p-4">
                          <p className="truncate text-sm font-bold text-slate-700">
                            {w.brand_name || '-'}
                          </p>
                          <p className="truncate text-[11px] font-medium text-slate-400">
                            {w.category_name || '-'} / {w.model || '-'}{w.size ? ` / ${w.size}` : ''}
                          </p>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${getStatusStyle(w.status)}`}>
                            {w.status || '-'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className="inline-flex rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-100">
                            {w.warranty_period_months ? `${w.warranty_period_months} เดือน` : '-'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <p className="text-xs font-bold text-slate-600">{formatDate(w.expiry_date)}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                            ซื้อ {formatDate(w.date_of_purchase)}
                          </p>
                        </td>
                        <td className="p-4 text-center">
                          <ExternalLink size={15} className="mx-auto text-slate-300 transition-colors group-hover:text-indigo-500" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
