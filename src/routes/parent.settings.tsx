import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsPage } from "@/components/account-settings-page";

export const Route = createFileRoute("/parent/settings")({
  head: () => ({ meta: [{ title: "تنظیمات حساب — بِرّ الوالدین" }] }),
  component: () => <AccountSettingsPage role="parent" />,
});
