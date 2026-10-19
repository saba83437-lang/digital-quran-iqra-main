import type { ParentAssignmentRow, ParentSubmissionRow } from "../api/parent-assignments-api";

export type ParentAssignmentState =
  "pending" | "expired" | "submitted" | "approved" | "needs_revision" | "rejected";

export interface ParentAssignmentChild {
  id: number | string;
  name: string;
  class_id: number | string | null;
  class_name: string | null;
  teacher_name: string | null;
}

export interface ParentAssignmentViewRow {
  key: string;
  child: ParentAssignmentChild;
  assignment: ParentAssignmentRow;
  attempts: ParentSubmissionRow[];
  latestSubmission: ParentSubmissionRow | null;
  deadline: Date;
  expired: boolean;
  state: ParentAssignmentState;
}

export function assignmentDeadline(assignment: ParentAssignmentRow): Date {
  const created = new Date(assignment.created_at);
  const base = Number.isNaN(created.getTime()) ? new Date(0) : created;
  return new Date(base.getTime() + Math.max(1, assignment.deadline_hours) * 3_600_000);
}

export function assignmentTargetsChild(
  assignment: ParentAssignmentRow,
  child: ParentAssignmentChild,
): boolean {
  if (String(assignment.class_id) !== String(child.class_id ?? "")) return false;
  if (assignment.target_type === "all") return true;
  return assignment.target_students.map(String).includes(String(child.id));
}

export function parentAssignmentState(
  latest: ParentSubmissionRow | null,
  expired: boolean,
): ParentAssignmentState {
  if (!latest) return expired ? "expired" : "pending";
  if (!latest.reviewed) return "submitted";
  if (latest.status === "approved") return "approved";
  if (latest.status === "needs_revision") return "needs_revision";
  if (latest.status === "rejected") return "rejected";
  return "submitted";
}

export function buildParentAssignmentRows({
  children,
  assignments,
  submissions,
  now = new Date(),
}: {
  children: ParentAssignmentChild[];
  assignments: ParentAssignmentRow[];
  submissions: ParentSubmissionRow[];
  now?: Date;
}): ParentAssignmentViewRow[] {
  const result: ParentAssignmentViewRow[] = [];
  for (const assignment of assignments) {
    for (const child of children) {
      if (!assignmentTargetsChild(assignment, child)) continue;
      const attempts = submissions
        .filter(
          (submission) =>
            submission.assignment_id === assignment.id &&
            String(submission.student_id) === String(child.id),
        )
        .sort(
          (left, right) =>
            new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime(),
        );
      const latestSubmission = attempts[0] ?? null;
      const deadline = assignmentDeadline(assignment);
      const expired = deadline.getTime() <= now.getTime();
      result.push({
        key: `${child.id}:${assignment.id}`,
        child,
        assignment,
        attempts,
        latestSubmission,
        deadline,
        expired,
        state: parentAssignmentState(latestSubmission, expired),
      });
    }
  }
  return result.sort(
    (left, right) =>
      new Date(right.assignment.created_at).getTime() -
      new Date(left.assignment.created_at).getTime(),
  );
}
