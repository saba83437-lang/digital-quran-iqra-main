// ============================================================================
// Smart Recitation — Melody Steps 3D (پله‌های ملودی آسمان — نسخه‌ی کودکانه)
// ----------------------------------------------------------------------------
// بازی تقلید تلاوت برای کودکان — ساده، شفاف و شاد:
//  • تم آسمان روشن: ابرهای سفید شناور، خورشید، مه نرم — بدون هیچ شلوغی
//  • مسیر بازی = «پله‌های نت» واقعی قاری (از analysis_json.notes):
//    هر نت یک پله است؛ ارتفاع هر پله = زیر و بمی نت (مثل نمودار پلکانی مدیر)
//    رنگ هر پله با ارتفاعش عوض می‌شود (مثل زیلوفون) → نت‌ها «خوانا» می‌شوند
//  • گوی طلایی از راست به چپ روی پله‌ها پیش می‌رود؛ انحراف صدا از نت، گوی را
//    از پله دور می‌کند؛ انحراف زیاد → فلش قرمز (بازی ادامه دارد!)
//  • تحریر = پله‌ی طلایی درخشان ✨ / تنفس = ابرچه‌ی آبی ☁️ / اوج = ستاره ⭐
// ----------------------------------------------------------------------------
// نکته‌ی زمان‌بندی: startedAtMs بر مبنای performance.now() است.
// نکته‌ی صدا: صدای قاری «حین تمرین» پخش نمی‌شود (تصمیم مدیر) — این کامپوننت
// کاملاً از صوت مرجع مستقل است.
// ============================================================================
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles, Trail } from "@react-three/drei";
import { yinPitch, applyHannWindow, hzToCents } from "../dsp/pitch-yin";
import type { AnalysisOutput } from "../dsp/analysis-pipeline";

export type TunnelData = AnalysisOutput["tunnel"];
export type AnalysisNote = AnalysisOutput["analysis"]["notes"][number];

// ==================== ثابت‌های جهان بازی ====================
const X_SPEED = 2.2; // سرعت پیشروی افقی (واحد در ثانیه)
const Y_SCALE = 2.4; // مقیاس ارتفاع ملودی (-1..1 → -2.4..2.4)
const STEP_THICK = 0.42; // ضخامت هر پله
const STEP_DEPTH = 2.2; // عمق هر پله (محور Z)
const MATCH_TOL = 0.28; // تلورانس تطابق (مقیاس -1..1)
const WALL_HIT_TOL = 0.55; // انحراف بیش از این = خروج از پله (فلش)
const DEV_VISUAL = 1.35; // مقیاس دیداری انحراف گوی
const BALL_R = 0.3; // شعاع گوی
const PITCH_EVERY_N_FRAMES = 3; // تشخیص نت هر چند فریم یک‌بار
const STATS_EVERY_MS = 400; // دوره‌ی ارسال آمار زنده

const COLOR_ON = "#34d399"; // سبز — دقیق روی پله
const COLOR_OFF = "#fbbf24"; // کهربایی — انحراف ملایم
const COLOR_HIT = "#f87171"; // قرمز — خروج از پله
const COLOR_IDLE = "#94a3b8"; // خاکستری — سکوت

export interface LiveStats {
  pct: number;
  voiced: boolean;
  onTarget: boolean;
  wallHit: boolean;
  /** جهت لازم برای اصلاح: بالاتر یا پایین‌تر بخوان */
  dir: "up" | "down" | "ok" | "none";
}

export interface MelodyTunnel3DProps {
  tunnel: TunnelData | null;
  /** نت‌های واقعی تحلیل (از analysis_json) — سازنده‌ی پله‌ها */
  notes: AnalysisNote[] | null;
  analyser: AnalyserNode | null;
  sampleRate: number;
  /** مبنای زمان شروع: performance.now() */
  startedAtMs: number;
  running: boolean;
  lite?: boolean;
  onLiveStats?: (stats: LiveStats) => void;
  className?: string;
}

export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// ==================== آماده‌سازی مسیر مرجع ====================
interface PreparedPath {
  count: number;
  times: Float32Array;
  worldX: Float32Array;
  baseY: Float32Array;
  centerY: Float32Array;
  durationS: number;
}

function preparePath(tunnel: TunnelData): PreparedPath | null {
  const pts = tunnel.points;
  if (!pts || pts.length < 10) return null;
  const n = pts.length;
  const times = new Float32Array(n);
  const worldX = new Float32Array(n);
  const baseY = new Float32Array(n);
  const centerY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const tS = pts[i].t / 1000;
    times[i] = tS;
    worldX[i] = -tS * X_SPEED;
    baseY[i] = pts[i].y;
    centerY[i] = pts[i].y * Y_SCALE;
  }
  return { count: n, times, worldX, baseY, centerY, durationS: times[n - 1] ?? 0 };
}

/** نمونه‌برداری خطی: ارتفاع ملودی مرجع در زمان tS (ثانیه) */
function sampleBaseY(path: PreparedPath, tS: number): number {
  const { times, count, baseY } = path;
  if (count === 0) return 0;
  if (tS <= times[0]) return baseY[0];
  if (tS >= times[count - 1]) return baseY[count - 1];
  let lo = 0;
  let hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= tS) lo = mid;
    else hi = mid;
  }
  const span = Math.max(1e-6, times[hi] - times[lo]);
  const f = (tS - times[lo]) / span;
  return baseY[lo] + (baseY[hi] - baseY[lo]) * f;
}

// ==================== ساخت پله‌ها از نت‌های واقعی ====================
interface StepData {
  xc: number; // مرکز پله در جهان
  x0: number; // لبه‌ی راست
  x1: number; // لبه‌ی چپ
  width: number;
  yTop: number; // سطح پله در جهان
  color: THREE.Color;
  ornament: boolean;
  peak: boolean;
}

/** رنگ زیلوفونی بر اساس ارتفاع نسبی (کودک نت بلند/کوتاه را از رنگ هم بفهمد) */
function stepColor(t: number): THREE.Color {
  // t∈[0,1] — از فیروزه‌ای (کوتاه) تا صورتی (بلند)
  return new THREE.Color().setHSL(0.52 - 0.52 * Math.max(0, Math.min(1, t)), 0.65, 0.6);
}

function buildSteps(
  path: PreparedPath,
  notes: AnalysisNote[] | null,
  markers: Array<{ type: string; t: number }>,
): StepData[] {
  const ornamentT = markers.filter((m) => m.type === "ornament").map((m) => m.t);
  const peakT = markers.filter((m) => m.type === "peak").map((m) => m.t);
  const inAny = (arr: number[], from: number, to: number) =>
    arr.some((t) => t >= from - 40 && t <= to + 40);

  const steps: StepData[] = [];

  if (notes && notes.length > 0) {
    // ----- حالت اصلی: یک پله به ازای هر نت واقعی قاری -----
    let minY = Infinity;
    let maxY = -Infinity;
    const raw: Array<{ from: number; to: number; y: number }> = [];
    for (const note of notes) {
      const dur = note.endMs - note.startMs;
      if (dur < 60) continue; // نت‌های خیلی کوتاه: شلوغی (ادغام نمایشی)
      // میانگین ارتفاع مسیر مرجع در بازه‌ی نت → ارتفاع پله، دقیق و سازگار با نمودار
      let sum = 0;
      let cnt = 0;
      for (let t = note.startMs; t <= note.endMs; t += 60) {
        sum += sampleBaseY(path, t / 1000);
        cnt++;
      }
      const y = cnt > 0 ? sum / cnt : 0;
      raw.push({ from: note.startMs, to: note.endMs, y });
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const spanY = Math.max(1e-6, maxY - minY);
    for (const s of raw) {
      const t01 = (s.y - minY) / spanY;
      const x1 = -(s.from / 1000) * X_SPEED;
      const x0 = -(s.to / 1000) * X_SPEED;
      const width = Math.max(0.16, x1 - x0);
      const ornament = inAny(ornamentT, s.from, s.to);
      steps.push({
        xc: x0 + width / 2,
        x0,
        x1,
        width,
        yTop: s.y * Y_SCALE,
        color: ornament ? new THREE.Color("#f59e0b") : stepColor(t01),
        ornament,
        peak: inAny(peakT, s.from, s.to),
      });
      if (steps.length >= 160) break;
    }
  } else {
    // ----- جایگزین: اگر نت نبود، پله‌های زمانی از روی منحنی -----
    const step = 0.5; // هر نیم‌ثانیه یک پله
    for (let t = 0; t < path.durationS; t += step) {
      const y = sampleBaseY(path, t + step / 2);
      const x1 = -t * X_SPEED;
      const x0 = -(t + step) * X_SPEED;
      const t01 = (y + 1) / 2;
      steps.push({
        xc: x0 + (x1 - x0) / 2,
        x0,
        x1,
        width: x1 - x0,
        yTop: y * Y_SCALE,
        color: stepColor(t01),
        ornament: false,
        peak: false,
      });
    }
  }
  return steps;
}

// ==================== وضعیت مشترک زنده ====================
interface SharedState {
  elapsedS: number;
  liveY: number | null;
  voiced: boolean;
  onTarget: boolean;
  wallHit: boolean;
  lastHitAt: number;
  validFrames: number;
  matchFrames: number;
  pct: number;
  cents: number[];
  smoothBuf: number[];
}

function makeShared(): SharedState {
  return {
    elapsedS: 0,
    liveY: null,
    voiced: false,
    onTarget: false,
    wallHit: false,
    lastHitAt: -1e9,
    validFrames: 0,
    matchFrames: 0,
    pct: 0,
    cents: [],
    smoothBuf: [],
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[i];
}

interface SceneProps {
  path: PreparedPath;
  steps: StepData[];
  breaths: Array<{ x: number; y: number }>;
  shared: SharedState;
  analyser: AnalyserNode | null;
  sampleRate: number;
  running: boolean;
  lite: boolean;
  startedAtMs: number;
  onLiveStats?: (s: LiveStats) => void;
}

// ==================== آسمان: خورشید + ابرها ====================
function Sun() {
  return (
    <group position={[-6, 7, -10]}>
      <mesh>
        <circleGeometry args={[1.1, 32]} />
        <meshBasicMaterial color="#fde047" />
      </mesh>
      <mesh>
        <circleGeometry args={[1.7, 32]} />
        <meshBasicMaterial color="#fef9c3" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

interface CloudSpec {
  x: number;
  y: number;
  z: number;
  s: number;
  speed: number;
  puffs: Array<[number, number, number]>;
}

function makeClouds(count: number, spanX: number): CloudSpec[] {
  const out: CloudSpec[] = [];
  let seed = 42;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const puffs: Array<[number, number, number]> = [];
    const n = 3 + Math.floor(rnd() * 2);
    for (let p = 0; p < n; p++) {
      puffs.push([(p - (n - 1) / 2) * 0.5 + (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.1]);
    }
    out.push({
      x: -rnd() * spanX,
      y: 2.2 + rnd() * 5.2,
      z: -(2.5 + rnd() * 6),
      s: 0.6 + rnd() * 0.9,
      speed: 0.1 + rnd() * 0.16,
      puffs,
    });
  }
  return out;
}

function Clouds({ spanX, lite }: { spanX: number; lite: boolean }) {
  const specs = useMemo(() => makeClouds(lite ? 5 : 10, spanX), [lite, spanX]);
  const refs = useRef<Array<THREE.Group | null>>([]);
  useFrame((_, dt) => {
    refs.current.forEach((g, i) => {
      const c = specs[i];
      if (!g || !c) return;
      c.x -= c.speed * dt; // حرکت آرام به چپ (جهت آسمان)
      if (c.x < -(spanX + 6)) c.x = 6; // رسیدن به انتهای چپ → برگشت به راست
      g.position.x = c.x;
    });
  });
  return (
    <group>
      {specs.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s} ref={(g) => (refs.current[i] = g)}>
          {c.puffs.map((p, j) => (
            <mesh key={j} position={[p[0], p[1], p[2]]}>
              <sphereGeometry args={[0.55, 16, 12]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ==================== پله‌های ملودی ====================
function Steps({ steps, lite }: { steps: StepData[]; lite: boolean }) {
  return (
    <group>
      {steps.map((s, i) => (
        <group key={i}>
          {/* بدنه‌ی پله */}
          <mesh position={[s.xc, s.yTop - STEP_THICK / 2, 0]}>
            <boxGeometry args={[s.width, STEP_THICK, STEP_DEPTH]} />
            <meshStandardMaterial
              color={s.color}
              roughness={0.55}
              metalness={0.05}
              emissive={s.color}
              emissiveIntensity={s.ornament ? 0.55 : 0.18}
            />
          </mesh>
          {/* لبه‌ی سفید جلویی — پله خواناتر شود */}
          <mesh position={[s.xc, s.yTop + 0.012, STEP_DEPTH / 2 - 0.03]}>
            <boxGeometry args={[s.width, 0.03, 0.05]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
          {/* درخشش تحریر بالای پله */}
          {s.ornament && !lite && (
            <Sparkles
              position={[s.xc, s.yTop + 0.4, 0]}
              count={10}
              scale={[Math.max(0.4, s.width), 0.5, 1]}
              size={3.5}
              speed={0.6}
              color="#fde68a"
              opacity={0.9}
            />
          )}
          {/* ستاره‌ی اوج */}
          {s.peak && (
            <PeakStar position={[s.xc, s.yTop + 0.75, 0]} />
          )}
        </group>
      ))}
      {/* دیواره‌ی عمودی بین پله‌ها — خوانایی پلکانی مثل نمودار مدیر */}
      {steps.slice(1).map((s, i) => {
        const prev = steps[i];
        if (!prev || prev.xc - s.xc < 0.05) return null;
        const gap = prev.xc - s.xc; // فاصله‌ی افقی دو پله‌ی متوالی (پله‌ها به -X می‌روند)
        if (gap > s.width + prev.width) return null;
        const yLow = Math.min(prev.yTop, s.yTop) - STEP_THICK;
        const yHigh = Math.max(prev.yTop, s.yTop);
        return (
          <mesh key={`r-${i}`} position={[s.xc + s.width / 2 + gap / 2 - s.width / 2, (yLow + yHigh) / 2, STEP_DEPTH / 2 - 0.06]}>
            <boxGeometry args={[0.045, yHigh - yLow, 0.04]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
          </mesh>
        );
      })}
    </group>
  );
}

function PeakStar({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 1.6;
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2.2) * 0.08;
    }
  });
  return (
    <mesh ref={ref} position={position}>
      <octahedronGeometry args={[0.17, 0]} />
      <meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={1.1} roughness={0.3} />
    </mesh>
  );
}

// ==================== ابرچه‌های تنفس ====================
function BreathPuffs({ breaths }: { breaths: Array<{ x: number; y: number }> }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      child.position.y += Math.sin(t * 1.4 + i * 1.7) * 0.0016;
    });
  });
  return (
    <group ref={group}>
      {breaths.map((b, i) => (
        <group key={i} position={[b.x, b.y, 0]}>
          <mesh position={[-0.18, 0, 0]}>
            <sphereGeometry args={[0.2, 14, 10]} />
            <meshStandardMaterial color="#7dd3fc" roughness={0.6} />
          </mesh>
          <mesh position={[0.08, 0.06, 0.08]}>
            <sphereGeometry args={[0.26, 14, 10]} />
            <meshStandardMaterial color="#bae6fd" roughness={0.6} />
          </mesh>
          <mesh position={[0.3, -0.03, -0.02]}>
            <sphereGeometry args={[0.17, 14, 10]} />
            <meshStandardMaterial color="#e0f2fe" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ==================== حلقه‌ی هدف روی پله‌ی فعلی ====================
function TargetRing({ shared, path }: { shared: SharedState; path: PreparedPath }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    const t = Math.min(shared.elapsedS, path.durationS);
    const base = sampleBaseY(path, t);
    const yTop = base * Y_SCALE;
    const x = -t * X_SPEED;
    if (ref.current) {
      ref.current.position.set(x, yTop + 0.025, 0);
      const s = 1 + 0.1 * Math.sin(state.clock.elapsedTime * 5);
      ref.current.scale.setScalar(s);
    }
    if (mat.current) {
      mat.current.color.set(shared.onTarget ? COLOR_ON : "#ffffff");
      mat.current.opacity = shared.onTarget ? 0.95 : 0.55;
    }
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[BALL_R + 0.1, BALL_R + 0.18, 32]} />
      <meshBasicMaterial ref={mat} color="#ffffff" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// ==================== گوی طلایی + نور + ردّ ====================
function BallRig({ shared, path }: { shared: SharedState; path: PreparedPath }) {
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const ballMat = useRef<THREE.MeshStandardMaterial>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const hitRing = useRef<THREE.Mesh>(null);
  const hitRingMat = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const smoothY = useRef(Y_SCALE * 0 + BALL_R + 0.05);

  useFrame((state, dt) => {
    const t = Math.min(shared.elapsedS, path.durationS);
    const base = sampleBaseY(path, t);
    const stepTop = base * Y_SCALE;
    const x = -t * X_SPEED;

    let targetY = stepTop + BALL_R + 0.05;
    if (shared.liveY !== null) {
      const dev = shared.liveY - base;
      targetY += dev * DEV_VISUAL;
      // مهار دیداری: گوی خیلی از صحنه دور نشود
      targetY = THREE.MathUtils.clamp(targetY, stepTop - 1.6, stepTop + 2.1);
    }
    smoothY.current += (targetY - smoothY.current) * Math.min(1, dt * 7);
    if (group.current) group.current.position.set(x, smoothY.current, 0);

    const nowMs = performance.now();
    const hitRecent = nowMs - shared.lastHitAt < 350;
    const color = !shared.voiced
      ? COLOR_IDLE
      : hitRecent
        ? COLOR_HIT
        : shared.onTarget
          ? COLOR_ON
          : COLOR_OFF;
    if (ballMat.current) {
      ballMat.current.color.set(color);
      ballMat.current.emissive.set(color);
    }
    if (glowMat.current) glowMat.current.color.set(color);
    if (light.current) light.current.color.set(color);

    // فلش خروج از پله (محوشونده)
    const sinceHit = nowMs - shared.lastHitAt;
    if (hitRing.current && hitRingMat.current) {
      const v = Math.max(0, 1 - sinceHit / 500);
      hitRing.current.scale.setScalar(1 + (1 - v) * 1.8);
      hitRingMat.current.opacity = v * 0.85;
      hitRing.current.visible = v > 0.01;
    }

    // پرش ملایمِ گوی (زنده به‌نظر رساندن)
    if (ball.current) {
      const bob = shared.voiced ? 1 + 0.06 * Math.sin(state.clock.elapsedTime * 8) : 1;
      ball.current.scale.set(1.05 * bob, (1 / bob) * 0.98, bob);
    }
  });

  return (
    <group ref={group}>
      {/* هاله‌ی نرم دور گوی */}
      <mesh>
        <sphereGeometry args={[BALL_R * 2.1, 20, 20]} />
        <meshBasicMaterial ref={glowMat} color="#fde047" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* خود گوی + ردّ نور */}
      <Trail width={3} length={4.5} color="#fcd34d" attenuation={(w) => w * w}>
        <mesh ref={ball}>
          <sphereGeometry args={[BALL_R, 28, 28]} />
          <meshStandardMaterial ref={ballMat} color="#fde047" emissive="#f59e0b" emissiveIntensity={1.25} roughness={0.3} metalness={0.05} />
        </mesh>
      </Trail>
      <pointLight ref={light} color="#fde047" intensity={10} distance={6} decay={2} />
      {/* فلش خروج از پله */}
      <mesh ref={hitRing} visible={false}>
        <ringGeometry args={[BALL_R + 0.18, BALL_R + 0.34, 32]} />
        <meshBasicMaterial ref={hitRingMat} color={COLOR_HIT} transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ==================== دوربین: نمای پهلو، شبیه نمودار مدیر ====================
function CameraRig({ shared, path }: { shared: SharedState; path: PreparedPath }) {
  const look = useMemo(() => new THREE.Vector3(), []);
  const curLook = useMemo(() => new THREE.Vector3(-2, 1, 0), []);
  useFrame(({ camera }, dt) => {
    const t = Math.min(shared.elapsedS, path.durationS);
    const baseY = sampleBaseY(path, t) * Y_SCALE;
    const x = -t * X_SPEED;
    const k = Math.min(1, dt * 3.5);
    // دوربین: کمی بالاتر از سطح پله‌ها، نگاه به‌سمت جلو (چپ)
    camera.position.x += (x + 1.9 - camera.position.x) * k;
    camera.position.y += (baseY * 0.3 + 2.3 - camera.position.y) * k;
    camera.position.z += (8.4 - camera.position.z) * k;
    curLook.lerp(look.set(x - 2.8, baseY * 0.3 + 0.4, 0), k);
    camera.lookAt(curLook);
  });
  return null;
}

// ==================== مغز بازی: تشخیص نت + آمار زنده ====================
function GameBrain({ path, shared, analyser, sampleRate, running, startedAtMs, onLiveStats }: SceneProps) {
  const frameNo = useRef(0);
  const buffer = useRef<Float32Array<ArrayBuffer> | null>(null);
  const lastStatsAt = useRef(0);

  useFrame(() => {
    if (running) {
      shared.elapsedS = Math.max(0, (performance.now() - startedAtMs) / 1000);
    }

    frameNo.current++;
    if (analyser && frameNo.current % PITCH_EVERY_N_FRAMES === 0) {
      if (!buffer.current || buffer.current.length !== analyser.fftSize) {
        buffer.current = new Float32Array(analyser.fftSize);
      }
      const buf = buffer.current;
      analyser.getFloatTimeDomainData(buf);

      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const voicedLevel = rms > 0.012;

      const { frequency, confidence } = yinPitch(applyHannWindow(new Float32Array(buf)), sampleRate);

      if (voicedLevel && frequency && confidence >= 0.55) {
        const cents = hzToCents(frequency);
        shared.smoothBuf.push(cents);
        if (shared.smoothBuf.length > 5) shared.smoothBuf.shift();
        const sorted = [...shared.smoothBuf].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];

        shared.cents.push(med);
        if (shared.cents.length > 160) shared.cents.shift();
        const cs = [...shared.cents].sort((a, b) => a - b);
        let lo: number;
        let hi: number;
        if (cs.length < 10) {
          const m = cs[Math.floor(cs.length / 2)] ?? med;
          lo = m - 600;
          hi = m + 600;
        } else {
          lo = percentile(cs, 10);
          hi = percentile(cs, 90);
        }
        const span = Math.max(120, hi - lo);
        shared.liveY = Math.max(-1.15, Math.min(1.15, ((med - lo) / span) * 2 - 1));
        shared.voiced = true;
      } else {
        shared.liveY = null;
        shared.voiced = false;
      }

      // تطابق با پله‌ی فعلی
      if (shared.elapsedS <= path.durationS) {
        if (shared.voiced && shared.liveY !== null) {
          const base = sampleBaseY(path, shared.elapsedS);
          const dev = Math.abs(shared.liveY - base);
          shared.onTarget = dev <= MATCH_TOL;
          shared.validFrames++;
          if (shared.onTarget) shared.matchFrames++;
          if (dev > WALL_HIT_TOL) {
            shared.wallHit = true;
            shared.lastHitAt = performance.now();
          }
        } else {
          shared.onTarget = false;
        }
        shared.pct = shared.validFrames > 0 ? (shared.matchFrames / shared.validFrames) * 100 : 0;
      }
      shared.wallHit = performance.now() - shared.lastHitAt < 600;
    }

    const now = performance.now();
    if (onLiveStats && now - lastStatsAt.current >= STATS_EVERY_MS) {
      lastStatsAt.current = now;
      let dir: LiveStats["dir"] = "none";
      if (shared.voiced && shared.liveY !== null) {
        if (shared.onTarget) dir = "ok";
        else dir = shared.liveY > sampleBaseY(path, shared.elapsedS) ? "down" : "up";
      }
      onLiveStats({
        pct: Math.round(shared.pct),
        voiced: shared.voiced,
        onTarget: shared.onTarget,
        wallHit: shared.wallHit,
        dir,
      });
    }
  });
  return null;
}

// ==================== کاهش خودکار کیفیت روی دستگاه ضعیف ====================
function AdaptiveQuality({ lite }: { lite: boolean }) {
  const { setDpr } = useThree();
  const ema = useRef(16);
  const degraded = useRef(false);
  useFrame((_, dt) => {
    if (lite || degraded.current) return;
    ema.current = ema.current * 0.95 + dt * 1000 * 0.05;
    if (ema.current > 34) {
      degraded.current = true;
      setDpr(1);
    }
  });
  return null;
}

// ==================== صحنه ====================
function Scene(props: SceneProps) {
  const { path, steps, breaths, shared, lite } = props;
  return (
    <>
      {/* آسمان: بدون رنگ پس‌زمینه‌ی WebGL — گرادیان CSS پشت بوم شفاف است */}
      <fog attach="fog" args={["#d8f1fe", 11, 27]} />
      <ambientLight intensity={1.05} />
      <directionalLight position={[4, 8, 6]} intensity={0.75} color="#fff7ed" />
      <hemisphereLight args={["#bfe6fb", "#fef9c3", 0.45]} />
      <Sun />
      <Clouds spanX={Math.max(20, path.durationS * X_SPEED)} lite={lite} />
      <Steps steps={steps} lite={lite} />
      <BreathPuffs breaths={breaths} />
      <TargetRing shared={shared} path={path} />
      <BallRig shared={shared} path={path} />
      <CameraRig shared={shared} path={path} />
      <GameBrain {...props} />
      <AdaptiveQuality lite={lite} />
    </>
  );
}

// ==================== کامپوننت اصلی ====================
export function MelodyTunnel3D({
  tunnel,
  notes,
  analyser,
  sampleRate,
  startedAtMs,
  running,
  lite = false,
  onLiveStats,
  className,
}: MelodyTunnel3DProps) {
  const path = useMemo(() => (tunnel ? preparePath(tunnel) : null), [tunnel]);
  const steps = useMemo(
    () => (path ? buildSteps(path, notes, tunnel?.markers ?? []) : []),
    [path, notes, tunnel],
  );
  const breaths = useMemo(() => {
    if (!path) return [];
    return (tunnel?.markers ?? [])
      .filter((m) => m.type === "breath")
      .map((m) => {
        const tS = m.t / 1000;
        return { x: -tS * X_SPEED, y: sampleBaseY(path, tS) * Y_SCALE + 1.1 };
      });
  }, [path, tunnel]);
  const shared = useMemo(makeShared, [startedAtMs]);

  if (!path) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#475569",
          fontSize: 13,
          width: "100%",
          height: "100%",
        }}
      >
        برای نمایش بازی، مدیر باید «تحلیل» نسخه را اجرا کرده باشد
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        // آسمان روشن: گرادیان CSS پشت بوم شفاف WebGL
        background: "linear-gradient(180deg, #5eb2f0 0%, #a5dcf7 55%, #d8f1fe 100%)",
      }}
    >
      <Canvas
        dpr={lite ? 1 : [1, 1.8]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 48, near: 0.1, far: 70, position: [1.9, 2.3, 8.4] }}
      >
        <Scene
          path={path}
          steps={steps}
          breaths={breaths}
          shared={shared}
          analyser={analyser}
          sampleRate={sampleRate}
          running={running}
          lite={lite}
          startedAtMs={startedAtMs}
          onLiveStats={onLiveStats}
        />
      </Canvas>
    </div>
  );
}
