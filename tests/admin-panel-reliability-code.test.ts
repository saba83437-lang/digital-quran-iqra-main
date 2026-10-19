import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const najm = source("src/routes/admin.najm.tsx");
const videos = source("src/routes/admin.videos.tsx");
const assignments = source("src/routes/admin.assignments.tsx");

assert.doesNotMatch(assignments, /\balert\(/);
assert.match(assignments, /toast\.error\("عنوان تکلیف الزامی است/);
assert.match(najm, /ویرایش رکورد نجم ناموفق بود/);
assert.match(najm, /ثبت حضور آینه‌ای ناموفق بود/);
assert.match(najm, /حذف رکوردهای نجم ناموفق بود/);
assert.match(najm, /previousActiveId/);
assert.match(najm, /تغییر ترم فعال کامل نشد/);
assert.match(videos, /حذف ویدیوهای سرفصل ناموفق بود/);
assert.match(videos, /کپی ویدیوهای سرفصل ناموفق بود/);
assert.match(videos, /const copies = playlistVideos\.map/);
assert.match(videos, /sendWatchReminder/);

console.log("admin-panel-reliability-code: 11 assertions passed");
