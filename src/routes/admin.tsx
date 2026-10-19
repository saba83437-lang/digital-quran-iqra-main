import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "پنل مدیریت — بِرّ الوالدین" },
      { name: "description", content: "پنل مدیریت سامانه مرکز قرآن بِرّ الوالدین" },
    ],
  }),
  component: () => (
    <AppShell role="admin">
      <Outlet />
    </AppShell>
  ),
});
