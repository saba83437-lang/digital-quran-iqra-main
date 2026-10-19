import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * مسیر قدیمی ثبت حضور حذف نشده تا Bookmarkهای قبلی نشکنند؛
 * منبع رسمی ثبت آموزشی اکنون جلسهٔ یکپارچهٔ طرح نجم است.
 */
export const Route = createFileRoute("/teacher/attendance")({
  beforeLoad: () => {
    throw redirect({ to: "/teacher/session", replace: true });
  },
  component: () => null,
});
