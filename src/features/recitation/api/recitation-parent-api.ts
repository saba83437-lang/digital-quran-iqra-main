// ============================================================================
// Smart Recitation — Parent API (فاز 21A)
// والدین: مشاهده پیشرفت فرزندان در چالش تقلید
// ============================================================================
import { supabase } from "@/lib/supabase";
import type {
  ParentChildSummary,
  RecitationAttempt,
  StudentGamification,
} from "../domain/recitation-types";

/** خلاصه پیشرفت همه فرزندان (RPC امن) */
export async function getChildrenSummary() {
  const { data, error } = await supabase.rpc("parent_children_attempt_summary");
  if (error) throw error;
  return (data ?? []) as ParentChildSummary[];
}

/** موجودی سکه/XP یک فرزند — RPC یک جدول (آرایه) برمی‌گرداند، پس ردیف اول را برمی‌گردانیم */
export async function getChildGamification(studentId: number) {
  const { data, error } = await supabase.rpc("get_student_gamification", {
    p_student_id: studentId,
  });
  if (error) throw error;
  const rows = (data ?? []) as StudentGamification[];
  return rows[0] ?? null;
}

/** آخرین تلاش‌های یک فرزند */
export async function getChildAttempts(studentId: number) {
  const { data, error } = await supabase
    .from("recitation_attempts")
    .select("*")
    .eq("student_id", studentId)
    .order("started_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as RecitationAttempt[];
}
