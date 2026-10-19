import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/teacher/najm")({
  component: () => <Navigate to="/teacher/najm-results" replace />,
});
