import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Edit3, ImagePlus, Loader2, Lock, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AdvancedPosterLayoutEditor,
  type AdvancedPosterLayout,
} from "@/components/posters/advanced-poster-layout-editor";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import type { NajmTerm } from "@/lib/najm";
import { resolvePrivateStorageUrl } from "@/features/storage/private-storage-url";
import {
  finalizeNajmLeagueMonth,
  getNajmLeagueWorkspace,
  saveNajmLeaguePosterSetting,
} from "../api";
import type {
  LeaguePosterElement,
  LeaguePosterLayout,
  NajmLeagueWorkspaceData,
} from "../types";
import { currentJalaliMonthKey, jalaliMonthTitle, toFa } from "../utils";
import { LeagueManager } from "./league-manager";
import { LeagueMembershipHistoryButton } from "./league-membership-history";
import { LeagueSymbol } from "./league-symbol";

const W = 1600,
  H = 1100;
const base = (
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize = 24,
  color = "#064E3B",
): LeaguePosterElement => ({ x, y, width, height, fontSize, color });
export function createLeaguePosterLayout(
  data: NajmLeagueWorkspaceData,
  limit: number | null,
): LeaguePosterLayout {
  const elements: Record<string, LeaguePosterElement> = {
    title: base(120, 40, 1360, 80, 48, "#064E3B"),
    subtitle: base(200, 118, 1200, 48, 24, "#7C5A12"),
  };
  const leagues = data.leagues.filter((l) => !l.archived_at);
  const count = Math.max(1, leagues.length);
  const gap = 28;
  const col = (1480 - gap * (count - 1)) / count;
  leagues.forEach((league, li) => {
    // League creation order starts at the right edge and continues toward the left.
    const x = W - 60 - col - li * (col + gap);
    elements[`league:${league.id}`] = {
      ...base(x, 190, col, 70, 32, league.color),
      align: "right",
    };
    const members = league.members.slice(0, limit ?? undefined);
    const rowH = Math.min(112, 760 / Math.max(1, members.length));
    members.forEach((m, mi) => {
      const y = 282 + mi * rowH;
      const prefix = `member:${m.student_id}`;
      const rankWidth = 58;
      const scoreWidth = 140;
      const photoSize = Math.max(36, rowH - 16);
      const rankX = x + col - rankWidth - 8;
      const photoX = rankX - photoSize - 10;
      const scoreX = x + 8;
      const nameX = scoreX + scoreWidth + 12;
      const nameWidth = Math.max(90, photoX - nameX - 12);

      elements[`${prefix}:rank`] = base(
        rankX,
        y,
        rankWidth,
        rowH - 8,
        28,
        league.color,
      );
      elements[`${prefix}:photo`] = base(photoX, y + 4, photoSize, photoSize);
      elements[`${prefix}:name`] = {
        ...base(nameX, y, nameWidth, rowH - 8, 22, "#16372D"),
        align: "right",
      };
      elements[`${prefix}:score`] = base(
        scoreX,
        y,
        scoreWidth,
        (rowH - 8) / 2,
        22,
        league.color,
      );
      elements[`${prefix}:growth`] = base(
        scoreX,
        y + (rowH - 8) / 2,
        scoreWidth,
        (rowH - 8) / 2,
        18,
        m.growth >= 0 ? "#047857" : "#BE123C",
      );
    });
  });
  return {
    version: 2,
    canvasWidth: W,
    canvasHeight: H,
    printWidthMm: 160,
    printHeightMm: 110,
    backgroundSize: "cover",
    backgroundPosition: "center",
    elements,
  };
}
function style(
  el: LeaguePosterElement,
  layout: LeaguePosterLayout,
): CSSProperties {
  const canvasWidth = layout.canvasWidth || W;
  const canvasHeight = layout.canvasHeight || H;
  return {
    position: "absolute",
    left: `${(el.x / canvasWidth) * 100}%`,
    top: `${(el.y / canvasHeight) * 100}%`,
    width: `${(el.width / canvasWidth) * 100}%`,
    height: `${(el.height / canvasHeight) * 100}%`,
    fontSize: el.fontSize
      ? `${(el.fontSize / canvasWidth) * 100}cqw`
      : undefined,
    fontFamily: el.fontFamily,
    fontWeight: el.fontWeight ?? 700,
    color: el.color,
    backgroundColor: el.backgroundColor,
    borderRadius: el.borderRadius,
    opacity: el.opacity ?? 1,
    transform: `rotate(${el.rotation ?? 0}deg)`,
    zIndex: el.zIndex ?? 5,
    lineHeight: el.lineHeight,
    display: el.hidden ? "none" : "flex",
    alignItems: "center",
    justifyContent:
      el.align === "right"
        ? "flex-start"
        : el.align === "left"
          ? "flex-end"
          : "center",
    textAlign: el.align ?? "center",
    overflow: "hidden",
  };
}

export function LeagueClassPoster({
  data,
  layout,
  backgroundUrl,
  limit,
  editable = false,
  onEdit,
}: {
  data: NajmLeagueWorkspaceData;
  layout: LeaguePosterLayout;
  backgroundUrl?: string;
  limit: number | null;
  editable?: boolean;
  onEdit?: () => void;
}) {
  const leagues = data.leagues.filter((l) => !l.archived_at);
  const effective = useMemo(
    () => mergeLayout(data, createLeaguePosterLayout(data, limit), layout),
    [data, layout, limit],
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-black">
            پوستر رده‌های {data.class_name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {jalaliMonthTitle(data.month_key)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LeagueMembershipHistoryButton data={data} />
          {editable && (
            <Button variant="outline" className="gap-2" onClick={onEdit}>
              <Edit3 className="h-4 w-4" />
              ویرایش چیدمان
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-3xl border bg-slate-100 p-2">
        <div
          data-najm-poster-export="true"
          data-export-width={effective.canvasWidth}
          data-export-height={effective.canvasHeight}
          data-export-label={`رده‌های ${data.class_name} - ${jalaliMonthTitle(data.month_key)}`}
          className="najm-poster-canvas relative mx-auto w-full min-w-[700px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#FBF6E8] via-white to-[#E8F5EC] bg-cover bg-center shadow-xl"
          dir="rtl"
          style={{
            aspectRatio: `${effective.canvasWidth} / ${effective.canvasHeight}`,
            containerType: "inline-size",
            direction: "rtl",
            backgroundImage: backgroundUrl
              ? `url(${backgroundUrl})`
              : undefined,
            backgroundSize: effective.backgroundSize ?? "cover",
            backgroundPosition: effective.backgroundPosition ?? "center",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,.18),transparent_48%)]" />
          <PosterElements data={data} layout={effective} />
        </div>
      </div>
      {leagues.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          برای این کلاس هنوز رده‌ای ساخته نشده است.
        </p>
      )}
    </div>
  );
}
const STUDENT_FILES_BUCKET = "student-files";
const studentPhotoCache = new Map<string, { url: string; expiresAt: number }>();

function studentPhotoPath(value: string): string {
  const marker = `/${STUDENT_FILES_BUCKET}/`;
  if (value.includes(marker)) {
    const encodedPath = value.split(marker)[1]?.split("?")[0] ?? "";
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }
  if (
    /^https?:\/\//i.test(value) ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return "";
  }
  return value.split("?")[0].replace(/^\/+/, "");
}

async function resolveStudentPhoto(value: string | null): Promise<string> {
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  const path = studentPhotoPath(value);
  if (!path) return value;
  const cached = studentPhotoCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage
    .from(STUDENT_FILES_BUCKET)
    .createSignedUrl(path, 60 * 30);
  if (error) return "";
  studentPhotoCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + 25 * 60 * 1000,
  });
  return data.signedUrl;
}

function studentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "ن";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

export function LeagueStudentPhoto({
  posterPhotoUrl,
  avatarUrl,
  name,
  cutout = false,
}: {
  posterPhotoUrl: string | null;
  avatarUrl: string | null;
  name: string;
  cutout?: boolean;
}) {
  const [sources, setSources] = useState<string[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setSources([]);
    setSourceIndex(0);
    void Promise.all([
      resolveStudentPhoto(posterPhotoUrl),
      resolveStudentPhoto(avatarUrl),
    ]).then((resolved) => {
      if (!active) return;
      setSources([...new Set(resolved.filter(Boolean))]);
    });
    return () => {
      active = false;
    };
  }, [posterPhotoUrl, avatarUrl]);

  const source = sources[sourceIndex] ?? "";
  return (
    <div
      className={`flex h-full w-full items-center justify-center text-emerald-900 ${cutout ? "overflow-visible bg-transparent" : "overflow-hidden rounded-full border-4 border-white bg-emerald-100 shadow"}`}
    >
      {source ? (
        <img
          src={source}
          alt={`عکس ${name}`}
          className={`h-full w-full ${cutout ? "object-contain object-bottom" : "object-cover object-center"}`}
          draggable={false}
          onError={() => setSourceIndex((current) => current + 1)}
        />
      ) : (
        <span className="font-display text-[28cqw] font-black">
          {studentInitials(name)}
        </span>
      )}
    </div>
  );
}

function renderLeaguePosterContent(
  data: NajmLeagueWorkspaceData,
  id: string,
): React.ReactNode {
  if (id === "title") return `رده‌های طرح نجم — ${data.class_name}`;
  if (id === "subtitle") return jalaliMonthTitle(data.month_key);
  if (id.startsWith("league:")) {
    const league = data.leagues.find((item) => id === `league:${item.id}`);
    return league ? (
      <span className="flex items-center gap-[0.3em]">
        <LeagueSymbol iconKey={league.icon_key} size="1.15em" />
        <span>{league.title}</span>
      </span>
    ) : (
      ""
    );
  }
  const parts = id.split(":");
  const member = data.leagues
    .flatMap((league) => league.members)
    .find((item) => item.student_id === Number(parts[1]));
  const kind = parts[2];
  if (!member) return "";
  if (kind === "rank") return toFa(member.rank);
  if (kind === "photo")
    return (
      <LeagueStudentPhoto
        posterPhotoUrl={member.poster_avatar_url}
        avatarUrl={member.avatar_url}
        name={member.student_name}
      />
    );
  if (kind === "name") return member.student_name;
  if (kind === "score") return `${toFa(member.monthly_score)} امتیاز`;
  if (kind === "growth")
    return `رشد ${member.growth > 0 ? "+" : ""}${toFa(member.growth)}`;
  return "";
}

function PosterElements({
  data,
  layout,
}: {
  data: NajmLeagueWorkspaceData;
  layout: LeaguePosterLayout;
}) {
  return (
    <>
      {Object.entries(layout.elements).map(([id, element]) => (
        <div
          key={id}
          style={style(element, layout)}
          className="font-bold"
          dir="rtl"
          data-poster-element={id}
        >
          {layout.labels?.[id] ?? renderLeaguePosterContent(data, id)}
        </div>
      ))}
    </>
  );
}

function normalizeGlobalLayout(
  data: NajmLeagueWorkspaceData,
  layout: LeaguePosterLayout,
): LeaguePosterLayout {
  const elements: Record<string, LeaguePosterElement> = {};
  const labels: Record<string, string> = {};
  const leagues = data.leagues.filter((league) => !league.archived_at);
  for (const [id, element] of Object.entries(layout.elements)) {
    let slot = id;
    const leagueIndex = leagues.findIndex(
      (league) =>
        id === `league:${league.id}` ||
        league.members.some((member) =>
          id.startsWith(`member:${member.student_id}:`),
        ),
    );
    if (id.startsWith("league:") && leagueIndex >= 0)
      slot = `league-slot:${leagueIndex}`;
    if (id.startsWith("member:") && leagueIndex >= 0) {
      const memberIndex = leagues[leagueIndex].members.findIndex((member) =>
        id.startsWith(`member:${member.student_id}:`),
      );
      slot = `member-slot:${leagueIndex}:${memberIndex}:${id.split(":")[2]}`;
    }
    elements[slot] = element;
    if (layout.labels?.[id] !== undefined) labels[slot] = layout.labels[id];
  }
  return { ...layout, elements, labels };
}

function mergeLayout(
  data: NajmLeagueWorkspaceData,
  fallback: LeaguePosterLayout,
  saved: LeaguePosterLayout | null | undefined,
): LeaguePosterLayout {
  if (!saved?.elements) return fallback;
  const elements = { ...fallback.elements };
  const labels = { ...saved.labels };
  const leagues = data.leagues.filter((league) => !league.archived_at);
  for (const id of Object.keys(elements)) {
    let sourceId = id;
    const leagueIndex = leagues.findIndex(
      (league) =>
        id === `league:${league.id}` ||
        league.members.some((member) =>
          id.startsWith(`member:${member.student_id}:`),
        ),
    );
    if (id.startsWith("league:") && leagueIndex >= 0)
      sourceId = `league-slot:${leagueIndex}`;
    if (id.startsWith("member:") && leagueIndex >= 0) {
      const memberIndex = leagues[leagueIndex].members.findIndex((member) =>
        id.startsWith(`member:${member.student_id}:`),
      );
      sourceId = `member-slot:${leagueIndex}:${memberIndex}:${id.split(":")[2]}`;
    }
    elements[id] =
      saved.elements[id] ?? saved.elements[sourceId] ?? elements[id];
    if (
      saved.labels?.[sourceId] !== undefined &&
      saved.labels?.[id] === undefined
    )
      labels[id] = saved.labels[sourceId];
  }
  return {
    ...fallback,
    canvasWidth: saved.canvasWidth ?? fallback.canvasWidth,
    canvasHeight: saved.canvasHeight ?? fallback.canvasHeight,
    printWidthMm: saved.printWidthMm ?? fallback.printWidthMm,
    printHeightMm: saved.printHeightMm ?? fallback.printHeightMm,
    backgroundSize: saved.backgroundSize ?? fallback.backgroundSize,
    backgroundPosition: saved.backgroundPosition ?? fallback.backgroundPosition,
    elements,
    labels,
  };
}

export function AdminLeaguePosterPanel({
  classId,
  monthKey,
  term,
  academicYear,
}: {
  classId: number;
  monthKey: string;
  term: NajmTerm;
  academicYear: string;
}) {
  const [data, setData] = useState<NajmLeagueWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [editor, setEditor] = useState(false);
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [background, setBackground] = useState("");
  const [uploadScope, setUploadScope] = useState<"class" | "global">("class");
  async function load() {
    setLoading(true);
    const r = await getNajmLeagueWorkspace(classId, monthKey, {
      term,
      academicYear,
    });
    setLoading(false);
    if (r.error || !r.data) {
      toast.error(r.error ?? "خطا");
      setData(null);
      return;
    }
    setData(r.data);
    if (r.data.poster_setting?.background_path) {
      const url = await resolvePrivateStorageUrl(
        "najm-posters",
        r.data.poster_setting.background_path,
      );
      setBackground(url || "");
    } else setBackground("");
  }
  useEffect(() => {
    void load();
  }, [classId, monthKey, term, academicYear]);
  if (loading)
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!data) return null;
  // Capture the narrowed workspace for async callbacks; state itself remains nullable.
  const workspace = data;
  const limit = workspace.poster_setting?.display_limit ?? null;
  const layout = mergeLayout(
    workspace,
    createLeaguePosterLayout(workspace, limit),
    workspace.poster_setting?.layout,
  );
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      return toast.error("فرمت تصویر معتبر نیست");
    const ext = file.name.split(".").pop() || "png";
    const path = `league-results/${workspace.academic_year}/${workspace.term}/${classId}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("najm-posters").upload(path, file);
    if (up.error) return toast.error(up.error.message);
    const r = await saveNajmLeaguePosterSetting({
      term: workspace.term,
      academicYear: workspace.academic_year,
      classId: uploadScope === "class" ? classId : null,
      backgroundPath: path,
      layout:
        uploadScope === "global"
          ? normalizeGlobalLayout(workspace, layout)
          : layout,
      displayLimit: limit,
    });
    if (r.error) return toast.error(r.error);
    toast.success(
      uploadScope === "global"
        ? "پس‌زمینه عمومی ذخیره شد"
        : "پس‌زمینه اختصاصی کلاس ذخیره شد",
    );
    void load();
  }
  async function finalizeMonth() {
    if (!confirm(`ماه ${monthKey} نهایی و غیرقابل‌تغییر شود؟`)) return;
    setFinalizing(true);
    const result = await finalizeNajmLeagueMonth(monthKey);
    setFinalizing(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success(`${toFa(result.data ?? 0)} رده نهایی شد`);
      void load();
    }
  }
  return (
    <div className="space-y-5">
      {data.month_finalized ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          این ماه نهایی شده و جدول آن فقط‌خواندنی است.
        </div>
      ) : (
        <LeagueManager data={data} onChanged={() => void load()} />
      )}
      {data.leagues.filter((l) => !l.archived_at).length === 0 ? (
        <div className="rounded-3xl border border-dashed p-10 text-center">
          <Settings2 className="mx-auto h-10 w-10 text-amber-500" />
          <h3 className="mt-3 font-display text-xl font-black">
            ابتدا رده‌های این کلاس را بسازید
          </h3>
          <div className="mt-4 flex justify-center">
            <LeagueMembershipHistoryButton data={data} />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Select
              value={uploadScope}
              onValueChange={(value) =>
                setUploadScope(value as "class" | "global")
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">پس‌زمینه همین کلاس</SelectItem>
                <SelectItem value="global">پس‌زمینه عمومی</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => input?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              بارگذاری پس‌زمینه
            </Button>
            {!data.month_finalized && monthKey < currentJalaliMonthKey() && (
              <Button
                variant="outline"
                className="gap-2"
                disabled={finalizing}
                onClick={() => void finalizeMonth()}
              >
                {finalizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                نهایی‌سازی دستی ماه
              </Button>
            )}
            <input
              ref={setInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </div>
          <LeagueClassPoster
            data={data}
            layout={layout}
            backgroundUrl={background}
            limit={limit}
            editable
            onEdit={() => setEditor(true)}
          />
          <LeaguePosterEditor
            open={editor}
            onClose={() => setEditor(false)}
            data={data}
            initial={layout}
            backgroundUrl={background}
            initialLimit={limit}
            onSaved={() => {
              setEditor(false);
              void load();
            }}
          />
        </>
      )}
    </div>
  );
}

function advancedElementLabel(
  data: NajmLeagueWorkspaceData,
  id: string,
): string {
  if (id === "title") return "عنوان اصلی پوستر";
  if (id === "subtitle") return "عنوان ماه";
  if (id.startsWith("league:")) {
    const league = data.leagues.find((item) => id === `league:${item.id}`);
    return `عنوان رده ${league?.title ?? ""}`.trim();
  }
  const kind = id.split(":")[2];
  return (
    (
      {
        rank: "رتبه عضو",
        photo: "عکس عضو",
        name: "نام عضو",
        score: "امتیاز عضو",
        growth: "رشد عضو",
      } as Record<string, string>
    )[kind] ?? id
  );
}

function toAdvancedLayout(
  data: NajmLeagueWorkspaceData,
  layout: LeaguePosterLayout,
): AdvancedPosterLayout {
  return {
    version: layout.version,
    canvasWidth: layout.canvasWidth,
    canvasHeight: layout.canvasHeight,
    printWidthMm: layout.printWidthMm ?? 160,
    printHeightMm: layout.printHeightMm ?? 110,
    backgroundSize: layout.backgroundSize,
    backgroundPosition: layout.backgroundPosition,
    elements: Object.fromEntries(
      Object.entries(layout.elements).map(([id, element]) => [
        id,
        {
          label: advancedElementLabel(data, id),
          content: layout.labels?.[id],
          kind: id.endsWith(":photo") ? "photo" : "text",
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          fontSize: element.fontSize,
          fontWeight: element.fontWeight,
          fontFamily: element.fontFamily,
          lineHeight: element.lineHeight,
          rotation: element.rotation ?? 0,
          color: element.color,
          backgroundColor: element.backgroundColor,
          opacity: element.opacity,
          borderRadius: element.borderRadius,
          align: element.align,
          zIndex: element.zIndex ?? 5,
          locked: element.locked ?? false,
          hidden: element.hidden ?? false,
        },
      ]),
    ),
  };
}

function fromAdvancedLayout(layout: AdvancedPosterLayout): LeaguePosterLayout {
  const labels: Record<string, string> = {};
  const elements: Record<string, LeaguePosterElement> = {};
  for (const [id, element] of Object.entries(layout.elements)) {
    if (element.content !== undefined) labels[id] = element.content;
    elements[id] = {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      fontSize: element.fontSize,
      fontWeight: element.fontWeight,
      fontFamily: element.fontFamily,
      lineHeight: element.lineHeight,
      rotation: element.rotation,
      color: element.color,
      backgroundColor: element.backgroundColor,
      opacity: element.opacity,
      borderRadius: element.borderRadius,
      align: element.align,
      zIndex: element.zIndex,
      locked: element.locked,
      hidden: element.hidden,
    };
  }
  return {
    version: layout.version,
    canvasWidth: layout.canvasWidth,
    canvasHeight: layout.canvasHeight,
    printWidthMm: layout.printWidthMm,
    printHeightMm: layout.printHeightMm,
    backgroundSize: layout.backgroundSize,
    backgroundPosition: layout.backgroundPosition,
    elements,
    labels,
  };
}

function LeaguePosterEditor({
  open,
  onClose,
  data,
  initial,
  backgroundUrl,
  initialLimit,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  data: NajmLeagueWorkspaceData;
  initial: LeaguePosterLayout;
  backgroundUrl: string;
  initialLimit: number | null;
  onSaved: () => void;
}) {
  const [layout, setLayout] = useState(initial);
  const [limit, setLimit] = useState(initialLimit?.toString() ?? "all");
  const [target, setTarget] = useState<"class" | "global">("class");
  useEffect(() => {
    if (open) {
      setLayout(initial);
      setLimit(initialLimit?.toString() ?? "all");
      setTarget("class");
    }
  }, [open, initial, initialLimit]);

  const advancedLayout = useMemo(
    () => toAdvancedLayout(data, layout),
    [data, layout],
  );
  const defaultAdvancedLayout = useMemo(
    () =>
      toAdvancedLayout(
        data,
        createLeaguePosterLayout(data, limit === "all" ? null : Number(limit)),
      ),
    [data, limit],
  );

  const sidebar = (
    <div className="mb-4 space-y-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3">
      <div>
        <Label>محل ذخیره تنظیمات</Label>
        <Select
          value={target}
          onValueChange={(value) => setTarget(value as "class" | "global")}
        >
          <SelectTrigger className="mt-1 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="class">Override همین کلاس</SelectItem>
            <SelectItem value="global">قالب عمومی همه کلاس‌ها</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>تعداد نفرات هر رده در پوستر</Label>
        <Select
          value={limit}
          onValueChange={(value) => {
            setLimit(value);
            setLayout(
              createLeaguePosterLayout(
                data,
                value === "all" ? null : Number(value),
              ),
            );
          }}
        >
          <SelectTrigger className="mt-1 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه اعضا</SelectItem>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((number) => (
              <SelectItem key={number} value={String(number)}>
                {toFa(number)} نفر
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <AdvancedPosterLayoutEditor
      open={open}
      title={`پوستر رده‌های ${data.class_name}`}
      layout={advancedLayout}
      defaultLayout={defaultAdvancedLayout}
      backgroundUrl={backgroundUrl}
      canvasClassName="najm-layout-canvas-class"
      sidebarBefore={sidebar}
      allowTextContent
      allowCanvasResize
      renderContent={(id, element) =>
        element.kind === "text" && element.content !== undefined
          ? element.content
          : renderLeaguePosterContent(data, id)
      }
      onClose={onClose}
      onSave={async (advanced) => {
        const next = fromAdvancedLayout(advanced);
        const result = await saveNajmLeaguePosterSetting({
          term: data.term,
          academicYear: data.academic_year,
          classId: target === "class" ? data.class_id : null,
          backgroundPath: null,
          layout:
            target === "global" ? normalizeGlobalLayout(data, next) : next,
          displayLimit: limit === "all" ? null : Number(limit),
        });
        if (result.error) throw new Error(result.error);
        toast.success(
          target === "global"
            ? "قالب عمومی رده‌ها ذخیره شد"
            : "چیدمان اختصاصی کلاس ذخیره شد",
        );
        onSaved();
      }}
    />
  );
}
