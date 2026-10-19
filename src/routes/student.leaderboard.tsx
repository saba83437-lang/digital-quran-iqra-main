import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/student/leaderboard")({
  component: () => <Navigate to="/student/najm-results" replace />,
});
