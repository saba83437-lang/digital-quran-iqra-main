import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ClipboardList,
  Plus,
  Loader2,
  Search,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit,
  Trash2,
  Copy,
  Eye,
  Mic,
  Upload,
  FileText,
  Image as ImageIcon,
  FileAudio,
  FileVideo,
  File as FileIcon,
  Paperclip,
  X,
  Save,
  Send,
  BookOpen,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  Filter,
  LayoutTemplate,
  Sparkles,
  Square,
  CheckSquare,
  Star,
  MessageSquare,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Timer,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { getCurrentTeacher, type CurrentTeacher } from "@/lib/teacher-utils";
import { uploadAssignmentAudio, uploadAssignmentFile } from "@/lib/storage";
import { deleteAssignmentSecurely } from "@/features/assignments/api/assignment-lifecycle-api";
import {
  SecureAssignmentAudio,
  SecureAssignmentFileLink,
} from "@/features/assignments/components/secure-assignment-file";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/assignments")({
  head: () => ({
    meta: [
      { title: "دارالقرآن ٱلوالدین — تکالیف" },
      { name: "description", content: "مدیریت تکالیف قرآن‌آموزان" },
    ],
  }),
  component: AssignmentsPage,
});

/* ================================================================== */
/* ثابت‌ها                                                            */
/* ================================================================== */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const ASSIGNMENT_TYPES: {
  value: AssignmentType;
  label: string;
  icon: ReactNode;
  color: string;
}[] = [
  {
    value: "hifz",
    label: "حفظ",
    icon: <BookOpen className="h-4 w-4" />,
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  {
    value: "tajwid",
    label: "تجوید",
    icon: <Sparkles className="h-4 w-4" />,
    color: "bg-purple-100 text-purple-700 border-purple-200",
  },
  {
    value: "sout_lahn",
    label: "صوت و لحن",
    icon: <FileAudio className="h-4 w-4" />,
    color: "bg-pink-100 text-pink-700 border-pink-200",
  },
];

/** گزینه‌های مهلت ارسال (شمارش معکوس از زمان ایجاد) */
const DEADLINE_OPTIONS: { value: number; label: string }[] = [
  { value: 12, label: "۱۲ ساعت" },
  { value: 24, label: "۲۴ ساعت (یک روز)" },
  { value: 48, label: "۴۸ ساعت (دو روز)" },
  { value: 60, label: "۶۰ ساعت (دو و نیم روز)" },
  { value: 72, label: "۷۲ ساعت (سه روز)" },
  { value: 168, label: "یک هفته (۱۶۸ ساعت)" },
];

const SUBMISSION_STATUS: Record<
  SubmissionStatus,
  { label: string; color: string; icon: ReactNode }
> = {
  pending: {
    label: "در انتظار بررسی",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    label: "تأیید شده",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  needs_revision: {
    label: "نیاز به اصلاح",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  rejected: {
    label: "رد شده",
    color: "bg-rose-100 text-rose-700 border-rose-200",
    icon: <XCircle className="h-3 w-3" />,
  },
};

/* ================================================================== */
/* Types                                                              */
/* ================================================================== */
type AssignmentType = "hifz" | "tajwid" | "sout_lahn";

type SubmissionType = "audio" | "file" | "text";
type SubmissionStatus = "pending" | "approved" | "needs_revision" | "rejected";
type TargetType = "all" | "specific";

interface ClassRow {
  id: string;
  name: string;
  level: string;
}

interface StudentRow {
  id: string;
  name: string;
  class_id: string | null;
}

interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

interface AudioClip {
  url: string;
  duration: number; // seconds
  blob?: Blob;
}

interface Assignment {
  id: string;
  teacher_id: string;
  class_id: string;
  /** تاریخ جلسه (شمسی) - مثلاً ۱۴۰۳/۰۷/۲۵ */
  session_date: string;
  /** شماره جلسه (برای سازگاری با داده‌های قدیمی) */
  session_number?: number;
  title: string;
  description: string;
  audio_url: string | null;
  attachments: Attachment[];
  /** مهلت ارسال به ساعت - شمارش معکوس از زمان ایجاد */
  deadline_hours: number;
  /** تاریخ مهلت محاسبه‌شده (ISO) - مشتق از deadline_hours */
  due_date?: string;
  /** ساعت مهلت (مثلاً "23:59") */
  due_time?: string | null;
  type: AssignmentType;
  is_required: boolean;
  notes: string;
  target_type: TargetType;
  target_students: string[];
  is_template: boolean;
  created_at: string;
}

interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_at: string;
  type: SubmissionType;
  content: string;
  file_url: string | null;
  audio_url: string | null;
  reviewed: boolean;
  grade: number | null;
  feedback: string | null;
  feedback_audio_url: string | null;
  status: SubmissionStatus;
  reviewed_at: string | null;
}

/* ================================================================== */
/* Helpers                                                            */
/* ================================================================== */
function toEnglishDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function todayJalali(): string {
  try {
    const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    return toEnglishDigits(`${y}/${m}/${d}`);
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
}

function convertJalaliDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

function jalaliToISO(jDate: string): string {
  // jDate: "1403/07/15" -> ISO
  const [y, m, d] = jDate.split("/").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return new Date().toISOString().slice(0, 10);
  // ساده: فرض می‌کنیم سال شمسی ≈ سال میلادی + 621 یا 622
  // برای دقت بیشتر نیاز به تبدیل دقیق است؛ این تقریب برای مهلت کافی است
  const gYear = y + 621;
  const gMonth = String(m).padStart(2, "0");
  const gDay = String(d).padStart(2, "0");
  return `${gYear}-${gMonth}-${gDay}`;
}

function isoToJalali(iso: string): string {
  // ساده: فرض سال میلادی → سال شمسی - 621
  if (!iso) return todayJalali();
  try {
    const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
    const jY = (y ?? new Date().getFullYear()) - 621;
    return `${jY}/${String(m ?? 1).padStart(2, "0")}/${String(d ?? 1).padStart(2, "0")}`;
  } catch {
    return todayJalali();
  }
}

function getTypeInfo(type: AssignmentType) {
  return ASSIGNMENT_TYPES.find((t) => t.value === type) ?? ASSIGNMENT_TYPES[0];
}

function getDeadline(a: Assignment): Date {
  const created = new Date(a.created_at);
  return new Date(created.getTime() + (a.deadline_hours ?? 24) * 3600 * 1000);
}

function getRemainingMs(a: Assignment): number {
  return getDeadline(a).getTime() - Date.now();
}

function isExpired(a: Assignment): boolean {
  return getRemainingMs(a) <= 0;
}

/** درصد باقی‌مانده از مهلت (۰ تا ۱۰۰) */
function getRemainingPercent(a: Assignment): number {
  const total = (a.deadline_hours ?? 24) * 3600 * 1000;
  const remain = Math.max(0, getRemainingMs(a));
  return Math.round((remain / total) * 100);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fileTypeIcon(type: string): ReactNode {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (type.startsWith("audio/")) return <FileAudio className="h-4 w-4" />;
  if (type.startsWith("video/")) return <FileVideo className="h-4 w-4" />;
  if (type.includes("pdf") || type.includes("word")) return <FileText className="h-4 w-4" />;
  return <FileIcon className="h-4 w-4" />;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "لحظاتی پیش";
  if (minutes < 60) return `${convertJalaliDigits(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${convertJalaliDigits(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${convertJalaliDigits(days)} روز پیش`;
  const months = Math.floor(days / 30);
  return `${convertJalaliDigits(months)} ماه پیش`;
}

/* ================================================================== */
/* ذخیره امن تکلیف با نمایش خطا                                      */
/* ================================================================== */
const OPTIONAL_ASSIGNMENT_COLUMNS = [
  "session_date",
  "audio_url",
  "attachments",
  "deadline_hours",
  "due_date",
  "due_time",
  "type",
  "is_required",
  "notes",
  "target_type",
  "target_students",
  "is_template",
] as const;

function missingAssignmentColumnFromError(error: any): string | null {
  const msg = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return OPTIONAL_ASSIGNMENT_COLUMNS.find((column) => msg.includes(column.toLowerCase())) ?? null;
}

async function insertAssignmentPayload(payload: Record<string, any>) {
  const current = { ...payload };
  const removedColumns: string[] = [];

  for (let i = 0; i <= OPTIONAL_ASSIGNMENT_COLUMNS.length; i++) {
    const { error } = await supabase.from("assignments").insert([current]);
    if (!error) return { error: null, removedColumns, payload: current };

    const missing = missingAssignmentColumnFromError(error);
    if (missing && missing in current) {
      delete current[missing];
      removedColumns.push(missing);
      continue;
    }

    return { error, removedColumns, payload: current };
  }

  return {
    error: { message: "خطا در تشخیص ستون‌های جدول assignments" },
    removedColumns,
    payload: current,
  };
}

async function updateAssignmentPayload(id: string, payload: Record<string, any>) {
  const current = { ...payload };
  const removedColumns: string[] = [];

  for (let i = 0; i <= OPTIONAL_ASSIGNMENT_COLUMNS.length; i++) {
    const { error } = await supabase.from("assignments").update(current).eq("id", id);
    if (!error) return { error: null, removedColumns, payload: current };

    const missing = missingAssignmentColumnFromError(error);
    if (missing && missing in current) {
      delete current[missing];
      removedColumns.push(missing);
      continue;
    }

    return { error, removedColumns, payload: current };
  }

  return {
    error: { message: "خطا در تشخیص ستون‌های جدول assignments" },
    removedColumns,
    payload: current,
  };
}

/* ================================================================== */
/* کامپوننت اصلی                                                     */
/* ================================================================== */
function AssignmentsPage() {
  const [teacher, setTeacher] = useState<CurrentTeacher | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});

  // فیلترها
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // دیالوگ‌ها
  const [formOpen, setFormOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [duplicatingAssignment, setDuplicatingAssignment] = useState<Assignment | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [viewingAssignment, setViewingAssignment] = useState<Assignment | null>(null);

  const [templatesOpen, setTemplatesOpen] = useState(false);

  /* ---------- بارگذاری اولیه ---------- */
  useEffect(() => {
    (async () => {
      const t = await getCurrentTeacher();
      setTeacher(t);
      if (t) await loadAll(t);
      setLoading(false);
    })();
  }, []);

  async function loadAll(t: CurrentTeacher) {
    // کلاس‌ها
    const { data: cls } = await supabase
      .from("classes")
      .select("id, name, level")
      .eq("teacher_id", t.id)
      .order("name");
    const classList = (cls ?? []) as ClassRow[];
    setClasses(classList);

    // تکالیف
    const { data: a } = await supabase
      .from("assignments")
      .select("*")
      .eq("teacher_id", t.id)
      .order("created_at", { ascending: false });
    setAssignments(((a ?? []) as any[]).map(normalizeAssignment));

    // ارسال‌ها
    const assignmentIds = ((a ?? []) as any[]).map((x) => x.id);
    if (assignmentIds.length > 0) {
      const { data: subs } = await supabase
        .from("submissions")
        .select("*")
        .in("assignment_id", assignmentIds);
      setSubmissions(((subs ?? []) as any[]).map(normalizeSubmission));
    } else {
      setSubmissions([]);
    }

    // قرآن‌آموزان
    const classIds = classList.map((c) => c.id);
    if (classIds.length > 0) {
      const { data: stu } = await supabase
        .from("students")
        .select("id, name, class_id")
        .in("class_id", classIds);
      const list = (stu ?? []) as StudentRow[];
      setStudents(list);
      setStudentNames(Object.fromEntries(list.map((s) => [s.id, s.name as string])));
    }
  }

  function normalizeAssignment(raw: any): Assignment {
    // تاریخ جلسه: اولویت با session_date، سپس session_number، سپس امروز
    const sessionDate = raw.session_date
      ? String(raw.session_date)
      : raw.session_number
        ? `جلسه ${raw.session_number}`
        : todayJalali();

    return {
      id: String(raw.id),
      teacher_id: String(raw.teacher_id ?? ""),
      class_id: String(raw.class_id ?? ""),
      session_date: sessionDate,
      session_number: raw.session_number != null ? Number(raw.session_number) : undefined,
      title: String(raw.title ?? ""),
      description: String(raw.description ?? ""),
      audio_url: raw.audio_url ?? null,
      attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
      deadline_hours: Number(raw.deadline_hours ?? 24),
      due_date: raw.due_date ?? undefined,
      due_time: raw.due_time ?? null,
      type: (raw.type ?? "hifz") as AssignmentType,
      is_required: Boolean(raw.is_required ?? true),
      notes: String(raw.notes ?? ""),
      target_type: (raw.target_type ?? "all") as TargetType,
      target_students: Array.isArray(raw.target_students) ? raw.target_students : [],
      is_template: Boolean(raw.is_template ?? false),
      created_at: String(raw.created_at ?? new Date().toISOString()),
    };
  }

  function normalizeSubmission(raw: any): Submission {
    return {
      id: String(raw.id),
      assignment_id: String(raw.assignment_id),
      student_id: String(raw.student_id),
      submitted_at: String(raw.submitted_at ?? raw.created_at ?? new Date().toISOString()),
      type: (raw.type ?? "text") as SubmissionType,
      content: String(raw.content ?? ""),
      file_url: raw.file_url ?? null,
      audio_url: raw.audio_url ?? null,
      reviewed: Boolean(raw.reviewed ?? false),
      grade: raw.grade != null ? Number(raw.grade) : null,
      feedback: raw.feedback ?? null,
      feedback_audio_url: raw.feedback_audio_url ?? null,
      status: (raw.status ?? "pending") as SubmissionStatus,
      reviewed_at: raw.reviewed_at ?? null,
    };
  }

  function getAssignmentClassName(assignment: Assignment): string {
    const found = classes.find((c) => String(c.id) === String(assignment.class_id));
    if (found?.name?.trim()) return found.name;

    // پشتیبان برای رکوردهای قدیمی یا مواردی که نام کلاس در خود تکلیف ذخیره شده باشد
    const raw = assignment as any;
    if (typeof raw.class_name === "string" && raw.class_name.trim()) return raw.class_name.trim();
    if (typeof raw.className === "string" && raw.className.trim()) return raw.className.trim();

    return assignment.class_id ? `کلاس ${assignment.class_id}` : "کلاس نامشخص";
  }

  /* ---------- فیلتر و مرتب‌سازی ---------- */
  const filteredAssignments = useMemo(() => {
    return assignments
      .filter((a) => {
        if (filterClass !== "all" && a.class_id !== filterClass) return false;
        if (filterType !== "all" && a.type !== filterType) return false;
        if (filterStatus !== "all") {
          const status = getAssignmentStatus(a);
          if (status !== filterStatus) return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.trim();
          if (
            !a.title.includes(q) &&
            !a.description.includes(q) &&
            !(classes.find((c) => c.id === a.class_id)?.name ?? "").includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [assignments, filterClass, filterType, filterStatus, searchQuery, classes]);

  /* ---------- محاسبه آمار کلی ---------- */
  const stats = useMemo(() => {
    let active = 0,
      expired = 0,
      completed = 0;
    for (const a of assignments) {
      const status = getAssignmentStatus(a);
      if (status === "active") active++;
      else if (status === "expired") expired++;
      else completed++;
    }
    return { active, expired, completed, total: assignments.length };
  }, [assignments]);

  function getAssignmentStatus(a: Assignment): "active" | "expired" | "completed" {
    const subs = submissions.filter((s) => s.assignment_id === a.id);
    const targetStudents =
      a.target_type === "all"
        ? students.filter((s) => s.class_id === a.class_id).map((s) => s.id)
        : a.target_students;
    const totalExpected = targetStudents.length;
    const approved = subs.filter((s) => s.status === "approved").length;
    if (subs.length >= totalExpected && approved >= totalExpected) return "completed";
    if (isExpired(a)) return "expired";
    return "active";
  }

  /* ---------- عملیات ---------- */
  async function handleSaveAssignment(data: Partial<Assignment>) {
    if (!teacher) return;

    const hours = data.deadline_hours ?? 24;

    // محاسبه تاریخ و ساعت مهلت بر اساس deadline_hours
    const now = new Date();
    const deadline = new Date(now.getTime() + hours * 3600 * 1000);
    const deadlineDateISO = deadline.toISOString().slice(0, 10);
    const deadlineTime = `${String(deadline.getHours()).padStart(2, "0")}:${String(deadline.getMinutes()).padStart(2, "0")}`;

    const payload: Record<string, any> = {
      teacher_id: teacher.id,
      class_id: data.class_id,
      session_date: data.session_date ?? todayJalali(),
      title: data.title,
      description: data.description ?? "",
      audio_url: data.audio_url ?? null,
      attachments: data.attachments ?? [],
      deadline_hours: hours,
      due_date: deadlineDateISO,
      due_time: deadlineTime,
      type: data.type ?? "hifz",
      is_required: data.is_required ?? true,
      notes: data.notes ?? "",
      target_type: data.target_type ?? "all",
      target_students: data.target_students ?? [],
      is_template: data.is_template ?? false,
    };

    const result = editingAssignment
      ? await updateAssignmentPayload(editingAssignment.id, payload)
      : await insertAssignmentPayload(payload);

    if (result.error) {
      console.error("Assignment save error:", result.error);
      toast.error("خطا در ثبت تکلیف: " + (result.error.message ?? "خطای نامشخص"));
      return;
    }

    if (result.removedColumns.length > 0) {
      toast.warning(
        "تکلیف ثبت شد، اما برخی ستون‌های اختیاری در دیتابیس وجود ندارند: " +
          result.removedColumns.join(", "),
      );
    } else {
      toast.success(
        editingAssignment ? "تکلیف با موفقیت ویرایش شد" : "تکلیف با موفقیت ثبت و ارسال شد",
      );
    }

    await loadAll(teacher);
    setFormOpen(false);
    setEditingAssignment(null);
    setDuplicatingAssignment(null);
  }

  async function handleDeleteAssignment(id: string) {
    if (!confirm("آیا از حذف این تکلیف مطمئن هستید؟ فایل‌های مرتبط ۷ روز نگهداری می‌شوند.")) return;
    if (!teacher) return;
    try {
      const result = await deleteAssignmentSecurely(id);
      toast.success(
        `تکلیف حذف شد؛ ${result.submissions.toLocaleString("fa-IR")} ارسال مرتبط برای پاک‌سازی زمان‌بندی شد`,
      );
      await loadAll(teacher);
    } catch (error) {
      toast.error("خطا در حذف امن تکلیف: " + (error instanceof Error ? error.message : error));
    }
  }

  async function handleDuplicateAssignment(a: Assignment) {
    setDuplicatingAssignment(a);
    setEditingAssignment(null);
    setFormOpen(true);
  }

  function openCreateForm() {
    setEditingAssignment(null);
    setDuplicatingAssignment(null);
    setFormOpen(true);
  }

  function openEditForm(a: Assignment) {
    setEditingAssignment(a);
    setDuplicatingAssignment(null);
    setFormOpen(true);
  }

  function openDetail(a: Assignment) {
    setViewingAssignment(a);
    setDetailOpen(true);
  }

  async function handleUseTemplate(a: Assignment) {
    setDuplicatingAssignment({ ...a, id: "", title: a.title + " (کپی)" });
    setEditingAssignment(null);
    setFormOpen(true);
    setTemplatesOpen(false);
  }

  /* ---------- رندر ---------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری...</span>
      </div>
    );
  }

  const templates = assignments.filter((a) => a.is_template);

  return (
    <>
      <style>{assignmentsPolishStyle}</style>
      <PageHeader
        title="تکالیف"
        description={`تعریف، مدیریت و بررسی تکالیف قرآن‌آموزان کلاس‌های ${teacher?.name ?? "شما"}.`}
      />

      <Card className="assignments-hero relative mb-6 overflow-hidden border-0 p-5 md:p-6 text-white shadow-xl">
        <div className="assignments-pattern absolute inset-0 opacity-30" />
        <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-gold/25 blur-3xl" />
        <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-emerald-300/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-gold ring-1 ring-white/20 backdrop-blur-sm">
              <ClipboardList className="h-7 w-7" />
            </div>
            <div>
              <Badge className="mb-2 border-gold/30 bg-white/10 text-amber-100 hover:bg-white/15">
                مدیریت تکالیف استاد
              </Badge>
              <h2 className="font-display text-2xl font-black md:text-3xl">
                دفتر تکالیف قرآن‌آموزان
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50/75">
                ایجاد، پیگیری و بررسی تکالیف کلاس‌ها در یک نمای حرفه‌ای، آرام و منظم.
              </p>
            </div>
          </div>
          <Button
            onClick={openCreateForm}
            className="gap-2 bg-gold text-gold-foreground hover:bg-gold/90"
          >
            <Plus className="h-4 w-4" />
            تکلیف جدید
          </Button>
        </div>
      </Card>

      {/* نوار اقدامات */}
      <div className="assignments-actions mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={openCreateForm} className="gap-2">
          <Plus className="h-4 w-4" />
          تکلیف جدید
        </Button>
        <Button variant="outline" onClick={() => setTemplatesOpen(true)} className="gap-2">
          <LayoutTemplate className="h-4 w-4" />
          قالب‌ها {templates.length > 0 && `(${convertJalaliDigits(templates.length)})`}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => teacher && loadAll(teacher)}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          بروزرسانی
        </Button>
      </div>

      {/* آمار */}
      <div className="assignments-stats grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="کل تکالیف"
          value={stats.total}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="primary"
        />
        <CustomStatCard
          label="فعال"
          value={stats.active}
          icon={<Clock className="h-5 w-5" />}
          colorClass="text-blue-700 bg-blue-50 border-blue-100"
        />
        <CustomStatCard
          label="منقضی‌شده"
          value={stats.expired}
          icon={<AlertTriangle className="h-5 w-5" />}
          colorClass="text-amber-700 bg-amber-50 border-amber-100"
        />
        <CustomStatCard
          label="تکمیل‌شده"
          value={stats.completed}
          icon={<CheckCircle2 className="h-5 w-5" />}
          colorClass="text-emerald-700 bg-emerald-50 border-emerald-100"
        />
      </div>

      {/* فیلترها */}
      <Card className="assignments-filter-card p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">فیلتر و جستجو</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="جستجو در عنوان یا توضیحات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9"
            />
          </div>
          <Select value={filterClass} onValueChange={setFilterClass}>
            <SelectTrigger>
              <SelectValue placeholder="کلاس" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه کلاس‌ها</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger>
              <SelectValue placeholder="نوع تکلیف" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه انواع</SelectItem>
              {ASSIGNMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
              <SelectValue placeholder="وضعیت" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه وضعیت‌ها</SelectItem>
              <SelectItem value="active">فعال</SelectItem>
              <SelectItem value="expired">منقضی‌شده</SelectItem>
              <SelectItem value="completed">تکمیل‌شده</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* لیست تکالیف */}
      {filteredAssignments.length === 0 ? (
        <Card className="assignments-empty-card p-12 text-center">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-display text-lg mb-1">
            {assignments.length === 0
              ? "هنوز تکلیفی تعریف نشده است"
              : "تکلیفی با این فیلتر یافت نشد"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            برای شروع، اولین تکلیف خود را تعریف کنید
          </p>
          <Button onClick={openCreateForm} className="gap-2">
            <Plus className="h-4 w-4" />
            تکلیف جدید
          </Button>
        </Card>
      ) : (
        <div className="assignments-list space-y-3">
          {filteredAssignments.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              className={getAssignmentClassName(a)}
              submissions={submissions.filter((s) => s.assignment_id === a.id)}
              targetCount={
                a.target_type === "all"
                  ? students.filter((s) => s.class_id === a.class_id).length
                  : a.target_students.length
              }
              status={getAssignmentStatus(a)}
              onView={() => openDetail(a)}
              onEdit={() => openEditForm(a)}
              onDuplicate={() => handleDuplicateAssignment(a)}
              onDelete={() => handleDeleteAssignment(a.id)}
            />
          ))}
        </div>
      )}

      {/* دیالوگ فرم (ایجاد/ویرایش/کپی) */}
      {formOpen && (
        <AssignmentFormDialog
          open={formOpen}
          onOpenChange={(o) => {
            setFormOpen(o);
            if (!o) {
              setEditingAssignment(null);
              setDuplicatingAssignment(null);
            }
          }}
          classes={classes}
          students={students}
          initial={editingAssignment ?? duplicatingAssignment ?? undefined}
          onSubmit={handleSaveAssignment}
          teacherId={teacher?.id ?? "unknown"}
        />
      )}

      {/* دیالوگ جزئیات و بررسی */}
      {detailOpen && viewingAssignment && (
        <AssignmentDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          assignment={viewingAssignment}
          className={getAssignmentClassName(viewingAssignment)}
          submissions={submissions.filter((s) => s.assignment_id === viewingAssignment.id)}
          targetStudents={
            viewingAssignment.target_type === "all"
              ? students
                  .filter((s) => s.class_id === viewingAssignment.class_id)
                  .map((s) => ({ id: s.id, name: s.name }))
              : viewingAssignment.target_students.map((id) => ({
                  id,
                  name: studentNames[id] ?? id,
                }))
          }
          studentNames={studentNames}
          onReviewed={() => teacher && loadAll(teacher)}
        />
      )}

      {/* دیالوگ قالب‌ها */}
      <TemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
        classNames={Object.fromEntries(classes.map((c) => [c.id, c.name]))}
        onUseTemplate={handleUseTemplate}
        onDeleteTemplate={handleDeleteAssignment}
      />
    </>
  );
}

/* ================================================================== */
/* کارت تکلیف                                                        */
/* ================================================================== */
function AssignmentCard({
  assignment,
  className,
  submissions,
  targetCount,
  status,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  assignment: Assignment;
  className: string;
  submissions: Submission[];
  targetCount: number;
  status: "active" | "expired" | "completed";
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const typeInfo = getTypeInfo(assignment.type);
  const submittedCount = submissions.length;
  const reviewedCount = submissions.filter((s) => s.reviewed).length;
  const pendingReview = submittedCount - reviewedCount;
  const expired = isExpired(assignment);

  const statusConfig = {
    active: { label: "فعال", color: "bg-blue-100 text-blue-700 border-blue-200" },
    expired: { label: "منقضی‌شده", color: "bg-amber-100 text-amber-700 border-amber-200" },
    completed: { label: "تکمیل‌شده", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  }[status];

  return (
    <Card className="assignment-card p-4 transition">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge className={`${typeInfo.color} border gap-1`}>
              {typeInfo.icon}
              {typeInfo.label}
            </Badge>
            <Badge variant="outline" className="gap-1 border-primary/25 bg-primary/5 text-primary">
              <Users className="h-3 w-3" />
              {className || "کلاس نامشخص"}
            </Badge>
            <Badge className={`${statusConfig.color} border`}>{statusConfig.label}</Badge>
            {assignment.is_required ? (
              <Badge variant="outline" className="gap-1 text-rose-700 border-rose-200">
                اجباری
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                اختیاری
              </Badge>
            )}
            {assignment.is_template && (
              <Badge variant="outline" className="gap-1 text-purple-700 border-purple-200">
                <LayoutTemplate className="h-3 w-3" />
                قالب
              </Badge>
            )}
          </div>
          <h3 className="font-display text-lg leading-tight mb-1">{assignment.title}</h3>
          {assignment.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{assignment.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={onView} title="مشاهده و بررسی">
            <Eye className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onEdit} title="ویرایش">
            <Edit className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDuplicate} title="کپی">
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            title="حذف"
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* اطلاعات */}
      <div className="assignment-meta-grid grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span className="truncate">{className}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span className="truncate">جلسه: {convertJalaliDigits(assignment.session_date)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          <span>ایجاد: {relativeTime(assignment.created_at)}</span>
        </div>
      </div>

      {/* شمارش معکوس مهلت */}
      <CountdownBadge assignment={assignment} />

      {/* آمار ارسال‌ها */}
      <div className="mt-3 pt-3 border-t flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            ارسال‌ها:{" "}
            <span className="text-foreground font-bold">{convertJalaliDigits(submittedCount)}</span>{" "}
            / <span className="text-muted-foreground">{convertJalaliDigits(targetCount)}</span>
          </span>
          <span className="flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            بررسی‌شده: {convertJalaliDigits(reviewedCount)}
          </span>
          {pendingReview > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <AlertCircle className="h-3 w-3" />
              بررسی‌نشده: {convertJalaliDigits(pendingReview)}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onView} className="gap-1">
          <Eye className="h-3.5 w-3.5" />
          مشاهده ارسال‌ها
        </Button>
      </div>
    </Card>
  );
}

/* ================================================================== */
/* دیالوگ فرم تکلیف                                                  */
/* ================================================================== */
function AssignmentFormDialog({
  open,
  onOpenChange,
  classes,
  students,
  initial,
  onSubmit,
  teacherId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  classes: ClassRow[];
  students: StudentRow[];
  initial?: Assignment;
  onSubmit: (data: Partial<Assignment>) => Promise<void>;
  teacherId: string;
}) {
  const [form, setForm] = useState<Partial<Assignment>>(() =>
    initial
      ? { ...initial, id: undefined as any }
      : {
          class_id: classes[0]?.id ?? "",
          session_date: todayJalali(),
          title: "",
          description: "",
          deadline_hours: 24,
          type: "hifz",
          is_required: true,
          notes: "",
          target_type: "all",
          target_students: [],
          is_template: false,
          attachments: [],
          audio_url: null,
        },
  );

  const [audioClip, setAudioClip] = useState<AudioClip | null>(
    initial?.audio_url ? { url: initial.audio_url, duration: 0 } : null,
  );

  const [saving, setSaving] = useState(false);

  // وقتی initial تغییر کرد، فرم ریست شود
  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? { ...initial }
          : {
              class_id: classes[0]?.id ?? "",
              session_date: todayJalali(),
              title: "",
              description: "",
              deadline_hours: 24,
              type: "hifz",
              is_required: true,
              notes: "",
              target_type: "all",
              target_students: [],
              is_template: false,
              attachments: [],
              audio_url: null,
            },
      );
      setAudioClip(initial?.audio_url ? { url: initial.audio_url, duration: 0 } : null);
    }
  }, [open, initial, classes]);

  async function submit() {
    if (!form.title?.trim()) {
      toast.error("عنوان تکلیف الزامی است.");
      return;
    }
    if (!form.class_id) {
      toast.error("انتخاب کلاس الزامی است.");
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Assignment> = {
        ...form,
        audio_url: audioClip?.url ?? null,
        target_students: form.target_type === "specific" ? (form.target_students ?? []) : [],
      };
      await onSubmit(payload);
    } finally {
      setSaving(false);
    }
  }

  const classStudents = students.filter((s) => s.class_id === form.class_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="assignment-dialog max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {initial?.id ? "ویرایش تکلیف" : "تعریف تکلیف جدید"}
          </DialogTitle>
          <DialogDescription>
            اطلاعات تکلیف را وارد کنید. فیلدهای ستاره‌دار الزامی هستند.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 space-y-5">
          {/* بخش ۱: اطلاعات پایه */}
          <FormSection title="اطلاعات پایه" icon={<ClipboardList className="h-4 w-4" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label="کلاس *">
                <Select
                  value={form.class_id ?? ""}
                  onValueChange={(v) => setForm({ ...form, class_id: v, target_students: [] })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کلاس" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="تاریخ جلسه (شمسی) *">
                <div className="flex gap-2">
                  <Input
                    value={form.session_date ?? ""}
                    onChange={(e) => setForm({ ...form, session_date: e.target.value })}
                    placeholder={todayJalali()}
                    dir="ltr"
                    className="text-right"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm({ ...form, session_date: todayJalali() })}
                    className="shrink-0 gap-1"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    امروز
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">فرمت: ۱۴۰۳/۰۷/۲۵ (سال/ماه/روز)</p>
              </FormField>

              <FormField label="عنوان تکلیف *">
                <Input
                  value={form.title ?? ""}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="مثلاً تقلید فراز چهار سوره اسرا"
                />
              </FormField>

              <FormField label="نوع تکلیف *">
                <Select
                  value={form.type ?? "hifz"}
                  onValueChange={(v) => setForm({ ...form, type: v as AssignmentType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </FormSection>

          {/* بخش ۲: شرح تکلیف */}
          <FormSection title="شرح و محتوای تکلیف" icon={<FileText className="h-4 w-4" />}>
            <FormField label="شرح کامل تکلیف">
              <textarea
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="توضیحات کامل تکلیف را اینجا بنویسید..."
                rows={5}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </FormField>

            <FormField label="ضبط صوتی توضیح تکلیف">
              <AudioRecorder
                value={audioClip}
                onChange={setAudioClip}
                folder={`attachments/${teacherId}`}
              />
            </FormField>

            <FormField label="فایل‌های ضمیمه (PDF، Word، تصویر، و...)">
              <FileUploader
                files={form.attachments ?? []}
                onChange={(files) => setForm({ ...form, attachments: files })}
                folder={`attachments/${teacherId}`}
              />
            </FormField>
          </FormSection>

          {/* بخش ۳: مهلت و تنظیمات */}
          <FormSection title="مهلت و تنظیمات" icon={<Timer className="h-4 w-4" />}>
            <FormField label="مهلت ارسال (شمارش معکوس از زمان ثبت)">
              <Select
                value={String(form.deadline_hours ?? 24)}
                onValueChange={(v) => setForm({ ...form, deadline_hours: parseInt(v, 10) })}
              >
                <SelectTrigger className="bg-amber-50 border-amber-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                <Timer className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">شمارش معکوس از لحظه ثبت تکلیف شروع می‌شود.</p>
                  <p>
                    یعنی اگر الان ثبت کنید و ۲۴ ساعت انتخاب کنید، قرآن‌آموزان تا{" "}
                    {(() => {
                      const d = new Date(Date.now() + (form.deadline_hours ?? 24) * 3600 * 1000);
                      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
                    })()}{" "}
                    فردا فرصت دارند.
                  </p>
                </div>
              </div>
            </FormField>

            <FormField label="نوع ارسال">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.target_type === "all"}
                    onChange={() =>
                      setForm({
                        ...form,
                        target_type: "all",
                        target_students: [],
                      })
                    }
                    className="accent-primary"
                  />
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>همه قرآن‌آموزان کلاس</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.target_type === "specific"}
                    onChange={() =>
                      setForm({
                        ...form,
                        target_type: "specific",
                        target_students: form.target_students ?? [],
                      })
                    }
                    className="accent-primary"
                  />
                  <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  <span>تعداد مشخصی از قرآن‌آموزان</span>
                </label>
              </div>
            </FormField>

            {form.target_type === "specific" && (
              <FormField label="انتخاب قرآن‌آموزان">
                <StudentMultiPicker
                  students={classStudents.map((s) => ({
                    id: s.id,
                    name: s.name,
                  }))}
                  selected={form.target_students ?? []}
                  onChange={(ids) => setForm({ ...form, target_students: ids })}
                />
              </FormField>
            )}

            <FormField label="الزامی / اختیاری">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_required ?? true}
                  onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
                  className="accent-primary h-4 w-4"
                />
                <span>این تکلیف اجباری است (قرآن‌آموزان ملزم به انجام آن هستند)</span>
              </label>
            </FormField>
          </FormSection>

          {/* بخش ۴: نکات و قالب */}
          <FormSection title="نکات و قالب" icon={<MessageSquare className="h-4 w-4" />}>
            <FormField label="نکات و توضیحات ویژه برای قرآن‌آموزان">
              <textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="نکات مهم، راهنمایی‌ها یا توضیحات اضافی..."
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </FormField>

            <FormField label="ذخیره به عنوان قالب">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_template ?? false}
                  onChange={(e) => setForm({ ...form, is_template: e.target.checked })}
                  className="accent-primary h-4 w-4"
                />
                <LayoutTemplate className="h-4 w-4 text-purple-700" />
                <span>این تکلیف را به عنوان قالب ذخیره کن (برای استفاده مجدد در آینده)</span>
              </label>
            </FormField>
          </FormSection>
        </div>

        {/* فوتر */}
        <div className="border-t pt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {initial?.id ? "ذخیره تغییرات" : "ثبت تکلیف"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/* کامپوننت ضبط صوتی                                                */
/* ================================================================== */
function AudioRecorder({
  value,
  onChange,
  folder,
}: {
  value: AudioClip | null;
  onChange: (clip: AudioClip | null) => void;
  folder: string;
}) {
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("مرورگر شما از ضبط صوتی پشتیبانی نمی‌کند.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const duration = recordingTime;
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecordingTime(0);
        setUploading(true);
        try {
          const uploaded = await uploadAssignmentAudio(blob, folder);
          if (!uploaded) {
            toast.error("خطا در بارگذاری فایل صوتی. لطفاً دوباره تلاش کنید.");
            return;
          }
          onChange({ url: uploaded.url, duration });
        } finally {
          setUploading(false);
        }
      };
      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.error("Recording error:", err);
      toast.error("خطا در دسترسی به میکروفون. لطفاً اجازه دهید.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  function deleteAudio() {
    onChange(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }

  function togglePlay() {
    if (!audioRef.current || !value) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  }

  if (uploading) {
    return (
      <div className="flex items-center gap-3 p-3 bg-muted/30 border border-dashed rounded-lg">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال بارگذاری فایل صوتی...</span>
      </div>
    );
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <SecureAssignmentAudio
          ref={audioRef}
          reference={value.url}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={togglePlay}
          className="shrink-0"
        >
          {playing ? <PauseCircle className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
        </Button>
        <div className="flex-1 flex items-center gap-2">
          <FileAudio className="h-4 w-4 text-primary" />
          <span className="text-sm">فایل صوتی ضمیمه شد</span>
          {value.duration > 0 && (
            <Badge variant="outline" className="text-xs">
              {formatDuration(value.duration)}
            </Badge>
          )}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={deleteAudio}
          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          title="حذف"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/30 border border-dashed rounded-lg">
      {recording ? (
        <>
          <div className="flex items-center gap-2 flex-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <span className="text-sm font-medium text-rose-700">در حال ضبط...</span>
            <Badge variant="outline" className="text-xs">
              {formatDuration(recordingTime)}
            </Badge>
          </div>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={stopRecording}
            className="gap-1"
          >
            <Square className="h-3.5 w-3.5" />
            توقف
          </Button>
        </>
      ) : (
        <>
          <Mic className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground flex-1">
            برای ضبط توضیح صوتی، میکروفون را فعال کنید
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={startRecording}
            className="gap-1"
          >
            <Mic className="h-3.5 w-3.5" />
            شروع ضبط
          </Button>
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* کامپوننت بارگذاری فایل                                           */
/* ================================================================== */
function FileUploader({
  files,
  onChange,
  folder,
}: {
  files: Attachment[];
  onChange: (files: Attachment[]) => void;
  folder: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const selected = Array.from(fileList);
    setUploadingCount((c) => c + selected.length);
    try {
      const uploadedFiles: Attachment[] = [];
      for (const f of selected) {
        const uploaded = await uploadAssignmentFile(f, folder);
        if (!uploaded) {
          toast.error(`خطا در بارگذاری فایل «${f.name}». لطفاً دوباره تلاش کنید.`);
          continue;
        }
        uploadedFiles.push({
          id: Math.random().toString(36).slice(2),
          name: f.name,
          url: uploaded.url,
          type: f.type,
          size: f.size,
        });
      }
      onChange([...files, ...uploadedFiles]);
    } finally {
      setUploadingCount((c) => Math.max(0, c - selected.length));
    }
  }

  function removeFile(id: string) {
    onChange(files.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-2">
      <div
        className={
          "border-2 border-dashed rounded-lg p-4 text-center transition cursor-pointer " +
          (dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30")
        }
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
        <p className="text-sm text-muted-foreground">
          فایل‌ها را اینجا بکشید یا <span className="text-primary font-medium">کلیک کنید</span> برای
          انتخاب
        </p>
        <p className="text-xs text-muted-foreground mt-1">PDF، Word، تصویر، صوت - حداکثر ۱۰ فایل</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        />
      </div>

      {uploadingCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بارگذاری {uploadingCount} فایل...
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border">
              {fileTypeIcon(f.type)}
              <span className="text-sm flex-1 truncate">{f.name}</span>
              <Badge variant="outline" className="text-xs">
                {formatBytes(f.size)}
              </Badge>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeFile(f.id)}
                className="h-7 w-7 text-rose-600 hover:bg-rose-50"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* انتخاب چندتایی قرآن‌آموز                                          */
/* ================================================================== */
function StudentMultiPicker({
  students,
  selected,
  onChange,
}: {
  students: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = students.filter((s) => s.name.includes(search));

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  function selectAll() {
    onChange(students.map((s) => s.id));
  }

  function deselectAll() {
    onChange([]);
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-2 border-b bg-muted/30 flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="جستجو..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs"
        />
        <Button type="button" size="sm" variant="ghost" onClick={selectAll} className="text-xs">
          همه
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={deselectAll} className="text-xs">
          هیچ‌کدام
        </Button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">دانش‌آموزی یافت نشد</div>
        ) : (
          filtered.map((s) => {
            const checked = selected.includes(s.id);
            return (
              <label
                key={s.id}
                className={
                  "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 " +
                  (checked ? "bg-primary/5" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.id)}
                  className="accent-primary"
                />
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">{s.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-sm flex-1 truncate">{s.name}</span>
                {checked && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </label>
            );
          })
        )}
      </div>
      <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground">
        {convertJalaliDigits(selected.length)} نفر انتخاب شده از{" "}
        {convertJalaliDigits(students.length)} نفر
      </div>
    </div>
  );
}

/* ================================================================== */
/* دیالوگ جزئیات تکلیف و بررسی ارسال‌ها                              */
/* ================================================================== */
function AssignmentDetailDialog({
  open,
  onOpenChange,
  assignment,
  className,
  submissions,
  targetStudents,
  studentNames,
  onReviewed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assignment: Assignment;
  className: string;
  submissions: Submission[];
  targetStudents: { id: string; name: string }[];
  studentNames: Record<string, string>;
  onReviewed: () => void;
}) {
  const typeInfo = getTypeInfo(assignment.type);
  const submittedIds = new Set(submissions.map((s) => s.student_id));
  const pendingStudents = targetStudents.filter((s) => !submittedIds.has(s.id));
  const [activeTab, setActiveTab] = useState<"overview" | "submissions">("overview");
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="assignment-dialog max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ClipboardList className="h-5 w-5 text-primary" />
            <span>{assignment.title}</span>
            <Badge className={`${typeInfo.color} border`}>{typeInfo.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            {className || "کلاس نامشخص"} • تاریخ جلسه:{" "}
            {convertJalaliDigits(assignment.session_date)}
          </DialogDescription>
        </DialogHeader>

        {/* شمارش معکوس مهلت */}
        <div className="px-1">
          <CountdownBadge assignment={assignment} />
        </div>

        {/* تب‌ها */}
        <div className="flex items-center gap-1 border-b">
          <button
            onClick={() => setActiveTab("overview")}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 transition " +
              (activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            نمای کلی
          </button>
          <button
            onClick={() => setActiveTab("submissions")}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 transition " +
              (activeTab === "submissions"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            ارسال‌ها ({convertJalaliDigits(submissions.length)} از{" "}
            {convertJalaliDigits(targetStudents.length)})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-1">
          {activeTab === "overview" ? (
            <OverviewTab
              assignment={assignment}
              className={className}
              submissions={submissions}
              pendingStudents={pendingStudents}
              studentNames={studentNames}
            />
          ) : (
            <SubmissionsTab
              assignment={assignment}
              submissions={submissions}
              targetStudents={targetStudents}
              expandedSubmission={expandedSubmission}
              setExpandedSubmission={setExpandedSubmission}
              onReviewed={onReviewed}
              studentNames={studentNames}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/* تب نمای کلی                                                       */
/* ================================================================== */
function OverviewTab({
  assignment,
  className,
  submissions,
  pendingStudents,
  studentNames,
}: {
  assignment: Assignment;
  className: string;
  submissions: Submission[];
  pendingStudents: { id: string; name: string }[];
  studentNames: Record<string, string>;
}) {
  const [detailStatus, setDetailStatus] = useState<
    "all" | "approved" | "needs_revision" | "rejected" | null
  >(null);
  const reviewed = submissions.filter((s) => s.reviewed).length;
  const approved = submissions.filter((s) => s.status === "approved").length;
  const needsRevision = submissions.filter((s) => s.status === "needs_revision").length;
  const rejected = submissions.filter((s) => s.status === "rejected").length;
  const detailSubmissions = detailStatus
    ? detailStatus === "all"
      ? submissions
      : submissions.filter((s) => s.status === detailStatus)
    : [];

  return (
    <div className="space-y-4 py-2">
      {/* آمار */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox
          label="ارسال‌شده"
          value={submissions.length}
          icon={<Send />}
          color="blue"
          onClick={() => setDetailStatus("all")}
        />
        <StatBox
          label="تأییدشده"
          value={approved}
          icon={<CheckCircle2 />}
          color="emerald"
          onClick={() => setDetailStatus("approved")}
        />
        <StatBox
          label="نیاز به اصلاح"
          value={needsRevision}
          icon={<AlertCircle />}
          color="blue"
          onClick={() => setDetailStatus("needs_revision")}
        />
        <StatBox
          label="رد شده"
          value={rejected}
          icon={<XCircle />}
          color="rose"
          onClick={() => setDetailStatus("rejected")}
        />
      </div>

      {detailStatus && (
        <Card className="p-4 border-primary/15 bg-primary/5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h4 className="font-display font-bold text-primary">
                {detailStatus === "all" ? "همه ارسال‌ها" : SUBMISSION_STATUS[detailStatus]?.label}
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                جزئیات پاسخ‌ها، نمره و بازخورد استاد برای این تکلیف
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setDetailStatus(null)}>
              بستن
            </Button>
          </div>
          {detailSubmissions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              موردی برای نمایش وجود ندارد.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {detailSubmissions.map((submission) => {
                const info = SUBMISSION_STATUS[submission.status] ?? SUBMISSION_STATUS.pending;
                return (
                  <div key={submission.id} className="rounded-xl border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="font-bold text-foreground truncate">
                        {studentNames[submission.student_id] ?? submission.student_id}
                      </div>
                      <Badge className={`${info.color} border text-xs gap-1`}>
                        {info.icon}
                        {info.label}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>
                        زمان ارسال: {new Date(submission.submitted_at).toLocaleDateString("fa-IR")}
                      </div>
                      <div>
                        نوع پاسخ:{" "}
                        {submission.type === "audio"
                          ? "صوتی"
                          : submission.type === "file"
                            ? "فایل"
                            : "متنی"}
                      </div>
                      {submission.grade != null && (
                        <div className="text-emerald-700 font-medium">
                          نمره: {convertJalaliDigits(submission.grade)} / ۲۰
                        </div>
                      )}
                      {submission.content && (
                        <div className="line-clamp-2">پاسخ: {submission.content}</div>
                      )}
                      {submission.feedback && (
                        <div className="text-blue-700 line-clamp-2">
                          بازخورد: {submission.feedback}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* شرح */}
      {assignment.description && (
        <Card className="p-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            شرح تکلیف
          </h4>
          <p className="text-sm whitespace-pre-wrap text-foreground/90">{assignment.description}</p>
        </Card>
      )}

      {/* فایل صوتی توضیح */}
      {assignment.audio_url && (
        <Card className="p-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <FileAudio className="h-4 w-4 text-primary" />
            فایل صوتی توضیح تکلیف
          </h4>
          <SecureAssignmentAudio reference={assignment.audio_url} controls className="w-full" />
        </Card>
      )}

      {/* فایل‌های ضمیمه */}
      {assignment.attachments.length > 0 && (
        <Card className="p-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-primary" />
            فایل‌های ضمیمه ({convertJalaliDigits(assignment.attachments.length)})
          </h4>
          <div className="space-y-1.5">
            {assignment.attachments.map((f) => (
              <SecureAssignmentFileLink
                key={f.id}
                reference={f.url}
                className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg hover:bg-muted/60 transition"
              >
                {fileTypeIcon(f.type)}
                <span className="text-sm flex-1 truncate">{f.name}</span>
                <Badge variant="outline" className="text-xs">
                  {formatBytes(f.size)}
                </Badge>
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
              </SecureAssignmentFileLink>
            ))}
          </div>
        </Card>
      )}

      {/* نکات */}
      {assignment.notes && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <h4 className="font-medium mb-2 flex items-center gap-2 text-amber-800">
            <MessageSquare className="h-4 w-4" />
            نکات ویژه برای قرآن‌آموزان
          </h4>
          <p className="text-sm whitespace-pre-wrap text-amber-900">{assignment.notes}</p>
        </Card>
      )}

      {/* ارسال‌نکرده‌ها */}
      {pendingStudents.length > 0 && (
        <Card className="p-4">
          <h4 className="font-medium mb-2 flex items-center gap-2 text-amber-700">
            <AlertCircle className="h-4 w-4" />
            هنوز ارسال نکرده‌اند ({convertJalaliDigits(pendingStudents.length)} نفر)
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {pendingStudents.map((s) => (
              <Badge key={s.id} variant="outline" className="text-xs">
                {s.name}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ================================================================== */
/* تب ارسال‌ها                                                       */
/* ================================================================== */
function SubmissionsTab({
  assignment,
  submissions,
  targetStudents,
  expandedSubmission,
  setExpandedSubmission,
  onReviewed,
  studentNames,
}: {
  assignment: Assignment;
  submissions: Submission[];
  targetStudents: { id: string; name: string }[];
  expandedSubmission: string | null;
  setExpandedSubmission: (id: string | null) => void;
  onReviewed: () => void;
  studentNames: Record<string, string>;
}) {
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  const groupedSubmissions = useMemo(() => {
    const map = new Map<string, Submission[]>();
    for (const submission of submissions) {
      const list = map.get(submission.student_id) ?? [];
      list.push(submission);
      map.set(submission.student_id, list);
    }

    return Array.from(map.entries())
      .map(([studentId, list]) => {
        const sorted = [...list].sort(
          (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
        );
        return {
          studentId,
          studentName:
            studentNames[studentId] ??
            targetStudents.find((t) => t.id === studentId)?.name ??
            studentId,
          submissions: sorted,
          latest: sorted[0],
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName, "fa"));
  }, [submissions, studentNames, targetStudents]);

  if (submissions.length === 0) {
    return (
      <Card className="p-8 text-center my-4">
        <Send className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          هنوز هیچ قرآن‌آموزی این تکلیف را ارسال نکرده است.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3 py-2">
      <Card className="p-3 bg-primary/5 border-primary/15">
        <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
          <div className="font-medium text-primary">تاریخچه ارسال‌ها بر اساس قرآن‌آموز</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">
              {convertJalaliDigits(groupedSubmissions.length)} قرآن‌آموز ارسال کرده‌اند
            </Badge>
            <Badge variant="outline">
              {convertJalaliDigits(submissions.length)} ارسال در مجموع
            </Badge>
          </div>
        </div>
      </Card>

      {groupedSubmissions.map((group) => {
        const isExpanded = expandedStudentId === group.studentId;
        return (
          <SubmissionHistoryGroup
            key={group.studentId}
            group={group}
            isExpanded={isExpanded}
            onToggle={() => {
              setExpandedStudentId(isExpanded ? null : group.studentId);
              setExpandedSubmission(null);
            }}
            expandedSubmission={expandedSubmission}
            setExpandedSubmission={setExpandedSubmission}
            onReviewed={onReviewed}
            assignmentId={assignment.id}
          />
        );
      })}
    </div>
  );
}

function SubmissionHistoryGroup({
  group,
  isExpanded,
  onToggle,
  expandedSubmission,
  setExpandedSubmission,
  onReviewed,
  assignmentId,
}: {
  group: { studentId: string; studentName: string; submissions: Submission[]; latest: Submission };
  isExpanded: boolean;
  onToggle: () => void;
  expandedSubmission: string | null;
  setExpandedSubmission: (id: string | null) => void;
  onReviewed: () => void;
  assignmentId: string;
}) {
  const latestInfo = SUBMISSION_STATUS[group.latest.status] ?? SUBMISSION_STATUS.pending;
  const reviewedCount = group.submissions.filter((submission) => submission.reviewed).length;

  return (
    <Card className="overflow-hidden border-border/80">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 text-right hover:bg-muted/30 transition"
      >
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback>{group.studentName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold truncate">{group.studentName}</span>
            <Badge className={`${latestInfo.color} border text-xs gap-1`}>
              {latestInfo.icon}
              آخرین وضعیت: {latestInfo.label}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {convertJalaliDigits(group.submissions.length)} ارسال
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
            <span>آخرین ارسال: {relativeTime(group.latest.submitted_at)}</span>
            <span>•</span>
            <span>بررسی‌شده: {convertJalaliDigits(reviewedCount)}</span>
            {group.latest.grade != null && (
              <>
                <span>•</span>
                <span className="text-emerald-700 font-medium">
                  نمره آخر: {convertJalaliDigits(group.latest.grade)}
                </span>
              </>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t bg-muted/10 p-3 space-y-2">
          <div className="text-xs text-muted-foreground mb-2">
            ارسال‌ها از جدید به قدیم نمایش داده شده‌اند. برای بررسی هر ارسال، روی همان مورد کلیک
            کنید.
          </div>
          {group.submissions.map((submission, index) => {
            const isAttemptExpanded = expandedSubmission === submission.id;
            return (
              <div key={submission.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="px-3 pt-2 text-[11px] text-muted-foreground">
                  تلاش شماره {convertJalaliDigits(group.submissions.length - index)}
                </div>
                <SubmissionItem
                  submission={submission}
                  studentName={group.studentName}
                  isExpanded={isAttemptExpanded}
                  onToggle={() => setExpandedSubmission(isAttemptExpanded ? null : submission.id)}
                  onReviewed={onReviewed}
                  assignmentId={assignmentId}
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ================================================================== */
/* آیتم ارسال                                                       */
/* ================================================================== */
function SubmissionItem({
  submission,
  studentName,
  isExpanded,
  onToggle,
  onReviewed,
  assignmentId,
}: {
  submission: Submission;
  studentName: string;
  isExpanded: boolean;
  onToggle: () => void;
  onReviewed: () => void;
  assignmentId: string;
}) {
  const [grade, setGrade] = useState<string>(submission.grade?.toString() ?? "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [feedbackAudio, setFeedbackAudio] = useState<AudioClip | null>(
    submission.feedback_audio_url ? { url: submission.feedback_audio_url, duration: 0 } : null,
  );
  const [status, setStatus] = useState<SubmissionStatus>(submission.status);
  const [saving, setSaving] = useState(false);

  const statusInfo = SUBMISSION_STATUS[status];

  async function saveReview() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("submissions")
        .update({
          reviewed: true,
          reviewed_at: new Date().toISOString(),
          grade: grade ? parseFloat(grade) : null,
          feedback: feedback || null,
          feedback_audio_url: feedbackAudio?.url ?? null,
          status,
        })
        .eq("id", submission.id);
      if (error) throw error;
      toast.success("بازخورد و نتیجه بررسی با موفقیت ذخیره شد ✅");
      onReviewed();
    } catch (err) {
      console.error("Save review error:", err);
      toast.error("خطا در ذخیره بازخورد: " + (err instanceof Error ? err.message : "خطای نامشخص"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="assignment-section-card overflow-hidden">
      {/* هدر */}
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 text-right hover:bg-muted/30 transition"
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback>{studentName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{studentName}</span>
            <Badge className={`${statusInfo.color} border text-xs gap-1`}>
              {statusInfo.icon}
              {statusInfo.label}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            {submission.type === "audio" && (
              <>
                <FileAudio className="h-3 w-3" />
                فایل صوتی
              </>
            )}
            {submission.type === "file" && (
              <>
                <Paperclip className="h-3 w-3" />
                فایل ضمیمه
              </>
            )}
            {submission.type === "text" && (
              <>
                <FileText className="h-3 w-3" />
                متن
              </>
            )}
            <span>•</span>
            <span>{relativeTime(submission.submitted_at)}</span>
            {submission.grade != null && (
              <>
                <span>•</span>
                <span className="text-emerald-700 font-medium">
                  نمره: {convertJalaliDigits(submission.grade)}
                </span>
              </>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* محتوای باز شده */}
      {isExpanded && (
        <div className="border-t p-4 space-y-4 bg-muted/10">
          {/* محتوای ارسالی */}
          {submission.content && (
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">متن ارسالی:</h5>
              <p className="text-sm whitespace-pre-wrap p-3 bg-background rounded-lg border">
                {submission.content}
              </p>
            </div>
          )}

          {submission.audio_url && (
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">فایل صوتی ارسالی:</h5>
              <SecureAssignmentAudio reference={submission.audio_url} controls className="w-full" />
            </div>
          )}

          {submission.file_url && (
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">فایل ضمیمه:</h5>
              <SecureAssignmentFileLink
                reference={submission.file_url}
                className="flex items-center gap-2 p-2 bg-background rounded-lg border hover:bg-muted/30"
              >
                <Paperclip className="h-4 w-4" />
                <span className="text-sm flex-1 truncate">دانلود فایل ارسالی</span>
                <Download className="h-3.5 w-3.5" />
              </SecureAssignmentFileLink>
            </div>
          )}

          {/* فرم بازخورد */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-amber-500" />
              <h5 className="font-medium text-sm">بررسی و بازخورد</h5>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">نمره (از ۲۰)</label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="مثلاً ۱۸.۵"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">وضعیت نهایی</label>
                <Select value={status} onValueChange={(v) => setStatus(v as SubmissionStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">در انتظار بررسی</SelectItem>
                    <SelectItem value="approved">تأیید شده</SelectItem>
                    <SelectItem value="needs_revision">نیاز به اصلاح</SelectItem>
                    <SelectItem value="rejected">رد شده</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">بازخورد متنی</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="نظر، پیشنهاد یا توضیح خود را بنویسید..."
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                فایل صوتی اصلاحی (اختیاری)
              </label>
              <AudioRecorder
                value={feedbackAudio}
                onChange={setFeedbackAudio}
                folder={`feedback/${submission.student_id}`}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={saveReview}
                disabled={saving}
                className="gap-1"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <Save className="h-3.5 w-3.5" />
                ذخیره بازخورد
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ================================================================== */
/* دیالوگ قالب‌ها                                                    */
/* ================================================================== */
function TemplatesDialog({
  open,
  onOpenChange,
  templates,
  classNames,
  onUseTemplate,
  onDeleteTemplate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templates: Assignment[];
  classNames: Record<string, string>;
  onUseTemplate: (a: Assignment) => void;
  onDeleteTemplate: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="assignment-dialog max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            قالب‌های تکلیف
          </DialogTitle>
          <DialogDescription>
            از قالب‌های ذخیره‌شده برای ایجاد سریع تکلیف جدید استفاده کنید.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
          {templates.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <LayoutTemplate className="h-10 w-10 mx-auto mb-2" />
              <p className="text-sm">
                هنوز قالبی ذخیره نشده است. هنگام ایجاد تکلیف، گزینه «ذخیره به عنوان قالب» را فعال
                کنید.
              </p>
            </Card>
          ) : (
            templates.map((t) => {
              const typeInfo = getTypeInfo(t.type);
              return (
                <Card
                  key={t.id}
                  className="p-3 flex items-center gap-3 hover:shadow-soft transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className={`${typeInfo.color} border text-xs gap-1`}>
                        {typeInfo.icon}
                        {typeInfo.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {classNames[t.class_id] ?? "—"}
                      </span>
                    </div>
                    <h4 className="font-medium truncate">{t.title}</h4>
                    {t.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => onUseTemplate(t)} className="gap-1 shrink-0">
                    <Copy className="h-3.5 w-3.5" />
                    استفاده
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDeleteTemplate(t.id)}
                    className="text-rose-600 hover:bg-rose-50 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/* Form Section و Field - کامپوننت‌های کمکی فرم                     */
/* ================================================================== */
function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="assignment-section-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full p-3 flex items-center gap-2 bg-muted/30 hover:bg-muted/50 transition text-right"
      >
        <span className="text-primary">{icon}</span>
        <span className="font-medium text-sm">{title}</span>
        <span className="mr-auto">
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </Card>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/* ================================================================== */
/* شمارش معکوس مهلت                                                */
/* ================================================================== */
function CountdownBadge({ assignment }: { assignment: Assignment }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (isExpired(assignment)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [assignment]);

  const deadline = getDeadline(assignment).getTime();
  const remainMs = deadline - now;
  const expired = remainMs <= 0;
  const total = assignment.deadline_hours * 3600 * 1000;
  const percent = Math.max(0, Math.round((remainMs / total) * 100));

  if (expired) {
    return (
      <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium text-rose-700">مهلت تمام شده</div>
          <div className="text-xs text-rose-600">
            منقضی شده در{" "}
            {new Date(deadline).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    );
  }

  const h = Math.floor(remainMs / 3600000);
  const m = Math.floor((remainMs % 3600000) / 60000);
  const s = Math.floor((remainMs % 60000) / 1000);
  const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  const colorClasses =
    percent > 50
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : percent > 25
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-rose-50 border-rose-200 text-rose-800";

  const barColor = percent > 50 ? "bg-emerald-500" : percent > 25 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className={"mt-3 p-2.5 border rounded-lg " + colorClasses}>
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 shrink-0" />
        <span className="text-xs">مهلت باقی‌مانده:</span>
        <span className="font-display font-bold text-base tabular-nums tracking-wider">
          {timeStr}
        </span>
        <span className="text-xs mr-auto opacity-75">({convertJalaliDigits(percent)}٪)</span>
      </div>
      {/* نوار پیشرفت معکوس */}
      <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
        <div
          className={"h-full transition-all duration-1000 ease-linear " + barColor}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/* Stat Box و Custom Stat Card                                       */
/* ================================================================== */
function StatBox({
  label,
  value,
  icon,
  color,
  onClick,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  color: "blue" | "emerald" | "rose" | "amber";
  onClick?: () => void;
}) {
  const colorClasses = {
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    rose: "text-rose-700 bg-rose-50 border-rose-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
  }[color];

  return (
    <Card
      onClick={onClick}
      className={`p-3 border ${colorClasses} ${onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs opacity-80 mb-0.5">{label}</div>
          <div className="font-display text-xl">{convertJalaliDigits(value)}</div>
        </div>
        <div className={`rounded-lg p-2 ${colorClasses}`}>{icon}</div>
      </div>
    </Card>
  );
}

function CustomStatCard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  colorClass: string;
}) {
  return (
    <Card className={"p-4 border " + colorClass}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground mb-1">{label}</div>
          <div className="font-display text-2xl leading-none">{convertJalaliDigits(value)}</div>
        </div>
        <div className={"rounded-lg p-2 " + colorClass}>{icon}</div>
      </div>
    </Card>
  );
}

const assignmentsPolishStyle = `
.assignments-hero {
  background:
    radial-gradient(circle at 15% 20%, rgba(212, 175, 55, 0.28), transparent 30%),
    radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.18), transparent 28%),
    linear-gradient(135deg, #064E3B 0%, #065F46 48%, #047857 100%);
  border-radius: 2rem;
}
.assignments-pattern {
  background-image:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,.22) 0 2px, transparent 2.8px),
    linear-gradient(45deg, transparent 0 48%, rgba(255,255,255,.10) 49% 50%, transparent 51%);
  background-size: 72px 72px, 36px 36px;
}
.assignments-actions > button,
.assignments-actions a {
  border-radius: 1rem;
}
.assignments-filter-card,
.assignments-empty-card,
.assignment-card,
.assignment-section-card,
.assignment-dialog {
  border: 1px solid rgba(212, 175, 55, 0.16) !important;
  background: linear-gradient(135deg, #ffffff, #FFF8E7 125%) !important;
  border-radius: 1.75rem !important;
  box-shadow: 0 12px 32px rgba(6, 78, 59, .06) !important;
}
.assignment-card {
  position: relative;
  overflow: hidden;
}
.assignment-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: .20;
  background-image:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,.18) 0 2px, transparent 2.8px),
    linear-gradient(45deg, transparent 0 48%, rgba(6,78,59,.05) 49% 50%, transparent 51%);
  background-size: 72px 72px, 38px 38px;
}
.assignment-card > * {
  position: relative;
  z-index: 1;
}
.assignment-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 42px rgba(6, 78, 59, .12) !important;
}
.assignment-card h3 {
  color: #064E3B;
  font-weight: 900;
}
.assignment-card .border-t {
  border-color: rgba(212,175,55,.18) !important;
}
.assignment-meta-grid > div {
  border-radius: 1rem;
  background: rgba(255,255,255,.62);
  border: 1px solid rgba(6,78,59,.08);
  padding: .55rem .65rem;
}
.assignments-stats > * {
  border-radius: 1.5rem !important;
}
.assignment-section-card > button {
  background: linear-gradient(90deg, rgba(6,78,59,.08), rgba(212,175,55,.08)) !important;
}
.assignment-section-card > button span:first-child,
.assignment-section-card svg.text-primary,
.assignment-dialog svg.text-primary {
  color: #064E3B !important;
}
.assignment-dialog [role="dialog"],
.assignment-dialog {
  border-radius: 1.75rem !important;
}
`;
