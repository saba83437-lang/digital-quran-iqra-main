// ============================================================
//  پنل استاد - قرآن‌آموزان من (پروفایل شیک + شماره قرآن‌آموز)
//  مسیر مقصد: src/routes/teacher.students.tsx
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Search,
  GraduationCap,
  Calendar,
  Award,
  TrendingUp,
  Phone,
  Sparkles,
  Loader2,
  User,
  Filter,
  Users,
  BookOpen,
  UserCheck,
  UserX,
  Clock3,
  Star,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/lib/supabase";
import { getCurrentTeacher } from "@/lib/teacher-utils";
import { loadSecureTeacherStudents } from "@/features/identity/api/secure-identity-api";

export const Route = createFileRoute("/teacher/students")({
  head: () => ({
    meta: [
      { title: "قرآن‌آموزان من — بِرّ الوالدین" },
      { name: "description", content: "فهرست قرآن‌آموزان کلاس‌های استاد" },
    ],
  }),
  component: StudentsPage,
});

/* ------------------------------------------------------------------ */
/*  Constants & Helpers                                                */
/* ------------------------------------------------------------------ */
const PERSIAN_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

function toEnglishDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "");
}

function currentPersianMonth(): string {
  try {
    const raw = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      month: "long",
    }).format(new Date());
    const normalized = normalizeText(raw);
    return PERSIAN_MONTHS.find((m) => normalizeText(m) === normalized) ?? "فروردین";
  } catch {
    return "فروردین";
  }
}

function extractMonthNumber(dateText: string | null | undefined): number {
  if (!dateText) return 0;
  const normalized = toEnglishDigits(String(dateText).trim());

  const slashParts = normalized.split("/");
  if (slashParts.length >= 2) {
    const m = parseInt(slashParts[1], 10);
    return Number.isFinite(m) ? m : 0;
  }

  const dashParts = normalized.split("-");
  if (dashParts.length >= 2) {
    const m = parseInt(dashParts[1], 10);
    return Number.isFinite(m) ? m : 0;
  }

  return 0;
}

function monthNumberFromName(monthName: string): number {
  return PERSIAN_MONTHS.findIndex((m) => normalizeText(m) === normalizeText(monthName)) + 1;
}

function normalizeStatus(status: string | null | undefined): string {
  const s = normalizeText(status).toLowerCase();
  if (s === "present" || s === "حاضر" || s === "حضور") return "present";
  if (s === "late" || s === "تاخیر" || s === "تأخیر") return "late";
  if (s === "absent" || s === "غایب" || s === "غیبت") return "absent";
  return s;
}

function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("fa-IR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function initials(name: string): string {
  const clean = normalizeText(name);
  if (!clean) return "ق";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0);
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
}

function extractStudentPhone(row: Record<string, any>): string {
  const possibleKeys = [
    "phone",
    "student_phone",
    "studentPhone",
    "mobile",
    "mobile_phone",
    "mobilePhone",
    "tel",
    "telephone",
    "contact_phone",
    "contactPhone",
  ];

  for (const key of possibleKeys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function gradeTone(avg: number | null | undefined): string {
  if (avg == null) return "text-muted-foreground";
  if (avg >= 18) return "text-emerald-700";
  if (avg >= 15) return "text-amber-700";
  return "text-rose-700";
}

function attendanceTone(rate: number | null | undefined): string {
  if (rate == null) return "bg-muted";
  if (rate >= 90) return "bg-emerald-500";
  if (rate >= 75) return "bg-amber-500";
  return "bg-rose-500";
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface StudentRow {
  id: string;
  name: string;
  level: string;
  class_id: string;
  parent_name: string;
  parent_phone: string;
  phone: string;
  attendance_rate: number | null;
  average_grade: number | null;
  avatar_url?: string | null;
}

interface AttendanceRecord {
  student_id: string;
  date: string;
  status: string;
}

interface GradeRecord {
  student_id: string;
  subject: string;
  date: string;
  grade: number;
  feedback?: string | null;
  month?: string | null;
}

interface MonthlyStats {
  averageGrade: number | null;
  gradesCount: number;
  attendanceRate: number | null;
  attendanceTotal: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
function StudentsPage() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<Record<string, string>>({});

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState<string>(currentPersianMonth());

  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [allGrades, setAllGrades] = useState<GradeRecord[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileGrades, setProfileGrades] = useState<GradeRecord[]>([]);
  const [profileAttendance, setProfileAttendance] = useState<AttendanceRecord[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const teacher = await getCurrentTeacher();
        if (!teacher) return;

        const { data: clsData } = await supabase
          .from("classes")
          .select("id, name")
          .eq("teacher_id", teacher.id)
          .order("name");

        const classMap: Record<string, string> = {};
        (clsData ?? []).forEach((c: any) => {
          classMap[String(c.id)] = c.name ?? "بدون نام";
        });

        const classIds = Object.keys(classMap);

        if (classIds.length === 0) {
          if (!cancelled) {
            setClasses(classMap);
            setStudents([]);
            setAllAttendance([]);
            setAllGrades([]);
          }
          return;
        }

        const secureStudents = await loadSecureTeacherStudents();
        const stuData = secureStudents.filter((student) =>
          classIds.includes(String(student.class_id ?? "")),
        );

        const normalizedStudents: StudentRow[] = stuData.map((s: any) => ({
          id: String(s.id),
          name: s.name ?? "",
          level: s.level ?? "",
          class_id: String(s.class_id),
          parent_name: s.parent_name ?? "",
          parent_phone: s.parent_phone ?? "",
          phone: extractStudentPhone(s),
          attendance_rate: s.attendance_rate ?? null,
          average_grade: s.average_grade ?? null,
          avatar_url: s.avatar_url ?? null,
        }));

        const studentIds = normalizedStudents.map((s) => s.id);

        let attRows: AttendanceRecord[] = [];
        let gradeRows: GradeRecord[] = [];

        if (studentIds.length > 0) {
          const [attRes, gradeRes] = await Promise.all([
            supabase.from("attendance").select("student_id, date, status").in("student_id", studentIds),
            supabase
              .from("grades")
              .select("student_id, subject, date, grade, feedback, month")
              .in("student_id", studentIds),
          ]);

          attRows = (attRes.data ?? []).map((a: any) => ({
            student_id: String(a.student_id),
            date: a.date ?? "",
            status: a.status ?? "",
          }));

          gradeRows = (gradeRes.data ?? []).map((g: any) => ({
            student_id: String(g.student_id),
            subject: g.subject ?? "",
            date: g.date ?? "",
            grade: g.grade == null ? 0 : Number(g.grade),
            feedback: g.feedback ?? null,
            month: g.month ?? null,
          }));
        }

        if (!cancelled) {
          setClasses(classMap);
          setStudents(normalizedStudents);
          setAllAttendance(attRows);
          setAllGrades(gradeRows);
        }
      } catch (err) {
        console.error("خطا در بارگذاری:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const targetMonth = useMemo(() => {
    if (monthFilter === "all") return null;
    const n = monthNumberFromName(monthFilter);
    return n > 0 ? n : null;
  }, [monthFilter]);

  function isAttInMonth(rec: AttendanceRecord): boolean {
    if (!targetMonth) return true;
    return extractMonthNumber(rec.date) === targetMonth;
  }

  function isGradeInMonth(rec: GradeRecord): boolean {
    if (!targetMonth) return true;
    if (rec.month && normalizeText(rec.month) === normalizeText(monthFilter)) return true;
    return extractMonthNumber(rec.date) === targetMonth;
  }

  const statsByStudent = useMemo<Record<string, MonthlyStats>>(() => {
    const result: Record<string, MonthlyStats> = {};

    for (const stu of students) {
      const sid = stu.id;

      const stuAtt = allAttendance.filter((a) => a.student_id === sid && isAttInMonth(a));

      let present = 0;
      let late = 0;
      let absent = 0;

      for (const a of stuAtt) {
        const st = normalizeStatus(a.status);
        if (st === "present") present++;
        else if (st === "late") late++;
        else if (st === "absent") absent++;
      }

      const total = present + late + absent;
      const rate = total > 0 ? ((present + late) / total) * 100 : null;

      const stuGrades = allGrades
        .filter((g) => g.student_id === sid && isGradeInMonth(g))
        .map((g) => g.grade)
        .filter((v) => Number.isFinite(v));

      const avg = stuGrades.length > 0 ? stuGrades.reduce((a, b) => a + b, 0) / stuGrades.length : null;

      result[sid] = {
        averageGrade: avg,
        gradesCount: stuGrades.length,
        attendanceRate: rate,
        attendanceTotal: total,
        presentCount: present,
        lateCount: late,
        absentCount: absent,
      };
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, allAttendance, allGrades, monthFilter, targetMonth]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);

    return students.filter((s) => {
      if (classFilter !== "all" && String(s.class_id) !== classFilter) return false;

      if (q) {
        const matchName = normalizeText(s.name).includes(q);
        const matchParent = normalizeText(s.parent_name).includes(q);
        const matchPhone = normalizeText(s.parent_phone).includes(q);
        const matchStudentPhone = normalizeText(s.phone).includes(q);
        if (!matchName && !matchParent && !matchPhone && !matchStudentPhone) return false;
      }

      return true;
    });
  }, [students, classFilter, search]);

  const selectedStudent = students.find((s) => s.id === selectedId) ?? null;
  const selectedStats = selectedStudent ? statsByStudent[selectedStudent.id] : null;

  const openProfile = async (studentId: string) => {
    setSelectedId(studentId);
    setLoadingProfile(true);

    try {
      const [gRes, aRes] = await Promise.all([
        supabase
          .from("grades")
          .select("student_id, subject, date, grade, feedback, month")
          .eq("student_id", studentId)
          .order("date", { ascending: false }),
        supabase
          .from("attendance")
          .select("student_id, date, status")
          .eq("student_id", studentId)
          .order("date", { ascending: false }),
      ]);

      setProfileGrades(
        (gRes.data ?? []).map((g: any) => ({
          student_id: String(g.student_id),
          subject: g.subject ?? "",
          date: g.date ?? "",
          grade: g.grade == null ? 0 : Number(g.grade),
          feedback: g.feedback ?? null,
          month: g.month ?? null,
        })),
      );

      setProfileAttendance(
        (aRes.data ?? []).map((a: any) => ({
          student_id: String(a.student_id),
          date: a.date ?? "",
          status: a.status ?? "",
        })),
      );
    } catch (err) {
      console.error(err);
      setProfileGrades([]);
      setProfileAttendance([]);
    } finally {
      setLoadingProfile(false);
    }
  };

  const filteredProfileGrades = useMemo(
    () => profileGrades.filter((g) => isGradeInMonth(g)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileGrades, monthFilter, targetMonth],
  );

  const filteredProfileAttendance = useMemo(
    () => profileAttendance.filter((a) => isAttInMonth(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileAttendance, monthFilter, targetMonth],
  );

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
      <style>{studentsStyle}</style>
      <PageHeader
        title="قرآن‌آموزان من"
        description="فهرست کامل قرآن‌آموزان کلاس‌های شما — آمار جدول بر اساس ماه انتخاب‌شده محاسبه می‌شود."
      />

      <Card className="students-shell overflow-hidden p-5 shadow-card">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="relative max-w-xs flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="جستجوی قرآن‌آموز..."
              className="pr-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />

            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="کلاس" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه کلاس‌ها</SelectItem>
                {Object.entries(classes).map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-[135px]">
                <SelectValue placeholder="ماه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه ماه‌ها</SelectItem>
                {PERSIAN_MONTHS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Badge variant="secondary" className="text-xs">
              {filtered.length.toLocaleString("fa-IR")} قرآن‌آموز
            </Badge>
          </div>
        </div>

        <div className="mb-3 text-xs text-muted-foreground">
          آمار نمایش‌داده‌شده مربوط به{" "}
          <span className="font-semibold text-primary">
            {monthFilter === "all" ? "کل دوره" : `ماه ${monthFilter}`}
          </span>{" "}
          است.
        </div>

        <div className="rounded-2xl border border-border overflow-x-auto" dir="rtl">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="w-10 text-center">ردیف</TableHead>
                <TableHead className="text-right">قرآن‌آموز</TableHead>
                <TableHead className="text-right">کلاس</TableHead>
                <TableHead className="text-center">میانگین نمره {monthFilter !== "all" && `${monthFilter}`}</TableHead>
                <TableHead className="text-center">درصد حضور {monthFilter !== "all" && `${monthFilter}`}</TableHead>
                <TableHead className="text-center">غیبت {monthFilter === "all" ? "کل" : monthFilter}</TableHead>
                <TableHead className="text-center">تعداد نمره</TableHead>
                <TableHead className="text-center">جلسات</TableHead>
                <TableHead className="text-right">ولی</TableHead>
                <TableHead className="text-center">جزئیات</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((student, idx) => {
                const stats = statsByStudent[student.id];
                const avg = stats?.averageGrade ?? null;
                const rate = stats?.attendanceRate ?? null;
                const absentCnt = stats?.absentCount ?? 0;
                const gradesCnt = stats?.gradesCount ?? 0;
                const attTotal = stats?.attendanceTotal ?? 0;

                return (
                  <TableRow
                    key={student.id}
                    className="cursor-pointer hover:bg-secondary/30"
                    onClick={() => openProfile(student.id)}
                  >
                    <TableCell className="text-sm text-muted-foreground text-center">
                      {(idx + 1).toLocaleString("fa-IR")}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0 ring-2 ring-primary/10">
                          {student.avatar_url ? <AvatarImage src={student.avatar_url} /> : null}
                          <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                            {initials(student.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm text-primary hover:underline">
                            {student.name || "بدون نام"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{student.level || "—"}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {classes[student.class_id] ?? "—"}
                    </TableCell>

                    <TableCell className="text-center">
                      {avg === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          <span className={`font-semibold ${gradeTone(avg)}`}>{fmt(avg)}</span>
                          <span className="text-muted-foreground text-xs"> / ۲۰</span>
                        </>
                      )}
                    </TableCell>

                    <TableCell>
                      {rate === null ? (
                        <div className="text-center text-muted-foreground">—</div>
                      ) : (
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                            <div
                              className={`h-full ${attendanceTone(rate)}`}
                              style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold">٪{fmt(rate, 0)}</span>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      <span
                        className={`font-semibold ${
                          absentCnt === 0 ? "text-emerald-600" : absentCnt <= 2 ? "text-amber-700" : "text-rose-600"
                        }`}
                      >
                        {absentCnt.toLocaleString("fa-IR")}
                      </span>
                    </TableCell>

                    <TableCell className="text-center text-sm">{gradesCnt > 0 ? gradesCnt.toLocaleString("fa-IR") : "—"}</TableCell>
                    <TableCell className="text-center text-sm">{attTotal > 0 ? attTotal.toLocaleString("fa-IR") : "—"}</TableCell>
                    <TableCell className="text-sm">{student.parent_name || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-primary">
                        مشاهده
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    قرآن‌آموزی با این فیلتر پیدا نشد.
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSearch("");
                          setClassFilter("all");
                          setMonthFilter(currentPersianMonth());
                        }}
                      >
                        پاک کردن فیلترها
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <StudentProfileDialog
        open={!!selectedId}
        onOpenChange={() => setSelectedId(null)}
        student={selectedStudent}
        classes={classes}
        monthFilter={monthFilter}
        stats={selectedStats}
        loading={loadingProfile}
        grades={filteredProfileGrades}
        attendance={filteredProfileAttendance}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Profile Dialog                                                     */
/* ------------------------------------------------------------------ */
function StudentProfileDialog({
  open,
  onOpenChange,
  student,
  classes,
  monthFilter,
  stats,
  loading,
  grades,
  attendance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentRow | null;
  classes: Record<string, string>;
  monthFilter: string;
  stats: MonthlyStats | null;
  loading: boolean;
  grades: GradeRecord[];
  attendance: AttendanceRecord[];
}) {
  if (!student) {
    return <Dialog open={open} onOpenChange={onOpenChange} />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0" dir="rtl">
        <DialogHeader className="sr-only">
          <DialogTitle>پروفایل آموزشی {student.name}</DialogTitle>
          <DialogDescription>جزئیات آموزشی، نمرات و حضور و غیاب قرآن‌آموز</DialogDescription>
        </DialogHeader>

        <div className="student-profile-dialog overflow-hidden rounded-lg">
          <section className="profile-hero relative overflow-hidden p-6 md:p-7 text-white">
            <div className="profile-pattern absolute inset-0 opacity-35" />
            <div className="absolute -top-20 -left-16 h-64 w-64 rounded-full bg-[#D4AF37]/25 blur-3xl" />
            <div className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-[#10B981]/18 blur-3xl" />

            <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-5 min-w-0">
                <Avatar className="h-24 w-24 shrink-0 ring-4 ring-white/80 shadow-xl">
                  {student.avatar_url ? <AvatarImage src={student.avatar_url} /> : null}
                  <AvatarFallback className="bg-gradient-to-br from-amber-100 to-emerald-50 text-emerald-800 text-3xl font-black font-display">
                    {initials(student.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                  <Badge className="mb-2 bg-[#D4AF37] text-emerald-950 border-0 gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    پروفایل آموزشی
                  </Badge>
                  <h3 className="font-display text-2xl md:text-3xl font-black truncate">{student.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge className="bg-white/15 text-white border-0">
                      <GraduationCap className="h-3.5 w-3.5 ml-1" />
                      {student.level || "بدون سطح"}
                    </Badge>
                    <Badge className="bg-white/15 text-white border-0">{classes[student.class_id] ?? "—"}</Badge>
                    <Badge className="bg-white/15 text-white border-0">
                      {monthFilter === "all" ? "همه ماه‌ها" : `ماه ${monthFilter}`}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 min-w-[260px]">
                <MiniProfileStat label="میانگین" value={stats?.averageGrade == null ? "—" : `${fmt(stats.averageGrade)} / ۲۰`} />
                <MiniProfileStat label="حضور" value={stats?.attendanceRate == null ? "—" : `٪${fmt(stats.attendanceRate, 0)}`} />
                <MiniProfileStat label="غیبت" value={(stats?.absentCount ?? 0).toLocaleString("fa-IR")} />
              </div>
            </div>
          </section>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : (
            <div className="p-5 md:p-6 space-y-5 bg-gradient-to-br from-white to-[#FFF8E7]/60">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <InfoTile icon={<User className="h-4 w-4" />} label="نام" value={student.name} />
                <InfoTile icon={<BookOpenIcon />} label="کلاس" value={classes[student.class_id] ?? "—"} />
                <InfoTile icon={<Phone className="h-4 w-4" />} label="شماره قرآن‌آموز" value={student.phone || "—"} />
                <InfoTile icon={<Calendar className="h-4 w-4" />} label="ولی" value={student.parent_name || "—"} />
                <InfoTile icon={<Phone className="h-4 w-4" />} label="تماس ولی" value={student.parent_phone || "—"} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <AttendanceCounter label="حضور" value={stats?.presentCount ?? 0} tone="green" />
                <AttendanceCounter label="غیبت" value={stats?.absentCount ?? 0} tone={(stats?.absentCount ?? 0) > 0 ? "red" : "green"} />
                <AttendanceCounter label="تأخیر" value={stats?.lateCount ?? 0} tone="gold" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HistoryPanel
                  title={`سوابق نمرات ${monthFilter === "all" ? "کل" : `ماه ${monthFilter}`}`}
                  empty="نمره‌ای برای این بازه ثبت نشده"
                  items={grades.map((g, i) => ({
                    key: `${g.date}-${g.subject}-${i}`,
                    title: g.subject || "بدون عنوان",
                    subtitle: g.date,
                    note: g.feedback ?? undefined,
                    badge: `${fmt(g.grade)} / ۲۰`,
                    badgeTone: "gold" as const,
                  }))}
                />

                <HistoryPanel
                  title={`سوابق حضور و غیاب ${monthFilter === "all" ? "کل" : `ماه ${monthFilter}`}`}
                  empty="سابقه‌ای برای این بازه ثبت نشده"
                  items={attendance.map((a, i) => {
                    const st = normalizeStatus(a.status);
                    return {
                      key: `${a.date}-${i}`,
                      title: a.date,
                      subtitle: st === "present" ? "حاضر" : st === "late" ? "تأخیر" : "غایب",
                      badge: st === "present" ? "حاضر" : st === "late" ? "تأخیر" : "غایب",
                      badgeTone: st === "present" ? ("green" as const) : st === "late" ? ("gold" as const) : ("red" as const),
                    };
                  })}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MiniProfileStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/12 px-3 py-2 text-center backdrop-blur-sm">
      <div className="text-[11px] text-white/65">{label}</div>
      <div className="mt-1 font-display text-sm font-black text-white">{value}</div>
    </div>
  );
}

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-semibold text-sm text-emerald-950 truncate">{value}</div>
    </div>
  );
}

function AttendanceCounter({ label, value, tone }: { label: string; value: number; tone: "green" | "gold" | "red" }) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 border-emerald-100 text-emerald-700"
      : tone === "gold"
      ? "bg-amber-50 border-amber-100 text-amber-700"
      : "bg-rose-50 border-rose-100 text-rose-700";

  return (
    <div className={`rounded-2xl border p-3 text-center ${toneClass}`}>
      <div className="font-display text-2xl font-black">{value.toLocaleString("fa-IR")}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}

function HistoryPanel({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; title: string; subtitle?: string; note?: string; badge: string; badgeTone: "green" | "gold" | "red" }>;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h4 className="font-display font-black text-sm text-emerald-950 mb-3 pb-2 border-b border-emerald-100">
        {title}
      </h4>
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/35 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{item.title}</p>
              {item.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>}
              {item.note && <p className="text-xs text-primary mt-0.5 truncate">{item.note}</p>}
            </div>
            <Badge className={badgeToneClass(item.badgeTone)}>{item.badge}</Badge>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">{empty}</p>}
      </div>
    </div>
  );
}

function badgeToneClass(tone: "green" | "gold" | "red") {
  if (tone === "green") return "bg-emerald-50 text-emerald-700 border border-emerald-100";
  if (tone === "gold") return "bg-amber-50 text-amber-700 border border-amber-100";
  return "bg-rose-50 text-rose-700 border border-rose-100";
}

function BookOpenIcon() {
  return <GraduationCap className="h-4 w-4" />;
}

const studentsStyle = `
.students-shell,
.student-profile-dialog {
  border: 1px solid rgba(212, 175, 55, 0.16);
  background: linear-gradient(135deg, #ffffff, #FFF8E7 120%);
  border-radius: 1.75rem;
}
.profile-hero {
  background:
    radial-gradient(circle at 15% 20%, rgba(212,175,55,.28), transparent 30%),
    radial-gradient(circle at 85% 20%, rgba(16,185,129,.18), transparent 28%),
    linear-gradient(135deg, #064E3B 0%, #065F46 48%, #047857 100%);
}
.profile-pattern {
  background-image:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,.22) 0 2px, transparent 2.8px),
    linear-gradient(45deg, transparent 0 48%, rgba(255,255,255,.10) 49% 50%, transparent 51%);
  background-size: 72px 72px, 36px 36px;
}
`;
