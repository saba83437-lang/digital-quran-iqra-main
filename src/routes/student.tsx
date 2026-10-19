import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/student")({
  head: () => ({
    meta: [
      { title: "دارالقرآن ٱلوالدین — پنل قرآن‌آموز" },
      { name: "description", content: "پنل شخصی قرآن‌آموزان دارالقرآن ٱلوالدین" },
    ],
  }),
  component: () => (
    <AppShell role="student">
      <Outlet />
    </AppShell>
  ),
});
