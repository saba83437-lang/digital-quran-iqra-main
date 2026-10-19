import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const najm = source("src/lib/najm.ts");
const session = source("src/routes/teacher.session.tsx");
const attendance = source("src/routes/teacher.attendance.tsx");
const grades = source("src/routes/teacher.grades.tsx");
const assignments = source("src/routes/teacher.assignments.tsx");

assert.match(attendance, /redirect\(\{ to: "\/teacher\/session"/);
assert.match(grades, /redirect\(\{ to: "\/teacher\/session"/);
assert.doesNotMatch(assignments, /\balert\(/);
assert.match(najm, /پروفایل فعال استاد یافت نشد/);
assert.match(najm, /پاک‌سازی رکوردهای قبلی جلسه ناموفق بود/);
assert.match(najm, /پاک‌سازی حضور آینه‌ای ناموفق بود/);
assert.match(najm, /ثبت حضور آینه‌ای ناموفق بود/);
assert.match(najm, /پاک‌سازی نمرات آینه‌ای ناموفق بود/);
assert.match(najm, /ثبت نمرات آینه‌ای ناموفق بود/);
assert.match(session, /savedSessionId/);
assert.match(session, /setExistingSessionId\(savedSessionId\)/);

console.log("teacher-panel-reliability-code: 11 assertions passed");
