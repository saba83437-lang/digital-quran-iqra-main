import { createFileRoute } from "@tanstack/react-router";
import { HasanatHubPage } from "@/features/hasanat/components/hasanat-hub-page";
export const Route = createFileRoute("/student/hasanat")({
  head: () => ({ meta: [{ title: "باغ حسنات من" }] }),
  component: () => <HasanatHubPage role="student" />,
});
