// ============================================================================
// Smart Recitation — Teacher API (فاز 21A)
// استاد فقط: مشاهده فرازهای منتشرشده + تخصیص به کلاس + مشاهده نتایج
// ============================================================================
import { supabase } from "@/lib/supabase";
import type {
  RecitationAssignment,
  RecitationPassage,
  TeacherClassAttemptRow,
} from "../domain/recitation-types";

/** فرازهای منتشرشده (برای انتخاب و تخصیص) */
export async function listPublishedPassages() {
  const { data, error } = await supabase
    .from("recitation_passages")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RecitationPassage[];
}

/** تخصیص‌های استاد جاری */
export async function listMyAssignments() {
  const { data, error } = await supabase
    .from("recitation_assignments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RecitationAssignment[];
}

/** تخصیص فراز به کلاس (RPC امن) — فقط پارامترهای واقعی ارسال می‌شوند */
export async function assignPassage(params: {
  passageId: string;
  versionId: string;
  classId: number;
  title: string;
  type: string;
  startsAt?: string;
  dueAt?: string;
}) {
  const args: Record<string, unknown> = {
    p_passage_id: params.passageId,
    p_version_id: params.versionId,
    p_class_id: params.classId,
    p_title: params.title,
    p_type: params.type,
  };
  if (params.startsAt) args.p_starts_at = params.startsAt;
  if (params.dueAt) args.p_due_at = params.dueAt;

  const { data, error } = await supabase.rpc("teacher_assign_passage", args);
  if (error) throw error;
  return data as string;
}

/** لغو تخصیص */
export async function cancelAssignment(assignmentId: string) {
  const { error } = await supabase.rpc("teacher_cancel_assignment", {
    p_assignment_id: assignmentId,
  });
  if (error) throw error;
}

/** نتایج تلاش‌های قرآن‌آموزان یک کلاس */
export async function getClassAttempts(classId: number) {
  const { data, error } = await supabase.rpc("teacher_class_attempts", {
    p_class_id: classId,
  });
  if (error) throw error;
  return (data ?? []) as TeacherClassAttemptRow[];
}
