/**
 * lib/api.ts — Fetch wrapper ที่ auto-attach actor headers
 *
 * ใช้แทน fetch() เพื่อให้ทุก request ติด X-Actor-* headers
 * — Backend จะใช้ headers นี้ใน activity logs อัตโนมัติ
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ActorInfo {
  admin_user_id?: number;
  username?: string;
  role?: string;
}

function readCurrentUser(): ActorInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem('fontai_user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * fetch wrapper — auto-attach X-Actor-* headers จาก sessionStorage
 *
 * Usage:
 *   const res = await apiFetch('/api/v1/audio/list?page=1');
 *   const res = await apiFetch('/api/v1/audio/upload', { method: 'POST', body: formData });
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const user = readCurrentUser();
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const headers = new Headers(init.headers || {});
  if (user?.admin_user_id) headers.set('X-Actor-Id', String(user.admin_user_id));
  if (user?.username)      headers.set('X-Actor-Username', user.username);
  if (user?.role)          headers.set('X-Actor-Role', user.role);

  return fetch(url, { ...init, headers });
}

/**
 * บันทึก log action จาก frontend (เช่น LOGOUT)
 * — ไม่ throw error, fail silently เพื่อไม่ให้กระทบ main flow
 */
export async function logAction(action: string, target?: {
  type?: string;
  id?: string;
  label?: string;
  detail?: string;
}): Promise<void> {
  const user = readCurrentUser();
  if (!user) return;

  try {
    await apiFetch('/api/v1/admin/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor_user_id:  user.admin_user_id,
        actor_username: user.username,
        actor_role:     user.role,
        action,
        target_type:  target?.type,
        target_id:    target?.id,
        target_label: target?.label,
        detail:       target?.detail,
      }),
    });
  } catch {
    // silent fail
  }
}
