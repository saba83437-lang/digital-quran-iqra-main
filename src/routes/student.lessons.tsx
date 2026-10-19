// ============================================================
// پنل قرآن‌آموز - صفحه کلاس من v54
// مسیر مقصد: src/routes/student.lessons.tsx  (Route: /student/lessons)
// بازطراحی بر اساس داشبورد استاد/قرآن‌آموز v54 + عکس‌ها با Signed URL
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  BookOpen,
  Calendar,
  Loader2,
  User,
  Users,
  Clock,
  GraduationCap,
  MapPin,
  Sparkles,
  BookMarked,
  RefreshCw,
  CalendarClock,
  Crown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { displayTeacherName } from "@/lib/display";
import { getCurrentStudent, type CurrentStudent } from "@/lib/student-utils";
import { toast } from "sonner";
import { ClassSyllabusPanel } from "@/features/syllabus/class-syllabus-panel";

export const Route = createFileRoute("/student/lessons")({
  head: () => ({
    meta: [
      { title: "کلاس من — دارالقرآن الوالدین" },
      { name: "description", content: "اطلاعات کلاس، استاد و هم‌کلاسی‌ها با طراحی v54" },
    ],
  }),
  component: StudentLessons,
});

/* ------------------ ثابت‌ها و کمکی ------------------ */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const STUDENT_FILES_BUCKET = "student-files";

function toFa(n: number | string | null | undefined): string {
  if (n == null) return "—";
  return String(n).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
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
    if (v.includes(STUDENT_FILES_BUCKET)) return v;
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
  if (/^https?:\/\//i.test(raw) && !raw.includes(STUDENT_FILES_BUCKET)) {
    if (!raw.includes("supabase.co/storage")) return raw;
  }
  const path = getStoragePath(raw);
  if (!path) {
    if (/^https?:\/\//i.test(raw)) return raw;
    return "";
  }
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage.from(STUDENT_FILES_BUCKET).createSignedUrl(path, 60 * 25);
  if (error) {
    const { data: pub } = supabase.storage.from(STUDENT_FILES_BUCKET).getPublicUrl(path);
    if (pub?.publicUrl) return pub.publicUrl;
    return raw;
  }
  return data.signedUrl;
}
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

/* ------------------ انواع ------------------ */
interface ClassInfo {
  id: string;
  name: string;
  level: string | null;
  schedule: string | null;
  capacity: number | null;
  enrolled: number | null;
  teacher_id: string | null;
  term?: string | null;
  academic_year?: string | null;
}
interface TeacherInfo {
  id: string;
  name: string;
  specialty: string | null;
  avatar: string | null;
  avatar_url: string | null;
  resolvedAvatar?: string;
}
interface Classmate {
  id: string;
  name: string;
  level: string | null;
  avatar_url: string | null;
  resolvedAvatar?: string;
}

function classTermLabel(term?: string | null): string {
  if (term === "term1") return "ترم اول";
  if (term === "term2") return "ترم دوم";
  if (term === "summer") return "تابستان";
  return term || "ثبت نشده";
}

/* ------------------ صفحه ------------------ */
function StudentLessons() {
  const [student, setStudent] = useState<CurrentStudent | null>(null);
  const [studentAvatar, setStudentAvatar] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [teacher, setTeacher] = useState<TeacherInfo | null>(null);
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [selectedClassmate, setSelectedClassmate] = useState<Classmate | null>(null);

  const iranDateTime = useMemo(() => formatIranDateTime(now), [now]);

  useEffect(() => {
    (async () => {
      try {
        const s = await getCurrentStudent();
        setStudent(s);
        if (s) {
          // عکس خود قرآن‌آموز
          let raw = extractAvatarFromRow(s as any);
          if (!raw) {
            const { data: fullRow } = await supabase
              .from("students")
              .select("id, avatar_url, poster_avatar_url")
              .eq("id", s.id)
              .maybeSingle();
            raw = extractAvatarFromRow(fullRow);
          }
          if (raw) setStudentAvatar(await resolveAvatarUrl(raw));
          if (s.class_id) await loadClassData(s);
        }
      } catch (err) {
        console.error("[student lessons] خطا:", err);
      }
      setLoading(false);
    })();
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleRefresh() {
    if (!student?.class_id) return;
    setRefreshing(true);
    try {
      await loadClassData(student);
      toast.success("اطلاعات کلاس به‌روزرسانی شد");
    } catch {
      toast.error("خطا در به‌روزرسانی");
    }
    setRefreshing(false);
  }

  async function loadClassData(s: CurrentStudent) {
    // 1. اطلاعات کلاس - تمام ستون‌ها تا اگر capacity/enrolled نبود مشکلی پیش نیاید
    const { data: cls, error: clsErr } = await supabase
      .from("classes")
      .select("id, name, level, schedule, capacity, teacher_id, term, academic_year")
      .eq("id", s.class_id)
      .maybeSingle();
    if (clsErr) console.warn("class fetch error", clsErr);

    // مقدار اولیه کلاس (enrolled موقتاً null تا بعداً با تعداد واقعی پر شود)
    const initialClass: ClassInfo = {
      id: (cls as any)?.id ?? s.class_id,
      name: (cls as any)?.name ?? (s as any).class_name ?? "—",
      level: (cls as any)?.level ?? (s as any).level ?? null,
      schedule: (cls as any)?.schedule ?? null,
      capacity: (cls as any)?.capacity ?? null,
      enrolled: null, // فعلاً خالی - بعداً با تعداد واقعی پر می‌کنیم
      teacher_id: (cls as any)?.teacher_id ?? null,
      term: (cls as any)?.term ?? null,
      academic_year: (cls as any)?.academic_year ?? null,
    };
    setClassInfo(initialClass);

    // 2. استاد کلاس + عکس
    if ((cls as any)?.teacher_id) {
      const { data: t } = await supabase
        .from("teachers")
        .select("id, name, specialty, avatar, avatar_url")
        .eq("id", (cls as any).teacher_id)
        .maybeSingle();
      if (t) {
        const rawAvatar = extractAvatarFromRow(t as any) ?? (t as any).avatar_url ?? null;
        const resolved = rawAvatar ? await resolveAvatarUrl(rawAvatar) : "";
        setTeacher({ ...(t as any), resolvedAvatar: resolved } as TeacherInfo);
      }
    }

    // 3. هم‌کلاسی‌ها + عکس‌ها با Signed URL + محاسبه تعداد واقعی کلاس
    const { data: mates, count: matesCountExact } = await supabase
      .from("students")
      .select("id, name, level, avatar_url, poster_avatar_url", { count: "exact" })
      .eq("class_id", s.class_id)
      .neq("id", s.id)
      .order("name");

    // تعداد کل واقعی (خودت + هم‌کلاسی‌ها) - این عدد درست است نه ستون قدیمی enrolled
    // اگر matesCountExact داشتیم، کل = matesCountExact + 1 (خودت)، وگرنه از طول آرایه
    let actualClassmates: any[] = (mates as any[]) ?? [];
    let actualEnrolled = actualClassmates.length + 1;
    // برای اطمینان بیشتر، یک count کلی هم بگیریم
    try {
      const { count: totalCount } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("class_id", s.class_id);
      if (totalCount && totalCount > 0) actualEnrolled = totalCount;
    } catch {}

    // حالا classInfo را با تعداد واقعی به‌روزرسانی کن (ظرفیت از دیتابیس اگر بود همان بماند)
    setClassInfo((prev) => ({
      ...(prev ?? initialClass),
      enrolled: actualEnrolled,
      capacity: (cls as any)?.capacity ?? prev?.capacity ?? null,
    }));

    if (actualClassmates.length > 0) {
      const withAvatars = await Promise.all(
        actualClassmates.map(async (m: any) => {
          const raw = extractAvatarFromRow(m);
          const resolved = raw ? await resolveAvatarUrl(raw) : "";
          return {
            id: m.id,
            name: m.name,
            level: m.level ?? null,
            avatar_url: raw,
            resolvedAvatar: resolved,
          } as Classmate;
        })
      );
      setClassmates(withAvatars);
    } else {
      setClassmates([]);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری کلاس...</span>
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

  if (!student.class_id || !classInfo) {
    return (
      <div className="space-y-5" dir="rtl">
        <style>{style}</style>
        <section className="dashboard-hero relative overflow-hidden rounded-[2rem] p-6 text-white shadow-xl">
          <div className="dashboard-pattern absolute inset-0 opacity-35" />
          <h2 className="relative font-display text-2xl font-black">کلاس من</h2>
          <p className="relative mt-2 text-sm text-emerald-50/80">جزئیات کلاس، استاد، هم‌کلاسی‌ها و سرفصل‌های درسی.</p>
        </section>
        <Card className="dashboard-note-card p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <h3 className="font-display text-lg font-bold text-emerald-950">هنوز در هیچ کلاسی ثبت‌نام نشده‌اید</h3>
          <p className="mt-1 text-sm text-muted-foreground">لطفاً با مدیر سیستم تماس بگیرید.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Badge variant="outline" className="bg-white">امروز: {todayJalaliIran()}</Badge>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <style>{style}</style>
      <div className="student-class-page space-y-5" dir="rtl">
        {/* HERO - کلاس */}
        <section className="dashboard-hero relative overflow-hidden rounded-[2rem] p-5 md:p-7 text-white shadow-xl">
          <div className="dashboard-pattern absolute inset-0 opacity-35" />
          <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-[#D4AF37]/30 blur-3xl" />
          <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-[#10B981]/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4">
              {/* آواتار قرآن‌آموز با حاشیه طلایی */}
              <Avatar className="h-20 w-20 shrink-0 rounded-full border-4 border-[#D4AF37] bg-white/10 shadow-xl ring-4 ring-white/20">
                {studentAvatar ? <img src={studentAvatar} alt={student.name} className="h-full w-full rounded-full object-cover object-center" /> : <AvatarFallback className="rounded-full bg-white/15 font-display text-xl font-black text-[#D4AF37]">{initials(student.name)}</AvatarFallback>}
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-[#D4AF37]/30 bg-white/10 text-amber-100 hover:bg-white/15">کلاس من</Badge>
                  {classInfo.level && <Badge className="border-0 bg-[#D4AF37] text-emerald-950">{classInfo.level}</Badge>}
                  {classInfo.academic_year && <Badge variant="outline" className="border-white/20 bg-white/5 text-white">{toFa(classInfo.academic_year)}</Badge>}
                </div>
                <h1 className="mt-3 font-display text-3xl font-black md:text-4xl">{classInfo.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-emerald-50/80">
                  {classInfo.schedule && <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-amber-200" /> {classInfo.schedule}</span>}
                  {classInfo.enrolled != null && <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-amber-200" /> {toFa(classInfo.enrolled)} قرآن‌آموز</span>}
                  {classInfo.term && <span className="flex items-center gap-1.5"><BookMarked className="h-4 w-4 text-amber-200" /> {classInfo.term}</span>}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-emerald-100/60"><CalendarClock className="h-3.5 w-3.5" /> {iranDateTime.day} • {iranDateTime.time}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleRefresh} disabled={refreshing} variant="secondary" className="gap-2 rounded-2xl bg-[#D4AF37] text-emerald-950 hover:bg-[#D4AF37]/90">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} به‌روزرسانی
              </Button>
              <Link to="/student"><Button variant="outline" className="gap-2 rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white/15"><BookOpen className="h-4 w-4" /> داشبورد</Button></Link>
            </div>
          </div>

          {/* استاد داخل هرو */}
          {teacher && (
            <div className="relative mt-6 rounded-[1.5rem] border border-white/10 bg-white/10 p-4 backdrop-blur-md">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 shrink-0 rounded-full border-2 border-[#D4AF37] bg-white/10 shadow-lg">
                  {teacher.resolvedAvatar ? <img src={teacher.resolvedAvatar} alt={teacher.name} className="h-full w-full rounded-full object-cover" /> : <AvatarFallback className="rounded-full bg-white/15 font-bold text-amber-200">{initials(teacher.name)}</AvatarFallback>}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-emerald-100/70">استاد کلاس</p>
                  <p className="font-display text-lg font-bold text-white">{displayTeacherName(teacher.name)}</p>
                  {teacher.specialty && <p className="mt-0.5 text-xs text-amber-100/80">{teacher.specialty}</p>}
                </div>
                <Crown className="h-5 w-5 text-[#D4AF37]" />
              </div>
            </div>
          )}
        </section>

        {/* 4 کارت آمار کلاس */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ClassStatCard title="سطح کلاس" value={classInfo.level ?? "—"} icon={<GraduationCap className="h-5 w-5" />} tone="gold" subtitle="سطح آموزشی" />
          <ClassStatCard title="تعداد هم‌کلاسی" value={toFa(classmates.length)} icon={<Users className="h-5 w-5" />} tone="green" subtitle={`کل: ${toFa((classInfo.enrolled ?? classmates.length + 1))} نفر`} />
          <ClassStatCard title="ظرفیت" value={classInfo.capacity ? `${toFa(classInfo.enrolled ?? 0)} / ${toFa(classInfo.capacity)}` : toFa(classInfo.enrolled ?? classmates.length + 1)} icon={<MapPin className="h-5 w-5" />} tone="green" subtitle={classInfo.schedule ? "ظرفیت کلاس" : "تعداد ثبت‌نامی"} />
          <ClassStatCard title="ترم آموزشی" value={classTermLabel(classInfo.term)} icon={<CalendarClock className="h-5 w-5" />} tone="gold" subtitle={classInfo.academic_year ? `سال ${toFa(classInfo.academic_year)}` : "سال تحصیلی ثبت نشده"} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ClassSyllabusPanel
              classId={classInfo.id}
              title={`برنامه آموزشی ${classInfo.name}`}
            />
          </div>

          {/* هم‌کلاسی‌ها + اطلاعات تکمیلی */}
          <div className="space-y-5">
            <Card className="dashboard-note-card overflow-hidden p-0">
              <div className="bg-gradient-to-l from-emerald-50 to-amber-50/70 p-4">
                <h3 className="font-display flex items-center gap-2 text-base font-black text-emerald-950"><Users className="h-4 w-4 text-[#D4AF37]" /> هم‌کلاسی‌ها <Badge variant="outline" className="mr-2 bg-white">{toFa(classmates.length)}</Badge></h3>
              </div>
              <div className="p-4">
                {classmates.length === 0 ? (
                  <div className="py-10 text-center">
                    <Users className="mx-auto h-10 w-10 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">هنوز هم‌کلاسی دیگری ثبت نشده است.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                    {classmates.map((c) => (
                      <div key={c.id} onClick={() => setSelectedClassmate(c)} className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-100/50 bg-gradient-to-r from-white to-amber-50/40 p-2.5 transition hover:-translate-y-px hover:shadow-sm">
                        <Avatar className="h-10 w-10 shrink-0 rounded-full border-2 border-[#D4AF37]/50 shadow-sm transition group-hover:border-[#D4AF37]">
                          {c.resolvedAvatar ? <img src={c.resolvedAvatar} alt={c.name} className="h-full w-full rounded-full object-cover object-center" /> : <AvatarFallback className="rounded-full bg-emerald-50 text-xs font-bold text-emerald-800">{initials(c.name)}</AvatarFallback>}
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-emerald-950">{c.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{c.level ?? "—"}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0 bg-white text-[10px]">هم‌کلاسی</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card className="dashboard-note-card p-4">
              <h3 className="font-display flex items-center gap-2 text-sm font-black text-emerald-950"><BookMarked className="h-4 w-4 text-emerald-700" /> اطلاعات تکمیلی کلاس</h3>
              <div className="mt-3 space-y-2.5 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-emerald-50/70 px-3 py-2"><span className="text-muted-foreground">نام کلاس</span><span className="font-bold text-emerald-950">{classInfo.name}</span></div>
                <div className="flex items-center justify-between rounded-xl bg-amber-50/70 px-3 py-2"><span className="text-muted-foreground">سطح</span><span className="font-bold text-[#7A5B10]">{classInfo.level ?? "—"}</span></div>
                <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 border"><span className="text-muted-foreground">برنامه</span><span className="font-medium text-emerald-950">{classInfo.schedule ?? "—"}</span></div>
                <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 border"><span className="text-muted-foreground">سال تحصیلی</span><span className="font-medium">{classInfo.academic_year ? toFa(classInfo.academic_year) : "—"}</span></div>
                <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 border"><span className="text-muted-foreground">امروز</span><span className="font-medium">{todayJalaliIran()}</span></div>
              </div>
            </Card>
          </div>
        </div>

        {/* دیالوگ هم‌کلاسی */}
        <Dialog open={!!selectedClassmate} onOpenChange={(o) => !o && setSelectedClassmate(null)}>
          <DialogContent className="max-w-sm bg-gradient-to-br from-white to-amber-50" dir="rtl">
            <DialogHeader>
              <DialogTitle>{selectedClassmate?.name}</DialogTitle>
              <DialogDescription>هم‌کلاسی شما در {classInfo.name}</DialogDescription>
            </DialogHeader>
            {selectedClassmate && (
              <div className="flex flex-col items-center gap-3 py-2">
                <Avatar className="h-24 w-24 rounded-full border-4 border-[#D4AF37] shadow-xl">
                  {selectedClassmate.resolvedAvatar ? <img src={selectedClassmate.resolvedAvatar} alt={selectedClassmate.name} className="h-full w-full rounded-full object-cover" /> : <AvatarFallback className="rounded-full bg-emerald-50 text-xl font-black text-emerald-800">{initials(selectedClassmate.name)}</AvatarFallback>}
                </Avatar>
                <div className="text-center">
                  <div className="font-display text-lg font-black text-emerald-950">{selectedClassmate.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{selectedClassmate.level ?? "—"}</div>
                  <Badge className="mt-2 bg-emerald-600 text-white border-0">هم‌کلاسی</Badge>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

/* ------------------ کامپوننت آمار ------------------ */
function ClassStatCard({ title, value, icon, subtitle, tone }: { title: string; value: string; icon: React.ReactNode; subtitle: string; tone: "green" | "gold"; }) {
  const toneClass = tone === "gold" ? "from-[#D4AF37]/20 to-amber-50 text-[#7A5B10]" : "from-emerald-100 to-teal-50 text-emerald-800";
  return (
    <Card className="dashboard-stat-card group relative overflow-hidden p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="dashboard-card-pattern absolute inset-0 opacity-25" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <div className="mt-2 font-display text-xl font-black text-emerald-950">{value}</div>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{subtitle}</p>
        </div>
        <div className={`rounded-xl bg-gradient-to-br ${toneClass} p-2.5 shadow-sm`}>{icon}</div>
      </div>
    </Card>
  );
}

const style = `
.student-class-page { --dashboard-green: #064E3B; --dashboard-gold: #D4AF37; }
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
