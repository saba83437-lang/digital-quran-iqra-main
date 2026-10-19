// ============================================================================
// Smart Recitation — Scoring (فاز 21A)
// فرمول امتیازدهی ترکیبی — دقیقاً باید با منطق SQL سمت سرور هماهنگ باشد
// (student_finish_attempt در phase21a_recitation_infrastructure_FINAL.sql)
// ============================================================================
import type { AttemptScores, RecitationScoringConfig } from "./recitation-types";

/** تنظیمات پیش‌فرض امتیازدهی — همان مقدار پیش‌فرض دیتابیس */
export const DEFAULT_SCORING_CONFIG: RecitationScoringConfig = {
  pitchWeight: 0.35,
  stabilityWeight: 0.15,
  transitionWeight: 0.15,
  timingWeight: 0.15,
  ornamentWeight: 0.1,
  breathWeight: 0.05,
  energyWeight: 0.05,
  pitchToleranceCents: 80,
  timingToleranceMs: 180,
  passScore: 70,
  stars: { one: 50, two: 70, three: 85 },
  xp: 25,
  coins: 10,
};

/** محدود کردن یک عدد بین ۰ تا ۱۰۰ */
export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** امتیاز وزنی کلی از روی امتیازهای جزء */
export function weightedOverall(
  scores: Partial<AttemptScores>,
  config: RecitationScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const pitch = clampScore(scores.pitch_accuracy ?? 0);
  const stability = clampScore(scores.pitch_stability ?? 0);
  const transition = clampScore(scores.transition_accuracy ?? 0);
  const timing = clampScore(scores.timing ?? 0);
  const ornament = clampScore(scores.ornament_accuracy ?? 0);
  const breath = clampScore(scores.breath ?? 0);
  const energy = clampScore(scores.energy ?? 0);

  const total =
    pitch * config.pitchWeight +
    stability * config.stabilityWeight +
    transition * config.transitionWeight +
    timing * config.timingWeight +
    ornament * config.ornamentWeight +
    breath * config.breathWeight +
    energy * config.energyWeight;

  return Math.round(total * 100) / 100;
}

/** محاسبه ستاره‌ها از روی امتیاز کلی */
export function starsForScore(
  score: number,
  config: RecitationScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  if (score >= config.stars.three) return 3;
  if (score >= config.stars.two) return 2;
  if (score >= config.stars.one) return 1;
  return 0;
}

/** محاسبه XP و سکه از روی ستاره‌ها */
export function rewardsForStars(
  stars: number,
  config: RecitationScoringConfig = DEFAULT_SCORING_CONFIG,
): { xp: number; coins: number } {
  return {
    xp: stars * config.xp,
    coins: stars * config.coins,
  };
}

/**
 * محاسبه کامل امتیازدهی سمت کلاینت (برای پیش‌نمایش سریع).
 * توجه: امتیاز رسمی همیشه در سرور محاسبه می‌شود — این تابع فقط برای UI است.
 */
export function computeFullScore(
  scores: Partial<AttemptScores>,
  config: RecitationScoringConfig = DEFAULT_SCORING_CONFIG,
): { overall: number; stars: number; xp: number; coins: number } {
  const overall = weightedOverall(scores, config);
  const stars = starsForScore(overall, config);
  const { xp, coins } = rewardsForStars(stars, config);
  return { overall, stars, xp, coins };
}

/** آیا جمع وزن‌ها تقریباً ۱ است؟ (برای هشدار به مدیر) */
export function weightsSumOk(config: RecitationScoringConfig): boolean {
  const sum =
    config.pitchWeight +
    config.stabilityWeight +
    config.transitionWeight +
    config.timingWeight +
    config.ornamentWeight +
    config.breathWeight +
    config.energyWeight;
  return Math.abs(sum - 1) < 0.001;
}
