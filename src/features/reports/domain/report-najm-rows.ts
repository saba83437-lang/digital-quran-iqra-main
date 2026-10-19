import {
  NAJM_REPORT_ABSENCE_KIND_LABELS,
  najmReportAttendanceStatus,
  najmReportLateMinutes,
} from "./report-najm.js";
import type {
  NajmRecordRow,
  NajmSessionRow,
  OfficialAttendanceRow,
  OfficialGradeRow,
  TeacherRow,
} from "./report-types.js";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function safeNumber(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

export function buildOfficialNajmReportRows({
  sessions,
  records,
  teachers,
  scoreItems,
}: {
  sessions: NajmSessionRow[];
  records: NajmRecordRow[];
  teachers: TeacherRow[];
  scoreItems: Array<{ item_key: string; max_score: number }>;
}): { attendance: OfficialAttendanceRow[]; grades: OfficialGradeRow[] } {
  const attendanceMax = scoreItems.find((item) => item.item_key === "attendance")?.max_score ?? 5;
  const sessionById = new Map(sessions.map((session) => [String(session.id), session]));
  const teacherNameById = new Map(
    teachers.map((teacher) => [String(teacher.id), String(teacher.name ?? "استاد")]),
  );

  const attendance: OfficialAttendanceRow[] = records
    .flatMap((record): OfficialAttendanceRow[] => {
      const session = sessionById.get(String(record.session_id ?? ""));
      if (!session) return [];
      const status = najmReportAttendanceStatus(
        record.attendance,
        attendanceMax,
        record.is_absent === true,
      );
      const lateMinutes = najmReportLateMinutes(record.attendance, attendanceMax);
      const absenceKind = record.absence_kind
        ? (NAJM_REPORT_ABSENCE_KIND_LABELS[record.absence_kind] ?? record.absence_kind)
        : "";
      const note =
        status === "absent"
          ? `طرح نجم${absenceKind ? ` — غیبت ${absenceKind}` : " — غیبت"}`
          : status === "late"
            ? `طرح نجم — ${toFa(lateMinutes ?? 0)} دقیقه تأخیر`
            : "طرح نجم — حاضر";
      return [
        {
          id: `najm-attendance:${record.id}`,
          session_id: session.id,
          student_id: record.student_id,
          date: session.session_date,
          status,
          note,
          late_minutes: lateMinutes,
          attendance_score: safeNumber(record.attendance),
          class_id: session.class_id,
          class_name: session.class_name,
          teacher_id: session.teacher_id,
          is_applied: session.is_applied === true,
          source: "najm",
        },
      ];
    })
    .sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")));

  const grades: OfficialGradeRow[] = records
    .flatMap((record): OfficialGradeRow[] => {
      const session = sessionById.get(String(record.session_id ?? ""));
      if (!session || session.is_applied !== true) return [];
      const status = najmReportAttendanceStatus(
        record.attendance,
        attendanceMax,
        record.is_absent === true,
      );
      if (status === "absent") return [];
      return [
        {
          id: `najm-grade:${record.id}`,
          session_id: session.id,
          student_id: record.student_id,
          subject: "آزمون طرح نجم",
          date: session.session_date,
          grade: safeNumber(record.exam_raw) + 10,
          teacher_id: session.teacher_id,
          teacher: session.teacher_id
            ? (teacherNameById.get(String(session.teacher_id)) ?? "استاد ثبت‌کننده")
            : "استاد ثبت‌کننده",
          class_id: session.class_id,
          class_name: session.class_name ?? "—",
          feedback: "ثبت رسمی طرح نجم",
          month: String(session.session_date ?? "").split("/")[1] ?? "",
          is_applied: true,
          source: "najm",
        },
      ];
    })
    .sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")));

  return { attendance, grades };
}
