export type MessageSchedulePreset = "5m" | "15m" | "1h" | "tomorrow9" | "custom";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

export function toEnglishDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

function div(a: number, b: number) {
  return Math.floor(a / b);
}
function mod(a: number, b: number) {
  return a - Math.floor(a / b) * b;
}
function gregorianToJdn(gy: number, gm: number, gd: number) {
  const a = div(14 - gm, 12);
  const y = gy + 4800 - a;
  const m = gm + 12 * a - 3;
  return gd + div(153 * m + 2, 5) + 365 * y + div(y, 4) - div(y, 100) + div(y, 400) - 32045;
}
function jdnToGregorian(jdn: number) {
  let a = jdn + 32044;
  const b = div(4 * a + 3, 146097);
  a -= div(146097 * b, 4);
  const c = div(4 * a + 3, 1461);
  a -= div(1461 * c, 4);
  const m = div(5 * a + 2, 153);
  const gd = a - div(153 * m + 2, 5) + 1;
  const gm = m + 3 - 12 * div(m, 10);
  const gy = 100 * b + c - 4800 + div(m, 10);
  return { gy, gm, gd };
}
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
];
function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let index = 1; index < BREAKS.length; index += 1) {
    const current = BREAKS[index];
    jump = current - jp;
    if (jy < current) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = current;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function jalaliToJdn(jy: number, jm: number, jd: number) {
  const result = jalCal(jy);
  return gregorianToJdn(result.gy, 3, result.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function jdnToJalali(jdn: number) {
  const gy = jdnToGregorian(jdn).gy;
  let jy = gy - 621;
  const result = jalCal(jy);
  const first = gregorianToJdn(result.gy, 3, result.march);
  let k = jdn - first;
  if (k >= 0 && k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
  if (k >= 0) k -= 186;
  else {
    jy -= 1;
    k += 179;
    if (result.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}
function jalaliToGregorian(jy: number, jm: number, jd: number) {
  return jdnToGregorian(jalaliToJdn(jy, jm, jd));
}
function gregorianToJalali(gy: number, gm: number, gd: number) {
  return jdnToJalali(gregorianToJdn(gy, gm, gd));
}
export function daysInJalaliMonth(year: number, month: number) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return jalCal(year).leap === 0 ? 30 : 29;
}

export function tehranTodayJalaliParts(now = new Date()) {
  const tehran = new Date(now.getTime() + TEHRAN_OFFSET_MS);
  return gregorianToJalali(tehran.getUTCFullYear(), tehran.getUTCMonth() + 1, tehran.getUTCDate());
}

export function jalaliPartsToKey(year: number, month: number, day: number): string {
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

export function parseJalaliKey(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(toEnglishDigits(value).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1300 || year > 1600 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInJalaliMonth(year, month)) return null;
  return { year, month, day };
}

export function customJalaliDateTimeToIso(jalaliDate: string, time: string): string | null {
  const parts = parseJalaliKey(jalaliDate);
  const timeMatch = /^(\d{1,2}):([0-5]\d)$/.exec(toEnglishDigits(time).trim());
  if (!parts || !timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour < 0 || hour > 23) return null;
  const gregorian = jalaliToGregorian(parts.year, parts.month, parts.day);
  const utcMillis =
    Date.UTC(gregorian.gy, gregorian.gm - 1, gregorian.gd, hour, minute, 0) - TEHRAN_OFFSET_MS;
  return new Date(utcMillis).toISOString();
}

export function resolveScheduledAt(input: {
  preset: MessageSchedulePreset;
  customJalaliDate?: string;
  customTime?: string;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  if (input.preset === "5m") return new Date(now.getTime() + 5 * 60_000).toISOString();
  if (input.preset === "15m") return new Date(now.getTime() + 15 * 60_000).toISOString();
  if (input.preset === "1h") return new Date(now.getTime() + 60 * 60_000).toISOString();
  if (input.preset === "tomorrow9") {
    const tehran = new Date(now.getTime() + TEHRAN_OFFSET_MS);
    const tomorrowUtc =
      Date.UTC(tehran.getUTCFullYear(), tehran.getUTCMonth(), tehran.getUTCDate() + 1, 9, 0, 0) -
      TEHRAN_OFFSET_MS;
    return new Date(tomorrowUtc).toISOString();
  }
  return customJalaliDateTimeToIso(input.customJalaliDate ?? "", input.customTime ?? "");
}

export function formatScheduledAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}
