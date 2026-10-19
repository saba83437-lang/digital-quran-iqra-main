import { sortNajmItems, type NajmScoreItem } from "@/lib/najm";
import { supabase } from "@/lib/supabase";
import { buildOfficialNajmReportRows } from "../domain/report-najm-rows";
import type {
  ClassRow,
  NajmRecordRow,
  NajmScoreRecordRow,
  NajmSessionRow,
  NajmTermRow,
  PaymentRow,
  ReportsLoadIssue,
  ReportsLoadResult,
  StudentRow,
  TeacherRow,
  TuitionPlanRow,
} from "../domain/report-types";
import { fetchAllReportPages, type ReportPagedLoad } from "./reports-pagination";
import { loadSecureAdminStudents } from "@/features/identity/api/secure-identity-api";

const PAGE_SIZE = 500;

const SOURCE_LABELS: Record<string, string> = {
  students: "قرآن‌آموزان",
  classes: "کلاس‌ها",
  teachers: "اساتید",
  payments: "پرداخت‌ها",
  tuition_plans: "تعریف شهریه",
  najm_sessions: "جلسات نجم",
  najm_session_records: "رکوردهای جلسات نجم",
  najm_terms: "ترم‌های نجم",
  najm_score_items: "آیتم‌های نجم",
};

function issue(
  source: string,
  result: ReportPagedLoad<unknown>,
  critical: boolean,
): ReportsLoadIssue | null {
  if (!result.error) return null;
  return {
    source,
    critical,
    message: `خطا در دریافت ${SOURCE_LABELS[source] ?? source}: ${result.error}`,
  };
}

export class ReportSourceError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(message);
    this.name = "ReportSourceError";
  }
}

async function loadSecureReportStudents(): Promise<ReportPagedLoad<StudentRow>> {
  try {
    const rows = await loadSecureAdminStudents();
    return {
      data: rows.map((student) => ({
        id: student.id,
        name: String(student.name ?? ""),
        level: student.level ?? null,
        class_id: student.class_id ?? null,
        status: student.status ?? null,
        parent_name: student.parent_name ?? null,
        parent_phone: student.parent_phone ?? null,
        enrolled: student.enrolled ?? null,
        average_grade: student.average_grade ?? null,
        attendance_rate: student.attendance_rate ?? null,
        tuition_status: student.tuition_status ?? null,
      })),
      error: null,
    };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error.message : "خطای دریافت امن قرآن‌آموزان",
    };
  }
}

export async function loadAdminReportsSnapshot(): Promise<ReportsLoadResult> {
  const [
    studentsResult,
    classesResult,
    teachersResult,
    paymentsResult,
    plansResult,
    sessionsResult,
    recordsResult,
    termsResult,
    itemsResult,
  ] = await Promise.all([
    loadSecureReportStudents(),
    fetchAllReportPages((from, to) =>
      supabase
        .from("classes")
        .select("id, name, teacher_id, is_active, deleted_at, capacity")
        .order("id")
        .range(from, to),
    ),
    fetchAllReportPages((from, to) =>
      supabase
        .from("teachers")
        .select("id, name, specialty")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAllReportPages((from, to) =>
      supabase
        .from("payments")
        .select("id, student_id, semester, amount, paid_amount, date, status")
        .order("date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    fetchAllReportPages((from, to) =>
      supabase
        .from("tuition_plans")
        .select("id, semester, amount, created_at")
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    fetchAllReportPages((from, to) =>
      supabase
        .from("najm_sessions")
        .select(
          "id, class_id, class_name, teacher_id, session_date, term, academic_year, is_applied, created_at",
        )
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAllReportPages((from, to) =>
      supabase
        .from("najm_session_records")
        .select(
          "id, session_id, student_id, student_name, is_absent, absence_kind, attendance, exam_raw, recovery_bonus, session_score",
        )
        .order("id")
        .range(from, to),
    ),
    fetchAllReportPages((from, to) =>
      supabase
        .from("najm_terms")
        .select("id, title, term, academic_year, starts_at, ends_at, is_active, created_at")
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    fetchAllReportPages((from, to) =>
      supabase
        .from("najm_score_items")
        .select(
          "id, item_key, label, kind, max_score, weight, is_core, is_active, default_value, sort_order, created_at, updated_at",
        )
        .order("sort_order")
        .order("item_key")
        .range(from, to),
    ),
  ]);

  const issues = [
    issue("students", studentsResult, true),
    issue("classes", classesResult, true),
    issue("teachers", teachersResult, true),
    issue("payments", paymentsResult, false),
    issue("tuition_plans", plansResult, false),
    issue("najm_sessions", sessionsResult, true),
    issue("najm_session_records", recordsResult, true),
    issue("najm_terms", termsResult, true),
    issue("najm_score_items", itemsResult, true),
  ].filter((item): item is ReportsLoadIssue => item !== null);

  const students = studentsResult.data as StudentRow[];
  const classes = classesResult.data as ClassRow[];
  const teachers = teachersResult.data as TeacherRow[];
  const payments = paymentsResult.data as PaymentRow[];
  const tuitionPlans = plansResult.data as TuitionPlanRow[];
  const najmSessions = sessionsResult.data as NajmSessionRow[];
  const najmRecords = recordsResult.data as NajmRecordRow[];
  const najmTerms = termsResult.data as NajmTermRow[];
  const najmScoreItems = sortNajmItems(itemsResult.data as NajmScoreItem[]);
  const { attendance, grades } = buildOfficialNajmReportRows({
    sessions: najmSessions,
    records: najmRecords,
    teachers,
    scoreItems: najmScoreItems,
  });

  return {
    snapshot: {
      students,
      classes,
      teachers,
      payments,
      tuitionPlans,
      najmSessions,
      najmRecords,
      najmTerms,
      najmScoreItems,
      grades,
      attendance,
    },
    issues,
  };
}

export async function loadNajmSessionDetail(sessionId: string): Promise<NajmScoreRecordRow[]> {
  const { data, error } = await supabase
    .from("najm_session_records")
    .select(
      "id, session_id, student_id, student_name, is_absent, absence_kind, attendance, homework, exam_raw, discipline, special_progress, special_help, negative_disorder, negative_disrespect, recovery_bonus, session_score, custom_scores",
    )
    .eq("session_id", sessionId)
    .order("student_name")
    .order("id");
  if (error) throw new ReportSourceError("najm_session_detail", error.message);
  return (data ?? []) as NajmScoreRecordRow[];
}

export async function loadStudentPaymentHistory(studentId: string | number): Promise<PaymentRow[]> {
  const result = await fetchAllReportPages((from, to) =>
    supabase
      .from("payments")
      .select("id, student_id, semester, amount, paid_amount, date, status")
      .eq("student_id", studentId)
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  if (result.error) throw new ReportSourceError("student_payments", result.error);
  return result.data as PaymentRow[];
}
