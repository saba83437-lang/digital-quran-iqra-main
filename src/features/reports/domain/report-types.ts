export type ReportEntityId = string | number;
export type ReportNajmItemKind = "positive" | "special" | "negative";

export interface ReportNajmScoreItem {
  id?: string;
  item_key: string;
  label: string;
  kind: ReportNajmItemKind;
  max_score: number;
  weight: number;
  is_core: boolean;
  is_active: boolean;
  default_value: number;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
}
export type StudentStatus = "active" | "inactive" | "withdrawn" | "graduated" | string;
export type TuitionStatus = "paid" | "pending" | "overdue" | string;
export type PaymentStatus = "paid" | "pending" | "overdue" | "cancelled" | string;
export type OfficialAttendanceStatus = "present" | "late" | "absent";

export interface StudentRow {
  id: ReportEntityId;
  name: string;
  level: string | null;
  class_id: ReportEntityId | null;
  status?: StudentStatus | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  enrolled?: string | null;
  average_grade?: number | string | null;
  attendance_rate?: number | string | null;
  tuition_status?: TuitionStatus | null;
}

export interface ReportStudentRow extends StudentRow {
  average_grade: number | null;
  attendance_rate: number | null;
}

export interface ClassRow {
  id: ReportEntityId;
  name: string;
  teacher_id: ReportEntityId | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
  capacity?: number | string | null;
}

export interface TeacherRow {
  id: ReportEntityId;
  name: string;
  specialty?: string | null;
}

export interface PaymentRow {
  id: ReportEntityId;
  student_id: ReportEntityId;
  semester?: string | null;
  amount?: number | string | null;
  paid_amount?: number | string | null;
  date?: string | null;
  status?: PaymentStatus | null;
}

export interface TuitionPlanRow {
  id?: ReportEntityId;
  semester: string;
  amount?: number | string | null;
  created_at?: string | null;
}

export interface NajmSessionRow {
  id: string;
  class_id: ReportEntityId | null;
  class_name: string | null;
  teacher_id: ReportEntityId | null;
  session_date: string | null;
  term: string | null;
  academic_year: string | null;
  is_applied: boolean | null;
  created_at: string | null;
}

export interface NajmRecordRow {
  id: string;
  session_id: string | null;
  student_id: ReportEntityId | null;
  student_name: string | null;
  is_absent: boolean | null;
  absence_kind: string | null;
  attendance: number | string | null;
  exam_raw: number | string | null;
  recovery_bonus: number | string | null;
  session_score: number | string | null;
}

export interface NajmTermRow {
  id: ReportEntityId;
  title: string | null;
  term: string | null;
  academic_year: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

export interface NajmScoreRecordRow extends NajmRecordRow {
  custom_scores?: Record<string, number> | null;
  [key: string]: unknown;
}

export interface NajmSessionReportRow {
  id: string;
  className: string;
  teacherName: string;
  session_date: string | null;
  created_at: string | null;
  term: string | null;
  academic_year: string | null;
  is_applied: boolean | null;
  recordsCount: number;
  totalScore: number;
}

export interface OfficialAttendanceRow {
  id: string;
  session_id: string;
  student_id: ReportEntityId | null;
  date: string | null;
  status: OfficialAttendanceStatus;
  note: string;
  late_minutes: number | null;
  attendance_score: number;
  class_id: ReportEntityId | null;
  class_name: string | null;
  teacher_id: ReportEntityId | null;
  is_applied: boolean;
  source: "najm";
}

export interface OfficialGradeRow {
  id: string;
  session_id: string;
  student_id: ReportEntityId | null;
  subject: string;
  date: string | null;
  grade: number;
  teacher_id: ReportEntityId | null;
  teacher: string;
  class_id: ReportEntityId | null;
  class_name: string;
  feedback: string;
  month: string;
  is_applied: true;
  source: "najm";
}

export interface ClassPerformanceRow {
  id: ReportEntityId;
  name: string;
  teacherName: string;
  isActive: boolean;
  studentCount: number;
  capacity: number;
  fillRate: number;
  avgGrade: string;
  attendanceRate: number;
  avgAbsence: string;
  sessionsCount: number;
}

export interface TeacherPerformanceRow {
  id: ReportEntityId;
  name: string;
  specialty: string | null | undefined;
  activeClassCount: number;
  studentCount: number;
  avgGrade: string;
  attendanceRate: number;
  sessionsCount: number;
}

export interface SessionRegistryRow {
  key: string;
  sessionId: string;
  classId: ReportEntityId | null;
  className: string;
  teacherId: ReportEntityId | null;
  teacherName: string;
  date: string;
  createdAt: string | null;
  isApplied: boolean;
  attendanceRecords: OfficialAttendanceRow[];
  gradeRecords: OfficialGradeRow[];
  studentCount: number;
  present: number;
  absent: number;
  avgGrade: string;
}

export interface StudentSessionRow {
  key: string;
  date: string;
  className: string;
  isApplied: boolean;
  status: OfficialAttendanceStatus;
  lateMinutes: number | null;
  grade: number | null;
}

export interface ReportsLoadIssue {
  source: string;
  message: string;
  critical: boolean;
}

export interface ReportsLoadResult {
  snapshot: ReportsSnapshot;
  issues: ReportsLoadIssue[];
}

export interface ReportsSnapshot {
  students: StudentRow[];
  classes: ClassRow[];
  teachers: TeacherRow[];
  payments: PaymentRow[];
  tuitionPlans: TuitionPlanRow[];
  najmSessions: NajmSessionRow[];
  najmRecords: NajmRecordRow[];
  najmTerms: NajmTermRow[];
  najmScoreItems: ReportNajmScoreItem[];
  grades: OfficialGradeRow[];
  attendance: OfficialAttendanceRow[];
}
