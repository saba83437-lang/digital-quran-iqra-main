import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const styles = source("src/styles.css");
const shell = source("src/components/app-shell.tsx");
const adminDashboard = source("src/routes/admin.index.tsx");
const najmResults = source("src/routes/admin.najm-results.tsx");
const studentAchievements = source("src/routes/student.achievements.tsx");
const parentAchievements = source("src/routes/parent.achievements.tsx");
const teacherAchievements = source("src/routes/teacher.achievements.tsx");
const showcase = source("src/components/achievement-showcase.tsx");
const hall = source("src/components/achievements/achievement-hall-page.tsx");

assert.match(styles, /@media \(max-width: 640px\)/);
assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(styles, /\.mobile-achievement-grid/);
assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(styles, /\.najm-overall-poster/);
assert.match(styles, /min-width: 0 !important/);
assert.match(styles, /\.hall-poster-winners/);
assert.match(shell, /mobile-app-content/);
assert.match(adminDashboard, /mobile-four-stats/);
assert.match(najmResults, /mobile-four-stats/);
assert.match(studentAchievements, /mobile-achievement-grid/);
assert.match(parentAchievements, /mobile-achievement-grid/);
assert.match(teacherAchievements, /mobile-achievement-grid/);
assert.match(showcase, /mobile-achievement-grid/);
assert.match(hall, /mobile-achievement-grid/);

console.log("mobile-app-layout: 15 assertions passed");
