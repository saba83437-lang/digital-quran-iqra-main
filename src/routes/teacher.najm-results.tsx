import { createFileRoute } from "@tanstack/react-router";
import { ReadOnlyNajmResultsPage } from "@/features/najm-results/components/read-only-najm-results-page";
export const Route = createFileRoute("/teacher/najm-results")({
  head: () => ({ meta: [{ title: "نتایج طرح نجم — استاد" }] }),
  component: () => <ReadOnlyNajmResultsPage role="teacher" />,
});
