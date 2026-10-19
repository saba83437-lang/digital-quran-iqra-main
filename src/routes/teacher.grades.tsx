import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * مسیر قدیمی ثبت نمره برای سازگاری URL حفظ شده است؛
 * نمره و حضور فقط از گردش‌کار رسمی «ثبت جلسه نجم» نوشته می‌شوند.
 */
export const Route = createFileRoute("/teacher/grades")({
  beforeLoad: () => {
    throw redirect({ to: "/teacher/session", replace: true });
  },
  component: () => null,
});
