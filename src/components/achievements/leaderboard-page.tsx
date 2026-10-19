import { useEffect, useMemo, useState } from "react";
import {
  Award,
  Crown,
  Loader2,
  Medal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, StatCard } from "@/components/page-header";
import { AdminStudentProfileDialog } from "@/components/achievements/admin-student-profile-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  getAchievementLeaderboard,
  getParentAchievementWorkspace,
  getTeacherAchievementWorkspace,
  updateAchievementPrivacy,
  type AchievementLeaderboard,
  type AchievementLeaderboardRow,
  type AchievementTier,
} from "@/lib/achievements";
import type { Role } from "@/lib/mock-data";
import { getCurrentStudent, getStudentClass } from "@/lib/student-utils";
import { supabase } from "@/lib/supabase";
import { NajmLeagueWorkspace } from "@/features/najm-leagues/components/league-workspace";
import type { LeagueRole } from "@/features/najm-leagues/types";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

const TIER_LABELS: Record<AchievementTier, string> = {
  bronze: "برنز",
  silver: "نقره",
  gold: "طلا",
  diamond: "الماس",
  special: "ویژه",
};

const PODIUM_STYLES = [
  "border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-100",
  "border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100",
  "border-orange-300 bg-gradient-to-br from-orange-50 to-amber-100",
];

export function AchievementLeaderboardPage({ role }: { role: Role }) {
  const [data, setData] = useState<AchievementLeaderboard | null>(null);
  const [classes, setClasses] = useState<Array<{ id: number; name: string }>>([]);
  const [scope, setScope] = useState<"center" | "class">("center");
  const [classId, setClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  async function loadClasses() {
    if (role === "admin") {
      const { data: rows } = await supabase
        .from("classes")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      setClasses((rows ?? []).map((item) => ({ id: Number(item.id), name: String(item.name) })));
    } else if (role === "teacher") {
      const result = await getTeacherAchievementWorkspace();
      const map = new Map<number, string>();
      for (const student of result.data?.students ?? [])
        map.set(student.class_id, student.class_name);
      setClasses([...map.entries()].map(([id, name]) => ({ id, name })));
    } else if (role === "parent") {
      const result = await getParentAchievementWorkspace();
      const map = new Map<number, string>();
      for (const child of result.data?.children ?? []) {
        if (child.class_id != null) map.set(child.class_id, child.class_name);
      }
      setClasses([...map.entries()].map(([id, name]) => ({ id, name })));
    } else {
      const student = await getCurrentStudent();
      if (student) {
        const studentClass = await getStudentClass(student.id);
        if (studentClass)
          setClasses([{ id: Number(studentClass.id), name: String(studentClass.name) }]);
      }
    }
  }

  async function load(showToast = false) {
    if (scope === "class") {
      setData(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (showToast) setRefreshing(true);
    else setLoading(true);
    const result = await getAchievementLeaderboard({
      scope,
      classId: scope === "class" && classId ? Number(classId) : null,
      limit: 100,
    });
    if (result.error || !result.data) {
      toast.error(result.error ?? "خطا در دریافت رتبه‌بندی");
      setData(null);
    } else {
      setData(result.data);
      if (showToast) toast.success("رتبه‌بندی به‌روز شد");
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void loadClasses();
  }, [role]);

  useEffect(() => {
    if (scope === "class" && !classId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, classId]);

  async function savePrivacy(enabled: boolean, nameMode: "full" | "initials" | "hidden") {
    setPrivacySaving(true);
    const result = await updateAchievementPrivacy({
      leaderboardEnabled: enabled,
      publicNameMode: nameMode,
    });
    setPrivacySaving(false);
    if (result.error) return toast.error(result.error);
    toast.success("تنظیمات حریم خصوصی ذخیره شد");
    await load();
  }

  const podium = data?.rows.slice(0, 3) ?? [];
  const totalAwards = useMemo(
    () => data?.rows.reduce((sum, item) => sum + item.total_awards, 0) ?? 0,
    [data],
  );
  const totalGold = useMemo(
    () => data?.rows.reduce((sum, item) => sum + item.gold_count + item.diamond_count, 0) ?? 0,
    [data],
  );

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال محاسبه رتبه‌بندی...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="رتبه‌بندی و رده‌های نجم"
        description={scope === "center" ? "رتبه‌بندی کل دارالقرآن بر اساس افتخارات رسمی." : "رقابت ماهانه در رده‌های منتخب هر کلاس بر اساس امتیاز رسمی نجم."}
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

      <Card className="rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={scope} onValueChange={(value) => setScope(value as "center" | "class")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="center">کل دارالقرآن</SelectItem>
              <SelectItem value="class">کلاس</SelectItem>
            </SelectContent>
          </Select>
          {scope === "class" && (
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب کلاس" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </Card>

      {scope === "class" ? (
        classId ? (
          <NajmLeagueWorkspace role={role as LeagueRole} classId={Number(classId)} />
        ) : (
          <Card className="rounded-3xl border-dashed p-10 text-center text-muted-foreground">
            برای مشاهده رده‌ها، کلاس را انتخاب کنید.
          </Card>
        )
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="قرآن‌آموزان رتبه‌بندی"
              value={toFa(data.total_students)}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="افتخارات قابل رتبه‌بندی"
              value={toFa(totalAwards)}
              icon={<Trophy className="h-5 w-5" />}
              tone="gold"
            />
            <StatCard
              label="نشان طلا و الماس"
              value={toFa(totalGold)}
              icon={<Crown className="h-5 w-5" />}
              tone="warning"
            />
            <StatCard
              label="بازه"
              value={data.academic_year ? toFa(data.academic_year) : "—"}
              hint={data.term ?? "ترم فعال"}
              icon={<Award className="h-5 w-5" />}
              tone="success"
            />
          </div>

          {role === "admin" && (
            <PrivacyPanel
              data={data}
              saving={privacySaving}
              onSave={(enabled, mode) => void savePrivacy(enabled, mode)}
            />
          )}

          <section>
            <h2 className="mb-4 font-display text-xl font-black">سکوی افتخار</h2>
            {podium.length === 0 ? (
              <Card className="rounded-3xl border-dashed p-12 text-center text-muted-foreground">
                هنوز داده‌ای برای رتبه‌بندی وجود ندارد.
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {podium.map((item, index) => (
                  <PodiumCard
                    key={item.student_id}
                    item={item}
                    index={index}
                    onOpen={
                      role === "admin" ? () => setSelectedStudentId(item.student_id) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <Card className="overflow-hidden rounded-3xl">
            <div className="border-b p-5">
              <h2 className="font-display text-lg font-black">جدول کامل رتبه‌بندی</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right">رتبه</th>
                    <th className="p-3 text-right">قرآن‌آموز</th>
                    <th className="p-3 text-right">کلاس</th>
                    <th className="p-3 text-right">نشان یکتا</th>
                    <th className="p-3 text-right">کل افتخارات</th>
                    <th className="p-3 text-right">درجه‌ها</th>
                    <th className="p-3 text-right">عملکرد نجم</th>
                    <th className="p-3 text-right">آخرین افتخار</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((item) => (
                    <tr key={item.student_id} className="hover:bg-secondary/20">
                      <td className="p-3 font-display text-lg font-black">{toFa(item.rank)}</td>
                      <td className="p-3 font-medium">
                        {role === "admin" ? (
                          <button
                            type="button"
                            onClick={() => setSelectedStudentId(item.student_id)}
                            className="font-bold text-primary underline-offset-4 hover:underline"
                          >
                            {item.display_name}
                          </button>
                        ) : (
                          item.display_name
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{item.class_name ?? "—"}</td>
                      <td className="p-3">{toFa(item.unique_badges)}</td>
                      <td className="p-3">{toFa(item.total_awards)}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <CountBadge
                            label="ط"
                            value={item.gold_count}
                            className="bg-amber-100 text-amber-800"
                          />
                          <CountBadge
                            label="ن"
                            value={item.silver_count}
                            className="bg-slate-100 text-slate-700"
                          />
                          <CountBadge
                            label="ب"
                            value={item.bronze_count}
                            className="bg-orange-100 text-orange-800"
                          />
                          <CountBadge
                            label="ا"
                            value={item.diamond_count}
                            className="bg-cyan-100 text-cyan-800"
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="w-28">
                          <div className="mb-1 flex justify-between text-[10px]">
                            <span>نجم</span>
                            <span>{toFa(Math.round(item.najm_percent))}٪</span>
                          </div>
                          <Progress value={item.najm_percent} />
                        </div>
                      </td>
                      <td className="p-3 text-xs">{item.latest_achievement?.title ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <Card className="rounded-3xl p-10 text-center">
          <ShieldCheck className="mx-auto h-11 w-11 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">
            رتبه‌بندی در دسترس نیست یا توسط مدیر غیرفعال شده است.
          </p>
        </Card>
      )}

      {role === "admin" && (
        <AdminStudentProfileDialog
          studentId={selectedStudentId}
          open={selectedStudentId !== null}
          onOpenChange={(open) => !open && setSelectedStudentId(null)}
        />
      )}
    </div>
  );
}

function PodiumCard({
  item,
  index,
  onOpen,
}: {
  item: AchievementLeaderboardRow;
  index: number;
  onOpen?: () => void;
}) {
  const icons = [Crown, Medal, Award];
  const Icon = icons[index] ?? Award;
  return (
    <Card
      onClick={onOpen}
      className={`relative overflow-hidden rounded-3xl border p-5 ${PODIUM_STYLES[index]} ${onOpen ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" : ""}`}
    >
      <div className="absolute -left-7 -top-7 h-24 w-24 rounded-full bg-white/60 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/70 shadow">
          <Icon className="h-6 w-6" />
        </div>
        <span className="font-display text-4xl font-black opacity-25">{toFa(item.rank)}</span>
      </div>
      <h3 className="relative mt-4 font-display text-xl font-black">{item.display_name}</h3>
      <p className="relative mt-1 text-xs text-muted-foreground">{item.class_name ?? "—"}</p>
      <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
        <SmallMetric label="نشان یکتا" value={item.unique_badges} />
        <SmallMetric label="افتخارات" value={item.total_awards} />
        <SmallMetric label="نجم" value={`${Math.round(item.najm_percent)}٪`} />
      </div>
      {item.latest_achievement && (
        <div className="relative mt-3 flex items-center gap-2 rounded-xl bg-white/60 p-2 text-xs">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <span className="truncate">{item.latest_achievement.title}</span>
          <Badge variant="outline" className="mr-auto">
            {TIER_LABELS[item.latest_achievement.tier]}
          </Badge>
        </div>
      )}
    </Card>
  );
}

function PrivacyPanel({
  data,
  saving,
  onSave,
}: {
  data: AchievementLeaderboard;
  saving: boolean;
  onSave: (enabled: boolean, mode: "full" | "initials" | "hidden") => void;
}) {
  const [enabled, setEnabled] = useState(data.leaderboard_enabled);
  const [mode, setMode] = useState<"full" | "initials" | "hidden">(data.name_mode);
  useEffect(() => {
    setEnabled(data.leaderboard_enabled);
    setMode(data.name_mode);
  }, [data]);
  return (
    <Card className="rounded-3xl border-purple-200 bg-purple-50/40 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display flex items-center gap-2 font-black">
            <ShieldCheck className="h-5 w-5" />
            حریم خصوصی رتبه‌بندی
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            کنترل نمایش عمومی و نحوه نمایش نام قرآن‌آموزان
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 rounded-xl border bg-white p-2.5">
            <Label>فعال</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="w-44">
            <Label className="mb-1.5 block">نمایش نام</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">نام کامل</SelectItem>
                <SelectItem value="initials">نام مخفف</SelectItem>
                <SelectItem value="hidden">کاملاً مخفی</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button disabled={saving} onClick={() => onSave(enabled, mode)}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ذخیره
          </Button>
        </div>
      </div>
    </Card>
  );
}
function SmallMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-white/55 p-2">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display font-black">
        {typeof value === "number" ? toFa(value) : toFa(value)}
      </p>
    </div>
  );
}
function CountBadge({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <span className={`rounded-md px-1.5 py-1 text-[10px] ${className}`}>
      {label}:{toFa(value)}
    </span>
  );
}
