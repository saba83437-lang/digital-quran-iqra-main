import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const shell = source("src/components/app-shell.tsx");
const header = source("src/components/page-header.tsx");
const parent = source("src/routes/parent.index.tsx");
const teacher = source("src/routes/teacher.dashboard.tsx");
const student = source("src/routes/student.index.tsx");

assert.match(shell, /showMobileSearch/);
assert.match(shell, /md:hidden/);
assert.match(shell, /جستجو در پنل/);
assert.match(shell, /overflow-x-auto whitespace-nowrap/);
assert.match(header, /\[&>\*\]:max-sm:flex-1/);
assert.match(parent, /<Link to="\/parent\/grades"/);
assert.match(parent, /<Link to="\/parent\/attendance"/);
assert.match(parent, /<Link to="\/parent\/payments"/);
assert.doesNotMatch(teacher, /\.from\("attendance"\)\s*\.select\("\*"/s);
assert.doesNotMatch(teacher, /\.from\("grades"\)\s*\.select\("\*"/s);
assert.match(teacher, /await Promise\.all/);
assert.match(teacher, /role=\{onClick \? "button"/);
assert.equal((student.match(/\.from\("grades"\)/g) ?? []).length, 1);
assert.match(student, /teacherNameById/);
assert.match(student, /role=\{onClick \? "button"/);

console.log("phase20-experience-code: 15 assertions passed");
