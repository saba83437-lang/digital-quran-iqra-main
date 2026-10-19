import { formatToman } from "@/lib/mock-data";
import type { ReportDateRange as DateRange } from "./report-date";
import type { OfficialAttendanceRow } from "./report-types";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toFa(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

export function formatTomanFa(value: number | string): string {
  return toFa(formatToman(Number(value)));
}

export const REPORT_RANGE_LABELS: Record<DateRange, string> = {
  today: "امروز",
  week: "هفته اخیر",
  month: "ماه اخیر",
  term: "ترم اخیر",
  all: "همه زمان‌ها",
};

export function reportDateScopeLabel(range: DateRange, exactDate: string | null): string {
  return exactDate ? `جلسه ${toFa(exactDate)}` : REPORT_RANGE_LABELS[range];
}

export function attendanceStatusLabel(record: OfficialAttendanceRow): string {
  if (record.status === "present") return "حاضر";
  if (record.status === "late") return `با تأخیر (${toFa(record.late_minutes ?? 0)} دقیقه)`;
  return "غایب";
}

const NAJM_TERM_LABELS: Record<string, string> = {
  term1: "ترم اول",
  term2: "ترم دوم",
  summer: "تابستان",
};

export function najmTermLabel(term: string | null | undefined): string {
  if (!term) return "-";
  return NAJM_TERM_LABELS[term] ?? term;
}

export function najmNumber(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}
