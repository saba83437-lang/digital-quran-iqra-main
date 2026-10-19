// ============================================================================
// ماژول ابزارها، کوانتایز و قطعه‌بندی هوشمند نت‌ها (Note Edit Utils)
// سازگار با استودیوی نت‌نگار نسخه‌ی ۴ و موتور پردازش صوتی فرازها
// ============================================================================

import type {
  AnalysisNote,
  AnalysisEvent,
  AnalysisPitchPoint,
  AnalysisEnergyPoint,
  TunnelPoint,
} from "./analysis-pipeline";

// نام نت‌های ۱۲گانه استاندارد به فارسی
export const NOTE_NAMES_FA = [
  "دو", "دو♯", "ر", "ر♯", "می", "فا", "فا♯", "سل", "سل♯", "لا", "لا♯", "سی"
] as const;

export const NOTE_NAMES_WESTERN = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
] as const;

export interface WordBand {
  word: string;
  startMs: number;
  endMs: number;
}

export interface RebuildTunnelParams {
  pitch: AnalysisPitchPoint[];
  energy?: AnalysisEnergyPoint[];
  notes: AnalysisNote[];
  events: AnalysisEvent[];
  hopMs: number;
  durationMs: number;
  originalPoints?: TunnelPoint[] | null;
}

// ==================== تبدیل‌های فرکانس و نت ====================

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function toFaDigits(val: number | string): string {
  const str = String(val);
  const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return str.replace(/[0-9]/g, (d) => fa[Number(d)]);
}

export function formatTimeFa(ms: number): string {
  const totalSec = Math.max(0, ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const sStr = s < 10 ? `۰${s.toFixed(1)}` : s.toFixed(1);
  return `${toFaDigits(m)}:${toFaDigits(sStr.replace(".", "٫"))}`;
}

export function hzToMidi(hz: number, tuningA4 = 440): number {
  if (hz <= 0) return 0;
  return 69 + 12 * Math.log2(Math.max(1, hz) / tuningA4);
}

export function midiToHz(midi: number, tuningA4 = 440): number {
  if (midi <= 0) return 0;
  return tuningA4 * Math.pow(2, (midi - 69) / 12);
}

export function snapToSemitone(hz: number, tuningA4 = 440): number {
  if (hz <= 0) return hz;
  const m = Math.round(hzToMidi(hz, tuningA4));
  return Math.round(midiToHz(m, tuningA4) * 10) / 10;
}

export function centsFromNearestNote(hz: number, tuningA4 = 440): number {
  if (hz <= 0) return 0;
  const m = hzToMidi(hz, tuningA4);
  return Math.round((m - Math.round(m)) * 100);
}

export function noteNameFa(hz: number, tuningA4 = 440): string {
  if (hz <= 0) return "سکوت";
  const m = Math.round(hzToMidi(hz, tuningA4));
  const octave = Math.floor(m / 12) - 1;
  const noteIdx = ((m % 12) + 12) % 12;
  return `${NOTE_NAMES_FA[noteIdx]}${toFaDigits(octave)}`;
}

// ==================== اعتبارسنجی‌ها ====================

export function validateNotes(notes: AnalysisNote[], durationMs: number): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(notes) || notes.length === 0) {
    return { ok: false, errors: ["حداقل یک نت باید در فراز وجود داشته باشد"] };
  }

  const sorted = [...notes].sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i];
    const dur = n.endMs - n.startMs;
    if (dur < 60) {
      errors.push(`نت شماره ${toFaDigits(i + 1)} خیلی کوتاه است (${toFaDigits(dur)} میلی‌ثانیه — حداقل ۶۰ میلی‌ثانیه)`);
    }
    if (n.startMs < 0 || n.endMs > durationMs + 200) {
      errors.push(`نت شماره ${toFaDigits(i + 1)} خارج از محدوده زمانی فراز است`);
    }
    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      if (n.endMs > next.startMs) {
        errors.push(`نت شماره ${toFaDigits(i + 1)} و نت شماره ${toFaDigits(i + 2)} هم‌پوشانی دارند`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateWordBands(bands: WordBand[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (b.endMs <= b.startMs + 50) {
      errors.push(`نوار کلمه «${b.word}» بیش از حد کوتاه است`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function sanitizeEvents(events: AnalysisEvent[], notes: AnalysisNote[]): AnalysisEvent[] {
  if (!Array.isArray(events) || events.length === 0) return [];
  const maxEnd = notes.reduce((mx, n) => Math.max(mx, n.endMs), 0);
  return events.filter((e) => e.startMs >= 0 && e.endMs > e.startMs && (maxEnd === 0 || e.startMs <= maxEnd + 1000));
}

// ==================== پردازش کلمات و تطویل عربی ====================

export function stretchWithTatweel(word: string, count: number): string {
  if (!word || count <= 0) return word;
  const nonConnectors = new Set(["ا", "أ", "إ", "آ", "د", "ذ", "ر", "ز", "ژ", "و", "ة"]);
  let result = "";
  let tatweelInserted = false;

  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    result += ch;
    // درج تطویل (ـ) در وسط کلمه بعد از حروفی که از چپ می‌چسبند
    if (!tatweelInserted && i < word.length - 1 && !nonConnectors.has(ch) && ch !== " ") {
      result += "ـ".repeat(count);
      tatweelInserted = true;
    }
  }

  return tatweelInserted ? result : word;
}

export function distributeWordBands(text: string, notes: AnalysisNote[], durationMs: number): WordBand[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const startMs = notes.length > 0 ? notes[0].startMs : 0;
  const endMs = notes.length > 0 ? notes[notes.length - 1].endMs : durationMs;
  const total = Math.max(1000, endMs - startMs);
  const step = total / words.length;

  return words.map((w, i) => ({
    word: w,
    startMs: Math.round(startMs + i * step),
    endMs: Math.round(startMs + (i + 1) * step),
  }));
}

export function alignSavedBands(saved: unknown, text: string): WordBand[] | null {
  if (!Array.isArray(saved) || saved.length === 0) return null;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length !== saved.length) return null;

  return saved.map((b, i) => ({
    word: words[i],
    startMs: Number(b.startMs) || 0,
    endMs: Number(b.endMs) || 0,
  }));
}

// ==================== بازسازی تونل بازی ====================

export function rebuildTunnelFromNotes(params: RebuildTunnelParams): TunnelPoint[] {
  const { notes, pitch, durationMs, hopMs = 20 } = params;
  const points: TunnelPoint[] = [];
  const sortedNotes = [...notes].sort((a, b) => a.startMs - b.startMs);

  for (let t = 0; t <= durationMs; t += hopMs) {
    const activeNote = sortedNotes.find((n) => t >= n.startMs && t <= n.endMs);
    let targetHz = activeNote ? activeNote.medianHz : 0;

    if (!targetHz) {
      const nearPitch = pitch.find((p) => Math.abs(p.t - t) < hopMs);
      targetHz = nearPitch ? nearPitch.hz : 0;
    }

    points.push({
      t,
      hz: targetHz,
      targetHz,
      note: activeNote ? noteNameFa(activeNote.medianHz) : undefined,
    } as TunnelPoint);
  }

  return points;
}

// ==================== استخراج و فیلتر هوشمند نت‌ها (موتور جدید) ====================

/**
 * فیلتر میانه برای حذف پرش‌های صوتی و نویزهای تک‌فریمی صدای قاری
 */
export function applyPitchMedianFilter(pitch: AnalysisPitchPoint[], windowSize = 5): AnalysisPitchPoint[] {
  if (!Array.isArray(pitch) || pitch.length < windowSize) return pitch;
  const half = Math.floor(windowSize / 2);
  const out: AnalysisPitchPoint[] = [];

  for (let i = 0; i < pitch.length; i++) {
    const cur = pitch[i];
    if (i < half || i >= pitch.length - half || cur.hz <= 0) {
      out.push(cur);
      continue;
    }

    const windowHz = pitch
      .slice(i - half, i + half + 1)
      .map((p) => p.hz)
      .filter((h) => h > 50 && h < 1200)
      .sort((a, b) => a - b);

    if (windowHz.length === 0) {
      out.push(cur);
      continue;
    }

    const median = windowHz[Math.floor(windowHz.length / 2)];
    out.push({ t: cur.t, hz: Math.round(median * 10) / 10 });
  }

  return out;
}

/**
 * الگوریتم معجزه‌آسای استخراج هوشمند و تمیز تمام نت‌ها بر مبنای صدای قاری
 * نویزهای حنجره و تحریرهای ریز را صاف کرده و پله‌های استاندارد می‌سازد
 */
export function autoExtractCleanNotesFromPitch(
  rawPitch: AnalysisPitchPoint[],
  durationMs: number,
  options: {
    minDurationMs?: number;
    semitoneTolerance?: number;
    snapToNote?: boolean;
  } = {}
): AnalysisNote[] {
  const { minDurationMs = 80, semitoneTolerance = 0.65, snapToNote = true } = options;

  const smoothed = applyPitchMedianFilter(rawPitch, 5);
  const notes: AnalysisNote[] = [];
  let cluster: AnalysisPitchPoint[] = [];

  function saveCluster() {
    if (cluster.length === 0) return;
    const startMs = cluster[0].t;
    const endMs = cluster[cluster.length - 1].t;
    const dur = endMs - startMs;

    if (dur >= minDurationMs) {
      const hzs = cluster.map((p) => p.hz).sort((a, b) => a - b);
      const medianHz = hzs[Math.floor(hzs.length / 2)];
      const finalHz = snapToNote ? snapToSemitone(medianHz) : medianHz;

      notes.push({
        startMs: Math.round(startMs),
        endMs: Math.round(endMs),
        medianHz: Math.round(finalHz * 10) / 10,
        stability: 0.95,
      });
    }
    cluster = [];
  }

  for (let i = 0; i < smoothed.length; i++) {
    const p = smoothed[i];
    // فیلتر صداهای خارج از رنج صدای انسان
    if (p.hz < 65 || p.hz > 1100) {
      saveCluster();
      continue;
    }

    if (cluster.length === 0) {
      cluster.push(p);
    } else {
      const clusterStartMidi = hzToMidi(cluster[0].hz);
      const currentMidi = hzToMidi(p.hz);
      const diff = Math.abs(currentMidi - clusterStartMidi);

      if (diff <= semitoneTolerance) {
        cluster.push(p);
      } else {
        saveCluster();
        cluster.push(p);
      }
    }
  }

  saveCluster();
  return notes;
}