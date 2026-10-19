const TEHRAN_TIME_ZONE = "Asia/Tehran";

export const PERSIAN_MONTHS = [
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
] as const;

export type PersianDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const persianPartsFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-persian-nu-latn",
  {
    timeZone: TEHRAN_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  },
);

const tehranGregorianFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-gregory-nu-latn",
  {
    timeZone: TEHRAN_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  },
);

function numericParts(
  formatter: Intl.DateTimeFormat,
  date: Date,
): Record<string, number> {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function getTehranPersianParts(
  value: string | Date,
): PersianDateTimeParts {
  const parts = numericParts(
    persianPartsFormatter,
    value instanceof Date ? value : new Date(value),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function tehranOffsetMs(timestamp: number) {
  const date = new Date(timestamp);
  const parts = numericParts(tehranGregorianFormatter, date);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - Math.floor(timestamp / 1000) * 1000;
}

const gregorianDateCache = new Map<
  string,
  { year: number; month: number; day: number } | null
>();

function findGregorianDate(year: number, month: number, day: number) {
  const cacheKey = `${year}-${month}-${day}`;
  if (gregorianDateCache.has(cacheKey))
    return gregorianDateCache.get(cacheKey) ?? null;
  const approximateGregorianYear = year + 621;
  const start = Date.UTC(approximateGregorianYear - 1, 1, 1, 12);
  const end = Date.UTC(approximateGregorianYear + 1, 5, 1, 12);
  for (let timestamp = start; timestamp <= end; timestamp += 86_400_000) {
    const candidate = new Date(timestamp);
    const parts = getTehranPersianParts(candidate);
    if (parts.year === year && parts.month === month && parts.day === day) {
      const tehranDate = numericParts(tehranGregorianFormatter, candidate);
      const result = {
        year: tehranDate.year,
        month: tehranDate.month,
        day: tehranDate.day,
      };
      gregorianDateCache.set(cacheKey, result);
      return result;
    }
  }
  gregorianDateCache.set(cacheKey, null);
  return null;
}

export function persianPartsToIso(parts: PersianDateTimeParts) {
  const gregorian = findGregorianDate(parts.year, parts.month, parts.day);
  if (!gregorian) throw new Error("تاریخ شمسی انتخاب‌شده معتبر نیست.");
  const wallClockAsUtc = Date.UTC(
    gregorian.year,
    gregorian.month - 1,
    gregorian.day,
    parts.hour,
    parts.minute,
    0,
  );
  let timestamp = wallClockAsUtc - tehranOffsetMs(wallClockAsUtc);
  timestamp = wallClockAsUtc - tehranOffsetMs(timestamp);
  const result = new Date(timestamp);
  const verified = getTehranPersianParts(result);
  if (
    verified.year !== parts.year ||
    verified.month !== parts.month ||
    verified.day !== parts.day ||
    verified.hour !== parts.hour ||
    verified.minute !== parts.minute
  ) {
    throw new Error("تبدیل تاریخ شمسی به زمان تهران ناموفق بود.");
  }
  return result.toISOString();
}

export function persianMonthLength(year: number, month: number) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return findGregorianDate(year, 12, 30) ? 30 : 29;
}

const toFa = (value: number) =>
  String(value).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

export function formatPersianDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getTehranPersianParts(date);
  const weekday = new Intl.DateTimeFormat("fa-IR", {
    timeZone: TEHRAN_TIME_ZONE,
    weekday: "long",
  }).format(date);
  return `${weekday} ${toFa(parts.day)} ${PERSIAN_MONTHS[parts.month - 1]} ${toFa(parts.year)}، ساعت ${toFa(parts.hour).padStart(2, "۰")}:${toFa(parts.minute).padStart(2, "۰")}`;
}

export function formatPersianDate(value: string | Date) {
  const parts = getTehranPersianParts(value);
  return `${toFa(parts.day)} ${PERSIAN_MONTHS[parts.month - 1]} ${toFa(parts.year)}`;
}
