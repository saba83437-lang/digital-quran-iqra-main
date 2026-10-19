import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/parent")({
  head: () => ({
    meta: [
      { title: "پنل ولی — بِرّ الوالدین" },
      { name: "description", content: "پنل والدین برای مشاهده پیشرفت فرزندان در مرکز قرآن بِرّ الوالدین" },
    ],
  }),
  component: () => (
    <AppShell role="parent">
      <Outlet />
    </AppShell>
  ),
});
