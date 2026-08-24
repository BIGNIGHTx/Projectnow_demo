'use client';

import Sidebar from '@/components/Sidebar';
import { ChevronRight, Mail, Phone, RotateCw, Search, UserCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Customer {
  customer_id: number;
  first_name: string;
  last_name: string;
  nick_name: string | null;
  phone: string;
  email: string;
  gender: string;
  date_of_birth: string;
  has_warranty?: boolean;
  warranty_count?: number;
}

export default function CustomersPage() {
  const router = useRouter();
  // เก็บรายการลูกค้าทั้งหมดที่ดึงจาก backend (อ่านค่า: บรรทัด 31, 39, 42, 46, 166, 180, 196, 199, 243; อัปเดต: บรรทัด 60, 62)
  const [customers, setCustomers] = useState<Customer[]>([]);
  // เก็บสถานะโหลดรายการลูกค้า (อ่านค่า: บรรทัด 156, 161; อัปเดต: บรรทัด 35, 64)
  const [loading, setLoading] = useState(true);
  // เก็บคำค้นหาลูกค้า (อ่านค่า: บรรทัด 38, 66, 136, 152, 153; อัปเดต: บรรทัด 137, 151)
  const [search, setSearch] = useState('');
  const total = customers.length;

  // API: ดึงรายการลูกค้าและเช็กว่าลูกค้าแต่ละคนมี warranty หรือไม่ (ถูกเรียกใช้ที่บรรทัด 71, 79)
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`${API_BASE}/api/v1/customers/list?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: Customer[] = data.customers || [];
      const customersWithWarranty = await Promise.all(
        list.map(async (customer) => {
          try {
            const detailRes = await fetch(`${API_BASE}/api/v1/customers/detail/${customer.customer_id}`);
            if (!detailRes.ok) return customer;
            const detail = await detailRes.json();
            const warrantyCount = Array.isArray(detail.warranties) ? detail.warranties.length : 0;
            return {
              ...customer,
              has_warranty: warrantyCount > 0,
              warranty_count: warrantyCount,
            };
          } catch {
            return customer;
          }
        })
      );
      setCustomers(customersWithWarranty);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  // Effect: โหลดรายการลูกค้าใหม่เมื่อคำค้นหาเปลี่ยน โดยหน่วงให้ state อัปเดตก่อน
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCustomers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchCustomers]);

  // Handle: จัดการ submit form ค้นหาและเรียกโหลดรายการลูกค้าใหม่ (ถูกเรียกใช้ที่บรรทัด 130)
  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    fetchCustomers();
  };

  return (
    <div className="page-bg-dark flex h-screen overflow-hidden bg-slate-50 text-slate-900" style={{ colorScheme: 'light' }}> {/* Layout หลักหน้า Customers: sidebar + รายชื่อลูกค้า */}
      {/* Sidebar เมนูนำทาง */}<Sidebar />
      <main className="page-bg-dark flex-1 overflow-auto bg-slate-50 p-4 sm:p-5 lg:p-6"> {/* พื้นที่ scroll ของหน้าลูกค้า */}
        <div className="mx-auto w-full"> {/* container รวม header, search และตารางลูกค้า */}
          <div className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end"> {/* Header: ชื่อหน้าและจำนวนลูกค้า */}
            <div className="relative">
              <div className="absolute left-0 top-1 bottom-[34px] w-px bg-gradient-to-b from-emerald-400 to-transparent opacity-60" />
              <svg className="absolute -left-[5.5px] top-0 h-3 w-3 text-emerald-500 opacity-80" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C12 0 12 10.5 24 12C24 12 12 13.5 12 24C12 24 12 13.5 0 12C0 12 12 10.5 12 0Z" />
              </svg>
              <div className="absolute -ml-[2px] bottom-8 left-0 h-1.5 w-1.5 rounded-full bg-emerald-500 opacity-80" />
              <div className="absolute bottom-[34.5px] left-1.5 right-24 h-px bg-gradient-to-r from-emerald-400 via-emerald-200 to-transparent opacity-60" />
              <svg className="pointer-events-none absolute -right-4 top-0 hidden h-24 w-32 text-emerald-300 opacity-40 mix-blend-multiply sm:block" viewBox="0 0 200 100" fill="none" stroke="currentColor">
                <path d="M150,80 Q100,80 120,40 T180,20" strokeWidth="0.5" fill="none" />
                <path d="M130,90 Q80,90 90,50 T160,10" strokeWidth="0.5" fill="none" />
                <path d="M160,70 C130,50 180,30 190,50 C200,70 170,90 140,80" strokeWidth="0.5" fill="none" />
                <path d="M140,65 C140,65 140,75 145,75 C145,75 140,75 140,85 C140,85 140,75 135,75 C135,75 140,75 140,65Z" fill="#10B981" stroke="none" />
                <circle cx="160" cy="25" r="1.5" fill="currentColor" />
                <circle cx="150" cy="15" r="1" fill="currentColor" />
                <circle cx="185" cy="85" r="1.5" fill="currentColor" />
              </svg>

              <div className="relative z-10 pb-4 pl-6 pt-8">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h1 className="text-[24px] font-black leading-none tracking-tight text-[#10B981] sm:text-[28px] md:text-[32px]">Customer</h1>
                  <h1 className="text-[24px] font-black leading-none tracking-tight text-[#0F172A] sm:text-[28px] md:text-[32px]">Library</h1>
                  <span
                    className="ml-1 text-[24px] font-black leading-none tracking-tight sm:ml-1.5 sm:text-[28px] md:text-[32px]"
                    style={{
                      background: 'linear-gradient(to right, #0F172A, #10B981, #34D399)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    Database
                  </span>
                </div>

                <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#10B981] sm:text-xs">
                  <span>CRM SYSTEM</span>
                  <span className="text-emerald-200">|</span>
                  <span>{total.toLocaleString()} CLIENTS FOUND</span>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSearch} className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"> {/* Search form: ค้นหาลูกค้าจากชื่อ/เบอร์/อีเมล */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ค้นหาด้วยชื่อ นามสกุล หรือเบอร์โทรศัพท์..."
                  className="w-full rounded-xl border-2 border-slate-200 py-3.5 pl-12 pr-4 text-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-700"
              >
                <Search size={18} />
                ค้นหา
              </button>
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear customer search"
                title="Clear customer search"
                className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-slate-500 transition-colors hover:bg-slate-100"
              >
                <RotateCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </form>

          {loading ? (
            <div className="py-20 text-center"> {/* Loading state: แสดง spinner ระหว่างโหลดข้อมูลลูกค้า */}
              <RotateCw size={40} className="mx-auto mb-4 animate-spin text-emerald-600" />
              <p className="text-slate-500">กำลังโหลดข้อมูลลูกค้า...</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white py-20 text-center"> {/* Empty state: ไม่พบลูกค้าตามเงื่อนไขค้นหา */}
              <UserCircle size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="font-medium text-slate-500">ไม่พบข้อมูลลูกค้า</p>
              <p className="mt-2 text-sm text-slate-400">ลองเปลี่ยนคำค้นหา</p>
            </div>
          ) : (
            <section className="mb-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"> {/* Customer table section: แสดงรายชื่อลูกค้าและสถานะ warranty */}
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Customer Library</h3>
                  <p className="text-xs text-slate-500">ข้อมูลลูกค้าพร้อมรายละเอียดที่จำเป็น</p>
                </div>
                <div className="text-xs font-medium text-slate-400">
                  แสดง <span className="font-bold text-slate-600">{customers.length}</span> รายการ
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="p-4 pl-6">Customer</th>
                      <th className="p-4">Phone</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Warranty</th>
                      <th className="p-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {customers.map((customer) => (
                      <tr
                        key={customer.customer_id}
                        onClick={() => router.push(`/customers/${customer.customer_id}`)}
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                      >
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700">
                              {customer.first_name?.[0] || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {customer.first_name} {customer.last_name}
                                {customer.nick_name && (
                                  <span className="ml-1 font-normal text-slate-400">({customer.nick_name})</span>
                                )}
                              </p>
                              <p className="truncate text-[11px] text-slate-400">ID: {customer.customer_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <Phone size={12} /> {customer.phone || '-'}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <Mail size={12} /> {customer.email || '-'}
                          </span>
                        </td>
                        <td className="p-4">
                          {customer.has_warranty || (customer.warranty_count ?? 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                              มีประกัน
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                              ไม่มีประกัน
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/customers/${customer.customer_id}`);
                            }}
                            aria-label={`ดูรายละเอียดลูกค้า ${customer.first_name} ${customer.last_name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                            title="ดูรายละเอียด"
                          >
                            <ChevronRight size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
