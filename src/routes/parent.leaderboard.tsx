import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/parent/leaderboard")({
  component: () => <Navigate to="/parent/najm-results" replace />,
});
