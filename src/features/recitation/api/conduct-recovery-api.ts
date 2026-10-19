import { supabase } from "@/lib/supabase";

export interface ConductRecoveryCase {
  id: string;
  student_id: number;
  source_session_id: string;
  conduct_type: "negative_disorder" | "negative_disrespect";
  initial_deduction: number;
  recovered_amount: number;
  remaining_amount: number;
  recovery_sessions_limit: number;
  recovery_sessions_used: number;
  recovery_sessions_remaining: number;
  status: "open" | "in_recovery" | "resolved" | "expired" | "escalated";
  private_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ConductRecoveryHistoryEvent {
  id: string;
  case_id: string;
  session_id: string;
  student_id: number;
  amount: number;
  created_at: string;
  conduct_type: ConductRecoveryCase["conduct_type"];
  case_status: ConductRecoveryCase["status"];
  source_session_id: string;
  source_session_date: string | null;
  target_session_date: string | null;
}

export interface ConductRecoveryHistory {
  sourceCases: Array<
    Omit<ConductRecoveryCase, "private_note"> & { source_session_date: string | null }
  >;
  appliedEvents: ConductRecoveryHistoryEvent[];
}

export async function loadTeacherConductRecoveryCases(): Promise<ConductRecoveryCase[]> {
  const { data, error } = await supabase.rpc("get_teacher_conduct_recovery_cases");
  if (error) throw new Error(`دریافت موارد جبران ناموفق بود: ${error.message}`);
  return Array.isArray(data) ? (data as ConductRecoveryCase[]) : [];
}

export async function recordTeacherConductRecovery(input: {
  caseId: string;
  sessionId: string;
  amount?: number;
  note?: string | null;
}): Promise<ConductRecoveryCase & { ok: boolean }> {
  const { data, error } = await supabase.rpc("record_teacher_conduct_recovery", {
    p_case_id: input.caseId,
    p_session_id: input.sessionId,
    p_amount: input.amount ?? 1,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(`ثبت جبران ناموفق بود: ${error.message}`);
  return data as ConductRecoveryCase & { ok: boolean };
}

/**
 * Loads only the audit chain for one student/session. RLS remains authoritative:
 * admin sees all, teacher sees assigned students, student sees self, and parent
 * sees only linked children. Private notes are deliberately not selected.
 */
export async function loadConductRecoveryHistory(input: {
  studentId: string | number;
  sessionId: string;
}): Promise<ConductRecoveryHistory> {
  const studentId = Number(input.studentId);
  if (!Number.isSafeInteger(studentId) || studentId <= 0) {
    throw new Error("شناسه قرآن‌آموز برای تاریخچه جبران نامعتبر است.");
  }
  const { data, error } = await supabase.rpc("get_conduct_recovery_history", {
    p_student_id: studentId,
    p_session_id: input.sessionId,
  });
  if (error) throw new Error(`دریافت تاریخچه جبران ناموفق بود: ${error.message}`);
  const value = (data ?? {}) as Partial<ConductRecoveryHistory>;
  return {
    sourceCases: Array.isArray(value.sourceCases) ? value.sourceCases : [],
    appliedEvents: Array.isArray(value.appliedEvents) ? value.appliedEvents : [],
  };
}
