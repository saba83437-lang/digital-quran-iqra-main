// ============================================================================
// Smart Recitation — Admin API (فاز 21A)
// توابع استودیوی هوشمند فرازها — فقط مدیر
// ============================================================================
import { supabase } from "@/lib/supabase";
import type {
  RecitationAnalysisJob,
  RecitationDailyChallenge,
  RecitationPassage,
  RecitationPassageVersion,
  RecitationScoringConfig,
} from "../domain/recitation-types";
import type { AnalysisNote, AnalysisEvent } from "../dsp/analysis-pipeline";
import type { WordBand } from "../dsp/note-edit-utils";

/**
 * خطاهای PostgREST را به خواندنی تبدیل می‌کند.
 * (قبلاً آبجکت خام error پرتاب می‌شد و toast به‌جای پیام واقعی،
 * «[object Object]» نمایش می‌داد — نسخه‌ی ۳ ویرایشگر)
 */
function throwIf(error: { message?: string; hint?: string | null; details?: string | null; code?: string } | null): void {
  if (!error) return;
  const parts = [error.message ?? "خطای ناشناخته از سرور"];
  if (error.hint) parts.push(`راهنما: ${error.hint}`);
  if (error.details) parts.push(`جزئیات: ${error.details}`);
  if (error.code) parts.push(`[کد ${error.code}]`);
  // ۴۲۷۰۳ = ستون موردنیاز در جدول وجود ندارد → اسکریپت SQL آن فاز اجرا نشده
  // (مثلاً ستون manual_overrides برای ذخیره‌ی ویرایش‌های نت‌نگار — فاز ۳i)
  if (error.code === "42703") {
    parts.push("🔧 یک ستونِ لازم در دیتابیس ساخته نشده است؛ اسکریپت SQL فاز جدید را یک‌بار در SQL Editor سایت Supabase اجرا کنید");
  }
  throw new Error(parts.join(" — "));
}

/** آدرس امضاشده (Signed URL) برای پخش فایل صوتی خصوصی */
export async function getAudioSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("recitation-audio")
    .createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

/** لیست فرازها با فیلتر وضعیت و جستجو */
export async function listPassages(params?: { status?: string; search?: string }) {
  let query = supabase
    .from("recitation_passages")
    .select("*")
    .order("created_at", { ascending: false });

  if (params?.status) query = query.eq("status", params.status);
  if (params?.search) {
    query = query.or(
      `title.ilike.%${params.search}%,reciter.ilike.%${params.search}%,surah.ilike.%${params.search}%`,
    );
  }

  const { data, error } = await query;
  throwIf(error);
  return (data ?? []) as RecitationPassage[];
}

/** دریافت یک فراز */
export async function getPassage(passageId: string) {
  const { data, error } = await supabase
    .from("recitation_passages")
    .select("*")
    .eq("id", passageId)
    .single();
  throwIf(error);
  return data as RecitationPassage;
}

/** دریافت نسخه‌های یک فراز */
export async function listPassageVersions(passageId: string) {
  const { data, error } = await supabase
    .from("recitation_passage_versions")
    .select("*")
    .eq("passage_id", passageId)
    .order("version_no", { ascending: false });
  throwIf(error);
  return (data ?? []) as RecitationPassageVersion[];
}

/** دریافت جاب‌های تحلیل یک فراز */
export async function listAnalysisJobs(passageId: string) {
  const { data, error } = await supabase
    .from("recitation_analysis_jobs")
    .select("*")
    .eq("passage_id", passageId)
    .order("created_at", { ascending: false });
  throwIf(error);
  return (data ?? []) as RecitationAnalysisJob[];
}

/** ایجاد فراز جدید (RPC امن) */
export async function createPassage(payload: {
  title: string;
  reciter: string;
  surah?: string;
  ayah_start?: number;
  ayah_end?: number;
  maqam_primary?: string;
  maqam_secondary?: string;
  difficulty?: number;
  educational_level?: string;
  description?: string;
  tags?: string[];
}) {
  const { data, error } = await supabase.rpc("admin_create_passage", {
    p_payload: payload,
  });
  throwIf(error);
  return data as string;
}

/** آپلود فایل صوتی در باکت خصوصی + افزودن نسخه + ایجاد جاب تحلیل */
export async function uploadAudioAndCreateVersion(passageId: string, file: File) {
  const ext = file.name.split(".").pop() || "mp3";
  const path = `passages/${passageId}/versions/${Date.now()}/reference.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("recitation-audio")
    .upload(path, file, { upsert: false, contentType: file.type });

  throwIf(uploadError ? { message: uploadError.message } : null);

  const { data, error } = await supabase.rpc("admin_add_version", {
    p_passage_id: passageId,
    p_audio_path: path,
    p_change_note: file.name,
  });
  throwIf(error);
  return data as string;
}

/** تأیید نسخه و انتشار (با گزینه bypass برای تست) */
export async function approveVersion(
  versionId: string,
  opts?: { force?: boolean; scoringConfig?: RecitationScoringConfig },
) {
  const { error } = await supabase.rpc("admin_approve_version", {
    p_version_id: versionId,
    p_force: opts?.force ?? false,
    p_scoring_config: opts?.scoringConfig ?? null,
  });
  throwIf(error);
}

/** به‌روزرسانی تنظیمات امتیازدهی */
export async function updateScoringConfig(versionId: string, config: RecitationScoringConfig) {
  const { error } = await supabase.rpc("admin_update_scoring_config", {
    p_version_id: versionId,
    p_config: config,
  });
  throwIf(error);
}

/** انتشار فراز با آخرین نسخه تأییدشده */
export async function publishPassage(passageId: string) {
  const { error } = await supabase.rpc("admin_publish_passage", { p_passage_id: passageId });
  throwIf(error);
}

/** آرشیو فراز */
export async function archivePassage(passageId: string) {
  const { error } = await supabase.rpc("admin_archive_passage", { p_passage_id: passageId });
  throwIf(error);
}

/** تنظیم چالش روزانه */
export async function setDailyChallenge(date: string, passageId: string, versionId: string) {
  const { error } = await supabase.rpc("admin_set_daily_challenge", {
    p_date: date,
    p_passage_id: passageId,
    p_version_id: versionId,
  });
  throwIf(error);
}

/** دریافت چالش امروز (برای نمایش در پنل مدیر) */
export async function getTodayChallenge() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("recitation_daily_challenges")
    .select("*")
    .eq("challenge_date", today)
    .maybeSingle();
  throwIf(error);
  return data as RecitationDailyChallenge | null;
}

/**
 * تحلیل خودکار صوت در مرورگر (فاز 21B)
 * فایل صوتی نسخه را از Storage می‌گیرد، با Web Audio API تحلیل می‌کند
 * و نتیجه (analysis_json + tunnel_json + quality_report) را در دیتابیس ثبت می‌کند.
 */
export async function runBrowserAnalysis(versionId: string, audioPath: string) {
  // ۱) لینک امضاشده فایل
  const url = await getAudioSignedUrl(audioPath, 300);
  if (!url) throw new Error("دریافت لینک فایل صوتی ناموفق بود");

  // ۲) دانلود و decode
  const res = await fetch(url);
  if (!res.ok) throw new Error("دانلود فایل صوتی ناموفق بود");
  const arrayBuffer = await res.arrayBuffer();

  const { decodeAudioBuffer, analyzeAudioBuffer } = await import(
    "@/features/recitation/dsp/analysis-pipeline"
  );
  const audioBuffer = await decodeAudioBuffer(arrayBuffer);
  const output = analyzeAudioBuffer(audioBuffer);

  // ۳) ثبت نتیجه در دیتابیس
  const { error } = await supabase.rpc("admin_update_analysis_result", {
    p_version_id: versionId,
    p_analysis: output.analysis,
    p_tunnel: output.tunnel,
    p_quality: output.quality,
  });
  throwIf(error);

  return output.quality;
}

// ============================================================================
// استودیوی نت‌نگار (فاز ۳F) — ذخیره‌ی ویرایش دستی نت‌های مدیر
// ----------------------------------------------------------------------------
// برخلاف runBrowserAnalysis، این تابع:
//  • وضعیت تأیید/انتشار نسخه را تغییر نمی‌دهد (approved_at دست نمی‌خورد)
//  • فقط نت‌ها، رویدادها و تونلِ بازسازی‌شده را به‌روز می‌کند
//  • سابقه‌ی ویرایش + اسنپ‌شات نت‌های خودکار (فقط اولین بار) را در
//    manual_overrides نگه می‌دارد تا «تحلیل مجدد» یا برگشت امن بماند.
// ============================================================================
export async function saveNoteEdits(params: {
  versionId: string;
  /** نت‌های نهایی اصلاح‌شده‌ی مدیر */
  notes: AnalysisNote[];
  /** رویدادهای نهایی (تنفس/تحریر/اوج/سکوت) */
  events: AnalysisEvent[];
  /** tunnel_json بازسازی‌شده از روی نت‌های اصلاح‌شده (خروجی rebuildTunnelFromNotes) */
  tunnel: Record<string, unknown>;
  /** اسنپ‌شات نت‌های خودکار قبل از اولین ویرایش — فقط یک‌بار، در اولین ذخیره ارسال شود */
  originalSnapshot?: { notes: AnalysisNote[]; events: AnalysisEvent[] } | null;
  /** متن فراز برای نوارهای زرد کلمات — فقط در صورت تغییر ارسال شود (رشته‌ی خالی = پاک‌کردن) */
  quranText?: string | null;
  /**
   * مرزهای دقیق کلمات آیه (نوارهای زرد) — فاز ۳G.
   * آرایه‌ی خالی = حذف نوارهای ذخیره‌شده | آرایه‌ی پر = ذخیره | undefined = دست نزن
   * (بازی قرآن‌آموز از همین‌ها برای هایلایت کلمه‌ی جاری استفاده می‌کند)
   */
  wordBands?: WordBand[];
  /** خلاصه‌ی کوتاه ویرایش برای سابقه */
  editSummary?: string;
}) {
  const args: Record<string, unknown> = {
    p_version_id: params.versionId,
    p_notes: params.notes,
    p_events: params.events,
    p_tunnel: params.tunnel,
  };
  // پارامترهای اختیاری را فقط وقتی مقدار دارند می‌فرستیم (ارسال null در
  // supabase-js می‌تواند به‌صورت رشته‌ی "null" برود و خطای 400 بدهد)
  if (params.originalSnapshot) args.p_original_snapshot = params.originalSnapshot;
  if (params.quranText !== undefined && params.quranText !== null) args.p_quran_text = params.quranText;
  if (params.wordBands !== undefined) args.p_word_bands = params.wordBands;
  if (params.editSummary) args.p_edit_summary = params.editSummary;

  const { error } = await supabase.rpc("admin_save_note_edits", args);
  throwIf(error);
}
