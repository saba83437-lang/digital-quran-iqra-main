// ============================================================
//  طرح نجم - ثبت جلسه (فرم پویا بر اساس تنظیمات پنل مدیر)
//  مسیر: src/routes/teacher.session.tsx
//
//  نسخه جدید (2026-07-26): ستون‌های فرم ثبت جلسه دیگر ثابت نیستند؛
//  از جدول najm_score_items (بخش «مدیریت آیتم‌های ثبت جلسه» در پنل
//  مدیر) خوانده می‌شوند. مدیر می‌تواند آیتم‌ها را کم/زیاد،
//  فعال/غیرفعال و سقف امتیازشان را تغییر دهد و این فرم به‌صورت
//  خودکار با همان تنظیمات به استاد نمایش داده می‌شود.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ClipboardCheck,
  Loader2,
  Save,
  CheckCircle2,
  XCircle,
  History,
  Users,
  Star,
  Timer,
  Lock,
  Sparkles,
  CalendarDays,
  AlertTriangle,
  Trophy,
  Settings2,
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
import { getCurrentTeacher } from "@/lib/teacher-utils";
import { toast } from "sonner";
import { ConductRecoveryPanel } from "@/features/recitation/components/conduct-recovery-panel";
import { ConductRecoveryHistoryDialog } from "@/features/recitation/components/conduct-recovery-history-dialog";
import {
  loadTeacherConductRecoveryCases,
  recordTeacherConductRecovery,
  type ConductRecoveryCase,
} from "@/features/recitation/api/conduct-recovery-api";
import {
  NAJM_TERMS,
  NAJM_DEFAULT_ITEMS,
  NAJM_DEFAULT_SETTINGS,
  NAJM_ABSENCE_KINDS,
  NAJM_ATTENDANCE_KEY,
  NAJM_EXAM_KEY,
  activeNajmItems,
  computeSessionScoreWithItems,
  emptyNajmRecordFromItems,
  examDisplay,
  getNajmItemValue,
  isAbsent,
  loadNajmScoreItems,
  loadNajmSessionSettings,
  najmAbsenceKindLabel,
  najmAttendanceItem,
  najmAttendanceMax,
  normalizeAbsenceKind,
  normalizeRecordWithItems,
  saveNajmSession,
  sortNajmItems,
  withNajmItemValue,
  type NajmAbsenceKind,
  type NajmRecordInput,
  type NajmScoreItem,
  type NajmSessionSettings,
  type NajmTerm,
} from "@/lib/najm";

export const Route = createFileRoute("/teacher/session")({
  head: () => ({
    meta: [
      { title: "طرح نجم — ثبت جلسه" },
      { name: "description", content: "ثبت یک‌باره حضور، تکلیف، آزمون، نظم و امتیازات هر جلسه" },
    ],
  }),
  component: SessionPage,
});

/* ----------------------------- کمکی‌ها ----------------------------- */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toEnglishDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨۹".indexOf(d)));
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
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
  }
}
function convertJalaliDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}
function scoreColor(score: number): string {
  if (score >= 25) return "text-emerald-700 bg-emerald-50 border-emerald-100";
  if (score >= 15) return "text-gold-foreground bg-gold/10 border-gold/20";
  return "text-amber-700 bg-amber-50 border-amber-100";
}

/* رنگ‌بندی ستون‌ها بر اساس نوع آیتم */
function itemThClass(kind: NajmScoreItem["kind"]): string {
  if (kind === "special") return "bg-emerald-50 text-emerald-800 border-x border-emerald-100";
  if (kind === "negative") return "bg-rose-50 text-rose-800 border-x border-rose-100";
  return "";
}
function itemTdClass(kind: NajmScoreItem["kind"]): string {
  if (kind === "special") return "bg-emerald-50/60 border-x border-emerald-100";
  if (kind === "negative") return "bg-rose-50/70 border-x border-rose-100";
  return "";
}

/* ----------------------------- انواع ----------------------------- */
interface ClassRow {
  id: string;
  name: string;
  level: string;
  term: string | null;
  academic_year: string | null;
}
interface NajmActiveTermRow {
  id: string;
  title: string;
  term: NajmTerm;
  academic_year: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  note: string | null;
}
interface StudentRow {
  id: string;
  name: string;
  level: string | null;
  class_id: string | null;
}
type SaveStatusType = "success" | "error" | "pending";
interface SaveStatus {
  type: SaveStatusType;
  message: string;
  timestamp: number;
  details?: string;
}

/* ----------------------------- صفحه ----------------------------- */
function SessionPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [activeTerm, setActiveTerm] = useState<NajmActiveTermRow | null>(null);
  const [sessionDate, setSessionDate] = useState<string>(todayJalali());

  /* آیتم‌های فرم: همه (فعال+غیرفعال برای تاریخچه) و فقط فعال (برای ثبت) */
  const [allItems, setAllItems] = useState<NajmScoreItem[]>(NAJM_DEFAULT_ITEMS);
  const [items, setItems] = useState<NajmScoreItem[]>(activeNajmItems(NAJM_DEFAULT_ITEMS));
  const [settings, setSettings] = useState<NajmSessionSettings>(NAJM_DEFAULT_SETTINGS);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [records, setRecords] = useState<Record<string, NajmRecordInput>>({});
  const [recoveryCases, setRecoveryCases] = useState<ConductRecoveryCase[]>([]);
  const [selectedRecoveryIds, setSelectedRecoveryIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);

  const [existingSessionId, setExistingSessionId] = useState<string | null>(null);
  const [sessionLockTime, setSessionLockTime] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  /* ----- تاریخچه ----- */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [historyClassFilter, setHistoryClassFilter] = useState<string>("all");
  const [historySearch, setHistorySearch] = useState<string>("");
  const [historySelectedSession, setHistorySelectedSession] = useState<any | null>(null);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);

  /* ----- بارگذاری اولیه ----- */
  useEffect(() => {
    (async () => {
      // آیتم‌ها و تنظیمات از پنل مدیر خوانده می‌شوند
      const [loadedItems, loadedSettings] = await Promise.all([
        loadNajmScoreItems(),
        loadNajmSessionSettings(),
      ]);
      setAllItems(sortNajmItems(loadedItems));
      setItems(activeNajmItems(loadedItems));
      setSettings(loadedSettings);

      const { data: activeTermData, error: activeTermError } = await supabase
        .from("najm_terms")
        .select("id, title, term, academic_year, starts_at, ends_at, is_active, note")
        .eq("is_active", true)
        .maybeSingle();

      if (activeTermError) {
        console.error("active najm term error:", activeTermError);
        toast.error("خطا در دریافت ترم فعال طرح نجم");
      }

      const currentActiveTerm = (activeTermData ?? null) as NajmActiveTermRow | null;
      setActiveTerm(currentActiveTerm);
      const t = await getCurrentTeacher();
      if (t) {
        // کلاس‌های حذف‌شده (حذف نرم deleted_at در پنل مدیر) برای استاد نمایش داده نمی‌شوند
        const { data: cls } = await supabase
          .from("classes")
          .select("id, name, level, term, academic_year")
          .eq("teacher_id", t.id)
          .is("deleted_at", null)
          .order("name");
        const list = (cls ?? []) as ClassRow[];
        setClasses(list);
        if (list.length > 0) {
          setSelectedClassId(list[0].id);
        }
      }
      setLoading(false);
    })();
  }, []);

  /* ----- تغییر کلاس: بارگذاری دانش‌آموزان + جلسه‌ی موجود ----- */
  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      setRecords({});
      setExistingSessionId(null);
      setSessionLockTime(null);
      return;
    }
    (async () => {
      const { data: stu } = await supabase
        .from("students")
        .select("id, name, level, class_id")
        .eq("class_id", selectedClassId)
        .order("name");
      const list = (stu ?? []) as StudentRow[];
      setStudents(list);
      try {
        const loadedRecoveryCases = await loadTeacherConductRecoveryCases();
        const studentIds = new Set(list.map((student) => Number(student.id)));
        setRecoveryCases(
          loadedRecoveryCases.filter((item) => studentIds.has(Number(item.student_id))),
        );
        setSelectedRecoveryIds(new Set());
      } catch (error) {
        console.warn("conduct recovery cases could not be loaded:", error);
        setRecoveryCases([]);
        setSelectedRecoveryIds(new Set());
      }
      await loadExisting(list);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, sessionDate, activeTerm?.id, allItems]);

  async function loadExisting(list: StudentRow[]) {
    if (!activeTerm) {
      setExistingSessionId(null);
      setSessionLockTime(null);
      const map: Record<string, NajmRecordInput> = {};
      for (const s of list) map[s.id] = emptyRecord(s);
      setRecords(map);
      return;
    }

    // جلسه موجود فقط در محدوده ترم فعال مدیر جستجو می‌شود.
    // بنابراین اگر سال/ترم جدید فعال شود، ثبت‌های جدید استاد از همان ترم فعال شروع می‌شود.
    const { data: session } = await supabase
      .from("najm_sessions")
      .select("*")
      .eq("class_id", selectedClassId)
      .eq("session_date", sessionDate)
      .eq("term", activeTerm.term)
      .eq("academic_year", activeTerm.academic_year)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session) {
      const { data: recs } = await supabase
        .from("najm_session_records")
        .select("*")
        .eq("session_id", session.id);

      setExistingSessionId(session.id);
      setSessionLockTime(new Date(session.created_at));
      const map: Record<string, NajmRecordInput> = {};
      for (const r of recs ?? []) {
        // مقادیر با تنظیمات فعلی مدیر هماهنگ می‌شوند (مثلاً اگر سقف آیتم کم شده باشد)
        map[r.student_id] = normalizeRecordWithItems(
          {
            student_id: r.student_id,
            student_name: r.student_name ?? "",
            attendance: r.attendance,
            homework: r.homework,
            exam_raw: r.exam_raw,
            discipline: r.discipline,
            special_progress: r.special_progress,
            special_help: r.special_help,
            negative_disorder: r.negative_disorder,
            negative_disrespect: r.negative_disrespect,
            custom_scores: r.custom_scores ?? {},
            recovery_bonus: Number(r.recovery_bonus ?? 0) || 0,
            absence_kind: r.absence_kind ?? null,
          },
          items,
        );
      }
      // دانش‌آموزانی که رکورد ندارن با مقدار پیش‌فرض
      for (const s of list) if (!map[s.id]) map[s.id] = emptyRecord(s);
      setRecords(map);
    } else {
      setExistingSessionId(null);
      setSessionLockTime(null);
      const map: Record<string, NajmRecordInput> = {};
      for (const s of list) map[s.id] = emptyRecord(s);
      setRecords(map);
    }
  }

  function emptyRecord(s: StudentRow): NajmRecordInput {
    return emptyNajmRecordFromItems(s, items);
  }

  /* ----- قفل ۶ ساعته ----- */
  useEffect(() => {
    if (!sessionLockTime) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [sessionLockTime]);
  const isLocked = useMemo(() => {
    if (!sessionLockTime) return false;
    return now.getTime() - sessionLockTime.getTime() >= 6 * 60 * 60 * 1000;
  }, [sessionLockTime, now]);

  /* ----- تنظیم فیلدها ----- */
  function setField(studentId: string, item: NajmScoreItem, value: number) {
    setRecords((prev) => {
      const cur =
        prev[studentId] ?? emptyRecord({ id: studentId, name: "", level: null, class_id: null });
      let next = withNajmItemValue(cur, item, value) as NajmRecordInput;
      // قانون غیبت: حضور = ۰ → بقیه صفر
      if (item.item_key === NAJM_ATTENDANCE_KEY && isAbsent(value)) {
        next = normalizeRecordWithItems(next, items);
      }
      return { ...prev, [studentId]: next };
    });
  }

  /* ----- نوع غیبت (موجه، پزشکی، …) ----- */
  function setAbsenceKind(studentId: string, kind: NajmAbsenceKind) {
    setRecords((prev) => {
      const cur =
        prev[studentId] ?? emptyRecord({ id: studentId, name: "", level: null, class_id: null });
      return { ...prev, [studentId]: { ...cur, absence_kind: kind } };
    });
  }

  const classTotalScore = useMemo(() => {
    return Object.values(records).reduce(
      (sum, r) => sum + computeSessionScoreWithItems(r, items),
      0,
    );
  }, [records, items]);

  // سقف امتیازی که هر قرآن‌آموز می‌تواند در یک جلسه بگیرد:
  // جمع سقف آیتم‌های مثبت و ویژه — آیتم‌های منفی در آن لحاظ نمی‌شوند
  // (با آیتم‌های فعلی: ۵+۵+۱۰+۵+۳+۲ = ۳۰)
  const sessionScoreCap = useMemo(() => {
    return items.filter((i) => i.kind !== "negative").reduce((sum, i) => sum + i.max_score, 0);
  }, [items]);

  const examItem = useMemo(() => items.find((i) => i.item_key === NAJM_EXAM_KEY) ?? null, [items]);
  const specialItems = useMemo(() => items.filter((i) => i.kind === "special"), [items]);
  const attMax = useMemo(() => najmAttendanceMax(items), [items]);

  const selectedHistoryClassName = useMemo(() => {
    if (historyClassFilter === "all") return "";
    return classes.find((c) => String(c.id) === String(historyClassFilter))?.name ?? "";
  }, [classes, historyClassFilter]);

  const filteredHistorySessions = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return sessions.filter((s) => {
      const matchesClass =
        historyClassFilter === "all" ||
        String(s.class_id) === String(historyClassFilter) ||
        (!!selectedHistoryClassName && String(s.class_name ?? "") === selectedHistoryClassName);
      const matchesSearch =
        !q ||
        String(s.class_name ?? "")
          .toLowerCase()
          .includes(q) ||
        String(s.session_date ?? "").includes(q) ||
        String(s.academic_year ?? "").includes(q);
      return matchesClass && matchesSearch;
    });
  }, [sessions, historyClassFilter, historySearch, selectedHistoryClassName]);

  /* ----- ذخیره ----- */
  async function handleSave() {
    if (!selectedClassId || students.length === 0) return;
    if (!activeTerm) {
      toast.error("ترم فعال طرح نجم توسط مدیر تعریف نشده است.");
      setSaveStatus({
        type: "error",
        message: "ترم فعال طرح نجم تعریف نشده است.",
        timestamp: Date.now(),
        details: "ابتدا مدیر باید در پنل مدیریت طرح نجم یک ترم را فعال کند.",
      });
      return;
    }
    if (isLocked) {
      toast.error("جلسه قفل شده؛ فقط مدیر می‌تواند ویرایش کند.");
      return;
    }
    setSaving(true);
    setSaveStatus({ type: "pending", message: "در حال ثبت جلسه...", timestamp: Date.now() });
    const cls = classes.find((c) => c.id === selectedClassId);
    const { sessionId: savedSessionId, error } = await saveNajmSession(
      {
        class_id: selectedClassId,
        class_name: cls?.name ?? "",
        session_date: sessionDate,
        term: activeTerm.term,
        academic_year: activeTerm.academic_year,
        records: Object.values(records),
      },
      existingSessionId ?? undefined,
      { items, examGradesSync: settings.examGradesSync },
    );
    setSaving(false);
    if (error) {
      // اگر خود جلسه ساخته شده ولی یکی از مراحل وابسته خطا داده باشد، شناسه را
      // نگه می‌داریم تا تلاش بعدی Update باشد و جلسهٔ تکراری ساخته نشود.
      if (savedSessionId) setExistingSessionId(savedSessionId);
      setSaveStatus({ type: "error", message: "خطا در ثبت: " + error, timestamp: Date.now() });
      toast.error(error);
    } else {
      const selectedCases = recoveryCases.filter((item) => selectedRecoveryIds.has(item.id));
      const recoveryResults = await Promise.allSettled(
        selectedCases.map((item) =>
          recordTeacherConductRecovery({
            caseId: item.id,
            sessionId: savedSessionId,
            amount: item.remaining_amount,
          }),
        ),
      );
      const failedRecoveries = recoveryResults.filter(
        (result) => result.status === "rejected",
      ).length;
      if (failedRecoveries > 0) toast.warning("جلسه ثبت شد، اما ثبت بعضی جبران‌ها ناموفق بود.");
      else if (selectedCases.length > 0) toast.success("جبران انتخاب‌شده با موفقیت ثبت شد ✅");
      setSaveStatus({
        type: "success",
        message: "جلسه با موفقیت ثبت شد ✓",
        timestamp: Date.now(),
        details: `${students.length} قرآن‌آموز • مجموع امتیاز کلاس: ${classTotalScore}`,
      });
      toast.success("ثبت جلسه انجام شد.");
      // به‌روزرسانی زمان قفل برای همان ترم فعال
      const { data: session } = await supabase
        .from("najm_sessions")
        .select("id, created_at")
        .eq("class_id", selectedClassId)
        .eq("session_date", sessionDate)
        .eq("term", activeTerm.term)
        .eq("academic_year", activeTerm.academic_year)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (session) {
        setExistingSessionId(session.id);
        setSessionLockTime(new Date(session.created_at));
      }
      if (historyOpen) await loadHistory();
    }
  }

  /* ----- تاریخچه ----- */
  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistorySelectedSession(null);
    setHistoryRecords([]);
    await loadHistory();
  }
  async function loadHistory() {
    if (classes.length === 0) {
      setSessions([]);
      setHistoryLoading(false);
      return;
    }
    const classIds = classes.map((c) => c.id);
    const { data } = await supabase
      .from("najm_sessions")
      .select("id, class_id, class_name, session_date, term, academic_year, created_at")
      .in("class_id", classIds)
      .order("session_date", { ascending: false })
      .limit(200);
    setSessions(data ?? []);
    setHistoryLoading(false);
  }

  async function openSessionDetails(session: any) {
    setHistorySelectedSession(session);
    setHistoryDetailLoading(true);
    const { data, error } = await supabase
      .from("najm_session_records")
      .select("*")
      .eq("session_id", session.id)
      .order("student_name");

    if (error) {
      toast.error("خطا در دریافت جزئیات جلسه");
      setHistoryRecords([]);
    } else {
      setHistoryRecords(data ?? []);
    }
    setHistoryDetailLoading(false);
  }

  /* ----- رندر ----- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری...</span>
      </div>
    );
  }

  return (
    <>
      <style>{toastStyle}</style>
      {saveStatus && <SaveToast status={saveStatus} onClose={() => setSaveStatus(null)} />}

      <PageHeader
        title="ثبت جلسه"
        description="ثبت یک‌باره حضور، تکلیف، آزمون، نظم و امتیازات هر جلسه در طرح نجم."
      />

      <Card className="mb-6 overflow-hidden border-primary/15 bg-gradient-to-l from-primary/8 via-white to-gold/10 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-black text-foreground">
                تاریخچه کامل جلسات ثبت‌شده
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                مشاهده و بازیابی همه اطلاعات ثبت‌شده هر جلسه شامل حضور، تکلیف، آزمون، نظم و اخلاق،
                امتیازات ویژه و امتیاز نهایی.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                استاد فقط تا ۶ ساعت پس از ثبت مجاز به ویرایش است؛ بعد از آن فقط مدیر.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="gap-2 border-primary/40 text-primary"
            onClick={openHistory}
          >
            <History className="h-4 w-4" /> مشاهده تاریخچه کامل
          </Button>
        </div>
      </Card>

      {classes.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">کلاسی برای شما ثبت نشده است.</Card>
      ) : (
        <>
          <Card
            className={
              "mb-6 overflow-hidden border p-4 " +
              (activeTerm ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50")
            }
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={
                    "rounded-2xl p-3 " +
                    (activeTerm ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
                  }
                >
                  {activeTerm ? (
                    <CalendarDays className="h-5 w-5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h2 className="font-display text-base font-black text-foreground">
                    ترم فعال تعیین‌شده توسط مدیر
                  </h2>
                  {activeTerm ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      ثبت جلسه فقط با همین مشخصات انجام می‌شود:{" "}
                      <span className="font-bold text-emerald-800">{activeTerm.title}</span> •{" "}
                      {NAJM_TERMS.find((t) => t.value === activeTerm.term)?.label} • سال تحصیلی{" "}
                      {convertJalaliDigits(activeTerm.academic_year)}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-amber-800">
                      هنوز ترم فعالی برای طرح نجم تعریف نشده است. تا وقتی مدیر ترم فعال را مشخص
                      نکند، استاد نمی‌تواند جلسه نجم ثبت کند.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    استاد امکان تغییر دستی ترم و سال تحصیلی را ندارد تا همه ثبت‌ها با تنظیمات پنل
                    مدیر هماهنگ باشند.
                  </p>
                </div>
              </div>
              {activeTerm && (
                <Badge className="w-fit rounded-full bg-emerald-600 text-white hover:bg-emerald-600">
                  فعال
                </Badge>
              )}
            </div>
          </Card>

          {/* فیلترهای بالا */}
          <Card className="p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>کلاس</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>تاریخ جلسه</Label>
                <Input
                  dir="ltr"
                  className="text-right"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  placeholder={todayJalali()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ترم فعال</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium text-muted-foreground">
                  {activeTerm
                    ? NAJM_TERMS.find((t) => t.value === activeTerm.term)?.label
                    : "تعریف نشده"}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>سال تحصیلی فعال</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium text-muted-foreground">
                  {activeTerm ? convertJalaliDigits(activeTerm.academic_year) : "تعریف نشده"}
                </div>
              </div>
            </div>
          </Card>

          {/* بنر قفل */}
          {sessionLockTime && (
            <Card
              className={
                "p-3 mb-4 border " +
                (isLocked ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200")
              }
            >
              <div className="flex items-center gap-2 text-sm flex-wrap">
                {isLocked ? (
                  <>
                    <Lock className="h-4 w-4 text-rose-700" />
                    <span className="text-rose-800 font-medium">
                      این جلسه قفل شده است. فقط مدیر می‌تواند ویرایش کند.
                    </span>
                  </>
                ) : (
                  <>
                    <Timer className="h-4 w-4 text-amber-700" />
                    <span className="text-amber-800">
                      زمان باقی‌مانده برای ویرایش:{" "}
                      <span className="font-display font-bold">
                        {formatRemaining(
                          6 * 60 * 60 * 1000 - (now.getTime() - sessionLockTime.getTime()),
                        )}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </Card>
          )}

          {/* آمار */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="قرآن‌آموزان کلاس"
              value={students.length}
              icon={<Users className="h-5 w-5" />}
              tone="primary"
            />
            <StatCard
              label="سقف امتیاز هر جلسه"
              value={convertJalaliDigits(sessionScoreCap)}
              icon={<Sparkles className="h-5 w-5" />}
              tone="gold"
            />
            <StatCard
              label={examItem ? "نمره آزمون (نمایش)" : "آیتم‌های فعال فرم"}
              value={
                examItem
                  ? `۱۰−${convertJalaliDigits(10 + examItem.max_score)}`
                  : convertJalaliDigits(items.length)
              }
              icon={<Star className="h-5 w-5" />}
              tone="success"
            />
            <StatCard
              label="وضعیت"
              value={isLocked ? "قفل‌شده" : existingSessionId ? "ویرایش" : "جدید"}
              icon={<ClipboardCheck className="h-5 w-5" />}
              tone="warning"
            />
          </div>

          {specialItems.length > 0 && (
            <Card className="mb-4 border-gold/30 bg-gold/10 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gold-foreground">
                <Star className="h-4 w-4" />
                <span className="font-bold">امتیازهای ویژه:</span>
                <span>
                  {specialItems
                    .map((i) => `«${i.label}» تا ${convertJalaliDigits(i.max_score)} امتیاز`)
                    .join(" و ")}{" "}
                  است؛ مجموعاً{" "}
                  {convertJalaliDigits(specialItems.reduce((a, b) => a + b.max_score, 0))} امتیاز
                  ویژه‌اند و فقط در موارد خاص داده می‌شوند.
                </span>
              </div>
            </Card>
          )}

          {/* فرم دانش‌آموزان */}
          {students.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              دانش‌آموزی در این کلاس ثبت نشده است.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  ثبت امتیاز {convertJalaliDigits(students.length)} قرآن‌آموز
                </span>
                <Badge
                  variant="outline"
                  className="gap-1 border-gold/40 bg-gold/10 text-gold-foreground"
                  title="جمع امتیاز همه قرآن‌آموزان این جلسه"
                >
                  مجموع امتیاز کلاس: {convertJalaliDigits(classTotalScore)}
                </Badge>
                <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
                  <Settings2 className="h-3 w-3" />
                  ستون‌ها از «مدیریت آیتم‌های ثبت جلسه» در پنل مدیر تعیین می‌شوند
                </span>
                {isLocked && (
                  <Badge variant="outline" className="mr-auto gap-1 text-rose-700 border-rose-200">
                    <Lock className="h-3 w-3" /> قفل‌شده
                  </Badge>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="bg-secondary/40 text-muted-foreground">
                      <th className="p-2 text-right">قرآن‌آموز</th>
                      <th className="p-2 text-center">جبران</th>
                      {items.map((item) => (
                        <th
                          key={item.item_key}
                          className={"p-2 text-center " + itemThClass(item.kind)}
                        >
                          {item.label}
                          <br />
                          {item.kind === "negative"
                            ? `۰−${convertJalaliDigits(item.max_score)}${item.weight > 1 ? ` (هر واحد ${convertJalaliDigits(item.weight)}−)` : ""}`
                            : `۰−${convertJalaliDigits(item.max_score)}`}
                        </th>
                      ))}
                      <th className="p-2 text-center">
                        امتیاز جلسه
                        <br />
                        <span className="text-[10px] font-normal">
                          از {convertJalaliDigits(sessionScoreCap)}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <StudentRow
                        key={s.id}
                        student={s}
                        items={items}
                        rec={records[s.id] ?? emptyRecord(s)}
                        sessionId={existingSessionId}
                        disabled={isLocked}
                        onChange={(item, v) => setField(s.id, item, v)}
                        onAbsenceKindChange={(kind) => setAbsenceKind(s.id, kind)}
                        recoveryCases={recoveryCases.filter(
                          (item) => Number(item.student_id) === Number(s.id),
                        )}
                        recoverySelected={recoveryCases
                          .filter((item) => Number(item.student_id) === Number(s.id))
                          .some((item) => selectedRecoveryIds.has(item.id))}
                        recoveryBonusPreview={recoveryCases
                          .filter(
                            (item) =>
                              Number(item.student_id) === Number(s.id) &&
                              selectedRecoveryIds.has(item.id),
                          )
                          .reduce((sum, item) => sum + Math.min(1, item.remaining_amount), 0)}
                        onRecoveryToggle={() => {
                          setSelectedRecoveryIds((previous) => {
                            const next = new Set(previous);
                            const studentCases = recoveryCases.filter(
                              (item) => Number(item.student_id) === Number(s.id),
                            );
                            const shouldSelect = studentCases.some((item) => !next.has(item.id));
                            studentCases.forEach((item) =>
                              shouldSelect ? next.add(item.id) : next.delete(item.id),
                            );
                            return next;
                          });
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* دکمه ذخیره */}
          <div className="mt-6 flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-muted-foreground">
              {isLocked ? (
                <span className="text-rose-700 flex items-center gap-1">
                  <Lock className="h-4 w-4" /> جلسه قفل شده است.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  ثبت جلسه برای تاریخ {convertJalaliDigits(sessionDate)}
                </span>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || students.length === 0 || isLocked || !activeTerm}
              className="gap-2 min-w-[180px]"
              size="lg"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {existingSessionId ? "به‌روزرسانی جلسه" : "ثبت جلسه"}
            </Button>
          </div>
        </>
      )}

      {/* دیالوگ تاریخچه کامل */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> تاریخچه کامل جلسات ثبت‌شده
            </DialogTitle>
            <DialogDescription>
              هر جلسه را انتخاب کنید تا تمام اطلاعات ثبت‌شده قرآن‌آموزان همان جلسه نمایش داده شود.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
            <Card className="overflow-hidden">
              <div className="border-b bg-muted/40 p-3 space-y-3">
                <div className="grid grid-cols-1 gap-2">
                  <Select value={historyClassFilter} onValueChange={setHistoryClassFilter}>
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
                  <Input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="جستجو در تاریخ، کلاس، سال..."
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {convertJalaliDigits(filteredHistorySessions.length)} جلسه یافت شد
                </div>
              </div>

              <div className="max-h-[58vh] overflow-y-auto p-2 space-y-2">
                {historyLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  </div>
                ) : filteredHistorySessions.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    جلسه‌ای یافت نشد.
                  </p>
                ) : (
                  filteredHistorySessions.map((s) => {
                    const active = historySelectedSession?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => openSessionDetails(s)}
                        className={
                          "w-full rounded-2xl border p-3 text-right transition-all " +
                          (active
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "bg-card hover:bg-secondary/40")
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm truncate">{s.class_name}</span>
                          <Badge variant="outline" className="shrink-0">
                            {s.term === "summer"
                              ? "تابستان"
                              : s.term === "term1"
                                ? "ترم ۱"
                                : "ترم ۲"}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {convertJalaliDigits(s.session_date)} •{" "}
                          {convertJalaliDigits(s.academic_year)}
                        </div>
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          برای مشاهده جزئیات کلیک کنید
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>

            <Card className="overflow-hidden">
              {!historySelectedSession ? (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <History className="mb-3 h-10 w-10 text-primary/50" />
                  <p className="font-medium">یک جلسه را از لیست سمت راست انتخاب کنید.</p>
                  <p className="mt-1 text-sm">
                    جزئیات کامل نمرات و حضور و غیاب همان جلسه اینجا نمایش داده می‌شود.
                  </p>
                </div>
              ) : historyDetailLoading ? (
                <div className="flex items-center justify-center h-96">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <SessionHistoryDetails
                  session={historySelectedSession}
                  records={historyRecords}
                  items={allItems}
                />
              )}
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ----------------------------- جزئیات تاریخچه جلسه ----------------------------- */
function SessionHistoryDetails({
  session,
  records,
  items,
}: {
  session: any;
  records: any[];
  items: NajmScoreItem[];
}) {
  const attMax = najmAttendanceMax(items);
  const attItem = najmAttendanceItem(items);
  const examItem = items.find((i) => i.item_key === NAJM_EXAM_KEY) ?? null;
  const totals = records.reduce(
    (acc, r) => {
      acc.score += Number(r.session_score ?? 0);
      if (Number(r.attendance ?? 0) === 0 || r.is_absent) acc.absent += 1;
      else if (Number(r.attendance ?? 0) < attMax) acc.late += 1;
      else acc.present += 1;
      return acc;
    },
    { score: 0, present: 0, late: 0, absent: 0 },
  );

  return (
    <div>
      <div className="border-b bg-gradient-to-l from-primary/10 to-gold/10 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="font-display text-lg font-black">{session.class_name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {convertJalaliDigits(session.session_date)} •{" "}
              {NAJM_TERMS.find((t) => t.value === session.term)?.label} •{" "}
              {convertJalaliDigits(session.academic_year)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">حاضر: {convertJalaliDigits(totals.present)}</Badge>
            <Badge variant="outline" className="border-amber-200 text-amber-700">
              تأخیر: {convertJalaliDigits(totals.late)}
            </Badge>
            <Badge variant="outline" className="border-rose-200 text-rose-700">
              غایب: {convertJalaliDigits(totals.absent)}
            </Badge>
            <Badge className="bg-gold text-gold-foreground">
              امتیاز کل: {convertJalaliDigits(totals.score)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm" dir="rtl">
          <thead>
            <tr className="bg-secondary/40 text-muted-foreground">
              <th className="p-2 text-right">قرآن‌آموز</th>
              {items.map((item) => (
                <th
                  key={item.item_key}
                  className={"p-2 text-center " + itemThClass(item.kind)}
                  title={
                    item.is_active
                      ? undefined
                      : "این آیتم اکنون در فرم ثبت غیرفعال است؛ مقادیر قبلی منجمد نمایش داده می‌شود"
                  }
                >
                  {item.label}
                  {item.kind === "negative" && item.weight > 1 && (
                    <span className="block text-[10px] font-normal">
                      هر واحد {convertJalaliDigits(item.weight)}−
                    </span>
                  )}
                </th>
              ))}
              {examItem && <th className="p-2 text-center">نمره نمایشی</th>}
              <th className="p-2 text-center">امتیاز جلسه</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={items.length + (examItem ? 3 : 2)}
                  className="p-8 text-center text-muted-foreground"
                >
                  رکوردی برای این جلسه ثبت نشده است.
                </td>
              </tr>
            ) : (
              records.map((r) => {
                const attendance = Number(r.attendance ?? 0);
                const absent = attendance === 0 || r.is_absent;
                const lateMinutes =
                  attendance >= attMax ? 0 : attendance <= 0 ? null : (attMax - attendance) * 10;
                return (
                  <tr key={r.id} className="border-t hover:bg-secondary/30">
                    <td className="p-2">
                      <div className="flex items-center gap-2 min-w-[150px]">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {String(r.student_name ?? "ن").charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{r.student_name || "بدون نام"}</span>
                      </div>
                    </td>
                    {items.map((item) => {
                      const v = getNajmItemValue(r, item);
                      if (item.item_key === NAJM_ATTENDANCE_KEY) {
                        const text = absent
                          ? "غایب"
                          : attendance >= attMax
                            ? "حاضر"
                            : `${convertJalaliDigits(lateMinutes ?? 0)} دقیقه تأخیر`;
                        return (
                          <td key={item.item_key} className="p-2 text-center">
                            <Badge variant="outline">{text}</Badge>
                            {absent && (
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                {najmAbsenceKindLabel(
                                  (r as { absence_kind?: string | null }).absence_kind,
                                )}
                              </div>
                            )}
                          </td>
                        );
                      }
                      if (item.kind === "special") {
                        return (
                          <td
                            key={item.item_key}
                            className={"p-2 text-center " + itemTdClass(item.kind)}
                          >
                            {v > 0 ? (
                              <Badge className="bg-gold text-gold-foreground">
                                {item.label} +{convertJalaliDigits(v)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">۰</span>
                            )}
                          </td>
                        );
                      }
                      if (item.kind === "negative") {
                        return (
                          <td
                            key={item.item_key}
                            className={"p-2 text-center text-rose-700 " + itemTdClass(item.kind)}
                          >
                            -{convertJalaliDigits(v * item.weight)}
                          </td>
                        );
                      }
                      // آیتم آزمون: مقدار خام نمایش داده می‌شود و ستون جداگانه‌ای
                      // برای نمره نمایشی (+۱۰) هست
                      return (
                        <td key={item.item_key} className="p-2 text-center">
                          {convertJalaliDigits(v)}
                        </td>
                      );
                    })}
                    {examItem && (
                      <td className="p-2 text-center font-bold text-emerald-700">
                        {absent
                          ? "—"
                          : convertJalaliDigits(examDisplay(getNajmItemValue(r, examItem)))}
                      </td>
                    )}
                    <td className="p-2 text-center">
                      <ScoreMini score={Number(r.session_score ?? 0)} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreMini({ score }: { score: number }) {
  return (
    <span className="inline-flex min-w-[3rem] justify-center rounded-full bg-gold/15 px-2 py-1 font-bold text-gold-foreground">
      {convertJalaliDigits(score)}
    </span>
  );
}

/* ----------------------------- ردیف دانش‌آموز ----------------------------- */
function StudentRow({
  student,
  items,
  rec,
  sessionId,
  disabled,
  onChange,
  onAbsenceKindChange,
  recoveryCases,
  recoverySelected,
  recoveryBonusPreview,
  onRecoveryToggle,
}: {
  student: StudentRow;
  items: NajmScoreItem[];
  rec: NajmRecordInput;
  sessionId: string | null;
  disabled: boolean;
  onChange: (item: NajmScoreItem, value: number) => void;
  onAbsenceKindChange: (kind: NajmAbsenceKind) => void;
  recoveryCases: ConductRecoveryCase[];
  recoverySelected: boolean;
  recoveryBonusPreview: number;
  onRecoveryToggle: () => void;
}) {
  const absent = isAbsent(rec.attendance);
  const score = computeSessionScoreWithItems(rec, items) + recoveryBonusPreview;
  return (
    <tr className="border-t hover:bg-secondary/30">
      <td className="p-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/15 text-primary text-xs">
              {student.name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{student.name}</span>
          <Link
            to="/teacher/achievements"
            title={`افتخارات و پیشنهاد نشان برای ${student.name}`}
            className="rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-700 transition hover:bg-amber-100"
          >
            <Trophy className="h-3.5 w-3.5" />
          </Link>
        </div>
      </td>
      <td className="p-1 text-center align-middle">
        <ConductRecoveryPanel
          cases={recoveryCases}
          selected={recoverySelected}
          disabled={disabled}
          appliedBonus={Math.max(0, Number(rec.recovery_bonus ?? 0) || 0)}
          historyAction={
            sessionId && Number(rec.recovery_bonus ?? 0) > 0 ? (
              <ConductRecoveryHistoryDialog
                studentId={student.id}
                sessionId={sessionId}
                recoveryBonus={Number(rec.recovery_bonus ?? 0)}
              />
            ) : null
          }
          onToggle={onRecoveryToggle}
        />
      </td>
      {items.map((item) => (
        <td key={item.item_key} className={"p-1 text-center " + itemTdClass(item.kind)}>
          <ScoreSelect
            value={getNajmItemValue(rec, item)}
            max={item.max_score}
            disabled={disabled || (absent && item.item_key !== NAJM_ATTENDANCE_KEY)}
            onChange={(v) => onChange(item, v)}
            danger={item.item_key === NAJM_ATTENDANCE_KEY && absent}
            negative={item.kind === "negative"}
          />
          {item.item_key === NAJM_ATTENDANCE_KEY && absent && (
            <Select
              value={normalizeAbsenceKind(rec.absence_kind)}
              onValueChange={(v) => onAbsenceKindChange(v as NajmAbsenceKind)}
              disabled={disabled}
            >
              <SelectTrigger className="mx-auto mt-1 h-7 w-[92px] border-rose-200 bg-rose-50/60 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NAJM_ABSENCE_KINDS.map((kind) => (
                  <SelectItem key={kind.value} value={kind.value} className="text-xs">
                    {kind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </td>
      ))}
      <td className="p-2 text-center">
        <span
          className={
            "inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-lg border text-sm font-bold " +
            scoreColor(score)
          }
        >
          {convertJalaliDigits(score)}
        </span>
        {Number(rec.recovery_bonus ?? 0) > 0 && (
          <span className="mt-1 block text-[10px] font-bold text-emerald-700">
            +{convertJalaliDigits(Number(rec.recovery_bonus ?? 0))} جبران ثبت‌شده
          </span>
        )}
        {recoveryBonusPreview > 0 && (
          <span className="mt-1 block text-[10px] font-bold text-amber-700">
            +{convertJalaliDigits(recoveryBonusPreview)} جبران انتخاب‌شده
          </span>
        )}
      </td>
    </tr>
  );
}

/* ----------------------------- انتخاب‌گر امتیاز ----------------------------- */
function ScoreSelect({
  value,
  max,
  disabled,
  onChange,
  negative,
  danger,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  negative?: boolean;
  danger?: boolean;
}) {
  const opts = [];
  for (let i = 0; i <= max; i++) opts.push(i);
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger
        className={
          "h-9 w-[68px] mx-auto " +
          (danger ? "border-rose-200 bg-rose-50" : negative ? "border-amber-200 bg-amber-50" : "")
        }
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o} value={String(o)}>
            {convertJalaliDigits(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ----------------------------- Label کوچک ----------------------------- */
function Label({ children }: { children: ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground block">{children}</label>;
}

/* ----------------------------- Toast ----------------------------- */
function SaveToast({ status, onClose }: { status: SaveStatus; onClose: () => void }) {
  const cfg =
    status.type === "success"
      ? {
          icon: <CheckCircle2 className="h-5 w-5 shrink-0" />,
          bg: "bg-emerald-600",
          ring: "ring-emerald-400",
        }
      : status.type === "error"
        ? {
            icon: <XCircle className="h-5 w-5 shrink-0" />,
            bg: "bg-rose-600",
            ring: "ring-rose-400",
          }
        : {
            icon: <Loader2 className="h-5 w-5 shrink-0 animate-spin" />,
            bg: "bg-amber-500",
            ring: "ring-amber-300",
          };
  return (
    <div className="fixed top-4 inset-x-0 z-[100] flex justify-center px-4 pointer-events-none">
      <div
        className={
          "pointer-events-auto min-w-[320px] max-w-md " +
          cfg.bg +
          " text-white px-4 py-3 rounded-xl shadow-2xl ring-1 " +
          cfg.ring +
          " flex items-start gap-3 toast-anim"
        }
      >
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">{status.message}</div>
          {status.details && <div className="text-xs opacity-90 mt-0.5">{status.details}</div>}
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white rounded-md p-1 -m-1">
          <XCircle className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const toastStyle = `
@keyframes fadeSlideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
.toast-anim { animation: fadeSlideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
`;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "۰:۰۰:۰۰";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
