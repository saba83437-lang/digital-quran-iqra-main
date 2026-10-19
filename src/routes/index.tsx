import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const session = getSession();
    if (!session) throw redirect({ to: "/login" });
    if (session.role === "admin") throw redirect({ to: "/admin" });
    if (session.role === "teacher") throw redirect({ to: "/teacher" });
    if (session.role === "student") throw redirect({ to: "/student" });
    if (session.role === "parent") throw redirect({ to: "/parent" });
    throw redirect({ to: "/login" });
  },
});
