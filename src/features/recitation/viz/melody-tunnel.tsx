// ============================================================================
// Smart Recitation — Melody Tunnel (تونل ملودی زنده)
// ----------------------------------------------------------------------------
// ویژوال کارائوکه‌ی تلاوت: تونل ملودی مرجع (tunnel_json) از عمق به سمت کاربر
// حرکت می‌کند و «توپ نورانی» با نتِ زنده‌ی صدای قرآن‌آموز بالا/پایین می‌رود.
// اگر نت روی خط ملودی باشد → توپ سبز و درخشان / اگر نباشد → کهربایی
// اگر داده‌ی تونل موجود نباشد → موجِ زنده‌ی صدای خود کاربر نمایش داده می‌شود.
//
// وابستگی خارجی: هیچ (فقط Canvas 2D + موتور YIN خود پروژه)
// ============================================================================
import { useEffect, useRef } from "react";
import { yinPitch, applyHannWindow, hzToCents } from "../dsp/pitch-yin";
import type { AnalysisOutput } from "../dsp/analysis-pipeline";

export type TunnelData = AnalysisOutput["tunnel"];

// ==================== ثابت‌های نمایش ====================
const Z_SPEED = 2; // سرعت پیشروی عمق در ثانیه (۰٫۰۴ واحد به ازای هر قدم ۲۰ms)
const FUTURE_SEC = 3.2; // چقدر از آینده نمایش داده شود
const PAST_SEC = 0.4; // چقدر از گذشته هنوز دیده شود
const MATCH_TOL = 0.28; // تلورانس تطابق توپ و خط ملودی (در مقیاس -1..1)
const PITCH_EVERY_N_FRAMES = 3; // تشخیص نت هر چند فریم یک‌بار (صرفه‌جویی CPU)

interface Props {
  /** داده‌ی تونل مرجع — ممکن است null باشد (نسخه بدون تحلیل) */
  tunnel: TunnelData | null;
  /** AnalyserNode میکروفون فعال — ممکن است null باشد */
  analyser: AnalyserNode | null;
  /** نرخ نمونه‌برداری AudioContext میکروفون */
  sampleRate: number;
  /** زمان شروع تمرین (performance.now مبنا) */
  startedAtMs: number;
  /** آیا تمرین در حال اجراست؟ */
  running: boolean;
  className?: string;
}

interface LiveState {
  cents: number[]; // پنجره متحرک سنت‌های اخیر (برای نرمال‌سازی)
  smoothBuf: number[]; // میانگین‌گیر نرم برای ضد‌لرزش
  liveY: number | null; // موقعیت عمودی توپ (-1..1)
  voiced: boolean;
  onTarget: boolean;
  trail: Array<{ y: number; t: number }>;
  validFrames: number;
  matchFrames: number;
  livePct: number;
  wave: Array<{ t: number; y: number | null }>; // حالت جایگزین (بدون tunnel)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[i];
}

/** استخراج امن داده‌ی تونل از json دیتابیس */
export function extractTunnel(tunnelJson: Record<string, unknown> | null | undefined): TunnelData | null {
  if (!tunnelJson || typeof tunnelJson !== "object") return null;
  const tj = tunnelJson as { points?: unknown; markers?: unknown; version?: unknown };
  if (!Array.isArray(tj.points) || tj.points.length < 10) return null;
  const first = tj.points[0] as { t?: unknown; y?: unknown; z?: unknown } | undefined;
  if (!first || typeof first.t !== "number" || typeof first.y !== "number") return null;
  return tunnelJson as unknown as TunnelData;
}

export function MelodyTunnel({ tunnel, analyser, sampleRate, startedAtMs, running, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const frameCountRef = useRef(0);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const t0Ref = useRef(0);
  const runningRef = useRef(running);
  runningRef.current = running;

  const stRef = useRef<LiveState>({
    cents: [],
    smoothBuf: [],
    liveY: null,
    voiced: false,
    onTarget: false,
    trail: [],
    validFrames: 0,
    matchFrames: 0,
    livePct: 0,
    wave: [],
  });

  useEffect(() => {
    t0Ref.current = startedAtMs;
    // ریست وضعیت زنده در شروع تمرین
    stRef.current = {
      cents: [],
      smoothBuf: [],
      liveY: null,
      voiced: false,
      onTarget: false,
      trail: [],
      validFrames: 0,
      matchFrames: 0,
      livePct: 0,
      wave: [],
    };

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---------- تشخیص نت از میکروفون ----------
    const detectPitch = (st: LiveState) => {
      if (!analyser) return;
      if (!bufferRef.current || bufferRef.current.length !== analyser.fftSize) {
        bufferRef.current = new Float32Array(analyser.fftSize);
      }
      const buf = bufferRef.current;
      analyser.getFloatTimeDomainData(buf);

      // سطح صدا (RMS) — برای تشخیص سکوت
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const voicedLevel = rms > 0.012;

      const { frequency, confidence } = yinPitch(applyHannWindow(new Float32Array(buf)), sampleRate);
      if (voicedLevel && frequency && confidence >= 0.55) {
        const cents = hzToCents(frequency);
        // نرم‌سازی ضد‌لرزش: میانه ۵ نمونه آخر
        st.smoothBuf.push(cents);
        if (st.smoothBuf.length > 5) st.smoothBuf.shift();
        const sorted = [...st.smoothBuf].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];

        st.cents.push(med);
        if (st.cents.length > 160) st.cents.shift();

        // نرمال‌سازی نسبت به باند صدای خود کاربر (پرسنتایل ۱۰/۹۰)
        const cs = [...st.cents].sort((a, b) => a - b);
        let lo: number, hi: number;
        if (cs.length < 10) {
          const m = cs[Math.floor(cs.length / 2)] ?? med;
          lo = m - 600;
          hi = m + 600;
        } else {
          lo = percentile(cs, 10);
          hi = percentile(cs, 90);
        }
        const span = Math.max(120, hi - lo);
        st.liveY = Math.max(-1.15, Math.min(1.15, ((med - lo) / span) * 2 - 1));
        st.voiced = true;
      } else {
        st.liveY = null;
        st.voiced = false;
      }
    };

    // ---------- رسم یک فریم ----------
    const draw = () => {
      const st = stRef.current;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const cx = W / 2;
      const cy = H * 0.52;
      const nowMs = performance.now();
      const elapsedS = runningRef.current ? Math.max(0, (nowMs - t0Ref.current) / 1000) : 0;
      const zNow = elapsedS * Z_SPEED;

      frameCountRef.current++;
      if (frameCountRef.current % PITCH_EVERY_N_FRAMES === 0) detectPitch(st);

      // پس‌زمینه
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#052e22");
      bg.addColorStop(0.55, "#0a2018");
      bg.addColorStop(1, "#020d0a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ذرات ستاره‌ای ظریف ثابت (حس عمق)
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#a7f3d0";
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 137.5) % 100) / 100 * W;
        const sy = ((i * 61.8) % 100) / 100 * H;
        ctx.fillRect(sx, sy, 1.4, 1.4);
      }
      ctx.restore();

      const points = tunnel?.points ?? [];

      if (points.length > 0) {
        // ================= تونل مرجع =================
        const vis = points.filter((p) => {
          const relZ = p.z - zNow;
          return relZ > -PAST_SEC * Z_SPEED && relZ < FUTURE_SEC * Z_SPEED;
        });

        const proj = (relZ: number) => {
          const s = 1 / (0.55 + Math.max(-0.35, relZ) * 0.9);
          const alpha = Math.max(0.06, Math.min(1, 1.15 - relZ * 0.22));
          return { s, alpha };
        };

        // خط مرکزی ملودی (جاده‌ی نت)
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          let started = false;
          for (const p of vis) {
            const relZ = p.z - zNow;
            const { s } = proj(relZ);
            const x = cx + p.x * s * W * 0.2;
            const y = cy - p.y * s * H * 0.30;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = pass === 0 ? "rgba(52,211,153,0.16)" : "rgba(110,231,183,0.55)";
          ctx.lineWidth = pass === 0 ? 14 : 3.5;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
        }

        // حلقه‌های تونل (دنده‌های عمق)
        ctx.lineWidth = 1.2;
        for (let i = 0; i < vis.length; i += 6) {
          const p = vis[i];
          const relZ = p.z - zNow;
          const { s, alpha } = proj(relZ);
          const y = cy - p.y * s * H * 0.30;
          const rx = Math.max(2, p.radius * s * 46);
          ctx.strokeStyle = `rgba(94,234,212,${(alpha * 0.35).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(cx, y, rx, rx * 0.62, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // رویدادها (تنفس/تحریر/اوج) — نوار رنگی در عمق
        if (tunnel?.markers) {
          for (const m of tunnel.markers) {
            const relZ = (m.t / 1000) * Z_SPEED - zNow;
            if (relZ < -0.5 || relZ > FUTURE_SEC * Z_SPEED) continue;
            const { s, alpha } = proj(relZ);
            const color =
              m.type === "breath"
                ? "56,189,248"
                : m.type === "ornament"
                  ? "196,141,255"
                  : m.type === "peak"
                    ? "251,191,36"
                    : "148,163,184";
            ctx.fillStyle = `rgba(${color},${(Math.min(0.85, alpha) * 0.5).toFixed(3)})`;
            ctx.fillRect(cx - 2 * s, H * 0.12, Math.max(2, 4 * s), H * 0.76);
            ctx.fillStyle = `rgba(${color},${Math.min(1, alpha).toFixed(3)})`;
            ctx.font = `${Math.max(8, 10 * s)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(m.type === "breath" ? "🫁" : m.type === "ornament" ? "🎶" : m.type === "peak" ? "⭐" : "·", cx, H * 0.12 + 14 * s + 10);
          }
        }

        // حلقه‌ی هدف (خط «الان») — نزدیک‌ترین نقطه به جلوی صحنه
        let target: { y: number } | null = null;
        let best = Infinity;
        for (const p of vis) {
          const relZ = Math.abs(p.z - zNow);
          if (relZ < best) {
            best = relZ;
            target = p;
          }
        }
        if (target) {
          const px = cx;
          const py = cy - target.y * H * 0.30 * proj(0).s;
          ctx.save();
          ctx.strokeStyle = "rgba(16,185,129,0.9)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          ctx.ellipse(px, py, 52, 34, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // تطابق توپ با هدف
          if (st.voiced && st.liveY !== null) {
            st.validFrames++;
            if (Math.abs(st.liveY - target.y) <= MATCH_TOL) st.matchFrames++;
            st.onTarget = Math.abs(st.liveY - target.y) <= MATCH_TOL;
          } else {
            st.onTarget = false;
          }
          st.livePct = st.validFrames > 0 ? Math.round((st.matchFrames / st.validFrames) * 100) : 0;
        }
      } else {
        // ================= حالت جایگزین: موج زنده =================
        const nowS = nowMs / 1000;
        st.wave.push({ t: nowS, y: st.liveY });
        while (st.wave.length > 0 && st.wave[0].t < nowS - 4) st.wave.shift();

        ctx.beginPath();
        let started = false;
        for (const w of st.wave) {
          if (w.y === null) {
            started = false;
            continue;
          }
          const x = W - (nowS - w.t) * (W / 4);
          const y = cy - w.y * H * 0.30;
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(110,231,183,0.7)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();

        // راهنما وسط
        ctx.strokeStyle = "rgba(148,163,184,0.25)";
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(W, cy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ================= توپ نورانی =================
      if (st.liveY !== null) {
        st.trail.push({ y: st.liveY, t: nowMs });
      }
      while (st.trail.length > 0 && nowMs - st.trail[0].t > 350) st.trail.shift();

      // ردّ توپ
      for (const tr of st.trail) {
        const age = (nowMs - tr.t) / 350;
        const bx = cx - age * 46;
        const by = cy - tr.y * H * 0.30;
        ctx.fillStyle = `rgba(110,231,183,${(0.35 * (1 - age)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(bx, by, 9 * (1 - age * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }

      if (st.liveY !== null) {
        const by = cy - st.liveY * H * 0.30;
        const color = st.onTarget ? "52,211,153" : "251,191,36";
        // هاله
        const glow = ctx.createRadialGradient(cx, by, 2, cx, by, 34);
        glow.addColorStop(0, `rgba(${color},0.95)`);
        glow.addColorStop(0.35, `rgba(${color},0.45)`);
        glow.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, by, 34, 0, Math.PI * 2);
        ctx.fill();
        // هسته سفید
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, by, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      // ================= HUD =================
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(236,253,245,0.95)";
      ctx.font = "bold 15px Vazirmatn, sans-serif";
      if (points.length > 0) {
        ctx.fillText(`همراهی زنده: ${points.length > 0 && st.validFrames > 3 ? `${st.livePct}٪` : "—"}`, W - 14, 26);
        ctx.font = "12px Vazirmatn, sans-serif";
        ctx.fillStyle = st.voiced
          ? st.onTarget
            ? "rgba(110,231,183,0.95)"
            : "rgba(252,211,77,0.95)"
          : "rgba(148,163,184,0.8)";
        ctx.fillText(st.voiced ? (st.onTarget ? "آفرین! روی ملودی هستی ✨" : "کمی بالاتر/پایین‌تر…") : "بخوان تا توپ حرکت کند…", W - 14, 46);
      } else {
        ctx.font = "12px Vazirmatn, sans-serif";
        ctx.fillStyle = "rgba(148,163,184,0.9)";
        ctx.fillText("موج زنده‌ی صدای تو (برای تونل کامل، مدیر باید «تحلیل» نسخه را اجرا کند)", W - 14, 26);
      }
      ctx.direction = "ltr";

      if (runningRef.current) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAtMs, analyser]);

  // اگر تمرین تمام شود، حلقه را متوقف کن
  useEffect(() => {
    if (!running) cancelAnimationFrame(rafRef.current);
  }, [running]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
