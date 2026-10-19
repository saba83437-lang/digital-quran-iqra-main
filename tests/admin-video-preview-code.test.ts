import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const preview = source("src/features/videos/progress/resolved-video-preview.tsx");
const adminVideos = source("src/routes/admin.videos.tsx");

assert.match(preview, /resolvePlayableVideoSource/);
assert.match(preview, /supabase\.auth/);
assert.match(preview, /source\.kind === "native"/);
assert.match(preview, /<iframe/);
assert.doesNotMatch(preview, /incrementVideoView/);
assert.doesNotMatch(preview, /updateMyVideoProgress/);
assert.match(adminVideos, /ResolvedVideoPreview/);
assert.doesNotMatch(adminVideos, /<iframe src=\{video\.video_url\}/);

console.log("admin-video-preview-code: 8 assertions passed");
