import type { ClassSyllabusItem } from "./syllabus-api.js";

export function syllabusProgress(items: ClassSyllabusItem[]) {
  const active = items.filter((item) => item.is_active);
  const completed = active.filter((item) => item.status === "completed").length;
  const inProgress = active.filter((item) => item.status === "in_progress").length;
  return {
    total: active.length,
    completed,
    inProgress,
    planned: active.length - completed - inProgress,
    percent: active.length ? Math.round((completed / active.length) * 100) : 0,
  };
}
