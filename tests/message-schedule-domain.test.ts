import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  customJalaliDateTimeToIso,
  formatScheduledAt,
  parseJalaliKey,
  resolveScheduledAt,
  tehranTodayJalaliParts,
  toEnglishDigits,
} from "../src/features/messages/domain/message-schedule.js";

assert.equal(toEnglishDigits("۱۴۰۵/۰۵/۰۹ ١٢:٣٠"), "1405/05/09 12:30");
assert.deepEqual(parseJalaliKey("۱۴۰۵/۰۵/۰۹"), { year: 1405, month: 5, day: 9 });
assert.equal(parseJalaliKey("1405/13/01"), null);
assert.equal(
  customJalaliDateTimeToIso("1405/05/09", "12:00"),
  "2026-07-31T08:30:00.000Z",
);
const now = new Date("2026-07-31T00:00:00.000Z");
assert.equal(resolveScheduledAt({ preset: "5m", now }), "2026-07-31T00:05:00.000Z");
assert.equal(resolveScheduledAt({ preset: "15m", now }), "2026-07-31T00:15:00.000Z");
assert.equal(resolveScheduledAt({ preset: "1h", now }), "2026-07-31T01:00:00.000Z");
assert.equal(resolveScheduledAt({ preset: "tomorrow9", now }), "2026-08-01T05:30:00.000Z");
assert.equal(resolveScheduledAt({ preset: "custom", customJalaliDate: "", customTime: "" }), null);
assert.deepEqual(tehranTodayJalaliParts(new Date("2026-07-31T00:00:00.000Z")), {
  jy: 1405,
  jm: 5,
  jd: 9,
});
assert.notEqual(formatScheduledAt("2026-07-31T08:30:00.000Z"), "—");
const pickerSource = readFileSync(
  new URL("../src/features/messages/components/message-schedule-picker.tsx", import.meta.url),
  "utf8",
);
assert.doesNotMatch(pickerSource, /type="time"/);
assert.match(pickerSource, /length: 24/);
assert.match(pickerSource, /ساعت به‌صورت ۲۴ساعته است/);

console.log("message-schedule-domain: 14 assertions passed");
