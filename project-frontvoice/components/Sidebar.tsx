'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, Folder, Users, ShieldCheck, LogOut, Headphones, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // ★ Role-based access — ADMIN เห็นทุกอย่าง, STAFF/VIEWER ไม่เห็น Agents + Admin
  const isAdmin = user?.role === 'ADMIN';

  return (
    <aside className="w-64 h-screen bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between">
      <div>
        <div className="p-6 flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-700 rounded-xl flex items-center justify-center text-white">
            <Folder size={24} />
          </div>
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">FontAI</span>
        </div>

        <nav className="mt-6 px-4 space-y-2">
          <Link href="/dashboard" className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${pathname === '/dashboard' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>
          <Link href="/files" className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${pathname.includes('/files') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <FileText size={20} />
            <span>Files</span>
          </Link>
          <Link href="/customers" className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${pathname.includes('/customers') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <Users size={20} />
            <span>Customer Information</span>
          </Link>
          {/* ★ Agents — เฉพาะ ADMIN เห็น */}
          {isAdmin && (
            <Link href="/agents" className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${pathname.includes('/agents') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <Headphones size={20} />
              <span>Agents</span>
            </Link>
          )}
          <Link href="/warranty" className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${pathname === '/warranty' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            <ShieldCheck size={20} />
            <span>Warranty Storage</span>
          </Link>
          {/* ★ Admin Management — เฉพาะ ADMIN เห็น */}
          {isAdmin && (
            <Link href="/admin" className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${pathname.includes('/admin') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <ShieldAlert size={20} />
              <span>Admin Management</span>
            </Link>
          )}
        </nav>
      </div>

      {/* User info + Logout */}
      {user && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{user.full_name}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">{user.role}</p>
            </div>
            <button
              onClick={logout}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg cursor-pointer transition-colors"
              title="ออกจากระบบ"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
