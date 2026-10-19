// ============================================================================
// Smart Recitation — Student API (فاز 21A)
// قرآن‌آموز: مشاهده تکالیف/چالش روزانه + شروع و پایان تمرین + تاریخچه
// ============================================================================
import { supabase } from "@/lib/supabase";
import type {
  AttemptResult,
  AttemptScores,
  RecitationAssignment,
  RecitationAttempt,
  RecitationDailyChallenge,
  RecitationPassage,
  RecitationPassageVersion,
  StudentGamification,
} from "../domain/recitation-types";
import { getAudioSignedUrl } from "./recitation-admin-api";

/** تکالیف فعال من */
export async function listMyAssignments() {
  const { data, error } = await supabase
    .from("recitation_assignments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RecitationAssignment[];
}

/** چالش روزانه امروز */
export async function getTodayChallenge() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("recitation_daily_challenges")
    .select("*")
    .eq("challenge_date", today)
    .maybeSingle();
  if (error) throw error;
  return data as RecitationDailyChallenge | null;
}

/** دریافت فراز منتشرشده (برای تمرین آزاد) */
export async function getPublishedPassage(passageId: string) {
  const { data, error } = await supabase
    .from("recitation_passages")
    .select("*")
    .eq("id", passageId)
    .eq("status", "published")
    .single();
  if (error) throw error;
  return data as RecitationPassage;
}

/** فرازهای منتشرشده (برای تمرین آزاد) */
export async function listPublishedPassages() {
  const { data, error } = await supabase
    .from("recitation_passages")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RecitationPassage[];
}

/** نسخه تأییدشده فراز (برای پخش صوت و امتیازدهی) */
export async function getApprovedVersion(passageId: string) {
  const { data, error } = await supabase
    .from("recitation_passage_versions")
    .select("*")
    .eq("passage_id", passageId)
    .not("approved_at", "is", null)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RecitationPassageVersion | null;
}

/** شروع تمرین (بر اساس تخصیص یا فراز آزاد) — فقط پارامتر واقعی ارسال می‌شود */
export async function startAttempt(params: { assignmentId?: string; passageId?: string }) {
  const args: Record<string, unknown> = {};
  if (params.assignmentId) args.p_assignment_id = params.assignmentId;
  if (params.passageId) args.p_passage_id = params.passageId;

  const { data, error } = await supabase.rpc("student_start_attempt", args);
  if (error) throw error;
  return data as string;
}

/** پایان تمرین — امتیازدهی رسمی در سرور انجام می‌شود */
export async function finishAttempt(params: {
  attemptId: string;
  durationMs: number;
  deviceInfo?: Record<string, unknown>;
  scores?: Partial<AttemptScores>;
}) {
  const { data, error } = await supabase.rpc("student_finish_attempt", {
    p_attempt_id: params.attemptId,
    p_duration_ms: params.durationMs,
    p_device_info: params.deviceInfo ?? {},
    p_scores: params.scores ?? {},
  });
  if (error) throw error;
  return data as AttemptResult;
}

/** تاریخچه تلاش‌های من (برای یک فراز یا همه) */
export async function getMyAttempts(passageId?: string) {
  let q = supabase
    .from("recitation_attempts")
    .select("*")
    .order("started_at", { ascending: false });
  if (passageId) q = q.eq("passage_id", passageId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RecitationAttempt[];
}

/** موجودی سکه/XP من — RPC یک جدول (آرایه) برمی‌گرداند، پس ردیف اول را برمی‌گردانیم */
export async function getMyGamification() {
  // توجه: p_student_id را ارسال نمی‌کنیم (نداشتن پارامتر = استفاده از default تابع).
  // ارسال null در supabase-js می‌تواند به شکل رشته "null" برود و خطای 400 بدهد.
  const { data, error } = await supabase.rpc("get_student_gamification", {});
  if (error) throw error;
  const rows = (data ?? []) as StudentGamification[];
  return rows[0] ?? null;
}

/** بسته کامل اطلاعات یک چالش (فراز + نسخه + لینک صوتی + تاریخچه من) */
export async function loadChallengeBundle(params: {
  assignmentId?: string;
  passageId?: string;
}) {
  let passageId = params.passageId;

  if (params.assignmentId && !passageId) {
    const { data, error } = await supabase
      .from("recitation_assignments")
      .select("*")
      .eq("id", params.assignmentId)
      .single();
    if (error) throw error;
    const assignment = data as RecitationAssignment;
    passageId = assignment.passage_id;
  }

  if (!passageId) throw new Error("passageId is required");

  const [passage, version, attempts] = await Promise.all([
    getPublishedPassage(passageId),
    getApprovedVersion(passageId),
    getMyAttempts(passageId),
  ]);

  const audioUrl = version ? await getAudioSignedUrl(version.audio_path) : null;

  return { passage, version, attempts, audioUrl };
}
