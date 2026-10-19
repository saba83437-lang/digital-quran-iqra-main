import assert from "node:assert/strict";
import { syllabusProgress } from "../src/features/syllabus/syllabus-domain.js";
import type { ClassSyllabusItem } from "../src/features/syllabus/syllabus-api.js";

function item(
  id: string,
  status: ClassSyllabusItem["status"],
  isActive = true,
): ClassSyllabusItem {
  return {
    id,
    class_id: 1,
    title: id,
    description: "",
    status,
    target_date: null,
    sort_order: 10,
    is_active: isActive,
    completed_at: status === "completed" ? "2026-01-01" : null,
    completed_by_user_id: null,
    created_by_user_id: "u",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

assert.deepEqual(syllabusProgress([]), {
  total: 0,
  completed: 0,
  inProgress: 0,
  planned: 0,
  percent: 0,
});

const progress = syllabusProgress([
  item("a", "completed"),
  item("b", "completed"),
  item("c", "in_progress"),
  item("d", "planned"),
  item("inactive", "completed", false),
]);
assert.equal(progress.total, 4);
assert.equal(progress.completed, 2);
assert.equal(progress.inProgress, 1);
assert.equal(progress.planned, 1);
assert.equal(progress.percent, 50);
assert.equal(syllabusProgress([item("x", "completed")]).percent, 100);
assert.equal(syllabusProgress([item("x", "planned")]).percent, 0);

console.log("syllabus-domain: 8 assertions passed");
