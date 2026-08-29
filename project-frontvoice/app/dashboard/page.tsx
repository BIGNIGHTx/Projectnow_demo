'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import PageHeader from '@/components/PageHeader';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import {
  FileAudio, CheckCircle2, RefreshCw, AlertTriangle,
  Smile, Meh, Frown, Lightbulb, Tag,
  UserRound, AlertCircle, MoreHorizontal, Calendar, Download
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ----- types -----
interface SentimentDist { positive: number; neutral: number; negative: number }
interface TopicItem    { topic: string; count: number; percentage: number }
interface KeywordItem  { keyword: string; count: number; percentage: number }
interface BrandItem    { brand: string; count: number; percentage: number }
interface BrandIssue   { topic: string; count: number }
interface AgentItem {
  agent_id: string; full_name: string;
  total_calls: number; avg_qa: number | null; avg_csat: number | null;
  positive_calls: number; neutral_calls: number; negative_calls: number;
}
interface InsightsData {
  period: string;
  ref_date: string;
  kpi: { total_files: number; analyzed: number; processing: number; failed: number };
  sentiment_distribution: SentimentDist;
  topic_distribution: TopicItem[];
  keyword_frequency: KeywordItem[];
  brand_volume: BrandItem[];
  brand_issues: Record<string, BrandIssue[]>;
  agent_performance: AgentItem[];
}

type Period = 'day' | 'month' | 'year' | 'all';
type BrandView = 'volume' | 'issues';

const TOPIC_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316'];
const DONUT_RADIUS = 45;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const BRAND_COLORS = [
  { bar: '#F97316' }, { bar: '#3B82F6' }, { bar: '#10B981' },
  { bar: '#EC4899' }, { bar: '#8B5CF6' }, { bar: '#F59E0B' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  // เก็บข้อมูล insight ทั้งหมดที่ใช้แสดงบน dashboard (อ่านค่า: บรรทัด 109, 110, 112, 116, 118, 133, 135, 136, 137, 491, 589, 592, 612, 613, 679, 683, 687, 694, 730, 735, 809, 825, 835; อัปเดต: บรรทัด 92, 96)
  const [data, setData] = useState<InsightsData | null>(null);
  // เก็บช่วงเวลาที่เลือกบน dashboard เช่น day, month, year, all (อ่านค่า: บรรทัด 77, 78, 79, 81, 86, 87, 98, 173, 174, 175, 177, 181, 184, 187, 191, 196, 199, 202, 210, 211, 212, 215, 216, 217, 219, 221, 228, 229, 254, 256, 309, 311, 313, 337; อัปเดต: บรรทัด 336)
  const [period, setPeriod] = useState<Period>('day');
  // เก็บโหมดแสดงผลของ brand ระหว่าง volume และ issues (อ่านค่า: บรรทัด 642, 645, 654, 664, 674, 727; อัปเดต: บรรทัด 652, 662)
  const [brandView, setBrandView] = useState<BrandView>('volume');
  // เก็บ brand ที่ถูกเลือกเพื่อดู issue รายละเอียด (อ่านค่า: บรรทัด 136, 137, 737, 757, 760, 780, 785; อัปเดต: บรรทัด 93, 741)
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);

  // ===== date selection per period =====
  const todayISO   = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
  const monthISO   = todayISO.slice(0, 7);                    // YYYY-MM
  const yearStr    = todayISO.slice(0, 4);                    // YYYY
  // เก็บวันที่ที่เลือกเมื่อ period เป็น day (อ่านค่า: บรรทัด 77, 81, 173, 177, 218, 223; อัปเดต: บรรทัด 198, 210, 228)
  const [selectedDay,   setSelectedDay]   = useState<string>(todayISO);
  // เก็บเดือนที่เลือกเมื่อ period เป็น month (อ่านค่า: บรรทัด 78, 81, 174, 177, 220; อัปเดต: บรรทัด 201, 211, 229)
  const [selectedMonth, setSelectedMonth] = useState<string>(monthISO);
  // เก็บปีที่เลือกเมื่อ period เป็น year (อ่านค่า: บรรทัด 80, 81, 175, 176, 177, 222; อัปเดต: บรรทัด 204, 212, 230)
  const [selectedYear,  setSelectedYear]  = useState<string>(yearStr);

  // ค่า date ที่จะส่งไป backend ตาม period
  // คำนวณค่า date ที่ต้องส่งให้ backend ตาม period ที่เลือก (ถูกใช้ที่บรรทัด 87, 98, 256)
  const currentDateParam = useMemo(() => {
    if (period === 'day')   return selectedDay;
    if (period === 'month') return selectedMonth;
    if (period === 'all')   return '';
    return selectedYear;
  }, [period, selectedDay, selectedMonth, selectedYear]);

  // API: ดึงข้อมูล dashboard insight จาก backend ตาม period/date ปัจจุบัน (ถูกเรียกใช้ที่บรรทัด 102)
  const fetchAll = useCallback(async () => {
    try {
      const params = new URLSearchParams({ period });
      if (period !== 'all') params.set('date', currentDateParam);
      const insightsUrl = `${API_BASE}/api/v1/dashboard/insights?${params.toString()}`;
      const insightsRes = await fetch(insightsUrl);
      if (insightsRes.ok) {
        const d: InsightsData = await insightsRes.json();
        setData(d);
        setSelectedBrand((current) => current || d.brand_volume[0]?.brand || null);
      }
    } catch {
      setData(null);
    }
  }, [period, currentDateParam]);

  // Effect: ดึงข้อมูล dashboard ใหม่เมื่อ period หรือค่า date ที่เลือกเปลี่ยน
  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAll]);

  const T = 'text-slate-800 dark:text-slate-100';
  const S2 = 'text-slate-400 dark:text-slate-500';

  const kpi = data?.kpi;
  const sentiments = data?.sentiment_distribution || { positive: 0, neutral: 0, negative: 0 };
  const sentimentTotal = sentiments.positive + sentiments.neutral + sentiments.negative;
  const topicTotal = useMemo(() => data?.topic_distribution.reduce((s, t) => s + t.count, 0) || 0, [data]);

  // คำนวณ segment ของ donut chart จาก topic distribution (ถูกเรียกใช้ที่บรรทัด 501, 526)
  const donutSegments = useMemo(() => {
    if (!data || topicTotal === 0) return [];
    let cumulative = 0;
    return data.topic_distribution.slice(0, 8).map((t, i) => {
      const pct = t.count / topicTotal;
      const dash = Math.max(pct * DONUT_CIRCUMFERENCE, 0.01);
      const offset = -cumulative * DONUT_CIRCUMFERENCE;
      cumulative += pct;
      return {
        dash,
        gap: Math.max(DONUT_CIRCUMFERENCE - dash, 0),
        offset,
        color: TOPIC_COLORS[i % TOPIC_COLORS.length],
        topic: t.topic,
        count: t.count,
        percentage: t.percentage,
      };
    });
  }, [data, topicTotal]);

  const topKeyword = data?.keyword_frequency[0];
  const currentBrandIssues = selectedBrand && data?.brand_issues[selectedBrand]
    ? data.brand_issues[selectedBrand]
    : [];
  const brandIssuesTotal = currentBrandIssues.reduce((s, it) => s + it.count, 0);

  // คืนค่า class สีของคะแนน QA ตามช่วงคะแนน (ถูกเรียกใช้ที่บรรทัด 859)
  const qaColor = (qa: number | null) => {
    if (qa === null) return S2;
    if (qa >= 8) return 'text-emerald-600 dark:text-emerald-400';
    if (qa >= 6) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-500';
  };
  // คืนค่า class สีของคะแนน CSAT ตามช่วงคะแนน (ถูกเรียกใช้ที่บรรทัด 867)
  const csatColor = (c: number | null) => {
    if (c === null) return S2;
    if (c >= 4) return 'text-emerald-600 dark:text-emerald-400';
    if (c >= 3) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-500';
  };

  // แปลง Date เป็น YYYY-MM-DD สำหรับ input type date (ถูกเรียกใช้ที่บรรทัด 198)
  const formatDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // แปลง Date เป็น YYYY-MM สำหรับ input type month (ถูกเรียกใช้ที่บรรทัด 201)
  const formatMonthInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  // แปลงค่าช่วงเวลาที่เลือกให้เป็น Date object สำหรับแสดงผล/เลื่อนช่วงเวลา (ถูกใช้ที่บรรทัด 182, 185, 188, 195, 310, 312, 314)
  const selectedPeriodDate = useMemo(() => {
    if (period === 'day') return new Date(`${selectedDay}T00:00:00`);
    if (period === 'month') return new Date(`${selectedMonth}-01T00:00:00`);
    if (period === 'all') return new Date(`${selectedYear}-01-01T00:00:00`);
    return new Date(`${selectedYear}-01-01T00:00:00`);
  }, [period, selectedDay, selectedMonth, selectedYear]);

  // สร้าง label วันที่/เดือน/ปี/ทั้งหมดที่แสดงบนปุ่มเลือกช่วงเวลา (ถูกเรียกใช้ที่บรรทัด 318, 363)
  const dateLabel = useMemo(() => {
    if (period === 'day') {
      return selectedPeriodDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    }
    if (period === 'month') {
      return selectedPeriodDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (period === 'year') {
      return selectedPeriodDate.toLocaleDateString('en-US', { year: 'numeric' });
    }
    return 'All Time';
  }, [period, selectedPeriodDate]);

  // Handle: เลื่อนช่วงเวลาไปก่อนหน้า/ถัดไปตาม period ที่เลือก (ถูกเรียกใช้ที่บรรทัด 345, 364)
  const moveDate = (direction: -1 | 1) => {
    const next = new Date(selectedPeriodDate);
    if (period === 'day') {
      next.setDate(next.getDate() + direction);
      setSelectedDay(formatDateInput(next));
    } else if (period === 'month') {
      next.setMonth(next.getMonth() + direction);
      setSelectedMonth(formatMonthInput(next));
    } else if (period === 'year') {
      next.setFullYear(next.getFullYear() + direction);
      setSelectedYear(String(next.getFullYear()));
    }
  };

  // Handle: รีเซ็ตช่วงเวลาที่เลือกกลับเป็นวัน/เดือน/ปีปัจจุบัน (ถูกเรียกใช้ที่บรรทัด 368)
  const resetCurrentPeriod = () => {
    if (period === 'day') setSelectedDay(todayISO);
    else if (period === 'month') setSelectedMonth(monthISO);
    else if (period === 'year') setSelectedYear(yearStr);
  };

  const datePickerId = `dashboard-date-picker-${period}`;
  const datePickerType = period === 'month' ? 'month' : 'date';
  const datePickerValue = period === 'day'
    ? selectedDay
    : period === 'month'
      ? selectedMonth
      : period === 'year'
        ? `${selectedYear}-01-01`
        : selectedDay;

  // Handle: รับค่าจาก date picker แล้วอัปเดต state ให้ตรงกับ period (ถูกเรียกใช้ที่บรรทัด 359)
  const handleDatePickerChange = (value: string) => {
    if (!value) return;
    if (period === 'day') setSelectedDay(value);
    else if (period === 'month') setSelectedMonth(value);
    else setSelectedYear(value.slice(0, 4));
  };

  // Handle: เปิด native date picker เมื่อกดปุ่มไอคอนปฏิทิน (ถูกเรียกใช้ที่บรรทัด 348)
  const openDatePicker = () => {
    const picker = datePickerRef.current;
    if (!picker) return;
    const pickerWithShowPicker = picker as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerWithShowPicker.showPicker === 'function') {
      try {
        pickerWithShowPicker.showPicker();
        return;
      } catch {
        picker.focus();
        return;
      }
    }
    picker.focus();
  };

  // Handle: export รายงาน Agent Performance ตาม period/date ปัจจุบัน (ถูกเรียกใช้ที่บรรทัด 377)
  const handleExport = () => {
    const params = new URLSearchParams({
      format: 'xlsx',
      period,
    });
    if (period !== 'all') params.set('date', currentDateParam);
    window.open(`${API_BASE}/api/v1/dashboard/export-agents?${params.toString()}`, '_blank');
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden"> {/* Layout หลักของ Dashboard: sidebar ซ้าย + content ขวา */}
      {/* Sidebar เมนูนำทางหลักของระบบ */}<Sidebar />
      <main className="flex-1 p-6 overflow-auto"> {/* พื้นที่ scroll ของหน้า Dashboard */}
        <div className="max-w-full mx-auto"> {/* container รวม content ทั้งหมดของ dashboard */}

          {/* Header */}
          <div className="mb-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end"> {/* Header: ชื่อหน้า, วันที่สรุป, และชุดปุ่มควบคุมด้านขวา */}
            <PageHeader
              eyebrow="Backend Analysis"
              title="Voice Analytics Dashboard"
              description={`สรุปข้อมูลการวิเคราะห์เสียงและคุณภาพการสนทนา (${dateLabel})`}
              icon={FileAudio}
            />

            {/* ขวาบน: Period + Date */}
            <div className="flex flex-wrap items-center gap-3 md:justify-end"> {/* Control bar: เลือกช่วงเวลา, ปฏิทิน, refresh, export */}

              {/* Period Pills */}
              <div className="flex h-10 bg-white border border-slate-200 rounded-xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] overflow-hidden text-[13px]">
                {([
                  { v: 'day' as const, label: 'Day' },
                  { v: 'month' as const, label: 'Month' },
                  { v: 'year' as const, label: 'Year' },
                  { v: 'all' as const, label: 'All' },
                ]).map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => setPeriod(opt.v)}
                    className={`px-4 font-bold transition-colors cursor-pointer ${period === opt.v ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'} ${opt.v !== 'all' ? 'border-r border-slate-100' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="relative flex h-10 min-w-[224px] items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
                <button onClick={() => moveDate(-1)} className="px-1.5 py-1 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer font-bold">-</button>
                <label
                  htmlFor={datePickerId}
                  onClick={openDatePicker}
                  className="dashboard-date-picker-trigger flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-slate-200/80 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/90 dark:text-slate-900 dark:ring-white/70 dark:hover:bg-white"
                  title="Select date"
                >
                  <Calendar size={16} strokeWidth={2.4} />
                </label>
                <input
                  ref={datePickerRef}
                  id={datePickerId}
                  type={datePickerType}
                  value={datePickerValue}
                  onChange={(e) => handleDatePickerChange(e.target.value)}
                  className="pointer-events-none absolute h-px w-px opacity-0"
                  aria-label="Select dashboard date"
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-100 min-w-[140px] text-center">{dateLabel}</span>
                <button onClick={() => moveDate(1)} className="px-1.5 py-1 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer font-bold">+</button>
              </div>

              <button
                onClick={() => resetCurrentPeriod()}
                className="flex items-center justify-center w-10 h-10 bg-white border border-slate-200 rounded-xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover:bg-indigo-50 transition-colors cursor-pointer text-slate-400 hover:text-indigo-600"
                title="Current Period"
              >
                <RefreshCw size={18} />
              </button>

              {isAdmin && (
                <button
                  onClick={handleExport}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:!bg-white dark:!text-slate-900 dark:!border-transparent dark:hover:!bg-slate-100 dark:hover:!text-indigo-600 cursor-pointer"
                >
                  <Download size={16} strokeWidth={2.4} />
                  Export
                </button>
              )}
            </div>
          </div>

          {/* Row 1: KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"> {/* KPI cards: สรุปจำนวนไฟล์, QA, CSAT และ high risk */}
            {[
              { label: 'Total',       value: kpi?.total_files || 0, icon: (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/total.png" alt="Total Files" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
              ) },
              { label: 'Analyzed',    value: kpi?.analyzed || 0,    icon: <CheckCircle2 size={30} strokeWidth={2} className="text-[#10B981] drop-shadow-[0_2px_8px_rgba(16,185,129,0.35)] transition-transform duration-500 group-hover:scale-110" /> },
              { label: 'Processing',  value: kpi?.processing || 0,  icon: (
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-[#FFE8B8] bg-[#FFF8EA] text-[#F59E0B] shadow-[0_8px_22px_-14px_rgba(245,158,11,0.9)]">
                  <RefreshCw size={25} strokeWidth={2.7} className="animate-spin [animation-duration:2.6s]" />
                </div>
              ) },
              { label: 'Failed',      value: kpi?.failed || 0,      icon: <AlertTriangle size={30} strokeWidth={2} className="text-[#EF4444] drop-shadow-[0_2px_8px_rgba(239,68,68,0.35)] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12" /> },
            ].map((card) => (
              <div key={card.label} className="group bg-white dark:bg-slate-800 rounded-[24px] p-6 flex items-center gap-5 shadow-[0_2px_15px_-3px_rgba(6,81,237,0.06)] border border-slate-100/80 dark:border-slate-700 transition-all duration-300 hover:shadow-[0_10px_30px_-5px_rgba(6,81,237,0.12)] hover:-translate-y-1">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-white dark:bg-slate-900 shadow-[0_4px_20px_-3px_rgba(6,81,237,0.08)] ring-1 ring-slate-100/50 dark:ring-slate-700 transition-all duration-300 group-hover:shadow-[0_6px_25px_-2px_rgba(6,81,237,0.15)] group-hover:ring-blue-100/50">
                  {card.icon}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{card.label}</p>
                  <h3 className="text-[28px] font-black text-slate-800 dark:text-slate-100 leading-none tracking-tight">{card.value}</h3>
                </div>
              </div>
            ))}
          </div>

          {/* Second Row: Distributions */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-5"> {/* แถวกราฟ: sentiment distribution และ topic distribution */}

            {/* Sentiment Distribution */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 dark:border-slate-700 lg:col-span-3"> {/* กราฟแท่ง sentiment: positive/neutral/negative จากไฟล์ทั้งหมด */}
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 shadow-sm"></div>
                  Sentiment Analysis Distribution
                </h3>
                <MoreHorizontal className="text-slate-400" size={20} />
              </div>

              <div className="space-y-4">
                {[
                  { label: 'Positive', count: sentiments.positive, icon: Smile },
                  { label: 'Neutral', count: sentiments.neutral, icon: Meh },
                  { label: 'Negative', count: sentiments.negative, icon: Frown },
                ].map((item, i) => {
                  let barColor = '';
                  let textColor = '';
                  let bgColor = '';
                  if (item.label === 'Positive') {
                    barColor = 'bg-emerald-500';
                    textColor = 'text-emerald-500';
                    bgColor = 'bg-emerald-50 dark:bg-emerald-900/20';
                  } else if (item.label === 'Negative') {
                    barColor = 'bg-red-500';
                    textColor = 'text-red-500';
                    bgColor = 'bg-red-50 dark:bg-red-900/20';
                  } else {
                    barColor = 'bg-[#54657E]';
                    textColor = 'text-[#54657E]';
                    bgColor = 'bg-slate-100/60 dark:bg-slate-700';
                  }

                  const Icon = item.icon;
                  const percentage = sentimentTotal > 0 ? (item.count / sentimentTotal) * 100 : 0;
                  const barWidth = item.count > 0 ? Math.max(percentage, 5) : 0;

                  return (
                    <div key={i} className="flex items-center gap-4">
                      <div className="flex flex-col items-center justify-center w-16">
                        <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center bg-white dark:bg-slate-900 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] mb-1">
                          <Icon size={18} className={textColor} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{item.label}</span>
                      </div>

                      <div className="flex-1 flex items-center pb-3">
                        <div className={`w-full ${bgColor} rounded-lg h-8 relative flex items-center`}>
                          <div
                            className={`${barColor} h-full rounded-lg transition-all duration-700 flex items-center ${item.count > 0 ? 'min-w-[2rem] px-4' : 'px-0'} shadow-sm`}
                            style={{ width: `${barWidth}%` }}
                          >
                            {item.count > 0 && <span className="text-sm font-bold text-white z-10">{item.count}</span>}
                          </div>
                          {item.count === 0 && <span className={`absolute left-4 text-sm font-bold ${textColor} z-10`}>{item.count}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Topic Distribution */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 dark:border-slate-700 lg:col-span-2"> {/* Donut chart topic distribution และรายการ topic ที่คลิกไปหน้า Files ได้ */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800 dark:text-slate-100">
                    <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-purple-500 to-pink-600 shadow-sm"></div>
                    Topic Distribution
                  </h3>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">กดหัวข้อเพื่อดูไฟล์ที่อยู่ในกลุ่มนั้น</p>
                </div>
                <div className="shrink-0 rounded-full border border-purple-100 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 text-xs font-bold text-purple-700 dark:text-purple-300">
                  {data?.topic_distribution.length || 0} Topics
                </div>
              </div>

              {topicTotal > 0 ? (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-[155px_minmax(0,1fr)]">
                    <div className="relative flex h-[170px] items-center justify-center">
                      <svg width="170" height="170" viewBox="0 0 120 120" className="origin-center animate-[spin_900ms_ease-out]">
                        <circle cx="60" cy="60" r={DONUT_RADIUS} fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-700" strokeWidth="18" />
                        {donutSegments.map((seg, i) => (
                          <circle
                            key={i}
                            cx="60"
                            cy="60"
                            r={DONUT_RADIUS}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="18"
                            strokeDasharray={`${seg.dash} ${seg.gap}`}
                            strokeDashoffset={seg.offset}
                            strokeLinecap="butt"
                            transform="rotate(-90 60 60)"
                          />
                        ))}
                      </svg>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-base font-black leading-none text-slate-800 dark:text-slate-100">{topicTotal}</div>
                          <div className="mt-1 text-[10px] font-semibold leading-none text-slate-400 dark:text-slate-500">Files</div>
                        </div>
                      </div>
                    </div>

                    <div className="max-h-[205px] space-y-1.5 overflow-y-auto pr-1">
                      {donutSegments.map((seg, i) => {
                        const percentage = topicTotal > 0 ? Math.round((seg.count / topicTotal) * 100) : 0;

                        return (
                          <button
                            key={i}
                            type="button"
                            suppressHydrationWarning
                            onClick={() => router.push(`/files?topic=${encodeURIComponent(seg.topic)}`)}
                            className="group w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/60"
                            title={`ดูไฟล์ที่มี topic: ${seg.topic}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }}></span>
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">
                                {seg.topic}
                              </span>
                              <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-200">
                                {seg.count} files
                              </span>
                              <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                                {percentage}%
                              </span>
                            </div>
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.max(percentage, 4)}%`, backgroundColor: seg.color }}
                              ></div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-3">
                    <div className="flex items-center justify-center py-5 text-center text-xs font-medium text-slate-400 dark:text-slate-500">
                      เลือกหัวข้อด้านบนเพื่อไปดูไฟล์ที่อยู่ในหัวข้อนั้น
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-[260px] items-center justify-center text-sm text-slate-400 dark:text-slate-500">No Data</div>
              )}
            </div>
          </div>

          {/* Row 3: Keyword Frequency (Top 10) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 shadow-[0_2px_15px_-3px_rgba(6,81,237,0.08)] border border-slate-100 dark:border-slate-700 mb-5"> {/* Keyword intelligence: แสดง keyword ที่เจอบ่อยและ keyword อันดับหนึ่ง */}
            <div className="flex items-center gap-4 mb-8">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_4px_15px_-3px_rgba(6,81,237,0.1)] ring-1 ring-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/iconkey.png" alt="Keyword Frequency" className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Keyword Frequency (Top 10)</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">แสดง 10 คำที่ถูกกล่าวถึงมากที่สุดในช่วงเวลาที่เลือก</p>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-10">
              <div className="flex-1 space-y-5 py-2">
                {(data?.keyword_frequency || []).length === 0 ? (
                  <p className={`text-xs ${S2} text-center py-8`}>ไม่มีข้อมูล keywords</p>
                ) : (
                  data!.keyword_frequency.map((kw, i) => (
                    <div key={kw.keyword} className="flex items-center gap-4">
                      <span className="w-6 text-center text-[13px] font-bold text-blue-500">{i + 1}</span>
                      <span className="w-32 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{kw.keyword}</span>
                      <div className="flex-1 flex items-center">
                        <div className="w-full bg-slate-50 dark:bg-slate-700 rounded-full h-3.5">
                          <div
                            className="bg-[#4a85f6] h-3.5 rounded-full transition-all duration-1000"
                            style={{ width: `${Math.max(kw.percentage, 2)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-12 text-right text-sm font-bold text-[#4a85f6]">{kw.percentage}%</span>
                    </div>
                  ))
                )}
              </div>

              <div className="w-full lg:w-72 bg-gradient-to-b from-[#f8faff] dark:from-blue-900/10 to-white dark:to-slate-800 rounded-[24px] p-6 border border-blue-50 dark:border-blue-900/30 flex flex-col items-center justify-center text-center relative overflow-hidden shrink-0 shadow-[0_4px_20px_-4px_rgba(74,133,246,0.05)]">
                {/* Decorative background curves */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNDQwIDMyMCI+PHBhdGggZmlsbD0iI2YxZjZmZiIgZmlsbC1vcGFjaXR5PSIxIiBkPSJNMCAyMjRsMTIwLTUuM2MxMjAtNS4zIDM2MC0xNiA2MDAtNS40IDIzOSAxMC43IDQ4MCA0Mi43IDYwMCA1OC43bDEyMCAxNnY5NkgwaHoiPjwvcGF0aD48L3N2Zz4=')] bg-cover bg-bottom opacity-70"></div>
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNDQwIDMyMCI+PHBhdGggZmlsbD0iI2U1ZjBwdIiIGZpbGwtb3BhY2l0eT0iMC42IiBkPSJNMCAxNjBsMTIwIDUuM2MxMjAgNS4zIDM2MCAxNiA2MDAgNS40IDIzOS0xMC43IDQ4MC00Mi43IDYwMC01OC43bDEyMC0xNnYxOTJIMHoiPjwvcGF0aD48L3N2Zz4=')] bg-cover bg-bottom"></div>

                <div className="h-20 w-20 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-[0_8px_30px_rgba(74,133,246,0.15)] relative z-10 border border-blue-50 dark:border-blue-900/30">
                  <div className="h-14 w-14 bg-blue-50 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
                    <Lightbulb size={28} className="text-[#4a85f6] fill-[#4a85f6]/20" strokeWidth={1.5} />
                  </div>
                </div>

                <span className="text-[11px] font-bold text-[#4a85f6] bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-900/50 px-4 py-1.5 rounded-full mb-6 relative z-10 shadow-sm">Key Insight</span>

                {topKeyword ? (
                  <p className="text-[15px] font-medium text-slate-600 dark:text-slate-300 leading-[1.8] relative z-10">
                    คำว่า <span className="font-bold text-[#4a85f6] text-[17px]">&quot;{topKeyword.keyword}&quot;</span><br />
                    ถูกกล่าวถึงมากที่สุด<br />
                    คิดเป็น <span className="font-bold text-[#4a85f6] text-xl">{topKeyword.percentage}%</span> ของทั้งหมด
                  </p>
                ) : (
                  <p className={`text-xs ${S2} relative z-10`}>ยังไม่มี keyword ที่บ่งชี้</p>
                )}
              </div>
            </div>
          </div>

          {/* Row 4: Find by Brand / Brand Issues */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 dark:border-slate-700/50 mb-6"> {/* Brand analytics: สลับดู volume หรือ issue breakdown ของแต่ละ brand */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-orange-400 to-amber-500 shadow-sm"></div>
                  {brandView === 'volume' ? 'Find by Brand' : 'Brand Issues'}
                </h3>
                <p className="mt-1 text-xs text-slate-400 ml-3.5">
                  {brandView === 'volume'
                    ? 'ดูว่าแบรนด์ไหนถูกโทรมาบ่อยที่สุด'
                    : 'หัวข้อปัญหาที่พบบ่อยของแต่ละแบรนด์'}
                </p>
              </div>
              <div className="flex bg-slate-50 border border-slate-100 dark:bg-slate-900/50 dark:border-slate-700 p-1 rounded-xl shadow-sm">
                <button
                  onClick={() => setBrandView('volume')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all duration-300 ${
                    brandView === 'volume'
                      ? 'bg-white dark:bg-slate-700 text-orange-500 shadow-[0_2px_8px_-2px_rgba(249,115,22,0.2)]'
                      : `text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 dark:hover:bg-slate-800`
                  }`}
                >
                  Find by Brand
                </button>
                <button
                  onClick={() => setBrandView('issues')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all duration-300 ${
                    brandView === 'issues'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-[0_2px_8px_-2px_rgba(37,99,235,0.2)]'
                      : `text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 dark:hover:bg-slate-800`
                  }`}
                >
                  Brand Issues
                </button>
              </div>
            </div>

            {brandView === 'volume' && (
              <>
                <div className="flex items-center gap-3 mt-4 mb-6">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-xs font-bold border border-orange-100 dark:border-orange-800/30">
                    <Tag size={13} />
                    {data?.brand_volume.length || 0} Brands
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-600">
                    <FileAudio size={13} />
                    {data?.brand_volume.reduce((s, b) => s + b.count, 0) || 0} Files
                  </span>
                </div>

                {(data?.brand_volume || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 bg-slate-50/50 dark:bg-slate-900/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                    <Tag className="text-slate-300 mb-2" size={32} />
                    <p className={`text-xs ${S2}`}>ยังไม่มีข้อมูลแบรนด์</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data!.brand_volume.map((b, i) => {
                      const c = BRAND_COLORS[i % BRAND_COLORS.length];
                      return (
                        <div key={b.brand} className="group bg-slate-50/50 dark:bg-slate-900/30 rounded-xl p-5 border border-slate-100 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.05)] hover:border-slate-200 dark:hover:border-slate-600 transition-all duration-300">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0">
                                <span className={`text-[10px] font-bold text-slate-400 group-hover:text-amber-500 transition-colors`}>
                                  {(i + 1).toString().padStart(2, '0')}
                                </span>
                              </div>
                              <span className={`text-[14px] font-bold tracking-wider ${T} uppercase truncate`}>{b.brand}</span>
                            </div>
                            <div className="text-right">
                              <p className={`text-2xl font-black text-slate-800 dark:text-slate-100 leading-none`}>{b.count}</p>
                              <p className={`text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-widest`}>files</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[11px] text-slate-500 font-medium">Of visible recordings</p>
                            <p className="text-[11px] font-bold" style={{ color: c.bar }}>{b.percentage}%</p>
                          </div>
                          <div className="h-2 bg-slate-200/70 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                            <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${b.percentage}%`, backgroundColor: c.bar }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {brandView === 'issues' && (
              <>
                <div className="flex items-center gap-2 flex-wrap mt-2 mb-6">
                  {(data?.brand_volume || []).length === 0 ? (
                    <div className="w-full py-4 text-center">
                      <p className={`text-xs ${S2}`}>ยังไม่มีข้อมูลแบรนด์</p>
                    </div>
                  ) : (
                    data!.brand_volume.map((b, i) => {
                      const c = BRAND_COLORS[i % BRAND_COLORS.length];
                      const isSelected = selectedBrand === b.brand;
                      return (
                        <button
                          key={b.brand}
                          onClick={() => setSelectedBrand(b.brand)}
                          className={`px-4 py-2 text-[12px] font-bold rounded-full border cursor-pointer transition-all duration-300 shadow-sm ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle shadow-sm" style={{ backgroundColor: c.bar }} />
                          {b.brand}
                          <span className="ml-1.5 opacity-60 text-[11px]">({b.count})</span>
                        </button>
                      );
                    })
                  )}
                </div>

                {selectedBrand && currentBrandIssues.length > 0 ? (
                  <div className="bg-slate-50/70 dark:bg-slate-900/30 rounded-[20px] p-6 border border-slate-100 dark:border-slate-700/50">
                    <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-200 dark:border-slate-700/70">
                      <p className={`text-sm font-bold ${T}`}>หัวข้อปัญหาที่พบบ่อยของ <span className="text-blue-600 dark:text-blue-400 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 ml-1">{selectedBrand}</span></p>
                      <span className="text-[11px] font-bold text-slate-500 bg-white dark:bg-slate-800 px-3 py-1 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">Top {currentBrandIssues.length}</span>
                    </div>
                    <div className="space-y-4 px-2">
                      {currentBrandIssues.map((issue, i) => {
                        const pct = brandIssuesTotal > 0 ? Math.round((issue.count / brandIssuesTotal) * 100) : 0;
                        return (
                          <div key={i} className="group flex items-center gap-4">
                            <span className="w-6 h-6 rounded-full bg-slate-200/50 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">{i + 1}</span>
                            <span className={`text-[13px] font-medium ${T} w-1/4 min-w-[120px] truncate shrink-0`}>{issue.topic}</span>
                            <div className="flex-1 h-2.5 bg-slate-200/70 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.max(pct, 3)}%` }} />
                            </div>
                            <span className={`text-[12px] font-bold text-slate-700 dark:text-slate-200 w-16 text-right`}>{issue.count} ครั้ง</span>
                            <span className="text-[11px] font-bold text-blue-500 w-12 text-right bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded aspect-auto">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : selectedBrand ? (
                  <div className="bg-slate-50/50 dark:bg-slate-900/30 rounded-[20px] py-12 border border-slate-100 dark:border-slate-700/50 text-center">
                    <div className="w-12 h-12 bg-slate-200/50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                      <AlertCircle size={24} className="text-slate-400" />
                    </div>
                    <p className={`text-sm ${S2}`}>ไม่มีข้อมูล topic ของแบรนด์ <span className="font-bold text-slate-700 dark:text-slate-300">{selectedBrand}</span></p>
                  </div>
                ) : (
                  <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-[20px]">
                    <p className={`text-sm ${S2}`}>เลือกแบรนด์ด้านบนเพื่อดูหัวข้อปัญหา</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Row 5: Agent Performance — ★ เฉพาะ ADMIN เห็น */}
          {isAdmin && (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 dark:border-slate-700/50 mb-6 overflow-hidden"> {/* Agent performance table: คะแนนและ sentiment แยกตาม agent */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-blue-400 to-indigo-500 shadow-sm"></div>
                  Agent Performance
                </h3>
                <p className="mt-1 text-xs text-slate-400 ml-3.5">คะแนน QA, CSAT และ sentiment ของแต่ละ Agent · กดเพื่อดูรายละเอียด</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 rounded-full">
                <UserRound size={13} strokeWidth={2.6} />
                {data?.agent_performance.length || 0} Agents
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-700/50">
                    <th className="p-4 pl-6 font-semibold">Agent</th>
                    <th className="p-4 text-center font-semibold">Calls</th>
                    <th className="p-4 text-center font-semibold">QA</th>
                    <th className="p-4 text-center font-semibold">CSAT</th>
                    <th className="p-4 text-center font-semibold">Sentiment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {(data?.agent_performance || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-700">
                          <UserRound size={24} strokeWidth={2.6} className="text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">ยังไม่มีข้อมูล agent</p>
                      </td>
                    </tr>
                  ) : (
                    data!.agent_performance.map((a) => (
                      <tr
                        key={a.agent_id}
                        onClick={() => router.push(`/agents/${a.agent_id}`)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors group"
                      >
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center text-[#54657E] dark:text-slate-400 shrink-0 shadow-inner">
                              <UserRound size={22} strokeWidth={2.7} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {a.full_name || a.agent_id}
                              </p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{a.agent_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-3 py-1 rounded-md border border-slate-100 dark:border-slate-700">
                            {a.total_calls}
                          </span>
                        </td>
                        <td className={`p-4 text-center text-[15px] font-bold ${qaColor(a.avg_qa)}`}>
                          {a.avg_qa !== null ? (
                            <div className="flex items-baseline justify-center">
                              {a.avg_qa}
                              <span className="text-[10px] font-semibold opacity-50 ml-0.5">/10</span>
                            </div>
                          ) : '-'}
                        </td>
                        <td className={`p-4 text-center text-[15px] font-bold ${csatColor(a.avg_csat)}`}>
                          {a.avg_csat !== null ? (
                            <div className="flex items-baseline justify-center">
                              {a.avg_csat}
                              <span className="text-[10px] font-semibold opacity-50 ml-0.5">/5</span>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-3 text-[11px] font-mono">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-800/30" title="Positive">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              {a.positive_calls}
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50" title="Neutral">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              {a.neutral_calls}
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border border-red-100/50 dark:border-red-800/30" title="Negative">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                              {a.negative_calls}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

        </div>
      </main>
    </div>
  );
}
