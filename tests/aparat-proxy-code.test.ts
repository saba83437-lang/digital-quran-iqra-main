/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const server = source("src/server.ts");
const videoSource = source("src/features/videos/progress/video-source.ts");
const progressApi = source("src/features/videos/progress/video-progress-api.ts");
const trackedPlayer = source("src/features/videos/progress/tracked-video-player.tsx");
const studentVideos = source("src/routes/student.videos.tsx");

assert.match(server, /\/api\/video\/aparat-source/);
assert.match(server, /rest\/v1\/videos\?select=id,video_url/);
assert.match(server, /authorization,/);
assert.match(server, /www\.aparat\.com\/etc\/api\/video\/videohash/);
assert.match(server, /file_link_all/);
assert.match(videoSource, /\/api\/video\/aparat-source\?videoId=/);
assert.doesNotMatch(videoSource, /www\.aparat\.com\/etc\/api\/video\/videohash/);
assert.match(progressApi, /secure_update_video_progress_v2/);
assert.match(progressApi, /p_playback_session_id/);
assert.doesNotMatch(progressApi, /secure_increment_video_view/);
assert.match(trackedPlayer, /playbackSessionId/);
assert.match(trackedPlayer, /viewCounted/);
assert.doesNotMatch(trackedPlayer, /incrementVideoView/);
assert.doesNotMatch(studentVideos, /playVideo[\s\S]{0,300}secure_increment_video_view/);
assert.match(studentVideos, /video\.progress\.completed_at/);
assert.doesNotMatch(studentVideos, /video\.progress\.percent\s*>=\s*95/);
assert.match(studentVideos, /بازکردن Dialog به‌تنهایی View محسوب نمی‌شود/);

console.log("aparat-proxy-code: 17 assertions passed");
