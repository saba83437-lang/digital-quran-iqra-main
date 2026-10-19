import { formatToman } from "@/lib/mock-data";
import { attendanceStatusLabel, najmTermLabel, toFa } from "../domain/report-display";
import { createReportLookup, lookupReportItem } from "../domain/report-lookups";
import { sameReportId } from "../domain/report-id";
import type {
  DataQualityIssueRow,
  StudentFollowUpRow,
  StudentTrendRow,
} from "../domain/report-analytics";
import type {
  ClassPerformanceRow,
  ClassRow,
  NajmSessionReportRow,
  OfficialAttendanceRow,
  OfficialGradeRow,
  PaymentRow,
  ReportStudentRow,
  SessionRegistryRow,
  StudentRow,
  TeacherPerformanceRow,
} from "../domain/report-types";

export function studentsExportData(students: ReportStudentRow[], classes: ClassRow[]) {
  const headers = [
    "ردیف",
    "نام قرآن‌آموز",
    "سطح",
    "کلاس",
    "ولی",
    "تماس ولی",
    "میانگین نمره",
    "درصد حضور",
    "وضعیت شهریه",
    "تاریخ ثبت‌نام",
  ];
  const rows = students.map((s, index) => [
    toFa(index + 1),
    s.name,
    s.level,
    classes.find((c) => sameReportId(c.id, s.class_id))?.name ?? "—",
    s.parent_name,
    s.parent_phone,
    s.average_grade == null ? "—" : `${s.average_grade} / ۲۰`,
    s.attendance_rate == null ? "—" : `٪${s.attendance_rate}`,
    s.tuition_status === "paid"
      ? "پرداخت شده"
      : s.tuition_status === "overdue"
        ? "معوق"
        : s.tuition_status === "cancelled"
          ? "لغوشده"
          : s.tuition_status === "unbilled"
            ? "صورتحساب ندارد"
            : "در انتظار",
    s.enrolled,
  ]);
  return { headers, rows };
}

export function gradesExportData(grades: OfficialGradeRow[], students: StudentRow[]) {
  const headers = ["ردیف", "نام قرآن‌آموز", "موضوع", "نمره", "تاریخ", "استاد", "کلاس", "بازخورد"];
  const rows = grades.map((g, index) => {
    const student = students.find((s) => sameReportId(s.id, g.student_id));
    return [
      toFa(index + 1),
      student?.name ?? "—",
      g.subject ?? "—",
      `${g.grade} / ۲۰`,
      g.date ?? "—",
      g.teacher ?? "—",
      g.class_name ?? "—",
      g.feedback ?? "—",
    ];
  });
  return { headers, rows };
}

export function attendanceExportData(
  attendance: OfficialAttendanceRow[],
  students: StudentRow[],
  classes: ClassRow[],
) {
  const headers = ["ردیف", "نام قرآن‌آموز", "تاریخ", "وضعیت", "یادداشت", "کلاس"];
  const rows = attendance.map((a, index) => {
    const student = students.find((s) => sameReportId(s.id, a.student_id));
    const cls = classes.find((c) => sameReportId(c.id, a.class_id ?? student?.class_id));
    return [
      toFa(index + 1),
      student?.name ?? "—",
      a.date ?? "—",
      attendanceStatusLabel(a),
      a.note ?? "—",
      a.class_name ?? cls?.name ?? "—",
    ];
  });
  return { headers, rows };
}

export function paymentsExportData(students: StudentRow[], payments: PaymentRow[]) {
  const studentLookup = createReportLookup(students);
  const headers = [
    "ردیف",
    "نام قرآن‌آموز",
    "ولی",
    "نیمسال",
    "مبلغ کل (تومان)",
    "پرداخت‌شده",
    "باقیمانده",
    "تاریخ",
    "وضعیت",
  ];
  const rows = payments.map((p, index) => {
    const student = lookupReportItem(studentLookup, p.student_id);
    const amount = Number(p.amount ?? 0);
    const paidAmt = Number(p.paid_amount ?? (p.status === "paid" ? amount : 0));
    const remaining = p.status === "cancelled" ? 0 : Math.max(0, amount - paidAmt);
    return [
      toFa(index + 1),
      student?.name ?? "—",
      student?.parent_name ?? "—",
      p.semester ?? "—",
      formatToman(amount),
      formatToman(paidAmt),
      remaining > 0 ? formatToman(remaining) : "—",
      p.date ?? "—",
      p.status === "paid"
        ? "پرداخت شده"
        : p.status === "pending"
          ? "در انتظار"
          : p.status === "cancelled"
            ? "لغوشده"
            : "معوق",
    ];
  });
  return { headers, rows };
}

export function classPerformanceExportData(classStats: ClassPerformanceRow[]) {
  const headers = [
    "ردیف",
    "نام کلاس",
    "استاد",
    "وضعیت",
    "قرآن‌آموز فعال",
    "ظرفیت",
    "درصد پر شدن",
    "میانگین نمره",
    "درصد حضور",
    "میانگین غیبت (نفر)",
    "تعداد جلسات",
  ];
  const rows = classStats.map((c, index) => [
    toFa(index + 1),
    c.name,
    c.teacherName,
    c.isActive ? "فعال" : "غیرفعال",
    c.studentCount,
    c.capacity,
    `٪${c.fillRate}`,
    c.avgGrade,
    `٪${c.attendanceRate}`,
    c.avgAbsence,
    c.sessionsCount,
  ]);
  return { headers, rows };
}

export function teacherPerformanceExportData(teacherStats: TeacherPerformanceRow[]) {
  const headers = [
    "ردیف",
    "نام استاد",
    "تخصص",
    "کلاس‌های فعال",
    "قرآن‌آموزان تحت آموزش",
    "میانگین نمره",
    "درصد حضور",
    "تعداد جلسات برگزارشده",
  ];
  const rows = teacherStats.map((t, index) => [
    toFa(index + 1),
    t.name,
    t.specialty,
    t.activeClassCount,
    t.studentCount,
    t.avgGrade,
    `٪${t.attendanceRate}`,
    t.sessionsCount,
  ]);
  return { headers, rows };
}

export function studentFollowUpExportData(rows: StudentFollowUpRow[]) {
  const headers = [
    "ردیف",
    "قرآن‌آموز",
    "کلاس",
    "اولویت",
    "جلسات ارزیابی‌شده",
    "نرخ حضور",
    "میانگین نمره",
    "غیبت متوالی اخیر",
    "دلایل پیگیری",
  ];
  return {
    headers,
    rows: rows.map((row, index) => [
      toFa(index + 1),
      row.name,
      row.className,
      row.priority === "urgent" ? "فوری" : "پیگیری",
      row.sessionCount,
      `٪${row.attendanceRate}`,
      row.averageGrade == null ? "—" : row.averageGrade,
      row.recentConsecutiveAbsences,
      row.reasons.join("؛ "),
    ]),
  };
}

export function studentTrendExportData(rows: StudentTrendRow[]) {
  const headers = [
    "ردیف",
    "قرآن‌آموز",
    "کلاس",
    "تعداد نمره",
    "میانگین سه جلسه قبل",
    "میانگین سه جلسه اخیر",
    "تغییر",
    "روند",
  ];
  return {
    headers,
    rows: rows.map((row, index) => [
      toFa(index + 1),
      row.name,
      row.className,
      row.gradeCount,
      row.previousAverage,
      row.recentAverage,
      row.delta > 0 ? `+${row.delta}` : row.delta,
      row.direction === "growth" ? "رشد" : row.direction === "decline" ? "افت" : "پایدار",
    ]),
  };
}

export function dataQualityExportData(rows: DataQualityIssueRow[]) {
  const headers = ["ردیف", "سطح", "موضوع", "تعداد", "جزئیات"];
  return {
    headers,
    rows: rows.map((row, index) => [
      toFa(index + 1),
      row.severity === "error" ? "خطا" : row.severity === "warning" ? "هشدار" : "اطلاع",
      row.title,
      row.count,
      row.details,
    ]),
  };
}

export function sessionDetailExportData(session: SessionRegistryRow, students: StudentRow[]) {
  const attHeaders = ["ردیف", "قرآن‌آموز", "وضعیت", "یادداشت"];
  const attRows = session.attendanceRecords.map((a, index) => {
    const st = students.find((s) => sameReportId(s.id, a.student_id));
    return [toFa(index + 1), st?.name ?? "—", attendanceStatusLabel(a), a.note ?? "—"];
  });

  const grHeaders = ["ردیف", "قرآن‌آموز", "موضوع", "نمره", "استاد", "بازخورد"];
  const grRows = session.gradeRecords.map((g, index) => {
    const st = students.find((s) => sameReportId(s.id, g.student_id));
    return [
      toFa(index + 1),
      st?.name ?? "—",
      g.subject ?? "—",
      `${g.grade} / ۲۰`,
      g.teacher ?? "—",
      g.feedback ?? "—",
    ];
  });

  return { attHeaders, attRows, grHeaders, grRows };
}

// ==================== طرح نجم: جلسات ثبت‌شده اساتید ====================
export function najmSessionsExportData(rows: NajmSessionReportRow[]) {
  const headers = [
    "ردیف",
    "وضعیت",
    "کلاس",
    "استاد",
    "تاریخ",
    "ترم",
    "سال تحصیلی",
    "تعداد رکورد",
    "مجموع امتیاز",
  ];
  const exportRows = rows.map((s, index) => [
    toFa(index + 1),
    s.is_applied === true ? "اعمال‌شده" : "معلق",
    s.className,
    s.teacherName,
    toFa(s.session_date ?? "—"),
    najmTermLabel(s.term),
    toFa(s.academic_year ?? "—"),
    toFa(s.recordsCount),
    toFa(Math.round(s.totalScore * 10) / 10),
  ]);
  return { headers, rows: exportRows };
}
