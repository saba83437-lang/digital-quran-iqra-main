// ============================================================================
// Smart Recitation — Attempt Scoring (فاز 21C)
// ----------------------------------------------------------------------------
// ضبط صدای قرآن‌آموز را همین‌جا در مرورگر تحلیل می‌کند و با تحلیل مرجع (analysis_json
// نسخه تأییدشده) مقایسه می‌کند تا امتیازهای زیر ساخته شوند:
//   pitch_accuracy, pitch_stability, transition_accuracy, timing,
//   ornament_accuracy, breath, energy
// خروجی دقیقاً همان ساختاری است که RPC سرور (student_finish_attempt) می‌پذیرد.
// توجه: امتیاز رسمی (وزن‌دهی، ستاره، سکه) همیشه در سرور محاسبه می‌شود.
// ============================================================================
import type { AttemptScores, RecitationScoringConfig } from "../domain/recitation-types";
import { DEFAULT_SCORING_CONFIG, clampScore } from "../domain/recitation-scoring";
import {
  analyzeAudioBuffer,
  decodeAudioBuffer,
  type AnalysisOutput,
} from "./analysis-pipeline";
import { hzToCents } from "./pitch-yin";

// ==================== تایپ‌های خروجی ====================

/** تحلیل مرجع (از ستون analysis_json نسخه) — ممکن است ناقص/خالی باشد */
export type ReferenceAnalysis = Partial<AnalysisOutput["analysis"]>;

export interface AttemptAnalysisSummary {
  durationMs: number;
  coveragePercent: number; // درصد قاب‌های دارای صدای قابل تشخیص
  avgConfidence: number; // اطمینان میانگین تشخیص (۰..۱)
  noteCount: number;
  breathCount: number;
  ornamentCount: number;
  comparedWithReference: boolean; // آیا تحلیل مرجع قابل استفاده بود؟
  referenceDurationMs: number | null;
}

export interface AttemptScoringResult {
  scores: AttemptScores;
  summary: AttemptAnalysisSummary;
}

// ==================== ثابت‌ها ====================

/** تعداد نقاط شبکه زمانی نرمال‌شده برای مقایسه دو اجرا */
const GRID = 200;
/** نرخ نمونه‌برداری هدف — کاهش سرعت تحلیل تا حدود ۲۰ برابر (جلوگیری از فریز صفحه) */
const TARGET_SAMPLE_RATE = 16000;
/** حداکثر شکاف قابل درونیابی روی شبکه (تعداد خانه) */
const MAX_GAP_FILL = 6;

// ==================== ابزارهای کمکی ====================

function medianOf(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** همبستگی پیرسون بین دو آرایه هم‌طول — خروجی بین -۱ تا ۱ */
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 4) return 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx <= 1e-9 || vy <= 1e-9) return 0;
  return cov / Math.sqrt(vx * vy);
}

/** نمره نرم با افت گاوسی — انحراف = tol نمره را نصف می‌کند */
function gaussianScore(diff: number, tol: number): number {
  const x = diff / Math.max(1e-6, tol);
  return Math.exp(-(x * x) * Math.LN2) * 100;
}

/** دانسمپل با OfflineAudioContext — خروجی مونو */
async function downsampleBuffer(buffer: AudioBuffer, targetRate = TARGET_SAMPLE_RATE): Promise<AudioBuffer> {
  if (buffer.sampleRate <= targetRate) return buffer;
  const ratio = buffer.sampleRate / targetRate;
  const newLength = Math.max(1, Math.ceil(buffer.length / ratio));
  const offline = new OfflineAudioContext(1, newLength, targetRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

// ==================== ساخت منحنی ملودی نسبی ====================

interface Contour {
  t: number[]; // میلی‌ثانیه (فقط قاب‌های دارای صدا)
  centsRel: number[]; // سنت نسبت به میانه خود اجرا (رفع اختلاف رجیستر صدا)
}

/** از تحلیل (مرجع یا تلاش) منحنی سنتِ نسبی می‌سازد — فقط قاب‌های voiced */
function contourOf(analysis: ReferenceAnalysis | null | undefined): Contour {
  const out: Contour = { t: [], centsRel: [] };
  const pitch = analysis?.pitch;
  if (!Array.isArray(pitch) || pitch.length < 5) return out;

  const cents: number[] = [];
  for (const p of pitch) {
    if (!p || typeof p !== "object") continue;
    const c =
      typeof (p as { cents?: unknown }).cents === "number"
        ? ((p as { cents: number }).cents as number)
        : typeof (p as { hz?: unknown }).hz === "number" && (p as { hz: number }).hz > 0
          ? hzToCents((p as { hz: number }).hz)
          : null;
    if (c === null) continue;
    cents.push(c);
    out.t.push(typeof (p as { t?: unknown }).t === "number" ? (p as { t: number }).t : cents.length * 20);
  }
  if (cents.length < 5) {
    out.t = [];
    return out;
  }
  const med = medianOf(cents);
  out.centsRel = cents.map((c) => c - med);
  return out;
}

/** نگاشت منحنی روی شبکه زمانی نرمال‌شده (۰..۱) + درونیابی شکاف‌های کوتاه */
function gridFromContour(c: Contour): Array<number | null> {
  const grid: Array<number | null> = new Array<number | null>(GRID).fill(null);
  if (c.t.length < 5) return grid;
  const t0 = c.t[0];
  const t1 = c.t[c.t.length - 1];
  const span = Math.max(1, t1 - t0);

  const sums = new Array<number>(GRID).fill(0);
  const counts = new Array<number>(GRID).fill(0);
  for (let i = 0; i < c.t.length; i++) {
    const rel = (c.t[i] - t0) / span;
    const cell = Math.min(GRID - 1, Math.max(0, Math.round(rel * (GRID - 1))));
    sums[cell] += c.centsRel[i];
    counts[cell] += 1;
  }
  for (let i = 0; i < GRID; i++) {
    if (counts[i] > 0) grid[i] = sums[i] / counts[i];
  }

  // درونیابی خطی فقط برای شکاف‌های کوتاه (تا سقف MAX_GAP_FILL خانه)
  let i = 0;
  while (i < GRID) {
    if (grid[i] !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < GRID && grid[j] === null) j++;
    const prev = i > 0 ? grid[i - 1] : null;
    const next = j < GRID ? grid[j] : null;
    const gap = j - i;
    if (prev !== null && next !== null && gap <= MAX_GAP_FILL) {
      for (let k = i; k < j; k++) {
        const f = (k - (i - 1)) / (gap + 1);
        grid[k] = prev + (next - prev) * f;
      }
    }
    i = j;
  }
  return grid;
}

/** پوشش شبکه انرژی (۰..۱ نرمال‌شده) روی N خانه */
function energyGrid(analysis: ReferenceAnalysis | null | undefined, cells = 100): Array<number | null> {
  const grid: Array<number | null> = new Array<number | null>(cells).fill(null);
  const energy = analysis?.energy;
  if (!Array.isArray(energy) || energy.length < 5) return grid;
  const pts: Array<{ t: number; v: number }> = [];
  for (const e of energy) {
    if (!e || typeof e !== "object") continue;
    const t = (e as { t?: unknown }).t;
    const db = (e as { db?: unknown }).db;
    if (typeof t !== "number" || typeof db !== "number") continue;
    const norm = Math.max(0, Math.min(1, (db + 60) / 60));
    pts.push({ t, v: norm });
  }
  if (pts.length < 5) return grid;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const span = Math.max(1, t1 - t0);
  for (const p of pts) {
    const cell = Math.min(cells - 1, Math.max(0, Math.round(((p.t - t0) / span) * (cells - 1))));
    grid[cell] = grid[cell] === null ? p.v : (grid[cell] + p.v) / 2;
  }
  return grid;
}

function countEvents(analysis: ReferenceAnalysis | null | undefined, type: string): number {
  const events = analysis?.events;
  if (!Array.isArray(events)) return 0;
  let n = 0;
  for (const e of events) {
    if (e && typeof e === "object" && (e as { type?: unknown }).type === type) n++;
  }
  return n;
}

/** شبکه انرژی/ملودی را به آرایه عددی فشرده (بدون null) تبدیل می‌کند */
function compactPair(a: Array<number | null>, b: Array<number | null>): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== null && b[i] !== null) {
      xs.push(a[i] as number);
      ys.push(b[i] as number);
    }
  }
  return { xs, ys };
}

// ==================== محاسبه اصلی ====================

/**
 * تحلیل ضبط قرآن‌آموز و ساخت امتیازها
 * @param blob صدای ضبط‌شده میکروفون (webm/opus یا mp4/aac)
 * @param reference تحلیل مرجع از analysis_json نسخه (ممکن است null/ناقص باشد)
 * @param config تنظیمات امتیازدهی نسخه (اختیاری — با پیش‌فرض ادغام می‌شود)
 */
export async function scoreAttemptRecording(
  blob: Blob,
  reference: ReferenceAnalysis | null | undefined,
  config: Partial<RecitationScoringConfig> = {},
): Promise<AttemptScoringResult> {
  const cfg: RecitationScoringConfig = {
    ...DEFAULT_SCORING_CONFIG,
    ...config,
    stars: { ...DEFAULT_SCORING_CONFIG.stars, ...(config.stars ?? {}) },
  };

  // ۱) رمزگشایی و دانسمپل (سرعت تحلیل بالا می‌رود)
  const arrayBuffer = await blob.arrayBuffer();
  if (arrayBuffer.byteLength < 1000) throw new Error("ضبط خیلی کوتاه است");
  let audioBuffer = await decodeAudioBuffer(arrayBuffer);
  audioBuffer = await downsampleBuffer(audioBuffer);

  // ۲) تحلیل تلاش با همان موتور تحلیل مرجع
  const attempt = analyzeAudioBuffer(audioBuffer).analysis;

  // ۳) آمار پایه تلاش
  const durationMs = attempt.durationMs || Math.round((audioBuffer.length / audioBuffer.sampleRate) * 1000);
  const voicedFrames = (attempt.pitch?.length ?? 0) + 0;
  const totalFramesEstimate = Math.max(1, Math.round(durationMs / Math.max(1, attempt.hopMs || 20)));
  // توجه: attempt.pitch فقط قاب‌های voiced را دارد (خروجی pipeline)
  const coveragePercent = Math.min(100, Math.round((voicedFrames / totalFramesEstimate) * 100));
  const avgConfidence =
    (attempt.pitch ?? []).length > 0
      ? Math.round(
          ((attempt.pitch ?? []).reduce((a, p) => a + (p.confidence || 0), 0) / (attempt.pitch ?? []).length) * 100,
        ) / 100
      : 0;
  const noteCount = attempt.notes?.length ?? 0;
  const breathCountAttempt = countEvents(attempt, "breath");
  const ornamentCountAttempt = countEvents(attempt, "ornament");

  // ۴) آیا تحلیل مرجع قابل استفاده است؟
  const refContour = contourOf(reference);
  const hasReference = refContour.t.length >= 5;
  const referenceDurationMs =
    typeof reference?.durationMs === "number" ? reference.durationMs : null;

  // ۵) پایداری صدای خود قرآن‌آموز (مستقل از مرجع)
  let pitchStability: number;
  if (noteCount > 0) {
    const stabSum = (attempt.notes ?? []).reduce((a, n) => a + (n.stability || 0), 0);
    pitchStability = clampScore((stabSum / noteCount) * 100);
  } else {
    pitchStability = clampScore(avgConfidence * 60);
  }

  // ۶) ضریب پوشش صدا — اگر بخش زیادی از ضبط سکوت باشد امتیازهای مقایسه‌ای کم می‌شوند
  const gate = Math.max(0.35, Math.min(1, coveragePercent / 70));

  // ۷) امتیازهای پایه بدون مرجع (حالت جایگزین وقتی تحلیل مرجع نداریم)
  let pitchAccuracy = clampScore((0.55 * coveragePercent + 0.45 * avgConfidence * 100));
  let transitionAccuracy = clampScore(60 + avgConfidence * 30);
  let timing = 80;
  let ornament = 75;
  let breath = 78;
  let energyScore = clampScore(55 + avgConfidence * 35);

  // ۸) مقایسه با مرجع (حالت اصلی)
  if (hasReference) {
    const attContour = contourOf(attempt);
    const attGrid = gridFromContour(attContour);
    const refGrid = gridFromContour(refContour);

    // ۸-الف) دقت ملودی: میانگین نمره نرمِ اختلاف سنت روی خانه‌های مشترک
    const tolCents = Math.max(120, (cfg.pitchToleranceCents ?? 80) * 2.2); // سخاوتمندانه برای کودکان
    let sum = 0;
    let matched = 0;
    for (let i = 0; i < GRID; i++) {
      const a = attGrid[i];
      const r = refGrid[i];
      if (a !== null && r !== null) {
        sum += gaussianScore(Math.abs(a - r), tolCents);
        matched++;
      }
    }
    if (matched >= 15) {
      // میانگین نمره نرم (۰..۱۰۰) × جریمه ملایم اگر هم‌پوشانی زمانی کم باشد
      const base = sum / matched;
      pitchAccuracy = clampScore(base * Math.min(1, matched / (GRID * 0.45)));
    }

    // ۸-ب) گذر نت‌ها: همبستگی جهت حرکت ملودی (مشتق منحنی)
    const attDiff: number[] = [];
    const refDiff: number[] = [];
    for (let i = 1; i < GRID; i++) {
      const a1 = attGrid[i];
      const a0 = attGrid[i - 1];
      const r1 = refGrid[i];
      const r0 = refGrid[i - 1];
      if (a1 !== null && a0 !== null && r1 !== null && r0 !== null) {
        attDiff.push(a1 - a0);
        refDiff.push(r1 - r0);
      }
    }
    if (attDiff.length >= 10) {
      const corr = pearson(attDiff, refDiff); // -1..1
      transitionAccuracy = clampScore(((corr + 1) / 2) * 100);
    }

    // ۸-ج) زمان‌بندی: نسبت طول اجرا + نسبت تعداد نت‌ها
    if (referenceDurationMs && referenceDurationMs > 0) {
      const ratio = durationMs / referenceDurationMs;
      let score = 100 - Math.abs(1 - ratio) * 150;
      const refNotes = reference?.notes?.length ?? 0;
      if (refNotes > 0 && noteCount > 0) {
        const noteRatio = noteCount / refNotes;
        const noteScore = 100 - Math.abs(1 - noteRatio) * 80;
        score = score * 0.65 + noteScore * 0.35;
      }
      timing = clampScore(score);
    }

    // ۸-د) تحریر: اختلاف تعداد رویدادهای ornament
    const refOrn = countEvents(reference, "ornament");
    if (refOrn > 0) {
      ornament = clampScore(100 - Math.abs(ornamentCountAttempt - refOrn) * 15);
    } else {
      ornament = ornamentCountAttempt <= 2 ? 88 : clampScore(100 - (ornamentCountAttempt - 2) * 12);
    }

    // ۸-ه) تنفس: اختلاف تعداد تنفس‌ها
    const refBreath = countEvents(reference, "breath");
    if (refBreath > 0) {
      breath = clampScore(100 - Math.abs(breathCountAttempt - refBreath) * 20);
    } else {
      breath = breathCountAttempt <= 1 ? 90 : clampScore(95 - (breathCountAttempt - 1) * 10);
    }

    // ۸-و) انرژی: همبستگی پوش انرژی دو اجرا
    const { xs, ys } = compactPair(energyGrid(attempt), energyGrid(reference));
    if (xs.length >= 10) {
      energyScore = clampScore(((pearson(xs, ys) + 1) / 2) * 100);
    }

    // ۸-ز) اعمال ضریب پوشش روی امتیازهای مقایسه‌ای
    pitchAccuracy = clampScore(pitchAccuracy * gate);
    timing = clampScore(timing * Math.max(0.6, gate));
    energyScore = clampScore(energyScore * Math.max(0.6, gate));
  } else {
    // حالت جایگزین هم باید پوشش صدا را لحاظ کند
    pitchAccuracy = clampScore(pitchAccuracy * Math.max(0.5, gate));
  }

  const scores: AttemptScores = {
    pitch_accuracy: Math.round(pitchAccuracy * 10) / 10,
    pitch_stability: Math.round(pitchStability * 10) / 10,
    transition_accuracy: Math.round(transitionAccuracy * 10) / 10,
    timing: Math.round(timing * 10) / 10,
    ornament_accuracy: Math.round(ornament * 10) / 10,
    breath: Math.round(breath * 10) / 10,
    energy: Math.round(energyScore * 10) / 10,
  };

  const summary: AttemptAnalysisSummary = {
    durationMs,
    coveragePercent,
    avgConfidence,
    noteCount,
    breathCount: breathCountAttempt,
    ornamentCount: ornamentCountAttempt,
    comparedWithReference: hasReference,
    referenceDurationMs,
  };

  return { scores, summary };
}
    