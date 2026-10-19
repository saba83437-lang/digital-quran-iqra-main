import { createFileRoute } from "@tanstack/react-router";
import { HasanatHubPage } from "@/features/hasanat/components/hasanat-hub-page";
export const Route = createFileRoute("/parent/hasanat")({
  head: () => ({ meta: [{ title: "باغ حسنات — والدین" }] }),
  component: () => <HasanatHubPage role="parent" />,
});
