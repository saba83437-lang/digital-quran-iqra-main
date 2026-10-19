import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Users,
  BookOpen,
  Loader2,
  CalendarDays,
  Clock3,
  GraduationCap,
  Phone,
  User,
  Search,
  ChevronLeft,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { getCurrentTeacher, type CurrentTeacher } from "@/lib/teacher-utils";
import { loadSecureTeacherStudents } from "@/features/identity/api/secure-identity-api";

export const Route = createFileRoute("/teacher/")({
  head: () => ({
    meta: [
      { title: "کلاس‌های من — بِرّ الوالدین" },
      { name: "description", content: "کلاس‌های تخصیص داده شده به استاد" },
    ],
  }),
  component: TeacherHome,
});

interface ClassRow {
  id: string;
  name: string;
  level: string;
  schedule: string;
  enrolled: number;
}

interface StudentRow {
  id: string;
  name: string;
  level?: string | null;
  phone?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  class_id: string | null;
}

function initials(name: string): string {
  const clean = String(name ?? "").trim();
  if (!clean) return "ق";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0);
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
}

function convertDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function splitSchedule(schedule: string | null | undefined): { days: string; time: string } {
  const raw = String(schedule ?? "").trim();
  if (!raw) return { days: "ثبت نشده", time: "ثبت نشده" };

  const timeMatch = raw.match(/([۰-۹0-9]{1,2}[:٫.][۰-۹0-9]{2}\s*(?:تا|-| الی )\s*[۰-۹0-9]{1,2}[:٫.][۰-۹0-9]{2}|[۰-۹0-9]{1,2}[:٫.][۰-۹0-9]{2})/);
  const time = timeMatch?.[0]?.trim() ?? raw;
  const days = timeMatch ? raw.replace(timeMatch[0], "").replace(/[،,\-–—|]+$/g, "").trim() : raw;

  return {
    days: days || "طبق برنامه کلاس",
    time: time || "ثبت نشده",
  };
}

function TeacherHome() {
  const [teacher, setTeacher] = useState<CurrentTeacher | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [selectedClass, setSelectedClass] = useState<ClassRow | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getCurrentTeacher();
      setTeacher(t);
      if (t) {
        const { data: cls } = await supabase
          .from("classes")
          .select("id, name, level, schedule")
          .eq("teacher_id", t.id)
          .order("name");

        // شناسه‌های bigint در Supabase ممکن است number برگردند؛ برای شمارش و
        // مقایسه با خروجی JSON RPC همه شناسه‌ها را یک‌بار رشته‌ای می‌کنیم.
        const classList = ((cls ?? []) as any[]).map((c) => ({
          ...c,
          id: String(c.id),
          enrolled: 0,
        })) as ClassRow[];
        const classIds = new Set(classList.map((c) => c.id));

        if (classIds.size > 0) {
          const secureStudents = await loadSecureTeacherStudents();
          const studentData = secureStudents.filter((student) =>
            classIds.has(String(student.class_id ?? "")),
          );

          const studentList = studentData.map((s) => ({
            id: String(s.id),
            name: s.name ?? "بدون نام",
            level: s.level ?? null,
            phone: s.phone ?? null,
            parent_name: s.parent_name ?? null,
            parent_phone: s.parent_phone ?? null,
            class_id: s.class_id ? String(s.class_id) : null,
          })) as StudentRow[];

          const counts: Record<string, number> = {};
          for (const s of studentList) {
            if (!s.class_id) continue;
            counts[s.class_id] = (counts[s.class_id] ?? 0) + 1;
          }

          setStudents(studentList);
          setClasses(classList.map((c) => ({ ...c, enrolled: counts[c.id] ?? 0 })));
          setStudentCount(Object.values(counts).reduce((a, b) => a + b, 0));
        } else {
          setClasses(classList);
          setStudents([]);
          setStudentCount(0);
        }
      }
      setLoading(false);
    })();
  }, []);

  const selectedClassStudents = useMemo(() => {
    if (!selectedClass) return [];
    const q = studentSearch.trim();
    return students.filter((student) => {
      const sameClass = String(student.class_id ?? "") === String(selectedClass.id);
      if (!sameClass) return false;
      if (!q) return true;
      return (
        student.name.includes(q) ||
        String(student.phone ?? "").includes(q) ||
        String(student.parent_name ?? "").includes(q) ||
        String(student.parent_phone ?? "").includes(q)
      );
    });
  }, [selectedClass, studentSearch, students]);

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
      <style>{teacherClassesStyle}</style>
      <PageHeader
        title={`السلام علیکم، ${teacher?.name ?? "استاد"}`}
        description="نمای کلی کلاس‌ها و وظایف امروز شما در مرکز قرآن بِرّ الوالدین."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="کلاس‌های فعال" value={classes.length} icon={<BookOpen className="h-5 w-5" />} tone="primary" />
        <StatCard label="قرآن آموزان من" value={studentCount} icon={<Users className="h-5 w-5" />} tone="gold" />
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display text-xl text-foreground">کلاس‌های من</h2>
        <Badge variant="outline" className="border-[#D4AF37]/30 bg-amber-50 text-[#7A5B10]">
          برای مشاهده جزئیات، روی کارت کلاس کلیک کنید
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map((c) => {
          const schedule = splitSchedule(c.schedule);
          return (
            <button key={c.id} onClick={() => { setSelectedClass(c); setStudentSearch(""); }} className="text-right group">
              <Card className="class-card overflow-hidden border-border/70 shadow-card hover:shadow-soft transition group-hover:-translate-y-1 duration-200">
                <div className="class-card-header p-4 text-primary-foreground">
                  <Badge className="bg-gold text-gold-foreground border-0 mb-2">{c.level}</Badge>
                  <h3 className="font-display text-lg leading-tight">{c.name}</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white/12 p-2 backdrop-blur-sm">
                      <CalendarDays className="mb-1 h-3.5 w-3.5 text-gold" />
                      <span className="block text-primary-foreground/70">روزها</span>
                      <b className="block truncate">{schedule.days}</b>
                    </div>
                    <div className="rounded-xl bg-white/12 p-2 backdrop-blur-sm">
                      <Clock3 className="mb-1 h-3.5 w-3.5 text-gold" />
                      <span className="block text-primary-foreground/70">ساعت</span>
                      <b className="block truncate">{schedule.time}</b>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{convertDigits(c.enrolled)} قرآن‌آموز</span>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground transition group-hover:-translate-x-1 group-hover:text-primary" />
                  </div>
                  <Button type="button" variant="outline" className="w-full gap-2 pointer-events-none group-hover:border-primary group-hover:text-primary">
                    مشاهده اطلاعات کلاس
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            </button>
          );
        })}
        {classes.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground col-span-full">
            هنوز کلاسی به شما اختصاص داده نشده است.
          </Card>
        )}
      </div>

      <Dialog open={!!selectedClass} onOpenChange={(open) => !open && setSelectedClass(null)}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto" dir="rtl">
          {selectedClass && (
            <ClassDetailsPanel
              classItem={selectedClass}
              students={selectedClassStudents}
              search={studentSearch}
              onSearchChange={setStudentSearch}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClassDetailsPanel({
  classItem,
  students,
  search,
  onSearchChange,
}: {
  classItem: ClassRow;
  students: StudentRow[];
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const schedule = splitSchedule(classItem.schedule);

  return (
    <div className="class-details overflow-hidden rounded-2xl">
      <div className="details-hero relative overflow-hidden p-5 text-white">
        <div className="details-pattern absolute inset-0 opacity-35" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <DialogHeader className="p-0 text-right">
              <DialogTitle className="font-display text-2xl font-black">{classItem.name}</DialogTitle>
            </DialogHeader>
            <DialogDescription className="mt-2 text-emerald-50/75">
              فهرست قرآن‌آموزان این کلاس و برنامه برگزاری آن
            </DialogDescription>
          </div>
          <Badge className="w-fit bg-gold text-gold-foreground border-0">{classItem.level}</Badge>
        </div>
      </div>

      <div className="bg-[#FFF8E7]/70 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <InfoCard icon={<CalendarDays className="h-5 w-5" />} title="روزهای کلاس" value={schedule.days} />
          <InfoCard icon={<Clock3 className="h-5 w-5" />} title="ساعت کلاس" value={schedule.time} />
          <InfoCard icon={<Users className="h-5 w-5" />} title="تعداد قرآن‌آموزان" value={`${convertDigits(students.length)} نفر`} />
        </div>

        <Card className="overflow-hidden border-[#D4AF37]/20 bg-white/85">
          <div className="border-b bg-[#064E3B] p-4 text-white">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="font-display text-lg font-black">قرآن‌آموزان کلاس</h3>
                <p className="mt-1 text-xs text-emerald-50/70">جدول اطلاعات قرآن‌آموزان ثبت‌شده در این کلاس</p>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="جستجوی قرآن‌آموز..."
                  className="bg-white pr-9 text-foreground"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr className="bg-emerald-50 text-emerald-950/70">
                  <th className="p-3 text-right w-20">ردیف</th>
                  <th className="p-3 text-right">نام قرآن‌آموز</th>
                  <th className="p-3 text-right">سطح</th>
                  <th className="p-3 text-right">شماره تماس</th>
                  <th className="p-3 text-right">نام ولی</th>
                  <th className="p-3 text-right">شماره ولی</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">قرآن‌آموزی برای این کلاس ثبت نشده است.</td>
                  </tr>
                ) : (
                  students.map((student, index) => (
                    <tr key={student.id} className="border-t transition-colors hover:bg-emerald-50/40">
                      <td className="p-3 text-muted-foreground">{convertDigits(index + 1)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-9 w-9 border border-[#D4AF37]/30">
                            <AvatarFallback className="bg-emerald-50 text-emerald-700 text-xs font-bold">
                              {initials(student.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-semibold text-emerald-950">{student.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{student.level || "—"}</td>
                      <td className="p-3 text-muted-foreground" dir="ltr">{student.phone || "—"}</td>
                      <td className="p-3 text-muted-foreground">{student.parent_name || "—"}</td>
                      <td className="p-3 text-muted-foreground" dir="ltr">{student.parent_phone || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfoCard({ icon, title, value }: { icon: ReactNode; title: string; value: ReactNode }) {
  return (
    <Card className="border-[#D4AF37]/20 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 font-display text-base font-black text-emerald-950">{value}</p>
        </div>
      </div>
    </Card>
  );
}

const teacherClassesStyle = `
.class-card-header,
.details-hero {
  background:
    radial-gradient(circle at 15% 20%, rgba(212, 175, 55, 0.26), transparent 30%),
    radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.18), transparent 28%),
    linear-gradient(135deg, #064E3B 0%, #065F46 48%, #047857 100%);
}
.details-pattern {
  background-image:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,.22) 0 2px, transparent 2.8px),
    linear-gradient(45deg, transparent 0 48%, rgba(255,255,255,.10) 49% 50%, transparent 51%);
  background-size: 72px 72px, 36px 36px;
}
.class-card {
  border-radius: 1.75rem;
}
`;
