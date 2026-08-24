'use client';

import Sidebar from '@/components/Sidebar';
import {
  ArrowLeft, Headphones, Phone, FileAudio, CheckCircle2, RefreshCw,
  AlertCircle, Loader2, Hash, TrendingUp, MessageCircle, Clock
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface AgentInfo {
  agent_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  created_at: string;
}

interface AgentStats {
  total_calls: number;
  avg_qa: number | null;
  avg_csat: number | null;
  positive_calls: number;
  neutral_calls: number;
  negative_calls: number;
}

interface CallRecord {
  file_id: string;
  original_filename: string;
  customer_phone: string;
  call_direction: string;
  call_date: string;
  status: string;
  duration_seconds: number;
  sentiment: string | null;
  qa_score: number | null;
  csat_score: number | null;
  intent: string;
  brand_names: string[];
  summary_text: string;
}

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.id as string;

  // เก็บข้อมูลหลักของ agent (อ่านค่า: บรรทัด 74, 78, 149, 156, 189, 192, 198, 202, 204, 207, 293; อัปเดต: บรรทัด 74)
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  // เก็บสถิติ performance ของ agent (อ่านค่า: บรรทัด 75, 233, 241, 242, 243, 254, 255, 256, 268, 269, 270; อัปเดต: บรรทัด 75)
  const [stats, setStats] = useState<AgentStats | null>(null);
  // เก็บรายการสายที่เกี่ยวข้องกับ agent (อ่านค่า: บรรทัด 76, 285, 289, 297; อัปเดต: บรรทัด 76)
  const [calls, setCalls] = useState<CallRecord[]>([]);
  // เก็บสถานะโหลดหน้า agent detail (อ่านค่า: บรรทัด 135; อัปเดต: บรรทัด 68, 80)
  const [loading, setLoading] = useState(true);
  // เก็บข้อความ error ของหน้า agent detail (อ่านค่า: บรรทัด 149, 156; อัปเดต: บรรทัด 69, 78)
  const [error, setError] = useState<string | null>(null);

  // Effect: โหลดข้อมูล agent detail, stats และรายการสายเมื่อ agentId เปลี่ยน
  useEffect(() => {
    if (!agentId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/v1/agents/detail/${encodeURIComponent(agentId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAgent(data.agent);
        setStats(data.stats);
        setCalls(data.calls || []);
      } catch {
        setError('ไม่พบ agent นี้ หรือไม่สามารถเชื่อมต่อ API ได้');
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  // แปลงวันที่ของประวัติสายให้เป็นข้อความอ่านง่าย (ถูกเรียกใช้ที่บรรทัด 310)
  const formatDate = (s: string) => {
    if (!s) return '-';
    try {
      return new Date(s).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch { return s; }
  };

  // แปลง duration จากวินาทีเป็นรูปแบบนาที:วินาที (ถูกเรียกใช้ที่บรรทัด 314)
  const formatDuration = (sec: number) => {
    if (!sec) return '-';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // คืนค่า class สีของคะแนน QA ในหน้า agent detail (ถูกเรียกใช้ที่บรรทัด 241, 352)
  const qaColor = (qa: number | null) => {
    if (qa === null) return 'text-slate-400 dark:text-slate-500';
    if (qa >= 8) return 'text-emerald-600 dark:text-emerald-400';
    if (qa >= 6) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-500';
  };

  // คืนค่า class สีของคะแนน CSAT ในหน้า agent detail (ถูกเรียกใช้ที่บรรทัด 254, 358)
  const csatColor = (csat: number | null) => {
    if (csat === null) return 'text-slate-400 dark:text-slate-500';
    if (csat >= 4) return 'text-emerald-600 dark:text-emerald-400';
    if (csat >= 3) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-500';
  };

  // คืนค่า class สีของ sentiment badge ในรายการสาย (ถูกเรียกใช้ที่บรรทัด 298)
  const sentimentBadge = (s: string | null) => {
    const lc = (s || '').toLowerCase();
    if (lc === 'positive') return { label: 'POSITIVE', cls: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' };
    if (lc === 'negative') return { label: 'NEGATIVE', cls: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' };
    if (lc === 'neutral')  return { label: 'NEUTRAL',  cls: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' };
    return { label: '-', cls: 'bg-slate-50 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500' };
  };

  // คืนค่า class สีของ status badge ในรายการสาย (ถูกเรียกใช้ที่บรรทัด 299)
  const statusBadge = (status: string) => {
    if (status === 'analyzed') return { label: 'COMPLETE', cls: 'text-emerald-500', icon: <CheckCircle2 size={14} /> };
    if (status === 'failed')   return { label: 'FAILED',   cls: 'text-red-500', icon: <AlertCircle size={14} /> };
    return { label: 'PROCESSING', cls: 'text-orange-500', icon: <RefreshCw size={14} className="animate-spin" /> };
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-[#F8FAFC] text-slate-900" style={{ colorScheme: 'light' }}> {/* Loading layout ของหน้า Agent Detail */}
        {/* Sidebar เมนูนำทาง */}<Sidebar />
        <main className="flex-1 flex items-center justify-center"> {/* แสดง spinner ระหว่างโหลดข้อมูล agent */}
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">กำลังโหลดข้อมูล Agent...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex h-screen bg-[#F8FAFC] text-slate-900" style={{ colorScheme: 'light' }}> {/* Error layout ของหน้า Agent Detail */}
        {/* Sidebar เมนูนำทาง */}<Sidebar />
        <main className="flex-1 flex items-center justify-center"> {/* แสดงข้อความ error และปุ่มกลับ */}
          <div className="text-center">
            <AlertCircle size={32} className="text-red-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-red-600">{error || 'ไม่พบ agent'}</p>
            <button onClick={() => router.push('/agents')} className="mt-4 text-sm font-bold text-indigo-600 hover:underline cursor-pointer">
              กลับไปหน้า Agents
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] text-slate-900" style={{ colorScheme: 'light' }}> {/* Layout หลักหน้า Agent Detail */}
      {/* Sidebar เมนูนำทาง */}<Sidebar />
      <main className="flex-1 overflow-auto p-6"> {/* พื้นที่ scroll ของรายละเอียด agent */}
        <div className="mx-auto max-w-full space-y-6"> {/* container รวม profile, stats และ call history */}

          {/* Back */}
          <button
            onClick={() => router.push('/agents')}
            className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] transition-colors hover:bg-indigo-50 hover:text-indigo-600"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
            Back to Agents
          </button>

          {/* Header — Agent Info */}
          {/* Header — Agent Info */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-sm"> {/* Profile card: ข้อมูล agent และสถานะ active/inactive */}
            <div className="pointer-events-none absolute right-0 top-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-slate-50 opacity-50 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center">
              <div className="relative shrink-0">
                <div className="h-[90px] w-[90px] rounded-full bg-gradient-to-tr from-slate-200 to-slate-100 p-1">
                  <div className="flex h-full w-full items-center justify-center rounded-full border-[3px] border-white bg-slate-50 text-xl font-black text-slate-600 shadow-sm">
                    {agent.first_name.charAt(0)}{agent.last_name.charAt(0)}
                  </div>
                </div>
                <div className={`absolute bottom-1 right-1 h-5 w-5 rounded-full border-[3px] border-white shadow-sm ${agent.is_active ? 'bg-green-500' : 'bg-slate-400'}`} />
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="mb-1 text-2xl font-bold text-slate-800">{agent.full_name}</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 font-mono text-xs font-bold text-slate-600 ring-1 ring-slate-100">
                        <Hash size={13} className="text-slate-400" />
                        {agent.agent_id}
                      </span>
                      {agent.phone && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-mono text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                          <Phone size={13} className="text-emerald-500" />
                          {agent.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 cursor-pointer"
                    >
                      แก้ไขข้อมูล
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"> {/* Stat cards: จำนวน call, QA, CSAT และ positive rate */}
            <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                <FileAudio size={18} />
              </div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Calls</p>
              <p className="text-3xl font-bold text-slate-800">{stats?.total_calls ?? 0}</p>
            </div>

            <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-sm">
                <TrendingUp size={18} />
              </div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Avg QA</p>
              <p className={`text-3xl font-bold ${qaColor(stats?.avg_qa ?? null)}`}>
                {stats?.avg_qa !== null && stats?.avg_qa !== undefined ? stats.avg_qa : '-'}
                {stats?.avg_qa !== null && stats?.avg_qa !== undefined && (
                  <span className="ml-0.5 text-xs font-semibold opacity-50">/10</span>
                )}
              </p>
            </div>

            <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-sm">
                <CheckCircle2 size={18} />
              </div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Avg CSAT</p>
              <p className={`text-3xl font-bold ${csatColor(stats?.avg_csat ?? null)}`}>
                {stats?.avg_csat !== null && stats?.avg_csat !== undefined ? stats.avg_csat : '-'}
                {stats?.avg_csat !== null && stats?.avg_csat !== undefined && (
                  <span className="ml-0.5 text-xs font-semibold opacity-50">/5</span>
                )}
              </p>
            </div>

            <div className="flex flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 shadow-sm">
                <MessageCircle size={18} />
              </div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Sentiment</p>
              <p className="mt-2 flex gap-3 text-sm font-bold text-slate-700">
                <span className="text-emerald-600">+{stats?.positive_calls ?? 0}</span>
                <span className="text-slate-500">·{stats?.neutral_calls ?? 0}</span>
                <span className="text-red-500">-{stats?.negative_calls ?? 0}</span>
              </p>
            </div>
          </div>

          {/* Call Log */}
          <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm"> {/* Call history: รายการสายของ agent พร้อม sentiment/score */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                  <FileAudio size={18} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Call Log</h3>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-100">
                {calls.length} สาย
              </span>
            </div>

            {calls.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <FileAudio size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold">ยังไม่มีรายการสาย</p>
                <p className="mt-1 text-xs">รายการจะปรากฏเมื่อ agent นี้รับสายและระบบวิเคราะห์เสร็จ</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {calls.map((call) => {
                  const sb = sentimentBadge(call.sentiment);
                  const stb = statusBadge(call.status);
                  return (
                    <div
                      key={call.file_id}
                      onClick={() => router.push(`/files/${call.file_id}`)}
                      className="group cursor-pointer p-4 transition-colors hover:bg-indigo-50/30"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                        {/* Date col */}
                        <div className="w-36 shrink-0">
                          <p className="text-[11px] font-bold text-slate-600">
                            {formatDate(call.call_date)}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                            <Clock size={10} />
                            {formatDuration(call.duration_seconds)}
                          </p>
                        </div>

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                              call.call_direction === 'Inbound'
                                ? 'bg-blue-50 text-blue-600'
                                : call.call_direction === 'Outbound'
                                  ? 'bg-orange-50 text-orange-600'
                                  : 'bg-slate-100 text-slate-500'
                            }`}>
                              {call.call_direction}
                            </span>
                            <span className="font-mono text-sm font-bold text-slate-700">
                              {call.customer_phone}
                            </span>
                            {call.brand_names && call.brand_names.length > 0 && (
                              <div className="flex gap-1">
                                {call.brand_names.map((b, i) => (
                                  <span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                    {b}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <p className="truncate text-xs font-medium text-slate-500 group-hover:text-slate-700">
                            {call.intent || call.summary_text || call.original_filename}
                          </p>
                        </div>

                        {/* QA / CSAT */}
                        <div className="flex shrink-0 items-center gap-4">
                          <div className="text-center">
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">QA</p>
                            <p className={`text-sm font-bold ${qaColor(call.qa_score)}`}>
                              {call.qa_score !== null ? call.qa_score : '-'}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">CSAT</p>
                            <p className={`text-sm font-bold ${csatColor(call.csat_score)}`}>
                              {call.csat_score !== null ? call.csat_score : '-'}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${sb.cls}`}>
                            {sb.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-black ${stb.cls}`}>
                            {stb.icon}
                            {stb.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
