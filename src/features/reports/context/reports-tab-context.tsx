import { createContext, useContext, type ReactNode } from "react";
import type { ReportDateRange } from "../domain/report-date";
import type {
  DataQualityIssueRow,
  StudentFollowUpRow,
  StudentTrendRow,
} from "../domain/report-analytics";
import type {
  ClassPerformanceRow,
  ClassRow,
  NajmSessionReportRow,
  NajmTermRow,
  OfficialAttendanceRow,
  OfficialGradeRow,
  PaymentRow,
  ReportStudentRow,
  SessionRegistryRow,
  StudentRow,
  StudentSessionRow,
  TeacherPerformanceRow,
  TeacherRow,
} from "../domain/report-types";

export type ExportType = "excel" | "pdf" | "word";
export type NajmScope = "active" | "year" | "all";
export type NajmStatusFilter = "all" | "applied" | "pending";

export interface NajmSummary {
  total: number;
  applied: number;
  pending: number;
  totalScore: number;
}

export interface ReportsTabContextValue {
  students: StudentRow[];
  studentById: Map<string, StudentRow>;
  classes: ClassRow[];
  teachers: TeacherRow[];
  filteredStudents: ReportStudentRow[];
  selectedClass: string;
  setSelectedClass: (value: string) => void;
  selectedClassData?: ClassRow;
  availableSessionDates: string[];

  dailyDateRange: ReportDateRange;
  setDailyDateRange: (value: ReportDateRange) => void;
  dailySessionDate: string | null;
  setDailySessionDate: (value: string | null) => void;
  dailyAttendance: OfficialAttendanceRow[];
  dailyGrades: OfficialGradeRow[];
  filteredSessionsList: SessionRegistryRow[];

  gradesDDateRange: ReportDateRange;
  setGradesDDateRange: (value: ReportDateRange) => void;
  gradesSessionDate: string | null;
  setGradesSessionDate: (value: string | null) => void;
  rangedGrades: OfficialGradeRow[];
  gradesStudentOrder: Map<string, number>;

  attendanceDateRange: ReportDateRange;
  setAttendanceDateRange: (value: ReportDateRange) => void;
  attendanceSessionDate: string | null;
  setAttendanceSessionDate: (value: string | null) => void;
  rangedAttendance: OfficialAttendanceRow[];
  attendanceStudentOrder: Map<string, number>;

  selectedSemester: string;
  setSelectedSemester: (value: string) => void;
  semesterOptions: string[];
  filteredPayments: PaymentRow[];

  studentSessionRowsById: Map<string, StudentSessionRow[]>;

  najmScope: NajmScope;
  setNajmScope: (value: NajmScope) => void;
  najmClassFilter: string;
  setNajmClassFilter: (value: string) => void;
  najmTeacherFilter: string;
  setNajmTeacherFilter: (value: string) => void;
  najmStatusFilter: NajmStatusFilter;
  setNajmStatusFilter: (value: NajmStatusFilter) => void;
  najmDateRange: ReportDateRange;
  setNajmDateRange: (value: ReportDateRange) => void;
  najmSearch: string;
  setNajmSearch: (value: string) => void;
  filteredNajmSessions: NajmSessionReportRow[];
  najmSummary: NajmSummary;
  activeNajmTerm: NajmTermRow | null;

  classStats: ClassPerformanceRow[];
  teacherStats: TeacherPerformanceRow[];
  studentFollowUpRows: StudentFollowUpRow[];
  studentTrendRows: StudentTrendRow[];
  dataQualityIssues: DataQualityIssueRow[];
  insufficientFollowUpDataCount: number;
  insufficientTrendDataCount: number;
  analyticsScopeLabel: string;

  exportDailyReport: (type: ExportType) => void;
  exportStudents: (type: ExportType) => void;
  exportGrades: (type: ExportType) => void;
  exportAttendance: (type: ExportType) => void;
  exportPaymentsReport: (type: ExportType) => void;
  exportNajmSessions: (type: ExportType) => void;
  exportClassPerformance: (type: ExportType) => void;
  exportTeacherPerformance: (type: ExportType) => void;
  exportStudentFollowUp: (type: ExportType) => void;
  exportStudentTrends: (type: ExportType) => void;
  exportDataQuality: (type: ExportType) => void;

  openSessionDetail: (session: SessionRegistryRow) => void;
  openProfile: (student: ReportStudentRow) => void;
  openPaymentHistory: (studentId: string) => void;
  openNajmSessionDetail: (session: NajmSessionReportRow) => void;
}

const ReportsTabContext = createContext<ReportsTabContextValue | null>(null);

export function ReportsTabProvider({
  value,
  children,
}: {
  value: ReportsTabContextValue;
  children: ReactNode;
}) {
  return <ReportsTabContext.Provider value={value}>{children}</ReportsTabContext.Provider>;
}

export function useReportsTabContext(): ReportsTabContextValue {
  const value = useContext(ReportsTabContext);
  if (!value) throw new Error("ReportsTabProvider is missing");
  return value;
}
