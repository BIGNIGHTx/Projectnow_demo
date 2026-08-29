'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/components/AuthProvider';
import {
  ShieldAlert, Users as UsersIcon, ScrollText, Search,
  RefreshCw, Activity, UserCog, CheckCircle2, XCircle,
  Clock, Sliders, ShieldCheck, Save, RotateCcw, Check,
  X, LayoutDashboard, FileText, Headphones, Shield, CheckSquare,
  Square, Sparkles, AlertCircle, UserCheck
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ----- Types -----
interface AdminUser {
  admin_user_id: number;
  username: string;
  full_name: string;
  email: string | null;
  role: 'ADMIN' | 'STAFF' | 'VIEWER';
  is_active: number;
  created_at: string;
  updated_at: string | null;
}

interface ActivityLog {
  log_id: number;
  actor_user_id: number | null;
  actor_username: string;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  detail: string | null;
  ip_address: string | null;
  created_at: string;
}

interface LogStats {
  total_logs: number;
  logs_last_7_days: number;
  top_actions: { action: string; c: number }[];
  top_actors: { actor_username: string; c: number }[];
}

type Tab = 'users' | 'logs' | 'permissions';

// ----- Permission Definitions per Module -----
interface PermissionItem {
  id: string;
  title: string;
  description: string;
  defaultStaff: boolean;
  defaultViewer: boolean;
}

interface PermissionGroup {
  moduleId: string;
  moduleName: string;
  description: string;
  iconName: 'dashboard' | 'files' | 'customers' | 'agents' | 'warranty' | 'logs';
  permissions: PermissionItem[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    moduleId: 'dashboard',
    moduleName: 'หน้า Dashboard และรายงานภาพรวม',
    description: 'ควบคุมการมองเห็นข้อมูลสรุป กราฟสถิติ และรายงานภาพรวมในระบบ',
    iconName: 'dashboard',
    permissions: [
      {
        id: 'dashboard_view',
        title: 'ดูหน้า Dashboard และกราฟสถิติภาพรวม',
        description: 'อนุญาตให้เข้าดูหน้าแรก Dashboard, ตัวเลขสถิติ, ยอดรวมไฟล์ และกราฟการใช้งาน',
        defaultStaff: true,
        defaultViewer: true,
      },
      {
        id: 'dashboard_export',
        title: 'ส่งออกรายงานสรุป Dashboard',
        description: 'อนุญาตให้ดาวน์โหลดรายงานเชิงลึกและส่งออกข้อมูลสถิติเป็นไฟล์',
        defaultStaff: true,
        defaultViewer: false,
      },
    ],
  },
  {
    moduleId: 'files',
    moduleName: 'จัดการไฟล์เสียงและ AI วิเคราะห์เสียง (Files)',
    description: 'ควบคุมการเข้าถึงคลังไฟล์เสียง การอัปโหลด และการสั่งรัน AI Voice Analysis',
    iconName: 'files',
    permissions: [
      {
        id: 'files_view',
        title: 'ดูรายการไฟล์เสียงและบทสนทนาที่ถอดความแล้ว',
        description: 'อนุญาตให้เปิดดูรายการไฟล์เสียง ผลการถอดความ และเล่นไฟล์เสียงในระบบ',
        defaultStaff: true,
        defaultViewer: true,
      },
      {
        id: 'files_upload',
        title: 'อัปโหลดไฟล์เสียงใหม่เข้าสู่ระบบ',
        description: 'อนุญาตให้อัปโหลดไฟล์เสียง (.mp3, .wav, .m4a) เพิ่มเข้ามาประมวลผล',
        defaultStaff: true,
        defaultViewer: false,
      },
      {
        id: 'files_analyze',
        title: 'สั่งรัน AI Voice Analysis (ถอดความและวิเคราะห์อารมณ์)',
        description: 'อนุญาตให้กดปุ่มประมวลผล AI ถอดความและวิเคราะห์อารมณ์ผู้สนทนา',
        defaultStaff: true,
        defaultViewer: false,
      },
      {
        id: 'files_download',
        title: 'ดาวน์โหลดไฟล์เสียงและส่งออกข้อความบทสนทนา',
        description: 'อนุญาตให้ดาวน์โหลดไฟล์เสียงต้นฉบับและเอกสารบทสนทนาออกจากระบบ',
        defaultStaff: true,
        defaultViewer: false,
      },
      {
        id: 'files_delete',
        title: 'ลบไฟล์เสียงและประวัติบทสนทนา',
        description: 'อนุญาตให้กดลบไฟล์เสียงออกจากระบบ (ลบเดี่ยวหรือลบเป็นชุด)',
        defaultStaff: false,
        defaultViewer: false,
      },
    ],
  },
  {
    moduleId: 'customers',
    moduleName: 'ข้อมูลลูกค้า (Customer Information)',
    description: 'ควบคุมการเข้าถึงฐานข้อมูลรายชื่อลูกค้า ประวัติ และการจัดการข้อมูล',
    iconName: 'customers',
    permissions: [
      {
        id: 'customers_view',
        title: 'ดูรายชื่อและข้อมูลส่วนตัวลูกค้า',
        description: 'อนุญาตให้ค้นหาและดูข้อมูลโปรไฟล์ลูกค้า รวมถึงประวัติการติดต่อ',
        defaultStaff: true,
        defaultViewer: true,
      },
      {
        id: 'customers_edit',
        title: 'เพิ่มและแก้ไขข้อมูลลูกค้า',
        description: 'อนุญาตให้สร้างโปรไฟล์ลูกค้าใหม่ หรือแก้ไขเบอร์โทรศัพท์และข้อมูลติดต่อ',
        defaultStaff: true,
        defaultViewer: false,
      },
      {
        id: 'customers_export',
        title: 'ส่งออกรายชื่อลูกค้า (Excel / CSV)',
        description: 'อนุญาตให้ดาวน์โหลดฐานข้อมูลรายชื่อลูกค้าออกเป็นไฟล์ Excel หรือ CSV',
        defaultStaff: false,
        defaultViewer: false,
      },
      {
        id: 'customers_delete',
        title: 'ลบข้อมูลลูกค้าออกจากระบบ',
        description: 'อนุญาตให้ลบระเบียบประวัติลูกค้าออกจากฐานข้อมูลอย่างถาวร',
        defaultStaff: false,
        defaultViewer: false,
      },
    ],
  },
  {
    moduleId: 'agents',
    moduleName: 'AI Voice Agents (ระบบตัวแทนเสียง)',
    description: 'ควบคุมการเข้าดูและปรับแต่งคำสั่ง Prompt หรือเสียงของ Voice Agents',
    iconName: 'agents',
    permissions: [
      {
        id: 'agents_view',
        title: 'ดูรายชื่อและสถานะ Voice Agents',
        description: 'อนุญาตให้ตรวจสอบรายชื่อตัวแทนเสียง AI และสถานะการทำงานในระบบ',
        defaultStaff: true,
        defaultViewer: true,
      },
      {
        id: 'agents_manage',
        title: 'ปรับแต่งคำสั่ง (Prompt) และตั้งค่าเสียง AI',
        description: 'อนุญาตให้แก้ไข Prompt คำสั่ง ปรับแต่งพารามิเตอร์ และการตั้งค่า AI Voice Agent',
        defaultStaff: false,
        defaultViewer: false,
      },
    ],
  },
  {
    moduleId: 'warranty',
    moduleName: 'คลังการรับประกันสินค้า (Warranty Storage)',
    description: 'ควบคุมการดูข้อมูลกรมธรรม์ การลงทะเบียน และการอนุมัติเคลมสินค้า',
    iconName: 'warranty',
    permissions: [
      {
        id: 'warranty_view',
        title: 'ดูรายการและการรับประกันสินค้า',
        description: 'อนุญาตให้ค้นหาและดูรายละเอียดข้อมูลกรมธรรม์และการรับประกันสินค้า',
        defaultStaff: true,
        defaultViewer: true,
      },
      {
        id: 'warranty_manage',
        title: 'เพิ่ม แก้ไข หรืออนุมัติการเคลมประกัน',
        description: 'อนุญาตให้ลงทะเบียนประกันใหม่ แก้ไขวันหมดอายุ หรือกดอนุมัติการเคลมสินค้า',
        defaultStaff: true,
        defaultViewer: false,
      },
    ],
  },
  {
    moduleId: 'logs',
    moduleName: 'บันทึกกิจกรรมและตรวจสอบระบบ (Activity Logs)',
    description: 'ควบคุมการเข้าถึงบันทึกประวัติการทำงานและ Audit Log ของระบบ',
    iconName: 'logs',
    permissions: [
      {
        id: 'logs_view',
        title: 'ดูบันทึกกิจกรรมระบบ (Activity Logs)',
        description: 'อนุญาตให้เข้าดูประวัติการเข้าใช้งานและ Log การทำรายการทั้งหมดของผู้ใช้ในระบบ',
        defaultStaff: false,
        defaultViewer: false,
      },
    ],
  },
];

// Flat list of all permission items
const ALL_PERMISSIONS: PermissionItem[] = PERMISSION_GROUPS.flatMap((g) => g.permissions);

const PERMISSION_LOG_LABELS: Record<string, string> = {
  dashboard_view: 'ดู Dashboard',
  dashboard_export: 'ส่งออกรายงาน',
  files_view: 'ดูไฟล์เสียง',
  files_upload: 'อัปโหลดไฟล์',
  files_analyze: 'วิเคราะห์ไฟล์',
  files_download: 'ดาวน์โหลดไฟล์',
  files_delete: 'ลบไฟล์',
  customers_view: 'ดูข้อมูลลูกค้า',
  customers_edit: 'แก้ไขลูกค้า',
  customers_export: 'ส่งออกลูกค้า',
  customers_delete: 'ลบลูกค้า',
  agents_view: 'ดู Voice Agents',
  agents_manage: 'ตั้งค่า Voice Agents',
  warranty_view: 'ดูประกัน',
  warranty_manage: 'จัดการประกัน',
  logs_view: 'ดู Activity Logs',
};

function getDefaultPermissions(targetUser: Pick<AdminUser, 'role'>): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};
  ALL_PERMISSIONS.forEach((p) => {
    defaults[p.id] = targetUser.role === 'STAFF' ? p.defaultStaff : p.defaultViewer;
  });
  return defaults;
}

function readSavedPermissionsByUser(): Record<number, Record<string, boolean>> {
  try {
    const saved = localStorage.getItem('fontai_user_permissions');
    const parsed: unknown = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === 'object' ? parsed as Record<number, Record<string, boolean>> : {};
  } catch {
    return {};
  }
}

function compactPermissionList(labels: string[], maxItems = 3): string {
  if (labels.length <= maxItems) return labels.join(', ');

  const visibleLabels = labels.slice(0, maxItems).join(', ');
  return `${visibleLabels} +อีก ${labels.length - maxItems}`;
}

function buildPermissionChangeDetail(
  targetUser: AdminUser,
  previousPerms: Record<string, boolean>,
  currentPerms: Record<string, boolean>
): string {
  const changedPerms = ALL_PERMISSIONS.filter((p) => Boolean(previousPerms[p.id]) !== Boolean(currentPerms[p.id]));
  const turnedOn = changedPerms
    .filter((p) => currentPerms[p.id])
    .map((p) => PERMISSION_LOG_LABELS[p.id] || p.title);
  const turnedOff = changedPerms
    .filter((p) => !currentPerms[p.id])
    .map((p) => PERMISSION_LOG_LABELS[p.id] || p.title);
  const allowedCount = ALL_PERMISSIONS.filter((p) => currentPerms[p.id]).length;
  const countText = `${allowedCount}/${ALL_PERMISSIONS.length}`;
  const changes: string[] = [];

  if (turnedOn.length > 0) changes.push(`เปิด: ${compactPermissionList(turnedOn)}`);
  if (turnedOff.length > 0) changes.push(`ปิด: ${compactPermissionList(turnedOff)}`);

  return changes.length > 0
    ? `อัปเดตสิทธิ์ (${countText}): ${changes.join(' | ')}`
    : `อัปเดตสิทธิ์ ${targetUser.full_name}: ไม่มีสิทธิ์ที่เปลี่ยน`;
}

// ----- Helper for module icons -----
function renderModuleIcon(iconName: string) {
  switch (iconName) {
    case 'dashboard':
      return <LayoutDashboard size={18} className="text-blue-500" />;
    case 'files':
      return <FileText size={18} className="text-indigo-500" />;
    case 'customers':
      return <UsersIcon size={18} className="text-emerald-500" />;
    case 'agents':
      return <Headphones size={18} className="text-purple-500" />;
    case 'warranty':
      return <ShieldCheck size={18} className="text-amber-500" />;
    case 'logs':
      return <ScrollText size={18} className="text-rose-500" />;
    default:
      return <Shield size={18} className="text-blue-500" />;
  }
}

// ----- Action color helper for Logs -----
const ACTION_COLORS: Record<string, string> = {
  LOGIN:                  'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50',
  LOGOUT:                 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  REGISTER:               'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50',
  UPDATE_ROLE:            'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50',
  UPDATE_ROLE_PERMISSIONS:'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/50',
  UPDATE_USER_PERMISSIONS:'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/50',
  ACTIVATE_USER:          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50',
  DEACTIVATE_USER:        'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50',
  UPLOAD_FILE:            'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/50',
  ANALYZE_FILE:           'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800/50',
  DELETE_FILE:            'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50',
  DELETE_FILE_BATCH:      'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50',
  REANALYZE_FILE:         'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800/50',
};

function actionBadgeClass(action: string): string {
  return ACTION_COLORS[action] || 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'ไม่ทราบขนาด';

  const units = ['bytes', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const value = unitIndex === 0 || size >= 10 ? Math.round(size) : Number(size.toFixed(1));
  return `${value} ${units[unitIndex]}`;
}

function shortenDetail(text: string, maxLength = 90): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 3)}...` : oneLine;
}

function formatLogDetail(log: ActivityLog): string {
  const detail = log.detail?.trim() || '';

  switch (log.action) {
    case 'LOGIN':
      return 'เข้าสู่ระบบ';
    case 'LOGOUT':
      return 'ออกจากระบบ';
    case 'REGISTER':
      return 'สร้างบัญชีใหม่';
    case 'ACTIVATE_USER':
      return 'เปิดใช้งานบัญชี';
    case 'DEACTIVATE_USER':
      return 'ระงับบัญชีผู้ใช้';
    case 'UPDATE_ROLE': {
      const roleMatch = detail.match(/(.+?)\s*(?:→|->)\s*(.+)/);
      return roleMatch ? `เปลี่ยนบทบาทจาก ${roleMatch[1].trim()} เป็น ${roleMatch[2].trim()}` : 'เปลี่ยนบทบาทผู้ใช้';
    }
    case 'UPDATE_ROLE_PERMISSIONS':
    case 'UPDATE_USER_PERMISSIONS': {
      if (detail.includes('เปิด:') || detail.includes('ปิด:') || detail.includes('ไม่มีสิทธิ์ที่เปลี่ยน')) {
        return detail;
      }

      const countMatch = detail.match(/เปิด\s+(\d+)\s*\/\s*(\d+)\s*สิทธิ์/);
      const countText = countMatch ? `: เปิด ${countMatch[1]}/${countMatch[2]} สิทธิ์` : '';
      return `อัปเดตสิทธิ์${countText}`;
    }
    case 'UPLOAD_FILE': {
      const sizeMatch = detail.match(/size=(\d+)\s*bytes/i);
      const extMatch = detail.match(/ext=\.?([a-z0-9]+)/i) || log.target_label?.match(/\.([a-z0-9]+)$/i);
      const fileType = extMatch ? extMatch[1].toUpperCase() : 'เสียง';
      const sizeText = sizeMatch ? ` ขนาด ${formatBytes(Number(sizeMatch[1]))}` : '';
      return `อัปโหลดไฟล์ ${fileType}${sizeText}`;
    }
    case 'ANALYZE_FILE':
      return 'สั่งวิเคราะห์ไฟล์';
    case 'REANALYZE_FILE':
      return 'วิเคราะห์ไฟล์ใหม่';
    case 'DELETE_FILE':
      return 'ลบไฟล์';
    case 'DELETE_FILE_BATCH': {
      const deletedMatch = detail.match(/deleted=(\d+)/i);
      return deletedMatch ? `ลบไฟล์ ${deletedMatch[1]} รายการ` : 'ลบไฟล์หลายรายการ';
    }
    default:
      return detail ? shortenDetail(detail) : '-';
  }
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN:  'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800/50',
  STAFF:  'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
  VIEWER: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

export default function AdminManagementPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('users');

  // Users tab state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Logs tab state
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logTotal, setLogTotal] = useState(0);
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [stats, setStats] = useState<LogStats | null>(null);

  // Individual Per-User Permissions State
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [allStaffUsers, setAllStaffUsers] = useState<AdminUser[]>([]);
  const [permSearch, setPermSearch] = useState('');
  const [permissionsByUser, setPermissionsByUser] = useState<Record<number, Record<string, boolean>>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Load Permissions by User from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fontai_user_permissions');
      if (saved) {
        setPermissionsByUser(JSON.parse(saved));
      }
      const savedUserId = localStorage.getItem('fontai_selected_target_user_id');
      if (savedUserId) {
        setSelectedUserId(Number(savedUserId));
      }
    } catch {}
  }, []);

  // Fetch users API
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (userSearch) params.set('search', userSearch);
      if (roleFilter) params.set('role', roleFilter);
      const res = await fetch(`${API_BASE}/api/v1/admin/users?${params}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const fetchedUsers: AdminUser[] = data.users || [];
      setUsers(fetchedUsers);

      const nonAdmins = fetchedUsers.filter((u) => u.role !== 'ADMIN');
      if (!userSearch && !roleFilter) {
        setAllStaffUsers(nonAdmins);
      }

      // Auto-select first non-admin user if not yet selected
      if (selectedUserId === null && nonAdmins.length > 0) {
        setSelectedUserId(nonAdmins[0].admin_user_id);
      }
    } catch (e) {
      console.error('fetch users error', e);
    } finally {
      setUsersLoading(false);
    }
  }, [userSearch, roleFilter, selectedUserId]);

  const handleChangeRole = async (u: AdminUser, newRole: string) => {
    if (newRole === u.role) return;
    if (u.admin_user_id === user?.admin_user_id) {
      alert('ไม่สามารถเปลี่ยน role ของตัวเองได้');
      return;
    }
    if (!confirm(`เปลี่ยน role ของ "${u.username}" จาก ${u.role} → ${newRole}?`)) return;

    setUpdatingId(u.admin_user_id);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/users/${u.admin_user_id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_role: newRole,
          actor_user_id: user?.admin_user_id,
          actor_username: user?.username,
          actor_role: user?.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'update failed');
      await fetchUsers();
    } catch (e: any) {
      alert('เกิดข้อผิดพลาด: ' + (e?.message || 'unknown'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleActive = async (u: AdminUser) => {
    if (u.admin_user_id === user?.admin_user_id) {
      alert('ไม่สามารถปิดบัญชีของตัวเองได้');
      return;
    }
    const newActive = !u.is_active;
    const verb = newActive ? 'เปิดใช้งาน' : 'ระงับ';
    if (!confirm(`${verb}บัญชี "${u.username}"?`)) return;

    setUpdatingId(u.admin_user_id);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/users/${u.admin_user_id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: newActive,
          actor_user_id: user?.admin_user_id,
          actor_username: user?.username,
          actor_role: user?.role,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'update failed');
      }
      await fetchUsers();
    } catch (e: any) {
      alert('เกิดข้อผิดพลาด: ' + (e?.message || 'unknown'));
    } finally {
      setUpdatingId(null);
    }
  };

  // Fetch Logs API
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (logSearch) params.set('search', logSearch);
      if (logActionFilter) params.set('action', logActionFilter);
      if (logDateFrom) params.set('date_from', logDateFrom);
      if (logDateTo) params.set('date_to', logDateTo);
      params.set('limit', '200');

      const res = await fetch(`${API_BASE}/api/v1/admin/logs?${params}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setLogs(data.logs || []);
      setLogTotal(data.total || 0);
    } catch (e) {
      console.error('fetch logs error', e);
    } finally {
      setLogsLoading(false);
    }
  }, [logSearch, logActionFilter, logDateFrom, logDateTo]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/logs/stats`);
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('fetch stats error', e);
    }
  }, []);

  // Effects
  useEffect(() => {
    if (tab === 'users' || tab === 'permissions') fetchUsers();
  }, [tab, fetchUsers]);

  useEffect(() => {
    if (tab === 'logs') {
      fetchLogs();
      fetchStats();
    }
  }, [tab, fetchLogs, fetchStats]);

  // Non-admin users list and currently selected target user
  const nonAdminUsers = allStaffUsers.length > 0 
    ? allStaffUsers 
    : users.filter((u) => u.role !== 'ADMIN');
  const selectedTargetUser = nonAdminUsers.find((u) => u.admin_user_id === selectedUserId) 
    || users.find((u) => u.admin_user_id === selectedUserId) 
    || nonAdminUsers[0];

  // Helper to retrieve permissions for a specific user
  const getUserPermissions = useCallback((targetUser: AdminUser | undefined): Record<string, boolean> => {
    if (!targetUser) return {};
    const userPerms = permissionsByUser[targetUser.admin_user_id];
    if (userPerms) return userPerms;

    return getDefaultPermissions(targetUser);
  }, [permissionsByUser]);

  const currentTargetPermissions = getUserPermissions(selectedTargetUser);

  // Permission Handlers per User
  const handleTogglePermission = (permId: string) => {
    if (!selectedTargetUser) return;
    const targetId = selectedTargetUser.admin_user_id;
    const currentPerms = getUserPermissions(selectedTargetUser);
    const updatedPerms = {
      ...currentPerms,
      [permId]: !currentPerms[permId],
    };

    setPermissionsByUser((prev) => ({
      ...prev,
      [targetId]: updatedPerms,
    }));
    setIsDirty(true);
  };

  const handleToggleAll = (enable: boolean) => {
    if (!selectedTargetUser) return;
    const targetId = selectedTargetUser.admin_user_id;
    const updatedPerms: Record<string, boolean> = {};
    ALL_PERMISSIONS.forEach((p) => {
      updatedPerms[p.id] = enable;
    });

    setPermissionsByUser((prev) => ({
      ...prev,
      [targetId]: updatedPerms,
    }));
    setIsDirty(true);
  };

  const handleResetDefaults = () => {
    if (!selectedTargetUser) return;
    const targetId = selectedTargetUser.admin_user_id;
    const updatedPerms: Record<string, boolean> = {};
    ALL_PERMISSIONS.forEach((p) => {
      updatedPerms[p.id] = selectedTargetUser.role === 'STAFF' ? p.defaultStaff : p.defaultViewer;
    });

    setPermissionsByUser((prev) => ({
      ...prev,
      [targetId]: updatedPerms,
    }));
    setIsDirty(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedTargetUser) return;
    try {
      const savedPermissionsByUser = readSavedPermissionsByUser();
      const previousPerms = savedPermissionsByUser[selectedTargetUser.admin_user_id]
        || getDefaultPermissions(selectedTargetUser);

      localStorage.setItem('fontai_user_permissions', JSON.stringify(permissionsByUser));
      setIsDirty(false);
      setSaveSuccessMsg(`บันทึกการตั้งค่าสิทธิ์สำหรับคุณ "${selectedTargetUser.full_name}" (@${selectedTargetUser.username}) เรียบร้อยแล้ว!`);
      setTimeout(() => setSaveSuccessMsg(''), 4000);

      // Log activity to backend
      if (user) {
        const currentPerms = getUserPermissions(selectedTargetUser);
        const fullDetail = buildPermissionChangeDetail(selectedTargetUser, previousPerms, currentPerms);

        await fetch(`${API_BASE}/api/v1/admin/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actor_user_id: user.admin_user_id,
            actor_username: user.username,
            actor_role: user.role,
            action: 'UPDATE_USER_PERMISSIONS',
            target_type: 'user',
            target_id: String(selectedTargetUser.admin_user_id),
            target_label: selectedTargetUser.full_name,
            detail: fullDetail,
          }),
        }).catch(() => {});
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  };

  // Filter permission groups based on search term
  const filteredGroups = PERMISSION_GROUPS.map((group) => {
    if (!permSearch) return group;
    const q = permSearch.toLowerCase();
    const matchedPerms = group.permissions.filter(
      (p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
    return {
      ...group,
      permissions: matchedPerms,
    };
  }).filter((group) => group.permissions.length > 0);

  // Count active permissions for currently selected user
  const activeCount = selectedTargetUser
    ? ALL_PERMISSIONS.filter((p) => currentTargetPermissions[p.id]).length
    : 0;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-4 sm:p-5 lg:p-6 pb-28">
        <div className="mx-auto w-full max-w-[1280px]">
          {/* Header */}
          <PageHeader
            eyebrow="User Roles · Activity Logs · User Permissions"
            title="Admin Management"
            description="จัดการผู้ใช้ สิทธิ์ และประวัติการใช้งานระบบ"
            icon={ShieldAlert}
            accentColor="#4F46E5"
            className="mb-6"
          />

          {/* Main Tab Switcher */}
          <div className="flex w-full max-w-full items-center justify-between gap-2 overflow-x-auto p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-6 shadow-sm">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTab('users')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  tab === 'users'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <UsersIcon size={16} />
                User Management
              </button>
              <button
                onClick={() => setTab('logs')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  tab === 'logs'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <ScrollText size={16} />
                Activity Logs
              </button>
              {/* ★ แท็บตั้งค่าสิทธิ์ Staff รายบุคคล (เห็นเฉพาะ Admin) */}
              {user?.role === 'ADMIN' && (
                <button
                  onClick={() => setTab('permissions')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    tab === 'permissions'
                      ? '!bg-violet-600 bg-violet-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  style={{
                    backgroundColor: tab === 'permissions' ? '#7c3aed' : undefined,
                    color: tab === 'permissions' ? '#ffffff' : undefined,
                  }}
                >
                  <Sliders size={16} className={tab === 'permissions' ? 'text-white' : 'text-violet-500'} />
                  <span>ตั้งค่าสิทธิ์รายบุคคล</span>
                  {selectedTargetUser && (
                    <span
                      className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ml-1 truncate max-w-[140px] transition-colors ${
                        tab === 'permissions'
                          ? 'bg-white/20 text-white'
                          : 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200 dark:border-violet-800'
                      }`}
                    >
                      {selectedTargetUser.full_name}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Notification Toast */}
          {saveSuccessMsg && (
            <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-sm font-medium flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="text-emerald-500 flex-shrink-0" size={20} />
                <span>{saveSuccessMsg}</span>
              </div>
              <button onClick={() => setSaveSuccessMsg('')} className="text-emerald-600 dark:text-emerald-400 hover:opacity-75 cursor-pointer">
                <X size={16} />
              </button>
            </div>
          )}

          {/* === Tab: Users === */}
          {tab === 'users' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="ค้นหา username, ชื่อ, email..."
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="">ทุก Role</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="STAFF">STAFF</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                  <button
                    onClick={() => fetchUsers()}
                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-2"
                  >
                    <RefreshCw size={14} className={usersLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ID</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Created</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {usersLoading ? (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">กำลังโหลด...</td></tr>
                      ) : users.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">ไม่พบข้อมูล</td></tr>
                      ) : (
                        users.map((u) => {
                          const isMe = u.admin_user_id === user?.admin_user_id;
                          return (
                            <tr key={u.admin_user_id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                              <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-mono">#{u.admin_user_id}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold">
                                    {u.full_name.charAt(0)}
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                      {u.full_name}
                                      {isMe && <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">YOU</span>}
                                    </div>
                                    <div className="text-xs text-slate-400 font-mono">@{u.username}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{u.email || '-'}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2.5 py-1 text-[11px] font-bold rounded-full border ${ROLE_COLORS[u.role]}`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {u.is_active ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                    <CheckCircle2 size={12} /> Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                                    <XCircle size={12} /> Suspended
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
                                {u.created_at?.split(' ')[0]}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  {/* ★ ปุ่มตั้งค่าสิทธิ์รายบุคคลสำหรับ Staff/Viewer แต่ละคน */}
                                  {user?.role === 'ADMIN' && u.role !== 'ADMIN' && (
                                    <button
                                      onClick={() => {
                                        setSelectedUserId(u.admin_user_id);
                                        setTab('permissions');
                                      }}
                                      className="px-2.5 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 rounded-md hover:bg-violet-100 dark:hover:bg-violet-900/50 cursor-pointer flex items-center gap-1 transition-colors"
                                      title={`ตั้งค่าสิทธิ์สำหรับคุณ ${u.full_name}`}
                                    >
                                      <Sliders size={12} />
                                      สิทธิ์
                                    </button>
                                  )}
                                  <select
                                    value={u.role}
                                    onChange={(e) => handleChangeRole(u, e.target.value)}
                                    disabled={isMe || updatingId === u.admin_user_id}
                                    className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                    title={isMe ? 'ไม่สามารถเปลี่ยน role ของตัวเองได้' : 'เปลี่ยน role'}
                                  >
                                    <option value="ADMIN">ADMIN</option>
                                    <option value="STAFF">STAFF</option>
                                    <option value="VIEWER">VIEWER</option>
                                  </select>
                                  <button
                                    onClick={() => handleToggleActive(u)}
                                    disabled={isMe || updatingId === u.admin_user_id}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-md border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                      u.is_active
                                        ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 dark:border-red-800/50'
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50'
                                    }`}
                                    title={isMe ? 'ไม่สามารถ disable ตัวเองได้' : (u.is_active ? 'ระงับบัญชี' : 'เปิดใช้งาน')}
                                  >
                                    {u.is_active ? 'Suspend' : 'Activate'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* === Tab: Logs === */}
          {tab === 'logs' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder="ค้นหา action, user, target..."
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <select
                    value={logActionFilter}
                    onChange={(e) => setLogActionFilter(e.target.value)}
                    className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="">All Actions</option>
                    <option value="LOGIN">LOGIN</option>
                    <option value="LOGOUT">LOGOUT</option>
                    <option value="REGISTER">REGISTER</option>
                    <option value="UPDATE_ROLE">UPDATE_ROLE</option>
                    <option value="UPDATE_ROLE_PERMISSIONS">UPDATE_ROLE_PERMISSIONS</option>
                    <option value="UPDATE_USER_PERMISSIONS">UPDATE_USER_PERMISSIONS</option>
                    <option value="ACTIVATE_USER">ACTIVATE_USER</option>
                    <option value="DEACTIVATE_USER">DEACTIVATE_USER</option>
                    <option value="UPLOAD_FILE">UPLOAD_FILE</option>
                    <option value="ANALYZE_FILE">ANALYZE_FILE</option>
                    <option value="DELETE_FILE">DELETE_FILE</option>
                    <option value="DELETE_FILE_BATCH">DELETE_FILE_BATCH</option>
                    <option value="REANALYZE_FILE">REANALYZE_FILE</option>
                  </select>
                  <input
                    type="date"
                    value={logDateFrom}
                    onChange={(e) => setLogDateFrom(e.target.value)}
                    className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 cursor-pointer"
                    title="ตั้งแต่วันที่"
                  />
                  <input
                    type="date"
                    value={logDateTo}
                    onChange={(e) => setLogDateTo(e.target.value)}
                    className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 cursor-pointer"
                    title="ถึงวันที่"
                  />
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {logTotal.toLocaleString()} logs · แสดง {logs.length}
                  </span>
                  <button
                    onClick={() => fetchLogs()}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px] table-fixed">
                    <colgroup>
                      <col className="w-[160px]" />
                      <col className="w-[160px]" />
                      <col className="w-[240px]" />
                      <col className="w-[360px]" />
                      <col className="w-[250px]" />
                      <col className="w-[130px]" />
                    </colgroup>
                    <thead className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Time</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actor</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Target</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Detail</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {logsLoading ? (
                        <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">กำลังโหลด...</td></tr>
                      ) : logs.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">ไม่พบ logs</td></tr>
                      ) : (
                        logs.map((log) => {
                          const detailText = formatLogDetail(log);

                          return (
                          <tr key={log.log_id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <td className="px-4 py-3 align-top text-xs text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                              {log.created_at}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{log.actor_username}</div>
                              <div className="text-[10px] text-slate-400 uppercase tracking-wider">{log.actor_role}</div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border ${actionBadgeClass(log.action)}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300 break-words">
                              {log.target_label || (log.target_id ? `#${log.target_id}` : '-')}
                              {log.target_type && (
                                <div className="text-[10px] text-slate-400 mt-0.5">{log.target_type}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-slate-600 dark:text-slate-300">
                              <span className="block w-full whitespace-normal break-words leading-relaxed" title={detailText}>
                                {detailText}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top text-[10px] text-slate-400 font-mono whitespace-nowrap">{log.ip_address || '-'}</td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* === Tab: Individual User Permissions (แยกสิทธิ์รายบุคคล) === */}
          {tab === 'permissions' && user?.role === 'ADMIN' && (
            <div className="space-y-6">
              {/* Header: แสดงชื่อ User ที่กำลังถูกตั้งค่าสิทธิ์อย่างชัดเจน */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  {/* Left: User Profile info */}
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xl font-black shadow-md shadow-indigo-500/20 flex-shrink-0">
                      {selectedTargetUser?.full_name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 text-xs font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-full flex items-center gap-1">
                          <UserCheck size={12} /> สิทธิ์รายบุคคล (Individual Permission)
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${ROLE_COLORS[selectedTargetUser?.role || 'STAFF']}`}>
                          {selectedTargetUser?.role || 'STAFF'}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          ID: #{selectedTargetUser?.admin_user_id}
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">
                        กำลังตั้งค่าสิทธิ์ให้: <span className="text-indigo-600 dark:text-indigo-400">{selectedTargetUser?.full_name || 'กรุณาเลือกผู้ใช้งาน'}</span>
                        {selectedTargetUser && (
                          <span className="text-sm font-normal text-slate-400 ml-2 font-mono">(@{selectedTargetUser.username})</span>
                        )}
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {selectedTargetUser?.email ? `Email: ${selectedTargetUser.email} · ` : ''}กำหนดสิทธิ์การมองเห็นและการใช้งานในระบบเฉพาะของคุณ {selectedTargetUser?.full_name}
                      </p>
                    </div>
                  </div>

                  {/* Right: User Switcher Dropdown & Save Button */}
                  <div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">สลับผู้ใช้งาน:</label>
                      <select
                        value={selectedTargetUser?.admin_user_id || ''}
                        onChange={(e) => setSelectedUserId(Number(e.target.value))}
                        className="px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 cursor-pointer"
                      >
                        {nonAdminUsers.length === 0 ? (
                          <option value="">ไม่มีผู้ใช้งาน Staff / Viewer</option>
                        ) : (
                          nonAdminUsers.map((u) => (
                            <option key={u.admin_user_id} value={u.admin_user_id}>
                              {u.full_name} (@{u.username}) - {u.role}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <button
                      onClick={handleSavePermissions}
                      disabled={!selectedTargetUser}
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save size={14} />
                      บันทึกสิทธิ์
                    </button>
                  </div>
                </div>

                {/* Quick Toolbar */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="text"
                      value={permSearch}
                      onChange={(e) => setPermSearch(e.target.value)}
                      placeholder="ค้นหาชื่อสิทธิ์หรือคำอธิบาย..."
                      className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                    />
                    {permSearch && (
                      <button onClick={() => setPermSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1">
                      เปิดใช้งานสำหรับ {selectedTargetUser?.full_name?.split(' ')[0] || 'User'}: <strong className="text-indigo-600 dark:text-indigo-400">{activeCount}</strong> / {ALL_PERMISSIONS.length} สิทธิ์
                    </span>
                    <button
                      onClick={() => handleToggleAll(true)}
                      className="px-2.5 py-1 font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer transition-colors"
                    >
                      เปิดทั้งหมด
                    </button>
                    <button
                      onClick={() => handleToggleAll(false)}
                      className="px-2.5 py-1 font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-md hover:bg-rose-100 cursor-pointer transition-colors"
                    >
                      ปิดทั้งหมด
                    </button>
                    <button
                      onClick={handleResetDefaults}
                      className="px-2.5 py-1 font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-200 cursor-pointer transition-colors flex items-center gap-1"
                    >
                      <RotateCcw size={11} />
                      คืนค่าเดิม
                    </button>
                  </div>
                </div>
              </div>

              {/* Module Permission Cards */}
              <div className="space-y-4">
                {!selectedTargetUser ? (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center text-slate-400">
                    ยังไม่มีข้อมูลผู้ใช้งาน Staff หรือ Viewer ในระบบ
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center text-slate-400">
                    ไม่พบสิทธิ์ที่ตรงกับคำค้นหา "{permSearch}"
                  </div>
                ) : (
                  filteredGroups.map((group) => {
                    const groupActiveCount = group.permissions.filter((p) => currentTargetPermissions[p.id]).length;
                    return (
                      <div
                        key={group.moduleId}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden"
                      >
                        {/* Module Card Header */}
                        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-700/30 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
                              {renderModuleIcon(group.iconName)}
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{group.moduleName}</h3>
                              <p className="text-[11px] text-slate-400">{group.description}</p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                            {groupActiveCount} / {group.permissions.length} เปิดใช้งาน
                          </span>
                        </div>

                        {/* Module Permission Items */}
                        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                          {group.permissions.map((p) => {
                            const isEnabled = !!currentTargetPermissions[p.id];
                            return (
                              <div
                                key={p.id}
                                className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-700/20 transition-colors"
                              >
                                <div className="flex-1 pr-3">
                                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-0.5">
                                    {p.title}
                                  </h4>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {p.description}
                                  </p>
                                </div>

                                {/* Modern Switch Toggle */}
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                                    isEnabled
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                                      : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                  }`}>
                                    {isEnabled ? 'อนุญาต' : 'ปิดกั้น'}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => handleTogglePermission(p.id)}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                      isEnabled
                                        ? '!bg-indigo-600'
                                        : '!bg-slate-300 dark:!bg-slate-600'
                                    }`}
                                    style={{
                                      backgroundColor: isEnabled ? '#4f46e5' : undefined,
                                    }}
                                    role="switch"
                                    aria-checked={isEnabled}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out ${
                                        isEnabled ? 'translate-x-5' : 'translate-x-0'
                                      }`}
                                      style={{
                                        backgroundColor: '#ffffff',
                                      }}
                                    />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Floating Bottom Save Bar */}
              {isDirty && selectedTargetUser && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 animate-in slide-in-from-bottom-5">
                  <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-indigo-500/40 flex items-center justify-between gap-4 backdrop-blur-md">
                    <div className="flex items-center gap-2.5">
                      <AlertCircle className="text-amber-400 flex-shrink-0" size={18} />
                      <p className="text-xs font-semibold text-white">
                        มีการเปลี่ยนแปลงสิทธิ์ของคุณ {selectedTargetUser.full_name} ที่ยังไม่ได้บันทึก
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          try {
                            const saved = localStorage.getItem('fontai_user_permissions');
                            if (saved) setPermissionsByUser(JSON.parse(saved));
                          } catch {}
                          setIsDirty(false);
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={handleSavePermissions}
                        className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Save size={13} />
                        บันทึกการเปลี่ยนแปลง
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
