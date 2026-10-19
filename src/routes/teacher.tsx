import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/teacher")({
  head: () => ({
    meta: [
      { title: "پنل معلم — بِرّ الوالدین" },
      { name: "description", content: "پنل اساتید مرکز قرآن بِرّ الوالدین" },
    ],
  }),
  component: () => (
    <AppShell role="teacher">
      <Outlet />
    </AppShell>
  ),
});
