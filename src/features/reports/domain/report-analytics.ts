import { reportIdKey, sameReportId } from "./report-id.js";
import type {
  ClassRow,
  NajmRecordRow,
  NajmSessionRow,
  OfficialAttendanceRow,
  OfficialGradeRow,
  ReportStudentRow,
  TeacherRow,
} from "./report-types.js";

export type FollowUpPriority = "urgent" | "follow_up";
export type StudentTrendDirection = "growth" | "stable" | "decline";
export type DataQualitySeverity = "error" | "warning" | "info";

export interface StudentFollowUpRow {
  studentId: string;
  name: string;
  className: string;
  sessionCount: number;
  attendanceRate: number;
  averageGrade: number | null;
  recentConsecutiveAbsences: number;
  priority: FollowUpPriority;
  reasons: string[];
}

export interface StudentTrendRow {
  studentId: string;
  name: string;
  className: string;
  gradeCount: number;
  previousAverage: number;
  recentAverage: number;
  delta: number;
  direction: StudentTrendDirection;
}

export interface DataQualityIssueRow {
  id: string;
  severity: DataQualitySeverity;
  title: string;
  count: number;
  details: string;
}

export interface StudentAnalyticsResult {
  followUpRows: StudentFollowUpRow[];
  trendRows: StudentTrendRow[];
  insufficientFollowUpDataCount: number;
  insufficientTrendDataCount: number;
}

export interface StudentAnalyticsThresholds {
  minimumFollowUpSessions: number;
  minimumTrendGrades: number;
  attendanceRateBelow: number;
  averageGradeBelow: number;
  recentConsecutiveAbsencesAtLeast: number;
  stableTrendDelta: number;
}

export const BALANCED_ANALYTICS_THRESHOLDS: StudentAnalyticsThresholds = {
  minimumFollowUpSessions: 3,
  minimumTrendGrades: 6,
  attendanceRateBelow: 75,
  averageGradeBelow: 12,
  recentConsecutiveAbsencesAtLeast: 2,
  stableTrendDelta: 1,
};

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function classNameForStudent(student: ReportStudentRow, classes: ClassRow[]): string {
  return classes.find((item) => sameReportId(item.id, student.class_id))?.name ?? "بدون کلاس";
}

function sortedAttendance(rows: OfficialAttendanceRow[]): OfficialAttendanceRow[] {
  return [...rows].sort((left, right) => {
    const dateOrder = String(left.date ?? "").localeCompare(String(right.date ?? ""));
    if (dateOrder !== 0) return dateOrder;
    return left.session_id.localeCompare(right.session_id);
  });
}

export function recentConsecutiveAbsences(rows: OfficialAttendanceRow[]): number {
  const sorted = sortedAttendance(rows);
  let count = 0;
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (sorted[index].status !== "absent") break;
    count += 1;
  }
  return count;
}

export function buildStudentAnalytics({
  students,
  classes,
  attendance,
  grades,
  thresholds = BALANCED_ANALYTICS_THRESHOLDS,
}: {
  students: ReportStudentRow[];
  classes: ClassRow[];
  attendance: OfficialAttendanceRow[];
  grades: OfficialGradeRow[];
  thresholds?: StudentAnalyticsThresholds;
}): StudentAnalyticsResult {
  const activeStudents = students.filter((student) => (student.status ?? "active") === "active");
  const attendanceByStudent = new Map<string, Map<string, OfficialAttendanceRow>>();
  const gradesByStudent = new Map<string, Map<string, OfficialGradeRow>>();

  for (const row of attendance) {
    const key = reportIdKey(row.student_id);
    if (!key) continue;
    const current = attendanceByStudent.get(key) ?? new Map<string, OfficialAttendanceRow>();
    current.set(row.session_id, row);
    attendanceByStudent.set(key, current);
  }
  for (const row of grades) {
    const key = reportIdKey(row.student_id);
    if (!key) continue;
    const current = gradesByStudent.get(key) ?? new Map<string, OfficialGradeRow>();
    current.set(row.session_id, row);
    gradesByStudent.set(key, current);
  }

  const followUpRows: StudentFollowUpRow[] = [];
  const trendRows: StudentTrendRow[] = [];
  let insufficientFollowUpDataCount = 0;
  let insufficientTrendDataCount = 0;

  for (const student of activeStudents) {
    const key = reportIdKey(student.id);
    if (!key) continue;
    const studentAttendance = Array.from(attendanceByStudent.get(key)?.values() ?? []);
    const studentGrades = Array.from(gradesByStudent.get(key)?.values() ?? []);
    const sessionCount = studentAttendance.length;

    if (sessionCount < thresholds.minimumFollowUpSessions) {
      insufficientFollowUpDataCount += 1;
    } else {
      const attended = studentAttendance.filter(
        (row) => row.status === "present" || row.status === "late",
      ).length;
      const attendanceRate = Math.round((attended / sessionCount) * 100);
      const averageGradeValue = average(studentGrades.map((row) => Number(row.grade)));
      const averageGrade = averageGradeValue == null ? null : roundOne(averageGradeValue);
      const consecutiveAbsences = recentConsecutiveAbsences(studentAttendance);
      const reasons: string[] = [];

      if (attendanceRate < thresholds.attendanceRateBelow)
        reasons.push(`حضور کمتر از ${thresholds.attendanceRateBelow}٪`);
      if (averageGrade != null && averageGrade < thresholds.averageGradeBelow)
        reasons.push(`میانگین کمتر از ${thresholds.averageGradeBelow}`);
      if (consecutiveAbsences >= thresholds.recentConsecutiveAbsencesAtLeast)
        reasons.push(`${consecutiveAbsences} غیبت متوالی اخیر`);

      if (reasons.length > 0) {
        const urgent =
          reasons.length >= 2 ||
          attendanceRate < 60 ||
          (averageGrade != null && averageGrade < 10) ||
          consecutiveAbsences >= 3;
        followUpRows.push({
          studentId: key,
          name: student.name,
          className: classNameForStudent(student, classes),
          sessionCount,
          attendanceRate,
          averageGrade,
          recentConsecutiveAbsences: consecutiveAbsences,
          priority: urgent ? "urgent" : "follow_up",
          reasons,
        });
      }
    }

    const sortedGrades = [...studentGrades].sort((left, right) => {
      const dateOrder = String(left.date ?? "").localeCompare(String(right.date ?? ""));
      if (dateOrder !== 0) return dateOrder;
      return left.session_id.localeCompare(right.session_id);
    });
    if (sortedGrades.length < thresholds.minimumTrendGrades) {
      insufficientTrendDataCount += 1;
      continue;
    }
    const window = sortedGrades.slice(-6);
    const previousAverage = roundOne(
      average(window.slice(0, 3).map((row) => Number(row.grade))) ?? 0,
    );
    const recentAverage = roundOne(
      average(window.slice(3, 6).map((row) => Number(row.grade))) ?? 0,
    );
    const delta = roundOne(recentAverage - previousAverage);
    const direction: StudentTrendDirection =
      delta >= thresholds.stableTrendDelta
        ? "growth"
        : delta <= -thresholds.stableTrendDelta
          ? "decline"
          : "stable";
    trendRows.push({
      studentId: key,
      name: student.name,
      className: classNameForStudent(student, classes),
      gradeCount: sortedGrades.length,
      previousAverage,
      recentAverage,
      delta,
      direction,
    });
  }

  followUpRows.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority === "urgent" ? -1 : 1;
    if (left.attendanceRate !== right.attendanceRate)
      return left.attendanceRate - right.attendanceRate;
    return (left.averageGrade ?? 99) - (right.averageGrade ?? 99);
  });
  trendRows.sort(
    (left, right) => left.delta - right.delta || left.name.localeCompare(right.name, "fa"),
  );

  return {
    followUpRows,
    trendRows,
    insufficientFollowUpDataCount,
    insufficientTrendDataCount,
  };
}

function sample(values: string[], empty = "—"): string {
  const unique = Array.from(new Set(values.filter(Boolean)));
  if (unique.length === 0) return empty;
  const shown = unique.slice(0, 3).join("، ");
  return unique.length > 3 ? `${shown} و ${unique.length - 3} مورد دیگر` : shown;
}

export function buildDataQualityIssues({
  students,
  classes,
  teachers,
  sessions,
  records,
  allSessions = sessions,
  allRecords = records,
  insufficientFollowUpStudents,
}: {
  students: ReportStudentRow[];
  classes: ClassRow[];
  teachers: TeacherRow[];
  sessions: NajmSessionRow[];
  records: NajmRecordRow[];
  allSessions?: NajmSessionRow[];
  allRecords?: NajmRecordRow[];
  insufficientFollowUpStudents: ReportStudentRow[];
}): DataQualityIssueRow[] {
  const issues: DataQualityIssueRow[] = [];
  const classIds = new Set(classes.map((item) => reportIdKey(item.id)).filter(Boolean));
  const teacherIds = new Set(teachers.map((item) => reportIdKey(item.id)).filter(Boolean));
  const studentIds = new Set(students.map((item) => reportIdKey(item.id)).filter(Boolean));
  const allSessionIds = new Set(allSessions.map((item) => String(item.id)));
  const activeStudents = students.filter((item) => (item.status ?? "active") === "active");
  const activeClasses = classes.filter((item) => !item.deleted_at && item.is_active !== false);

  const studentsWithoutClass = activeStudents.filter(
    (student) => !reportIdKey(student.class_id) || !classIds.has(reportIdKey(student.class_id)),
  );
  if (studentsWithoutClass.length)
    issues.push({
      id: "active-students-without-class",
      severity: "warning",
      title: "قرآن‌آموز فعال بدون کلاس معتبر",
      count: studentsWithoutClass.length,
      details: sample(studentsWithoutClass.map((item) => item.name)),
    });

  const classesWithoutTeacher = activeClasses.filter(
    (item) => !reportIdKey(item.teacher_id) || !teacherIds.has(reportIdKey(item.teacher_id)),
  );
  if (classesWithoutTeacher.length)
    issues.push({
      id: "active-classes-without-teacher",
      severity: "error",
      title: "کلاس فعال بدون استاد معتبر",
      count: classesWithoutTeacher.length,
      details: sample(classesWithoutTeacher.map((item) => item.name)),
    });

  const classesWithoutCapacity = activeClasses.filter((item) => Number(item.capacity ?? 0) <= 0);
  if (classesWithoutCapacity.length)
    issues.push({
      id: "active-classes-without-capacity",
      severity: "warning",
      title: "ظرفیت کلاس فعال تعریف نشده",
      count: classesWithoutCapacity.length,
      details: sample(classesWithoutCapacity.map((item) => item.name)),
    });

  const recordsBySession = new Map<string, NajmRecordRow[]>();
  for (const record of records) {
    const key = String(record.session_id ?? "");
    const list = recordsBySession.get(key) ?? [];
    list.push(record);
    recordsBySession.set(key, list);
  }

  const appliedSessionsWithoutRecords = sessions.filter(
    (session) =>
      session.is_applied === true && (recordsBySession.get(String(session.id))?.length ?? 0) === 0,
  );
  if (appliedSessionsWithoutRecords.length)
    issues.push({
      id: "applied-sessions-without-records",
      severity: "error",
      title: "جلسه اعمال‌شده بدون رکورد قرآن‌آموز",
      count: appliedSessionsWithoutRecords.length,
      details: sample(appliedSessionsWithoutRecords.map((item) => item.session_date ?? item.id)),
    });

  let duplicateRecordCount = 0;
  const duplicateSamples: string[] = [];
  for (const [sessionId, sessionRecords] of recordsBySession) {
    const seen = new Set<string>();
    for (const record of sessionRecords) {
      const studentId = reportIdKey(record.student_id);
      if (!studentId) continue;
      if (seen.has(studentId)) {
        duplicateRecordCount += 1;
        duplicateSamples.push(sessionId);
      }
      seen.add(studentId);
    }
  }
  if (duplicateRecordCount)
    issues.push({
      id: "duplicate-session-student-records",
      severity: "error",
      title: "رکورد تکراری قرآن‌آموز در یک جلسه",
      count: duplicateRecordCount,
      details: `جلسه‌ها: ${sample(duplicateSamples)}`,
    });

  const orphanSessionRecords = allRecords.filter(
    (record) => !record.session_id || !allSessionIds.has(String(record.session_id)),
  );
  if (orphanSessionRecords.length)
    issues.push({
      id: "orphan-session-records",
      severity: "error",
      title: "رکورد نجم بدون جلسه معتبر",
      count: orphanSessionRecords.length,
      details: sample(orphanSessionRecords.map((item) => item.id)),
    });

  const invalidStudentRecords = allRecords.filter(
    (record) => !reportIdKey(record.student_id) || !studentIds.has(reportIdKey(record.student_id)),
  );
  if (invalidStudentRecords.length)
    issues.push({
      id: "invalid-student-records",
      severity: "error",
      title: "رکورد نجم بدون قرآن‌آموز معتبر",
      count: invalidStudentRecords.length,
      details: sample(invalidStudentRecords.map((item) => item.student_name ?? item.id)),
    });

  const incompleteSessions = sessions.filter(
    (session) =>
      session.is_applied === true &&
      (!session.session_date || !reportIdKey(session.class_id) || !reportIdKey(session.teacher_id)),
  );
  if (incompleteSessions.length)
    issues.push({
      id: "incomplete-applied-sessions",
      severity: "error",
      title: "جلسه اعمال‌شده با مشخصات ناقص",
      count: incompleteSessions.length,
      details: sample(incompleteSessions.map((item) => item.session_date ?? item.id)),
    });

  if (insufficientFollowUpStudents.length)
    issues.push({
      id: "insufficient-follow-up-data",
      severity: "info",
      title: "داده ناکافی برای ارزیابی آموزشی",
      count: insufficientFollowUpStudents.length,
      details: sample(insufficientFollowUpStudents.map((item) => item.name)),
    });

  const severityOrder: Record<DataQualitySeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity] || right.count - left.count,
  );
  return issues;
}
