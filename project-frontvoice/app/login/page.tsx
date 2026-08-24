'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Folder, LogIn, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function LoginPage() {
  const { login } = useAuth();
  // เก็บ username ที่ผู้ใช้กรอก (อ่านค่า: บรรทัด 26, 27, 37, 75, 77; อัปเดต: บรรทัด 76)
  const [username, setUsername] = useState('');
  // เก็บ password ที่ผู้ใช้กรอก (อ่านค่า: บรรทัด 26, 27, 37, 88; อัปเดต: บรรทัด 89)
  const [password, setPassword] = useState('');
  // เก็บสถานะแสดง/ซ่อน password (อ่านค่า: บรรทัด 95, 98; อัปเดต: บรรทัด 95)
  const [showPassword, setShowPassword] = useState(false);
  // เก็บข้อความ error ของหน้า login (อ่านค่า: บรรทัด 103, 105; อัปเดต: บรรทัด 27, 32, 42, 48)
  const [error, setError] = useState('');
  // เก็บสถานะกำลัง login (อ่านค่า: บรรทัด 111, 114, 119; อัปเดต: บรรทัด 31, 50)
  const [loading, setLoading] = useState(false);

  // Handle/API: ส่ง username/password ไป backend เพื่อ login และเก็บ user ใน AuthProvider (ถูกเรียกใช้ที่บรรทัด 70)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('กรุณากรอก username และ password');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }

      login(data.user);
    } catch {
      setError('ไม่สามารถเชื่อมต่อกับ server ได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4"> {/* Layout หลักหน้า Login จัด form ให้อยู่กลางจอ */}
      <div className="w-full max-w-sm"> {/* กล่อง login จำกัดความกว้างบน desktop/mobile */}
        {/* Logo: แสดง branding และชื่อระบบ */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-700 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
            <Folder size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">FontAI</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">AI Voice Intelligence System</p>
        </div>

        {/* Login Form: รับ username/password และส่งเข้า handleLogin */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 text-center">เข้าสู่ระบบ</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="กรอก username"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่าน"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 transition-all pr-11"
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

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5"> {/* Error alert เมื่อ login ไม่สำเร็จ */}
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
                <LogIn size={16} />
              )}
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700 text-center"> {/* Link ไปหน้า register สำหรับผู้ใช้ใหม่ */}
            <p className="text-xs text-slate-400 dark:text-slate-500">
              ยังไม่มีบัญชี?{' '}
              <Link href="/register" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">
                สมัครสมาชิก
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
