import { supabase } from "@/lib/supabase";

export interface ParentAssignmentAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface ParentAssignmentRow {
  id: string;
  title: string;
  description: string;
  audio_url: string | null;
  attachments: ParentAssignmentAttachment[];
  deadline_hours: number;
  type: string;
  is_required: boolean;
  notes: string;
  teacher_id: string;
  class_id: string;
  target_type: string;
  target_students: string[];
  session_date: string | null;
  created_at: string;
}

export interface ParentSubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_at: string;
  type: "audio" | "file" | "text";
  content: string;
  file_url: string | null;
  audio_url: string | null;
  reviewed: boolean;
  grade: number | null;
  feedback: string | null;
  feedback_audio_url: string | null;
  status: "pending" | "approved" | "needs_revision" | "rejected";
  reviewed_at: string | null;
  attempt_no: number;
}

export interface ParentAssignmentsSnapshot {
  assignments: ParentAssignmentRow[];
  submissions: ParentSubmissionRow[];
}

function normalizeAttachments(value: unknown): ParentAssignmentAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ParentAssignmentAttachment[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = String(row.url ?? "").trim();
    if (!url) return [];
    return [
      {
        id: String(row.id ?? url),
        name: String(row.name ?? "فایل ضمیمه"),
        url,
        type: String(row.type ?? "application/octet-stream"),
        size: Number(row.size ?? 0),
      },
    ];
  });
}

export async function loadParentAssignmentsSnapshot(): Promise<ParentAssignmentsSnapshot> {
  const [assignmentResult, submissionResult] = await Promise.all([
    supabase
      .from("assignments")
      .select(
        "id, title, description, audio_url, attachments, deadline_hours, type, is_required, notes, teacher_id, class_id, target_type, target_students, session_date, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("submissions")
      .select(
        "id, assignment_id, student_id, submitted_at, type, content, file_url, audio_url, reviewed, grade, feedback, feedback_audio_url, status, reviewed_at, attempt_no",
      )
      .order("submitted_at", { ascending: false })
      .limit(5000),
  ]);

  if (assignmentResult.error) throw new Error(`دریافت تکالیف: ${assignmentResult.error.message}`);
  if (submissionResult.error) throw new Error(`دریافت ارسال‌ها: ${submissionResult.error.message}`);

  return {
    assignments: (assignmentResult.data ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? "بدون عنوان"),
      description: String(row.description ?? ""),
      audio_url: row.audio_url == null ? null : String(row.audio_url),
      attachments: normalizeAttachments(row.attachments),
      deadline_hours: Number(row.deadline_hours ?? 24),
      type: String(row.type ?? "hifz"),
      is_required: row.is_required === true,
      notes: String(row.notes ?? ""),
      teacher_id: String(row.teacher_id ?? ""),
      class_id: String(row.class_id ?? ""),
      target_type: String(row.target_type ?? "all"),
      target_students: Array.isArray(row.target_students) ? row.target_students.map(String) : [],
      session_date: row.session_date == null ? null : String(row.session_date),
      created_at: String(row.created_at ?? ""),
    })),
    submissions: (submissionResult.data ?? []).map((row) => ({
      id: String(row.id),
      assignment_id: String(row.assignment_id),
      student_id: String(row.student_id),
      submitted_at: String(row.submitted_at ?? ""),
      type: String(row.type ?? "text") as ParentSubmissionRow["type"],
      content: String(row.content ?? ""),
      file_url: row.file_url == null ? null : String(row.file_url),
      audio_url: row.audio_url == null ? null : String(row.audio_url),
      reviewed: row.reviewed === true,
      grade: row.grade == null ? null : Number(row.grade),
      feedback: row.feedback == null ? null : String(row.feedback),
      feedback_audio_url: row.feedback_audio_url == null ? null : String(row.feedback_audio_url),
      status: String(row.status ?? "pending") as ParentSubmissionRow["status"],
      reviewed_at: row.reviewed_at == null ? null : String(row.reviewed_at),
      attempt_no: Number(row.attempt_no ?? 1),
    })),
  };
}
