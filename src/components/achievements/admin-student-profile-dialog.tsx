import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Award,
  BookCheck,
  CalendarCheck,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAdminStudentAchievementProfile,
  type AchievementSource,
  type AchievementTier,
  type AdminStudentAchievementProfile,
} from "@/lib/achievements";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}
function fixed(value: number | null, digits = 1): string {
  return value == null ? "—" : toFa(Number(value).toFixed(digits));
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
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

const SOURCE_LABELS: Record<AchievementSource, string> = {
  najm: "طرح نجم",
  special_activity: "فعالیت ویژه",
  competition: "مسابقه",
  occasion: "مناسبت",
  admin_direct: "اعطای مستقیم مدیر",
  teacher_nomination: "پیشنهاد استاد",
  legacy_migration: "سوابق قدیمی",
  hybrid: "ترکیبی",
  other: "سایر",
};
const TIER_LABELS: Record<AchievementTier, string> = {
  bronze: "برنز",
  silver: "نقره",
  gold: "طلا",
  diamond: "الماس",
  special: "ویژه",
};
const TIER_STYLES: Record<AchievementTier, string> = {
  bronze: "bg-orange-100 text-orange-800",
  silver: "bg-slate-100 text-slate-700",
  gold: "bg-amber-100 text-amber-800",
  diamond: "bg-cyan-100 text-cyan-800",
  special: "bg-purple-100 text-purple-800",
};

export function AdminStudentProfileDialog({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [profile, setProfile] = useState<AdminStudentAchievementProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true);
    setProfile(null);
    void getAdminStudentAchievementProfile(studentId).then((result) => {
      setLoading(false);
      if (result.error || !result.data)
        toast.error(result.error ?? "خطا در دریافت پرونده افتخارات");
      else setProfile(result.data);
    });
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">پرونده جامع افتخارات و نجم</DialogTitle>
          <DialogDescription>
            نمای مدیریتی؛ شامل نشان‌ها، پیشرفت، جلسات نجم و فعالیت‌های ویژه
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : profile ? (
          <ProfileContent profile={profile} />
        ) : (
          <div className="p-16 text-center text-muted-foreground">
            اطلاعات پرونده در دسترس نیست.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileContent({ profile }: { profile: AdminStudentAchievementProfile }) {
  const activeAchievements = profile.achievement_history.filter((item) => !item.revoked_at);
  const summary = profile.najm_summary;
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-3xl">
        <div className="bg-gradient-to-l from-emerald-950 to-emerald-700 p-5 text-white">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-amber-300">
              <AvatarFallback className="bg-white/10 font-bold text-amber-200">
                {initials(profile.student.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl font-black">{profile.student.name}</h2>
              <p className="mt-1 text-sm text-emerald-100">
                {profile.student.class_name ?? "بدون کلاس"} •{" "}
                {profile.student.teacher_name ?? "استاد نامشخص"}
              </p>
              <div className="mt-2 flex gap-2">
                <Badge className="border border-white/20 bg-white/10 text-white">
                  {profile.student.level ?? "—"}
                </Badge>
                {profile.student.student_number && (
                  <Badge className="border border-white/20 bg-white/10 text-white">
                    شماره {profile.student.student_number}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-left">
              <p className="text-xs text-emerald-100">افتخارات فعال</p>
              <p className="font-display text-4xl font-black text-amber-300">
                {toFa(activeAchievements.length)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="عملکرد نجم"
          value={`${toFa(Math.round(summary.performance_percent))}٪`}
          icon={<Target className="h-5 w-5" />}
        />
        <SummaryCard
          label="حضور"
          value={`${toFa(Math.round(summary.attendance_rate))}٪`}
          icon={<CalendarCheck className="h-5 w-5" />}
        />
        <SummaryCard
          label="میانگین آزمون"
          value={summary.average_exam == null ? "—" : `${fixed(summary.average_exam)}/۲۰`}
          icon={<GraduationCap className="h-5 w-5" />}
        />
        <SummaryCard
          label="میانگین جلسه"
          value={
            summary.average_session_score == null
              ? "—"
              : `${fixed(summary.average_session_score)}/۳۰`
          }
          icon={<Award className="h-5 w-5" />}
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">خلاصه</TabsTrigger>
          <TabsTrigger value="achievements">
            افتخارات ({toFa(profile.achievement_history.length)})
          </TabsTrigger>
          <TabsTrigger value="progress">
            مسیر نشان‌ها ({toFa(profile.showcase.progress.length)})
          </TabsTrigger>
          <TabsTrigger value="najm">جلسات نجم ({toFa(profile.najm_records.length)})</TabsTrigger>
          <TabsTrigger value="activities">فعالیت و نامزدی</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl p-5">
              <h3 className="font-display flex items-center gap-2 font-black">
                <ShieldCheck className="h-5 w-5" />
                جزئیات نجم
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <InfoBox label="جلسات" value={summary.session_count} />
                <InfoBox label="حضور" value={summary.present_count} />
                <InfoBox label="غیبت" value={summary.absent_count} />
                <InfoBox
                  label="بهترین آزمون"
                  value={summary.best_exam == null ? "—" : `${fixed(summary.best_exam)}/۲۰`}
                />
                <InfoBox
                  label="میانگین تکلیف"
                  value={
                    summary.average_homework == null ? "—" : `${fixed(summary.average_homework)}/۵`
                  }
                />
                <InfoBox
                  label="میانگین انضباط"
                  value={
                    summary.average_discipline == null
                      ? "—"
                      : `${fixed(summary.average_discipline)}/۵`
                  }
                />
              </div>
            </Card>
            <Card className="rounded-2xl p-5">
              <h3 className="font-display flex items-center gap-2 font-black">
                <Sparkles className="h-5 w-5" />
                شاخص‌های ویژه
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <InfoBox label="پیشرفت ویژه" value={summary.special_progress_total} />
                <InfoBox label="کمک ویژه" value={summary.special_help_total} />
                <InfoBox label="بی‌نظمی" value={summary.negative_disorder_total} />
                <InfoBox label="بی‌احترامی" value={summary.negative_disrespect_total} />
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="achievements">
          <div className="grid gap-3 md:grid-cols-2">
            {profile.achievement_history.map((item) => (
              <Card
                key={item.id}
                className={`rounded-2xl p-4 ${item.revoked_at ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{item.title}</h3>
                      <Badge className={`border-0 ${TIER_STYLES[item.tier]}`}>
                        {TIER_LABELS[item.tier]}
                      </Badge>
                      {item.revoked_at && <Badge variant="destructive">لغوشده</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.reason || item.description}
                    </p>
                  </div>
                  <Trophy className="h-5 w-5 text-amber-600" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                  <Badge variant="outline">{SOURCE_LABELS[item.achievement_source]}</Badge>
                  <Badge variant="outline">{formatDate(item.awarded_at)}</Badge>
                </div>
                {item.revocation_reason && (
                  <p className="mt-2 text-xs text-rose-700">علت لغو: {item.revocation_reason}</p>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="progress">
          <div className="grid gap-3 md:grid-cols-2">
            {profile.showcase.progress.map((item) => {
              const values = item.evaluation.conditions.map((condition) =>
                condition.met
                  ? 100
                  : Math.min(100, (condition.current / Math.max(condition.target, 1)) * 100),
              );
              const percent = values.length
                ? values.reduce((sum, value) => sum + value, 0) / values.length
                : 0;
              return (
                <Card key={item.achievement_id} className="rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">{item.is_secret ? "افتخار مخفی" : item.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.locked_hint ?? item.description}
                      </p>
                    </div>
                    <Badge className={`border-0 ${TIER_STYLES[item.tier]}`}>
                      {TIER_LABELS[item.tier]}
                    </Badge>
                  </div>
                  {item.evaluation.manual ? (
                    <p className="mt-3 rounded-xl bg-secondary/40 p-2 text-xs">
                      نشان دستی یا پیشنهادی
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 flex justify-between text-xs">
                        <span>پیشرفت</span>
                        <span>{toFa(Math.round(percent))}٪</span>
                      </div>
                      <Progress value={percent} className="mt-2" />
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="najm">
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-secondary/50 text-xs">
                <tr>
                  <th className="p-3 text-right">تاریخ</th>
                  <th className="p-3 text-right">حضور</th>
                  <th className="p-3 text-right">آزمون</th>
                  <th className="p-3 text-right">تکلیف</th>
                  <th className="p-3 text-right">انضباط</th>
                  <th className="p-3 text-right">ویژه</th>
                  <th className="p-3 text-right">منفی</th>
                  <th className="p-3 text-right">امتیاز</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {profile.najm_records.map((record) => (
                  <tr key={record.id}>
                    <td className="p-3 font-medium">{toFa(record.session_date)}</td>
                    <td className="p-3">
                      {record.is_absent ? (
                        <Badge variant="destructive">غایب</Badge>
                      ) : (
                        `${toFa(record.attendance)}/۵`
                      )}
                    </td>
                    <td className="p-3">
                      {record.is_absent ? "—" : `${toFa(record.exam_display)}/۲۰`}
                    </td>
                    <td className="p-3">{record.is_absent ? "—" : `${toFa(record.homework)}/۵`}</td>
                    <td className="p-3">
                      {record.is_absent ? "—" : `${toFa(record.discipline)}/۵`}
                    </td>
                    <td className="p-3 text-xs">
                      {toFa(record.special_progress)} + {toFa(record.special_help)}
                    </td>
                    <td className="p-3 text-xs">
                      {toFa(record.negative_disorder)} / {toFa(record.negative_disrespect)}
                    </td>
                    <td className="p-3 font-bold text-primary">{toFa(record.session_score)}/۳۰</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="activities">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl p-4">
              <h3 className="font-display flex items-center gap-2 font-black">
                <Activity className="h-5 w-5" />
                فعالیت‌های ویژه
              </h3>
              <div className="mt-3 space-y-2">
                {profile.special_activities.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    فعالیتی ثبت نشده است.
                  </p>
                ) : (
                  profile.special_activities.map((item) => (
                    <div key={item.id} className="rounded-xl border p-3">
                      <div className="flex justify-between">
                        <span className="font-medium">{item.activity_type}</span>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.notes || "بدون توضیح"}
                      </p>
                      <p className="mt-1 text-[10px]">{formatDate(item.occurred_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>
            <Card className="rounded-2xl p-4">
              <h3 className="font-display flex items-center gap-2 font-black">
                <UserCheck className="h-5 w-5" />
                تاریخچه نامزدی‌ها
              </h3>
              <div className="mt-3 space-y-2">
                {profile.nomination_history.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    نامزدی ثبت نشده است.
                  </p>
                ) : (
                  profile.nomination_history.map((item) => (
                    <div key={item.id} className="rounded-xl border p-3">
                      <div className="flex justify-between">
                        <span className="font-medium">{item.title}</span>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                      {item.decision_note && (
                        <p className="mt-1 text-xs text-rose-700">نظر مدیر: {item.decision_note}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <Card className="rounded-2xl p-4">
      <div className="flex justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-2xl font-black">{value}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
    </Card>
  );
}
function InfoBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-black">
        {typeof value === "number" ? toFa(value) : value}
      </p>
    </div>
  );
}
