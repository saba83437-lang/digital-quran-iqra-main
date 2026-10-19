// ============================================================
//  طرح نجم - پنل مدیر / نسخه نهایی با «ساعت اعمال نمرات»
//  مسیر مقصد: src/routes/admin.najm.tsx
//
//  تغییرات کلیدی:
//  - daily_apply_time روی ترم (مثلاً "16:00")
//  - is_applied روی جلسات (boolean)
//  - اعمال خودکار نمرات رسیده به ساعت مقرر
//  - دکمه اعمال دستی و اعمال همه
//  - فیلتر رتبه‌بندی فقط بر اساس جلسات اعمال‌شده
//
//  مهاجرت دیتابیس لازم:
//  ALTER TABLE najm_terms ADD COLUMN daily_apply_time TEXT DEFAULT NULL;
//  ALTER TABLE najm_sessions ADD COLUMN is_applied BOOLEAN DEFAULT true;
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Award,
  Crown,
  Loader2,
  Medal,
  RefreshCw,
  Star,
  Trophy,
  Search,
  Filter,
  Plus,
  CheckCircle2,
  CalendarDays,
  Eye,
  Trash2,
  History,
  UserRound,
  ClipboardList,
  Pencil,
  Save,
  RotateCcw,
  Clock,
  CheckCheck,
  Zap,
  AlertCircle,
  BarChart3,
  Settings2,
  ChevronUp,
  ChevronDown,
  ClipboardCheck,
  ListPlus,
  HeartHandshake,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ConductRecoveryHistoryDialog } from "@/features/recitation/components/conduct-recovery-history-dialog";
import {
  isAbsent,
  computeAdjustedTotals,
  NAJM_ABSENCE_KINDS,
  NAJM_ABSENCE_POLICY_ACTIONS,
  NAJM_ATTENDANCE_KEY,
  NAJM_CORE_ITEM_KEYS,
  NAJM_DEFAULT_ITEMS,
  NAJM_DEFAULT_QUEST_ENGINE_SETTINGS,
  NAJM_DEFAULT_SETTINGS,
  NAJM_EXAM_KEY,
  NAJM_ITEM_KIND_META,
  activeNajmItems,
  computeSessionScoreWithItems,
  getNajmItemValue,
  isCoreNajmColumn,
  loadNajmQuestEngineSettings,
  loadNajmScoreItems,
  loadNajmSessionSettings,
  najmAttendanceMax,
  normalizeRecordWithItems,
  saveNajmQuestEngineSettings,
  saveNajmSessionSettings,
  sortNajmItems,
  withNajmItemValue,
  type NajmAbsenceKind,
  type NajmAbsencePolicyAction,
  type NajmItemKind,
  type NajmQuestEngineSettings,
  type NajmScoreItem,
  type NajmSessionSettings,
} from "@/lib/najm";

export const Route = createFileRoute("/admin/najm")({
  head: () => ({
    meta: [
      { title: "طرح نجم — پنل مدیر" },
      {
        name: "description",
        content: "مدیریت ترم‌ها، تنظیمات و جلسات طرح نجم",
      },
    ],
  }),
  component: AdminNajmPage,
});

/* ----------------------------- انواع ----------------------------- */
interface ClassRow {
  id: string;
  name: string;
  level: string | null;
  term: string | null;
  academic_year: string | null;
  deleted_at?: string | null; // حذف نرم: کلاس تا ۳۰ روز قابل بازیابی است و نباید در آمار/فیلترها دیده شود
  is_active?: boolean | null;
}

interface SessionRow {
  id: string;
  teacher_id?: string | null;
  class_id: string;
  class_name: string | null;
  session_date: string;
  term: string;
  academic_year: string;
  created_at: string;
  is_applied?: boolean | null;
}

interface NajmTermRow {
  id: string;
  title: string;
  term: string;
  academic_year: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
  absence_score_ratio?: number;
  daily_apply_time?: string | null;
}

interface RecordRow {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string | null;
  session_score: number | string | null;
  attendance?: number;
}

interface StudentStanding {
  studentId: string;
  studentName: string;
  score: number;
  sessionsCount: number;
  className?: string;
  photoUrl?: string;
}

interface StudentProfile {
  name?: string;
  photoUrl?: string;
}

interface TeacherProfile {
  name: string;
}

interface ManagementSessionRow extends SessionRow {
  teacherName: string;
  recordsCount: number;
  totalScore: number;
}

interface ClassStanding {
  classId: string;
  className: string;
  level: string | null;
  totalScore: number;
  sessionsCount: number;
  studentsCount: number;
  topFive: StudentStanding[];
  absentReplaced?: number;
}

/* ----------------------------- کمکی‌ها ----------------------------- */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const STUDENT_FILES_BUCKET = "student-files";
const TERM_LABELS: Record<string, string> = {
  term1: "ترم اول",
  term2: "ترم دوم",
  summer: "تابستان",
};

function termLabel(term: string | null | undefined): string {
  if (!term) return "-";
  return TERM_LABELS[term] ?? term;
}

function convertDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function examDisplay(examRaw: number): number {
  return examRaw + 10;
}

function clampScore(value: number | string | null | undefined, min: number, max: number): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

/** دریافت تاریخ امروز به فرمت YYYY-MM-DD در منطقه ایران */
function getIranDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** دریافت ساعت فعلی به فرمت HH:MM در منطقه ایران */
function getCurrentIranTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** تبدیل created_at (ISO) به تاریخ ایران YYYY-MM-DD */
function getSessionIranDate(isoString: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
}

/** بررسی اینکه آیا یک جلسه باید اعمال بشه */
function shouldAutoApply(session: SessionRow, dailyApplyTime: string): boolean {
  if (session.is_applied) return false;
  const iranDate = getIranDate();
  const iranTime = getCurrentIranTime();
  const sessionDate = getSessionIranDate(session.created_at);
  // جلسه‌های روزهای گذشته → حتماً اعمال بشن
  if (sessionDate < iranDate) return true;
  // جلسه‌های امروز → فقط اگر ساعت فعلی >= ساعت اعمال
  if (sessionDate === iranDate && iranTime >= dailyApplyTime) return true;
  return false;
}

/**
 * محاسبه امتیاز جلسه در حالت ویرایش مدیر — پویا بر اساس آیتم‌های طرح نجم.
 * (مدیر همه آیتم‌ها — حتی غیرفعالشده‌ها — را می‌بیند تا سوابق قدیمی «منجمد»
 * و کامل نمایش داده شوند.)
 */
function computeEditableSessionScore(record: Record<string, any>, items: NajmScoreItem[]): number {
  return computeSessionScoreWithItems(record, items);
}

/**
 * «تمیزکردن» رکورد هنگام ویرایش مدیر بر اساس آیتم‌های طرح نجم:
 * - مقادیر به بازه ۰..سقف خودشان محدود می‌شوند
 * - اگر حضور ۰ باشد بقیه آیتم‌ها صفر می‌شوند
 */
function normalizeEditableRecord(
  record: Record<string, any>,
  items: NajmScoreItem[],
): Record<string, any> {
  const normalized = normalizeRecordWithItems(record, items);
  return { ...normalized, session_score: computeEditableSessionScore(normalized, items) };
}

function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "ن";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0);
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
}

function rankLabel(index: number): string {
  return convertDigits(index + 1);
}

function rankIcon(index: number) {
  if (index === 0) return <Crown className="h-4 w-4" />;
  if (index === 1) return <Medal className="h-4 w-4" />;
  if (index === 2) return <Award className="h-4 w-4" />;
  return <span className="font-bold text-xs">{rankLabel(index)}</span>;
}

function extractStudentPhotoUrl(row: Record<string, any> | null | undefined): string | undefined {
  if (!row) return undefined;
  const possibleKeys = [
    "avatar_url",
    "avatarUrl",
    "photo_url",
    "photoUrl",
    "profile_photo_url",
    "profilePhotoUrl",
    "profile_image_url",
    "profileImageUrl",
    "profile_picture_url",
    "profilePictureUrl",
    "image_url",
    "imageUrl",
    "picture_url",
    "pictureUrl",
    "avatar",
    "photo",
    "image",
    "picture",
    "profile_photo",
    "profile_image",
    "profile_picture",
  ];
  for (const key of possibleKeys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function getStudentPhotoStoragePath(value?: string | null): string {
  if (!value) return "";
  if (value.startsWith("blob:") || value.startsWith("data:")) return "";
  const marker = `/${STUDENT_FILES_BUCKET}/`;
  if (value.includes(marker)) return decodeURIComponent(value.split(marker)[1].split("?")[0]);
  if (/^https?:\/\//i.test(value)) return "";
  return value.split("?")[0].replace(/^\//, "");
}

async function resolveStudentPhotoUrl(value?: string | null): Promise<string> {
  if (!value) return "";
  if (value.startsWith("blob:") || value.startsWith("data:")) return value;
  const path = getStudentPhotoStoragePath(value);
  if (!path) return value;
  const { data, error } = await supabase.storage
    .from(STUDENT_FILES_BUCKET)
    .createSignedUrl(path, 60 * 20);
  if (error) {
    console.error("student photo signed url error:", error);
    return "";
  }
  return data.signedUrl;
}

function aggregateStudents(
  records: RecordRow[],
  sessionById?: Map<string, SessionRow>,
  studentProfiles?: Record<string, StudentProfile>,
): StudentStanding[] {
  const map = new Map<string, StudentStanding>();
  for (const r of records) {
    const current = map.get(r.student_id) ?? {
      studentId: r.student_id,
      studentName: r.student_name || studentProfiles?.[r.student_id]?.name || "بدون نام",
      score: 0,
      sessionsCount: 0,
      className: sessionById?.get(r.session_id)?.class_name || undefined,
      photoUrl: studentProfiles?.[r.student_id]?.photoUrl,
    };
    current.score += toNumber(r.session_score);
    current.sessionsCount += 1;
    if (r.student_name) current.studentName = r.student_name;
    if (!current.photoUrl) current.photoUrl = studentProfiles?.[r.student_id]?.photoUrl;
    if (!current.className)
      current.className = sessionById?.get(r.session_id)?.class_name || undefined;
    map.set(r.student_id, current);
  }
  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

/* ----------------------------- صفحه ----------------------------- */
function AdminNajmPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [allSessions, setAllSessions] = useState<SessionRow[]>([]);
  const [allRecords, setAllRecords] = useState<RecordRow[]>([]);
  const [studentProfiles, setStudentProfiles] = useState<Record<string, StudentProfile>>({});
  const [teacherProfiles, setTeacherProfiles] = useState<Record<string, TeacherProfile>>({});
  const [terms, setTerms] = useState<NajmTermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [termSaving, setTermSaving] = useState(false);
  const [classFilter, setClassFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [managementScope, setManagementScope] = useState("active");
  const [managementClassFilter, setManagementClassFilter] = useState("all");
  const [managementSearch, setManagementSearch] = useState("");
  const [selectedManagementSession, setSelectedManagementSession] =
    useState<ManagementSessionRow | null>(null);
  const [managementRecords, setManagementRecords] = useState<any[]>([]);
  const [managementDraftRecords, setManagementDraftRecords] = useState<any[]>([]);
  const [managementEditMode, setManagementEditMode] = useState(false);
  const [managementEditSaving, setManagementEditSaving] = useState(false);
  const [managementDetailOpen, setManagementDetailOpen] = useState(false);
  const [managementDetailLoading, setManagementDetailLoading] = useState(false);
  const [managementDeletingId, setManagementDeletingId] = useState<string | null>(null);
  const [applyingSessionId, setApplyingSessionId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [newTermTitle, setNewTermTitle] = useState("");
  const [newTermKind, setNewTermKind] = useState("term1");
  const [newTermYear, setNewTermYear] = useState("۱۴۰۴-۱۴۰۵");
  const [newTermStart, setNewTermStart] = useState("");
  const [newTermEnd, setNewTermEnd] = useState("");
  const [newTermNote, setNewTermNote] = useState("");
  const [newTermAbsenceRatio, setNewTermAbsenceRatio] = useState(60);
  const [newTermApplyTime, setNewTermApplyTime] = useState("");

  /* ----- مدیریت آیتم‌های ثبت جلسه ----- */
  const [scoreItems, setScoreItems] = useState<NajmScoreItem[]>(NAJM_DEFAULT_ITEMS);
  const [najmSettings, setNajmSettings] = useState<NajmSessionSettings>(NAJM_DEFAULT_SETTINGS);
  const [questSettings, setQuestSettings] = useState<NajmQuestEngineSettings>(
    NAJM_DEFAULT_QUEST_ENGINE_SETTINGS,
  );
  const [questSettingsSaving, setQuestSettingsSaving] = useState(false);
  const [itemSavingKey, setItemSavingKey] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemKind, setNewItemKind] = useState<NajmItemKind>("positive");
  const [newItemMax, setNewItemMax] = useState(5);
  const [newItemWeight, setNewItemWeight] = useState(1);
  const [newItemAdding, setNewItemAdding] = useState(false);
  const [itemDeletingKey, setItemDeletingKey] = useState<string | null>(null);
  const [recoveryEnabled, setRecoveryEnabled] = useState(true);
  const [recoveryAllowFull, setRecoveryAllowFull] = useState(true);
  const [recoveryNotifyParent, setRecoveryNotifyParent] = useState(false);
  const [recoverySessionsLimit, setRecoverySessionsLimit] = useState(2);
  const [recoverySettingsSaving, setRecoverySettingsSaving] = useState(false);

  /* ----- آمار دقیق و بروز (شمارش مستقیم از دیتابیس) ----- */
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [classesTotal, setClassesTotal] = useState(0);
  const [pendingExact, setPendingExact] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard(showToast = false, silent = false) {
    if (!showToast && !silent) setLoading(true);
    setRefreshing(true);

    // آیتم‌های ثبت جلسه + تنظیمات (مرکز کنترل فرم ثبت جلسه استاد)
    const [loadedItems, loadedSettings, loadedQuestSettings] = await Promise.all([
      loadNajmScoreItems(),
      loadNajmSessionSettings(),
      loadNajmQuestEngineSettings(),
    ]);
    setScoreItems(sortNajmItems(loadedItems));
    setNajmSettings(loadedSettings);
    setQuestSettings(loadedQuestSettings);

    const { data: recoveryRows } = await supabase
      .from("najm_settings")
      .select("key, value")
      .in("key", [
        "conduct_recovery_enabled",
        "conduct_recovery_sessions_limit",
        "conduct_recovery_allow_full",
        "conduct_recovery_notify_parent",
      ]);
    for (const row of (recoveryRows ?? []) as Array<{ key: string; value: any }>) {
      if (row.key === "conduct_recovery_enabled") setRecoveryEnabled(row.value?.enabled !== false);
      if (row.key === "conduct_recovery_allow_full")
        setRecoveryAllowFull(row.value?.enabled !== false);
      if (row.key === "conduct_recovery_notify_parent")
        setRecoveryNotifyParent(row.value?.enabled === true);
      if (row.key === "conduct_recovery_sessions_limit") {
        const count = Number(row.value?.count);
        if (Number.isFinite(count) && count >= 1 && count <= 2)
          setRecoverySessionsLimit(Math.round(count));
      }
    }

    const { data: termData } = await supabase
      .from("najm_terms")
      .select(
        "id, title, term, academic_year, starts_at, ends_at, is_active, note, created_at, updated_at, absence_score_ratio, daily_apply_time",
      )
      .order("created_at", { ascending: false });
    setTerms((termData ?? []) as NajmTermRow[]);

    const { data: cls } = await supabase
      .from("classes")
      .select("id, name, level, term, academic_year, deleted_at, is_active")
      .order("name");
    const classList = (cls ?? []) as ClassRow[];
    setClasses(classList);

    if (classList.length === 0) {
      setAllSessions([]);
      setAllRecords([]);
      setStudentProfiles({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: studentProfileData } = await supabase
      .from("students")
      .select("id, name, avatar_url, poster_avatar_url")
      .limit(10000);
    const profileMap: Record<string, StudentProfile> = {};
    for (const row of (studentProfileData ?? []) as any[]) {
      if (row.id)
        profileMap[String(row.id)] = { name: row.name, photoUrl: extractStudentPhotoUrl(row) };
    }
    setStudentProfiles(profileMap);

    const { data: teacherProfileData } = await supabase
      .from("teachers")
      .select("id, name, avatar, avatar_url")
      .limit(2000);
    const teacherMap: Record<string, TeacherProfile> = {};
    for (const row of (teacherProfileData ?? []) as any[]) {
      if (row.id)
        teacherMap[String(row.id)] = { name: row.name || row.full_name || "استاد بدون نام" };
    }
    setTeacherProfiles(teacherMap);

    const { data: allSessionData } = await supabase
      .from("najm_sessions")
      .select(
        "id, teacher_id, class_id, class_name, session_date, term, academic_year, created_at, is_applied",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    const allSessionList = (allSessionData ?? []) as SessionRow[];
    setAllSessions(allSessionList);

    const allSessionIds = allSessionList.map((s) => s.id);
    if (allSessionIds.length > 0) {
      const { data: allRecData } = await supabase
        .from("najm_session_records")
        .select("id, session_id, student_id, student_name, session_score, attendance")
        .in("session_id", allSessionIds)
        .limit(30000);
      setAllRecords((allRecData ?? []) as RecordRow[]);
    } else {
      setAllRecords([]);
    }

    // اعمال خودکار نمرات رسیده به ساعت مقرر
    await autoApplySessions(
      allSessionList,
      terms.length > 0 ? ((termData ?? []) as NajmTermRow[]) : [],
    );

    // شمارش‌های دقیق و بروز (مستقل از محدودیت بارگذاری جدول‌ها)
    await refreshStats((termData ?? []) as NajmTermRow[]);

    if (showToast) toast.success("طرح نجم به‌روز شد.");
    setLastUpdatedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }

  /**
   * شمارش دقیق کلاس‌ها/جلسات/معلق‌ها مستقیم از دیتابیس + اعمال خودکار
   * جلسات رسیده به ساعت مقرر — سبک و مناسب اجرای دوره‌ای.
   */
  async function refreshStats(currentTerms?: NajmTermRow[]) {
    try {
      const termsList = currentTerms ?? terms;
      const active = termsList.find((t) => t.is_active) ?? null;

      // ۱) اگر «ساعت اعمال نمرات» تعیین شده، ابتدا جلسات معلقِ رسیده اعمال شوند
      if (active?.daily_apply_time) {
        const { data: pendingRows } = await supabase
          .from("najm_sessions")
          .select(
            "id, teacher_id, class_id, class_name, session_date, term, academic_year, created_at, is_applied",
          )
          .or("is_applied.eq.false,is_applied.is.null")
          .limit(1000);
        if (pendingRows && pendingRows.length > 0) {
          await autoApplySessions(pendingRows as SessionRow[], termsList);
        }
      }

      // ۲) شمارش‌های دقیق (head=true یعنی فقط count برمی‌گردد — بسیار سبک)
      // فقط کلاس‌های حذف‌نشده شمرده می‌شوند (حذف نرم deleted_at)
      const classesReq = supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      const sessionsReq = supabase
        .from("najm_sessions")
        .select("id", { count: "exact", head: true });
      let pendingReq = supabase
        .from("najm_sessions")
        .select("id", { count: "exact", head: true })
        .or("is_applied.eq.false,is_applied.is.null");
      // «معلق» با محدوده پیش‌فرض صفحه (ترم فعال) هماهنگ است
      if (active) {
        pendingReq = pendingReq.eq("term", active.term).eq("academic_year", active.academic_year);
      }

      const [clsRes, sessRes, pendRes] = await Promise.all([classesReq, sessionsReq, pendingReq]);
      if (typeof clsRes.count === "number") setClassesTotal(clsRes.count);
      if (typeof sessRes.count === "number") setSessionsTotal(sessRes.count);
      if (typeof pendRes.count === "number") setPendingExact(pendRes.count);
    } catch (e) {
      console.warn("refresh najm stats error:", e);
    }
  }

  /** اعمال خودکار جلساتی که ساعت اعمالشان رسیده */
  async function autoApplySessions(sessions: SessionRow[], currentTerms: NajmTermRow[]) {
    const active = currentTerms.find((t) => t.is_active);
    if (!active?.daily_apply_time) return; // ساعت اعمال تعیین نشده → نیاز نیست

    const toApply = sessions.filter((s) => shouldAutoApply(s, active.daily_apply_time!));
    if (toApply.length === 0) return;

    const ids = toApply.map((s) => s.id);
    const { error } = await supabase
      .from("najm_sessions")
      .update({ is_applied: true })
      .in("id", ids);

    if (!error) {
      // به‌روزرسانی state محلی
      setAllSessions((prev) =>
        prev.map((s) => (ids.includes(s.id) ? { ...s, is_applied: true } : s)),
      );
    }
  }

  /** اعمال دستی یک جلسه */
  async function applySession(session: ManagementSessionRow) {
    setApplyingSessionId(session.id);
    const { error } = await supabase
      .from("najm_sessions")
      .update({ is_applied: true })
      .eq("id", session.id);

    if (error) {
      toast.error("خطا در اعمال نمرات جلسه");
    } else {
      toast.success(`نمرات جلسه «${session.class_name}» اعمال شد.`);
      setAllSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, is_applied: true } : s)),
      );
      await refreshStats();
    }
    setApplyingSessionId(null);
  }

  /** اعمال همه نمرات معلق ترم فعال */
  async function applyAllPending() {
    if (!activeTerm) return;
    setApplyingAll(true);
    // فهرست تازه و کامل جلسات معلق ترم فعال — مستقیم از دیتابیس (بدون محدودیت لیست صفحه)
    const { data: pendingRows, error: fetchError } = await supabase
      .from("najm_sessions")
      .select("id")
      .or("is_applied.eq.false,is_applied.is.null")
      .eq("term", activeTerm.term)
      .eq("academic_year", activeTerm.academic_year)
      .limit(10000);
    if (fetchError) {
      toast.error("خطا در دریافت جلسات معلق");
      setApplyingAll(false);
      return;
    }
    const ids = (pendingRows ?? []).map((row) => String(row.id));
    if (ids.length === 0) {
      toast.info("هیچ جلسه معلقی وجود ندارد.");
      setApplyingAll(false);
      return;
    }
    const { error } = await supabase
      .from("najm_sessions")
      .update({ is_applied: true })
      .in("id", ids);

    if (error) {
      toast.error("خطا در اعمال نمرات");
    } else {
      toast.success(`${convertDigits(ids.length)} جلسه اعمال شد.`);
      setAllSessions((prev) =>
        prev.map((s) => (ids.includes(s.id) ? { ...s, is_applied: true } : s)),
      );
      await refreshStats();
    }
    setApplyingAll(false);
  }

  const activeTerm = useMemo(() => terms.find((term) => term.is_active) ?? null, [terms]);
  const absenceRatio = activeTerm?.absence_score_ratio ?? 0.6;
  const dailyApplyTime = activeTerm?.daily_apply_time ?? null;

  // کلاس‌های فعال: کلاس‌های حذف‌شده (حذف نرم deleted_at در صفحه کلاس‌ها) از آمار،
  // فیلترها و رتبه‌بندی این صفحه پنهان می‌مانند — جلسات تاریخی‌شان حفظ می‌شود.
  const activeClasses = useMemo(() => classes.filter((c) => !c.deleted_at), [classes]);

  // به‌روزرسانی خودکار آمار هر ۳۰ ثانیه (شمارش‌های سبک و دقیق + اعمال خودکار جلسات رسیده)
  useEffect(() => {
    const id = setInterval(() => {
      void refreshStats();
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTerm?.id, activeTerm?.daily_apply_time]);

  // بازخوانی بی‌صدا هنگام بازگشت مدیر به این تب
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void loadDashboard(false, true);
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // جلسات قابل استفاده در رتبه‌بندی — فقط جلسات اعمال‌شده
  const classScopeSessions = useMemo(() => {
    let sessions = allSessions;
    // فیلتر ترم فعال
    if (activeTerm) {
      sessions = sessions.filter(
        (session) =>
          session.term === activeTerm.term && session.academic_year === activeTerm.academic_year,
      );
    }
    // فقط جلسات اعمال‌شده در رتبه‌بندی
    sessions = sessions.filter((s) => s.is_applied !== false);
    return sessions;
  }, [allSessions, activeTerm]);

  const filteredSessions = useMemo(() => {
    const selectedClassName = classes.find((c) => c.id === classFilter)?.name ?? "";
    return classScopeSessions.filter((session) => {
      const matchesClass =
        classFilter === "all" ||
        String(session.class_id) === String(classFilter) ||
        (!!selectedClassName && String(session.class_name ?? "") === selectedClassName);
      return matchesClass;
    });
  }, [classScopeSessions, classes, classFilter]);

  const filteredSessionIds = useMemo(
    () => new Set(filteredSessions.map((session) => session.id)),
    [filteredSessions],
  );
  const filteredRecords = useMemo(
    () => allRecords.filter((record) => filteredSessionIds.has(record.session_id)),
    [allRecords, filteredSessionIds],
  );

  const classStandings = useMemo<ClassStanding[]>(() => {
    const classMap = new Map<string, ClassRow>();
    for (const c of activeClasses) classMap.set(c.id, c);

    // کلاس‌های حذف‌شده (حذف نرم) نباید از مسیر جلسات تاریخی دوباره ظاهر شوند
    const deletedClasses = classes.filter((c) => !!c.deleted_at);
    const deletedIds = new Set(deletedClasses.map((c) => String(c.id)));
    const deletedNames = new Set(deletedClasses.map((c) => String(c.name ?? "").trim()));

    for (const session of filteredSessions) {
      const id = String(session.class_id ?? "").trim();
      if (!id || classMap.has(id)) continue;
      if (deletedIds.has(id)) continue;
      const sessionClassName = String(session.class_name ?? "").trim();
      if (sessionClassName && deletedNames.has(sessionClassName)) continue;
      const alreadyExistsByName = Array.from(classMap.values()).some(
        (c) => String(c.name ?? "").trim() === sessionClassName,
      );
      if (alreadyExistsByName) continue;
      classMap.set(id, {
        id,
        name: session.class_name || "کلاس بدون نام",
        level: null,
        term: session.term,
        academic_year: session.academic_year,
      });
    }

    const allClasses = Array.from(classMap.values());
    const recordsByClass = new Map<string, RecordRow[]>();
    const sessionsCountByClass = new Map<string, number>();

    function matchesClass(session: SessionRow, cls: ClassRow): boolean {
      return String(session.class_id) === String(cls.id) || session.class_name === cls.name;
    }

    for (const cls of allClasses) {
      const classSessions = filteredSessions.filter((session) => matchesClass(session, cls));
      sessionsCountByClass.set(cls.id, classSessions.length);
      const classSessionIds = new Set(classSessions.map((s) => s.id));
      recordsByClass.set(
        cls.id,
        filteredRecords.filter((record) => classSessionIds.has(record.session_id)),
      );
    }

    return allClasses
      .map((c) => {
        const records = recordsByClass.get(c.id) ?? [];
        const classSessionById = new Map(filteredSessions.map((s) => [s.id, s]));
        const studentsRaw = aggregateStudents(records, classSessionById, studentProfiles);
        const adjusted = computeAdjustedTotals(
          records.map((r) => ({
            attendance: Number(r.attendance ?? 0),
            session_score: r.session_score,
          })),
          absenceRatio,
          0,
        );
        const sessionsCount = sessionsCountByClass.get(c.id) ?? 0;
        return {
          classId: c.id,
          className: c.name,
          level: c.level,
          totalScore: adjusted.total,
          sessionsCount,
          studentsCount: studentsRaw.length,
          topFive: studentsRaw.slice(0, 5),
          absentReplaced: adjusted.absentCount,
        };
      })
      .filter((c) => c.sessionsCount > 0 || c.studentsCount > 0)
      .filter((c) => !search.trim() || c.className.includes(search.trim()))
      .sort((a, b) => a.className.localeCompare(b.className, "fa"));
  }, [
    filteredRecords,
    filteredSessions,
    classes,
    activeClasses,
    studentProfiles,
    search,
    absenceRatio,
  ]);

  const overallTopTen = useMemo(() => {
    const yearSessions = allSessions.filter(
      (s) => s.academic_year === activeTerm?.academic_year && s.is_applied !== false,
    );
    const academicYearSessionIds = new Set(yearSessions.map((s) => s.id));
    const sessionById = new Map(yearSessions.map((s) => [s.id, s]));
    const yearRecords = allRecords.filter((r) => academicYearSessionIds.has(r.session_id));
    return aggregateStudents(yearRecords, sessionById, studentProfiles).slice(0, 10);
  }, [allRecords, allSessions, studentProfiles, activeTerm]);

  const recordsStatsBySession = useMemo(() => {
    const map = new Map<string, { recordsCount: number; totalScore: number }>();
    for (const record of allRecords) {
      const current = map.get(record.session_id) ?? { recordsCount: 0, totalScore: 0 };
      current.recordsCount += 1;
      current.totalScore += toNumber(record.session_score);
      map.set(record.session_id, current);
    }
    return map;
  }, [allRecords]);

  const managementSessions = useMemo<ManagementSessionRow[]>(() => {
    const selectedClassName = classes.find((c) => c.id === managementClassFilter)?.name ?? "";
    const q = managementSearch.trim().toLowerCase();

    return allSessions
      .filter((session) => {
        const matchesScope =
          managementScope === "all" ||
          (managementScope === "active" &&
            !!activeTerm &&
            session.term === activeTerm.term &&
            session.academic_year === activeTerm.academic_year) ||
          (managementScope === "year" &&
            !!activeTerm &&
            session.academic_year === activeTerm.academic_year);

        const matchesClass =
          managementClassFilter === "all" ||
          String(session.class_id) === String(managementClassFilter) ||
          (!!selectedClassName && String(session.class_name ?? "") === selectedClassName);

        const teacherName = session.teacher_id
          ? (teacherProfiles[String(session.teacher_id)]?.name ?? "")
          : "";
        const matchesSearch =
          !q ||
          String(session.class_name ?? "")
            .toLowerCase()
            .includes(q) ||
          String(session.session_date ?? "").includes(q) ||
          teacherName.toLowerCase().includes(q);

        return matchesScope && matchesClass && matchesSearch;
      })
      .map((session) => {
        const stats = recordsStatsBySession.get(session.id) ?? { recordsCount: 0, totalScore: 0 };
        return {
          ...session,
          teacherName: session.teacher_id
            ? (teacherProfiles[String(session.teacher_id)]?.name ?? "استاد ثبت‌کننده")
            : "استاد ثبت‌کننده",
          recordsCount: stats.recordsCount,
          totalScore: stats.totalScore,
        };
      })
      .sort(
        (a, b) =>
          String(b.session_date ?? "").localeCompare(String(a.session_date ?? "")) ||
          String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
      );
  }, [
    allSessions,
    classes,
    managementClassFilter,
    managementScope,
    managementSearch,
    activeTerm,
    teacherProfiles,
    recordsStatsBySession,
  ]);

  // تعداد جلسات معلق

  async function openManagementSession(session: ManagementSessionRow) {
    setSelectedManagementSession(session);
    setManagementDetailOpen(true);
    setManagementDetailLoading(true);
    setManagementEditMode(false);

    const { data } = await supabase
      .from("najm_session_records")
      .select("*")
      .eq("session_id", session.id)
      .order("student_name");

    // رکوردها «منجمد» و همان‌طور که ثبت شده‌اند نمایش داده می‌شوند؛
    // نرمال‌سازی فقط هنگام «ویرایش» مدیر روی پیش‌نویس اعمال می‌شود.
    const rows = (data ?? []).map((record: Record<string, unknown>) => ({
      ...record,
      custom_scores: (record.custom_scores as Record<string, number> | undefined) ?? {},
    }));
    setManagementRecords(rows);
    setManagementDraftRecords(
      rows.map((record) => ({
        ...record,
        custom_scores: { ...(record.custom_scores as Record<string, number>) },
      })),
    );
    setManagementDetailLoading(false);
  }

  function updateManagementDraftField(recordId: string, item: NajmScoreItem, value: number) {
    setManagementDraftRecords((prev) =>
      prev.map((record) => {
        if (String(record.id) !== String(recordId)) return record;
        return normalizeEditableRecord(withNajmItemValue(record, item, value), scoreItems);
      }),
    );
  }

  async function saveManagementEdits() {
    if (!selectedManagementSession || !activeTerm) return;
    const isActiveSession =
      selectedManagementSession.term === activeTerm.term &&
      selectedManagementSession.academic_year === activeTerm.academic_year;
    if (!isActiveSession) {
      toast.error("ویرایش فقط برای ترم فعال امکان‌پذیر است.");
      return;
    }

    const normalizedRecords = managementDraftRecords.map((record) =>
      normalizeEditableRecord(record, scoreItems),
    );
    setManagementEditSaving(true);
    const attendanceMax = najmAttendanceMax(scoreItems);
    const examItemActive = scoreItems.some(
      (item) => item.item_key === NAJM_EXAM_KEY && item.is_active,
    );

    try {
      for (const record of normalizedRecords) {
        const { error } = await supabase
          .from("najm_session_records")
          .update({
            is_absent: record.is_absent,
            attendance: record.attendance,
            homework: record.homework,
            exam_raw: record.exam_raw,
            discipline: record.discipline,
            special_progress: record.special_progress,
            special_help: record.special_help,
            negative_disorder: record.negative_disorder,
            negative_disrespect: record.negative_disrespect,
            ...(Object.keys(record.custom_scores ?? {}).length > 0
              ? { custom_scores: record.custom_scores }
              : {}),
            session_score: record.session_score,
          })
          .eq("id", record.id);
        if (error) throw new Error(`ویرایش رکورد نجم ناموفق بود: ${error.message}`);
      }

      const studentIds = Array.from(
        new Set(normalizedRecords.map((record) => String(record.student_id)).filter(Boolean)),
      );
      if (studentIds.length > 0) {
        const { error: deleteAttendanceError } = await supabase
          .from("attendance")
          .delete()
          .eq("date", selectedManagementSession.session_date)
          .in("student_id", studentIds)
          .like("note", "NJM|%");
        if (deleteAttendanceError)
          throw new Error(`پاک‌سازی حضور آینه‌ای ناموفق بود: ${deleteAttendanceError.message}`);

        const attendanceRows = normalizedRecords.map((record) => ({
          student_id: record.student_id,
          date: selectedManagementSession.session_date,
          status: record.is_absent ? "absent" : "present",
          note: `NJM| ویرایش مدیر - حضور ${record.attendance}/${attendanceMax}`,
        }));
        const { error: insertAttendanceError } = await supabase
          .from("attendance")
          .insert(attendanceRows);
        if (insertAttendanceError)
          throw new Error(`ثبت حضور آینه‌ای ناموفق بود: ${insertAttendanceError.message}`);

        if (najmSettings.examGradesSync && examItemActive) {
          const { error: deleteGradesError } = await supabase
            .from("grades")
            .delete()
            .eq("date", selectedManagementSession.session_date)
            .eq("subject", "آزمون طرح نجم")
            .in("student_id", studentIds);
          if (deleteGradesError)
            throw new Error(`پاک‌سازی نمرات آینه‌ای ناموفق بود: ${deleteGradesError.message}`);

          const gradeRows = normalizedRecords
            .filter((record) => !record.is_absent)
            .map((record) => ({
              student_id: record.student_id,
              subject: "آزمون طرح نجم",
              date: selectedManagementSession.session_date,
              grade: examDisplay(Number(record.exam_raw ?? 0)),
              teacher: selectedManagementSession.teacherName || "استاد",
              class_name: selectedManagementSession.class_name ?? "",
              feedback: "ویرایش‌شده توسط مدیر",
              month: String(selectedManagementSession.session_date ?? "").split("/")[1],
            }));
          if (gradeRows.length > 0) {
            const { error: insertGradesError } = await supabase.from("grades").insert(gradeRows);
            if (insertGradesError)
              throw new Error(`ثبت نمرات آینه‌ای ناموفق بود: ${insertGradesError.message}`);
          }
        }
      }

      const { error: sessionError } = await supabase
        .from("najm_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", selectedManagementSession.id);
      if (sessionError) throw new Error(`به‌روزرسانی جلسه ناموفق بود: ${sessionError.message}`);

      toast.success("ویرایش جلسه و داده‌های وابسته ذخیره شد.");
      setManagementEditMode(false);
      await loadDashboard(true);
    } catch (error) {
      console.error("save management edits failed:", error);
      toast.error(error instanceof Error ? error.message : "ویرایش جلسه کامل نشد");
      setManagementEditMode(false);
      await loadDashboard(true);
    } finally {
      setManagementEditSaving(false);
    }
  }

  async function deleteManagementSession(session: ManagementSessionRow) {
    if (!window.confirm(`آیا از حذف جلسه «${session.class_name}» مطمئن هستید؟`)) return;
    setManagementDeletingId(session.id);

    try {
      const { data: records, error: recordsError } = await supabase
        .from("najm_session_records")
        .select("student_id")
        .eq("session_id", session.id);
      if (recordsError)
        throw new Error(`دریافت وابستگی‌های جلسه ناموفق بود: ${recordsError.message}`);

      const studentIds = Array.from(
        new Set((records ?? []).map((record: any) => String(record.student_id)).filter(Boolean)),
      );

      const { error: deleteRecordsError } = await supabase
        .from("najm_session_records")
        .delete()
        .eq("session_id", session.id);
      if (deleteRecordsError)
        throw new Error(`حذف رکوردهای نجم ناموفق بود: ${deleteRecordsError.message}`);

      if (studentIds.length > 0) {
        const { error: attendanceError } = await supabase
          .from("attendance")
          .delete()
          .eq("date", session.session_date)
          .in("student_id", studentIds)
          .like("note", "NJM|%");
        if (attendanceError)
          throw new Error(`حذف حضور وابسته ناموفق بود: ${attendanceError.message}`);

        const { error: gradesError } = await supabase
          .from("grades")
          .delete()
          .eq("date", session.session_date)
          .eq("subject", "آزمون طرح نجم")
          .in("student_id", studentIds);
        if (gradesError) throw new Error(`حذف نمرات وابسته ناموفق بود: ${gradesError.message}`);
      }

      const { error: sessionError } = await supabase
        .from("najm_sessions")
        .delete()
        .eq("id", session.id);
      if (sessionError) throw new Error(`حذف جلسه ناموفق بود: ${sessionError.message}`);

      toast.success("جلسه و داده‌های وابسته حذف شدند.");
      if (selectedManagementSession?.id === session.id) setManagementDetailOpen(false);
      await loadDashboard();
    } catch (error) {
      console.error("delete management session failed:", error);
      toast.error(error instanceof Error ? error.message : "حذف جلسه کامل نشد");
      await loadDashboard();
    } finally {
      setManagementDeletingId(null);
    }
  }

  /* ============================================================
   * مدیریت آیتم‌های ثبت جلسه (ناجم_score_items)
   * ============================================================ */

  /** به‌روزرسانی یک فیلد از آیتم (عنوان/سقف/ضریب/...) — ذخیره فوری. */
  async function updateScoreItem(item: NajmScoreItem, patch: Partial<NajmScoreItem>) {
    // حضور همیشه فعال و هسته‌ای می‌ماند
    if (item.item_key === NAJM_ATTENDANCE_KEY) {
      delete patch.is_active;
      delete patch.kind;
    }
    // نوع آیتم‌های پایه قابل تغییر نیست (سازگاری گزارش‌های قدیمی)
    if (isCoreNajmColumn(item.item_key)) {
      delete patch.kind;
    }
    setItemSavingKey(item.item_key);
    const payload: Partial<NajmScoreItem> & { updated_at: string } = {
      ...patch,
      updated_at: new Date().toISOString(),
    };
    if (payload.max_score !== undefined)
      payload.max_score = Math.max(1, Math.min(100, Math.round(Number(payload.max_score) || 1)));
    if (payload.weight !== undefined)
      payload.weight = Math.max(1, Math.min(10, Math.round(Number(payload.weight) || 1)));
    if (payload.default_value !== undefined)
      payload.default_value = Math.max(
        0,
        Math.min(item.max_score, Math.round(Number(payload.default_value) || 0)),
      );
    if (payload.label !== undefined && !String(payload.label).trim()) {
      setItemSavingKey(null);
      toast.error("عنوان آیتم نمی‌تواند خالی باشد.");
      return;
    }
    const { error } = await supabase
      .from("najm_score_items")
      .update(payload)
      .eq("item_key", item.item_key);
    if (error) {
      toast.error("خطا در ذخیره آیتم");
      console.error("update score item error:", error);
    } else {
      setScoreItems((prev) =>
        sortNajmItems(prev.map((i) => (i.item_key === item.item_key ? { ...i, ...payload } : i))),
      );
      toast.success(`آیتم «${payload.label ?? item.label}» به‌روزرسانی شد.`);
    }
    setItemSavingKey(null);
  }

  /** فعال/غیرفعال کردن آیتم — «حذف» از فرم ثبت بدون از دست رفتن سوابق. */
  async function toggleItemActive(item: NajmScoreItem) {
    if (item.item_key === NAJM_ATTENDANCE_KEY) {
      toast.info("آیتم «حضور» هسته‌ای است و همیشه فعال می‌ماند.");
      return;
    }
    await updateScoreItem(item, { is_active: !item.is_active });
  }

  /** جابه‌جایی ترتیب نمایش آیتم در فرم. */
  async function moveScoreItem(item: NajmScoreItem, dir: -1 | 1) {
    const ordered = sortNajmItems(scoreItems);
    const index = ordered.findIndex((candidate) => candidate.item_key === item.item_key);
    const swapIndex = index + dir;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
    const first = ordered[index];
    const second = ordered[swapIndex];
    const firstOrder = first.sort_order;
    const secondOrder = second.sort_order === firstOrder ? firstOrder + dir : second.sort_order;
    setItemSavingKey(item.item_key);
    try {
      const { error: firstError } = await supabase
        .from("najm_score_items")
        .update({ sort_order: secondOrder, updated_at: new Date().toISOString() })
        .eq("item_key", first.item_key);
      if (firstError) throw new Error(firstError.message);

      const { error: secondError } = await supabase
        .from("najm_score_items")
        .update({ sort_order: firstOrder, updated_at: new Date().toISOString() })
        .eq("item_key", second.item_key);
      if (secondError) throw new Error(secondError.message);

      setScoreItems(
        sortNajmItems(
          ordered.map((candidate) =>
            candidate.item_key === first.item_key
              ? { ...candidate, sort_order: secondOrder }
              : candidate.item_key === second.item_key
                ? { ...candidate, sort_order: firstOrder }
                : candidate,
          ),
        ),
      );
    } catch (error) {
      toast.error(
        "جابه‌جایی ترتیب کامل نشد: " + (error instanceof Error ? error.message : "خطای نامشخص"),
      );
      await loadDashboard();
    } finally {
      setItemSavingKey(null);
    }
  }

  /** افزودن آیتم جدید (مثبت/ویژه/منفی) — بلافاصله به فرم استاد اضافه می‌شود. */
  async function addScoreItem() {
    const label = newItemLabel.trim();
    if (!label) {
      toast.error("عنوان آیتم جدید را وارد کنید.");
      return;
    }
    setNewItemAdding(true);
    const itemKey = `custom_${Date.now().toString(36)}`;
    const maxOrder = scoreItems.reduce((m, i) => Math.max(m, i.sort_order), 0);
    const payload = {
      item_key: itemKey,
      label,
      kind: newItemKind,
      max_score: Math.max(1, Math.min(100, newItemMax)),
      weight: newItemKind === "negative" ? Math.max(1, Math.min(10, newItemWeight)) : 1,
      is_core: false,
      is_active: true,
      default_value: 0,
      sort_order: maxOrder + 1,
    };
    const { error } = await supabase.from("najm_score_items").insert(payload);
    if (error) {
      toast.error("خطا در افزودن آیتم");
      console.error("add score item error:", error);
    } else {
      setScoreItems((prev) => sortNajmItems([...prev, payload]));
      setNewItemLabel("");
      setNewItemKind("positive");
      setNewItemMax(5);
      setNewItemWeight(1);
      toast.success(`آیتم «${label}» به فرم ثبت جلسه اضافه شد.`);
    }
    setNewItemAdding(false);
  }

  /** حذف کامل آیتم سفارشی — فقط اگر در هیچ جلسه‌ای استفاده نشده باشد. */
  async function deleteScoreItem(item: NajmScoreItem) {
    if (isCoreNajmColumn(item.item_key)) {
      toast.info("آیتم‌های پایه قابل حذف نیستند؛ می‌توانید آن‌ها را غیرفعال کنید.");
      return;
    }
    if (!window.confirm(`آیا از حذف کامل آیتم «${item.label}» مطمئن هستید؟`)) return;
    setItemDeletingKey(item.item_key);
    // بررسی استفاده در رکوردها (custom_scores ? key)
    const { count } = await supabase
      .from("najm_session_records")
      .select("id", { count: "exact", head: true })
      .not(`custom_scores->>${item.item_key}`, "is", null);
    if ((count ?? 0) > 0) {
      toast.error(
        `این آیتم در ${convertDigits(count ?? 0)} رکورد قبلی استفاده شده و قابل حذف کامل نیست؛ به‌جای آن غیرفعالش کنید.`,
      );
      setItemDeletingKey(null);
      return;
    }
    const { error } = await supabase
      .from("najm_score_items")
      .delete()
      .eq("item_key", item.item_key);
    if (error) {
      toast.error("خطا در حذف آیتم");
    } else {
      setScoreItems((prev) => prev.filter((i) => i.item_key !== item.item_key));
      toast.success(`آیتم «${item.label}» حذف شد.`);
    }
    setItemDeletingKey(null);
  }

  async function saveRecoverySettings(next: {
    enabled: boolean;
    allowFull: boolean;
    notifyParent: boolean;
    sessionsLimit: number;
  }) {
    setRecoverySettingsSaving(true);
    const rows = [
      { key: "conduct_recovery_enabled", value: { enabled: next.enabled } },
      {
        key: "conduct_recovery_sessions_limit",
        value: { count: Math.min(2, Math.max(1, Math.round(next.sessionsLimit))) },
      },
      { key: "conduct_recovery_allow_full", value: { enabled: next.allowFull } },
      { key: "conduct_recovery_notify_parent", value: { enabled: next.notifyParent } },
    ].map((row) => ({ ...row, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("najm_settings").upsert(rows);
    if (error) toast.error("ذخیره تنظیمات جبران ناموفق بود");
    else {
      setRecoveryEnabled(next.enabled);
      setRecoveryAllowFull(next.allowFull);
      setRecoveryNotifyParent(next.notifyParent);
      setRecoverySessionsLimit(Math.min(2, Math.max(1, Math.round(next.sessionsLimit))));
      toast.success("تنظیمات جبران ذخیره شد ✅");
    }
    setRecoverySettingsSaving(false);
  }

  /** روشن/خاموش کردن انتقال خودکار نمره آزمون به جدول نمرات */
  async function toggleExamGradesSync(enabled: boolean) {
    setSettingsSaving(true);
    const next = { ...najmSettings, examGradesSync: enabled };
    const { error } = await saveNajmSessionSettings(next);
    if (error) {
      toast.error("خطا در ذخیره تنظیمات");
    } else {
      setNajmSettings(next);
      toast.success(
        enabled
          ? "انتقال خودکار نمره آزمون به جدول نمرات فعال شد."
          : "انتقال خودکار نمره آزمون غیرفعال شد؛ نمرات فقط در طرح نجم می‌مانند.",
      );
    }
    setSettingsSaving(false);
  }

  /** ذخیره‌ی تنظیمات موتور افتخارات (جلسات هر ماه + سیاست غیبت) — فقط روی محاسبات جدید اثر دارد */
  async function saveQuestEngineSettings(next: NajmQuestEngineSettings, successMessage?: string) {
    setQuestSettingsSaving(true);
    const { error } = await saveNajmQuestEngineSettings(next);
    if (error) {
      toast.error("خطا در ذخیره تنظیمات موتور افتخارات");
    } else {
      setQuestSettings(next);
      if (successMessage) toast.success(successMessage);
    }
    setQuestSettingsSaving(false);
  }

  function updateSessionsPerMonth(raw: string) {
    const value = Math.round(Number(raw));
    if (!Number.isFinite(value)) return;
    setQuestSettings((prev) => ({ ...prev, sessionsPerMonth: value }));
  }

  async function commitSessionsPerMonth() {
    const value = questSettings.sessionsPerMonth;
    if (!Number.isFinite(value) || value < 1 || value > 60) {
      toast.error("جلسات هر ماه باید عددی بین ۱ تا ۶۰ باشد.");
      setQuestSettings((prev) => ({ ...prev, sessionsPerMonth: 12 }));
      return;
    }
    await saveQuestEngineSettings(
      { ...questSettings, sessionsPerMonth: value },
      `جلسات هر ماه روی ${value} تنظیم شد؛ از این پس بازه‌ی «ماه» در قانون‌ساز با همین عدد محاسبه می‌شود.`,
    );
  }

  async function updateAbsencePolicy(
    kind: NajmAbsenceKind,
    scope: "normal" | "attendance",
    action: NajmAbsencePolicyAction,
  ) {
    const next: NajmQuestEngineSettings = {
      ...questSettings,
      absencePolicy: {
        ...questSettings.absencePolicy,
        [kind]: { ...questSettings.absencePolicy[kind], [scope]: action },
      },
    };
    await saveQuestEngineSettings(next, "سیاست رفتار با این نوع غیبت ذخیره شد.");
  }

  async function activateTerm(term: NajmTermRow) {
    if (term.is_active) return;
    setTermSaving(true);
    const previousActiveId = activeTerm?.id ?? null;
    try {
      const { error: deactivateError } = await supabase
        .from("najm_terms")
        .update({ is_active: false })
        .eq("is_active", true);
      if (deactivateError) throw new Error(deactivateError.message);

      const { error: activateError } = await supabase
        .from("najm_terms")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", term.id);
      if (activateError) throw new Error(activateError.message);

      toast.success(`ترم «${term.title}» فعال شد.`);
      await loadDashboard();
    } catch (error) {
      if (previousActiveId) {
        await supabase
          .from("najm_terms")
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq("id", previousActiveId);
      }
      toast.error(
        "تغییر ترم فعال کامل نشد: " + (error instanceof Error ? error.message : "خطای نامشخص"),
      );
      await loadDashboard();
    } finally {
      setTermSaving(false);
    }
  }

  async function createAndActivateTerm() {
    const title = newTermTitle.trim();
    const academicYear = newTermYear.trim();
    if (!title || !academicYear) {
      toast.error("عنوان و سال تحصیلی را وارد کنید.");
      return;
    }
    setTermSaving(true);
    const previousActiveId = activeTerm?.id ?? null;
    try {
      const { error: deactivateError } = await supabase
        .from("najm_terms")
        .update({ is_active: false })
        .eq("is_active", true);
      if (deactivateError) throw new Error(deactivateError.message);

      const ratio = Math.max(0, Math.min(100, newTermAbsenceRatio)) / 100;
      const applyTime = newTermApplyTime.trim() || null;
      const { error: insertError } = await supabase.from("najm_terms").insert({
        title,
        term: newTermKind,
        academic_year: academicYear,
        starts_at: newTermStart.trim() || null,
        ends_at: newTermEnd.trim() || null,
        note: newTermNote.trim() || null,
        is_active: true,
        absence_score_ratio: ratio,
        daily_apply_time: applyTime,
      });
      if (insertError) throw new Error(insertError.message);

      toast.success("ترم جدید ساخته و فعال شد.");
      setNewTermTitle("");
      setNewTermStart("");
      setNewTermEnd("");
      setNewTermNote("");
      setNewTermAbsenceRatio(60);
      setNewTermApplyTime("");
      await loadDashboard();
    } catch (error) {
      if (previousActiveId) {
        await supabase
          .from("najm_terms")
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq("id", previousActiveId);
      }
      toast.error("ساخت ترم کامل نشد: " + (error instanceof Error ? error.message : "خطای نامشخص"));
      await loadDashboard();
    } finally {
      setTermSaving(false);
    }
  }

  const canEditManagementSession =
    !!selectedManagementSession &&
    !!activeTerm &&
    selectedManagementSession.term === activeTerm.term &&
    selectedManagementSession.academic_year === activeTerm.academic_year;

  const managementDisplayRecords = managementEditMode ? managementDraftRecords : managementRecords;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری طرح نجم...</span>
      </div>
    );
  }

  return (
    <>
      <style>{najmNeumorphismStyle}</style>
      <div className="najm-soft-page rounded-[2rem] p-4 md:p-6 space-y-7" dir="rtl">
        {activeClasses.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">هنوز کلاسی ثبت نشده است.</Card>
        ) : (
          <div className="space-y-7">
            {/* هدر */}
            <section className="najm-compact-header relative overflow-hidden rounded-[1.5rem] px-4 py-3">
              <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="compact-header-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                    <Star className="h-5 w-5 fill-current" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="font-display text-lg md:text-xl font-black text-[#064E3B] tracking-tight">
                        مدیریت طرح نجم
                      </h1>
                      <Badge className="rounded-full border-0 bg-[#D4AF37]/18 text-[#064E3B] shadow-sm hover:bg-[#D4AF37]/18 text-[11px]">
                        عملیات و تنظیمات
                      </Badge>
                      {dailyApplyTime && (
                        <Badge className="rounded-full border-0 bg-blue-100 text-blue-800 hover:bg-blue-100 text-[11px]">
                          <Clock className="h-3 w-3 ml-1" />
                          اعمال ساعت {convertDigits(dailyApplyTime)}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 max-w-xl text-xs leading-5 text-emerald-950/60">
                      مدیریت ترم فعال، ضریب غیبت، ساعت اعمال و جلسات ثبت‌شده استادان.
                      {dailyApplyTime &&
                        ` جلسات هر روز ساعت ${convertDigits(dailyApplyTime)} به‌صورت خودکار اعمال می‌شوند.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto">
                  <div
                    className="compact-mini-stat rounded-xl px-3 py-1.5 text-center"
                    title="تعداد دقیق کلاس‌های ثبت‌شده — شمارش مستقیم از دیتابیس"
                  >
                    <div className="text-[10px] text-emerald-950/55">کلاس‌ها</div>
                    <div className="font-display text-sm font-black text-[#064E3B]">
                      {convertDigits(classesTotal)}
                    </div>
                  </div>
                  <div
                    className="compact-mini-stat rounded-xl px-3 py-1.5 text-center"
                    title="تعداد دقیق همه جلسات ثبت‌شده طرح نجم — شمارش مستقیم از دیتابیس"
                  >
                    <div className="text-[10px] text-emerald-950/55">جلسات</div>
                    <div className="font-display text-sm font-black text-[#B8860B]">
                      {convertDigits(sessionsTotal)}
                    </div>
                  </div>
                  {pendingExact > 0 && (
                    <div
                      className="compact-mini-stat rounded-xl px-3 py-1.5 text-center border border-amber-300"
                      title="جلسات اعمال‌نشده ترم فعال — شمارش مستقیم از دیتابیس"
                    >
                      <div className="text-[10px] text-amber-700">معلق</div>
                      <div className="font-display text-sm font-black text-amber-700">
                        {convertDigits(pendingExact)}
                      </div>
                    </div>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="compact-button gap-2 rounded-xl border-[#D4AF37]/40 text-[#064E3B]"
                  >
                    <Link to="/admin/najm-results">
                      <BarChart3 className="h-4 w-4" /> نتایج طرح نجم
                    </Link>
                  </Button>
                  <Button
                    onClick={() => loadDashboard(true)}
                    disabled={refreshing}
                    variant="ghost"
                    size="sm"
                    className="compact-button gap-2 rounded-xl px-3 text-[#064E3B] hover:bg-transparent"
                    title="بارگذاری مجدد کامل داده‌ها (آمار به‌صورت خودکار هم به‌روز می‌شود)"
                  >
                    {refreshing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}{" "}
                    به‌روزرسانی
                  </Button>
                  {lastUpdatedAt && (
                    <span
                      className="flex items-center gap-1 text-[10px] text-emerald-950/45"
                      title="آمار هر ۳۰ ثانیه به‌صورت خودکار و هنگام بازگشت به این صفحه به‌روزرسانی می‌شود"
                    >
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60"></span>
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                      </span>
                      آخرین به‌روزرسانی:{" "}
                      {lastUpdatedAt.toLocaleTimeString("fa-IR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* مدیریت ترم + ضریب غیبت + ساعت اعمال */}
            <Card className="soft-card border-0 p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="soft-icon flex h-12 w-12 items-center justify-center rounded-[1.4rem] text-[#B8860B]">
                    <CalendarDays className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-black text-emerald-950">
                        مدیریت سال تحصیلی و ترم فعال طرح نجم
                      </h2>
                      {activeTerm ? (
                        <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> ترم فعال
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full text-amber-700">
                          بدون ترم فعال
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      درصد ضریب جایگزین غیبت و ساعت اعمال نمرات را برای هر ترم تعیین کنید.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                <Input
                  value={newTermTitle}
                  onChange={(e) => setNewTermTitle(e.target.value)}
                  placeholder="عنوان ترم"
                  className="lg:col-span-3"
                />
                <Select value={newTermKind} onValueChange={setNewTermKind}>
                  <SelectTrigger className="lg:col-span-2">
                    <SelectValue placeholder="نوع ترم" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="term1">ترم اول</SelectItem>
                    <SelectItem value="term2">ترم دوم</SelectItem>
                    <SelectItem value="summer">تابستان</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={newTermYear}
                  onChange={(e) => setNewTermYear(e.target.value)}
                  placeholder="سال تحصیلی"
                  className="lg:col-span-2"
                />
                <Input
                  value={newTermStart}
                  onChange={(e) => setNewTermStart(e.target.value)}
                  placeholder="شروع"
                  className="lg:col-span-2"
                />
                <Input
                  value={newTermEnd}
                  onChange={(e) => setNewTermEnd(e.target.value)}
                  placeholder="پایان"
                  className="lg:col-span-2"
                />
                <Button
                  onClick={createAndActivateTerm}
                  disabled={termSaving}
                  className="lg:col-span-1 gap-2 rounded-xl bg-[#064E3B] hover:bg-[#053c2e]"
                >
                  {termSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}{" "}
                  ساخت
                </Button>

                {/* ضریب غیبت و ساعت اعمال */}
                <div className="lg:col-span-6 flex items-center gap-3 bg-emerald-50/60 rounded-2xl px-4 py-3">
                  <div className="text-sm font-bold text-emerald-950">ضریب غیبت:</div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={newTermAbsenceRatio}
                    onChange={(e) =>
                      setNewTermAbsenceRatio(
                        Math.max(0, Math.min(100, Number(e.target.value) || 60)),
                      )
                    }
                    className="w-20 text-center font-bold"
                  />
                  <span className="text-sm text-emerald-700">٪</span>
                </div>
                <div className="lg:col-span-6 flex items-center gap-3 bg-blue-50/60 rounded-2xl px-4 py-3">
                  <Clock className="h-5 w-5 text-blue-700 shrink-0" />
                  <div className="text-sm font-bold text-blue-950">ساعت اعمال نمرات:</div>
                  <Input
                    type="time"
                    value={newTermApplyTime}
                    onChange={(e) => setNewTermApplyTime(e.target.value)}
                    className="w-32 text-center font-bold"
                  />
                  <span className="text-xs text-blue-700">خالی = فوری</span>
                </div>

                <Input
                  value={newTermNote}
                  onChange={(e) => setNewTermNote(e.target.value)}
                  placeholder="یادداشت اختیاری"
                  className="lg:col-span-12"
                />
              </div>

              {terms.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {terms.slice(0, 6).map((term) => (
                    <div
                      key={term.id}
                      className="soft-inset flex items-center justify-between gap-3 rounded-2xl p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-emerald-950">
                          {term.title}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {termLabel(term.term)} • {convertDigits(term.academic_year)}
                        </div>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {term.absence_score_ratio !== undefined && (
                            <span className="text-[10px] text-emerald-700 font-medium">
                              ضریب غیبت: {Math.round((term.absence_score_ratio || 0.6) * 100)}٪
                            </span>
                          )}
                          {term.daily_apply_time && (
                            <span className="text-[10px] text-blue-700 font-medium flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              اعمال: {convertDigits(term.daily_apply_time)}
                            </span>
                          )}
                          {!term.daily_apply_time && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              اعمال فوری
                            </span>
                          )}
                        </div>
                      </div>
                      {term.is_active ? (
                        <Badge className="shrink-0 rounded-full border-0 bg-emerald-100 text-emerald-800">
                          فعال
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={termSaving}
                          onClick={() => activateTerm(term)}
                          className="shrink-0 rounded-xl"
                        >
                          فعال کن
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* تنظیمات جبران رفتاری */}
            <Card className="soft-card border-0 p-4 md:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="soft-icon flex h-12 w-12 items-center justify-center rounded-[1.4rem] text-[#B8860B]">
                  <HeartHandshake className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-black text-emerald-950">
                    تنظیمات جبران رفتاری
                  </h2>
                  <p className="mt-1 text-xs leading-6 text-slate-500">
                    این تنظیمات فقط در این بخش مدیریتی کنترل می‌شوند؛ استاد فقط جبران انتخاب‌شده را
                    ثبت می‌کند.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-2xl bg-white/70 p-3 text-sm">
                  <span>فعال‌بودن جبران رفتاری</span>
                  <Switch
                    checked={recoveryEnabled}
                    disabled={recoverySettingsSaving}
                    onCheckedChange={(v) =>
                      void saveRecoverySettings({
                        enabled: v,
                        allowFull: recoveryAllowFull,
                        notifyParent: recoveryNotifyParent,
                        sessionsLimit: recoverySessionsLimit,
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between rounded-2xl bg-white/70 p-3 text-sm">
                  <span>اجازه جبران کامل در یک جلسه</span>
                  <Switch
                    checked={recoveryAllowFull}
                    disabled={recoverySettingsSaving || !recoveryEnabled}
                    onCheckedChange={(v) =>
                      void saveRecoverySettings({
                        enabled: recoveryEnabled,
                        allowFull: v,
                        notifyParent: recoveryNotifyParent,
                        sessionsLimit: recoverySessionsLimit,
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between rounded-2xl bg-white/70 p-3 text-sm">
                  <span>اطلاع به خانواده</span>
                  <Switch
                    checked={recoveryNotifyParent}
                    disabled={recoverySettingsSaving || !recoveryEnabled}
                    onCheckedChange={(v) =>
                      void saveRecoverySettings({
                        enabled: recoveryEnabled,
                        allowFull: recoveryAllowFull,
                        notifyParent: v,
                        sessionsLimit: recoverySessionsLimit,
                      })
                    }
                  />
                </label>
                <div className="flex items-center justify-between rounded-2xl bg-white/70 p-3 text-sm">
                  <span>حداکثر فرصت جبران</span>
                  <Select
                    value={String(recoverySessionsLimit)}
                    disabled={recoverySettingsSaving || !recoveryEnabled}
                    onValueChange={(v) =>
                      void saveRecoverySettings({
                        enabled: recoveryEnabled,
                        allowFull: recoveryAllowFull,
                        notifyParent: recoveryNotifyParent,
                        sessionsLimit: Number(v),
                      })
                    }
                  >
                    <SelectTrigger className="h-9 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">۱ جلسه</SelectItem>
                      <SelectItem value="2">۲ جلسه</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            {/* مدیریت آیتم‌های ثبت جلسه */}
            <Card className="soft-card border-0 p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="soft-icon flex h-12 w-12 items-center justify-center rounded-[1.4rem] text-[#B8860B]">
                    <Settings2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-black text-emerald-950">
                      مدیریت آیتم‌های ثبت جلسه
                    </h2>
                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      ستون‌های فرم «ثبت جلسه» استاد از همین‌جا کنترل می‌شود: افزودن و حذف بخش‌ها،
                      سقف امتیاز، ضریب کسر و ترتیب نمایش. تغییرات فقط روی ثبت‌های جدید اعمال می‌شود
                      و سوابق قبلی منجمد می‌مانند.
                    </p>
                  </div>
                </div>
              </div>

              {/* جدول آیتم‌ها */}
              <div className="overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-[980px] text-xs md:text-sm" dir="rtl">
                  <thead>
                    <tr className="bg-emerald-950/5 text-slate-600">
                      <th className="p-2 text-center w-10">#</th>
                      <th className="p-2 text-right">عنوان آیتم</th>
                      <th className="p-2 text-center">نوع</th>
                      <th className="p-2 text-center">سقف امتیاز</th>
                      <th className="p-2 text-center">ضریب کسر</th>
                      <th className="p-2 text-center">پیش‌فرض</th>
                      <th className="p-2 text-center">ترتیب</th>
                      <th className="p-2 text-center">فعال</th>
                      <th className="p-2 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortNajmItems(scoreItems).map((item, index) => {
                      const saving = itemSavingKey === item.item_key;
                      const isAttendance = item.item_key === NAJM_ATTENDANCE_KEY;
                      const isCoreColumn = isCoreNajmColumn(item.item_key);
                      const kindMeta = NAJM_ITEM_KIND_META[item.kind];
                      return (
                        <tr
                          key={item.item_key}
                          className={
                            "border-t transition " +
                            (item.is_active ? "hover:bg-slate-50" : "bg-slate-50/80 opacity-70")
                          }
                        >
                          <td className="p-2 text-center text-slate-400">
                            {saving ? (
                              <Loader2 className="mx-auto h-4 w-4 animate-spin text-emerald-700" />
                            ) : (
                              convertDigits(index + 1)
                            )}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <ItemTextInput
                                value={item.label}
                                disabled={saving}
                                onCommit={(v) => updateScoreItem(item, { label: v })}
                                className="h-8 w-36 rounded-xl text-xs font-bold"
                              />
                              {isAttendance && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 rounded-full border-emerald-200 text-[10px] text-emerald-700"
                                >
                                  هسته‌ای
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            {isCoreColumn ? (
                              <Badge
                                className={
                                  "rounded-full border-0 text-[10px] " +
                                  (item.kind === "negative"
                                    ? "bg-rose-100 text-rose-700 hover:bg-rose-100"
                                    : item.kind === "special"
                                      ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                      : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100")
                                }
                                title={kindMeta.hint}
                              >
                                {kindMeta.label}
                              </Badge>
                            ) : (
                              <Select
                                value={item.kind}
                                disabled={saving}
                                onValueChange={(v) =>
                                  updateScoreItem(item, {
                                    kind: v as NajmItemKind,
                                    ...(v !== "negative" ? { weight: 1 } : {}),
                                  })
                                }
                              >
                                <SelectTrigger className="mx-auto h-8 w-24 rounded-xl text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="positive">مثبت</SelectItem>
                                  <SelectItem value="special">ویژه</SelectItem>
                                  <SelectItem value="negative">منفی</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <ItemNumberInput
                              value={item.max_score}
                              min={1}
                              max={100}
                              disabled={saving}
                              onCommit={(v) => updateScoreItem(item, { max_score: v })}
                            />
                          </td>
                          <td className="p-2 text-center">
                            {item.kind === "negative" ? (
                              <ItemNumberInput
                                value={item.weight}
                                min={1}
                                max={10}
                                disabled={saving}
                                onCommit={(v) => updateScoreItem(item, { weight: v })}
                              />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <ItemNumberInput
                              value={item.default_value}
                              min={0}
                              max={item.max_score}
                              disabled={saving}
                              onCommit={(v) => updateScoreItem(item, { default_value: v })}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg"
                                disabled={saving || index === 0}
                                onClick={() => moveScoreItem(item, -1)}
                                title="انتقال بالا"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg"
                                disabled={saving || index === scoreItems.length - 1}
                                onClick={() => moveScoreItem(item, 1)}
                                title="انتقال پایین"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            {isAttendance ? (
                              <span className="text-[10px] font-medium text-emerald-700">
                                همیشه فعال
                              </span>
                            ) : (
                              <Switch
                                checked={item.is_active}
                                disabled={saving}
                                onCheckedChange={() => toggleItemActive(item)}
                                title={
                                  item.is_active
                                    ? "غیرفعال کردن (حذف از فرم ثبت جدید)"
                                    : "فعال کردن"
                                }
                              />
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {!isCoreColumn && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                disabled={saving || itemDeletingKey === item.item_key}
                                onClick={() => deleteScoreItem(item)}
                                title="حذف کامل (فقط اگر در سوابق استفاده نشده باشد)"
                              >
                                {itemDeletingKey === item.item_key ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* افزودن آیتم جدید */}
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-emerald-950/[0.03] p-3 md:grid-cols-12">
                <Input
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  placeholder="عنوان آیتم جدید (مثلاً «مشارکت»)"
                  className="col-span-2 h-9 rounded-xl text-xs md:col-span-4"
                />
                <Select
                  value={newItemKind}
                  onValueChange={(v) => setNewItemKind(v as NajmItemKind)}
                >
                  <SelectTrigger className="h-9 rounded-xl text-xs md:col-span-3">
                    <SelectValue placeholder="نوع آیتم" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">مثبت — امتیاز مستقیم</SelectItem>
                    <SelectItem value="special">ویژه — امتیاز تشویقی خاص</SelectItem>
                    <SelectItem value="negative">منفی — کسر امتیاز</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1 md:col-span-2">
                  <span className="shrink-0 text-[10px] text-slate-500">سقف:</span>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={newItemMax}
                    onChange={(e) =>
                      setNewItemMax(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
                    }
                    className="h-9 rounded-xl text-center text-xs font-bold"
                  />
                </div>
                {newItemKind === "negative" && (
                  <div className="flex items-center gap-1 md:col-span-2">
                    <span className="shrink-0 text-[10px] text-slate-500">ضریب کسر:</span>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={newItemWeight}
                      onChange={(e) =>
                        setNewItemWeight(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                      }
                      className="h-9 rounded-xl text-center text-xs font-bold"
                    />
                  </div>
                )}
                <Button
                  onClick={addScoreItem}
                  disabled={newItemAdding || !newItemLabel.trim()}
                  className="col-span-2 h-9 gap-2 rounded-xl bg-[#064E3B] text-xs hover:bg-[#053c2e] md:col-span-3"
                >
                  {newItemAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ListPlus className="h-4 w-4" />
                  )}
                  افزودن آیتم به فرم
                </Button>
              </div>

              {/* تنظیمات ثبت جلسه */}
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <div className="text-sm font-bold text-emerald-950">
                        انتقال خودکار نمره آزمون به جدول نمرات
                      </div>
                      <div className="mt-0.5 text-[11px] text-emerald-700/80">
                        با هر ثبت/ویرایش جلسه، نمره «{examLabel(scoreItems)}» به‌صورت ۱۰−۲۰ در دفتر
                        نمرات قرآن‌آموز درج می‌شود
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={najmSettings.examGradesSync}
                    disabled={settingsSaving}
                    onCheckedChange={toggleExamGradesSync}
                  />
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-amber-50/70 px-4 py-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                  <p className="text-[11px] leading-5 text-amber-800">
                    حذف آیتم‌ها با «غیرفعال» انجام می‌شود تا سوابق و امتیازهای ثبت‌شده قبلی کاملاً
                    حفظ شوند و در تاریخچه نمایش داده شوند؛ فقط آیتم‌های جدیدی که هنوز در هیچ جلسه‌ای
                    استفاده نشده‌اند قابل حذف کامل هستند.
                  </p>
                </div>
              </div>

              {/* تنظیمات موتور افتخارات (قانون‌ساز نجم) */}
              <div className="mt-4 space-y-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 shrink-0 text-violet-700" />
                  <div>
                    <div className="text-sm font-bold text-violet-950">
                      تنظیمات موتور افتخارات (قانون‌ساز نجم)
                    </div>
                    <div className="mt-0.5 text-[11px] leading-5 text-violet-700/80">
                      این تنظیمات فقط روی ارزیابی‌های جدید افتخارات اثر می‌گذارند؛ سوابق و افتخارات
                      اعطاشده قبلی دست‌نخورده می‌مانند.
                    </div>
                  </div>
                  {questSettingsSaving && (
                    <Loader2 className="mr-auto h-4 w-4 animate-spin text-violet-600" />
                  )}
                </div>

                {/* جلسات هر ماه */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3">
                  <div>
                    <div className="text-xs font-bold text-slate-800">جلسات در هر ماه</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      بازه‌ی زمانی «ماه» در قانون‌ساز = تعداد ماه × همین عدد جلسه (پیش‌فرض ۱۲ — قابل
                      ویرایش)
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-9 w-24 text-center"
                      inputMode="numeric"
                      value={questSettings.sessionsPerMonth}
                      disabled={questSettingsSaving}
                      onChange={(event) => updateSessionsPerMonth(event.target.value)}
                      onBlur={() => void commitSessionsPerMonth()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                      }}
                    />
                    <span className="text-[11px] text-muted-foreground">جلسه</span>
                  </div>
                </div>

                {/* ماتریس سیاست غیبت */}
                <div className="rounded-2xl bg-white/80 p-3">
                  <div className="mb-2">
                    <div className="text-xs font-bold text-slate-800">
                      سیاست رفتار با انواع غیبت در زنجیره‌ی افتخارات
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      با هر تغییر، خودکار ذخیره می‌شود و فقط بر ارزیابی‌های بعدی اثر دارد
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]" dir="rtl">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="p-2 text-right font-medium">نوع غیبت</th>
                          <th className="p-2 text-center font-medium">افتخارات آیتم‌های عادی</th>
                          <th className="p-2 text-center font-medium">افتخارات آیتم حضور</th>
                        </tr>
                      </thead>
                      <tbody>
                        {NAJM_ABSENCE_KINDS.map((kind) => (
                          <tr key={kind.value} className="border-b last:border-0">
                            <td className="p-2 font-medium">{kind.label}</td>
                            {(["normal", "attendance"] as const).map((scope) => (
                              <td key={scope} className="p-1.5 text-center">
                                <Select
                                  value={
                                    questSettings.absencePolicy[kind.value]?.[scope] ?? "ignore"
                                  }
                                  disabled={questSettingsSaving}
                                  onValueChange={(value) =>
                                    void updateAbsencePolicy(
                                      kind.value,
                                      scope,
                                      value as NajmAbsencePolicyAction,
                                    )
                                  }
                                >
                                  <SelectTrigger className="mx-auto h-8 w-44 text-[11px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {NAJM_ABSENCE_POLICY_ACTIONS.map((action) => (
                                      <SelectItem
                                        key={action.value}
                                        value={action.value}
                                        className="text-xs"
                                      >
                                        {action.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* پیش‌نمایش فرم استاد */}
              <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-white/70 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-emerald-900">
                  <Eye className="h-4 w-4" />
                  پیش‌نمایش ستون‌های فرم ثبت جلسه استاد (به همین ترتیب):
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="rounded-full text-[10px]">
                    قرآن‌آموز
                  </Badge>
                  {activeNajmItems(scoreItems).map((item) => (
                    <Badge
                      key={item.item_key}
                      variant="outline"
                      className={
                        "rounded-full text-[10px] " +
                        (item.kind === "negative"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : item.kind === "special"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700")
                      }
                    >
                      {item.label} ۰−{convertDigits(item.max_score)}
                      {item.kind === "negative" && item.weight > 1
                        ? ` (×${convertDigits(item.weight)})`
                        : ""}
                    </Badge>
                  ))}
                  <Badge
                    variant="outline"
                    className="rounded-full border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[10px] text-[#8a6d1d]"
                  >
                    امتیاز جلسه
                  </Badge>
                </div>
                <p className="mt-2 text-[10px] leading-5 text-slate-400">
                  آیتم‌های غیرفعال در فرم استاد نمایش داده نمی‌شوند اما سوابق قبلی‌شان در تاریخچه و
                  گزارش‌ها حفظ می‌ماند. برای مشاهده نتیجه روی پنل استاد، کافی است آن صفحه تازه‌سازی
                  شود.
                </p>
              </div>
            </Card>

            {/* مدیریت جلسات */}
            <Card className="soft-card border-0 p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="soft-icon flex h-12 w-12 items-center justify-center rounded-[1.4rem] text-[#B8860B]">
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-black text-emerald-950">
                      مدیریت جلسات ثبت‌شده اساتید
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {dailyApplyTime
                        ? `نمرات هر روز ساعت ${convertDigits(dailyApplyTime)} به‌طور خودکار اعمال می‌شوند.`
                        : "نمرات بلافاصله بعد از ثبت اعمال می‌شوند."}
                    </p>
                  </div>
                </div>
                {pendingExact > 0 && (
                  <Button
                    onClick={applyAllPending}
                    disabled={applyingAll}
                    className="gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white shrink-0"
                  >
                    {applyingAll ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    اعمال همه نمرات معلق ({convertDigits(pendingExact)} جلسه)
                  </Button>
                )}
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
                <Select value={managementScope} onValueChange={setManagementScope}>
                  <SelectTrigger>
                    <SelectValue placeholder="محدوده" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">فقط ترم فعال</SelectItem>
                    <SelectItem value="year">کل سال تحصیلی</SelectItem>
                    <SelectItem value="all">همه</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={managementClassFilter} onValueChange={setManagementClassFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="کلاس" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه کلاس‌ها</SelectItem>
                    {activeClasses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative lg:col-span-2">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={managementSearch}
                    onChange={(e) => setManagementSearch(e.target.value)}
                    placeholder="جستجو..."
                    className="pr-9"
                  />
                </div>
              </div>

              {managementSessions.length === 0 ? (
                <div className="soft-inset rounded-2xl p-8 text-center text-sm text-slate-500">
                  جلسه‌ای پیدا نشد.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-3xl border border-emerald-100/70 bg-white/55">
                  <table className="w-full min-w-[960px] text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-emerald-950/5 text-xs text-emerald-950/70">
                        <th className="p-3 text-right">وضعیت</th>
                        <th className="p-3 text-right">کلاس</th>
                        <th className="p-3 text-right">استاد</th>
                        <th className="p-3 text-center">تاریخ</th>
                        <th className="p-3 text-center">ترم / سال</th>
                        <th className="p-3 text-center">رکورد</th>
                        <th className="p-3 text-center">امتیاز</th>
                        <th className="p-3 text-center">امکانات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managementSessions.slice(0, 80).map((session) => (
                        <tr
                          key={session.id}
                          className={`border-t border-emerald-100/70 hover:bg-emerald-50/45 ${!session.is_applied ? "bg-amber-50/40" : ""}`}
                        >
                          <td className="p-3">
                            {session.is_applied !== false ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]">
                                <CheckCheck className="h-3 w-3 ml-0.5" />
                                اعمال‌شده
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">
                                <AlertCircle className="h-3 w-3 ml-0.5" />
                                معلق
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 font-black text-emerald-950">
                            {session.class_name || "کلاس بدون نام"}
                          </td>
                          <td className="p-3">{session.teacherName}</td>
                          <td className="p-3 text-center font-bold">
                            {convertDigits(session.session_date)}
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant="outline">
                              {termLabel(session.term)} • {convertDigits(session.academic_year)}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">{convertDigits(session.recordsCount)}</td>
                          <td className="p-3 text-center">
                            <Badge className="bg-[#D4AF37] text-emerald-950">
                              {convertDigits(session.totalScore)}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex justify-center gap-1.5 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openManagementSession(session)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {session.is_applied === false && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={applyingSessionId === session.id}
                                  onClick={() => applySession(session)}
                                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                >
                                  {applyingSessionId === session.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Zap className="h-3.5 w-3.5" />
                                  )}
                                  اعمال
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={managementDeletingId === session.id}
                                onClick={() => deleteManagementSession(session)}
                                className="border-rose-200 text-rose-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* دیالوگ جزئیات */}
      <Dialog open={managementDetailOpen} onOpenChange={setManagementDetailOpen}>
        <DialogContent className="max-h-[88vh] max-w-6xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-950">
              <History className="h-5 w-5 text-[#B8860B]" /> جزئیات مدیریتی جلسه طرح نجم
            </DialogTitle>
          </DialogHeader>

          {!selectedManagementSession ? (
            <div className="p-8 text-center text-sm text-slate-500">جلسه‌ای انتخاب نشده است.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                <div className="rounded-2xl bg-emerald-50 p-3">
                  <div className="text-xs text-slate-500">کلاس</div>
                  <div className="mt-1 font-black text-emerald-950">
                    {selectedManagementSession.class_name || "بدون نام"}
                  </div>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-3">
                  <div className="text-xs text-slate-500">استاد</div>
                  <div className="mt-1 font-black text-emerald-950">
                    {selectedManagementSession.teacherName}
                  </div>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-3">
                  <div className="text-xs text-slate-500">تاریخ</div>
                  <div className="mt-1 font-black text-emerald-950">
                    {convertDigits(selectedManagementSession.session_date)}
                  </div>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-3">
                  <div className="text-xs text-slate-500">ترم</div>
                  <div className="mt-1 font-black text-emerald-950">
                    {termLabel(selectedManagementSession.term)}
                  </div>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3">
                  <div className="text-xs text-slate-500">امتیاز کل</div>
                  <div className="mt-1 font-black text-amber-800">
                    {convertDigits(selectedManagementSession.totalScore)}
                  </div>
                </div>
                <div
                  className={`rounded-2xl p-3 ${selectedManagementSession.is_applied !== false ? "bg-emerald-50" : "bg-amber-50"}`}
                >
                  <div className="text-xs text-slate-500">وضعیت</div>
                  <div className="mt-1 font-black">
                    {selectedManagementSession.is_applied !== false ? (
                      <span className="text-emerald-800">اعمال‌شده ✓</span>
                    ) : (
                      <span className="text-amber-800">معلق ⏳</span>
                    )}
                  </div>
                </div>
              </div>

              {managementDetailLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <ManagementSessionDetails
                  records={managementDisplayRecords}
                  editable={managementEditMode}
                  items={scoreItems}
                  onFieldChange={updateManagementDraftField}
                />
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                {selectedManagementSession.is_applied === false && (
                  <Button
                    onClick={() => applySession(selectedManagementSession)}
                    disabled={applyingSessionId === selectedManagementSession.id}
                    className="gap-2 bg-blue-700 hover:bg-blue-800 text-white"
                  >
                    {applyingSessionId === selectedManagementSession.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    اعمال نمرات این جلسه
                  </Button>
                )}
                {canEditManagementSession && !managementEditMode && (
                  <Button variant="outline" onClick={() => setManagementEditMode(true)}>
                    <Pencil className="h-4 w-4" /> ویرایش نمرات
                  </Button>
                )}
                {canEditManagementSession && managementEditMode && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setManagementDraftRecords(
                          managementRecords.map((r) => ({
                            ...r,
                            custom_scores: { ...(r.custom_scores ?? {}) },
                          })),
                        );
                        setManagementEditMode(false);
                      }}
                    >
                      <RotateCcw className="h-4 w-4" /> انصراف
                    </Button>
                    <Button
                      onClick={saveManagementEdits}
                      disabled={managementEditSaving}
                      className="bg-emerald-700 hover:bg-emerald-800"
                    >
                      <Save className="h-4 w-4" /> ذخیره
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={() => setManagementDetailOpen(false)}>
                  بستن
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ----------------------------- کامپوننت‌ها ----------------------------- */
/** عنوان آیتم آزمون برای نمایش در متن توضیحات */
function examLabel(items: NajmScoreItem[]): string {
  return items.find((i) => i.item_key === NAJM_EXAM_KEY)?.label ?? "آزمون";
}

/** ورودی عددی کوچک با ذخیره‌سازی هنگام خروج از فوکوس یا Enter */
function ItemNumberInput({
  value,
  min = 0,
  max,
  disabled = false,
  onCommit,
}: {
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  function commit() {
    const n = clampScore(text, min, max);
    setText(String(n));
    if (n !== value) onCommit(n);
  }
  return (
    <Input
      type="number"
      dir="ltr"
      min={min}
      max={max}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="mx-auto h-8 w-16 rounded-xl text-center text-xs font-bold"
    />
  );
}

/** ورودی متن کوچک با ذخیره‌سازی هنگام خروج از فوکوس یا Enter */
function ItemTextInput({
  value,
  disabled = false,
  onCommit,
  className = "",
}: {
  value: string;
  disabled?: boolean;
  onCommit: (v: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  function commit() {
    const v = text.trim();
    if (v && v !== value) onCommit(v);
    else setText(value);
  }
  return (
    <Input
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <div className="px-4 py-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="soft-icon h-12 w-12 rounded-[1.4rem] text-emerald-950 flex items-center justify-center">
            {icon}
          </div>
          <div>
            <h2 className="font-display text-lg font-black text-emerald-950">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="soft-inset hidden md:flex items-center gap-2 rounded-full px-4 py-2 text-xs text-emerald-700">
          <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
          سامانه رشد قرآنی
        </div>
      </div>
    </div>
  );
}

function ScoreEditInput({
  value,
  min = 0,
  max,
  disabled = false,
  negative = false,
  onChange,
}: any) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(clampScore(e.target.value, min, max))}
      className={
        "mx-auto h-8 w-16 rounded-xl text-center text-xs font-bold " +
        (negative ? "border-rose-200 bg-rose-50 text-rose-700" : "")
      }
    />
  );
}

function ManagementSessionDetails({ records, editable = false, items = [], onFieldChange }: any) {
  const orderedItems: NajmScoreItem[] = sortNajmItems(items);
  const attendanceMax = najmAttendanceMax(orderedItems);
  const examItem = orderedItems.find((i) => i.item_key === NAJM_EXAM_KEY) ?? null;

  // حالت نمایش: رکوردها «منجمد» همان‌طور که ثبت شده‌اند (امتیاز ذخیره‌شده)
  // حالت ویرایش: امتیاز لحظه‌ای بر اساس آیتم‌های فعلی محاسبه می‌شود
  const displayScore = (record: any) =>
    editable
      ? computeSessionScoreWithItems(record, orderedItems)
      : Number(record.session_score ?? 0);

  const totals = records.reduce(
    (acc: any, record: any) => {
      acc.score += displayScore(record);
      const attendance = Number(record.attendance ?? 0);
      if (attendance === 0 || record.is_absent) acc.absent += 1;
      else if (attendance < attendanceMax) acc.late += 1;
      else acc.present += 1;
      return acc;
    },
    { score: 0, present: 0, late: 0, absent: 0 },
  );

  if (records.length === 0)
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
        رکوردی ثبت نشده است.
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">حاضر: {convertDigits(totals.present)}</Badge>
        <Badge variant="outline" className="border-amber-200 text-amber-700">
          تأخیر: {convertDigits(totals.late)}
        </Badge>
        <Badge variant="outline" className="border-rose-200 text-rose-700">
          غایب: {convertDigits(totals.absent)}
        </Badge>
        <Badge className="bg-[#D4AF37] text-emerald-950">
          امتیاز کل: {convertDigits(totals.score)}
        </Badge>
      </div>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[1080px] text-xs md:text-sm" dir="rtl">
          <thead>
            <tr className="bg-emerald-950/5 text-slate-600">
              <th className="p-2 text-right">قرآن‌آموز</th>
              {orderedItems.map((item) => (
                <th
                  key={item.item_key}
                  className={
                    "p-2 text-center " +
                    (item.kind === "negative"
                      ? "bg-rose-50"
                      : item.kind === "special"
                        ? "bg-emerald-50"
                        : "")
                  }
                  title={
                    !item.is_active
                      ? "این آیتم اکنون غیرفعال است؛ مقادیر قبلی منجمد نمایش داده می‌شود"
                      : undefined
                  }
                >
                  {item.label}
                  {item.kind === "negative" && item.weight > 1 && (
                    <span className="block text-[10px] font-normal text-rose-500">
                      هر واحد {convertDigits(item.weight)}−
                    </span>
                  )}
                </th>
              ))}
              {examItem && <th className="p-2 text-center">نمره نمایشی</th>}
              <th className="p-2 text-center">جبران</th>
              <th className="p-2 text-center">امتیاز جلسه</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record: any) => {
              const attendance = Number(record.attendance ?? 0);
              const absent = attendance === 0 || record.is_absent;
              return (
                <tr key={record.id} className="border-t hover:bg-slate-50">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{initials(record.student_name || "ن")}</AvatarFallback>
                      </Avatar>
                      <span className="font-bold">{record.student_name || "بدون نام"}</span>
                    </div>
                  </td>
                  {orderedItems.map((item) => {
                    const value = getNajmItemValue(record, item);
                    const cellClass =
                      item.kind === "negative"
                        ? "p-2 text-center bg-rose-50/70 text-rose-700"
                        : item.kind === "special"
                          ? "p-2 text-center bg-emerald-50/60"
                          : "p-2 text-center";

                    // ستون حضور: نمایش وضعیت حاضر/غایب/تأخیر
                    if (item.item_key === NAJM_ATTENDANCE_KEY) {
                      return (
                        <td key={item.item_key} className={cellClass}>
                          {editable ? (
                            <ScoreEditInput
                              value={attendance}
                              max={item.max_score}
                              onChange={(v: number) => onFieldChange?.(String(record.id), item, v)}
                            />
                          ) : (
                            <Badge variant="outline">
                              {absent
                                ? "غایب"
                                : attendance >= attendanceMax
                                  ? "حاضر"
                                  : `${convertDigits((attendanceMax - attendance) * 10)} دقیقه تأخیر`}
                            </Badge>
                          )}
                        </td>
                      );
                    }

                    // آیتم‌های منفی: نمایش مقدار کسر
                    if (item.kind === "negative") {
                      return (
                        <td key={item.item_key} className={cellClass}>
                          {editable ? (
                            <ScoreEditInput
                              value={value}
                              max={item.max_score}
                              disabled={absent}
                              negative
                              onChange={(v: number) => onFieldChange?.(String(record.id), item, v)}
                            />
                          ) : (
                            <>-{convertDigits(value * item.weight)}</>
                          )}
                        </td>
                      );
                    }

                    // آیتم‌های ویژه: برجسته‌سازی مقادیر مثبت
                    if (item.kind === "special") {
                      return (
                        <td key={item.item_key} className={cellClass}>
                          {editable ? (
                            <ScoreEditInput
                              value={value}
                              max={item.max_score}
                              disabled={absent}
                              onChange={(v: number) => onFieldChange?.(String(record.id), item, v)}
                            />
                          ) : value > 0 ? (
                            <Badge className="bg-[#D4AF37] text-emerald-950">
                              +{convertDigits(value)}
                            </Badge>
                          ) : (
                            convertDigits(value)
                          )}
                        </td>
                      );
                    }

                    // آیتم‌های مثبت عادی
                    return (
                      <td key={item.item_key} className={cellClass}>
                        {editable ? (
                          <ScoreEditInput
                            value={value}
                            max={item.max_score}
                            disabled={absent}
                            onChange={(v: number) => onFieldChange?.(String(record.id), item, v)}
                          />
                        ) : (
                          convertDigits(value)
                        )}
                      </td>
                    );
                  })}
                  {examItem && (
                    <td className="p-2 text-center font-bold text-emerald-700">
                      {absent
                        ? "—"
                        : convertDigits(examDisplay(getNajmItemValue(record, examItem)))}
                    </td>
                  )}
                  <td className="p-2 text-center">
                    {Number(record.recovery_bonus ?? 0) > 0 ? (
                      <ConductRecoveryHistoryDialog
                        studentId={record.student_id}
                        sessionId={record.session_id}
                        recoveryBonus={Number(record.recovery_bonus ?? 0)}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-center font-black text-emerald-950">
                    {convertDigits(displayScore(record))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankOrb({ index, light = false }: { index: number; light?: boolean }) {
  const tone =
    index === 0
      ? "text-[#B8860B]"
      : index === 1
        ? "text-slate-600"
        : index === 2
          ? "text-orange-700"
          : "text-emerald-700";
  return (
    <div
      className={`soft-rank h-10 w-10 shrink-0 rounded-full ${tone} flex items-center justify-center ${light ? "ring-2 ring-white/70" : ""}`}
    >
      {rankIcon(index)}
    </div>
  );
}

function ScorePill({ score, light = false }: { score: number; light?: boolean }) {
  return (
    <span
      className={
        "score-token inline-flex min-w-[5.4rem] items-center justify-center gap-1 px-3 py-1.5 font-display text-sm font-black text-emerald-950 " +
        (light ? "ring-2 ring-white/70" : "")
      }
    >
      <span className="ml-1 text-[11px] font-bold opacity-85">امتیاز</span>
      {convertDigits(score)}
    </span>
  );
}

function OverallTopTen({ rows }: { rows: StudentStanding[] }) {
  if (rows.length === 0)
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        هنوز امتیازی برای رتبه‌بندی کل دارالقرآن ثبت نشده است.
      </div>
    );
  const podium =
    rows.length >= 3
      ? [
          { row: rows[1], index: 1, featured: false },
          { row: rows[0], index: 0, featured: true },
          { row: rows[2], index: 2, featured: false },
        ]
      : rows.map((row, index) => ({ row, index, featured: index === 0 }));
  const rest = rows.slice(3, 10);
  return (
    <div className="p-4 md:p-5 space-y-5">
      <div className="podium-stage grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
        {podium.map((item) => (
          <PodiumCard
            key={item.row.studentId}
            row={item.row}
            index={item.index}
            featured={item.featured}
          />
        ))}
      </div>
      {rest.length > 0 && (
        <div className="soft-inset rounded-[1.8rem] p-3">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {rest.map((row, i) => (
              <OverallCompactRow key={row.studentId} row={row} index={i + 3} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StudentPhotoAvatar({ photoUrl, name, className, fallbackClassName }: any) {
  const [resolvedUrl, setResolvedUrl] = useState("");
  useEffect(() => {
    let active = true;
    setResolvedUrl("");
    if (!photoUrl) return;
    resolveStudentPhotoUrl(photoUrl).then((url) => {
      if (active) setResolvedUrl(url);
    });
    return () => {
      active = false;
    };
  }, [photoUrl]);
  return (
    <Avatar className={className + " student-photo-circle"}>
      {resolvedUrl ? (
        <img
          src={resolvedUrl}
          alt={name}
          className="absolute inset-0 h-full w-full rounded-full object-cover object-center"
        />
      ) : (
        <AvatarFallback className={fallbackClassName}>{initials(name)}</AvatarFallback>
      )}
    </Avatar>
  );
}

function PodiumCard({ row, index, featured }: any) {
  const labels = ["رتبه اول", "رتبه دوم", "رتبه سوم"];
  const cardClass =
    index === 0
      ? "soft-champion rank-card-first md:min-h-[240px] scale-[1.03]"
      : index === 1
        ? "soft-card rank-card-second md:min-h-[205px]"
        : index === 2
          ? "soft-card rank-card-third md:min-h-[205px]"
          : "soft-card md:min-h-[205px]";
  return (
    <div
      className={`podium-3d-card relative overflow-hidden rounded-[2rem] p-5 text-center ${cardClass}`}
    >
      <div className="relative flex flex-col items-center gap-3">
        <Badge
          className={
            (featured ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-950") +
            " border-0 rounded-full shadow-sm"
          }
        >
          {labels[index] ?? `رتبه ${rankLabel(index)}`}
        </Badge>
        <RankOrb index={index} />
        <StudentPhotoAvatar
          photoUrl={row.photoUrl}
          name={row.studentName}
          className={
            (featured ? "h-24 w-24" : "h-20 w-20") + " rounded-full soft-avatar overflow-hidden"
          }
          fallbackClassName="rounded-full bg-transparent text-emerald-950 font-display text-lg font-black"
        />
        <div
          className={`soft-name-card rank-name-card rank-name-${index} w-full max-w-[220px] px-3 py-2 text-center`}
        >
          <h3
            className={
              (featured ? "text-xl" : "text-base") +
              " font-display font-black text-emerald-950 truncate"
            }
          >
            {row.studentName}
          </h3>
          <p className="mt-1 text-xs font-medium text-emerald-800/70 truncate">
            {row.className || "کلاس نامشخص"}
          </p>
        </div>
        <ScorePill score={row.score} />
      </div>
    </div>
  );
}

function OverallCompactRow({ row, index }: any) {
  return (
    <div
      className={`row-3d soft-row rank-row-${index} flex items-center justify-between gap-3 rounded-[1.4rem] p-3 transition-transform hover:-translate-y-0.5`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <RankOrb index={index} />
        <StudentPhotoAvatar
          photoUrl={row.photoUrl}
          name={row.studentName}
          className="h-12 w-12 shrink-0 rounded-full soft-avatar-sm overflow-hidden"
          fallbackClassName="rounded-full bg-transparent text-emerald-950 text-xs font-bold"
        />
        <div className={`soft-name-card rank-name-card rank-name-${index} min-w-0 px-3 py-2`}>
          <div className="font-bold text-sm truncate text-emerald-950">{row.studentName}</div>
          <div className="text-xs font-medium text-emerald-800/70 truncate">
            {row.className || "کلاس نامشخص"}
          </div>
        </div>
      </div>
      <ScorePill score={row.score} />
    </div>
  );
}

function ClassTopFiveCard({ item }: { item: ClassStanding }) {
  return (
    <Card className="class-3d-card soft-card overflow-hidden border-0 transition-transform hover:-translate-y-1">
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="soft-icon h-12 w-12 rounded-[1.4rem] text-emerald-950 flex items-center justify-center shrink-0">
              <Star className="h-6 w-6 fill-current" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-black text-lg text-emerald-950 truncate">
                {item.className}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {item.level ? `سطح ${item.level} • ` : ""}
                {convertDigits(item.sessionsCount)} جلسه • {convertDigits(item.studentsCount)}{" "}
                قرآن‌آموز رتبه‌دار
              </p>
            </div>
          </div>
          <Badge className="shrink-0 rounded-full border-0 bg-amber-100 text-amber-800 hover:bg-amber-100 shadow-sm">
            <Trophy className="h-3.5 w-3.5 ml-1" />۵ نفر برتر
          </Badge>
        </div>
      </div>
      <div className="px-3 pb-3">
        <div className="ranking-table-frame soft-inset overflow-hidden rounded-[1.8rem] p-1">
          <table className="w-full text-sm border-separate border-spacing-y-2" dir="rtl">
            <colgroup>
              <col className="w-[120px]" />
              <col className="w-[82px]" />
              <col />
              <col className="w-[160px]" />
              <col className="w-[170px]" />
            </colgroup>
            <thead>
              <tr className="ranking-table-head">
                <th className="px-3 py-2 text-center w-24">رتبه</th>
                <th className="px-3 py-2 text-center">نشان</th>
                <th className="px-3 py-2 text-right">نام قرآن‌آموز</th>
                <th className="px-3 py-2 text-center">تعداد جلسه</th>
                <th className="px-3 py-2 text-center">امتیاز</th>
              </tr>
            </thead>
            <tbody>
              {item.topFive.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    هنوز امتیازی ثبت نشده است.
                  </td>
                </tr>
              ) : (
                item.topFive.map((student, index) => (
                  <tr
                    key={student.studentId}
                    className={
                      index === 0
                        ? "row-3d soft-row-gold rank-row-first"
                        : index === 1
                          ? "row-3d soft-row rank-row-second"
                          : index === 2
                            ? "row-3d soft-row rank-row-third"
                            : "row-3d soft-row"
                    }
                  >
                    <td className="px-3 py-3 rounded-r-[1.2rem] text-center">
                      <div className="flex items-center justify-center gap-2">
                        <RankOrb index={index} />
                        <span className="text-xs text-slate-500">رتبه {rankLabel(index)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StudentPhotoAvatar
                        photoUrl={student.photoUrl}
                        name={student.studentName}
                        className="h-12 w-12 mx-auto shrink-0 rounded-full soft-avatar-sm overflow-hidden"
                        fallbackClassName="rounded-full bg-transparent text-emerald-950 text-xs font-bold"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div
                        className={`soft-name-card rank-name-card rank-name-${index} min-w-0 px-3 py-2`}
                      >
                        <div className="font-bold truncate text-emerald-950">
                          {student.studentName}
                        </div>
                        <div className="text-[11px] font-medium text-emerald-800/70 truncate">
                          {item.className}
                        </div>
                      </div>
                    </td>
                    <td className="session-count-cell px-3 py-3 text-center">
                      {convertDigits(student.sessionsCount)}
                    </td>
                    <td className="px-3 py-3 text-center rounded-l-[1.2rem]">
                      <ScorePill score={student.score} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {item.absentReplaced && item.absentReplaced > 0 && (
        <div className="px-5 pb-4">
          <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs">
            {convertDigits(item.absentReplaced)} جلسه غیبت با ضریب جایگزین اعمال شد
          </Badge>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------- استایل کامل (همانند پنل استاد) ----------------------------- */
const najmNeumorphismStyle = `
.najm-soft-page { background: radial-gradient(circle at 14% 10%, rgba(212,175,55,.20), transparent 27%), radial-gradient(circle at 88% 12%, rgba(6,78,59,.18), transparent 25%), #dcebe3; color: #0f172a; font-family: inherit; }
.soft-panel, .soft-card { position: relative; overflow: hidden; background: #dcebe3; border-radius: 2rem; box-shadow: 14px 14px 30px rgba(6,78,59,.22), -14px -14px 30px rgba(255,255,255,.78); }
.soft-panel::before, .soft-card::before { content: ""; position: absolute; inset: 0; pointer-events: none; background-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22180%22%20height%3D%22130%22%20viewBox%3D%220%200%20180%20130%22%3E%0A%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23D4AF37%22%20stroke-width%3D%221.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20opacity%3D%220.34%22%3E%0A%20%20%20%20%3Cpath%20d%3D%22M-18%2092%20C24%2034%2C%2065%2036%2C%2090%2070%20S145%20110%2C%20198%2032%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M-10%2038%20C32%2088%2C%2072%2090%2C%2095%2054%20S150%206%2C%20190%2080%22%20opacity%3D%220.75%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M42%2059%20C34%2045%2C%2037%2033%2C%2051%2027%20C52%2042%2C%2054%2053%2C%2042%2059Z%22%20fill%3D%22%23D4AF37%22%20opacity%3D%220.22%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M78%2072%20C90%2058%2C%20104%2058%2C%20116%2071%20C101%2077%2C%2090%2081%2C%2078%2072Z%22%20fill%3D%22%23FDE68A%22%20opacity%3D%220.18%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M132%2062%20C123%2047%2C%20127%2034%2C%20142%2028%20C143%2044%2C%20145%2056%2C%20132%2062Z%22%20fill%3D%22%23D4AF37%22%20opacity%3D%220.20%22%2F%3E%0A%20%20%20%20%3Ccircle%20cx%3D%2290%22%20cy%3D%2270%22%20r%3D%222.1%22%20fill%3D%22%23FDE68A%22%20opacity%3D%220.45%22%2F%3E%0A%20%20%20%20%3Ccircle%20cx%3D%2295%22%20cy%3D%2254%22%20r%3D%221.9%22%20fill%3D%22%23FDE68A%22%20opacity%3D%220.38%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23064E3B%22%20stroke-width%3D%221%22%20stroke-linecap%3D%22round%22%20opacity%3D%220.12%22%3E%0A%20%20%20%20%3Cpath%20d%3D%22M20%20108%20C50%2078%2C%2075%2084%2C%2092%20104%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M115%2020%20C142%2049%2C%20162%2044%2C%20178%2024%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E"); background-size: 172px 124px; background-position: 10px 8px; opacity: .58; }
.soft-panel > *, .soft-card > * { position: relative; z-index: 1; }
.soft-inset { background: #dcebe3; box-shadow: inset 8px 8px 18px rgba(6,78,59,.18), inset -8px -8px 18px rgba(255,255,255,.82); }
.soft-icon, .soft-rank, .soft-button, .soft-avatar, .soft-avatar-sm, .soft-stat { background: #dcebe3; box-shadow: 7px 7px 15px rgba(6,78,59,.20), -7px -7px 15px rgba(255,255,255,.84); }
.soft-icon { color: #064E3B; }
.soft-champion { background: linear-gradient(145deg, rgba(212,175,55,.28), #dcebe3 58%); border-radius: 2rem; box-shadow: 16px 16px 34px rgba(6,78,59,.24), -16px -16px 34px rgba(255,255,255,.84), 0 0 0 1px rgba(212,175,55,.34), 0 18px 45px rgba(212,175,55,.18); }
.soft-row { background: linear-gradient(145deg, #cfe3d9, #d7e9df); box-shadow: 7px 7px 16px rgba(6,78,59,.22), -7px -7px 16px rgba(255,255,255,.70), inset 0 0 0 1px rgba(6,78,59,.045); }
.soft-row-gold { background: linear-gradient(145deg, rgba(212,175,55,.38), #d4e6dc 58%); box-shadow: 7px 7px 16px rgba(6,78,59,.22), -7px -7px 16px rgba(255,255,255,.72), inset 0 0 0 1px rgba(212,175,55,.32); }
.soft-card { background: #d4e6dc; }
.soft-avatar, .soft-avatar-sm { padding: 3px; box-shadow: 7px 7px 15px rgba(6,78,59,.18), -7px -7px 15px rgba(255,255,255,.84), inset 0 0 0 2px rgba(212,175,55,.28); }
.soft-avatar img, .soft-avatar-sm img { border-radius: 999px; }
.student-photo-circle { border: 3px solid #D4AF37 !important; padding: 0 !important; overflow: hidden !important; border-radius: 9999px; box-shadow: 7px 7px 15px rgba(6,78,59,.18), -7px -7px 15px rgba(255,255,255,.84), 0 0 0 2px rgba(212,175,55,.18) !important; }
.student-photo-circle img { inset: 0 !important; width: 100% !important; height: 100% !important; border-radius: 9999px !important; object-fit: cover !important; object-position: center 38% !important; transform: scale(.90); transform-origin: center center; }
.soft-name-card { background: linear-gradient(145deg, rgba(212,175,55,.24), rgba(255,248,231,.82)) !important; box-shadow: inset 3px 3px 7px rgba(120,83,20,.08), inset -3px -3px 7px rgba(255,255,255,.76), 0 0 0 1px rgba(212,175,55,.26) !important; border-radius: 1.15rem; }
.soft-name-card .text-emerald-800\\/70 { color: rgba(122,82,0,.78) !important; }
.rank-card-first, .rank-row-first { background: linear-gradient(145deg, rgba(212,175,55,.72), rgba(244,202,77,.48) 38%, #d8e8df 72%) !important; box-shadow: 12px 12px 26px rgba(6,78,59,.22), -12px -12px 26px rgba(255,255,255,.78), inset 0 0 0 1px rgba(212,175,55,.55), 0 14px 34px rgba(184,134,11,.22) !important; }
.rank-card-second, .rank-row-second { background: linear-gradient(145deg, rgba(212,175,55,.42), rgba(255,232,145,.26) 42%, #dcebe3 74%) !important; box-shadow: 8px 8px 18px rgba(6,78,59,.18), -8px -8px 18px rgba(255,255,255,.82), inset 0 0 0 1px rgba(212,175,55,.32) !important; }
.rank-card-third, .rank-row-third { background: linear-gradient(145deg, rgba(184,134,11,.36), rgba(212,175,55,.20) 42%, #dcebe3 74%) !important; box-shadow: 8px 8px 18px rgba(6,78,59,.18), -8px -8px 18px rgba(255,255,255,.82), inset 0 0 0 1px rgba(184,134,11,.30) !important; }
.najm-soft-page { perspective: 1400px; }
.section-3d, .class-3d-card { transform-style: preserve-3d; }
.podium-stage { perspective: 1200px; transform-style: preserve-3d; padding-bottom: .35rem; }
.podium-3d-card { transform-style: preserve-3d; transform: rotateX(2deg) translateZ(0); transition: transform .35s ease, box-shadow .35s ease; }
.podium-3d-card:hover { transform: rotateX(0deg) translateY(-6px) translateZ(22px); }
.rank-card-first { box-shadow: 0 28px 55px rgba(184,134,11,.22), 18px 18px 34px rgba(6,78,59,.24), -16px -16px 30px rgba(255,255,255,.78), inset 0 2px 0 rgba(255,255,255,.50), inset 0 -8px 18px rgba(184,134,11,.10) !important; }
.rank-card-second, .rank-card-third { box-shadow: 0 20px 38px rgba(6,78,59,.16), 12px 12px 26px rgba(6,78,59,.18), -12px -12px 26px rgba(255,255,255,.76), inset 0 2px 0 rgba(255,255,255,.45) !important; }
.class-3d-card { box-shadow: 0 20px 42px rgba(6,78,59,.12), 14px 14px 30px rgba(6,78,59,.18), -12px -12px 28px rgba(255,255,255,.78), inset 0 1px 0 rgba(255,255,255,.45) !important; }
.class-3d-card:hover { transform: translateY(-7px) rotateX(1deg); }
.row-3d { box-shadow: 6px 9px 18px rgba(6,78,59,.16), -5px -5px 13px rgba(255,255,255,.78), inset 0 1px 0 rgba(255,255,255,.42) !important; }
.row-3d:hover { transform: translateY(-3px) translateZ(8px); }
.soft-name-card { transform: translateZ(12px); }
.najm-compact-header { min-height: 0 !important; height: auto !important; background: linear-gradient(145deg, rgba(212,175,55,.10), rgba(220,235,227,.98) 46%, rgba(6,78,59,.08)); box-shadow: 10px 10px 24px rgba(6,78,59,.16), -10px -10px 24px rgba(255,255,255,.78); }
.najm-compact-header::before { content: ""; position: absolute; inset: 0; background-image: radial-gradient(circle at 50% 50%, rgba(212,175,55,.16) 0 2px, transparent 2.8px); background-size: 58px 58px; opacity: .35; pointer-events: none; }
.compact-header-icon, .compact-mini-stat, .compact-button { background: #dcebe3; box-shadow: 6px 6px 13px rgba(6,78,59,.16), -6px -6px 13px rgba(255,255,255,.82); }
.compact-header-icon { color: #064E3B; background: linear-gradient(145deg, rgba(212,175,55,.25), #dcebe3 60%); }
.compact-button { min-height: 36px; }
.ranking-table-frame { border: 0 !important; border-radius: 2.15rem !important; padding: .85rem !important; background: #dcebe3 !important; box-shadow: inset 8px 8px 18px rgba(6,78,59,.14), inset -8px -8px 18px rgba(255,255,255,.78) !important; }
.ranking-table-frame::before, .ranking-table-frame::after { display: none !important; }
.ranking-table-frame table { table-layout: fixed !important; border-collapse: separate !important; border-spacing: 0 .8rem !important; }
.ranking-table-frame .ranking-table-head th { background: linear-gradient(90deg, #064E3B, #08765a, #064E3B) !important; color: #FFF8E7 !important; border: 0 !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 10px 18px rgba(6,78,59,.14) !important; padding: .9rem .85rem !important; position: relative; overflow: hidden; }
.ranking-table-frame .ranking-table-head th:first-child { border-top-right-radius: 1.35rem !important; border-bottom-right-radius: 1.35rem !important; }
.ranking-table-frame .ranking-table-head th:last-child { border-top-left-radius: 1.35rem !important; border-bottom-left-radius: 1.35rem !important; }
.ranking-table-frame tbody tr { background: #dcebe3 !important; border-radius: 1.35rem !important; box-shadow: 7px 9px 18px rgba(6,78,59,.16), -6px -6px 14px rgba(255,255,255,.78), inset 0 1px 0 rgba(255,255,255,.42) !important; transition: transform .22s ease, box-shadow .22s ease; }
.ranking-table-frame tbody tr.rank-row-first, .ranking-table-frame tbody tr.soft-row-gold { background: linear-gradient(90deg, rgba(212,175,55,.26), #dcebe3 42%, #dcebe3) !important; }
.ranking-table-frame tbody tr.rank-row-second { background: linear-gradient(90deg, rgba(148,163,184,.16), #dcebe3 42%, #dcebe3) !important; }
.ranking-table-frame tbody tr.rank-row-third { background: linear-gradient(90deg, rgba(184,134,11,.13), #dcebe3 42%, #dcebe3) !important; }
.ranking-table-frame tbody tr:hover { transform: translateY(-4px) !important; box-shadow: 10px 14px 24px rgba(6,78,59,.20), -7px -7px 16px rgba(255,255,255,.82) !important; }
.ranking-table-frame tbody td { background: transparent !important; border: 0 !important; box-shadow: none !important; vertical-align: middle !important; }
.ranking-table-frame tbody td:first-child { border-top-right-radius: 1.35rem !important; border-bottom-right-radius: 1.35rem !important; }
.ranking-table-frame tbody td:last-child { border-top-left-radius: 1.35rem !important; border-bottom-left-radius: 1.35rem !important; }
.najm-soft-page { background: radial-gradient(circle at 18% 12%, rgba(212,175,55,.09), transparent 24%), radial-gradient(circle at 82% 18%, rgba(6,78,59,.06), transparent 26%), linear-gradient(135deg, #f7f0df 0%, #eee3c8 46%, #fbf6ea 100%) !important; color: #17352c; font-family: Vazirmatn, IRANSans, Tahoma, Arial, sans-serif; }
.najm-soft-page::before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .34; background-image: radial-gradient(circle at 20% 25%, rgba(80,65,35,.10) 0 1px, transparent 1.4px), radial-gradient(circle at 70% 70%, rgba(255,255,255,.42) 0 1px, transparent 1.6px), linear-gradient(45deg, rgba(90,75,45,.035) 25%, transparent 25%, transparent 75%, rgba(90,75,45,.035) 75%); background-size: 18px 18px, 26px 26px, 42px 42px; z-index: 0; }
.najm-soft-page > * { position: relative; z-index: 1; }
.najm-soft-page h1, .najm-soft-page h2, .najm-soft-page h3, .font-display { font-family: "Noto Naskh Arabic", "Times New Roman", Vazirmatn, serif; letter-spacing: -0.015em; }
.soft-panel, .soft-card, .soft-inset { background: rgba(241,232,208,.92) !important; }
.score-token { border-radius: .85rem; background: linear-gradient(135deg, #8a6508 0%, #d4af37 34%, #f0d77a 52%, #b8860b 100%) !important; border: 1px solid rgba(96,67,0,.32); box-shadow: inset 1px 1px 1px rgba(255,255,255,.34), inset -2px -2px 5px rgba(76,50,0,.25), 0 8px 16px rgba(92,62,0,.16) !important; text-shadow: 0 1px 0 rgba(255,255,255,.22); position: relative; }
.score-token::before { content: ""; position: absolute; inset: 2px; border-radius: .65rem; border: 1px solid rgba(255,248,210,.22); pointer-events: none; }
.soft-rank { background: linear-gradient(145deg, #f0d77a, #d4af37 48%, #8a6508) !important; color: #12352a !important; border: 1px solid rgba(92,62,0,.28); box-shadow: inset 1px 1px 2px rgba(255,255,255,.35), inset -2px -2px 5px rgba(76,50,0,.22), 0 7px 14px rgba(6,78,59,.13) !important; }
.session-count-cell { color: #064E3B !important; font-weight: 900; font-size: 1.05rem; letter-spacing: .02em; vertical-align: middle !important; }
.podium-3d-card .soft-name-card { background: linear-gradient(145deg, rgba(239,230,204,.88), rgba(220,235,227,.78)) !important; box-shadow: inset 3px 3px 7px rgba(6,78,59,.07), inset -3px -3px 7px rgba(255,255,255,.70), 0 0 0 1px rgba(6,78,59,.10) !important; }
.podium-3d-card .score-token { background: linear-gradient(145deg, #dcebe3, #cfe3d9) !important; color: #064E3B !important; border: 1px solid rgba(6,78,59,.12) !important; box-shadow: 5px 5px 12px rgba(6,78,59,.13), -5px -5px 12px rgba(255,255,255,.72), inset 0 1px 0 rgba(255,255,255,.42) !important; text-shadow: none !important; }
.podium-3d-card .score-token::before, .podium-3d-card .score-token::after { display: none !important; }
.ranking-table-frame { background: linear-gradient(135deg, rgba(255,248,231,.82), rgba(247,237,210,.72)), #fff8e7 !important; }
.ranking-table-frame tbody tr, .ranking-table-frame tbody tr.rank-row-first, .ranking-table-frame tbody tr.rank-row-second, .ranking-table-frame tbody tr.rank-row-third, .ranking-table-frame tbody tr.soft-row-gold { background: linear-gradient(145deg, #fff8e7, #f3e7c8) !important; box-shadow: 7px 9px 18px rgba(120,83,20,.11), -6px -6px 14px rgba(255,255,255,.82), inset 0 1px 0 rgba(255,255,255,.55) !important; }
.ranking-table-frame tbody tr td, .ranking-table-frame tbody tr.rank-row-first td, .ranking-table-frame tbody tr.rank-row-second td, .ranking-table-frame tbody tr.rank-row-third td, .ranking-table-frame tbody tr.soft-row-gold td { background: transparent !important; border: 0 !important; box-shadow: none !important; }
.ranking-table-frame tbody tr:hover, .ranking-table-frame tbody tr.rank-row-first:hover, .ranking-table-frame tbody tr.rank-row-second:hover, .ranking-table-frame tbody tr.rank-row-third:hover { background: linear-gradient(145deg, #fff5d9, #efe1bd) !important; transform: translateY(-4px) !important; box-shadow: 10px 14px 24px rgba(120,83,20,.15), -7px -7px 16px rgba(255,255,255,.86) !important; }
.ranking-table-frame .soft-name-card, .ranking-table-frame .soft-row-gold .soft-name-card, .ranking-table-frame .rank-row-first .soft-name-card, .ranking-table-frame .rank-row-second .soft-name-card, .ranking-table-frame .rank-row-third .soft-name-card { background: linear-gradient(145deg, rgba(255,253,247,.86), rgba(242,230,197,.76)) !important; box-shadow: 4px 4px 10px rgba(120,83,20,.08), -4px -4px 10px rgba(255,255,255,.72), inset 0 1px 0 rgba(255,255,255,.52) !important; }
.ranking-table-frame .session-count-cell { color: #6b4f0b !important; }
`;
