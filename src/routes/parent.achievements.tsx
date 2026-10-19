import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Award,
  BookCheck,
  CalendarHeart,
  CheckCircle2,
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

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  getParentAchievementWorkspace,
  getStudentAchievementShowcase,
  type AchievementConditionProgress,
  type AchievementSource,
  type AchievementTier,
  type EarnedAchievement,
  type LockedAchievementProgress,
  type ParentAchievementChild,
  type ParentAchievementWorkspace,
  type StudentAchievementShowcase,
} from "@/lib/achievements";
import { loadNajmScoreItems, type NajmScoreItem } from "@/lib/najm";
import {
  readRememberedParentChild,
  rememberParentChild,
} from "@/features/parent/parent-child-selection";

export const Route = createFileRoute("/parent/achievements")({
  head: () => ({
    meta: [
      { title: "افتخارات فرزندان — پنل والدین" },
      { name: "description", content: "مشاهده افتخارات و مسیر پیشرفت فرزندان" },
    ],
  }),
  component: ParentAchievementsPage,
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
      month: "long",
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
  bronze: "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-800",
  silver: "border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 text-slate-700",
  gold: "border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 text-amber-800",
  diamond: "border-cyan-200 bg-gradient-to-br from-cyan-50 to-indigo-50 text-cyan-800",
  special: "border-purple-200 bg-gradient-to-br from-purple-50 to-amber-50 text-purple-800",
};

const SOURCE_LABELS: Record<AchievementSource, string> = {
  najm: "طرح نجم",
  special_activity: "فعالیت ویژه",
  competition: "مسابقه",
  occasion: "مناسبت",
  admin_direct: "اعطای مدیر",
  teacher_nomination: "پیشنهاد استاد",
  legacy_migration: "سوابق گذشته",
  hybrid: "ترکیبی",
  other: "سایر",
};

const LEGACY_METRIC_LABELS: Record<string, string> = {
  score: "امتیاز",
  attendance: "حضور و غیاب",
  contest_activity: "مسابقه فعال",
  item: "آیتم امتیازی",
};

/** برچسب شاخص شرط، در نبود آیتم تعریف‌شده‌ی نجم */
function legacyMetricLabel(metric: string): string {
  return LEGACY_METRIC_LABELS[metric] ?? "آیتم امتیازی";
}

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
  className = "h-6 w-6",
}: {
  iconKey: string;
  className?: string;
}) {
  const Icon = ICONS[iconKey as keyof typeof ICONS] ?? Trophy;
  return <Icon className={className} />;
}

function conditionPercent(condition: AchievementConditionProgress): number {
  if (condition.met) return 100;
  if (condition.operator === "<" || condition.operator === "<=") {
    return Math.max(0, Math.min(100, (condition.target / Math.max(condition.current, 1)) * 100));
  }
  return Math.max(0, Math.min(100, (condition.current / Math.max(condition.target, 1)) * 100));
}

function lockedProgress(item: LockedAchievementProgress): number {
  if (item.evaluation.manual || item.evaluation.conditions.length === 0) return 0;
  const values = item.evaluation.conditions.map(conditionPercent);
  return item.evaluation.logic === "any"
    ? Math.max(...values)
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ParentAchievementsPage() {
  const [workspace, setWorkspace] = useState<ParentAchievementWorkspace | null>(null);
  const [selectedChild, setSelectedChild] = useState<ParentAchievementChild | null>(null);
  const [showcase, setShowcase] = useState<StudentAchievementShowcase | null>(null);
  const [items, setItems] = useState<NajmScoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function loadChild(child: ParentAchievementChild) {
    rememberParentChild(child.id);
    setSelectedChild(child);
    setShowcaseLoading(true);
    const result = await getStudentAchievementShowcase(child.id);
    if (result.error || !result.data) {
      toast.error(result.error ?? "خطا در دریافت افتخارات فرزند");
      setShowcase(null);
    } else {
      setShowcase(result.data);
    }
    setShowcaseLoading(false);
  }

  async function load(showToast = false) {
    if (showToast) setRefreshing(true);
    else setLoading(true);
    const [loadedItems, result] = await Promise.all([
      loadNajmScoreItems(),
      getParentAchievementWorkspace(),
    ]);
    setItems(loadedItems);
    if (result.error || !result.data) {
      toast.error(result.error ?? "خطا در دریافت اطلاعات والدین");
      setWorkspace(null);
    } else {
      setWorkspace(result.data);
      const rememberedChildId = readRememberedParentChild();
      const child =
        result.data.children.find((item) => String(item.id) === rememberedChildId) ??
        result.data.children.find((item) => item.id === selectedChild?.id) ??
        result.data.children[0] ??
        null;
      if (child) await loadChild(child);
      else {
        setSelectedChild(null);
        setShowcase(null);
      }
      if (showToast) toast.success("افتخارات فرزندان به‌روز شد");
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latest = showcase?.earned[0] ?? null;
  const nearest = useMemo(
    () =>
      [...(showcase?.progress ?? [])]
        .filter((item) => !item.is_secret && !item.evaluation.manual)
        .sort((a, b) => lockedProgress(b) - lockedProgress(a))[0] ?? null,
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
    return (metric: string) => map.get(metric) ?? legacyMetricLabel(metric);
  }, [items]);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال دریافت افتخارات فرزندان...</span>
      </div>
    );
  }

  if (!workspace) {
    return (
      <Card className="rounded-3xl p-10 text-center" dir="rtl">
        <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4">اطلاعات افتخارات فرزندان در دسترس نیست.</p>
        <Button className="mt-4" onClick={() => void load()}>
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  if (workspace.children.length === 0) {
    return (
      <Card className="rounded-3xl border-dashed p-12 text-center" dir="rtl">
        <UsersEmptyIcon />
        <h2 className="mt-4 font-display text-xl font-bold">فرزندی به این حساب متصل نشده است</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ارتباط والد و قرآن‌آموز باید توسط مدیر ثبت شود.
        </p>
      </Card>
    );
  }

  return (
    <>
      <style>{parentStyles}</style>
      <div className="parent-achievements-page space-y-6" dir="rtl">
        <section className="parent-achievements-hero relative overflow-hidden rounded-[2rem] p-5 text-white shadow-xl md:p-7">
          <div className="parent-pattern absolute inset-0 opacity-25" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge className="border border-amber-200/30 bg-white/10 text-amber-100">
                همراهی خانواده در مسیر قرآن
              </Badge>
              <h1 className="mt-3 font-display text-3xl font-black">🏅 افتخارات فرزندان</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50/80">
                مشاهده نشان‌های نهایی و میزان پیشرفت تا افتخارات بعدی؛ بدون امتیاز یا سطح مستقل.
              </p>
            </div>
            <Button
              onClick={() => void load(true)}
              disabled={refreshing}
              className="w-fit gap-2 rounded-xl bg-[#D4AF37] text-emerald-950 hover:bg-[#E5C34B]"
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

        <div className="flex gap-3 overflow-x-auto pb-1">
          {workspace.children.map((child) => (
            <button
              key={child.id}
              onClick={() => void loadChild(child)}
              className={`min-w-[220px] rounded-2xl border p-3 text-right transition ${selectedChild?.id === child.id ? "border-amber-300 bg-amber-50 shadow-sm" : "bg-card hover:bg-secondary/40"}`}
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 border-2 border-amber-300">
                  <AvatarFallback className="bg-emerald-800 text-white">
                    {initials(child.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-bold">{child.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{child.class_name}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {showcaseLoading ? (
          <div className="flex justify-center p-16">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : selectedChild && showcase ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ParentStat
                label="افتخارات نهایی"
                value={showcase.earned.length}
                icon={<Trophy className="h-5 w-5" />}
              />
              <ParentStat
                label="نشان‌های یکتا"
                value={new Set(showcase.earned.map((item) => item.achievement_id)).size}
                icon={<Award className="h-5 w-5" />}
              />
              <ParentStat
                label="نشان‌های در مسیر"
                value={showcase.progress.length}
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <ParentStat
                label="کلاس"
                value={selectedChild.class_name}
                icon={<ShieldCheck className="h-5 w-5" />}
                small
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="rounded-3xl border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5">
                <h2 className="font-display flex items-center gap-2 text-lg font-black">
                  <Crown className="h-5 w-5 text-amber-700" />
                  آخرین افتخار {selectedChild.name}
                </h2>
                {latest ? (
                  <LatestAchievement item={latest} />
                ) : (
                  <EmptyInline text="هنوز افتخاری ثبت نشده است." />
                )}
              </Card>
              <Card className="rounded-3xl border-cyan-200/60 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-5">
                <h2 className="font-display flex items-center gap-2 text-lg font-black">
                  <Target className="h-5 w-5 text-cyan-700" />
                  نزدیک‌ترین افتخار
                </h2>
                {nearest ? (
                  <NearestAchievement item={nearest} />
                ) : (
                  <EmptyInline text="پیشرفت قابل محاسبه‌ای وجود ندارد." />
                )}
              </Card>
            </div>

            <section>
              <h2 className="font-display text-2xl font-black text-emerald-950">ویترین افتخارات</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                افتخارات نهایی {selectedChild.name}
              </p>
              {showcase.earned.length === 0 ? (
                <EmptyCard text="هنوز نشانی برای نمایش وجود ندارد." />
              ) : (
                <div className="mobile-achievement-grid mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {showcase.earned.map((item) => (
                    <ParentEarnedCard
                      key={item.student_achievement_id}
                      item={item}
                      nextTierProgress={progressById.get(item.achievement_id) ?? null}
                      itemLabel={itemLabelByMetric}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-display text-2xl font-black text-emerald-950">
                مسیر افتخارات بعدی
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                شرایطی که با ادامه فعالیت در نجم یا فعالیت‌های ویژه تکمیل می‌شوند.
              </p>
              {showcase.progress.length === 0 ? (
                <EmptyCard text="نشان قفل‌شده‌ای وجود ندارد." />
              ) : (
                <div className="mobile-achievement-grid mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {showcase.progress.map((item) => (
                    <ParentLockedCard
                      key={item.achievement_id}
                      item={item}
                      itemLabel={itemLabelByMetric}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}

function ParentStat({
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
    <Card className="rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`mt-2 font-display font-black ${small ? "text-sm" : "text-2xl"}`}>
            {typeof value === "number" ? toFa(value) : value}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">{icon}</div>
      </div>
    </Card>
  );
}

function LatestAchievement({ item }: { item: EarnedAchievement }) {
  return (
    <div className="mt-4 flex items-center gap-4">
      <div
        className={`flex h-20 w-20 shrink-0 items-center justify-center ${item.artwork_url ? "" : `rounded-full border-4 shadow-lg ${TIER_STYLES[item.tier]}`}`}
      >
        {item.artwork_url ? (
          <img
            src={item.artwork_url}
            alt={item.title}
            className="h-full w-full object-contain drop-shadow-lg"
          />
        ) : (
          <AchievementIcon iconKey={item.icon_key} className="h-7 w-7" />
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{item.title}</h3>
          <Badge variant="outline" className={TIER_STYLES[item.tier]}>
            {TIER_LABELS[item.tier]}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{item.reason || item.description}</p>
        <p className="mt-2 text-xs font-medium text-emerald-700">{formatDate(item.awarded_at)}</p>
      </div>
    </div>
  );
}

function NearestAchievement({ item }: { item: LockedAchievementProgress }) {
  const percent = lockedProgress(item);
  const nextTierLabel = item.evaluation.next_tier_label ?? item.evaluation.next_tier ?? null;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">
            {item.title}
            {nextTierLabel ? (
              <span className="mr-2 text-xs font-medium text-cyan-800">
                (سطح بعدی: {nextTierLabel})
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.locked_hint ?? item.description}
          </p>
        </div>
        <span className="font-display text-2xl font-black text-cyan-800">
          {toFa(Math.round(percent))}٪
        </span>
      </div>
      <Progress value={percent} className="mt-4 h-3" />
    </div>
  );
}

function ParentEarnedCard({
  item,
  nextTierProgress,
  itemLabel,
}: {
  item: EarnedAchievement;
  nextTierProgress?: LockedAchievementProgress | null;
  itemLabel: (metric: string) => string;
}) {
  const history = item.tier_history ?? [];
  const nextPercent = nextTierProgress ? lockedProgress(nextTierProgress) : null;
  const nextTierLabel =
    nextTierProgress?.evaluation.next_tier_label ?? nextTierProgress?.evaluation.next_tier ?? null;
  const remaining = nextTierProgress?.evaluation.conditions.filter((c) => !c.met) ?? [];
  return (
    <Card className={`rounded-3xl border p-5 ${TIER_STYLES[item.tier]}`}>
      <div className="flex items-start gap-3">
        <div
          className={`flex h-20 w-20 shrink-0 items-center justify-center ${item.artwork_url ? "" : "rounded-full border-2 border-white/70 bg-white/60 shadow"}`}
        >
          {item.artwork_url ? (
            <img
              src={item.artwork_url}
              alt={item.title}
              className="h-full w-full object-contain drop-shadow-lg"
            />
          ) : (
            <AchievementIcon iconKey={item.icon_key} />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-black">{item.title}</h3>
            {item.tier_label && (
              <Badge className="border border-emerald-200 bg-white/85 text-emerald-800">
                سطح فعلی: {item.tier_label}
              </Badge>
            )}
            <Badge className="border-0 bg-emerald-600 text-white">
              <CheckCircle2 className="ml-1 h-3 w-3" />
              کسب شد
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-6 opacity-80">{item.description}</p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-white/65 p-3 text-xs">
        <div className="flex justify-between">
          <span>تاریخ</span>
          <span>{formatDate(item.awarded_at)}</span>
        </div>
        <div className="mt-2 flex justify-between">
          <span>منبع</span>
          <span>{SOURCE_LABELS[item.achievement_source]}</span>
        </div>
        <p className="mt-2 border-t pt-2">{item.reason || "احراز شرایط افتخار"}</p>
      </div>

      {history.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white/65 p-3">
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
        <div className="mt-3 rounded-2xl border border-cyan-200/60 bg-cyan-50/70 p-3">
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

function ParentLockedCard({
  item,
  itemLabel = legacyMetricLabel,
}: {
  item: LockedAchievementProgress;
  itemLabel?: (metric: string) => string;
}) {
  const percent = lockedProgress(item);
  const nextTierLabel = item.evaluation.next_tier_label ?? item.evaluation.next_tier ?? null;
  const remaining = item.evaluation.conditions.filter((c) => !c.met);
  return (
    <Card className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
          <AchievementIcon iconKey={item.icon_key} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-slate-500" />
            <h3 className="font-display font-bold">
              {item.is_secret ? "افتخار شگفت‌انگیز" : item.title}
            </h3>
          </div>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            {item.is_secret ? "شرایط این افتخار مخفی است." : item.description}
          </p>
        </div>
      </div>
      {item.evaluation.manual ? (
        <p className="mt-4 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
          این افتخار با تصمیم مدیر یا پیشنهاد استاد دریافت می‌شود.
        </p>
      ) : (
        !item.is_secret && (
          <div className="mt-4">
            <div className="flex justify-between text-xs">
              <span>
                پیشرفت
                {nextTierLabel ? (
                  <span className="text-muted-foreground"> تا سطح {nextTierLabel}</span>
                ) : null}
              </span>
              <span className="font-bold text-emerald-700">{toFa(Math.round(percent))}٪</span>
            </div>
            <Progress value={percent} className="mt-2" />
            {remaining.length > 0 && (
              <p className="mt-2 text-[10px] font-medium text-slate-600">
                {toFa(remaining.length)} شرط باقی مانده است:
              </p>
            )}
            {item.evaluation.conditions.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {item.evaluation.conditions.map((condition, index) => (
                  <div
                    key={`${condition.metric}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="truncate text-muted-foreground">
                      {condition.met ? "✅ " : ""}
                      {itemLabel(condition.metric)}
                    </span>
                    <span className="whitespace-nowrap font-medium">
                      {toFa(condition.current)} از {toFa(condition.target)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}
      {!item.is_secret && item.locked_hint && (
        <p className="mt-3 text-xs font-medium text-emerald-800">💡 {item.locked_hint}</p>
      )}
    </Card>
  );
}

function EmptyInline({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed bg-white/50 p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
function EmptyCard({ text }: { text: string }) {
  return (
    <Card className="mt-4 rounded-3xl border-dashed p-10 text-center text-muted-foreground">
      {text}
    </Card>
  );
}
function UsersEmptyIcon() {
  return (
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
      <Award className="h-8 w-8" />
    </div>
  );
}

const parentStyles = `
.parent-achievements-hero { background: radial-gradient(circle at 15% 20%, rgba(212,175,55,.28), transparent 30%), linear-gradient(135deg,#052E26,#064E3B 55%,#0F766E); }
.parent-pattern { background-image: radial-gradient(circle,rgba(255,255,255,.13) 0 1.5px,transparent 2px); background-size:42px 42px; }
`;
