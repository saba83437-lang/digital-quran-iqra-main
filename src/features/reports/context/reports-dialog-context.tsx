import { createContext, useContext, type ReactNode } from "react";
import type { NajmScoreItem } from "@/lib/najm";
import type { ReportDateRange } from "../domain/report-date";
import type {
  NajmScoreRecordRow,
  NajmSessionReportRow,
  OfficialAttendanceRow,
  OfficialGradeRow,
  PaymentRow,
  ReportStudentRow,
  SessionRegistryRow,
  StudentRow,
} from "../domain/report-types";
import type { ExportType } from "./reports-tab-context";

export interface NajmDetailSummary {
  present: number;
  late: number;
  absent: number;
  score: number;
}

export interface ReportsDialogContextValue {
  students: StudentRow[];
  studentById: Map<string, StudentRow>;

  showSessionDetail: boolean;
  setShowSessionDetail: (value: boolean) => void;
  selectedSession: SessionRegistryRow | null;
  exportSessionDetail: (type: ExportType) => void;

  showProfile: boolean;
  setShowProfile: (value: boolean) => void;
  selectedStudent: ReportStudentRow | null;
  profileLoading: boolean;
  profileError: string | null;
  profileDateRange: ReportDateRange;
  setProfileDateRange: (value: ReportDateRange) => void;
  profileSessionDate: string | null;
  setProfileSessionDate: (value: string | null) => void;
  profileSessionDates: string[];
  filteredProfileGrades: OfficialGradeRow[];
  filteredProfileAttendance: OfficialAttendanceRow[];
  studentPayments: PaymentRow[];
  exportStudentProfile: (type: ExportType) => void;

  showPaymentHistory: boolean;
  closePaymentHistory: () => void;
  selectedPaymentStudent?: StudentRow;
  paymentHistoryLoading: boolean;
  paymentHistoryError: string | null;
  paymentStudentHistory: PaymentRow[];
  exportPaymentHistory: (type: ExportType) => void;

  najmDetailSession: NajmSessionReportRow | null;
  closeNajmDetail: () => void;
  najmDetailLoading: boolean;
  najmDetailError: string | null;
  najmDetailRecords: NajmScoreRecordRow[];
  najmScoreItems: NajmScoreItem[];
  najmDetailExamItem: NajmScoreItem | null;
  najmDetailAttendanceMax: number;
  najmDetailSummary: NajmDetailSummary;
  exportNajmSessionDetail: (type: ExportType) => void;
}

const ReportsDialogContext = createContext<ReportsDialogContextValue | null>(null);

export function ReportsDialogProvider({
  value,
  children,
}: {
  value: ReportsDialogContextValue;
  children: ReactNode;
}) {
  return <ReportsDialogContext.Provider value={value}>{children}</ReportsDialogContext.Provider>;
}

export function useReportsDialogContext(): ReportsDialogContextValue {
  const value = useContext(ReportsDialogContext);
  if (!value) throw new Error("ReportsDialogProvider is missing");
  return value;
}
