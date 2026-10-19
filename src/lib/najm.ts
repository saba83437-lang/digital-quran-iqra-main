// ============================================================
//  طرح نجم - ماژول منطق و دیتابیس (src/lib/najm.ts)
//  هم‌سبک با بقیه‌ی فایل‌های src/lib پروژه.
//
//  نسخه جدید (2026-07-26): مدیریت پویای آیتم‌های ثبت جلسه
//  - تعریف آیتم‌ها در جدول najm_score_items (مدیریت از پنل مدیر)
//  - فرم ثبت جلسه استاد و محاسبه امتیاز بر اساس همین تنظیمات است
//  - تنظیمات کلی (ناجم_settings) مثل انتقال خودکار نمره آزمون
//  - مقادیر آیتم‌های سفارشی در ستون custom_scores (jsonb) ذخیره می‌شوند
//  - ۸ آیتم پایه همچنان در ستون‌های ثابت قبلی ذخیره می‌شوند و
//    سوابق گذشته کاملاً «منجمد» و بدون تغییر باقی می‌مانند
// ============================================================
import { supabase } from "./supabase";
import { getCurrentTeacher } from "./teacher-utils";

/* ----------------------------- ثابت‌ها ----------------------------- */
export const NAJM_LOCK_MS = 6 * 60 * 60 * 1000; // محدودیت ویرایش: ۶ ساعت

export const NAJM_MAX = {
  attendance: 5,
  homework: 5,
  exam: 10,
  discipline: 5,
  specialProgress: 3,
  specialHelp: 2,
  negativeDisorder: 5, // هر بار ۱−
  negativeDisrespect: 5, // هر بار ۲−
} as const;

export type NajmTerm = "term1" | "term2" | "summer";

export const NAJM_TERMS: { value: NajmTerm; label: string }[] = [
  { value: "term1", label: "ترم اول" },
  { value: "term2", label: "ترم دوم" },
  { value: "summer", label: "ترم تابستانی" },
];

/* ----------------------------- آیتم‌های امتیازی (جدید) ----------------------------- */

export type NajmItemKind = "positive" | "special" | "negative";

export interface NajmScoreItem {
  id?: string;
  item_key: string; // برای ۸ آیتم پایه = نام ستون رکورد؛ برای آیتم‌های جدید = custom_*
  label: string;
  kind: NajmItemKind;
  max_score: number;
  weight: number; // ضریب (برای آیتم منفی: کسر به‌ازای هر واحد)
  is_core: boolean; // فقط «حضور» — همیشه فعال و غیرقابل حذف
  is_active: boolean;
  default_value: number;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
}

/** کلید آیتم هسته‌ای حضور (منطق غیبت به همین کلید گره خورده است). */
export const NAJM_ATTENDANCE_KEY = "attendance";
/** کلید آیتم آزمون (منطق نمایش +۱۰ و انتقال به جدول نمرات). */
export const NAJM_EXAM_KEY = "exam_raw";

/** کلیدهایی که در ستون‌های ثابت najm_session_records ذخیره می‌شوند. */
export const NAJM_CORE_ITEM_KEYS = [
  "attendance",
  "homework",
  "exam_raw",
  "discipline",
  "special_progress",
  "special_help",
  "negative_disorder",
  "negative_disrespect",
] as const;

/** آیا این کلید در یک ستون ثابت ذخیره می‌شود یا در custom_scores؟ */
export function isCoreNajmColumn(itemKey: string): boolean {
  return (NAJM_CORE_ITEM_KEYS as readonly string[]).includes(itemKey);
}

/**
 * آیتم‌های پیش‌فرض — منطبق بر رفتار فعلی سیستم.
 * اگر جدول najm_score_items هنوز ساخته/سید نشده باشد، از این لیست استفاده
 * می‌شود تا هیچ‌وقت فرم ثبت جلسه خالی یا خراب نشود.
 */
export const NAJM_DEFAULT_ITEMS: NajmScoreItem[] = [
  {
    item_key: "attendance",
    label: "حضور",
    kind: "positive",
    max_score: 5,
    weight: 1,
    is_core: true,
    is_active: true,
    default_value: 5,
    sort_order: 1,
  },
  {
    item_key: "homework",
    label: "تکلیف",
    kind: "positive",
    max_score: 5,
    weight: 1,
    is_core: false,
    is_active: true,
    default_value: 0,
    sort_order: 2,
  },
  {
    item_key: "exam_raw",
    label: "آزمون",
    kind: "positive",
    max_score: 10,
    weight: 1,
    is_core: false,
    is_active: true,
    default_value: 0,
    sort_order: 3,
  },
  {
    item_key: "discipline",
    label: "نظم و اخلاق",
    kind: "positive",
    max_score: 5,
    weight: 1,
    is_core: false,
    is_active: true,
    default_value: 0,
    sort_order: 4,
  },
  {
    item_key: "special_progress",
    label: "پیشرفت ویژه",
    kind: "special",
    max_score: 3,
    weight: 1,
    is_core: false,
    is_active: true,
    default_value: 0,
    sort_order: 5,
  },
  {
    item_key: "special_help",
    label: "کمک ویژه",
    kind: "special",
    max_score: 2,
    weight: 1,
    is_core: false,
    is_active: true,
    default_value: 0,
    sort_order: 6,
  },
  {
    item_key: "negative_disorder",
    label: "بی‌نظمی",
    kind: "negative",
    max_score: 5,
    weight: 1,
    is_core: false,
    is_active: true,
    default_value: 0,
    sort_order: 7,
  },
  {
    item_key: "negative_disrespect",
    label: "بی‌احترامی",
    kind: "negative",
    max_score: 5,
    weight: 1,
    is_core: false,
    is_active: true,
    default_value: 0,
    sort_order: 8,
  },
];

export const NAJM_ITEM_KIND_META: Record<NajmItemKind, { label: string; hint: string }> = {
  positive: { label: "مثبت", hint: "امتیاز مستقیم به جمع جلسه اضافه می‌کند" },
  special: { label: "ویژه", hint: "امتیاز تشویقی خاص؛ با رنگ طلایی نمایش داده می‌شود" },
  negative: { label: "منفی", hint: "به‌ازای هر واحد، به اندازه ضریب از امتیاز کم می‌کند" },
};

/** مرتب‌سازی امن آیتم‌ها بر اساس sort_order. */
export function sortNajmItems<T extends { sort_order: number; item_key: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.item_key.localeCompare(b.item_key);
  });
}

/** فقط آیتم‌های فعال (ستون‌های فرم ثبت جلسه استاد). */
export function activeNajmItems(items: NajmScoreItem[]): NajmScoreItem[] {
  return sortNajmItems(items).filter((i) => i.is_active);
}

/** بارگذاری همه آیتم‌ها (فعال و غیرفعال) از دیتابیس؛ در خطا/خلأ → پیش‌فرض. */
export async function loadNajmScoreItems(): Promise<NajmScoreItem[]> {
  const { data, error } = await supabase
    .from("najm_score_items")
    .select(
      "id, item_key, label, kind, max_score, weight, is_core, is_active, default_value, sort_order, created_at, updated_at",
    )
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("najm_score_items load error (fallback to defaults):", error.message);
    return NAJM_DEFAULT_ITEMS;
  }
  if (!data || data.length === 0) return NAJM_DEFAULT_ITEMS;

  const items = sortNajmItems(
    (data as NajmScoreItem[]).map((row) => ({
      ...row,
      max_score: Math.max(1, Number(row.max_score) || 1),
      weight: Math.max(0, Number(row.weight) || 0) || 1,
      default_value: Number(row.default_value) || 0,
      sort_order: Number(row.sort_order) || 0,
    })) as NajmScoreItem[],
  );

  // تضمین وجود آیتم هسته‌ای حضور
  if (!items.some((i) => i.item_key === NAJM_ATTENDANCE_KEY && i.is_active)) {
    const hasAttendance = items.some((i) => i.item_key === NAJM_ATTENDANCE_KEY);
    if (hasAttendance) {
      // اگر به هر دلیلی غیرفعال شده بود، دوباره فعالش می‌کنیم
      return items.map((i) =>
        i.item_key === NAJM_ATTENDANCE_KEY ? { ...i, is_active: true, is_core: true } : i,
      );
    }
    return sortNajmItems([
      { ...NAJM_DEFAULT_ITEMS[0] },
      ...items.map((i) => ({ ...i, sort_order: i.sort_order + 1 })),
    ]);
  }
  return items;
}

/* ----------------------------- تنظیمات کلی طرح نجم ----------------------------- */

export interface NajmSessionSettings {
  /** انتقال خودکار نمره آزمون (۱۰−۲۰) به جدول نمرات هنگام ثبت/ویرایش جلسه. */
  examGradesSync: boolean;
}

export const NAJM_DEFAULT_SETTINGS: NajmSessionSettings = { examGradesSync: true };

export async function loadNajmSessionSettings(): Promise<NajmSessionSettings> {
  const { data, error } = await supabase
    .from("najm_settings")
    .select("key, value")
    .eq("key", "exam_grades_sync")
    .maybeSingle();
  if (error) {
    console.warn("najm_settings load error (fallback to defaults):", error.message);
    return NAJM_DEFAULT_SETTINGS;
  }
  return {
    examGradesSync: (data as { value?: { enabled?: boolean } } | null)?.value?.enabled !== false,
  };
}

export async function saveNajmSessionSettings(
  settings: NajmSessionSettings,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("najm_settings").upsert({
    key: "exam_grades_sync",
    value: { enabled: settings.examGradesSync },
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}

/* ------------------------- انواع غیبت و سیاست رفتار با آن ------------------------- */

/**
 * انواع غیبت (مطابق مهاجرت قانون‌ساز افتخار — ستون absence_kind در رکورد جلسه).
 * غیبت‌های تاریخی «غیرموجه» تلقی می‌شوند (رفتار قبلی حفظ می‌شود).
 */
export const NAJM_ABSENCE_KINDS = [
  { value: "unjustified", label: "غیبت غیرموجه" },
  { value: "justified", label: "غیبت موجه" },
  { value: "medical", label: "غیبت پزشکی" },
  { value: "holiday", label: "تعطیلی رسمی" },
  { value: "cancelled", label: "لغو جلسه" },
  { value: "approved_leave", label: "مرخصی تأییدشده" },
] as const;

export type NajmAbsenceKind = (typeof NAJM_ABSENCE_KINDS)[number]["value"];

export function najmAbsenceKindLabel(kind: string | null | undefined): string {
  return NAJM_ABSENCE_KINDS.find((k) => k.value === kind)?.label ?? "غیبت غیرموجه";
}

/** ورودی نامعتبر → «غیرموجه» (پیش‌فرض سازگار با رفتار قبلی) */
export function normalizeAbsenceKind(kind: string | null | undefined): NajmAbsenceKind {
  return NAJM_ABSENCE_KINDS.some((k) => k.value === kind)
    ? (kind as NajmAbsenceKind)
    : "unjustified";
}

/** اقدام موتور افتخارات برای یک نوع غیبت */
export type NajmAbsencePolicyAction = "ignore" | "break" | "pause" | "review";

export const NAJM_ABSENCE_POLICY_ACTIONS: {
  value: NajmAbsencePolicyAction;
  label: string;
}[] = [
  { value: "ignore", label: "نادیده (اثری ندارد)" },
  { value: "break", label: "قطع زنجیره" },
  { value: "pause", label: "توقف موقت زنجیره" },
  { value: "review", label: "نیازمند بررسی دستی" },
];

export interface NajmAbsencePolicyEntry {
  /** اقدام برای افتخارات مبتنی بر آیتم‌های عادی */
  normal: NajmAbsencePolicyAction;
  /** اقدام برای افتخارات آیتم حضور */
  attendance: NajmAbsencePolicyAction;
}

export interface NajmQuestEngineSettings {
  /** تعداد جلسات هر ماه (پیش‌فرض ۱۲ — برای بازه‌ی «ماه» در قانون‌ساز) */
  sessionsPerMonth: number;
  absencePolicy: Record<NajmAbsenceKind, NajmAbsencePolicyEntry>;
}

/** پیش‌فرض = دقیقاً رفتار قبلی سیستم (غیبت نادیده؛ برای آیتم حضور: غیرموجه شکننده) */
export const NAJM_DEFAULT_QUEST_ENGINE_SETTINGS: NajmQuestEngineSettings = {
  sessionsPerMonth: 12,
  absencePolicy: {
    unjustified: { normal: "ignore", attendance: "break" },
    justified: { normal: "ignore", attendance: "ignore" },
    medical: { normal: "ignore", attendance: "ignore" },
    holiday: { normal: "ignore", attendance: "ignore" },
    cancelled: { normal: "ignore", attendance: "ignore" },
    approved_leave: { normal: "ignore", attendance: "ignore" },
  },
};

export async function loadNajmQuestEngineSettings(): Promise<NajmQuestEngineSettings> {
  const { data, error } = await supabase
    .from("najm_settings")
    .select("key, value")
    .in("key", ["sessions_per_month", "quest_absence_policy"]);
  if (error) {
    console.warn("najm quest engine settings load error (fallback to defaults):", error.message);
    return NAJM_DEFAULT_QUEST_ENGINE_SETTINGS;
  }
  const rows = (data ?? []) as { key: string; value: unknown }[];
  const spm = rows.find((r) => r.key === "sessions_per_month")?.value as
    | { count?: number }
    | undefined;
  const policyRaw = rows.find((r) => r.key === "quest_absence_policy")?.value as
    | Record<string, { normal?: string; attendance?: string }>
    | undefined;
  const count = Number(spm?.count);
  const absencePolicy = { ...NAJM_DEFAULT_QUEST_ENGINE_SETTINGS.absencePolicy };
  for (const kind of NAJM_ABSENCE_KINDS) {
    const entry = policyRaw?.[kind.value];
    const isAction = (v: unknown): v is NajmAbsencePolicyAction =>
      v === "ignore" || v === "break" || v === "pause" || v === "review";
    absencePolicy[kind.value] = {
      normal: isAction(entry?.normal) ? entry.normal : absencePolicy[kind.value].normal,
      attendance: isAction(entry?.attendance)
        ? entry.attendance
        : absencePolicy[kind.value].attendance,
    };
  }
  return {
    sessionsPerMonth: Number.isFinite(count) && count >= 1 && count <= 60 ? Math.round(count) : 12,
    absencePolicy,
  };
}

export async function saveNajmQuestEngineSettings(
  settings: NajmQuestEngineSettings,
): Promise<{ error: string | null }> {
  const sessionsPerMonth = Math.min(Math.max(Math.round(settings.sessionsPerMonth || 12), 1), 60);
  const now = new Date().toISOString();
  const { error } = await supabase.from("najm_settings").upsert([
    { key: "sessions_per_month", value: { count: sessionsPerMonth }, updated_at: now },
    { key: "quest_absence_policy", value: settings.absencePolicy, updated_at: now },
  ]);
  return { error: error?.message ?? null };
}

/* ----------------------------- دسترسی پویای مقادیر رکورد ----------------------------- */

/** محدودکردن عدد به بازه (ورودی‌های نامعتبر → min). */
export function clampNajmScore(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** خواندن مقدار یک آیتم از رکورد (ستون ثابت یا custom_scores). */
export function getNajmItemValue(
  record: object | null | undefined,
  item: Pick<NajmScoreItem, "item_key">,
): number {
  if (!record) return 0;
  const rec = record as Record<string, unknown> & {
    custom_scores?: Record<string, number>;
    /** امتیاز جبرانی ثبت‌شده برای همین جلسه */
    recovery_bonus?: number;
  };
  if (isCoreNajmColumn(item.item_key)) return Number(rec[item.item_key] ?? 0) || 0;
  return Number(rec?.custom_scores?.[item.item_key] ?? 0) || 0;
}

/** ساخت رکورد جدید با مقدار جدید برای یک آیتم (بدون جهش در رکورد قبلی). */
export function withNajmItemValue<T extends object>(
  record: T,
  item: NajmScoreItem,
  value: number,
): T {
  const v = clampNajmScore(value, 0, item.max_score);
  if (isCoreNajmColumn(item.item_key)) return { ...record, [item.item_key]: v } as T;
  const cs = (record as { custom_scores?: Record<string, number> }).custom_scores ?? {};
  return { ...record, custom_scores: { ...cs, [item.item_key]: v } } as T;
}

/** آیتم حضور از روی لیست (در صورت نبود، پیش‌فرض ساخته می‌شود). */
export function najmAttendanceItem(items: NajmScoreItem[]): NajmScoreItem {
  return items.find((i) => i.item_key === NAJM_ATTENDANCE_KEY) ?? { ...NAJM_DEFAULT_ITEMS[0] };
}

/** سقف امتیاز حضور (برای نمایش «X دقیقه تأخیر» و توضیحات). */
export function najmAttendanceMax(items: NajmScoreItem[]): number {
  return najmAttendanceItem(items).max_score;
}

/** آیتم آزمون فعال (در صورت وجود). */
export function najmExamItem(items: NajmScoreItem[]): NajmScoreItem | null {
  return items.find((i) => i.item_key === NAJM_EXAM_KEY && i.is_active) ?? null;
}

/**
 * حداکثر امتیاز ممکن یک جلسه بر اساس آیتم‌های فعال.
 * مجموع (max_score × weight) آیتم‌های مثبت/ویژه — آیتم‌های منفی فقط کم می‌کنند،
 * پس در سقف لحاظ نمی‌شوند. اگر چیزی فعال نباشد → پیش‌فرض ۳۰ (رفتار قبلی).
 * هم‌ارز تابع سرور public.najm_max_session_score() است.
 */
export function najmMaxSessionScore(items: NajmScoreItem[]): number {
  const max = items
    .filter((item) => item.is_active && item.kind !== "negative")
    .reduce((sum, item) => sum + Math.max(0, item.max_score) * Math.max(0, item.weight), 0);
  return max > 0 ? max : 30;
}

/**
 * محاسبه امتیاز جلسه بر اساس آیتم‌ها:
 * - اگر حضور = ۰ → امتیاز ۰ (غیبت)
 * - امتیاز = حداکثر(۰، جمع مثبت‌ها − جمع منفی‌ها)
 * توجه: این تابع is_active را چک نمی‌کند؛ لیستِ درست (فعال یا همه)
 * را فراخواننده می‌دهد.
 */
export function computeSessionScoreWithItems(
  record: object | null | undefined,
  items: NajmScoreItem[],
): number {
  const att = najmAttendanceItem(items);
  if (isAbsent(getNajmItemValue(record, att))) return 0;
  let positive = 0;
  let negative = 0;
  for (const item of items) {
    // مقادیر بیش از سقف فعلی (مثلاً بعد از کاهش سقف توسط مدیر) در محاسبه لحاظ نمی‌شوند
    const v = clampNajmScore(getNajmItemValue(record, item), 0, item.max_score);
    if (item.kind === "negative") negative += v * item.weight;
    else positive += v * item.weight;
  }
  const recoveryBonus = Math.max(
    0,
    Number((record as { recovery_bonus?: number }).recovery_bonus ?? 0) || 0,
  );
  return Math.max(0, Math.round(positive - negative) + recoveryBonus);
}

/**
 * «تمیزکردن» رکورد بر اساس آیتم‌ها:
 * - همه مقادیر به بازه ۰..سقف خودشان clamp می‌شوند
 * - اگر حضور ۰ باشد، بقیه آیتم‌ها ۰ و is_absent=true می‌شود
 */
export function normalizeRecordWithItems<T extends object>(
  record: T,
  items: NajmScoreItem[],
): T & { is_absent: boolean; custom_scores: Record<string, number> } {
  const att = najmAttendanceItem(items);
  const absent = isAbsent(getNajmItemValue(record, att));
  let next = { ...record, is_absent: absent } as T & {
    is_absent: boolean;
    custom_scores: Record<string, number>;
  };
  for (const item of items) {
    if (absent && item.item_key !== NAJM_ATTENDANCE_KEY) {
      next = withNajmItemValue(next, item, 0);
    } else {
      next = withNajmItemValue(next, item, getNajmItemValue(record, item));
    }
  }
  return next;
}

/** رکورد خالی اولیه برای فرم ثبت جلسه بر اساس پیش‌فرض آیتم‌ها. */
export function emptyNajmRecordFromItems(
  student: { id: string; name: string },
  items: NajmScoreItem[],
): NajmRecordInput {
  const base: NajmRecordInput = {
    student_id: student.id,
    student_name: student.name,
    attendance: NAJM_MAX.attendance,
    homework: 0,
    exam_raw: 0,
    discipline: 0,
    special_progress: 0,
    special_help: 0,
    negative_disorder: 0,
    negative_disrespect: 0,
    custom_scores: {},
  };
  let next = { ...base } as NajmRecordInput;
  for (const item of items) {
    next = withNajmItemValue(next, item, item.default_value);
  }
  return next;
}

/* ----------------------------- انواع ----------------------------- */
export interface NajmRecordInput {
  student_id: string;
  student_name: string;
  attendance: number;
  homework: number;
  exam_raw: number;
  discipline: number;
  special_progress: number;
  special_help: number;
  negative_disorder: number;
  negative_disrespect: number;
  /** مقادیر آیتم‌های سفارشی (کلید آیتم → مقدار) */
  custom_scores?: Record<string, number>;
  /** امتیاز جبرانی ثبت‌شده برای همین جلسه */
  recovery_bonus?: number;
  /** نوع غیبت (فقط وقتی غایب است؛ پیش‌فرض غیرموجه) */
  absence_kind?: NajmAbsenceKind | null;
  /** فقط برای استفاده داخلی هنگام پردازش */
  is_absent?: boolean;
}

export interface NajmSessionInput {
  class_id: string;
  class_name: string;
  session_date: string; // YYYY/MM/DD
  term: NajmTerm;
  academic_year: string;
  records: NajmRecordInput[];
}

/* ----------------------------- منطق محاسبات ----------------------------- */

/** حضور = ۰ یعنی غیبت (بقیه فیلدها صفر و غیرفعال می‌شن). */
export function isAbsent(attendance: number): boolean {
  return attendance === 0;
}

/**
 * نمره آزمون: استاد ۰−۱۰ وارد می‌کنه (همین مقدار در نجم استفاده می‌شه).
 * در پنل مدیر/قرآن‌آموز/والدین ۱۰ واحد بهش اضافه می‌شه → ۱۰−۲۰.
 */
export function examDisplay(examRaw: number): number {
  return examRaw + 10;
}

/** امتیاز جلسه = حداکثر(۰، جمع مثبت − جمع منفی). (نسخه ثابتِ سازگار با قبل) */
export function computeSessionScore(r: NajmRecordInput): number {
  const positive =
    r.attendance + r.homework + r.exam_raw + r.discipline + r.special_progress + r.special_help;
  const negative = r.negative_disorder * 1 + r.negative_disrespect * 1;
  const recoveryBonus = Math.max(0, Number(r.recovery_bonus ?? 0) || 0);
  return Math.max(0, positive - negative + recoveryBonus);
}

/**
 * وقتی حضور = ۰ (غیبت)، تمام فیلدهای دیگه صفر می‌شن.
 * این تابع یک رکورد خام رو «تمیز» می‌کنه تا پیش از ذخیره اعمال بشه.
 * (نسخه ثابتِ سازگار با قبل)
 */
export function normalizeRecord(r: NajmRecordInput): NajmRecordInput {
  if (isAbsent(r.attendance)) {
    return {
      ...r,
      homework: 0,
      exam_raw: 0,
      discipline: 0,
      special_progress: 0,
      special_help: 0,
      negative_disorder: 0,
      negative_disrespect: 0,
      custom_scores: Object.fromEntries(Object.keys(r.custom_scores ?? {}).map((k) => [k, 0])),
    };
  }
  return r;
}

/* ----------------------------- ویژگی: ضریب جایگزین غیبت ----------------------------- */

/**
 * محاسبه مجموع امتیاز با اعمال ضریب جایگزین غیبت
 * - فقط در جمع کل و رتبه‌بندی اعمال می‌شود (رکورد خام جلسه همچنان ۰ می‌ماند)
 * - scope: ترم فعال
 * - اگر دانشجو سابقه حضور نداشت → از میانگین کلاس استفاده می‌شود
 */
export function computeAdjustedTotals(
  records: { attendance: number; session_score: number | string | null }[],
  ratio: number, // مثلاً 0.6 برای ۶۰٪
  classAvg: number, // میانگین امتیاز جلسات حاضرِ هم‌کلاسی‌ها در همین ترم
): { total: number; absentCount: number; replacedCount: number; avg: number } {
  const attended = records.filter((r) => !isAbsent(r.attendance));
  const scores = attended.map((r) => Number(r.session_score ?? 0));

  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : classAvg;

  const absentCount = records.filter((r) => isAbsent(r.attendance)).length;
  const base = scores.reduce((a, b) => a + b, 0);
  const replaced = absentCount * Math.round(ratio * avg);
  const total = base + replaced;

  return {
    total,
    absentCount,
    replacedCount: absentCount,
    avg: Math.round(avg),
  };
}

/* ----------------------------- دیتابیس ----------------------------- */

export interface SavedNajmSession {
  id: string;
  created_at: string;
}

export interface SaveNajmSessionOptions {
  /** آیتم‌های فعال فرم (برای محاسبه پویا). اگر داده نشود، از منطق ثابت قبلی استفاده می‌شود. */
  items?: NajmScoreItem[];
  /** انتقال خودکار نمره آزمون به جدول نمرات؛ پیش‌فرض: روشن */
  examGradesSync?: boolean;
}

/**
 * تشخیص خطای RLS سوپابیس (رد شدن از پالیسی امنیت ردیفی).
 * این خطا وقتی رخ می‌دهد که دیتابیس اجازه‌ی عملیات را نمی‌دهد؛
 * برای مثال وقتی استاد می‌خواهد جلسه‌ای را بعد از ۶ ساعت ویرایش کند.
 */
export function isRlsViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return (
    code === "42501" ||
    code === "42505" ||
    message.includes("row-level security") ||
    message.includes("row level security") ||
    message.includes("rls") ||
    message.includes("violates row-level")
  );
}

/** پیام فارسی مناسب برای خطای قفل ۶ ساعته هنگام ویرایش جلسه. */
export function sessionEditLockMessage(): string {
  return "مهلت ۶ ساعته‌ی ویرایش این جلسه به پایان رسیده است؛ فقط مدیر می‌تواند آن را اصلاح کند.";
}

/**
 * ذخیره یا به‌روزرسانی یک جلسه.
 */
export async function saveNajmSession(
  input: NajmSessionInput,
  existingSessionId?: string,
  options?: SaveNajmSessionOptions,
): Promise<{ sessionId: string; error: string | null }> {
  const teacher = await getCurrentTeacher();
  if (!teacher) return { sessionId: "", error: "پروفایل فعال استاد یافت نشد" };
  const items = options?.items;
  const attMax = items ? najmAttendanceMax(items) : NAJM_MAX.attendance;
  // انتقال نمره فقط وقتی معنا دارد که کلید فعال باشد و آیتم آزمون فعال باشد
  const syncGrades = (options?.examGradesSync ?? true) && (!items || !!najmExamItem(items));

  // رکوردها پیش از فراخوانی ساخته می‌شوند، اما شناسه جلسه فقط در RPC امن تعیین می‌شود.
  const recordRows = input.records.map((raw) => {
    const normalized: NajmRecordInput = items
      ? normalizeRecordWithItems(raw, items)
      : normalizeRecord(raw);
    const score = items
      ? computeSessionScoreWithItems(normalized, items)
      : computeSessionScore(normalized);
    return {
      student_id: normalized.student_id,
      student_name: normalized.student_name,
      is_absent: isAbsent(normalized.attendance),
      ...(isAbsent(normalized.attendance)
        ? { absence_kind: normalizeAbsenceKind(raw.absence_kind) }
        : {}),
      attendance: normalized.attendance,
      homework: normalized.homework,
      exam_raw: normalized.exam_raw,
      discipline: normalized.discipline,
      special_progress: normalized.special_progress,
      special_help: normalized.special_help,
      negative_disorder: normalized.negative_disorder,
      negative_disrespect: normalized.negative_disrespect,
      ...(Object.keys(normalized.custom_scores ?? {}).length > 0
        ? { custom_scores: normalized.custom_scores }
        : {}),
      session_score: score,
    };
  });

  // جلسه و رکوردهای آن در یک تراکنش سمت سرور ذخیره می‌شوند؛ در نتیجه در مرز
  // ۶ ساعت، حذف رکوردهای قدیمی بدون ثبت جایگزین ممکن نیست.
  const { data: saveResult, error: saveError } = await supabase.rpc("secure_save_najm_session", {
    p_existing_session_id: existingSessionId ?? null,
    p_class_id: input.class_id,
    p_class_name: input.class_name,
    p_session_date: input.session_date,
    p_term: input.term,
    p_academic_year: input.academic_year,
    p_records: recordRows,
  });

  if (saveError) {
    const secureError = String(saveError.message ?? "");
    let error = secureError;
    if (secureError.includes("NAJM_EDIT_WINDOW_EXPIRED")) {
      error = sessionEditLockMessage();
    } else if (secureError.includes("NAJM_RECOVERY_TARGET_RECORD_REQUIRED")) {
      error =
        "این جلسه دارای سابقه جبران ثبت‌شده است و رکورد مقصد آن قابل حذف نیست. لطفاً فهرست قرآن‌آموزان جلسه را بررسی کنید.";
    } else if (
      /NAJM_(CLASS|STUDENT|SESSION)_ACCESS_DENIED|ACTIVE_TEACHER_PROFILE_REQUIRED/.test(secureError)
    ) {
      error = "دسترسی لازم برای ثبت یا ویرایش این جلسه وجود ندارد.";
    }
    return { sessionId: existingSessionId ?? "", error };
  }

  const sessionId = String((saveResult as { session_id?: string } | null)?.session_id ?? "");
  if (!sessionId) {
    return { sessionId: "", error: "پاسخ ثبت امن جلسه نامعتبر است" };
  }

  // ۳. توزیع به پنل مدیر: حضور و غیاب
  const studentIds = input.records.map((r) => r.student_id);
  const { error: deleteAttendanceError } = await supabase
    .from("attendance")
    .delete()
    .eq("date", input.session_date)
    .in("student_id", studentIds)
    .like("note", "NJM|%");
  if (deleteAttendanceError)
    return {
      sessionId: sessionId!,
      error: `جلسه ذخیره شد اما پاک‌سازی حضور آینه‌ای ناموفق بود: ${deleteAttendanceError.message}`,
    };
  const attRows = input.records.map((raw) => {
    const absent = isAbsent(raw.attendance);
    return {
      student_id: raw.student_id,
      date: input.session_date,
      status: absent ? "absent" : "present",
      note: `NJM| نجم حضور ${raw.attendance}/${attMax}`,
    };
  });
  const { error: insertAttendanceError } = await supabase.from("attendance").insert(attRows);
  if (insertAttendanceError)
    return {
      sessionId: sessionId!,
      error: `جلسه ذخیره شد اما ثبت حضور آینه‌ای ناموفق بود: ${insertAttendanceError.message}`,
    };

  // ۴. توزیع به پنل مدیر: نمره آزمون (+۱۰ → ۱۰−۲۰)
  //    فقط اگر در تنظیمات فعال باشد و آیتم آزمون فعال باشد
  if (syncGrades) {
    const { error: deleteGradesError } = await supabase
      .from("grades")
      .delete()
      .eq("date", input.session_date)
      .eq("subject", "آزمون طرح نجم")
      .in("student_id", studentIds);
    if (deleteGradesError)
      return {
        sessionId: sessionId!,
        error: `جلسه ذخیره شد اما پاک‌سازی نمرات آینه‌ای ناموفق بود: ${deleteGradesError.message}`,
      };
    const gradeRows = input.records
      .filter((r) => !isAbsent(r.attendance))
      .map((r) => ({
        student_id: r.student_id,
        subject: "آزمون طرح نجم",
        date: input.session_date,
        grade: examDisplay(r.exam_raw),
        teacher: teacher?.name ?? "استاد",
        class_name: input.class_name,
        feedback: "ثبت‌شده از طریق طرح نجم",
        month: input.session_date.split("/")[1],
      }));
    if (gradeRows.length > 0) {
      const { error: insertGradesError } = await supabase.from("grades").insert(gradeRows);
      if (insertGradesError)
        return {
          sessionId: sessionId!,
          error: `جلسه ذخیره شد اما ثبت نمرات آینه‌ای ناموفق بود: ${insertGradesError.message}`,
        };
    }
  }

  return { sessionId: sessionId!, error: null };
}

/** بارگذاری جلسه‌ی ثبت‌شده‌ی یک کلاس در یک تاریخ خاص (برای ویرایش). */
export async function loadNajmSessionForDate(
  classId: string,
  sessionDate: string,
): Promise<{ session: any | null; records: any[] }> {
  const { data: sess } = await supabase
    .from("najm_sessions")
    .select("*")
    .eq("class_id", classId)
    .eq("session_date", sessionDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sess) return { session: null, records: [] };
  const { data: recs } = await supabase
    .from("najm_session_records")
    .select("*")
    .eq("session_id", sess.id);
  return { session: sess, records: recs ?? [] };
}

/** آیا جلسه هنوز در پنجره‌ی ۶ ساعته‌ی ویرایشه؟ */
export function isWithinEditWindow(createdAt: string | null): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < NAJM_LOCK_MS;
}
