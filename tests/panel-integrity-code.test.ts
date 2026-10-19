import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const sidebar = source("src/components/app-sidebar.tsx");
const shell = source("src/components/app-shell.tsx");
const adminVideos = source("src/routes/admin.videos.tsx");
const studentLessons = source("src/routes/student.lessons.tsx");

assert.match(sidebar, /url: "\/student\/achievements"/);
assert.match(sidebar, /url: "\/parent\/achievements"/);
assert.match(sidebar, /export function getNavigationItemsForRole/);
assert.match(shell, /value=\{globalSearch\}/);
assert.match(shell, /navigationMatches/);
assert.match(shell, /openSearchResult/);
assert.match(adminVideos, /sendSecureMessage/);
assert.doesNotMatch(adminVideos, /toast\.success\(`یادآوری برای/);
assert.doesNotMatch(studentLessons, /const syllabus =/);
assert.doesNotMatch(studentLessons, /syllabusProgress/);
assert.match(studentLessons, /ClassSyllabusPanel/);

console.log("panel-integrity-code: 11 assertions passed");
