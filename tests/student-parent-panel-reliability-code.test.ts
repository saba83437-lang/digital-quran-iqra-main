import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const selection = source("src/features/parent/parent-child-selection.ts");
const parentIndex = source("src/routes/parent.index.tsx");
const parentAttendance = source("src/routes/parent.attendance.tsx");
const parentGrades = source("src/routes/parent.grades.tsx");
const parentPayments = source("src/routes/parent.payments.tsx");
const parentAssignments = source("src/routes/parent.assignments.tsx");
const parentAchievements = source("src/routes/parent.achievements.tsx");
const studentAssignments = source("src/routes/student.assignments.tsx");
const studentMessages = source("src/routes/student.messages.tsx");

assert.match(selection, /parent:selected-child-id/);
assert.match(selection, /rememberParentChild/);
assert.match(parentIndex, /useParentChildSelection/);
assert.match(parentIndex, /onClick=\{\(\) => rememberParentChild\(child.id\)\}/);
assert.match(parentAttendance, /useParentChildSelection/);
assert.match(parentAttendance, /setMonth\("all"\)/);
assert.match(parentGrades, /setPeriod\("current"\)/);
assert.match(parentPayments, /useParentChildSelection/);
assert.match(parentAssignments, /useParentChildSelection/);
assert.match(parentAchievements, /readRememberedParentChild/);
assert.doesNotMatch(studentAssignments, /\balert\(/);
assert.doesNotMatch(studentMessages, /\balert\(/);
assert.match(studentMessages, /toast\.success\("پیام امن ارسال شد"\)/);
assert.match(studentMessages, /toast\.success\("پاسخ امن ارسال شد"\)/);

console.log("student-parent-panel-reliability-code: 14 assertions passed");
