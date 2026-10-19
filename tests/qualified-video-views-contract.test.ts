/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration = source("supabase/migrations/20260902170000_qualified_repeated_video_views.sql");
const progressApi = source("src/features/videos/progress/video-progress-api.ts");
const trackedPlayer = source("src/features/videos/progress/tracked-video-player.tsx");
const studentVideos = source("src/routes/student.videos.tsx");

assert.match(migration, /create table public\.video_view_sessions/i);
assert.match(
  migration,
  /active_watched_seconds\s*>=\s*ceil\(duration_seconds::numeric \* 0\.50\)/i,
);
assert.match(migration, /watched_seconds\s*>=\s*ceil\(duration_seconds::numeric \* 0\.80\)/i);
assert.match(migration, /set views = 0/i);
assert.match(migration, /video_view_counter_reset_archive/i);
assert.match(migration, /revoke all[\s\S]*from public, anon/i);
assert.match(migration, /did_qualify := true/i);
assert.match(progressApi, /secure_update_video_progress_v2/);
assert.match(trackedPlayer, /crypto\.randomUUID\(\)/);
assert.match(trackedPlayer, /playbackEndedRef\.current/);
assert.match(trackedPlayer, /result\.viewCounted/);
assert.doesNotMatch(trackedPlayer, /incrementVideoView/);
assert.match(studentVideos, /video\.progress\.completed_at/);
assert.doesNotMatch(studentVideos, /video\.progress\.percent\s*>=\s*95/);

// Active-watch accuracy regression contracts.
assert.match(trackedPlayer, /const mediaDelta = currentMediaTime - previousMediaTime/);
assert.match(trackedPlayer, /wallDelta \* playbackRate \+ MEDIA_CLOCK_TOLERANCE_SECONDS/);
assert.match(trackedPlayer, /if \(mediaDelta > largestContinuousDelta\) return/);
assert.doesNotMatch(trackedPlayer, /Math\.min\(2,/);
assert.match(trackedPlayer, /pendingWatchedRef\.current -= wholePending/);
assert.match(trackedPlayer, /Math\.min\(remaining, MAX_WATCH_DELTA_PER_REQUEST\)/);
assert.match(trackedPlayer, /pendingWatchedRef\.current \+= delta/);
assert.match(trackedPlayer, /onSeeking=\{handleSeeking\}/);
assert.match(trackedPlayer, /onWaiting=\{handleWaiting\}/);
assert.match(trackedPlayer, /onProgressRef\.current/);
assert.match(trackedPlayer, /window\.setInterval/);
assert.match(trackedPlayer, /setSessionDisplayTick/);
assert.match(trackedPlayer, /result\.sessionActiveWatchedSeconds/);
assert.match(trackedPlayer, /Math\.ceil\(runtimeDuration \* 0\.5\)/);
assert.match(trackedPlayer, /برای ثبت بازدید این نشست/);
assert.match(trackedPlayer, /بازدید این نشست ثبت شد/);
assert.doesNotMatch(trackedPlayer, /ویدیو تکمیل شد/);
assert.match(trackedPlayer, /setSessionConfirmedWatched\(0\)/);
assert.doesNotMatch(trackedPlayer, /پیشرفت ذخیره‌شده/);
assert.doesNotMatch(trackedPlayer, /زمان تماشای فعال:/);
assert.doesNotMatch(trackedPlayer, /موقعیت فعلی/);

// Resume-choice regression contracts.
assert.match(trackedPlayer, /function getResumePosition/);
assert.match(trackedPlayer, /if \(!progress\) return null/);
assert.doesNotMatch(trackedPlayer, /progress\.completed_at\) return null/);
assert.match(trackedPlayer, /controls=\{!awaitingPlaybackChoice\}/);
assert.match(trackedPlayer, /autoPlay=\{!awaitingPlaybackChoice\}/);
assert.match(trackedPlayer, /choosePlaybackStart\(resumePosition\)/);
assert.match(trackedPlayer, /choosePlaybackStart\(0\)/);
assert.match(trackedPlayer, /ادامه از \{formatWatchTime\(resumePosition\)\}/);
assert.match(trackedPlayer, /شروع از ابتدا/);
assert.match(trackedPlayer, /!playbackStartedRef\.current/);
assert.match(trackedPlayer, /playbackStartedRef\.current = true/);
assert.doesNotMatch(trackedPlayer, /player\.currentTime = saved/);

// Resume position must stay frozen while periodic progress updates rerender the parent.
assert.match(trackedPlayer, /const openingResumeRef = useRef/);
assert.match(trackedPlayer, /openingResumeRef\.current\.videoId !== String\(videoId\)/);
assert.doesNotMatch(trackedPlayer, /const resumePosition = getResumePosition\(initialProgress\)/);

console.log("qualified-video-views-contract: 49 assertions passed");
