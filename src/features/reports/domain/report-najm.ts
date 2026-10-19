export type NajmReportAttendanceStatus = "present" | "late" | "absent";

export const NAJM_REPORT_ABSENCE_KIND_LABELS: Record<string, string> = {
  unjustified: "غیرموجه",
  justified: "موجه",
  medical: "پزشکی",
  holiday: "تعطیل",
  cancelled: "لغوشده",
  approved_leave: "مرخصی مصوب",
};

function safeScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? score : 0;
}

/**
 * قانون حضور مورد تأیید مالک پروژه:
 * ۵ حاضر، ۴ تا ۱ با تأخیر و ۰ غایب است.
 */
export function najmReportAttendanceStatus(
  attendanceScore: unknown,
  attendanceMax = 5,
  isAbsent = false,
): NajmReportAttendanceStatus {
  const score = safeScore(attendanceScore);
  if (isAbsent || score <= 0) return "absent";
  if (score >= attendanceMax) return "present";
  return "late";
}

/**
 * مدت تأخیر بر اساس قانون مصوب:
 * ۴=۱۰، ۳=۲۰، ۲=۳۰ و ۱=۴۵ دقیقه.
 * اگر سقف در آینده از ۵ تغییر کند، به‌صورت عمومی هر امتیاز کم‌شده ۱۰ دقیقه محاسبه می‌شود.
 */
export function najmReportLateMinutes(attendanceScore: unknown, attendanceMax = 5): number | null {
  const score = safeScore(attendanceScore);
  if (score <= 0 || score >= attendanceMax) return null;

  if (attendanceMax === 5) {
    if (score === 4) return 10;
    if (score === 3) return 20;
    if (score === 2) return 30;
    if (score === 1) return 45;
  }

  return Math.max(0, Math.round((attendanceMax - score) * 10));
}

/** در نرخ حضور، حاضر و با تأخیر هر دو حضور محسوب می‌شوند. */
export function najmReportAttendanceRate(
  records: Array<{ attendance: unknown; is_absent?: boolean | null }>,
  attendanceMax = 5,
): number | null {
  if (records.length === 0) return null;
  const attended = records.filter(
    (record) =>
      najmReportAttendanceStatus(record.attendance, attendanceMax, record.is_absent === true) !==
      "absent",
  ).length;
  return Math.round((attended / records.length) * 100);
}
