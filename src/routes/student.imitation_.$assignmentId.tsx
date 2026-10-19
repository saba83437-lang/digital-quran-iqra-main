import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Play,
  Pause,
  Mic,
  Loader2,
  Star,
  Trophy,
  Wallet,
  Sparkles,
  RotateCcw,
  Home,
  Square,
  Activity,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  loadChallengeBundle,
  startAttempt,
  finishAttempt,
  getTodayChallenge,
  getMyAttempts,
} from "@/features/recitation/api/recitation-student-api";
import type {
  AttemptResult,
  AttemptScores,
  RecitationAttempt,
  RecitationPassage,
  RecitationPassageVersion,
  RecitationScoringConfig,
} from "@/features/recitation/domain/recitation-types";
import { DIFFICULTY_LABELS } from "@/features/recitation/domain/recitation-types";
import type { AnalysisOutput } from "@/features/recitation/dsp/analysis-pipeline";
import type { WordBand } from "@/features/recitation/dsp/note-edit-utils";
import { stretchWithTatweel } from "@/features/recitation/dsp/note-edit-utils";
import {
  cancelMic,
  readMicLevel,
  startMic,
  stopMic,
  MicBusyError,
  MicPermissionError,
  type MicRecorderStart,
} from "@/features/recitation/dsp/mic-recorder";
import {
  scoreAttemptRecording,
  type AttemptAnalysisSummary,
} from "@/features/recitation/dsp/attempt-scoring";
import { MelodyTunnel, extractTunnel } from "@/features/recitation/viz/melody-tunnel";
import {
  MelodyTunnel3D,
  isWebGLAvailable,
  type LiveStats,
} from "@/features/recitation/viz/melody-tunnel-3d";

export const Route = createFileRoute("/student/imitation_/$assignmentId")({
  component: ChallengePage,
});

type Phase = "loading" | "ready" | "playing" | "analyzing" | "done";

// فقط «نت‌ها» و «تحریر» — طبق تصمیم مدیر، بقیه‌ی معیارها فعلاً نمایش داده نمی‌شوند
const METRIC_LABELS: Array<{ key: keyof AttemptScores; label: string }> = [
  { key: "pitch_accuracy", label: "دقت نت‌ها و ملودی 🎵" },
  { key: "ornament_accuracy", label: "تحریر 🎶" },
];

function barColor(v: number): string {
  if (v >= 85) return "bg-emerald-500";
  if (v >= 60) return "bg-amber-500";
  return "bg-rose-400";
}

/** تشخیص خودکار حالت سبک: موبایل یا پردازنده‌ی ضعیف */
function detectLiteMode(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (cores <= 4) return true;
  if (typeof window !== "undefined" && window.innerWidth < 700) return true;
  return /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
}

function ChallengePage() {
  const { assignmentId } = Route.useParams();

  const [phase, setPhase] = useState<Phase>("loading");
  const [passage, setPassage] = useState<RecitationPassage | null>(null);
  const [version, setVersion] = useState<RecitationPassageVersion | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<RecitationAttempt[]>([]);
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [playing, setPlaying] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [starting, setStarting] = useState(false);

  // فاز 21C — ضبط و تحلیل
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [lastScores, setLastScores] = useState<AttemptScores | null>(null);
  const [analysisSummary, setAnalysisSummary] = useState<AttemptAnalysisSummary | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);

  // تونل سه‌بعدی: آمار زنده + حالت سبک (خودکار/دستی)
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [liteOverride, setLiteOverride] = useState<boolean | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef<number>(0); // Date.now — برای durationMs
  const startedPerfRef = useRef<number>(0); // performance.now — برای ویژوال تونل
  const micRef = useRef<MicRecorderStart | null>(null);
  const micBufferRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);

  // کارائوکه‌ی کلمات: زمان دقیق تمرین (میلی‌ثانیه) + زمان گوش‌دادن به قاری
  const [elapsedMs, setElapsedMs] = useState(0);
  const [listenMs, setListenMs] = useState(0);

  // تحلیل assignmentId: uuid واقعی = تکلیف استاد | "daily" = چالش روزانه | "passage-..." = تمرین آزاد
  const isDaily = assignmentId === "daily";
  const isFreePractice = assignmentId.startsWith("passage-");
  const freePassageId = isFreePractice ? assignmentId.slice("passage-".length) : undefined;

  // داده‌ی تونل ملودی (از تحلیل نسخه) — یک‌بار محاسبه می‌شود
  const tunnelData = useMemo(() => extractTunnel(version?.tunnel_json ?? null), [version]);

  // نت‌های واقعی تحلیل — برای ساخت «پله‌های ملودی» در بازی سه‌بعدی
  const analysisNotes = useMemo(() => {
    const aj = version?.analysis_json as { notes?: unknown } | null | undefined;
    return aj && Array.isArray(aj.notes)
      ? (aj.notes as AnalysisOutput["analysis"]["notes"])
      : null;
  }, [version]);

  // نوارهای کلمات ذخیره‌شده توسط مدیر در نت‌نگار (برای کارائوکه‌ی کلمه‌به‌کلمه)
  const wordBands = useMemo(() => {
    const mo = version?.manual_overrides as
      | { wordBands?: unknown }
      | null
      | undefined;
    if (!mo || !Array.isArray(mo.wordBands) || mo.wordBands.length === 0) return null;
    // اعتبارسنجی سبک: هر نوار باید word و زمان معتبر داشته باشد
    const ok = (mo.wordBands as unknown[]).every(
      (b) =>
        b !== null &&
        typeof b === "object" &&
        typeof (b as WordBand).word === "string" &&
        (b as WordBand).word.trim().length > 0 &&
        typeof (b as WordBand).startMs === "number" &&
        typeof (b as WordBand).endMs === "number" &&
        (b as WordBand).endMs > (b as WordBand).startMs,
    );
    return ok ? (mo.wordBands as WordBand[]) : null;
  }, [version]);

  // آستانه‌های ستاره از تنظیمات امتیازدهی نسخه (پیش‌فرض: ۵۰/۷۰/۸۵ — مثل سرور)
  const starThresholds = useMemo(() => {
    const cfg = (version?.scoring_config ?? null) as Partial<RecitationScoringConfig> | null;
    return {
      one: cfg?.stars?.one ?? 50,
      two: cfg?.stars?.two ?? 70,
      three: cfg?.stars?.three ?? 85,
    };
  }, [version]);

  // آیا تونل سه‌بعدی فعال است؟ (WebGL + داده‌ی تونل)
  const webglOk = useMemo(() => isWebGLAvailable(), []);
  const autoLite = useMemo(() => detectLiteMode(), []);
  const liteMode = liteOverride ?? autoLite;
  const use3D = webglOk && tunnelData !== null;

  // ستاره‌های زنده از روی درصد همراهی
  const liveStars =
    liveStats && liveStats.pct > 0
      ? liveStats.pct >= starThresholds.three
        ? 3
        : liveStats.pct >= starThresholds.two
          ? 2
          : liveStats.pct >= starThresholds.one
            ? 1
            : 0
      : 0;

  useEffect(() => {
    void (async () => {
      try {
        // چالش روزانه: اول باید passageId را از چالش امروز بگیریم
        if (isDaily) {
          const challenge = await getTodayChallenge();
          if (!challenge) {
            toast.error("چالش روزانه‌ای برای امروز تنظیم نشده است");
            setPhase("ready");
            return;
          }
          const bundle = await loadChallengeBundle({ passageId: challenge.passage_id });
          setPassage(bundle.passage);
          setVersion(bundle.version);
          setAudioUrl(bundle.audioUrl);
          setAttempts(bundle.attempts);
          setPhase("ready");
          return;
        }

        const bundle = await loadChallengeBundle({
          assignmentId: isFreePractice ? undefined : assignmentId,
          passageId: freePassageId,
        });
        setPassage(bundle.passage);
        setVersion(bundle.version);
        setAudioUrl(bundle.audioUrl);
        setAttempts(bundle.attempts);
        setPhase("ready");
      } catch (e: any) {
        toast.error(e?.message || "خطا در بارگذاری چالش");
        setPhase("ready");
      }
    })();
  }, [assignmentId]);

  // آزادسازی منابع میکروفون/تایمر هنگام خروج از صفحه
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(timerRef.current);
      if (micRef.current) {
        cancelMic(micRef.current);
        micRef.current = null;
      }
    };
  }, []);

  // پخش و توقف صوت مرجع
  const toggleAudio = () => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      const a = new Audio(audioUrl);
      a.onended = () => {
        setPlaying(false);
        setListenMs(0);
      };
      a.ontimeupdate = () => setListenMs(a.currentTime * 1000);
      audioRef.current = a;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      void audioRef.current.play();
      setPlaying(true);
    }
  };

  const stopReferenceAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  };

  /** شروع نمایش زنده سطح صدا */
  const startLevelMonitor = () => {
    if (!micRef.current?.analyser) return;
    if (!micBufferRef.current || micBufferRef.current.length !== micRef.current.analyser.fftSize) {
      micBufferRef.current = new Uint8Array(micRef.current.analyser.fftSize);
    }
    const tick = () => {
      setMicLevel(readMicLevel(micRef.current?.analyser ?? null, micBufferRef.current!));
      // زمان دقیق تمرین برای کارائوکه‌ی کلمات
      setElapsedMs(performance.now() - startedPerfRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      // ۱) اول میکروفون — اگر اجازه داده نشود، تلاشی در سرور ساخته نمی‌شود
      const mic = await startMic();
      micRef.current = mic;

      // ۲) شروع تلاش در سرور
      const attemptId = await startAttempt({
        assignmentId: isDaily || isFreePractice ? undefined : assignmentId,
        passageId: isDaily ? passage?.id : freePassageId,
      });
      setCurrentAttemptId(attemptId);
      startedAtRef.current = Date.now();
      startedPerfRef.current = performance.now();

      // ۳) شروع ضبط — بدون پخش صدای قاری (سیاست مدیر: حین تست صدای مرجع پخش نشود)
      mic.recorder.start();
      setElapsedSec(0);
      setElapsedMs(0);
      setLiveStats(null);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
      startLevelMonitor();
      setPhase("playing");
      toast.success("گوی طلایی روی پله‌های نت می‌پرد — با صدایت روی پله‌ی درستش نگهش دار!");
    } catch (e: any) {
      if (micRef.current) {
        cancelMic(micRef.current);
        micRef.current = null;
      }
      if (e instanceof MicPermissionError) {
        toast.error(e.message, { duration: 6000 });
      } else if (e instanceof MicBusyError) {
        toast.error(e.message);
      } else {
        toast.error(e?.message || "شروع تمرین ناموفق بود");
      }
    } finally {
      setStarting(false);
    }
  };

  const handleFinish = async () => {
    if (!currentAttemptId || finishing) return;
    setFinishing(true);
    const durationMs = Date.now() - startedAtRef.current;

    // توقف تایمر و سطح‌سنج
    window.clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    setMicLevel(0);
    setElapsedMs(0);

    let blob: Blob | null = null;
    if (micRef.current) {
      try {
        blob = await stopMic(micRef.current);
      } catch {
        blob = null;
      }
      micRef.current = null;
    }

    setPhase("analyzing");
    stopReferenceAudio();
    setPlaying(false);

    // تحلیل + ارسال امتیاز
    let scores: AttemptScores = {};
    let failed = false;
    if (blob && blob.size > 1000 && version) {
      try {
        const refAnalysis =
          version.analysis_json && Object.keys(version.analysis_json).length > 0
            ? (version.analysis_json as unknown as Partial<AnalysisOutput["analysis"]>)
            : null;
        const cfg =
          version.scoring_config && Object.keys(version.scoring_config).length > 0
            ? (version.scoring_config as Partial<RecitationScoringConfig>)
            : {};
        const scored = await scoreAttemptRecording(blob, refAnalysis, cfg);
        scores = scored.scores;
        setAnalysisSummary(scored.summary);
      } catch (e) {
        console.error("attempt analysis failed", e);
        failed = true;
      }
    }
    setAnalysisFailed(failed);

    try {
      const res = await finishAttempt({
        attemptId: currentAttemptId,
        durationMs,
        deviceInfo: { screen: window.innerWidth + "x" + window.innerHeight, lang: "fa" },
        scores,
      });
      setResult(res);
      if (Object.keys(scores).length > 0) setLastScores(scores);
      setPhase("done");
      if (failed) {
        toast("تحلیل صدا انجام نشد — تمرینت بدون امتیاز ثبت شد", { duration: 5000 });
      }
      // به‌روزرسانی تاریخچه بعد از ثبت نتیجه
      if (passage) {
        getMyAttempts(passage.id).then(setAttempts).catch(() => undefined);
      }
    } catch (e: any) {
      toast.error(e?.message || "ثبت نتیجه ناموفق بود");
      setPhase("ready");
    } finally {
      setFinishing(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!passage) {
    return (
      <div className="py-20 text-center space-y-4">
        <p className="text-muted-foreground">چالش یافت نشد یا هنوز منتشر نشده است.</p>
        <Button asChild variant="outline">
          <Link to="/student/imitation">بازگشت به چالش‌ها</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* مسیر بازگشت */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/student/imitation" className="hover:text-primary flex items-center gap-1">
          <ArrowRight className="h-4 w-4 rotate-180" />
          چالش تقلید
        </Link>
        <span>/</span>
        <span className="text-foreground">{passage.title}</span>
      </div>

      {/* سربرگ فراز */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 text-white p-6">
        <div className="absolute inset-0 bg-[radial-gradient(#fff_0.8px,transparent_1px)] bg-[length:4px_4px] opacity-10" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-black">{passage.title}</h1>
              <div className="text-emerald-100/80 text-sm mt-1">
                {passage.reciter}
                {passage.surah ? ` • ${passage.surah}` : ""}
                {passage.ayah_start ? ` • آیات ${passage.ayah_start} تا ${passage.ayah_end ?? passage.ayah_start}` : ""}
                {passage.maqam_primary ? ` • مقام ${passage.maqam_primary}` : ""}
              </div>
            </div>
            <Badge className="bg-white/10 text-white border-white/20">
              {DIFFICULTY_LABELS[passage.difficulty]}
            </Badge>
          </div>
          {passage.description && (
            <p className="text-sm text-emerald-100/70 mt-3">{passage.description}</p>
          )}
        </div>
      </div>

      {/* صفحه تمرین */}
      {phase === "ready" && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="text-center space-y-2">
              <Sparkles className="h-10 w-10 mx-auto text-primary" />
              <p className="text-muted-foreground">
                اول به تلاوت قاری گوش بده و خوب یادش بگیر؛ بعد دکمه «شروع تمرین» را بزن و خودت بخوان.
              </p>
              <p className="text-sm text-emerald-700 font-medium">
                🎈 گوی طلایی روی پله‌های نت می‌پرد — با صدایت روی پله‌های درست نگهش دار!
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={toggleAudio} variant="outline" className="gap-2 min-w-40">
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {playing ? "توقف" : audioUrl ? "گوش دادن به تلاوت قاری" : "صوتی موجود نیست"}
              </Button>
              <Button onClick={handleStart} disabled={starting} className="gap-2 min-w-40">
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                شروع تمرین
              </Button>
            </div>
            {/* کارائوکه‌ی کلمات هنگام گوش‌دادن (تقسیم دقیق مدیر در نت‌نگار) */}
            {wordBands && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 space-y-1">
                <div className="text-[11px] text-amber-700 text-center font-bold">
                  متن آیه — همراه با صدای قاری دنبالش کن 🎧
                </div>
                <WordKaraoke bands={wordBands} tMs={listenMs} tone="light" />
              </div>
            )}
            <p className="text-xs text-center text-muted-foreground">
              اول چند بار به تلاوت قاری گوش بده و خوب یاد بگیر؛ حین تمرین صدای قاری پخش نمی‌شود —
              مثل امتحان، خودت مستقل می‌خوانی. 🎧 (هدفون بهتر است تا میکروفون صدای تمیزتری بگیرد)
            </p>
          </CardContent>
        </Card>
      )}

      {/* حین تمرین (ضبط فعال + تونل ملودی سه‌بعدی) */}
      {phase === "playing" && (
        <Card className="border-primary/40 overflow-hidden">
          <div className="aspect-video relative bg-[#5eb2f0]">
            {use3D ? (
              <MelodyTunnel3D
                key={currentAttemptId ?? "tunnel3d"}
                tunnel={tunnelData}
                notes={analysisNotes}
                analyser={micRef.current?.analyser ?? null}
                sampleRate={micRef.current?.audioCtx?.sampleRate ?? 44100}
                startedAtMs={startedPerfRef.current}
                running={phase === "playing"}
                lite={liteMode}
                onLiveStats={setLiveStats}
              />
            ) : (
              <MelodyTunnel
                key={currentAttemptId ?? "tunnel"}
                tunnel={tunnelData}
                analyser={micRef.current?.analyser ?? null}
                sampleRate={micRef.current?.audioCtx?.sampleRate ?? 44100}
                startedAtMs={startedPerfRef.current}
                running={phase === "playing"}
              />
            )}

            {/* HUD زنده روی تونل سه‌بعدی */}
            {use3D && (
              <>
                <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
                  <div className="flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-sm px-4 py-1.5">
                    <span className="flex gap-0.5" aria-label="ستاره‌های زنده">
                      {[1, 2, 3].map((i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 transition-colors ${
                            i <= liveStars ? "fill-amber-400 text-amber-500" : "text-slate-500"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="text-emerald-100 text-sm font-bold tabular-nums">
                      {liveStats && liveStats.pct > 0 ? `${liveStats.pct}٪` : "—"}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        liveStats?.wallHit
                          ? "text-red-300"
                          : liveStats?.voiced
                            ? liveStats.onTarget
                              ? "text-emerald-300"
                              : "text-amber-300"
                            : "text-slate-200"
                      }`}
                    >
                      {liveStats?.wallHit
                        ? "گوی از پله بیرون زد! برگرد 😊"
                        : liveStats?.voiced
                          ? liveStats.onTarget
                            ? "آفرین! دقیق روی نتی 🌟"
                            : liveStats.dir === "up"
                              ? "کمی بالاتر بخوان ⬆️"
                              : liveStats.dir === "down"
                                ? "کمی پایین‌تر بخوان ⬇️"
                                : "کمی دقیق‌تر…"
                          : "بخوان تا گوی بپرد 🎈"}
                    </span>
                  </div>
                </div>
                {/* راهنمای رنگ‌ها برای بچه‌ها */}
                <div className="absolute bottom-3 inset-x-0 flex justify-center gap-3 pointer-events-none text-[11px] text-white/90">
                  <span className="rounded-full bg-black/30 px-2 py-0.5">🎶 پله‌ی طلایی = تحریر</span>
                  <span className="rounded-full bg-black/30 px-2 py-0.5">☁️ ابرچه = نفست بکش</span>
                  <span className="rounded-full bg-black/30 px-2 py-0.5">⭐ ستاره = اوج</span>
                </div>
              </>
            )}

            {/* کارائوکه‌ی کلمه‌به‌کلمه حین تمرین (تقسیم دقیق مدیر در نت‌نگار) */}
            {wordBands && (
              <div className="absolute top-14 inset-x-0 flex justify-center px-3 pointer-events-none">
                <WordKaraoke bands={wordBands} tMs={elapsedMs} tone="dark" />
              </div>
            )}

            {/* شمارش‌گر و نشانگر ضبط */}
            <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-white">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-bold tabular-nums" dir="ltr">
                {String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:
                {String(elapsedSec % 60).padStart(2, "0")}
              </span>
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <div className="rounded-full bg-black/50 px-3 py-1.5 text-emerald-100/80 text-xs">
                {isDaily ? "چالش روزانه" : isFreePractice ? "تمرین آزاد" : "تکلیف استاد"}
              </div>
              {use3D && (
                <button
                  type="button"
                  onClick={() => setLiteOverride((v) => !(v ?? liteMode))}
                  title={liteMode ? "حالت کامل (گرافیک سنگین‌تر)" : "حالت سبک (مناسب موبایل)"}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1 transition-colors ${
                    liteMode
                      ? "bg-amber-500/80 text-black"
                      : "bg-black/50 text-emerald-100/80 hover:bg-black/70"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  {liteMode ? "سبک" : "کامل"}
                </button>
              )}
            </div>
          </div>

          <CardContent className="pt-4 space-y-4">
            {/* سطح صدا */}
            <div className="max-w-xs mx-auto">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-[width] duration-100"
                  style={{ width: `${Math.round(micLevel * 100)}%` }}
                />
              </div>
              <div className="text-xs text-center text-muted-foreground mt-1">سطح صدای تو</div>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Button
                onClick={handleFinish}
                disabled={finishing}
                variant="destructive"
                className="gap-2 min-w-44"
              >
                {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                پایان تمرین
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {use3D
                ? "گوی طلایی روی پله‌های نت پیش می‌رود — صدای تو آن را بالا و پایین می‌برد. سعی کن دقیق روی هر پله بمانی! (صدای قاری حین تمرین پخش نمی‌شود — خودت بخوان 🌟)"
                : "توپ نورانی با صدای تو بالا و پایین می‌رود — آن را روی خط سبز ملودی نگه دار تا «همراهی زنده» بالا برود 🌀"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* در حال تحلیل */}
      {phase === "analyzing" && (
        <Card className="border-primary/40">
          <CardContent className="py-14 text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Activity className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <div className="font-display text-xl font-black">در حال تحلیل صدای تو...</div>
            <p className="text-sm text-muted-foreground">
              معمولاً چند ثانیه طول می‌کشد — لطفاً صفحه را نبند و صبر کن 🎧
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
          </CardContent>
        </Card>
      )}

      {/* نتیجه */}
      {phase === "done" && result && (
        <Card className="border-emerald-500/40 bg-gradient-to-b from-emerald-50/60 to-transparent">
          <CardContent className="pt-8 space-y-5">
            <div className="text-center">
              <div className="text-6xl mb-2">
                {result.stars >= 3 ? "🏆" : result.stars >= 1 ? "🌟" : "🌙"}
              </div>
              <div className="font-display text-2xl font-black">
                {result.stars > 0 ? "آفرین! تمرینت ثبت شد" : "تمرینت ثبت شد — دفعه بعد بهتر می‌خوانی!"}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {result.has_scores
                  ? analysisSummary?.comparedWithReference
                    ? "امتیازها از مقایسه واقعی صدای تو با تلاوت مرجع محاسبه شد."
                    : "امتیازها از تحلیل صدای تو محاسبه شد (مرجع مقایسه در دسترس نبود)."
                  : "امتیاز تحلیل صوتی برای این تمرین ثبت نشد."}
              </p>
            </div>

            <div className="flex justify-center gap-3">
              <StarRow count={result.stars} />
            </div>

            {result.total_score != null && (
              <div className="text-center">
                <span className="inline-block rounded-full bg-emerald-100 text-emerald-800 px-4 py-1 font-black">
                  امتیاز کلی: {result.total_score}
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
              <ResultItem icon={<Star className="h-5 w-5 text-amber-500" />} label="ستاره" value={String(result.stars)} />
              <ResultItem icon={<Trophy className="h-5 w-5 text-sky-500" />} label="XP" value={`+${result.xp_earned}`} />
              <ResultItem icon={<Wallet className="h-5 w-5 text-yellow-600" />} label="سکه" value={`+${result.coins_earned}`} />
            </div>

            {/* جزئیات امتیازها */}
            {result.has_scores && lastScores && (
              <div className="max-w-md mx-auto rounded-xl border bg-white/70 p-4 space-y-3">
                <div className="text-sm font-bold text-center">امتیاز هر بخش از خوانش تو</div>
                {METRIC_LABELS.map(({ key, label }) => {
                  const v = typeof lastScores[key] === "number" ? (lastScores[key] as number) : 0;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{label}</span>
                        <span className="font-bold tabular-nums">{Math.round(v)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-[width] duration-700 ${barColor(v)}`}
                          style={{ width: `${Math.round(v)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {analysisSummary && (
                  <div className="text-xs text-center text-muted-foreground pt-1">
                    پوشش صدا {analysisSummary.coveragePercent}٪ • نت‌ها {analysisSummary.noteCount} •
                    تنفس {analysisSummary.breathCount}
                    {analysisSummary.ornamentCount > 0 ? ` • تحریر ${analysisSummary.ornamentCount}` : ""}
                  </div>
                )}
              </div>
            )}

            {analysisFailed && (
              <p className="text-xs text-center text-muted-foreground">
                (تحلیل صدا این بار موفق نبود — در تمرین بعدی دوباره امتحان کن)
              </p>
            )}

            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={handleStart} variant="outline" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                تمرین دوباره
              </Button>
              <Button asChild className="gap-2">
                <Link to="/student/imitation">
                  <Home className="h-4 w-4" />
                  بازگشت به چالش‌ها
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* تاریخچه این فراز */}
      {attempts.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium mb-3">تلاش‌های قبلی تو روی این فراز</div>
            <div className="space-y-2">
              {attempts.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    {a.completed_at
                      ? new Date(a.completed_at).toLocaleDateString("fa-IR")
                      : "ناتمام"}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-bold">{a.total_score ?? "—"}</span>
                    <StarRow count={a.stars} />
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StarRow({ count }: { count: number }) {
  return (
    <span className="flex gap-1">
      {[1, 2, 3].map((i) => (
        <Star key={i} className={`h-7 w-7 ${i <= count ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} />
      ))}
    </span>
  );
}

function ResultItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white/70 p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <div className="font-black text-lg">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * نوار کارائوکه‌ی کلمات آیه — کلمه‌ی جاری بر اساس مرزهای دقیق مدیر (نت‌نگار، فاز ۳G) روشن می‌شود.
 *  - کلمه‌های گذشته: روشن‌تر (خوانده‌شده)
 *  - کلمه‌ی جاری: برجسته و بزرگ‌تر + کشیده با «تطویل» عربی (ـ) متناسب با طول زمانی‌اش
 *    (مثل مدّ در خط قرآن — نسخه‌ی ۲؛ تا حرفی شکلش خراب نشود)
 *  - کلمه‌های آینده: کم‌رنگ
 */
function WordKaraoke({
  bands,
  tMs,
  tone,
}: {
  bands: WordBand[];
  tMs: number;
  tone: "light" | "dark";
}) {
  const curIdx = tMs > 0 ? bands.findIndex((b) => tMs >= b.startMs && tMs < b.endMs) : -1;
  const pill =
    tone === "dark"
      ? "rounded-full bg-black/55 backdrop-blur-sm px-4 py-1"
      : "px-1 py-0.5";
  return (
    <div
      dir="rtl"
      className={`${pill} flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 overflow-hidden`}
    >
      {bands.map((b, i) => {
        const cur = i === curIdx;
        const past = curIdx >= 0 && i < curIdx;
        // کشش کلمه‌ی جاری با «تطویل عربی» متناسب با طول زمانی‌اش (هر ~۰٫۹ ثانیه یک کشیده، سقف ۶)
        const durMs = b.endMs - b.startMs;
        const tatCount = cur ? Math.min(6, Math.max(0, Math.round(durMs / 900))) : 0;
        const dispWord = tatCount > 0 ? stretchWithTatweel(b.word, tatCount) : b.word;
        const cls = cur
          ? tone === "dark"
            ? "scale-110 font-black text-emerald-300 underline decoration-emerald-300/80 underline-offset-4"
            : "rounded-md bg-amber-300 px-1 font-black text-amber-950 scale-105"
          : past
            ? tone === "dark"
              ? "text-emerald-100/85"
              : "text-amber-800"
            : tone === "dark"
              ? "text-white/40"
              : "text-slate-400";
        return (
          <span
            key={i}
            className={`inline-block text-base leading-8 transition-all duration-150 ${cls}`}
          >
            {dispWord}
          </span>
        );
      })}
    </div>
  );
}
