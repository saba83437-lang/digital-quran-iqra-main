import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Award,
  BookCheck,
  CalendarHeart,
  CheckCircle2,
  Clock3,
  Crown,
  Flame,
  HandHeart,
  Loader2,
  Medal,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, StatCard } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  getStudentAchievementShowcase,
  getTeacherAchievementWorkspace,
  nominateStudentForAchievement,
  type AchievementTier,
  type LockedAchievementProgress,
  type StudentAchievementShowcase,
  type TeacherAchievementStudent,
  type TeacherAchievementWorkspace,
} from "@/lib/achievements";

export const Route = createFileRoute("/teacher/achievements")({
  head: () => ({
    meta: [
      { title: "افتخارات قرآن‌آموزان — پنل استاد" },
      {
        name: "description",
        content: "مشاهده افتخارات و ثبت پیشنهاد نشان برای قرآن‌آموزان کلاس‌های استاد",
      },
    ],
  }),
  component: TeacherAchievementsPage,
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ق";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
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

const TIER_LABELS: Record<AchievementTier, string> = {
  bronze: "برنز",
  silver: "نقره",
  gold: "طلا",
  diamond: "الماس",
  special: "ویژه",
};

const TIER_STYLES: Record<AchievementTier, string> = {
  bronze: "border-orange-200 bg-orange-50 text-orange-800",
  silver: "border-slate-200 bg-slate-50 text-slate-700",
  gold: "border-amber-200 bg-amber-50 text-amber-800",
  diamond: "border-cyan-200 bg-cyan-50 text-cyan-800",
  special: "border-purple-200 bg-purple-50 text-purple-800",
};

const ICONS = {
  Award,
  Trophy,
  Star,
  Crown,
  Medal,
  Sparkles,
  Flame,
  Zap,
  CalendarHeart,
  BookCheck,
  TrendingUp,
  Target,
  HandHeart,
  ShieldCheck,
};

function AchievementIcon({
  iconKey,
  className = "h-5 w-5",
}: {
  iconKey: string;
  className?: string;
}) {
  const Icon = ICONS[iconKey as keyof typeof ICONS] ?? Award;
  return <Icon className={className} />;
}

function lockedProgress(item: LockedAchievementProgress): number {
  if (item.evaluation.manual || item.evaluation.conditions.length === 0) return 0;
  const values = item.evaluation.conditions.map((condition) => {
    if (condition.met) return 100;
    if (condition.operator === "<" || condition.operator === "<=") {
      return Math.max(0, Math.min(100, (condition.target / Math.max(condition.current, 1)) * 100));
    }
    return Math.max(0, Math.min(100, (condition.current / Math.max(condition.target, 1)) * 100));
  });
  return item.evaluation.logic === "any"
    ? Math.max(...values)
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function TeacherAchievementsPage() {
  const [workspace, setWorkspace] = useState<TeacherAchievementWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedStudent, setSelectedStudent] = useState<TeacherAchievementStudent | null>(null);
  const [selectedShowcase, setSelectedShowcase] = useState<StudentAchievementShowcase | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nominationOpen, setNominationOpen] = useState(false);

  async function load(showToast = false) {
    if (showToast) setRefreshing(true);
    else setLoading(true);
    const result = await getTeacherAchievementWorkspace();
    if (result.error || !result.data) {
      toast.error(result.error ?? "خطا در دریافت فضای افتخارات استاد");
      setWorkspace(null);
    } else {
      setWorkspace(result.data);
      if (selectedStudent) {
        const updatedStudent =
          result.data.students.find((item) => item.id === selectedStudent.id) ?? null;
        setSelectedStudent(updatedStudent);
        if (updatedStudent) await loadStudentShowcase(updatedStudent, false);
      }
      if (showToast) toast.success("اطلاعات افتخارات به‌روز شد");
    }
    setLoading(false);
    setRefreshing(false);
  }

  async function loadStudentShowcase(student: TeacherAchievementStudent, openDialog = true) {
    setSelectedStudent(student);
    setDetailLoading(true);
    if (openDialog) setSelectedShowcase(null);
    const result = await getStudentAchievementShowcase(student.id);
    if (result.error || !result.data) {
      toast.error(result.error ?? "خطا در دریافت افتخارات قرآن‌آموز");
      setSelectedShowcase(null);
    } else {
      setSelectedShowcase(result.data);
    }
    setDetailLoading(false);
  }

  useEffect(() => {
    void load();
    // load intentionally runs once for the authenticated teacher workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classes = useMemo(() => {
    const map = new Map<number, string>();
    for (const student of workspace?.students ?? []) map.set(student.class_id, student.class_name);
    return [...map.entries()];
  }, [workspace]);

  const filteredStudents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (workspace?.students ?? []).filter(
      (student) =>
        (classFilter === "all" || String(student.class_id) === classFilter) &&
        (!normalizedSearch ||
          student.name.toLowerCase().includes(normalizedSearch) ||
          student.class_name.toLowerCase().includes(normalizedSearch)),
    );
  }, [workspace, search, classFilter]);

  const pendingCount =
    workspace?.my_recent_nominations.filter((item) => item.status === "pending").length ?? 0;
  const approvedCount =
    workspace?.my_recent_nominations.filter((item) => item.status === "approved").length ?? 0;
  const totalStudentAchievements =
    workspace?.students.reduce((sum, item) => sum + item.achievement_count, 0) ?? 0;

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال بارگذاری افتخارات کلاس‌ها...</span>
      </div>
    );
  }

  if (!workspace) {
    return (
      <Card className="rounded-3xl p-10 text-center" dir="rtl">
        <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4">فضای افتخارات استاد در دسترس نیست.</p>
        <Button className="mt-4" onClick={() => void load()}>
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="افتخارات قرآن‌آموزان"
        description="مشاهده مسیر پیشرفت و ثبت پیشنهاد نشان؛ اعطای نهایی فقط با تأیید مدیر انجام می‌شود."
        actions={
          <Button
            variant="outline"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            به‌روزرسانی
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="قرآن‌آموزان من"
          value={toFa(workspace.students.length)}
          hint={`${toFa(classes.length)} کلاس فعال`}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="مجموع افتخارات"
          value={toFa(totalStudentAchievements)}
          hint="در کلاس‌های شما"
          icon={<Trophy className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label="پیشنهاد در انتظار"
          value={toFa(pendingCount)}
          hint="نیازمند تصمیم مدیر"
          icon={<Clock3 className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="پیشنهاد تأییدشده"
          value={toFa(approvedCount)}
          hint="اعطای نهایی‌شده"
          icon={<UserCheck className="h-5 w-5" />}
          tone="success"
        />
      </div>

      <Tabs defaultValue="students" className="space-y-5">
        <TabsList className="rounded-2xl bg-secondary/60 p-1">
          <TabsTrigger value="students">قرآن‌آموزان</TabsTrigger>
          <TabsTrigger value="nominations">
            پیشنهادهای من ({toFa(workspace.my_recent_nominations.length)})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-4">
          <Card className="rounded-2xl p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_240px]">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="جستجوی نام قرآن‌آموز یا کلاس..."
                  className="pr-10"
                />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه کلاس‌ها</SelectItem>
                  {classes.map(([id, name]) => (
                    <SelectItem key={id} value={String(id)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {filteredStudents.length === 0 ? (
            <EmptyState
              icon={<Users className="h-11 w-11" />}
              text="قرآن‌آموزی مطابق فیلتر پیدا نشد."
            />
          ) : (
            <div className="mobile-achievement-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredStudents.map((student) => (
                <StudentAchievementCard
                  key={student.id}
                  student={student}
                  onView={() => void loadStudentShowcase(student)}
                  onNominate={() => {
                    setSelectedStudent(student);
                    setNominationOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="nominations">
          <Card className="overflow-hidden rounded-3xl">
            <div className="border-b bg-amber-50/60 p-5">
              <h2 className="font-display flex items-center gap-2 text-lg font-bold">
                <UserCheck className="h-5 w-5" />
                تاریخچه پیشنهادهای استاد
              </h2>
            </div>
            <div className="divide-y">
              {workspace.my_recent_nominations.length === 0 ? (
                <EmptyInline text="هنوز پیشنهادی ثبت نکرده‌اید." />
              ) : (
                workspace.my_recent_nominations.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-bold">{item.student_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        پیشنهاد نشان «{item.achievement_title}»
                      </p>
                      <p className="mt-2 text-xs leading-6">{item.reason}</p>
                      {item.decision_note && (
                        <p className="mt-1 text-xs text-rose-700">نظر مدیر: {item.decision_note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={TIER_STYLES[item.achievement_tier]}>
                        {TIER_LABELS[item.achievement_tier]}
                      </Badge>
                      <NominationStatus status={item.status} />
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={
          selectedStudent !== null &&
          (detailLoading || selectedShowcase !== null) &&
          !nominationOpen
        }
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>افتخارات {selectedStudent?.name}</DialogTitle>
            <DialogDescription>
              {selectedStudent?.class_name} • بدون امتیاز یا سطح مستقل
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : selectedShowcase ? (
            <StudentShowcasePreview showcase={selectedShowcase} />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedStudent(null)}>
              بستن
            </Button>
            <Button className="gap-2" onClick={() => setNominationOpen(true)}>
              <Send className="h-4 w-4" />
              پیشنهاد نشان
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NominationDialog
        open={nominationOpen}
        onOpenChange={setNominationOpen}
        student={selectedStudent}
        workspace={workspace}
        onSaved={async () => {
          setNominationOpen(false);
          setSelectedStudent(null);
          setSelectedShowcase(null);
          await load();
        }}
      />
    </div>
  );
}

function StudentAchievementCard({
  student,
  onView,
  onNominate,
}: {
  student: TeacherAchievementStudent;
  onView: () => void;
  onNominate: () => void;
}) {
  return (
    <Card className="group rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar className="h-14 w-14 border-2 border-amber-300">
          <AvatarFallback className="bg-emerald-800 font-bold text-white">
            {initials(student.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-bold">{student.name}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {student.class_name} • {student.level ?? "—"}
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
          <Trophy className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-emerald-50 p-2">
          <p className="text-[10px] text-muted-foreground">کل افتخارات</p>
          <p className="mt-1 font-display text-xl font-black text-emerald-800">
            {toFa(student.achievement_count)}
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-2">
          <p className="text-[10px] text-muted-foreground">نشان یکتا</p>
          <p className="mt-1 font-display text-xl font-black text-amber-800">
            {toFa(student.unique_badge_count)}
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border bg-secondary/30 p-2.5 text-xs">
        {student.latest_achievement ? (
          <div className="flex items-center gap-2">
            <AchievementIcon iconKey={student.latest_achievement.icon_key} />
            <div className="min-w-0">
              <p className="truncate font-medium">{student.latest_achievement.title}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatDate(student.latest_achievement.awarded_at)}
              </p>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">هنوز افتخاری ثبت نشده است.</span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onView}>
          مشاهده
        </Button>
        <Button className="gap-1" onClick={onNominate}>
          <Send className="h-3.5 w-3.5" />
          پیشنهاد
        </Button>
      </div>
    </Card>
  );
}

function StudentShowcasePreview({ showcase }: { showcase: StudentAchievementShowcase }) {
  const nearest = [...showcase.progress]
    .filter((item) => !item.is_secret && !item.evaluation.manual)
    .sort((a, b) => lockedProgress(b) - lockedProgress(a))[0];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="افتخارات" value={showcase.earned.length} />
        <MiniStat
          label="نشان یکتا"
          value={new Set(showcase.earned.map((item) => item.achievement_id)).size}
        />
        <MiniStat label="قفل‌شده" value={showcase.progress.length} />
      </div>
      {nearest && (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4">
          <div className="flex justify-between">
            <span className="font-bold">نزدیک‌ترین: {nearest.title}</span>
            <span className="font-black text-cyan-800">
              {toFa(Math.round(lockedProgress(nearest)))}٪
            </span>
          </div>
          <Progress className="mt-3" value={lockedProgress(nearest)} />
        </div>
      )}
      <div>
        <h3 className="mb-3 font-display font-bold">نشان‌های دریافت‌شده</h3>
        {showcase.earned.length === 0 ? (
          <EmptyInline text="افتخاری ثبت نشده است." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {showcase.earned.slice(0, 10).map((item) => (
              <div
                key={item.student_achievement_id}
                className="flex items-center gap-3 rounded-2xl border bg-card p-3"
              >
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center ${item.artwork_url ? "" : `rounded-xl border p-2 ${TIER_STYLES[item.tier]}`}`}
                >
                  {item.artwork_url ? (
                    <img
                      src={item.artwork_url}
                      alt={item.title}
                      className="h-full w-full object-contain drop-shadow-md"
                    />
                  ) : (
                    <AchievementIcon iconKey={item.icon_key} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(item.awarded_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NominationDialog({
  open,
  onOpenChange,
  student,
  workspace,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: TeacherAchievementStudent | null;
  workspace: TeacherAchievementWorkspace;
  onSaved: () => Promise<void>;
}) {
  const [achievementId, setAchievementId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setAchievementId("");
      setReason("");
    }
  }, [open, student?.id]);
  async function submit() {
    if (!student || !achievementId || reason.trim().length < 3)
      return toast.error("انتخاب نشان و ثبت دلیل الزامی است");
    setSaving(true);
    const result = await nominateStudentForAchievement({
      achievementId,
      studentId: student.id,
      reason: reason.trim(),
      term: workspace.active_term?.term,
      academicYear: workspace.active_term?.academic_year,
    });
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success("پیشنهاد نشان برای بررسی مدیر ارسال شد");
    await onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>پیشنهاد نشان برای {student?.name}</DialogTitle>
          <DialogDescription>
            این پیشنهاد فقط پس از تأیید مدیر به افتخار نهایی تبدیل می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>نشان مجاز</Label>
            <Select value={achievementId} onValueChange={setAchievementId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب نشان" />
              </SelectTrigger>
              <SelectContent>
                {workspace.nominatable_achievements.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title} — {TIER_LABELS[item.tier]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>دلیل پیشنهاد</Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مشاهده یا دلیل مشخص استاد..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ارسال پیشنهاد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NominationStatus({
  status,
}: {
  status: "pending" | "approved" | "rejected" | "cancelled";
}) {
  if (status === "approved")
    return (
      <Badge className="border-0 bg-emerald-600 text-white">
        <CheckCircle2 className="ml-1 h-3 w-3" />
        تأییدشده
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive">
        <XCircle className="ml-1 h-3 w-3" />
        ردشده
      </Badge>
    );
  if (status === "cancelled") return <Badge variant="secondary">لغوشده</Badge>;
  return (
    <Badge className="border-0 bg-amber-500 text-white">
      <Clock3 className="ml-1 h-3 w-3" />
      در انتظار
    </Badge>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-secondary/50 p-3 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-black">{toFa(value)}</p>
    </div>
  );
}
function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <Card className="rounded-3xl border-dashed p-12 text-center text-muted-foreground">
      <div className="mx-auto w-fit opacity-40">{icon}</div>
      <p className="mt-4">{text}</p>
    </Card>
  );
}
function EmptyInline({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-muted-foreground">{text}</div>;
}
