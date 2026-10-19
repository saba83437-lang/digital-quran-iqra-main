// ============================================================
//  پنل استاد - نمرات و حضور و غیاب طرح نجم (کارت‌های خلاصه قابل کلیک)
//  جایگزین صفحه «نظرات / خوانش»
//  مسیر مقصد: src/routes/teacher.reviews.tsx
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  Star,
  UserX,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { getCurrentTeacher } from "@/lib/teacher-utils";
import { ConductRecoveryHistoryDialog } from "@/features/recitation/components/conduct-recovery-history-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/reviews")({
  head: () => ({
    meta: [
      { title: "نمرات و حضور و غیاب" },
      {
        name: "description",
        content: "تاریخچه نمرات و حضور و غیاب قرآن‌آموزان بر اساس جلسات ثبت‌شده طرح نجم",
      },
    ],
  }),
  component: TeacherNajmHistoryPage,
});

/* ----------------------------- انواع ----------------------------- */
interface ClassRow {
  id: string;
  name: string;
  level?: string | null;
}

interface StudentRow {
  id: string;
  name: string;
  class_id: string | null;
}

interface NajmSessionRow {
  id: string;
  class_id: string;
  class_name: string | null;
  session_date: string;
  term: string;
  academic_year: string;
  created_at: string;
}

interface NajmRecordRow {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string | null;
  is_absent: boolean | null;
  attendance: number | null;
  homework: number | null;
  exam_raw: number | null;
  discipline: number | null;
  special_progress: number | null;
  special_help: number | null;
  negative_disorder: number | null;
  negative_disrespect: number | null;
  recovery_bonus: number | null;
  session_score: number | null;
}

interface HistoryRow {
  session: NajmSessionRow;
  record: NajmRecordRow;
  className: string;
  studentName: string;
}

const ALL_CLASSES = "all";
const ALL_STUDENTS = "all";
const ALL_DATES = "all";
const ALL_TERMS = "all";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
type SummaryDetailKey = "present" | "late" | "absent" | "avgExam";

/* ----------------------------- helpers ----------------------------- */
function convertDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "ن";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0);
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
}

function examDisplay(record: NajmRecordRow): string {
  const attendance = toNumber(record.attendance);
  if (attendance === 0 || record.is_absent) return "—";
  return convertDigits(toNumber(record.exam_raw) + 10);
}

function attendanceInfo(attendanceValue: number | null | undefined) {
  const attendance = toNumber(attendanceValue);

  if (attendance >= 5) {
    return {
      label: "حاضر",
      detail: "بدون تأخیر",
      tone: "present" as const,
      minutes: 0,
    };
  }

  if (attendance <= 0) {
    return {
      label: "غایب",
      detail: "غیبت کامل",
      tone: "absent" as const,
      minutes: 50,
    };
  }

  const minutes = (5 - attendance) * 10;
  return {
    label: `${convertDigits(minutes)} دقیقه تأخیر`,
    detail: `حضور با ${convertDigits(minutes)} دقیقه تأخیر`,
    tone: "late" as const,
    minutes,
  };
}

function getTermLabel(term: string): string {
  if (term === "term1") return "ترم اول";
  if (term === "term2") return "ترم دوم";
  if (term === "summer") return "ترم تابستانی";
  return term || "—";
}

function classById(classes: ClassRow[], id: string): string {
  return classes.find((c) => c.id === id)?.name ?? "کلاس نامشخص";
}

/* ----------------------------- صفحه ----------------------------- */
function TeacherNajmHistoryPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [sessions, setSessions] = useState<NajmSessionRow[]>([]);
  const [records, setRecords] = useState<NajmRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState(ALL_CLASSES);
  const [selectedStudentId, setSelectedStudentId] = useState(ALL_STUDENTS);
  const [selectedTerm, setSelectedTerm] = useState(ALL_TERMS);
  const [selectedSessionDate, setSelectedSessionDate] = useState(ALL_DATES);
  const [search, setSearch] = useState("");
  const [activeSummary, setActiveSummary] = useState<SummaryDetailKey | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(showToast = false) {
    if (!showToast) setLoading(true);
    setRefreshing(true);

    const teacher = await getCurrentTeacher();
    if (!teacher) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("id, name, level")
      .eq("teacher_id", teacher.id)
      .order("name");

    if (classError) {
      toast.error("خطا در دریافت کلاس‌های استاد");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const classList = (classData ?? []) as ClassRow[];
    setClasses(classList);

    if (classList.length === 0) {
      setStudents([]);
      setSessions([]);
      setRecords([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const classIds = classList.map((c) => c.id);

    const [{ data: studentData }, { data: sessionData, error: sessionError }] = await Promise.all([
      supabase.from("students").select("id, name, class_id").in("class_id", classIds).order("name"),
      supabase
        .from("najm_sessions")
        .select("id, class_id, class_name, session_date, term, academic_year, created_at")
        .in("class_id", classIds)
        .order("created_at", { ascending: false })
        .limit(3000),
    ]);

    if (sessionError) {
      toast.error("خطا در دریافت جلسات طرح نجم");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const studentList = (studentData ?? []) as StudentRow[];
    const sessionList = (sessionData ?? []) as NajmSessionRow[];
    setStudents(studentList);
    setSessions(sessionList);

    const sessionIds = sessionList.map((session) => session.id);
    if (sessionIds.length === 0) {
      setRecords([]);
      setLoading(false);
      setRefreshing(false);
      if (showToast) toast.success("اطلاعات به‌روزرسانی شد.");
      return;
    }

    const { data: recordData, error: recordError } = await supabase
      .from("najm_session_records")
      .select(
        "id, session_id, student_id, student_name, is_absent, attendance, homework, exam_raw, discipline, special_progress, special_help, negative_disorder, negative_disrespect, recovery_bonus, session_score",
      )
      .in("session_id", sessionIds)
      .limit(20000);

    if (recordError) {
      toast.error("خطا در دریافت نمرات و حضور و غیاب");
    } else {
      setRecords((recordData ?? []) as NajmRecordRow[]);
    }

    if (showToast) toast.success("تاریخچه نمرات و حضور و غیاب به‌روزرسانی شد.");
    setLoading(false);
    setRefreshing(false);
  }

  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const selectedClassName = useMemo(() => {
    if (selectedClassId === ALL_CLASSES) return "";
    return classById(classes, selectedClassId);
  }, [classes, selectedClassId]);

  const rows = useMemo<HistoryRow[]>(() => {
    return records
      .map((record) => {
        const session = sessionById.get(record.session_id);
        if (!session) return null;
        const student = studentById.get(record.student_id);
        return {
          session,
          record,
          className: session.class_name || classById(classes, session.class_id),
          studentName: record.student_name || student?.name || "بدون نام",
        };
      })
      .filter((row): row is HistoryRow => Boolean(row));
  }, [classes, records, sessionById, studentById]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesClass =
        selectedClassId === ALL_CLASSES ||
        String(row.session.class_id) === String(selectedClassId) ||
        (!!selectedClassName && row.className === selectedClassName);
      const matchesStudent =
        selectedStudentId === ALL_STUDENTS ||
        String(row.record.student_id) === String(selectedStudentId);
      const matchesTerm = selectedTerm === ALL_TERMS || row.session.term === selectedTerm;
      const matchesDate =
        selectedSessionDate === ALL_DATES || row.session.session_date === selectedSessionDate;
      const matchesSearch =
        !q ||
        row.studentName.toLowerCase().includes(q) ||
        row.className.toLowerCase().includes(q) ||
        row.session.session_date.includes(q);
      return matchesClass && matchesStudent && matchesTerm && matchesDate && matchesSearch;
    });
  }, [
    rows,
    search,
    selectedClassId,
    selectedClassName,
    selectedStudentId,
    selectedTerm,
    selectedSessionDate,
  ]);

  const filteredStudents = useMemo(() => {
    if (selectedClassId === ALL_CLASSES) return students;
    return students.filter((student) => String(student.class_id) === String(selectedClassId));
  }, [selectedClassId, students]);

  const dateOptions = useMemo(() => {
    return Array.from(new Set(sessions.map((session) => session.session_date))).sort((a, b) =>
      b.localeCompare(a),
    );
  }, [sessions]);

  const termOptions = useMemo(() => {
    return Array.from(new Set(sessions.map((session) => session.term).filter(Boolean)));
  }, [sessions]);

  const summaryRows = useMemo(() => {
    const baseRows = rows.filter((row) => {
      const matchesClass =
        selectedClassId === ALL_CLASSES ||
        String(row.session.class_id) === String(selectedClassId) ||
        (!!selectedClassName && row.className === selectedClassName);
      const matchesStudent =
        selectedStudentId === ALL_STUDENTS ||
        String(row.record.student_id) === String(selectedStudentId);
      const matchesTerm = selectedTerm === ALL_TERMS || row.session.term === selectedTerm;
      const matchesDate =
        selectedSessionDate === ALL_DATES || row.session.session_date === selectedSessionDate;
      return matchesClass && matchesStudent && matchesTerm && matchesDate;
    });

    if (baseRows.length === 0) return [];
    if (selectedSessionDate !== ALL_DATES) return baseRows;

    const latestDate = [...baseRows].sort((a, b) => {
      const createdCompare = String(b.session.created_at ?? "").localeCompare(
        String(a.session.created_at ?? ""),
      );
      if (createdCompare !== 0) return createdCompare;
      return String(b.session.session_date ?? "").localeCompare(
        String(a.session.session_date ?? ""),
      );
    })[0]?.session.session_date;

    return latestDate ? baseRows.filter((row) => row.session.session_date === latestDate) : [];
  }, [
    rows,
    selectedClassId,
    selectedClassName,
    selectedStudentId,
    selectedTerm,
    selectedSessionDate,
  ]);

  const groupedFilteredRows = useMemo(() => {
    const map = new Map<string, { classId: string; className: string; rows: HistoryRow[] }>();
    for (const row of filteredRows) {
      const key = row.session.class_id || row.className;
      const current = map.get(key) ?? {
        classId: row.session.class_id,
        className: row.className,
        rows: [],
      };
      current.rows.push(row);
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => a.className.localeCompare(b.className, "fa"));
  }, [filteredRows]);

  const summary = useMemo(() => {
    const present = summaryRows.filter((row) => toNumber(row.record.attendance) >= 5).length;
    const late = summaryRows.filter((row) => {
      const value = toNumber(row.record.attendance);
      return value > 0 && value < 5;
    }).length;
    const absent = summaryRows.filter(
      (row) => toNumber(row.record.attendance) === 0 || row.record.is_absent,
    ).length;
    const graded = summaryRows.filter(
      (row) => !(toNumber(row.record.attendance) === 0 || row.record.is_absent),
    );
    const avgExam =
      graded.length > 0
        ? Math.round(
            (graded.reduce((sum, row) => sum + toNumber(row.record.exam_raw) + 10, 0) /
              graded.length) *
              10,
          ) / 10
        : null;
    const latestDate = summaryRows[0]?.session.session_date ?? null;
    const latestClassesCount = new Set(summaryRows.map((row) => row.session.class_id)).size;

    return { present, late, absent, avgExam, latestDate, latestClassesCount };
  }, [summaryRows]);

  const summaryDetailRows = useMemo(
    () => ({
      present: summaryRows.filter((row) => toNumber(row.record.attendance) >= 5),
      late: summaryRows.filter((row) => {
        const value = toNumber(row.record.attendance);
        return value > 0 && value < 5;
      }),
      absent: summaryRows.filter(
        (row) => toNumber(row.record.attendance) === 0 || row.record.is_absent,
      ),
      avgExam: summaryRows.filter(
        (row) => !(toNumber(row.record.attendance) === 0 || row.record.is_absent),
      ),
    }),
    [summaryRows],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری نمرات و حضور و غیاب...</span>
      </div>
    );
  }

  return (
    <>
      <style>{historyStyle}</style>
      <div className="teacher-history-page space-y-6" dir="rtl">
        <section className="history-hero relative overflow-hidden rounded-[2rem] p-5 md:p-6 text-white shadow-xl">
          <div className="history-pattern absolute inset-0 opacity-30" />
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-[#D4AF37]/25 blur-3xl" />
          <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-[#10B981]/18 blur-3xl" />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/12 text-[#D4AF37] ring-1 ring-white/20 backdrop-blur-sm">
                <CalendarCheck className="h-8 w-8" />
              </div>
              <div>
                <Badge className="mb-2 border-[#D4AF37]/30 bg-white/10 text-amber-100 hover:bg-white/15">
                  ثبت‌شده از طریق طرح نجم
                </Badge>
                <h1 className="font-display text-2xl font-black md:text-4xl">
                  نمرات و حضور و غیاب
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-emerald-50/75">
                  تاریخچه همه جلسات ثبت‌شده، با نمایش نمره آزمون به صورت خام + ۱۰؛ کارت‌های خلاصه
                  مربوط به همه کلاس‌های آخرین روز ثبت‌شده هستند.
                </p>
              </div>
            </div>

            <Button
              onClick={() => loadData(true)}
              disabled={refreshing}
              variant="secondary"
              className="w-fit gap-2 rounded-2xl bg-[#D4AF37] text-emerald-950 hover:bg-[#D4AF37]/90"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              به‌روزرسانی
            </Button>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            title="حاضر"
            value={summary.present}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="green"
            onClick={() => setActiveSummary("present")}
          />
          <SummaryCard
            title="تأخیر"
            value={summary.late}
            icon={<Clock3 className="h-5 w-5" />}
            tone="gold"
            onClick={() => setActiveSummary("late")}
          />
          <SummaryCard
            title="غایب"
            value={summary.absent}
            icon={<UserX className="h-5 w-5" />}
            tone="danger"
            onClick={() => setActiveSummary("absent")}
          />
          <SummaryCard
            title="میانگین نمره"
            value={summary.avgExam === null ? "—" : convertDigits(summary.avgExam)}
            icon={<GraduationCap className="h-5 w-5" />}
            tone="gold"
            onClick={() => setActiveSummary("avgExam")}
          />
        </div>

        <Card className="history-filter-card p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              آمار کارت‌های بالا بر اساس آخرین روز مطابق فیلترهای انتخاب‌شده است.
            </div>
            <Badge
              variant="outline"
              className="w-fit border-[#D4AF37]/30 bg-amber-50 text-[#7A5B10]"
            >
              {summary.latestDate
                ? `${convertDigits(summary.latestDate)} • ${convertDigits(summary.latestClassesCount)} کلاس`
                : "جلسه‌ای ثبت نشده"}
            </Badge>
          </div>
        </Card>

        <Card className="history-filter-card p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="space-y-1.5">
              <Label>کلاس</Label>
              <Select
                value={selectedClassId}
                onValueChange={(value) => {
                  setSelectedClassId(value);
                  setSelectedStudentId(ALL_STUDENTS);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLASSES}>همه کلاس‌ها</SelectItem>
                  {classes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>قرآن‌آموز</Label>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STUDENTS}>همه قرآن‌آموزان</SelectItem>
                  {filteredStudents.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>ترم</Label>
              <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TERMS}>همه ترم‌ها</SelectItem>
                  {termOptions.map((term) => (
                    <SelectItem key={term} value={term}>
                      {getTermLabel(term)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>تاریخ جلسه</Label>
              <Select value={selectedSessionDate} onValueChange={setSelectedSessionDate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DATES}>همه تاریخ‌ها</SelectItem>
                  {dateOptions.map((date) => (
                    <SelectItem key={date} value={date}>
                      {convertDigits(date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>جستجو</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="نام قرآن‌آموز، کلاس یا تاریخ..."
                  className="pr-9"
                />
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display text-lg font-black text-emerald-950">
                تاریخچه جلسات ثبت‌شده
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                اطلاعات هر کلاس در جدول جداگانه نمایش داده می‌شود.
              </p>
            </div>
            <Badge variant="outline" className="border-[#D4AF37]/30 bg-amber-50 text-[#7A5B10]">
              {convertDigits(filteredRows.length)} رکورد
            </Badge>
          </div>

          {groupedFilteredRows.length === 0 ? (
            <Card className="history-table-card p-8 text-center text-muted-foreground">
              رکوردی برای نمایش وجود ندارد.
            </Card>
          ) : (
            groupedFilteredRows.map((group) => (
              <ClassHistoryTable
                key={group.classId || group.className}
                className={group.className}
                rows={group.rows}
              />
            ))
          )}
        </div>

        <SummaryDetailDialog
          open={activeSummary !== null}
          onOpenChange={(open) => !open && setActiveSummary(null)}
          activeSummary={activeSummary}
          rows={activeSummary ? summaryDetailRows[activeSummary] : []}
          summary={summary}
        />
      </div>
    </>
  );
}

/* ----------------------------- components ----------------------------- */
function SummaryDetailDialog({
  open,
  onOpenChange,
  activeSummary,
  rows,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSummary: SummaryDetailKey | null;
  rows: HistoryRow[];
  summary: {
    present: number;
    late: number;
    absent: number;
    avgExam: number | null;
    latestDate: string | null;
    latestClassesCount: number;
  };
}) {
  const titleMap: Record<SummaryDetailKey, string> = {
    present: "جزئیات حاضرها",
    late: "جزئیات تأخیرها",
    absent: "جزئیات غایبین",
    avgExam: "جزئیات نمرات آخرین جلسه",
  };

  const description = summary.latestDate
    ? `تاریخ ${convertDigits(summary.latestDate)} • ${convertDigits(summary.latestClassesCount)} کلاس`
    : "جلسه‌ای ثبت نشده است";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{activeSummary ? titleMap[activeSummary] : "جزئیات"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {activeSummary === "avgExam" && (
          <Card className="p-4 bg-amber-50/70 border-[#D4AF37]/20">
            <div className="text-sm text-muted-foreground">میانگین نمره این مجموعه</div>
            <div className="mt-1 font-display text-3xl font-black text-emerald-950">
              {summary.avgExam === null ? "—" : convertDigits(summary.avgExam)}
            </div>
          </Card>
        )}

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            موردی برای نمایش وجود ندارد.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const attendance = attendanceInfo(row.record.attendance);
              return (
                <div
                  key={`${row.session.id}-${row.record.id}`}
                  className="rounded-2xl border bg-card p-3"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-emerald-50 text-emerald-700 text-xs">
                          {initials(row.studentName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {row.studentName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {row.className} • {convertDigits(row.session.session_date)} •{" "}
                          {getTermLabel(row.session.term)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{attendance.label}</Badge>
                      <Badge
                        variant="outline"
                        className="border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#7A5B10]"
                      >
                        نمره: {examDisplay(row.record)}
                      </Badge>
                      {toNumber(row.record.recovery_bonus) > 0 && (
                        <ConductRecoveryHistoryDialog
                          studentId={row.record.student_id}
                          sessionId={row.session.id}
                          recoveryBonus={toNumber(row.record.recovery_bonus)}
                        />
                      )}
                      <Badge
                        variant="outline"
                        className="border-emerald-100 bg-emerald-50 text-emerald-700"
                      >
                        امتیاز جلسه: {convertDigits(toNumber(row.record.session_score))}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-medium text-muted-foreground">{children}</label>;
}

function SummaryCard({
  title,
  value,
  icon,
  tone,
  onClick,
}: {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  tone: "green" | "gold" | "danger";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "green"
      ? "from-emerald-100 to-teal-50 text-emerald-800"
      : tone === "gold"
        ? "from-[#D4AF37]/18 to-amber-50 text-[#7A5B10]"
        : "from-rose-100 to-orange-50 text-rose-800";

  return (
    <Card
      onClick={onClick}
      className="history-summary-card relative overflow-hidden p-4 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="history-card-pattern absolute inset-0 opacity-25" />
      <div className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className="mt-2 font-display text-3xl font-black text-emerald-950">
            {typeof value === "number" ? convertDigits(value) : value}
          </div>
        </div>
        <div className={`rounded-2xl bg-gradient-to-br ${toneClass} p-3 shadow-sm`}>{icon}</div>
      </div>
    </Card>
  );
}

function ClassHistoryTable({ className, rows }: { className: string; rows: HistoryRow[] }) {
  return (
    <Card className="history-table-card overflow-hidden">
      <div className="border-b bg-[#064E3B] px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-black">{className}</h3>
            <p className="mt-1 text-xs text-emerald-50/75">
              تاریخچه نمرات و حضور و غیاب ثبت‌شده از طریق طرح نجم
            </p>
          </div>
          <Badge className="bg-white/10 text-white border-white/20">
            {convertDigits(rows.length)} رکورد
          </Badge>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-emerald-50 text-emerald-950/70">
              <th className="p-3 text-right">تاریخ</th>
              <th className="p-3 text-right">قرآن‌آموز</th>
              <th className="p-3 text-center">حضور</th>
              <th className="p-3 text-center">نمره آزمون</th>
              <th className="p-3 text-center">جبران</th>
              <th className="p-3 text-center">امتیاز جلسه</th>
              <th className="p-3 text-center">ترم</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <HistoryTableRow key={`${row.session.id}-${row.record.id}`} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function HistoryTableRow({ row }: { row: HistoryRow }) {
  const attendance = attendanceInfo(row.record.attendance);

  const attendanceClass =
    attendance.tone === "present"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : attendance.tone === "late"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-rose-50 text-rose-700 border-rose-100";

  return (
    <tr className="border-t hover:bg-emerald-50/40 transition-colors">
      <td className="p-3 whitespace-nowrap">{convertDigits(row.session.session_date)}</td>
      <td className="p-3">
        <div className="flex items-center gap-2 min-w-[160px]">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-emerald-50 text-emerald-700 text-xs">
              {initials(row.studentName)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{row.studentName}</span>
        </div>
      </td>
      <td className="p-3 text-center">
        <Badge variant="outline" className={attendanceClass}>
          {attendance.label}
        </Badge>
        <div className="mt-1 text-[11px] text-muted-foreground">{attendance.detail}</div>
      </td>
      <td className="p-3 text-center">
        <span className="inline-flex min-w-[3rem] justify-center rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 font-display font-bold text-[#7A5B10]">
          {examDisplay(row.record)}
        </span>
      </td>
      <td className="p-3 text-center">
        {toNumber(row.record.recovery_bonus) > 0 ? (
          <ConductRecoveryHistoryDialog
            studentId={row.record.student_id}
            sessionId={row.session.id}
            recoveryBonus={toNumber(row.record.recovery_bonus)}
          />
        ) : (
          "—"
        )}
      </td>
      <td className="p-3 text-center font-display font-bold text-emerald-800">
        {convertDigits(toNumber(row.record.session_score))}
      </td>
      <td className="p-3 text-center text-muted-foreground whitespace-nowrap">
        {getTermLabel(row.session.term)}
      </td>
    </tr>
  );
}

const historyStyle = `
.teacher-history-page {
  --history-green: #064E3B;
  --history-gold: #D4AF37;
}
.history-hero {
  background:
    radial-gradient(circle at 15% 20%, rgba(212, 175, 55, 0.28), transparent 30%),
    radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.18), transparent 28%),
    linear-gradient(135deg, #064E3B 0%, #065F46 48%, #047857 100%);
}
.history-pattern,
.history-card-pattern {
  background-image:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,.22) 0 2px, transparent 2.8px),
    linear-gradient(45deg, transparent 0 48%, rgba(255,255,255,.10) 49% 50%, transparent 51%);
  background-size: 72px 72px, 36px 36px;
}
.history-summary-card,
.history-filter-card,
.history-table-card {
  border: 1px solid rgba(212, 175, 55, 0.16);
  background: linear-gradient(135deg, #ffffff, #FFF8E7 120%);
  border-radius: 1.75rem;
}
`;
