import type { NajmScoreItem } from "@/lib/najm";
import { getNajmItemValue } from "@/lib/najm";
import { getSession } from "@/lib/auth";
import {
  exportReport,
  type ReportDocument,
  type ReportFilter,
  type ReportMetric,
  type ReportSection,
} from "./report-export";
import {
  attendanceExportData,
  classPerformanceExportData,
  dataQualityExportData,
  gradesExportData,
  najmSessionsExportData,
  paymentsExportData,
  sessionDetailExportData,
  studentFollowUpExportData,
  studentTrendExportData,
  studentsExportData,
  teacherPerformanceExportData,
} from "./report-export-data";
import {
  REPORT_RANGE_LABELS,
  attendanceStatusLabel,
  formatTomanFa,
  najmNumber,
  najmTermLabel,
  reportDateScopeLabel,
  toFa,
} from "../domain/report-display";
import type { ReportDateRange } from "../domain/report-date";
import type {
  DataQualityIssueRow,
  StudentFollowUpRow,
  StudentTrendRow,
} from "../domain/report-analytics";
import { lookupReportItem } from "../domain/report-lookups";
import {
  NAJM_REPORT_ABSENCE_KIND_LABELS as NAJM_ABSENCE_KIND_LABELS,
  najmReportLateMinutes,
} from "../domain/report-najm";
import type {
  ClassPerformanceRow,
  ClassRow,
  NajmScoreRecordRow,
  NajmSessionReportRow,
  NajmTermRow,
  OfficialAttendanceRow,
  OfficialGradeRow,
  PaymentRow,
  ReportStudentRow,
  SessionRegistryRow,
  StudentRow,
  TeacherPerformanceRow,
  TeacherRow,
} from "../domain/report-types";
import type {
  ExportType,
  NajmScope,
  NajmStatusFilter,
  NajmSummary,
} from "../context/reports-tab-context";
import type { NajmDetailSummary } from "../context/reports-dialog-context";

export interface ReportExportHandlersInput {
  students: StudentRow[];
  studentById: Map<string, StudentRow>;
  classes: ClassRow[];
  classById: Map<string, ClassRow>;
  teachers: TeacherRow[];
  teacherById: Map<string, TeacherRow>;
  filteredStudents: ReportStudentRow[];
  classLabel?: string;
  rangedGrades: OfficialGradeRow[];
  gradesDDateRange: ReportDateRange;
  gradesSessionDate: string | null;
  filteredNajmSessions: NajmSessionReportRow[];
  najmSummary: NajmSummary;
  activeNajmTerm: NajmTermRow | null;
  najmScope: NajmScope;
  najmClassFilter: string;
  najmTeacherFilter: string;
  najmStatusFilter: NajmStatusFilter;
  najmDateRange: ReportDateRange;
  najmSearch: string;
  najmDetailSession: NajmSessionReportRow | null;
  najmDetailRecords: NajmScoreRecordRow[];
  najmScoreItems: NajmScoreItem[];
  najmDetailExamItem: NajmScoreItem | null;
  najmDetailAttendanceMax: number;
  najmDetailSummary: NajmDetailSummary;
  rangedAttendance: OfficialAttendanceRow[];
  attendanceDateRange: ReportDateRange;
  attendanceSessionDate: string | null;
  filteredPayments: PaymentRow[];
  selectedSemester: string;
  dailyAttendance: OfficialAttendanceRow[];
  dailyGrades: OfficialGradeRow[];
  filteredSessionsList: SessionRegistryRow[];
  dailyDateRange: ReportDateRange;
  dailySessionDate: string | null;
  selectedStudent: ReportStudentRow | null;
  filteredProfileGrades: OfficialGradeRow[];
  filteredProfileAttendance: OfficialAttendanceRow[];
  studentPayments: PaymentRow[];
  profileDateRange: ReportDateRange;
  profileSessionDate: string | null;
  selectedPaymentStudentId: string | null;
  paymentStudentHistory: PaymentRow[];
  classStats: ClassPerformanceRow[];
  teacherStats: TeacherPerformanceRow[];
  studentFollowUpRows: StudentFollowUpRow[];
  studentTrendRows: StudentTrendRow[];
  dataQualityIssues: DataQualityIssueRow[];
  insufficientFollowUpDataCount: number;
  insufficientTrendDataCount: number;
  analyticsScopeLabel: string;
  selectedSession: SessionRegistryRow | null;
}

export interface ReportExportHandlers {
  exportStudents: (type: ExportType) => void;
  exportGrades: (type: ExportType) => void;
  exportNajmSessions: (type: ExportType) => void;
  exportNajmSessionDetail: (type: ExportType) => void;
  exportAttendance: (type: ExportType) => void;
  exportPaymentsReport: (type: ExportType) => void;
  exportDailyReport: (type: ExportType) => void;
  exportStudentProfile: (type: ExportType) => void;
  exportPaymentHistory: (type: ExportType) => void;
  exportClassPerformance: (type: ExportType) => void;
  exportTeacherPerformance: (type: ExportType) => void;
  exportStudentFollowUp: (type: ExportType) => void;
  exportStudentTrends: (type: ExportType) => void;
  exportDataQuality: (type: ExportType) => void;
  exportSessionDetail: (type: ExportType) => void;
}

export function createReportExportHandlers(input: ReportExportHandlersInput): ReportExportHandlers {
  const {
    students,
    studentById,
    classes,
    classById,
    teachers,
    teacherById,
    filteredStudents,
    classLabel,
    rangedGrades,
    gradesDDateRange,
    gradesSessionDate,
    filteredNajmSessions,
    najmSummary,
    activeNajmTerm,
    najmScope,
    najmClassFilter,
    najmTeacherFilter,
    najmStatusFilter,
    najmDateRange,
    najmSearch,
    najmDetailSession,
    najmDetailRecords,
    najmScoreItems,
    najmDetailExamItem,
    najmDetailAttendanceMax,
    najmDetailSummary,
    rangedAttendance,
    attendanceDateRange,
    attendanceSessionDate,
    filteredPayments,
    selectedSemester,
    dailyAttendance,
    dailyGrades,
    filteredSessionsList,
    dailyDateRange,
    dailySessionDate,
    selectedStudent,
    filteredProfileGrades,
    filteredProfileAttendance,
    studentPayments,
    profileDateRange,
    profileSessionDate,
    selectedPaymentStudentId,
    paymentStudentHistory,
    classStats,
    teacherStats,
    studentFollowUpRows,
    studentTrendRows,
    dataQualityIssues,
    insufficientFollowUpDataCount,
    insufficientTrendDataCount,
    analyticsScopeLabel,
    selectedSession,
  } = input;

  // ==================== توابع خروجی — مدل سند مشترک ====================
  const reportGeneratedBy = getSession()?.name || "مدیر سامانه";

  const makeReport = ({
    title,
    filename,
    source,
    filters = [],
    summary = [],
    sections,
  }: {
    title: string;
    filename?: string;
    source: string;
    filters?: ReportFilter[];
    summary?: ReportMetric[];
    sections: ReportSection[];
  }): ReportDocument => ({
    title,
    filename,
    source,
    generatedBy: reportGeneratedBy,
    generatedAt: new Date().toISOString(),
    filters,
    summary,
    sections,
  });

  const runReportExport = (report: ReportDocument, type: "excel" | "pdf" | "word") => {
    void Promise.resolve(exportReport(report, type)).catch((error) => {
      console.error("report export failed:", error);
    });
  };

  const commonClassFilter = (): ReportFilter => ({
    label: "کلاس",
    value: classLabel || "همه کلاس‌ها",
  });

  const reportPaidAmount = (payment: PaymentRow): number =>
    payment.status === "cancelled"
      ? 0
      : Number(payment.paid_amount ?? (payment.status === "paid" ? (payment.amount ?? 0) : 0));

  const reportRemainingAmount = (payment: PaymentRow): number =>
    payment.status === "cancelled"
      ? 0
      : Math.max(0, Number(payment.amount ?? 0) - reportPaidAmount(payment));

  const exportStudents = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = studentsExportData(filteredStudents, classes);
    runReportExport(
      makeReport({
        title: "لیست قرآن‌آموزان",
        source: "پرونده کاربران و شاخص‌های رسمی طرح نجم",
        filters: [commonClassFilter()],
        summary: [{ label: "تعداد قرآن‌آموز", value: filteredStudents.length }],
        sections: [{ title: "قرآن‌آموزان", headers, rows }],
      }),
      type,
    );
  };

  const exportGrades = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = gradesExportData(rangedGrades, students);
    const average = rangedGrades.length
      ? Math.round(
          (rangedGrades.reduce((sum, grade) => sum + Number(grade.grade ?? 0), 0) /
            rangedGrades.length) *
            10,
        ) / 10
      : null;
    runReportExport(
      makeReport({
        title: "گزارش نمرات طرح نجم",
        source: "najm_sessions + najm_session_records (فقط جلسات اعمال‌شده)",
        filters: [
          commonClassFilter(),
          {
            label: "بازه زمانی",
            value: reportDateScopeLabel(gradesDDateRange, gradesSessionDate),
          },
        ],
        summary: [
          { label: "تعداد نمره", value: rangedGrades.length },
          { label: "میانگین نمره", value: average == null ? "—" : `${toFa(average)} از ۲۰` },
        ],
        sections: [{ title: "نمرات", headers, rows }],
      }),
      type,
    );
  };

  const exportNajmSessions = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = najmSessionsExportData(filteredNajmSessions);
    const selectedNajmClass = lookupReportItem(classById, najmClassFilter);
    const selectedNajmTeacher = lookupReportItem(teacherById, najmTeacherFilter);
    const scopeLabel =
      najmScope === "active"
        ? `ترم فعال${activeNajmTerm ? ` — ${activeNajmTerm.title ?? ""}` : ""}`
        : najmScope === "year"
          ? `سال تحصیلی ${toFa(activeNajmTerm?.academic_year ?? "—")}`
          : "همه ترم‌ها";
    runReportExport(
      makeReport({
        title: "گزارش جلسات ثبت‌شده اساتید (طرح نجم)",
        source: "najm_sessions + najm_session_records",
        filters: [
          { label: "محدوده", value: scopeLabel },
          { label: "کلاس", value: selectedNajmClass?.name ?? "همه کلاس‌ها" },
          { label: "استاد", value: selectedNajmTeacher?.name ?? "همه اساتید" },
          {
            label: "وضعیت",
            value:
              najmStatusFilter === "applied"
                ? "اعمال‌شده"
                : najmStatusFilter === "pending"
                  ? "معلق"
                  : "همه وضعیت‌ها",
          },
          { label: "بازه زمانی", value: REPORT_RANGE_LABELS[najmDateRange] },
          { label: "جست‌وجو", value: najmSearch.trim() || "بدون عبارت جست‌وجو" },
        ],
        summary: [
          { label: "کل جلسات", value: najmSummary.total },
          { label: "اعمال‌شده", value: najmSummary.applied },
          { label: "معلق", value: najmSummary.pending },
          { label: "مجموع امتیاز اعمال‌شده", value: toFa(najmSummary.totalScore) },
        ],
        sections: [{ title: "جلسات نجم", headers, rows }],
      }),
      type,
    );
  };

  const exportNajmSessionDetail = (type: "excel" | "pdf" | "word") => {
    if (!najmDetailSession || najmDetailRecords.length === 0) return;
    const headers: string[] = [
      "ردیف",
      "قرآن‌آموز",
      ...najmScoreItems.map((item) => item.label),
      ...(najmDetailExamItem ? ["نمره نمایشی"] : []),
      "جبران",
      "امتیاز جلسه",
    ];
    const rows = najmDetailRecords.map((record, index) => {
      const attendanceScore = najmNumber(record.attendance);
      const absent = attendanceScore === 0 || record.is_absent === true;
      const absenceKindLabel = record.absence_kind
        ? (NAJM_ABSENCE_KIND_LABELS[record.absence_kind] ?? record.absence_kind)
        : "";
      const attendanceText = absent
        ? absenceKindLabel
          ? `غایب (${absenceKindLabel})`
          : "غایب"
        : attendanceScore >= najmDetailAttendanceMax
          ? "حاضر"
          : `${toFa(najmReportLateMinutes(attendanceScore, najmDetailAttendanceMax) ?? 0)} دقیقه تأخیر`;
      const cells: (string | number)[] = [toFa(index + 1), record.student_name || "بدون نام"];
      for (const item of najmScoreItems) {
        if (item.item_key === "attendance") {
          cells.push(attendanceText);
          continue;
        }
        const value = getNajmItemValue(record, item);
        if (item.kind === "negative") cells.push(`-${toFa(value * item.weight)}`);
        else if (item.kind === "special") cells.push(value > 0 ? `+${toFa(value)}` : toFa(value));
        else cells.push(toFa(value));
      }
      if (najmDetailExamItem) {
        cells.push(absent ? "—" : toFa(getNajmItemValue(record, najmDetailExamItem) + 10));
      }
      const recoveryBonus = najmNumber(record.recovery_bonus);
      cells.push(recoveryBonus > 0 ? `+${toFa(recoveryBonus)}` : "—");
      cells.push(toFa(najmNumber(record.session_score)));
      return cells;
    });
    runReportExport(
      makeReport({
        title: `ریز نمرات جلسه ${najmDetailSession.className}`,
        filename: `ریز نمرات-${najmDetailSession.className}-${najmDetailSession.session_date ?? ""}`,
        source: "najm_sessions + najm_session_records",
        filters: [
          { label: "کلاس", value: najmDetailSession.className },
          { label: "استاد", value: najmDetailSession.teacherName },
          { label: "تاریخ", value: toFa(najmDetailSession.session_date ?? "—") },
          { label: "ترم", value: najmTermLabel(najmDetailSession.term) },
          { label: "سال تحصیلی", value: toFa(najmDetailSession.academic_year ?? "—") },
          {
            label: "وضعیت",
            value: najmDetailSession.is_applied === true ? "اعمال‌شده" : "معلق",
          },
        ],
        summary: [
          { label: "حاضر", value: najmDetailSummary.present },
          { label: "با تأخیر", value: najmDetailSummary.late },
          { label: "غایب", value: najmDetailSummary.absent },
          { label: "مجموع امتیاز", value: toFa(najmDetailSummary.score) },
        ],
        sections: [{ title: "ریز آیتم‌های نجم", headers, rows }],
      }),
      type,
    );
  };

  const exportAttendance = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = attendanceExportData(rangedAttendance, students, classes);
    const present = rangedAttendance.filter((item) => item.status === "present").length;
    const late = rangedAttendance.filter((item) => item.status === "late").length;
    const absent = rangedAttendance.filter((item) => item.status === "absent").length;
    const rate = rangedAttendance.length
      ? Math.round(((present + late) / rangedAttendance.length) * 100)
      : 0;
    runReportExport(
      makeReport({
        title: "گزارش حضور و غیاب طرح نجم",
        source: "najm_sessions + najm_session_records",
        filters: [
          commonClassFilter(),
          {
            label: "بازه زمانی",
            value: reportDateScopeLabel(attendanceDateRange, attendanceSessionDate),
          },
        ],
        summary: [
          { label: "حاضر", value: present },
          { label: "با تأخیر", value: late },
          { label: "غایب", value: absent },
          { label: "درصد حضور", value: `٪${toFa(rate)}` },
        ],
        sections: [{ title: "حضور و غیاب", headers, rows }],
      }),
      type,
    );
  };

  const exportPaymentsReport = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = paymentsExportData(students, filteredPayments);
    const totalReceived = filteredPayments.reduce(
      (sum, payment) => sum + reportPaidAmount(payment),
      0,
    );
    const totalRemaining = filteredPayments.reduce(
      (sum, payment) => sum + reportRemainingAmount(payment),
      0,
    );
    runReportExport(
      makeReport({
        title: "گزارش مالی شهریه‌ها",
        source: "payments + پرونده قرآن‌آموزان",
        filters: [
          {
            label: "نیمسال",
            value: selectedSemester === "all" ? "همه نیمسال‌ها" : selectedSemester,
          },
        ],
        summary: [
          { label: "تعداد ردیف", value: filteredPayments.length },
          { label: "کل دریافتی", value: formatTomanFa(totalReceived) },
          { label: "کل باقیمانده", value: formatTomanFa(totalRemaining) },
        ],
        sections: [{ title: "پرداخت‌ها", headers, rows }],
      }),
      type,
    );
  };

  const exportDailyReport = (type: "excel" | "pdf" | "word") => {
    const { headers: attendanceHeaders, rows: attendanceRows } = attendanceExportData(
      dailyAttendance,
      students,
      classes,
    );
    const { headers: gradeHeaders, rows: gradeRows } = gradesExportData(dailyGrades, students);
    const sessionHeaders = [
      "ردیف",
      "وضعیت",
      "تاریخ",
      "کلاس",
      "استاد",
      "حاضر کامل",
      "با تأخیر",
      "غایب",
      "میانگین نمره",
    ];
    const sessionRows = filteredSessionsList.map((session, index) => {
      const onTime = session.attendanceRecords.filter((item) => item.status === "present").length;
      const late = session.attendanceRecords.filter((item) => item.status === "late").length;
      return [
        toFa(index + 1),
        session.isApplied ? "اعمال‌شده" : "معلق",
        toFa(session.date),
        session.className,
        session.teacherName,
        toFa(onTime),
        toFa(late),
        toFa(session.absent),
        session.avgGrade === "—" ? "—" : `${toFa(session.avgGrade)} / ۲۰`,
      ];
    });
    const present = dailyAttendance.filter((item) => item.status === "present").length;
    const late = dailyAttendance.filter((item) => item.status === "late").length;
    const absent = dailyAttendance.filter((item) => item.status === "absent").length;
    const average = dailyGrades.length
      ? Math.round(
          (dailyGrades.reduce((sum, grade) => sum + Number(grade.grade ?? 0), 0) /
            dailyGrades.length) *
            10,
        ) / 10
      : null;
    runReportExport(
      makeReport({
        title: "گزارش جامع روزانه طرح نجم",
        source: "najm_sessions + najm_session_records",
        filters: [
          commonClassFilter(),
          { label: "بازه زمانی", value: reportDateScopeLabel(dailyDateRange, dailySessionDate) },
        ],
        summary: [
          { label: "تعداد جلسه", value: filteredSessionsList.length },
          { label: "حاضر کامل", value: present },
          { label: "با تأخیر", value: late },
          { label: "غایب", value: absent },
          { label: "میانگین نمره", value: average == null ? "—" : `${toFa(average)} از ۲۰` },
        ],
        sections: [
          { title: "جلسات رسمی", headers: sessionHeaders, rows: sessionRows },
          { title: "حضور و غیاب", headers: attendanceHeaders, rows: attendanceRows },
          { title: "نمرات", headers: gradeHeaders, rows: gradeRows },
        ],
      }),
      type,
    );
  };

  const exportStudentProfile = (type: "excel" | "pdf" | "word") => {
    if (!selectedStudent) return;
    const gradeHeaders = ["ردیف", "تاریخ", "موضوع", "نمره", "استاد", "کلاس"];
    const gradeRows = filteredProfileGrades.map((grade, index) => [
      toFa(index + 1),
      toFa(grade.date ?? "—"),
      grade.subject ?? "—",
      `${toFa(grade.grade)} / ۲۰`,
      grade.teacher ?? "—",
      grade.class_name ?? "—",
    ]);
    const attendanceHeaders = ["ردیف", "تاریخ", "وضعیت", "کلاس", "یادداشت"];
    const attendanceRows = filteredProfileAttendance.map((record, index) => [
      toFa(index + 1),
      toFa(record.date ?? "—"),
      attendanceStatusLabel(record),
      record.class_name ?? "—",
      record.note ?? "—",
    ]);
    const paymentHeaders = [
      "ردیف",
      "نیمسال",
      "مبلغ کل",
      "پرداخت‌شده",
      "باقیمانده",
      "تاریخ",
      "وضعیت",
    ];
    const paymentRows = studentPayments.map((payment, index) => {
      const paid = reportPaidAmount(payment);
      return [
        toFa(index + 1),
        payment.semester ?? "—",
        formatTomanFa(payment.amount ?? 0),
        formatTomanFa(paid),
        formatTomanFa(reportRemainingAmount(payment)),
        toFa(payment.date ?? "—"),
        payment.status === "paid"
          ? "پرداخت‌شده"
          : payment.status === "pending"
            ? "در انتظار"
            : payment.status === "cancelled"
              ? "لغوشده"
              : "معوق",
      ];
    });
    const present = filteredProfileAttendance.filter((item) => item.status === "present").length;
    const late = filteredProfileAttendance.filter((item) => item.status === "late").length;
    const absent = filteredProfileAttendance.filter((item) => item.status === "absent").length;
    const average = filteredProfileGrades.length
      ? Math.round(
          (filteredProfileGrades.reduce((sum, grade) => sum + Number(grade.grade ?? 0), 0) /
            filteredProfileGrades.length) *
            10,
        ) / 10
      : null;
    const totalPaid = studentPayments.reduce((sum, payment) => sum + reportPaidAmount(payment), 0);
    runReportExport(
      makeReport({
        title: `پروفایل جامع — ${selectedStudent.name}`,
        filename: `پروفایل-${selectedStudent.name}`,
        source: "طرح نجم + پرونده کاربر + payments",
        filters: [
          { label: "قرآن‌آموز", value: selectedStudent.name },
          { label: "سطح", value: selectedStudent.level ?? "—" },
          { label: "ولی", value: selectedStudent.parent_name ?? "—" },
          {
            label: "بازه آموزشی",
            value: reportDateScopeLabel(profileDateRange, profileSessionDate),
          },
        ],
        summary: [
          { label: "حاضر کامل", value: present },
          { label: "با تأخیر", value: late },
          { label: "غایب", value: absent },
          { label: "میانگین نمره", value: average == null ? "—" : `${toFa(average)} از ۲۰` },
          { label: "جمع پرداختی", value: formatTomanFa(totalPaid) },
        ],
        sections: [
          {
            title: "اطلاعات پایه",
            headers: ["عنوان", "مقدار"],
            rows: [
              ["نام", selectedStudent.name],
              ["سطح", selectedStudent.level ?? "—"],
              ["ولی", selectedStudent.parent_name ?? "—"],
              ["شماره ولی", selectedStudent.parent_phone ?? "—"],
              ["تاریخ ثبت‌نام", toFa(selectedStudent.enrolled ?? "—")],
            ],
          },
          { title: "نمرات", headers: gradeHeaders, rows: gradeRows },
          { title: "حضور و غیاب", headers: attendanceHeaders, rows: attendanceRows },
          { title: "سوابق مالی", headers: paymentHeaders, rows: paymentRows },
        ],
      }),
      type,
    );
  };

  const exportPaymentHistory = (type: "excel" | "pdf" | "word") => {
    const student = lookupReportItem(studentById, selectedPaymentStudentId);
    const { headers, rows } = paymentsExportData(students, paymentStudentHistory);
    const totalPaid = paymentStudentHistory.reduce(
      (sum, payment) => sum + reportPaidAmount(payment),
      0,
    );
    const totalRemaining = paymentStudentHistory.reduce(
      (sum, payment) => sum + reportRemainingAmount(payment),
      0,
    );
    runReportExport(
      makeReport({
        title: `تاریخچه مالی — ${student?.name ?? "قرآن‌آموز"}`,
        source: "payments + پرونده قرآن‌آموز",
        filters: [{ label: "قرآن‌آموز", value: student?.name ?? "—" }],
        summary: [
          { label: "تعداد نیمسال", value: paymentStudentHistory.length },
          { label: "جمع پرداختی", value: formatTomanFa(totalPaid) },
          { label: "باقیمانده", value: formatTomanFa(totalRemaining) },
        ],
        sections: [{ title: "پرداخت‌ها", headers, rows }],
      }),
      type,
    );
  };

  const exportClassPerformance = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = classPerformanceExportData(classStats);
    runReportExport(
      makeReport({
        title: "عملکرد کلاس‌ها — همه ترم‌های نجم",
        source: "najm_sessions + najm_session_records + classes",
        filters: [{ label: "محدوده", value: "همه ترم‌ها" }],
        summary: [
          { label: "تعداد کلاس فعال", value: classStats.length },
          {
            label: "مجموع جلسات",
            value: classStats.reduce((sum, item) => sum + Number(item.sessionsCount ?? 0), 0),
          },
        ],
        sections: [{ title: "عملکرد کلاس‌ها", headers, rows }],
      }),
      type,
    );
  };

  const exportTeacherPerformance = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = teacherPerformanceExportData(teacherStats);
    runReportExport(
      makeReport({
        title: "عملکرد اساتید — همه ترم‌های نجم",
        source: "najm_sessions.teacher_id + najm_session_records + teachers",
        filters: [{ label: "محدوده", value: "همه ترم‌ها" }],
        summary: [
          { label: "تعداد استاد", value: teacherStats.length },
          {
            label: "مجموع جلسات",
            value: teacherStats.reduce((sum, item) => sum + Number(item.sessionsCount ?? 0), 0),
          },
        ],
        sections: [{ title: "عملکرد اساتید", headers, rows }],
      }),
      type,
    );
  };

  const exportStudentFollowUp = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = studentFollowUpExportData(studentFollowUpRows);
    const urgent = studentFollowUpRows.filter((row) => row.priority === "urgent").length;
    runReportExport(
      makeReport({
        title: "قرآن‌آموزان نیازمند پیگیری آموزشی",
        source: "جلسات اعمال‌شده طرح نجم در ترم فعال",
        filters: [
          { label: "محدوده", value: analyticsScopeLabel },
          { label: "حداقل داده", value: "۳ جلسه" },
          { label: "قواعد", value: "حضور کمتر از ۷۵٪، میانگین کمتر از ۱۲، یا ۲ غیبت متوالی اخیر" },
        ],
        summary: [
          { label: "نیازمند پیگیری", value: studentFollowUpRows.length },
          { label: "اولویت فوری", value: urgent },
          { label: "داده ناکافی", value: insufficientFollowUpDataCount },
        ],
        sections: [{ title: "فهرست پیگیری آموزشی", headers, rows }],
      }),
      type,
    );
  };

  const exportStudentTrends = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = studentTrendExportData(studentTrendRows);
    const growth = studentTrendRows.filter((row) => row.direction === "growth").length;
    const decline = studentTrendRows.filter((row) => row.direction === "decline").length;
    runReportExport(
      makeReport({
        title: "روند رشد و افت آموزشی",
        source: "نمرات رسمی جلسات اعمال‌شده طرح نجم",
        filters: [
          { label: "محدوده", value: analyticsScopeLabel },
          { label: "روش", value: "سه نمره اخیر در برابر سه نمره قبل" },
          { label: "حد پایدار", value: "تغییر کمتر از ۱ نمره" },
        ],
        summary: [
          { label: "دارای داده کافی", value: studentTrendRows.length },
          { label: "رشد", value: growth },
          { label: "افت", value: decline },
          { label: "داده ناکافی", value: insufficientTrendDataCount },
        ],
        sections: [{ title: "روند قرآن‌آموزان", headers, rows }],
      }),
      type,
    );
  };

  const exportDataQuality = (type: "excel" | "pdf" | "word") => {
    const { headers, rows } = dataQualityExportData(dataQualityIssues);
    const errors = dataQualityIssues.filter((row) => row.severity === "error").length;
    const warnings = dataQualityIssues.filter((row) => row.severity === "warning").length;
    runReportExport(
      makeReport({
        title: "گزارش کیفیت ثبت داده",
        source: "پرونده‌ها، کلاس‌ها و جلسات نجم ترم فعال",
        filters: [{ label: "محدوده جلسات", value: analyticsScopeLabel }],
        summary: [
          { label: "نوع مسئله", value: dataQualityIssues.length },
          { label: "خطا", value: errors },
          { label: "هشدار", value: warnings },
        ],
        sections: [{ title: "موارد نیازمند اصلاح داده", headers, rows }],
      }),
      type,
    );
  };

  const exportSessionDetail = (type: "excel" | "pdf" | "word") => {
    if (!selectedSession) return;
    const { attHeaders, attRows, grHeaders, grRows } = sessionDetailExportData(
      selectedSession,
      students,
    );
    const present = selectedSession.attendanceRecords.filter(
      (item) => item.status === "present",
    ).length;
    const late = selectedSession.attendanceRecords.filter((item) => item.status === "late").length;
    runReportExport(
      makeReport({
        title: `جزئیات جلسه ${selectedSession.className}`,
        filename: `جلسه-${selectedSession.className}-${selectedSession.date}`,
        source: "najm_sessions + najm_session_records",
        filters: [
          { label: "کلاس", value: selectedSession.className },
          { label: "استاد", value: selectedSession.teacherName },
          { label: "تاریخ", value: toFa(selectedSession.date) },
          { label: "وضعیت", value: selectedSession.isApplied ? "اعمال‌شده" : "معلق" },
        ],
        summary: [
          { label: "حاضر کامل", value: present },
          { label: "با تأخیر", value: late },
          { label: "غایب", value: selectedSession.absent },
          {
            label: "میانگین نمره",
            value:
              selectedSession.avgGrade === "—" ? "—" : `${toFa(selectedSession.avgGrade)} از ۲۰`,
          },
        ],
        sections: [
          { title: "حضور و غیاب", headers: attHeaders, rows: attRows },
          { title: "نمرات", headers: grHeaders, rows: grRows },
        ],
      }),
      type,
    );
  };

  return {
    exportStudents,
    exportGrades,
    exportNajmSessions,
    exportNajmSessionDetail,
    exportAttendance,
    exportPaymentsReport,
    exportDailyReport,
    exportStudentProfile,
    exportPaymentHistory,
    exportClassPerformance,
    exportTeacherPerformance,
    exportStudentFollowUp,
    exportStudentTrends,
    exportDataQuality,
    exportSessionDetail,
  };
}
