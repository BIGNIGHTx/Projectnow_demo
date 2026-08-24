'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  admin_user_id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export const useAuth = () => useContext(AuthContext);

const PUBLIC_PATHS = ['/login', '/register'];

// API base ใช้สำหรับเช็คว่า fetch ไป backend หรือไม่
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const userRef = useRef<User | null>(null);

  // sync user เข้า ref เผื่อ closure ใน fetch interceptor
  useEffect(() => { userRef.current = user; }, [user]);

  // ★ Patch global fetch ครั้งเดียวตอน mount — auto-inject X-Actor-* headers ทุก request ที่ไป backend
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalFetch = window.fetch;

    window.fetch = async (input, init = {}) => {
      try {
        const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
        // เฉพาะ request ไป backend
        if (url && (url.startsWith(API_BASE) || url.startsWith('/api/v1/'))) {
          const u = userRef.current;
          if (u) {
            const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
            headers.set('X-Actor-Id', String(u.admin_user_id));
            headers.set('X-Actor-Username', u.username);
            headers.set('X-Actor-Role', u.role);
            init = { ...init, headers };
          }
        }
      } catch {}
      return originalFetch(input as any, init);
    };

    return () => { window.fetch = originalFetch; };
  }, []);

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('fontai_user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {}
    setIsLoading(false);
  }, []);

  // Redirect logic
  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_PATHS.includes(pathname);

    if (!user && !isPublic) {
      router.replace('/login');
    }
    if (user && isPublic) {
      router.replace('/dashboard');
    }
  }, [user, pathname, isLoading, router]);

  const login = (userData: User) => {
    setUser(userData);
    sessionStorage.setItem('fontai_user', JSON.stringify(userData));
  };

  const logout = () => {
    // ★ Log LOGOUT action ก่อน clear session (ต้อง send blocking-ish — ใช้ sendBeacon)
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const currentUser = user;
      if (currentUser) {
        const body = JSON.stringify({
          actor_user_id:  currentUser.admin_user_id,
          actor_username: currentUser.username,
          actor_role:     currentUser.role,
          action: 'LOGOUT',
          target_type: 'user',
          target_id:   String(currentUser.admin_user_id),
          target_label: currentUser.full_name,
        });
        // sendBeacon ส่งได้แม้ page กำลังจะเปลี่ยน — เหมาะกับ logout
        if (navigator.sendBeacon) {
          const blob = new Blob([body], { type: 'application/json' });
          navigator.sendBeacon(`${API_BASE}/api/v1/admin/logs`, blob);
        } else {
          // fallback fetch แบบ keepalive
          fetch(`${API_BASE}/api/v1/admin/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      }
    } catch {}

    setUser(null);
    sessionStorage.removeItem('fontai_user');
    router.replace('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
