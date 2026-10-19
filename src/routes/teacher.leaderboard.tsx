import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/teacher/leaderboard")({
  component: () => <Navigate to="/teacher/najm-results" replace />,
});
