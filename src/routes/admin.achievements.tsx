import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Archive,
  ArrowDown,
  ArrowUp,
  Award,
  Bell,
  BookCheck,
  CalendarHeart,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Cuboid,
  Edit3,
  Eye,
  FileImage,
  Flame,
  HandHeart,
  ImagePlus,
  Loader2,
  Medal,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Upload,
  UserCheck,
  Users,
  X,
  Zap,
  Layers,
  Trash2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, StatCard } from "@/components/page-header";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  adminGrantStudentAchievement,
  decideAchievementCandidate,
  decideStudentSpecialActivity,
  DEFAULT_NOTIFY_TEMPLATES,
  deleteAchievement,
  duplicateAchievement,
  evaluateNajmQuestsNow,
  getAchievementArtworkHistory,
  loadAchievementNotifyTemplates,
  saveAchievementNotifyTemplates,
  getAchievementManagementSnapshot,
  NAJM_QUEST_METRICS,
  NAJM_QUEST_TIER_LADDER,
  recordStudentSpecialActivity,
  registerAchievementArtwork,
  revokeStudentAchievement,
  saveAchievementFull,
  saveSpecialActivityType,
  setAchievementActive,
  buildConditionSummaryFa,
  buildRuleSummaryFa,
  RULE_BREACH_OPTIONS,
  RULE_CALC_OPTIONS,
  RULE_OPERATOR_OPTIONS,
  RULE_WINDOW_KIND_OPTIONS,
  type AchievementBreachBehavior,
  type AchievementRuleConfig,
  type AchievementRuleCondition,
  type AchievementRuleGroup,
  type RuleCalc,
  type RuleOperator,
  type RuleWindowKind,
  type AchievementArtworkAsset,
  type AchievementDefinition,
  type AchievementLevelInput,
  type AchievementManagementSnapshot,
  type AchievementSource,
  type AchievementTier,
  type NajmQuestMetric,
  type NajmQuestTierRow,
  type SpecialActivityType,
} from "@/lib/achievements";
import { activeNajmItems, loadNajmScoreItems, type NajmScoreItem, type NajmTerm } from "@/lib/najm";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/achievements")({
  head: () => ({
    meta: [
      { title: "مدیریت افتخارات — دارالقرآن" },
      {
        name: "description",
        content: "مدیریت نشان‌ها، قوانین، فعالیت‌های ویژه و دریافت‌کنندگان افتخارات",
      },
    ],
  }),
  component: AdminAchievementsPage,
});

type StudentOption = {
  id: number;
  name: string;
  class_id: number | null;
  class_name: string | null;
};

type ActiveTerm = {
  term: NajmTerm;
  academic_year: string;
  title: string;
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ACHIEVEMENT_ARTWORK_BUCKET = "achievement-artworks";

function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

const ICONS: Record<string, typeof Award> = {
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
  Activity,
  ShieldCheck,
};

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

function AchievementIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Award;
  return <Icon className={className} />;
}

function AchievementVisual({
  definition,
  className = "h-16 w-16",
}: {
  definition: Pick<AchievementDefinition, "artwork_url" | "icon_key" | "title" | "tier">;
  className?: string;
}) {
  if (definition.artwork_url) {
    return (
      <div className={`${className} shrink-0 overflow-visible`} title={definition.title}>
        <img
          src={definition.artwork_url}
          alt={`طرح سه‌بعدی ${definition.title}`}
          className="h-full w-full object-contain drop-shadow-md"
        />
      </div>
    );
  }
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-2xl border ${TIER_STYLES[definition.tier]}`}
    >
      <AchievementIcon name={definition.icon_key} className="h-7 w-7" />
    </div>
  );
}

function AdminAchievementsPage() {
  const [snapshot, setSnapshot] = useState<AchievementManagementSnapshot | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [activeTerm, setActiveTerm] = useState<ActiveTerm | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [artworkBadge, setArtworkBadge] = useState<AchievementDefinition | null>(null);
  const [grantDialog, setGrantDialog] = useState(false);
  const [grantTarget, setGrantTarget] = useState<AchievementDefinition | null>(null);
  const [activityTypeDialog, setActivityTypeDialog] = useState(false);
  const [recordActivityDialog, setRecordActivityDialog] = useState(false);

  /* ----- ویرایشگر یکپارچه افتخار (دو نوع: خودکار نجم / دستی) ----- */
  const [najmItems, setNajmItems] = useState<NajmScoreItem[]>([]);
  /** همه‌ی آیتم‌های فعال نجم (با آیتم‌های منفی) — برای قانون‌ساز */
  const [najmRuleItems, setNajmRuleItems] = useState<NajmScoreItem[]>([]);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState<AchievementDefinition | null>(null);
  const [editorCreateKind, setEditorCreateKind] = useState<"quest" | "manual">("manual");
  const [viewTarget, setViewTarget] = useState<AchievementDefinition | null>(null);
  const [notifyDialog, setNotifyDialog] = useState(false);
  const [evaluatingQuests, setEvaluatingQuests] = useState(false);
  const [lastQuestEvalAt, setLastQuestEvalAt] = useState<Date | null>(null);

  function openAchievementEditor(kind: "quest" | "manual", initial: AchievementDefinition | null) {
    setEditorCreateKind(kind);
    setEditorInitial(initial);
    setEditorOpen(true);
  }

  /** ارزیابی افتخارهای پلکانی طرح نجم — قبل از هر بارگذاری تا همه‌چیز بروز باشد */
  async function runQuestEvaluation(showToast = false) {
    if (evaluatingQuests) return;
    setEvaluatingQuests(true);
    const result = await evaluateNajmQuestsNow();
    if (result.error) {
      // تا قبل از اجرای مهاجرت جدید، صفحه بدون خطا کار کند
      console.warn("najm quest evaluation skipped:", result.error);
      if (showToast) toast.error("ارزیابی افتخارها انجام نشد؛ ابتدا مهاجرت جدید را اجرا کنید.");
    } else {
      setLastQuestEvalAt(new Date());
      const granted = Number(result.data?.granted ?? 0);
      const candidates = Number(result.data?.candidates ?? 0);
      if (showToast) {
        toast.success(
          `ارزیابی انجام شد — ${toFa(granted)} اعطای خودکار، ${toFa(candidates)} نامزد جدید`,
        );
      }
    }
    setEvaluatingQuests(false);
  }

  async function loadAll(showToast = false, silent = false) {
    if (!silent) {
      if (showToast) setRefreshing(true);
      else setLoading(true);
    }

    // ابتدا ارزیابی بروز افتخارهای پلکانی طرح نجم (خودکار/نامزد جدید)
    await runQuestEvaluation(false);

    const [managementResult, studentsResult, classesResult, termResult, itemsResult] =
      await Promise.all([
        getAchievementManagementSnapshot(),
        supabase.from("students").select("id, name, class_id").eq("status", "active").order("name"),
        supabase.from("classes").select("id, name").is("deleted_at", null),
        supabase
          .from("najm_terms")
          .select("term, academic_year, title")
          .eq("is_active", true)
          .maybeSingle(),
        loadNajmScoreItems(),
      ]);

    if (managementResult.error || !managementResult.data) {
      toast.error(managementResult.error ?? "خطا در دریافت اطلاعات افتخارات");
    } else {
      setSnapshot(managementResult.data);
    }

    const classNames = new Map(
      (classesResult.data ?? []).map((item) => [Number(item.id), String(item.name)]),
    );
    setClasses(
      (classesResult.data ?? []).map((item) => ({ id: Number(item.id), name: String(item.name) })),
    );
    setStudents(
      (studentsResult.data ?? []).map((student) => ({
        id: Number(student.id),
        name: String(student.name ?? "بدون نام"),
        class_id: student.class_id == null ? null : Number(student.class_id),
        class_name:
          student.class_id == null ? null : (classNames.get(Number(student.class_id)) ?? null),
      })),
    );

    setActiveTerm((termResult.data as ActiveTerm | null) ?? null);
    setNajmItems(activeNajmItems(itemsResult).filter((i) => i.kind !== "negative"));
    setNajmRuleItems(activeNajmItems(itemsResult));
    setLoading(false);
    setRefreshing(false);
    if (showToast && managementResult.data) toast.success("اطلاعات افتخارات به‌روز شد");
  }

  useEffect(() => {
    void loadAll();
  }, []);

  // تا وقتی یک دیالوگ (ایجاد/ویرایش/اعطا) باز است، به‌روزرسانی بی‌صدا متوقف می‌شود
  // تا اطلاعات در حال تایپ کاربر هرگز پاک یا بازنشانی نشود.
  const anyDialogOpenRef = useRef(false);
  useEffect(() => {
    anyDialogOpenRef.current =
      editorOpen ||
      grantDialog ||
      activityTypeDialog ||
      recordActivityDialog ||
      notifyDialog ||
      viewTarget !== null ||
      artworkBadge !== null;
  }, [
    editorOpen,
    grantDialog,
    activityTypeDialog,
    recordActivityDialog,
    notifyDialog,
    viewTarget,
    artworkBadge,
  ]);

  // ارزیابی و به‌روزرسانی خودکار هر ۶۰ ثانیه (بی‌صدا — فقط وقتی دیالوگی باز نیست)
  useEffect(() => {
    const id = setInterval(() => {
      if (anyDialogOpenRef.current) return;
      if (document.visibilityState !== "visible") return;
      void loadAll(false, true);
    }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalRecipients = useMemo(() => {
    const ids = new Set(
      (snapshot?.recent_awards ?? [])
        .filter((item) => !item.revoked_at)
        .map((item) => item.student_id),
    );
    return ids.size;
  }, [snapshot]);

  async function handleCandidateDecision(candidateId: string, decision: "approved" | "rejected") {
    let note = "";
    if (decision === "rejected") {
      note = window.prompt("علت رد پیشنهاد را وارد کنید:")?.trim() ?? "";
      if (!note) return;
    }
    const result = await decideAchievementCandidate(candidateId, decision, note || undefined);
    if (result.error) return toast.error(result.error);
    toast.success(decision === "approved" ? "نشان تأیید و اعطا شد" : "پیشنهاد رد شد");
    await loadAll();
  }

  async function handleActivityDecision(activityId: string, decision: "verified" | "rejected") {
    const note =
      decision === "rejected" ? window.prompt("علت رد فعالیت را وارد کنید:")?.trim() : undefined;
    if (decision === "rejected" && !note) return;
    const result = await decideStudentSpecialActivity(activityId, decision, note);
    if (result.error) return toast.error(result.error);
    toast.success(decision === "verified" ? "فعالیت تأیید شد" : "فعالیت رد شد");
    await loadAll();
  }

  /* ----- افتخارات پلکانی طرح نجم ----- */
  const najmQuests = useMemo(
    () => (snapshot?.definitions ?? []).filter((d) => d.metadata?.quest_kind === "najm_item"),
    [snapshot],
  );
  /** نشان‌های دستی: مدیر شرایط کسب را تعریف می‌کند و خودش اعطا می‌کند (بدون قانون خودکار و پله‌بندی) */
  const manualBadges = useMemo(
    () =>
      (snapshot?.definitions ?? []).filter(
        (d) => d.decision_mode === "manual" && d.metadata?.quest_kind !== "najm_item",
      ),
    [snapshot],
  );

  function najmItemLabel(itemKey?: string): string {
    if (!itemKey) return "—";
    return najmItems.find((i) => i.item_key === itemKey)?.label ?? itemKey;
  }
  function najmQuestMetricLabel(metric?: string): string {
    return NAJM_QUEST_METRICS.find((m) => m.value === metric)?.label ?? "حداقل در هر جلسه";
  }

  async function handleDeleteAchievement(definition: AchievementDefinition) {
    if (
      !window.confirm(
        `آیا از حذف افتخار «${definition.title}» مطمئن هستید؟\n\n` +
          "اگر این افتخار قبلاً اعطا یا نامزد شده باشد، با «حذف نرم» فقط از فهرست خارج می‌شود و همه‌ی سوابقش حفظ می‌ماند؛ در غیر این صورت کاملاً حذف خواهد شد.",
      )
    )
      return;
    const result = await deleteAchievement(definition.id);
    if (result.error) {
      toast.error("خطا در حذف افتخار: " + result.error);
      return;
    }
    toast.success(
      result.data === "deleted"
        ? `افتخار «${definition.title}» کاملاً حذف شد`
        : `«${definition.title}» حذف نرم شد — سوابق اعطای آن کاملاً حفظ ماند`,
    );
    await loadAll(false, true);
  }

  async function handleDuplicateAchievement(definition: AchievementDefinition) {
    const result = await duplicateAchievement(definition.id);
    if (result.error) {
      toast.error("خطا در کپی افتخار: " + result.error);
      return;
    }
    toast.success(`کپی «${definition.title}» ساخته شد (غیرفعال — پس از بازبینی فعالش کنید)`);
    await loadAll(false, true);
  }

  async function handleArchive(definition: AchievementDefinition) {
    const result = await setAchievementActive(definition.id, !definition.is_active);
    if (result.error) return toast.error(result.error);
    toast.success(definition.is_active ? "نشان آرشیو شد" : "نشان فعال شد");
    await loadAll();
  }

  async function handleRevoke(awardId: string) {
    const reason = window.prompt("علت لغو افتخار را وارد کنید:")?.trim();
    if (!reason) return;
    const result = await revokeStudentAchievement(awardId, reason);
    if (result.error) return toast.error(result.error);
    toast.success("افتخار لغو شد و تاریخچه آن محفوظ ماند");
    await loadAll();
  }

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال بارگذاری هسته افتخارات...</span>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <Card className="p-10 text-center" dir="rtl">
        <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4">اطلاعات افتخارات در دسترس نیست.</p>
        <Button className="mt-4" onClick={() => void loadAll()}>
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="مدیریت افتخارات"
        description="هسته یکپارچه افتخارات بر پایه طرح نجم، فعالیت‌های ویژه و تصمیم‌های مدیریتی"
        actions={
          <>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void loadAll(true)}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              به‌روزرسانی
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setNotifyDialog(true)}>
              <Bell className="h-4 w-4" /> قالب اعلان
            </Button>
            <Button
              className="gap-2"
              onClick={() => {
                setGrantTarget(null);
                setGrantDialog(true);
              }}
            >
              <Award className="h-4 w-4" /> اعطای مستقیم
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="نشان‌های تعریف‌شده"
          value={toFa(snapshot.definitions.length)}
          hint={`${toFa(snapshot.definitions.filter((item) => item.is_active).length)} نشان فعال`}
          icon={<Trophy className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label="افتخارات ثبت‌شده"
          value={toFa(snapshot.recent_awards.filter((item) => !item.revoked_at).length)}
          hint={`برای ${toFa(totalRecipients)} قرآن‌آموز`}
          icon={<Award className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="پیشنهادهای در انتظار"
          value={toFa(snapshot.pending_candidates.length)}
          hint="نیازمند تصمیم مدیر"
          icon={<UserCheck className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="فعالیت‌های در انتظار"
          value={toFa(snapshot.pending_activities.length)}
          hint={`${toFa(snapshot.activity_types.length)} نوع فعالیت ویژه`}
          icon={<Activity className="h-5 w-5" />}
          tone="primary"
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-2xl bg-secondary/60 p-1">
          <TabsTrigger value="overview">نمای کلی</TabsTrigger>
          <TabsTrigger value="badges">نشان‌ها</TabsTrigger>
          <TabsTrigger value="candidates">
            پیشنهادها
            {snapshot.pending_candidates.length > 0 && (
              <Badge className="mr-1 border-0 bg-amber-500 px-1.5 py-0 text-[10px] text-white">
                {toFa(snapshot.pending_candidates.length)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="activities">فعالیت‌های ویژه</TabsTrigger>
          <TabsTrigger value="recipients">دریافت‌کنندگان</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="rounded-3xl p-5">
              <SectionTitle icon={<UserCheck className="h-5 w-5" />} title="موارد نیازمند تصمیم" />
              <div className="mt-4 space-y-3">
                {snapshot.pending_candidates.length === 0 &&
                snapshot.pending_activities.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="h-9 w-9" />}
                    text="موردی در انتظار بررسی نیست."
                  />
                ) : (
                  <>
                    {snapshot.pending_candidates.slice(0, 4).map((candidate) => (
                      <div key={candidate.id} className="rounded-2xl border bg-amber-50/50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{candidate.student_name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              نامزد «{candidate.achievement_title}» •{" "}
                              {candidate.class_name ?? "بدون کلاس"}
                            </p>
                          </div>
                          <Badge className="border-0 bg-amber-500 text-white">پیشنهاد نشان</Badge>
                        </div>
                      </div>
                    ))}
                    {snapshot.pending_activities.slice(0, 4).map((activityItem) => (
                      <div key={activityItem.id} className="rounded-2xl border bg-blue-50/50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{activityItem.student_name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {activityItem.activity_type_title} •{" "}
                              {formatDate(activityItem.occurred_at)}
                            </p>
                          </div>
                          <Badge className="border-0 bg-blue-600 text-white">فعالیت ویژه</Badge>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </Card>

            <Card className="rounded-3xl p-5">
              <SectionTitle icon={<Trophy className="h-5 w-5" />} title="آخرین افتخارات" />
              <div className="mt-4 space-y-3">
                {snapshot.recent_awards
                  .filter((item) => !item.revoked_at)
                  .slice(0, 6)
                  .map((awardItem) => (
                    <div
                      key={awardItem.id}
                      className="flex items-center gap-3 rounded-2xl border bg-card p-3"
                    >
                      <div className={`rounded-xl border p-2 ${TIER_STYLES[awardItem.tier]}`}>
                        <Award className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{awardItem.student_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{awardItem.title}</p>
                      </div>
                      <div className="text-left text-[10px] text-muted-foreground">
                        {formatDate(awardItem.awarded_at)}
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="badges" className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-bold">نشان‌ها و افتخارها</h2>
            <p className="text-sm text-muted-foreground">
              دو نوع افتخار: خودکار از روی داده‌های طرح نجم (پلکانی) و دستی (تعریف شرایط و اعطا توسط
              مدیر).
            </p>
          </div>

          {/* افتخارات پلکانی مبتنی بر آیتم‌های طرح نجم */}
          <Card className="overflow-hidden rounded-3xl border-emerald-200/60">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-l from-emerald-50 to-amber-50/60 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-emerald-600/10 p-2.5 text-emerald-700">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-black text-emerald-950">
                      افتخارات پلکانی طرح نجم
                    </h3>
                    <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      سطح‌بندی سفارشی مدیر
                    </Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-xs leading-6 text-muted-foreground">
                    برای هر آیتم طرح نجم یک افتخار چندسطحی بسازید؛ دانش‌آموز بر اساس نمره و تعداد
                    جلسات مشخص، مرحله‌به‌مرحله ارتقا می‌یابد. ارزیابی از جلسات اعمال‌شده‌ی ترم فعال
                    و به‌صورت خودکار هر دقیقه انجام می‌شود.
                  </p>
                  {lastQuestEvalAt && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                      <Clock className="h-3 w-3" />
                      آخرین ارزیابی:{" "}
                      {lastQuestEvalAt.toLocaleTimeString("fa-IR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={evaluatingQuests}
                  onClick={() => void runQuestEvaluation(true).then(() => loadAll(true))}
                >
                  {evaluatingQuests ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  ارزیابی و به‌روزرسانی
                </Button>
                <Button
                  size="sm"
                  className="gap-2 bg-emerald-700 hover:bg-emerald-800"
                  onClick={() => openAchievementEditor("quest", null)}
                >
                  <Plus className="h-4 w-4" /> افتخار پلکانی جدید
                </Button>
              </div>
            </div>

            {najmQuests.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                هنوز افتخار پلکانی‌ای تعریف نشده است؛ با دکمه «افتخار پلکانی جدید» بسازید.
              </div>
            ) : (
              <div className="mobile-achievement-grid grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {najmQuests.map((quest) => {
                  const tiers = (quest.quest_tiers ?? [])
                    .slice()
                    .sort((a, b) => (a.level_index ?? 0) - (b.level_index ?? 0));
                  return (
                    <Card
                      key={quest.id}
                      className={`relative overflow-hidden rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-md ${
                        quest.is_active ? "" : "opacity-60"
                      }`}
                    >
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-amber-500 via-emerald-400 to-sky-400" />
                      <div className="flex items-start gap-3">
                        <AchievementVisual definition={quest} className="h-16 w-16" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-display font-bold">{quest.title}</h4>
                            <Badge
                              variant="outline"
                              className={
                                quest.decision_mode === "automatic"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                              }
                            >
                              {quest.decision_mode === "automatic"
                                ? "اعطای خودکار"
                                : "با تأیید مدیر"}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">
                            {quest.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <InfoPill
                          label="آیتم طرح نجم"
                          value={najmItemLabel(quest.metadata?.item_key)}
                        />
                        <InfoPill
                          label="روش محاسبه"
                          value={najmQuestMetricLabel(quest.metadata?.metric)}
                        />
                        <InfoPill label="دریافت‌کننده" value={toFa(quest.recipient_count)} />
                        <InfoPill label="تعداد اعطا" value={toFa(quest.award_count)} />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {tiers.map((config) => {
                          const ladderColor =
                            NAJM_QUEST_TIER_LADDER.find((l) => l.key === config.tier)?.color ??
                            "text-violet-700 bg-violet-100 border-violet-300";
                          const levelLabel =
                            config.label ??
                            NAJM_QUEST_TIER_LADDER.find((l) => l.key === config.tier)?.label ??
                            config.tier;
                          return (
                            <Badge
                              key={config.tier}
                              variant="outline"
                              className={`gap-1 rounded-full text-[10px] ${ladderColor} ${
                                config.is_active === false ? "opacity-40 line-through" : ""
                              }`}
                              title={
                                (config.congrats_message
                                  ? "پیام تبریک: " + config.congrats_message
                                  : "") + (config.image_url ? "\nدارای تصویر اختصاصی" : "")
                              }
                            >
                              {levelLabel}: {toFa(config.sessions_count)} جلسه ≥{" "}
                              {toFa(config.threshold)}
                              {(config.bonus_points ?? 0) > 0
                                ? ` (+${toFa(config.bonus_points ?? 0)} امتیاز هدیه)`
                                : ""}
                              {config.image_url ? " 🖼" : ""}
                            </Badge>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => setViewTarget(quest)}
                        >
                          <Eye className="h-3.5 w-3.5" /> مشاهده
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => openAchievementEditor("quest", quest)}
                        >
                          <Edit3 className="h-3.5 w-3.5" /> ویرایش
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => void handleDuplicateAchievement(quest)}
                        >
                          <Copy className="h-3.5 w-3.5" /> کپی
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 border-amber-200 text-amber-800"
                          onClick={() => setArtworkBadge(quest)}
                        >
                          <Cuboid className="h-3.5 w-3.5" /> طرح سه‌بعدی
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          onClick={() => void handleArchive(quest)}
                        >
                          <Archive className="h-3.5 w-3.5" />{" "}
                          {quest.is_active ? "آرشیو" : "فعال‌سازی"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => void handleDeleteAchievement(quest)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> حذف
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>

          {/* افتخارات دستی — تعریف شرایط و اعطا توسط مدیر */}
          <Card className="overflow-hidden rounded-3xl border-sky-200/60">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-l from-sky-50 to-indigo-50/60 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-sky-600/10 p-2.5 text-sky-700">
                  <HandHeart className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-black text-sky-950">افتخارات دستی</h3>
                    <Badge className="rounded-full border-0 bg-sky-100 text-sky-800 hover:bg-sky-100">
                      تعریف شرایط + اعطای مدیر
                    </Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-xs leading-6 text-muted-foreground">
                    شرایط کسب هر نشان را خودتان به‌صورت متن آزاد می‌نویسید (مثلاً برنده مسابقه حفظ،
                    خدمت برگزیده، مشارکت در برنامه‌ها و…) و هر زمان خواستید به قرآن‌آموزان دلخواه
                    اعطا می‌کنید؛ بدون قانون خودکار — سطوح دلخواه هم می‌توانید بسازید.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="gap-2 bg-sky-700 hover:bg-sky-800"
                onClick={() => {
                  openAchievementEditor("manual", null);
                }}
              >
                <Plus className="h-4 w-4" /> نشان دستی جدید
              </Button>
            </div>

            {manualBadges.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                هنوز نشان دستی تعریف نشده است؛ با دکمه «نشان دستی جدید» بسازید.
              </div>
            ) : (
              <div className="mobile-achievement-grid grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {manualBadges.map((definition) => (
                  <Card
                    key={definition.id}
                    className={`relative overflow-hidden rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-md ${
                      definition.is_active ? "" : "opacity-60"
                    }`}
                  >
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-sky-500 via-indigo-400 to-sky-500" />
                    <div className="flex items-start gap-3">
                      <AchievementVisual definition={definition} className="h-16 w-16" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-display font-bold">{definition.title}</h4>
                          <Badge variant="outline" className={TIER_STYLES[definition.tier]}>
                            {TIER_LABELS[definition.tier]}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">
                          {definition.description || "بدون شرایط ثبت‌شده"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <InfoPill label="دسته" value={definition.category_title ?? "—"} />
                      <InfoPill label="دریافت‌کننده" value={toFa(definition.recipient_count)} />
                    </div>

                    {(definition.quest_tiers ?? []).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(definition.quest_tiers ?? [])
                          .slice()
                          .sort((a, b) => (a.level_index ?? 0) - (b.level_index ?? 0))
                          .map((level) => (
                            <Badge
                              key={level.tier}
                              variant="outline"
                              className={`gap-1 rounded-full text-[10px] ${
                                NAJM_QUEST_TIER_LADDER.find((l) => l.key === level.tier)?.color ??
                                "text-violet-700 bg-violet-100 border-violet-300"
                              } ${level.is_active === false ? "opacity-40 line-through" : ""}`}
                            >
                              {level.label ??
                                NAJM_QUEST_TIER_LADDER.find((l) => l.key === level.tier)?.label ??
                                level.tier}
                              {(level.bonus_points ?? 0) > 0
                                ? ` (+${toFa(level.bonus_points ?? 0)} امتیاز هدیه)`
                                : ""}
                              {level.image_url ? " 🖼" : ""}
                            </Badge>
                          ))}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {definition.is_active && (
                        <Button
                          size="sm"
                          className="gap-1 bg-sky-700 hover:bg-sky-800"
                          onClick={() => {
                            setGrantTarget(definition);
                            setGrantDialog(true);
                          }}
                        >
                          <UserCheck className="h-3.5 w-3.5" /> اعطای دستی
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => setViewTarget(definition)}
                      >
                        <Eye className="h-3.5 w-3.5" /> مشاهده
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => openAchievementEditor("manual", definition)}
                      >
                        <Edit3 className="h-3.5 w-3.5" /> ویرایش
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => void handleDuplicateAchievement(definition)}
                      >
                        <Copy className="h-3.5 w-3.5" /> کپی
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-amber-200 text-amber-800"
                        onClick={() => setArtworkBadge(definition)}
                      >
                        <Cuboid className="h-3.5 w-3.5" /> طرح سه‌بعدی
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        onClick={() => void handleArchive(definition)}
                      >
                        <Archive className="h-3.5 w-3.5" />{" "}
                        {definition.is_active ? "آرشیو" : "فعال‌سازی"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => void handleDeleteAchievement(definition)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="candidates" className="space-y-4">
          <Card className="overflow-hidden rounded-3xl">
            <div className="border-b bg-amber-50/60 p-5">
              <SectionTitle
                icon={<UserCheck className="h-5 w-5" />}
                title="پیشنهادهای در انتظار تأیید مدیر"
              />
            </div>
            <div className="divide-y">
              {snapshot.pending_candidates.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="h-9 w-9" />}
                  text="پیشنهاد در انتظاری وجود ندارد."
                />
              ) : (
                snapshot.pending_candidates.map((candidate) => (
                  <div key={candidate.id} className="p-4 md:p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={`rounded-xl border p-2 ${TIER_STYLES[candidate.achievement_tier]}`}
                        >
                          <Award className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold">{candidate.student_name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            نشان «{candidate.achievement_title}» •{" "}
                            {candidate.class_name ?? "بدون کلاس"}
                          </p>
                          <p className="mt-2 text-xs leading-6">
                            {candidate.reason || "بدون توضیح"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {candidate.nomination_source === "teacher"
                                ? "پیشنهاد استاد"
                                : "تشخیص سیستم"}
                            </Badge>
                            <Badge variant="outline">
                              منبع: {SOURCE_LABELS[candidate.achievement_source]}
                            </Badge>
                            <Badge variant="outline">{formatDate(candidate.created_at)}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="gap-1 bg-emerald-700 hover:bg-emerald-800"
                          onClick={() => void handleCandidateDecision(candidate.id, "approved")}
                        >
                          <Check className="h-4 w-4" /> تأیید و اعطا
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-1 text-rose-700"
                          onClick={() => void handleCandidateDecision(candidate.id, "rejected")}
                        >
                          <X className="h-4 w-4" /> رد
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">فعالیت‌های ویژه</h2>
              <p className="text-sm text-muted-foreground">
                ثبت ساده واقعیت‌های تأییدشده؛ بدون ایجاد سیستم نمره‌دهی موازی.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setActivityTypeDialog(true)}
              >
                <Plus className="h-4 w-4" /> نوع فعالیت
              </Button>
              <Button className="gap-2" onClick={() => setRecordActivityDialog(true)}>
                <Activity className="h-4 w-4" /> ثبت فعالیت
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {snapshot.activity_types.map((activityType) => (
              <Card key={activityType.id} className="rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Activity className="h-5 w-5" />
                  </div>
                  <Badge variant="outline">
                    {activityType.teacher_can_record ? "ثبت استاد مجاز" : "فقط مدیر"}
                  </Badge>
                </div>
                <h3 className="mt-3 font-bold">{activityType.title}</h3>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  {activityType.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                  <Badge variant="secondary">واحد: {activityType.unit_label}</Badge>
                  <Badge variant="secondary">
                    {activityType.requires_admin_verification ? "نیازمند تأیید" : "ثبت مستقیم"}
                  </Badge>
                  <Badge variant="secondary">منبع: {SOURCE_LABELS[activityType.source_kind]}</Badge>
                </div>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden rounded-3xl">
            <div className="border-b bg-blue-50/60 p-5">
              <SectionTitle
                icon={<Activity className="h-5 w-5" />}
                title="فعالیت‌های ثبت‌شده توسط استاد و در انتظار تأیید"
              />
            </div>
            <div className="divide-y">
              {snapshot.pending_activities.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="h-9 w-9" />}
                  text="فعالیت در انتظاری وجود ندارد."
                />
              ) : (
                snapshot.pending_activities.map((activityItem) => (
                  <div
                    key={activityItem.id}
                    className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-bold">{activityItem.student_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activityItem.activity_type_title} •{" "}
                        {activityItem.class_name ?? "بدون کلاس"}
                      </p>
                      <p className="mt-1 text-xs">{activityItem.notes || "بدون توضیح"}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1 bg-emerald-700"
                        onClick={() => void handleActivityDecision(activityItem.id, "verified")}
                      >
                        <Check className="h-3.5 w-3.5" /> تأیید
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-rose-700"
                        onClick={() => void handleActivityDecision(activityItem.id, "rejected")}
                      >
                        <X className="h-3.5 w-3.5" /> رد
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="recipients">
          <Card className="overflow-hidden rounded-3xl">
            <div className="border-b p-5">
              <SectionTitle icon={<Users className="h-5 w-5" />} title="آخرین دریافت‌کنندگان" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-secondary/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right">قرآن‌آموز</th>
                    <th className="p-3 text-right">نشان</th>
                    <th className="p-3 text-right">درجه</th>
                    <th className="p-3 text-right">روش اعطا</th>
                    <th className="p-3 text-right">منبع افتخار</th>
                    <th className="p-3 text-right">تاریخ</th>
                    <th className="p-3 text-right">وضعیت</th>
                    <th className="p-3 text-right">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {snapshot.recent_awards.map((awardItem) => (
                    <tr key={awardItem.id} className="hover:bg-secondary/20">
                      <td className="p-3">
                        <div className="font-medium">{awardItem.student_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {awardItem.class_name ?? "—"}
                        </div>
                      </td>
                      <td className="p-3 font-medium">{awardItem.title}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={TIER_STYLES[awardItem.tier]}>
                          {TIER_LABELS[awardItem.tier]}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {awardItem.grant_method === "automatic"
                          ? "خودکار"
                          : awardItem.grant_method === "admin_direct"
                            ? "مدیر"
                            : awardItem.grant_method === "teacher_nomination"
                              ? "پیشنهاد استاد"
                              : "انتقال قدیمی"}
                      </td>
                      <td className="p-3">{SOURCE_LABELS[awardItem.achievement_source]}</td>
                      <td className="p-3 text-xs">{formatDate(awardItem.awarded_at)}</td>
                      <td className="p-3">
                        {awardItem.revoked_at ? (
                          <Badge variant="destructive">لغوشده</Badge>
                        ) : (
                          <Badge className="border-0 bg-emerald-600 text-white">فعال</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {!awardItem.revoked_at && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-700"
                            onClick={() => void handleRevoke(awardItem.id)}
                          >
                            لغو
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <AchievementEditorDialog
        open={editorOpen}
        createKind={editorCreateKind}
        initial={editorInitial}
        categories={snapshot.categories}
        classes={classes}
        najmItems={najmItems}
        najmRuleItems={najmRuleItems}
        onClose={() => {
          setEditorOpen(false);
          setEditorInitial(null);
        }}
        onSaved={async () => {
          setEditorOpen(false);
          setEditorInitial(null);
          await loadAll(true);
        }}
      />
      <AchievementViewDialog
        definition={viewTarget}
        classes={classes}
        onClose={() => setViewTarget(null)}
      />
      <ArtworkManagerDialog
        open={artworkBadge !== null}
        definition={artworkBadge}
        onOpenChange={(open) => !open && setArtworkBadge(null)}
        onSaved={async () => {
          setArtworkBadge(null);
          await loadAll();
        }}
      />
      <DirectGrantDialog
        open={grantDialog}
        onOpenChange={(open) => {
          setGrantDialog(open);
          if (!open) setGrantTarget(null);
        }}
        students={students}
        definitions={manualBadges.filter((item) => item.is_active)}
        lockedAchievement={grantTarget}
        activeTerm={activeTerm}
        onSaved={async () => {
          setGrantDialog(false);
          setGrantTarget(null);
          await loadAll();
        }}
      />
      <ActivityTypeDialog
        open={activityTypeDialog}
        onOpenChange={setActivityTypeDialog}
        onSaved={async () => {
          setActivityTypeDialog(false);
          await loadAll();
        }}
      />
      <RecordActivityDialog
        open={recordActivityDialog}
        onOpenChange={setRecordActivityDialog}
        students={students}
        activityTypes={snapshot.activity_types.filter((item) => item.is_active)}
        activeTerm={activeTerm}
        onSaved={async () => {
          setRecordActivityDialog(false);
          await loadAll();
        }}
      />
      <NotifyTemplateDialog open={notifyDialog} onOpenChange={setNotifyDialog} />
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <h2 className="font-display flex items-center gap-2 text-lg font-bold text-foreground">
      {icon}
      {title}
    </h2>
  );
}

/** متغیرهای قابل‌استفاده در قالب اعلان کسب افتخار */
const NOTIFY_TEMPLATE_VARIABLES = ["{نام فرد}", "{افتخار}", "{سطح}", "{تاریخ}"];

/**
 * دیالوگ ویرایش قالب اعلان داخل سامانه برای دریافت یا ارتقای افتخار.
 * محتوای فعلی قالب فقط هنگام «باز شدن» دیالوگ بارگیری می‌شود تا تایپ کاربر
 * هرگز با به‌روزرسانی‌های بی‌صدا بازنشانی نشود.
 */
function NotifyTemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(DEFAULT_NOTIFY_TEMPLATES.title);
  const [body, setBody] = useState(DEFAULT_NOTIFY_TEMPLATES.body);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const result = await loadAchievementNotifyTemplates();
      if (cancelled) return;
      if (result.error || !result.data) {
        toast.error(result.error ?? "خطا در دریافت قالب اعلان");
        setLoading(false);
        onOpenChange(false);
        return;
      }
      setTitle(result.data.title);
      setBody(result.data.body);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSave() {
    const next = {
      title: title.trim() || DEFAULT_NOTIFY_TEMPLATES.title,
      body: body.trim() || DEFAULT_NOTIFY_TEMPLATES.body,
    };
    setSaving(true);
    const result = await saveAchievementNotifyTemplates(next);
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success("قالب اعلان افتخار ذخیره شد");
    onOpenChange(false);
  }

  const insertVariable = (variable: string) =>
    setBody((prev) => `${prev}${prev.endsWith(" ") || prev === "" ? "" : " "}${variable}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-600" /> قالب اعلان کسب افتخار
          </DialogTitle>
          <DialogDescription>
            پس از دریافت یا ارتقای هر افتخار، اعلان داخل سامانه برای قرآن‌آموز (و بر اساس تنظیمات،
            برای ولی و استاد) با همین قالب ساخته می‌شود. متغیرها به‌صورت خودکار مقدار می‌گیرند.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>عنوان اعلان</Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={DEFAULT_NOTIFY_TEMPLATES.title}
              />
            </div>
            <div className="space-y-1.5">
              <Label>متن اعلان</Label>
              <Textarea
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={DEFAULT_NOTIFY_TEMPLATES.body}
              />
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-bold text-amber-900">متغیرهای قابل استفاده</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {NOTIFY_TEMPLATE_VARIABLES.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 transition hover:bg-amber-100"
                    onClick={() => insertVariable(variable)}
                  >
                    {variable}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-5 text-amber-800/80">
                متغیر {"{نام فرد}"} نام قرآن‌آموز، {"{افتخار}"} نام نشان و {"{سطح}"} نام سطح جدید
                (در نشان‌های سطح‌دار) است. متغیر {"{تاریخ}"} هنگام نمایش اعلان به تاریخ دریافت به
                تقویم جلالی تبدیل می‌شود.
              </p>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            ذخیره قالب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="p-10 text-center text-muted-foreground">
      <div className="mx-auto flex w-fit opacity-50">{icon}</div>
      <p className="mt-3 text-sm">{text}</p>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-2">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * دیالوگ تعریف/ویرایش «نشان دستی» — مدیر شرایط کسب را به‌صورت متن آزاد می‌نویسد
 * و اعطای آن کاملاً دستی است؛ بدون قانون خودکار و بدون پله‌بندی.
 * نکته: مقداردهی فرم فقط هنگام «باز شدن» دیالوگ انجام می‌شود تا با به‌روزرسانی‌های
 * بی‌صدای صفحه، متن در حال تایپ کاربر هرگز پاک نشود.
 */
/* ------------------------------------------------------------------ */
/* ----------  انتخاب‌گر تصویر (بارگذاری مستقیم در فضای ذخیره‌سازی) ---------- */
/* ------------------------------------------------------------------ */

function ImagePickerField({
  value,
  onChange,
  folder,
  label,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  label: string;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    // فقط فرمت‌های مجاز آیکون افتخار: SVG, PNG, WEBP, JPG/JPEG
    const allowedExtensions = ["svg", "png", "webp", "jpg", "jpeg"];
    const rawExtension = file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const allowedTypes = ["image/svg+xml", "image/png", "image/webp", "image/jpeg"];
    if (
      !rawExtension ||
      !allowedExtensions.includes(rawExtension) ||
      (file.type && !allowedTypes.includes(file.type))
    ) {
      toast.error("فرمت فایل مجاز نیست؛ فقط SVG، PNG، WEBP یا JPG/JPEG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("حجم فایل بیش از ۲ مگابایت است؛ فایل کوچک‌تری انتخاب کنید.");
      return;
    }
    setUploading(true);
    try {
      const extension = rawExtension === "jpeg" ? "jpg" : rawExtension || "png";
      const path = `${folder}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from(ACHIEVEMENT_ARTWORK_BUCKET)
        .upload(path, file, { contentType: file.type || "image/png", upsert: false });
      if (error) throw error;
      const url = supabase.storage.from(ACHIEVEMENT_ARTWORK_BUCKET).getPublicUrl(path)
        .data.publicUrl;
      onChange(url);
      toast.success("تصویر بارگذاری شد");
    } catch (uploadError) {
      toast.error("بارگذاری تصویر ناموفق بود: " + (uploadError as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed bg-white/60 p-2.5">
      {value ? (
        // پیش‌نمایش تصویر بارگذاری‌شده
        <img src={value} alt={label} className="h-12 w-12 rounded-lg border object-cover" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ImagePlus className="h-5 w-5" />
        </div>
      )}
      <label className="flex flex-1 cursor-pointer items-center gap-2 text-xs font-medium text-primary hover:underline">
        {uploading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال بارگذاری…
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" /> {value ? "تعویض تصویر" : `بارگذاری ${label}`}
          </span>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
      </label>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-rose-600"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ----------  ویرایشگر یکپارچه افتخار — فیلدهای کامل + سطوح سفارشی ---------- */
/* ------------------------------------------------------------------ */

/** شرط قانون‌ساز (حالت پیش‌نویس در فرم) */
type RuleConditionDraft2 = {
  id: string;
  item_key: string;
  calc: RuleCalc;
  composite_items: string[];
  composite_agg: "sum" | "avg" | "min" | "max";
  operator: RuleOperator;
  value: string;
  value2: string;
  windowKind: RuleWindowKind;
  windowCount: string;
  polarity: "positive" | "negative";
  violation_trigger: boolean;
  is_active: boolean;
};

/** فرزند ریشه‌ی قانون: شرط یا گروه (گروه‌ها فقط شرط دارند) */
type RuleChildDraft = {
  id: string;
  kind: "condition" | "group";
  logic: "all" | "any" | "at_least";
  logicCount: string;
  conditions: RuleConditionDraft2[];
  condition?: RuleConditionDraft2;
};

type LevelDraft = {
  key: string;
  label: string;
  image_url: string | null;
  congrats_message: string;
  bonus_points: string;
  conditions_text: string;
  is_active: boolean;
  sessions: string;
  threshold: string;
  ruleEnabled: boolean;
  ruleLogic: "all" | "any" | "at_least";
  ruleLogicCount: string;
  ruleChildren: RuleChildDraft[];
  breach_behavior: AchievementBreachBehavior;
  rule_priority: string;
};

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeConditionDraft(partial?: Partial<RuleConditionDraft2>): RuleConditionDraft2 {
  return {
    id: partial?.id ?? uid("c"),
    item_key: partial?.item_key ?? "",
    calc: partial?.calc ?? "sum",
    composite_items: partial?.composite_items ?? [],
    composite_agg: partial?.composite_agg ?? "sum",
    operator: partial?.operator ?? "ge",
    value: partial?.value ?? "",
    value2: partial?.value2 ?? "",
    windowKind: partial?.windowKind ?? "sessions",
    windowCount: partial?.windowCount ?? "12",
    polarity: partial?.polarity ?? "positive",
    violation_trigger: partial?.violation_trigger ?? false,
    is_active: partial?.is_active ?? true,
  };
}

/** فرزند ریشه از نوع شرط (همراه خود شرط) */
function makeConditionChild(): RuleChildDraft {
  return {
    id: uid("c"),
    kind: "condition",
    logic: "all",
    logicCount: "2",
    conditions: [],
    condition: makeConditionDraft(),
  };
}

function conditionFromConfig(cond: AchievementRuleCondition): RuleConditionDraft2 {
  return makeConditionDraft({
    item_key: cond.item_key ?? "",
    calc: cond.calc ?? "sum",
    composite_items: cond.composite_items ?? [],
    composite_agg: cond.composite_agg ?? "sum",
    operator: cond.operator ?? "ge",
    value: cond.value != null ? String(cond.value) : "",
    value2: cond.value2 != null ? String(cond.value2) : "",
    windowKind: cond.window?.kind ?? "term",
    windowCount: cond.window?.count != null ? String(cond.window.count) : "12",
    polarity: cond.polarity ?? "positive",
    violation_trigger: cond.violation_trigger ?? false,
    is_active: cond.is_active !== false,
  });
}

function childrenFromConfig(config?: AchievementRuleConfig | null): RuleChildDraft[] {
  if (!config?.children?.length) return [];
  return config.children.map((child) => {
    if ((child as AchievementRuleGroup).type === "group") {
      const group = child as AchievementRuleGroup;
      return {
        id: uid("g"),
        kind: "group" as const,
        logic: group.logic ?? "all",
        logicCount: group.logic_count != null ? String(group.logic_count) : "2",
        conditions: (group.children ?? [])
          .filter(
            (c): c is AchievementRuleCondition => (c as AchievementRuleGroup).type !== "group",
          )
          .map(conditionFromConfig),
      };
    }
    return {
      id: uid("c"),
      kind: "condition" as const,
      logic: "all" as const,
      logicCount: "2",
      conditions: [],
      condition: conditionFromConfig(child as AchievementRuleCondition),
    };
  });
}

function makeLevelDraft(partial?: Partial<LevelDraft>): LevelDraft {
  return {
    key: partial?.key ?? `lvl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: partial?.label ?? "",
    image_url: partial?.image_url ?? null,
    congrats_message: partial?.congrats_message ?? "",
    bonus_points: partial?.bonus_points ?? "",
    conditions_text: partial?.conditions_text ?? "",
    is_active: partial?.is_active ?? true,
    sessions: partial?.sessions ?? "",
    threshold: partial?.threshold ?? "",
    ruleEnabled: partial?.ruleEnabled ?? false,
    ruleLogic: partial?.ruleLogic ?? "all",
    ruleLogicCount: partial?.ruleLogicCount ?? "2",
    ruleChildren: partial?.ruleChildren ?? [],
    breach_behavior: partial?.breach_behavior ?? "block",
    rule_priority: partial?.rule_priority ?? "100",
  };
}

function defaultLevels(): LevelDraft[] {
  return NAJM_QUEST_TIER_LADDER.map((ladder) =>
    makeLevelDraft({ key: ladder.key, label: ladder.label }),
  );
}

function rowToLevelDraft(row: NajmQuestTierRow): LevelDraft {
  const ruleChildren = childrenFromConfig(row.rule_config ?? null);
  return makeLevelDraft({
    key: row.tier,
    label:
      row.label && row.label.length > 0
        ? row.label
        : (NAJM_QUEST_TIER_LADDER.find((l) => l.key === row.tier)?.label ?? row.tier),
    image_url: row.image_url ?? null,
    congrats_message: row.congrats_message ?? "",
    bonus_points: row.bonus_points ? String(row.bonus_points) : "",
    conditions_text: row.conditions_text ?? "",
    is_active: row.is_active !== false,
    sessions: row.sessions_count ? String(row.sessions_count) : "",
    threshold: typeof row.threshold === "number" ? String(row.threshold) : "",
    ruleEnabled: ruleChildren.length > 0,
    ruleLogic: (row.rule_config as AchievementRuleConfig | undefined)?.logic ?? "all",
    ruleLogicCount:
      (row.rule_config as AchievementRuleConfig | undefined)?.logic_count != null
        ? String((row.rule_config as AchievementRuleConfig).logic_count)
        : "2",
    ruleChildren,
    breach_behavior: (row.breach_behavior as AchievementBreachBehavior | undefined) ?? "block",
    rule_priority: row.rule_priority != null ? String(row.rule_priority) : "100",
  });
}

/* ------------------------------------------------------------------ */
/* ----------  قانون‌ساز گرافیکی سطح (بدون برنامه‌نویسی) ---------- */
/* ------------------------------------------------------------------ */

function conditionToConfig(cond: RuleConditionDraft2): AchievementRuleCondition {
  return {
    type: "condition",
    item_key: cond.item_key,
    calc: cond.calc,
    composite_items: cond.composite_items,
    composite_agg: cond.composite_agg,
    operator: cond.operator,
    ...(cond.value.trim() !== "" && Number.isFinite(Number(cond.value))
      ? { value: Number(cond.value) }
      : {}),
    ...(cond.value2.trim() !== "" && Number.isFinite(Number(cond.value2))
      ? { value2: Number(cond.value2) }
      : {}),
    window: {
      kind: cond.windowKind,
      ...(["sessions", "days", "weeks", "months"].includes(cond.windowKind)
        ? { count: Math.max(Math.round(Number(cond.windowCount) || 1), 1) }
        : {}),
    },
    polarity: cond.polarity,
    violation_trigger: cond.violation_trigger,
    is_active: cond.is_active,
  };
}

function ruleConfigFromDraft(level: LevelDraft): AchievementRuleConfig {
  const children: (AchievementRuleGroup | AchievementRuleCondition)[] = [];
  for (const child of level.ruleChildren) {
    if (child.kind === "group") {
      children.push({
        type: "group",
        logic: child.logic,
        ...(child.logic === "at_least"
          ? { logic_count: Math.max(Math.round(Number(child.logicCount) || 2), 1) }
          : {}),
        children: child.conditions.map(conditionToConfig),
      });
    } else if (child.condition) {
      children.push(conditionToConfig(child.condition));
    }
  }
  return {
    logic: level.ruleLogic,
    ...(level.ruleLogic === "at_least"
      ? { logic_count: Math.max(Math.round(Number(level.ruleLogicCount) || 2), 1) }
      : {}),
    children,
  };
}

function operatorNeedsValue(operator: RuleOperator): boolean {
  return !["is_zero", "never", "at_least_once"].includes(operator);
}

function calcNeedsItem(calc: RuleCalc): boolean {
  return !["negative_sum"].includes(calc);
}

/** بررسی یک شرط پیش‌نویس؛ پیام خطای فارسی یا null */
function validateConditionDraft(condition: RuleConditionDraft2): string | null {
  if (!condition.is_active) return null;
  if (calcNeedsItem(condition.calc) && condition.calc !== "composite" && !condition.item_key) {
    return "آیتم امتیازی یک شرط انتخاب نشده است.";
  }
  if (condition.calc === "composite" && condition.composite_items.length === 0) {
    return "برای «شرط ترکیبی چند آیتم» حداقل یک آیتم را علامت بزنید.";
  }
  if (operatorNeedsValue(condition.operator)) {
    if (condition.value.trim() === "" || !Number.isFinite(Number(condition.value))) {
      return "«مقدار موردنیاز» یک شرط وارد نشده یا عددی نیست.";
    }
    if (
      condition.operator === "between" &&
      (condition.value2.trim() === "" || !Number.isFinite(Number(condition.value2)))
    ) {
      return "برای عملگر «بین دو مقدار» هر دو مقدار لازم است.";
    }
  }
  if (["sessions", "days", "weeks", "months"].includes(condition.windowKind)) {
    if (!Number.isFinite(Number(condition.windowCount)) || Number(condition.windowCount) < 1) {
      return "تعداد بازه‌ی زمانی (N) یک شرط معتبر نیست.";
    }
  }
  return null;
}

/** اعتبارسنجی کل قانون یک سطح قبل از ذخیره */
function validateLevelRule(level: LevelDraft): string | null {
  const label = level.label || level.key;
  if (level.ruleChildren.length === 0) {
    return `قانون‌ساز سطح «${label}» فعال است اما هیچ شرطی ندارد؛ یک شرط اضافه کنید یا قانون‌ساز را خاموش کنید.`;
  }
  if (level.ruleLogic === "at_least") {
    if (!Number.isFinite(Number(level.ruleLogicCount)) || Number(level.ruleLogicCount) < 1) {
      return `حداقل تعداد شرط‌های سطح «${label}» معتبر نیست.`;
    }
  }
  let activeCount = 0;
  const checkLogicCount = (logic: RuleChildDraft["logic"], count: string): string | null =>
    logic === "at_least" && (!Number.isFinite(Number(count)) || Number(count) < 1)
      ? `حداقل تعداد شرط‌های یک گروه در سطح «${label}» معتبر نیست.`
      : null;
  for (const child of level.ruleChildren) {
    if (child.kind === "condition" && child.condition) {
      const error = validateConditionDraft(child.condition);
      if (error) return `سطح «${label}»: ${error}`;
      if (child.condition.is_active) activeCount += 1;
    } else if (child.kind === "group") {
      const logicError = checkLogicCount(child.logic, child.logicCount);
      if (logicError) return logicError;
      if (child.conditions.length === 0) {
        return `سطح «${label}»: یک «گروه شرط» خالی است؛ داخل آن شرط اضافه کنید یا گروه را حذف کنید.`;
      }
      for (const condition of child.conditions) {
        const error = validateConditionDraft(condition);
        if (error) return `سطح «${label}»: ${error}`;
        if (condition.is_active) activeCount += 1;
      }
    }
  }
  if (activeCount === 0) {
    return `همه‌ی شرط‌های سطح «${label}» غیرفعال است؛ حداقل یک شرط فعال لازم است.`;
  }
  return null;
}

/** ردیف یک شرط در قانون‌ساز */
function RuleConditionRow({
  condition,
  items,
  onChange,
  onRemove,
}: {
  condition: RuleConditionDraft2;
  items: NajmScoreItem[];
  onChange: (patch: Partial<RuleConditionDraft2>) => void;
  onRemove: () => void;
}) {
  const itemLabel = (key: string) => items.find((i) => i.item_key === key)?.label ?? key;
  return (
    <div
      className={`space-y-2 rounded-xl border bg-white p-3 ${condition.is_active ? "" : "opacity-50"}`}
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        {calcNeedsItem(condition.calc) && condition.calc !== "composite" ? (
          <Select
            value={condition.item_key}
            onValueChange={(value) =>
              onChange({
                item_key: value,
                ...(condition.calc === "composite" ? { calc: "sum" as RuleCalc } : {}),
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="آیتم امتیازی" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.item_key} value={item.item_key}>
                  {item.label}
                  {item.kind === "negative" ? " (منفی)" : item.kind === "special" ? " (ویژه)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex h-8 items-center rounded-md border bg-secondary/50 px-2 text-[11px] text-muted-foreground">
            {condition.calc === "composite"
              ? "چند آیتم (پایین انتخاب می‌شود)"
              : "آیتم‌های منفی نجم"}
          </div>
        )}

        <Select
          value={condition.calc}
          onValueChange={(value) => onChange({ calc: value as RuleCalc })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="نوع محاسبه" />
          </SelectTrigger>
          <SelectContent>
            {RULE_CALC_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={condition.operator}
          onValueChange={(value) => onChange({ operator: value as RuleOperator })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="عملگر" />
          </SelectTrigger>
          <SelectContent>
            {RULE_OPERATOR_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={condition.polarity}
          onValueChange={(value) =>
            onChange({ polarity: value as RuleConditionDraft2["polarity"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="positive">شرط مثبت (باید برقرار باشد)</SelectItem>
            <SelectItem value="negative">شرط منفی (نباید برقرار باشد)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {condition.calc === "composite" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 p-2">
          <span className="text-[10px] text-muted-foreground">آیتم‌های ترکیب:</span>
          {items.map((item) => {
            const checked = condition.composite_items.includes(item.item_key);
            return (
              <label
                key={item.item_key}
                className={`flex cursor-pointer items-center gap-1 rounded-lg border px-1.5 py-1 text-[10px] ${
                  checked ? "border-emerald-400 bg-emerald-50" : "bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-emerald-700"
                  checked={checked}
                  onChange={(event) =>
                    onChange({
                      composite_items: event.target.checked
                        ? [...condition.composite_items, item.item_key]
                        : condition.composite_items.filter((k) => k !== item.item_key),
                    })
                  }
                />
                {item.label}
              </label>
            );
          })}
          <Select
            value={condition.composite_agg}
            onValueChange={(value) =>
              onChange({ composite_agg: value as RuleConditionDraft2["composite_agg"] })
            }
          >
            <SelectTrigger className="h-7 w-32 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sum">مجموع ترکیب</SelectItem>
              <SelectItem value="avg">میانگین ترکیب</SelectItem>
              <SelectItem value="min">کمترین ترکیب</SelectItem>
              <SelectItem value="max">بیشترین ترکیب</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {operatorNeedsValue(condition.operator) && (
          <Input
            className="h-8 text-xs"
            inputMode="decimal"
            placeholder={condition.operator === "between" ? "مقدار اول" : "مقدار موردنیاز"}
            value={condition.value}
            onChange={(event) => onChange({ value: event.target.value })}
          />
        )}
        {condition.operator === "between" && (
          <Input
            className="h-8 text-xs"
            inputMode="decimal"
            placeholder="مقدار دوم"
            value={condition.value2}
            onChange={(event) => onChange({ value2: event.target.value })}
          />
        )}
        <Select
          value={condition.windowKind}
          onValueChange={(value) => onChange({ windowKind: value as RuleWindowKind })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="بازه زمانی" />
          </SelectTrigger>
          <SelectContent>
            {RULE_WINDOW_KIND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label === "تعداد جلسه" ? "N جلسه‌ی اخیر" : option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {["sessions", "days", "weeks", "months"].includes(condition.windowKind) && (
          <Input
            className="h-8 text-xs"
            inputMode="numeric"
            placeholder="تعداد بازه (N)"
            value={condition.windowCount}
            onChange={(event) => onChange({ windowCount: event.target.value })}
          />
        )}
        <label
          className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground"
          title="اگر نقض همین شرط باید «رفتار هنگام نقض» را فعال کند"
        >
          <input
            type="checkbox"
            className="h-3 w-3 accent-rose-600"
            checked={condition.violation_trigger}
            onChange={(event) => onChange({ violation_trigger: event.target.checked })}
          />
          نقض این شرط ⇒ رفتار نقض
        </label>
        <div className="flex items-center justify-end gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
            فعال
            <Switch
              checked={condition.is_active}
              onCheckedChange={(value) => onChange({ is_active: value })}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <p className="rounded-lg bg-emerald-50/60 px-2 py-1 text-[10px] leading-5 text-emerald-900">
        {buildConditionSummaryFa(conditionToConfig(condition), itemLabel)}
      </p>
    </div>
  );
}

/** پنل قانون‌ساز یک سطح؛ شرط‌ها + گروه‌های یک‌سطحی + خلاصه‌ی فارسی زنده */
function LevelRuleBuilder({
  level,
  items,
  onChange,
}: {
  level: LevelDraft;
  items: NajmScoreItem[];
  onChange: (patch: Partial<LevelDraft>) => void;
}) {
  const itemLabel = (key: string) => items.find((i) => i.item_key === key)?.label ?? key;

  function updateChild(childId: string, patch: Partial<RuleChildDraft>) {
    onChange({
      ruleChildren: level.ruleChildren.map((child) =>
        child.id === childId ? { ...child, ...patch } : child,
      ),
    });
  }

  const summary = buildRuleSummaryFa(ruleConfigFromDraft(level), itemLabel);

  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Field label="رابطه‌ی شرط‌ها">
          <Select
            value={level.ruleLogic}
            onValueChange={(value) => onChange({ ruleLogic: value as LevelDraft["ruleLogic"] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه‌ی شرط‌ها (AND)</SelectItem>
              <SelectItem value="any">حداقل یکی (OR)</SelectItem>
              <SelectItem value="at_least">حداقل تعداد مشخصی</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {level.ruleLogic === "at_least" && (
          <Field label="حداقل چند شرط برقرار باشد؟">
            <Input
              className="h-8 text-xs"
              inputMode="numeric"
              value={level.ruleLogicCount}
              onChange={(event) => onChange({ ruleLogicCount: event.target.value })}
            />
          </Field>
        )}
        <Field label="رفتار هنگام نقض قانون">
          <Select
            value={level.breach_behavior}
            onValueChange={(value) =>
              onChange({ breach_behavior: value as AchievementBreachBehavior })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_BREACH_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="اولویت قانون (کمتر = مهم‌تر)">
          <Input
            className="h-8 text-xs"
            inputMode="numeric"
            value={level.rule_priority}
            onChange={(event) => onChange({ rule_priority: event.target.value })}
          />
        </Field>
      </div>

      <div className="space-y-2">
        {level.ruleChildren.map((child) =>
          child.kind === "condition" && child.condition ? (
            <RuleConditionRow
              key={child.id}
              condition={child.condition}
              items={items}
              onChange={(patch) =>
                updateChild(child.id, { condition: { ...child.condition!, ...patch } })
              }
              onRemove={() =>
                onChange({ ruleChildren: level.ruleChildren.filter((c) => c.id !== child.id) })
              }
            />
          ) : (
            <div
              key={child.id}
              className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-700">گروه شرط‌ها</span>
                <Select
                  value={child.logic}
                  onValueChange={(value) =>
                    updateChild(child.id, { logic: value as RuleChildDraft["logic"] })
                  }
                >
                  <SelectTrigger className="h-7 w-40 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه (AND)</SelectItem>
                    <SelectItem value="any">حداقل یکی (OR)</SelectItem>
                    <SelectItem value="at_least">حداقل تعداد مشخصی</SelectItem>
                  </SelectContent>
                </Select>
                {child.logic === "at_least" && (
                  <Input
                    className="h-7 w-16 text-[11px]"
                    inputMode="numeric"
                    value={child.logicCount}
                    onChange={(event) => updateChild(child.id, { logicCount: event.target.value })}
                  />
                )}
                <div className="mr-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={() =>
                      updateChild(child.id, {
                        conditions: [...child.conditions, makeConditionDraft()],
                      })
                    }
                  >
                    <Plus className="h-3 w-3" /> شرط در گروه
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                    onClick={() =>
                      onChange({
                        ruleChildren: level.ruleChildren.filter((c) => c.id !== child.id),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {child.conditions.map((condition) => (
                <RuleConditionRow
                  key={condition.id}
                  condition={condition}
                  items={items}
                  onChange={(patch) =>
                    updateChild(child.id, {
                      conditions: child.conditions.map((c) =>
                        c.id === condition.id ? { ...c, ...patch } : c,
                      ),
                    })
                  }
                  onRemove={() =>
                    updateChild(child.id, {
                      conditions: child.conditions.filter((c) => c.id !== condition.id),
                    })
                  }
                />
              ))}
              {child.conditions.length === 0 && (
                <p className="text-[10px] text-muted-foreground">گروه خالی است — شرط اضافه کنید.</p>
              )}
            </div>
          ),
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => onChange({ ruleChildren: [...level.ruleChildren, makeConditionChild()] })}
        >
          <Plus className="h-3.5 w-3.5" /> شرط جدید
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() =>
            onChange({
              ruleChildren: [
                ...level.ruleChildren,
                {
                  id: uid("g"),
                  kind: "group" as const,
                  logic: "all" as const,
                  logicCount: "2",
                  conditions: [],
                },
              ],
            })
          }
        >
          <Plus className="h-3.5 w-3.5" /> گروه شرط جدید
        </Button>
      </div>

      {summary && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
          <Label className="text-[10px] text-emerald-800">خلاصه‌ی قانون به زبان ساده:</Label>
          <p className="mt-1 text-xs leading-6 text-emerald-950">{summary}</p>
        </div>
      )}
    </div>
  );
}

/** تبدیل مقدار datetime-local به ISO و برعکس */
function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function AchievementEditorDialog({
  open,
  createKind,
  initial,
  categories,
  classes,
  najmItems,
  najmRuleItems,
  onClose,
  onSaved,
}: {
  open: boolean;
  createKind: "quest" | "manual";
  initial: AchievementDefinition | null;
  categories: AchievementManagementSnapshot["categories"];
  classes: { id: number; name: string }[];
  najmItems: NajmScoreItem[];
  najmRuleItems: NajmScoreItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEditing = !!initial;
  const [kind, setKind] = useState<"quest" | "manual">(createKind);

  /* ----- فیلدهای کامل تعریف افتخار ----- */
  const [title, setTitle] = useState("");
  const [shortTitle, setShortTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [iconKey, setIconKey] = useState("Award");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [isSecret, setIsSecret] = useState(false);
  const [showInProfile, setShowInProfile] = useState(true);
  const [showInLeaderboard, setShowInLeaderboard] = useState(true);
  const [certificateEnabled, setCertificateEnabled] = useState(false);
  const [decisionMode, setDecisionMode] = useState<"automatic" | "admin_approval">(
    "admin_approval",
  );
  const [itemKey, setItemKey] = useState("");
  const [metric, setMetric] = useState<NajmQuestMetric>("per_session_min");
  const [durationKind, setDurationKind] = useState<"permanent" | "periodic">("permanent");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [repeatPolicy, setRepeatPolicy] = useState<"once" | "per_term" | "per_year" | "multiple">(
    "per_term",
  );
  const [maxAwards, setMaxAwards] = useState("");
  const [allowedClassIds, setAllowedClassIds] = useState<number[]>([]);
  const [congratsMessage, setCongratsMessage] = useState("");
  const [conditionsGuide, setConditionsGuide] = useState("");
  const [bonusNote, setBonusNote] = useState("");
  const [levels, setLevels] = useState<LevelDraft[]>(() => defaultLevels());
  const [saving, setSaving] = useState(false);

  // این آرایه‌ها با هر رفرش بی‌صدا آبجکت جدید می‌شوند؛ با ref مقدار تازه می‌خوانیم
  // تا مقداردهی فرم فقط «هنگام باز شدن» اجرا شود و متن در حال تایپ پاک نشود.
  const stableListsRef = useRef({ categories, classes, najmItems });
  stableListsRef.current = { categories, classes, najmItems };

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    const sourceKind: "quest" | "manual" = initial
      ? initial.metadata?.quest_kind === "najm_item"
        ? "quest"
        : "manual"
      : createKind;
    setKind(sourceKind);

    setTitle(initial?.title ?? "");
    setShortTitle(initial?.short_title ?? "");
    setDescription(initial?.description ?? "");
    setCategoryId(
      initial?.category_id ??
        stableListsRef.current.categories.find((category) => category.is_active !== false)?.id ??
        "",
    );
    setIconKey(initial?.icon_key ?? "Award");
    setArtworkUrl(initial?.artwork_url ?? null);
    setIsActive(initial?.is_active ?? true);
    setIsSecret(initial?.is_secret ?? false);
    setShowInProfile(initial?.show_in_profile ?? initial?.visibility !== "private");
    setShowInLeaderboard(initial?.show_in_leaderboard ?? initial?.visibility === "leaderboard");
    setCertificateEnabled(initial?.certificate_enabled ?? false);
    setDecisionMode(initial?.decision_mode === "automatic" ? "automatic" : "admin_approval");
    setItemKey(initial?.metadata?.item_key ?? stableListsRef.current.najmItems[0]?.item_key ?? "");
    setMetric((initial?.metadata?.metric as NajmQuestMetric | undefined) ?? "per_session_min");
    setDurationKind(initial?.duration_kind ?? "permanent");
    setValidFrom(toDateTimeLocalValue(initial?.valid_from));
    setValidUntil(toDateTimeLocalValue(initial?.valid_until));
    setRepeatPolicy(initial?.repeat_policy ?? "per_term");
    setMaxAwards(initial?.max_awards ? String(initial.max_awards) : "");
    setAllowedClassIds(initial?.allowed_class_ids ?? []);
    setCongratsMessage(initial?.congrats_message ?? "");
    setConditionsGuide(initial?.conditions_guide ?? "");
    setBonusNote(initial?.bonus_note ?? "");
    setLevels(
      initial && (initial.quest_tiers ?? []).length > 0
        ? (initial.quest_tiers ?? [])
            .slice()
            .sort((a, b) => (a.level_index ?? 0) - (b.level_index ?? 0))
            .map(rowToLevelDraft)
        : defaultLevels(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const selectedMetricHint = NAJM_QUEST_METRICS.find((m) => m.value === metric)?.hint ?? "";

  /* ----- عملیات سطح‌ها: افزودن، حذف، جابه‌جایی، ویرایش ----- */
  function updateLevel(key: string, patch: Partial<LevelDraft>) {
    setLevels((prev) => prev.map((level) => (level.key === key ? { ...level, ...patch } : level)));
  }

  function moveLevel(index: number, direction: -1 | 1) {
    setLevels((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addLevel() {
    setLevels((prev) => [...prev, makeLevelDraft()]);
  }

  function removeLevel(level: LevelDraft) {
    const awarded = initial?.tier_award_counts?.[level.key] ?? 0;
    if (awarded > 0) {
      toast.error(
        `سطح «${level.label || level.key}» قبلاً به ${toFa(awarded)} نفر اعطا شده است؛ برای حفظ سوابق فقط می‌توانید آن را غیرفعال کنید.`,
      );
      return;
    }
    setLevels((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== level.key)));
  }

  function toggleClass(classId: number, checked: boolean) {
    setAllowedClassIds((prev) =>
      checked ? [...new Set([...prev, classId])] : prev.filter((id) => id !== classId),
    );
  }

  async function submit() {
    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      toast.error("نام افتخار را وارد کنید (حداقل ۲ حرف).");
      return;
    }
    if (kind === "quest" && !itemKey) {
      toast.error("برای افتخار طرح نجم، آیتم را انتخاب کنید.");
      return;
    }
    if (durationKind === "periodic" && !validFrom && !validUntil) {
      toast.error("برای افتخار دوره‌ای، حداقل تاریخ شروع یا پایان اعتبار لازم است.");
      return;
    }
    const validFromIso = fromDateTimeLocal(validFrom);
    const validUntilIso = fromDateTimeLocal(validUntil);
    if (validFromIso && validUntilIso && new Date(validFromIso) >= new Date(validUntilIso)) {
      toast.error("تاریخ پایان اعتبار باید بعد از تاریخ شروع باشد.");
      return;
    }
    const maxAwardsNumber = maxAwards.trim() ? Math.round(Number(maxAwards)) : null;
    if (maxAwardsNumber !== null && (!Number.isFinite(maxAwardsNumber) || maxAwardsNumber < 1)) {
      toast.error("حداکثر دفعات دریافت باید عددی حداقل ۱ باشد (یا خالی = نامحدود).");
      return;
    }

    const payloadLevels: AchievementLevelInput[] = [];
    const seenKeys = new Set<string>();
    for (const level of levels) {
      if (!level.is_active) {
        // سطح غیرفعال هم (برای حفظ تاریخچه‌ی کلیدش) ذخیره می‌شود
      }
      if (level.is_active && level.label.trim().length < 1) {
        toast.error("نام همه‌ی سطح‌های فعال را وارد کنید.");
        return;
      }
      if (seenKeys.has(level.key)) {
        toast.error("کلید تکراری در سطوح وجود دارد؛ یک سطح را حذف و دوباره بسازید.");
        return;
      }
      seenKeys.add(level.key);
      const sessionsNumber = level.sessions.trim() ? Math.round(Number(level.sessions)) : 1;
      const thresholdNumber = level.threshold.trim() ? Number(level.threshold) : 0;
      const useRule = kind === "quest" && level.ruleEnabled;
      if (kind === "quest" && level.is_active && useRule) {
        const ruleError = validateLevelRule(level);
        if (ruleError) {
          toast.error(ruleError);
          return;
        }
      }
      if (kind === "quest" && level.is_active && !useRule) {
        if (!Number.isFinite(sessionsNumber) || sessionsNumber < 1) {
          toast.error(`تعداد جلسات سطح «${level.label || level.key}» باید حداقل ۱ باشد.`);
          return;
        }
        if (!Number.isFinite(thresholdNumber) || thresholdNumber < 0) {
          toast.error(
            `«نمره مورد نیاز برای هر جلسه» سطح «${level.label || level.key}» معتبر نیست.`,
          );
          return;
        }
      }
      const bonusNumber = level.bonus_points.trim() ? Math.round(Number(level.bonus_points)) : 0;
      payloadLevels.push({
        tier: level.key,
        label: level.label.trim() || level.key,
        image_url: level.image_url,
        congrats_message: level.congrats_message.trim() || null,
        bonus_points: Number.isFinite(bonusNumber) && bonusNumber > 0 ? bonusNumber : 0,
        conditions_text: level.conditions_text.trim() || null,
        is_active: level.is_active,
        sessions_count: sessionsNumber,
        threshold: thresholdNumber,
        rule_config: useRule ? ruleConfigFromDraft(level) : null,
        breach_behavior: useRule ? level.breach_behavior : undefined,
        rule_priority: useRule
          ? Math.max(Math.round(Number(level.rule_priority) || 100), 1)
          : undefined,
      });
    }
    if (!payloadLevels.some((level) => level.is_active !== false)) {
      toast.error("حداقل یک سطح فعال لازم است.");
      return;
    }

    setSaving(true);
    const result = await saveAchievementFull({
      id: initial?.id ?? null,
      slug: initial?.slug ?? null,
      title: cleanTitle,
      short_title: shortTitle.trim() || null,
      description: description.trim(),
      category_id: categoryId || null,
      icon_key: iconKey,
      artwork_url: artworkUrl,
      quest_kind: kind === "quest" ? "najm_item" : null,
      item_key: kind === "quest" ? itemKey : null,
      metric: kind === "quest" ? metric : null,
      decision_mode: kind === "quest" ? decisionMode : "manual",
      repeat_policy: kind === "quest" ? "per_term" : repeatPolicy,
      is_secret: isSecret,
      is_active: isActive,
      sort_order: initial?.sort_order ?? 0,
      congrats_message: congratsMessage.trim() || null,
      conditions_guide: conditionsGuide.trim() || null,
      bonus_note: bonusNote.trim() || null,
      certificate_enabled: certificateEnabled,
      duration_kind: durationKind,
      valid_from: durationKind === "periodic" ? validFromIso : null,
      valid_until: durationKind === "periodic" ? validUntilIso : null,
      max_awards: maxAwardsNumber,
      allowed_class_ids: allowedClassIds,
      show_in_profile: showInProfile,
      show_in_leaderboard: showInLeaderboard,
      levels: payloadLevels,
    });
    setSaving(false);

    if (result.error) {
      toast.error("خطا در ذخیره افتخار: " + result.error);
      return;
    }
    toast.success(
      isEditing ? `افتخار «${cleanTitle}» به‌روزرسانی شد` : `افتخار «${cleanTitle}» ساخته شد`,
    );
    await onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind === "quest" ? (
              <Layers className="h-5 w-5 text-emerald-700" />
            ) : (
              <HandHeart className="h-5 w-5 text-sky-700" />
            )}
            {isEditing
              ? kind === "quest"
                ? "ویرایش افتخار طرح نجم"
                : "ویرایش نشان دستی"
              : kind === "quest"
                ? "افتخار طرح نجم (خودکار) جدید"
                : "نشان دستی جدید"}
          </DialogTitle>
          <DialogDescription>
            همه‌ی اطلاعات افتخار و سطوح آن در همین فرم تعریف می‌شود؛ سطوح کاملاً سفارشی‌اند: نام،
            ترتیب، تصویر، شرایط، پیام تبریک و امتیاز هدیه‌ی هر سطح.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* نوع افتخار */}
          <div className="rounded-2xl border bg-secondary/40 p-3">
            <Label className="mb-2 block text-xs">نوع افتخار</Label>
            {isEditing ? (
              <Badge variant="outline" className="bg-white">
                {kind === "quest" ? "خودکار — بر اساس داده‌های طرح نجم" : "دستی — اعطا توسط مدیر"}
              </Badge>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={kind === "quest" ? "default" : "outline"}
                  className={
                    kind === "quest" ? "gap-1.5 bg-emerald-700 hover:bg-emerald-800" : "gap-1.5"
                  }
                  onClick={() => setKind("quest")}
                >
                  <Layers className="h-3.5 w-3.5" /> خودکار (طرح نجم)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={kind === "manual" ? "default" : "outline"}
                  className={kind === "manual" ? "gap-1.5 bg-sky-700 hover:bg-sky-800" : "gap-1.5"}
                  onClick={() => setKind("manual")}
                >
                  <HandHeart className="h-3.5 w-3.5" /> دستی
                </Button>
              </div>
            )}
          </div>

          {/* نام، عنوان کوتاه، دسته‌بندی، آیکون */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="نام افتخار *">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="مثلاً ستاره آزمون"
              />
            </Field>
            <Field label="عنوان کوتاه">
              <Input
                value={shortTitle}
                onChange={(event) => setShortTitle(event.target.value)}
                placeholder="مثلاً آزمون"
              />
            </Field>
            <Field label="دسته‌بندی">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب دسته" />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter(
                      (category) => category.is_active !== false || category.id === categoryId,
                    )
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.title}
                        {category.is_active === false ? " (آرشیو)" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="توضیح کامل">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="توضیح کاملی از این افتخار و کاربرد آن..."
            />
          </Field>

          <Field label="تصویر یا آیکون اصلی افتخار (بارگذاری فایل)">
            <ImagePickerField
              value={artworkUrl}
              onChange={setArtworkUrl}
              folder="definitions"
              label="تصویر اصلی"
            />
          </Field>

          {/* تنظیمات خودکار نجم */}
          {kind === "quest" && (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <h4 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                <Layers className="h-4 w-4" /> اتصال به طرح نجم
              </h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="آیتم طرح نجم *">
                  <Select value={itemKey} onValueChange={setItemKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب آیتم" />
                    </SelectTrigger>
                    <SelectContent>
                      {najmItems.map((item) => (
                        <SelectItem key={item.item_key} value={item.item_key}>
                          {item.label}
                          {item.kind === "special" ? " (ویژه)" : ""} — سقف {toFa(item.max_score)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="روش محاسبه‌ی نمره">
                  <Select value={metric} onValueChange={(v) => setMetric(v as NajmQuestMetric)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NAJM_QUEST_METRICS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedMetricHint && (
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      {selectedMetricHint}
                    </p>
                  )}
                </Field>
                <Field label="شیوه‌ی اعطا">
                  <Select
                    value={decisionMode}
                    onValueChange={(v) => setDecisionMode(v as typeof decisionMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatic">خودکار (اعطای مستقیم)</SelectItem>
                      <SelectItem value="admin_approval">با تأیید مدیر (صف تأیید)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {/* اعتبار و تکرار */}
          <div className="space-y-3 rounded-2xl border p-4">
            <h4 className="text-sm font-bold">اعتبار و تکرار دریافت</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="دائمی یا دوره‌ای بودن">
                <Select
                  value={durationKind}
                  onValueChange={(v) => setDurationKind(v as typeof durationKind)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">دائمی</SelectItem>
                    <SelectItem value="periodic">دوره‌ای (بازه اعتبار)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="حداکثر دفعات دریافت (خالی = نامحدود)">
                <Input
                  inputMode="numeric"
                  value={maxAwards}
                  onChange={(event) => setMaxAwards(event.target.value)}
                  placeholder="مثلاً ۳"
                />
              </Field>
              {durationKind === "periodic" && (
                <>
                  <Field label="تاریخ شروع اعتبار">
                    <Input
                      type="datetime-local"
                      dir="ltr"
                      value={validFrom}
                      onChange={(event) => setValidFrom(event.target.value)}
                    />
                  </Field>
                  <Field label="تاریخ پایان اعتبار">
                    <Input
                      type="datetime-local"
                      dir="ltr"
                      value={validUntil}
                      onChange={(event) => setValidUntil(event.target.value)}
                    />
                  </Field>
                </>
              )}
              {kind === "manual" && (
                <Field label="تکرارپذیری دریافت">
                  <Select
                    value={repeatPolicy}
                    onValueChange={(v) => setRepeatPolicy(v as typeof repeatPolicy)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">یک‌بار برای همیشه</SelectItem>
                      <SelectItem value="per_term">یک‌بار در هر ترم</SelectItem>
                      <SelectItem value="per_year">یک‌بار در هر سال</SelectItem>
                      <SelectItem value="multiple">قابل تکرار</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
          </div>

          {/* کلاس‌های مجاز */}
          <div className="space-y-2 rounded-2xl border p-4">
            <Label className="text-sm font-bold">کلاس‌های مجاز برای دریافت</Label>
            <p className="text-[11px] text-muted-foreground">
              اگر هیچ کلاسی انتخاب نشود، برای همه‌ی دارالقرآن فعال است.
            </p>
            <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto md:grid-cols-3">
              {classes.map((classItem) => {
                const checked = allowedClassIds.includes(classItem.id);
                return (
                  <label
                    key={classItem.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${
                      checked
                        ? "border-emerald-400 bg-emerald-50"
                        : "bg-white hover:bg-secondary/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-emerald-700"
                      checked={checked}
                      onChange={(event) => toggleClass(classItem.id, event.target.checked)}
                    />
                    {classItem.name}
                  </label>
                );
              })}
              {classes.length === 0 && (
                <p className="col-span-full text-xs text-muted-foreground">کلاسی یافت نشد.</p>
              )}
            </div>
          </div>

          {/* سوییچ‌ها */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <ToggleRow label="فعال" checked={isActive} onChange={setIsActive} />
            <ToggleRow
              label="مخفی (شرایط تا دریافت پنهان)"
              checked={isSecret}
              onChange={setIsSecret}
            />
            <ToggleRow
              label="نمایش در پروفایل"
              checked={showInProfile}
              onChange={setShowInProfile}
            />
            <ToggleRow
              label="نمایش در جدول رتبه‌بندی"
              checked={showInLeaderboard}
              onChange={setShowInLeaderboard}
            />
            <ToggleRow
              label="امکان صدور گواهی"
              checked={certificateEnabled}
              onChange={setCertificateEnabled}
            />
          </div>

          {/* متن‌ها (پیام تبریک سطح تعریف حذف شد — پیام تبریک روی هر سطح تعیین می‌شود) */}
          <div className="grid grid-cols-1 gap-3">
            <Field label="متن راهنمای شرایط دریافت">
              <Textarea
                value={conditionsGuide}
                onChange={(event) => setConditionsGuide(event.target.value)}
                placeholder="مثلاً برای دریافت این نشان باید در ۱۰ جلسه‌ی متوالی نمره‌ی تکلیف بالای ۴ بگیری..."
              />
            </Field>
            <Field label="توضیح امتیاز تشویقی اضافه پس از دریافت">
              <Textarea
                value={bonusNote}
                onChange={(event) => setBonusNote(event.target.value)}
                placeholder="مثلاً به همراه این نشان، ۵ امتیاز تشویقی در پرونده‌ی افتخارت ثبت می‌شود."
              />
            </Field>
          </div>

          {/* مدیریت سطوح */}
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-bold">
                  <Medal className="h-4 w-4 text-amber-600" /> سطوح افتخار
                </h4>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {kind === "quest"
                    ? "برای هر سطح: نام، تصویر، نمره مورد نیاز هر جلسه و تعداد جلسات، پیام تبریک و امتیاز هدیه — کسب به ترتیب سطوح فعال انجام می‌شود."
                    : "برای هر سطح: نام، تصویر، شرایط مستقل (متن آزاد)، پیام تبریک و امتیاز هدیه — اعطای هر سطح دستی است."}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={addLevel}
              >
                <Plus className="h-3.5 w-3.5" /> سطح جدید
              </Button>
            </div>

            <div className="space-y-3">
              {levels.map((level, index) => (
                <div
                  key={level.key}
                  className={`space-y-3 rounded-2xl border bg-white p-3 ${
                    level.is_active ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-secondary text-[11px] font-bold">
                      {toFa(index + 1)}
                    </span>
                    <div className="min-w-40 flex-1">
                      <Input
                        value={level.label}
                        onChange={(event) => updateLevel(level.key, { label: event.target.value })}
                        placeholder="نام سطح (مثلاً برنزی، یاقوت و …)"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={index === 0}
                        onClick={() => moveLevel(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={index === levels.length - 1}
                        onClick={() => moveLevel(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                        فعال
                        <Switch
                          checked={level.is_active}
                          onCheckedChange={(value) => updateLevel(level.key, { is_active: value })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                        onClick={() => removeLevel(level)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {kind === "quest" && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2">
                      <div>
                        <p className="text-xs font-bold text-violet-800">
                          قانون‌ساز پیشرفته (بدون برنامه‌نویسی)
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          آیتم امتیازی، نوع محاسبه، عملگر مقایسه، بازه‌ی زمانی، شرط مثبت/منفی و
                          رفتار هنگام نقض — به‌جای «تعداد جلسات و نمره مورد نیاز هر جلسه» عمل
                          می‌کند.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-violet-800">
                        {level.ruleEnabled ? "فعال" : "غیرفعال"}
                        <Switch
                          checked={level.ruleEnabled}
                          onCheckedChange={(value) =>
                            updateLevel(level.key, {
                              ruleEnabled: value,
                              ...(value && level.ruleChildren.length === 0
                                ? { ruleChildren: [makeConditionChild()] }
                                : {}),
                            })
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {kind === "quest" && !level.ruleEnabled && (
                      <>
                        <Field label="تعداد جلسات">
                          <Input
                            inputMode="numeric"
                            value={level.sessions}
                            onChange={(event) =>
                              updateLevel(level.key, { sessions: event.target.value })
                            }
                            placeholder="مثلاً ۱۰"
                          />
                        </Field>
                        <Field label="نمره مورد نیاز برای هر جلسه">
                          <Input
                            inputMode="decimal"
                            value={level.threshold}
                            onChange={(event) =>
                              updateLevel(level.key, { threshold: event.target.value })
                            }
                            placeholder="مثلاً امتیاز ۴ در هر جلسه از همان بخش"
                          />
                        </Field>
                      </>
                    )}
                    <Field label="امتیاز هدیه‌ی سطح">
                      <Input
                        inputMode="numeric"
                        value={level.bonus_points}
                        onChange={(event) =>
                          updateLevel(level.key, { bonus_points: event.target.value })
                        }
                        placeholder="مثلاً ۵"
                      />
                    </Field>
                  </div>

                  {kind === "quest" && level.ruleEnabled && (
                    <LevelRuleBuilder
                      level={level}
                      items={najmRuleItems}
                      onChange={(patch) => updateLevel(level.key, patch)}
                    />
                  )}

                  {kind === "manual" && (
                    <Field label="شرایط این سطح (متن آزاد)">
                      <Textarea
                        value={level.conditions_text}
                        onChange={(event) =>
                          updateLevel(level.key, { conditions_text: event.target.value })
                        }
                        placeholder="شرایط کسب همین سطح را بنویسید..."
                      />
                    </Field>
                  )}

                  <Field label="پیام تبریک این سطح">
                    <Input
                      value={level.congrats_message}
                      onChange={(event) =>
                        updateLevel(level.key, { congrats_message: event.target.value })
                      }
                      placeholder="پیامی که هنگام دریافت همین سطح نمایش داده می‌شود"
                    />
                  </Field>

                  <Field label={`تصویر سطح ${level.label || toFa(index + 1)}`}>
                    <ImagePickerField
                      value={level.image_url}
                      onChange={(url) => updateLevel(level.key, { image_url: url })}
                      folder={`levels/${initial?.id ?? "draft"}`}
                      label="تصویر سطح"
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            {isEditing ? "ذخیره تغییرات" : "ساخت افتخار"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* ----------  دیالوگ مشاهده افتخار (فقط‌خواندنی) ---------- */
/* ------------------------------------------------------------------ */

function AchievementViewDialog({
  definition,
  classes,
  onClose,
}: {
  definition: AchievementDefinition | null;
  classes: { id: number; name: string }[];
  onClose: () => void;
}) {
  if (!definition) return null;
  const isQuest = definition.metadata?.quest_kind === "najm_item";
  const levels = (definition.quest_tiers ?? [])
    .slice()
    .sort((a, b) => (a.level_index ?? 0) - (b.level_index ?? 0));
  const allowedNames =
    (definition.allowed_class_ids ?? []).length === 0
      ? "همه‌ی دارالقرآن"
      : (definition.allowed_class_ids ?? [])
          .map((id) => classes.find((c) => c.id === id)?.name ?? `#${id}`)
          .join("، ");

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            {definition.title}
          </DialogTitle>
          <DialogDescription>
            {isQuest ? "نوع: خودکار بر اساس طرح نجم" : "نوع: دستی (اعطای مدیر)"}
            {definition.short_title ? ` — عنوان کوتاه: ${definition.short_title}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {definition.artwork_url && (
            <img
              src={definition.artwork_url}
              alt={definition.title}
              className="mx-auto h-28 w-28 rounded-2xl border object-cover"
            />
          )}

          <p className="rounded-2xl bg-secondary/50 p-3 text-sm leading-7">
            {definition.description || "بدون توضیح"}
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoPill label="دسته‌بندی" value={definition.category_title ?? "—"} />
            <InfoPill label="وضعیت" value={definition.is_active ? "فعال" : "غیرفعال"} />
            <InfoPill label="مخفی" value={definition.is_secret ? "بله" : "خیر"} />
            <InfoPill
              label="شیوه‌ی اعطا"
              value={
                definition.decision_mode === "automatic"
                  ? "خودکار"
                  : definition.decision_mode === "admin_approval"
                    ? "با تأیید مدیر"
                    : "دستی"
              }
            />
            <InfoPill
              label="اعتبار"
              value={
                definition.duration_kind === "periodic"
                  ? `دوره‌ای ${definition.valid_from ? `از ${formatDate(definition.valid_from)}` : ""} ${
                      definition.valid_until ? `تا ${formatDate(definition.valid_until)}` : ""
                    }`
                  : "دائمی"
              }
            />
            <InfoPill
              label="تکرار دریافت"
              value={`${
                definition.repeat_policy === "once"
                  ? "یک‌بار برای همیشه"
                  : definition.repeat_policy === "per_term"
                    ? "یک‌بار در هر ترم"
                    : definition.repeat_policy === "per_year"
                      ? "یک‌بار در هر سال"
                      : "قابل تکرار"
              }${definition.max_awards ? ` — حداکثر ${toFa(definition.max_awards)} بار` : " — نامحدود"}`}
            />
            <InfoPill label="کلاس‌های مجاز" value={allowedNames} />
            <InfoPill
              label="صدور گواهی"
              value={definition.certificate_enabled ? "دارد" : "ندارد"}
            />
            <InfoPill label="نمایش در پروفایل" value={definition.show_in_profile ? "بله" : "خیر"} />
            <InfoPill
              label="نمایش در رتبه‌بندی"
              value={definition.show_in_leaderboard ? "بله" : "خیر"}
            />
            <InfoPill label="دریافت‌کننده" value={toFa(definition.recipient_count)} />
            <InfoPill label="تعداد اعطا" value={toFa(definition.award_count)} />
          </div>

          {definition.congrats_message && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs leading-6">
              <b>پیام تبریک:</b> {definition.congrats_message}
            </div>
          )}
          {definition.conditions_guide && (
            <div className="rounded-2xl border p-3 text-xs leading-6">
              <b>راهنمای شرایط دریافت:</b> {definition.conditions_guide}
            </div>
          )}
          {definition.bonus_note && (
            <div className="rounded-2xl border p-3 text-xs leading-6">
              <b>توضیح امتیاز تشویقی:</b> {definition.bonus_note}
            </div>
          )}

          {levels.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-bold">سطوح ({toFa(levels.length)})</Label>
              {levels.map((level, index) => (
                <div
                  key={level.tier}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${
                    level.is_active === false ? "opacity-50" : ""
                  }`}
                >
                  {level.image_url ? (
                    <img
                      src={level.image_url}
                      alt={level.label ?? level.tier}
                      className="h-12 w-12 rounded-xl border object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                      <Medal className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {toFa(index + 1)}.{" "}
                      {level.label ??
                        NAJM_QUEST_TIER_LADDER.find((l) => l.key === level.tier)?.label ??
                        level.tier}
                      {level.is_active === false ? " (غیرفعال)" : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                      {isQuest
                        ? `${toFa(level.sessions_count)} جلسه ≥ ${toFa(level.threshold)}`
                        : level.conditions_text || "بدون شرایط متنی"}
                      {(level.bonus_points ?? 0) > 0
                        ? ` — ${toFa(level.bonus_points ?? 0)} امتیاز هدیه`
                        : ""}
                    </p>
                    {level.congrats_message && (
                      <p className="mt-0.5 text-[11px] text-emerald-700">
                        تبریک: {level.congrats_message}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {toFa(definition.tier_award_counts?.[level.tier] ?? 0)} اعطا
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 border-t pt-3 text-[11px] text-muted-foreground">
            <p>ایجاد: {formatDate(definition.created_at ?? null)}</p>
            <p>آخرین ویرایش: {formatDate(definition.updated_at ?? null)}</p>
            <p>سازنده: {definition.created_by_user_id ? "مدیر سیستم" : "—"}</p>
            <p>آخرین ویرایش‌کننده: {definition.updated_by_user_id ? "مدیر سیستم" : "—"}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function ArtworkManagerDialog({
  open,
  definition,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  definition: AchievementDefinition | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [history, setHistory] = useState<AchievementArtworkAsset[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [vectorFile, setVectorFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [manufacturingFile, setManufacturingFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");

  useEffect(() => {
    if (!open || !definition) return;
    setImageFile(null);
    setVectorFile(null);
    setModelFile(null);
    setManufacturingFile(null);
    setImagePreview(definition.artwork_url ?? "");
    setLoadingHistory(true);
    void getAchievementArtworkHistory(definition.id).then((result) => {
      setLoadingHistory(false);
      if (result.data) setHistory(result.data);
      else setHistory([]);
    });
  }, [open, definition]);

  async function uploadAsset(file: File, kind: string): Promise<{ path: string; url: string }> {
    if (!definition) throw new Error("نشان مشخص نیست");
    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${definition.id}/${Date.now()}-${kind}.${extension}`;
    const { error } = await supabase.storage
      .from(ACHIEVEMENT_ARTWORK_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) throw error;
    const url = supabase.storage.from(ACHIEVEMENT_ARTWORK_BUCKET).getPublicUrl(path).data.publicUrl;
    return { path, url };
  }

  async function submit() {
    if (!definition) return;
    if (!imageFile && !definition.artwork_url) {
      toast.error("برای هر نسخه، تصویر PNG یا WebP نشان الزامی است");
      return;
    }
    if (imageFile && !["image/png", "image/webp"].includes(imageFile.type)) {
      toast.error("تصویر نشان باید PNG یا WebP باشد");
      return;
    }
    if (vectorFile && vectorFile.type !== "image/svg+xml") {
      toast.error("فایل وکتور باید SVG باشد");
      return;
    }
    setSaving(true);
    const uploadedPaths: string[] = [];
    try {
      let imageUrl = definition.artwork_url ?? "";
      let vectorUrl = definition.artwork_vector_url ?? null;
      let modelUrl = definition.artwork_model_url ?? null;
      let manufacturingUrl = definition.artwork_manufacturing_url ?? null;

      if (imageFile) {
        const uploaded = await uploadAsset(imageFile, "image");
        imageUrl = uploaded.url;
        uploadedPaths.push(uploaded.path);
      }
      if (vectorFile) {
        const uploaded = await uploadAsset(vectorFile, "vector");
        vectorUrl = uploaded.url;
        uploadedPaths.push(uploaded.path);
      }
      if (modelFile) {
        const uploaded = await uploadAsset(modelFile, "model");
        modelUrl = uploaded.url;
        uploadedPaths.push(uploaded.path);
      }
      if (manufacturingFile) {
        const uploaded = await uploadAsset(manufacturingFile, "manufacturing");
        manufacturingUrl = uploaded.url;
        uploadedPaths.push(uploaded.path);
      }

      const result = await registerAchievementArtwork({
        achievementId: definition.id,
        imageUrl,
        vectorUrl,
        modelUrl,
        manufacturingUrl,
        metadata: {
          palette: ["#064E3B", "#F8E7C9", "antique-gold"],
          view: "front",
          modular_trophy: true,
        },
      });
      if (result.error) throw new Error(result.error);
      toast.success("نسخه جدید طرح سه‌بعدی ثبت شد");
      await onSaved();
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from(ACHIEVEMENT_ARTWORK_BUCKET).remove(uploadedPaths);
      }
      toast.error(error instanceof Error ? error.message : "خطا در ذخیره طرح سه‌بعدی");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cuboid className="h-5 w-5 text-amber-700" />
            مدیریت طرح سه‌بعدی — {definition?.title}
          </DialogTitle>
          <DialogDescription>
            تصویر وب، فایل وکتور، مدل نمایشی و فایل ساخت فیزیکی به‌صورت نسخه‌دار ذخیره می‌شوند.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-[#064E3B] to-emerald-800 p-4">
            <div className="flex aspect-square items-center justify-center rounded-2xl bg-[#F8E7C9]/10">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="پیش‌نمایش نشان"
                  className="h-full w-full object-contain"
                />
              ) : definition ? (
                <AchievementVisual definition={definition} className="h-40 w-40" />
              ) : null}
            </div>
            <p className="mt-3 text-center font-display text-lg font-black text-[#F8E7C9]">
              {definition?.title}
            </p>
            <p className="mt-1 text-center text-[10px] text-[#F8E7C9]/65">
              نسخه فعلی: {toFa(definition?.artwork_version ?? 0)}
            </p>
          </div>

          <div className="space-y-3">
            <ArtworkFileField
              label="تصویر اصلی نشان"
              hint="PNG یا WebP شفاف — برای نمایش داخل سامانه"
              accept="image/png,image/webp"
              file={imageFile}
              icon={<FileImage className="h-5 w-5" />}
              onChange={(file) => {
                setImageFile(file);
                setImagePreview(URL.createObjectURL(file));
              }}
            />
            <ArtworkFileField
              label="نسخه وکتور"
              hint="SVG — مناسب چاپ، حکاکی و تبدیل متن به Outline"
              accept="image/svg+xml,.svg"
              file={vectorFile}
              icon={<Sparkles className="h-5 w-5" />}
              onChange={setVectorFile}
            />
            <ArtworkFileField
              label="مدل سه‌بعدی نمایشی"
              hint="GLB یا GLTF — برای پیش‌نمایش سه‌بعدی آینده"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              file={modelFile}
              icon={<Cuboid className="h-5 w-5" />}
              onChange={setModelFile}
            />
            <ArtworkFileField
              label="فایل ساخت فیزیکی"
              hint="STL / STEP / OBJ — پس از تأیید و آماده‌سازی CAD"
              accept=".stl,.step,.stp,.obj,application/octet-stream"
              file={manufacturingFile}
              icon={<Archive className="h-5 w-5" />}
              onChange={setManufacturingFile}
            />
          </div>
        </div>

        <Card className="rounded-2xl p-4">
          <h3 className="font-display font-black">تاریخچه نسخه‌ها</h3>
          {loadingHistory ? (
            <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin" />
          ) : history.length === 0 ? (
            <p className="py-5 text-center text-xs text-muted-foreground">
              هنوز نسخه‌ای ثبت نشده است.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {history.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between rounded-xl bg-secondary/40 p-3 text-xs"
                >
                  <div>
                    <span className="font-bold">نسخه {toFa(asset.version)}</span>
                    <span className="mr-2 text-muted-foreground">
                      {formatDate(asset.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {asset.vector_url && <Badge variant="outline">SVG</Badge>}
                    {asset.model_url && <Badge variant="outline">GLB</Badge>}
                    {asset.manufacturing_url && <Badge variant="outline">ساخت</Badge>}
                    <Badge className={asset.is_current ? "bg-emerald-700" : "bg-slate-500"}>
                      {asset.is_current ? "جاری" : "بایگانی"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving}
            className="bg-[#064E3B] text-[#F8E7C9]"
          >
            {saving ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="ml-2 h-4 w-4" />
            )}
            ثبت نسخه جدید
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArtworkFileField({
  label,
  hint,
  accept,
  file,
  icon,
  onChange,
}: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  icon: ReactNode;
  onChange: (file: File) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-100 bg-white p-3 transition hover:border-amber-300 hover:bg-amber-50/40">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F8E7C9] text-[#064E3B]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {file ? file.name : hint}
        </span>
      </span>
      <Upload className="h-4 w-4 text-muted-foreground" />
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) onChange(next);
        }}
      />
    </label>
  );
}

function DirectGrantDialog({
  open,
  onOpenChange,
  students,
  definitions,
  lockedAchievement,
  activeTerm,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: StudentOption[];
  definitions: AchievementDefinition[];
  lockedAchievement?: AchievementDefinition | null;
  activeTerm: ActiveTerm | null;
  onSaved: () => Promise<void>;
}) {
  const [studentId, setStudentId] = useState("");
  const [achievementId, setAchievementId] = useState("");
  const [source, setSource] =
    useState<Exclude<AchievementSource, "teacher_nomination">>("admin_direct");
  const [reason, setReason] = useState("");
  const [selectedTier, setSelectedTier] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setStudentId("");
      setAchievementId(lockedAchievement?.id ?? "");
      setSource("admin_direct");
      setReason("");
      setSelectedTier("");
    }
  }, [open, lockedAchievement]);

  const selectedDefinition =
    lockedAchievement ?? definitions.find((item) => item.id === achievementId) ?? null;
  const activeLevels = (selectedDefinition?.quest_tiers ?? [])
    .filter((level) => level.is_active !== false)
    .sort((a, b) => (a.level_index ?? 0) - (b.level_index ?? 0));
  async function submit() {
    if (!studentId || !achievementId || reason.trim().length < 3)
      return toast.error("قرآن‌آموز، نشان و دلیل اعطا الزامی است");
    if (activeLevels.length > 0 && !selectedTier)
      return toast.error("برای این افتخار سطح‌دار، انتخاب سطح الزامی است");
    setSaving(true);
    const result = await adminGrantStudentAchievement({
      achievementId,
      studentId,
      reason,
      achievementSource: source,
      term: activeTerm?.term,
      academicYear: activeTerm?.academic_year,
      tier: activeLevels.length > 0 ? selectedTier : null,
    });
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success("نشان مستقیماً توسط مدیر اعطا شد");
    await onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {lockedAchievement ? `اعطای نشان «${lockedAchievement.title}»` : "اعطای مستقیم نشان"}
          </DialogTitle>
          <DialogDescription>
            {lockedAchievement
              ? "این نشان دستی به قرآن‌آموز انتخاب‌شده اعطا می‌شود و در تاریخچه ثبت می‌ماند."
              : "روش اعطا و منبع افتخار به‌صورت مستقل در تاریخچه ثبت می‌شوند."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="قرآن‌آموز">
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب قرآن‌آموز" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={String(student.id)}>
                    {student.name} — {student.class_name ?? "بدون کلاس"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {lockedAchievement ? (
            <Field label="نشان">
              <div className="rounded-xl border bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
                {lockedAchievement.title}
              </div>
            </Field>
          ) : (
            <Field label="نشان">
              <Select
                value={achievementId}
                onValueChange={(value) => {
                  setAchievementId(value);
                  setSelectedTier("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب نشان" />
                </SelectTrigger>
                <SelectContent>
                  {definitions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {activeLevels.length > 0 && (
            <Field label="سطح افتخار *">
              <Select value={selectedTier} onValueChange={setSelectedTier}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب سطح" />
                </SelectTrigger>
                <SelectContent>
                  {activeLevels.map((level) => (
                    <SelectItem key={level.tier} value={level.tier}>
                      {level.label ??
                        NAJM_QUEST_TIER_LADDER.find((l) => l.key === level.tier)?.label ??
                        level.tier}
                      {(level.bonus_points ?? 0) > 0
                        ? ` (+${toFa(level.bonus_points ?? 0)} امتیاز هدیه)`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDefinition &&
                (() => {
                  const chosen = activeLevels.find((l) => l.tier === selectedTier);
                  return chosen?.conditions_text ? (
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      شرایط سطح: {chosen.conditions_text}
                    </p>
                  ) : null;
                })()}
            </Field>
          )}
          <Field label="منبع افتخار">
            <Select value={source} onValueChange={(value) => setSource(value as typeof source)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    "admin_direct",
                    "najm",
                    "special_activity",
                    "competition",
                    "occasion",
                    "hybrid",
                    "other",
                  ] as const
                ).map((value) => (
                  <SelectItem key={value} value={value}>
                    {SOURCE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="دلیل اعطا">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="علت یا توضیح این افتخار..."
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}اعطای نشان
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityTypeDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [unitLabel, setUnitLabel] = useState("بار");
  const [sourceKind, setSourceKind] =
    useState<SpecialActivityType["source_kind"]>("special_activity");
  const [allowNumeric, setAllowNumeric] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(true);
  const [teacherCanRecord, setTeacherCanRecord] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setUnitLabel("بار");
      setSourceKind("special_activity");
      setAllowNumeric(false);
      setRequiresVerification(true);
      setTeacherCanRecord(true);
    }
  }, [open]);
  async function submit() {
    if (!title.trim()) return toast.error("عنوان فعالیت الزامی است");
    setSaving(true);
    const result = await saveSpecialActivityType({
      slug: `activity_${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      unit_label: unitLabel.trim() || "بار",
      source_kind: sourceKind,
      allow_numeric_value: allowNumeric,
      requires_admin_verification: requiresVerification,
      teacher_can_record: teacherCanRecord,
      is_active: true,
    });
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success("نوع فعالیت ویژه ساخته شد");
    await onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>تعریف نوع فعالیت ویژه</DialogTitle>
          <DialogDescription>
            یک واقعیت ساده و قابل تأیید؛ نه یک ماژول یا سیستم امتیازدهی جدید.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="عنوان">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="مثلاً همکاری در محفل قرآن"
            />
          </Field>
          <Field label="توضیح">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="گروه منبع">
              <Select
                value={sourceKind}
                onValueChange={(value) => setSourceKind(value as typeof sourceKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="special_activity">فعالیت ویژه</SelectItem>
                  <SelectItem value="competition">مسابقه</SelectItem>
                  <SelectItem value="occasion">مناسبت</SelectItem>
                  <SelectItem value="other">سایر</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="واحد شمارش">
              <Input value={unitLabel} onChange={(event) => setUnitLabel(event.target.value)} />
            </Field>
          </div>
          <ToggleRow label="دارای مقدار عددی" checked={allowNumeric} onChange={setAllowNumeric} />
          <ToggleRow
            label="نیازمند تأیید مدیر"
            checked={requiresVerification}
            onChange={setRequiresVerification}
          />
          <ToggleRow
            label="استاد اجازه ثبت دارد"
            checked={teacherCanRecord}
            onChange={setTeacherCanRecord}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ساخت فعالیت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordActivityDialog({
  open,
  onOpenChange,
  students,
  activityTypes,
  activeTerm,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: StudentOption[];
  activityTypes: SpecialActivityType[];
  activeTerm: ActiveTerm | null;
  onSaved: () => Promise<void>;
}) {
  const [studentId, setStudentId] = useState("");
  const [activityTypeId, setActivityTypeId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [numericValue, setNumericValue] = useState("1");
  const [resultKey, setResultKey] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedType = activityTypes.find((item) => item.id === activityTypeId);
  useEffect(() => {
    if (open) {
      setStudentId("");
      setActivityTypeId("");
      setOccurredAt(new Date().toISOString().slice(0, 16));
      setNumericValue("1");
      setResultKey("");
      setNotes("");
    }
  }, [open]);
  async function submit() {
    if (!studentId || !activityTypeId) return toast.error("قرآن‌آموز و نوع فعالیت الزامی است");
    setSaving(true);
    const result = await recordStudentSpecialActivity({
      activityTypeId,
      studentId,
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      numericValue: Number(numericValue || 1),
      resultKey,
      notes,
      term: activeTerm?.term,
      academicYear: activeTerm?.academic_year,
    });
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success("فعالیت ویژه توسط مدیر ثبت و تأیید شد");
    await onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>ثبت فعالیت ویژه</DialogTitle>
          <DialogDescription>
            فعالیتی که مدیر ثبت می‌کند، به‌صورت تأییدشده ذخیره می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="قرآن‌آموز">
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب قرآن‌آموز" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={String(student.id)}>
                    {student.name} — {student.class_name ?? "بدون کلاس"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="نوع فعالیت">
            <Select value={activityTypeId} onValueChange={setActivityTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب فعالیت" />
              </SelectTrigger>
              <SelectContent>
                {activityTypes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="تاریخ و ساعت">
            <Input
              type="datetime-local"
              dir="ltr"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </Field>
          {selectedType?.allow_numeric_value && (
            <Field label={`مقدار (${selectedType.unit_label})`}>
              <Input
                type="number"
                min="0"
                value={numericValue}
                onChange={(event) => setNumericValue(event.target.value)}
              />
            </Field>
          )}
          <Field label="نتیجه اختیاری">
            <Input
              value={resultKey}
              onChange={(event) => setResultKey(event.target.value)}
              placeholder="مثلاً رتبه اول"
            />
          </Field>
          <Field label="توضیحات">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ثبت و تأیید فعالیت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ============================================================
//  دیالوگ ساخت/ویرایش افتخار پلکانی مبتنی بر آیتم طرح نجم
// ============================================================
