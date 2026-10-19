import { supabase } from "@/lib/supabase";
import { ASSIGNMENT_FILES_BUCKET } from "../storage/assignment-storage";

export interface AssignmentCleanupResult {
  available: boolean;
  queued: number;
  deleted: number;
  failed: number;
}

function isFeatureUnavailable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    /assignment_file_cleanup_queue|secure_queue_unreferenced_assignment_files/i.test(
      error.message ?? "",
    )
  );
}

export async function deleteAssignmentSecurely(
  assignmentId: string | number,
): Promise<{ assignments: number; submissions: number }> {
  const { data, error } = await supabase.rpc("secure_delete_assignment", {
    p_assignment_id: Number(assignmentId),
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    assignments: Number(result.assignments_deleted ?? 0),
    submissions: Number(result.submissions_deleted ?? 0),
  };
}

export async function deleteSubmissionSecurely(submissionId: string | number): Promise<boolean> {
  const { data, error } = await supabase.rpc("secure_delete_submission", {
    p_submission_id: Number(submissionId),
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0) > 0;
}

async function completeCleanup(queueId: number, errorMessage: string | null): Promise<void> {
  const { error } = await supabase.rpc("secure_complete_assignment_file_cleanup", {
    p_queue_id: queueId,
    p_error: errorMessage,
  });
  if (error) throw new Error(error.message);
}

/** فقط مدیر: اسکن orphanها و پردازش مواردی که زمان نگهداری‌شان تمام شده است. */
export async function cleanupQueuedAssignmentFiles(): Promise<AssignmentCleanupResult> {
  const queuedResult = await supabase.rpc("secure_queue_unreferenced_assignment_files");
  if (queuedResult.error) {
    if (isFeatureUnavailable(queuedResult.error))
      return { available: false, queued: 0, deleted: 0, failed: 0 };
    throw new Error(queuedResult.error.message);
  }

  const { data: rows, error } = await supabase
    .from("assignment_file_cleanup_queue")
    .select("id, object_path")
    .is("processed_at", null)
    .lte("not_before", new Date().toISOString())
    .lt("attempts", 5)
    .order("requested_at")
    .limit(50);
  if (error) {
    if (isFeatureUnavailable(error)) return { available: false, queued: 0, deleted: 0, failed: 0 };
    throw new Error(error.message);
  }

  let deleted = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const { error: removeError } = await supabase.storage
      .from(ASSIGNMENT_FILES_BUCKET)
      .remove([String(row.object_path)]);
    try {
      await completeCleanup(Number(row.id), removeError?.message ?? null);
    } catch (completionError) {
      console.warn("assignment cleanup completion failed:", completionError);
    }
    if (removeError) failed += 1;
    else deleted += 1;
  }

  return {
    available: true,
    queued: Number(queuedResult.data ?? 0),
    deleted,
    failed,
  };
}
