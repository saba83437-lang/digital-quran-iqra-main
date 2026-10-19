// ============================================================================
// Smart Recitation — استودیوی نت‌نگار (ویرایشگر نت‌های فراز) — نسخه‌ی نهایی و هوشمند
// ----------------------------------------------------------------------------
// با موتور استخراج و تراز هوشمند نت‌ها + نمایش نام نت روی پله‌ها
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  Square,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Trash2,
  Save,
  Loader2,
  Music4,
  Repeat,
  RotateCcw,
  Plus,
  Sparkles,
  CircleAlert,
  Eye,
  EyeOff,
  Merge,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type {
  AnalysisNote,
  AnalysisEvent,
  AnalysisPitchPoint,
  AnalysisEnergyPoint,
  AnalysisOutput,
  TunnelPoint,
} from "../dsp/analysis-pipeline";
import {
  NOTE_NAMES_FA,
  hzToMidi,
  midiToHz,
  noteNameFa,
  centsFromNearestNote,
  snapToSemitone,
  validateNotes,
  sanitizeEvents,
  rebuildTunnelFromNotes,
  distributeWordBands,
  alignSavedBands,
  validateWordBands,
  stretchWithTatweel,
  clamp,
  toFaDigits,
  formatTimeFa,
  autoExtractCleanNotesFromPitch,
} from "../dsp/note-edit-utils";
import type { WordBand } from "../dsp/note-edit-utils";
import type { RecitationPassageVersion } from "../domain/recitation-types";
import { getAudioSignedUrl, saveNoteEdits } from "../api/recitation-admin-api";

// ==================== ثابت‌های چیدمان نمودار ====================
const PX_PER_SEC = 110;
const CHART_H = 300;
const M_L = 26;
const M_R = 86;
const M_T = 56;
const M_B = 40;
const WORD_TEXT_Y = 20;
const BAND_TOP = 30;
const ZOOM_MULTS = [0.5, 1, 2, 4, 8];
const RATES = [0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 2];
const MIN_NOTE_MS_UI = 60;

const COLOR_STEP = "#1e3a8a";
const COLOR_PITCH = "#94a3b8";
const COLOR_BAND = "#fde68a";
const COLOR_BAND_EDGE = "#fbbf24";
const COLOR_BREATH = "#fde047";
const COLOR_BREATH_ARROW = "#dc2626";
const COLOR_ORNAMENT = "#d97706";
const COLOR_SEL = "#0ea5e9";
const COLOR_BALL = "#f59e0b";

// ==================== تایپ‌ها ====================
interface Snapshot {
  notes: AnalysisNote[];
  events: AnalysisEvent[];
  bands: WordBand[];
  bandsCustom: boolean;
}

interface DragState {
  mode:
    | "move"
    | "start"
    | "end"
    | "band-move"
    | "band-start"
    | "band-end"
    | "orn"
    | "orn-start"
    | "orn-end";
  idx: number;
  pre: Snapshot;
  grabT?: number;
}

export interface NoteEditorProps {
  version: RecitationPassageVersion;
  passageTextHint?: string | null;
  onSaved?: () => void;
  className?: string;
}

function cloneSnapshot(
  notes: AnalysisNote[],
  events: AnalysisEvent[],
  bands: WordBand[],
  bandsCustom: boolean,
): Snapshot {
  return {
    notes: notes.map((n) => ({ ...n })),
    events: events.map((e) => ({ ...e })),
    bands: bands.map((b) => ({ ...b })),
    bandsCustom,
  };
}

function medianPitchHz(pitch: AnalysisPitchPoint[], startMs: number, endMs: number): number | null {
  const hzs = pitch.filter((p) => p.t >= startMs && p.t <= endMs).map((p) => p.hz);
  if (hzs.length === 0) return null;
  hzs.sort((a, b) => a - b);
  const mid = Math.floor(hzs.length / 2);
  return hzs.length % 2 ? hzs[mid] : (hzs[mid - 1] + hzs[mid]) / 2;
}

// ==================== کامپوننت اصلی ====================
export function NoteEditor({ version, passageTextHint, onSaved, className }: NoteEditorProps) {
  const analysis = (version.analysis_json ?? {}) as Partial<AnalysisOutput["analysis"]>;
  const pitch: AnalysisPitchPoint[] = Array.isArray(analysis.pitch) ? analysis.pitch : [];
  const energyArr: AnalysisEnergyPoint[] = Array.isArray(analysis.energy) ? analysis.energy : [];
  const hopMs = analysis.hopMs ?? 20;
  const durationMs = useMemo(() => {
    if (analysis.durationMs && analysis.durationMs > 0) return analysis.durationMs;
    const maxT = pitch.length > 0 ? Math.max(...pitch.map((p) => p.t)) : 0;
    return Math.max(1000, maxT + hopMs * 3);
  }, [analysis.durationMs, pitch, hopMs]);

  const manual = (version.manual_overrides ?? {}) as Record<string, unknown>;
  const originalTunnelPoints = useMemo(() => {
    const tj = version.tunnel_json as { points?: TunnelPoint[] } | null;
    return tj && Array.isArray(tj.points) ? tj.points : null;
  }, [version.tunnel_json]);

  const initialNotes = useMemo(
    () =>
      (Array.isArray(analysis.notes) ? analysis.notes : [])
        .map((n) => ({ ...n }))
        .sort((a, b) => a.startMs - b.startMs),
    [analysis.notes],
  );
  const initialEvents = useMemo(
    () => (Array.isArray(analysis.events) ? analysis.events.map((e) => ({ ...e })) : []),
    [analysis.events],
  );

  const [notes, setNotes] = useState<AnalysisNote[]>(initialNotes);
  const [events, setEvents] = useState<AnalysisEvent[]>(initialEvents);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [text, setText] = useState<string>(typeof manual.quranText === "string" ? manual.quranText : "");
  const [showBands, setShowBands] = useState(true);

  const initialBands = useMemo(() => {
    const fromSaved = alignSavedBands(manual.wordBands, typeof manual.quranText === "string" ? manual.quranText : "");
    if (fromSaved) return { bands: fromSaved, custom: true };
    return {
      bands: distributeWordBands(typeof manual.quranText === "string" ? manual.quranText : "", initialNotes, durationMs),
      custom: false,
    };
  }, [manual.wordBands, manual.quranText, initialNotes, durationMs]);
  const [bands, setBands] = useState<WordBand[]>(initialBands.bands);
  const [bandsCustom, setBandsCustom] = useState<boolean>(initialBands.custom);
  const [selBand, setSelBand] = useState<number | null>(null);
  const [selOrn, setSelOrn] = useState<number | null>(null);

  const [zoomIdx, setZoomIdx] = useState(1);
  const [follow, setFollow] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [playT, setPlayT] = useState<number | null>(null);
  const [loopSel, setLoopSel] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [rate, setRate] = useState(1);

  const savedRef = useRef({
    notesJson: JSON.stringify(initialNotes),
    eventsJson: JSON.stringify(initialEvents),
    bandsJson: JSON.stringify(initialBands.bands),
    bandsCustom: initialBands.custom,
    text: typeof manual.quranText === "string" ? manual.quranText : "",
  });

  const hasSnapshot = "originalAutoNotes" in manual;

  const notesRef = useRef(notes);
  notesRef.current = notes;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const bandsRef = useRef(bands);
  bandsRef.current = bands;
  const bandsCustomRef = useRef(bandsCustom);
  bandsCustomRef.current = bandsCustom;
  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      if (bandsRef.current.length > 0) {
        setBands([]);
        setBandsCustom(false);
      }
      return;
    }
    if (words.length === bandsRef.current.length) {
      setBands((bs) => bs.map((b, i) => (b.word === words[i] ? b : { ...b, word: words[i] })));
      return;
    }
    if (bandsCustomRef.current && bandsRef.current.length > 0) {
      setPast((p) => [
        ...p.slice(-49),
        cloneSnapshot(notesRef.current, eventsRef.current, bandsRef.current, bandsCustomRef.current),
      ]);
      setFuture([]);
    }
    setBands(distributeWordBands(text, notesRef.current, durationMs));
    setBandsCustom(false);
    setSelBand(null);
  }, [text, durationMs]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const dirty =
    JSON.stringify(notes) !== savedRef.current.notesJson ||
    JSON.stringify(events) !== savedRef.current.eventsJson ||
    JSON.stringify(bands) !== savedRef.current.bandsJson ||
    text !== savedRef.current.text;
  const textDirty = text !== savedRef.current.text;

  useEffect(() => {
    let mounted = true;
    void getAudioSignedUrl(version.audio_path, 3600).then((u) => {
      if (mounted && u) setAudioUrl(u);
      else if (mounted) toast.error("ساخت لینک صوت ناموفق بود");
    });
    return () => {
      mounted = false;
    };
  }, [version.audio_path]);

  useEffect(() => {
    if (!audioUrl) return;
    const a = new Audio(audioUrl);
    a.preload = "auto";
    a.playbackRate = rateRef.current;
    a.onended = () => {
      setPlaying(false);
      setLoopSel(false);
      setPlayT(0);
    };
    audioRef.current = a;
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, [audioUrl]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) {
      a.playbackRate = rate;
      (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    }
  }, [rate, audioUrl]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      if (a) {
        const t = a.currentTime * 1000;
        const cur = notesRef.current;
        const s = selRef.current;
        if (loopRef.current && s !== null && cur[s] && t > cur[s].endMs - 10) {
          a.currentTime = cur[s].startMs / 1000;
          setPlayT(cur[s].startMs);
        } else {
          setPlayT(t);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const selRef = useRef<number | null>(null);
  selRef.current = sel;
  const loopRef = useRef(loopSel);
  loopRef.current = loopSel;

  const [contW, setContW] = useState(740);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContW(Math.max(340, el.clientWidth));
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const fitPx = useMemo(() => {
    const sec = Math.max(1, durationMs / 1000);
    const avail = contW - M_L - M_R - 10;
    return clamp(avail / sec, 20, PX_PER_SEC);
  }, [contW, durationMs]);

  const zoomMult = ZOOM_MULTS[zoomIdx];
  const zoomInBlocked = useMemo(() => {
    if (zoomIdx >= ZOOM_MULTS.length - 1) return true;
    const nextW =
      (durationMs / 1000) * fitPx * ZOOM_MULTS[Math.min(ZOOM_MULTS.length - 1, zoomIdx + 1)] + M_L + M_R;
    return nextW > 30000;
  }, [zoomIdx, durationMs, fitPx]);
  const plotW = (durationMs / 1000) * fitPx * zoomMult;
  const plotH = CHART_H - BAND_TOP - M_B;
  const svgW = M_L + plotW + M_R;

  const xOf = useCallback(
    (tMs: number) => M_L + (1 - clamp(tMs / durationMs, 0, 1)) * plotW,
    [durationMs, plotW],
  );
  const tOfX = useCallback(
    (px: number) => clamp((1 - (px - M_L) / plotW) * durationMs, 0, durationMs),
    [durationMs, plotW],
  );

  const { loMidi, hiMidi } = useMemo(() => {
    if (notes.length === 0) {
      const c = hzToMidi(165);
      return { loMidi: Math.floor(c) - 4, hiMidi: Math.ceil(c) + 4 };
    }
    let mn = Infinity;
    let mx = -Infinity;
    for (const n of notes) {
      if (n.medianHz < mn) mn = n.medianHz;
      if (n.medianHz > mx) mx = n.medianHz;
    }
    return { loMidi: Math.floor(hzToMidi(mn)) - 2, hiMidi: Math.ceil(hzToMidi(mx)) + 2 };
  }, [notes]);
  const loLog = Math.log2(midiToHz(loMidi));
  const hiLog = Math.log2(midiToHz(hiMidi));

  const yOfHz = useCallback(
    (hz: number) =>
      BAND_TOP + (1 - clamp((Math.log2(Math.max(1, hz)) - loLog) / (hiLog - loLog), 0, 1)) * plotH,
    [loLog, hiLog, plotH],
  );
  const hzOfY = useCallback(
    (py: number) => Math.pow(2, hiLog - clamp((py - BAND_TOP) / plotH, 0, 1) * (hiLog - loLog)),
    [loLog, hiLog, plotH],
  );

  const noteAt = useCallback(
    (tMs: number) => notes.find((n) => tMs >= n.startMs && tMs <= n.endMs) ?? null,
    [notes],
  );

  const commit = useCallback(
    (nextNotes: AnalysisNote[], nextEvents?: AnalysisEvent[]) => {
      setPast((p) => [
        ...p.slice(-49),
        cloneSnapshot(notesRef.current, eventsRef.current, bandsRef.current, bandsCustomRef.current),
      ]);
      setFuture([]);
      const cleanEvents = sanitizeEvents(nextEvents ?? eventsRef.current, nextNotes);
      setNotes(nextNotes);
      setEvents(cleanEvents);
    },
    [],
  );

  const commitBands = useCallback((nextBands: WordBand[], custom: boolean) => {
    setPast((p) => [
      ...p.slice(-49),
      cloneSnapshot(notesRef.current, eventsRef.current, bandsRef.current, bandsCustomRef.current),
    ]);
    setFuture([]);
    setBands(nextBands);
    setBandsCustom(custom);
  }, []);

  const commitEvents = useCallback((nextEvents: AnalysisEvent[]) => {
    setPast((p) => [
      ...p.slice(-49),
      cloneSnapshot(notesRef.current, eventsRef.current, bandsRef.current, bandsCustomRef.current),
    ]);
    setFuture([]);
    setEvents(nextEvents);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [
        cloneSnapshot(notesRef.current, eventsRef.current, bandsRef.current, bandsCustomRef.current),
        ...f.slice(0, 49),
      ]);
      setNotes(prev.notes.map((n) => ({ ...n })));
      setEvents(prev.events.map((e) => ({ ...e })));
      setBands(prev.bands.map((b) => ({ ...b })));
      setBandsCustom(prev.bandsCustom);
      setSel(null);
      setSelBand(null);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [
        ...p.slice(-49),
        cloneSnapshot(notesRef.current, eventsRef.current, bandsRef.current, bandsCustomRef.current),
      ]);
      setNotes(next.notes.map((n) => ({ ...n })));
      setEvents(next.events.map((e) => ({ ...e })));
      setBands(next.bands.map((b) => ({ ...b })));
      setBandsCustom(next.bandsCustom);
      setSel(null);
      setSelBand(null);
      return f.slice(1);
    });
  }, []);

  const resetToSaved = useCallback(() => {
    if (!confirm("همه‌ی تغییرات ذخیره‌نشده دور ریخته شود؟")) return;
    setNotes((JSON.parse(savedRef.current.notesJson) as AnalysisNote[]).map((n) => ({ ...n })));
    setEvents((JSON.parse(savedRef.current.eventsJson) as AnalysisEvent[]).map((e) => ({ ...e })));
    setBands((JSON.parse(savedRef.current.bandsJson) as WordBand[]).map((b) => ({ ...b })));
    setBandsCustom(savedRef.current.bandsCustom);
    setText(savedRef.current.text);
    setPast([]);
    setFuture([]);
    setSel(null);
    setSelBand(null);
    setSelOrn(null);
    setErrors([]);
  }, []);

  // ---------- قابلیت جدید: استخراج هوشمند و تمیز تمام نت‌ها ----------
  const handleAutoDetectAllNotes = useCallback(() => {
    if (!pitch || pitch.length === 0) {
      toast.error("داده‌های صوتی قاری موجود نیست");
      return;
    }
    const cleanNotes = autoExtractCleanNotesFromPitch(pitch, durationMs, {
      minDurationMs: 80,
      semitoneTolerance: 0.65,
      snapToNote: true,
    });
    if (cleanNotes.length === 0) {
      toast.error("صدای نغمه‌ای معتبری در فراز یافت نشد");
      return;
    }
    commit(cleanNotes);
    setSel(null);
    setErrors([]);
    toast.success(`${toFaDigits(cleanNotes.length)} نت دقیق بر اساس صدای قاری استخراج و تراز شد ✨`);
  }, [pitch, durationMs, commit]);

  const errNoteIdx = useCallback((er: string): number | null => {
    const m = er.match(/نت شماره (\d+)/);
    return m ? Number(m[1]) - 1 : null;
  }, []);

  const gotoNote = useCallback(
    (idx: number) => {
      const n = notesRef.current[idx];
      if (!n) return;
      setSel(idx);
      setSelBand(null);
      setSelOrn(null);
      const cont = scrollRef.current;
      if (!cont) return;
      const px = xOf((n.startMs + n.endMs) / 2);
      const W = cont.scrollWidth;
      const C = cont.clientWidth;
      const max = Math.max(0, W - C);
      cont.scrollLeft = clamp(px + C / 2 - W, -max, 0);
    },
    [xOf],
  );

  const autoMergeTinyNotes = useCallback(() => {
    const cur = [...notesRef.current].sort((a, b) => a.startMs - b.startMs);
    const out: AnalysisNote[] = [];
    for (const n of cur) {
      const prev = out[out.length - 1];
      if (n.endMs - n.startMs < MIN_NOTE_MS_UI && prev) {
        const wa = prev.endMs - prev.startMs;
        const wb = Math.max(1, n.endMs - n.startMs);
        prev.medianHz =
          Math.round(Math.pow(2, (wa * Math.log2(prev.medianHz) + wb * Math.log2(n.medianHz)) / (wa + wb)) * 10) / 10;
        prev.endMs = n.endMs;
        prev.stability = Math.min(prev.stability, n.stability);
        continue;
      }
      out.push({ ...n });
    }
    for (let i = out.length - 1; i >= 0; i--) {
      const n = out[i];
      if (n.endMs - n.startMs < MIN_NOTE_MS_UI && i + 1 < out.length) {
        const nx = out[i + 1];
        const wa = nx.endMs - nx.startMs;
        const wb = Math.max(1, n.endMs - n.startMs);
        nx.medianHz =
          Math.round(Math.pow(2, (wa * Math.log2(nx.medianHz) + wb * Math.log2(n.medianHz)) / (wa + wb)) * 10) / 10;
        nx.startMs = n.startMs;
        nx.stability = Math.min(nx.stability, n.stability);
        out.splice(i, 1);
      }
    }
    commit(out);
    setSel(null);
    setErrors([]);
    toast.success("نت‌های خیلی کوتاه با همسایه ادغام شدند ✓ حالا دوباره «ذخیره» را بزنید");
  }, [commit]);

  const deleteNote = useCallback(
    (idx: number) => {
      const cur = notesRef.current;
      if (idx < 0 || idx >= cur.length) return;
      commit(cur.filter((_, i) => i !== idx));
      setSel(null);
    },
    [commit],
  );

  const deleteOrnament = useCallback(
    (idx: number) => {
      const evs = eventsRef.current;
      if (idx < 0 || idx >= evs.length || evs[idx].type !== "ornament") return;
      commitEvents(evs.filter((_, k) => k !== idx));
      setSelOrn(null);
      toast.message("کادر تحریر حذف شد");
    },
    [commitEvents],
  );

  const mergeNotes = useCallback(
    (idx: number, dir: "prev" | "next") => {
      const cur = [...notesRef.current];
      const j = dir === "prev" ? idx - 1 : idx + 1;
      if (idx < 0 || idx >= cur.length || j < 0 || j >= cur.length) return;
      const a = cur[Math.min(idx, j)];
      const b = cur[Math.max(idx, j)];
      const wa = a.endMs - a.startMs;
      const wb = b.endMs - b.startMs;
      const hz = Math.pow(2, (wa * Math.log2(a.medianHz) + wb * Math.log2(b.medianHz)) / (wa + wb));
      const merged: AnalysisNote = {
        startMs: a.startMs,
        endMs: b.endMs,
        medianHz: Math.round(hz * 10) / 10,
        stability: Math.min(a.stability, b.stability),
      };
      const next = cur.filter((_, k) => k !== idx && k !== j);
      next.splice(Math.min(idx, j), 0, merged);
      commit(next);
      setSel(Math.min(idx, j));
    },
    [commit],
  );

  const toggleOrnament = useCallback(() => {
    const s = selRef.current;
    const cur = notesRef.current;
    if (s === null || !cur[s]) return;
    const note = cur[s];
    const evs = eventsRef.current;
    const covering = evs.filter(
      (e) => e.type === "ornament" && Math.min(e.endMs, note.endMs) - Math.max(e.startMs, note.startMs) > 0,
    );
    if (covering.length > 0) {
      const removeSet = new Set(covering);
      commit(cur, evs.filter((e) => !removeSet.has(e)));
      toast.message("تحریر این نت خاموش شد");
    } else {
      commit(cur, [
        ...evs,
        { type: "ornament", startMs: note.startMs, endMs: note.endMs, confidence: 0.9 },
      ]);
      toast.message("این نت به‌عنوان تحریر علامت خورد ✨");
    }
  }, [commit]);

  const refitToPitch = useCallback(() => {
    const s = selRef.current;
    const cur = [...notesRef.current];
    if (s === null || !cur[s]) return;
    const hz = medianPitchHz(pitch, cur[s].startMs, cur[s].endMs);
    if (!hz) {
      toast.error("در این بازه، صدای قاری تشخیص داده نشده است");
      return;
    }
    const next = cur.map((n, i) => (i === s ? { ...n, medianHz: Math.round(hz * 10) / 10 } : n));
    commit(next);
    toast.message(`ارتفاع نت دوباره با صدای قاری تنظیم شد (${noteNameFa(hz)})`);
  }, [commit, pitch]);

  const splitOrAddAtPlayhead = useCallback(
    (atMs?: number) => {
      const t = atMs ?? playT;
      if (t === null || t === undefined) {
        toast.message("اول روی نمودار کلیک کنید تا محل توپ مشخص شود");
        return;
      }
      const cur = [...notesRef.current];
      const insideIdx = cur.findIndex((n) => t > n.startMs + 30 && t < n.endMs - 30);
      if (insideIdx >= 0) {
        const n = { ...cur[insideIdx] };
        const first: AnalysisNote = { startMs: n.startMs, endMs: Math.round(t), medianHz: n.medianHz, stability: n.stability };
        const second: AnalysisNote = { startMs: Math.round(t), endMs: n.endMs, medianHz: n.medianHz, stability: n.stability };
        cur.splice(insideIdx, 1, first, second);
        commit(cur);
        setSel(insideIdx + 1);
        toast.message("نت از محل توپ به دو قسمت تقسیم شد ✂️");
        return;
      }
      const sorted = [...cur].sort((a, b) => a.startMs - b.startMs);
      const overlap = sorted.find((n) => t >= n.startMs - 1 && t <= n.endMs + 1);
      if (overlap) {
        toast.message("توپ نزدیک لبه‌ی یک نت است — کمی دورتر کلیک کنید");
        return;
      }
      let start = 0;
      let end = durationMs;
      for (const n of sorted) {
        if (n.endMs <= t) start = Math.max(start, n.endMs);
        if (n.startMs >= t) end = Math.min(end, n.startMs);
      }
      if (end - start < 120) {
        toast.message("فاصله‌ی خالی برای ساخت نت کافی نیست");
        return;
      }
      const hzFromPitch = medianPitchHz(pitch, start, end);
      const newNote: AnalysisNote = {
        startMs: Math.round(start),
        endMs: Math.round(end),
        medianHz: hzFromPitch ?? sorted.reduce((a, n) => a + n.medianHz, 0) / Math.max(1, sorted.length),
        stability: 0.9,
      };
      const next = [...sorted];
      const insertAt = next.findIndex((n) => n.startMs >= newNote.startMs);
      next.splice(insertAt === -1 ? next.length : insertAt, 0, newNote);
      commit(next);
      setSel(insertAt === -1 ? next.length - 1 : insertAt);
      toast.message(`نت جدید ساخته شد (${noteNameFa(newNote.medianHz)}) 🎵`);
    },
    [commit, durationMs, playT, pitch],
  );

  const pxFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, shift: e.shiftKey };
  }, []);

  const beginDrag = useCallback(
    (mode: DragState["mode"], idx: number) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = pxFromEvent(e);
      dragRef.current = {
        mode,
        idx,
        pre: cloneSnapshot(notesRef.current, eventsRef.current, bandsRef.current, bandsCustomRef.current),
        grabT: pos ? Math.round(tOfX(pos.x)) : undefined,
      };
      setDragging(true);
      if (mode.startsWith("band")) {
        setSelBand(idx);
        setSel(null);
        setSelOrn(null);
      } else if (mode.startsWith("orn")) {
        setSelOrn(idx);
        setSel(null);
        setSelBand(null);
      } else {
        setSel(idx);
        setSelBand(null);
        setSelOrn(null);
      }
    },
    [pxFromEvent, tOfX],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pos = pxFromEvent(e);
      if (!pos) return;
      const cur = notesRef.current;
      const idx = d.idx;
      const isNoteMode = d.mode === "move" || d.mode === "start" || d.mode === "end";
      if (isNoteMode && (idx < 0 || idx >= cur.length)) return;

      if (d.mode === "move") {
        let hz = hzOfY(pos.y);
        if (!pos.shift) hz = snapToSemitone(hz);
        setNotes(cur.map((n, i) => (i === idx ? { ...n, medianHz: Math.round(hz * 10) / 10 } : n)));
      } else if (d.mode === "band-move") {
        const bs = bandsRef.current;
        const orig = d.pre.bands[d.idx];
        if (d.idx < 0 || d.idx >= bs.length || !orig || d.grabT === undefined) return;
        const shift = Math.round(tOfX(pos.x) - d.grabT);
        const len = orig.endMs - orig.startMs;
        const newStart = Math.round(clamp(orig.startMs + shift, 0, Math.max(0, durationMs - len)));
        setBands(
          bs.map((b, i) => (i === d.idx ? { ...b, startMs: newStart, endMs: newStart + len } : b)),
        );
        setBandsCustom(true);
      } else if (d.mode === "band-start") {
        const bs = bandsRef.current;
        const b = bs[d.idx];
        if (!b || d.idx < 0 || d.idx >= bs.length) return;
        const t = Math.round(clamp(tOfX(pos.x), 0, b.endMs - 100));
        setBands(bs.map((x, i) => (i === d.idx ? { ...x, startMs: t } : x)));
        setBandsCustom(true);
      } else if (d.mode === "band-end") {
        const bs = bandsRef.current;
        const b = bs[d.idx];
        if (!b || d.idx < 0 || d.idx >= bs.length) return;
        const t = Math.round(clamp(tOfX(pos.x), b.startMs + 100, durationMs));
        setBands(bs.map((x, i) => (i === d.idx ? { ...x, endMs: t } : x)));
        setBandsCustom(true);
      } else if (d.mode === "orn" || d.mode === "orn-start" || d.mode === "orn-end") {
        const evs = eventsRef.current;
        const ev = evs[d.idx];
        if (!ev || ev.type !== "ornament") return;
        const t = Math.round(tOfX(pos.x));
        if (d.mode === "orn") {
          const orig = d.pre.events[d.idx];
          if (!orig || d.grabT === undefined) return;
          const olen = orig.endMs - orig.startMs;
          const ns = Math.round(clamp(orig.startMs + (t - d.grabT), 0, Math.max(0, durationMs - olen)));
          setEvents(evs.map((e, k) => (k === d.idx ? { ...e, startMs: ns, endMs: ns + olen } : e)));
        } else if (d.mode === "orn-start") {
          const ns = Math.round(clamp(t, 0, ev.endMs - 100));
          setEvents(evs.map((e, k) => (k === d.idx ? { ...e, startMs: ns } : e)));
        } else {
          const ne = Math.round(clamp(t, ev.startMs + 100, durationMs));
          setEvents(evs.map((e, k) => (k === d.idx ? { ...e, endMs: ne } : e)));
        }
      } else {
        const t = Math.round(tOfX(pos.x));
        setNotes(
          cur.map((n, i) => {
            if (i !== idx) return n;
            if (d.mode === "start") {
              const minStart = i > 0 ? cur[i - 1].endMs + 20 : 0;
              const start = clamp(t, minStart, n.endMs - 60);
              return { ...n, startMs: start };
            }
            const maxEnd = i < cur.length - 1 ? cur[i + 1].startMs - 20 : durationMs;
            const end = clamp(t, n.startMs + 60, maxEnd);
            return { ...n, endMs: end };
          }),
        );
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setDragging(false);
      const changed =
        JSON.stringify(d.pre.notes) !== JSON.stringify(notesRef.current) ||
        JSON.stringify(d.pre.bands) !== JSON.stringify(bandsRef.current) ||
        JSON.stringify(d.pre.events) !== JSON.stringify(eventsRef.current);
      if (!changed) return;
      setPast((p) => [...p.slice(-49), d.pre]);
      setFuture([]);
      setEvents((evs) => sanitizeEvents(evs, notesRef.current));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pxFromEvent, hzOfY, tOfX, durationMs]);

  const seekAtEvent = useCallback(
    (e: React.MouseEvent) => {
      const pos = pxFromEvent(e);
      if (!pos) return;
      const t = Math.round(tOfX(pos.x));
      setPlayT(t);
      setSelBand(null);
      setSelOrn(null);
      const a = audioRef.current;
      if (a) a.currentTime = t / 1000;
    },
    [pxFromEvent, tOfX],
  );

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) {
      toast.error("صوت هنوز آماده نشده است");
      return;
    }
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    if (playT !== null) a.currentTime = playT / 1000;
    setLoopSel(false);
    void a.play();
    setPlaying(true);
  }, [playing, playT]);

  const stopAll = useCallback(() => {
    const a = audioRef.current;
    if (a) a.pause();
    setPlaying(false);
    setLoopSel(false);
    setPlayT(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }, []);

  const playNoteLoop = useCallback(() => {
    const s = selRef.current;
    const cur = notesRef.current;
    const a = audioRef.current;
    if (s === null || !cur[s] || !a) return;
    setPlayT(cur[s].startMs);
    a.currentTime = cur[s].startMs / 1000;
    setLoopSel(true);
    void a.play();
    setPlaying(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.tagName === "BUTTON" ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.code === "Space" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        togglePlay();
        return;
      }
      const s = selRef.current;
      if (s === null) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteNote(s);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cur = notesRef.current;
        if (!cur[s]) return;
        const dir = e.key === "ArrowUp" ? 1 : -1;
        const factor = e.shiftKey ? Math.pow(2, (dir * 25) / 1200) : Math.pow(2, dir / 12);
        const next = cur.map((n, i) =>
          i === s ? { ...n, medianHz: Math.round(n.medianHz * factor * 10) / 10 } : n,
        );
        commit(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteNote, commit, togglePlay]);

  useEffect(() => {
    if (!playing || !follow || playT === null) return;
    const cont = scrollRef.current;
    if (!cont) return;
    const px = xOf(playT);
    const W = cont.scrollWidth;
    const C = cont.clientWidth;
    const max = Math.max(0, W - C);
    const desired = clamp(px + C / 2 - W, -max, 0);
    if (Math.abs(cont.scrollLeft - desired) > 40) cont.scrollLeft = desired;
  }, [playT, playing, follow, xOf]);

  const save = useCallback(async () => {
    const v = validateNotes(notesRef.current, durationMs);
    if (!v.ok) {
      setErrors(v.errors);
      toast.error("قبل از ذخیره، خطاهای قرمز رنگ را برطرف کنید");
      return;
    }
    const curBands =
      text.trim().length > 0 ? bandsRef.current.map((b) => ({ ...b })) : [];
    const bv = validateWordBands(curBands);
    if (!bv.ok) {
      setErrors(bv.errors);
      toast.error("نوارهای کلمات مشکل دارند — خطاها را برطرف کنید");
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const curNotes = notesRef.current.map((n) => ({ ...n }));
      const curEvents = eventsRef.current.map((e) => ({ ...e }));
      const tunnel = rebuildTunnelFromNotes({
        pitch,
        energy: energyArr,
        notes: curNotes,
        events: curEvents,
        hopMs,
        durationMs,
        originalPoints: originalTunnelPoints,
      });
      const ornCount = curEvents.filter((e) => e.type === "ornament").length;
      await saveNoteEdits({
        versionId: version.id,
        notes: curNotes,
        events: curEvents,
        tunnel,
        originalSnapshot: hasSnapshot
          ? null
          : { notes: initialNotes, events: initialEvents },
        quranText: textDirty ? text.trim() : null,
        wordBands: curBands,
        editSummary: `${curNotes.length} نت، ${ornCount} تحریر${curBands.length > 0 ? `، ${curBands.length} کلمه` : ""} — ویرایش دستی در نت‌نگار`,
      });
      savedRef.current = {
        notesJson: JSON.stringify(notesRef.current),
        eventsJson: JSON.stringify(eventsRef.current),
        bandsJson: JSON.stringify(bandsRef.current),
        bandsCustom: bandsCustomRef.current,
        text,
      };
      setPast([]);
      setFuture([]);
      toast.success(
        curBands.length > 0
          ? "نت‌ها + تقسیم کلمات ذخیره شد ✓ نوارهای زرد حالا وارد بازی قرآن‌آموز هم شد"
          : "نت‌های تصحیح‌شده ذخیره شد ✓ بازی قرآن‌آموزان هم به‌روز شد",
      );
      onSaved?.();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e !== null && typeof e === "object" && "message" in e && (e as { message?: unknown }).message
            ? String((e as { message: unknown }).message)
            : String(e);
      toast.error(`ذخیره ناموفق بود: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [
    durationMs,
    pitch,
    energyArr,
    hopMs,
    originalTunnelPoints,
    version.id,
    hasSnapshot,
    initialNotes,
    initialEvents,
    textDirty,
    text,
    onSaved,
  ]);

  const visibleBands = useMemo(() => (showBands ? bands : []), [showBands, bands]);
  const playingBandIdx = useMemo(
    () => (playT !== null ? bands.findIndex((b) => playT >= b.startMs && playT < b.endMs) : -1),
    [bands, playT],
  );
  const ornamentCount = useMemo(() => events.filter((e) => e.type === "ornament").length, [events]);
  const breathCount = useMemo(() => events.filter((e) => e.type === "breath").length, [events]);
  const silenceEvents = useMemo(() => events.filter((e) => e.type === "silence"), [events]);

  const selNote = sel !== null && sel < notes.length ? notes[sel] : null;
  const selHasOrnament = useMemo(() => {
    if (!selNote) return false;
    return events.some(
      (e) =>
        e.type === "ornament" &&
        Math.min(e.endMs, selNote.endMs) - Math.max(e.startMs, selNote.startMs) > 0,
    );
  }, [events, selNote]);

  const stepPath = useMemo(() => {
    if (notes.length === 0) return "";
    const parts: string[] = [];
    for (const n of [...notes].sort((a, b) => a.startMs - b.startMs)) {
      const y = yOfHz(n.medianHz);
      const xr = xOf(n.startMs);
      const xl = xOf(n.endMs);
      if (parts.length === 0) parts.push(`M ${xr} ${y}`);
      else parts.push(`L ${xr} ${y}`);
      parts.push(`L ${xl} ${y}`);
    }
    return parts.join(" ");
  }, [notes, xOf, yOfHz]);

  const pitchPath = useMemo(() => {
    if (pitch.length === 0) return "";
    const stride = Math.max(1, Math.ceil(pitch.length / 1400));
    const parts: string[] = [];
    for (let i = 0; i < pitch.length; i += stride) {
      const p = pitch[i];
      const x = xOf(p.t);
      const y = yOfHz(p.hz);
      parts.push(`${parts.length === 0 ? "M" : "L"} ${x} ${y}`);
    }
    return parts.join(" ");
  }, [pitch, xOf, yOfHz]);

  const labelStep = useMemo(() => {
    const total = hiMidi - loMidi + 1;
    return total <= 10 ? 1 : total <= 18 ? 2 : 3;
  }, [loMidi, hiMidi]);

  const gridLines = useMemo(() => {
    const out: Array<{ midi: number; y: number; name: string; labeled: boolean }> = [];
    let k = 0;
    for (let m = loMidi; m <= hiMidi; m++, k++) {
      out.push({
        midi: m,
        y: yOfHz(midiToHz(m)),
        name: NOTE_NAMES_FA[((m % 12) + 12) % 12],
        labeled: k % labelStep === 0,
      });
    }
    return out;
  }, [loMidi, hiMidi, yOfHz, labelStep]);

  const timeTicks = useMemo(() => {
    const sec = durationMs / 1000;
    const step = sec > 120 ? 10 : sec > 40 ? 5 : 1;
    const out: number[] = [];
    for (let t = 0; t <= sec; t += step) out.push(t);
    return out;
  }, [durationMs]);

  const ball = useMemo(() => {
    if (playT === null) return null;
    const n = noteAt(playT);
    const lst = [...notes].sort((a, b) => a.startMs - b.startMs);
    let hz = n?.medianHz;
    if (!hz && lst.length > 0) {
      let best = lst[0];
      let bd = Infinity;
      for (const cand of lst) {
        const d = Math.min(Math.abs(playT - cand.startMs), Math.abs(playT - cand.endMs));
        if (d < bd) {
          bd = d;
          best = cand;
        }
      }
      hz = best.medianHz;
    }
    return { x: xOf(playT), y: hz ? yOfHz(hz) : BAND_TOP + plotH / 2 };
  }, [playT, noteAt, notes, xOf, yOfHz, plotH]);

  if (pitch.length === 0 || initialNotes.length === 0) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 flex items-center gap-2">
        <CircleAlert className="h-4 w-4 shrink-0" />
        برای ویرایش نت‌ها ابتدا باید «تحلیل خودکار صدا» روی این نسخه اجرا شده باشد.
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-1.5" dir="rtl">
        {/* سربرگ فشرده: آمار + وضعیت ذخیره */}
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="h-5 px-1.5 text-[11px]">{toFaDigits(notes.length)} نت</Badge>
          <Badge variant="outline" className="h-5 px-1.5 text-[11px]">✦ {toFaDigits(ornamentCount)} تحریر</Badge>
          <Badge variant="outline" className="h-5 px-1.5 text-[11px]">☁ {toFaDigits(breathCount)} تنفس</Badge>
          <Badge variant="outline" className="h-5 px-1.5 text-[11px]">مدت {formatTimeFa(durationMs)}</Badge>
          <span className="mr-auto text-[11px] font-medium">
            {dirty ? (
              <span className="text-amber-600">● تغییرات ذخیره‌نشده</span>
            ) : (
              <span className="text-emerald-600">✓ همه‌چیز ذخیره شده است</span>
            )}
          </span>
        </div>

        {/* نوار ابزار اصلی */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-muted/40 p-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={togglePlay}
            className="h-7 gap-1 px-2 text-xs"
            title="پخش از محل توپ / مکث — کلید Space"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "مکث" : "پخش"}
          </Button>
          <Button size="sm" variant="ghost" onClick={stopAll} className="h-7 gap-1 px-1.5 text-xs" title="توقف کامل">
            <Square className="h-3 w-3" />
          </Button>

          {/* سرعت پخش صوت قاری */}
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title="سرعت پخش صوت قاری">
            <Gauge className="h-3.5 w-3.5" />
            <select
              value={String(rate)}
              onChange={(e) => setRate(Number(e.target.value))}
              dir="ltr"
              className="h-7 rounded-md border bg-background px-1 text-[11px]"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </span>

          <span className="mx-0.5 h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" onClick={undo} disabled={past.length === 0} className="h-7 px-1.5" title="برگردانی (Ctrl+Z)">
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={redo} disabled={future.length === 0} className="h-7 px-1.5" title="بازانجام (Ctrl+Shift+Z)">
            <Redo2 className="h-3.5 w-3.5" />
          </Button>

          <span className="mx-0.5 h-5 w-px bg-border" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoomIdx((z) => Math.min(ZOOM_MULTS.length - 1, z + 1))}
            disabled={zoomInBlocked}
            className="h-7 px-1.5"
            title="بزرگ‌نمایی"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
            disabled={zoomIdx <= 0}
            className="h-7 px-1.5"
            title="کوچک‌نمایی"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] text-muted-foreground" dir="ltr">
            {zoomIdx === 1 ? "جا شده" : `×${ZOOM_MULTS[zoomIdx]}`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoomIdx(1)}
            disabled={zoomIdx === 1}
            className="h-7 px-1.5 text-[11px]"
            title="برگشت به حالت «جا شدن کل فراز» در صفحه"
          >
            جا شود
          </Button>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none" title="اسکرول خودکار دنبال توپ هنگام پخش">
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => setFollow(e.target.checked)}
              className="h-3 w-3 accent-emerald-600"
            />
            دنبال توپ
          </label>

          <span className="mx-0.5 h-5 w-px bg-border" />

          {/* دکمه جادویی استخراج مجدد هوشمند نت‌ها */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoDetectAllNotes}
            className="h-7 gap-1 px-2 text-xs border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 shadow-sm"
            title="استخراج خودکار و تراز هوشمند تمام نت‌ها بر مبنای خط‌چین صدای قاری"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            استخراج هوشمند نت‌ها
          </Button>

          <Button size="sm" variant="ghost" onClick={() => splitOrAddAtPlayhead()} className="h-7 gap-1 px-1.5 text-xs" title="تقسیم نت در محل توپ، یا ساخت نت جدید">
            <Plus className="h-3.5 w-3.5" /> تقسیم/افزودن
          </Button>

          <span className="mr-auto flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={resetToSaved} disabled={!dirty} className="h-7 gap-1 px-2 text-xs" title="برگشت به آخرین ذخیره">
              <RotateCcw className="h-3 w-3" /> بازنشانی
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving} className="h-7 gap-1 px-2.5 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "در حال ذخیره..." : "ذخیره"}
            </Button>
          </span>
        </div>

        {/* خطاهای اعتبارسنجی */}
        {errors.length > 0 && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs text-red-800 space-y-1.5">
            <div className="font-bold flex items-center gap-1">
              <CircleAlert className="h-4 w-4" /> قبل از ذخیره این موارد را اصلاح کنید:
            </div>
            <ul className="space-y-1">
              {errors.slice(0, 8).map((er, i) => {
                const ni = errNoteIdx(er);
                return (
                  <li key={i} className="flex items-center gap-2 flex-wrap">
                    <span>{er}</span>
                    {ni !== null && (
                      <button
                        type="button"
                        onClick={() => gotoNote(ni)}
                        className="rounded-md bg-sky-100 px-1.5 py-0.5 font-bold text-sky-800 hover:bg-sky-200"
                      >
                        نمایش روی نمودار ↖
                      </button>
                    )}
                  </li>
                );
              })}
              {errors.length > 8 && <li>و {toFaDigits(errors.length - 8)} مورد دیگر...</li>}
            </ul>
            {errors.some((er) => er.includes("خیلی کوتاه")) && (
              <Button size="sm" variant="outline" className="h-7 gap-1 bg-white px-2 text-xs" onClick={autoMergeTinyNotes}>
                <Merge className="h-3 w-3" /> رفع خودکار: ادغام نت‌های خیلی کوتاه با همسایه
              </Button>
            )}
          </div>
        )}

        {/* جعبه‌ی متن فراز */}
        <div className="rounded-xl border bg-muted/30 p-1.5 space-y-1">
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <Label className="text-xs font-medium">متن فراز (برای نوارهای زرد کلمات — اختیاری)</Label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {text.trim().length > 0 && (
                <Badge
                  variant="outline"
                  className={`h-5 px-1.5 text-[11px] ${bandsCustom ? "border-amber-400 bg-amber-50 text-amber-700" : "text-muted-foreground"}`}
                >
                  {bandsCustom ? `تقسیم دستی ✏️ (${toFaDigits(bands.length)} کلمه)` : `تقسیم مساوی (${toFaDigits(bands.length)} کلمه)`}
                </Badge>
              )}
              {text.trim().length > 0 && bandsCustom && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px] gap-1"
                  title="همه‌ی مرزها دوباره به‌طور مساوی تقسیم می‌شوند"
                  onClick={() => commitBands(distributeWordBands(text, notesRef.current, durationMs), false)}
                >
                  <RotateCcw className="h-3 w-3" /> تقسیم مساوی
                </Button>
              )}
              {passageTextHint && text.trim() !== passageTextHint && (
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setText(passageTextHint)}>
                  پرکردن از توضیحات فراز
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] gap-1" onClick={() => setShowBands((v) => !v)}>
                {showBands ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showBands ? "پنهان نوارها" : "نمایش نوارها"}
              </Button>
            </div>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            placeholder="مثلاً: وَلَقَدْ خَلَقْنَا السَّمَاوَاتِ وَالْأَرْضَ ... (کلمات با فاصله جدا شوند)"
            className="resize-none text-base leading-7 py-1.5"
            style={{ fontFamily: "inherit" }}
          />
        </div>

        {/* نمودار نت‌نگار */}
        <div
          ref={scrollRef}
          className="rounded-xl border bg-white overflow-x-auto shadow-sm"
          style={{ direction: "rtl" }}
        >
          <svg
            ref={svgRef}
            width={svgW}
            height={CHART_H}
            style={{ display: "block", cursor: dragging ? "grabbing" : "default", userSelect: "none" }}
            onMouseDown={seekAtEvent}
            onDoubleClick={(e) => {
              const pos = pxFromEvent(e);
              if (pos) splitOrAddAtPlayhead(tOfX(pos.x));
            }}
          >
            {/* بستر سفید */}
            <rect x={M_L} y={BAND_TOP} width={plotW} height={plotH} fill="#ffffff" />

            {/* نوارهای زرد کلمات */}
            {visibleBands.map((b, i) => {
              const xr = xOf(b.startMs);
              const xl = xOf(b.endMs);
              return (
                <g key={`band-${i}`}>
                  <rect
                    x={xl}
                    y={BAND_TOP}
                    width={Math.max(1, xr - xl - 2)}
                    height={plotH}
                    fill={COLOR_BAND}
                    opacity={i % 2 === 0 ? 0.5 : 0.26}
                    stroke={COLOR_BAND_EDGE}
                    strokeWidth={0.5}
                    rx={2}
                  />
                </g>
              );
            })}

            {/* هایلایت نوار کلمه‌ی انتخاب‌شده */}
            {selBand !== null && visibleBands[selBand] && (
              <rect
                x={xOf(visibleBands[selBand].endMs)}
                y={BAND_TOP}
                width={Math.max(1, xOf(visibleBands[selBand].startMs) - xOf(visibleBands[selBand].endMs) - 2)}
                height={plotH}
                fill="none"
                stroke={COLOR_SEL}
                strokeWidth={1.6}
                strokeDasharray="5 3"
                rx={2}
                pointerEvents="none"
              />
            )}

            {/* خطوط شبکه‌ی نت‌ها */}
            {gridLines.map((g) => (
              <g key={`grid-${g.midi}`}>
                <line
                  x1={M_L}
                  x2={M_L + plotW}
                  y1={g.y}
                  y2={g.y}
                  stroke={g.labeled ? "#cbd5e1" : "#f1f5f9"}
                  strokeWidth={g.labeled ? 1 : 0.6}
                />
              </g>
            ))}

            {/* تیک‌های زمانی */}
            {timeTicks.map((t) => (
              <line
                key={`tt-${t}`}
                x1={xOf(t * 1000)}
                x2={xOf(t * 1000)}
                y1={BAND_TOP}
                y2={BAND_TOP + plotH}
                stroke="#f1f5f9"
                strokeWidth={1}
              />
            ))}

            {/* رویدادهای سکوت */}
            {silenceEvents.map((ev, i) => (
              <rect
                key={`sil-${i}`}
                x={xOf(ev.endMs)}
                y={BAND_TOP}
                width={Math.max(2, xOf(ev.startMs) - xOf(ev.endMs))}
                height={plotH}
                fill="#94a3b8"
                opacity={0.14}
              />
            ))}

            {/* منحنی دقیق ملودی قاری (خاکستری‌چین) */}
            {pitchPath && (
              <path d={pitchPath} fill="none" stroke={COLOR_PITCH} strokeWidth={1.4} strokeDasharray="4 3" opacity={0.75} />
            )}

            {/* کادرهای تحریر */}
            {events.map((ev, i) => {
              if (ev.type !== "ornament") return null;
              const xr = xOf(ev.startMs);
              const xl = xOf(ev.endMs);
              const y = BAND_TOP + plotH - 15;
              const selected = i === selOrn;
              return (
                <g key={`orn-${i}`}>
                  <rect
                    x={xl}
                    y={y}
                    width={Math.max(10, xr - xl)}
                    height={10}
                    rx={5}
                    fill={COLOR_ORNAMENT}
                    opacity={selected ? 0.95 : 0.55}
                    stroke={selected ? "#92400e" : "none"}
                    strokeWidth={1.5}
                    style={{ cursor: "grab" }}
                    onMouseDown={beginDrag("orn", i)}
                  />
                  <text
                    x={(xr + xl) / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill={COLOR_ORNAMENT}
                    pointerEvents="none"
                  >
                    ✦ تحریر
                  </text>
                  {selected && (
                    <>
                      <circle
                        cx={xr}
                        cy={y + 5}
                        r={5.5}
                        fill="#ffffff"
                        stroke="#92400e"
                        strokeWidth={2}
                        style={{ cursor: "ew-resize" }}
                        onMouseDown={beginDrag("orn-start", i)}
                      />
                      <circle
                        cx={xl}
                        cy={y + 5}
                        r={5.5}
                        fill="#ffffff"
                        stroke="#92400e"
                        strokeWidth={2}
                        style={{ cursor: "ew-resize" }}
                        onMouseDown={beginDrag("orn-end", i)}
                      />
                    </>
                  )}
                </g>
              );
            })}

            {/* خط پلکانی نت‌ها */}
            <path d={stepPath} fill="none" stroke={COLOR_STEP} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />

            {/* ناحیه‌ی انتخاب‌شده */}
            {selNote && (
              <rect
                x={xOf(selNote.endMs)}
                y={BAND_TOP}
                width={Math.max(2, xOf(selNote.startMs) - xOf(selNote.endMs))}
                height={plotH}
                fill={COLOR_SEL}
                opacity={0.13}
                pointerEvents="none"
              />
            )}

            {/* هایلایت خط پله‌ی انتخاب‌شده */}
            {selNote && (
              <line
                x1={xOf(selNote.startMs)}
                x2={xOf(selNote.endMs)}
                y1={yOfHz(selNote.medianHz)}
                y2={yOfHz(selNote.medianHz)}
                stroke={COLOR_SEL}
                strokeWidth={6}
                opacity={0.75}
                strokeLinecap="round"
                pointerEvents="none"
              />
            )}

            {/* دایره‌های تنفس */}
            {events
              .filter((e) => e.type === "breath")
              .map((ev, i) => {
                const mid = (ev.startMs + ev.endMs) / 2;
                const n = noteAt(mid);
                const cy = n ? yOfHz(n.medianHz) - 16 : BAND_TOP + 22;
                return (
                  <g key={`br-${i}`} pointerEvents="none">
                    <circle cx={xOf(mid)} cy={cy} r={10} fill={COLOR_BREATH} stroke="#e2a400" strokeWidth={1.4} />
                    <path
                      d={`M ${xOf(mid) + 4} ${cy} L ${xOf(mid) - 3.5} ${cy - 4} L ${xOf(mid) - 3.5} ${cy + 4} Z`}
                      fill={COLOR_BREATH_ARROW}
                    />
                  </g>
                );
              })}

            {/* لایه‌های تعاملی و نام هر نت روی پله‌ها */}
            {notes.map((n, i) => {
              const xr = xOf(n.startMs);
              const xl = xOf(n.endMs);
              const y = yOfHz(n.medianHz);
              const selected = i === sel;
              const noteWidth = Math.max(6, xr - xl);
              const name = noteNameFa(n.medianHz);

              return (
                <g key={`note-${i}`}>
                  {/* کادر ملایم پشت هر نت برای تشخیص چشم‌گیر محدوده نت */}
                  <rect
                    x={xl}
                    y={y - 11}
                    width={noteWidth}
                    height={22}
                    rx={3}
                    fill={selected ? COLOR_SEL : "#3b82f6"}
                    opacity={selected ? 0.22 : 0.08}
                    pointerEvents="none"
                  />
                  {/* نام نت روی خود پله (اگر عرض نت کافی باشد) */}
                  {noteWidth >= 26 && (
                    <text
                      x={(xr + xl) / 2}
                      y={y - 4}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill={selected ? "#0369a1" : "#1e3a8a"}
                      pointerEvents="none"
                    >
                      {name}
                    </text>
                  )}
                  {/* ناحیه‌ی درگ با ماوس */}
                  <rect
                    x={xl}
                    y={y - 16}
                    width={noteWidth}
                    height={32}
                    fill="transparent"
                    style={{ cursor: "ns-resize" }}
                    onMouseDown={beginDrag("move", i)}
                  />
                  {/* دستگیره‌های لبه */}
                  {selected && (
                    <>
                      <circle cx={xr} cy={y} r={6.5} fill="#ffffff" stroke="#0369a1" strokeWidth={2.2} style={{ cursor: "ew-resize" }} onMouseDown={beginDrag("start", i)} />
                      <circle cx={xl} cy={y} r={6.5} fill="#ffffff" stroke="#0369a1" strokeWidth={2.2} style={{ cursor: "ew-resize" }} onMouseDown={beginDrag("end", i)} />
                    </>
                  )}
                </g>
              );
            })}

            {/* لایه‌ی تعاملی نوارهای کلمات */}
            {visibleBands.map((b, i) => {
              const xr = xOf(b.startMs);
              const xl = xOf(b.endMs);
              return (
                <g key={`bandhit-${i}`}>
                  <rect
                    x={xl + 6}
                    y={BAND_TOP}
                    width={Math.max(4, xr - xl - 12)}
                    height={40}
                    fill="transparent"
                    style={{ cursor: "grab" }}
                    onMouseDown={beginDrag("band-move", i)}
                  />
                  <rect x={xr - 4} y={BAND_TOP + 12} width={3} height={16} rx={1.5} fill="#d97706" opacity={0.8} pointerEvents="none" />
                  <rect x={xl + 1} y={BAND_TOP + 12} width={3} height={16} rx={1.5} fill="#d97706" opacity={0.8} pointerEvents="none" />
                  <rect
                    x={xr - 10}
                    y={BAND_TOP}
                    width={12}
                    height={40}
                    fill="transparent"
                    style={{ cursor: "ew-resize" }}
                    onMouseDown={beginDrag("band-start", i)}
                  />
                  <rect
                    x={xl - 2}
                    y={BAND_TOP}
                    width={12}
                    height={40}
                    fill="transparent"
                    style={{ cursor: "ew-resize" }}
                    onMouseDown={beginDrag("band-end", i)}
                  />
                </g>
              );
            })}

            {/* برچسب نام نت هنگام درگ */}
            {dragging && selNote && sel !== null && (
              <g pointerEvents="none">
                <rect
                  x={(xOf(selNote.startMs) + xOf(selNote.endMs)) / 2 - 64}
                  y={yOfHz(selNote.medianHz) - 40}
                  width={128}
                  height={22}
                  rx={6}
                  fill="#0f172a"
                  opacity={0.88}
                />
                <text
                  x={(xOf(selNote.startMs) + xOf(selNote.endMs)) / 2}
                  y={yOfHz(selNote.medianHz) - 25}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill="#ffffff"
                >
                  {`${noteNameFa(selNote.medianHz)} — ${toFaDigits(Math.round(selNote.medianHz))} Hz`}
                </text>
              </g>
            )}

            {/* توپ طلایی متحرک */}
            {ball && (
              <g pointerEvents="none">
                <line
                  x1={ball.x}
                  x2={ball.x}
                  y1={BAND_TOP}
                  y2={BAND_TOP + plotH}
                  stroke={COLOR_BALL}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  opacity={0.55}
                />
                <circle cx={ball.x} cy={ball.y} r={14} fill={COLOR_BALL} opacity={0.22} />
                <circle cx={ball.x} cy={ball.y} r={8.5} fill="#fcd34d" stroke={COLOR_BALL} strokeWidth={2} />
              </g>
            )}

            {/* متن کلمات با تطویل عربی */}
            {visibleBands.map((b, i) => {
              const xr = xOf(b.startMs);
              const xl = xOf(b.endMs);
              const xm = (xr + xl) / 2;
              const pxW = Math.max(1, xr - xl - 8);
              const natural = b.word.length * 9.6;
              const tatCount =
                pxW > natural + 14 ? Math.min(40, Math.max(0, Math.round((pxW - natural) / 8))) : 0;
              const dispWord = tatCount > 0 ? stretchWithTatweel(b.word, tatCount) : b.word;
              const estW = natural + tatCount * 8;
              const isPlayingWord = i === playingBandIdx;
              return (
                <g key={`word-${i}`} pointerEvents="none">
                  {isPlayingWord && (
                    <rect
                      x={xm - estW / 2 - 8}
                      y={WORD_TEXT_Y - 13}
                      width={estW + 16}
                      height={18}
                      rx={7}
                      fill="#86efac"
                      opacity={0.85}
                    />
                  )}
                  <text
                    x={xm}
                    y={WORD_TEXT_Y}
                    textAnchor="middle"
                    fontSize={14}
                    fontWeight={isPlayingWord ? 800 : tatCount > 0 ? 600 : 400}
                    fill={isPlayingWord ? "#14532d" : "#334155"}
                    style={{ direction: "rtl" }}
                  >
                    {dispWord}
                  </text>
                </g>
              );
            })}

            {/* کادر دور ردیف کلمات */}
            {visibleBands.length > 0 && (
              <rect x={M_L} y={4} width={plotW} height={22} fill="none" stroke="#d6b25e" strokeWidth={1} rx={3} />
            )}

            {/* محور زمان (پایین) */}
            <line x1={M_L} x2={M_L + plotW} y1={BAND_TOP + plotH} y2={BAND_TOP + plotH} stroke="#3b82f6" strokeWidth={1.6} />
            {timeTicks.map((t) => (
              <g key={`tl-${t}`}>
                <line
                  x1={xOf(t * 1000)}
                  x2={xOf(t * 1000)}
                  y1={BAND_TOP + plotH}
                  y2={BAND_TOP + plotH + 6}
                  stroke="#3b82f6"
                  strokeWidth={1.2}
                />
                <text x={xOf(t * 1000)} y={BAND_TOP + plotH + 17} textAnchor="middle" fontSize={10.5} fill="#475569">
                  {toFaDigits(t)}
                </text>
              </g>
            ))}
            <text x={M_L + 16} y={BAND_TOP + plotH + 33} fontSize={11.5} fontWeight={700} fill="#1d4ed8">
              زمان
            </text>

            {/* محور نت‌ها (راست) */}
            <line
              x1={M_L + plotW}
              x2={M_L + plotW}
              y1={BAND_TOP}
              y2={BAND_TOP + plotH}
              stroke="#3b82f6"
              strokeWidth={1.6}
            />
            {gridLines
              .filter((g) => g.labeled)
              .map((g) => (
                <g key={`yl-${g.midi}`}>
                  <line
                    x1={M_L + plotW}
                    x2={M_L + plotW + 5}
                    y1={g.y}
                    y2={g.y}
                    stroke="#3b82f6"
                    strokeWidth={1}
                    opacity={0.5}
                  />
                  <text x={M_L + plotW + 8} y={g.y + 3.5} fontSize={10.5} fill="#475569">
                    {g.name}
                  </text>
                </g>
              ))}
            <text x={M_L + plotW + 8} y={BAND_TOP - 6} fontSize={11.5} fontWeight={700} fill="#1d4ed8">
              نت‌ها
            </text>
          </svg>
        </div>

        {/* اطلاعات کلمه‌ی انتخاب‌شده */}
        {selBand !== null && visibleBands[selBand] && !selNote && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs">
            <Badge className="bg-amber-500 text-amber-950">کلمه‌ی «{visibleBands[selBand].word}»</Badge>
            <span className="text-amber-900">
              از {formatTimeFa(visibleBands[selBand].startMs)} تا {formatTimeFa(visibleBands[selBand].endMs)}
            </span>
          </div>
        )}

        {/* نوار ابزار کادر تحریر */}
        {selOrn !== null && events[selOrn] && events[selOrn].type === "ornament" && !selNote && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs">
            <Badge className="bg-orange-500 text-white">✦ تحریر</Badge>
            <span className="text-amber-900">
              از {formatTimeFa(events[selOrn].startMs)} تا {formatTimeFa(events[selOrn].endMs)}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="mr-auto h-7 gap-1 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => deleteOrnament(selOrn)}
            >
              <Trash2 className="h-3 w-3" /> حذف تحریر
            </Button>
          </div>
        )}

        {/* نوار ابزار نت انتخاب‌شده */}
        {selNote && sel !== null ? (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 p-1.5">
            <Badge className="bg-sky-600">
              نت {toFaDigits(sel + 1)} از {toFaDigits(notes.length)}: {noteNameFa(selNote.medianHz)}
            </Badge>
            <span className="text-[11px] text-sky-900">
              {toFaDigits(Math.round(selNote.medianHz))} هرتز
              {centsFromNearestNote(selNote.medianHz) !== 0 &&
                ` (${toFaDigits(Math.abs(centsFromNearestNote(selNote.medianHz)))} سنت ${centsFromNearestNote(selNote.medianHz) > 0 ? "بالا" : "پایین"})`}
              {" — "}
              {formatTimeFa(selNote.startMs)} تا {formatTimeFa(selNote.endMs)}
            </span>
            <span className="mx-0.5 h-5 w-px bg-sky-200" />
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => mergeNotes(sel, "prev")} disabled={sel === 0}>
              <Merge className="h-3 w-3" /> ادغام قبلی
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => mergeNotes(sel, "next")} disabled={sel >= notes.length - 1}>
              <Merge className="h-3 w-3" /> ادغام بعدی
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={toggleOrnament}>
              <Sparkles className="h-3 w-3" /> تحریر: {selHasOrnament ? "خاموش" : "روشن"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={refitToPitch}>
              <Music4 className="h-3 w-3" /> تطبیق با قاری
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={playNoteLoop}>
              <Repeat className="h-3 w-3" /> تکرار نت
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => deleteNote(sel)}
            >
              <Trash2 className="h-3 w-3" /> حذف
            </Button>
          </div>
        ) : (
          <div className="text-[11px] leading-5 text-muted-foreground rounded-xl border border-dashed p-2">
            روی یک نت کلیک کنید تا ویرایشش کنید • کشیدن نت بالا/پایین = زیر و بمی • دایره‌های لبه = مرز زمانی • دابل‌کلیک = نت جدید •
            Shift + کشیدن = حرکت آزاد • <b>Space = پخش/توقف</b> • برای تراز خودکار تمام نت‌ها، دکمه <b>«استخراج هوشمند نت‌ها»</b> را بزنید ✨
          </div>
        )}
      </div>
    </div>
  );
}

export default NoteEditor;