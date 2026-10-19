import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Archive,
  Award,
  Crown,
  Download,
  Edit3,
  FileImage,
  Image,
  LayoutTemplate,
  Loader2,
  Medal,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  finalizeAchievementHall,
  getAchievementHall,
  getAchievementHistoryRecords,
  refreshAllAchievementHistoryRecords,
  saveAchievementHallMetric,
  saveAchievementHistoryMetricSettings,
  saveAchievementHallPoster,
  type AchievementHallData,
  type AchievementHistoryRecord,
  type AchievementHallMetric,
  type AchievementHallPosterSetting,
  type AchievementHallRecord,
  type AchievementHallWinner,
  type AchievementHallMetricSource,
} from "@/lib/achievements";
import type { NajmTerm } from "@/lib/najm";
import { supabase } from "@/lib/supabase";
import { resolvePrivateStorageUrl } from "@/features/storage/private-storage-url";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const POSTER_BUCKET = "achievement-hall-posters";
const STUDENT_FILES_BUCKET = "student-files";
const POSTER_FONTS = ["Vazirmatn", "Amiri", "Lalezar", "Noto Naskh Arabic", "Markazi Text"];

type HallPosterType = "record_holders" | "term_winners" | "year_winners";
type HallElementKind = "text" | "photo";
type HallLayoutElement = {
  label: string;
  kind: HallElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  color?: string;
  rotation: number;
  align?: "right" | "center" | "left";
  hidden: boolean;
  zIndex: number;
};
type HallPosterLayout = {
  version: number;
  canvasWidth: number;
  canvasHeight: number;
  elements: Record<string, HallLayoutElement>;
};
type HallPosterItem = {
  id: string;
  kind: HallElementKind;
  text?: string;
  photoUrl?: string | null;
  transparent?: boolean;
};
type TermOption = {
  term: NajmTerm;
  academic_year: string;
  title: string;
  is_active: boolean;
};

function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}
function termLabel(term: NajmTerm): string {
  return { term1: "ترم اول", term2: "ترم دوم", summer: "تابستان" }[term];
}
function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
function formatMetricValue(value: number, format: string, unit: string): string {
  const numeric = format === "decimal" ? value.toFixed(2) : Math.round(value).toString();
  return `${toFa(numeric)}${format === "percent" ? "٪" : unit ? ` ${unit}` : ""}`;
}

function textEl(
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  options: Partial<HallLayoutElement> = {},
): HallLayoutElement {
  return {
    label,
    kind: "text",
    x,
    y,
    width,
    height,
    fontSize,
    fontWeight: 800,
    fontFamily: "Vazirmatn",
    color: "#F8E7C9",
    rotation: 0,
    align: "center",
    hidden: false,
    zIndex: 5,
    ...options,
  };
}
function photoEl(label: string, x: number, y: number, size: number): HallLayoutElement {
  return {
    label,
    kind: "photo",
    x,
    y,
    width: size,
    height: size,
    rotation: 0,
    hidden: false,
    zIndex: 4,
  };
}
function defaultRecordLayout(): HallPosterLayout {
  const elements: Record<string, HallLayoutElement> = {
    "header-title": textEl("عنوان شاخص", 180, 55, 1240, 75, 46, {
      fontFamily: "Amiri",
      fontWeight: 900,
    }),
    "header-subtitle": textEl("نام ترم", 250, 135, 1100, 45, 22, { color: "#dbeafe" }),
  };
  const xs = [90, 390, 690, 990, 1290];
  xs.forEach((x, index) => {
    const prefix = `slot-${index}`;
    elements[`${prefix}-rank`] = textEl(`رتبه ${index + 1}`, x + 55, 220, 190, 45, 25, {
      color: index === 0 ? "#fde68a" : "#F8E7C9",
      fontFamily: "Amiri",
    });
    elements[`${prefix}-photo`] = photoEl(`عکس رتبه ${index + 1}`, x + 55, 285, 190);
    elements[`${prefix}-name`] = textEl(`نام رتبه ${index + 1}`, x, 500, 300, 52, 27, {
      fontFamily: "Amiri",
    });
    elements[`${prefix}-class`] = textEl(`کلاس رتبه ${index + 1}`, x, 555, 300, 36, 17, {
      color: "#dbeafe",
    });
    elements[`${prefix}-value`] = textEl(`رکورد رتبه ${index + 1}`, x, 620, 300, 48, 24, {
      color: "#fde68a",
    });
  });
  return { version: 1, canvasWidth: 1600, canvasHeight: 1100, elements };
}
function defaultWinnersLayout(type: "term" | "year"): HallPosterLayout {
  const elements: Record<string, HallLayoutElement> = {
    "header-title": textEl(
      type === "term" ? "عنوان برگزیدگان ترم" : "عنوان برگزیدگان سال",
      200,
      90,
      1600,
      100,
      68,
      { fontFamily: "Amiri", fontWeight: 900 },
    ),
    "header-subtitle": textEl("بازه", 300, 200, 1400, 55, 30, { color: "#dbeafe" }),
  };
  const columns = [100, 720, 1340];
  for (let index = 0; index < 15; index++) {
    const row = Math.floor(index / 3);
    const column = index % 3;
    const x = columns[column];
    const y = 360 + row * 500;
    const prefix = `slot-${index}`;
    elements[`${prefix}-photo`] = photoEl(`عکس برگزیده ${index + 1}`, x + 190, y, 180);
    elements[`${prefix}-metric`] = textEl(`شاخص ${index + 1}`, x, y + 205, 560, 45, 21, {
      color: "#fde68a",
    });
    elements[`${prefix}-name`] = textEl(`نام برگزیده ${index + 1}`, x, y + 255, 560, 55, 29, {
      fontFamily: "Amiri",
    });
    elements[`${prefix}-value`] = textEl(`رکورد برگزیده ${index + 1}`, x, y + 315, 560, 42, 20, {
      color: "#dbeafe",
    });
  }
  return { version: 1, canvasWidth: 2000, canvasHeight: 3000, elements };
}
const DEFAULT_LAYOUTS: Record<HallPosterType, HallPosterLayout> = {
  record_holders: defaultRecordLayout(),
  term_winners: defaultWinnersLayout("term"),
  year_winners: defaultWinnersLayout("year"),
};
function cloneLayout(layout: HallPosterLayout): HallPosterLayout {
  return JSON.parse(JSON.stringify(layout)) as HallPosterLayout;
}
function resolveLayout(value: Record<string, unknown> | null | undefined, type: HallPosterType) {
  const fallback = DEFAULT_LAYOUTS[type];
  if (!value || Number(value.canvasWidth) !== fallback.canvasWidth) return cloneLayout(fallback);
  const saved = value as unknown as HallPosterLayout;
  const elements: Record<string, HallLayoutElement> = {};
  Object.entries(fallback.elements).forEach(([id, element]) => {
    elements[id] = { ...element, ...(saved.elements?.[id] ?? {}) };
  });
  return { ...fallback, ...saved, elements };
}

function storedPhotoPath(value?: string | null): string {
  if (!value) return "";
  const marker = `/${STUDENT_FILES_BUCKET}/`;
  if (value.includes(marker)) return decodeURIComponent(value.split(marker)[1].split("?")[0]);
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return "";
  return value.replace(/^\/+/, "").split("?")[0];
}
async function resolveStudentPhoto(value?: string | null): Promise<string> {
  if (!value) return "";
  const path = storedPhotoPath(value);
  if (!path) return value;
  const { data, error } = await supabase.storage
    .from(STUDENT_FILES_BUCKET)
    .createSignedUrl(path, 1800);
  return error ? "" : data.signedUrl;
}
function HallPhoto({
  source,
  transparent = false,
}: {
  source?: string | null;
  transparent?: boolean;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    void resolveStudentPhoto(source).then((resolved) => active && setUrl(resolved));
    return () => {
      active = false;
    };
  }, [source]);
  if (!url) return <div className="h-full w-full rounded-full bg-[#064E3B]/35" />;
  return (
    <img
      src={url}
      alt="عکس قرآن‌آموز"
      className={
        transparent
          ? "h-full w-full object-contain object-bottom"
          : "h-full w-full rounded-full object-cover object-center"
      }
    />
  );
}
function buildRecordItems(
  metric: AchievementHallMetric,
  term: NajmTerm,
  year: string,
): HallPosterItem[] {
  const items: HallPosterItem[] = [
    { id: "header-title", kind: "text", text: metric.title },
    { id: "header-subtitle", kind: "text", text: `${termLabel(term)} • ${toFa(year)}` },
  ];
  metric.records.slice(0, 5).forEach((record, index) => {
    const prefix = `slot-${index}`;
    items.push(
      { id: `${prefix}-rank`, kind: "text", text: `رتبه ${toFa(record.rank)}` },
      {
        id: `${prefix}-photo`,
        kind: "photo",
        photoUrl: record.poster_avatar_url ?? record.avatar_url,
        transparent: Boolean(record.poster_avatar_url),
      },
      { id: `${prefix}-name`, kind: "text", text: record.student_name },
      { id: `${prefix}-class`, kind: "text", text: record.class_name ?? "بدون کلاس" },
      {
        id: `${prefix}-value`,
        kind: "text",
        text: formatMetricValue(record.metric_value, metric.value_format, metric.unit_label),
      },
    );
  });
  return items;
}
function buildWinnerItems(
  winners: AchievementHallWinner[],
  title: string,
  subtitle: string,
): HallPosterItem[] {
  const items: HallPosterItem[] = [
    { id: "header-title", kind: "text", text: title },
    { id: "header-subtitle", kind: "text", text: subtitle },
  ];
  winners.slice(0, 15).forEach((winner, index) => {
    const prefix = `slot-${index}`;
    items.push(
      {
        id: `${prefix}-photo`,
        kind: "photo",
        photoUrl: winner.poster_avatar_url ?? winner.avatar_url,
        transparent: Boolean(winner.poster_avatar_url),
      },
      { id: `${prefix}-metric`, kind: "text", text: winner.metric_title },
      { id: `${prefix}-name`, kind: "text", text: winner.student_name },
      {
        id: `${prefix}-value`,
        kind: "text",
        text: formatMetricValue(winner.metric_value, winner.value_format, winner.unit_label),
      },
    );
  });
  return items;
}
function elementStyle(element: HallLayoutElement, layout: HallPosterLayout): CSSProperties {
  return {
    position: "absolute",
    left: `${(element.x / layout.canvasWidth) * 100}%`,
    top: `${(element.y / layout.canvasHeight) * 100}%`,
    width: `${(element.width / layout.canvasWidth) * 100}%`,
    height: `${(element.height / layout.canvasHeight) * 100}%`,
    transform: `rotate(${element.rotation}deg)`,
    transformOrigin: "center",
    zIndex: element.zIndex,
    color: element.color,
    fontSize: element.fontSize ? `${(element.fontSize / layout.canvasWidth) * 100}cqw` : undefined,
    fontWeight: element.fontWeight,
    fontFamily: element.fontFamily,
    textAlign: element.align ?? "center",
    justifyContent:
      element.align === "right" ? "flex-start" : element.align === "left" ? "flex-end" : "center",
  };
}
function HallPosterCanvas({
  id,
  type,
  layout,
  items,
  backgroundUrl,
  editing = false,
  selectedId,
  onSelect,
  onBegin,
}: {
  id?: string;
  type: HallPosterType;
  layout: HallPosterLayout;
  items: HallPosterItem[];
  backgroundUrl?: string;
  editing?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onBegin?: (event: ReactPointerEvent<HTMLElement>, id: string, mode: "drag" | "resize") => void;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <div
      id={id}
      data-hall-poster="true"
      data-export-width={layout.canvasWidth}
      data-export-height={layout.canvasHeight}
      className={`hall-poster-canvas relative overflow-hidden bg-[#064E3B] bg-cover bg-center ${type === "record_holders" ? "hall-poster-record" : "hall-poster-winners"}`}
      style={{
        aspectRatio: `${layout.canvasWidth} / ${layout.canvasHeight}`,
        backgroundImage: backgroundUrl
          ? `url("${backgroundUrl}")`
          : "radial-gradient(circle at 50% 20%,rgba(248,231,201,.13),transparent 30%),linear-gradient(145deg,#043d2e,#064E3B)",
      }}
    >
      {Object.entries(layout.elements).map(([elementId, element]) => {
        if (element.hidden) return null;
        const item =
          byId.get(elementId) ??
          (editing
            ? ({ id: elementId, kind: element.kind, text: element.label } as HallPosterItem)
            : null);
        if (!item) return null;
        const selected = editing && selectedId === elementId;
        const common = `hall-poster-element ${selected ? "hall-poster-selected" : ""}`;
        if (item.kind === "photo") {
          return (
            <button
              type="button"
              key={elementId}
              className={`${common} overflow-visible`}
              style={elementStyle(element, layout)}
              onPointerDown={(event) => {
                if (!editing) return;
                event.stopPropagation();
                onSelect?.(elementId);
                onBegin?.(event, elementId, "drag");
              }}
            >
              <HallPhoto source={item.photoUrl} transparent={item.transparent} />
              {selected && (
                <span
                  className="hall-resize-handle"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onBegin?.(event, elementId, "resize");
                  }}
                />
              )}
            </button>
          );
        }
        return (
          <button
            type="button"
            key={elementId}
            className={`${common} flex items-center overflow-hidden whitespace-nowrap`}
            style={elementStyle(element, layout)}
            onPointerDown={(event) => {
              if (!editing) return;
              event.stopPropagation();
              onSelect?.(elementId);
              onBegin?.(event, elementId, "drag");
            }}
          >
            <span className="block w-full overflow-hidden text-ellipsis">{item.text}</span>
            {selected && (
              <span
                className="hall-resize-handle"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onBegin?.(event, elementId, "resize");
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AchievementHallPage() {
  const [data, setData] = useState<AchievementHallData | null>(null);
  const [historyRecords, setHistoryRecords] = useState<AchievementHistoryRecord[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [finalizing, setFinalizing] = useState<"term" | "academic_year" | null>(null);
  const [metricDialog, setMetricDialog] = useState<AchievementHallMetric | null | "new">(null);
  const [editorType, setEditorType] = useState<HallPosterType | null>(null);
  const [previewMetric, setPreviewMetric] = useState<AchievementHallMetric | null>(null);
  const [posterUrls, setPosterUrls] = useState<Record<string, string>>({});
  const uploadRefs = {
    record_holders: useRef<HTMLInputElement>(null),
    term_winners: useRef<HTMLInputElement>(null),
    year_winners: useRef<HTMLInputElement>(null),
  };

  async function load(showToast = false, term?: NajmTerm, year?: string) {
    if (showToast) setRefreshing(true);
    else setLoading(true);
    const [result, historyResult] = await Promise.all([
      getAchievementHall({ term: term ?? null, academicYear: year ?? null }),
      getAchievementHistoryRecords(),
    ]);
    if (result.error || !result.data) {
      toast.error(result.error ?? "خطا در دریافت تالار افتخارات");
    } else {
      setData(result.data);
      if (showToast) toast.success("تالار افتخارات به‌روز شد");
    }
    if (!historyResult.error && historyResult.data) setHistoryRecords(historyResult.data);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void Promise.all([
      load(),
      supabase
        .from("najm_terms")
        .select("term, academic_year, title, is_active")
        .order("created_at", { ascending: false })
        .then(({ data: rows }) => setTerms((rows ?? []) as TermOption[])),
    ]);
  }, []);

  const activeTerm = data?.term ?? "term1";
  const activeYear = data?.academic_year ?? "";
  const posters = useMemo(
    () => new Map((data?.posters ?? []).map((poster) => [poster.poster_type, poster])),
    [data],
  );
  useEffect(() => {
    let active = true;
    const paths = (data?.posters ?? [])
      .map((poster) => poster.background_path)
      .filter((path): path is string => Boolean(path));
    void Promise.all(
      paths.map(async (path) => [
        path,
        await resolvePrivateStorageUrl(POSTER_BUCKET, path),
      ] as const),
    ).then((entries) => {
      if (active) setPosterUrls(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [data?.posters]);
  const layouts = {
    record_holders: resolveLayout(posters.get("record_holders")?.layout, "record_holders"),
    term_winners: resolveLayout(posters.get("term_winners")?.layout, "term_winners"),
    year_winners: resolveLayout(posters.get("year_winners")?.layout, "year_winners"),
  };
  const firstMetric = data?.live_records[0];
  const editorItems = editorType
    ? editorType === "record_holders"
      ? firstMetric
        ? buildRecordItems(firstMetric, activeTerm, activeYear)
        : []
      : editorType === "term_winners"
        ? buildWinnerItems(
            data?.term_winners ?? [],
            "برگزیدگان افتخارات ترم",
            `${termLabel(activeTerm)} • ${toFa(activeYear)}`,
          )
        : buildWinnerItems(data?.year_winners ?? [], "برگزیدگان افتخارات سال", toFa(activeYear))
    : [];

  function posterSetting(type: HallPosterType): AchievementHallPosterSetting | undefined {
    return posters.get(type);
  }
  function resolvedPosterUrl(path?: string | null): string {
    if (!path) return "";
    if (/^https?:\/\//i.test(path) && !path.includes(`/storage/v1/object/`)) return path;
    return posterUrls[path] ?? "";
  }
  async function uploadPoster(type: HallPosterType, file?: File) {
    if (!file || !data) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("فرمت پوستر باید PNG، JPG یا WebP باشد");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("حجم پوستر نباید بیشتر از ۱۲ مگابایت باشد");
      return;
    }
    const extension =
      file.name
        .split(".")
        .pop()
        ?.replace(/[^a-z0-9]/gi, "") || "png";
    const path = `hall/${activeYear}/${type}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(POSTER_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return toast.error(uploadError.message);
    const previous = posterSetting(type)?.background_path;
    const result = await saveAchievementHallPoster({
      posterType: type,
      academicYear: activeYear,
      term: type === "year_winners" ? null : activeTerm,
      backgroundPath: path,
      layout: layouts[type] as unknown as Record<string, unknown>,
    });
    if (result.error) {
      await supabase.storage.from(POSTER_BUCKET).remove([path]);
      return toast.error(result.error);
    }
    if (previous) await supabase.storage.from(POSTER_BUCKET).remove([previous]);
    toast.success("پس‌زمینه پوستر ذخیره شد");
    await load(false, activeTerm, activeYear);
  }
  async function saveLayout(type: HallPosterType, layout: HallPosterLayout) {
    const result = await saveAchievementHallPoster({
      posterType: type,
      academicYear: activeYear,
      term: type === "year_winners" ? null : activeTerm,
      backgroundPath: posterSetting(type)?.background_path ?? null,
      layout: layout as unknown as Record<string, unknown>,
    });
    if (result.error) throw new Error(result.error);
    toast.success("چیدمان پوستر ذخیره شد");
    await load(false, activeTerm, activeYear);
  }
  async function refreshHistory() {
    setHistoryRefreshing(true);
    const result = await refreshAllAchievementHistoryRecords();
    setHistoryRefreshing(false);
    if (result.error) return toast.error(result.error);
    toast.success(`${toFa(result.data ?? 0)} رویداد رکورد جدید از سوابق شناسایی شد`);
    await load(false, activeTerm, activeYear);
  }

  async function finalize(scope: "term" | "academic_year") {
    if (!data) return;
    const label = scope === "term" ? "ترم" : "سال تحصیلی";
    if (!window.confirm(`نتایج ${label} نهایی و برای همیشه Snapshot شود؟`)) return;
    setFinalizing(scope);
    const result = await finalizeAchievementHall({
      scope,
      term: scope === "term" ? activeTerm : null,
      academicYear: activeYear,
    });
    setFinalizing(null);
    if (result.error) return toast.error(result.error);
    toast.success(`برگزیدگان ${label} نهایی و بایگانی شدند`);
    await load(false, activeTerm, activeYear);
  }

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-7 w-7 animate-spin text-[#064E3B]" />
        <span className="text-sm text-muted-foreground">در حال محاسبه تالار افتخارات...</span>
      </div>
    );
  }
  if (!data) return <Card className="p-10 text-center">اطلاعات تالار افتخارات در دسترس نیست.</Card>;

  return (
    <div className="achievement-hall-page space-y-6 rounded-[2rem] p-3 md:p-5" dir="rtl">
      <section className="achievement-hall-hero rounded-[2rem] p-6 text-[#F8E7C9] shadow-xl">
        <p className="font-display text-lg">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-black md:text-4xl">تالار افتخارات</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#F8E7C9]/75">
              رکوردهای زنده ترم، برگزیدگان نهایی هر ترم و رکوردداران کل سال؛ تمام Snapshotها
              دائمی‌اند.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={`${activeYear}|${activeTerm}`}
              onValueChange={(value) => {
                const [year, term] = value.split("|") as [string, NajmTerm];
                void load(false, term, year);
              }}
            >
              <SelectTrigger className="w-52 border-[#F8E7C9]/30 bg-white/10 text-[#F8E7C9]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terms.map((term) => (
                  <SelectItem
                    key={`${term.academic_year}-${term.term}`}
                    value={`${term.academic_year}|${term.term}`}
                  >
                    {term.title} — {toFa(term.academic_year)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              className="gap-2 bg-[#F8E7C9] text-[#064E3B]"
              disabled={refreshing}
              onClick={() => void load(true, activeTerm, activeYear)}
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
      </section>

      <HallPosterManager
        data={data}
        layouts={layouts}
        onUpload={(type) => uploadRefs[type].current?.click()}
        onEdit={setEditorType}
      />
      {(["record_holders", "term_winners", "year_winners"] as HallPosterType[]).map((type) => (
        <input
          key={type}
          ref={uploadRefs[type]}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void uploadPoster(type, event.target.files?.[0])}
        />
      ))}

      <Tabs defaultValue="records" className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-2xl bg-[#064E3B]/10 p-1">
          <TabsTrigger value="records">تالار رکوردداران</TabsTrigger>
          <TabsTrigger value="term">برگزیدگان افتخارات ترم</TabsTrigger>
          <TabsTrigger value="year">برگزیدگان افتخارات سال</TabsTrigger>
          <TabsTrigger value="history">رکوردهای تاریخ دارالقرآن</TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="space-y-5">
          <SectionHeading
            icon={<Trophy className="h-5 w-5" />}
            title="تالار رکوردداران ترم"
            description="پنج رتبه برتر هر شاخص در کل دارالقرآن؛ بدون رتبه‌بندی کلاسی"
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {data.live_records.map((metric) => (
              <MetricRecordCard
                key={metric.id}
                metric={metric}
                onPoster={() => setPreviewMetric(metric)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="term" className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionHeading
              icon={<Medal className="h-5 w-5" />}
              title={`برگزیدگان ${termLabel(activeTerm)} ${toFa(activeYear)}`}
              description="تمام رتبه‌های اول مشترک هر شاخص از Snapshot نهایی ترم"
            />
            <Button
              disabled={data.term_finalized || finalizing !== null}
              onClick={() => void finalize("term")}
              className="bg-[#064E3B] text-[#F8E7C9]"
            >
              {finalizing === "term" && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {data.term_finalized ? "ترم نهایی شده" : "نهایی‌سازی و بایگانی ترم"}
            </Button>
          </div>
          <WinnerGrid winners={data.term_winners} />
          {data.term_winners.length > 0 && (
            <PosterSection
              id="hall-term-poster"
              type="term_winners"
              layout={layouts.term_winners}
              items={buildWinnerItems(
                data.term_winners,
                "برگزیدگان افتخارات ترم",
                `${termLabel(activeTerm)} • ${toFa(activeYear)}`,
              )}
              background={resolvedPosterUrl(posterSetting("term_winners")?.background_path)}
            />
          )}
        </TabsContent>

        <TabsContent value="year" className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionHeading
              icon={<Crown className="h-5 w-5" />}
              title={`برگزیدگان افتخارات سال ${toFa(activeYear)}`}
              description="محاسبه مستقیم تمام داده‌های ترم اول، دوم و تابستان در کل سال تحصیلی"
            />
            <Button
              disabled={data.year_finalized || finalizing !== null}
              onClick={() => void finalize("academic_year")}
              className="bg-[#064E3B] text-[#F8E7C9]"
            >
              {finalizing === "academic_year" && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {data.year_finalized ? "سال نهایی شده" : "نهایی‌سازی و بایگانی سال"}
            </Button>
          </div>
          <WinnerGrid winners={data.year_winners} />
          {data.year_winners.length > 0 && (
            <PosterSection
              id="hall-year-poster"
              type="year_winners"
              layout={layouts.year_winners}
              items={buildWinnerItems(
                data.year_winners,
                "برگزیدگان افتخارات سال",
                toFa(activeYear),
              )}
              background={resolvedPosterUrl(posterSetting("year_winners")?.background_path)}
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionHeading
              icon={<Archive className="h-5 w-5" />}
              title="رکوردهای تاریخ دارالقرآن"
              description="رکوردهای بلندمدت رسمی؛ با شکستن هر رکورد، دارنده جدید جایگزین و رکورد قبلی برای همیشه در تاریخچه حفظ می‌شود"
            />
            <Button
              variant="outline"
              disabled={historyRefreshing}
              onClick={() => void refreshHistory()}
            >
              {historyRefreshing ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="ml-2 h-4 w-4" />
              )}
              بازبینی تمام سوابق
            </Button>
          </div>
          <HistoryRecordGrid records={historyRecords} />
        </TabsContent>
      </Tabs>

      <MetricManager
        metrics={data.all_metrics}
        onEdit={(metric) => setMetricDialog(metric)}
        onNew={() => setMetricDialog("new")}
      />

      {previewMetric && (
        <PosterPreviewDialog
          open
          onClose={() => setPreviewMetric(null)}
          title={previewMetric.title}
          type="record_holders"
          layout={layouts.record_holders}
          items={buildRecordItems(previewMetric, activeTerm, activeYear)}
          background={resolvedPosterUrl(posterSetting("record_holders")?.background_path)}
        />
      )}
      {editorType && (
        <HallLayoutEditor
          open
          type={editorType}
          initial={layouts[editorType]}
          items={editorItems}
          background={resolvedPosterUrl(posterSetting(editorType)?.background_path)}
          onClose={() => setEditorType(null)}
          onSave={(layout) => saveLayout(editorType, layout)}
        />
      )}
      <MetricEditorDialog
        open={metricDialog !== null}
        initial={metricDialog === "new" ? null : metricDialog}
        onClose={() => setMetricDialog(null)}
        onSaved={async () => {
          setMetricDialog(null);
          await load(false, activeTerm, activeYear);
        }}
      />

      <style>{hallStyles}</style>
    </div>
  );
}

function HallPosterManager({
  data,
  layouts,
  onUpload,
  onEdit,
}: {
  data: AchievementHallData;
  layouts: Record<HallPosterType, HallPosterLayout>;
  onUpload: (type: HallPosterType) => void;
  onEdit: (type: HallPosterType) => void;
}) {
  const labels: Record<HallPosterType, string> = {
    record_holders: "پوستر پنج رکورددار هر شاخص",
    term_winners: "پوستر برگزیدگان ترم",
    year_winners: "پوستر برگزیدگان سال",
  };
  const existing = new Map(data.posters.map((poster) => [poster.poster_type, poster]));
  return (
    <Card className="hall-panel rounded-3xl border-0 p-5">
      <SectionHeading
        icon={<Image className="h-5 w-5" />}
        title="مدیریت پوسترهای تالار"
        description="سه قالب مستقل؛ پس‌زمینه و جای همه عکس‌ها و نوشته‌ها قابل تنظیم است"
      />
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {(Object.keys(labels) as HallPosterType[]).map((type) => (
          <div key={type} className="rounded-2xl border border-[#064E3B]/15 bg-white/75 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-[#064E3B]">{labels[type]}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {toFa(layouts[type].canvasWidth)}×{toFa(layouts[type].canvasHeight)}
                </p>
              </div>
              <Badge variant="outline">
                {existing.get(type)?.background_path ? "سفارشی" : "پیش‌فرض"}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(type)}>
                <LayoutTemplate className="ml-1 h-4 w-4" /> چیدمان
              </Button>
              <Button
                size="sm"
                className="bg-[#064E3B] text-[#F8E7C9]"
                onClick={() => onUpload(type)}
              >
                <Upload className="ml-1 h-4 w-4" /> بارگذاری
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8E7C9] text-[#064E3B]">
        {icon}
      </span>
      <div>
        <h2 className="font-display text-xl font-black text-[#064E3B]">{title}</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
function MetricRecordCard({
  metric,
  onPoster,
}: {
  metric: AchievementHallMetric;
  onPoster: () => void;
}) {
  return (
    <Card className="hall-panel overflow-hidden rounded-3xl border-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-black text-[#064E3B]">{metric.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{metric.description}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onPoster}>
          <Image className="ml-1 h-4 w-4" /> پوستر
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {metric.records.length === 0 ? (
          <div className="rounded-xl border border-dashed p-7 text-center text-xs text-muted-foreground">
            هنوز رکورد واجد شرایطی وجود ندارد.
          </div>
        ) : (
          metric.records.map((record) => (
            <RecordRow
              key={`${record.student_id}-${record.rank}`}
              record={record}
              metric={metric}
            />
          ))
        )}
      </div>
    </Card>
  );
}
function RecordRow({
  record,
  metric,
}: {
  record: AchievementHallRecord;
  metric: AchievementHallMetric;
}) {
  return (
    <div className="grid grid-cols-[42px_48px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-[#F8E7C9]/45 p-2.5">
      <span className="font-display text-lg font-black text-[#064E3B]">{toFa(record.rank)}</span>
      <div className="h-11 w-11 overflow-hidden rounded-full bg-white">
        <HallPhoto
          source={record.poster_avatar_url ?? record.avatar_url}
          transparent={Boolean(record.poster_avatar_url)}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{record.student_name}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {record.class_name ?? "بدون کلاس"}
        </p>
      </div>
      <Badge className="bg-[#064E3B] text-[#F8E7C9]">
        {formatMetricValue(record.metric_value, metric.value_format, metric.unit_label)}
      </Badge>
    </div>
  );
}
function WinnerGrid({ winners }: { winners: AchievementHallWinner[] }) {
  if (!winners.length)
    return (
      <Card className="rounded-3xl border-dashed p-12 text-center text-muted-foreground">
        این بازه هنوز نهایی نشده است.
      </Card>
    );
  return (
    <div className="mobile-achievement-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {winners.map((winner, index) => (
        <Card
          key={`${winner.metric_id}-${winner.student_id}`}
          className="hall-panel rounded-3xl border-0 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 overflow-hidden rounded-full bg-[#F8E7C9]">
              <HallPhoto
                source={winner.poster_avatar_url ?? winner.avatar_url}
                transparent={Boolean(winner.poster_avatar_url)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Badge variant="outline" className="mb-1 border-[#064E3B]/20 text-[#064E3B]">
                {winner.metric_title}
              </Badge>
              <p className="truncate font-display text-lg font-black">{winner.student_name}</p>
              <p className="text-xs text-muted-foreground">{winner.class_name ?? "بدون کلاس"}</p>
            </div>
            <Crown className="h-6 w-6 text-amber-600" />
          </div>
          <div className="mt-3 rounded-xl bg-[#064E3B] p-2 text-center font-black text-[#F8E7C9]">
            {formatMetricValue(winner.metric_value, winner.value_format, winner.unit_label)}
          </div>
        </Card>
      ))}
    </div>
  );
}
function HistoryRecordGrid({ records }: { records: AchievementHistoryRecord[] }) {
  if (!records.length) {
    return (
      <Card className="rounded-3xl border-dashed p-12 text-center text-muted-foreground">
        هنوز شاخص تاریخی فعالی تعریف نشده است.
      </Card>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {records.map((record) => (
        <HistoryRecordCard key={record.metric_id} record={record} />
      ))}
    </div>
  );
}

function HistoryRecordCard({ record }: { record: AchievementHistoryRecord }) {
  const current = record.current;
  const previous = record.history.filter((event) => !event.is_current);
  return (
    <Card className="hall-history-card relative overflow-hidden rounded-3xl border-0 p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#064E3B] via-amber-400 to-[#064E3B]" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge className="border-0 bg-[#064E3B] text-[#F8E7C9]">رکورد تاریخی</Badge>
          <h3 className="mt-3 font-display text-xl font-black text-[#064E3B]">
            {record.history_title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {record.history_mode === "term_final"
              ? "ثبت فقط از نتایج نهایی ترم"
              : "به‌روزرسانی خودکار با شکستن رکورد"}
          </p>
        </div>
        <Trophy className="h-8 w-8 text-amber-600" />
      </div>

      {current ? (
        <div className="mt-5 grid grid-cols-[82px_minmax(0,1fr)] items-center gap-4 rounded-2xl bg-[#F8E7C9]/65 p-4">
          <div className="h-20 w-20 overflow-hidden rounded-2xl bg-white/80">
            <HallPhoto
              source={current.poster_avatar_url ?? current.avatar_url}
              transparent={Boolean(current.poster_avatar_url)}
            />
          </div>
          <div className="min-w-0">
            <p className="font-display text-3xl font-black text-[#064E3B]">
              {formatMetricValue(current.record_value, current.value_format, current.unit_label)}
            </p>
            <p className="mt-2 truncate text-base font-black">{current.student_name}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{current.class_name ?? "بدون کلاس"}</span>
              <span>سال ثبت: {current.academic_year ? toFa(current.academic_year) : "—"}</span>
              <span>{current.term ? termLabel(current.term) : "رکورد کل سابقه"}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
          هنوز رکورد رسمی برای این شاخص ثبت نشده است.
        </div>
      )}

      <details className="mt-4 rounded-xl border border-[#064E3B]/10 bg-white/55 p-3">
        <summary className="cursor-pointer text-xs font-bold text-[#064E3B]">
          تاریخچه رکوردداران قبلی ({toFa(previous.length)})
        </summary>
        <div className="mt-3 space-y-2">
          {previous.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-muted-foreground">
              این نخستین رکورد رسمی این شاخص است.
            </p>
          ) : (
            previous.map((event) => (
              <div
                key={event.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-[#F8E7C9]/45 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{event.student_name}</p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">
                    {event.academic_year ? toFa(event.academic_year) : "—"} • رکورد از{" "}
                    {formatDate(event.became_record_at)} تا {formatDate(event.superseded_at)}
                  </p>
                </div>
                <span className="font-display font-black text-[#064E3B]">
                  {formatMetricValue(event.record_value, event.value_format, event.unit_label)}
                </span>
              </div>
            ))
          )}
        </div>
      </details>
    </Card>
  );
}

function PosterSection({
  id,
  type,
  layout,
  items,
  background,
}: {
  id: string;
  type: HallPosterType;
  layout: HallPosterLayout;
  items: HallPosterItem[];
  background?: string;
}) {
  return (
    <Card className="hall-panel rounded-3xl border-0 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-black text-[#064E3B]">پیش‌نمایش پوستر</h3>
        <ExportPosterButtons elementId={id} />
      </div>
      <HallPosterCanvas
        id={id}
        type={type}
        layout={layout}
        items={items}
        backgroundUrl={background}
      />
    </Card>
  );
}
function ExportPosterButtons({ elementId }: { elementId: string }) {
  const [busy, setBusy] = useState(false);
  async function run(format: "png" | "jpeg" | "pdf") {
    const node = document.getElementById(elementId) as HTMLElement | null;
    if (!node) return;
    setBusy(true);
    try {
      const image = await import("html-to-image");
      const width = Number(node.dataset.exportWidth ?? node.offsetWidth);
      const height = Number(node.dataset.exportHeight ?? node.offsetHeight);
      const common = {
        width: node.offsetWidth,
        height: node.offsetHeight,
        canvasWidth: width,
        canvasHeight: height,
        pixelRatio: 1,
        backgroundColor: "#064E3B",
      };
      if (format === "pdf") {
        const [{ jsPDF }, jpeg] = await Promise.all([
          import("jspdf"),
          image.toJpeg(node, { ...common, quality: 0.95 }),
        ]);
        const pdf = new jsPDF({
          orientation: width >= height ? "landscape" : "portrait",
          unit: "px",
          format: [width, height],
          hotfixes: ["px_scaling"],
        });
        pdf.addImage(
          jpeg,
          "JPEG",
          0,
          0,
          pdf.internal.pageSize.getWidth(),
          pdf.internal.pageSize.getHeight(),
        );
        pdf.save("achievement-hall-poster.pdf");
      } else {
        const dataUrl =
          format === "png"
            ? await image.toPng(node, common)
            : await image.toJpeg(node, { ...common, quality: 0.95 });
        const anchor = document.createElement("a");
        anchor.href = dataUrl;
        anchor.download = `achievement-hall-poster.${format === "jpeg" ? "jpg" : "png"}`;
        anchor.click();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در خروجی پوستر");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-1">
      {(["png", "jpeg", "pdf"] as const).map((format) => (
        <Button
          key={format}
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run(format)}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
function PosterPreviewDialog({
  open,
  onClose,
  title,
  type,
  layout,
  items,
  background,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  type: HallPosterType;
  layout: HallPosterLayout;
  items: HallPosterItem[];
  background?: string;
}) {
  const id = "hall-record-preview";
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[95vh] !max-w-[95vw] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>پوستر پنج رکورددار این شاخص</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <ExportPosterButtons elementId={id} />
        </div>
        <HallPosterCanvas
          id={id}
          type={type}
          layout={layout}
          items={items}
          backgroundUrl={background}
        />
      </DialogContent>
    </Dialog>
  );
}
function MetricManager({
  metrics,
  onEdit,
  onNew,
}: {
  metrics: AchievementHallMetric[];
  onEdit: (metric: AchievementHallMetric) => void;
  onNew: () => void;
}) {
  return (
    <Card className="hall-panel rounded-3xl border-0 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SectionHeading
          icon={<Settings2 className="h-5 w-5" />}
          title="مدیریت شاخص‌های تالار"
          description="شاخص‌ها مستقل از نشان‌ها هستند و مستقیماً به نجم یا واقعیت‌های تأییدشده متصل می‌شوند"
        />
        <Button onClick={onNew} className="bg-[#064E3B] text-[#F8E7C9]">
          <Plus className="ml-1 h-4 w-4" /> شاخص جدید
        </Button>
      </div>
      <div className="mobile-achievement-grid mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <button
            key={metric.id}
            type="button"
            onClick={() => onEdit(metric)}
            className="flex items-center justify-between rounded-xl border border-[#064E3B]/15 bg-white/70 p-3 text-right hover:bg-[#F8E7C9]/55"
          >
            <div>
              <p className="text-sm font-bold">{metric.title}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {metric.metric_key ?? metric.source_kind}
              </p>
            </div>
            <Edit3 className="h-4 w-4 text-[#064E3B]" />
          </button>
        ))}
      </div>
    </Card>
  );
}
function MetricEditorDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: AchievementHallMetric | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceKind, setSourceKind] = useState<AchievementHallMetricSource>("najm");
  const [metricKey, setMetricKey] = useState("attendance_streak");
  const [unit, setUnit] = useState("امتیاز");
  const [format, setFormat] = useState<"number" | "percent" | "decimal">("number");
  const [minimumRecords, setMinimumRecords] = useState("0");
  const [minimumValue, setMinimumValue] = useState("0");
  const [active, setActive] = useState(true);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [historyMode, setHistoryMode] = useState<"lifetime_live" | "term_final">("lifetime_live");
  const [historyTitle, setHistoryTitle] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setSourceKind(initial?.source_kind ?? "najm");
    setMetricKey(initial?.metric_key ?? "attendance_streak");
    setUnit(initial?.unit_label ?? "امتیاز");
    setFormat(initial?.value_format ?? "number");
    setMinimumRecords(String(initial?.minimum_najm_records ?? 0));
    setMinimumValue(String(initial?.minimum_value ?? 0));
    setActive(initial?.is_active ?? true);
    setHistoryEnabled(initial?.history_enabled ?? false);
    setHistoryMode(initial?.history_mode ?? "lifetime_live");
    setHistoryTitle(initial?.history_title ?? "");
  }, [open, initial]);
  async function submit() {
    if (!title.trim()) return toast.error("عنوان شاخص الزامی است");
    setSaving(true);
    const result = await saveAchievementHallMetric({
      id: initial?.id,
      slug: initial?.slug ?? `hall_metric_${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      source_kind: sourceKind,
      metric_key: sourceKind === "najm" ? metricKey : null,
      metric_params: initial?.metric_params ?? {},
      unit_label: unit.trim() || "امتیاز",
      value_format: format,
      sort_direction: initial?.sort_direction ?? "desc",
      minimum_najm_records: Number(minimumRecords || 0),
      minimum_value: Number(minimumValue || 0),
      is_active: active,
      sort_order: initial?.sort_order ?? 999,
    });
    if (result.error || !result.data) {
      setSaving(false);
      return toast.error(result.error ?? "شاخص ذخیره نشد");
    }
    const historyResult = await saveAchievementHistoryMetricSettings({
      metricId: result.data,
      enabled: historyEnabled,
      mode: historyMode,
      historyTitle: historyTitle.trim() || title.trim(),
    });
    setSaving(false);
    if (historyResult.error) return toast.error(historyResult.error);
    toast.success("شاخص تالار ذخیره شد");
    await onSaved();
  }
  const metricOptions = [
    ["attendance_streak", "حضور متوالی"],
    ["attendance_rate", "درصد حضور"],
    ["exam_full_count", "تعداد آزمون کامل"],
    ["session_score_percent", "درصد عملکرد نجم"],
    ["homework_average", "میانگین تکلیف"],
    ["discipline_average", "میانگین انضباط"],
    ["special_progress_total", "مجموع پیشرفت ویژه"],
    ["special_help_total", "مجموع کمک ویژه"],
    ["improvement_delta", "میزان رشد"],
    ["adjusted_term_percent", "درصد تعدیل‌شده"],
  ];
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "ویرایش شاخص" : "شاخص جدید تالار"}</DialogTitle>
          <DialogDescription>
            منبع محاسبه و حداقل شرایط ورود به رتبه‌بندی را مشخص کنید.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="عنوان">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="منبع">
            <Select
              value={sourceKind}
              onValueChange={(value) => setSourceKind(value as AchievementHallMetricSource)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="najm">طرح نجم</SelectItem>
                <SelectItem value="achievement_count">تعداد افتخارات</SelectItem>
                <SelectItem value="achievement_unique_count">نشان‌های یکتا</SelectItem>
                <SelectItem value="special_activity_count">فعالیت‌های ویژه</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {sourceKind === "najm" && (
            <Field label="شاخص نجم">
              <Select value={metricKey} onValueChange={setMetricKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="واحد">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field label="فرمت">
            <Select value={format} onValueChange={(value) => setFormat(value as typeof format)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">عدد صحیح</SelectItem>
                <SelectItem value="decimal">اعشاری</SelectItem>
                <SelectItem value="percent">درصد</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="حداقل جلسات نجم">
            <Input
              type="number"
              value={minimumRecords}
              onChange={(e) => setMinimumRecords(e.target.value)}
            />
          </Field>
          <Field label="حداقل مقدار">
            <Input
              type="number"
              value={minimumValue}
              onChange={(e) => setMinimumValue(e.target.value)}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="توضیح">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 md:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>ثبت در رکوردهای تاریخ دارالقرآن</Label>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  فقط شکستن واقعی رکورد، دارنده فعلی را تغییر می‌دهد.
                </p>
              </div>
              <Switch checked={historyEnabled} onCheckedChange={setHistoryEnabled} />
            </div>
            {historyEnabled && (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="عنوان رکورد تاریخی">
                  <Input
                    value={historyTitle}
                    onChange={(e) => setHistoryTitle(e.target.value)}
                    placeholder="بیشترین ... تاریخ دارالقرآن"
                  />
                </Field>
                <Field label="زمان ثبت رکورد">
                  <Select
                    value={historyMode}
                    onValueChange={(value) => setHistoryMode(value as typeof historyMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lifetime_live">زنده و کل سابقه</SelectItem>
                      <SelectItem value="term_final">فقط پس از نهایی‌سازی ترم</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3 md:col-span-2">
            <Label>فعال</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function HallLayoutEditor({
  open,
  type,
  initial,
  items,
  background,
  onClose,
  onSave,
}: {
  open: boolean;
  type: HallPosterType;
  initial: HallPosterLayout;
  items: HallPosterItem[];
  background?: string;
  onClose: () => void;
  onSave: (layout: HallPosterLayout) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => cloneLayout(initial));
  const [selectedId, setSelectedId] = useState<string | null>("header-title");
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<{
    id: string;
    mode: "drag" | "resize";
    x: number;
    y: number;
    element: HallLayoutElement;
  } | null>(null);
  useEffect(() => {
    if (open) setDraft(cloneLayout(initial));
  }, [open, initial]);
  const selected = selectedId ? draft.elements[selectedId] : null;
  function patch(patchValue: Partial<HallLayoutElement>) {
    if (!selectedId) return;
    setDraft((current) => ({
      ...current,
      elements: {
        ...current.elements,
        [selectedId]: { ...current.elements[selectedId], ...patchValue },
      },
    }));
  }
  function begin(event: ReactPointerEvent<HTMLElement>, id: string, mode: "drag" | "resize") {
    const canvas = canvasRef.current;
    const element = draft.elements[id];
    if (!canvas || !element) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    interaction.current = { id, mode, x: event.clientX, y: event.clientY, element: { ...element } };
    const move = (e: PointerEvent) => {
      const active = interaction.current;
      if (!active) return;
      const dx = (e.clientX - active.x) * (draft.canvasWidth / rect.width);
      const dy = (e.clientY - active.y) * (draft.canvasHeight / rect.height);
      setDraft((current) => {
        const base = active.element;
        const next =
          active.mode === "drag"
            ? { x: Math.max(0, base.x + dx), y: Math.max(0, base.y + dy) }
            : { width: Math.max(20, base.width + dx), height: Math.max(20, base.height + dy) };
        return {
          ...current,
          elements: {
            ...current.elements,
            [active.id]: { ...current.elements[active.id], ...next },
          },
        };
      });
    };
    const end = () => {
      interaction.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }
  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="flex h-[94vh] !max-w-[97vw] flex-col overflow-hidden p-0" dir="rtl">
        <DialogHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>ویرایش چیدمان پوستر</DialogTitle>
              <DialogDescription>
                تمام عکس‌ها و نوشته‌ها را با ماوس یا مقادیر عددی جابه‌جا کنید.
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setDraft(cloneLayout(DEFAULT_LAYOUTS[type]))}
              >
                <RotateCcw className="ml-1 h-4 w-4" />
                پیش‌فرض
              </Button>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? (
                  <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-1 h-4 w-4" />
                )}
                ذخیره
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[1fr_340px]">
          <div className="overflow-auto bg-[#eadfc9] p-4">
            <div
              ref={canvasRef}
              className="mx-auto w-fit"
              onPointerDown={() => setSelectedId(null)}
            >
              <HallPosterCanvas
                type={type}
                layout={draft}
                items={items}
                backgroundUrl={background}
                editing
                selectedId={selectedId}
                onSelect={setSelectedId}
                onBegin={begin}
              />
            </div>
          </div>
          <aside className="overflow-y-auto border-r p-4">
            <Label>انتخاب عنصر</Label>
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
            >
              <option value="">بدون انتخاب</option>
              {Object.entries(draft.elements).map(([id, el]) => (
                <option key={id} value={id}>
                  {el.label}
                </option>
              ))}
            </select>
            {selected && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="X" value={selected.x} onChange={(x) => patch({ x })} />
                  <NumberField label="Y" value={selected.y} onChange={(y) => patch({ y })} />
                  <NumberField
                    label="عرض"
                    value={selected.width}
                    onChange={(width) => patch({ width })}
                  />
                  <NumberField
                    label="ارتفاع"
                    value={selected.height}
                    onChange={(height) => patch({ height })}
                  />
                </div>
                <NumberField
                  label="چرخش"
                  value={selected.rotation}
                  step={0.1}
                  onChange={(rotation) => patch({ rotation })}
                />
                {selected.kind === "text" && (
                  <>
                    <NumberField
                      label="اندازه قلم"
                      value={selected.fontSize ?? 24}
                      step={0.5}
                      onChange={(fontSize) => patch({ fontSize })}
                    />
                    <Label>فونت</Label>
                    <select
                      value={selected.fontFamily ?? "Vazirmatn"}
                      onChange={(e) => patch({ fontFamily: e.target.value })}
                      className="h-10 w-full rounded-xl border px-3"
                    >
                      {POSTER_FONTS.map((font) => (
                        <option key={font}>{font}</option>
                      ))}
                    </select>
                    <Label>رنگ</Label>
                    <Input
                      type="color"
                      value={selected.color ?? "#ffffff"}
                      onChange={(e) => patch({ color: e.target.value })}
                    />
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="text-[11px] font-bold text-muted-foreground">
      {label}
      <Input
        type="number"
        value={Number(value.toFixed(2))}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1"
      />
    </label>
  );
}

const hallStyles = `
.achievement-hall-page{background:linear-gradient(135deg,#F8E7C9,#fff7e8);box-shadow:inset 0 0 0 1px rgba(6,78,59,.08)}
.achievement-hall-hero{background:radial-gradient(circle at 15% 20%,rgba(248,231,201,.18),transparent 30%),linear-gradient(135deg,#043d2e,#064E3B)}
.hall-panel{background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(248,231,201,.58));box-shadow:inset 0 0 0 1px rgba(6,78,59,.12),0 16px 36px rgba(6,78,59,.08)}
.hall-history-card{background:radial-gradient(circle at 100% 0,rgba(248,231,201,.62),transparent 32%),linear-gradient(145deg,#fff,rgba(248,231,201,.48));box-shadow:inset 0 0 0 1px rgba(6,78,59,.13),0 18px 38px rgba(6,78,59,.09)}
.hall-poster-canvas{container-type:inline-size;box-shadow:0 20px 50px rgba(2,15,30,.28);margin-inline:auto}
.hall-poster-record{width:min(100%,1000px);min-width:650px}
.hall-poster-winners{width:min(100%,700px);min-width:560px}
.hall-poster-element{margin:0;padding:0;border:0;background:transparent;box-shadow:none;text-shadow:none;touch-action:none}
.hall-poster-selected{outline:2px solid #f59e0b;outline-offset:2px;overflow:visible!important}
.hall-resize-handle{position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;border:2px solid white;border-radius:999px;background:#f59e0b;cursor:nwse-resize}
`;
