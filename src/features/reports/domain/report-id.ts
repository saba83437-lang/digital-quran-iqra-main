export type ReportId = string | number | null | undefined;

/**
 * شناسه را فقط برای مقایسه در لایه گزارش به رشته استاندارد تبدیل می‌کند.
 * مقدار خام Supabase و نوع ستون دیتابیس هرگز با این تابع تغییر نمی‌کند.
 */
export function reportIdKey(value: ReportId): string | null {
  if (value === null || value === undefined) return null;
  const key = String(value).trim();
  return key ? key : null;
}

export function sameReportId(left: ReportId, right: ReportId): boolean {
  const leftKey = reportIdKey(left);
  const rightKey = reportIdKey(right);
  return leftKey !== null && rightKey !== null && leftKey === rightKey;
}

export function reportIdSet(values: ReportId[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    const key = reportIdKey(value);
    if (key) result.add(key);
  }
  return result;
}

export function filterRecordsByStudentIds<T extends { student_id?: ReportId }>(
  records: T[],
  studentIds: Set<string> | null,
): T[] {
  if (studentIds === null) return records;
  return records.filter((record) => {
    const key = reportIdKey(record.student_id);
    return key !== null && studentIds.has(key);
  });
}

/** فیلتر کلاس بر اساس class_id خود رکورد؛ برای حفظ کلاس تاریخی جلسه نجم. */
export function filterRecordsByClassId<T extends { class_id?: ReportId }>(
  records: T[],
  classId: ReportId,
): T[] {
  if (classId === null || classId === undefined) return records;
  return records.filter((record) => sameReportId(record.class_id, classId));
}
