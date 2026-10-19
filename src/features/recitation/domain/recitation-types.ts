// ============================================================================
// Smart Recitation — Domain Types (فاز 21A)
// تایپ‌های دامنه ماژول استودیوی هوشمند فرازها و چالش تقلید هوشمند
// دقیقاً مطابق جداول دیتابیس فاز 21A
// ============================================================================

export type RecitationPassageStatus = "draft" | "analyzing" | "review" | "published" | "archived";
export type RecitationAnalysisStatus = "pending" | "processing" | "completed" | "failed" | "approved";
export type RecitationAssignmentType = "practice" | "homework" | "daily_challenge";
export type LedgerEntryType = "xp" | "coin";

/** فراز — واحد محتوای آموزشی (یک بخش از تلاوت یک قاری) */
export interface RecitationPassage {
  id: string;
  title: string;
  reciter: string;
  surah: string | null;
  ayah_start: number | null;
  ayah_end: number | null;
  maqam_primary: string | null;
  maqam_secondary: string | null;
  difficulty: number; // 1 تا 10
  educational_level: string | null;
  description: string;
  tags: string[];
  cover_path: string | null;
  status: RecitationPassageStatus;
  current_version_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

/** نسخه فراز — هر تحلیل/ویرایش یک نسخه جدید است */
export interface RecitationPassageVersion {
  id: string;
  passage_id: string;
  version_no: number;
  audio_path: string;
  duration_ms: number | null;
  sample_rate: number | null;
  analysis_status: RecitationAnalysisStatus;
  analysis_json: Record<string, unknown>;
  tunnel_json: Record<string, unknown>;
  scoring_config: RecitationScoringConfig | Record<string, unknown>;
  manual_overrides: Record<string, unknown>;
  quality_report: Record<string, unknown>;
  change_note: string | null;
  created_by_user_id: string;
  approved_by_user_id: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
}

/** جاب تحلیل صوت (برای Worker فاز 21B) */
export interface RecitationAnalysisJob {
  id: string;
  passage_id: string;
  version_id: string;
  status: RecitationAnalysisStatus;
  error_message: string | null;
  worker_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

/** تخصیص فراز توسط استاد به کلاس */
export interface RecitationAssignment {
  id: string;
  passage_id: string;
  version_id: string;
  teacher_id: number | null;
  class_id: number;
  title: string;
  assignment_type: RecitationAssignmentType;
  starts_at: string | null;
  due_at: string | null;
  is_active: boolean;
  created_by_user_id: string;
  created_at: string;
}

/** تلاش تمرین یک قرآن‌آموز */
export interface RecitationAttempt {
  id: string;
  passage_id: string;
  version_id: string;
  assignment_id: string | null;
  student_id: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  total_score: number | null;
  pitch_score: number | null;
  stability_score: number | null;
  transition_score: number | null;
  ornament_score: number | null;
  timing_score: number | null;
  breath_score: number | null;
  energy_score: number | null;
  stars: number; // 0 تا 3
  xp_awarded: number;
  coins_awarded: number;
  attempt_analysis: Record<string, unknown>;
  error_segments: unknown[];
  device_info: Record<string, unknown>;
  raw_recording_path: string | null;
  created_at: string;
}

/** بخش خطای یک تلاش (ثانیه‌به‌ثانیه) */
export interface RecitationAttemptSegment {
  id: string;
  attempt_id: string;
  start_ms: number;
  end_ms: number;
  segment_type: string;
  severity: string;
  message: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  created_at: string;
}

/** چالش روزانه */
export interface RecitationDailyChallenge {
  id: string;
  challenge_date: string;
  passage_id: string;
  version_id: string;
  created_by_user_id: string;
  created_at: string;
}

/** فصل رقابتی */
export interface RecitationSeason {
  id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_by_user_id: string;
  created_at: string;
}

/** لیگ */
export interface RecitationLeague {
  id: string;
  season_id: string;
  title: string;
  min_points: number;
  max_points: number | null;
  is_active: boolean;
  created_at: string;
}

/** ردیف دفتر سکه/XP */
export interface GamificationLedgerEntry {
  id: string;
  student_id: number;
  entry_type: LedgerEntryType;
  amount: number;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
}

/** تنظیمات امتیازدهی هر نسخه (همان scoring_config) */
export interface RecitationScoringConfig {
  pitchWeight: number;
  stabilityWeight: number;
  transitionWeight: number;
  timingWeight: number;
  ornamentWeight: number;
  breathWeight: number;
  energyWeight: number;
  pitchToleranceCents: number;
  timingToleranceMs: number;
  passScore: number;
  stars: { one: number; two: number; three: number };
  xp: number;
  coins: number;
}

/** امتیازهای ارسالی از سمت کلاینت هنگام پایان تمرین */
export interface AttemptScores {
  pitch_accuracy?: number;
  pitch_stability?: number;
  transition_accuracy?: number;
  timing?: number;
  ornament_accuracy?: number;
  breath?: number;
  energy?: number;
}

/** نتیجه بازگشتی از student_finish_attempt */
export interface AttemptResult {
  attempt_id: string;
  total_score: number | null;
  stars: number;
  xp_earned: number;
  coins_earned: number;
  has_scores: boolean;
}

/** خلاصه پیشرفت یک فرزند (برای والدین) */
export interface ParentChildSummary {
  student_id: number;
  student_name: string;
  attempts: number;
  avg_score: number;
  total_xp: number;
  total_coins: number;
  practice_minutes: number;
  last_attempt_at: string | null;
}

/** ردیف نتیجه کلاس (برای استاد) */
export interface TeacherClassAttemptRow {
  attempt_id: string;
  student_id: number;
  student_name: string;
  passage_id: string;
  passage_title: string;
  total_score: number | null;
  stars: number;
  xp_awarded: number;
  coins_awarded: number;
  duration_ms: number | null;
  completed_at: string | null;
}

/** موجودی سکه/XP یک قرآن‌آموز */
export interface StudentGamification {
  student_id: number;
  total_xp: number;
  total_coins: number;
  attempts: number;
  avg_score: number;
}

/** برچسب‌های فارسی برای نمایش */
export const PASSAGE_STATUS_LABELS: Record<RecitationPassageStatus, string> = {
  draft: "پیش‌نویس",
  analyzing: "در حال تحلیل",
  review: "در انتظار بازبینی",
  published: "منتشر شده",
  archived: "آرشیو",
};

export const ANALYSIS_STATUS_LABELS: Record<RecitationAnalysisStatus, string> = {
  pending: "در صف",
  processing: "در حال پردازش",
  completed: "تحلیل کامل شد",
  failed: "خطا",
  approved: "تأیید شده",
};

export const ASSIGNMENT_TYPE_LABELS: Record<RecitationAssignmentType, string> = {
  practice: "تمرین",
  homework: "تکلیف",
  daily_challenge: "چالش روزانه",
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "مبتدی ۱",
  2: "مبتدی ۲",
  3: "مقدماتی",
  4: "مقدماتی+",
  5: "متوسط",
  6: "متوسط+",
  7: "پیشرفته",
  8: "پیشرفته+",
  9: "حرفه‌ای",
  10: "استادانه",
};
