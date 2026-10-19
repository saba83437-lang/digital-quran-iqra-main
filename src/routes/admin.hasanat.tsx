import { createFileRoute } from "@tanstack/react-router";
import { HasanatHubPage } from "@/features/hasanat/components/hasanat-hub-page";
export const Route = createFileRoute("/admin/hasanat")({
  head: () => ({ meta: [{ title: "باغ حسنات — مدیریت" }] }),
  component: () => <HasanatHubPage role="admin" />,
});
