'use client';

import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { AudioWaveform, Sparkles, MessageCircle, Info, Lightbulb, RefreshCw, Trash2, ArrowLeft, Play, Pause, AlertCircle, Loader2, SkipBack, SkipForward, ExternalLink, Tag, ShieldCheck } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Whisper segment format (มี start/end เป็นวินาที)
interface TranscriptionSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
  // Llama fallback fields
  speaker?: string;
  time?: string;
}

interface AnalysisData {
  analysis_id: string;
  file_id: string;
  agent_id: string;
  agent_name: string;
  phone_number_used: string;
  call_duration_seconds: number;
  audio_duration_seconds: number;
  call_timestamp: string;
  brand_name: string;
  brand_names: string[];
  product_category: string;
  sale_channel: string;
  csat_score: number;
  intent: string;
  qa_score: number;
  sentiment: string;
  sentiment_score: number;
  summary: string;
  summary_points: string[];
  transcription: TranscriptionSegment[];
  key_insights: string;
  keywords: string[];
  created_at: string;
}

interface FileData {
  file_id: string;
  original_filename: string;
  customer_phone: string;
  agent_id: string;
  agent_name: string;
  call_direction: string;
  call_date: string;
  call_duration_seconds: number;
}

export default function FileAnalysisDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useParams();
  const fileId = params.id as string;

  // เก็บข้อมูล metadata ของไฟล์เสียง (อ่านค่า: บรรทัด 111, 112, 135, 324, 363, 391, 408, 699, 711, 814, 816, 818, 822, 840, 841, 842; อัปเดต: บรรทัด 120, 159)
  const [fileData, setFileData] = useState<FileData | null>(null);
  // เก็บผลวิเคราะห์ AI ของไฟล์เสียง (อ่านค่า: บรรทัด 111, 121, 122, 135, 160, 286, 287, 288, 339, 388, 439, 459, 460, 464, 465, 490, 493, 496, 509, 510, 542, 554, 557, 577, 583, 584, 711, 719, 727, 728, 732, 758, 814, 840, 841, 842, 849, 850, 851, 852, 857, 865, 870, 875, 880, 886, 887; อัปเดต: บรรทัด 122, 160)
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  // เก็บสถานะโหลดรายละเอียดไฟล์ (อ่านค่า: บรรทัด 310; อัปเดต: บรรทัด 153, 166)
  const [loading, setLoading] = useState(true);
  // เก็บสถานะกำลังวิเคราะห์หรือ re-analyze ไฟล์ (อ่านค่า: บรรทัด 371, 374, 375, 390, 394, 416, 429, 441, 442; อัปเดต: บรรทัด 114, 125, 128, 172, 201)
  const [analyzing, setAnalyzing] = useState(false);
  // เก็บข้อความ error ของหน้า file detail (อ่านค่า: บรรทัด 194, 324, 331; อัปเดต: บรรทัด 154, 164, 173, 199, 212)
  const [error, setError] = useState<string | null>(null);
  // เก็บข้อมูลลูกค้าที่ match จากเบอร์โทรในไฟล์ (อ่านค่า: บรรทัด 825, 827, 830, 903, 910, 923; อัปเดต: บรรทัด 123, 161)
  const [matchedCustomer, setMatchedCustomer] = useState<{ customer_id: number; first_name: string; last_name: string } | null>(null);
  // เก็บรายการ warranty ของลูกค้าที่ match ได้ (อ่านค่า: บรรทัด 124, 162, 903, 905, 917, 929; อัปเดต: บรรทัด 124, 162)
  const [warranties, setWarranties] = useState<any[]>([]);

  // Audio state
  // เก็บสถานะเล่น/หยุดของ audio player (อ่านค่า: บรรทัด 242, 247, 255, 679, 736, 737; อัปเดต: บรรทัด 233, 247, 257)
  const [isPlaying, setIsPlaying] = useState(false);
  // เก็บเวลาปัจจุบันของเสียงเพื่อ sync transcript (อ่านค่า: บรรทัด 149, 289, 304, 692, 737; อัปเดต: บรรทัด 230, 254)
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  // เก็บความยาวเสียงทั้งหมดเป็นวินาที (อ่านค่า: บรรทัด 264, 304, 699, 711; อัปเดต: บรรทัด 227)
  const [durationSeconds, setDurationSeconds] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Subtitle auto-scroll
  const activeSegmentRef = useRef<HTMLDivElement | null>(null);
  const transcriptionContainerRef = useRef<HTMLDivElement | null>(null);

  // Effect: โหลดรายละเอียดไฟล์ใหม่เมื่อ fileId เปลี่ยน
  useEffect(() => {
    fetchDetail();
  }, [fileId]);

  // Effect cleanup: หยุดเสียงและเคลียร์ audio object เมื่อออกจากหน้า
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // Effect: poll รายละเอียดไฟล์ทุก 3 วินาที ถ้าไฟล์ยังรอผล analysis
  useEffect(() => {
    if (!fileData || analysis) return;
    const fileStatus = (fileData as any)?.status;
    if (fileStatus === 'processing' || fileStatus === 'ready') {
      setAnalyzing(true);
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/api/v1/audio/detail/${fileId}`);
          if (!res.ok) return;
          const data = await res.json();
          setFileData(data.file);
          if (data.analysis) {
            setAnalysis(data.analysis);
            setMatchedCustomer(data.matched_customer || null);
            setWarranties(data.warranties || []);
            setAnalyzing(false);
            clearInterval(interval);
          } else if (data.file?.status === 'failed') {
            setAnalyzing(false);
            clearInterval(interval);
          }
        } catch {}
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [fileData, analysis, fileId]);

  // Effect: เลื่อน transcript อัตโนมัติให้ subtitle ปัจจุบันอยู่ในมุมมอง
  useEffect(() => {
    if (activeSegmentRef.current && transcriptionContainerRef.current) {
      const container = transcriptionContainerRef.current;
      const element = activeSegmentRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTimeSeconds]);

  // API: ดึงข้อมูลไฟล์, ผลวิเคราะห์, matched customer และ warranty จาก backend (ถูกเรียกใช้ที่บรรทัด 95, 190)
  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/audio/detail/${fileId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFileData(data.file);
      setAnalysis(data.analysis);
      setMatchedCustomer(data.matched_customer || null);
      setWarranties(data.warranties || []);
    } catch (err: any) {
      setError('ไม่สามารถโหลดข้อมูลไฟล์ได้');
    } finally {
      setLoading(false);
    }
  };

  // Handle/API: สั่ง backend เริ่มวิเคราะห์/re-analyze แล้ว poll สถานะจนเสร็จ (ถูกเรียกใช้ที่บรรทัด 370, 415, 428)
  const triggerAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (user?.admin_user_id) params.set('created_by', String(user.admin_user_id));
      const res = await fetch(`${API_BASE}/api/v1/ai/analyze/${fileId}?${params}`, { method: 'POST' });
      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();
      const taskId = data.task_id;

      // Poll สถานะ — รอได้สูงสุด 5 นาที (150 attempts × 2s)
      let attempts = 0;
      while (attempts < 150) {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(`${API_BASE}/api/v1/ai/status/${taskId}`);
        const statusData = await statusRes.json();

        if (statusData.status === 'completed') {
          await fetchDetail(); // โหลดผลใหม่
          break;
        }
        if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'Analysis failed');
        }
        attempts++;
      }
    } catch (err: any) {
      setError('การวิเคราะห์ล้มเหลว: ' + (err.message || ''));
    } finally {
      setAnalyzing(false);
    }
  };

  // Handle/API: ลบไฟล์ปัจจุบันหลังผู้ใช้ยืนยัน และกลับไปหน้า Files (ถูกเรียกใช้ที่บรรทัด 378)
  const handleDelete = async () => {
    if (!confirm('ต้องการลบไฟล์นี้จริงหรือไม่?')) return;
    try {
      await fetch(`${API_BASE}/api/v1/audio/delete/${fileId}`, { method: 'DELETE' });
      router.push('/files');
    } catch {
      setError('ลบไฟล์ไม่สำเร็จ');
    }
  };

  // =============================================================================
  // Audio Player Controls
  // =============================================================================

  // สร้าง/คืนค่า audio object สำหรับเล่นไฟล์เสียง (ถูกเรียกใช้ที่บรรทัด 241, 252, 263, 269)
  const initAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio(`${API_BASE}/api/v1/audio/play/${fileId}`);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setDurationSeconds(audio.duration);
    });
    audio.addEventListener('timeupdate', () => {
      setCurrentTimeSeconds(audio.currentTime);
    });
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
    });

    return audio;
  }, [fileId]);

  // Handle: เล่นหรือ pause ไฟล์เสียงตามสถานะปัจจุบัน (ถูกเรียกใช้ที่บรรทัด 676)
  const togglePlay = () => {
    const audio = initAudio();
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Handle: กระโดดไปยังเวลาที่กำหนดใน audio player (ถูกเรียกใช้ที่บรรทัด 700, 742)
  const seekTo = (seconds: number) => {
    const audio = initAudio();
    audio.currentTime = seconds;
    setCurrentTimeSeconds(seconds);
    if (!isPlaying) {
      audio.play();
      setIsPlaying(true);
    }
  };

  // Handle: ข้ามเสียงไปข้างหน้า 10 วินาที (ถูกเรียกใช้ที่บรรทัด 682)
  const skipForward = () => {
    const audio = initAudio();
    audio.currentTime = Math.min(audio.currentTime + 10, durationSeconds);
  };

  // Handle: ย้อนเสียงกลับ 10 วินาที (ถูกเรียกใช้ที่บรรทัด 669)
  const skipBackward = () => {
    const audio = initAudio();
    audio.currentTime = Math.max(audio.currentTime - 10, 0);
  };

  // =============================================================================
  // Helpers
  // =============================================================================

  // แปลงเวลาเป็นรูปแบบนาที:วินาที สำหรับ audio player (ถูกเรียกใช้ที่บรรทัด 692, 711, 749)
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // หา index ของ transcript segment ที่ตรงกับเวลาปัจจุบันของเสียง (ถูกเรียกใช้ที่บรรทัด 340)
  const getActiveSegmentIndex = (): number => {
    if (!analysis?.transcription) return -1;
    for (let i = analysis.transcription.length - 1; i >= 0; i--) {
      const segStart = typeof analysis.transcription[i].start === 'number' ? analysis.transcription[i].start : 0;
      if (currentTimeSeconds >= segStart) {
        return i;
      }
    }
    return -1;
  };

  // คืนค่า label และ class สีสำหรับ sentiment badge (ถูกเรียกใช้ที่บรรทัด 339)
  const getSentimentBadge = (sentiment: string) => {
    const s = sentiment?.toLowerCase();
    if (s === 'positive') return { label: 'POSITIVE SENTIMENT', color: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' };
    if (s === 'negative') return { label: 'NEGATIVE SENTIMENT', color: 'bg-red-50 text-red-600', dot: 'bg-red-500' };
    return { label: 'NEUTRAL SENTIMENT', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300', dot: 'bg-slate-400 dark:bg-slate-500' };
  };

  const progressPercent = durationSeconds > 0 ? (currentTimeSeconds / durationSeconds) * 100 : 0;

  // =============================================================================
  // Render
  // =============================================================================

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-50 dark:bg-slate-800"> {/* Loading layout ของหน้า File Detail */}
        {/* Sidebar เมนูนำทาง */}<Sidebar />
        <main className="flex-1 flex items-center justify-center"> {/* แสดง spinner ระหว่างโหลดรายละเอียดไฟล์ */}
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">กำลังโหลดข้อมูล...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error && !fileData) {
    return (
      <div className="flex h-screen bg-slate-50 dark:bg-slate-800"> {/* Error layout ของหน้า File Detail */}
        {/* Sidebar เมนูนำทาง */}<Sidebar />
        <main className="flex-1 flex items-center justify-center"> {/* แสดง error และปุ่มย้อนกลับ */}
          <div className="text-center">
            <AlertCircle size={32} className="text-red-500 mx-auto mb-3" />
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600 hover:underline cursor-pointer">กลับหน้าก่อน</button>
          </div>
        </main>
      </div>
    );
  }

  const sentimentBadge = analysis ? getSentimentBadge(analysis.sentiment) : null;
  const activeSegmentIdx = getActiveSegmentIndex();

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden"> {/* Layout หลักหน้า File Detail: sidebar + รายละเอียดไฟล์เสียง */}
      {/* Sidebar เมนูนำทาง */}<Sidebar />
      <main className="flex-1 p-6 overflow-auto"> {/* พื้นที่ scroll ของรายละเอียดไฟล์ */}
        <div className="max-w-7xl mx-auto space-y-6"> {/* container รวม header, analysis, transcript, metadata และ customer info */}
          
          {/* Header: ปุ่ม back, ชื่อไฟล์, ปุ่ม re-analyze และ delete */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
            <div className="flex flex-col items-start">
              <button
                onClick={() => router.push('/files')}
                className="flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors mb-4 cursor-pointer group w-fit -ml-1"
              >
                <ArrowLeft size={18} className="mr-1.5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-[13px] font-bold">Back to Files</span>
              </button>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-800 dark:text-slate-100">
                  <AudioWaveform size={24} />
                </div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight truncate max-w-[500px]">
                  {fileData?.original_filename || 'Unknown File'}
                </h1>
              </div>
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                onClick={triggerAnalysis}
                disabled={analyzing}
                className="flex items-center space-x-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={16} className={`text-slate-400 dark:text-slate-500 ${analyzing ? 'animate-spin' : ''}`} />
                <span>{analyzing ? 'กำลังวิเคราะห์...' : 're-Analyze'}</span>
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center space-x-2 px-4 py-2.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* No Analysis State / Failed State: แสดงสถานะก่อนมีผลวิเคราะห์หรือเมื่อวิเคราะห์ล้มเหลว */}
          {!analysis && (
            <div className={`${
              analyzing ? 'bg-blue-50 dark:bg-blue-900/20 border-slate-100 dark:border-slate-700' :
              (fileData as any)?.status === 'failed' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
              'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            } border rounded-2xl p-8 text-center`}>
              {analyzing ? (
                <>
                  <Loader2 size={40} className="text-blue-600 mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-bold text-blue-800 dark:text-blue-300 mb-2">AI กำลังวิเคราะห์ไฟล์เสียง...</h3>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">Whisper กำลังถอดข้อความ → Llama กำลังวิเคราะห์</p>
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-xs text-blue-500 ml-2">กรุณารอสักครู่ อาจใช้เวลา 15-45 วินาที</span>
                  </div>
                </>
              ) : (fileData as any)?.status === 'failed' ? (
                <>
                  <AlertCircle size={32} className="text-red-500 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-red-800 dark:text-red-300 mb-2">การวิเคราะห์ล้มเหลว</h3>
                  <p className="text-sm text-red-600 dark:text-red-400 mb-1">อาจเกิดจาก Groq API Rate Limit</p>
                  <p className="text-xs text-red-500 dark:text-red-500 mb-4">กรุณารอสักครู่แล้วกดวิเคราะห์ใหม่</p>
                  <button
                    onClick={triggerAnalysis}
                    disabled={analyzing}
                    className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-xl font-bold text-sm cursor-pointer disabled:opacity-50"
                  >
                    วิเคราะห์ใหม่
                  </button>
                </>
              ) : (
                <>
                  <AlertCircle size={32} className="text-amber-500 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-amber-800 dark:text-amber-300 mb-2">ยังไม่ได้วิเคราะห์ไฟล์นี้</h3>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">กดปุ่ม &quot;re-Analyze&quot; เพื่อเริ่มวิเคราะห์ด้วย AI</p>
                  <button
                    onClick={triggerAnalysis}
                    disabled={analyzing}
                    className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-xl font-bold text-sm cursor-pointer disabled:opacity-50"
                  >
                    เริ่มวิเคราะห์ด้วย AI
                  </button>
                </>
              )}
            </div>
          )}

          {analysis && (
            <>
              {/* Re-analyzing banner: แจ้งว่ากำลังวิเคราะห์ใหม่แต่ยังแสดงผลเดิมได้ */}
              {analyzing && (
                <div className="bg-blue-50 border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
                  <Loader2 size={20} className="text-blue-600 animate-spin shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-blue-800">กำลังวิเคราะห์ใหม่...</p>
                    <p className="text-xs text-blue-600">เข้าคิวแล้ว รอประมวลผล ผลเดิมยังแสดงอยู่ด้านล่าง</p>
                  </div>
                </div>
              )}
            <div className="grid grid-cols-3 gap-6"> {/* Grid หลัก: ซ้ายเป็น analysis/transcript ขวาเป็น metadata/customer */}
              {/* Left Column: insight และ audio transcript */}
              <div className="col-span-2 space-y-6">

                {/* ========== Summary Insight: topic, keywords, anomaly, QA/CSAT และ deep insight ========== */}
                {(() => {
                  // Anomaly: sentiment=negative OR qa_score < 5 (เหมือน Dashboard)
                  const isAnomaly =
                    analysis.sentiment?.toLowerCase() === 'negative' ||
                    (typeof analysis.qa_score === 'number' && analysis.qa_score < 5);

                  // แยก key_insights → first line = "ลูกค้าต้องการอะไร", ที่เหลือ = "สิ่งที่ควรทำต่อ"
                  // รองรับทั้งกรณีที่ AI ส่งมาเป็น string ยาว หรือมี action_items แยก
                  const insightText = (analysis.key_insights || '').trim();
                  const actionItems = (analysis as any).action_items || [];

                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                      {/* Header */}
                      <div className="flex items-center space-x-3 mb-1">
                        <Sparkles className="text-slate-800 dark:text-slate-100" size={24} />
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Summary Insight</h2>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 ml-9 mb-1">
                        วิเคราะห์โดย Llama 3.3 จากข้อมูล Speech-to-Text ของ Whisper
                      </p>
                      <p className="text-[11px] text-blue-500 dark:text-blue-400 ml-9 mb-5">
                        จัดรูปแบบจาก transcript และผลวิเคราะห์เดิมเท่านั้น ไม่แก้ไขเสียงหรือผลถอดคำ
                      </p>

                      {/* 3 cards */}
                      <div className="grid grid-cols-3 gap-3">
                        {/* TOPIC/INTENT */}
                        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700 rounded-xl p-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <AlertCircle size={13} className="text-blue-500 dark:text-blue-400" />
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Topic/Intent Detection</p>
                          </div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug mb-1">
                            {analysis.intent || 'ไม่ระบุ'}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">ระบุสาเหตุการติดต่อ</p>
                          {analysis.summary && (
                            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg px-2.5 py-2">
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                                {analysis.summary}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* KEYWORDS */}
                        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700 rounded-xl p-4">
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <Tag size={13} className="text-amber-500" />
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Keywords</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {analysis.keywords && analysis.keywords.length > 0 ? (
                              analysis.keywords.map((kw, i) => (
                                <span key={i} className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-medium rounded-full">
                                  {kw}
                                </span>
                              ))
                            ) : (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">ไม่มี keywords</p>
                            )}
                          </div>
                        </div>

                        {/* ANOMALY */}
                        <div className={`rounded-xl p-4 border ${
                          isAnomaly
                            ? 'bg-red-50 dark:bg-red-900/20 border-slate-100 dark:border-slate-700'
                            : 'bg-emerald-50 dark:bg-emerald-900/20 border-slate-100 dark:border-slate-700'
                        }`}>
                          <div className="flex items-center gap-1.5 mb-3">
                            <AlertCircle size={13} className={isAnomaly ? 'text-red-500' : 'text-emerald-500'} />
                            <p className={`text-[10px] font-bold uppercase tracking-wider ${
                              isAnomaly ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
                            }`}>Anomaly Detection</p>
                          </div>
                          <p className={`text-base font-bold ${
                            isAnomaly ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
                          }`}>
                            {isAnomaly ? 'พบความเสี่ยง' : 'ไม่พบความเสี่ยง'}
                          </p>
                          <p className={`text-[11px] mt-1 ${
                            isAnomaly ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {isAnomaly
                              ? `Sentiment: ${analysis.sentiment} · QA ${analysis.qa_score ?? '-'}/10`
                              : 'สนทนาอยู่ในเกณฑ์ปกติ'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ========== Key Insight (Deep Customer Insight): สรุปความต้องการลูกค้าและ action ที่ควรทำต่อ ========== */}
                {(() => {
                  // ★ ดึง deep_insight ใหม่ — ถ้าไม่มี fallback ใช้ key_insights+action_items แบบเดิม
                  const di = (analysis as any).deep_insight || {};
                  const hasDeep = di && (di.customer_need || di.pain_point || di.expectation || di.recommended_action);

                  const rawNeed     = hasDeep ? (di.customer_need || '') : (analysis.key_insights || '');
                  const painPoint   = hasDeep ? (di.pain_point || '').trim() : '';
                  const rootCause   = hasDeep ? (di.root_cause || '').trim() : '';
                  const expectation = hasDeep ? (di.expectation || '').trim() : '';

                  // ถ้า customer_need สั้น (< 40 ตัว) หรือไม่มีบริบทเหตุผล → ผูก pain/root เข้ามาในประโยค
                  // (สำหรับ data เก่าที่ prompt ยังไม่บังคับให้ AI รวมบริบท)
                  let customerNeed = rawNeed;
                  if (hasDeep && rawNeed) {
                    const needHasContext = /เนื่องจาก|เพราะ|จาก|จากปัญหา/.test(rawNeed);
                    if (!needHasContext && (painPoint || rootCause)) {
                      const ctx = painPoint || rootCause;
                      customerNeed = `${rawNeed} เนื่องจาก${ctx}`;
                    }
                  }

                  const steps: string[] = hasDeep
                    ? (Array.isArray(di.recommended_steps) && di.recommended_steps.length > 0
                        ? di.recommended_steps
                        : (di.recommended_action ? [di.recommended_action] : []))
                    : ((analysis as any).action_items || []);

                  // Risk level จาก deep_insight ถ้ามี ไม่งั้น fallback เดิม (sentiment/qa)
                  const riskLevel: 'low' | 'medium' | 'high' =
                    hasDeep && ['low','medium','high'].includes(di.risk_level)
                      ? di.risk_level
                      : (analysis.sentiment?.toLowerCase() === 'negative' ||
                         (typeof analysis.qa_score === 'number' && analysis.qa_score < 5))
                        ? 'high' : 'low';

                  const confidence = typeof di.confidence === 'number' ? di.confidence : null;

                  // ไม่แสดงกล่องเลยถ้าไม่มีข้อมูลใด
                  if (!customerNeed && steps.length === 0) return null;

                  const riskCfg = {
                    high:   { label: 'ความเสี่ยงสูง',   cls: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300', dot: 'bg-red-500' },
                    medium: { label: 'ความเสี่ยงปานกลาง', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300', dot: 'bg-amber-500' },
                    low:    { label: 'ความเสี่ยงต่ำ',    cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300', dot: 'bg-emerald-500' },
                  }[riskLevel];

                  return (
                    <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex items-center space-x-2">
                          <Lightbulb className="text-blue-600 dark:text-blue-400" size={20} />
                          <h2 className="text-base font-bold text-blue-800 dark:text-blue-300">Key Insight</h2>
                          {confidence !== null && hasDeep && (
                            <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                              ความมั่นใจ {confidence}%
                            </span>
                          )}
                        </div>
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 ${riskCfg.cls}`}>
                          <span className={`w-1.5 h-1.5 ${riskCfg.dot} rounded-full`} />
                          {riskCfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-500 dark:text-blue-400 ml-7 mb-4">
                        เจาะสิ่งที่ลูกค้าต้องการจริง และสิ่งที่ควรทำต่อ
                      </p>

                      {/* ลูกค้าต้องการอะไร (รวมบริบทไว้ในประโยคเดียว) */}
                      {customerNeed && (
                        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 mb-3">
                          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">ลูกค้าต้องการอะไร</p>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                            {customerNeed}
                          </p>
                        </div>
                      )}

                      {/* สิ่งที่ควรทำต่อ */}
                      {steps.length > 0 && (
                        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4">
                          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">สิ่งที่ควรทำต่อ</p>
                          <ol className="space-y-1.5">
                            {steps.map((item: string, i: number) => (
                              <li key={i} className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed flex gap-2">
                                <span className="font-bold text-slate-500 dark:text-slate-400 shrink-0">{i + 1}.</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Transcription Detail: แสดง audio player และ transcript จาก Whisper พร้อม subtitle sync */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                  {/* Header */}
                  <div className="p-6 pb-0">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <MessageCircle className="text-slate-800 dark:text-slate-100" size={24} />
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Transcription Detail</h2>
                      </div>
                      {sentimentBadge && (
                        <span className={`px-3 py-1 ${sentimentBadge.color} text-xs font-bold rounded-full flex items-center space-x-1`}>
                          <span className={`w-1.5 h-1.5 ${sentimentBadge.dot} rounded-full`}></span>
                          <span>{sentimentBadge.label}</span>
                        </span>
                      )}
                    </div>

                    {/* Audio Player: ควบคุม play/pause, seek, skip และแสดงเวลาเสียง */}
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl p-3 mb-4">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={skipBackward}
                          className="transcript-audio-button w-7 h-7 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                          title="-10s"
                        >
                          <SkipBack size={14} />
                        </button>
                        <button
                          onClick={togglePlay}
                          className="w-10 h-10 bg-blue-700 text-white rounded-full flex items-center justify-center shadow-sm cursor-pointer hover:bg-blue-800 transition-colors shrink-0"
                        >
                          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                        </button>
                        <button
                          onClick={skipForward}
                          className="transcript-audio-button w-7 h-7 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                          title="+10s"
                        >
                          <SkipForward size={14} />
                        </button>

                        {/* Progress bar */}
                        <div className="flex-1 flex items-center space-x-3">
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 w-10 text-right shrink-0">
                            {formatTime(currentTimeSeconds)}
                          </span>
                          <div
                            className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full cursor-pointer relative group"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const percent = (e.clientX - rect.left) / rect.width;
                              const dur = durationSeconds || (fileData?.call_duration_seconds ?? 0);
                              seekTo(percent * dur);
                            }}
                          >
                            <div
                              className="h-full bg-blue-600 rounded-full relative transition-all"
                              style={{ width: `${progressPercent}%` }}
                            >
                              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-700 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 w-10 shrink-0">
                            {formatTime(durationSeconds || fileData?.call_duration_seconds || analysis?.audio_duration_seconds || analysis?.call_duration_seconds || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subtitle Segments */}
                  {analysis.transcription && analysis.transcription.length > 0 ? (
                    <div
                      ref={transcriptionContainerRef}
                      className="max-h-[480px] overflow-y-auto px-6 pb-6"
                    >
                      <div className="space-y-1">
                        {(() => {
                          // ตรวจว่ามี timestamp segments หรือไม่
                          const hasTimestamps = analysis.transcription?.length > 0 
                            && analysis.transcription.some((s: any) => s.start > 0 || s.end > 0);

                          if (hasTimestamps) {
                            // === Old format: timestamp segments ===
                            return analysis.transcription.map((seg: any, idx: number) => {
                              const segStart = typeof seg.start === 'number' ? seg.start : 0;
                              const segEnd = typeof seg.end === 'number' ? seg.end : segStart + 5;
                              const segText = seg.text || '';
                              const isActive = idx === activeSegmentIdx && isPlaying;
                              const isPast = currentTimeSeconds > segEnd && isPlaying;
                              if (!segText) return null;

                              return (
                                <div key={`seg-${idx}`} ref={isActive ? activeSegmentRef : null}
                                  onClick={() => seekTo(segStart)}
                                  className={`flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 group ${
                                    isActive ? 'bg-blue-50 dark:bg-blue-900/20 border border-slate-100 dark:border-slate-700 shadow-sm'
                                    : isPast ? 'opacity-50 hover:opacity-80 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                                  }`}>
                                  <span className={`text-[11px] font-mono shrink-0 pt-0.5 w-12 text-right ${isActive ? 'text-blue-600 font-bold' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {formatTime(segStart)}
                                  </span>
                                  <div className={`w-1.5 shrink-0 rounded-full mt-1.5 transition-all ${isActive ? 'h-4 bg-blue-600 animate-pulse' : 'h-1.5 bg-slate-200 dark:bg-slate-600'}`} />
                                  <p className={`text-sm leading-relaxed flex-1 ${isActive ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-300'}`}>{segText}</p>
                                </div>
                              );
                            });
                          } else {
                            // === New format: speaker-labeled transcript ===
                            const fullText = (analysis as any).corrected_transcript || analysis.transcription?.map((s: any) => s.text).join(' ') || '';
                            const lines = fullText.split('\n').filter((l: string) => l.trim());

                            return lines.map((line: string, idx: number) => {
                              // Parse speaker label: "[00:00] Agent: text" or "Agent: text" or plain text
                              const speakerMatch = line.match(/^(?:\[\d{2}:\d{2}\]\s*)?(\w+):\s*(.+)$/);
                              const speaker = speakerMatch ? speakerMatch[1] : null;
                              const text = speakerMatch ? speakerMatch[2] : line;

                              const isAgent = speaker === 'Agent';
                              const isCustomer = speaker === 'Customer';

                              return (
                                <div key={`line-${idx}`} className={`flex items-start gap-3 px-4 py-3 rounded-xl ${
                                  isAgent ? 'bg-blue-50/50 dark:bg-blue-900/10' : isCustomer ? 'bg-slate-50/50 dark:bg-slate-800/50' : ''
                                }`}>
                                  {speaker ? (
                                    <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 pt-1 w-20 ${
                                      isAgent ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'
                                    }`}>
                                      {speaker}
                                    </span>
                                  ) : (
                                    <span className="w-20 shrink-0" />
                                  )}
                                  <p className="text-sm leading-relaxed flex-1 text-slate-600 dark:text-slate-300">{text}</p>
                                </div>
                              );
                            });
                          }
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 pb-6">
                      <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-8">ไม่มีข้อมูล Transcription</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                
                {/* Metadata / Details: ข้อมูลไฟล์ เบอร์ลูกค้า agent product brand และข้อมูลทางเทคนิค */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center space-x-3 mb-6 pb-6 border-b border-slate-100 dark:border-slate-700">
                    <Info className="text-slate-800 dark:text-slate-100" size={24} />
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Metadata / Details</h2>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div className="col-span-2">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">CUSTOMER PHONE</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {fileData?.customer_phone || analysis?.phone_number_used || 'N/A'}
                        </p>
                        {fileData?.call_direction && fileData.call_direction !== 'Unknown' && (
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            fileData.call_direction === 'Inbound'
                              ? 'bg-green-50 text-green-600'
                              : 'bg-orange-50 text-orange-600'
                          }`}>
                            {fileData.call_direction === 'Inbound' ? '📞 Inbound' : '📱 Outbound'}
                          </span>
                        )}
                        {matchedCustomer && (
                          <button
                            onClick={() => router.push(`/customers/${matchedCustomer.customer_id}`)}
                            className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[11px] font-semibold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            {matchedCustomer.first_name} {matchedCustomer.last_name}
                            <ExternalLink size={11} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">AGENT ID</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {analysis?.agent_id || fileData?.agent_id || 'N/A'}
                        {(analysis?.agent_name || fileData?.agent_name) &&
                          ` (${analysis?.agent_name || fileData?.agent_name})`}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">BRAND</p>
                      <div className="flex flex-wrap gap-1">
                        {(analysis?.brand_names && analysis.brand_names.length > 0
                          ? analysis.brand_names
                          : analysis?.brand_name && analysis.brand_name !== 'Unknown'
                            ? [analysis.brand_name]
                            : []
                        ).map((b, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold rounded">{b}</span>
                        ))}
                        {(!analysis?.brand_names || analysis.brand_names.length === 0) && !analysis?.brand_name && (
                          <span className="text-sm text-slate-400 dark:text-slate-500">-</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">PRODUCT</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{analysis?.product_category || '-'}</p>
                    </div>

                    <div className="col-span-2">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">SALE CHANNEL</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{analysis?.sale_channel || '-'}</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">QA SCORE</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{analysis?.qa_score ? `${analysis.qa_score}/10` : '-'}</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">CSAT</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{analysis?.csat_score ? `${analysis.csat_score}/5` : '-'}</p>
                    </div>

                    <div className="col-span-2">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">ANALYSIS DATE</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {analysis?.created_at
                          ? new Date(analysis.created_at).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })
                          : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ========== Warranty / การรับประกัน ========== */}
                <div className="bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700"> {/* Customer warranty: แสดงสถานะลูกค้าและ warranty ที่ match จากเบอร์โทร */}
                  <div className="flex items-center justify-between mb-5 pb-5 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center space-x-3">
                      <ShieldCheck className="text-emerald-600 dark:text-emerald-400" size={22} />
                      <h2 className="text-base font-bold text-emerald-800 dark:text-emerald-300">การรับประกัน</h2>
                    </div>
                    {matchedCustomer && warranties.length > 0 && (
                      <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-full">
                        {warranties.length} รายการ
                      </span>
                    )}
                  </div>

                  {!matchedCustomer ? (
                    // ไม่มีลูกค้าในฐานข้อมูล
                    <div className="text-center py-6">
                      <AlertCircle size={24} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">ไม่พบข้อมูล</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">เบอร์โทรนี้ไม่มีในฐานข้อมูลลูกค้า</p>
                    </div>
                  ) : warranties.length === 0 ? (
                    // มีลูกค้าแต่ไม่มี warranty
                    <div className="text-center py-6">
                      <AlertCircle size={24} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">ไม่พบข้อมูล</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        {matchedCustomer.first_name} {matchedCustomer.last_name} ยังไม่มีรายการรับประกัน
                      </p>
                    </div>
                  ) : (
                    // มี warranty → แสดงรายการ
                    <div className="space-y-2.5">
                      {warranties.map((w) => {
                        const isActive = w.status === 'ACTIVE';
                        return (
                          <div
                            key={w.registration_id}
                            onClick={() => router.push(`/customers/warranty/${w.registration_id}`)}
                            className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-3 hover:border-slate-200 dark:hover:border-slate-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer transition-colors group shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mb-0.5 truncate">
                                  {w.registration_no || '-'}
                                </p>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-blue-700 dark:group-hover:text-blue-400">
                                  {w.brand_name || 'Unknown'} · {w.model || w.category_name || '-'}
                                </p>
                              </div>
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full shrink-0 ${
                                isActive
                                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                  : w.status === 'EXPIRED'
                                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                    : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                              }`}>
                                {w.status || '-'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                              <span>ซื้อ: {w.date_of_purchase || '-'}</span>
                              <span>หมดอายุ: {w.expiry_date || '-'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Key Insights + Keywords ถูกย้ายไปอยู่ใน Summary Insight ของคอลัมน์ซ้ายแล้ว */}
              </div>
            </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
