'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { ShieldAlert } from 'lucide-react';

export default function AgentsLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // Effect: ตรวจสิทธิ์หน้า agents ถ้าไม่ใช่ ADMIN ให้ redirect กลับ dashboard
  useEffect(() => {
    if (isLoading) return;
    if (!user) return; // AuthProvider จะ redirect ไป /login เอง
    if (user.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  // ระหว่างโหลด/redirect แสดงข้อความรอ
  if (isLoading || !user) {
    return null;
  }

  if (user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="text-red-500" size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            ไม่มีสิทธิ์เข้าถึง
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            หน้านี้เปิดให้เฉพาะผู้ใช้ที่มีสิทธิ์ ADMIN เท่านั้น
          </p>
          <button
            onClick={() => router.replace('/dashboard')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors"
          >
            กลับไปหน้า Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
