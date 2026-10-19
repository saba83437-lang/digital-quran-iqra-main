import { getSession } from "./auth";
import { supabase } from "./supabase";
import { loadNajmScoreItems, najmMaxSessionScore, type NajmScoreItem, type NajmTerm } from "./najm";
import { displayTeacherName, displayTeacherNameOrNull } from "./display";
import { resolveFinanceReceiptReferences } from "@/features/finance/api/finance-api";
import {
  sendSecureMessage,
  updateSecureMessageState,
  type SecureMessageAttachment,
} from "@/features/messages/api/messages-api";
export interface ParentPortalPayment {
  id: number;
  student_id: number;
  semester: string;
  amount: number;
  paid_amount: number;
  date: string | null;
  status: "paid" | "pending" | "overdue" | "cancelled";
  receipt_url: string | null;
  created_at: string;
}

export interface ParentNajmRecord {
  id: string;
  session_id: string;
  student_id: number;
  session_date: string;
  term: NajmTerm;
  academic_year: string;
  class_id: number | null;
  class_name: string | null;
  is_absent: boolean;
  absence_kind: string | null;
  attendance: number;
  homework: number;
  exam_raw: number;
  exam_display: number;
  discipline: number;
  special_progress: number;
  special_help: number;
  negative_disorder: number;
  negative_disrespect: number;
  custom_scores: Record<string, number>;
  recovery_bonus: number;
  session_score: number;
  created_at: string;
}

export interface ParentChildStats {
  session_count: number;
  present_count: number;
  absent_count: number;
  attendance_rate: number;
  average_exam: number | null;
  best_exam: number | null;
  lowest_exam: number | null;
  average_homework: number | null;
  average_discipline: number | null;
  average_session_score: number | null;
  performance_percent: number | null;
  special_progress_total: number;
  special_help_total: number;
  negative_total: number;
  improvement_delta: number | null;
}

export interface ParentPortalChild {
  id: number;
  name: string;
  level: string | null;
  class_id: number | null;
  class_name: string | null;
  teacher_id: number | null;
  teacher_name: string | null;
  avatar_url: string | null;
  relation: string;
  records: ParentNajmRecord[];
  current_records: ParentNajmRecord[];
  payments: ParentPortalPayment[];
  stats: ParentChildStats;
}

export interface ParentPortalMessage {
  id: number;
  sender_user_id?: string;
  recipient_user_id?: string;
  campaign_id?: string;
  from_name: string;
  from_role: string | null;
  to_id: string | null;
  to_role: string | null;
  subject: string;
  content: string;
  date: string;
  unread: boolean;
  priority: string | null;
  topic: string | null;
  replied: boolean;
  parent_message_id: number | null;
  created_at: string;
  is_sent: boolean;
  attachments?: SecureMessageAttachment[] | null;
  delivery_status?: "scheduled" | "delivered" | "cancelled";
  scheduled_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
}

export interface ParentMessageRecipient {
  id: string;
  name: string;
  role: "admin" | "teacher";
}

export interface ParentPortalData {
  parent: {
    id: string;
    name: string;
    phone: string | null;
  };
  active_term: {
    term: NajmTerm;
    academic_year: string;
    title: string;
  } | null;
  score_items: NajmScoreItem[];
  children: ParentPortalChild[];
  messages: ParentPortalMessage[];
  message_recipients: ParentMessageRecipient[];
}

function numberOrZero(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeStats(records: ParentNajmRecord[], maxSessionScore = 30): ParentChildStats {
  const present = records.filter((record) => !record.is_absent);
  const exams = present.map((record) => record.exam_display);
  const firstHalf = [...present].sort((a, b) => a.session_date.localeCompare(b.session_date));
  const split = Math.floor(firstHalf.length / 2);
  const older = firstHalf.slice(0, split).map((record) => record.session_score);
  const newer = firstHalf.slice(split).map((record) => record.session_score);
  const olderAverage = average(older);
  const newerAverage = average(newer);
  const sessionAverage = average(present.map((record) => record.session_score));

  return {
    session_count: records.length,
    present_count: present.length,
    absent_count: records.length - present.length,
    attendance_rate: records.length ? Math.round((present.length / records.length) * 100) : 0,
    average_exam: average(exams),
    best_exam: exams.length ? Math.max(...exams) : null,
    lowest_exam: exams.length ? Math.min(...exams) : null,
    average_homework: average(present.map((record) => record.homework)),
    average_discipline: average(present.map((record) => record.discipline)),
    average_session_score: sessionAverage,
    performance_percent: sessionAverage == null ? null : (sessionAverage / maxSessionScore) * 100,
    special_progress_total: records.reduce((sum, record) => sum + record.special_progress, 0),
    special_help_total: records.reduce((sum, record) => sum + record.special_help, 0),
    negative_total: records.reduce(
      (sum, record) => sum + record.negative_disorder + record.negative_disrespect * 2,
      0,
    ),
    improvement_delta:
      olderAverage == null || newerAverage == null ? null : newerAverage - olderAverage,
  };
}

export function formatToman(value: number): string {
  return `${Math.round(value).toLocaleString("fa-IR")} تومان`;
}

export async function loadParentPortalData(): Promise<{
  data: ParentPortalData | null;
  error: string | null;
}> {
  const session = getSession();
  if (!session || session.role !== "parent") {
    return { data: null, error: "حساب والد معتبر نیست" };
  }

  try {
    const { data: parentRow, error: parentError } = await supabase
      .from("parents")
      .select("id, name, phone")
      .eq("id", session.entityId)
      .maybeSingle();
    if (parentError || !parentRow) {
      return { data: null, error: parentError?.message ?? "پرونده والد یافت نشد" };
    }

    const [{ data: links, error: linkError }, { data: activeTermRow }] = await Promise.all([
      supabase
        .from("student_parents")
        .select("student_id, relation")
        .eq("parent_id", session.entityId),
      supabase
        .from("najm_terms")
        .select("term, academic_year, title")
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    if (linkError) return { data: null, error: linkError.message };

    const relationByStudent = new Map<number, string>();
    for (const link of links ?? []) {
      relationByStudent.set(Number(link.student_id), String(link.relation ?? "ولی"));
    }
    const studentIds = [...relationByStudent.keys()];
    const scoreItems = await loadNajmScoreItems().catch(() => [] as NajmScoreItem[]);
    const maxSessionScore = najmMaxSessionScore(scoreItems);

    if (studentIds.length === 0) {
      return {
        data: {
          parent: {
            id: String(parentRow.id),
            name: String(parentRow.name ?? session.name),
            phone: parentRow.phone == null ? null : String(parentRow.phone),
          },
          active_term: (activeTermRow as ParentPortalData["active_term"]) ?? null,
          score_items: scoreItems,
          children: [],
          messages: [],
          message_recipients: [{ id: "admin", name: "مدیریت مرکز", role: "admin" }],
        },
        error: null,
      };
    }

    const [{ data: studentRows, error: studentError }, { data: paymentRows, error: paymentError }] =
      await Promise.all([
        supabase
          .from("students")
          .select("id, name, level, class_id, avatar_url, status")
          .in("id", studentIds)
          .order("name"),
        supabase
          .from("payments")
          .select(
            "id, student_id, semester, amount, paid_amount, date, status, receipt_url, created_at",
          )
          .in("student_id", studentIds)
          .order("created_at", { ascending: false }),
      ]);
    if (studentError) return { data: null, error: studentError.message };
    if (paymentError)
      return { data: null, error: `خطا در دریافت صورتحساب‌ها: ${paymentError.message}` };

    const classIds = [
      ...new Set(
        (studentRows ?? [])
          .map((student) => (student.class_id == null ? null : Number(student.class_id)))
          .filter((id): id is number => id != null),
      ),
    ];
    const { data: classRows } = classIds.length
      ? await supabase
          .from("classes")
          .select("id, name, teacher_id")
          .in("id", classIds)
          .is("deleted_at", null)
      : { data: [] as Array<{ id: number; name: string; teacher_id: number | null }> };

    const teacherIds = [
      ...new Set(
        (classRows ?? [])
          .map((classRow) => (classRow.teacher_id == null ? null : Number(classRow.teacher_id)))
          .filter((id): id is number => id != null),
      ),
    ];
    const { data: teacherRows } = teacherIds.length
      ? await supabase.from("teachers").select("id, name").in("id", teacherIds)
      : { data: [] as Array<{ id: number; name: string }> };

    const { data: recordRows, error: recordError } = await supabase
      .from("najm_session_records")
      .select(
        "id, session_id, student_id, is_absent, absence_kind, attendance, homework, exam_raw, discipline, special_progress, special_help, negative_disorder, negative_disrespect, custom_scores, recovery_bonus, session_score, created_at",
      )
      .in("student_id", studentIds.map(String))
      .limit(5000);
    if (recordError) return { data: null, error: recordError.message };

    const sessionIds = [...new Set((recordRows ?? []).map((record) => String(record.session_id)))];
    const { data: sessionRows } = sessionIds.length
      ? await supabase
          .from("najm_sessions")
          .select(
            "id, class_id, class_name, session_date, term, academic_year, is_applied, created_at",
          )
          .in("id", sessionIds)
      : { data: [] as Array<Record<string, unknown>> };

    const sessionById = new Map((sessionRows ?? []).map((row) => [String(row.id), row]));
    const recordsByStudent = new Map<number, ParentNajmRecord[]>();
    for (const rawRecord of recordRows ?? []) {
      const studentId = Number(rawRecord.student_id);
      const sessionRow = sessionById.get(String(rawRecord.session_id));
      if (!sessionRow || sessionRow.is_applied === false) continue;
      const record: ParentNajmRecord = {
        id: String(rawRecord.id),
        session_id: String(rawRecord.session_id),
        student_id: studentId,
        session_date: String(sessionRow.session_date ?? ""),
        term: sessionRow.term as NajmTerm,
        academic_year: String(sessionRow.academic_year ?? ""),
        class_id:
          sessionRow.class_id != null && /^\d+$/.test(String(sessionRow.class_id))
            ? Number(sessionRow.class_id)
            : null,
        class_name: sessionRow.class_name == null ? null : String(sessionRow.class_name),
        is_absent: rawRecord.is_absent === true || numberOrZero(rawRecord.attendance) === 0,
        absence_kind: rawRecord.absence_kind == null ? null : String(rawRecord.absence_kind),
        attendance: numberOrZero(rawRecord.attendance),
        homework: numberOrZero(rawRecord.homework),
        exam_raw: numberOrZero(rawRecord.exam_raw),
        exam_display: numberOrZero(rawRecord.exam_raw) + 10,
        discipline: numberOrZero(rawRecord.discipline),
        special_progress: numberOrZero(rawRecord.special_progress),
        special_help: numberOrZero(rawRecord.special_help),
        negative_disorder: numberOrZero(rawRecord.negative_disorder),
        negative_disrespect: numberOrZero(rawRecord.negative_disrespect),
        custom_scores: (rawRecord.custom_scores as Record<string, number> | null | undefined) ?? {},
        recovery_bonus: numberOrZero(rawRecord.recovery_bonus),
        session_score: numberOrZero(rawRecord.session_score),
        created_at: String(rawRecord.created_at ?? sessionRow.created_at ?? ""),
      };
      const list = recordsByStudent.get(studentId) ?? [];
      list.push(record);
      recordsByStudent.set(studentId, list);
    }

    for (const list of recordsByStudent.values()) {
      list.sort((a, b) => b.session_date.localeCompare(a.session_date));
    }

    const classById = new Map((classRows ?? []).map((row) => [Number(row.id), row]));
    const teacherById = new Map(
      (teacherRows ?? []).map((row) => [Number(row.id), String(row.name)]),
    );
    const signedReceiptByReference = await resolveFinanceReceiptReferences(
      (paymentRows ?? []).map((payment) =>
        payment.receipt_url == null ? null : String(payment.receipt_url),
      ),
    );
    const paymentsByStudent = new Map<number, ParentPortalPayment[]>();
    for (const payment of paymentRows ?? []) {
      const studentId = Number(payment.student_id);
      const list = paymentsByStudent.get(studentId) ?? [];
      list.push({
        id: Number(payment.id),
        student_id: studentId,
        semester: String(payment.semester ?? "—"),
        amount: numberOrZero(payment.amount),
        paid_amount: numberOrZero(payment.paid_amount),
        date: payment.date == null ? null : String(payment.date),
        status: (payment.status ?? "pending") as ParentPortalPayment["status"],
        receipt_url:
          payment.receipt_url == null
            ? null
            : (signedReceiptByReference.get(String(payment.receipt_url)) ?? null),
        created_at: String(payment.created_at ?? ""),
      });
      paymentsByStudent.set(studentId, list);
    }

    const activeTerm = (activeTermRow as ParentPortalData["active_term"]) ?? null;
    const children: ParentPortalChild[] = (studentRows ?? []).map((student) => {
      const studentId = Number(student.id);
      const classId = student.class_id == null ? null : Number(student.class_id);
      const classRow = classId == null ? null : classById.get(classId);
      const teacherId = classRow?.teacher_id == null ? null : Number(classRow.teacher_id);
      const records = recordsByStudent.get(studentId) ?? [];
      const currentRecords = activeTerm
        ? records.filter(
            (record) =>
              record.term === activeTerm.term && record.academic_year === activeTerm.academic_year,
          )
        : records;
      return {
        id: studentId,
        name: String(student.name ?? "بدون نام"),
        level: student.level == null ? null : String(student.level),
        class_id: classId,
        class_name: classRow?.name == null ? null : String(classRow.name),
        teacher_id: teacherId,
        teacher_name:
          teacherId == null ? null : displayTeacherNameOrNull(teacherById.get(teacherId)),
        avatar_url: student.avatar_url == null ? null : String(student.avatar_url),
        relation: relationByStudent.get(studentId) ?? "ولی",
        records,
        current_records: currentRecords,
        payments: paymentsByStudent.get(studentId) ?? [],
        stats: computeStats(currentRecords, maxSessionScore),
      };
    });

    const parentTargetIds = [String(parentRow.id), ...studentIds.map(String)];
    const [
      { data: inboxRows },
      { data: classMessageRows },
      { data: broadcastRows },
      { data: sentRows },
    ] = await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("to_role", "parent")
        .in("to_id", parentTargetIds)
        .order("created_at", { ascending: false })
        .limit(300),
      classIds.length
        ? supabase
            .from("messages")
            .select("*")
            .eq("to_role", "class_parents")
            .in("to_id", classIds.map(String))
            .order("created_at", { ascending: false })
            .limit(300)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      supabase
        .from("messages")
        .select("*")
        .eq("to_role", "all_parents")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("messages")
        .select("*")
        .eq("sender_user_id", session.userId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const messageMap = new Map<number, ParentPortalMessage>();
    for (const [rows, isSent] of [
      [inboxRows ?? [], false],
      [classMessageRows ?? [], false],
      [broadcastRows ?? [], false],
      [sentRows ?? [], true],
    ] as const) {
      for (const row of rows) {
        const id = Number(row.id);
        if (messageMap.has(id)) continue;
        messageMap.set(id, {
          id,
          sender_user_id: row.sender_user_id == null ? undefined : String(row.sender_user_id),
          recipient_user_id:
            row.recipient_user_id == null ? undefined : String(row.recipient_user_id),
          campaign_id: row.campaign_id == null ? undefined : String(row.campaign_id),
          from_name: String(row.from_name ?? "سامانه"),
          from_role: row.from_role == null ? null : String(row.from_role),
          to_id: row.to_id == null ? null : String(row.to_id),
          to_role: row.to_role == null ? null : String(row.to_role),
          subject: String(row.subject ?? "بدون موضوع"),
          content: String(row.content ?? ""),
          date: String(row.date ?? row.created_at ?? ""),
          unread: row.unread === true,
          priority: row.priority == null ? null : String(row.priority),
          topic: row.topic == null ? null : String(row.topic),
          replied: row.replied === true,
          parent_message_id: row.parent_message_id == null ? null : Number(row.parent_message_id),
          created_at: String(row.created_at ?? ""),
          is_sent: isSent,
          attachments: Array.isArray(row.attachments)
            ? (row.attachments as unknown as SecureMessageAttachment[])
            : [],
          delivery_status:
            row.delivery_status === "scheduled" || row.delivery_status === "cancelled"
              ? row.delivery_status
              : "delivered",
          scheduled_at: row.scheduled_at == null ? null : String(row.scheduled_at),
          delivered_at: row.delivered_at == null ? null : String(row.delivered_at),
          cancelled_at: row.cancelled_at == null ? null : String(row.cancelled_at),
        });
      }
    }
    const messages = [...messageMap.values()].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );

    const recipients: ParentMessageRecipient[] = [
      { id: "admin", name: "مدیریت مرکز", role: "admin" },
      ...(teacherRows ?? []).map((teacher) => ({
        id: String(teacher.id),
        name: displayTeacherName(teacher.name),
        role: "teacher" as const,
      })),
    ];

    return {
      data: {
        parent: {
          id: String(parentRow.id),
          name: String(parentRow.name ?? session.name),
          phone: parentRow.phone == null ? null : String(parentRow.phone),
        },
        active_term: activeTerm,
        score_items: scoreItems,
        children,
        messages,
        message_recipients: recipients,
      },
      error: null,
    };
  } catch (error) {
    console.error("loadParentPortalData failed:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "خطا در دریافت اطلاعات پنل والدین",
    };
  }
}

export async function markParentMessageRead(messageId: number): Promise<string | null> {
  try {
    await updateSecureMessageState(messageId, { unread: false });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function sendParentPortalMessage(input: {
  parentName: string;
  toId: string;
  toRole: "admin" | "teacher";
  subject: string;
  content: string;
}): Promise<string | null> {
  try {
    await sendSecureMessage({
      targetType: input.toRole,
      targetId: input.toId,
      subject: input.subject,
      content: input.content,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
