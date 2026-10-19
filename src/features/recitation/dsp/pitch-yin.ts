// ============================================================================
// Smart Recitation — Enhanced Monophonic Pitch Detection (YIN v4)
// ----------------------------------------------------------------------------
// هدف:
//   تشخیص F0 برای صدای تک‌صدایی قاری قرآن، بدون تحلیل هارمونی/چندصدایی.
//
// سازگاری:
//   - امضای yinPitch حفظ شده است.
//   - applyHannWindow و hzToCents حفظ شده‌اند.
//   - مصرف‌کننده‌های فعلی پروژه نیازی به تغییر import ندارند.
//
// بهبودهای این نسخه:
//   1) YIN با انتخاب کاندیدهای چندگانه از minimumهای معتبر CMND
//   2) درون‌یابی سهموی برای دقت زیر-سمپل
//   3) confidence محافظه‌کارانه‌تر بر اساس کیفیت minimum
//   4) رد کردن فریم‌های کم‌انرژی/نامعتبر
//   5) جلوگیری از انتخاب minimumهای بسیار ضعیف
//   6) API جدید yinPitchCandidates برای استفاده در مرحله Temporal Tracking
//
// نکته مهم:
//   این فایل هنوز Raw F0 را smooth یا quantize نمی‌کند. smoothing، octave
//   tracking و note segmentation در مراحل بعدی pipeline انجام خواهند شد.
// ============================================================================

export interface YinCandidate {
  frequency: number;
  cmnd: number;
  confidence: number;
  tau: number;
}

export interface YinFrame {
  frequency: number | null;
  confidence: number;
  candidateCount?: number;
}

export const YIN_MIN_FREQ = 60;
export const YIN_MAX_FREQ = 1200;

const YIN_THRESHOLD = 0.15;
const YIN_MAX_ACCEPTABLE_CMND = 0.50;
const MIN_RMS = 0.003;
const MAX_CANDIDATES = 5;
const MIN_CANDIDATE_SEPARATION = 0.015;

function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const x = frame[i];
    sum += x * x;
  }

  return Math.sqrt(sum / frame.length);
}

/**
 * استخراج کاندیدهای F0 از CMND.
 *
 * نکته مهم:
 * YIN استاندارد «اولین minimum معتبر زیر threshold» را
 * به minimum عمیق‌ترِ دیرتر ترجیح می‌دهد.
 *
 * این رفتار برای جلوگیری از خطای:
 *   F0  -> F0 / 2
 * یا
 *   F0  -> F0 / 4
 *
 * بسیار مهم است؛ چون minimumهای دیرتر می‌توانند مربوط به
 * subharmonic / octave error باشند.
 *
 * در عین حال چند candidate دیگر را نیز نگه می‌داریم تا
 * Temporal Tracker در مرحله بعد بتواند تصمیم نهایی بگیرد.
 */
function findCandidateTaus(
  cmnd: Float32Array,
  tauMin: number,
  tauMax: number,
): number[] {
  const candidates: Array<{ tau: number; value: number }> = [];

  // ------------------------------------------------------------
  // ۱) پیدا کردن تمام minimumهای محلی معتبر
  // ------------------------------------------------------------
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    const current = cmnd[tau];

    // فقط minimum محلی
    if (
      current > cmnd[tau - 1] ||
      current > cmnd[tau + 1]
    ) {
      continue;
    }

    // minimum ضعیف را کنار می‌گذاریم
    if (current > YIN_MAX_ACCEPTABLE_CMND) {
      continue;
    }

    candidates.push({
      tau,
      value: current,
    });
  }

  // ------------------------------------------------------------
  // ۲) اگر minimum معتبری پیدا نشد → global minimum
  // ------------------------------------------------------------
  if (candidates.length === 0) {
    let bestTau = -1;
    let bestValue = Infinity;

    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau] < bestValue) {
        bestValue = cmnd[tau];
        bestTau = tau;
      }
    }

    if (
      bestTau >= 0 &&
      bestValue <= YIN_MAX_ACCEPTABLE_CMND
    ) {
      candidates.push({
        tau: bestTau,
        value: bestValue,
      });
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  // ------------------------------------------------------------
  // ۳) حذف minimumهای بسیار نزدیک به هم
  // ------------------------------------------------------------
  const selected: Array<{
    tau: number;
    value: number;
  }> = [];

  // ابتدا بر اساس tau مرتب می‌کنیم.
  //
  // tau کوچک‌تر = فرکانس بالاتر
  // tau بزرگ‌تر = فرکانس پایین‌تر
  //
  // این ترتیب برای پیدا کردن «اولین trough معتبر YIN»
  // مهم است.
  const byTau = [...candidates].sort(
    (a, b) => a.tau - b.tau,
  );

  for (const candidate of byTau) {
    const isDuplicate = selected.some(
      (existing) =>
        Math.abs(candidate.tau - existing.tau) /
          Math.max(1, existing.tau) <
        MIN_CANDIDATE_SEPARATION,
    );

    if (!isDuplicate) {
      selected.push(candidate);
    }

    if (selected.length >= MAX_CANDIDATES) {
      break;
    }
  }

  // ------------------------------------------------------------
  // ۴) ترتیب نهایی:
  //
  // اولین minimum معتبر در ابتدای لیست قرار می‌گیرد.
  // سپس candidateهای بعدی بر اساس کیفیت CMND می‌آیند.
  //
  // این کار باعث می‌شود tracker اطلاعات بیشتری داشته باشد
  // ولی F0 اصلی به سمت subharmonic کشیده نشود.
  // ------------------------------------------------------------
  const first = selected[0];

  const rest = selected
    .slice(1)
    .sort((a, b) => a.value - b.value);

  return [first, ...rest].map(
    (item) => item.tau,
  );
}

function refineTau(
  cmnd: Float32Array,
  tau: number,
  tauMax: number,
): number {
  if (tau <= 0 || tau >= tauMax) return tau;

  const a = cmnd[tau - 1];
  const b = cmnd[tau];
  const c = cmnd[tau + 1];

  const denom = a - 2 * b + c;

  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) {
    return tau;
  }

  const offset = 0.5 * (a - c) / denom;

  return tau + Math.max(-0.5, Math.min(0.5, offset));
}

function cmndToConfidence(cmndValue: number): number {
  if (!Number.isFinite(cmndValue) || cmndValue >= 1) return 0;

  const normalized =
    1 - cmndValue / Math.max(1e-6, YIN_MAX_ACCEPTABLE_CMND);

  return Math.max(0, Math.min(1, normalized));
}

export function yinPitchCandidates(
  frame: Float32Array,
  sampleRate: number,
): YinCandidate[] {
  if (
    frame.length < 16 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0
  ) {
    return [];
  }

  if (rms(frame) < MIN_RMS) {
    return [];
  }

  const tauMin = Math.max(
    2,
    Math.floor(sampleRate / YIN_MAX_FREQ),
  );

  const tauMax = Math.min(
    Math.floor(sampleRate / YIN_MIN_FREQ),
    frame.length - 2,
  );

  if (tauMax <= tauMin + 2) return [];

  const diff = new Float32Array(tauMax + 1);

  for (let tau = 0; tau <= tauMax; tau++) {
    let sum = 0;
    const limit = frame.length - tau;

    for (let i = 0; i < limit; i++) {
      const d = frame[i] - frame[i + tau];
      sum += d * d;
    }

    diff[tau] = sum;
  }

  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;

  let runningSum = 0;

  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += diff[tau];

    cmnd[tau] =
      runningSum > 1e-12
        ? (diff[tau] * tau) / runningSum
        : 1;
  }

  const candidateTaus = findCandidateTaus(
    cmnd,
    tauMin,
    tauMax,
  );

  const candidates: YinCandidate[] = [];

  for (const tau of candidateTaus) {
    const refined = refineTau(
      cmnd,
      tau,
      tauMax,
    );

    if (!Number.isFinite(refined) || refined <= 0) {
      continue;
    }

    const frequency = sampleRate / refined;

    if (
      !Number.isFinite(frequency) ||
      frequency < YIN_MIN_FREQ ||
      frequency > YIN_MAX_FREQ
    ) {
      continue;
    }

    const cmndValue = cmnd[tau];
    const confidence = cmndToConfidence(cmndValue);

    candidates.push({
      frequency,
      cmnd: cmndValue,
      confidence,
      tau: refined,
    });
  }

  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }

    return a.frequency - b.frequency;
  });

  return candidates.slice(0, MAX_CANDIDATES);
}

export function yinPitch(
  frame: Float32Array,
  sampleRate: number,
): YinFrame {
  const candidates = yinPitchCandidates(
    frame,
    sampleRate,
  );

  if (candidates.length === 0) {
    return {
      frequency: null,
      confidence: 0,
      candidateCount: 0,
    };
  }

  const best = candidates[0];

  return {
    frequency: best.frequency,
    confidence: best.confidence,
    candidateCount: candidates.length,
  };
}

export function applyHannWindow(
  frame: Float32Array,
): Float32Array {
  const out = new Float32Array(frame.length);

  if (frame.length === 0) return out;

  if (frame.length === 1) {
    out[0] = frame[0];
    return out;
  }

  for (let i = 0; i < frame.length; i++) {
    const w =
      0.5 *
      (1 -
        Math.cos(
          (2 * Math.PI * i) /
            (frame.length - 1),
        ));

    out[i] = frame[i] * w;
  }

  return out;
}

export function hzToCents(
  frequency: number,
  referenceHz = 440,
): number {
  if (
    !Number.isFinite(frequency) ||
    frequency <= 0 ||
    !Number.isFinite(referenceHz) ||
    referenceHz <= 0
  ) {
    return NaN;
  }

  return 1200 *
    Math.log2(frequency / referenceHz);
}