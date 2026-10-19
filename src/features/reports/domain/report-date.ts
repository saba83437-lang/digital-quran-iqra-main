export type ReportDateRange = "today" | "week" | "month" | "term" | "all";

export interface ReportDateRangeOptions {
  /** زمان مرجع؛ در برنامه زمان فعلی و در تست یک زمان ثابت است. */
  now?: Date;
  /** شروع و پایان ترم می‌توانند جلالی یا ISO میلادی باشند. */
  termStart?: string | null;
  termEnd?: string | null;
}

export interface ReportDateKeyRange {
  from: string | null;
  to: string | null;
  source: "all" | "rolling" | "term" | "term-fallback";
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_TIME_ZONE = "Asia/Tehran";

const jalaliDateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});

/** همه رقم‌های رایج و جداکننده‌های تاریخ را برای پردازش داخلی یکسان می‌کند. */
export function normalizeReportDigits(value: unknown): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[\u200e\u200f]/g, "")
    .trim();
}

function dateKey(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, "0")}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

/** یک Date میلادی را به کلید مرتب‌شونده جلالی YYYY/MM/DD تبدیل می‌کند. */
export function gregorianDateToJalaliKey(value: Date): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;

  const parts = jalaliDateFormatter.formatToParts(value);
  const year = Number(normalizeReportDigits(parts.find((part) => part.type === "year")?.value));
  const month = Number(normalizeReportDigits(parts.find((part) => part.type === "month")?.value));
  const day = Number(normalizeReportDigits(parts.find((part) => part.type === "day")?.value));
  return dateKey(year, month, day);
}

function gregorianPartsToDate(year: number, month: number, day: number): Date | null {
  if (year < 1700 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  // ساعت میانی UTC مانع جابه‌جایی روز در تبدیل منطقه زمانی تهران می‌شود.
  const result = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    return null;
  }
  return result;
}

/**
 * تاریخ جلالی ذخیره‌شده یا تاریخ ISO میلادی را به کلید جلالی استاندارد تبدیل می‌کند.
 * این تابع تاریخ جلالی را با Date جاوااسکریپت Parse نمی‌کند.
 */
export function normalizeReportDateKey(value: unknown): string | null {
  const normalized = normalizeReportDigits(value);
  if (!normalized || normalized === "—") return null;

  const parts = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\D|$)/);
  if (parts) {
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);

    // سال‌های متداول جلالی را مستقیم نرمال می‌کنیم؛ هیچ تبدیل دستی تقویمی انجام نمی‌شود.
    if (year >= 1200 && year < 1700) return dateKey(year, month, day);

    const gregorianDate = gregorianPartsToDate(year, month, day);
    return gregorianDate ? gregorianDateToJalaliKey(gregorianDate) : null;
  }

  // پشتیبانی از timestampهای استاندارد ISO مانند created_at یا مقدارهای مهاجرت‌یافته آینده.
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : gregorianDateToJalaliKey(parsed);
}

function rollingBoundary(now: Date, daysIncludingToday: number): string | null {
  const safeDays = Math.max(1, Math.floor(daysIncludingToday));
  return gregorianDateToJalaliKey(new Date(now.getTime() - (safeDays - 1) * DAY_MS));
}

/** مرز جلالی دقیق بازه‌های گزارش را تولید می‌کند. */
export function getReportDateKeyRange(
  range: ReportDateRange,
  options: ReportDateRangeOptions = {},
): ReportDateKeyRange {
  if (range === "all") return { from: null, to: null, source: "all" };

  const now = options.now && !Number.isNaN(options.now.getTime()) ? options.now : new Date();
  const today = gregorianDateToJalaliKey(now);
  if (!today) return { from: null, to: null, source: "term-fallback" };

  if (range === "today") return { from: today, to: today, source: "rolling" };
  if (range === "week") {
    return { from: rollingBoundary(now, 7), to: today, source: "rolling" };
  }
  if (range === "month") {
    return { from: rollingBoundary(now, 30), to: today, source: "rolling" };
  }

  const termStart = normalizeReportDateKey(options.termStart);
  const configuredTermEnd = normalizeReportDateKey(options.termEnd);
  // برای گزارش جاری، انتهای آینده را تا امروز محدود می‌کنیم.
  const termEnd = configuredTermEnd && configuredTermEnd < today ? configuredTermEnd : today;

  if (termStart && termStart <= termEnd) {
    return { from: termStart, to: termEnd, source: "term" };
  }

  // فقط اگر تاریخ ترم در تنظیمات موجود نباشد یا نامعتبر باشد، رفتار قبلی ۱۲۰روزه حفظ می‌شود.
  return {
    from: rollingBoundary(now, 120),
    to: today,
    source: "term-fallback",
  };
}

export function isReportDateInRange(
  value: unknown,
  range: ReportDateRange,
  options: ReportDateRangeOptions = {},
): boolean {
  if (range === "all") return true;
  const key = normalizeReportDateKey(value);
  if (!key) return false;
  const bounds = getReportDateKeyRange(range, options);
  if (bounds.from && key < bounds.from) return false;
  if (bounds.to && key > bounds.to) return false;
  return true;
}

export function isSameReportDate(left: unknown, right: unknown): boolean {
  const leftKey = normalizeReportDateKey(left);
  const rightKey = normalizeReportDateKey(right);
  return leftKey != null && rightKey != null && leftKey === rightKey;
}

export function filterRecordsByReportDate<T extends { date?: string | null }>(
  records: T[],
  range: ReportDateRange,
  options: ReportDateRangeOptions = {},
): T[] {
  if (range === "all") return records;
  return records.filter((record) => isReportDateInRange(record.date, range, options));
}
