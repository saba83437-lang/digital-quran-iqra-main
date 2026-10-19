// ============================================================
// پنل قرآن‌آموز - داشبورد v54 تمیز - بدون طرح نجم
// مسیر مقصد: src/routes/student/index.tsx  (/student/)
// ویژگی جدید: نمودار پیشرفت معدل و نمرات + طراحی یکسان با داشبورد استاد
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  GraduationCap,
  Calendar,
  ClipboardList,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Award,
  Clock,
  ChevronLeft,
  Loader2,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  BookMarked,
  Bell,
  RefreshCw,
  CalendarClock,
  BarChart3,
  Sparkles,
  Flame,
  Medal,
  Target,
  Zap,
  Crown,
  Heart,
  BookCheck,
  StarIcon,
  Lock,
  Trophy,
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
import { getCurrentStudent, type CurrentStudent } from "@/lib/student-utils";
import {
  getStudentAchievementShowcase,
  type AchievementTier,
  type EarnedAchievement,
  type LockedAchievementProgress,
} from "@/lib/achievements";
import { AchievementShowcaseCard } from "@/components/achievement-showcase";
import { toast } from "sonner";

export const Route = createFileRoute("/student/")({
  head: () => ({
    meta: [
      { title: "دارالقرآن الوالدین — داشبورد قرآن‌آموز" },
      { name: "description", content: "داشبورد شخصی قرآن‌آموز" },
    ],
  }),
  component: StudentDashboard,
});

/* ------------------ کمکی ------------------ */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const STUDENT_FILES_BUCKET = "student-files";

function toFa(n: number | string | null | undefined): string {
  if (n == null) return "—";
  return String(n).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}
function convertDigits(input: string | number): string {
  return toFa(input);
}
function toEnglishDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 6) return "شب بخیر";
  if (h < 12) return "صبح بخیر";
  if (h < 17) return "بعد از ظهر بخیر";
  return "عصر بخیر";
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
function getStoragePath(value?: string | null): string {
  if (!value) return "";
  const v = String(value).trim();
  if (!v) return "";
  if (v.startsWith("blob:") || v.startsWith("data:")) return "";
  const marker = `/${STUDENT_FILES_BUCKET}/`;
  if (v.includes(marker)) {
    try {
      return decodeURIComponent(v.split(marker)[1].split("?")[0]);
    } catch {
      return v.split(marker)[1].split("?")[0];
    }
  }
  if (/^https?:\/\//i.test(v)) {
    // اگر URL کامل supabase است ولی شامل bucket نیست، نمی‌توانیم path بسازیم - همان URL را برمی‌گردانیم تا مستقیم امتحان شود
    if (v.includes(STUDENT_FILES_BUCKET)) return v;
    // اگر لینک خارجی عمومی است، همان را برگردان
    if (!v.includes("supabase.co")) return v;
    return "";
  }
  return v.split("?")[0].replace(/^\/+/, "");
}

async function resolveAvatarUrl(value?: string | null): Promise<string> {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
  // اگر مستقیم URL عمومی است (http بدون نیاز به signed) همان را برگردان
  if (/^https?:\/\//i.test(raw) && !raw.includes(STUDENT_FILES_BUCKET)) {
    // ممکن است لینک عمومی باشد - مستقیم برگردان
    if (!raw.includes("supabase.co/storage")) return raw;
  }
  const path = getStoragePath(raw);
  if (!path) {
    // اگر getStoragePath نتوانست path بسازد ولی raw یک URL کامل است، همان را برگردان
    if (/^https?:\/\//i.test(raw)) return raw;
    return "";
  }
  // اگر path خودش URL کامل بود (حالت بالا) همان را برگردان
  if (/^https?:\/\//i.test(path)) return path;

  const { data, error } = await supabase.storage
    .from(STUDENT_FILES_BUCKET)
    .createSignedUrl(path, 60 * 25);
  if (error) {
    console.error("avatar signed url error - path:", path, error);
    // اگر خطا داد، شاید فایل عمومی است - تلاش کن URL عمومی بگیری
    const { data: pub } = supabase.storage.from(STUDENT_FILES_BUCKET).getPublicUrl(path);
    if (pub?.publicUrl) return pub.publicUrl;
    // در نهایت raw را برگردان تا شانس نمایش داشته باشد
    return raw;
  }
  return data.signedUrl;
}

// تمام ستون‌های ممکن برای عکس قرآن‌آموز (طبق HANDOFF)
const AVATAR_CANDIDATE_KEYS = [
  "avatar_url",
  "photo_url",
  "profile_photo_url",
  "profile_image_url",
  "profile_picture_url",
  "image_url",
  "picture_url",
  "avatar",
  "photo",
  "image",
  "picture",
  "profile_photo",
  "profile_image",
  "profile_picture",
] as const;

function extractAvatarFromRow(row: any): string | null {
  if (!row) return null;
  for (const key of AVATAR_CANDIDATE_KEYS) {
    const v = row[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}
function initials(name: string): string {
  const clean = String(name ?? "").trim();
  if (!clean) return "ق";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0);
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`;
}

interface RecentGrade {
  id: string;
  subject: string;
  grade: number;
  date: string;
  feedback: string | null;
  teacher: string | null;
  created_at?: string;
}
interface UpcomingAssignment {
  id: string;
  title: string;
  due_date: string;
  type: string;
  teacher_name: string | null;
}
interface PendingSubmission {
  assignment_id: string;
  title: string;
  due_date: string;
}
interface AttendanceRow {
  date: string;
  status?: string | null;
  is_absent?: boolean | null;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  earned: boolean;
  progress?: string;
  reason?: string;
  awardedAt?: string;
  tier?: AchievementTier;
  color: "gold" | "emerald" | "blue" | "orange" | "purple" | "gray";
}

function achievementIcon(iconKey: string): ReactNode {
  const iconClass = "h-5 w-5";
  const icons: Record<string, ReactNode> = {
    Star: <StarIcon className={iconClass} />,
    Crown: <Crown className={iconClass} />,
    Medal: <Medal className={iconClass} />,
    Sparkles: <Sparkles className={iconClass} />,
    Flame: <Flame className={iconClass} />,
    Zap: <Zap className={iconClass} />,
    CalendarHeart: <Heart className={iconClass} />,
    BookCheck: <BookCheck className={iconClass} />,
    TrendingUp: <TrendingUp className={iconClass} />,
    Target: <Target className={iconClass} />,
    Trophy: <Trophy className={iconClass} />,
    HandHeart: <Heart className={iconClass} />,
    Award: <Award className={iconClass} />,
  };
  return icons[iconKey] ?? <Trophy className={iconClass} />;
}

function achievementColor(tier: AchievementTier, earned: boolean): Achievement["color"] {
  if (!earned) return "gray";
  if (tier === "gold") return "gold";
  if (tier === "diamond") return "blue";
  if (tier === "special") return "purple";
  if (tier === "bronze") return "orange";
  return "emerald";
}

function earnedToDashboardAchievement(item: EarnedAchievement): Achievement {
  return {
    id: item.achievement_id,
    title: item.title,
    description: item.description,
    icon: achievementIcon(item.icon_key),
    earned: true,
    progress: `دریافت: ${formatShortPersianDate(item.awarded_at)}`,
    reason: item.reason,
    awardedAt: item.awarded_at,
    tier: item.tier,
    color: achievementColor(item.tier, true),
  };
}

function lockedToDashboardAchievement(item: LockedAchievementProgress): Achievement {
  const nextCondition = item.evaluation.conditions.find((condition) => !condition.met);
  const progress = nextCondition
    ? `${toFa(nextCondition.current)} از ${toFa(nextCondition.target)}`
    : item.locked_hint || "هنوز دریافت نشده";
  return {
    id: item.achievement_id,
    title: item.is_secret ? "افتخار شگفت‌انگیز" : item.title,
    description: item.is_secret ? "شرایط این نشان فعلاً مخفی است." : item.description,
    icon: achievementIcon(item.icon_key),
    earned: false,
    progress,
    tier: item.tier,
    color: "gray",
  };
}

function formatShortPersianDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

type DetailKey = "grades" | "assignments" | "calendar" | "class" | "chart" | "achievements" | null;

/* ------------------ صفحه ------------------ */
function StudentDashboard() {
  const [student, setStudent] = useState<CurrentStudent | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());
  const [activeDetail, setActiveDetail] = useState<DetailKey>(null);

  const [recentGrades, setRecentGrades] = useState<RecentGrade[]>([]);
  const [allGrades, setAllGrades] = useState<RecentGrade[]>([]);
  const [upcomingAssignments, setUpcomingAssignments] = useState<UpcomingAssignment[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<PendingSubmission[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRow[]>([]);
  const [classInfo, setClassInfo] = useState<{
    name: string;
    teacher: string | null;
    schedule: string | null;
  } | null>(null);
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  const iranDateTime = useMemo(() => formatIranDateTime(now), [now]);

  useEffect(() => {
    (async () => {
      try {
        const s = await getCurrentStudent();
        setStudent(s);
        if (s) {
          // 1- اول سعی کن از خود آبجکت student عکس را پیدا کنی
          let rawAvatar = extractAvatarFromRow(s as any);
          // 2- اگر نبود، یک بار دیگر از جدول students تمام ستون‌ها را بگیر (چون getCurrentStudent ممکن است فقط چند ستون برگرداند)
          if (!rawAvatar) {
            try {
              const { data: fullRow } = await supabase
                .from("students")
                .select("id, avatar_url, poster_avatar_url")
                .eq("id", s.id)
                .maybeSingle();
              rawAvatar = extractAvatarFromRow(fullRow);
            } catch (e) {
              console.warn("fetch full student row for avatar failed", e);
            }
          }
          if (rawAvatar) {
            const resolved = await resolveAvatarUrl(rawAvatar);
            setAvatarUrl(resolved);
          } else {
            setAvatarUrl("");
          }
          await loadDashboardData(s);
        }
      } catch (err) {
        console.error("[dashboard] خطا:", err);
      }
      setLoading(false);
    })();
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleRefresh() {
    if (!student) return;
    setRefreshing(true);
    try {
      await loadDashboardData(student);
      toast.success("داشبورد به‌روزرسانی شد");
    } catch {
      toast.error("خطا در به‌روزرسانی");
    }
    setRefreshing(false);
  }

  // تشخیص غیبت
  function isAbsentAtt(row: any): boolean {
    if (!row) return false;
    if (row.is_absent === true) return true;
    const st = String(row.status ?? row.attendance_status ?? "").toLowerCase();
    return st === "absent" || st === "غایب" || st === "absence";
  }

  async function loadDashboardData(s: CurrentStudent) {
    // کلاس
    if (s.class_id) {
      const { data: cls } = await supabase
        .from("classes")
        .select("name, schedule, teacher_id")
        .eq("id", s.class_id)
        .maybeSingle();
      let teacherName: string | null = null;
      if (cls?.teacher_id) {
        const { data: teacher } = await supabase
          .from("teachers")
          .select("name")
          .eq("id", cls.teacher_id)
          .maybeSingle();
        teacherName = (teacher as any)?.name ?? null;
      }
      setClassInfo({
        name: (cls as any)?.name ?? (s as any).class_name ?? "—",
        teacher: teacherName,
        schedule: (cls as any)?.schedule ?? null,
      });
    }

    // یک Query پایدار برای لیست و نمودار؛ از دریافت دوباره همان نمرات جلوگیری می‌شود.
    const { data: gradesData, error: gradesError } = await supabase
      .from("grades")
      .select("id, subject, grade, date, feedback, teacher, created_at")
      .eq("student_id", s.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (gradesError) throw gradesError;
    const gradesDescending = (gradesData ?? []) as RecentGrade[];
    setRecentGrades(gradesDescending.slice(0, 5));
    setAllGrades([...gradesDescending].reverse());

    // حضور و غیاب برای نشان‌ها
    let attRows: AttendanceRow[] = [];
    try {
      const { data: attData } = await supabase
        .from("attendance")
        .select("date, status, is_absent")
        .eq("student_id", s.id)
        .order("date", { ascending: false })
        .limit(60);
      attRows = (attData ?? []) as AttendanceRow[];
      setAttendanceHistory(attRows);
    } catch (e) {
      console.warn("attendance fetch failed", e);
    }

    // تکالیف + ارسال‌ها
    const upcoming: UpcomingAssignment[] = [];
    const pending: PendingSubmission[] = [];

    if (s.class_id) {
      const today = new Date().toISOString().slice(0, 10);
      const [assignmentResult, submissionResult] = await Promise.all([
        supabase
          .from("assignments")
          .select("id, title, due_date, type, teacher_id, target_type, target_students")
          .eq("class_id", s.class_id)
          .gt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(10),
        supabase.from("submissions").select("assignment_id").eq("student_id", s.id),
      ]);
      const allAssignments = assignmentResult.data ?? [];
      const mySubmissions = submissionResult.data ?? [];
      const teacherIds = [
        ...new Set(allAssignments.map((item) => item.teacher_id).filter(Boolean).map(Number)),
      ];
      const { data: teacherRows } = teacherIds.length
        ? await supabase.from("teachers").select("id, name").in("id", teacherIds)
        : { data: [] as Array<{ id: number; name: string }> };
      const teacherNameById = new Map(
        (teacherRows ?? []).map((teacher) => [Number(teacher.id), String(teacher.name)]),
      );
      const submittedIds = new Set((mySubmissions ?? []).map((x: any) => x.assignment_id));

      for (const a of (allAssignments ?? []) as any[]) {
        let assigned = a.target_type === "all";
        if (!assigned && Array.isArray(a.target_students))
          assigned = a.target_students.includes(s.id);
        if (!assigned) continue;
        const teacherName = a.teacher_id
          ? (teacherNameById.get(Number(a.teacher_id)) ?? null)
          : null;
        const item = {
          id: a.id,
          title: a.title,
          due_date: a.due_date,
          type: a.type,
          teacher_name: teacherName,
        };
        upcoming.push(item);
        if (!submittedIds.has(a.id))
          pending.push({ assignment_id: a.id, title: a.title, due_date: a.due_date });
      }
    }

    setUpcomingAssignments(upcoming);
    setPendingSubmissions(pending);

    // افتخارات فقط از هسته رسمی (نجم + فعالیت ویژه تأییدشده) دریافت می‌شوند.
    const showcaseResult = await getStudentAchievementShowcase(s.id);
    if (showcaseResult.data) {
      const earnedByDefinition = new Map<string, EarnedAchievement>();
      for (const item of showcaseResult.data.earned) {
        if (!earnedByDefinition.has(item.achievement_id))
          earnedByDefinition.set(item.achievement_id, item);
      }
      const earnedItems = [...earnedByDefinition.values()].map(earnedToDashboardAchievement);
      const lockedItems = showcaseResult.data.progress.map(lockedToDashboardAchievement);
      setAchievements([...earnedItems, ...lockedItems]);
    } else {
      console.warn("achievement showcase unavailable:", showcaseResult.error);
      setAchievements([]);
    }
  }

  // محاسبات نمودار
  const chartStats = useMemo(() => {
    if (allGrades.length === 0) return null;
    const gradesNums = allGrades.map((g) => Number(g.grade)).filter((n) => !isNaN(n));
    if (gradesNums.length === 0) return null;
    const avg = gradesNums.reduce((a, b) => a + b, 0) / gradesNums.length;
    const best = Math.max(...gradesNums);
    const worst = Math.min(...gradesNums);
    // روند: نیمه دوم vs نیمه اول
    const half = Math.floor(gradesNums.length / 2);
    const firstAvg = gradesNums.slice(0, half).reduce((a, b) => a + b, 0) / (half || 1);
    const secondAvg =
      gradesNums.slice(half).reduce((a, b) => a + b, 0) / (gradesNums.length - half || 1);
    const trend = secondAvg - firstAvg;
    return {
      avg: Number(avg.toFixed(1)),
      best,
      worst,
      trend: Number(trend.toFixed(1)),
      count: gradesNums.length,
    };
  }, [allGrades]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری داشبورد...</span>
      </div>
    );
  }

  if (!student) {
    return (
      <Card className="p-12 text-center" dir="rtl">
        <GraduationCap className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
        <h3 className="font-display text-lg">اطلاعات قرآن‌آموز یافت نشد</h3>
      </Card>
    );
  }

  return (
    <>
      <style>{dashboardStyle}</style>
      <div className="student-dashboard-page space-y-5" dir="rtl">
        {/* HERO */}
        <section className="dashboard-hero relative overflow-hidden rounded-[2rem] p-5 md:p-7 text-white shadow-xl">
          <div className="dashboard-pattern absolute inset-0 opacity-35" />
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-[#D4AF37]/30 blur-3xl" />
          <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-[#10B981]/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              {/* عکس پرسنلی داخل دایره با حاشیه طلایی - کلیک برای بزرگنمایی */}
              <div className="relative">
                <Avatar
                  className="h-24 w-24 shrink-0 cursor-pointer rounded-full border-4 border-[#D4AF37] bg-white/10 shadow-xl ring-4 ring-white/20 transition hover:scale-[1.02] hover:shadow-2xl"
                  onClick={() => avatarUrl && setShowAvatarDialog(true)}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={`عکس پرسنلی ${student.name}`}
                      className="h-full w-full rounded-full object-cover object-center"
                    />
                  ) : (
                    <AvatarFallback className="rounded-full bg-white/15 font-display text-2xl font-black text-[#D4AF37]">
                      {initials(student.name)}
                    </AvatarFallback>
                  )}
                </Avatar>
                {avatarUrl && (
                  <div className="pointer-events-none absolute -bottom-1 -right-1 rounded-full bg-[#D4AF37] p-1 shadow-md ring-2 ring-white">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-950" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <Badge className="border-[#D4AF37]/30 bg-white/10 text-amber-100 hover:bg-white/15">
                  داشبورد قرآن‌آموز
                </Badge>
                <h1 className="mt-2 font-display text-2xl font-black md:text-3xl">
                  {greetingByHour()}، {student.name} 🌙
                </h1>
                {classInfo && (
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50/80">
                    کلاس <span className="font-bold text-white">{classInfo.name}</span>
                    {classInfo.teacher && (
                      <>
                        {" "}
                        • استاد{" "}
                        <span className="font-bold text-amber-200">{classInfo.teacher}</span>
                      </>
                    )}
                    {classInfo.schedule && (
                      <>
                        {" "}
                        • <span className="text-xs">{classInfo.schedule}</span>
                      </>
                    )}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2 text-xs text-emerald-100/70">
                  <CalendarClock className="h-3.5 w-3.5" /> {iranDateTime.day} - {iranDateTime.time}
                </div>
                {achievements.some((item) => item.earned) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-emerald-100/70">نشان‌های منتخب:</span>
                    {achievements
                      .filter((item) => item.earned)
                      .slice(0, 3)
                      .map((item) => (
                        <Badge
                          key={item.id}
                          className="gap-1 border border-amber-200/30 bg-white/10 text-amber-100"
                        >
                          {item.icon}
                          {item.title}
                        </Badge>
                      ))}
                  </div>
                )}
                {pendingSubmissions.length > 0 && (
                  <div className="mt-3">
                    <Link to="/student/assignments">
                      <Badge className="gap-1 border-0 bg-amber-500 px-3 py-1.5 text-white hover:bg-amber-600">
                        <Bell className="h-3.5 w-3.5" /> {toFa(pendingSubmissions.length)} تکلیف در
                        انتظار ارسال
                      </Badge>
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="secondary"
              className="w-fit gap-2 rounded-2xl bg-[#D4AF37] text-emerald-950 hover:bg-[#D4AF37]/90"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}{" "}
              به‌روزرسانی
            </Button>
          </div>
        </section>

        {/* آمار کلی - 4 کارت مثل استاد */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <DashboardCard
            title="سطح فعلی"
            value={student.level ?? "—"}
            icon={<BookMarked className="h-6 w-6" />}
            tone="green"
            subtitle={classInfo?.name ? `کلاس ${classInfo.name}` : "سطح آموزشی"}
            onClick={() => setActiveDetail("class")}
          />
          <DashboardCard
            title="معدل"
            value={
              student.average_grade != null
                ? toFa(student.average_grade.toFixed(1))
                : chartStats
                  ? toFa(chartStats.avg)
                  : "—"
            }
            icon={<Award className="h-6 w-6" />}
            tone="gold"
            subtitle={chartStats ? `${toFa(chartStats.count)} نمره ثبت شده` : "میانگین نمرات"}
            onClick={() => setActiveDetail("grades")}
          />
          <DashboardCard
            title="درصد حضور"
            value={student.attendance_rate != null ? toFa(student.attendance_rate) + "٪" : "—"}
            icon={<Calendar className="h-6 w-6" />}
            tone="green"
            subtitle={`امروز: ${convertDigits(todayJalaliIran())}`}
            onClick={() => setActiveDetail("calendar")}
          />
          <DashboardCard
            title="تکالیف در انتظار"
            value={pendingSubmissions.length}
            icon={<ClipboardList className="h-6 w-6" />}
            tone={pendingSubmissions.length > 0 ? "warning" : "green"}
            subtitle={`${toFa(upcomingAssignments.length)} تکلیف فعال`}
            onClick={() => setActiveDetail("assignments")}
          />
        </div>

        {/* نمودار پیشرفت معدل - ویژگی جدید */}
        <Card className="dashboard-note-card overflow-hidden p-0">
          <div className="bg-gradient-to-l from-emerald-50 to-amber-50/70 p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h2 className="font-display flex items-center gap-2 text-lg font-black text-emerald-950">
                <BarChart3 className="h-5 w-5 text-[#D4AF37]" /> نمودار پیشرفت نمرات
              </h2>
              <div className="flex flex-wrap gap-2">
                {chartStats ? (
                  <>
                    <Badge variant="outline" className="border-emerald-200 bg-white">
                      میانگین: {toFa(chartStats.avg)} از ۲۰
                    </Badge>
                    <Badge variant="outline" className="border-amber-200 bg-white">
                      بهترین: {toFa(chartStats.best)}
                    </Badge>
                    <Badge variant="outline" className="border-blue-200 bg-white">
                      کمترین: {toFa(chartStats.worst)}
                    </Badge>
                    <Badge
                      className={
                        chartStats.trend >= 0
                          ? "bg-emerald-600 text-white border-0"
                          : "bg-rose-500 text-white border-0"
                      }
                    >
                      {chartStats.trend >= 0 ? (
                        <TrendingUp className="ml-1 h-3 w-3" />
                      ) : (
                        <TrendingDown className="ml-1 h-3 w-3" />
                      )}
                      {chartStats.trend >= 0 ? "روند صعودی" : "نیاز به تلاش"}{" "}
                      {toFa(chartStats.trend > 0 ? `+${chartStats.trend}` : chartStats.trend)}
                    </Badge>
                  </>
                ) : (
                  <Badge variant="outline" className="bg-white">
                    هنوز نمره‌ای ثبت نشده
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="p-4 md:p-5">
            {allGrades.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center">
                <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm text-muted-foreground">
                  هنوز نمره‌ای برای نمایش نمودار ثبت نشده است.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  به محض ثبت نمره توسط استاد، اینجا نمودار پیشرفت شما نمایش داده می‌شود.
                </p>
              </div>
            ) : (
              <>
                <GradeChart grades={allGrades} />
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <div className="text-xs text-muted-foreground">میانگین کل</div>
                    <div className="mt-1 font-display text-lg font-black text-emerald-900">
                      {chartStats ? toFa(chartStats.avg) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <div className="text-xs text-muted-foreground">بهترین نمره</div>
                    <div className="mt-1 font-display text-lg font-black text-[#7A5B10]">
                      {chartStats ? toFa(chartStats.best) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-blue-50 p-3">
                    <div className="text-xs text-muted-foreground">تعداد نمرات</div>
                    <div className="mt-1 font-display text-lg font-black text-blue-900">
                      {chartStats ? toFa(chartStats.count) : "—"}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* دسترسی سریع */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <QuickAccessCard
            href="/student/assignments"
            label="تکالیف"
            description={`${toFa(pendingSubmissions.length)} در انتظار`}
            icon={<ClipboardList className="h-5 w-5" />}
            color="amber"
          />
          <QuickAccessCard
            href="/student/grades"
            label="نمرات"
            description="کارنامه کامل + نمودار"
            icon={<Award className="h-5 w-5" />}
            color="gold"
          />
          <QuickAccessCard
            href="/student/attendance"
            label="حضور و غیاب"
            description="سابقه کامل"
            icon={<Calendar className="h-5 w-5" />}
            color="blue"
          />
          <QuickAccessCard
            href="/student/messages"
            label="پیام‌ها"
            description="ارتباط با استاد"
            icon={<MessageSquare className="h-5 w-5" />}
            color="primary"
          />
        </div>

        {/* نشان‌ها و افتخارات — ویترین کامل داخل داشبورد (به‌جای صفحه‌ی جداگانه) */}
        {student ? (
          <AchievementShowcaseCard
            studentId={student.id}
            title="🏅 نشان‌ها و افتخارات من"
            subtitle="نمای کامل افتخارات دریافت‌شده، سطح فعلی، تاریخچه‌ی سطح‌ها و پیشرفت تا سطح بعدی — همین‌جا در داشبورد شما."
          />
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* آخرین نمرات */}
          <Card className="dashboard-note-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display flex items-center gap-2 text-lg font-black text-emerald-950">
                <TrendingUp className="h-5 w-5 text-emerald-700" /> آخرین نمرات
              </h2>
              <Link to="/student/grades">
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  مشاهده همه <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
            {recentGrades.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                هنوز نمره‌ای ثبت نشده است.
              </p>
            ) : (
              <div className="space-y-2">
                {recentGrades.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between rounded-2xl border border-amber-100/60 bg-gradient-to-r from-white to-amber-50/60 p-3 transition hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-emerald-950">
                        {g.subject}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {g.teacher ? `استاد ${g.teacher}` : "—"} • {g.date}
                      </div>
                    </div>
                    <GradeBadge grade={g.grade} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* تکالیف پیش‌رو */}
          <Card className="dashboard-note-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display flex items-center gap-2 text-lg font-black text-emerald-950">
                <ClipboardList className="h-5 w-5 text-amber-600" /> تکالیف پیش‌رو
              </h2>
              <Link to="/student/assignments">
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  مشاهده همه <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
            {upcomingAssignments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                تکلیف فعالی ندارید. 🎉
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingAssignments.slice(0, 5).map((a) => {
                  const submitted =
                    pendingSubmissions.find((p) => p.assignment_id === a.id) === undefined;
                  return (
                    <Link
                      key={a.id}
                      to="/student/assignments"
                      className="flex items-center justify-between rounded-2xl border border-emerald-100/60 bg-gradient-to-r from-white to-emerald-50/50 p-3 transition hover:shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-emerald-950">
                            {a.title}
                          </span>
                          {submitted ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 py-0 text-[10px] text-emerald-700"
                            >
                              <CheckCircle2 className="ml-0.5 h-2.5 w-2.5" /> ارسال شد
                            </Badge>
                          ) : (
                            <Badge className="border-0 bg-amber-500 py-0 text-[10px] text-white">
                              در انتظار
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>مهلت: {a.due_date}</span>
                          {a.teacher_name && <span>• {a.teacher_name}</span>}
                        </div>
                      </div>
                      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <DetailDialog
          open={activeDetail !== null}
          onOpenChange={(o) => !o && setActiveDetail(null)}
          detail={activeDetail}
          recentGrades={recentGrades}
          allGrades={allGrades}
          upcomingAssignments={upcomingAssignments}
          pendingSubmissions={pendingSubmissions}
          iranDateTime={iranDateTime}
          classInfo={classInfo}
          student={student}
          achievements={achievements}
          attendanceHistory={attendanceHistory}
        />

        {/* دیالوگ بزرگنمایی عکس پرسنلی */}
        <Dialog open={showAvatarDialog} onOpenChange={setShowAvatarDialog}>
          <DialogContent className="max-w-sm bg-gradient-to-br from-white to-amber-50" dir="rtl">
            <DialogHeader>
              <DialogTitle>عکس پرسنلی</DialogTitle>
              <DialogDescription>
                {student.name} • کلاس {classInfo?.name ?? "—"}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-2">
              <div className="relative">
                <img
                  src={avatarUrl}
                  alt={student.name}
                  className="h-72 w-72 rounded-[1.5rem] border-4 border-[#D4AF37] object-cover shadow-xl"
                />
                <div className="absolute -bottom-2 -left-2 rounded-full bg-emerald-700 px-3 py-1 text-xs text-white shadow-md">
                  دارالقرآن الوالدین
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

/* ------------------ کامپوننت‌ها ------------------ */
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
      ? "from-[#D4AF37]/20 to-amber-50 text-[#7A5B10]"
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
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{subtitle}</p>
        </div>
        <div className={`rounded-xl bg-gradient-to-br ${toneClass} p-2.5 shadow-sm`}>{icon}</div>
      </div>
    </Card>
  );
}
function QuickAccessCard({
  href,
  label,
  description,
  icon,
  color,
}: {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
  color: "primary" | "gold" | "blue" | "amber";
}) {
  const colors = {
    primary: "from-emerald-50 to-teal-50/60 border-emerald-200/60 text-emerald-800",
    gold: "from-amber-50 to-yellow-50/60 border-amber-200/60 text-[#7A5B10]",
    blue: "from-blue-50 to-sky-50/60 border-blue-200/60 text-blue-700",
    amber: "from-orange-50 to-amber-50/60 border-orange-200/60 text-orange-700",
  }[color];
  return (
    <Link to={href}>
      <Card
        className={`h-full bg-gradient-to-br p-4 transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer rounded-[1.25rem] border ${colors}`}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-white p-2 shadow-sm">{icon}</div>
          <div className="min-w-0">
            <div className="font-display text-[13px] font-bold">{label}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
function GradeBadge({ grade }: { grade: number }) {
  let colorClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
  let icon = <TrendingUp className="h-3 w-3" />;
  if (grade < 10) {
    colorClass = "bg-rose-100 text-rose-700 border-rose-200";
    icon = <TrendingDown className="h-3 w-3" />;
  } else if (grade < 15) {
    colorClass = "bg-amber-100 text-amber-700 border-amber-200";
    icon = <AlertCircle className="h-3 w-3" />;
  }
  return (
    <Badge className={`${colorClass} gap-1 px-3 py-1 border`}>
      {icon}
      <span className="font-display">{toFa(grade.toFixed(1))}</span>
      <span className="text-xs opacity-70">/۲۰</span>
    </Badge>
  );
}

function AchievementCard({ ach }: { ach: Achievement }) {
  const colorMap: Record<string, string> = {
    gold: ach.earned
      ? "from-amber-100 to-yellow-50 border-amber-200 text-[#7A5B10] bg-gradient-to-br"
      : "from-gray-50 to-gray-50 border-gray-200 text-gray-400 bg-gray-50",
    emerald: ach.earned
      ? "from-emerald-100 to-teal-50 border-emerald-200 text-emerald-800 bg-gradient-to-br"
      : "from-gray-50 to-gray-50 border-gray-200 text-gray-400 bg-gray-50",
    blue: ach.earned
      ? "from-blue-100 to-sky-50 border-blue-200 text-blue-800 bg-gradient-to-br"
      : "from-gray-50 to-gray-50 border-gray-200 text-gray-400 bg-gray-50",
    orange: ach.earned
      ? "from-orange-100 to-amber-50 border-orange-200 text-orange-800 bg-gradient-to-br"
      : "from-gray-50 to-gray-50 border-gray-200 text-gray-400 bg-gray-50",
    purple: ach.earned
      ? "from-purple-100 to-fuchsia-50 border-purple-200 text-purple-800 bg-gradient-to-br"
      : "from-gray-50 to-gray-50 border-gray-200 text-gray-400 bg-gray-50",
    gray: "from-gray-50 to-gray-50 border-gray-200 text-gray-400 bg-gray-50",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-[1.25rem] border p-3 shadow-sm transition hover:shadow-md ${colorMap[ach.color]}`}
    >
      {!ach.earned && (
        <div className="absolute top-2 left-2">
          <Lock className="h-3.5 w-3.5 text-gray-400" />
        </div>
      )}
      <div className="flex items-start gap-2.5">
        <div
          className={`shrink-0 rounded-xl p-2 ${ach.earned ? "bg-white shadow-sm" : "bg-gray-100"}`}
        >
          {ach.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[12px] font-bold leading-4">{ach.title}</div>
          <div className="mt-0.5 text-[10px] leading-4 opacity-80">{ach.description}</div>
          {ach.progress && <div className="mt-1 text-[10px] font-medium">{ach.progress}</div>}
        </div>
      </div>
      {ach.earned && (
        <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> کسب شد
        </div>
      )}
    </div>
  );
}

/* نمودار ساده SVG بدون نیاز به کتابخانه */
function GradeChart({ grades }: { grades: RecentGrade[] }) {
  const sorted = [...grades]
    .sort((a, b) => String(a.created_at ?? a.date).localeCompare(String(b.created_at ?? b.date)))
    .slice(-12);
  if (sorted.length === 0) return null;
  const max = 20;
  const width = 600;
  const height = 180;
  const padding = 30;
  const stepX = (width - padding * 2) / Math.max(1, sorted.length - 1);

  const points = sorted.map((g, i) => {
    const x = padding + i * stepX;
    const y = height - padding - (Number(g.grade) / max) * (height - padding * 2);
    return { x, y, grade: g.grade, label: g.subject, date: g.date };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[200px] w-full min-w-[500px]">
        {/* grid */}
        {[0, 5, 10, 15, 20].map((v) => {
          const y = height - padding - (v / max) * (height - padding * 2);
          return (
            <g key={v}>
              <line
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="#E7E5E4"
                strokeDasharray="4 4"
              />
              <text x={padding - 6} y={y + 3} fontSize="10" textAnchor="end" fill="#A8A29E">
                {toFa(v)}
              </text>
            </g>
          );
        })}
        {/* area */}
        <path d={areaD} fill="url(#grad)" opacity={0.25} />
        {/* line */}
        <path
          d={pathD}
          fill="none"
          stroke="#059669"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={6} fill="white" stroke="#D4AF37" strokeWidth={2} />
            <circle cx={p.x} cy={p.y} r={3} fill="#059669" />
            <text
              x={p.x}
              y={height - 4}
              fontSize="9"
              textAnchor="middle"
              fill="#57534E"
              className="font-medium"
            >
              {p.label.slice(0, 8)}
            </text>
          </g>
        ))}
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.05} />
          </linearGradient>
        </defs>
      </svg>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {sorted.map((g) => (
          <div
            key={g.id}
            className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-800"
          >
            {g.subject}: {toFa(g.grade)}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailDialog({
  open,
  onOpenChange,
  detail,
  recentGrades,
  allGrades,
  upcomingAssignments,
  pendingSubmissions,
  iranDateTime,
  classInfo,
  student,
  achievements,
  attendanceHistory,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: DetailKey;
  recentGrades: RecentGrade[];
  allGrades: RecentGrade[];
  upcomingAssignments: UpcomingAssignment[];
  pendingSubmissions: PendingSubmission[];
  iranDateTime: { day: string; time: string };
  classInfo: { name: string; teacher: string | null; schedule: string | null } | null;
  student: CurrentStudent | null;
  achievements?: Achievement[];
  attendanceHistory?: AttendanceRow[];
}) {
  const titleMap: Record<string, string> = {
    grades: "نمرات",
    assignments: "تکالیف",
    calendar: "تقویم",
    class: "کلاس من",
    chart: "نمودار پیشرفت",
    achievements: "نشان‌ها و افتخارات",
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{detail ? (titleMap[detail] ?? "جزئیات") : "جزئیات"}</DialogTitle>
          <DialogDescription>{student?.name}</DialogDescription>
        </DialogHeader>
        {detail === "calendar" && (
          <div className="rounded-2xl border bg-emerald-50/60 p-6 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-emerald-700" />
            <div className="mt-4 font-display text-3xl font-black text-emerald-950">
              {iranDateTime.time}
            </div>
            <div className="mt-2 text-muted-foreground">{iranDateTime.day}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              امروز: {convertDigits(todayJalaliIran())}
            </div>
            {attendanceHistory && attendanceHistory.length > 0 && (
              <div className="mt-4 text-right">
                <div className="text-sm font-bold">۳۰ روز اخیر:</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {attendanceHistory.slice(0, 30).map((a, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className={
                        String(a.status).toLowerCase().includes("absent") || a.is_absent
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }
                    >
                      {a.date?.slice(5) ?? toFa(i + 1)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {detail === "class" && (
          <div className="rounded-2xl border bg-gradient-to-br from-white to-amber-50 p-4">
            <div className="font-bold text-emerald-950">کلاس: {classInfo?.name ?? "—"}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              استاد: {classInfo?.teacher ?? "—"}
            </div>
            {classInfo?.schedule && (
              <div className="mt-1 text-xs text-muted-foreground">زمان: {classInfo.schedule}</div>
            )}
          </div>
        )}
        {detail === "grades" && (
          <div className="space-y-2">
            {recentGrades.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-2xl border bg-card p-3"
              >
                <div>
                  <div className="font-medium">{g.subject}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {g.teacher} • {g.date}
                  </div>
                </div>
                <GradeBadge grade={g.grade} />
              </div>
            ))}
            <Link to="/student/grades">
              <Button className="w-full mt-2" variant="outline">
                مشاهده همه نمرات
              </Button>
            </Link>
          </div>
        )}
        {detail === "chart" && (
          <div>
            <GradeChart grades={allGrades} />
          </div>
        )}
        {detail === "assignments" && (
          <div className="space-y-2">
            {upcomingAssignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-2xl border bg-card p-3"
              >
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">مهلت: {a.due_date}</div>
                </div>
                <Badge
                  className={
                    pendingSubmissions.find((p) => p.assignment_id === a.id)
                      ? "bg-amber-500 text-white border-0"
                      : "bg-emerald-600 text-white border-0"
                  }
                >
                  {pendingSubmissions.find((p) => p.assignment_id === a.id)
                    ? "در انتظار"
                    : "ارسال شد"}
                </Badge>
              </div>
            ))}
          </div>
        )}
        {detail === "achievements" && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {(achievements ?? []).map((ach) => (
              <AchievementCard key={ach.id} ach={ach} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const dashboardStyle = `
.student-dashboard-page { --dashboard-green: #064E3B; --dashboard-gold: #D4AF37; }
.dashboard-hero {
  background:
    radial-gradient(circle at 15% 20%, rgba(212, 175, 55, 0.28), transparent 30%),
    radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.18), transparent 28%),
    linear-gradient(135deg, #064E3B 0%, #065F46 48%, #047857 100%);
}
.dashboard-pattern, .dashboard-card-pattern {
  background-image:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,.22) 0 2px, transparent 2.8px),
    linear-gradient(45deg, transparent 0 48%, rgba(255,255,255,.10) 49% 50%, transparent 51%);
  background-size: 72px 72px, 36px 36px;
}
.dashboard-stat-card, .dashboard-note-card {
  border: 1px solid rgba(212, 175, 55, 0.16);
  background: linear-gradient(135deg, #ffffff, #FFF8E7 120%);
  border-radius: 1.75rem;
}
.dashboard-hero img { display: block; }
`;
