import { createFileRoute } from "@tanstack/react-router";
import { HasanatHubPage } from "@/features/hasanat/components/hasanat-hub-page";
export const Route = createFileRoute("/teacher/hasanat")({
  head: () => ({ meta: [{ title: "باغ حسنات — استاد" }] }),
  component: () => <HasanatHubPage role="teacher" />,
});
