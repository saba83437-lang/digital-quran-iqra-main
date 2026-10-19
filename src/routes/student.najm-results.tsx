import { createFileRoute } from "@tanstack/react-router";
import { ReadOnlyNajmResultsPage } from "@/features/najm-results/components/read-only-najm-results-page";
export const Route = createFileRoute("/student/najm-results")({
  head: () => ({ meta: [{ title: "نتایج طرح نجم — قرآن‌آموز" }] }),
  component: () => <ReadOnlyNajmResultsPage role="student" />,
});
