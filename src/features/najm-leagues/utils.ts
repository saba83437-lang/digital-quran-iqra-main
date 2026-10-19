const FA = "۰۱۲۳۴۵۶۷۸۹";
export const toFa = (value: number | string) =>
  String(value).replace(/[0-9]/g, (digit) => FA[Number(digit)]);

export function leagueSymbol(iconKey: string): string {
  return (
    (
      {
        trophy: "🏆",
        star: "⭐",
        crown: "👑",
        sparkles: "✨",
        shield: "🛡️",
        moon: "🌙",
      } as Record<string, string>
    )[iconKey] ?? "🏆"
  );
}

export function currentJalaliMonthKey(): string {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Asia/Tehran",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
  return `${year}-${String(month).padStart(2, "0")}`;
}

const MONTHS = [
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
export function nextJalaliMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || month < 1 || month > 12) return key;
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function jalaliMonthTitle(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return month >= 1 && month <= 12
    ? `${MONTHS[month - 1]} ${toFa(year)}`
    : toFa(key);
}
