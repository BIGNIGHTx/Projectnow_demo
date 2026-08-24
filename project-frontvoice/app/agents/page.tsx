'use client';

import Sidebar from '@/components/Sidebar';
import { Search, RotateCw, UserRound, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Agent {
  agent_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  total_calls: number;
  avg_qa: number | null;
  avg_csat: number | null;
  positive_calls: number;
  neutral_calls: number;
  negative_calls: number;
}

type SortKey = 'qa' | 'csat' | 'name';
type SortOrder = 'asc' | 'desc';

// แสดง icon บอกทิศทางการ sort ของหัวตาราง (ถูกเรียกใช้ที่บรรทัด 170, 195, 200)
const SortIcon = ({ active, order }: { active: boolean; order: SortOrder }) => {
  if (!active) return <ArrowUpDown size={12} className="text-slate-300" />;
  return order === 'desc'
    ? <ArrowDown size={12} className="text-indigo-600" />
    : <ArrowUp size={12} className="text-indigo-600" />;
};

export default function AgentsPage() {
  const router = useRouter();
  // เก็บรายการ agent ที่ดึงจาก backend (อ่านค่า: บรรทัด 58, 61, 126, 214, 223, 226; อัปเดต: บรรทัด 61, 64)
  const [agents, setAgents] = useState<Agent[]>([]);
  // เก็บสถานะโหลดรายการ agent (อ่านค่า: บรรทัด 147, 207; อัปเดต: บรรทัด 53, 66)
  const [loading, setLoading] = useState(true);
  // เก็บข้อความ error ของหน้า agents (อ่านค่า: บรรทัด 180, 182; อัปเดต: บรรทัด 54, 63)
  const [error, setError] = useState<string | null>(null);
  // เก็บคำค้นหา agent (อ่านค่า: บรรทัด 57, 68, 138; อัปเดต: บรรทัด 139)
  const [search, setSearch] = useState('');
  // เก็บ field ที่ใช้ sort ตาราง agent (อ่านค่า: บรรทัด 56, 68, 79, 158, 195, 200; อัปเดต: บรรทัด 82)
  const [sortBy, setSortBy] = useState<SortKey>('qa');
  // เก็บลำดับการ sort เป็นมากไปน้อยหรือน้อยไปมาก (อ่านค่า: บรรทัด 29, 31, 56, 68, 80, 170, 175, 195, 200; อัปเดต: บรรทัด 80, 83)
  const [order, setOrder] = useState<SortOrder>('desc');

  // API: ดึงรายการ agent จาก backend ตาม search และ sort ปัจจุบัน (ถูกเรียกใช้ที่บรรทัด 72)
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sort_by: sortBy, order });
      if (search) params.set('search', search);
      const res = await fetch(`${API_BASE}/api/v1/agents/list?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents(data.agents || []);
    } catch {
      setError('ไม่สามารถเชื่อมต่อ API ได้');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, order]);

  // Effect: โหลดรายการ agent ใหม่เมื่อ search หรือ sort option เปลี่ยน
  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchAgents(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAgents]);

  // กดที่ header ในตาราง → toggle sort
  // Handle: toggle field/order ที่ใช้ sort เมื่อกดหัวตาราง (ถูกเรียกใช้ที่บรรทัด 162, 194, 199)
  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setOrder(order === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setOrder('desc');
    }
  };

  // คืนค่า class สีของคะแนน QA ในตาราง agent (ถูกเรียกใช้ที่บรรทัด 255)
  const qaColor = (qa: number | null) => {
    if (qa === null) return 'text-slate-300';
    if (qa >= 7) return 'text-[#10B981]';
    if (qa >= 6) return 'text-[#F59E0B]';
    return 'text-[#FB7185]';
  };

  // คืนค่า class สีของคะแนน CSAT ในตาราง agent (ถูกเรียกใช้ที่บรรทัด 260)
  const csatColor = (csat: number | null) => {
    if (csat === null) return 'text-slate-300';
    if (csat >= 4) return 'text-[#10B981]';
    if (csat >= 3) return 'text-[#F59E0B]';
    return 'text-[#FB7185]';
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] text-slate-900" style={{ colorScheme: 'light' }}> {/* Layout หลักหน้า Agents: sidebar + performance list */}
      {/* Sidebar เมนูนำทาง */}<Sidebar />
      <main className="flex-1 overflow-auto p-6"> {/* พื้นที่ scroll ของหน้า agents */}
        <div className="mx-auto max-w-full space-y-6"> {/* container รวม header, filter และ table */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"> {/* Header: ชื่อหน้าและจำนวน agent */}
            <div className="relative pl-6">
              <div className="absolute left-0 top-1 bottom-1 w-px bg-gradient-to-b from-indigo-400 to-transparent opacity-60" />
              <svg className="absolute -left-[5.5px] top-0 h-3 w-3 text-indigo-500 opacity-80" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C12 0 12 10.5 24 12C24 12 12 13.5 12 24C12 24 12 13.5 0 12C0 12 12 10.5 12 0Z" />
              </svg>
              <div className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-800">
                <UserRound size={18} strokeWidth={2.4} />
                Agent Performance
              </div>
              <h1 className="text-[28px] font-black leading-none tracking-tight text-[#0F172A] sm:text-[32px]">
                Agents
              </h1>
              <p className="mt-2 text-sm font-medium text-slate-500">ข้อมูล Agent และคุณภาพการสนทนาที่วิเคราะห์แล้ว</p>
            </div>

            <div className="agent-count-pill inline-flex w-fit items-center gap-2 rounded-xl border border-indigo-100 bg-white px-4 py-2 text-xs font-bold text-indigo-700 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              ทั้งหมด {agents.length} คน
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]"> {/* Search/sort panel: ค้นหา agent และเลือกเรียงตาม QA/CSAT/name */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="ค้นหาด้วย ชื่อ, นามสกุล หรือ รหัส agent..."
                  className="w-full rounded-xl border border-slate-100 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-100 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                onClick={fetchAgents}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                title="Refresh"
              >
                <RotateCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">เรียงตาม</span>
              {([
                { key: 'qa' as const, label: 'QA Score' },
                { key: 'csat' as const, label: 'CSAT' },
                { key: 'name' as const, label: 'ชื่อ' },
              ]).map((opt) => {
                const active = sortBy === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => toggleSort(opt.key)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                      active
                        ? 'border-indigo-100 bg-indigo-50 text-indigo-700'
                        : 'border-transparent text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                    <SortIcon active={active} order={order} />
                  </button>
                );
              })}
              <span className="ml-auto text-[11px] font-semibold text-slate-400">
                {order === 'desc' ? 'มาก -> น้อย' : 'น้อย -> มาก'}
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]"> {/* Agent table: แสดง ranking, QA, CSAT, จำนวน call และ action */}
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                  <th className="p-4 pl-6">Agent</th>
                  <th className="p-4">Agent ID</th>
                  <th className="p-4">เบอร์โทร</th>
                  <th className="p-4 text-center">
                    <button onClick={() => toggleSort('qa')} className="agent-table-sort-button inline-flex items-center gap-1 transition-colors hover:text-indigo-600">
                      QA <SortIcon active={sortBy === 'qa'} order={order} />
                    </button>
                  </th>
                  <th className="p-4 text-center">
                    <button onClick={() => toggleSort('csat')} className="agent-table-sort-button inline-flex items-center gap-1 transition-colors hover:text-indigo-600">
                      CSAT <SortIcon active={sortBy === 'csat'} order={order} />
                    </button>
                  </th>
                  <th className="p-4 text-center">จำนวนสาย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400">
                      <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
                      <p className="text-sm font-medium">กำลังโหลด...</p>
                    </td>
                  </tr>
                ) : agents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400">
                      <UserRound size={32} strokeWidth={2.6} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-bold">ไม่พบ agent</p>
                      <p className="mt-1 text-xs">ลองค้นหาด้วยคำอื่น</p>
                    </td>
                  </tr>
                ) : (
                  agents.map((a) => (
                    <tr
                      key={a.agent_id}
                      onClick={() => router.push(`/agents/${a.agent_id}`)}
                      className="group cursor-pointer transition-colors hover:bg-indigo-50/30"
                    >
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-[#54657E] ring-1 ring-slate-100">
                            <UserRound size={22} strokeWidth={2.7} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-800 group-hover:text-indigo-700">
                              {a.full_name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex rounded-full bg-[#F1F5F9] px-3 py-1 font-mono text-[11px] font-bold text-[#54657E] ring-1 ring-slate-200/70">
                          {a.agent_id}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-sm text-slate-600">
                        {a.phone ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone size={12} className="text-slate-400" />
                            {a.phone}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-[13px] font-bold leading-none ${qaColor(a.avg_qa)}`}>
                          {a.avg_qa !== null ? `${a.avg_qa}` : '-'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-[13px] font-bold leading-none ${csatColor(a.avg_csat)}`}>
                          {a.avg_csat !== null ? `${a.avg_csat}` : '-'}
                        </span>
                      </td>
                      <td className="p-4 text-center text-sm font-bold text-slate-700">
                        {a.total_calls}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
