import { createFileRoute } from "@tanstack/react-router";
import { ReadOnlyNajmResultsPage } from "@/features/najm-results/components/read-only-najm-results-page";
export const Route = createFileRoute("/parent/najm-results")({
  head: () => ({ meta: [{ title: "نتایج طرح نجم — ولی" }] }),
  component: () => <ReadOnlyNajmResultsPage role="parent" />,
});
