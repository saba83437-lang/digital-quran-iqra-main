import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Award,
  BookCheck,
  CalendarHeart,
  CheckCircle2,
  ChevronLeft,
  Crown,
  Flame,
  HandHeart,
  Loader2,
  Lock,
  Medal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getStudentAchievementShowcase,
  type AchievementConditionProgress,
  type AchievementGrantMethod,
  type AchievementSource,
  type AchievementTier,
  type EarnedAchievement,
  type LockedAchievementProgress,
  type StudentAchievementShowcase,
} from "@/lib/achievements";
import { getCurrentStudent, type CurrentStudent } from "@/lib/student-utils";
import { loadNajmScoreItems, type NajmScoreItem } from "@/lib/najm";

export const Route = createFileRoute("/student/achievements")({
  head: () => ({
    meta: [
      { title: "افتخارات من — دارالقرآن" },
      { name: "description", content: "ویترین نشان‌ها و پیشرفت افتخارات قرآن‌آموز" },
    ],
  }),
  component: StudentAchievementsPage,
});

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

const TIER_THEME: Record<AchievementTier, { shell: string; medal: string; glow: string }> = {
  bronze: {
    shell: "border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50",
    medal: "from-[#8C4A20] via-[#CD7F32] to-[#F1B678] text-white",
    glow: "shadow-orange-200/70",
  },
  silver: {
    shell: "border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/50",
    medal: "from-[#778899] via-[#C0C0C0] to-[#F8FAFC] text-slate-800",
    glow: "shadow-slate-200/70",
  },
  gold: {
    shell: "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-50",
    medal: "from-[#8A6512] via-[#D4AF37] to-[#FFF0A3] text-emerald-950",
    glow: "shadow-amber-300/70",
  },
  diamond: {
    shell: "border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-indigo-50",
    medal: "from-[#0E7490] via-[#67E8F9] to-[#E0F2FE] text-cyan-950",
    glow: "shadow-cyan-300/70",
  },
  special: {
    shell: "border-purple-200 bg-gradient-to-br from-purple-50 via-white to-amber-50",
    medal: "from-[#5B21B6] via-[#A855F7] to-[#FDE68A] text-white",
    glow: "shadow-purple-300/70",
  },
};

const SOURCE_LABELS: Record<AchievementSource, string> = {
  najm: "طرح نجم",
  special_activity: "فعالیت ویژه",
  competition: "مسابقه",
  occasion: "مناسبت",
  admin_direct: "اعطای مستقیم مدیر",
  teacher_nomination: "پیشنهاد استاد",
  legacy_migration: "انتقال اطلاعات قدیمی",
  hybrid: "ترکیبی",
  other: "سایر",
};

const METHOD_LABELS: Record<AchievementGrantMethod, string> = {
  automatic: "خودکار",
  admin_direct: "اعطای مدیر",
  teacher_nomination: "پیشنهاد استاد و تأیید مدیر",
  legacy_migration: "انتقال سوابق",
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
  className = "h-8 w-8",
}: {
  iconKey: string;
  className?: string;
}) {
  const Icon = ICONS[iconKey as keyof typeof ICONS] ?? Trophy;
  return <Icon className={className} />;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function conditionPercent(condition: AchievementConditionProgress): number {
  if (condition.operator === "<=" || condition.operator === "<") {
    if (condition.current <= condition.target) return 100;
    return Math.max(0, Math.min(100, (condition.target / Math.max(condition.current, 1)) * 100));
  }
  if (condition.operator === "=") return condition.current === condition.target ? 100 : 0;
  return Math.max(0, Math.min(100, (condition.current / Math.max(condition.target, 1)) * 100));
}

function achievementProgress(item: LockedAchievementProgress): number {
  if (item.evaluation.manual) return 0;
  if (item.evaluation.conditions.length === 0) return 0;
  const values = item.evaluation.conditions.map(conditionPercent);
  if (item.evaluation.logic === "any") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nearestProgress(items: LockedAchievementProgress[]): LockedAchievementProgress | null {
  const eligible = items.filter((item) => !item.evaluation.manual && !item.is_secret);
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => achievementProgress(b) - achievementProgress(a))[0];
}

function StudentAchievementsPage() {
  const [student, setStudent] = useState<CurrentStudent | null>(null);
  const [showcase, setShowcase] = useState<StudentAchievementShowcase | null>(null);
  const [items, setItems] = useState<NajmScoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tierFilter, setTierFilter] = useState<"all" | AchievementTier>("all");

  async function load(showToast = false) {
    if (showToast) setRefreshing(true);
    else setLoading(true);

    const currentStudent = await getCurrentStudent();
    setStudent(currentStudent);
    if (!currentStudent) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [result, loadedItems] = await Promise.all([
      getStudentAchievementShowcase(currentStudent.id),
      loadNajmScoreItems(),
    ]);
    setItems(loadedItems);
    if (result.error || !result.data) {
      toast.error(result.error ?? "خطا در دریافت افتخارات");
      setShowcase(null);
    } else {
      setShowcase(result.data);
      if (showToast) toast.success("ویترین افتخارات به‌روز شد");
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const latest = showcase?.earned[0] ?? null;
  const nearest = useMemo(() => nearestProgress(showcase?.progress ?? []), [showcase]);
  const uniqueBadgeCount = useMemo(
    () => new Set((showcase?.earned ?? []).map((item) => item.achievement_id)).size,
    [showcase],
  );
  /** سطح بعدیِ هر افتخار (برای کارت‌های دریافت‌شده‌ی سطح‌دار) */
  const progressById = useMemo(() => {
    const map = new Map<string, LockedAchievementProgress>();
    for (const item of showcase?.progress ?? []) map.set(item.achievement_id, item);
    return map;
  }, [showcase]);
  /** برچسب فارسی شاخص‌ها: آیتم‌های نجم از تنظیمات مدیر خوانده می‌شوند */
  const itemLabelByMetric = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.item_key, item.label);
    return (metric: string) => map.get(metric) ?? metricLabel(metric);
  }, [items]);
  const earnedFiltered = useMemo(
    () =>
      (showcase?.earned ?? []).filter((item) => tierFilter === "all" || item.tier === tierFilter),
    [showcase, tierFilter],
  );
  const lockedFiltered = useMemo(
    () =>
      (showcase?.progress ?? []).filter((item) => tierFilter === "all" || item.tier === tierFilter),
    [showcase, tierFilter],
  );

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-700" />
        <span className="text-sm text-muted-foreground">در حال آماده‌سازی ویترین افتخارات...</span>
      </div>
    );
  }

  if (!student || !showcase) {
    return (
      <Card className="rounded-3xl p-10 text-center" dir="rtl">
        <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 font-display text-xl font-bold">ویترین افتخارات در دسترس نیست</h2>
        <Button className="mt-4" onClick={() => void load()}>
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  return (
    <>
      <style>{showcaseStyles}</style>
      <div className="achievement-showcase-page space-y-6" dir="rtl">
        <section className="achievement-hero relative overflow-hidden rounded-[2rem] p-5 text-white shadow-xl md:p-8">
          <div className="achievement-pattern absolute inset-0 opacity-30" />
          <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.3fr_.7fr] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-amber-200/30 bg-white/10 text-amber-100 hover:bg-white/15">
                  رزومه قرآنی من
                </Badge>
                <Badge className="border border-emerald-200/20 bg-emerald-200/10 text-emerald-50">
                  {student.name}
                </Badge>
              </div>
              <h1 className="mt-4 font-display text-3xl font-black md:text-4xl">🏅 افتخارات من</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-50/80">
                همه نشان‌ها از اطلاعات رسمی طرح نجم، فعالیت‌های ویژه تأییدشده یا تصمیم مدیر ایجاد
                می‌شوند.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/student">
                  <Button
                    variant="secondary"
                    className="gap-2 rounded-xl bg-white/10 text-white hover:bg-white/20"
                  >
                    بازگشت به داشبورد <ChevronLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  onClick={() => void load(true)}
                  disabled={refreshing}
                  className="gap-2 rounded-xl bg-[#D4AF37] text-emerald-950 hover:bg-[#E5C34B]"
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  به‌روزرسانی
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <HeroStat
                label="افتخارات نهایی"
                value={showcase.earned.length}
                icon={<Trophy className="h-5 w-5" />}
              />
              <HeroStat
                label="نشان‌های یکتا"
                value={uniqueBadgeCount}
                icon={<Award className="h-5 w-5" />}
              />
              <HeroStat
                label="نشان‌های قفل"
                value={showcase.progress.length}
                icon={<Lock className="h-5 w-5" />}
              />
              <HeroStat
                label="آخرین دریافت"
                value={latest ? formatDate(latest.awarded_at) : "—"}
                icon={<Sparkles className="h-5 w-5" />}
                small
              />
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="overflow-hidden rounded-3xl border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-950">
              <Crown className="h-5 w-5 text-[#B88916]" />
              <h2 className="font-display text-lg font-black">آخرین افتخار</h2>
            </div>
            {latest ? (
              <div className="mt-4 flex items-center gap-4">
                <MedalDisc item={latest} size="small" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold">{latest.title}</h3>
                    <TierBadge tier={latest.tier} />
                  </div>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    {latest.reason || latest.description}
                  </p>
                  <p className="mt-2 text-xs font-medium text-emerald-700">
                    {formatDate(latest.awarded_at)}
                  </p>
                </div>
              </div>
            ) : (
              <EmptyBox text="هنوز افتخاری ثبت نشده؛ با استمرار در طرح نجم آغاز کن." />
            )}
          </Card>

          <Card className="rounded-3xl border-cyan-200/60 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-950">
              <Target className="h-5 w-5 text-cyan-700" />
              <h2 className="font-display text-lg font-black">نزدیک‌ترین افتخار</h2>
            </div>
            {nearest ? (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{nearest.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {nearest.locked_hint ?? nearest.description}
                    </p>
                  </div>
                  <span className="font-display text-2xl font-black text-cyan-800">
                    {toFa(Math.round(achievementProgress(nearest)))}٪
                  </span>
                </div>
                <Progress value={achievementProgress(nearest)} className="mt-4 h-3" />
                <ConditionList
                  conditions={nearest.evaluation.conditions}
                  itemLabel={itemLabelByMetric}
                  compact
                />
              </div>
            ) : (
              <EmptyBox text="برای این دوره پیشرفت قابل محاسبه‌ای وجود ندارد." />
            )}
          </Card>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-black text-emerald-950">ویترین مدال‌ها</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              نشان‌های نهایی و مسیر رسیدن به افتخارات بعدی
            </p>
          </div>
          <SelectFilter value={tierFilter} onChange={setTierFilter} />
        </div>

        <Tabs defaultValue="earned" className="space-y-5">
          <TabsList className="rounded-2xl bg-secondary/60 p-1">
            <TabsTrigger value="earned">دریافت‌شده ({toFa(earnedFiltered.length)})</TabsTrigger>
            <TabsTrigger value="locked">قفل‌شده ({toFa(lockedFiltered.length)})</TabsTrigger>
          </TabsList>

          <TabsContent value="earned">
            {earnedFiltered.length === 0 ? (
              <EmptyShowcase
                icon={<Trophy className="h-12 w-12" />}
                text="نشانی در این درجه دریافت نشده است."
              />
            ) : (
              <div className="mobile-achievement-grid grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {earnedFiltered.map((item) => (
                  <EarnedCard
                    key={item.student_achievement_id}
                    item={item}
                    nextTierProgress={progressById.get(item.achievement_id) ?? null}
                    itemLabel={itemLabelByMetric}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="locked">
            {lockedFiltered.length === 0 ? (
              <EmptyShowcase
                icon={<CheckCircle2 className="h-12 w-12" />}
                text="نشان قفل‌شده‌ای در این فیلتر وجود ندارد."
              />
            ) : (
              <div className="mobile-achievement-grid grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {lockedFiltered.map((item) => (
                  <LockedCard key={item.achievement_id} item={item} itemLabel={itemLabelByMetric} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function HeroStat({
  label,
  value,
  icon,
  small = false,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between text-amber-100">
        {icon}
        <span className="text-[10px] text-white/60">{label}</span>
      </div>
      <div
        className={`mt-2 font-display font-black text-white ${small ? "text-xs leading-5" : "text-2xl"}`}
      >
        {typeof value === "number" ? toFa(value) : value}
      </div>
    </div>
  );
}

function MedalDisc({
  item,
  size = "large",
}: {
  item: Pick<EarnedAchievement, "tier" | "icon_key" | "title" | "artwork_url">;
  size?: "small" | "large";
}) {
  const theme = TIER_THEME[item.tier];
  if (item.artwork_url) {
    return (
      <div
        className={`relative shrink-0 ${size === "large" ? "h-28 w-28" : "h-20 w-20"}`}
        title={item.title}
      >
        <img
          src={item.artwork_url}
          alt={`نشان سه‌بعدی ${item.title}`}
          className="h-full w-full object-contain drop-shadow-xl"
        />
        <Sparkles className="medal-sparkle absolute -left-1 top-1 h-4 w-4 text-amber-200" />
      </div>
    );
  }
  return (
    <div
      className={`medal-disc relative shrink-0 rounded-full bg-gradient-to-br ${theme.medal} ${theme.glow} ${size === "large" ? "h-24 w-24 shadow-xl" : "h-16 w-16 shadow-lg"}`}
      title={item.title}
    >
      <div className="absolute inset-[5px] rounded-full border border-white/40" />
      <div className="absolute inset-0 flex items-center justify-center">
        <AchievementIcon
          iconKey={item.icon_key}
          className={size === "large" ? "h-10 w-10" : "h-7 w-7"}
        />
      </div>
      <Sparkles className="medal-sparkle absolute -left-1 top-1 h-4 w-4 text-amber-200" />
    </div>
  );
}

function TierBadge({ tier }: { tier: AchievementTier }) {
  return (
    <Badge variant="outline" className={TIER_THEME[tier].shell}>
      {TIER_LABELS[tier]}
    </Badge>
  );
}

function EarnedCard({
  item,
  nextTierProgress,
  itemLabel,
}: {
  item: EarnedAchievement;
  nextTierProgress?: LockedAchievementProgress | null;
  itemLabel: (metric: string) => string;
}) {
  const theme = TIER_THEME[item.tier];
  const history = item.tier_history ?? [];
  const nextPercent = nextTierProgress ? achievementProgress(nextTierProgress) : null;
  const nextTierLabel =
    nextTierProgress?.evaluation.next_tier_label ?? nextTierProgress?.evaluation.next_tier ?? null;
  const remaining = nextTierProgress?.evaluation.conditions.filter((c) => !c.met) ?? [];
  return (
    <Card
      className={`achievement-card-earned relative overflow-hidden rounded-[1.75rem] border p-5 ${theme.shell}`}
    >
      <div className="absolute -left-10 -top-10 h-28 w-28 rounded-full bg-white/60 blur-2xl" />
      <div className="relative flex items-start gap-4">
        <MedalDisc item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={item.tier} />
            {item.tier_label && (
              <Badge className="border border-emerald-200 bg-white/85 text-emerald-800">
                سطح فعلی: {item.tier_label}
              </Badge>
            )}
            <Badge className="border-0 bg-emerald-600 text-white">
              <CheckCircle2 className="ml-1 h-3 w-3" /> کسب شد
            </Badge>
          </div>
          <h3 className="mt-3 font-display text-lg font-black text-emerald-950">{item.title}</h3>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">{item.description}</p>
        </div>
      </div>
      <div className="relative mt-4 space-y-2 rounded-2xl border border-white/70 bg-white/70 p-3 text-xs backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">تاریخ دریافت</span>
          <span className="font-medium">{formatDate(item.awarded_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">منبع</span>
          <span className="font-medium">{SOURCE_LABELS[item.achievement_source]}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">روش اعطا</span>
          <span className="font-medium">{METHOD_LABELS[item.grant_method]}</span>
        </div>
        <div className="border-t pt-2">
          <span className="text-muted-foreground">دلیل: </span>
          <span>{item.reason || "احراز شرایط افتخار"}</span>
        </div>
      </div>

      {history.length > 0 && (
        <div className="relative mt-3 rounded-2xl border border-white/70 bg-white/70 p-3 backdrop-blur">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
            <Medal className="h-3.5 w-3.5" /> تاریخچه سطح‌ها
          </div>
          <div className="mt-2 space-y-1.5">
            {history.map((h, index) => (
              <div
                key={`${h.tier ?? "lvl"}-${index}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  سطح {h.tier_label ?? h.tier ?? "—"}
                </span>
                <span className="text-muted-foreground">{formatDate(h.awarded_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nextTierProgress && !nextTierProgress.evaluation.done && (
        <div className="relative mt-3 rounded-2xl border border-cyan-200/60 bg-cyan-50/70 p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-cyan-900">
              سطح بعدی{nextTierLabel ? `: ${nextTierLabel}` : ""}
            </span>
            <span className="font-bold text-cyan-800">{toFa(Math.round(nextPercent ?? 0))}٪</span>
          </div>
          <Progress value={nextPercent ?? 0} className="mt-2 h-2" />
          {remaining.length > 0 && (
            <p className="mt-2 text-[10px] leading-5 text-cyan-800/80">
              شروط باقی‌مانده:{" "}
              {remaining
                .map((c) => `${itemLabel(c.metric)} (${toFa(c.current)} از ${toFa(c.target)})`)
                .join("، ")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function LockedCard({
  item,
  itemLabel = metricLabel,
}: {
  item: LockedAchievementProgress;
  itemLabel?: (metric: string) => string;
}) {
  const percent = achievementProgress(item);
  const title = item.is_secret ? "افتخار شگفت‌انگیز" : item.title;
  const nextTierLabel = item.evaluation.next_tier_label ?? item.evaluation.next_tier ?? null;
  const remainingCount = item.evaluation.conditions.filter((c) => !c.met).length;
  return (
    <Card className="achievement-card-locked relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-5">
      <div className="absolute left-4 top-4 rounded-full bg-slate-200 p-1.5 text-slate-600">
        <Lock className="h-4 w-4" />
      </div>
      <div className="flex items-start gap-4 opacity-80">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-slate-200 bg-gradient-to-br from-slate-200 to-slate-100 text-slate-500 shadow-inner grayscale">
          <AchievementIcon iconKey={item.icon_key} className="h-8 w-8" />
        </div>
        <div className="min-w-0 flex-1">
          <TierBadge tier={item.tier} />
          <h3 className="mt-3 font-display text-lg font-black text-slate-800">{title}</h3>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            {item.is_secret ? "شرایط این افتخار تا زمان دریافت مخفی است." : item.description}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white/70 p-3">
        {item.evaluation.manual ? (
          <p className="text-xs leading-6 text-muted-foreground">
            این نشان با اعطای مستقیم مدیر یا پیشنهاد استاد و تأیید مدیر دریافت می‌شود.
          </p>
        ) : item.is_secret ? (
          <p className="text-xs text-muted-foreground">
            به فعالیت مثبت خود ادامه بده؛ شاید این افتخار نزدیک باشد.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs">
              <span>
                پیشرفت
                {nextTierLabel ? (
                  <span className="text-muted-foreground"> تا سطح {nextTierLabel}</span>
                ) : null}
              </span>
              <span className="font-bold text-emerald-700">{toFa(Math.round(percent))}٪</span>
            </div>
            <Progress value={percent} className="mt-2 h-2.5" />
            {remainingCount > 0 && (
              <p className="mt-2 text-[10px] font-medium text-slate-600">
                {toFa(remainingCount)} شرط باقی مانده است:
              </p>
            )}
            <ConditionList
              conditions={item.evaluation.conditions}
              itemLabel={itemLabel}
              compact={false}
            />
          </>
        )}
      </div>
      {!item.is_secret && item.locked_hint && (
        <p className="mt-3 text-xs font-medium text-emerald-800">💡 {item.locked_hint}</p>
      )}
    </Card>
  );
}

function ConditionList({
  conditions,
  itemLabel = metricLabel,
  compact,
}: {
  conditions: AchievementConditionProgress[];
  itemLabel?: (metric: string) => string;
  compact: boolean;
}) {
  if (conditions.length === 0) return null;
  return (
    <div className={`${compact ? "mt-3" : "mt-4"} space-y-1.5`}>
      {conditions.map((condition, index) => (
        <div
          key={`${condition.metric}-${index}`}
          className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-2.5 py-1.5 text-[11px]"
        >
          <span className="truncate text-muted-foreground">{itemLabel(condition.metric)}</span>
          <span
            className={condition.met ? "font-bold text-emerald-700" : "font-medium text-slate-700"}
          >
            {toFa(condition.current)} / {toFa(condition.target)} {condition.met && "✓"}
          </span>
        </div>
      ))}
    </div>
  );
}

function metricLabel(metric: string): string {
  const labels: Record<string, string> = {
    najm_record_count: "تعداد جلسات نجم",
    attendance_streak: "حضور متوالی",
    attendance_rate: "درصد حضور",
    exam_max: "بیشترین آزمون",
    exam_full_count: "آزمون کامل",
    session_score_average: "میانگین جلسه",
    session_score_percent: "عملکرد نجم",
    homework_average: "میانگین تکلیف",
    homework_full_streak: "تکلیف کامل متوالی",
    discipline_average: "میانگین انضباط",
    clean_discipline_streak: "انضباط پاک متوالی",
    special_progress_total: "پیشرفت ویژه",
    special_help_total: "کمک ویژه",
    improvement_delta: "رشد عملکرد",
    adjusted_term_percent: "عملکرد تعدیل‌شده",
    activity_count: "فعالیت ویژه",
    activity_value_sum: "مجموع فعالیت",
    activity_value_max: "بیشترین مقدار فعالیت",
  };
  return labels[metric] ?? metric;
}

function SelectFilter({
  value,
  onChange,
}: {
  value: "all" | AchievementTier;
  onChange: (value: "all" | AchievementTier) => void;
}) {
  const options: Array<["all" | AchievementTier, string]> = [
    ["all", "همه درجه‌ها"],
    ["bronze", "برنز"],
    ["silver", "نقره"],
    ["gold", "طلا"],
    ["diamond", "الماس"],
    ["special", "ویژه"],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([key, label]) => (
        <Button
          key={key}
          size="sm"
          variant={value === key ? "default" : "outline"}
          className="rounded-full"
          onClick={() => onChange(key)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed bg-white/50 p-5 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function EmptyShowcase({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <Card className="rounded-3xl border-dashed p-12 text-center text-muted-foreground">
      <div className="mx-auto w-fit opacity-40">{icon}</div>
      <p className="mt-4">{text}</p>
    </Card>
  );
}

const showcaseStyles = `
.achievement-hero {
  background:
    radial-gradient(circle at 18% 18%, rgba(212,175,55,.30), transparent 32%),
    radial-gradient(circle at 82% 28%, rgba(34,211,238,.15), transparent 28%),
    linear-gradient(135deg, #052E26 0%, #064E3B 50%, #0F766E 100%);
}
.achievement-pattern {
  background-image:
    radial-gradient(circle at center, rgba(255,255,255,.12) 0 1.5px, transparent 2px),
    linear-gradient(45deg, transparent 48%, rgba(212,175,55,.12) 49% 51%, transparent 52%);
  background-size: 52px 52px, 42px 42px;
}
.medal-disc { transform-style: preserve-3d; transform: perspective(500px) rotateY(-8deg) rotateX(5deg); }
.medal-disc::after { content: ''; position: absolute; inset: 10%; border-radius: 999px; box-shadow: inset 0 2px 8px rgba(255,255,255,.55), inset 0 -4px 9px rgba(0,0,0,.16); }
.medal-sparkle { animation: medalTwinkle 2.2s ease-in-out infinite; }
.achievement-card-earned:hover .medal-disc { animation: medalFloat 1.9s ease-in-out infinite; }
.achievement-card-earned { transition: transform .25s ease, box-shadow .25s ease; }
.achievement-card-earned:hover { transform: translateY(-3px); box-shadow: 0 18px 42px rgba(6,78,59,.12); }
@keyframes medalFloat { 0%,100% { transform: perspective(500px) rotateY(-8deg) rotateX(5deg) translateY(0); } 50% { transform: perspective(500px) rotateY(6deg) rotateX(2deg) translateY(-5px); } }
@keyframes medalTwinkle { 0%,100% { opacity:.35; transform:scale(.8) rotate(0); } 50% { opacity:1; transform:scale(1.2) rotate(20deg); } }
@media (prefers-reduced-motion: reduce) { .medal-disc, .medal-sparkle, .achievement-card-earned { animation: none !important; transition: none !important; } }
`;
