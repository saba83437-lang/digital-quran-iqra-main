import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUpDown,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  Droplets,
  Eye,
  Filter,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  Leaf,
  Loader2,
  Plus,
  RefreshCw,
  School,
  Search,
  Sprout,
  Target,
  Trees,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PersianDateTimePicker } from "@/features/hasanat/components/persian-date-time-picker";
import { formatPersianDate } from "@/features/hasanat/utils/persian-datetime";
import {
  hasanatRpc,
  loadHasanatGivingHub,
  signHasanatMedia,
  uploadHasanatMedia,
} from "@/features/hasanat/api/garden-stage-a";
import type {
  CharityCategory,
  CharityProject,
  GivingHistoryRow,
  GivingHub,
  HasanatRole,
} from "@/features/hasanat/types/garden-stage-a";

const digits = "۰۱۲۳۴۵۶۷۸۹";
const toFa = (value: unknown) =>
  String(value ?? "").replace(/[0-9]/g, (digit) => digits[Number(digit)]);
const amountText = (value: unknown) => toFa(Number(value ?? 0).toFixed(2));

const iconByName = {
  "book-open": BookOpen,
  baby: Users,
  mosque: Sprout,
  droplets: Droplets,
  leaf: Leaf,
  "heart-handshake": HeartHandshake,
  school: School,
  heart: HandHeart,
};

function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : "انجام عملیات با خطا روبه‌رو شد.";
}

export function GardenGivingPanel({
  role,
  term,
  year,
  activePeriod = true,
  onWalletChanged,
}: {
  role: HasanatRole;
  term?: string;
  year?: string;
  activePeriod?: boolean;
  onWalletChanged?: () => Promise<void> | void;
}) {
  const [hub, setHub] = useState<GivingHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [media, setMedia] = useState<Record<string, string>>({});
  const [donationAmounts, setDonationAmounts] = useState<
    Record<string, string>
  >({});
  const [selectedProjectForDetails, setSelectedProjectForDetails] =
    useState<CharityProject | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadHasanatGivingHub(term, year);
      setHub(result);
      const signed = await signHasanatMedia(
        result.projects.flatMap((project) => [
          project.image_path,
          project.outcome_image_path,
        ]),
      );
      setMedia(signed);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setLoading(false);
    }
  }, [term, year]);

  useEffect(() => {
    void load();
  }, [load]);

  async function execute(
    key: string,
    action: () => Promise<unknown>,
    walletChanged = false,
  ) {
    setBusy(key);
    try {
      await action();
      toast.success("عملیات با موفقیت ثبت شد.");
      await load();
      if (walletChanged && onWalletChanged) await onWalletChanged();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy("");
    }
  }

  if (loading && !hub) {
    return (
      <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        در حال آماده‌سازی صندوق و پروژه‌های خیر...
      </div>
    );
  }
  if (!hub) return null;

  return (
    <div className="space-y-5">
      <ImpactTree
        impact={hub.impact}
        loading={loading}
        onRefresh={() => void load()}
      />
      <CategoryStrip
        categories={hub.categories.filter((item) => item.status === "active")}
      />
      {role === "student" && (
        <StudentWaqfPanel
          hub={hub}
          activePeriod={activePeriod}
          busy={busy}
          execute={execute}
        />
      )}
      <ProjectGrid
        projects={hub.projects}
        donations={hub.my_donations}
        role={role}
        activePeriod={activePeriod}
        media={media}
        amounts={donationAmounts}
        onAmountChange={(id, value) =>
          setDonationAmounts((current) => ({ ...current, [id]: value }))
        }
        onSelectProject={(project) => setSelectedProjectForDetails(project)}
        busy={busy}
        execute={execute}
      />

      {/* Project Donations Detail Modal */}
      {selectedProjectForDetails && (
        <ProjectDonationsModal
          project={selectedProjectForDetails}
          donations={hub.my_donations.filter(
            (d) => d.campaign_id === selectedProjectForDetails.id,
          )}
          classes={hub.classes}
          role={role}
          media={media}
          onClose={() => setSelectedProjectForDetails(null)}
        />
      )}

      {(role === "student" ||
        role === "parent" ||
        role === "teacher" ||
        role === "admin") && (
        <GivingHistory
          contributions={hub.my_contributions}
          donations={hub.my_donations}
          projects={hub.projects}
          classes={hub.classes}
          showStudent={role !== "student"}
        />
      )}
      {role === "admin" && (
        <AdminGivingManager hub={hub} busy={busy} execute={execute} />
      )}
    </div>
  );
}

function ImpactTree({
  impact,
  loading,
  onRefresh,
}: {
  impact?: GivingHub["impact"];
  loading: boolean;
  onRefresh: () => void;
}) {
  const imp = impact || {
    today_amount: 0,
    period_id: null,
    period_title: null,
    period_amount: 0,
    target_amount: null,
    progress_percent: 0,
    funded_projects: 0,
    fulfilled_projects: 0,
  };
  const progress = Number(imp.progress_percent ?? 0);
  const stageKey: "seed" | "sprout" | "tree" | "garden" =
    progress >= 100
      ? "garden"
      : progress >= 75
        ? "tree"
        : progress >= 25
          ? "sprout"
          : "seed";

  const stageInfo = {
    seed: {
      name: "بذر نورانی",
      desc: "هر کار خیر، دانه‌ای است که در دل خاک پاک کاشته می‌شود.",
      verse:
        "مَثَلُ الَّذِينَ يُنْفِقُونَ أَمْوَالَهُمْ فِي سَبِيلِ اللَّهِ كَمَثَلِ حَبَّةٍ",
      nextMilestone: "۲۵٪ (مرحله جوانه)",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-400/30",
    },
    sprout: {
      name: "جوانه مهربانی",
      desc: "با همدلی و نیکی قرآن‌آموزان، جوانه احسان سر از خاک برآورده است.",
      verse: "أَنْبَتَتْ سَبْعَ سَنَابِلَ فِي كُلِّ سُنْبُلَةٍ مِائَةُ حَبَّةٍ",
      nextMilestone: "۷۵٪ (مرحله درخت برکت)",
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
    },
    tree: {
      name: "درخت برکت",
      desc: "شاخسار نیکوکاری گسترده شده و به اوج ثمردهی نزدیک می‌شود.",
      verse: "أَصْلُهَا ثَابِتٌ وَفَرْعُهَا فِي السَّمَاءِ",
      nextMilestone: "۱۰۰٪ (مرحله شجره طیبه)",
      badgeColor: "bg-lime-500/20 text-lime-300 border-lime-400/30",
    },
    garden: {
      name: "شجره طیبه و باغ حسنات",
      desc: "درخت انفاق دارالقرآن به بار نشست و میوه‌های زرین احسان شکوفا شد.",
      verse: "تُؤْتِي أُكُلَهَا كُلَّ حِينٍ بِإِذْنِ رَبِّهَا",
      nextMilestone: "تکمیل و ثمردهی کامل",
      badgeColor: "bg-yellow-400/20 text-yellow-200 border-yellow-300/40",
    },
  }[stageKey];

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-950 via-teal-950 to-emerald-900 p-6 text-white shadow-2xl">
      {/* Background celestial glow particles */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative z-10 grid gap-6 lg:grid-cols-12 lg:items-center">
        {/* 3D Visual Tree Display */}
        <div className="flex flex-col items-center justify-center lg:col-span-5">
          <div className="relative flex h-56 w-56 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_20px_40px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all duration-700 hover:scale-[1.03]">
            {/* Ambient Halo */}
            <div className="absolute inset-4 rounded-2xl bg-gradient-to-t from-emerald-500/20 to-amber-300/20 blur-xl" />

            {/* Stage SVGs */}
            {stageKey === "seed" && (
              <svg
                viewBox="0 0 200 200"
                className="relative z-10 h-full w-full drop-shadow-[0_10px_25px_rgba(234,179,8,0.4)]"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <radialGradient id="seedGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#eab308" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#ca8a04" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient
                    id="seedGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#fef9c3" />
                    <stop offset="40%" stopColor="#eab308" />
                    <stop offset="100%" stopColor="#854d0e" />
                  </linearGradient>
                  <linearGradient
                    id="soilGrad"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#166534" />
                    <stop offset="100%" stopColor="#052e16" />
                  </linearGradient>
                </defs>
                <circle cx="100" cy="110" r="70" fill="url(#seedGlow)" />
                <ellipse
                  cx="100"
                  cy="155"
                  rx="65"
                  ry="18"
                  fill="url(#soilGrad)"
                />
                <ellipse
                  cx="100"
                  cy="153"
                  rx="50"
                  ry="10"
                  fill="#14532d"
                  opacity="0.6"
                />
                <path
                  d="M100 80 C118 95, 122 125, 100 142 C78 125, 82 95, 100 80 Z"
                  fill="url(#seedGrad)"
                />
                <path
                  d="M100 86 C110 98, 112 120, 100 134"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.8"
                />
                <circle cx="100" cy="105" r="4" fill="#ffffff" opacity="0.9" />
                <circle cx="88" cy="120" r="2.5" fill="#fef08a" opacity="0.8" />
                <circle cx="112" cy="118" r="3" fill="#fef08a" opacity="0.8" />
                <circle cx="95" cy="65" r="2" fill="#fde047" opacity="0.9" />
                <circle cx="120" cy="80" r="2.5" fill="#fde047" opacity="0.9" />
              </svg>
            )}

            {stageKey === "sprout" && (
              <svg
                viewBox="0 0 200 200"
                className="relative z-10 h-full w-full drop-shadow-[0_10px_30px_rgba(34,197,94,0.45)]"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <radialGradient id="sproutGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#86efac" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#22c55e" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#15803d" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient
                    id="stemGrad"
                    x1="0%"
                    y1="100%"
                    x2="0%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#15803d" />
                    <stop offset="50%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#86efac" />
                  </linearGradient>
                  <linearGradient
                    id="leafLeft"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#dcfce7" />
                    <stop offset="40%" stopColor="#4ade80" />
                    <stop offset="100%" stopColor="#166534" />
                  </linearGradient>
                  <linearGradient
                    id="leafRight"
                    x1="100%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#bbf7d0" />
                    <stop offset="50%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#14532d" />
                  </linearGradient>
                </defs>
                <circle cx="100" cy="100" r="75" fill="url(#sproutGlow)" />
                <ellipse cx="100" cy="160" rx="60" ry="16" fill="#064e3b" />
                <path
                  d="M100 155 Q98 120 100 90"
                  stroke="url(#stemGrad)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M99 105 C75 90, 60 105, 68 122 C82 128, 96 115, 99 105 Z"
                  fill="url(#leafLeft)"
                />
                <path
                  d="M101 95 C125 78, 142 90, 136 108 C122 115, 106 103, 101 95 Z"
                  fill="url(#leafRight)"
                />
                <circle cx="100" cy="85" r="4" fill="#fef08a" />
                <circle cx="68" cy="102" r="2.5" fill="#ffffff" opacity="0.9" />
                <circle cx="132" cy="90" r="3" fill="#ffffff" opacity="0.9" />
                <circle cx="85" cy="70" r="2" fill="#86efac" />
                <circle cx="120" cy="65" r="2.5" fill="#fde047" />
              </svg>
            )}

            {stageKey === "tree" && (
              <svg
                viewBox="0 0 200 200"
                className="relative z-10 h-full w-full drop-shadow-[0_15px_35px_rgba(16,185,129,0.5)]"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <radialGradient id="treeGlow" cx="50%" cy="45%" r="55%">
                    <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.85" />
                    <stop offset="50%" stopColor="#10b981" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#064e3b" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient
                    id="trunkGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#451a03" />
                    <stop offset="50%" stopColor="#78350f" />
                    <stop offset="100%" stopColor="#92400e" />
                  </linearGradient>
                  <radialGradient id="crownGrad" cx="45%" cy="35%" r="60%">
                    <stop offset="0%" stopColor="#d1fae5" />
                    <stop offset="35%" stopColor="#34d399" />
                    <stop offset="70%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#064e3b" />
                  </radialGradient>
                </defs>
                <circle cx="100" cy="90" r="80" fill="url(#treeGlow)" />
                <ellipse cx="100" cy="165" rx="65" ry="16" fill="#022c22" />
                <path
                  d="M92 165 C94 135, 88 120, 96 100 L104 100 C112 120, 106 135, 108 165 Z"
                  fill="url(#trunkGrad)"
                />
                <circle cx="100" cy="75" r="42" fill="url(#crownGrad)" />
                <circle
                  cx="75"
                  cy="85"
                  r="28"
                  fill="url(#crownGrad)"
                  opacity="0.95"
                />
                <circle
                  cx="125"
                  cy="85"
                  r="28"
                  fill="url(#crownGrad)"
                  opacity="0.95"
                />
                <circle
                  cx="100"
                  cy="55"
                  r="26"
                  fill="url(#crownGrad)"
                  opacity="0.9"
                />
                <circle cx="85" cy="65" r="3" fill="#fef08a" />
                <circle cx="115" cy="68" r="3.5" fill="#fef08a" />
                <circle cx="95" cy="88" r="3" fill="#ffffff" opacity="0.9" />
                <circle cx="125" cy="92" r="2.5" fill="#fef08a" />
                <circle cx="72" cy="88" r="2.5" fill="#ffffff" opacity="0.8" />
              </svg>
            )}

            {stageKey === "garden" && (
              <svg
                viewBox="0 0 200 200"
                className="relative z-10 h-full w-full drop-shadow-[0_15px_45px_rgba(234,179,8,0.6)]"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <radialGradient id="gardenGlow" cx="50%" cy="45%" r="60%">
                    <stop offset="0%" stopColor="#fef08a" stopOpacity="0.95" />
                    <stop offset="35%" stopColor="#34d399" stopOpacity="0.6" />
                    <stop offset="70%" stopColor="#059669" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#064e3b" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient
                    id="gardenTrunk"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#78350f" />
                    <stop offset="50%" stopColor="#b45309" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                  <radialGradient id="goldenCrown" cx="45%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#fef9c3" />
                    <stop offset="25%" stopColor="#6ee7b7" />
                    <stop offset="60%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#047857" />
                  </radialGradient>
                </defs>
                <circle cx="100" cy="85" r="90" fill="url(#gardenGlow)" />
                <ellipse cx="100" cy="168" rx="72" ry="18" fill="#022c22" />
                <path
                  d="M90 168 C92 130, 85 110, 95 90 L105 90 C115 110, 108 130, 110 168 Z"
                  fill="url(#gardenTrunk)"
                />
                <circle cx="100" cy="70" r="48" fill="url(#goldenCrown)" />
                <circle
                  cx="68"
                  cy="82"
                  r="32"
                  fill="url(#goldenCrown)"
                  opacity="0.95"
                />
                <circle
                  cx="132"
                  cy="82"
                  r="32"
                  fill="url(#goldenCrown)"
                  opacity="0.95"
                />
                <circle
                  cx="100"
                  cy="45"
                  r="30"
                  fill="url(#goldenCrown)"
                  opacity="0.9"
                />
                <circle
                  cx="85"
                  cy="62"
                  r="5"
                  fill="#fde047"
                  stroke="#ca8a04"
                  strokeWidth="1"
                />
                <circle
                  cx="115"
                  cy="60"
                  r="5.5"
                  fill="#fde047"
                  stroke="#ca8a04"
                  strokeWidth="1"
                />
                <circle
                  cx="100"
                  cy="80"
                  r="6"
                  fill="#fef08a"
                  stroke="#eab308"
                  strokeWidth="1"
                />
                <circle
                  cx="68"
                  cy="78"
                  r="4.5"
                  fill="#fde047"
                  stroke="#ca8a04"
                  strokeWidth="1"
                />
                <circle
                  cx="132"
                  cy="76"
                  r="5"
                  fill="#fde047"
                  stroke="#ca8a04"
                  strokeWidth="1"
                />
                <circle cx="98" cy="48" r="4" fill="#ffffff" />
                <circle
                  cx="118"
                  cy="88"
                  r="4.5"
                  fill="#fde047"
                  stroke="#ca8a04"
                  strokeWidth="1"
                />
                <circle
                  cx="78"
                  cy="94"
                  r="4"
                  fill="#fef08a"
                  stroke="#ca8a04"
                  strokeWidth="1"
                />
                <circle cx="48" cy="60" r="2.5" fill="#ffffff" opacity="0.9" />
                <circle cx="152" cy="55" r="2.5" fill="#ffffff" opacity="0.9" />
                <circle cx="100" cy="20" r="3" fill="#fef08a" />
              </svg>
            )}
          </div>
          <span className="mt-2 text-[11px] font-bold text-emerald-200/75">
            درخت انفاق دارالقرآن (رشد جمعی)
          </span>
        </div>

        {/* Spiritual Content & Stats */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-black ${stageInfo.badgeColor}`}
                >
                  مرحله{" "}
                  {toFa(
                    stageKey === "seed"
                      ? 1
                      : stageKey === "sprout"
                        ? 2
                        : stageKey === "tree"
                          ? 3
                          : 4,
                  )}
                  : {stageInfo.name}
                </span>
              </div>
              <p className="mt-2 text-xs leading-6 text-white/80">
                {stageInfo.desc}
              </p>
              <p className="mt-1 text-[11px] font-medium text-amber-200/90 italic">
                «{stageInfo.verse}»
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="h-8 rounded-xl text-xs"
            >
              <RefreshCw
                className={`ml-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              به‌روزرسانی
            </Button>
          </div>

          {/* Progress Bar with Milestone Steps */}
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-200">
                رشد این دوره: {toFa(progress.toFixed(0))}٪
              </span>
              <span className="text-white/60">
                گام بعدی: {stageInfo.nextMilestone}
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-emerald-400 to-lime-300 shadow-[0_0_12px_rgba(52,211,153,0.8)] transition-all duration-700"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/50">
              <span
                className={
                  stageKey === "seed" ? "font-bold text-amber-300" : ""
                }
              >
                🌱 ۱. دانه
              </span>
              <span
                className={
                  stageKey === "sprout" ? "font-bold text-emerald-300" : ""
                }
              >
                🌿 ۲. جوانه
              </span>
              <span
                className={stageKey === "tree" ? "font-bold text-lime-300" : ""}
              >
                🌳 ۳. درخت
              </span>
              <span
                className={
                  stageKey === "garden" ? "font-bold text-yellow-300" : ""
                }
              >
                ✨ ۴. باغ حسنات
              </span>
            </div>
          </div>

          {/* 4 Stats Grid */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <ImpactStat
              label="حسنات امروز"
              value={amountText(imp.today_amount)}
            />
            <ImpactStat
              label={imp.period_title || "دوره جاری"}
              value={amountText(imp.period_amount)}
            />
            <ImpactStat
              label="پروژه تأمین‌شده"
              value={toFa(imp.funded_projects)}
            />
            <ImpactStat
              label="پروژه اجراشده"
              value={toFa(imp.fulfilled_projects)}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function ImpactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center backdrop-blur-sm shadow-inner transition hover:bg-white/10">
      <div className="text-[11px] font-medium text-emerald-200/80">{label}</div>
      <div className="mt-1 text-sm font-black text-white">{value}</div>
    </div>
  );
}

function CategoryStrip({ categories }: { categories: CharityCategory[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {categories.map((category) => {
        const Icon =
          iconByName[category.icon as keyof typeof iconByName] || HandHeart;
        return (
          <div
            key={category.id}
            className="flex shrink-0 items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-bold shadow-sm"
          >
            <Icon className="h-4 w-4" style={{ color: category.color }} />
            {category.title}
          </div>
        );
      })}
    </div>
  );
}

function StudentWaqfPanel({
  hub,
  activePeriod,
  busy,
  execute,
}: {
  hub: GivingHub;
  activePeriod: boolean;
  busy: string;
  execute: (
    key: string,
    action: () => Promise<unknown>,
    walletChanged?: boolean,
  ) => Promise<void>;
}) {
  const [onceValue, setOnceValue] = useState("");
  const [onceMode, setOnceMode] = useState<"amount" | "percent">("amount");
  const [onceCategory, setOnceCategory] = useState("");
  const [pledgePercent, setPledgePercent] = useState(
    String(hub.pledge?.percent ?? 10),
  );
  const [pledgeCategory, setPledgeCategory] = useState(
    hub.pledge?.category_id ?? "",
  );

  useEffect(() => {
    setPledgePercent(String(hub.pledge?.percent ?? 10));
    setPledgeCategory(hub.pledge?.category_id ?? "");
  }, [hub.pledge]);

  const categories = hub.categories.filter((item) => item.status === "active");
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="flex items-center gap-2 font-black text-emerald-900">
          <HandHeart className="h-5 w-5" /> وقف یک‌باره
        </h3>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          مبلغ وقف‌شده قطعی و برگشت‌ناپذیر است و از موجودی رزروشده برداشت
          نمی‌شود.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <select
            aria-label="نوع محاسبه وقف یک‌باره"
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            value={onceMode}
            onChange={(event) =>
              setOnceMode(event.target.value as "amount" | "percent")
            }
          >
            <option value="amount">مبلغ مشخص</option>
            <option value="percent">درصد موجودی آزاد</option>
          </select>
          <input
            aria-label="مقدار وقف یک‌باره"
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            type="number"
            min="0.01"
            max={onceMode === "percent" ? 100 : undefined}
            step="0.01"
            value={onceValue}
            onChange={(event) => setOnceValue(event.target.value)}
            placeholder={onceMode === "percent" ? "مثلاً ۲۰٪" : "مبلغ حسنات"}
          />
        </div>
        <div className="mt-3">
          <FundSelect
            categories={categories}
            value={onceCategory}
            onChange={setOnceCategory}
          />
        </div>
        <Button
          className="mt-4 w-full"
          disabled={!onceValue || !activePeriod || busy === "waqf-once"}
          onClick={() =>
            void execute(
              "waqf-once",
              () =>
                hasanatRpc("contribute_hasanat_waqf", {
                  p_amount:
                    onceMode === "amount" ? Number(onceValue) : undefined,
                  p_percent:
                    onceMode === "percent" ? Number(onceValue) : undefined,
                  p_category_id: onceCategory || null,
                }),
              true,
            )
          }
        >
          ثبت وقف یک‌باره
        </Button>
      </Card>

      <Card className="p-5">
        <h3 className="flex items-center gap-2 font-black text-emerald-900">
          <HeartHandshake className="h-5 w-5" /> وقف خودکار درآمدهای آینده
        </h3>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          با فعال‌سازی، درصدی از هر حسنه جدیدی که کسب می‌کنید مستقیم به صندوق
          وقف منتقل می‌شود.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              درصد وقف خودکار (۱ تا ۱۰۰)
            </label>
            <input
              aria-label="درصد وقف خودکار"
              className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm"
              type="number"
              min="1"
              max="100"
              step="1"
              value={pledgePercent}
              onChange={(event) => setPledgePercent(event.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              صندوق مقصد
            </label>
            <div className="mt-1">
              <FundSelect
                categories={categories}
                value={pledgeCategory}
                onChange={setPledgeCategory}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            disabled={!pledgePercent || busy === "waqf-save"}
            onClick={() =>
              void execute("waqf-save", () =>
                hasanatRpc("save_hasanat_waqf_pledge", {
                  p_percent: Number(pledgePercent),
                  p_category_id: pledgeCategory || null,
                }),
              )
            }
          >
            {hub.pledge?.is_active ? "به‌روزرسانی عهد" : "فعال‌سازی وقف خودکار"}
          </Button>
          {hub.pledge?.is_active && (
            <Button
              variant="outline"
              disabled={busy === "waqf-disable"}
              onClick={() =>
                void execute("waqf-disable", () =>
                  hasanatRpc("disable_hasanat_waqf_pledge", {}),
                )
              }
            >
              توقف عهد
            </Button>
          )}
        </div>
      </Card>
    </section>
  );
}

function FundSelect({
  categories,
  value,
  onChange,
}: {
  categories: CharityCategory[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label="انتخاب صندوق نیکی"
      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">صندوق عمومی دارالقرآن</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          صندوق {category.title}
        </option>
      ))}
    </select>
  );
}

function ProjectGrid({
  projects,
  donations,
  role,
  activePeriod,
  media,
  amounts,
  onAmountChange,
  onSelectProject,
  busy,
  execute,
}: {
  projects: CharityProject[];
  donations: GivingHistoryRow[];
  role: HasanatRole;
  activePeriod: boolean;
  media: Record<string, string>;
  amounts: Record<string, string>;
  onAmountChange: (id: string, value: string) => void;
  onSelectProject: (project: CharityProject) => void;
  busy: string;
  execute: (
    key: string,
    action: () => Promise<unknown>,
    walletChanged?: boolean,
  ) => Promise<void>;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-700" />
          <h2 className="text-lg font-black">پروژه‌های خیر</h2>
          <span className="text-xs text-muted-foreground">
            ({toFa(projects.length)} پروژه)
          </span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const collected = Number(project.collected_amount);
          const target = Number(project.target_amount);
          const progress =
            target > 0 ? Math.min(100, (collected / target) * 100) : 0;
          const projectDonations = donations.filter(
            (d) => d.campaign_id === project.id,
          );
          const donorCount = new Set(projectDonations.map((d) => d.student_id))
            .size;
          const canDonate =
            role === "student" &&
            activePeriod &&
            project.execution_status === "collecting" &&
            (!project.deadline ||
              new Date(project.deadline).getTime() > Date.now());

          return (
            <Card
              key={project.id}
              className="flex flex-col justify-between overflow-hidden transition-shadow hover:shadow-md"
            >
              <div>
                {project.image_path && media[project.image_path] ? (
                  <img
                    src={media[project.image_path]}
                    alt={project.title}
                    loading="eager"
                    decoding="async"
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-36 w-full items-center justify-center bg-muted/50">
                    <HandHeart className="h-10 w-10 text-emerald-600/70" />
                  </div>
                )}
                <div className="p-5 pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="rounded-full px-3 py-1 text-[10px] font-bold"
                      style={{
                        color: project.category_color || "#047857",
                        backgroundColor: `${project.category_color || "#047857"}18`,
                      }}
                    >
                      {project.category_title || "کار خیر"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {project.scope_type === "class"
                        ? `ویژه ${project.class_name}`
                        : "کل دارالقرآن"}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-black">{project.title}</h3>
                  <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">
                    {project.description || "بدون توضیح"}
                  </p>
                  {project.deadline && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      مهلت: {formatPersianDate(project.deadline)}
                    </p>
                  )}
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="font-bold text-emerald-700">
                      {amountText(collected)} جمع‌آوری
                    </span>
                    <span className="text-muted-foreground">
                      هدف {amountText(target)}
                    </span>
                  </div>
                  {project.execution_status === "funded" && (
                    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
                      هدف تأمین شده و پروژه در انتظار ثبت اجرای واقعی است.
                    </p>
                  )}
                  {project.execution_status === "fulfilled" && (
                    <OutcomeView project={project} media={media} />
                  )}
                </div>
              </div>

              <div className="p-5 pt-4 space-y-3">
                {/* View Details / Donors Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs font-bold"
                  onClick={() => onSelectProject(project)}
                >
                  <Eye className="ml-1.5 h-3.5 w-3.5 text-emerald-600" />
                  مشاهده گردش انفاق و حامیان
                  {donorCount > 0 && (
                    <span className="mr-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900 font-normal">
                      {toFa(donorCount)} حامی
                    </span>
                  )}
                </Button>

                {canDonate && (
                  <div className="flex gap-2">
                    <input
                      aria-label="مبلغ انفاق به این پروژه"
                      className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
                      type="number"
                      min="0.01"
                      max={Math.max(0, target - collected)}
                      step="0.01"
                      value={amounts[project.id] ?? ""}
                      onChange={(event) =>
                        onAmountChange(project.id, event.target.value)
                      }
                      placeholder="مبلغ حسنات"
                    />
                    <Button
                      disabled={
                        !amounts[project.id] || busy === `donate-${project.id}`
                      }
                      onClick={() =>
                        void execute(
                          `donate-${project.id}`,
                          () =>
                            hasanatRpc("donate_hasanat", {
                              p_campaign: project.id,
                              p_amount: Number(amounts[project.id]),
                            }),
                          true,
                        )
                      }
                    >
                      ببخش
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {!projects.length && (
          <Card className="col-span-full border-dashed p-10 text-center text-sm text-muted-foreground">
            هنوز پروژه‌ای برای نمایش ایجاد نشده است.
          </Card>
        )}
      </div>
    </section>
  );
}

function ProjectDonationsModal({
  project,
  donations = [],
  classes = [],
  role,
  media,
  onClose,
}: {
  project: CharityProject;
  donations: GivingHistoryRow[];
  classes: Array<{ id: number; name: string }>;
  role: HasanatRole;
  media: Record<string, string>;
  onClose: () => void;
}) {
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredDonations = useMemo(() => {
    let list = donations;
    if (selectedClassId !== "all") {
      list = list.filter((d) => String(d.class_id) === selectedClassId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((d) =>
        (d.student_name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [donations, selectedClassId, searchQuery]);

  const filteredTotal = useMemo(
    () => filteredDonations.reduce((acc, d) => acc + Number(d.amount ?? 0), 0),
    [filteredDonations],
  );

  const collected = Number(project.collected_amount);
  const target = Number(project.target_amount);
  const progress = target > 0 ? Math.min(100, (collected / target) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      dir="rtl"
    >
      <Card className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden bg-background shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{
                  color: project.category_color || "#047857",
                  backgroundColor: `${project.category_color || "#047857"}18`,
                }}
              >
                {project.category_title || "کار خیر"}
              </span>
              <span className="text-xs text-muted-foreground">
                {project.scope_type === "class"
                  ? `ویژه ${project.class_name}`
                  : "کل دارالقرآن"}
              </span>
            </div>
            <h2 className="text-lg font-black">{project.title}</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-full p-2"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Progress Overview */}
          <div className="rounded-2xl border bg-muted/30 p-4">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-emerald-700">
                جمع‌آوری‌شده: {amountText(collected)} حسنه
              </span>
              <span className="text-muted-foreground">
                هدف: {amountText(target)} حسنه
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>پیشرفت: {toFa(progress.toFixed(0))}٪</span>
              <span>کل مشارکت‌ها: {toFa(donations.length)} بار</span>
            </div>
          </div>

          {/* Outcome info if fulfilled */}
          {project.execution_status === "fulfilled" && (
            <OutcomeView project={project} media={media} />
          )}

          {/* Filters Bar for Donations */}
          <div className="space-y-2 rounded-2xl border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                <span>فیلتر گردش انفاق</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  تعداد: {toFa(filteredDonations.length)}
                </span>
                <span>•</span>
                <span className="font-bold text-emerald-700">
                  جمع: {amountText(filteredTotal)} حسنه
                </span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {classes.length > 0 && role !== "student" && (
                <select
                  aria-label="فیلتر کلاس"
                  className="h-8 rounded-xl border bg-background px-2.5 text-xs"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                >
                  <option value="all">همه کلاس‌ها</option>
                  {classes.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="relative flex-1">
                <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="جستجوی نام قرآن‌آموز..."
                  className="h-8 w-full rounded-xl border bg-muted/40 pr-8 pl-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute left-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Donations List */}
          <div className="divide-y rounded-2xl border bg-card">
            {filteredDonations.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between p-3.5 text-sm hover:bg-muted/30"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <b className="text-xs">{row.student_name || "قرآن‌آموز"}</b>
                    {row.class_name && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {row.class_name}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatPersianDate(row.created_at)}
                  </p>
                </div>
                <div className="text-left">
                  <b className="text-sm font-black text-emerald-700">
                    +{amountText(row.amount)}
                  </b>
                  <span className="mr-1 text-[10px] text-muted-foreground">
                    حسنه
                  </span>
                </div>
              </div>
            ))}
            {!filteredDonations.length && (
              <div className="p-8 text-center text-xs text-muted-foreground">
                سابقه‌ای مطابق با فیلترهای انتخابی یافت نشد.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t p-3 text-left">
          <Button variant="outline" size="sm" onClick={onClose}>
            بستن
          </Button>
        </div>
      </Card>
    </div>
  );
}

function OutcomeView({
  project,
  media,
}: {
  project: CharityProject;
  media: Record<string, string>;
}) {
  return (
    <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-950">
      <div className="flex items-center gap-2 font-black">
        <CheckCircle2 className="h-5 w-5" />{" "}
        {project.outcome_title || "پروژه اجرا شد"}
      </div>
      {project.outcome_summary && (
        <p className="mt-2 text-xs leading-6">{project.outcome_summary}</p>
      )}
      {project.executed_at && (
        <p className="mt-2 text-[11px] text-emerald-800">
          اجرا: {formatPersianDate(project.executed_at)}
        </p>
      )}
      {!!project.outcome_metrics?.length && (
        <ul className="mt-3 space-y-1 text-xs">
          {project.outcome_metrics.map((metric, index) => (
            <li key={`${metric.label}-${index}`}>
              🌱 {toFa(metric.value)} {metric.label}
            </li>
          ))}
        </ul>
      )}
      {project.outcome_image_path && media[project.outcome_image_path] && (
        <img
          src={media[project.outcome_image_path]}
          alt={project.outcome_title || project.title}
          loading="eager"
          decoding="async"
          className="mt-3 max-h-44 w-full rounded-xl object-cover"
        />
      )}
    </div>
  );
}

type UnifiedHistoryRow = GivingHistoryRow & {
  historyType: "waqf" | "donation";
};

function GivingHistory({
  contributions = [],
  donations = [],
  projects = [],
  classes = [],
  showStudent,
}: {
  contributions: GivingHistoryRow[];
  donations: GivingHistoryRow[];
  projects: CharityProject[];
  classes: Array<{ id: number; name: string }>;
  showStudent: boolean;
}) {
  const [filterType, setFilterType] = useState<"all" | "donation" | "waqf">(
    "all",
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const allRows: UnifiedHistoryRow[] = useMemo(
    () =>
      [
        ...contributions.map((row): UnifiedHistoryRow => ({
          ...row,
          historyType: "waqf",
        })),
        ...donations.map((row): UnifiedHistoryRow => ({
          ...row,
          historyType: "donation",
        })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [contributions, donations],
  );

  const filteredRows = useMemo(() => {
    let list = allRows;

    // Filter by type
    if (filterType !== "all") {
      list = list.filter((r) => r.historyType === filterType);
    }

    // Filter by project
    if (selectedProjectId !== "all") {
      list = list.filter(
        (r) =>
          r.historyType === "donation" && r.campaign_id === selectedProjectId,
      );
    }

    // Filter by class
    if (selectedClassId !== "all") {
      list = list.filter((r) => String(r.class_id) === selectedClassId);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((r) => {
        const name = (r.student_name ?? "").toLowerCase();
        const title = (
          r.historyType === "donation"
            ? r.campaign_title_snapshot || "پروژه خیر"
            : r.category_title || "صندوق وقف"
        ).toLowerCase();
        const category = (r.category_title ?? "").toLowerCase();
        return name.includes(q) || title.includes(q) || category.includes(q);
      });
    }

    return list;
  }, [allRows, filterType, selectedProjectId, selectedClassId, searchQuery]);

  const totalAmount = useMemo(
    () => filteredRows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0),
    [filteredRows],
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <HandHeart className="h-5 w-5 text-emerald-700" />
          <h2 className="text-base font-black">سابقه بخشش</h2>
          <span className="text-xs text-muted-foreground">
            ({toFa(filteredRows.length)} سابقه)
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">مجموع بخشش فیلترشده:</span>
          <b className="font-black text-emerald-700">
            {amountText(totalAmount)} حسنه
          </b>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mt-4 space-y-2.5 rounded-2xl border bg-muted/20 p-3.5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {/* Type Filter */}
          <select
            aria-label="نوع بخشش"
            className="h-8 rounded-xl border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            value={filterType}
            onChange={(e) =>
              setFilterType(e.target.value as "all" | "donation" | "waqf")
            }
          >
            <option value="all">همه انواع بخشش</option>
            <option value="donation">پروژه‌های خیر (انفاق مستقیم)</option>
            <option value="waqf">صندوق‌های وقف (یک‌باره / خودکار)</option>
          </select>

          {/* Project Filter */}
          {projects.length > 0 && (
            <select
              aria-label="انتخاب پروژه خیر"
              className="h-8 rounded-xl border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="all">
                همه پروژه‌های خیر ({toFa(projects.length)})
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}

          {/* Class Filter */}
          {classes.length > 0 && showStudent && (
            <select
              aria-label="انتخاب کلاس"
              className="h-8 rounded-xl border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="all">همه کلاس‌ها ({toFa(classes.length)})</option>
              {classes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="جستجو در عنوان یا نام..."
              className="h-8 w-full rounded-xl border bg-background pr-8 pl-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute left-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* History Rows */}
      <div className="mt-4 divide-y">
        {filteredRows.map((row) => (
          <div
            key={`${row.historyType}-${row.id}`}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm hover:bg-muted/20 px-1 rounded-xl transition-colors"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <b>
                  {row.historyType === "donation"
                    ? row.campaign_title_snapshot || "پروژه خیر"
                    : row.source_kind === "waqf_auto"
                      ? "وقف خودکار"
                      : "وقف یک‌باره"}
                </b>
                {showStudent && row.student_name && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {row.student_name}{" "}
                    {row.class_name ? `(${row.class_name})` : ""}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.category_title || "صندوق عمومی"} •{" "}
                {formatPersianDate(row.created_at)}
              </p>
            </div>
            <div className="text-left">
              <b className="font-black text-emerald-700">
                +{amountText(row.amount)}
              </b>
              <span className="mr-1 text-xs text-muted-foreground">حسنه</span>
            </div>
          </div>
        ))}
        {!filteredRows.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            سابقه‌ای مطابق با فیلترهای انتخابی یافت نشد.
          </p>
        )}
      </div>
    </Card>
  );
}

function AdminGivingManager({
  hub,
  busy,
  execute,
}: {
  hub: GivingHub;
  busy: string;
  execute: (
    key: string,
    action: () => Promise<unknown>,
    walletChanged?: boolean,
  ) => Promise<void>;
}) {
  return (
    <section className="space-y-5 border-t pt-6">
      <div>
        <p className="text-xs font-bold text-emerald-700">مدیریت باغ حسنات</p>
        <h2 className="text-xl font-black">
          دسته‌ها، پروژه‌ها، صندوق‌ها و گزارش آثار
        </h2>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <CategoryManager
          categories={hub.categories}
          busy={busy}
          execute={execute}
        />
        <ProjectManager hub={hub} busy={busy} execute={execute} />
        <FundAllocationManager hub={hub} busy={busy} execute={execute} />
        <OutcomeManager hub={hub} busy={busy} execute={execute} />
        <ImpactPeriodManager busy={busy} execute={execute} />
      </div>
    </section>
  );
}

type ManagerProps = {
  busy: string;
  execute: (
    key: string,
    action: () => Promise<unknown>,
    walletChanged?: boolean,
  ) => Promise<void>;
};

function CategoryManager({
  categories,
  busy,
  execute,
}: ManagerProps & { categories: CharityCategory[] }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    await execute("category-create", () =>
      hasanatRpc("admin_save_hasanat_category", {
        p_data: {
          title,
          slug,
          status: "active",
          icon: "heart",
          color: "#047857",
        },
      }),
    );
    setTitle("");
    setSlug("");
  }
  return (
    <Card className="p-5">
      <h3 className="font-black">دسته‌های خیر</h3>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => void submit(event)}
      >
        <input
          aria-label="عنوان دسته"
          className="h-10 rounded-lg border px-3 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان دسته"
        />
        <input
          aria-label="شناسه انگلیسی دسته"
          className="h-10 rounded-lg border px-3 text-sm"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug انگلیسی"
        />
        <Button disabled={!title || !slug || busy === "category-create"}>
          <Plus className="ml-1 h-4 w-4" /> افزودن
        </Button>
      </form>
      <div className="mt-4 space-y-2">
        {categories.map((category) => (
          <div
            key={category.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
          >
            <div>
              <b>{category.title}</b>
              <p className="text-xs text-muted-foreground">{category.slug}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextTitle = prompt("عنوان جدید:", category.title);
                  if (!nextTitle) return;
                  const nextColor =
                    prompt("کد رنگ:", category.color || "#047857") ||
                    category.color;
                  void execute(`category-${category.id}`, () =>
                    hasanatRpc("admin_save_hasanat_category", {
                      p_data: {
                        ...category,
                        title: nextTitle,
                        color: nextColor,
                      },
                    }),
                  );
                }}
              >
                ویرایش
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void execute(`category-status-${category.id}`, () =>
                    hasanatRpc("admin_save_hasanat_category", {
                      p_data: {
                        ...category,
                        status:
                          category.status === "active" ? "inactive" : "active",
                      },
                    }),
                  )
                }
              >
                {category.status === "active" ? "غیرفعال‌سازی" : "فعال‌سازی"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("دسته حذف یا در صورت داشتن سابقه بایگانی شود؟")) {
                    void execute(`category-del-${category.id}`, () =>
                      hasanatRpc("admin_delete_hasanat_category", {
                        p_id: category.id,
                      }),
                    );
                  }
                }}
              >
                حذف
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProjectManager({
  hub,
  busy,
  execute,
}: ManagerProps & { hub: GivingHub }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<"global" | "class">("global");
  const [classId, setClassId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    let image_path: string | null = null;
    if (file) {
      image_path = await uploadHasanatMedia(file, "campaigns");
    }
    await execute("project-create", () =>
      hasanatRpc("admin_save_hasanat_campaign", {
        p_data: {
          title,
          description,
          target_amount: Number(target),
          category_id: category,
          scope_type: scope,
          class_id: scope === "class" ? Number(classId) : null,
          deadline: deadline || null,
          image_path,
          status: "active",
        },
      }),
    );
    setTitle("");
    setDescription("");
    setTarget("");
    setFile(null);
  }

  return (
    <Card className="p-5">
      <h3 className="font-black">تعریف پروژه جدید</h3>
      <form className="mt-3 space-y-3" onSubmit={(event) => void submit(event)}>
        <input
          aria-label="عنوان پروژه"
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان پروژه"
          required
        />
        <textarea
          aria-label="توضیحات پروژه"
          className="w-full rounded-lg border p-3 text-sm"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="توضیحات پروژه"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            aria-label="مبلغ هدف پروژه"
            className="h-10 rounded-lg border px-3 text-sm"
            type="number"
            min="0.01"
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="مبلغ هدف (حسنه)"
            required
          />
          <select
            aria-label="دسته پروژه"
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            <option value="">انتخاب دسته</option>
            {hub.categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            aria-label="دامنه پروژه"
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value as "global" | "class")}
          >
            <option value="global">کل دارالقرآن</option>
            <option value="class">ویژه کلاس خاص</option>
          </select>
          {scope === "class" ? (
            <select
              aria-label="انتخاب کلاس پروژه"
              className="h-10 rounded-lg border bg-background px-3 text-sm"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
            >
              <option value="">انتخاب کلاس</option>
              {hub.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : (
            <div />
          )}
        </div>
        <div>
          <PersianDateTimePicker
            label="مهلت پروژه (اختیاری)"
            value={deadline}
            onChange={setDeadline}
          />
        </div>
        <input
          aria-label="تصویر شاخص پروژه"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="text-xs"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <Button className="w-full" disabled={busy === "project-create"}>
          ثبت و انتشار پروژه
        </Button>
      </form>

      <div className="mt-5 space-y-2">
        {hub.projects.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
          >
            <div>
              <b>{item.title}</b>
              <p className="text-xs text-muted-foreground">
                هدف {amountText(item.target_amount)} • جمع‌آوری{" "}
                {amountText(item.collected_amount)} • وضعیت:{" "}
                {item.execution_status}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextTitle = prompt("عنوان جدید:", item.title);
                  if (!nextTitle) return;
                  const nextTarget =
                    prompt("هدف جدید:", String(item.target_amount)) ||
                    item.target_amount;
                  void execute(`project-edit-${item.id}`, () =>
                    hasanatRpc("admin_save_hasanat_campaign", {
                      p_data: {
                        ...item,
                        title: nextTitle,
                        target_amount: Number(nextTarget),
                        class_id:
                          item.scope_type === "class" ? item.class_id : null,
                      },
                    }),
                  );
                }}
              >
                ویرایش
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (
                    confirm("پروژه حذف یا در صورت داشتن سابقه بایگانی شود؟")
                  ) {
                    void execute(`project-del-${item.id}`, () =>
                      hasanatRpc("admin_delete_hasanat_campaign", {
                        p_id: item.id,
                      }),
                    );
                  }
                }}
              >
                حذف
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FundAllocationManager({
  hub,
  busy,
  execute,
}: ManagerProps & { hub: GivingHub }) {
  const [poolId, setPoolId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const activeProjects = hub.projects.filter(
    (item) => item.execution_status === "collecting",
  );
  return (
    <Card className="p-5">
      <h3 className="font-black">تخصیص موجودی صندوق به پروژه‌ها</h3>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        مدیر می‌تواند موجودی جمع‌شده در صندوق‌های وقف عمومی را برای تکمیل هدف
        پروژه‌ها تخصیص دهد.
      </p>
      <div className="mt-4 space-y-3">
        <select
          aria-label="صندوق مبدأ"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          value={poolId}
          onChange={(e) => setPoolId(e.target.value)}
        >
          <option value="">انتخاب صندوق مبدأ</option>
          {hub.pools.map((pool) => (
            <option key={pool.id} value={pool.id}>
              {pool.category_title} (موجودی {amountText(pool.balance)} حسنه)
            </option>
          ))}
        </select>
        <select
          aria-label="پروژه مقصد"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">انتخاب پروژه مقصد</option>
          {activeProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title} (کسری{" "}
              {amountText(
                Number(project.target_amount) -
                  Number(project.collected_amount),
              )}{" "}
              حسنه)
            </option>
          ))}
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            aria-label="مبلغ تخصیص حسنات"
            className="h-10 rounded-lg border px-3 text-sm"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="مبلغ تخصیص (حسنه)"
          />
          <input
            aria-label="یادداشت تخصیص"
            className="h-10 rounded-lg border px-3 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="یادداشت تخصیص"
          />
        </div>
        <Button
          className="w-full"
          disabled={
            !poolId || !projectId || !amount || busy === "fund-allocation"
          }
          onClick={() =>
            void execute("fund-allocation", () =>
              hasanatRpc("admin_allocate_fund_to_campaign", {
                p_pool_id: poolId,
                p_campaign_id: projectId,
                p_amount: Number(amount),
                p_note: note || null,
              }),
            )
          }
        >
          تخصیص موجودی صندوق
        </Button>
      </div>
    </Card>
  );
}

function OutcomeManager({
  hub,
  busy,
  execute,
}: ManagerProps & { hub: GivingHub }) {
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [executedAt, setExecutedAt] = useState("");
  const [metricLabel, setMetricLabel] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const fundedProjects = hub.projects.filter(
    (item) => item.execution_status === "funded",
  );
  return (
    <Card className="p-5">
      <h3 className="font-black">ثبت اثر و اجرای واقعی پروژه</h3>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        پس از اجرای واقعی پروژه در دنیای واقعی، گزارش و تصاویر آن را برای نمایش
        به قرآن‌آموزان ثبت کنید.
      </p>
      <div className="mt-4 space-y-3">
        <select
          aria-label="انتخاب پروژه برای ثبت گزارش اجرا"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">انتخاب پروژه تأمین‌شده</option>
          {fundedProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title} ({amountText(project.collected_amount)} حسنه)
            </option>
          ))}
        </select>
        <input
          aria-label="عنوان نتیجه و اثر"
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان گزارش اثر (مثلاً: نهال‌ها کاشته شدند)"
        />
        <textarea
          aria-label="خلاصه گزارش اثر"
          className="w-full rounded-lg border p-3 text-sm"
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="خلاصه نحوه اجرای پروژه و پیام تشکر"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            aria-label="عنوان شاخص اثر"
            className="h-10 rounded-lg border px-3 text-sm"
            value={metricLabel}
            onChange={(e) => setMetricLabel(e.target.value)}
            placeholder="عنوان شاخص (مثلاً: اصله نهال)"
          />
          <input
            aria-label="مقدار شاخص اثر"
            className="h-10 rounded-lg border px-3 text-sm"
            value={metricValue}
            onChange={(e) => setMetricValue(e.target.value)}
            placeholder="مقدار شاخص (مثلاً: ۲۵)"
          />
        </div>
        <div>
          <PersianDateTimePicker
            label="تاریخ اجرای پروژه"
            value={executedAt}
            onChange={setExecutedAt}
          />
        </div>
        <input
          aria-label="تصویر گزارش اجرای پروژه"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="text-xs"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <Button
          className="w-full"
          disabled={!projectId || !title || busy === "outcome-save"}
          onClick={async () => {
            let image_path: string | null = null;
            if (file) {
              image_path = await uploadHasanatMedia(file, "outcomes");
            }
            await execute("outcome-save", () =>
              hasanatRpc("admin_fulfill_hasanat_campaign", {
                p_campaign_id: projectId,
                p_outcome: {
                  title,
                  summary,
                  image_path,
                  executed_at: executedAt || null,
                  metrics: metricLabel
                    ? [{ label: metricLabel, value: metricValue }]
                    : [],
                },
              }),
            );
            setTitle("");
            setSummary("");
            setMetricLabel("");
            setMetricValue("");
            setFile(null);
          }}
        >
          تأیید و انتشار گزارش اجرای پروژه
        </Button>
      </div>
    </Card>
  );
}

function ImpactPeriodManager({
  busy,
  execute,
}: {
  busy: string;
  execute: (
    key: string,
    action: () => Promise<unknown>,
    walletChanged?: boolean,
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [target, setTarget] = useState("");

  return (
    <Card className="p-5">
      <h3 className="font-black">تنظیم دوره درخت انفاق</h3>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        برای رشد تدریجی درخت دارالقرآن، می‌توانید دوره زمانی با هدف مشخص تعریف
        کنید.
      </p>
      <div className="mt-4 space-y-3">
        <input
          aria-label="عنوان دوره درخت اثر"
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان دوره (مثلاً: پویش ماه مبارک)"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <PersianDateTimePicker
              label="شروع دوره"
              value={start}
              onChange={setStart}
              required
            />
          </div>
          <div>
            <PersianDateTimePicker
              label="پایان دوره"
              value={end}
              onChange={setEnd}
              required
            />
          </div>
        </div>
        <input
          aria-label="هدف جمع‌آوری حسنات دوره"
          className="h-10 w-full rounded-lg border px-3 text-sm"
          type="number"
          min="1"
          step="1"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="هدف حسنات این دوره (اختیاری)"
        />
        <Button
          className="w-full"
          disabled={!title || !start || !end || busy === "impact-save"}
          onClick={() =>
            void execute("impact-save", () =>
              hasanatRpc("admin_save_hasanat_impact_period", {
                p_title: title,
                p_starts: start,
                p_ends: end,
                p_target: target ? Number(target) : null,
              }),
            )
          }
        >
          ثبت دوره اثرگذاری
        </Button>
      </div>
    </Card>
  );
}
