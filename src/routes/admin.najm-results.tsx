import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarCheck,
  Crown,
  Download,
  Eye,
  FileImage,
  FileText,
  Filter,
  GraduationCap,
  LayoutTemplate,
  Loader2,
  Medal,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Users,
  Upload,
  Image,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { computeAdjustedTotals, type NajmTerm } from "@/lib/najm";
import { supabase } from "@/lib/supabase";
import { resolvePrivateStorageUrl } from "@/features/storage/private-storage-url";
import { ConductRecoveryHistoryDialog } from "@/features/recitation/components/conduct-recovery-history-dialog";
import { AdminLeaguePosterPanel } from "@/features/najm-leagues/components/league-class-poster";
import { AdvancedPosterLayoutEditor, type AdvancedPosterLayout } from "@/components/posters/advanced-poster-layout-editor";

export const Route = createFileRoute("/admin/najm-results")({
  head: () => ({
    meta: [
      { title: "نتایج طرح نجم — مدیریت" },
      {
        name: "description",
        content: "نتایج، رتبه‌بندی و تحلیل خواندنی طرح نجم",
      },
    ],
  }),
  component: AdminNajmResults,
});

type PosterLayoutType = "overall" | "class";
type PosterElementKind = "text" | "photo";
type PosterTextAlign = "right" | "center" | "left";

type PosterLayoutElement = {
  label: string;
  kind: PosterElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  lineHeight?: number;
  rotation: number;
  color?: string;
  align?: PosterTextAlign;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
};

type NajmPosterLayout = {
  version: number;
  canvasWidth: number;
  canvasHeight: number;
  printWidthMm: number;
  printHeightMm: number;
  elements: Record<string, PosterLayoutElement>;
};

type PosterRenderItem = {
  id: string;
  kind: PosterElementKind;
  content?: string;
  photoUrl?: string | null;
  photoName?: string;
  isCutout?: boolean;
  student?: StudentResult;
  className?: string;
};

type TermRow = {
  id: string;
  title: string;
  term: string;
  academic_year: string;
  is_active: boolean;
  absence_score_ratio: number;
  overall_results_poster_path: string | null;
  class_results_poster_path: string | null;
  overall_results_layout: NajmPosterLayout | null;
  class_results_layout: NajmPosterLayout | null;
};
type ClassRow = {
  id: number;
  name: string;
  level: string | null;
  teacher_id: number | null;
};
type TeacherRow = { id: number; name: string };
type StudentRow = {
  id: number;
  name: string;
  level: string | null;
  class_id: number | null;
  avatar_url: string | null;
  poster_avatar_url: string | null;
};
type SessionRow = {
  id: string;
  teacher_id: string | null;
  class_id: string;
  class_name: string | null;
  session_date: string;
  term: string;
  academic_year: string;
  created_at: string;
  is_applied: boolean | null;
};
type RecordRow = {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string | null;
  is_absent: boolean | null;
  attendance: number;
  homework: number;
  exam_raw: number;
  discipline: number;
  special_progress: number;
  special_help: number;
  negative_disorder: number;
  negative_disrespect: number;
  recovery_bonus: number;
  session_score: number;
};
type StudentResult = {
  studentId: string;
  name: string;
  classId: string;
  className: string;
  level: string | null;
  photoUrl: string | null;
  posterPhotoUrl: string | null;
  total: number;
  average: number;
  performance: number;
  sessions: number;
  present: number;
  absent: number;
  attendanceRate: number;
  records: RecordRow[];
};

type ClassResult = {
  classId: string;
  className: string;
  level: string | null;
  teacherName: string;
  sessions: number;
  records: number;
  students: StudentResult[];
  total: number;
  average: number;
};

type PosterExportFormat = "png" | "jpeg" | "pdf";
type PosterExportProgress = {
  current: number;
  total: number;
  label: string;
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const STUDENT_FILES_BUCKET = "student-files";
const NAJM_POSTERS_BUCKET = "najm-posters";
const DEFAULT_OVERALL_POSTER = "/najm-posters/poster-overall.png";
const DEFAULT_CLASS_POSTER = "/najm-posters/poster-class.png";


function textLayoutElement(
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  options: Partial<PosterLayoutElement> = {},
): PosterLayoutElement {
  return {
    label,
    kind: "text",
    x,
    y,
    width,
    height,
    fontSize,
    fontWeight: 800,
    lineHeight: 1.25,
    rotation: 0,
    color: "#f8fafc",
    align: "center",
    zIndex: 5,
    locked: false,
    hidden: false,
    ...options,
  };
}

function photoLayoutElement(
  label: string,
  x: number,
  y: number,
  size: number,
  options: Partial<PosterLayoutElement> = {},
): PosterLayoutElement {
  return {
    label,
    kind: "photo",
    x,
    y,
    width: size,
    height: size,
    rotation: 0,
    zIndex: 4,
    locked: false,
    hidden: false,
    ...options,
  };
}

function createDefaultOverallLayout(): NajmPosterLayout {
  const elements: Record<string, PosterLayoutElement> = {
    "header-title": textLayoutElement("عنوان اصلی", 240, 145, 1520, 105, 84, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "header-subtitle": textLayoutElement("نام ترم و سال تحصیلی", 300, 260, 1400, 65, 40, {
      color: "#dbeafe",
      fontWeight: 600,
    }),
    "top-1-photo": photoLayoutElement("عکس نفر اول", 863, 435, 275),
    "top-1-name": textLayoutElement("نام نفر اول", 690, 735, 620, 64, 49, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-1-class": textLayoutElement("کلاس نفر اول", 690, 825, 620, 48, 27, {
      color: "#e8f3ff",
    }),
    "top-1-score": textLayoutElement("امتیاز نفر اول", 690, 900, 620, 50, 29, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
    "top-2-photo": photoLayoutElement("عکس نفر دوم", 291, 579, 238),
    "top-2-name": textLayoutElement("نام نفر دوم", 135, 846, 550, 58, 43, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-2-class": textLayoutElement("کلاس نفر دوم", 135, 925, 550, 44, 27, {
      color: "#e8f3ff",
    }),
    "top-2-score": textLayoutElement("امتیاز نفر دوم", 135, 995, 550, 48, 29, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
    "top-3-photo": photoLayoutElement("عکس نفر سوم", 1471, 579, 238),
    "top-3-name": textLayoutElement("نام نفر سوم", 1315, 846, 550, 58, 43, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-3-class": textLayoutElement("کلاس نفر سوم", 1315, 925, 550, 44, 27, {
      color: "#e8f3ff",
    }),
    "top-3-score": textLayoutElement("امتیاز نفر سوم", 1315, 995, 550, 48, 29, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
  };

  const rowTops = [1260, 1478, 1695, 1913, 2130, 2348, 2565];
  rowTops.forEach((y, index) => {
    const rank = index + 4;
    const prefix = `row-${rank}`;
    elements[`${prefix}-rank`] = textLayoutElement(`رتبه ${rank}`, 1688, y, 172, 188, 27, {
      color: "#f8d56a",
      fontWeight: 900,
    });
    elements[`${prefix}-photo`] = photoLayoutElement(`عکس رتبه ${rank}`, 1494, y + 29, 130);
    elements[`${prefix}-name`] = textLayoutElement(`نام رتبه ${rank}`, 828, y, 602, 188, 36, {
      color: "#fff0ad",
      align: "right",
      fontWeight: 900,
    });
    elements[`${prefix}-class`] = textLayoutElement(`کلاس رتبه ${rank}`, 432, y, 396, 188, 28, {
      color: "#f3f8ff",
    });
    elements[`${prefix}-score`] = textLayoutElement(`امتیاز رتبه ${rank}`, 140, y, 292, 188, 28, {
      color: "#ffe38a",
      fontWeight: 900,
    });
  });

  return {
    version: 1,
    canvasWidth: 2000,
    canvasHeight: 3000,
    printWidthMm: 200,
    printHeightMm: 300,
    elements,
  };
}

function createDefaultClassLayout(): NajmPosterLayout {
  const elements: Record<string, PosterLayoutElement> = {
    "header-title": textLayoutElement("عنوان کلاس", 200, 65, 1200, 58, 42, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "header-subtitle": textLayoutElement("استاد، رتبه و میانگین", 250, 126, 1100, 38, 20, {
      color: "#dbeafe",
      fontWeight: 600,
    }),
    "top-1-photo": photoLayoutElement("عکس نفر اول", 690, 205, 220),
    "top-1-name": textLayoutElement("نام نفر اول", 576, 484, 448, 38, 39, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-1-class": textLayoutElement("کلاس نفر اول", 576, 536, 448, 30, 22, {
      color: "#e8f3ff",
    }),
    "top-1-score": textLayoutElement("امتیاز نفر اول", 576, 585, 448, 32, 23, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
    "top-2-photo": photoLayoutElement("عکس نفر دوم", 337, 264, 190),
    "top-2-name": textLayoutElement("نام نفر دوم", 232, 517, 400, 34, 34, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-2-class": textLayoutElement("کلاس نفر دوم", 232, 564, 400, 28, 22, {
      color: "#e8f3ff",
    }),
    "top-2-score": textLayoutElement("امتیاز نفر دوم", 232, 611, 400, 30, 23, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
    "top-3-photo": photoLayoutElement("عکس نفر سوم", 1073, 264, 190),
    "top-3-name": textLayoutElement("نام نفر سوم", 968, 517, 400, 34, 34, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-3-class": textLayoutElement("کلاس نفر سوم", 968, 564, 400, 28, 22, {
      color: "#e8f3ff",
    }),
    "top-3-score": textLayoutElement("امتیاز نفر سوم", 968, 611, 400, 30, 23, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
  };

  [748, 902].forEach((y, index) => {
    const rank = index + 4;
    const prefix = `row-${rank}`;
    elements[`${prefix}-rank`] = textLayoutElement(`رتبه ${rank}`, 1262, y, 146, 127, 22, {
      color: "#f8d56a",
      fontWeight: 900,
    });
    elements[`${prefix}-photo`] = photoLayoutElement(`عکس رتبه ${rank}`, 1125, y + 12, 104);
    elements[`${prefix}-name`] = textLayoutElement(`نام رتبه ${rank}`, 678, y, 414, 127, 29, {
      color: "#fff0ad",
      align: "right",
      fontWeight: 900,
    });
    elements[`${prefix}-class`] = textLayoutElement(`کلاس رتبه ${rank}`, 399, y, 279, 127, 23, {
      color: "#f3f8ff",
    });
    elements[`${prefix}-score`] = textLayoutElement(`امتیاز رتبه ${rank}`, 192, y, 207, 127, 23, {
      color: "#ffe38a",
      fontWeight: 900,
    });
  });

  return {
    version: 1,
    canvasWidth: 1600,
    canvasHeight: 1100,
    printWidthMm: 160,
    printHeightMm: 110,
    elements,
  };
}

const DEFAULT_OVERALL_LAYOUT = createDefaultOverallLayout();
const DEFAULT_CLASS_LAYOUT = createDefaultClassLayout();

function clonePosterLayout(layout: NajmPosterLayout): NajmPosterLayout {
  return JSON.parse(JSON.stringify(layout)) as NajmPosterLayout;
}

function resolvePosterLayout(
  saved: NajmPosterLayout | null | undefined,
  fallback: NajmPosterLayout,
): NajmPosterLayout {
  if (
    !saved ||
    saved.canvasWidth !== fallback.canvasWidth ||
    saved.canvasHeight !== fallback.canvasHeight ||
    typeof saved.elements !== "object"
  ) {
    return clonePosterLayout(fallback);
  }
  const elements: Record<string, PosterLayoutElement> = {};
  for (const [id, defaultElement] of Object.entries(fallback.elements)) {
    elements[id] = { ...defaultElement, ...(saved.elements[id] ?? {}) };
  }
  return {
    ...fallback,
    ...saved,
    version: 1,
    canvasWidth: fallback.canvasWidth,
    canvasHeight: fallback.canvasHeight,
    elements,
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ن";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

function studentPhotoPath(value?: string | null): string {
  if (!value) return "";
  const marker = `/${STUDENT_FILES_BUCKET}/`;
  if (value.includes(marker)) {
    try {
      return decodeURIComponent(value.split(marker)[1].split("?")[0]);
    } catch {
      return value.split(marker)[1].split("?")[0];
    }
  }
  if (/^https?:\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return "";
  }
  return value.split("?")[0].replace(/^\/+/, "");
}

async function resolveStudentPhoto(value?: string | null): Promise<string> {
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  const path = studentPhotoPath(value);
  if (!path) return value;
  const { data, error } = await supabase.storage
    .from(STUDENT_FILES_BUCKET)
    .createSignedUrl(path, 60 * 30);
  if (error) return "";
  return data.signedUrl;
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("تصویر قابل خواندن نیست"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function safeFilePart(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "najm-results"
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function waitForPosterAssets(node: HTMLElement): Promise<void> {
  if (document.fonts?.ready) await document.fonts.ready;
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            void image
              .decode?.()
              .catch(() => undefined)
              .finally(resolve);
            return;
          }
          const finish = () => {
            image.removeEventListener("load", finish);
            image.removeEventListener("error", finish);
            resolve();
          };
          image.addEventListener("load", finish, { once: true });
          image.addEventListener("error", finish, { once: true });
          window.setTimeout(finish, 8000);
        }),
    ),
  );
}

function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}
function fixed(value: number, digits = 1): string {
  return toFa(value.toFixed(digits));
}
function numberValue(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}
function termLabel(value: string): string {
  return { term1: "ترم اول", term2: "ترم دوم", summer: "تابستان" }[value] ?? value;
}

function posterTermLine(termTitle: string, academicYear: string): string {
  const title = termTitle.trim();
  const year = academicYear.trim();
  if (!year) return title;
  const persianYear = toFa(year);
  const titleAlreadyHasYear = /[0-9۰-۹]{4}/.test(title);
  return titleAlreadyHasYear || title.includes(year) || title.includes(persianYear)
    ? title
    : `${title} • ${persianYear}`;
}

type ResultScope = "monthly" | "term" | "annual";

type MonthlySnapshotStudent = {
  studentId: string;
  name: string;
  classId: string;
  className: string;
  level: string | null;
  photoUrl: string | null;
  posterPhotoUrl: string | null;
  total: number;
  average: number;
  performance: number;
  sessions: number;
  present: number;
  absent: number;
  attendanceRate: number;
};

type MonthlySnapshot = {
  id: string;
  month_key: string;
  jalali_year: number;
  jalali_month: number;
  title: string;
  academic_year: string | null;
  results: MonthlySnapshotStudent[];
  source_session_count: number;
  finalization_mode: "automatic" | "manual";
  finalized_at: string;
};

const JALALI_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

function jalaliMonthParts(value: string | Date | null | undefined): {
  year: number;
  month: number;
  key: string;
} {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { year: 0, month: 0, key: "" };
    try {
      const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
        year: "numeric",
        month: "2-digit",
        timeZone: "Asia/Tehran",
      }).formatToParts(value);
      const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
      const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
      return year > 0 && month >= 1 && month <= 12
        ? { year, month, key: `${year}-${String(month).padStart(2, "0")}` }
        : { year: 0, month: 0, key: "" };
    } catch {
      return { year: 0, month: 0, key: "" };
    }
  }

  const raw = String(value ?? "")
    .trim()
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (!raw) return { year: 0, month: 0, key: "" };

  // اگر تاریخ از قبل شمسی ذخیره شده باشد، مستقیماً سال و ماه آن را می‌خوانیم.
  const directParts = raw.match(/^(1[34]\d{2})[/-](\d{1,2})(?:[/-]\d{1,2})?/);
  if (directParts) {
    const year = Number(directParts[1]);
    const month = Number(directParts[2]);
    if (month >= 1 && month <= 12) {
      return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
    }
  }

  let date: Date;
  if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(raw)) {
    date = new Date(`${raw.replaceAll("/", "-")}T12:00:00`);
  } else {
    date = new Date(raw);
    if (Number.isNaN(date.getTime()) && raw.includes(" ")) {
      date = new Date(raw.replace(" ", "T"));
    }
  }
  if (Number.isNaN(date.getTime())) return { year: 0, month: 0, key: "" };

  try {
    const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
      year: "numeric",
      month: "2-digit",
      timeZone: "Asia/Tehran",
    }).formatToParts(date);
    const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
    const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
    return year > 0 && month >= 1 && month <= 12
      ? { year, month, key: `${year}-${String(month).padStart(2, "0")}` }
      : { year: 0, month: 0, key: "" };
  } catch {
    return { year: 0, month: 0, key: "" };
  }
}

function jalaliMonthTitle(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || month < 1 || month > 12) return "ماه نامشخص";
  return `${JALALI_MONTH_NAMES[month - 1]} ${toFa(year)}`;
}

function computeScopeStudentResults(input: {
  sessions: SessionRow[];
  records: RecordRow[];
  students: StudentRow[];
  classes: ClassRow[];
  terms: TermRow[];
  search?: string;
}): StudentResult[] {
  const sessionMap = new Map(input.sessions.map((session) => [session.id, session]));
  const studentMap = new Map(input.students.map((student) => [String(student.id), student]));
  const classMap = new Map(input.classes.map((item) => [String(item.id), item]));
  const ratioMap = new Map(
    input.terms.map((term) => [
      `${term.academic_year}|${term.term}`,
      numberValue(term.absence_score_ratio || 0.6),
    ]),
  );
  const recordsByStudent = new Map<string, RecordRow[]>();
  const presentScoresByGroup = new Map<string, number[]>();

  for (const record of input.records) {
    const session = sessionMap.get(record.session_id);
    if (!session) continue;
    const list = recordsByStudent.get(record.student_id) ?? [];
    list.push(record);
    recordsByStudent.set(record.student_id, list);
    const groupKey = `${session.academic_year}|${session.term}|${session.class_id}`;
    const absent = record.is_absent === true || numberValue(record.attendance) === 0;
    if (!absent) {
      const scores = presentScoresByGroup.get(groupKey) ?? [];
      scores.push(numberValue(record.session_score));
      presentScoresByGroup.set(groupKey, scores);
    }
  }

  const classAverages = new Map<string, number>();
  for (const [key, scores] of presentScoresByGroup) {
    classAverages.set(
      key,
      scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
    );
  }

  const query = input.search?.trim().toLowerCase() ?? "";
  return [...recordsByStudent.entries()]
    .map(([studentId, studentRecords]) => {
      const profile = studentMap.get(studentId);
      const firstSession = sessionMap.get(studentRecords[0]?.session_id ?? "");
      const displayClassId = String(profile?.class_id ?? firstSession?.class_id ?? "");
      const classItem = classMap.get(displayClassId);
      const grouped = new Map<string, RecordRow[]>();
      for (const record of studentRecords) {
        const session = sessionMap.get(record.session_id);
        if (!session) continue;
        const key = `${session.academic_year}|${session.term}|${session.class_id}`;
        const list = grouped.get(key) ?? [];
        list.push(record);
        grouped.set(key, list);
      }

      let total = 0;
      let absent = 0;
      for (const [groupKey, groupRecords] of grouped) {
        const [academicYear, term] = groupKey.split("|");
        const adjusted = computeAdjustedTotals(
          groupRecords.map((record) => ({
            attendance: numberValue(record.attendance),
            session_score: numberValue(record.session_score),
          })),
          ratioMap.get(`${academicYear}|${term}`) ?? 0.6,
          classAverages.get(groupKey) ?? 0,
        );
        total += adjusted.total;
        absent += adjusted.absentCount;
      }

      const present = studentRecords.filter(
        (record) => !(record.is_absent === true || numberValue(record.attendance) === 0),
      ).length;
      const average = studentRecords.length ? total / studentRecords.length : 0;
      return {
        studentId,
        name: studentRecords[0]?.student_name ?? profile?.name ?? "قرآن‌آموز",
        classId: displayClassId,
        className: classItem?.name ?? firstSession?.class_name ?? "بدون کلاس",
        level: profile?.level ?? classItem?.level ?? null,
        photoUrl: profile?.avatar_url ?? null,
        posterPhotoUrl: profile?.poster_avatar_url ?? null,
        total,
        average,
        performance: (average / 30) * 100,
        sessions: studentRecords.length,
        present,
        absent,
        attendanceRate: studentRecords.length
          ? Math.round((present / studentRecords.length) * 100)
          : 0,
        records: [...studentRecords].sort((a, b) =>
          String(sessionMap.get(b.session_id)?.session_date ?? "").localeCompare(
            String(sessionMap.get(a.session_id)?.session_date ?? ""),
          ),
        ),
      };
    })
    .filter(
      (result) =>
        !query ||
        result.name.toLowerCase().includes(query) ||
        result.className.toLowerCase().includes(query),
    )
    .sort(
      (a, b) => b.total - a.total || b.average - a.average || a.name.localeCompare(b.name, "fa"),
    );
}

function AdminNajmResults() {
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [termId, setTermId] = useState("");
  const [resultScope, setResultScope] = useState<ResultScope>("monthly");
  const [monthKey, setMonthKey] = useState(() => jalaliMonthParts(new Date()).key);
  const [monthlySnapshots, setMonthlySnapshots] = useState<MonthlySnapshot[]>([]);
  const [classFilter, setClassFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [posterUploading, setPosterUploading] = useState<"overall" | "class" | null>(null);
  const [posterUrls, setPosterUrls] = useState({
    overall: DEFAULT_OVERALL_POSTER,
    class: DEFAULT_CLASS_POSTER,
  });
  const [exportingFormat, setExportingFormat] = useState<PosterExportFormat | null>(null);
  const [exportProgress, setExportProgress] = useState<PosterExportProgress | null>(null);
  const [layoutEditorType, setLayoutEditorType] = useState<PosterLayoutType | null>(null);
  const overallPosterInputRef = useRef<HTMLInputElement>(null);
  const classPosterInputRef = useRef<HTMLInputElement>(null);
  const monthlyArchiveRunningRef = useRef(false);

  async function load(showToast = false) {
    if (showToast) setRefreshing(true);
    else setLoading(true);
    try {
      const [termResult, classResult, teacherResult, studentResult, sessionResult, monthlyResult] =
        await Promise.all([
          supabase
            .from("najm_terms")
            .select(
              "id, title, term, academic_year, is_active, absence_score_ratio, overall_results_poster_path, class_results_poster_path, overall_results_layout, class_results_layout",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("classes")
            .select("id, name, level, teacher_id")
            .is("deleted_at", null)
            .order("name"),
          supabase.from("teachers").select("id, name").order("name"),
          supabase
            .from("students")
            .select("id, name, level, class_id, avatar_url, poster_avatar_url")
            .eq("status", "active")
            .order("name"),
          supabase
            .from("najm_sessions")
            .select(
              "id, teacher_id, class_id, class_name, session_date, term, academic_year, created_at, is_applied",
            )
            .eq("is_applied", true)
            .order("created_at", { ascending: false })
            .limit(5000),
          supabase.rpc("get_najm_monthly_snapshots"),
        ]);

      const termRows = (termResult.data ?? []) as TermRow[];
      setTerms(termRows);
      if (!termId) {
        const initial = termRows.find((term) => term.is_active) ?? termRows[0];
        if (initial) setTermId(initial.id);
      }
      setClasses(
        (classResult.data ?? []).map((item) => ({
          id: Number(item.id),
          name: String(item.name ?? "بدون نام"),
          level: item.level == null ? null : String(item.level),
          teacher_id: item.teacher_id == null ? null : Number(item.teacher_id),
        })),
      );
      setTeachers(
        (teacherResult.data ?? []).map((item) => ({
          id: Number(item.id),
          name: String(item.name ?? "بدون نام"),
        })),
      );
      setStudents(
        (studentResult.data ?? []).map((item) => ({
          id: Number(item.id),
          name: String(item.name ?? "بدون نام"),
          level: item.level == null ? null : String(item.level),
          class_id: item.class_id == null ? null : Number(item.class_id),
          avatar_url: item.avatar_url == null ? null : String(item.avatar_url),
          poster_avatar_url: item.poster_avatar_url == null ? null : String(item.poster_avatar_url),
        })),
      );
      const sessionRows = (sessionResult.data ?? []) as SessionRow[];
      setSessions(sessionRows);
      if (!monthlyResult.error) {
        setMonthlySnapshots((monthlyResult.data ?? []) as MonthlySnapshot[]);
      }

      const sessionIds = sessionRows.map((session) => session.id);
      if (sessionIds.length) {
        const { data: recordRows, error } = await supabase
          .from("najm_session_records")
          .select(
            "id, session_id, student_id, student_name, is_absent, attendance, homework, exam_raw, discipline, special_progress, special_help, negative_disorder, negative_disrespect, recovery_bonus, session_score",
          )
          .in("session_id", sessionIds)
          .limit(30000);
        if (error) throw error;
        setRecords((recordRows ?? []) as RecordRow[]);
      } else {
        setRecords([]);
      }
      if (showToast) toast.success("نتایج طرح نجم به‌روز شد");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "خطا در دریافت نتایج نجم");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (loading || monthlyArchiveRunningRef.current || !sessions.length || !records.length) return;
    const currentKey = jalaliMonthParts(new Date()).key;
    const existingKeys = new Set(monthlySnapshots.map((snapshot) => snapshot.month_key));
    const closedKeys = [
      ...new Set(sessions.map((session) => jalaliMonthParts(session.session_date).key)),
    ]
      .filter((key) => Boolean(key) && key < currentKey && !existingKeys.has(key))
      .sort();
    if (!closedKeys.length) return;

    monthlyArchiveRunningRef.current = true;
    void (async () => {
      let archived = 0;
      for (const key of closedKeys) {
        const monthSessions = sessions.filter(
          (session) => jalaliMonthParts(session.session_date).key === key,
        );
        const sessionIds = new Set(monthSessions.map((session) => session.id));
        const monthRecords = records.filter((record) => sessionIds.has(record.session_id));
        const results = computeScopeStudentResults({
          sessions: monthSessions,
          records: monthRecords,
          students,
          classes,
          terms,
        });
        const [year, month] = key.split("-").map(Number);
        const academicYear =
          monthSessions.map((session) => session.academic_year).find((value) => Boolean(value)) ??
          null;
        const payload: MonthlySnapshotStudent[] = results.map(
          ({ records: _records, ...item }) => item,
        );
        const { error } = await supabase.rpc("admin_finalize_najm_month", {
          p_month_key: key,
          p_jalali_year: year,
          p_jalali_month: month,
          p_title: `نتایج ${jalaliMonthTitle(key)}`,
          p_academic_year: academicYear,
          p_results: payload,
          p_source_session_count: monthSessions.length,
          p_mode: "automatic",
        });
        if (!error) archived += 1;
        else console.error(`monthly snapshot ${key} failed`, error);
      }
      if (archived > 0) {
        const { data } = await supabase.rpc("get_najm_monthly_snapshots");
        setMonthlySnapshots((data ?? []) as MonthlySnapshot[]);
        toast.success(`${toFa(archived)} ماه گذشته به‌صورت خودکار بایگانی شد`);
      }
      monthlyArchiveRunningRef.current = false;
    })();
  }, [loading, sessions, records, students, classes, terms, monthlySnapshots]);

  const selectedTerm = terms.find((term) => term.id === termId) ?? null;
  const currentMonthKey = jalaliMonthParts(new Date()).key;
  const monthOptions = useMemo(
    () =>
      [
        ...new Set([
          currentMonthKey,
          ...sessions.map((session) => jalaliMonthParts(session.session_date).key),
          ...monthlySnapshots.map((snapshot) => snapshot.month_key),
        ]),
      ]
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a)),
    [sessions, monthlySnapshots, currentMonthKey],
  );
  const selectedMonthSnapshot =
    monthlySnapshots.find((snapshot) => snapshot.month_key === monthKey) ?? null;
  const resultPeriodTitle =
    resultScope === "monthly"
      ? `نتایج ماهانه طرح نجم — ${jalaliMonthTitle(monthKey)}`
      : resultScope === "annual"
        ? `نتایج سالانه طرح نجم — ${toFa(selectedTerm?.academic_year ?? "")}`
        : (selectedTerm?.title ?? "نتایج ترمی طرح نجم");
  useEffect(() => {
    let active = true;
    void Promise.all([
      resolvePrivateStorageUrl(NAJM_POSTERS_BUCKET, selectedTerm?.overall_results_poster_path),
      resolvePrivateStorageUrl(NAJM_POSTERS_BUCKET, selectedTerm?.class_results_poster_path),
    ]).then(([overall, classPoster]) => {
      if (!active) return;
      setPosterUrls({
        overall: overall || DEFAULT_OVERALL_POSTER,
        class: classPoster || DEFAULT_CLASS_POSTER,
      });
    });
    return () => {
      active = false;
    };
  }, [selectedTerm?.overall_results_poster_path, selectedTerm?.class_results_poster_path]);
  const overallPosterUrl = posterUrls.overall;
  const classPosterUrl = posterUrls.class;
  const overallPosterLayout = useMemo(
    () => resolvePosterLayout(selectedTerm?.overall_results_layout, DEFAULT_OVERALL_LAYOUT),
    [selectedTerm?.overall_results_layout],
  );
  const classPosterLayout = useMemo(
    () => resolvePosterLayout(selectedTerm?.class_results_layout, DEFAULT_CLASS_LAYOUT),
    [selectedTerm?.class_results_layout],
  );

  async function uploadPoster(type: "overall" | "class", file?: File) {
    if (!selectedTerm || !file) return;
    const config =
      type === "overall"
        ? { maxBytes: 12 * 1024 * 1024, ratio: 2 / 3, minWidth: 1000, minHeight: 1500 }
        : { maxBytes: 4 * 1024 * 1024, ratio: 16 / 11, minWidth: 1200, minHeight: 825 };

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("فرمت پوستر باید PNG، JPG یا WebP باشد");
      return;
    }
    if (file.size > config.maxBytes) {
      toast.error(
        type === "overall"
          ? "حجم پوستر کل حداکثر ۱۲ مگابایت است"
          : "حجم پوستر کلاس حداکثر ۴ مگابایت است",
      );
      return;
    }

    try {
      const dimensions = await readImageDimensions(file);
      const ratio = dimensions.width / dimensions.height;
      const detectedSize = `${toFa(dimensions.width)}×${toFa(dimensions.height)}`;

      if (Math.abs(ratio - config.ratio) > 0.01) {
        toast.error(
          type === "overall"
            ? `ابعاد فایل شما ${detectedSize} است؛ نسبت پوستر کل باید دقیقاً ۲:۳ باشد (مانند ۲۰۰۰×۳۰۰۰).`
            : `ابعاد فایل شما ${detectedSize} است؛ نسبت پوستر کلاس باید دقیقاً ۱۶:۱۱ باشد (مانند ۱۶۰۰×۱۱۰۰).`,
        );
        return;
      }

      if (dimensions.width < config.minWidth || dimensions.height < config.minHeight) {
        toast.warning(
          type === "overall"
            ? `ابعاد فایل ${detectedSize} از اندازه پیشنهادی ۲۰۰۰×۳۰۰۰ کوچک‌تر است؛ بارگذاری انجام می‌شود اما ممکن است کیفیت تصویر کاهش یابد.`
            : `ابعاد فایل ${detectedSize} از اندازه پیشنهادی ۱۶۰۰×۱۱۰۰ کوچک‌تر است؛ بارگذاری انجام می‌شود اما ممکن است کیفیت تصویر کاهش یابد.`,
          { duration: 7000 },
        );
      }

      setPosterUploading(type);
      const extension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, "") || "png";
      const filePath = `terms/${selectedTerm.id}/${type}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(NAJM_POSTERS_BUCKET)
        .upload(filePath, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;

      const column =
        type === "overall" ? "overall_results_poster_path" : "class_results_poster_path";
      const previousPath =
        type === "overall"
          ? selectedTerm.overall_results_poster_path
          : selectedTerm.class_results_poster_path;
      const { error: updateError } = await supabase
        .from("najm_terms")
        .update({ [column]: filePath, updated_at: new Date().toISOString() })
        .eq("id", selectedTerm.id);
      if (updateError) {
        await supabase.storage.from(NAJM_POSTERS_BUCKET).remove([filePath]);
        throw updateError;
      }
      if (previousPath) {
        await supabase.storage.from(NAJM_POSTERS_BUCKET).remove([previousPath]);
      }
      toast.success(
        type === "overall" ? "پوستر کل دارالقرآن بارگذاری شد" : "پوستر نتایج کلاس‌ها بارگذاری شد",
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در بارگذاری پوستر");
    } finally {
      setPosterUploading(null);
      if (type === "overall" && overallPosterInputRef.current)
        overallPosterInputRef.current.value = "";
      if (type === "class" && classPosterInputRef.current) classPosterInputRef.current.value = "";
    }
  }

  async function resetPoster(type: "overall" | "class") {
    if (!selectedTerm) return;
    const path =
      type === "overall"
        ? selectedTerm.overall_results_poster_path
        : selectedTerm.class_results_poster_path;
    const column = type === "overall" ? "overall_results_poster_path" : "class_results_poster_path";
    const { error } = await supabase
      .from("najm_terms")
      .update({ [column]: null, updated_at: new Date().toISOString() })
      .eq("id", selectedTerm.id);
    if (error) return toast.error(error.message);
    if (path) await supabase.storage.from(NAJM_POSTERS_BUCKET).remove([path]);
    toast.success("پوستر به طرح پیش‌فرض بازگشت");
    await load();
  }

  async function savePosterLayout(type: PosterLayoutType, layout: NajmPosterLayout) {
    if (!selectedTerm) throw new Error("ترم انتخاب‌شده مشخص نیست");
    const column = type === "overall" ? "overall_results_layout" : "class_results_layout";
    const { error } = await supabase
      .from("najm_terms")
      .update({ [column]: layout, updated_at: new Date().toISOString() })
      .eq("id", selectedTerm.id);
    if (error) throw error;

    setTerms((current) =>
      current.map((term) =>
        term.id === selectedTerm.id
          ? {
              ...term,
              [column]: clonePosterLayout(layout),
            }
          : term,
      ),
    );
    toast.success(type === "overall" ? "چیدمان پوستر کل ذخیره شد" : "چیدمان پوستر کلاس ذخیره شد");
  }

  const teacherById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher.name])),
    [teachers],
  );
  const classById = useMemo(
    () => new Map(classes.map((classItem) => [String(classItem.id), classItem])),
    [classes],
  );
  const studentById = useMemo(
    () => new Map(students.map((student) => [String(student.id), student])),
    [students],
  );

  const scopedSessions = useMemo(() => {
    if (!selectedTerm) return [];
    return sessions.filter((session) => {
      const periodMatches =
        resultScope === "monthly"
          ? jalaliMonthParts(session.session_date).key === monthKey
          : resultScope === "annual"
            ? session.academic_year === selectedTerm.academic_year
            : session.term === selectedTerm.term &&
              session.academic_year === selectedTerm.academic_year;
      return (
        periodMatches &&
        (classFilter === "all" || String(session.class_id) === classFilter) &&
        (teacherFilter === "all" || String(session.teacher_id) === teacherFilter)
      );
    });
  }, [sessions, selectedTerm, resultScope, monthKey, classFilter, teacherFilter]);

  const sessionById = useMemo(
    () => new Map(scopedSessions.map((session) => [session.id, session])),
    [scopedSessions],
  );
  const scopedSessionIds = useMemo(
    () => new Set(scopedSessions.map((session) => session.id)),
    [scopedSessions],
  );
  const scopedRecords = useMemo(
    () => records.filter((record) => scopedSessionIds.has(record.session_id)),
    [records, scopedSessionIds],
  );

  const liveStudentResults = useMemo<StudentResult[]>(
    () =>
      computeScopeStudentResults({
        sessions: scopedSessions,
        records: scopedRecords,
        students,
        classes,
        terms,
        search,
      }),
    [scopedSessions, scopedRecords, students, classes, terms, search],
  );

  const studentResults = useMemo<StudentResult[]>(() => {
    if (resultScope !== "monthly" || !selectedMonthSnapshot) return liveStudentResults;
    const liveById = new Map(liveStudentResults.map((item) => [item.studentId, item]));
    const query = search.trim().toLowerCase();
    return selectedMonthSnapshot.results
      .map((item) => {
        const live = liveById.get(String(item.studentId));
        return {
          ...item,
          studentId: String(item.studentId),
          records: live?.records ?? [],
        } as StudentResult;
      })
      .filter((item) => {
        if (classFilter !== "all" && item.classId !== classFilter) return false;
        if (teacherFilter !== "all") {
          const classItem = classById.get(item.classId);
          if (String(classItem?.teacher_id ?? "") !== teacherFilter) return false;
        }
        return (
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.className.toLowerCase().includes(query)
        );
      })
      .sort(
        (a, b) => b.total - a.total || b.average - a.average || a.name.localeCompare(b.name, "fa"),
      );
  }, [
    resultScope,
    selectedMonthSnapshot,
    liveStudentResults,
    search,
    classFilter,
    teacherFilter,
    classById,
  ]);

  // نتایج سالانه: رتبه‌بندی «۱۰ نفر برتر کل دارالقرآن» مستقل از فیلتر کلاس/استاد
  // و جستجو محاسبه می‌شود تا پوستر رسمی همیشه کل دارالقرآن را پوشش دهد.
  const annualOverallSessions = useMemo(() => {
    if (resultScope !== "annual" || !selectedTerm) return [];
    return sessions.filter((session) => session.academic_year === selectedTerm.academic_year);
  }, [sessions, selectedTerm, resultScope]);

  const annualOverallSessionIds = useMemo(
    () => new Set(annualOverallSessions.map((session) => session.id)),
    [annualOverallSessions],
  );
  const annualOverallRecords = useMemo(
    () =>
      resultScope === "annual"
        ? records.filter((record) => annualOverallSessionIds.has(record.session_id))
        : [],
    [records, annualOverallSessionIds, resultScope],
  );
  const annualOverallTopStudents = useMemo<StudentResult[]>(() => {
    if (resultScope !== "annual") return [];
    return computeScopeStudentResults({
      sessions: annualOverallSessions,
      records: annualOverallRecords,
      students,
      classes,
      terms,
    }).slice(0, 10);
  }, [annualOverallSessions, annualOverallRecords, students, classes, terms, resultScope]);

  const classResults = useMemo<ClassResult[]>(() => {
    const groups = new Map<string, StudentResult[]>();
    for (const student of studentResults) {
      const list = groups.get(student.classId) ?? [];
      list.push(student);
      groups.set(student.classId, list);
    }
    return [...groups.entries()]
      .map(([classId, classStudents]) => {
        const classItem = classById.get(classId);
        const classSessions = scopedSessions.filter(
          (session) => String(session.class_id) === classId,
        );
        const total = classStudents.reduce((sum, student) => sum + student.total, 0);
        return {
          classId,
          className: classStudents[0]?.className ?? classItem?.name ?? "بدون کلاس",
          level: classItem?.level ?? null,
          teacherName:
            classItem?.teacher_id == null
              ? "استاد نامشخص"
              : (teacherById.get(classItem.teacher_id) ?? "استاد نامشخص"),
          sessions: classSessions.length,
          records: classStudents.reduce((sum, student) => sum + student.sessions, 0),
          students: classStudents,
          total,
          average: classStudents.length
            ? classStudents.reduce((sum, student) => sum + student.average, 0) /
              classStudents.length
            : 0,
        };
      })
      .sort((a, b) => b.average - a.average || a.className.localeCompare(b.className, "fa"));
  }, [studentResults, classById, scopedSessions, teacherById]);

  const presentRecords = scopedRecords.filter(
    (record) => !(record.is_absent === true || numberValue(record.attendance) === 0),
  );
  const attendanceRate = scopedRecords.length
    ? Math.round((presentRecords.length / scopedRecords.length) * 100)
    : 0;
  const averageScore = presentRecords.length
    ? presentRecords.reduce((sum, record) => sum + numberValue(record.session_score), 0) /
      presentRecords.length
    : 0;
  const absentCount = scopedRecords.length - presentRecords.length;
  const classEditorPreview: ClassResult = classResults[0] ?? {
    classId: "editor-preview",
    className: "نمونه کلاس",
    level: null,
    teacherName: "نام استاد",
    sessions: 0,
    records: 0,
    students: studentResults.slice(0, 5),
    total: 0,
    average: 0,
  };
  async function exportAllPosters(format: PosterExportFormat) {
    if (exportingFormat) return;

    const posterNodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-najm-poster-export='true']"),
    );
    if (!posterNodes.length) {
      toast.error("پوستری برای خروجی وجود ندارد");
      return;
    }

    setExportingFormat(format);
    setExportProgress({ current: 0, total: posterNodes.length, label: "آماده‌سازی خروجی" });

    try {
      const imageTools = await import("html-to-image");
      const fontEmbedCSS = await imageTools.getFontEmbedCSS(posterNodes[0]).catch(() => undefined);
      const termName = safeFilePart(resultPeriodTitle);

      const captureOptions = (node: HTMLElement) => ({
        width: node.offsetWidth,
        height: node.offsetHeight,
        canvasWidth: Number(node.dataset.exportWidth || node.offsetWidth),
        canvasHeight: Number(node.dataset.exportHeight || node.offsetHeight),
        pixelRatio: 1,
        backgroundColor: "#07182d",
        includeQueryParams: true,
        fontEmbedCSS,
        preferredFontFormat: "woff2",
      });

      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        let pdf: import("jspdf").jsPDF | null = null;

        for (const [index, node] of posterNodes.entries()) {
          setExportProgress({
            current: index + 1,
            total: posterNodes.length,
            label: node.dataset.exportLabel || "در حال ساخت صفحه PDF",
          });
          await waitForPosterAssets(node);
          const width = Number(node.dataset.exportWidth || node.offsetWidth);
          const height = Number(node.dataset.exportHeight || node.offsetHeight);
          const orientation = width >= height ? "landscape" : "portrait";
          const imageData = await imageTools.toJpeg(node, {
            ...captureOptions(node),
            quality: 0.95,
          });

          if (!pdf) {
            pdf = new jsPDF({
              orientation,
              unit: "px",
              format: [width, height],
              hotfixes: ["px_scaling"],
              compress: true,
            });
          } else {
            pdf.addPage([width, height], orientation);
          }

          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          pdf.addImage(imageData, "JPEG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        }

        if (!pdf) throw new Error("ساخت فایل PDF انجام نشد");
        pdf.save(`پوسترهای-نتایج-نجم-${termName}.pdf`);
      } else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const folder = zip.folder(`پوسترهای-نتایج-نجم-${termName}`) ?? zip;
        const extension = format === "png" ? "png" : "jpg";

        for (const [index, node] of posterNodes.entries()) {
          const label = node.dataset.exportLabel || `پوستر-${index + 1}`;
          setExportProgress({ current: index + 1, total: posterNodes.length, label });
          await waitForPosterAssets(node);

          let blob: Blob;
          if (format === "png") {
            const rendered = await imageTools.toBlob(node, captureOptions(node));
            if (!rendered) throw new Error(`ساخت تصویر ${label} انجام نشد`);
            blob = rendered;
          } else {
            const dataUrl = await imageTools.toJpeg(node, {
              ...captureOptions(node),
              quality: 0.95,
            });
            blob = await dataUrlToBlob(dataUrl);
          }

          const order = String(index + 1).padStart(2, "0");
          folder.file(`${order}-${safeFilePart(label)}.${extension}`, blob);
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        }

        setExportProgress({
          current: posterNodes.length,
          total: posterNodes.length,
          label: "در حال ساخت فایل فشرده",
        });
        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        downloadBlob(zipBlob, `پوسترهای-نتایج-نجم-${termName}-${format}.zip`);
      }

      toast.success(
        format === "pdf"
          ? "فایل PDF چندصفحه‌ای پوسترها آماده شد"
          : `فایل فشرده پوسترهای ${format === "png" ? "PNG" : "JPEG"} آماده شد`,
      );
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? `خطا در خروجی پوسترها: ${error.message}`
          : "خطا در خروجی‌گرفتن از پوسترها",
      );
    } finally {
      setExportingFormat(null);
      setExportProgress(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال محاسبه نتایج طرح نجم...</span>
      </div>
    );
  }

  return (
    <>
      <style>{resultsStyles}</style>
      <div className="najm-results-page space-y-6 rounded-[2rem] p-4 md:p-6" dir="rtl">
        <section className="najm-compact-header relative overflow-hidden rounded-[1.5rem] px-4 py-3">
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="compact-header-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                <Trophy className="h-5 w-5 text-[#064E3B]" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-lg font-black tracking-tight text-[#064E3B] md:text-xl">
                    نتایج طرح نجم
                  </h1>
                  <Badge className="rounded-full border-0 bg-[#D4AF37]/18 text-[11px] text-[#064E3B] shadow-sm hover:bg-[#D4AF37]/18">
                    نمایش رسمی نتایج
                  </Badge>
                  <Badge className="rounded-full border-0 bg-blue-100 text-[11px] text-blue-800 hover:bg-blue-100">
                    فقط جلسات اعمال‌شده
                  </Badge>
                </div>
                <p className="mt-0.5 max-w-xl text-xs leading-5 text-emerald-950/60">
                  رتبه‌بندی قرآن‌آموزان در هر کلاس و مقایسه کلاس‌ها با اعمال ضریب جایگزین غیبت؛ این
                  صفحه فقط خواندنی است.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto">
              <div
                className="compact-mini-stat rounded-xl px-3 py-1.5 text-center"
                title="کلاس‌های دارای نتیجه در بازه فعلی"
              >
                <div className="text-[10px] text-emerald-950/55">کلاس‌ها</div>
                <div className="font-display text-sm font-black text-[#064E3B]">
                  {toFa(resultScope === "monthly" ? classes.length : classResults.length)}
                </div>
              </div>
              <div
                className="compact-mini-stat rounded-xl px-3 py-1.5 text-center"
                title="قرآن‌آموزان دارای امتیاز در بازه فعلی"
              >
                <div className="text-[10px] text-emerald-950/55">رتبه‌دار</div>
                <div className="font-display text-sm font-black text-[#B8860B]">
                  {toFa(studentResults.length)}
                </div>
              </div>
              <div
                className="compact-mini-stat rounded-xl px-3 py-1.5 text-center"
                title="جلسات اعمال‌شده در بازه فعلی"
              >
                <div className="text-[10px] text-emerald-950/55">جلسات</div>
                <div className="font-display text-sm font-black text-[#064E3B]">
                  {toFa(scopedSessions.length)}
                </div>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="compact-button border-0 bg-transparent text-[#064E3B] shadow-none hover:bg-transparent"
              >
                <Link to="/admin/najm">مدیریت طرح نجم</Link>
              </Button>
              <Button
                onClick={() => void load(true)}
                disabled={refreshing}
                size="sm"
                className="compact-button gap-1.5 border-0 bg-transparent text-[#B8860B] shadow-none hover:bg-transparent"
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

        <Card className="najm-result-panel rounded-[1.8rem] border-0 p-5">
          <div className="mb-4 flex items-center gap-3 text-sm font-bold text-emerald-950">
            <span className="soft-icon flex h-9 w-9 items-center justify-center rounded-xl text-[#064E3B]">
              <Filter className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-base font-black">فیلتر نتایج</p>
              <p className="text-[10px] font-normal text-muted-foreground">
                بازه و محدوده گزارش خواندنی را انتخاب کنید
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger>
                <SelectValue placeholder="ترم" />
              </SelectTrigger>
              <SelectContent>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.title} — {toFa(term.academic_year)} {term.is_active ? "(فعال)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه کلاس‌ها</SelectItem>
                {classes.map((classItem) => (
                  <SelectItem key={classItem.id} value={String(classItem.id)}>
                    {classItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه استادان</SelectItem>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={String(teacher.id)}>
                    {teacher.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="نام قرآن‌آموز یا کلاس..."
                className="pr-9"
              />
            </div>
          </div>
        </Card>

        <ResultScopeNavigator
          scope={resultScope}
          onScopeChange={setResultScope}
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          monthOptions={monthOptions}
          monthFinalized={Boolean(selectedMonthSnapshot)}
          annualYear={selectedTerm?.academic_year ?? ""}
        />

        {resultScope !== "monthly" && (
          <Card className="najm-result-panel rounded-[1.8rem] border-0 p-5">
          <div className="flex items-start gap-3">
            <span className="soft-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#064E3B]">
              <Image className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-black text-[#064E3B]">
                مدیریت پوسترهای نتایج
              </h2>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                پس‌زمینه و چیدمان هر نوع پوستر را جداگانه مدیریت کنید. تنظیمات برای{" "}
                {selectedTerm?.title ?? "ترم انتخاب‌شده"} ذخیره می‌شود.
              </p>
            </div>
          </div>

          <div className={`mt-5 grid gap-4 ${resultScope === "annual" ? "xl:grid-cols-2" : ""}`}>
            {resultScope === "annual" && (
              <PosterControl
                label="پوستر ۱۰ نفر برتر کل دارالقرآن"
                hint="۲۰۰۰×۳۰۰۰ • نسبت چاپی ۲:۳ • فقط برای نتایج سالانه"
                custom={Boolean(selectedTerm?.overall_results_poster_path)}
                loading={posterUploading === "overall"}
                onUpload={() => overallPosterInputRef.current?.click()}
                onEdit={() => setLayoutEditorType("overall")}
                onReset={() => void resetPoster("overall")}
              />
            )}
            <PosterControl
              label="پوستر نتایج کلاس‌ها"
              hint="۱۶۰۰×۱۱۰۰ • نسبت ۱۶:۱۱"
              custom={Boolean(selectedTerm?.class_results_poster_path)}
              loading={posterUploading === "class"}
              onUpload={() => classPosterInputRef.current?.click()}
              onEdit={() => setLayoutEditorType("class")}
              onReset={() => void resetPoster("class")}
            />
          </div>
          <input
            ref={overallPosterInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => void uploadPoster("overall", event.target.files?.[0])}
          />
          <input
            ref={classPosterInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => void uploadPoster("class", event.target.files?.[0])}
          />
          </Card>
        )}

        <Card className="najm-export-panel overflow-hidden rounded-[1.8rem] border-0 p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <span className="soft-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#064E3B]">
                <Download className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-black text-emerald-950">
                    خروجی تمام پوسترهای نتایج
                  </h2>
                  <Badge className="border border-[#D4AF37]/30 bg-[#F4EAD0] text-[#7A5806]">
                    {toFa(
                      (resultScope === "monthly" ? classes.length : classResults.length) +
                        (resultScope === "annual" && annualOverallTopStudents.length ? 1 : 0),
                    )}{" "}
                    پوستر
                  </Badge>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-6 text-muted-foreground">
                  {resultScope === "annual"
                    ? "شامل پوستر ۱۰ نفر برتر کل دارالقرآن و تمام پوسترهای کلاس‌های نمایش‌داده‌شده با فیلتر فعلی؛ خروجی PDF به‌صورت چندصفحه‌ای و PNG یا JPEG به‌صورت فایل ZIP ساخته می‌شود."
                    : "شامل تمام پوسترهای کلاس‌های نمایش‌داده‌شده با فیلتر فعلی؛ خروجی PDF به‌صورت چندصفحه‌ای و PNG یا JPEG به‌صورت فایل ZIP ساخته می‌شود."}
                </p>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                type="button"
                disabled={Boolean(exportingFormat) || studentResults.length === 0}
                onClick={() => void exportAllPosters("png")}
                className="gap-2 bg-[#064E3B] text-[#F8E7C9] hover:bg-[#043D2E]"
              >
                {exportingFormat === "png" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileImage className="h-4 w-4" />
                )}
                خروجی PNG
              </Button>
              <Button
                type="button"
                disabled={Boolean(exportingFormat) || studentResults.length === 0}
                onClick={() => void exportAllPosters("jpeg")}
                className="gap-2 bg-[#064E3B] text-[#F8E7C9] hover:bg-[#043D2E]"
              >
                {exportingFormat === "jpeg" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileImage className="h-4 w-4" />
                )}
                خروجی JPEG
              </Button>
              <Button
                type="button"
                disabled={Boolean(exportingFormat) || studentResults.length === 0}
                onClick={() => void exportAllPosters("pdf")}
                className="gap-2 bg-[#064E3B] text-[#F8E7C9] hover:bg-[#043D2E]"
              >
                {exportingFormat === "pdf" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                خروجی PDF
              </Button>
            </div>
          </div>

          {exportProgress && (
            <div className="mt-5 rounded-2xl border border-[#D4AF37]/25 bg-[#FBF6E7]/85 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate font-bold text-emerald-900">{exportProgress.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {toFa(exportProgress.current)} از {toFa(exportProgress.total)}
                </span>
              </div>
              <Progress
                value={
                  exportProgress.total
                    ? Math.round((exportProgress.current / exportProgress.total) * 100)
                    : 0
                }
                className="h-2"
              />
              <p className="mt-2 text-[10px] text-muted-foreground">
                تا پایان آماده‌سازی این صفحه را نبندید. عکس‌ها و نوشته‌ها با اندازه اصلی پوستر ذخیره
                می‌شوند.
              </p>
            </div>
          )}
        </Card>

        <section className="mobile-four-stats grid grid-cols-2 gap-3 lg:grid-cols-5">
          <ResultStat
            label="جلسات اعمال‌شده"
            value={scopedSessions.length}
            icon={<BookOpen className="h-5 w-5" />}
            tone="emerald"
          />
          <ResultStat
            label="قرآن‌آموزان رتبه‌دار"
            value={studentResults.length}
            icon={<Users className="h-5 w-5" />}
            tone="blue"
          />
          <ResultStat
            label="نرخ حضور"
            value={`${toFa(attendanceRate)}٪`}
            icon={<CalendarCheck className="h-5 w-5" />}
            tone="gold"
          />
          <ResultStat
            label="میانگین جلسه"
            value={`${fixed(averageScore)} / ۳۰`}
            icon={<Star className="h-5 w-5" />}
            tone="purple"
          />
          <ResultStat
            label="غیبت جایگزین‌شده"
            value={absentCount}
            icon={<ShieldCheck className="h-5 w-5" />}
            tone="rose"
          />
        </section>

        {resultScope === "annual" && (
          <section>
            <div className="najm-section-heading mb-4 flex items-center gap-3 rounded-2xl border border-amber-100 px-4 py-3">
              <div className="soft-icon flex h-11 w-11 items-center justify-center rounded-2xl text-[#B8860B]">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-xl font-black">
                  ۱۰ نفر برتر کل دارالقرآن — {resultPeriodTitle}
                </h2>
                <p className="text-xs text-muted-foreground">
                  رتبه‌بندی مستقل کل قرآن‌آموزان در سال تحصیلی؛ فیلتر کلاس/استاد و جستجو روی این بخش
                  اثر ندارد
                </p>
              </div>
            </div>
            {annualOverallTopStudents.length === 0 ? (
              <EmptyState text="هنوز امتیازی برای رتبه‌بندی کل دارالقرآن ثبت نشده است." />
            ) : (
              <OverallResultsPoster
                backgroundUrl={overallPosterUrl}
                layout={overallPosterLayout}
                students={annualOverallTopStudents}
                termTitle={resultPeriodTitle}
                academicYear=""
                onStudentClick={setSelectedStudent}
              />
            )}
          </section>
        )}

        <section>
          <div className="najm-section-heading mb-4 flex items-center gap-3 rounded-2xl border border-amber-100 px-4 py-3">
            <div className="soft-icon flex h-11 w-11 items-center justify-center rounded-2xl text-[#B8860B]">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-black">
                نتایج کلاس‌ها — {resultPeriodTitle}
              </h2>
              <p className="text-xs text-muted-foreground">
                {resultScope === "monthly"
                  ? "جدول و پوستر یکپارچه همه رده‌های هر کلاس"
                  : "مقایسه خواندنی کلاس‌ها و برترین‌های هر کلاس"}
              </p>
            </div>
          </div>
          {resultScope === "monthly" ? (
            classes.length === 0 ? (
              <EmptyState text="کلاسی برای نمایش رده‌ها وجود ندارد." />
            ) : (
              <div className="space-y-7">
                {classes.map((classItem) => (
                  <AdminLeaguePosterPanel
                    key={classItem.id}
                    classId={Number(classItem.id)}
                    monthKey={monthKey}
                    term={selectedTerm?.term as NajmTerm}
                    academicYear={selectedTerm?.academic_year ?? ""}
                  />
                ))}
              </div>
            )
          ) : classResults.length === 0 ? (
            <EmptyState text="نتیجه کلاسی برای این فیلتر وجود ندارد." />
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              {classResults.map((classItem, classIndex) => (
                <ClassResultCard
                  key={classItem.classId}
                  item={classItem}
                  rank={classIndex + 1}
                  backgroundUrl={classPosterUrl}
                  layout={classPosterLayout}
                  onStudentClick={setSelectedStudent}
                />
              ))}
            </div>
          )}
        </section>

        <Dialog
          open={selectedStudent !== null}
          onOpenChange={(open) => !open && setSelectedStudent(null)}
        >
          <DialogContent
            className="najm-result-dialog max-h-[90vh] max-w-5xl overflow-y-auto"
            dir="rtl"
          >
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                جزئیات نتیجه نجم — {selectedStudent?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedStudent?.className} • {resultPeriodTitle} • فقط خواندنی
              </DialogDescription>
            </DialogHeader>
            {selectedStudent && (
              <StudentResultDetails student={selectedStudent} sessionById={sessionById} />
            )}
          </DialogContent>
        </Dialog>

        {layoutEditorType && (
          <PosterLayoutEditor
            key={`${layoutEditorType}-${selectedTerm?.id ?? "term"}`}
            open
            type={layoutEditorType}
            layout={layoutEditorType === "overall" ? overallPosterLayout : classPosterLayout}
            defaultLayout={
              layoutEditorType === "overall" ? DEFAULT_OVERALL_LAYOUT : DEFAULT_CLASS_LAYOUT
            }
            backgroundUrl={layoutEditorType === "overall" ? overallPosterUrl : classPosterUrl}
            items={
              layoutEditorType === "overall"
                ? buildOverallPosterItems(annualOverallTopStudents, resultPeriodTitle, "")
                : buildClassPosterItems(classEditorPreview, 1)
            }
            onClose={() => setLayoutEditorType(null)}
            onSave={(layout) => savePosterLayout(layoutEditorType, layout)}
          />
        )}
      </div>
    </>
  );
}

function ResultScopeNavigator({
  scope,
  onScopeChange,
  monthKey,
  onMonthChange,
  monthOptions,
  monthFinalized,
  annualYear,
}: {
  scope: ResultScope;
  onScopeChange: (scope: ResultScope) => void;
  monthKey: string;
  onMonthChange: (key: string) => void;
  monthOptions: string[];
  monthFinalized: boolean;
  annualYear: string;
}) {
  const cards: Array<{
    id: ResultScope;
    title: string;
    description: string;
    icon: ReactNode;
  }> = [
    {
      id: "monthly",
      title: "نتایج ماهانه طرح نجم",
      description: "فقط برترین‌های هر کلاس در رقابت مستقل هر ماه",
      icon: <Crown className="h-6 w-6" />,
    },
    {
      id: "term",
      title: "نتایج ترمی",
      description: "فقط برترین‌های هر کلاس بر اساس امتیاز تجمعی ترم",
      icon: <Trophy className="h-6 w-6" />,
    },
    {
      id: "annual",
      title: "نتایج سالانه",
      description: `برترین‌های هر کلاس + ۱۰ نفر برتر کل دارالقرآن در سال ${toFa(annualYear)}`,
      icon: <BarChart3 className="h-6 w-6" />,
    },
  ];
  return (
    <Card className="najm-scope-navigator overflow-hidden rounded-[1.8rem] border-0 p-4 md:p-5">
      <div className="grid gap-3 lg:grid-cols-3">
        {cards.map((card) => {
          const active = scope === card.id;
          const monthly = card.id === "monthly";
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onScopeChange(card.id)}
              className={`relative overflow-hidden rounded-2xl border p-4 text-right transition ${
                active
                  ? monthly
                    ? "border-[#D4AF37]/70 bg-gradient-to-br from-[#F6E9C6] to-[#EDDDB2] text-[#064E3B] shadow-xl"
                    : "border-[#D4AF37]/50 bg-gradient-to-br from-[#F6ECD2] to-[#EFE0BA] text-[#064E3B] shadow-lg"
                  : "border-[#B8860B]/15 bg-[#FBF6E7]/85 text-[#064E3B] hover:border-[#D4AF37]/45 hover:bg-[#F4EAD0]"
              }`}
            >
              {monthly && active && (
                <Sparkles className="absolute -left-3 -top-3 h-20 w-20 text-[#D4AF37]/25" />
              )}
              <div className="relative flex items-center gap-3">
                <span
                  className={`soft-icon flex h-12 w-12 items-center justify-center rounded-2xl ${
                    active ? "text-[#B8860B]" : "text-[#064E3B]"
                  }`}
                >
                  {card.icon}
                </span>
                <div>
                  <p className="font-display text-lg font-black">{card.title}</p>
                  <p
                    className={`mt-1 text-[11px] ${active ? "text-emerald-950/60" : "text-muted-foreground"}`}
                  >
                    {card.description}
                  </p>
                </div>
              </div>
              {monthly && (
                <Badge className="relative mt-3 border-0 bg-[#D4AF37] text-emerald-950">
                  ویژه جوایز ماه
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {scope === "monthly" && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#D4AF37]/25 bg-[#F4EAD0]/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display font-black text-[#064E3B]">انتخاب ماه شمسی</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              امتیاز ماه جدید مستقل از ماه قبل محاسبه می‌شود؛ اطلاعات قبلی پاک نخواهد شد.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={monthKey} onValueChange={onMonthChange}>
              <SelectTrigger className="w-48 border-[#D4AF37]/30 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {jalaliMonthTitle(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge
              className={
                monthFinalized
                  ? "border-0 bg-[#064E3B] text-[#F8E7C9]"
                  : "border border-[#D4AF37]/40 bg-[#F4E6BF] text-[#7A5806]"
              }
            >
              {monthFinalized ? "بایگانی نهایی" : "ماه جاری و زنده"}
            </Badge>
          </div>
        </div>
      )}
    </Card>
  );
}

function PosterControl({
  label,
  hint,
  custom,
  loading,
  onUpload,
  onEdit,
  onReset,
}: {
  label: string;
  hint: string;
  custom: boolean;
  loading: boolean;
  onUpload: () => void;
  onEdit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="najm-poster-control flex min-h-40 w-full min-w-0 flex-col justify-between rounded-2xl border p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-base font-black text-[#064E3B]">{label}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
          </div>
          <Badge
            className={
              custom
                ? "border border-[#064E3B]/20 bg-[#064E3B] text-[#F8E7C9]"
                : "border border-[#D4AF37]/30 bg-[#F1E6C6] text-[#7A5806]"
            }
          >
            {custom ? "سفارشی" : "پیش‌فرض"}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button
          size="sm"
          variant="outline"
          className="compact-button gap-1 border-0 text-[#064E3B] hover:bg-transparent"
          title="ویرایش چیدمان پوستر"
          onClick={onEdit}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          چیدمان
        </Button>
        <Button
          size="sm"
          className="gap-1 bg-[#064E3B] text-[#F8E7C9] hover:bg-[#043D2E]"
          disabled={loading}
          onClick={onUpload}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {custom ? "جایگزینی" : "بارگذاری"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="compact-button col-span-2 gap-1 border-0 text-[#064E3B] hover:bg-transparent sm:col-span-1"
          disabled={!custom}
          title="بازگشت به پوستر پیش‌فرض"
          onClick={onReset}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          پیش‌فرض
        </Button>
      </div>
    </div>
  );
}

function hasPosterCutout(student: StudentResult): boolean {
  return Boolean(student.posterPhotoUrl);
}

function buildOverallPosterItems(
  students: StudentResult[],
  termTitle: string,
  academicYear: string,
): PosterRenderItem[] {
  const items: PosterRenderItem[] = [
    {
      id: "header-title",
      kind: "text",
      content: "۱۰ نفر برتر کل دارالقرآن",
      className: "font-display",
    },
    {
      id: "header-subtitle",
      kind: "text",
      content: posterTermLine(termTitle, academicYear),
    },
  ];

  [1, 2, 3].forEach((rank) => {
    const student = students[rank - 1];
    if (!student) return;
    const prefix = `top-${rank}`;
    items.push(
      {
        id: `${prefix}-photo`,
        kind: "photo",
        photoUrl: hasPosterCutout(student) ? student.posterPhotoUrl : student.photoUrl,
        photoName: student.name,
        isCutout: hasPosterCutout(student),
        student,
      },
      {
        id: `${prefix}-name`,
        kind: "text",
        content: student.name,
        student,
        className: "font-display",
      },
      {
        id: `${prefix}-class`,
        kind: "text",
        content: `کلاس ${student.className}`,
        student,
      },
      {
        id: `${prefix}-score`,
        kind: "text",
        content: `${toFa(student.total)} امتیاز`,
        student,
        className: "font-display",
      },
    );
  });

  students.slice(3, 10).forEach((student, index) => {
    const rank = index + 4;
    const prefix = `row-${rank}`;
    items.push(
      {
        id: `${prefix}-rank`,
        kind: "text",
        content: `رتبه ${toFa(rank)}`,
        student,
        className: "font-display",
      },
      {
        id: `${prefix}-photo`,
        kind: "photo",
        photoUrl: hasPosterCutout(student) ? student.posterPhotoUrl : student.photoUrl,
        photoName: student.name,
        isCutout: hasPosterCutout(student),
        student,
      },
      {
        id: `${prefix}-name`,
        kind: "text",
        content: student.name,
        student,
        className: "font-display",
      },
      {
        id: `${prefix}-class`,
        kind: "text",
        content: `کلاس ${student.className}`,
        student,
      },
      {
        id: `${prefix}-score`,
        kind: "text",
        content: `${toFa(student.total)} امتیاز`,
        student,
        className: "font-display",
      },
    );
  });

  return items;
}

function buildClassPosterItems(item: ClassResult, rank: number): PosterRenderItem[] {
  const items: PosterRenderItem[] = [
    {
      id: "header-title",
      kind: "text",
      content: `نتایج برترین‌های کلاس ${item.className}`,
      className: "font-display",
    },
    {
      id: "header-subtitle",
      kind: "text",
      content: `استاد: ${item.teacherName} • رتبه کلاس ${toFa(rank)} • میانگین ${fixed(item.average)} از ۳۰`,
    },
  ];

  item.students.slice(0, 5).forEach((student, index) => {
    const studentRank = index + 1;
    const prefix = studentRank <= 3 ? `top-${studentRank}` : `row-${studentRank}`;
    if (studentRank >= 4) {
      items.push({
        id: `${prefix}-rank`,
        kind: "text",
        content: `رتبه ${toFa(studentRank)}`,
        student,
        className: "font-display",
      });
    }
    items.push(
      {
        id: `${prefix}-photo`,
        kind: "photo",
        photoUrl: hasPosterCutout(student) ? student.posterPhotoUrl : student.photoUrl,
        photoName: student.name,
        isCutout: hasPosterCutout(student),
        student,
      },
      {
        id: `${prefix}-name`,
        kind: "text",
        content: student.name,
        student,
        className: "font-display",
      },
      {
        id: `${prefix}-class`,
        kind: "text",
        content: `کلاس ${student.className}`,
        student,
      },
      {
        id: `${prefix}-score`,
        kind: "text",
        content: `${toFa(student.total)} امتیاز`,
        student,
        className: "font-display",
      },
    );
  });

  return items;
}

function posterElementStyle(element: PosterLayoutElement, layout: NajmPosterLayout): CSSProperties {
  const align = element.align ?? "center";
  return {
    position: "absolute",
    left: `${(element.x / layout.canvasWidth) * 100}%`,
    top: `${(element.y / layout.canvasHeight) * 100}%`,
    width: `${(element.width / layout.canvasWidth) * 100}%`,
    height: `${(element.height / layout.canvasHeight) * 100}%`,
    transform: `rotate(${element.rotation ?? 0}deg)`,
    transformOrigin: "center center",
    zIndex: element.zIndex,
    color: element.color,
    fontSize:
      element.kind === "text" && element.fontSize
        ? `${(element.fontSize / layout.canvasWidth) * 100}cqw`
        : undefined,
    fontWeight: element.fontWeight,
    fontFamily: element.fontFamily,
    lineHeight: element.lineHeight,
    textAlign: align,
    justifyContent: align === "right" ? "flex-start" : align === "left" ? "flex-end" : "center",
  };
}

type PosterElementsProps = {
  layout: NajmPosterLayout;
  items: PosterRenderItem[];
  onStudentClick?: (student: StudentResult) => void;
  editing?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onBeginInteraction?: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: "drag" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se",
  ) => void;
};

function PosterElements({
  layout,
  items,
  onStudentClick,
  editing = false,
  selectedId,
  onSelect,
  onBeginInteraction,
}: PosterElementsProps) {
  const itemById = new Map(items.map((item) => [item.id, item]));

  return Object.entries(layout.elements).map(([id, element]) => {
    const sourceItem = itemById.get(id);
    const item =
      sourceItem ??
      (editing
        ? {
            id,
            kind: element.kind,
            content: element.kind === "text" ? element.label : undefined,
            photoName: element.label,
            photoUrl: null,
          }
        : null);
    if (!item || element.hidden) return null;
    const selected = editing && selectedId === id;
    const commonClass = `poster-free-element ${editing ? "poster-free-element-editing" : ""} ${selected ? "poster-free-element-selected" : ""} ${element.locked ? "poster-free-element-locked" : ""}`;
    const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
      onSelect?.(id);
      if (editing && !element.locked) onBeginInteraction?.(event, id, "drag");
    };

    const handles = selected && !element.locked && (
      <>
        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
          <span
            key={corner}
            className={`poster-resize-handle poster-resize-${corner}`}
            onPointerDown={(event) => {
              event.stopPropagation();
              onBeginInteraction?.(event, id, `resize-${corner}`);
            }}
          />
        ))}
      </>
    );

    if (item.kind === "photo") {
      return (
        <button
          key={id}
          type="button"
          className={`${commonClass} poster-free-photo flex items-center justify-center`}
          style={posterElementStyle(element, layout)}
          onPointerDown={editing ? beginDrag : undefined}
          onClick={
            !editing && item.student && onStudentClick
              ? () => onStudentClick(item.student as StudentResult)
              : undefined
          }
          title={editing ? element.label : item.photoName}
        >
          <NajmStudentAvatar
            photoUrl={item.photoUrl ?? null}
            name={item.photoName ?? element.label}
            className="h-full w-full"
            poster
            cutout={item.isCutout}
          />
          {handles}
        </button>
      );
    }

    return (
      <button
        key={id}
        type="button"
        className={`${commonClass} poster-free-text flex items-center overflow-hidden whitespace-nowrap ${item.className ?? ""}`}
        style={posterElementStyle(element, layout)}
        onPointerDown={editing ? beginDrag : undefined}
        onClick={
          !editing && item.student && onStudentClick
            ? () => onStudentClick(item.student as StudentResult)
            : undefined
        }
        title={editing ? element.label : item.content}
      >
        <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap">
          {item.content ?? element.label}
        </span>
        {handles}
      </button>
    );
  });
}

function OverallResultsPoster({
  backgroundUrl,
  layout,
  students,
  termTitle,
  academicYear,
  onStudentClick,
}: {
  backgroundUrl: string;
  layout: NajmPosterLayout;
  students: StudentResult[];
  termTitle: string;
  academicYear: string;
  onStudentClick: (student: StudentResult) => void;
}) {
  const items = buildOverallPosterItems(students, termTitle, academicYear);
  return (
    <div className="najm-poster-scroll">
      <div className="najm-poster-shell najm-overall-poster mx-auto overflow-hidden rounded-[1.6rem] shadow-2xl">
        <div
          data-najm-poster-export="true"
          data-export-width={layout.canvasWidth}
          data-export-height={layout.canvasHeight}
          data-export-label={`۱۰ نفر برتر کل دارالقرآن - ${termTitle}`}
          className="najm-poster-canvas relative w-full overflow-hidden bg-[#07182d] bg-[length:100%_100%] bg-no-repeat"
          style={{
            aspectRatio: `${layout.canvasWidth} / ${layout.canvasHeight}`,
            backgroundImage: `url("${backgroundUrl}")`,
          }}
        >
          <PosterElements layout={layout} items={items} onStudentClick={onStudentClick} />
        </div>
      </div>
    </div>
  );
}

function ClassResultsPoster({
  backgroundUrl,
  layout,
  item,
  rank,
  onStudentClick,
}: {
  backgroundUrl: string;
  layout: NajmPosterLayout;
  item: ClassResult;
  rank: number;
  onStudentClick: (student: StudentResult) => void;
}) {
  const items = buildClassPosterItems(item, rank);
  return (
    <div className="najm-poster-scroll">
      <div className="najm-poster-shell najm-class-poster mx-auto overflow-hidden rounded-[1.6rem] shadow-xl">
        <div
          data-najm-poster-export="true"
          data-export-width={layout.canvasWidth}
          data-export-height={layout.canvasHeight}
          data-export-label={`نتایج کلاس ${item.className}`}
          className="najm-poster-canvas relative w-full overflow-hidden bg-[#07182d] bg-[length:100%_100%] bg-no-repeat"
          style={{
            aspectRatio: `${layout.canvasWidth} / ${layout.canvasHeight}`,
            backgroundImage: `url("${backgroundUrl}")`,
          }}
        >
          <PosterElements layout={layout} items={items} onStudentClick={onStudentClick} />
        </div>
      </div>
    </div>
  );
}

type PosterLayoutEditorProps = {
  open: boolean;
  type: PosterLayoutType;
  layout: NajmPosterLayout;
  defaultLayout: NajmPosterLayout;
  backgroundUrl: string;
  items: PosterRenderItem[];
  onClose: () => void;
  onSave: (layout: NajmPosterLayout) => Promise<void>;
};


function PosterLayoutEditor({
  open,
  type,
  layout,
  defaultLayout,
  backgroundUrl,
  items,
  onClose,
  onSave,
}: PosterLayoutEditorProps) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return (
    <AdvancedPosterLayoutEditor
      open={open}
      title={type === "overall" ? "پوستر کل" : "پوستر کلاس"}
      layout={layout as AdvancedPosterLayout}
      defaultLayout={defaultLayout as AdvancedPosterLayout}
      backgroundUrl={backgroundUrl}
      canvasClassName={
        type === "overall" ? "najm-layout-canvas-overall" : "najm-layout-canvas-class"
      }
      renderContent={(id, element) => {
        const item = itemById.get(id);
        if (element.kind === "photo") {
          return (
            <NajmStudentAvatar
              photoUrl={item?.photoUrl ?? null}
              name={item?.photoName ?? element.label}
              className="h-full w-full"
              poster
              cutout={item?.isCutout}
            />
          );
        }
        return (
          <span
            className={`block w-full overflow-hidden text-ellipsis whitespace-nowrap ${item?.className ?? ""}`}
          >
            {item?.content ?? element.label}
          </span>
        );
      }}
      onClose={onClose}
      onSave={(next) => onSave(next as NajmPosterLayout)}
    />
  );
}

function ResultStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone: "emerald" | "blue" | "gold" | "purple" | "rose";
}) {
  void tone;
  return (
    <Card className="najm-result-stat relative min-h-28 overflow-hidden rounded-2xl border-0 p-4">
      <div className="absolute inset-x-[18%] top-0 h-0.5 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-2xl font-black text-emerald-950">
            {typeof value === "number" ? toFa(value) : value}
          </p>
        </div>
        <span className="soft-icon flex h-11 w-11 items-center justify-center rounded-2xl text-[#064E3B]">
          {icon}
        </span>
      </div>
    </Card>
  );
}

function NajmStudentAvatar({
  photoUrl,
  name,
  featured = false,
  compact = false,
  className,
  poster = false,
  cutout = false,
}: {
  photoUrl: string | null;
  name: string;
  featured?: boolean;
  compact?: boolean;
  className?: string;
  poster?: boolean;
  cutout?: boolean;
}) {
  const [resolved, setResolved] = useState("");
  useEffect(() => {
    let active = true;
    void resolveStudentPhoto(photoUrl).then((url) => active && setResolved(url));
    return () => {
      active = false;
    };
  }, [photoUrl]);

  const size = className ?? (compact ? "h-11 w-11" : featured ? "h-28 w-28" : "h-24 w-24");

  if (poster && cutout) {
    return (
      <div className={`${size} flex items-end justify-center overflow-visible bg-transparent`}>
        {resolved ? (
          <img
            src={resolved}
            alt={`تصویر بدون پس‌زمینه ${name}`}
            className="h-full w-full object-contain object-bottom"
            draggable={false}
          />
        ) : (
          <span className="font-display text-2xl font-black text-amber-100">{initials(name)}</span>
        )}
      </div>
    );
  }

  return (
    <Avatar
      className={`${size} ${poster ? "border-0 bg-transparent shadow-none ring-0" : "border-[3px] border-[#D4AF37] bg-white shadow-xl ring-2 ring-white/35"}`}
    >
      {resolved ? (
        <img
          src={resolved}
          alt={`عکس ${name}`}
          className="h-full w-full rounded-full object-cover object-center"
        />
      ) : (
        <AvatarFallback
          className={`${poster ? "bg-transparent text-amber-100" : "bg-emerald-900 text-amber-200"} font-display font-black ${compact ? "text-sm" : "text-2xl"}`}
        >
          {initials(name)}
        </AvatarFallback>
      )}
    </Avatar>
  );
}

function RankIcon({ index }: { index: number }) {
  if (index === 0) return <Crown className="h-6 w-6 text-amber-600" />;
  if (index === 1) return <Medal className="h-6 w-6 text-slate-500" />;
  if (index === 2) return <Award className="h-6 w-6 text-orange-600" />;
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
      {toFa(index + 1)}
    </span>
  );
}

function ClassResultCard({
  item,
  rank,
  backgroundUrl,
  layout,
  onStudentClick,
}: {
  item: ClassResult;
  rank: number;
  backgroundUrl: string;
  layout: NajmPosterLayout;
  onStudentClick: (student: StudentResult) => void;
}) {
  return (
    <ClassResultsPoster
      backgroundUrl={backgroundUrl}
      layout={layout}
      item={item}
      rank={rank}
      onStudentClick={onStudentClick}
    />
  );
}

function StudentResultDetails({
  student,
  sessionById,
}: {
  student: StudentResult;
  sessionById: Map<string, SessionRow>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <DetailStat label="امتیاز کل" value={student.total} />
        <DetailStat label="میانگین" value={`${fixed(student.average)}/۳۰`} />
        <DetailStat label="عملکرد" value={`${toFa(Math.round(student.performance))}٪`} />
        <DetailStat label="حضور" value={`${toFa(student.attendanceRate)}٪`} />
        <DetailStat label="غیبت" value={student.absent} />
      </div>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-secondary/50 text-xs">
            <tr>
              <th className="p-3 text-right">تاریخ</th>
              <th className="p-3 text-right">حضور</th>
              <th className="p-3 text-right">تکلیف</th>
              <th className="p-3 text-right">آزمون</th>
              <th className="p-3 text-right">انضباط</th>
              <th className="p-3 text-right">پیشرفت</th>
              <th className="p-3 text-right">کمک</th>
              <th className="p-3 text-right">منفی</th>
              <th className="p-3 text-right">جبران</th>
              <th className="p-3 text-right">امتیاز</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {student.records.map((record) => {
              const session = sessionById.get(record.session_id);
              const absent = record.is_absent === true || numberValue(record.attendance) === 0;
              return (
                <tr key={record.id}>
                  <td className="p-3 font-medium">{toFa(session?.session_date ?? "—")}</td>
                  <td className="p-3">
                    {absent ? (
                      <Badge variant="destructive">غایب</Badge>
                    ) : (
                      `${toFa(record.attendance)}/۵`
                    )}
                  </td>
                  <td className="p-3">{absent ? "—" : `${toFa(record.homework)}/۵`}</td>
                  <td className="p-3">
                    {absent ? "—" : `${toFa(numberValue(record.exam_raw) + 10)}/۲۰`}
                  </td>
                  <td className="p-3">{absent ? "—" : `${toFa(record.discipline)}/۵`}</td>
                  <td className="p-3">{toFa(record.special_progress)}</td>
                  <td className="p-3">{toFa(record.special_help)}</td>
                  <td className="p-3 text-rose-700">
                    {toFa(
                      numberValue(record.negative_disorder) +
                        numberValue(record.negative_disrespect) * 2,
                    )}
                  </td>
                  <td className="p-3">
                    {numberValue(record.recovery_bonus) > 0 && session ? (
                      <ConductRecoveryHistoryDialog
                        studentId={record.student_id}
                        sessionId={record.session_id}
                        recoveryBonus={numberValue(record.recovery_bonus)}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 font-black text-emerald-800">
                    {toFa(record.session_score)}/۳۰
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-secondary/40 p-3 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-black">
        {typeof value === "number" ? toFa(value) : value}
      </p>
    </div>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <Card className="rounded-3xl border-dashed p-12 text-center text-sm text-muted-foreground">
      {text}
    </Card>
  );
}

const resultsStyles = `
.najm-results-page {
  background: radial-gradient(circle at 18% 12%, rgba(212,175,55,.09), transparent 24%), radial-gradient(circle at 82% 18%, rgba(6,78,59,.06), transparent 26%), linear-gradient(135deg, #f7f0df 0%, #eee3c8 46%, #fbf6ea 100%);
  color: #17352c;
  font-family: Vazirmatn, IRANSans, Tahoma, Arial, sans-serif;
}
.najm-results-page::before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .34; background-image: radial-gradient(circle at 20% 25%, rgba(80,65,35,.10) 0 1px, transparent 1.4px), radial-gradient(circle at 70% 70%, rgba(255,255,255,.42) 0 1px, transparent 1.6px), linear-gradient(45deg, rgba(90,75,45,.035) 25%, transparent 25%, transparent 75%, rgba(90,75,45,.035) 75%); background-size: 18px 18px, 26px 26px, 42px 42px; z-index: 0; }
.najm-results-page > * { position: relative; z-index: 1; }
.najm-results-page h1, .najm-results-page h2, .najm-results-page h3, .font-display { font-family: "Noto Naskh Arabic", "Times New Roman", Vazirmatn, serif; letter-spacing: -0.015em; }
.najm-compact-header { min-height: 0 !important; height: auto !important; background: linear-gradient(145deg, rgba(212,175,55,.10), rgba(220,235,227,.98) 46%, rgba(6,78,59,.08)); box-shadow: 10px 10px 24px rgba(6,78,59,.16), -10px -10px 24px rgba(255,255,255,.78); }
.najm-compact-header::before { content: ""; position: absolute; inset: 0; background-image: radial-gradient(circle at 50% 50%, rgba(212,175,55,.16) 0 2px, transparent 2.8px); background-size: 58px 58px; opacity: .35; pointer-events: none; }
.compact-header-icon, .compact-mini-stat, .compact-button { background: #dcebe3; box-shadow: 6px 6px 13px rgba(6,78,59,.16), -6px -6px 13px rgba(255,255,255,.82); }
.compact-header-icon { color: #064E3B; background: linear-gradient(145deg, rgba(212,175,55,.25), #dcebe3 60%); }
.compact-button { min-height: 36px; }
.soft-icon { background: #dcebe3; box-shadow: 7px 7px 15px rgba(6,78,59,.20), -7px -7px 15px rgba(255,255,255,.84); color: #064E3B; }
.najm-scope-navigator, .najm-result-panel, .najm-export-panel, .najm-poster-control, .najm-result-stat, .najm-section-heading { position: relative; overflow: hidden; background: rgba(241,232,208,.92); box-shadow: 14px 14px 30px rgba(6,78,59,.22), -14px -14px 30px rgba(255,255,255,.78); }
.najm-scope-navigator::before, .najm-result-panel::before, .najm-export-panel::before, .najm-poster-control::before, .najm-result-stat::before, .najm-section-heading::before { content: ""; position: absolute; inset: 0; pointer-events: none; background-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22180%22%20height%3D%22130%22%20viewBox%3D%220%200%20180%20130%22%3E%0A%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23D4AF37%22%20stroke-width%3D%221.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20opacity%3D%220.34%22%3E%0A%20%20%20%20%3Cpath%20d%3D%22M-18%2092%20C24%2034%2C%2065%2036%2C%2090%2070%20S145%20110%2C%20198%2032%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M-10%2038%20C32%2088%2C%2072%2090%2C%2095%2054%20S150%206%2C%20190%2080%22%20opacity%3D%220.75%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M42%2059%20C34%2045%2C%2037%2033%2C%2051%2027%20C52%2042%2C%2054%2053%2C%2042%2059Z%22%20fill%3D%22%23D4AF37%22%20opacity%3D%220.22%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M78%2072%20C90%2058%2C%20104%2058%2C%20116%2071%20C101%2077%2C%2090%2081%2C%2078%2072Z%22%20fill%3D%22%23FDE68A%22%20opacity%3D%220.18%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M132%2062%20C123%2047%2C%20127%2034%2C%20142%2028%20C143%2044%2C%20145%2056%2C%20132%2062Z%22%20fill%3D%22%23D4AF37%22%20opacity%3D%220.20%22%2F%3E%0A%20%20%20%20%3Ccircle%20cx%3D%2290%22%20cy%3D%2270%22%20r%3D%222.1%22%20fill%3D%22%23FDE68A%22%20opacity%3D%220.45%22%2F%3E%0A%20%20%20%20%3Ccircle%20cx%3D%2295%22%20cy%3D%2254%22%20r%3D%221.9%22%20fill%3D%22%23FDE68A%22%20opacity%3D%220.38%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23064E3B%22%20stroke-width%3D%221%22%20stroke-linecap%3D%22round%22%20opacity%3D%220.12%22%3E%0A%20%20%20%20%3Cpath%20d%3D%22M20%20108%20C50%2078%2C%2075%2084%2C%2092%20104%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M115%2020%20C142%2049%2C%20162%2044%2C%20178%2024%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E"); background-size: 172px 124px; background-position: 10px 8px; opacity: .58; }
.najm-scope-navigator > *, .najm-result-panel > *, .najm-export-panel > *, .najm-poster-control > *, .najm-result-stat > *, .najm-section-heading > * { position: relative; z-index: 1; }
.najm-poster-control { border-color: rgba(6,78,59,.18); }
.najm-result-panel [data-slot="select-trigger"], .najm-result-panel input { border-color: rgba(6,78,59,.22); background: rgba(255,255,255,.84); border-radius: 1rem; }
.najm-podium { perspective: 1200px; transform-style: preserve-3d; }
.najm-podium-card { transform-style: preserve-3d; box-shadow: 0 20px 38px rgba(6,78,59,.16), 12px 12px 26px rgba(6,78,59,.18), -12px -12px 26px rgba(255,255,255,.76), inset 0 2px 0 rgba(255,255,255,.45); }
.najm-podium-first { border-color: rgba(184,134,11,.42); background: linear-gradient(145deg, rgba(212,175,55,.72), rgba(244,202,77,.48) 38%, #f2e8cd 72%); box-shadow: 0 28px 55px rgba(184,134,11,.22), 18px 18px 34px rgba(6,78,59,.24), -16px -16px 30px rgba(255,255,255,.78), inset 0 0 0 1px rgba(212,175,55,.55), 0 14px 34px rgba(184,134,11,.22); }
.najm-podium-second { border-color: rgba(148,163,184,.38); background: linear-gradient(145deg, rgba(212,175,55,.28), rgba(255,232,145,.20) 42%, #f2e8cd 74%); box-shadow: 8px 8px 18px rgba(6,78,59,.18), -8px -8px 18px rgba(255,255,255,.82), inset 0 0 0 1px rgba(212,175,55,.32); }
.najm-podium-third { border-color: rgba(180,105,35,.34); background: linear-gradient(145deg, rgba(184,134,11,.30), rgba(212,175,55,.16) 42%, #f2e8cd 74%); box-shadow: 8px 8px 18px rgba(6,78,59,.18), -8px -8px 18px rgba(255,255,255,.82), inset 0 0 0 1px rgba(184,134,11,.30); }
.najm-ranking-list { background: linear-gradient(135deg, rgba(255,248,231,.82), rgba(247,237,210,.72)); box-shadow: inset 8px 8px 18px rgba(6,78,59,.14), inset -8px -8px 18px rgba(255,255,255,.78); }
.class-result-card { transition: transform .25s ease, box-shadow .25s ease; }
.class-result-card:hover { transform: translateY(-7px); box-shadow: inset 0 0 0 1px rgba(212,175,55,.18), 0 24px 48px rgba(6,78,59,.16); }
.najm-result-dialog { background: linear-gradient(145deg, #fffdf6, rgba(241,232,208,.94)); border: 1px solid rgba(6,78,59,.20); border-radius: 1.8rem; box-shadow: 0 26px 60px rgba(6,78,59,.22); }
.najm-poster-scroll {
  width:100%;
  overflow-x:auto;
  overscroll-behavior-inline:contain;
  padding:2px 2px 12px;
  scrollbar-color:rgba(212,175,55,.58) rgba(7,24,45,.10);
  scrollbar-width:thin;
}
.najm-poster-shell {
  background:#07182d;
  box-shadow:0 28px 65px rgba(2,15,30,.28),0 0 0 1px rgba(212,175,55,.18);
}
.najm-overall-poster {
  width:min(820px,100%);
  min-width:700px;
}
.najm-class-poster {
  width:min(1200px,100%);
  min-width:760px;
}
.najm-poster-canvas {
  container-type:inline-size;
  isolation:isolate;
}
.poster-header {
  z-index:5;
  text-shadow:none;
}
.poster-overall-header {
  left:8%;
  right:8%;
  top:3.8%;
  height:8%;
}
.poster-class-header {
  left:7%;
  right:7%;
  top:4%;
  height:12.5%;
}
.poster-title { font-size:clamp(26px,4.2cqw,94px); line-height:1.12; }
.poster-subtitle { font-size:clamp(13px,2cqw,44px); line-height:1.45; }
.class-poster-title { font-size:clamp(20px,2.65cqw,42px); line-height:1.15; }
.class-poster-subtitle { font-size:clamp(11px,1.25cqw,20px); line-height:1.4; }
.poster-top-person {
  z-index:4;
  transform-origin:50% 50%;
}
.poster-top-person[data-mode="overall"][data-first="true"] { width:31%; }
.poster-top-person[data-mode="overall"][data-first="false"] { width:27.5%; }
.poster-top-person[data-mode="class"][data-first="true"] { width:28%; }
.poster-top-person[data-mode="class"][data-first="false"] { width:25%; }
.poster-top-photo {
  box-sizing:border-box;
  overflow:hidden;
  border:0;
  border-radius:999px;
  padding:0;
  background:transparent;
  box-shadow:none;
}
.poster-top-person[data-mode="overall"][data-first="true"] .poster-top-photo { width:44.35%; }
.poster-top-person[data-mode="overall"][data-first="false"] .poster-top-photo { width:43.18%; }
.poster-top-person[data-mode="class"][data-first="true"] .poster-top-photo { width:49.1%; }
.poster-top-person[data-mode="class"][data-first="false"] .poster-top-photo { width:47.5%; }
.poster-person-info {
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  width:100%;
  box-sizing:border-box;
  padding:0;
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  text-shadow:none;
  backdrop-filter:none;
}
.poster-top-person[data-mode="overall"] .poster-person-info { height:9%; }
.poster-top-person[data-mode="class"] .poster-person-info { height:14.5%; }
.poster-person-name {
  overflow:hidden;
  max-width:100%;
  text-overflow:ellipsis;
  white-space:nowrap;
  line-height:1.24;
  text-shadow:none;
}
.poster-top-person[data-mode="overall"] .poster-person-name { font-size:clamp(16px,2.15cqw,34px); }
.poster-top-person[data-mode="overall"][data-first="true"] .poster-person-name { font-size:clamp(17px,2.45cqw,39px); }
.poster-top-person[data-mode="class"] .poster-person-name { font-size:clamp(16px,2.15cqw,34px); }
.poster-top-person[data-mode="class"][data-first="true"] .poster-person-name { font-size:clamp(17px,2.45cqw,39px); }
.poster-person-class {
  color:#e8f3ff;
  font-weight:700;
  line-height:1.35;
  text-shadow:none;
}
.poster-person-class span {
  color:#9fc8ee;
  font-weight:500;
}
.poster-top-person[data-mode="overall"] .poster-person-class {
  margin-top:.68cqw;
  font-size:clamp(11px,1.35cqw,22px);
}
.poster-top-person[data-mode="class"] .poster-person-class {
  margin-top:.68cqw;
  font-size:clamp(11px,1.35cqw,22px);
}
.poster-person-stats {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:.75cqw;
  color:#f7fbff;
  white-space:nowrap;
  text-shadow:none;
}
.poster-person-stats b { color:#ffe38a; font-weight:900; }
.poster-top-person[data-mode="overall"] .poster-person-stats {
  margin-top:.82cqw;
  font-size:clamp(11px,1.45cqw,23px);
}
.poster-top-person[data-mode="class"] .poster-person-stats {
  margin-top:.82cqw;
  font-size:clamp(11px,1.45cqw,23px);
}
.poster-list-row {
  z-index:3;
  direction:rtl;
  display:grid;
  align-items:center;
  box-sizing:border-box;
  overflow:visible;
  padding:0;
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  backdrop-filter:none;
  text-shadow:none;
}
.poster-list-row[data-mode="overall"] {
  left:7%;
  width:86%;
  height:6.25%;
  grid-template-columns:10% 15% 35% 23% 17%;
}
.poster-list-row[data-mode="class"] {
  left:12%;
  width:76%;
  height:11.5%;
  grid-template-columns:12% 14% 34% 23% 17%;
}
.poster-row-rank {
  display:block;
  justify-self:center;
  aspect-ratio:auto;
  border:0;
  border-radius:0;
  color:#f8d56a;
  background:transparent;
  box-shadow:none;
  white-space:nowrap;
  text-shadow:none;
}
.poster-list-row[data-mode="overall"] .poster-row-rank {
  height:auto;
  font-size:clamp(12px,1.34cqw,22px);
}
.poster-list-row[data-mode="class"] .poster-row-rank {
  height:auto;
  font-size:clamp(12px,1.34cqw,22px);
}
.poster-row-avatar {
  box-sizing:border-box;
  justify-self:center;
  overflow:hidden;
  border:0;
  border-radius:999px;
  padding:0;
  background:transparent;
  box-shadow:none;
}
.poster-list-row[data-mode="overall"] .poster-row-avatar { height:69%; }
.poster-list-row[data-mode="class"] .poster-row-avatar { height:82%; }
.poster-row-name {
  padding-inline:.55cqw;
  color:#fff0ad;
  text-align:right;
  line-height:1.25;
  text-shadow:none;
}
.poster-list-row[data-mode="overall"] .poster-row-name { font-size:clamp(14px,1.82cqw,29px); }
.poster-list-row[data-mode="class"] .poster-row-name { font-size:clamp(14px,1.82cqw,29px); }
.poster-row-class,
.poster-row-score {
  display:flex;
  min-width:0;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  line-height:1.18;
  white-space:nowrap;
  text-shadow:none;
}
.poster-row-class small,
.poster-row-score small {
  margin-bottom:.18cqw;
  color:#9fc8ee;
  font-weight:500;
}
.poster-row-class b,
.poster-row-score b {
  max-width:100%;
  overflow:hidden;
  color:#f3f8ff;
  font-weight:900;
  text-overflow:ellipsis;
}
.poster-row-score b { color:#ffe38a; }
.poster-list-row[data-mode="overall"] .poster-row-class b,
.poster-list-row[data-mode="overall"] .poster-row-score b { font-size:clamp(12px,1.42cqw,23px); }
.poster-list-row[data-mode="overall"] .poster-row-class small,
.poster-list-row[data-mode="overall"] .poster-row-score small { font-size:clamp(9px,.88cqw,14px); }
.poster-list-row[data-mode="class"] .poster-row-class b,
.poster-list-row[data-mode="class"] .poster-row-score b { font-size:clamp(12px,1.42cqw,23px); }
.poster-list-row[data-mode="class"] .poster-row-class small,
.poster-list-row[data-mode="class"] .poster-row-score small { font-size:clamp(9px,.88cqw,14px); }
.poster-free-element {
  box-sizing:border-box;
  margin:0;
  padding:0;
  border:0;
  background:transparent;
  box-shadow:none;
  text-shadow:none;
  outline:none;
  touch-action:none;
}
.poster-free-element-editing:not(.poster-free-element-locked) { cursor:move; }
.poster-free-element-editing.poster-free-element-locked { cursor:not-allowed; }
.poster-free-photo {
  overflow:visible;
  border-radius:999px;
}
.poster-free-text {
  direction:rtl;
  border-radius:.25rem;
}
.poster-free-element-selected {
  overflow:visible!important;
  outline:2px solid #f59e0b;
  outline-offset:2px;
  background:rgba(245,158,11,.08);
}
.poster-free-element-locked.poster-free-element-selected {
  outline-color:#64748b;
}
.poster-resize-handle {
  position:absolute;
  z-index:20;
  width:12px;
  height:12px;
  border:2px solid white;
  border-radius:999px;
  background:#f59e0b;
  box-shadow:0 1px 4px rgba(0,0,0,.45);
}
.poster-resize-nw { top:-7px; left:-7px; cursor:nwse-resize; }
.poster-resize-ne { top:-7px; right:-7px; cursor:nesw-resize; }
.poster-resize-sw { bottom:-7px; left:-7px; cursor:nesw-resize; }
.poster-resize-se { right:-7px; bottom:-7px; cursor:nwse-resize; }
.najm-layout-workspace {
  background:
    radial-gradient(circle at 50% 10%,rgba(212,175,55,.12),transparent 28%),
    linear-gradient(145deg,#eee6d6,#e3d9c4);
}
.najm-layout-workspace:focus { outline:none; }
.najm-layout-canvas {
  container-type:inline-size;
  box-shadow:0 24px 64px rgba(2,15,30,.32),0 0 0 1px rgba(212,175,55,.34);
  touch-action:none;
}
.najm-layout-canvas-overall {
  width:min(650px,100%);
  min-width:520px;
}
.najm-layout-canvas-class {
  width:min(900px,100%);
  min-width:700px;
}
.result-rank-card { min-height:180px; }
@media (prefers-reduced-motion:reduce) {
  .najm-results-page * { transition:none!important; }
}
`;
