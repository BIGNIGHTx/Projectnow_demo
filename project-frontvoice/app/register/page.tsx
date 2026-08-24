'use client';

import { useState } from 'react';
import { Folder, UserPlus, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function RegisterPage() {
  const router = useRouter();
  // เก็บข้อมูลในฟอร์มสมัครสมาชิกทั้งหมด (อ่านค่า: บรรทัด 29, 33, 37, 48, 49, 50, 51, 84, 89, 101, 112, 124, 143, 168; อัปเดต: บรรทัด 22)
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '', full_name: '', email: '' });
  // เก็บสถานะแสดง/ซ่อน password (อ่านค่า: บรรทัด 131, 134; อัปเดต: บรรทัด 131)
  const [showPassword, setShowPassword] = useState(false);
  // เก็บข้อความ error ของหน้า register (อ่านค่า: บรรทัด 150, 152; อัปเดต: บรรทัด 27, 30, 34, 38, 58, 64)
  const [error, setError] = useState('');
  // เก็บสถานะกำลังสมัครสมาชิก (อ่านค่า: บรรทัด 158, 161, 166; อัปเดต: บรรทัด 42, 66)
  const [loading, setLoading] = useState(false);

  // Handle: อัปเดตค่า field ในฟอร์มสมัครสมาชิกทีละช่อง (ถูกเรียกใช้ที่บรรทัด 90, 102, 113, 125, 144)
  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  // Handle/API: ตรวจข้อมูลฟอร์มและส่ง register request ไป backend (ถูกเรียกใช้ที่บรรทัด 84)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.username.trim() || !form.password.trim() || !form.full_name.trim()) {
      setError('กรุณากรอก Username, ชื่อ-นามสกุล และ Password');
      return;
    }
    if (form.password.length < 4) {
      setError('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password.trim(),
          full_name: form.full_name.trim(),
          email: form.email.trim() || null,
          role: 'STAFF',
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'สมัครไม่สำเร็จ');
        return;
      }

      router.push('/login');
    } catch {
      setError('ไม่สามารถเชื่อมต่อกับ server ได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4"> {/* Layout หลักหน้า Register จัด form ให้อยู่กลางจอ */}
      <div className="w-full max-w-sm"> {/* กล่องสมัครสมาชิกจำกัดความกว้าง */}
        {/* Logo: แสดง branding และชื่อระบบ */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-700 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
            <Folder size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">FontAI</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">สมัครสมาชิก</p>
        </div>

        {/* Register Form: รับข้อมูลสมัครสมาชิกและส่งเข้า handleRegister */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">ชื่อ-นามสกุล</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => update('full_name', e.target.value)}
                placeholder="เช่น สมชาย มีหมาย"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                placeholder="กรอก username"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">Email (ไม่บังคับ)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="email@example.com"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  placeholder="อย่างน้อย 4 ตัวอักษร"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">ยืนยัน Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => update('confirmPassword', e.target.value)}
                placeholder="กรอกรหัสผ่านอีกครั้ง"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5"> {/* Error alert เมื่อ validate/register ไม่สำเร็จ */}
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold text-sm cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <UserPlus size={16} />
              )}
              {loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700 text-center"> {/* Link กลับไปหน้า login */}
            <Link href="/login" className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline inline-flex items-center gap-1">
              <ArrowLeft size={12} /> กลับไปหน้า Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
