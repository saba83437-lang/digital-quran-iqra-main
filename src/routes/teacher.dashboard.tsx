// ============================================================
//  پنل استاد - داشبورد اختصاصی استاد (با عکس پروفایل استاد در هدر)
//  مسیر مقصد: src/routes/teacher.dashboard.tsx
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  CalendarClock,
  GraduationCap,
  Loader2,
  Mail,
  RefreshCw,
  TrendingUp,
  UserX,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getCurrentTeacher, type CurrentTeacher } from "@/lib/teacher-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/dashboard")({
  head: () => ({
    meta: [
      { title: "داشبورد استاد" },
      {
        name: "description",
        content: "داشبورد خلاصه وضعیت کلاس‌ها، قرآن‌آموزان، حضور، پیام‌ها و نمرات استاد",
      },
    ],
  }),
  component: TeacherDashboardPage,
});

/* ----------------------------- انواع ----------------------------- */
interface ClassRow {
  id: string;
  name: string;
  level?: string | null;
  teacher_id?: string | null;
}

interface StudentRow {
  id: string;
  name: string;
  class_id: string | null;
}

interface DashboardStats {
  classesCount: number;
  studentsCount: number;
  todayAbsentCount: number;
  consecutiveAbsenceCount: number;
  unreadMessagesCount: number;
  averageGrade: number | null;
}

type DetailKey =
  | "classes"
  | "students"
  | "calendar"
  | "todayAbsent"
  | "consecutiveAbsent"
  | "unreadMessages"
  | "averageGrades"
  | "educationStatus";

interface ClassAverageRow {
  classId: string;
  className: string;
  average: number;
  count: number;
}

/* ----------------------------- اعداد و تاریخ ----------------------------- */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const STUDENT_FILES_BUCKET = "student-files";

function convertDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

function getStoragePath(value?: string | null): string {
  if (!value) return "";
  if (value.startsWith("blob:") || value.startsWith("data:")) return "";
  const marker = `/${STUDENT_FILES_BUCKET}/`;
  if (value.includes(marker)) return decodeURIComponent(value.split(marker)[1].split("?")[0]);
  if (/^https?:\/\//i.test(value)) return "";
  return value.split("?")[0].replace(/^\/+/, "");
}

async function resolveTeacherAvatarUrl(value?: string | null): Promise<string> {
  if (!value) return "";
  if (value.startsWith("blob:") || value.startsWith("data:")) return value;

  const path = getStoragePath(value);
  if (!path) return value;

  const { data, error } = await supabase.storage
    .from(STUDENT_FILES_BUCKET)
    .createSignedUrl(path, 60 * 20);

  if (error) {
    console.error("teacher avatar signed url error:", error);
    return "";
  }

  return data.signedUrl;
}

function initials(name: string): string {
  const clean = String(name ?? "").trim();
  if (!clean) return "ا";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0);
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`;
}

function toEnglishDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function todayJalaliIran(): string {
  try {
    const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      timeZone: "Asia/Tehran",
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
    return new Date().toISOString().slice(0, 10);
  }
}

function formatIranDateTime(now: Date) {
  const day = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);

  const time = new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return { day, time };
}

function parseGrade(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = toEnglishDigits(value).replace(/[^0-9.]/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isAbsentStatus(row: Record<string, any>): boolean {
  const status = String(row.status ?? row.attendance_status ?? row.state ?? "").toLowerCase();
  return (
    status === "absent" ||
    status === "absence" ||
    status === "غایب" ||
    row.is_absent === true ||
    row.absent === true
  );
}

function isUnreadMessage(row: Record<string, any>): boolean {
  if (row.is_read === false) return true;
  if (row.read === false) return true;
  if (row.seen === false) return true;
  if (row.read_at === null || row.readAt === null || row.seen_at === null) return true;
  const status = String(row.status ?? "").toLowerCase();
  return status === "unread" || status === "new" || status === "خوانده نشده";
}

function messageBelongsToTeacher(row: Record<string, any>, teacher: CurrentTeacher): boolean {
  const possibleIdFields = [
    "teacher_id",
    "recipient_id",
    "receiver_id",
    "to_id",
    "user_id",
    "target_id",
  ];
  const possibleRoleFields = ["recipient_role", "receiver_role", "to_role", "role", "target_role"];
  const possiblePhoneFields = ["phone", "recipient_phone", "receiver_phone", "to_phone"];

  const hasTeacherId = possibleIdFields.some(
    (key) => String(row[key] ?? "") === String(teacher.id),
  );
  const hasTeacherRole = possibleRoleFields.some(
    (key) => String(row[key] ?? "").toLowerCase() === "teacher",
  );
  const hasTeacherPhone = possiblePhoneFields.some(
    (key) => String(row[key] ?? "") === String(teacher.phone ?? ""),
  );

  // اگر هیچ فیلد گیرنده‌ای در جدول نبود، پیام‌های خوانده‌نشده عمومی را هم می‌شماریم.
  const hasAnyRecipientField = [
    ...possibleIdFields,
    ...possibleRoleFields,
    ...possiblePhoneFields,
  ].some((key) => key in row);

  return hasTeacherId || hasTeacherRole || hasTeacherPhone || !hasAnyRecipientField;
}

function getMessageTitle(row: Record<string, any>): string {
  return String(
    row.title ?? row.subject ?? row.message_title ?? row.content ?? row.body ?? "پیام بدون عنوان",
  );
}

function getMessageDate(row: Record<string, any>): string {
  return String(row.created_at ?? row.date ?? row.sent_at ?? "—");
}

function getClassName(classId: string | null | undefined, classes: ClassRow[]): string {
  return classes.find((c) => c.id === classId)?.name ?? "کلاس نامشخص";
}

/* ----------------------------- صفحه ----------------------------- */
function TeacherDashboardPage() {
  const [teacher, setTeacher] = useState<CurrentTeacher | null>(null);
  const [teacherAvatarUrl, setTeacherAvatarUrl] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    classesCount: 0,
    studentsCount: 0,
    todayAbsentCount: 0,
    consecutiveAbsenceCount: 0,
    unreadMessagesCount: 0,
    averageGrade: null,
  });
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeDetail, setActiveDetail] = useState<DetailKey | null>(null);

  const [todayAbsentStudents, setTodayAbsentStudents] = useState<StudentRow[]>([]);
  const [consecutiveAbsentStudents, setConsecutiveAbsentStudents] = useState<StudentRow[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<Array<Record<string, any>>>([]);
  const [gradeRows, setGradeRows] = useState<Array<Record<string, any>>>([]);
  const [classAverages, setClassAverages] = useState<ClassAverageRow[]>([]);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iranDateTime = useMemo(() => formatIranDateTime(now), [now]);

  function resetDetailData() {
    setTodayAbsentStudents([]);
    setConsecutiveAbsentStudents([]);
    setUnreadMessages([]);
    setGradeRows([]);
    setClassAverages([]);
  }

  async function loadDashboard(showToast = false) {
    if (!showToast) setLoading(true);
    setRefreshing(true);

    const currentTeacher = await getCurrentTeacher();
    setTeacher(currentTeacher);

    if (!currentTeacher) {
      setTeacherAvatarUrl("");
      resetDetailData();
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: teacherProfile } = await supabase
      .from("teachers")
      .select("avatar_url")
      .eq("id", currentTeacher.id)
      .maybeSingle();

    const resolvedAvatar = await resolveTeacherAvatarUrl(
      (teacherProfile as any)?.avatar_url ?? null,
    );
    setTeacherAvatarUrl(resolvedAvatar);

    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("id, name, level, teacher_id")
      .eq("teacher_id", currentTeacher.id)
      .is("deleted_at", null)
      .eq("is_active", true)
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
      setStats({
        classesCount: 0,
        studentsCount: 0,
        todayAbsentCount: 0,
        consecutiveAbsenceCount: 0,
        unreadMessagesCount: 0,
        averageGrade: null,
      });
      resetDetailData();
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const classIds = classList.map((c) => c.id);

    const { data: studentData } = await supabase
      .from("students")
      .select("id, name, class_id")
      .in("class_id", classIds)
      .order("name");

    const studentList = (studentData ?? []) as StudentRow[];
    setStudents(studentList);
    const studentIds = studentList.map((s) => s.id);

    let todayAbsentCount = 0;
    let consecutiveAbsenceCount = 0;
    let unreadMessagesCount = 0;
    let averageGrade: number | null = null;
    let todayAbsentList: StudentRow[] = [];
    let consecutiveAbsenceList: StudentRow[] = [];
    let gradeList: Array<Record<string, any>> = [];
    let classAverageList: ClassAverageRow[] = [];
    let unreadMessageList: Array<Record<string, any>> = [];

    if (studentIds.length > 0) {
      const today = todayJalaliIran();
      const currentUserId = getSession()?.userId ?? "";
      const [todayAttendanceResult, attendanceHistoryResult, gradeResult, messagesResult] =
        await Promise.all([
          supabase
            .from("attendance")
            .select("student_id, date, status, note, is_absent")
            .in("student_id", studentIds)
            .eq("date", today),
          supabase
            .from("attendance")
            .select("student_id, date, status, note, is_absent")
            .in("student_id", studentIds)
            .order("date", { ascending: false })
            .limit(3000),
          supabase
            .from("grades")
            .select("student_id, grade, class_name, date")
            .in("student_id", studentIds)
            .limit(5000),
          supabase
            .from("messages")
            .select(
              "id, from_name, subject, content, created_at, delivered_at, unread, recipient_user_id, campaign_id",
              { count: "exact" },
            )
            .eq("recipient_user_id", currentUserId)
            .eq("unread", true)
            .order("delivered_at", { ascending: false, nullsFirst: false })
            .limit(200),
        ]);
      const todayAttendance = todayAttendanceResult.data ?? [];
      const attendanceHistory = attendanceHistoryResult.data ?? [];
      const gradeData = gradeResult.data ?? [];
      const messagesData = messagesResult.data ?? [];
      unreadMessageList = messagesData as Array<Record<string, any>>;
      unreadMessagesCount = messagesResult.count ?? messagesData.length;

      const todayAbsentRows = ((todayAttendance ?? []) as Array<Record<string, any>>).filter(
        isAbsentStatus,
      );
      const todayAbsentIds = new Set(todayAbsentRows.map((row) => String(row.student_id ?? "")));
      todayAbsentList = studentList.filter((student) => todayAbsentIds.has(String(student.id)));
      todayAbsentCount = todayAbsentList.length;

      const groupedAttendance = new Map<string, Array<Record<string, any>>>();
      for (const row of (attendanceHistory ?? []) as Array<Record<string, any>>) {
        const studentId = String(row.student_id ?? "");
        if (!studentId) continue;
        const list = groupedAttendance.get(studentId) ?? [];
        list.push(row);
        groupedAttendance.set(studentId, list);
      }

      const consecutiveIds = new Set<string>();
      for (const [studentId, list] of groupedAttendance.entries()) {
        const sorted = list.sort((a, b) =>
          String(b.date ?? "").localeCompare(String(a.date ?? "")),
        );
        if (sorted.length >= 2 && isAbsentStatus(sorted[0]) && isAbsentStatus(sorted[1])) {
          consecutiveIds.add(studentId);
        }
      }
      consecutiveAbsenceList = studentList.filter((student) =>
        consecutiveIds.has(String(student.id)),
      );
      consecutiveAbsenceCount = consecutiveAbsenceList.length;

      gradeList = (gradeData ?? []) as Array<Record<string, any>>;
      const gradeValues = gradeList
        .map((row) => parseGrade(row.grade ?? row.score ?? row.value))
        .filter((value): value is number => value !== null);

      averageGrade =
        gradeValues.length > 0
          ? Math.round(
              (gradeValues.reduce((sum, grade) => sum + grade, 0) / gradeValues.length) * 10,
            ) / 10
          : null;

      const studentById = new Map(studentList.map((student) => [student.id, student]));
      const gradesByClass = new Map<string, number[]>();
      for (const row of gradeList) {
        const grade = parseGrade(row.grade ?? row.score ?? row.value);
        if (grade === null) continue;
        const student = studentById.get(String(row.student_id ?? ""));
        if (!student?.class_id) continue;
        const list = gradesByClass.get(student.class_id) ?? [];
        list.push(grade);
        gradesByClass.set(student.class_id, list);
      }
      classAverageList = Array.from(gradesByClass.entries()).map(([classId, values]) => ({
        classId,
        className: getClassName(classId, classList),
        count: values.length,
        average:
          Math.round((values.reduce((sum, grade) => sum + grade, 0) / values.length) * 10) / 10,
      }));
    }

    setStats({
      classesCount: classList.length,
      studentsCount: studentList.length,
      todayAbsentCount,
      consecutiveAbsenceCount,
      unreadMessagesCount,
      averageGrade,
    });
    setTodayAbsentStudents(todayAbsentList);
    setConsecutiveAbsentStudents(consecutiveAbsenceList);
    setUnreadMessages(unreadMessageList);
    setGradeRows(gradeList);
    setClassAverages(classAverageList);

    if (showToast) toast.success("داشبورد استاد به‌روزرسانی شد.");
    setLoading(false);
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری داشبورد...</span>
      </div>
    );
  }

  return (
    <>
      <style>{dashboardStyle}</style>
      <div className="teacher-dashboard-page space-y-6" dir="rtl">
        <section className="dashboard-hero relative overflow-hidden rounded-[2rem] p-5 md:p-6 text-white shadow-xl">
          <div className="dashboard-pattern absolute inset-0 opacity-35" />
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-[#D4AF37]/25 blur-3xl" />
          <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-[#10B981]/18 blur-3xl" />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 shrink-0 rounded-full border-4 border-[#D4AF37] bg-white/10 shadow-xl ring-4 ring-white/20">
                {teacherAvatarUrl ? (
                  <img
                    src={teacherAvatarUrl}
                    alt={teacher?.name ?? "استاد"}
                    className="h-full w-full rounded-full object-cover object-center"
                  />
                ) : (
                  <AvatarFallback className="rounded-full bg-white/15 text-[#D4AF37] font-display text-2xl font-black">
                    {initials(teacher?.name ?? "استاد")}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <Badge className="mb-2 border-[#D4AF37]/30 bg-white/10 text-amber-100 hover:bg-white/15">
                  داشبورد اختصاصی استاد
                </Badge>
                <h1 className="font-display text-2xl font-black md:text-4xl">
                  سلام {teacher?.name ?? "استاد گرامی"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50/75">
                  خلاصه وضعیت کلاس‌ها، قرآن‌آموزان، حضور، پیام‌ها و میانگین نمرات مربوط به شما.
                </p>
              </div>
            </div>

            <Button
              onClick={() => loadDashboard(true)}
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DashboardCard
            title="کلاس‌های من"
            onClick={() => setActiveDetail("classes")}
            value={stats.classesCount}
            icon={<BookOpen className="h-6 w-6" />}
            tone="green"
            subtitle="کلاس‌های فعال شما"
          />
          <DashboardCard
            title="دانش‌آموزان من"
            onClick={() => setActiveDetail("students")}
            value={stats.studentsCount}
            icon={<Users className="h-6 w-6" />}
            tone="green"
            subtitle="قرآن‌آموزان کلاس‌های شما"
          />
          <CalendarCard
            day={iranDateTime.day}
            time={iranDateTime.time}
            onClick={() => setActiveDetail("calendar")}
          />
          <DashboardCard
            title="غایبین امروز"
            onClick={() => setActiveDetail("todayAbsent")}
            value={stats.todayAbsentCount}
            icon={<UserX className="h-6 w-6" />}
            tone={stats.todayAbsentCount > 0 ? "warning" : "green"}
            subtitle={`امروز: ${convertDigits(todayJalaliIran())}`}
          />
          <DashboardCard
            title="دو غیبت متوالی"
            onClick={() => setActiveDetail("consecutiveAbsent")}
            value={stats.consecutiveAbsenceCount}
            icon={<AlertTriangle className="h-6 w-6" />}
            tone={stats.consecutiveAbsenceCount > 0 ? "warning" : "green"}
            subtitle="نیازمند پیگیری آموزشی"
          />
          <DashboardCard
            title="پیام‌های خوانده‌نشده"
            onClick={() => setActiveDetail("unreadMessages")}
            value={stats.unreadMessagesCount}
            icon={<Mail className="h-6 w-6" />}
            tone={stats.unreadMessagesCount > 0 ? "gold" : "green"}
            subtitle="پیام‌های مربوط به شما"
          />
          <DashboardCard
            title="میانگین نمرات کلاس‌های من"
            onClick={() => setActiveDetail("averageGrades")}
            value={stats.averageGrade === null ? "—" : convertDigits(stats.averageGrade)}
            icon={<TrendingUp className="h-6 w-6" />}
            tone="gold"
            subtitle="میانگین همه نمرات ثبت‌شده"
          />
          <DashboardCard
            title="وضعیت آموزشی"
            onClick={() => setActiveDetail("educationStatus")}
            value={
              stats.averageGrade === null
                ? "بدون نمره"
                : stats.averageGrade >= 17
                  ? "عالی"
                  : stats.averageGrade >= 14
                    ? "خوب"
                    : "نیازمند پیگیری"
            }
            icon={<GraduationCap className="h-6 w-6" />}
            tone="green"
            subtitle="برداشت سریع از میانگین نمرات"
          />
        </div>

        <Card className="dashboard-note-card p-4 md:p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-lg font-black text-emerald-950">خلاصه امروز</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                این داشبورد فقط اطلاعات مربوط به کلاس‌ها و قرآن‌آموزان همین استاد را نمایش می‌دهد.
                برای مشاهده جزئیات، روی هر کارت کلیک کنید.
              </p>
            </div>
            <Badge
              variant="outline"
              className="w-fit border-[#D4AF37]/30 bg-amber-50 text-[#7A5B10]"
            >
              به وقت ایران: {iranDateTime.time}
            </Badge>
          </div>
        </Card>

        <DetailDialog
          open={activeDetail !== null}
          onOpenChange={(open) => !open && setActiveDetail(null)}
          activeDetail={activeDetail}
          classes={classes}
          students={students}
          todayAbsentStudents={todayAbsentStudents}
          consecutiveAbsentStudents={consecutiveAbsentStudents}
          unreadMessages={unreadMessages}
          classAverages={classAverages}
          gradeRows={gradeRows}
          iranDateTime={iranDateTime}
          stats={stats}
        />
      </div>
    </>
  );
}

/* ----------------------------- کامپوننت‌ها ----------------------------- */
function DashboardCard({
  title,
  value,
  icon,
  subtitle,
  tone,
  onClick,
}: {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  subtitle: string;
  tone: "green" | "gold" | "warning";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "gold"
      ? "from-[#D4AF37]/18 to-amber-50 text-[#7A5B10]"
      : tone === "warning"
        ? "from-orange-100 to-amber-50 text-orange-800"
        : "from-emerald-100 to-teal-50 text-emerald-800";

  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      className="dashboard-stat-card group relative cursor-pointer overflow-hidden p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="dashboard-card-pattern absolute inset-0 opacity-25" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <div className="mt-2 font-display text-2xl font-black text-emerald-950">
            {typeof value === "number" ? convertDigits(value) : value}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground leading-5">{subtitle}</p>
        </div>
        <div className={`rounded-xl bg-gradient-to-br ${toneClass} p-2.5 shadow-sm`}>{icon}</div>
      </div>
    </Card>
  );
}

function CalendarCard({ day, time, onClick }: { day: string; time: string; onClick?: () => void }) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      className="dashboard-stat-card group relative cursor-pointer overflow-hidden p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="dashboard-card-pattern absolute inset-0 opacity-25" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">تقویم</p>
          <div className="mt-2 font-display text-xl font-black text-emerald-950">{time}</div>
          <p className="mt-1 text-[11px] text-muted-foreground leading-5">{day}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-[#D4AF37]/18 to-emerald-50 p-2.5 text-[#7A5B10] shadow-sm">
          <CalendarClock className="h-6 w-6" />
        </div>
      </div>
    </Card>
  );
}

function DetailDialog({
  open,
  onOpenChange,
  activeDetail,
  classes,
  students,
  todayAbsentStudents,
  consecutiveAbsentStudents,
  unreadMessages,
  classAverages,
  gradeRows,
  iranDateTime,
  stats,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeDetail: DetailKey | null;
  classes: ClassRow[];
  students: StudentRow[];
  todayAbsentStudents: StudentRow[];
  consecutiveAbsentStudents: StudentRow[];
  unreadMessages: Array<Record<string, any>>;
  classAverages: ClassAverageRow[];
  gradeRows: Array<Record<string, any>>;
  iranDateTime: { day: string; time: string };
  stats: DashboardStats;
}) {
  const titleMap: Record<DetailKey, string> = {
    classes: "کلاس‌های من",
    students: "دانش‌آموزان من",
    calendar: "تقویم امروز",
    todayAbsent: "غایبین امروز",
    consecutiveAbsent: "دو غیبت متوالی",
    unreadMessages: "پیام‌های خوانده‌نشده",
    averageGrades: "میانگین نمرات کلاس‌های من",
    educationStatus: "وضعیت آموزشی",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{activeDetail ? titleMap[activeDetail] : "جزئیات"}</DialogTitle>
          <DialogDescription>جزئیات مربوط به همین استاد و کلاس‌های او</DialogDescription>
        </DialogHeader>

        {activeDetail === "classes" && (
          <DetailList
            emptyText="کلاسی برای شما ثبت نشده است."
            items={classes.map((c) => ({
              title: c.name,
              subtitle: c.level ? `سطح: ${c.level}` : "بدون سطح ثبت‌شده",
              badge: "کلاس",
            }))}
          />
        )}

        {activeDetail === "students" && (
          <DetailList
            emptyText="دانش‌آموزی برای کلاس‌های شما ثبت نشده است."
            items={students.map((s) => ({
              title: s.name,
              subtitle: getClassName(s.class_id, classes),
              badge: "قرآن‌آموز",
            }))}
          />
        )}

        {activeDetail === "calendar" && (
          <div className="rounded-2xl border bg-emerald-50/60 p-6 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-emerald-700" />
            <div className="mt-4 font-display text-3xl font-black text-emerald-950">
              {iranDateTime.time}
            </div>
            <div className="mt-2 text-muted-foreground">{iranDateTime.day}</div>
          </div>
        )}

        {activeDetail === "todayAbsent" && (
          <DetailList
            emptyText="امروز غایبی برای کلاس‌های شما ثبت نشده است."
            items={todayAbsentStudents.map((s) => ({
              title: s.name,
              subtitle: getClassName(s.class_id, classes),
              badge: "غایب امروز",
            }))}
          />
        )}

        {activeDetail === "consecutiveAbsent" && (
          <DetailList
            emptyText="دانش‌آموزی با دو غیبت متوالی پیدا نشد."
            items={consecutiveAbsentStudents.map((s) => ({
              title: s.name,
              subtitle: getClassName(s.class_id, classes),
              badge: "نیازمند پیگیری",
            }))}
          />
        )}

        {activeDetail === "unreadMessages" && (
          <DetailList
            emptyText="پیام خوانده‌نشده‌ای برای شما وجود ندارد."
            items={unreadMessages.map((m, index) => ({
              title: getMessageTitle(m),
              subtitle: getMessageDate(m),
              badge: `پیام ${convertDigits(index + 1)}`,
            }))}
          />
        )}

        {activeDetail === "averageGrades" && (
          <div className="space-y-3">
            <div className="rounded-2xl border bg-amber-50/70 p-4">
              <div className="text-sm text-muted-foreground">میانگین کل</div>
              <div className="mt-1 font-display text-3xl font-black text-emerald-950">
                {stats.averageGrade === null ? "—" : convertDigits(stats.averageGrade)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                تعداد نمرات بررسی‌شده: {convertDigits(gradeRows.length)}
              </div>
            </div>
            <DetailList
              emptyText="برای کلاس‌های شما نمره‌ای ثبت نشده است."
              items={classAverages.map((row) => ({
                title: row.className,
                subtitle: `میانگین: ${convertDigits(row.average)} • تعداد نمره: ${convertDigits(row.count)}`,
                badge: "میانگین کلاس",
              }))}
            />
          </div>
        )}

        {activeDetail === "educationStatus" && (
          <div className="rounded-2xl border bg-emerald-50/60 p-5">
            <div className="flex items-center gap-3">
              <GraduationCap className="h-8 w-8 text-emerald-700" />
              <div>
                <div className="font-display text-xl font-black text-emerald-950">
                  {stats.averageGrade === null
                    ? "هنوز نمره‌ای ثبت نشده"
                    : stats.averageGrade >= 17
                      ? "وضعیت عالی"
                      : stats.averageGrade >= 14
                        ? "وضعیت خوب"
                        : "نیازمند پیگیری"}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  این وضعیت بر اساس میانگین نمرات ثبت‌شده برای قرآن‌آموزان کلاس‌های شما محاسبه شده
                  است.
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailList({
  items,
  emptyText,
}: {
  items: Array<{ title: string; subtitle?: string; badge?: string }>;
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={`${item.title}-${index}`}
          className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3"
        >
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{item.title}</div>
            {item.subtitle && (
              <div className="mt-1 text-xs text-muted-foreground truncate">{item.subtitle}</div>
            )}
          </div>
          {item.badge && (
            <Badge variant="outline" className="shrink-0">
              {item.badge}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

const dashboardStyle = `
.teacher-dashboard-page {
  --dashboard-green: #064E3B;
  --dashboard-gold: #D4AF37;
}
.dashboard-hero {
  background:
    radial-gradient(circle at 15% 20%, rgba(212, 175, 55, 0.28), transparent 30%),
    radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.18), transparent 28%),
    linear-gradient(135deg, #064E3B 0%, #065F46 48%, #047857 100%);
}
.dashboard-pattern,
.dashboard-card-pattern {
  background-image:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,.22) 0 2px, transparent 2.8px),
    linear-gradient(45deg, transparent 0 48%, rgba(255,255,255,.10) 49% 50%, transparent 51%);
  background-size: 72px 72px, 36px 36px;
}
.dashboard-stat-card,
.dashboard-note-card {
  border: 1px solid rgba(212, 175, 55, 0.16);
  background: linear-gradient(135deg, #ffffff, #FFF8E7 120%);
  border-radius: 1.75rem;
}
.dashboard-hero img {
  display: block;
}

.dashboard-stat-card svg {
  width: 1.15rem;
  height: 1.15rem;
}

`;
