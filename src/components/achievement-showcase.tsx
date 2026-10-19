import { useCallback, useEffect, useMemo, useState } from "react";
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  getStudentAchievementShowcase,
  type AchievementConditionProgress,
  type AchievementSource,
  type AchievementTier,
  type EarnedAchievement,
  type LockedAchievementProgress,
  type StudentAchievementShowcase,
} from "@/lib/achievements";
import { loadNajmScoreItems } from "@/lib/najm";

/**
 * کارت بزرگ «افتخارات» داخل داشبورد — ویترین کامل نشان‌های دریافت‌شده و در مسیر
 * با سطح فعلی، تاریخچه‌ی سطح‌ها، پیشرفت تا سطح بعدی و شروط باقی‌مانده.
 * هم در داشبورد قرآن‌آموز («افخ��ارات من») و هم در داشبورد ولی («افتخارات فرزند من»)
 * استفاده می‌شود.
 */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
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

/** درصد پیشرفت هر افتخار در مسیر (قفل) با منطق همه/حداقل‌یکی‌ای که سرور برگردانده */
function lockedPercent(item: LockedAchievementProgress): number {
  if (item.evaluation.manual || item.evaluation.conditions.length === 0) return 0;
  const values = item.evaluation.conditions.map(conditionPercent);
  return item.evaluation.logic === "any"
    ? Math.max(...values)
    : values.reduce((sum, value) => sum + value, 0) / values.length;
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
  const history = item.tier_history ?? [];
  const nextPercent = nextTierProgress ? lockedPercent(nextTierProgress) : null;
  const nextTierLabel =
    nextTierProgress?.evaluation.next_tier_label ?? nextTierProgress?.evaluation.next_tier ?? null;
  const remaining = nextTierProgress?.evaluation.conditions.filter((c) => !c.met) ?? [];
  return (
    <div className={`achv-card rounded-2xl border p-4 ${TIER_STYLES[item.tier]}`}>
      <div className="achv-card-header flex items-start gap-3">
        <div
          className={`achv-card-icon flex h-16 w-16 shrink-0 items-center justify-center ${item.artwork_url ? "" : "rounded-full border-2 border-white/70 bg-white/60 shadow"}`}
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
        <div className="achv-card-body min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="achv-card-title font-display font-black">{item.title}</h3>
            {item.tier_label && (
              <Badge className="achv-card-tier-badge border border-emerald-200 bg-white/85 text-emerald-800">
                سطح فعلی: {item.tier_label}
              </Badge>
            )}
            <Badge className="achv-card-earned-badge border-0 bg-emerald-600 text-white">
              <CheckCircle2 className="ml-1 h-3 w-3" />
              کسب شد
            </Badge>
          </div>
          <p className="achv-card-desc mt-1 text-xs leading-6 opacity-80">{item.description}</p>
        </div>
      </div>
      <div className="achv-card-details mt-3 rounded-xl bg-white/65 p-3 text-xs">
        <div className="flex justify-between">
          <span>تاریخ دریافت</span>
          <span>{formatDate(item.awarded_at)}</span>
        </div>
        <div className="mt-2 flex justify-between">
          <span>منبع</span>
          <span>{SOURCE_LABELS[item.achievement_source]}</span>
        </div>
        <p className="mt-2 border-t pt-2">{item.reason || "احراز شرایط افتخار"}</p>
      </div>

      {history.length > 0 && (
        <div className="achv-card-history mt-3 rounded-xl bg-white/65 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
            <Medal className="h-3.5 w-3.5" /> تاریخچه سطح‌ها
          </div>
          <div className="mt-2 space-y-1.5">
            {history.map((step, index) => (
              <div
                key={`${step.tier ?? "lvl"}-${index}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  سطح {step.tier_label ?? step.tier ?? "—"}
                </span>
                <span className="text-muted-foreground">{formatDate(step.awarded_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nextTierProgress && !nextTierProgress.evaluation.done && (
        <div className="achv-card-next-tier mt-3 rounded-xl border border-cyan-200/60 bg-cyan-50/70 p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-cyan-900">
              سطح بعدی{nextTierLabel ? `: ${nextTierLabel}` : ""}
            </span>
            <span className="font-bold text-cyan-800">{toFa(Math.round(nextPercent ?? 0))}٪</span>
          </div>
          <Progress value={nextPercent ?? 0} className="mt-2 h-2" />
          {remaining.length > 0 && (
            <p className="achv-card-remaining mt-2 text-[10px] leading-5 text-cyan-800/80">
              شروط باقی‌مانده:{""}
              {remaining
                .map((c) => `${itemLabel(c.metric)} (${toFa(c.current)} از ${toFa(c.target)})`)
                .join("، ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LockedCard({
  item,
  itemLabel,
}: {
  item: LockedAchievementProgress;
  itemLabel: (metric: string) => string;
}) {
  const percent = lockedPercent(item);
  const nextTierLabel = item.evaluation.next_tier_label ?? item.evaluation.next_tier ?? null;
  const remaining = item.evaluation.conditions.filter((c) => !c.met);
  return (
    <div className="achv-card rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
      <div className="achv-card-header flex items-start gap-3">
        <div className="achv-card-icon flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
          <AchievementIcon iconKey={item.icon_key} />
        </div>
        <div className="achv-card-body min-w-0">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-slate-500" />
            <h3 className="achv-card-title font-display font-bold">
              {item.is_secret ? "افتخار شگفت‌انگیز" : item.title}
            </h3>
          </div>
          <p className="achv-card-desc mt-1 text-xs leading-6 text-muted-foreground">
            {item.is_secret ? "شرایط این افتخار تا زمان دریافت مخفی است." : item.description}
          </p>
        </div>
      </div>
      <div className="achv-card-details mt-3 rounded-xl border bg-white/70 p-3">
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
              <p className="achv-card-remaining mt-2 text-[10px] font-medium text-slate-600">
                {toFa(remaining.length)} شرط باقی مانده است:
              </p>
            )}
            {item.evaluation.conditions.length > 0 && (
              <div className="achv-card-conditions mt-2 space-y-1.5">
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
          </>
        )}
      </div>
      {!item.is_secret && item.locked_hint && (
        <p className="achv-card-hint mt-3 text-xs font-medium text-emerald-800">
          💡 {item.locked_hint}
        </p>
      )}
    </div>
  );
}

export function AchievementShowcaseCard({
  studentId,
  title,
  subtitle,
}: {
  /** شناسه‌ی عددی قرآن‌آموز (students.id) */
  studentId: number | string;
  /** عنوان روی سربرگ کارت؛ مثلا «افتخارات من» یا «افتخارات فرزند من» */
  title: string;
  subtitle?: string;
}) {
  const [showcase, setShowcase] = useState<StudentAchievementShowcase | null>(null);
  const [itemLabelMap, setItemLabelMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [items, result] = await Promise.all([
          loadNajmScoreItems().catch(() => []),
          getStudentAchievementShowcase(studentId),
        ]);
        const map = new Map<string, string>();
        for (const item of items) map.set(item.item_key, item.label);
        setItemLabelMap(map);
        if (result.error || !result.data) {
          setShowcase(null);
          setError(result.error ?? "خطا در دریافت افتخارات");
        } else {
          setShowcase(result.data);
        }
      } catch (err) {
        setShowcase(null);
        setError(err instanceof Error ? err.message : "خطا در دریافت افتخارات");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [studentId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const itemLabel = useMemo(
    () => (metric: string) =>
      itemLabelMap.get(metric) ?? LEGACY_METRIC_LABELS[metric] ?? "آیتم امتیازی",
    [itemLabelMap],
  );

  /** سطح بعدیِ هر افتخار دریافت‌شده‌ی سطح‌دار */
  const progressById = useMemo(() => {
    const map = new Map<string, LockedAchievementProgress>();
    for (const item of showcase?.progress ?? []) map.set(item.achievement_id, item);
    return map;
  }, [showcase]);

  const earnedCount = showcase?.earned.length ?? 0;
  const uniqueBadgeCount = useMemo(
    () => new Set((showcase?.earned ?? []).map((item) => item.achievement_id)).size,
    [showcase],
  );
  const inTrackCount = showcase?.progress.length ?? 0;

  return (
    <Card className="overflow-hidden rounded-3xl border-amber-200/60">
      <div className="achv-showcase-header bg-gradient-to-l from-amber-50 via-white to-emerald-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#D4AF37]" />
            <h2 className="font-display text-xl font-black text-emerald-950">{title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-amber-300 bg-white/80 text-amber-800">
              {toFa(earnedCount)} دریافت‌شده
            </Badge>
            <Badge variant="outline" className="border-cyan-300 bg-white/80 text-cyan-800">
              {toFa(inTrackCount)} در مسیر
            </Badge>
            <Badge variant="outline" className="border-emerald-300 bg-white/80 text-emerald-800">
              {toFa(uniqueBadgeCount)} نشان یکتا
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={refreshing || loading}
              onClick={() => void load(true)}
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              به‌روزرسانی
            </Button>
          </div>
        </div>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>

      <div className="p-4 md:p-5">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">در حال دریافت افتخارات...</span>
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-rose-600">{error}</p>
            <Button size="sm" className="mt-3" onClick={() => void load()}>
              تلاش مجدد
            </Button>
          </div>
        ) : !showcase || (showcase.earned.length === 0 && showcase.progress.length === 0) ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            هنوز افتخاری در مسیر نیست؛ با ادامه‌ی فعالیت در طرح نجد از اینجا قابل پیگیری است.
          </p>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className="flex items-center gap-2 text-sm font-black text-emerald-900">
                <Crown className="h-4 w-4 text-amber-600" />
                افتخارات دریافت‌شده
              </h3>
              {showcase.earned.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  هنوز افتخاری دریافت نشده است؛ در ادامه مسیر شما قابل کسب است.
                </p>
              ) : (
                <div className="mobile-achievement-grid mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {showcase.earned.map((item) => (
                    <EarnedCard
                      key={item.student_achievement_id}
                      item={item}
                      nextTierProgress={progressById.get(item.achievement_id) ?? null}
                      itemLabel={itemLabel}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-sm font-black text-emerald-900">
                <Target className="h-4 w-4 text-cyan-700" />
                مسیر افتخارات بعدی
              </h3>
              {showcase.progress.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  افتخار جدیدی در مسیر نیست؛ پس از تعریف افتخارهای تازه این بخش پر می‌شود.
                </p>
              ) : (
                <div className="mobile-achievement-grid mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {showcase.progress.map((item) => (
                    <LockedCard key={item.achievement_id} item={item} itemLabel={itemLabel} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </Card>
  );
}
