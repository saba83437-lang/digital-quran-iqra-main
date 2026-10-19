// ============================================================================
// Smart Recitation — Analysis Pipeline v3 (موتور دقیق‌تر تشخیص نت+تزئین)
// ----------------------------------------------------------------------------
// بهبودهای این نسخه نسبت به v2 (برگرفته از بهترین روش‌های تحلیل تلاوت):
//   ۱) قدم تحلیل ۱۰ms (به‌جای ۲۰ms) — مرزهای شروع/پایان نت دقیق‌تر
//   ۲) «برش سر و ته نت»: ۱۵٪ ابتدا و انتهای هر نت در محاسبه‌ی فرکانس نادیده
//      گرفته می‌شود (آن قسمت‌ها سُر خوردن/حمله‌اند) + میانه‌ی وزن‌دار بر اساس اطمینان
//   ۳) تشخیص و حذف «ویبراتو» (رعشه‌ی ۴ تا ۹ هرتز) از روی خودِ کانتور با FFT —
//      مرکز واقعی نت به‌دست می‌آید؛ نتِ رعشه‌دار دیگر تکه‌تکه یا «تحریرِ قلابی» نمی‌شود
//   ۴) تشخیص «ناحیه‌ی گذر/گلیساندو» (حرکت یک‌طرفه‌ی ≥۵۵ سنت در ≥۳۰ms) —
//      فریم‌های گذر وارد محاسبه‌ی هیچ نتی نمی‌شوند (فرکانس‌ها تمیز، مرزها دقیق)
//   ۵) ماسک حروف بی‌صدا (س، ش، ه، قلقله): ترکیب «تخت‌بودن طیف» + نرخ عبور از صفر
//   ۶) پر کردن شکاف‌های کوتاه‌تر از ۵۰ms — نت به‌خاطر چند فریم افتاده دو تکه نمی‌شود
//   ۷) پایداری نت بر مبنای «سنت» (واحد موسیقایی) به‌جای واریانس هرتز
//
// ⚠️ سازگاری (مهم): نام و امضای تمام تایپ‌ها و توابع صادراتی
// (decodeAudioBuffer / analyzeAudioBuffer و AnalysisOutput) دقیقاً مثل v2 است؛
// هیچ مصرف‌کننده‌ای (ویرایشگر، نمره‌دهی، روت‌ها) نیاز به تغییر ندارد.
// داده‌ی ذخیره‌شده در دیتابیس ساختارش همان است (analysis_json / tunnel_json).
// ============================================================================
import {
  yinPitch,
  applyHannWindow,
  hzToCents,
  YIN_MIN_FREQ,
  YIN_MAX_FREQ,
} from "./pitch-yin";

// ==================== تایپ‌های خروجی (بدون تغییر) ====================

export interface AnalysisPitchPoint {
  t: number; // میلی‌ثانیه
  hz: number;
  cents: number;
  confidence: number;
}

export interface AnalysisEnergyPoint {
  t: number; // میلی‌ثانیه
  db: number;
}

export interface AnalysisNote {
  startMs: number;
  endMs: number;
  medianHz: number;
  stability: number; // 0..1
}

export interface AnalysisEvent {
  type: "breath" | "ornament" | "silence" | "peak";
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface TunnelPoint {
  t: number; // میلی‌ثانیه
  x: number;
  y: number; // -1..1 (ارتفاع ملودی)
  z: number; // پیشروی در عمق
  radius: number; // شعاع تونل (وابسته به انرژی)
  energy: number; // 0..1
}

export interface TunnelMarker {
  type: string;
  t: number; // میلی‌ثانیه
}

export interface AnalysisOutput {
  analysis: {
    sampleRate: number;
    hopMs: number;
    durationMs: number;
    pitch: AnalysisPitchPoint[];
    energy: AnalysisEnergyPoint[];
    notes: AnalysisNote[];
    events: AnalysisEvent[];
  };
  tunnel: {
    version: 1;
    points: TunnelPoint[];
    markers: TunnelMarker[];
  };
  quality: {
    coveragePercent: number;
    avgConfidence: number;
    noteCount: number;
    breathCount: number;
    ornamentCount: number;
    message: string;
  };
}

// ==================== پارامترهای تحلیل ====================

const HOP_MS = 10; // قدم تحلیل (بهبود ۱: ۱۰ms — ۱۰۰ نقطه در ثانیه)
const FRAME_MS = 60; // طول پنجره‌ی تحلیل
const MAX_SAMPLE_RATE = 16000; // سقف نرخ نمونه‌برداری (کافی برای صدای انسان)
const CONF_GATE = 0.55; // آستانه‌ی اطمینان YIN
const BREATH_MIN_MS = 200; // کمترین طول تنفس
const BREATH_MAX_MS = 2000; // بیشترین طول تنفس
const CENTS_REF_HZ = 55; // مرجع داخلی تبدیل سنت (فقط نسبی استفاده می‌شود)

// --- ماسک حروف بی‌صدا (بهبود ۵) ---
const FLAT_GATE = 0.3; // تخت‌بودن طیف (۰=تناوبی، ۱=نویز سفید)
const ZCR_GATE = 0.12; // نرخ عبور از صفر در هر نمونه
const CONF_SOFT_GATE = 0.78; // فقط اگر اطمینان YIN متوسط بود، ماسک اعمال شود

// --- ویبراتو (بهبود ۳) ---
const VIB_WIN_MS = 640; // پنجره‌ی تحلیل ویبراتو
const VIB_MIN_HZ = 4; // کمترین نرخ رعشه
const VIB_MAX_HZ = 9; // بیشترین نرخ رعشه
const VIB_MIN_EXTENT_CENTS = 18; // دامنه‌ی نوسان کمتر از این = ویبراتو نیست
const VIB_PROMINENCE = 2.5; // برجستگی قله نسبت به همسایه‌ها
const VIB_GAP_BRIDGE_HOPS = 5; // پر کردن شکاف تا این‌قدر فریم داخل پنجره

// --- ناحیه‌ی گذر / گلیساندو (بهبود ۴) ---
const TRANS_MIN_MOVE_CENTS = 55; // جابه‌جایی خالص یک‌طرفه حداقل این‌قدر
const TRANS_MIN_FRAMES = 3; // حداقل ۳ فریم (۳۰ms) همراستا
const TRANS_DEADBAND_CENTS = 1.5; // باند مرده برای جهت فریم‌به‌فریم

// --- بخش‌بندی نت (هیسترزیس + تأیید مداومت چندفریمی) ---
const NOTE_GATE_CENTS = 85; // انحراف از مرجع نتِ جاری → کاندید نت جدید
const CONFIRM_SCAN = 5; // در ۵ فریم بعدی دنبال تأیید می‌گردیم
const CONFIRM_NEED = 3; // حداقل ۳ فریم بیرون از باند تأیید می‌کند
const CONFIRM_RATIO = 0.7; // آستانه‌ی بیرون‌بودن برای تأیید (نسبت به گیت)
const GAP_BRIDGE_MS = 50; // شکاف کوتاه‌تر از این درون نت پُر می‌شود (بهبود ۶)
const NOTE_MIN_MS = 60; // کمترین طول نت
const RECENT_MS = 140; // پنجره‌ی مرجعِ متحرک بخش‌بندی
const MERGE_CENTS = 55; // دو نت مجاور نزدیک‌تر از این (به‌سنت) → همان نت
const MERGE_GAP_MS = 70; // …به‌شرطی که شکافشان از این کمتر باشد
const TINY_MS = 80; // ریزنت کوتاه‌تر از این…
const TINY_CENTS = 35; // …و هم‌مرتبه با همسایه‌ها → حذف

// --- ساخت نت (بهبود ۲ و ۷) ---
const TRIM_RATIO = 0.15; // ۱۵٪ ابتدا و انتهای هر نت از محاسبه حذف می‌شود
const STABILITY_FULL_CENTS = 120; // انحراف معیار این‌قدر سنت → پایداری صفر

// --- تحریر ملسمایی ---
const MELISMA_MAX_NOTE_MS = 260; // هر نت زنجیره حداکثر این‌قدر
const MELISMA_MIN_RUN = 3; // حداقل ۳ نت متوالی
const MELISMA_MIN_STEP_CENTS = 55; // پله‌ی بین نت‌های زنجیره حداقل این‌قدر
const MELISMA_MAX_GAP_MS = 120; // فاصله‌ی بین نت‌های زنجیره

// ==================== decode فایل صوتی (بدون تغییر) ====================

/** تبدیل فایل صوتی (ArrayBuffer) به AudioBuffer با Web Audio API */
export async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
}

// ==================== ابزارهای کمکی ====================

function rmsDb(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / frame.length);
  return 20 * Math.log10(rms + 1e-10);
}

/** نرخ عبور از صفر (Zero-Crossing Rate) — برای تشخیص حروف بی‌صدا */
function zeroCrossingRate(frame: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) crossings++;
  }
  return crossings / frame.length;
}

/** میانه (برای مقادیر عددی) */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** میانگین متحرک ساده برای انرژی — مقادیر null (بی‌صدا) نادیده گرفته می‌شوند */
function smooth(values: Array<number | null>, window: number): number[] {
  const out: number[] = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j];
      if (v !== null && v === v) {
        sum += v;
        count++;
      }
    }
    out.push(count > 0 ? sum / count : 0);
  }
  return out;
}

/**
 * پالایش میانه روی فرکانس (فقط نقاط واجد صدا) — لبه‌های تغییر نت حفظ می‌شوند
 * و پرش‌های تکیِ نویزی (رایج در YIN) حذف می‌شوند.
 * اگر کمتر از minCount نمونه‌ی غیر-null در پنجره بود → null (فاصله‌ی واقعی سکوت).
 */
function medianFilter(values: Array<number | null>, window: number, minCount = 3): Array<number | null> {
  const out: Array<number | null> = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    const vals: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j];
      if (v !== null && v > 0) vals.push(v);
    }
    out.push(vals.length >= minCount ? median(vals) : null);
  }
  return out;
}

/** فاصله‌ی دو فرکانس به سنت */
function relCents(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

function centsOf(hz: number): number {
  return 1200 * Math.log2(hz / CENTS_REF_HZ);
}

function hzFromCents(c: number): number {
  return CENTS_REF_HZ * Math.pow(2, c / 1200);
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ---------- FFT پایه (خط پایه‌ی radix-2) برای طیف و ویبراتو ----------

function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j];
        const ui = im[i + j];
        const vr = re[i + j + len / 2] * cwr - im[i + j + len / 2] * cwi;
        const vi = re[i + j + len / 2] * cwi + im[i + j + len / 2] * cwr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const t = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = t;
      }
    }
  }
}

/** اندازه‌ی طیف سیگنال حقیقی — خروجی: nfft/2 مقدار */
function magnitudeSpectrum(signal: ArrayLike<number>, nfft: number): Float64Array {
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const len = Math.min(signal.length, nfft);
  for (let i = 0; i < len; i++) re[i] = signal[i];
  fftRadix2(re, im);
  const mag = new Float64Array(nfft / 2);
  for (let k = 0; k < nfft / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}

/** تخت‌بودن طیف (Spectral Flatness) در باند صدای انسان — نزدیک ۱ یعنی نویز */
function spectralFlatness(windowedFrame: ArrayLike<number>, nfft: number, sampleRate: number): number {
  const mag = magnitudeSpectrum(windowedFrame, nfft);
  const kLo = Math.max(2, Math.floor((80 * nfft) / sampleRate));
  const kHi = Math.min(nfft / 2 - 1, Math.floor((Math.min(4000, sampleRate / 2) * nfft) / sampleRate));
  if (kHi <= kLo) return 0;
  let logSum = 0;
  let linSum = 0;
  let cnt = 0;
  for (let k = kLo; k <= kHi; k++) {
    const m = mag[k] + 1e-12;
    logSum += Math.log(m);
    linSum += m;
    cnt++;
  }
  if (cnt === 0 || linSum <= 0) return 0;
  const geo = Math.exp(logSum / cnt);
  const arith = linSum / cnt;
  return clampNum(geo / (arith + 1e-12), 0, 1);
}

/**
 * حذف ویبراتو از روی کانتور سنت (بهبود ۳ — قلب دقت جدید):
 * در هر پنجره، قله‌ی غالب ۴ تا ۹ هرتز روی باقی‌مانده‌ی سنت پیدا می‌شود؛
 * اگر دامنه و برجستگی کافی داشت، همان مؤلفه‌ی سینوسی از کانتور کم می‌شود تا
 * «مرکز واقعی» نت باقی بماند. پنجره‌ها با وزن هنینگ روی هم می‌افتند.
 */
function removeVibrato(cents: Array<number | null>): Array<number | null> {
  const n = cents.length;
  const out: Array<number | null> = [...cents];
  const fps = 1000 / HOP_MS; // ۱۰۰ فریم بر ثانیه
  const win = Math.max(24, Math.round((VIB_WIN_MS / 1000) * fps));
  const step = Math.max(8, win >> 1);
  const nfft = 128;
  const kLo = Math.max(2, Math.floor((VIB_MIN_HZ * nfft) / fps));
  const kHi = Math.min(nfft / 2 - 1, Math.ceil((VIB_MAX_HZ * nfft) / fps));
  const vibAcc = new Float64Array(n);
  const wAcc = new Float64Array(n);

  for (let s = 0; s + 24 <= n; s += step) {
    const e = Math.min(s + win, n);
    const wlen = e - s;
    // کپی محلی + پر کردن شکاف‌های خیلی کوتاه (درون‌یابی خطی)
    const loc: Array<number | null> = cents.slice(s, e);
    let i = 0;
    while (i < wlen) {
      if (loc[i] === null) {
        let j = i;
        while (j < wlen && loc[j] === null) j++;
        const runLen = j - i;
        const a = i > 0 ? loc[i - 1] : null;
        const b = j < wlen ? loc[j] : null;
        if (a !== null && b !== null && runLen <= VIB_GAP_BRIDGE_HOPS) {
          for (let k = i; k < j; k++) {
            loc[k] = a + (b - a) * ((k - i + 1) / (runLen + 1));
          }
        }
        i = j;
      } else {
        i++;
      }
    }
    const gIdx: number[] = [];
    const vals: number[] = [];
    for (let k = 0; k < wlen; k++) {
      if (loc[k] !== null) {
        gIdx.push(s + k);
        vals.push(loc[k] as number);
      }
    }
    if (vals.length < 24) continue;

    const m = median(vals);
    const resid = vals.map((v) => v - m);
    const mag = magnitudeSpectrum(resid, nfft);

    // قله‌ی غالب در باند ویبراتو
    let pk = -1;
    let pm = 0;
    for (let k = kLo; k <= kHi; k++) {
      if (mag[k] > pm) {
        pm = mag[k];
        pk = k;
      }
    }
    if (pk < 0) continue;
    let neigh = 0;
    let neighCnt = 0;
    for (let k = 2; k <= Math.min(16, nfft / 2 - 1); k++) {
      neigh += mag[k];
      neighCnt++;
    }
    const prominence = pm / (neigh / Math.max(1, neighCnt) + 1e-9);
    const ampCents = (2 * pm) / vals.length;
    if (ampCents < VIB_MIN_EXTENT_CENTS || prominence < VIB_PROMINENCE) continue;

    // برازش سینوسی با همان فرکانس و کم کردن آن (دمودولاسیون)
    const omega = (2 * Math.PI * pk) / nfft; // رادیان بر نمونه
    let alpha = 0;
    let beta = 0;
    for (let p = 0; p < resid.length; p++) {
      alpha += resid[p] * Math.sin(omega * p);
      beta += resid[p] * Math.cos(omega * p);
    }
    const s2 = 2 / resid.length;
    const wlen2 = resid.length;
    for (let p = 0; p < wlen2; p++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * p) / Math.max(1, wlen2 - 1))); // هنینگ
      const fit = s2 * (alpha * Math.sin(omega * p) + beta * Math.cos(omega * p));
      vibAcc[gIdx[p]] += w * fit;
      wAcc[gIdx[p]] += w;
    }
  }

  for (let i = 0; i < n; i++) {
    if (cents[i] !== null && wAcc[i] > 1e-6) {
      out[i] = (cents[i] as number) - vibAcc[i] / wAcc[i];
    }
  }
  return out;
}

/**
 * تشخیص «ناحیه‌ی گذر» (بهبود ۴): یک حرکت یک‌طرفه‌ی پایدار (≥۳ فریم همراستا و
 * جابه‌جایی ≥۵۵ سنت) فقط وقتی «گذر» است که واقعاً از یک نت به نتِ دیگر برسد:
 *   - قبلش «لنگر پایداری» (نت قبلی) وجود داشته باشد، و
 *   - سطح صدای «بعد از» حرکت، حداقل ۸۰ سنت با لنگر فرق کند.
 * حرکت‌هایی که به همان محدوده برمی‌گردند (تلاطم شروع/پایان نت، باقی‌مانده‌ی
 * ویبراتو) گذر نیستند و حذف نمی‌شوند — این همان چیزی است که مرز شروع نت را حفظ می‌کند.
 */
const TRANS_ANCHOR_BACK = 12; // فریم‌هایی که برای لنگر به عقب نگاه می‌کنیم
const TRANS_AFTER_AHEAD = 15; // فریم‌هایی که برای سطح مقصد به جلو نگاه می‌کنیم
const TRANS_ARRIVAL_CENTS = 80; // حداقل اختلاف سطح «قبل» و «بعد» تا حرکت، گذر باشد

function detectTransitions(cents: Array<number | null>): boolean[] {
  const n = cents.length;
  const trans = new Array<boolean>(n).fill(false);
  // کانتور صاف‌شده (میانگین ±۲ فریم، فقط نقاط واجد صدا)
  const sm: Array<number | null> = new Array<number | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (cents[i] === null) continue;
    let sum = 0;
    let c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      const v = cents[j];
      if (v !== null) {
        sum += v;
        c++;
      }
    }
    if (c > 0) sm[i] = sum / c;
  }

  // --- ۱) استخراج «رَن»های یک‌طرفه (دلتاهای هم‌علامت پشت‌سرهم) ---
  // مهم: ثباتِ بیش از ZERO_RUN_MAX فریم (دلتای ~صفر) رَن را می‌بندد؛ وگرنه بدنه‌ی
  // یک نتِ پایدار با حرکت بعدی قاطی می‌شود و کل نت «گذر» قلابی خورده حذف می‌شود.
  const ZERO_RUN_MAX = 2;
  interface MonoRun {
    ds: number; // شاخص اولین دلتا
    de: number; // شاخص آخرین دلتا (شامل)
  }
  const runs: MonoRun[] = [];
  let curSign = 0;
  let runDs = -1;
  let lastNz = -1; // شاخص آخرین دلتای غیرصفر
  let zeroRun = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = sm[i];
    const b = sm[i + 1];
    const d = a !== null && b !== null ? b - a : 0;
    const sign = d > TRANS_DEADBAND_CENTS ? 1 : d < -TRANS_DEADBAND_CENTS ? -1 : 0;
    if (sign === 0) {
      zeroRun++;
      if (zeroRun > ZERO_RUN_MAX && curSign !== 0 && runDs >= 0) {
        runs.push({ ds: runDs, de: lastNz });
        curSign = 0;
        runDs = -1;
      }
      continue;
    }
    zeroRun = 0;
    if (sign === curSign) {
      lastNz = i;
    } else {
      if (curSign !== 0 && runDs >= 0) runs.push({ ds: runDs, de: lastNz });
      curSign = sign;
      runDs = i;
      lastNz = i;
    }
  }
  if (curSign !== 0 && runDs >= 0) runs.push({ ds: runDs, de: lastNz });

  // --- ۲) هر رَن: آیا گذر واقعی است؟ (لنگر + رسیدن) ---
  for (const r of runs) {
    const span = r.de - r.ds + 1; // تعداد دلتا ≈ تعداد فریم‌های حرکت
    if (span < TRANS_MIN_FRAMES) continue;
    // فریم‌های حرکت: از ds تا de+1
    const s0 = sm[r.ds];
    const s1 = sm[Math.min(n - 1, r.de + 1)];
    if (s0 === null || s1 === null) continue;
    if (Math.abs(s1 - s0) < TRANS_MIN_MOVE_CENTS) continue;

    // لنگر پایداری قبل از حرکت
    const preVals: number[] = [];
    for (let j = Math.max(0, r.ds - TRANS_ANCHOR_BACK); j < r.ds; j++) {
      if (sm[j] !== null) preVals.push(sm[j] as number);
    }
    if (preVals.length < 3) continue; // شروع از سکوت → گذر نیست
    const anchorMed = median(preVals);
    let anchorNear = 0;
    for (const v of preVals) if (Math.abs(v - anchorMed) < 30) anchorNear++;
    if (anchorNear < 3) continue;

    // سطح مقصد: نگاه به بعد از پایان حرکت
    const postVals: number[] = [];
    for (let j = r.de + 2; j < Math.min(n, r.de + 2 + TRANS_AFTER_AHEAD) && postVals.length < 6; j++) {
      if (sm[j] !== null) postVals.push(sm[j] as number);
    }
    if (postVals.length < 3) continue; // به سکوت می‌رود → بیرون‌روی انتهای نت، مهم نیست
    const afterMed = median(postVals);
    if (Math.abs(afterMed - anchorMed) < TRANS_ARRIVAL_CENTS) continue; // برگشته → گذر نیست

    // گذر واقعی تأیید شد → علامت‌گذاری فریم‌های حرکت (+ یک فریم حاشیه)
    for (let k = Math.max(0, r.ds - 1); k <= Math.min(n - 1, r.de + 2); k++) {
      trans[k] = true;
    }
  }
  return trans;
}

// ==================== تحلیل اصلی ====================

/**
 * تحلیل کامل فایل صوتی قاری
 * @param audioBuffer صدای decode شده
 */
export function analyzeAudioBuffer(audioBuffer: AudioBuffer): AnalysisOutput {
  // ---------- پاس ۰: کاهش نرخ نمونه‌برداری ----------
// هدف: نرخ نهایی هرگز از MAX_SAMPLE_RATE بالاتر نرود.
//
// نکته مهم:
// نسخه قبلی از Math.floor استفاده می‌کرد.
// مثلاً:
//   44100 / 16000 = 2.756
// floor → 2
// 44100 / 2 = 22050 Hz
//
// یعنی برخلاف اسم MAX_SAMPLE_RATE، نرخ نهایی 22.05kHz می‌شد.
//
// با ceil:
//   44100 / 16000 → 3
//   44100 / 3 → 14700 Hz
//
// و برای 48kHz:
//   48000 / 16000 → 3
//   48000 / 3 → 16000 Hz
//
// این تغییر عمداً کوچک نگه داشته شده تا Pipeline فعلی سالم باقی بماند.

const srcRate = audioBuffer.sampleRate;
const srcChannel = audioBuffer.getChannelData(0); // مونو

const dsFactor = Math.max(
  1,
  Math.ceil(srcRate / MAX_SAMPLE_RATE),
);

let sampleRate = srcRate;
let channel = srcChannel;

if (dsFactor > 1) {
  const n = Math.floor(srcChannel.length / dsFactor);
  const ds = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const off = i * dsFactor;

    let sum = 0;
    let count = 0;

    for (
      let k = 0;
      k < dsFactor && off + k < srcChannel.length;
      k++
    ) {
      sum += srcChannel[off + k];
      count++;
    }

    ds[i] = count > 0 ? sum / count : 0;
  }

  channel = ds;

  // نرخ واقعی خروجی، نه یک مقدار فرضی.
  sampleRate = srcRate / dsFactor;
}
  const durationMs = (channel.length / sampleRate) * 1000;

  const hopSize = Math.max(1, Math.floor((HOP_MS / 1000) * sampleRate));
  const frameSize = Math.max(1024, Math.floor((FRAME_MS / 1000) * sampleRate));
  const nfft = nextPow2(frameSize);

  const pitchPoints: Array<{ t: number; hz: number | null; confidence: number }> = [];
  const energyPoints: Array<{ t: number; db: number }> = [];
  const flatArr: number[] = [];
  const zcrArr: number[] = [];

  // ---------- پاس ۱: استخراج خام Pitch و Energy + ویژگی‌های حروف بی‌صدا ----------
  for (let offset = 0; offset + frameSize <= channel.length; offset += hopSize) {
    const tMs = (offset / sampleRate) * 1000;
    const rawFrame = channel.subarray(offset, offset + frameSize);

    const db = rmsDb(rawFrame);
    energyPoints.push({ t: tMs, db });

    const windowed = applyHannWindow(new Float32Array(rawFrame));
    flatArr.push(spectralFlatness(windowed, nfft, sampleRate));
    zcrArr.push(zeroCrossingRate(rawFrame));

    const { frequency, confidence } = yinPitch(windowed, sampleRate);
    pitchPoints.push({ t: tMs, hz: frequency, confidence });
  }

  const rawConf = pitchPoints.map((p) => p.confidence);
  const dbArr = energyPoints.map((p) => p.db);
  const smoothedDb = smooth(dbArr, 3);

  // ---------- پاس ۲: آستانه‌ی سکوت تطبیقی (بر اساس کف نویز همین فایل) ----------
  const dbSorted = [...dbArr].sort((a, b) => a - b);
  const noiseFloor = dbSorted.length > 0 ? dbSorted[Math.floor(dbSorted.length * 0.1)] : -55;
  const silenceDb = clampNum(noiseFloor + 12, -55, -34);

// ---------- پاس ۳: اصلاح محافظه‌کارانه‌ی خطای اکتاو ----------
// هدف:
//   YIN در صدای تک‌صدایی ممکن است گاهی F0 را یک اکتاو بالا/پایین انتخاب کند.
//   اما نباید صرفاً به دلیل نزدیک‌تر بودن به چند فریم قبلی، نت واقعی را
//   به اکتاو دیگری منتقل کنیم.
//
// اصل این نسخه:
//   1) YIN خام نقطه‌ی شروع است.
//   2) اصلاح اکتاو فقط وقتی انجام می‌شود که شواهد محلی کافی وجود داشته باشد.
//   3) یک اصلاح اشتباه نباید وارد history شود و خطای بعدی را تقویت کند.
//   4) تغییر واقعی ملودی نباید به عنوان octave error اصلاح شود.

const correctedHz = pitchPoints.map((p) => p.hz);

const TRACK_HISTORY = 5;

// اصلاح اکتاو فقط وقتی مجاز است که اختلاف حداقل تقریباً یک اکتاو باشد.
const OCTAVE_MIN_CENTS = 700;

// برای جلوگیری از تغییر اکتاو هنگام تغییر واقعی ملودی.
const MAX_LOCAL_JUMP_CENTS = 500;

// چند فریم اطراف نقطه برای بررسی شواهد محلی.
const LOCAL_CONTEXT = 3;

// حداقل تعداد شواهد معتبر برای اصلاح.
const MIN_OCTAVE_SUPPORT = 2;

function octaveDistanceCents(a: number, b: number): number {
  if (
    !Number.isFinite(a) ||
    a <= 0 ||
    !Number.isFinite(b) ||
    b <= 0
  ) {
    return Infinity;
  }

  return Math.abs(1200 * Math.log2(a / b));
}

function nearestOctaveToReference(
  hz: number,
  referenceHz: number,
): number {
  if (
    !Number.isFinite(hz) ||
    hz <= 0 ||
    !Number.isFinite(referenceHz) ||
    referenceHz <= 0
  ) {
    return hz;
  }

  let best = hz;
  let bestDistance = octaveDistanceCents(hz, referenceHz);

  for (let k = -2; k <= 2; k++) {
    const candidate = hz * Math.pow(2, k);

    if (candidate < YIN_MIN_FREQ || candidate > YIN_MAX_FREQ) {
      continue;
    }

    const distance = octaveDistanceCents(
      candidate,
      referenceHz,
    );

    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

// فقط فریم‌های معتبر خام YIN را وارد history می‌کنیم.
// correctedHz اشتباه نباید مرجع فریم‌های بعدی شود.
const recentRawVoiced: number[] = [];

for (let i = 0; i < correctedHz.length; i++) {
  const rawHz = pitchPoints[i]?.hz ?? null;

  if (
    rawHz === null ||
    !Number.isFinite(rawHz) ||
    rawHz <= 0
  ) {
    continue;
  }

  // اگر هنوز history نداریم، YIN خام را بدون دستکاری قبول می‌کنیم.
  if (recentRawVoiced.length === 0) {
    recentRawVoiced.push(rawHz);

    if (recentRawVoiced.length > TRACK_HISTORY) {
      recentRawVoiced.shift();
    }

    continue;
  }

  // میانگین هندسی history خام.
  let logSum = 0;

  for (const value of recentRawVoiced) {
    logSum += Math.log(value);
  }

  const referenceHz = Math.exp(
    logSum / recentRawVoiced.length,
  );

  const rawDistance = octaveDistanceCents(
    rawHz,
    referenceHz,
  );

  // اگر اختلاف با مسیر قبلی خیلی بزرگ نیست،
  // این را تغییر واقعی ملودی در نظر می‌گیریم و دست نمی‌زنیم.
  if (rawDistance < OCTAVE_MIN_CENTS) {
    recentRawVoiced.push(rawHz);

    if (recentRawVoiced.length > TRACK_HISTORY) {
      recentRawVoiced.shift();
    }

    continue;
  }

  // نسخه‌ی اکتاو نزدیک‌تر به مسیر قبلی.
  const octaveCandidate = nearestOctaveToReference(
    rawHz,
    referenceHz,
  );

  if (
    octaveCandidate === rawHz ||
    !Number.isFinite(octaveCandidate) ||
    octaveCandidate <= 0
  ) {
    recentRawVoiced.push(rawHz);

    if (recentRawVoiced.length > TRACK_HISTORY) {
      recentRawVoiced.shift();
    }

    continue;
  }

  // ------------------------------------------------------------
  // بررسی شواهد محلی
  // ------------------------------------------------------------

  let rawSupport = 0;
  let octaveSupport = 0;

  for (
    let j = Math.max(0, i - LOCAL_CONTEXT);
    j <= Math.min(pitchPoints.length - 1, i + LOCAL_CONTEXT);
    j++
  ) {
    if (j === i) continue;

    const neighborHz = pitchPoints[j]?.hz ?? null;

    if (
      neighborHz === null ||
      !Number.isFinite(neighborHz) ||
      neighborHz <= 0
    ) {
      continue;
    }

    const rawToNeighbor = octaveDistanceCents(
      rawHz,
      neighborHz,
    );

    const octaveToNeighbor = octaveDistanceCents(
      octaveCandidate,
      neighborHz,
    );

    if (rawToNeighbor < MAX_LOCAL_JUMP_CENTS) {
      rawSupport++;
    }

    if (octaveToNeighbor < MAX_LOCAL_JUMP_CENTS) {
      octaveSupport++;
    }
  }

  // فقط وقتی octave correction را قبول می‌کنیم که:
  //
  // 1) اختلاف با reference واقعاً بزرگ باشد
  // 2) حداقل دو شاهد محلی از اکتاو جدید حمایت کنند
  // 3) اکتاو جدید نسبت به همسایه‌ها منطقی‌تر باشد
  //
  // در غیر این صورت RAW YIN حفظ می‌شود.
  if (
    rawDistance >= OCTAVE_MIN_CENTS &&
    octaveSupport >= MIN_OCTAVE_SUPPORT &&
    octaveSupport > rawSupport
  ) {
    correctedHz[i] = octaveCandidate;
  } else {
    correctedHz[i] = rawHz;
  }

  // بسیار مهم:
  // همیشه RAW YIN را وارد history می‌کنیم،
  // نه correctedHz را.
  //
  // این مانع از زنجیره شدن خطای اکتاو می‌شود.
  recentRawVoiced.push(rawHz);

  if (recentRawVoiced.length > TRACK_HISTORY) {
    recentRawVoiced.shift();
  }
}
  // ---------- پاس ۴: تثبیت محافظه‌کارانه‌ی Pitch ----------
// هدف:
//   حذف پرش‌های بسیار کوتاه و نویزی بدون صاف کردن حرکت واقعی ملودی.
//
// نکته مهم:
//   Pass 3 قبلاً خطاهای اکتاو را اصلاح کرده است.
//   این مرحله نباید دوباره اکتاو را تغییر دهد.
//
//   به‌جای Median روی Hz، تصمیم‌گیری روی Cents انجام می‌شود
//   چون فاصله‌ی موسیقایی در Cents پایدارتر و مناسب‌تر است.
//
//   اگر پنجره شامل یک حرکت واقعی بزرگ باشد، smoothing انجام نمی‌شود.
//   بنابراین تغییر واقعی نت قاری حفظ خواهد شد.

const STABLE_MEDIAN_HOPS = Math.max(
  3,
  Math.round(50 / HOP_MS),
);

const STABLE_MAX_SPREAD_CENTS = 110;

// حداکثر اختلافی که اجازه می‌دهیم یک نقطه‌ی تنها
// از مرکز محلی منحرف باشد و اصلاح شود.
const STABLE_OUTLIER_CENTS = 70;

const correctedCents: Array<number | null> =
  correctedHz.map((hz) =>
    hz !== null &&
    Number.isFinite(hz) &&
    hz > 0
      ? centsOf(hz)
      : null,
  );

const stableCents: Array<number | null> =
  new Array(correctedCents.length).fill(null);

const halfStable =
  Math.floor(STABLE_MEDIAN_HOPS / 2);

for (let i = 0; i < correctedCents.length; i++) {
  const current = correctedCents[i];

  if (
    current === null ||
    !Number.isFinite(current)
  ) {
    stableCents[i] = null;
    continue;
  }

  const localValues: number[] = [];

  for (
    let j = Math.max(0, i - halfStable);
    j <= Math.min(
      correctedCents.length - 1,
      i + halfStable,
    );
    j++
  ) {
    const value = correctedCents[j];

    if (
      value !== null &&
      Number.isFinite(value)
    ) {
      localValues.push(value);
    }
  }

  // اگر داده‌ی کافی نداریم، همان مقدار Pass 3 را حفظ کن.
  if (localValues.length < 3) {
    stableCents[i] = current;
    continue;
  }

  const sorted = [...localValues].sort(
    (a, b) => a - b,
  );

  const middle =
    Math.floor(sorted.length / 2);

  const localMedian =
    sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;

  const localMin = sorted[0];
  const localMax =
    sorted[sorted.length - 1];

  const localSpread =
    localMax - localMin;

  const distanceFromMedian =
    Math.abs(current - localMedian);

  // ------------------------------------------------------------
  // حالت ۱:
  // پنجره‌ی محلی نسبتاً پایدار است.
  //
  // اگر یک نقطه‌ی منفرد از مسیر اصلی دور افتاده باشد،
  // فقط همان نقطه را به مرکز محلی نزدیک می‌کنیم.
  // ------------------------------------------------------------

  if (
    localSpread <= STABLE_MAX_SPREAD_CENTS &&
    distanceFromMedian <= STABLE_OUTLIER_CENTS
  ) {
    stableCents[i] = localMedian;
    continue;
  }

  // ------------------------------------------------------------
  // حالت ۲:
  // پنجره پراکندگی زیادی دارد.
  //
  // این می‌تواند نشانه‌ی حرکت واقعی ملودی، تحریر،
  // گلیساندو یا تغییر نت باشد.
  //
  // در این شرایط smoothing ممنوع است.
  // مقدار Pass 3 را دست‌نخورده نگه می‌داریم.
  // ------------------------------------------------------------

  stableCents[i] = current;
}
// سازگاری با بخش‌های بعدی Pipeline:
// خروجی تثبیت‌شده‌ی Pass 4 را دوباره به Hz تبدیل می‌کنیم.
const medianHz: Array<number | null> =
  stableCents.map((c) =>
    c !== null && Number.isFinite(c)
      ? hzFromCents(c)
      : null,
  );
const trace: Array<number | null> = [];
const traceT: number[] = [];

for (
  let i = 0;
  i < pitchPoints.length;
  i++
) {
  const isSilence =
    smoothedDb[i] < silenceDb;

  const confOk =
    rawConf[i] >= CONF_GATE;

  // حروف بی‌صدا:
  // س، ش، ه، قلقله و موارد مشابه
  const isUnvoicedJunk =
    flatArr[i] > FLAT_GATE &&
    zcrArr[i] > ZCR_GATE &&
    rawConf[i] < CONF_SOFT_GATE;

  if (
    isSilence ||
    !confOk ||
    isUnvoicedJunk
  ) {
    trace.push(null);
    traceT.push(pitchPoints[i].t);
    continue;
  }

  const c = stableCents[i];

  if (
    c !== null &&
    Number.isFinite(c)
  ) {
    trace.push(c);
  } else {
    // اگر به هر دلیل smoothing مقدار نداد،
    // خروجی Pass 3 را به عنوان fallback نگه می‌داریم.
    const fallbackHz =
      correctedHz[i];

    trace.push(
      fallbackHz !== null &&
      Number.isFinite(fallbackHz) &&
      fallbackHz > 0
        ? centsOf(fallbackHz)
        : null,
    );
  }

  traceT.push(pitchPoints[i].t);
}
  // ---------- پاس ۵: حذف ویبراتو → مرکز واقعی نت‌ها ----------
  const cleanTrace = removeVibrato(trace);

// ---------- DEBUG PITCH STAGE 2 ----------
// فقط برای بررسی مشکل نمودار؛ بعداً حذف می‌شود.

if (import.meta.env?.DEV) {
  const debugRange = [];

  for (let i = 0; i < pitchPoints.length; i++) {
    const t = pitchPoints[i]?.t ?? 0;

    // فقط محدوده 7 تا 9 ثانیه
    if (t >= 7000 && t <= 9000) {
      const rawHz = pitchPoints[i]?.hz ?? null;
      const p3Hz = correctedHz[i] ?? null;
      const p4Hz = medianHz[i] ?? null;

      const p5Cents = cleanTrace[i] ?? null;

      const p5Hz =
        p5Cents !== null &&
        Number.isFinite(p5Cents)
          ? hzFromCents(p5Cents)
          : null;

      debugRange.push({
        index: i,
        timeMs: Math.round(t),

        // Pass 1 — YIN خام
        rawHz:
          rawHz !== null
            ? Math.round(rawHz * 10) / 10
            : null,

        rawCents:
          rawHz !== null &&
          Number.isFinite(rawHz) &&
          rawHz > 0
            ? Math.round(centsOf(rawHz))
            : null,

        // Pass 3 — اصلاح اکتاو
        pass3Hz:
          p3Hz !== null
            ? Math.round(p3Hz * 10) / 10
            : null,

        pass3Cents:
          p3Hz !== null &&
          Number.isFinite(p3Hz) &&
          p3Hz > 0
            ? Math.round(centsOf(p3Hz))
            : null,

        // Pass 4 — Stabilization
        pass4Hz:
          p4Hz !== null
            ? Math.round(p4Hz * 10) / 10
            : null,

        pass4Cents:
          p4Hz !== null &&
          Number.isFinite(p4Hz) &&
          p4Hz > 0
            ? Math.round(centsOf(p4Hz))
            : null,

        // Pass 5 — Vibrato Removal
        pass5Hz:
          p5Hz !== null
            ? Math.round(p5Hz * 10) / 10
            : null,

        pass5Cents:
          p5Cents !== null
            ? Math.round(p5Cents)
            : null,

        // اطلاعات کمکی
        confidence:
          Math.round(
            (pitchPoints[i]?.confidence ?? 0) * 100,
          ) / 100,

        db:
          Math.round(
            (energyPoints[i]?.db ?? 0) * 10,
          ) / 10,

        flatness:
          Math.round(
            (flatArr[i] ?? 0) * 1000,
          ) / 1000,

        zcr:
          Math.round(
            (zcrArr[i] ?? 0) * 1000,
          ) / 1000,
      });
    }
  }

  console.log(
    "========== PITCH PIPELINE DEBUG: 7s → 9s ==========",
  );

  console.table(debugRange);

  console.log(
    "========== END PITCH PIPELINE DEBUG ==========",
  );
}
  // ---------- پاس ۶: ماسک نواحی گذر (گلیساندو) ----------
  const transMask = detectTransitions(cleanTrace);

  // ---------- پاس ۷: بخش‌بندی نت (هیسترزیس + تأیید چندفریمی + پُر کردن شکاف) ----------
  const BRIDGE_HOPS = Math.max(1, Math.round(GAP_BRIDGE_MS / HOP_MS));
  const NOTE_MIN_HOPS = Math.max(2, Math.round(NOTE_MIN_MS / HOP_MS));
  const RECENT_MAX = Math.max(3, Math.round(RECENT_MS / HOP_MS));
  const SETTLE_HOPS = Math.max(3, Math.round(80 / HOP_MS)); // پنجره‌ی نشست: ~۸ فریم اول نت

  const noteIdxs: number[][] = [];
  let cur: number[] = [];
  let refC: number | null = null;
  const recent: number[] = [];

  const flush = () => {
    if (cur.length >= NOTE_MIN_HOPS) noteIdxs.push([...cur]);
    cur = [];
    refC = null;
    recent.length = 0;
  };

  const nFrames = cleanTrace.length;
  let fi = 0;
  while (fi < nFrames) {
    const c = cleanTrace[fi];
    if (c === null) {
      // شکاف: اگر کوتاه است و داخل نت هستیم، پُرش کن (دو تکه نشود)
      let j = fi;
      while (j < nFrames && cleanTrace[j] === null) j++;
      const runLen = j - fi;
      const hasNext = j < nFrames;
      if (cur.length > 0 && hasNext && runLen <= BRIDGE_HOPS && !transMask[j]) {
        fi = j;
        continue;
      }
      flush();
      fi = j;
      continue;
    }
    if (transMask[fi]) {
      // داخل ناحیه‌ی گذر: نت‌ی جاری تمام می‌شود و این فریم به هیچ نتی نمی‌رسد
      flush();
      fi++;
      continue;
    }
    if (cur.length === 0 || refC === null) {
      cur.push(fi);
      refC = c;
      recent.push(c);
      if (recent.length > RECENT_MAX) recent.shift();
      fi++;
      continue;
    }
    // پنجره‌ی نشست: در فریم‌های اول نت، مرجع آزادانه وفق می‌یابد تا
    // نوسان «شروع نت» (نشست اولیه‌ی YIN و حمله‌ی صدا) انشعاب قلابی نسازد
    if (cur.length < SETTLE_HOPS) {
      cur.push(fi);
      recent.push(c);
      if (recent.length > RECENT_MAX) recent.shift();
      refC = median(recent);
      fi++;
      continue;
    }
    const dev = Math.abs(c - refC);
    if (dev > NOTE_GATE_CENTS) {
      // تأیید مداومت: باید چند فریم بعدی هم بیرون از باند باشند (یا گذر باشند)
      let support = 0;
      for (let j = fi + 1; j < Math.min(nFrames, fi + 1 + CONFIRM_SCAN); j++) {
        const cj = cleanTrace[j];
        if (cj === null) continue;
        if (transMask[j]) {
          support++;
          continue;
        }
        if (Math.abs(cj - refC) > NOTE_GATE_CENTS * CONFIRM_RATIO) support++;
      }
      if (support >= CONFIRM_NEED) {
        flush();
        cur.push(fi);
        refC = c;
        recent.push(c);
        if (recent.length > RECENT_MAX) recent.shift();
        fi++;
        continue;
      }
      // پرش تکی → نادیده گرفته می‌شود؛ نت ادامه دارد و مرجع به‌روز نمی‌شود
      fi++;
      continue;
    }
    cur.push(fi);
    recent.push(c);
    if (recent.length > RECENT_MAX) recent.shift();
    refC = median(recent);
    fi++;
  }
  flush();

  // ---------- پاس ۸: ساخت نت — برش سر/ته + میانه‌ی وزن‌دار + پایداری سنتی ----------
  interface BuiltNote {
    startMs: number;
    endMs: number;
    medianCents: number;
    medianHz: number;
    stability: number;
  }
  const toNote = (idxs: number[]): BuiltNote => {
    const nf = idxs.length;
    let trim = Math.floor(nf * TRIM_RATIO);
    if (nf - 2 * trim < 4) trim = Math.max(0, Math.floor((nf - 4) / 2));
    const sel = idxs.slice(trim, nf - trim);
    // میانه‌ی وزن‌دار (وزن = مجذور اطمینان YIN)
    const items = sel.map((gi) => ({
      c: cleanTrace[gi] as number,
      w: Math.pow(Math.max(0.05, rawConf[gi]), 2),
    }));
    items.sort((a, b) => a.c - b.c);
    const totW = items.reduce((s, it) => s + it.w, 0);
    let accW = 0;
    let medC = items[items.length - 1].c;
    for (const it of items) {
      accW += it.w;
      if (accW >= totW / 2) {
        medC = it.c;
        break;
      }
    }
    // پایداری بر مبنای سنت (انحراف معیار روی همان بخش میانی)
    const meanC = sel.reduce((s, gi) => s + (cleanTrace[gi] as number), 0) / sel.length;
    const varC = sel.reduce((s, gi) => s + Math.pow((cleanTrace[gi] as number) - meanC, 2), 0) / sel.length;
    const stdC = Math.sqrt(varC);
    const stability = clampNum(1 - stdC / STABILITY_FULL_CENTS, 0, 1);
    return {
      startMs: traceT[idxs[0]],
      endMs: traceT[idxs[nf - 1]],
      medianCents: medC,
      medianHz: hzFromCents(medC),
      stability,
    };
  };

  // ۸-الف) ساخت اولیه + ادغام نت‌های هم‌مرتبه‌ی مجاور با شکاف کوچک
  const merged: BuiltNote[] = [];
  for (const idxs of noteIdxs) {
    const nt = toNote(idxs);
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(nt.medianCents - prev.medianCents) < MERGE_CENTS && nt.startMs - prev.endMs <= MERGE_GAP_MS) {
      const wa = prev.endMs - prev.startMs;
      const wb = nt.endMs - nt.startMs;
      prev.medianCents = (wa * prev.medianCents + wb * nt.medianCents) / (wa + wb);
      prev.medianHz = hzFromCents(prev.medianCents);
      prev.endMs = nt.endMs;
      prev.stability = Math.min(prev.stability, nt.stability);
      continue;
    }
    merged.push(nt);
  }

  // ۸-ب) پاک‌سازی ریزنت‌های نویزی بین دو نت هم‌مرتبه
  const notes: AnalysisNote[] = [];
  for (let i = 0; i < merged.length; i++) {
    const nt = merged[i];
    const dur = nt.endMs - nt.startMs;
    if (dur < TINY_MS && notes.length > 0) {
      const prev = notes[notes.length - 1];
      const next = merged[i + 1];
      const nearPrev = Math.abs(relCents(nt.medianHz, prev.medianHz)) < TINY_CENTS;
      const nearNext = next ? Math.abs(relCents(nt.medianHz, next.medianHz)) < TINY_CENTS : false;
      if (nearPrev && nearNext) {
        prev.endMs = nt.endMs;
        continue;
      }
    }
    notes.push({ startMs: nt.startMs, endMs: nt.endMs, medianHz: nt.medianHz, stability: nt.stability });
  }

  // ۸-ج) پاک‌سازی «جزیره‌ی حمله»: YIN در فریم‌های نیمه‌پوشانده‌ی شروع صدا گاهی
  // چند فریم اول را خطا می‌گیرد و یک نتِ خیلی کوتاهِ قلابی درست قبل از نت واقعی
  // می‌سازد. الگو: سکوت ← نتِ کوتاه (<۱۱۰ms) ← چسبیده به نتِ طولانی‌تر (≥۲ برابر)
  // → جزیره با نتِ بعدی ادغام می‌شود. نت‌های ملسما (هم‌طولِ همسایه‌ها) هرگز این
  // الگو را ندارند و دست نمی‌خورند.
  {
    const ISLAND_MS = 110;
    let i = 0;
    while (i < notes.length - 1) {
      const nt = notes[i];
      const next = notes[i + 1];
      const dur = nt.endMs - nt.startMs;
      const nextDur = next.endMs - next.startMs;
      const gapBefore = i === 0 ? Infinity : nt.startMs - notes[i - 1].endMs;
      if (
        dur < ISLAND_MS &&
        gapBefore >= 60 && // بلافاصله بعد از سکوت/شروع فایل
        next.startMs - nt.endMs <= 40 && // چسبیده به نت بعدی
        nextDur >= 2 * dur &&
        Math.abs(relCents(nt.medianHz, next.medianHz)) < 300
      ) {
        // ادغام با میانگین وزنی سنتی به نفع نتِ طولانی‌تر
        const hz = Math.pow(
          2,
          (dur * Math.log2(nt.medianHz) + nextDur * Math.log2(next.medianHz)) / (dur + nextDur),
        );
        next.medianHz = hz;
        next.startMs = nt.startMs;
        next.stability = Math.min(next.stability, Math.max(0, nt.stability - 0.05));
        notes.splice(i, 1);
        // دوباره از همان جا بررسی کن (زنجیره‌ای نشود)
        if (i > 0) i--;
        continue;
      }
      i++;
    }
  }
// ---------- پاس ۸-د: Same-Note Anchor ----------
// هدف:
//   اگر یک نت در طول فراز چند بار تکرار شود، اختلاف جزئی ناشی از
//   خطای تخمین F0 یا تغییر طبیعی بسیار کم صدا باعث نشود که
//   همان نت در ارتفاع‌های متفاوت روی نمودار نمایش داده شود.
//
// نکته مهم:
//   این مرحله فقط اختلاف‌های کوچک را اصلاح می‌کند.
//   فاصله‌های بزرگ‌تر دست‌نخورده باقی می‌مانند تا نت‌های واقعی
//   مقام و حرکت ملودی خراب نشوند.
//
//   مثال:
//     280Hz → 284Hz → 320Hz → 282Hz
//
//   سه مقدار اول و آخر:
//     280Hz و 284Hz و 282Hz
//   می‌توانند یک نت واحد باشند.
//
//   اما 320Hz به دلیل فاصله زیاد، نت جداگانه باقی می‌ماند.

const SAME_NOTE_ANCHOR_CENTS = 42;

// برای جلوگیری از اینکه دو نت کاملاً متفاوت که به‌طور اتفاقی
// نزدیک هستند به یکدیگر قفل شوند، باید حداقل یک نت دیگر بینشان باشد.
const SAME_NOTE_MIN_NOTE_GAP = 1;

// مقدار اصلاح را کامل انجام نمی‌دهیم.
// 1 یعنی قفل کامل، 0 یعنی بدون اصلاح.
// مقدار 0.65 محافظه‌کارانه است.
const SAME_NOTE_ANCHOR_STRENGTH = 0.65;

const sameNoteAdjusted: boolean[] =
  new Array(notes.length).fill(false);

for (let i = 0; i < notes.length; i++) {
  const current = notes[i];

  if (
    !current ||
    !Number.isFinite(current.medianHz) ||
    current.medianHz <= 0
  ) {
    continue;
  }

  const currentCents =
    centsOf(current.medianHz);

  const candidates: Array<{
    index: number;
    cents: number;
    distance: number;
    weight: number;
  }> = [];

  // فقط نت‌های قبلی را بررسی می‌کنیم.
  // این باعث می‌شود مسیر زمانی طبیعی باقی بماند.
  for (let j = 0; j < i; j++) {
    if (
      i - j <= SAME_NOTE_MIN_NOTE_GAP
    ) {
      continue;
    }

    const previous = notes[j];

    if (
      !previous ||
      !Number.isFinite(previous.medianHz) ||
      previous.medianHz <= 0
    ) {
      continue;
    }

    const previousCents =
      centsOf(previous.medianHz);

    const distance =
      Math.abs(
        currentCents - previousCents,
      );

    if (
      distance >
      SAME_NOTE_ANCHOR_CENTS
    ) {
      continue;
    }

    // نت‌های طولانی‌تر و باثبات‌تر مرجع بهتری هستند.
    const duration =
      Math.max(
        1,
        previous.endMs - previous.startMs,
      );

    const stability =
      clampNum(
        previous.stability,
        0,
        1,
      );

    const weight =
      Math.log1p(duration) *
      (0.5 + 0.5 * stability);

    candidates.push({
      index: j,
      cents: previousCents,
      distance,
      weight,
    });
  }

  if (candidates.length === 0) {
    continue;
  }

  // نزدیک‌ترین نت‌های قبلی اولویت دارند.
  candidates.sort(
    (a, b) =>
      a.distance - b.distance,
  );

  // فقط چند مرجع نزدیک را وارد محاسبه می‌کنیم.
  // این از کشیده شدن نت به سمت یک نت قدیمی نامرتبط جلوگیری می‌کند.
  const selected =
    candidates.slice(0, 3);

  let weightedSum = 0;
  let totalWeight = 0;

  for (const candidate of selected) {
    weightedSum +=
      candidate.cents *
      candidate.weight;

    totalWeight +=
      candidate.weight;
  }

  if (
    totalWeight <= 0 ||
    !Number.isFinite(totalWeight)
  ) {
    continue;
  }

  const anchorCents =
    weightedSum / totalWeight;

  const anchorDistance =
    Math.abs(
      currentCents - anchorCents,
    );

  // اگر بعد از ترکیب مرجع‌ها اختلاف زیاد شد،
  // این احتمال وجود دارد که نت واقعاً متفاوت باشد.
  if (
    anchorDistance >
    SAME_NOTE_ANCHOR_CENTS
  ) {
    continue;
  }

  // اصلاح تدریجی:
  // به‌جای قفل کامل، بخشی از اختلاف را اصلاح می‌کنیم.
  const adjustedCents =
    currentCents +
    (
      anchorCents -
      currentCents
    ) *
    SAME_NOTE_ANCHOR_STRENGTH;

  const adjustedHz =
    hzFromCents(adjustedCents);

  if (
    Number.isFinite(adjustedHz) &&
    adjustedHz > 0
  ) {
    current.medianHz =
      adjustedHz;

    sameNoteAdjusted[i] = true;
  }
}
  // ---------- پاس ۹: تشخیص رویدادها (سکوت، تنفس، تحریر، اوج) ----------
  const events: AnalysisEvent[] = [];
  const silenceRuns: Array<{ startMs: number; endMs: number }> = [];
  {
    let runStart: number | null = null;
    let prevT = -1;
    for (let i = 0; i < cleanTrace.length; i++) {
      const isSil = cleanTrace[i] === null;
      if (isSil && runStart === null) runStart = traceT[i];
      if (!isSil && runStart !== null) {
        silenceRuns.push({ startMs: runStart, endMs: prevT });
        runStart = null;
      }
      prevT = traceT[i];
    }
    if (runStart !== null) silenceRuns.push({ startMs: runStart, endMs: prevT });
  }

  // تنفس = سکوت کوتاه (بین ۲۰۰ms تا ۲ ثانیه)
  for (const s of silenceRuns) {
    const len = s.endMs - s.startMs;
    if (len >= BREATH_MIN_MS && len <= BREATH_MAX_MS) {
      events.push({ type: "breath", startMs: s.startMs, endMs: s.endMs, confidence: 0.7 });
    } else if (len > BREATH_MAX_MS) {
      events.push({ type: "silence", startMs: s.startMs, endMs: s.endMs, confidence: 0.9 });
    }
  }

  // تحریر — مسیر ۱: نت بلند ناپایدار (با موتور v3 نت‌های رعشه‌دار دیگر اشتباهی
  // ناپایدار شمرده نمی‌شوند، چون ویبراتو قبلأ حذف شده است)
  for (const note of notes) {
    if (note.endMs - note.startMs < 400) continue;
    if (note.stability < 0.65) {
      events.push({
        type: "ornament",
        startMs: note.startMs,
        endMs: note.endMs,
        confidence: 0.5 + note.stability * 0.4,
      });
    }
  }

  // تحریر — مسیر ۲: «زنجیره‌ی ملسمایی» — ۳+ نت کوتاه متوالی با جهت متناوب
  {
    let i = 0;
    while (i < notes.length - (MELISMA_MIN_RUN - 1)) {
      let runLen = 1;
      let valid = notes[i].endMs - notes[i].startMs <= MELISMA_MAX_NOTE_MS;
      while (
        valid &&
        i + runLen < notes.length &&
        notes[i + runLen].endMs - notes[i + runLen].startMs <= MELISMA_MAX_NOTE_MS &&
        notes[i + runLen].startMs - notes[i + runLen - 1].endMs <= MELISMA_MAX_GAP_MS
      ) {
        runLen++;
      }
      if (valid && runLen >= MELISMA_MIN_RUN) {
        let alternates = true;
        let prevSign = 0;
        for (let k = i; k < i + runLen - 1; k++) {
          const d = relCents(notes[k + 1].medianHz, notes[k].medianHz);
          const sign = d > MELISMA_MIN_STEP_CENTS ? 1 : d < -MELISMA_MIN_STEP_CENTS ? -1 : 0;
          if (sign === 0) {
            alternates = false;
            break;
          }
          if (prevSign !== 0 && sign === prevSign) {
            alternates = false;
            break;
          }
          prevSign = sign;
        }
        if (alternates) {
          const from = notes[i].startMs;
          const to = notes[i + runLen - 1].endMs;
          const dup = events.some(
            (e) => e.type === "ornament" && Math.min(e.endMs, to) - Math.max(e.startMs, from) > 0,
          );
          if (!dup) {
            events.push({ type: "ornament", startMs: from, endMs: to, confidence: 0.78 });
          }
          i += runLen;
          continue;
        }
      }
      i++;
    }
  }

  // اوج (اوج ملودی) — بلندترین فرکانس‌ها
  const voicedIdxs: number[] = [];
  for (let i = 0; i < cleanTrace.length; i++) {
    if (cleanTrace[i] !== null) voicedIdxs.push(i);
  }
  if (voicedIdxs.length > 0) {
    const sorted = [...voicedIdxs].sort(
      (a, b) => (cleanTrace[b] as number) - (cleanTrace[a] as number),
    );
    const peakCount = Math.max(1, Math.floor(sorted.length * 0.05));
    for (let i = 0; i < peakCount; i++) {
      events.push({
        type: "peak",
        startMs: traceT[sorted[i]],
        endMs: traceT[sorted[i]] + 50,
        confidence: 0.8,
      });
    }
  }
  events.sort((a, b) => a.startMs - b.startMs);

  // ---------- پاس ۱۰: ساخت مسیر تونل (از کانتور تمیزشده) ----------
  const voicedCents = voicedIdxs.map((i) => cleanTrace[i] as number);
  const minHz = voicedIdxs.length > 0 ? hzFromCents(Math.min(...voicedCents)) : 80;
  const maxHz = voicedIdxs.length > 0 ? hzFromCents(Math.max(...voicedCents)) : 400;
  const logMin = Math.log2(Math.max(1, minHz));
  const logMax = Math.log2(Math.max(2, maxHz));
  const logRange = Math.max(1e-6, logMax - logMin);

  const points: TunnelPoint[] = [];
  const zStep = 0.04; // سرعت پیشروی در عمق

  for (let i = 0; i < cleanTrace.length; i++) {
    const c = cleanTrace[i];
    const dbVal = smoothedDb[i] ?? -60;

    let y = 0;
    if (c !== null) {
      const logHz = Math.log2(hzFromCents(c));
      y = ((logHz - logMin) / logRange) * 2 - 1;
      y = Math.max(-1, Math.min(1, y));
    }

    const energyNorm = Math.max(0, Math.min(1, (dbVal + 60) / 60));
    points.push({
      t: traceT[i],
      x: 0,
      y,
      z: i * zStep,
      radius: 1 + energyNorm * 0.6,
      energy: energyNorm,
    });
  }

  const markers: TunnelMarker[] = events.map((e) => ({ type: e.type, t: e.startMs }));

  // ---------- پاس ۱۱: گزارش کیفیت ----------
  const voicedCount = voicedIdxs.length;
  const coveragePercent =
    cleanTrace.length > 0 ? Math.round((voicedCount / cleanTrace.length) * 100) : 0;
  const avgConfidence =
    rawConf.length > 0
      ? Math.round((rawConf.reduce((a, b) => a + b, 0) / rawConf.length) * 100) / 100
      : 0;

  let message = "تحلیل با موفقیت انجام شد.";
  if (coveragePercent < 30) {
    message = "پوشش صدای تحلیل‌شده کم است — فایل صوتی را بررسی کنید.";
  } else if (avgConfidence < 0.6) {
    message = "کیفیت تشخیص پایین است — شاید نویز یا کیفیت فایل پایین است.";
  }

  return {
    analysis: {
      sampleRate,
      hopMs: HOP_MS,
      durationMs: Math.round(durationMs),
      pitch: cleanTrace
        .map((c, i) => ({ c, i }))
        .filter((p) => p.c !== null)
        .map((p) => ({
          t: Math.round(traceT[p.i]),
          hz: Math.round(hzFromCents(p.c as number) * 10) / 10,
          cents: Math.round(hzToCents(hzFromCents(p.c as number))),
          confidence: Math.round(rawConf[p.i] * 100) / 100,
        })),
      energy: energyPoints.map((p) => ({ t: Math.round(p.t), db: Math.round(p.db * 10) / 10 })),
      notes: notes.map((nt) => ({
        startMs: Math.round(nt.startMs),
        endMs: Math.round(nt.endMs),
        medianHz: Math.round(nt.medianHz * 10) / 10,
        stability: Math.round(nt.stability * 100) / 100,
      })),
      events: events.map((e) => ({
        type: e.type,
        startMs: Math.round(e.startMs),
        endMs: Math.round(e.endMs),
        confidence: Math.round(e.confidence * 100) / 100,
      })),
    },
    tunnel: {
      version: 1,
      points,
      markers,
    },
    quality: {
      coveragePercent,
      avgConfidence,
      noteCount: notes.length,
      breathCount: events.filter((e) => e.type === "breath").length,
      ornamentCount: events.filter((e) => e.type === "ornament").length,
      message,
    },
  };
}
