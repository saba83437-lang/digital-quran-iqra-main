// FILE: src/routes/admin.reports.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  Wallet,
  AlertCircle,
  BookOpen,
  Loader2,
  Calendar,
  Eye,
  EyeOff,
  UserX,
  GraduationCap,
  LogOut,
  School,
  School2,
  ClipboardCheck,
  Layers,
  ListChecks,
  Sparkles,
  ClipboardList,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { examDisplay, najmAttendanceMax, NAJM_EXAM_KEY, type NajmScoreItem } from "@/lib/najm";
import { cn } from "@/lib/utils";
import islamicBackgroundUrl from "@/assets/reports/islamic-background.jpg";
import "@/features/reports/styles/reports.css";
import { createReportExportHandlers } from "@/features/reports/export/report-export-handlers";
import {
  ClassFilterSelect,
  DateRangeFilter,
  ExportButton,
  IslamicRosette,
  MiniStatCard,
  PanelHeading,
  SessionDateFilter,
} from "@/features/reports/components/report-ui";
import { formatTomanFa, najmNumber, toFa } from "@/features/reports/domain/report-display";
import {
  filterRecordsByReportDate,
  isReportDateInRange,
  isSameReportDate,
  type ReportDateRange as DateRange,
  type ReportDateRangeOptions,
} from "@/features/reports/domain/report-date";
import {
  filterRecordsByClassId,
  reportIdKey,
  reportIdSet,
  sameReportId,
} from "@/features/reports/domain/report-id";
import {
  najmReportAttendanceStatus,
  najmReportLateMinutes,
} from "@/features/reports/domain/report-najm";
import {
  loadAdminReportsSnapshot,
  loadNajmSessionDetail,
  loadStudentPaymentHistory,
} from "@/features/reports/api/reports-api";
import { createReportLookup, lookupReportItem } from "@/features/reports/domain/report-lookups";
import {
  activeSemesterPayments,
  paidAmount,
  resolveActiveTuitionPlan,
} from "@/features/reports/domain/report-finance";
import {
  BALANCED_ANALYTICS_THRESHOLDS,
  buildDataQualityIssues,
  buildStudentAnalytics,
} from "@/features/reports/domain/report-analytics";
import {
  ReportsTabProvider,
  type ReportsTabContextValue,
} from "@/features/reports/context/reports-tab-context";
import { DailyReportTab } from "@/features/reports/tabs/daily-report-tab";
import { StudentsReportTab } from "@/features/reports/tabs/students-report-tab";
import { GradesReportTab } from "@/features/reports/tabs/grades-report-tab";
import { AttendanceReportTab } from "@/features/reports/tabs/attendance-report-tab";
import { FinancialReportTab } from "@/features/reports/tabs/financial-report-tab";
import { SessionsReportTab } from "@/features/reports/tabs/sessions-report-tab";
import { NajmSessionsReportTab } from "@/features/reports/tabs/najm-sessions-report-tab";
import { PerformanceReportTab } from "@/features/reports/tabs/performance-report-tab";
import {
  ReportsDialogProvider,
  type ReportsDialogContextValue,
} from "@/features/reports/context/reports-dialog-context";
import { SessionDetailDialog } from "@/features/reports/dialogs/session-detail-dialog";
import { StudentProfileDialog } from "@/features/reports/dialogs/student-profile-dialog";
import { PaymentHistoryDialog } from "@/features/reports/dialogs/payment-history-dialog";
import { NajmSessionDetailDialog } from "@/features/reports/dialogs/najm-session-detail-dialog";
import type {
  ClassRow,
  NajmRecordRow,
  NajmScoreRecordRow,
  NajmSessionReportRow,
  NajmSessionRow,
  NajmTermRow,
  OfficialAttendanceRow,
  OfficialGradeRow,
  PaymentRow,
  ReportStudentRow,
  SessionRegistryRow,
  StudentRow,
  StudentSessionRow,
  TeacherRow,
  TuitionPlanRow,
} from "@/features/reports/domain/report-types";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "گزارش‌ها — بِرّ الوالدین" },
      {
        name: "description",
        content: "گزارش‌های آماری و عملکردی مرکز قرآن",
      },
    ],
  }),
  component: ReportsPage,
});

// ==================== ابزارهای تاریخ ====================
function filterBySessionOrRange<T extends { date?: string | null }>(
  records: T[],
  range: DateRange,
  sessionDate: string | null,
  options: ReportDateRangeOptions = {},
): T[] {
  if (sessionDate) return records.filter((record) => isSameReportDate(record.date, sessionDate));
  return filterRecordsByReportDate(records, range, options);
}

// ==================== ابزارهای خروجی ====================
// ==========================================
// EMBEDDED PHOTOGRAPHIC ASSETS (BASE64)
// ==========================================

// ==================== داده‌های خروجی ====================
function najmSessionDateMatchesRange(
  dateStr: string | null | undefined,
  range: DateRange,
  options: ReportDateRangeOptions = {},
): boolean {
  return isReportDateInRange(dateStr, range, options);
}

// ==================== صفحه گزارش‌ها ====================
function ReportsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [tuitionPlans, setTuitionPlans] = useState<TuitionPlanRow[]>([]);
  const [grades, setGrades] = useState<OfficialGradeRow[]>([]);
  const [attendance, setAttendance] = useState<OfficialAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const loadRequestRef = useRef(0);
  const lastSuccessfulLoadRef = useRef(0);

  // فیلترها
  const [selectedClass, setSelectedClass] = useState("all");
  const [selectedSemester, setSelectedSemester] = useState("all");

  // بازه زمانی برای هر تب
  const [attendanceDateRange, setAttendanceDateRange] = useState<DateRange>("all");
  const [attendanceSessionDate, setAttendanceSessionDate] = useState<string | null>(null);
  const [gradesDDateRange, setGradesDDateRange] = useState<DateRange>("all");
  const [gradesSessionDate, setGradesSessionDate] = useState<string | null>(null);
  const [dailyDateRange, setDailyDateRange] = useState<DateRange>("today");
  const [dailySessionDate, setDailySessionDate] = useState<string | null>(null);

  // طرح نجم — جلسات ثبت‌شده اساتید
  const [najmSessions, setNajmSessions] = useState<NajmSessionRow[]>([]);
  const [najmRecords, setNajmRecords] = useState<NajmRecordRow[]>([]);
  const [najmTerms, setNajmTerms] = useState<NajmTermRow[]>([]);
  const [najmScope, setNajmScope] = useState<"active" | "year" | "all">("active");
  const [najmClassFilter, setNajmClassFilter] = useState("all");
  const [najmTeacherFilter, setNajmTeacherFilter] = useState("all");
  const [najmStatusFilter, setNajmStatusFilter] = useState<"all" | "applied" | "pending">("all");
  const [najmDateRange, setNajmDateRange] = useState<DateRange>("all");
  const [najmSearch, setNajmSearch] = useState("");
  const [najmScoreItems, setNajmScoreItems] = useState<NajmScoreItem[]>([]);
  const [najmDetailSession, setNajmDetailSession] = useState<NajmSessionReportRow | null>(null);
  const [najmDetailRecords, setNajmDetailRecords] = useState<NajmScoreRecordRow[]>([]);
  const [najmDetailLoading, setNajmDetailLoading] = useState(false);
  const [najmDetailError, setNajmDetailError] = useState<string | null>(null);
  const najmDetailRequestRef = useRef(0);

  // نمایش/مخفی‌سازی بخش‌های آماری
  const [statsVisible, setStatsVisible] = useState(true);
  const [classStatsVisible, setClassStatsVisible] = useState(true);

  useEffect(() => {
    const sv = localStorage.getItem("reports_stats_visible");
    const cv = localStorage.getItem("reports_class_stats_visible");
    if (sv !== null) setStatsVisible(sv === "1");
    if (cv !== null) setClassStatsVisible(cv === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem("reports_stats_visible", statsVisible ? "1" : "0");
  }, [statsVisible]);

  useEffect(() => {
    localStorage.setItem("reports_class_stats_visible", classStatsVisible ? "1" : "0");
  }, [classStatsVisible]);

  // جزئیات یک جلسه (کلاس + تاریخ مشخص)
  const [selectedSession, setSelectedSession] = useState<SessionRegistryRow | null>(null);
  const [showSessionDetail, setShowSessionDetail] = useState(false);

  // پروفایل دانش‌آموز
  const [selectedStudent, setSelectedStudent] = useState<ReportStudentRow | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [studentGrades, setStudentGrades] = useState<OfficialGradeRow[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<OfficialAttendanceRow[]>([]);
  const [studentPayments, setStudentPayments] = useState<PaymentRow[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileRequestRef = useRef(0);
  const [profileDateRange, setProfileDateRange] = useState<DateRange>("all");
  const [profileSessionDate, setProfileSessionDate] = useState<string | null>(null);

  // پروفایل مالی (کلیک روی نام در تب مالی)
  const [selectedPaymentStudentId, setSelectedPaymentStudentId] = useState<string | null>(null);
  const [paymentStudentHistory, setPaymentStudentHistory] = useState<PaymentRow[]>([]);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(null);
  const paymentHistoryRequestRef = useRef(0);

  const loadData = useCallback(async (silent = false) => {
    const requestId = ++loadRequestRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const result = await loadAdminReportsSnapshot();
      if (requestId !== loadRequestRef.current) return;

      const criticalIssues = result.issues.filter((item) => item.critical);
      const warningIssues = result.issues.filter((item) => !item.critical);
      setLoadWarnings(warningIssues.map((item) => item.message));

      if (criticalIssues.length > 0) {
        setLoadError(criticalIssues.map((item) => item.message).join("؛ "));
        return;
      }

      const snapshot = result.snapshot;
      setStudents(snapshot.students);
      setClasses(snapshot.classes);
      setTeachers(snapshot.teachers);
      setPayments(snapshot.payments);
      setTuitionPlans(snapshot.tuitionPlans);
      setNajmSessions(snapshot.najmSessions);
      setNajmRecords(snapshot.najmRecords);
      setNajmTerms(snapshot.najmTerms);
      setNajmScoreItems(snapshot.najmScoreItems);
      setAttendance(snapshot.attendance);
      setGrades(snapshot.grades);
      const completedAt = Date.now();
      lastSuccessfulLoadRef.current = completedAt;
      setLastUpdatedAt(new Date(completedAt));
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      setLoadError(error instanceof Error ? error.message : "خطا در دریافت گزارش‌ها");
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const refreshOnFocus = () => {
      const age = Date.now() - lastSuccessfulLoadRef.current;
      if (lastSuccessfulLoadRef.current > 0 && age >= 30_000 && !refreshing) {
        void loadData(true);
      }
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [loadData, refreshing]);

  const studentById = useMemo(() => createReportLookup(students), [students]);
  const classById = useMemo(() => createReportLookup(classes), [classes]);
  const teacherById = useMemo(() => createReportLookup(teachers), [teachers]);

  // طرح نجم — محاسبات گزارش جلسات ثبت‌شده اساتید
  const activeNajmTerm = useMemo(
    () =>
      najmTerms
        .filter((t) => t.is_active)
        .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0] ??
      null,
    [najmTerms],
  );

  const reportDateOptions = useMemo<ReportDateRangeOptions>(
    () => ({
      termStart: activeNajmTerm?.starts_at ?? null,
      termEnd: activeNajmTerm?.ends_at ?? null,
    }),
    [activeNajmTerm?.starts_at, activeNajmTerm?.ends_at],
  );

  const activeTuitionPlan = useMemo(
    () => resolveActiveTuitionPlan(activeNajmTerm, tuitionPlans),
    [activeNajmTerm, tuitionPlans],
  );
  const activeTermPaymentRows = useMemo(
    () => activeSemesterPayments(activeNajmTerm, activeTuitionPlan, payments),
    [activeNajmTerm, activeTuitionPlan, payments],
  );
  const activeTermRevenue = useMemo(
    () => activeTermPaymentRows.reduce((sum, payment) => sum + paidAmount(payment), 0),
    [activeTermPaymentRows],
  );
  const activeTermRevenueLabel = activeNajmTerm
    ? `دریافتی ${activeNajmTerm.title || "ترم فعال"}`
    : "دریافتی ترم فعال";
  const activeTermRevenueValue = !activeNajmTerm
    ? "ترم فعال تعریف نشده"
    : !activeTuitionPlan
      ? "شهریه تعریف نشده"
      : formatTomanFa(activeTermRevenue);

  const najmTeacherNameById = useMemo(
    () => new Map<string, string>(teachers.map((t) => [String(t.id), String(t.name ?? "")])),
    [teachers],
  );

  const najmRecordsStatsBySession = useMemo(() => {
    const map = new Map<string, { recordsCount: number; totalScore: number }>();
    for (const record of najmRecords) {
      const key = String(record.session_id ?? "");
      if (!key) continue;
      const stats = map.get(key) ?? { recordsCount: 0, totalScore: 0 };
      stats.recordsCount += 1;
      stats.totalScore += najmNumber(record.session_score);
      map.set(key, stats);
    }
    return map;
  }, [najmRecords]);

  const filteredNajmSessions = useMemo<NajmSessionReportRow[]>(() => {
    const selectedClassItem = lookupReportItem(classById, najmClassFilter);
    const selectedClassName = String(selectedClassItem?.name ?? "");
    const q = najmSearch.trim().toLowerCase();

    return najmSessions
      .filter((session) => {
        const matchesScope =
          najmScope === "all" ||
          (najmScope === "active" &&
            !!activeNajmTerm &&
            session.term === activeNajmTerm.term &&
            session.academic_year === activeNajmTerm.academic_year) ||
          (najmScope === "year" &&
            !!activeNajmTerm &&
            session.academic_year === activeNajmTerm.academic_year);

        const matchesClass =
          najmClassFilter === "all" ||
          String(session.class_id) === najmClassFilter ||
          (!!selectedClassName && String(session.class_name ?? "") === selectedClassName);

        const teacherName = session.teacher_id
          ? (najmTeacherNameById.get(String(session.teacher_id)) ?? "")
          : "";

        const matchesTeacher =
          najmTeacherFilter === "all" || String(session.teacher_id) === najmTeacherFilter;

        const matchesStatus =
          najmStatusFilter === "all" ||
          (najmStatusFilter === "applied" && session.is_applied === true) ||
          (najmStatusFilter === "pending" && session.is_applied !== true);

        const matchesDateRange = najmSessionDateMatchesRange(
          session.session_date,
          najmDateRange,
          reportDateOptions,
        );

        const matchesSearch =
          !q ||
          String(session.class_name ?? "")
            .toLowerCase()
            .includes(q) ||
          String(session.session_date ?? "").includes(q) ||
          teacherName.toLowerCase().includes(q);

        return (
          matchesScope &&
          matchesClass &&
          matchesTeacher &&
          matchesStatus &&
          matchesDateRange &&
          matchesSearch
        );
      })
      .map((session) => {
        const stats = najmRecordsStatsBySession.get(String(session.id)) ?? {
          recordsCount: 0,
          totalScore: 0,
        };
        return {
          id: String(session.id),
          className: session.class_name || "کلاس بدون نام",
          teacherName: session.teacher_id
            ? (najmTeacherNameById.get(String(session.teacher_id)) ?? "استاد ثبت‌کننده")
            : "استاد ثبت‌کننده",
          session_date: session.session_date ?? null,
          created_at: session.created_at ?? null,
          term: session.term ?? null,
          academic_year: session.academic_year ?? null,
          is_applied: session.is_applied ?? null,
          recordsCount: stats.recordsCount,
          totalScore: Math.round(stats.totalScore * 10) / 10,
        };
      })
      .sort(
        (a, b) =>
          String(b.session_date ?? "").localeCompare(String(a.session_date ?? "")) ||
          String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
      );
  }, [
    najmSessions,
    najmScope,
    najmClassFilter,
    najmTeacherFilter,
    najmStatusFilter,
    najmDateRange,
    najmSearch,
    activeNajmTerm,
    reportDateOptions,
    classById,
    najmTeacherNameById,
    najmRecordsStatsBySession,
  ]);

  const najmSummary = useMemo(() => {
    const appliedSessions = filteredNajmSessions.filter((s) => s.is_applied === true);
    const applied = appliedSessions.length;
    const pending = filteredNajmSessions.length - applied;
    // جلسه معلق در تعداد هست، ولی تا زمان اعمال وارد مجموع امتیاز نمی‌شود.
    const totalScore = appliedSessions.reduce((sum, s) => sum + s.totalScore, 0);
    return {
      total: filteredNajmSessions.length,
      applied,
      pending,
      totalScore: Math.round(totalScore * 10) / 10,
    };
  }, [filteredNajmSessions]);

  // ریز نمرات کلاس در جلسه انتخاب‌شده
  const najmDetailAttendanceMax = useMemo(
    () => najmAttendanceMax(najmScoreItems),
    [najmScoreItems],
  );
  const najmDetailExamItem = useMemo(
    () => najmScoreItems.find((i) => i.item_key === NAJM_EXAM_KEY) ?? null,
    [najmScoreItems],
  );

  const openNajmSessionDetail = async (session: NajmSessionReportRow) => {
    const requestId = ++najmDetailRequestRef.current;
    setNajmDetailSession(session);
    setNajmDetailLoading(true);
    setNajmDetailError(null);
    setNajmDetailRecords([]);
    try {
      const records = await loadNajmSessionDetail(session.id);
      if (requestId === najmDetailRequestRef.current) setNajmDetailRecords(records);
    } catch (error) {
      if (requestId === najmDetailRequestRef.current) {
        setNajmDetailError(error instanceof Error ? error.message : "خطا در دریافت جزئیات جلسه");
      }
    } finally {
      if (requestId === najmDetailRequestRef.current) setNajmDetailLoading(false);
    }
  };

  const najmDetailSummary = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let score = 0;
    for (const record of najmDetailRecords) {
      score += najmNumber(record.session_score);
      const attendance = najmNumber(record.attendance);
      if (attendance === 0 || record.is_absent) absent += 1;
      else if (attendance < najmDetailAttendanceMax) late += 1;
      else present += 1;
    }
    return { present, late, absent, score: Math.round(score * 10) / 10 };
  }, [najmDetailRecords, najmDetailAttendanceMax]);

  // باز کردن پروفایل کامل دانش‌آموز — آموزش فقط از منبع رسمی نجم خوانده می‌شود.
  const openProfile = async (s: ReportStudentRow) => {
    const requestId = ++profileRequestRef.current;
    setSelectedStudent(s);
    setShowProfile(true);
    setProfileLoading(true);
    setProfileError(null);
    setProfileDateRange("all");
    setProfileSessionDate(null);
    setStudentGrades(grades.filter((grade) => sameReportId(grade.student_id, s.id)));
    setStudentAttendance(attendance.filter((record) => sameReportId(record.student_id, s.id)));
    setStudentPayments([]);

    try {
      const nextPayments = await loadStudentPaymentHistory(s.id);
      if (requestId === profileRequestRef.current) setStudentPayments(nextPayments);
    } catch (error) {
      if (requestId === profileRequestRef.current) {
        setProfileError(error instanceof Error ? error.message : "خطا در دریافت اطلاعات مالی");
      }
    } finally {
      if (requestId === profileRequestRef.current) setProfileLoading(false);
    }
  };

  // باز کردن تاریخچه مالی از تب پرداخت
  const openPaymentHistory = async (studentId: string) => {
    const requestId = ++paymentHistoryRequestRef.current;
    setSelectedPaymentStudentId(studentId);
    setShowPaymentHistory(true);
    setPaymentHistoryLoading(true);
    setPaymentHistoryError(null);
    setPaymentStudentHistory([]);
    try {
      const history = await loadStudentPaymentHistory(studentId);
      if (requestId === paymentHistoryRequestRef.current) setPaymentStudentHistory(history);
    } catch (error) {
      if (requestId === paymentHistoryRequestRef.current) {
        setPaymentHistoryError(
          error instanceof Error ? error.message : "خطا در دریافت تاریخچه مالی",
        );
      }
    } finally {
      if (requestId === paymentHistoryRequestRef.current) setPaymentHistoryLoading(false);
    }
  };

  // ==================== محاسبات ====================
  const studentNajmStatsById = useMemo(() => {
    const result = new Map<
      string,
      { averageGrade: number | null; attendanceRate: number | null }
    >();
    for (const student of students) {
      const studentId = reportIdKey(student.id);
      if (!studentId) continue;
      const studentGrades = grades.filter((grade) => sameReportId(grade.student_id, student.id));
      const studentAttendance = attendance.filter((record) =>
        sameReportId(record.student_id, student.id),
      );
      const averageGrade = studentGrades.length
        ? Math.round(
            (studentGrades.reduce((sum, grade) => sum + Number(grade.grade ?? 0), 0) /
              studentGrades.length) *
              10,
          ) / 10
        : null;
      const attended = studentAttendance.filter(
        (record) => record.status === "present" || record.status === "late",
      ).length;
      const attendanceRate = studentAttendance.length
        ? Math.round((attended / studentAttendance.length) * 100)
        : null;
      result.set(studentId, { averageGrade, attendanceRate });
    }
    return result;
  }, [students, grades, attendance]);

  const activeTuitionStatusByStudent = useMemo(() => {
    const result = new Map<string, string>();
    for (const payment of activeTermPaymentRows) {
      const key = reportIdKey(payment.student_id);
      if (!key) continue;
      result.set(
        key,
        payment.status === "cancelled" ? "unbilled" : String(payment.status ?? "pending"),
      );
    }
    return result;
  }, [activeTermPaymentRows]);

  const reportStudents = useMemo(
    () =>
      students.map((student) => {
        const key = reportIdKey(student.id) ?? "";
        const stats = studentNajmStatsById.get(key);
        return {
          ...student,
          average_grade: stats?.averageGrade ?? null,
          attendance_rate: stats?.attendanceRate ?? null,
          tuition_status: activeTuitionPlan
            ? (activeTuitionStatusByStudent.get(key) ?? "unbilled")
            : "unbilled",
        };
      }),
    [students, studentNajmStatsById, activeTuitionPlan, activeTuitionStatusByStudent],
  );

  const reportStudentById = useMemo(() => createReportLookup(reportStudents), [reportStudents]);

  const analyticsScopeLabel = activeNajmTerm?.title?.trim()
    ? `ترم فعال — ${activeNajmTerm.title}`
    : "ترم فعال تعریف نشده";

  const activeAnalyticsSessions = useMemo(
    () =>
      activeNajmTerm
        ? najmSessions.filter(
            (session) =>
              session.is_applied === true &&
              session.term === activeNajmTerm.term &&
              session.academic_year === activeNajmTerm.academic_year,
          )
        : [],
    [najmSessions, activeNajmTerm],
  );
  const activeAnalyticsSessionIds = useMemo(
    () => new Set(activeAnalyticsSessions.map((session) => String(session.id))),
    [activeAnalyticsSessions],
  );
  const activeAnalyticsAttendance = useMemo(
    () =>
      attendance.filter(
        (record) =>
          record.is_applied === true && activeAnalyticsSessionIds.has(String(record.session_id)),
      ),
    [attendance, activeAnalyticsSessionIds],
  );
  const activeAnalyticsGrades = useMemo(
    () => grades.filter((record) => activeAnalyticsSessionIds.has(String(record.session_id))),
    [grades, activeAnalyticsSessionIds],
  );
  const activeAnalyticsRecords = useMemo(
    () =>
      najmRecords.filter((record) =>
        activeAnalyticsSessionIds.has(String(record.session_id ?? "")),
      ),
    [najmRecords, activeAnalyticsSessionIds],
  );

  const studentAnalytics = useMemo(
    () =>
      buildStudentAnalytics({
        students: reportStudents,
        classes,
        attendance: activeAnalyticsAttendance,
        grades: activeAnalyticsGrades,
      }),
    [reportStudents, classes, activeAnalyticsAttendance, activeAnalyticsGrades],
  );

  const insufficientFollowUpStudents = useMemo(() => {
    const sessionsByStudent = new Map<string, Set<string>>();
    for (const record of activeAnalyticsAttendance) {
      const key = reportIdKey(record.student_id);
      if (!key) continue;
      const sessionIds = sessionsByStudent.get(key) ?? new Set<string>();
      sessionIds.add(String(record.session_id));
      sessionsByStudent.set(key, sessionIds);
    }
    return reportStudents.filter(
      (student) =>
        (student.status ?? "active") === "active" &&
        (sessionsByStudent.get(reportIdKey(student.id) ?? "")?.size ?? 0) <
          BALANCED_ANALYTICS_THRESHOLDS.minimumFollowUpSessions,
    );
  }, [reportStudents, activeAnalyticsAttendance]);

  const dataQualityIssues = useMemo(
    () =>
      buildDataQualityIssues({
        students: reportStudents,
        classes,
        teachers,
        sessions: activeAnalyticsSessions,
        records: activeAnalyticsRecords,
        allSessions: najmSessions,
        allRecords: najmRecords,
        insufficientFollowUpStudents,
      }),
    [
      reportStudents,
      classes,
      teachers,
      activeAnalyticsSessions,
      activeAnalyticsRecords,
      najmSessions,
      najmRecords,
      insufficientFollowUpStudents,
    ],
  );

  const filteredStudents = useMemo(
    () =>
      selectedClass === "all"
        ? reportStudents
        : reportStudents.filter((student) => sameReportId(student.class_id, selectedClass)),
    [reportStudents, selectedClass],
  );

  // برای رکوردهای نجم، کلاس تاریخی خود جلسه مبناست؛ نه کلاس فعلی قرآن‌آموز.
  const selectedReportClassId = selectedClass === "all" ? null : selectedClass;

  const totalAbsences = useMemo(
    () => attendance.filter((a) => a.status === "absent").length,
    [attendance],
  );

  const selectedClassData = lookupReportItem(classById, selectedClass);
  const classLabel = selectedClassData?.name;

  // ==================== وضعیت قرآن‌آموزان ====================
  const activeStudents = useMemo(
    () => students.filter((s) => (s.status ?? "active") === "active"),
    [students],
  );

  const inactiveStudentsCount = useMemo(
    () => students.filter((s) => s.status === "inactive").length,
    [students],
  );

  const withdrawnStudentsCount = useMemo(
    () => students.filter((s) => s.status === "withdrawn").length,
    [students],
  );

  const graduatedStudentsCount = useMemo(
    () => students.filter((s) => s.status === "graduated").length,
    [students],
  );

  // ==================== وضعیت کلاس‌ها ====================
  const nonDeletedClasses = useMemo(() => classes.filter((c) => !c.deleted_at), [classes]);

  const activeClassesList = useMemo(
    () => nonDeletedClasses.filter((c) => c.is_active !== false),
    [nonDeletedClasses],
  );

  const inactiveClassesCount = useMemo(
    () => nonDeletedClasses.filter((c) => c.is_active === false).length,
    [nonDeletedClasses],
  );

  // میانگین نمرات همه ترم‌ها بر اساس رکوردهای رسمی و اعمال‌شده نجم
  const liveAvgGrade = useMemo(() => {
    if (grades.length === 0) return "—";
    return (grades.reduce((s, g) => s + Number(g.grade ?? 0), 0) / grades.length).toFixed(1);
  }, [grades]);

  // میانگین غیبت کل دارالقرآن (به ازای هر قرآن‌آموز فعال)
  const liveAvgAbsence = useMemo(() => {
    if (activeStudents.length === 0) return "0";
    const activeIds = new Set(activeStudents.map((s) => String(s.id)));
    const absCount = attendance.filter(
      (a) => a.status === "absent" && activeIds.has(String(a.student_id)),
    ).length;
    return (absCount / activeStudents.length).toFixed(1);
  }, [attendance, activeStudents]);

  // ==================== عملکرد هر کلاس فعال — منبع رسمی نجم ====================
  const classStats = useMemo(() => {
    return activeClassesList.map((c) => {
      const classStudents = students.filter(
        (s) => sameReportId(s.class_id, c.id) && (s.status ?? "active") === "active",
      );
      const classSessions = najmSessions.filter((session) => sameReportId(session.class_id, c.id));
      const classGrades = grades.filter((grade) => sameReportId(grade.class_id, c.id));
      const classAttendance = attendance.filter((record) => sameReportId(record.class_id, c.id));
      const attended = classAttendance.filter(
        (record) => record.status === "present" || record.status === "late",
      ).length;
      const absent = classAttendance.filter((record) => record.status === "absent").length;

      const avgGrade = classGrades.length
        ? (
            classGrades.reduce((sum, grade) => sum + Number(grade.grade ?? 0), 0) /
            classGrades.length
          ).toFixed(1)
        : "—";
      const attendanceRate = classAttendance.length
        ? Math.round((attended / classAttendance.length) * 100)
        : 0;
      const avgAbsence = classStudents.length ? (absent / classStudents.length).toFixed(1) : "0";
      const capacity = Number(c.capacity ?? 0);

      return {
        id: c.id,
        name: c.name,
        teacherName: lookupReportItem(teacherById, c.teacher_id)?.name ?? "—",
        isActive: c.is_active !== false,
        studentCount: classStudents.length,
        capacity,
        fillRate: capacity ? Math.min(100, Math.round((classStudents.length / capacity) * 100)) : 0,
        avgGrade,
        attendanceRate,
        avgAbsence,
        sessionsCount: classSessions.length,
      };
    });
  }, [activeClassesList, students, najmSessions, grades, attendance, teacherById]);

  // ==================== عملکرد هر استاد — اتصال فقط با teacher_id نجم ====================
  const teacherStats = useMemo(() => {
    return teachers.map((teacher) => {
      const teacherClasses = nonDeletedClasses.filter((c) =>
        sameReportId(c.teacher_id, teacher.id),
      );
      const activeTeacherClasses = teacherClasses.filter((c) => c.is_active !== false);
      const teacherClassIds = reportIdSet(teacherClasses.map((c) => c.id));
      const teacherStudents = students.filter((student) => {
        const classId = reportIdKey(student.class_id);
        return (
          classId !== null &&
          teacherClassIds.has(classId) &&
          (student.status ?? "active") === "active"
        );
      });
      const teacherSessions = najmSessions.filter((session) =>
        sameReportId(session.teacher_id, teacher.id),
      );
      const teacherGrades = grades.filter((grade) => sameReportId(grade.teacher_id, teacher.id));
      const teacherAttendance = attendance.filter((record) =>
        sameReportId(record.teacher_id, teacher.id),
      );
      const attended = teacherAttendance.filter(
        (record) => record.status === "present" || record.status === "late",
      ).length;

      const avgGrade = teacherGrades.length
        ? (
            teacherGrades.reduce((sum, grade) => sum + Number(grade.grade ?? 0), 0) /
            teacherGrades.length
          ).toFixed(1)
        : "—";
      const attendanceRate = teacherAttendance.length
        ? Math.round((attended / teacherAttendance.length) * 100)
        : 0;

      return {
        id: teacher.id,
        name: teacher.name,
        specialty: teacher.specialty,
        activeClassCount: activeTeacherClasses.length,
        studentCount: teacherStudents.length,
        avgGrade,
        attendanceRate,
        sessionsCount: teacherSessions.length,
      };
    });
  }, [teachers, nonDeletedClasses, students, najmSessions, grades, attendance]);

  // ==================== رجیستری رسمی جلسات نجم ====================
  const sessionsList = useMemo(() => {
    const attendanceBySession = new Map<string, OfficialAttendanceRow[]>();
    const gradesBySession = new Map<string, OfficialGradeRow[]>();

    for (const record of attendance) {
      const sessionId = reportIdKey(record.session_id);
      if (!sessionId) continue;
      const rows = attendanceBySession.get(sessionId) ?? [];
      rows.push(record);
      attendanceBySession.set(sessionId, rows);
    }
    for (const grade of grades) {
      const sessionId = reportIdKey(grade.session_id);
      if (!sessionId) continue;
      const rows = gradesBySession.get(sessionId) ?? [];
      rows.push(grade);
      gradesBySession.set(sessionId, rows);
    }

    return najmSessions
      .map((session) => {
        const sessionId = String(session.id);
        const attendanceRecords = attendanceBySession.get(sessionId) ?? [];
        const gradeRecords = gradesBySession.get(sessionId) ?? [];
        const attended = attendanceRecords.filter(
          (record) => record.status === "present" || record.status === "late",
        ).length;
        const absent = attendanceRecords.filter((record) => record.status === "absent").length;
        const avgGrade = gradeRecords.length
          ? (
              gradeRecords.reduce((sum, grade) => sum + Number(grade.grade ?? 0), 0) /
              gradeRecords.length
            ).toFixed(1)
          : "—";

        return {
          key: sessionId,
          sessionId,
          classId: session.class_id,
          className: session.class_name || "کلاس بدون نام",
          teacherId: session.teacher_id,
          teacherName: session.teacher_id
            ? (najmTeacherNameById.get(String(session.teacher_id)) ?? "استاد ثبت‌کننده")
            : "استاد ثبت‌کننده",
          date: session.session_date ?? "",
          createdAt: session.created_at,
          isApplied: session.is_applied === true,
          attendanceRecords,
          gradeRecords,
          studentCount: attendanceRecords.length,
          present: attended,
          absent,
          avgGrade,
        };
      })
      .sort(
        (left, right) =>
          String(right.date ?? "").localeCompare(String(left.date ?? "")) ||
          String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")),
      );
  }, [najmSessions, attendance, grades, najmTeacherNameById]);

  const studentSessionRowsById = useMemo(() => {
    const result = new Map<string, StudentSessionRow[]>();
    const sessionById = new Map(najmSessions.map((session) => [String(session.id), session]));
    const attendanceMax = najmAttendanceMax(najmScoreItems);

    for (const record of najmRecords) {
      const studentId = reportIdKey(record.student_id);
      const session = sessionById.get(String(record.session_id ?? ""));
      if (!studentId || !session) continue;
      const status = najmReportAttendanceStatus(
        record.attendance,
        attendanceMax,
        record.is_absent === true,
      );
      const lateMinutes = najmReportLateMinutes(record.attendance, attendanceMax);
      const rows = result.get(studentId) ?? [];
      rows.push({
        key: `${session.id}:${record.id}`,
        date: session.session_date ?? "",
        className: session.class_name || "کلاس بدون نام",
        isApplied: session.is_applied === true,
        status,
        lateMinutes,
        grade: status === "absent" ? null : examDisplay(najmNumber(record.exam_raw)),
      });
      result.set(studentId, rows);
    }

    for (const rows of result.values()) {
      rows.sort((left, right) => String(right.date).localeCompare(String(left.date)));
    }
    return result;
  }, [najmRecords, najmSessions, najmScoreItems]);

  const filteredSessionsList = useMemo(() => {
    let list = sessionsList;
    if (selectedClass !== "all") {
      list = list.filter((s) => sameReportId(s.classId, selectedClass));
    }
    return filterBySessionOrRange(list, dailyDateRange, dailySessionDate, reportDateOptions);
  }, [sessionsList, selectedClass, dailyDateRange, dailySessionDate, reportDateOptions]);

  // تاریخ‌های موجود برای فیلتر «تاریخ جلسه» در هر تب (بر اساس کلاس انتخابی)
  const availableSessionDates = useMemo(() => {
    const dates = new Set<string>();
    for (const record of [
      ...filterRecordsByClassId(attendance, selectedReportClassId),
      ...filterRecordsByClassId(grades, selectedReportClassId),
    ]) {
      if (record.date) dates.add(record.date);
    }
    return Array.from(dates).sort((a, b) => (a < b ? 1 : -1));
  }, [attendance, grades, selectedReportClassId]);

  const semesterOptions = useMemo(() => {
    const fromPlans = tuitionPlans.map((pl) => pl.semester);
    const extra = Array.from(
      new Set(payments.map((p) => p.semester).filter((value): value is string => Boolean(value))),
    ).filter((semester) => !fromPlans.includes(semester));
    return [...fromPlans, ...extra];
  }, [tuitionPlans, payments]);

  const filteredPayments = useMemo(
    () =>
      selectedSemester === "all"
        ? payments
        : payments.filter((p) => p.semester === selectedSemester),
    [payments, selectedSemester],
  );

  // گزارش روزانه (بازه زمانی یا تاریخ جلسه دقیق)
  const dailyAttendance = useMemo(
    () =>
      filterBySessionOrRange(
        filterRecordsByClassId(attendance, selectedReportClassId),
        dailyDateRange,
        dailySessionDate,
        reportDateOptions,
      ),
    [attendance, selectedReportClassId, dailyDateRange, dailySessionDate, reportDateOptions],
  );

  const dailyGrades = useMemo(
    () =>
      filterBySessionOrRange(
        filterRecordsByClassId(grades, selectedReportClassId),
        dailyDateRange,
        dailySessionDate,
        reportDateOptions,
      ),
    [grades, selectedReportClassId, dailyDateRange, dailySessionDate, reportDateOptions],
  );

  // داده نهایی حضور: کلاس و بازه تاریخ هر دو قبل از مصرف UI/خروجی اعمال می‌شوند.
  const rangedAttendance = useMemo(
    () =>
      filterBySessionOrRange(
        filterRecordsByClassId(attendance, selectedReportClassId),
        attendanceDateRange,
        attendanceSessionDate,
        reportDateOptions,
      ),
    [
      attendance,
      selectedReportClassId,
      attendanceDateRange,
      attendanceSessionDate,
      reportDateOptions,
    ],
  );

  // داده نهایی نمرات: عنوان، بدنه، وضعیت خالی و خروجی همگی از همین مجموعه استفاده می‌کنند.
  const rangedGrades = useMemo(
    () =>
      filterBySessionOrRange(
        filterRecordsByClassId(grades, selectedReportClassId),
        gradesDDateRange,
        gradesSessionDate,
        reportDateOptions,
      ),
    [grades, selectedReportClassId, gradesDDateRange, gradesSessionDate, reportDateOptions],
  );

  // شماره ردیف قرآن‌آموزان دارای رکورد؛ شماره‌ها فقط برای موارد قابل نمایش متوالی هستند.
  const gradesStudentOrder = useMemo(() => {
    let order = 0;
    const result = new Map<string, number>();
    for (const student of filteredStudents) {
      const studentId = reportIdKey(student.id);
      if (!studentId) continue;
      if (rangedGrades.some((grade) => sameReportId(grade.student_id, student.id))) {
        order += 1;
        result.set(studentId, order);
      }
    }
    return result;
  }, [filteredStudents, rangedGrades]);

  const attendanceStudentOrder = useMemo(() => {
    let order = 0;
    const result = new Map<string, number>();
    for (const student of filteredStudents) {
      const studentId = reportIdKey(student.id);
      if (!studentId) continue;
      if (rangedAttendance.some((record) => sameReportId(record.student_id, student.id))) {
        order += 1;
        result.set(studentId, order);
      }
    }
    return result;
  }, [filteredStudents, rangedAttendance]);

  // نمرات و حضور و غیاب پروفایل با فیلتر بازه زمانی/تاریخ جلسه
  const filteredProfileGrades = useMemo(
    () =>
      filterBySessionOrRange(
        studentGrades,
        profileDateRange,
        profileSessionDate,
        reportDateOptions,
      ),
    [studentGrades, profileDateRange, profileSessionDate, reportDateOptions],
  );

  const filteredProfileAttendance = useMemo(
    () =>
      filterBySessionOrRange(
        studentAttendance,
        profileDateRange,
        profileSessionDate,
        reportDateOptions,
      ),
    [studentAttendance, profileDateRange, profileSessionDate, reportDateOptions],
  );

  const profileSessionDates = useMemo(() => {
    const dates = new Set<string>();
    studentGrades.forEach((g) => g.date && dates.add(g.date));
    studentAttendance.forEach((a) => a.date && dates.add(a.date));
    return Array.from(dates).sort((a, b) => (a < b ? 1 : -1));
  }, [studentGrades, studentAttendance]);

  const {
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
  } = createReportExportHandlers({
    students: reportStudents,
    studentById: reportStudentById,
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
    studentFollowUpRows: studentAnalytics.followUpRows,
    studentTrendRows: studentAnalytics.trendRows,
    dataQualityIssues,
    insufficientFollowUpDataCount: studentAnalytics.insufficientFollowUpDataCount,
    insufficientTrendDataCount: studentAnalytics.insufficientTrendDataCount,
    analyticsScopeLabel,
    selectedSession,
  });

  const openSessionDetail = (session: SessionRegistryRow) => {
    setSelectedSession(session);
    setShowSessionDetail(true);
  };

  if (loading && !lastUpdatedAt)
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال بارگذاری از دیتابیس...</span>
      </div>
    );

  if (loadError && !lastUpdatedAt)
    return (
      <div className="flex h-72 items-center justify-center" dir="rtl">
        <div className="max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertCircle className="mx-auto h-7 w-7 text-rose-600" />
          <p className="mt-3 text-sm font-bold text-rose-800">دریافت گزارش‌های اصلی ناموفق بود</p>
          <p className="mt-2 text-xs leading-6 text-rose-700">{loadError}</p>
          <Button className="mt-4" size="sm" onClick={() => void loadData()}>
            تلاش مجدد
          </Button>
        </div>
      </div>
    );

  const selectedPaymentStudent = lookupReportItem(reportStudentById, selectedPaymentStudentId);

  const tabContextValue: ReportsTabContextValue = {
    students: reportStudents,
    studentById: reportStudentById,
    classes,
    teachers,
    filteredStudents,
    selectedClass,
    setSelectedClass,
    selectedClassData,
    availableSessionDates,
    dailyDateRange,
    setDailyDateRange,
    dailySessionDate,
    setDailySessionDate,
    dailyAttendance,
    dailyGrades,
    filteredSessionsList,
    gradesDDateRange,
    setGradesDDateRange,
    gradesSessionDate,
    setGradesSessionDate,
    rangedGrades,
    gradesStudentOrder,
    attendanceDateRange,
    setAttendanceDateRange,
    attendanceSessionDate,
    setAttendanceSessionDate,
    rangedAttendance,
    attendanceStudentOrder,
    selectedSemester,
    setSelectedSemester,
    semesterOptions,
    filteredPayments,
    studentSessionRowsById,
    najmScope,
    setNajmScope,
    najmClassFilter,
    setNajmClassFilter,
    najmTeacherFilter,
    setNajmTeacherFilter,
    najmStatusFilter,
    setNajmStatusFilter,
    najmDateRange,
    setNajmDateRange,
    najmSearch,
    setNajmSearch,
    filteredNajmSessions,
    najmSummary,
    activeNajmTerm,
    classStats,
    teacherStats,
    studentFollowUpRows: studentAnalytics.followUpRows,
    studentTrendRows: studentAnalytics.trendRows,
    dataQualityIssues,
    insufficientFollowUpDataCount: studentAnalytics.insufficientFollowUpDataCount,
    insufficientTrendDataCount: studentAnalytics.insufficientTrendDataCount,
    analyticsScopeLabel,
    exportDailyReport,
    exportStudents,
    exportGrades,
    exportAttendance,
    exportPaymentsReport,
    exportNajmSessions,
    exportClassPerformance,
    exportTeacherPerformance,
    exportStudentFollowUp,
    exportStudentTrends,
    exportDataQuality,
    openSessionDetail,
    openProfile,
    openPaymentHistory,
    openNajmSessionDetail,
  };

  const dialogContextValue: ReportsDialogContextValue = {
    students: reportStudents,
    studentById: reportStudentById,
    showSessionDetail,
    setShowSessionDetail,
    selectedSession,
    exportSessionDetail,
    showProfile,
    setShowProfile: (open) => {
      if (!open) profileRequestRef.current += 1;
      setShowProfile(open);
    },
    selectedStudent,
    profileLoading,
    profileError,
    profileDateRange,
    setProfileDateRange,
    profileSessionDate,
    setProfileSessionDate,
    profileSessionDates,
    filteredProfileGrades,
    filteredProfileAttendance,
    studentPayments,
    exportStudentProfile,
    showPaymentHistory,
    closePaymentHistory: () => {
      paymentHistoryRequestRef.current += 1;
      setShowPaymentHistory(false);
      setSelectedPaymentStudentId(null);
    },
    selectedPaymentStudent,
    paymentHistoryLoading,
    paymentHistoryError,
    paymentStudentHistory,
    exportPaymentHistory,
    najmDetailSession,
    closeNajmDetail: () => {
      najmDetailRequestRef.current += 1;
      setNajmDetailSession(null);
    },
    najmDetailLoading,
    najmDetailError,
    najmDetailRecords,
    najmScoreItems,
    najmDetailExamItem,
    najmDetailAttendanceMax,
    najmDetailSummary,
    exportNajmSessionDetail,
  };

  return (
    <>
      <div className="quran-admin-dashboard space-y-6" dir="rtl">
        {/* ================= HERO BINDING HEADER BANNER (GREEN LEATHER COVER) ================= */}
        <section
          className="quran-admin-hero relative overflow-hidden rounded-[2.25rem] text-white shadow-2xl transition-all duration-300 p-8"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(15, 45, 20, 0.97) 0%, rgba(25, 65, 35, 0.95) 50%, rgba(40, 95, 55, 0.97) 100%), url('" +
              islamicBackgroundUrl +
              "')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <IslamicRosette className="absolute -left-20 -top-20 h-72 w-72 text-amber-200 opacity-[.07] animate-spin-slow" />

          <div className="relative flex items-center justify-between gap-4 flex-wrap z-10">
            <div>
              <div className="flex items-center gap-3 text-amber-200">
                <span className="quran-ornament-line" />
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold tracking-wide">
                  دارالقرآن تخصصی بِرّ الوالدین
                </span>
              </div>
              <h1 className="mt-3 font-display text-2xl font-black md:text-3xl text-white text-shadow-gold">
                گزارش‌های جامع و آماری دارالقرآن
              </h1>
              <p className="mt-2 text-sm text-amber-50/90 font-quran text-lg">
                «وَقُلْ رَبِّ زِدْنِي عِلْمًا» — آمار به‌روز، گزارش‌های عملکردی کلاس‌ها و اساتید،
                گزارش‌های مالی و تحصیلی
              </p>
            </div>
          </div>
        </section>

        {loadError && lastUpdatedAt && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            به‌روزرسانی کامل نشد؛ آخرین داده موفق نمایش داده می‌شود. {loadError}
          </div>
        )}
        {loadWarnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {loadWarnings.join("؛ ")}
          </div>
        )}
        {activeNajmTerm && !activeTuitionPlan && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
            برای ترم فعال «{activeNajmTerm.title}» طرح شهریه هم‌نام تعریف نشده است. مبلغ را در بخش
            شهریه با همین عنوان ترم تعریف کنید.
          </div>
        )}

        {/* نوار عملیات آماری */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-sm font-black text-muted-foreground">آمار کلی دارالقرآن</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              آخرین دریافت موفق: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString("fa-IR") : "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={refreshing}
              className="h-7 gap-1 text-xs text-muted-foreground hover:bg-[#5d6d45]/10 rounded-lg"
              onClick={() => void loadData(true)}
            >
              {refreshing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              به‌روزرسانی
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:bg-[#5d6d45]/10 rounded-lg"
              onClick={() => setStatsVisible((v) => !v)}
            >
              {statsVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {statsVisible ? "مخفی‌سازی آمار" : "نمایش آمار"}
            </Button>
          </div>
        </div>

        {statsVisible && (
          <>
            {/* آمار کلی — دانش‌آموزان و وضعیت آن‌ها */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MiniStatCard
                label="قرآن‌آموزان فعال"
                value={activeStudents.length}
                icon={<Users className="h-4.5 w-4.5" />}
                tone="primary"
              />
              <MiniStatCard
                label="غیرفعال"
                value={inactiveStudentsCount}
                icon={<UserX className="h-4.5 w-4.5" />}
                tone="muted"
              />
              <MiniStatCard
                label="انصرافی"
                value={withdrawnStudentsCount}

                icon={<LogOut className="h-4.5 w-4.5" />}
                tone="destructive"
              />
              <MiniStatCard
                label="فارغ‌التحصیل"
                value={graduatedStudentsCount}
                icon={<GraduationCap className="h-4.5 w-4.5" />}
                tone="gold"
              />
            </div>

            {/* آمار کلاس‌ها، مالی و عملکرد */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MiniStatCard
                label="کلاس‌های فعال"
                value={activeClassesList.length}
                icon={<School className="h-4.5 w-4.5" />}
                tone="primary"
              />
              <MiniStatCard
                label="کلاس‌های غیرفعال"
                value={inactiveClassesCount}
                icon={<School2 className="h-4.5 w-4.5" />}
                tone="muted"
              />
              <MiniStatCard
                label={activeTermRevenueLabel}
                value={activeTermRevenueValue}
                icon={<Wallet className="h-4.5 w-4.5" />}
                tone="success"
              />
              <MiniStatCard
                label="میانگین نمرات کل"
                value={`${toFa(liveAvgGrade)} / ۲۰`}
                icon={<BookOpen className="h-4.5 w-4.5" />}
                tone="gold"
              />
              <MiniStatCard
                label="میانگین غیبت هر قرآن‌آموز"
                value={toFa(liveAvgAbsence)}
                icon={<AlertCircle className="h-4.5 w-4.5" />}
                tone="warning"
              />
              <MiniStatCard
                label="کل غیبت‌های ثبت‌شده"
                value={toFa(totalAbsences)}
                icon={<ClipboardCheck className="h-4.5 w-4.5" />}
                tone="warning"
              />
              <MiniStatCard
                label="کل جلسات برگزارشده"
                value={toFa(sessionsList.length)}
                icon={<Layers className="h-4.5 w-4.5" />}
                tone="primary"
              />
              <MiniStatCard
                label="کل قرآن‌آموزان (همه وضعیت‌ها)"
                value={toFa(students.length)}
                icon={<ListChecks className="h-4.5 w-4.5" />}
                tone="primary"
              />
            </div>

            {/* آمار هر کلاس فعال — میانگین نمره و غیبت */}
            <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
              <PanelHeading
                eyebrow="بررسی پویایی آموزشی"
                title="آمار عملکردی هر کلاس فعال"
                icon={<School className="h-5 w-5" />}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground hover:bg-[#5d6d45]/10 rounded-lg relative z-10"
                    onClick={() => setClassStatsVisible((v) => !v)}
                  >
                    {classStatsVisible ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    {classStatsVisible ? "مخفی‌سازی" : "نمایش"}
                  </Button>
                }
              />
              <div className="p-5">
                {classStatsVisible && (
                  <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/50 font-black">
                          <TableHead className="w-10">ردیف</TableHead>
                          <TableHead>کلاس</TableHead>
                          <TableHead>استاد</TableHead>
                          <TableHead>قرآن‌آموز فعال</TableHead>
                          <TableHead>پر شدن ظرفیت</TableHead>
                          <TableHead>میانگین نمره</TableHead>
                          <TableHead>درصد حضور</TableHead>
                          <TableHead>میانگین غیبت</TableHead>
                          <TableHead>تعداد جلسات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classStats.map((c, index) => (
                          <TableRow key={c.id}>
                            <TableCell className="text-sm text-muted-foreground">
                              {toFa(index + 1)}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{c.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.teacherName}
                            </TableCell>
                            <TableCell className="text-sm">{toFa(c.studentCount)}</TableCell>
                            <TableCell className="text-sm">
                              {toFa(c.studentCount)}/{toFa(c.capacity)} (٪{toFa(c.fillRate)})
                            </TableCell>
                            <TableCell className="font-semibold text-[#4a5839] text-sm">
                              {toFa(c.avgGrade)} / ۲۰
                            </TableCell>
                            <TableCell className="text-sm">٪{toFa(c.attendanceRate)}</TableCell>
                            <TableCell className="text-sm text-warning-foreground font-semibold">
                              {toFa(c.avgAbsence)}
                            </TableCell>
                            <TableCell className="text-sm">{toFa(c.sessionsCount)}</TableCell>
                          </TableRow>
                        ))}
                        {classStats.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={9}
                              className="text-center py-6 text-muted-foreground text-sm"
                            >
                              کلاس فعالی یافت نشد
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}

        <ReportsTabProvider value={tabContextValue}>
          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="bg-[#efebd9]/60 border border-black/[0.02] p-1.5 rounded-xl h-auto flex-wrap gap-1">
              <TabsTrigger value="daily" className="gap-1.5 rounded-lg text-xs font-black">
                <Calendar className="h-3.5 w-3.5" />
                گزارش روزانه
              </TabsTrigger>
              <TabsTrigger value="students" className="gap-1.5 rounded-lg text-xs font-black">
                قرآن‌آموزان
              </TabsTrigger>
              <TabsTrigger value="grades" className="gap-1.5 rounded-lg text-xs font-black">
                نمرات
              </TabsTrigger>
              <TabsTrigger value="attendance" className="gap-1.5 rounded-lg text-xs font-black">
                حضور و غیاب
              </TabsTrigger>
              <TabsTrigger value="payments" className="gap-1.5 rounded-lg text-xs font-black">
                مالی
              </TabsTrigger>
              <TabsTrigger value="sessions" className="gap-1.5 rounded-lg text-xs font-black">
                عملکرد جلسات
              </TabsTrigger>
              <TabsTrigger value="najm-sessions" className="gap-1.5 rounded-lg text-xs font-black">
                <ClipboardList className="h-3.5 w-3.5" />
                جلسات ثبت‌شده اساتید
              </TabsTrigger>
              <TabsTrigger value="performance" className="gap-1.5 rounded-lg text-xs font-black">
                عملکرد کلاس‌ها و اساتید
              </TabsTrigger>
            </TabsList>

            {/* ==================== گزارش روزانه ==================== */}
            <DailyReportTab />

            {/* ==================== قرآن‌آموزان ==================== */}
            <StudentsReportTab />

            {/* ==================== نمرات ==================== */}
            <GradesReportTab />

            {/* ==================== حضور و غیاب ==================== */}
            <AttendanceReportTab />

            {/* ==================== مالی ==================== */}
            <FinancialReportTab />

            {/* ==================== عملکرد جلسات ==================== */}
            <SessionsReportTab />

            {/* ==================== عملکرد کلاس‌ها و اساتید ==================== */}
            <NajmSessionsReportTab />

            <PerformanceReportTab />
          </Tabs>
        </ReportsTabProvider>

        <ReportsDialogProvider value={dialogContextValue}>
          {/* ==================== جزئیات یک جلسه ==================== */}
          <SessionDetailDialog />

          {/* ==================== پروفایل کامل قرآن‌آموز ==================== */}
          <StudentProfileDialog />

          {/* ==================== تاریخچه کامل مالی (از تب پرداخت) ==================== */}
          <PaymentHistoryDialog />

          {/* دیالوگ ریز نمرات کلاس ثبت‌شده (طرح نجم) */}
          <NajmSessionDetailDialog />
        </ReportsDialogProvider>
      </div>
    </>
  );
}
