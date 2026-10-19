import { supabase } from "./supabase";
import type { NajmTerm } from "./najm";

/**
 * API مرکزی افتخارات نسخه اول.
 * تمام محاسبات آموزشی در RPCهای دیتابیس و فقط از روی طرح نجم انجام می‌شود.
 */

export type AchievementTier = "bronze" | "silver" | "gold" | "diamond" | "special";
export type AchievementDecisionMode = "automatic" | "admin_approval" | "manual";
export type TeacherAchievementPermission = "none" | "nominate";
export type AchievementGrantMethod =
  "automatic" | "admin_direct" | "teacher_nomination" | "legacy_migration";
export type AchievementSource =
  | "najm"
  | "special_activity"
  | "competition"
  | "occasion"
  | "admin_direct"
  | "teacher_nomination"
  | "legacy_migration"
  | "hybrid"
  | "other";

export interface EarnedAchievement {
  student_achievement_id: string;
  achievement_id: string;
  slug: string;
  title: string;
  description: string;
  icon_key: string;
  artwork_url: string | null;
  artwork_vector_url?: string | null;
  artwork_model_url?: string | null;
  artwork_manufacturing_url?: string | null;
  artwork_version?: number;
  tier: AchievementTier;
  /** برچسب و تصویر سطح فعلی (برای افتخارهای سطح‌دار) */
  tier_label?: string | null;
  tier_image_url?: string | null;
  tier_bonus_points?: number | null;
  congrats_message?: string | null;
  certificate_enabled?: boolean;
  bonus_note?: string | null;
  show_in_profile?: boolean;
  show_in_leaderboard?: boolean;
  visibility: "private" | "profile" | "leaderboard";
  reason: string;
  grant_method: AchievementGrantMethod;
  achievement_source: AchievementSource;
  awarded_at: string;
  term: NajmTerm | null;
  academic_year: string | null;
  /** تاریخچه‌ی همه‌ی سطوح کسب‌شده‌ی همین افتخار برای این فرد */
  tier_history?: AchievementTierHistoryItem[];
}

/** یک قدم از تاریخچه‌ی سطح‌های یک افتخار (جدیدترین/مسیر کسب سطوح) */
export interface AchievementTierHistoryItem {
  tier: string | null;
  tier_label: string | null;
  tier_image_url: string | null;
  awarded_at: string;
  term: string | null;
  academic_year: string | null;
  reason: string | null;
}

export interface AchievementConditionProgress {
  metric: string;
  operator: ">=" | ">" | "<=" | "<" | "=" | "between";
  current: number;
  target: number;
  max_target: number | null;
  met: boolean;
}

export interface AchievementEvaluation {
  met: boolean;
  manual?: boolean;
  logic?: "all" | "any";
  rule_id?: string;
  rule_version?: number;
  conditions: AchievementConditionProgress[];
  /** فیلدهای مخصوص افتخار پلکانی نجم — سطح بعدی و وضعیت */
  next_tier?: string | null;
  next_tier_label?: string | null;
  next_tier_image_url?: string | null;
  next_tier_bonus_points?: number | null;
  next_tier_congrats?: string | null;
  rule_mode?: boolean;
  done?: boolean;
  paused?: boolean;
  current?: number;
  threshold?: number;
  sessions_count?: number;
}

export interface LockedAchievementProgress {
  achievement_id: string;
  slug: string;
  title: string;
  description: string;
  locked_hint: string | null;
  icon_key: string;
  tier: AchievementTier;
  is_secret: boolean;
  decision_mode: AchievementDecisionMode;
  evaluation: AchievementEvaluation;
}

export interface StudentAchievementShowcase {
  student_id: number;
  earned: EarnedAchievement[];
  progress: LockedAchievementProgress[];
}

export interface AchievementCategory {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon_key: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface AchievementRule {
  id: string;
  achievement_id: string;
  version: number;
  title: string;
  logic: "all" | "any";
  conditions: Array<{
    metric: string;
    operator: ">=" | ">" | "<=" | "<" | "=" | "between";
    value: number;
    max_value?: number;
    params?: Record<string, unknown>;
  }>;
  is_active: boolean;
}

export interface AchievementDefinition {
  id: string;
  category_id: string | null;
  category_title: string | null;
  slug: string;
  title: string;
  description: string;
  locked_hint: string | null;
  icon_key: string;
  artwork_url: string | null;
  artwork_vector_url?: string | null;
  artwork_model_url?: string | null;
  artwork_manufacturing_url?: string | null;
  artwork_version?: number;
  tier: AchievementTier;
  decision_mode: AchievementDecisionMode;
  teacher_permission: TeacherAchievementPermission;
  repeat_policy: "once" | "per_term" | "per_year" | "multiple";
  visibility: "private" | "profile" | "leaderboard";
  is_secret: boolean;
  is_active: boolean;
  sort_order: number;
  active_rule: AchievementRule | null;
  recipient_count: number;
  award_count: number;
  metadata?: NajmQuestMetadata | null;
  quest_tiers?: NajmQuestTierRow[];

  /* ----- فیلدهای کامل تعریف افتخار (مهاجرت 202607260004) ----- */
  short_title?: string | null;
  congrats_message?: string | null;
  conditions_guide?: string | null;
  bonus_note?: string | null;
  certificate_enabled?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  duration_kind?: "permanent" | "periodic";
  max_awards?: number | null;
  allowed_class_ids?: number[];
  show_in_profile?: boolean;
  show_in_leaderboard?: boolean;
  created_by_user_id?: string | null;
  updated_by_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
  tier_award_counts?: Record<string, number>;
}

export interface AchievementArtworkAsset {
  id: string;
  achievement_id: string;
  version: number;
  status: "draft" | "approved" | "archived";
  image_url: string;
  vector_url: string | null;
  model_url: string | null;
  manufacturing_url: string | null;
  style_key: string;
  is_current: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AchievementCandidateSummary {
  id: string;
  achievement_id: string;
  achievement_title: string;
  achievement_tier: AchievementTier;
  student_id: number;
  student_name: string;
  class_name: string | null;
  nomination_source: "system" | "teacher";
  achievement_source: AchievementSource;
  status: "pending";
  reason: string;
  term: NajmTerm | null;
  academic_year: string | null;
  created_at: string;
}

export interface AchievementAwardSummary extends EarnedAchievement {
  id: string;
  student_id: number;
  student_name: string;
  class_name: string | null;
  grant_method: AchievementGrantMethod;
  achievement_source: AchievementSource;
  revoked_at: string | null;
}

export interface SpecialActivityType {
  id: string;
  slug: string;
  title: string;
  description: string;
  source_kind: "special_activity" | "competition" | "occasion" | "other";
  unit_label: string;
  allow_numeric_value: boolean;
  requires_admin_verification: boolean;
  teacher_can_record: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface StudentSpecialActivity {
  id: string;
  activity_type_id: string;
  activity_type_title: string;
  student_id: number;
  student_name: string;
  class_name: string | null;
  term: NajmTerm | null;
  academic_year: string | null;
  occurred_at: string;
  numeric_value: number;
  result_key: string | null;
  notes: string;
  evidence_url: string | null;
  status: "pending" | "verified" | "rejected" | "cancelled";
  created_at: string;
}

export interface AchievementManagementSnapshot {
  activity_types: SpecialActivityType[];
  pending_activities: StudentSpecialActivity[];
  categories: AchievementCategory[];
  definitions: AchievementDefinition[];
  pending_candidates: AchievementCandidateSummary[];
  recent_awards: AchievementAwardSummary[];
  settings: Record<string, unknown> | null;
}

export interface TeacherAchievementStudent {
  id: number;
  name: string;
  class_id: number;
  class_name: string;
  level: string | null;
  avatar_url: string | null;
  achievement_count: number;
  unique_badge_count: number;
  latest_achievement: {
    title: string;
    tier: AchievementTier;
    icon_key: string;
    awarded_at: string;
  } | null;
}

export interface TeacherNominatableAchievement {
  id: string;
  title: string;
  description: string;
  icon_key: string;
  tier: AchievementTier;
  repeat_policy: "once" | "per_term" | "per_year" | "multiple";
  category_title: string | null;
}

export interface TeacherAchievementNomination {
  id: string;
  student_id: number;
  student_name: string;
  achievement_id: string;
  achievement_title: string;
  achievement_tier: AchievementTier;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface TeacherAchievementWorkspace {
  teacher_id: number;
  active_term: { term: NajmTerm; academic_year: string; title: string } | null;
  students: TeacherAchievementStudent[];
  nominatable_achievements: TeacherNominatableAchievement[];
  my_recent_nominations: TeacherAchievementNomination[];
}

export interface ParentAchievementChild {
  id: number;
  name: string;
  relation: string;
  class_id: number | null;
  class_name: string;
  level: string | null;
  avatar_url: string | null;
  achievement_count: number;
  unique_badge_count: number;
  latest_achievement: {
    title: string;
    tier: AchievementTier;
    icon_key: string;
    achievement_source: AchievementSource;
    awarded_at: string;
  } | null;
}

export interface ParentAchievementWorkspace {
  parent_id: string;
  active_term: { term: NajmTerm; academic_year: string; title: string } | null;
  children: ParentAchievementChild[];
}

export interface AchievementLeaderboardRow {
  rank: number;
  student_id: number;
  display_name: string;
  class_id: number | null;
  class_name: string | null;
  unique_badges: number;
  total_awards: number;
  bronze_count: number;
  silver_count: number;
  gold_count: number;
  diamond_count: number;
  special_count: number;
  najm_percent: number;
  latest_achievement: {
    title: string;
    tier: AchievementTier;
    icon_key: string;
    awarded_at: string;
  } | null;
}

export interface AchievementLeaderboard {
  scope: "center" | "class";
  class_id: number | null;
  term: NajmTerm | null;
  academic_year: string | null;
  name_mode: "full" | "initials" | "hidden";
  leaderboard_enabled: boolean;
  total_students: number;
  rows: AchievementLeaderboardRow[];
}

export type AchievementHallMetricSource =
  "najm" | "achievement_count" | "achievement_unique_count" | "special_activity_count";

export interface AchievementHallRecord {
  student_id: number;
  student_name: string;
  class_id: number | null;
  class_name: string | null;
  avatar_url: string | null;
  poster_avatar_url: string | null;
  metric_value: number;
  rank: number;
}

export interface AchievementHallMetric {
  id: string;
  slug: string;
  title: string;
  description: string;
  source_kind: AchievementHallMetricSource;
  metric_key: string | null;
  metric_params: Record<string, unknown>;
  unit_label: string;
  value_format: "number" | "percent" | "decimal";
  sort_direction: "desc" | "asc";
  minimum_najm_records: number;
  minimum_value: number;
  is_active: boolean;
  sort_order: number;
  history_enabled: boolean;
  history_mode: "lifetime_live" | "term_final";
  history_title: string | null;
  records: AchievementHallRecord[];
}

export interface AchievementHallWinner {
  metric_id: string;
  metric_title: string;
  unit_label: string;
  value_format: "number" | "percent" | "decimal";
  student_id: number;
  student_name: string;
  class_name: string | null;
  avatar_url: string | null;
  poster_avatar_url: string | null;
  metric_value: number;
  rank: number;
}

export interface AchievementHallSnapshotSummary {
  id: string;
  term?: NajmTerm | null;
  academic_year: string;
  title: string;
  finalized_at: string;
}

export interface AchievementHallPosterSetting {
  id: string;
  poster_type: "record_holders" | "term_winners" | "year_winners";
  academic_year: string;
  term: NajmTerm | null;
  background_path: string | null;
  layout: Record<string, unknown> | null;
}

export interface AchievementHallData {
  term: NajmTerm;
  academic_year: string;
  all_metrics: AchievementHallMetric[];
  live_records: AchievementHallMetric[];
  term_winners: AchievementHallWinner[];
  year_winners: AchievementHallWinner[];
  term_finalized: boolean;
  year_finalized: boolean;
  term_snapshots: AchievementHallSnapshotSummary[];
  year_snapshots: AchievementHallSnapshotSummary[];
  posters: AchievementHallPosterSetting[];
}

export interface AchievementHistoryRecordEvent {
  id: string;
  student_id: number;
  student_name: string;
  class_name: string | null;
  avatar_url?: string | null;
  poster_avatar_url?: string | null;
  record_value: number;
  unit_label: string;
  value_format: "number" | "percent" | "decimal";
  term: NajmTerm | null;
  academic_year: string | null;
  achieved_at: string;
  became_record_at: string;
  superseded_at?: string | null;
  is_current?: boolean;
}

export interface AchievementHistoryRecord {
  metric_id: string;
  metric_slug: string;
  metric_title: string;
  history_title: string;
  history_mode: "lifetime_live" | "term_final";
  current: AchievementHistoryRecordEvent | null;
  history: AchievementHistoryRecordEvent[];
}

export interface AdminStudentAchievementProfile {
  student: {
    id: number;
    name: string;
    level: string | null;
    status: string | null;
    student_number: string | null;
    avatar_url: string | null;
    class_id: number | null;
    class_name: string | null;
    teacher_id: number | null;
    teacher_name: string | null;
  };
  active_term: { term: NajmTerm | null; academic_year: string | null };
  najm_summary: {
    session_count: number;
    present_count: number;
    absent_count: number;
    attendance_rate: number;
    average_exam: number | null;
    best_exam: number | null;
    average_homework: number | null;
    average_discipline: number | null;
    average_session_score: number | null;
    performance_percent: number;
    special_progress_total: number;
    special_help_total: number;
    negative_disorder_total: number;
    negative_disrespect_total: number;
  };
  najm_records: Array<{
    id: string;
    session_id: string;
    session_date: string;
    term: NajmTerm;
    academic_year: string;
    class_id: string | null;
    class_name: string | null;
    is_absent: boolean;
    attendance: number;
    homework: number;
    exam_raw: number;
    exam_display: number;
    discipline: number;
    special_progress: number;
    special_help: number;
    negative_disorder: number;
    negative_disrespect: number;
    session_score: number;
  }>;
  showcase: StudentAchievementShowcase;
  achievement_history: Array<{
    id: string;
    achievement_id: string;
    title: string;
    description: string;
    tier: AchievementTier;
    icon_key: string;
    grant_method: AchievementGrantMethod;
    achievement_source: AchievementSource;
    reason: string;
    term: NajmTerm | null;
    academic_year: string | null;
    awarded_at: string;
    revoked_at: string | null;
    revocation_reason: string | null;
  }>;
  special_activities: Array<{
    id: string;
    activity_type: string;
    source_kind: "special_activity" | "competition" | "occasion" | "other";
    occurred_at: string;
    numeric_value: number;
    result_key: string | null;
    notes: string;
    status: "pending" | "verified" | "rejected" | "cancelled";
    verification_note: string | null;
  }>;
  nomination_history: Array<{
    id: string;
    title: string;
    tier: AchievementTier;
    nomination_source: "system" | "teacher";
    achievement_source: AchievementSource;
    status: "pending" | "approved" | "rejected" | "cancelled";
    reason: string;
    decision_note: string | null;
    created_at: string;
    decided_at: string | null;
  }>;
}

export interface AppNotification {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AchievementRpcResult<T> {
  data: T | null;
  error: string | null;
}

function rpcErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "خطای ناشناخته در سامانه افتخارات";
}

export async function getAchievementManagementSnapshot(): Promise<
  AchievementRpcResult<AchievementManagementSnapshot>
> {
  const { data, error } = await supabase.rpc("admin_get_achievement_management_snapshot");
  if (error) return { data: null, error: error.message };
  return { data: data as AchievementManagementSnapshot, error: null };
}

export async function getTeacherAchievementWorkspace(): Promise<
  AchievementRpcResult<TeacherAchievementWorkspace>
> {
  const { data, error } = await supabase.rpc("get_teacher_achievement_workspace");
  if (error) return { data: null, error: error.message };
  return { data: data as TeacherAchievementWorkspace, error: null };
}

export async function getParentAchievementWorkspace(): Promise<
  AchievementRpcResult<ParentAchievementWorkspace>
> {
  const { data, error } = await supabase.rpc("get_parent_achievement_workspace");
  if (error) return { data: null, error: error.message };
  return { data: data as ParentAchievementWorkspace, error: null };
}

export async function saveSpecialActivityType(
  activityType: Partial<SpecialActivityType> & { title: string; slug: string },
): Promise<AchievementRpcResult<string>> {
  const { data, error } = await supabase.rpc("admin_save_special_activity_type", {
    p_activity_type: activityType,
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

export async function recordStudentSpecialActivity(input: {
  activityTypeId: string;
  studentId: number | string;
  occurredAt?: string;
  numericValue?: number;
  resultKey?: string;
  notes?: string;
  evidenceUrl?: string;
  sourceReference?: string;
  term?: NajmTerm | null;
  academicYear?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<AchievementRpcResult<string>> {
  const numericStudentId = Number(input.studentId);
  if (!Number.isSafeInteger(numericStudentId) || numericStudentId <= 0) {
    return { data: null, error: "شناسه قرآن‌آموز معتبر نیست" };
  }

  const { data, error } = await supabase.rpc("record_student_special_activity", {
    p_activity_type_id: input.activityTypeId,
    p_student_id: numericStudentId,
    p_occurred_at: input.occurredAt ?? new Date().toISOString(),
    p_numeric_value: input.numericValue ?? 1,
    p_result_key: input.resultKey?.trim() || null,
    p_notes: input.notes?.trim() || "",
    p_evidence_url: input.evidenceUrl?.trim() || null,
    p_source_reference: input.sourceReference?.trim() || null,
    p_term: input.term ?? null,
    p_academic_year: input.academicYear ?? null,
    p_metadata: input.metadata ?? {},
  });

  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

export async function decideStudentSpecialActivity(
  activityId: string,
  decision: "verified" | "rejected",
  note?: string,
): Promise<AchievementRpcResult<boolean>> {
  const { data, error } = await supabase.rpc("decide_student_special_activity", {
    p_activity_id: activityId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data === true, error: null };
}

export async function saveAchievementDefinition(
  definition: Partial<AchievementDefinition> & {
    title: string;
    slug: string;
    category_slug?: string;
  },
): Promise<AchievementRpcResult<string>> {
  const { data, error } = await supabase.rpc("admin_save_achievement_definition", {
    p_definition: definition,
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

export async function registerAchievementArtwork(input: {
  achievementId: string;
  imageUrl: string;
  vectorUrl?: string | null;
  modelUrl?: string | null;
  manufacturingUrl?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<AchievementRpcResult<string>> {
  const { data, error } = await supabase.rpc("admin_register_achievement_artwork", {
    p_achievement_id: input.achievementId,
    p_asset: {
      image_url: input.imageUrl,
      vector_url: input.vectorUrl ?? null,
      model_url: input.modelUrl ?? null,
      manufacturing_url: input.manufacturingUrl ?? null,
      style_key: "quranic_shamsa_3d",
      metadata: input.metadata ?? {},
    },
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

export async function getAchievementArtworkHistory(
  achievementId: string,
): Promise<AchievementRpcResult<AchievementArtworkAsset[]>> {
  const { data, error } = await supabase.rpc("admin_get_achievement_artwork_history", {
    p_achievement_id: achievementId,
  });
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as AchievementArtworkAsset[], error: null };
}

export async function publishAchievementRule(input: {
  achievementId: string;
  title: string;
  logic: "all" | "any";
  conditions: AchievementRule["conditions"];
  effectiveFrom?: string;
}): Promise<AchievementRpcResult<string>> {
  const { data, error } = await supabase.rpc("admin_publish_achievement_rule", {
    p_achievement_id: input.achievementId,
    p_title: input.title,
    p_logic: input.logic,
    p_conditions: input.conditions,
    p_effective_from: input.effectiveFrom ?? new Date().toISOString(),
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

export async function setAchievementActive(
  achievementId: string,
  isActive: boolean,
): Promise<AchievementRpcResult<boolean>> {
  const { data, error } = await supabase.rpc("admin_set_achievement_active", {
    p_achievement_id: achievementId,
    p_is_active: isActive,
  });
  if (error) return { data: null, error: error.message };
  return { data: data === true, error: null };
}

export async function getAchievementLeaderboard(options?: {
  scope?: "center" | "class";
  classId?: number | null;
  term?: NajmTerm | null;
  academicYear?: string | null;
  limit?: number;
}): Promise<AchievementRpcResult<AchievementLeaderboard>> {
  const { data, error } = await supabase.rpc("get_achievement_leaderboard", {
    p_scope: options?.scope ?? "center",
    p_class_id: options?.classId ?? null,
    p_term: options?.term ?? null,
    p_academic_year: options?.academicYear ?? null,
    p_limit: Math.min(Math.max(options?.limit ?? 50, 1), 100),
  });
  if (error) return { data: null, error: error.message };
  return { data: data as AchievementLeaderboard, error: null };
}

export async function getAchievementHall(options?: {
  term?: NajmTerm | null;
  academicYear?: string | null;
}): Promise<AchievementRpcResult<AchievementHallData>> {
  const { data, error } = await supabase.rpc("get_achievement_hall", {
    p_term: options?.term ?? null,
    p_academic_year: options?.academicYear ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as AchievementHallData, error: null };
}

export async function getAchievementHistoryRecords(): Promise<
  AchievementRpcResult<AchievementHistoryRecord[]>
> {
  const { data, error } = await supabase.rpc("get_achievement_history_records");
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as AchievementHistoryRecord[], error: null };
}

export async function saveAchievementHistoryMetricSettings(input: {
  metricId: string;
  enabled: boolean;
  mode: "lifetime_live" | "term_final";
  historyTitle: string;
}): Promise<AchievementRpcResult<boolean>> {
  const { data, error } = await supabase.rpc("admin_save_achievement_history_metric_settings", {
    p_metric_id: input.metricId,
    p_enabled: input.enabled,
    p_mode: input.mode,
    p_history_title: input.historyTitle,
  });
  if (error) return { data: null, error: error.message };
  return { data: data === true, error: null };
}

export async function refreshAllAchievementHistoryRecords(): Promise<AchievementRpcResult<number>> {
  const { data, error } = await supabase.rpc("admin_refresh_all_achievement_history_records");
  if (error) return { data: null, error: error.message };
  return { data: Number(data ?? 0), error: null };
}

export async function finalizeAchievementHall(input: {
  scope: "term" | "academic_year";
  term?: NajmTerm | null;
  academicYear: string;
}): Promise<AchievementRpcResult<string>> {
  const { data, error } = await supabase.rpc("admin_finalize_achievement_hall", {
    p_scope: input.scope,
    p_term: input.scope === "term" ? (input.term ?? null) : null,
    p_academic_year: input.academicYear,
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

export async function saveAchievementHallMetric(
  metric: Partial<AchievementHallMetric> & { title: string },
): Promise<AchievementRpcResult<string>> {
  const { data, error } = await supabase.rpc("admin_save_achievement_hall_metric", {
    p_metric: metric,
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

export async function saveAchievementHallPoster(input: {
  posterType: AchievementHallPosterSetting["poster_type"];
  academicYear: string;
  term?: NajmTerm | null;
  backgroundPath?: string | null;
  layout?: Record<string, unknown> | null;
}): Promise<AchievementRpcResult<string>> {
  const { data, error } = await supabase.rpc("admin_save_achievement_hall_poster", {
    p_poster_type: input.posterType,
    p_academic_year: input.academicYear,
    p_term: input.posterType === "year_winners" ? null : (input.term ?? null),
    p_background_path: input.backgroundPath ?? null,
    p_layout: input.layout ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

export async function updateAchievementPrivacy(input: {
  leaderboardEnabled: boolean;
  publicNameMode: "full" | "initials" | "hidden";
}): Promise<AchievementRpcResult<boolean>> {
  const { data, error } = await supabase.rpc("admin_update_achievement_privacy", {
    p_leaderboard_enabled: input.leaderboardEnabled,
    p_public_name_mode: input.publicNameMode,
  });
  if (error) return { data: null, error: error.message };
  return { data: data === true, error: null };
}

export async function getAdminStudentAchievementProfile(
  studentId: number | string,
): Promise<AchievementRpcResult<AdminStudentAchievementProfile>> {
  const numericStudentId = Number(studentId);
  if (!Number.isSafeInteger(numericStudentId) || numericStudentId <= 0) {
    return { data: null, error: "شناسه قرآن‌آموز معتبر نیست" };
  }
  const { data, error } = await supabase.rpc("admin_get_student_achievement_profile", {
    p_student_id: numericStudentId,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as AdminStudentAchievementProfile, error: null };
}

export async function getStudentAchievementShowcase(
  studentId: number | string,
  options?: { term?: NajmTerm | null; academicYear?: string | null },
): Promise<AchievementRpcResult<StudentAchievementShowcase>> {
  const numericStudentId = Number(studentId);
  if (!Number.isSafeInteger(numericStudentId) || numericStudentId <= 0) {
    return { data: null, error: "شناسه قرآن‌آموز معتبر نیست" };
  }

  const { data, error } = await supabase.rpc("get_student_achievement_showcase", {
    p_student_id: numericStudentId,
    p_term: options?.term ?? null,
    p_academic_year: options?.academicYear ?? null,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as StudentAchievementShowcase, error: null };
}

/** اجرای دستی بازبینی قوانین؛ اعطای خودکار پس از نجم یا رویداد تأییدشده انجام می‌شود. */
export async function evaluateStudentAchievements(
  studentId: number | string,
  options?: {
    term?: NajmTerm | null;
    academicYear?: string | null;
    sourceSessionId?: string | null;
    sourceActivityId?: string | null;
  },
): Promise<AchievementRpcResult<unknown[]>> {
  const numericStudentId = Number(studentId);
  if (!Number.isSafeInteger(numericStudentId) || numericStudentId <= 0) {
    return { data: null, error: "شناسه قرآن‌آموز معتبر نیست" };
  }

  const { data, error } = await supabase.rpc("evaluate_student_achievements", {
    p_student_id: numericStudentId,
    p_term: options?.term ?? null,
    p_academic_year: options?.academicYear ?? null,
    p_source_session_id: options?.sourceSessionId ?? null,
    p_source_activity_id: options?.sourceActivityId ?? null,
  });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as unknown[], error: null };
}

export async function nominateStudentForAchievement(input: {
  achievementId: string;
  studentId: number | string;
  reason: string;
  term?: NajmTerm | null;
  academicYear?: string | null;
  sourceSessionIds?: string[];
  sourceActivityIds?: string[];
}): Promise<AchievementRpcResult<string>> {
  try {
    const numericStudentId = Number(input.studentId);
    if (!Number.isSafeInteger(numericStudentId) || numericStudentId <= 0) {
      return { data: null, error: "شناسه قرآن‌آموز معتبر نیست" };
    }
    if (input.reason.trim().length < 3) {
      return { data: null, error: "ثبت دلیل نامزدی الزامی است" };
    }

    const { data, error } = await supabase.rpc("nominate_student_achievement", {
      p_achievement_id: input.achievementId,
      p_student_id: numericStudentId,
      p_reason: input.reason.trim(),
      p_term: input.term ?? null,
      p_academic_year: input.academicYear ?? null,
      p_source_session_ids: input.sourceSessionIds ?? [],
      p_source_activity_ids: input.sourceActivityIds ?? [],
    });

    if (error) return { data: null, error: error.message };
    return { data: String(data), error: null };
  } catch (error) {
    return { data: null, error: rpcErrorMessage(error) };
  }
}

export async function adminGrantStudentAchievement(input: {
  achievementId: string;
  studentId: number | string;
  reason: string;
  achievementSource?: Exclude<AchievementSource, "teacher_nomination">;
  term?: NajmTerm | null;
  academicYear?: string | null;
  sourceSessionIds?: string[];
  sourceActivityIds?: string[];
  /** برای افتخارهای سطح‌دار: کلید سطح انتخاب‌شده */
  tier?: string | null;
}): Promise<AchievementRpcResult<string>> {
  const numericStudentId = Number(input.studentId);
  if (!Number.isSafeInteger(numericStudentId) || numericStudentId <= 0) {
    return { data: null, error: "شناسه قرآن‌آموز معتبر نیست" };
  }
  if (input.reason.trim().length < 3) {
    return { data: null, error: "ثبت دلیل اعطای مستقیم الزامی است" };
  }

  const { data, error } = await supabase.rpc("admin_grant_student_achievement", {
    p_achievement_id: input.achievementId,
    p_student_id: numericStudentId,
    p_reason: input.reason.trim(),
    p_achievement_source: input.achievementSource ?? "admin_direct",
    p_term: input.term ?? null,
    p_academic_year: input.academicYear ?? null,
    p_source_session_ids: input.sourceSessionIds ?? [],
    p_source_activity_ids: input.sourceActivityIds ?? [],
    p_tier: input.tier ?? null,
  });

  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

export async function decideAchievementCandidate(
  candidateId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<AchievementRpcResult<string | null>> {
  const { data, error } = await supabase.rpc("decide_achievement_candidate", {
    p_candidate_id: candidateId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });

  if (error) return { data: null, error: error.message };
  return { data: data ? String(data) : null, error: null };
}

export async function revokeStudentAchievement(
  studentAchievementId: string,
  reason: string,
): Promise<AchievementRpcResult<boolean>> {
  if (reason.trim().length < 3) {
    return { data: null, error: "ثبت دلیل لغو نشان الزامی است" };
  }

  const { data, error } = await supabase.rpc("revoke_student_achievement", {
    p_student_achievement_id: studentAchievementId,
    p_reason: reason.trim(),
  });

  if (error) return { data: null, error: error.message };
  return { data: data === true, error: null };
}

export async function getMyAppNotifications(
  limit = 30,
): Promise<AchievementRpcResult<AppNotification[]>> {
  const { data, error } = await supabase.rpc("get_my_app_notifications", {
    p_limit: Math.min(Math.max(Math.round(limit), 1), 100),
  });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as AppNotification[], error: null };
}

export async function markAppNotificationRead(
  notificationId: string,
): Promise<AchievementRpcResult<boolean>> {
  const { data, error } = await supabase.rpc("mark_app_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) return { data: null, error: error.message };
  return { data: data === true, error: null };
}

export async function markAllAppNotificationsRead(): Promise<AchievementRpcResult<number>> {
  const { data, error } = await supabase.rpc("mark_all_app_notifications_read");
  if (error) return { data: null, error: error.message };
  return { data: Number(data ?? 0), error: null };
}

/* ------------------- قالب اعلان کسب افتخار (قابل‌ویرایش مدیر) ------------------- */

/**
 * متغیرهای پشتیبانی‌شده در قالب:
 * {نام فرد}، {افتخار}، {سطح} (و معادل لاتینِ آن‌ها) در سرور جایگذاری می‌شوند؛
 * {تاریخ} در نمایشگر اعلان به تاریخ دریافت تبدیل می‌شود.
 */
export interface AchievementNotifyTemplates {
  title: string;
  body: string;
}

export const DEFAULT_NOTIFY_TEMPLATES: AchievementNotifyTemplates = {
  title: "افتخار جدید: {افتخار}",
  body: "{نام فرد} «{افتخار}» را در تاریخ {تاریخ} دریافت کرد.",
};

export async function loadAchievementNotifyTemplates(): Promise<
  AchievementRpcResult<AchievementNotifyTemplates>
> {
  const { data, error } = await supabase.rpc("get_achievement_notify_templates");
  if (error) return { data: null, error: error.message };
  const templates = (data ?? {}) as Partial<AchievementNotifyTemplates>;
  return {
    data: {
      title: templates.title?.trim() ? templates.title : DEFAULT_NOTIFY_TEMPLATES.title,
      body: templates.body?.trim() ? templates.body : DEFAULT_NOTIFY_TEMPLATES.body,
    },
    error: null,
  };
}

export async function saveAchievementNotifyTemplates(
  templates: AchievementNotifyTemplates,
): Promise<AchievementRpcResult<AchievementNotifyTemplates>> {
  const { data, error } = await supabase.rpc("admin_save_achievement_notify_templates", {
    p_templates: templates,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as AchievementNotifyTemplates, error: null };
}

/**
 * جایگذاری توکن تاریخ در متن اعلان ذخیره‌شده (سمت کلاینت کنار نمایش‌گر زنگ اعلان؛
 * تاریخ دریافت همان created_at اعلان است).
 */
export function renderNotificationDateTokens(text: string, createdAtIso: string): string {
  if (!text) return text;
  let dateText = createdAtIso;
  try {
    dateText = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(createdAtIso));
  } catch {
    // اگر تاریخ نامعتبر بود همان مقدار خام نمایش داده می‌شود
  }
  return text.replaceAll("{تاریخ}", dateText).replaceAll("{date}", dateText);
}

// ============================================================
//  افتخارات پلکانی مبتنی بر آیتم طرح نجم (2026-07-26)
// ============================================================

export type NajmQuestMetric = "per_session_min" | "window_sum" | "window_avg";

export const NAJM_QUEST_METRICS: { value: NajmQuestMetric; label: string; hint: string }[] = [
  {
    value: "per_session_min",
    label: "حداقل در هر جلسه",
    hint: "در هر کدام از جلسات پنجره، نمره آیتم حداقل مقدار تعیین‌شده باشد",
  },
  {
    value: "window_sum",
    label: "مجموع جلسات",
    hint: "جمع نمره آیتم در جلسات پنجره حداقل مقدار تعیین‌شده باشد",
  },
  {
    value: "window_avg",
    label: "میانگین جلسات",
    hint: "میانگین نمره آیتم در جلسات پنجره حداقل مقدار تعیین‌شده باشد",
  },
];

export type NajmQuestTierKey = string;

export const NAJM_QUEST_TIER_LADDER: { key: string; label: string; color: string }[] = [
  { key: "bronze", label: "برنزی", color: "text-amber-700 bg-amber-100 border-amber-300" },
  { key: "silver", label: "نقره‌ای", color: "text-slate-600 bg-slate-100 border-slate-300" },
  { key: "gold", label: "طلا", color: "text-yellow-700 bg-yellow-100 border-yellow-300" },
  { key: "diamond", label: "الماسی", color: "text-sky-700 bg-sky-100 border-sky-300" },
];

export interface NajmQuestTierConfig {
  tier: NajmQuestTierKey;
  sessions_count: number;
  threshold: number;
}

/**
 * سطح یک افتخار — قابل تعمیم به سطوح سفارشی (نام، تصویر، پیام تبریک، امتیاز هدیه،
 * شرایط آزاد برای نشان‌های دستی و فعال/غیرفعال).
 */
export interface NajmQuestTierRow extends NajmQuestTierConfig {
  id?: string;
  achievement_id?: string;
  level_index?: number;
  label?: string | null;
  image_url?: string | null;
  congrats_message?: string | null;
  bonus_points?: number;
  conditions_text?: string | null;
  is_active?: boolean;
  /** قانون گرافیکی سطح (قانون‌ساز) — مهاجرت 202607260005 */
  rule_config?: AchievementRuleConfig | null;
  breach_behavior?: AchievementBreachBehavior;
  rule_priority?: number;
}

export interface NajmQuestMetadata {
  quest_kind?: "najm_item";
  item_key?: string;
  metric?: NajmQuestMetric;
  [key: string]: unknown;
}

export interface NajmQuestEvaluationResult {
  granted: number;
  candidates: number;
  term?: string;
  academic_year?: string;
  reason?: string;
  evaluated_at?: string;
}

/** ذخیره افتخار پلکانی (ایجاد/ویرایش کامل با سطوح) */
export async function saveNajmQuest(input: {
  id?: string | null;
  title: string;
  slug: string;
  description?: string;
  locked_hint?: string;
  icon_key?: string;
  category_slug?: string;
  decision_mode?: AchievementDecisionMode;
  visibility?: "private" | "profile" | "leaderboard";
  is_secret?: boolean;
  is_active?: boolean;
  sort_order?: number;
  item_key: string;
  metric: NajmQuestMetric;
  tiers: NajmQuestTierConfig[];
}): Promise<AchievementRpcResult<string>> {
  const { id, item_key, metric, tiers, ...definition } = input;
  const { data, error } = await supabase.rpc("admin_save_najm_quest", {
    p_definition: {
      ...definition,
      id: id ?? null,
      metadata: { item_key, metric },
    },
    p_tiers: tiers,
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

/** حذف افتخار پلکانی — اگر تا به حال استفاده شده باشد «بایگانی» می‌شود */
/**
 * حذف یکپارچه افتخار (هر دو نوع):
 * اگر سابقه اعطا/نامزدی داشته باشد «حذف نرم» (سوابق کاملاً حفظ می‌شود)،
 * در غیر این صورت حذف کامل.
 */
export async function deleteAchievement(
  achievementId: string,
): Promise<AchievementRpcResult<"deleted" | "archived">> {
  const { data, error } = await supabase.rpc("admin_delete_achievement", {
    p_achievement_id: achievementId,
  });
  if (error) return { data: null, error: error.message };
  return { data: data === "deleted" ? "deleted" : "archived", error: null };
}

export async function deleteNajmQuest(
  achievementId: string,
): Promise<AchievementRpcResult<"deleted" | "archived">> {
  return deleteAchievement(achievementId);
}

/** حذف نشان دستی (همان حذف یکپارچه با حذف نرم) */
export async function deleteManualBadge(
  achievementId: string,
): Promise<AchievementRpcResult<"deleted" | "archived">> {
  return deleteAchievement(achievementId);
}

/** کپی کامل افتخار با همه‌ی سطوحش — کپی به‌صورت غیرفعال ساخته می‌شود */
export async function duplicateAchievement(
  achievementId: string,
): Promise<AchievementRpcResult<string>> {
  const { data, error } = await supabase.rpc("admin_duplicate_achievement", {
    p_achievement_id: achievementId,
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}

/** ارزیابی گروهی و بروز همه افتخارهای پلکانی (ترم فعال، جلسات اعمال‌شده) */
export async function evaluateNajmQuestsNow(): Promise<
  AchievementRpcResult<NajmQuestEvaluationResult>
> {
  const { data, error } = await supabase.rpc("evaluate_najm_item_quests");
  if (error) return { data: null, error: error.message };
  return { data: data as NajmQuestEvaluationResult, error: null };
}

/* ------------------------------------------------------------------ */
/* ----------  ذخیره کامل افتخار با سطوح سفارشی (مهاجرت 004)  --------- */
/* ------------------------------------------------------------------ */

/** سطح افتخار برای ذخیره — برای نوع «دستی» فیلدهای عددی نادیده گرفته می‌شوند */
export interface AchievementLevelInput {
  /** کلید یکتای سطح (درون یک افتخار)؛ برای سطح جدید خالی بماند تا خودکار ساخته شود */
  tier: string;
  /** نام سطح (مثلاً برنزی، یاقوت و …) */
  label: string;
  image_url?: string | null;
  congrats_message?: string | null;
  bonus_points?: number;
  conditions_text?: string | null;
  is_active?: boolean;
  /** فقط نوع خودکار نجم: تعداد جلسات و مرز نمره (حالت ساده) */
  sessions_count?: number;
  threshold?: number;
  /** قانون گرافیکی سطح (قانون‌ساز) — در صورت وجود، بر حالت ساده اولویت دارد */
  rule_config?: AchievementRuleConfig | null;
  breach_behavior?: AchievementBreachBehavior;
  rule_priority?: number;
}

/* ------------------------------------------------------------------ */
/* ----------  قانون‌ساز افتخار (انواع و تولید خلاصه‌ی فارسی) ---------- */
/* ------------------------------------------------------------------ */

export const RULE_CALC_OPTIONS = [
  { value: "sum", label: "مجموع امتیاز" },
  { value: "avg", label: "میانگین امتیاز" },
  { value: "avg_recorded", label: "میانگین فقط جلسات دارای ثبت" },
  { value: "per_session_min", label: "مقدار امتیاز مطلوب برای هر جلسه" },
  { value: "count_records", label: "تعداد دفعات ثبت" },
  { value: "session_count", label: "تعداد جلسات" },
  { value: "streak", label: "تعداد جلسات متوالی" },
  { value: "percent_of_cap", label: "درصد کسب‌شده از سقف امتیاز" },
  { value: "min", label: "کمترین امتیاز ثبت‌شده" },
  { value: "max", label: "بیشترین امتیاز ثبت‌شده" },
  { value: "exam_count", label: "تعداد آزمون‌ها" },
  { value: "homework_done", label: "تعداد تکالیف تحویل‌شده" },
  { value: "homework_missed", label: "تعداد تکالیف تحویل‌نشده" },
  { value: "absence_count", label: "تعداد غیبت‌ها" },
  { value: "late_count", label: "تعداد تأخیرها" },
  { value: "negative_sum", label: "مجموع امتیازهای منفی" },
  { value: "composite", label: "ترکیبی از چند آیتم" },
] as const;
export type RuleCalc = (typeof RULE_CALC_OPTIONS)[number]["value"];

export const RULE_OPERATOR_OPTIONS = [
  { value: "eq", label: "مساوی" },
  { value: "ne", label: "نامساوی" },
  { value: "gt", label: "بیشتر از" },
  { value: "ge", label: "بیشتر یا مساوی" },
  { value: "lt", label: "کمتر از" },
  { value: "le", label: "کمتر یا مساوی" },
  { value: "between", label: "بین دو مقدار" },
  { value: "is_zero", label: "صفر بودن" },
  { value: "never", label: "رخ ندادن" },
  { value: "at_least_once", label: "حداقل یک بار رخ دادن" },
] as const;
export type RuleOperator = (typeof RULE_OPERATOR_OPTIONS)[number]["value"];

export const RULE_WINDOW_KIND_OPTIONS = [
  { value: "sessions", label: "تعداد جلسه" },
  { value: "days", label: "روز" },
  { value: "weeks", label: "هفته" },
  { value: "months", label: "ماه" },
  { value: "term", label: "ترم" },
  { value: "academic_year", label: "سال تحصیلی" },
] as const;
export type RuleWindowKind = (typeof RULE_WINDOW_KIND_OPTIONS)[number]["value"];

export const RULE_BREACH_OPTIONS = [
  { value: "block", label: "فقط از دریافت سطح جدید جلوگیری شود" },
  { value: "block_upgrade", label: "سطح فعلی حفظ شود اما ارتقا انجام نشود" },
  { value: "reset_chain", label: "زنجیره از ابتدا محاسبه شود" },
  { value: "pause_chain", label: "زنجیره موقتاً متوقف شود" },
  { value: "deduct_points", label: "بخشی از امتیاز کسر شود (پیشنهاد برای بررسی مدیر)" },
  { value: "revoke_previous", label: "سطح قبلی لغو شود" },
  { value: "review", label: "موضوع برای بررسی دستی مدیر ارسال شود" },
  { value: "none", label: "هیچ اقدام خودکاری انجام نشود" },
] as const;
export type AchievementBreachBehavior = (typeof RULE_BREACH_OPTIONS)[number]["value"];

export interface AchievementRuleCondition {
  type?: "condition";
  item_key: string;
  calc: RuleCalc;
  composite_items?: string[];
  composite_agg?: "sum" | "avg" | "min" | "max";
  operator: RuleOperator;
  value?: number;
  value2?: number;
  window?: { kind: RuleWindowKind; count?: number };
  polarity?: "positive" | "negative";
  violation_trigger?: boolean;
  is_active?: boolean;
  label?: string;
}

export interface AchievementRuleGroup {
  type: "group";
  logic: "all" | "any" | "at_least";
  logic_count?: number;
  children: (AchievementRuleGroup | AchievementRuleCondition)[];
}

/** پیکربندی قانون یک سطح — ریشه همیشه گروه است */
export type AchievementRuleConfig = Omit<AchievementRuleGroup, "type"> & { type?: "group" };

function ruleWindowFa(window?: AchievementRuleCondition["window"]): string {
  const kind = window?.kind ?? "term";
  const count = window?.count ?? 0;
  switch (kind) {
    case "sessions":
      return `در ${count} جلسه${window?.count === 1 ? "" : "‌ی اخیر"}`;
    case "days":
      return `در ${count} روز گذشته`;
    case "weeks":
      return `در ${count} هفته‌ی گذشته`;
    case "months":
      return `در ${count} ماه گذشته`;
    case "academic_year":
      return "در سال تحصیلی جاری";
    default:
      return "در ترم جاری";
  }
}

function ruleOperatorFa(operator: RuleOperator, value?: number, value2?: number): string {
  switch (operator) {
    case "eq":
      return `دقیقاً ${value ?? 0} باشد`;
    case "ne":
      return `${value ?? 0} نباشد`;
    case "gt":
      return `بیشتر از ${value ?? 0} باشد`;
    case "ge":
      return `حداقل ${value ?? 0} باشد`;
    case "lt":
      return `کمتر از ${value ?? 0} باشد`;
    case "le":
      return `حداکثر ${value ?? 0} باشد`;
    case "between":
      return `بین ${value ?? 0} و ${value2 ?? 0} باشد`;
    case "is_zero":
      return "صفر باشد";
    case "never":
      return "اصلاً رخ نداده باشد";
    case "at_least_once":
      return "حداقل یک بار رخ داده باشد";
    default:
      return `حداقل ${value ?? 0} باشد`;
  }
}

/** خلاصه‌ی فارسیِ خوانا از یک شرط */
export function buildConditionSummaryFa(
  condition: AchievementRuleCondition,
  itemLabel: (key: string) => string,
): string {
  const calcLabel = RULE_CALC_OPTIONS.find((o) => o.value === condition.calc)?.label ?? "امتیاز";
  const notCountOnly = ![
    "absence_count",
    "late_count",
    "homework_done",
    "homework_missed",
    "exam_count",
  ].includes(condition.calc);
  const itemsPart =
    condition.calc === "composite"
      ? ` ${(condition.composite_items ?? []).map(itemLabel).join(" + ") || "آیتم‌ها"}`
      : condition.calc === "negative_sum"
        ? ""
        : notCountOnly || condition.calc === "count_records" || condition.calc === "session_count"
          ? ` ${itemLabel(condition.item_key)}`
          : "";
  const subject = condition.calc === "streak" ? "تعداد جلسات متوالی ثبت " : calcLabel;
  const compositeLabel =
    condition.calc === "streak"
      ? `${subject}${itemLabel(condition.item_key)}`
      : `${subject}${itemsPart}`;
  const sentence = `${compositeLabel} ${ruleWindowFa(condition.window)} باید ${ruleOperatorFa(
    condition.operator,
    condition.value,
    condition.value2,
  )}`;
  return condition.polarity === "negative" ? `نباید چنین باشد که ${sentence}` : sentence;
}

/** خلاصه‌ی فارسی کامل قانون یک سطح (رابطه‌ی شرط‌ها + گروه‌های داخلی) */
export function buildRuleSummaryFa(
  config: AchievementRuleConfig | null | undefined,
  itemLabel: (key: string) => string,
): string {
  if (!config?.children?.length) return "";
  const joiner =
    config.logic === "any"
      ? " یا "
      : config.logic === "at_least"
        ? ` (حداقل ${config.logic_count ?? 2} مورد از) و `
        : " و ";
  const parts = config.children.map((child) => {
    if (child.type === "group") {
      const sub = (child.children ?? [])
        .filter((c): c is AchievementRuleCondition => c.type !== "group")
        .map((c) => buildConditionSummaryFa(c, itemLabel))
        .join(child.logic === "any" ? " یا " : " و ");
      const prefix =
        child.logic === "any"
          ? "(حداقل یکی از این‌ها: "
          : child.logic === "at_least"
            ? `(حداقل ${child.logic_count ?? 2} مورد از این‌ها: `
            : "(";
      return sub ? `${prefix}${sub})` : null;
    }
    return buildConditionSummaryFa(child, itemLabel);
  });
  const body = parts.filter(Boolean).join(joiner);
  return body ? `دانش‌آموز باید: ${body}.` : "";
}
export interface AchievementFullSaveInput {
  id?: string | null;
  title: string;
  short_title?: string | null;
  slug?: string | null;
  description?: string;
  category_id?: string | null;
  icon_key?: string;
  /** تصویر اصلی افتخار (URL آپلودشده در فضای ذخیره‌سازی) */
  artwork_url?: string | null;
  /** خودکار طرح نجم یا دستی */
  quest_kind?: "najm_item" | null;
  item_key?: string | null;
  metric?: NajmQuestMetric | null;
  decision_mode?: AchievementDecisionMode;
  repeat_policy?: "once" | "per_term" | "per_year" | "multiple";
  is_secret?: boolean;
  is_active?: boolean;
  sort_order?: number;
  congrats_message?: string | null;
  conditions_guide?: string | null;
  bonus_note?: string | null;
  certificate_enabled?: boolean;
  duration_kind?: "permanent" | "periodic";
  valid_from?: string | null;
  valid_until?: string | null;
  max_awards?: number | null;
  allowed_class_ids?: number[];
  show_in_profile?: boolean;
  show_in_leaderboard?: boolean;
  levels: AchievementLevelInput[];
}

/** ذخیره کامل افتخار (ایجاد/ویرایش) با همه‌ی فیلدها و سطوح سفارشی — برای هر دو نوع */
export async function saveAchievementFull(
  input: AchievementFullSaveInput,
): Promise<AchievementRpcResult<string>> {
  const { id, quest_kind, item_key, metric, levels, ...rest } = input;
  const definition = {
    ...rest,
    id: id ?? null,
    metadata:
      quest_kind === "najm_item"
        ? { quest_kind: "najm_item", item_key: item_key ?? "", metric: metric ?? "per_session_min" }
        : {},
  };
  const { data, error } = await supabase.rpc("admin_save_achievement_full", {
    p_definition: definition,
    p_levels: levels.map((level) => ({
      tier: level.tier || null,
      label: level.label,
      image_url: level.image_url ?? null,
      congrats_message: level.congrats_message ?? null,
      bonus_points: level.bonus_points ?? 0,
      conditions_text: level.conditions_text ?? null,
      is_active: level.is_active ?? true,
      sessions_count: level.sessions_count ?? 1,
      threshold: level.threshold ?? 0,
      rule_config: level.rule_config ?? {},
      breach_behavior: level.breach_behavior ?? "block",
      rule_priority: level.rule_priority ?? 100,
    })),
  });
  if (error) return { data: null, error: error.message };
  return { data: String(data), error: null };
}
