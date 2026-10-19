// ============================================================
//  پنل استاد - پیام‌رسانی چت‌محور (هر قرآن‌آموز/ولی/مدیر = یک چت)
//  جریان نمایش همان پنل مدیریت؛ ارسال فردی و اطلاعیه گروهی حفظ شده
//  مسیر مقصد: src/routes/teacher.messages.tsx
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Send,
  Megaphone,
  Inbox,
  Filter,
  Loader2,
  Search,
  ShieldCheck,
  Reply,
  X,
  CheckCheck,
  Check,
  Users,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import {
  sendSecureMessage,
  updateSecureMessageState,
  type SecureMessageAttachment,
} from "@/features/messages/api/messages-api";
import { MessageAttachmentPicker } from "@/features/messages/components/message-attachment-picker";
import { SecureMessageAttachments } from "@/features/messages/components/secure-message-attachments";
import {
  compareMessageDisplayTime,
  formatIranianMessageDateTime,
} from "@/features/messages/domain/message-date";
import {
  messageIsDeliveredTo,
  messageIsSentBy,
  secureMessageLogicalKey,
  uniqueLogicalMessages,
} from "@/features/messages/domain/message-domain";
import { withRolePrefix } from "@/lib/display";
import { getSession } from "@/lib/auth";
import { getCurrentTeacher, type CurrentTeacher } from "@/lib/teacher-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/messages")({
  head: () => ({
    meta: [
      { title: "پیام‌رسانی — بِرّ الوالدین" },
      { name: "description", content: "ارتباط با مدیریت، قرآن‌آموزان و والدین کلاس‌های شما" },
    ],
  }),
  component: TeacherMessages,
});

/* ╔══════════════════════════════════════╗
   ║           انواع و اینترفیس‌ها        ║
   ╚══════════════════════════════════════╝ */
type GroupTarget = "all_parents" | "all_students" | "class_parents" | "class_students";
type RecipientRole = "student" | "parent" | "admin" | "";
type MessageTab = "all" | "individual" | "group";

interface DbMessage {
  id: string;
  created_at?: string;
  sender_user_id?: string;
  recipient_user_id?: string;
  campaign_id?: string;
  from_name: string;
  from_role: string | null;
  from_id?: string | number | null;
  sender_id?: string | number | null;
  to_id: string | number | null;
  to_role: string | null;
  subject: string;
  content: string;
  date: string;
  unread: boolean;
  parent_message_id?: string | number | null;
  attachments?: SecureMessageAttachment[] | null;
  delivery_status?: "scheduled" | "delivered" | "cancelled";
  scheduled_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
}

interface TeacherRef {
  id: string;
  name: string;
}
interface ParentRef {
  id: string;
  name: string;
}
interface Student {
  id: string;
  name: string;
  parent_name: string | null;
  class_id?: string | null;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
/* کلید نگهداری محلی «پیام‌های دیده‌شده توسط استاد» (بدون هیچ نوشتاری در دیتابیس) */
const TEACHER_SEEN_KEY = "quran-teacher-seen-message-ids";

function toFa(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function getInitials(name: string): string {
  const p = (name ?? "").trim().split(/\s+/);
  return p.length >= 2 ? p[0][0] + p[1][0] : (p[0]?.[0] ?? "؟");
}

function sid(v: unknown): string {
  return String(v ?? "");
}

function normalizeChatName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/* ─── نمایش تاریخ و ساعت پیام (fa ذخیره‌شده یا ISO/created_at) ─── */
function fmtDateTime(message: DbMessage): string {
  return formatIranianMessageDateTime(message);
}

function stripReplyPrefix(subject: string | null | undefined): string {
  return String(subject ?? "")
    .replace(/^پاسخ:\s*/g, "")
    .trim();
}

/* ╔══════════════════════════════════════╗
   ║  موتور گفت‌وگو — همان جریان پنل مدیریت  ║
   ║  (هر جفت «یک چت»؛ زنجیرهٔ پاسخ از ریشه؛  ║
   ║   اطلاعیهٔ گروهی با همهٔ پاسخ‌هایش)       ║
   ╚══════════════════════════════════════╝ */
type ActorRole = "admin" | "teacher" | "parent" | "student" | "group" | "unknown";

interface ChatActor {
  key: string;
  id: string | null;
  role: ActorRole;
  name: string;
  subtitle: string;
  groupTargetRole?: string | null;
  groupTargetId?: string | null;
}

interface ChatMessage {
  raw: DbMessage;
  id: string;
  sender: ChatActor;
  target: ChatActor;
  sentAt: string;
  isFromAdmin: boolean;
}

interface Conversation {
  key: string;
  rootMessageId: string;
  title: string;
  subtitle: string;
  isGroup: boolean;
  groupTarget: ChatActor | null;
  participants: ChatActor[];
  messages: ChatMessage[];
  lastMessage: ChatMessage;
  unreadCount: number;
}

function normalizeActorRole(value?: string | null): ActorRole {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (["admin", "admins", "manager", "مدیر", "مدیریت", "ادمین"].includes(normalized))
    return "admin";
  if (
    ["teacher", "teachers", "معلم", "استاد", "اساتید", "استادان", "مربی", "معلمان"].includes(
      normalized,
    )
  )
    return "teacher";
  if (
    [
      "student",
      "students",
      "قرآن‌آموز",
      "قرآن_آموز",
      "قرآن‌آموزان",
      "دانش‌آموز",
      "دانش_آموز",
      "دانش‌آموزان",
      "هنرجو",
      "هنرجویان",
    ].includes(normalized)
  )
    return "student";
  if (
    [
      "parent",
      "parents",
      "ولی",
      "والد",
      "والدین",
      "ولی_دانش‌آموز",
      "ولی‌_دانش‌آموز",
      "سرپرست",
    ].includes(normalized)
  )
    return "parent";
  if (
    normalized.startsWith("all_") ||
    normalized.startsWith("class_") ||
    ["group", "class", "همه"].includes(normalized)
  )
    return "group";
  return "unknown";
}

function actorRoleLabel(role: ActorRole): string {
  if (role === "admin") return "مدیریت";
  if (role === "teacher") return "استاد";
  if (role === "student") return "قرآن‌آموز";
  if (role === "parent") return "ولی قرآن‌آموز";
  if (role === "group") return "گروه";
  return "کاربر";
}

function actorKey(role: ActorRole, id: string | null, name: string): string {
  if (role === "admin") return "admin:admin";
  if (id) return `${role}:${id}`;
  return `${role}:name:${normalizeChatName(name)}`;
}

function isGroupRoleTarget(toRole?: string | null): boolean {
  return normalizeActorRole(toRole) === "group";
}

function chatGroupLabel(
  toRole: string | null,
  toId: string | null,
  classes: { id: string; name: string }[],
): string {
  const role = String(toRole ?? "").toLowerCase();
  const className = toId ? classes.find((c) => sid(c.id) === toId)?.name : null;
  if (role === "all_students") return "همه قرآن‌آموزان";
  if (role === "all_teachers") return "همه اساتید";
  if (role === "all_parents") return "همه والدین";
  if (role === "all_users" || role === "all") return "همه کاربران مرکز";
  if (role === "class_students" || role === "students_class" || role === "class")
    return className ? `قرآن‌آموزان کلاس ${className}` : "قرآن‌آموزان یک کلاس";
  if (role === "class_parents" || role === "parents_class")
    return className ? `والدین کلاس ${className}` : "والدین یک کلاس";
  if (role === "class_teachers") return className ? `اساتید کلاس ${className}` : "اساتید یک کلاس";
  return toId ? `گروه ${toId}` : "پیام گروهی";
}

interface DirectoryMaps {
  studentByName: Map<string, string>;
  teacherByName: Map<string, string>;
  parentByName: Map<string, string>;
}

function buildDirectoryMaps(
  students: Student[],
  teachers: TeacherRef[],
  parents: ParentRef[],
): DirectoryMaps {
  const studentByName = new Map<string, string>();
  for (const s of students) studentByName.set(normalizeChatName(s.name), sid(s.id));
  const teacherByName = new Map<string, string>();
  for (const t of teachers) teacherByName.set(normalizeChatName(t.name), sid(t.id));
  const parentByName = new Map<string, string>();
  for (const p of parents) parentByName.set(normalizeChatName(p.name), sid(p.id));
  for (const s of students)
    if (s.parent_name && !parentByName.has(normalizeChatName(s.parent_name)))
      parentByName.set(normalizeChatName(s.parent_name), sid(s.id));
  return { studentByName, teacherByName, parentByName };
}

const GENERIC_SENDER_NAMES = new Set([
  "",
  "استاد",
  "معلم",
  "مربی",
  "قرآن‌آموز",
  "دانش‌آموز",
  "هنرجو",
  "ولی",
  "والد",
  "کاربر",
  "نامشخص",
  "گیرنده نامشخص",
  "unknown",
  "user",
  "-",
  "بدون نام",
  "null",
]);

function resolveSender(
  message: DbMessage,
  students: Student[],
  teachers: TeacherRef[],
  parents: ParentRef[],
  currentUserId: string,
  currentTeacher: CurrentTeacher | null,
): ChatActor {
  const role = normalizeActorRole(message.from_role);
  const isCurrentTeacher =
    role === "teacher" &&
    currentUserId !== "" &&
    String(message.sender_user_id ?? "") === currentUserId;
  let name = String(isCurrentTeacher ? currentTeacher?.name : (message.from_name ?? "")).trim();
  if (role === "admin") {
    return {
      key: "admin:admin",
      id: "admin",
      role: "admin",
      name: name || "مدیریت مرکز",
      subtitle: "مدیریت",
    };
  }
  const maps = buildDirectoryMaps(students, teachers, parents);
  let resolvedId = isCurrentTeacher
    ? String(currentTeacher?.id ?? "") || null
    : message.sender_id == null
      ? message.from_id == null
        ? null
        : sid(message.from_id)
      : sid(message.sender_id);
  if (!resolvedId && role === "student")
    resolvedId = maps.studentByName.get(normalizeChatName(name)) ?? null;
  if (!resolvedId && role === "teacher")
    resolvedId = maps.teacherByName.get(normalizeChatName(name)) ?? null;
  if (!resolvedId && role === "parent")
    resolvedId = maps.parentByName.get(normalizeChatName(name)) ?? null;
  if (resolvedId && GENERIC_SENDER_NAMES.has(normalizeChatName(name))) {
    const realName =
      role === "teacher"
        ? teachers.find((t) => sid(t.id) === resolvedId)?.name
        : role === "student"
          ? students.find((s) => sid(s.id) === resolvedId)?.name
          : role === "parent"
            ? (parents.find((p) => sid(p.id) === resolvedId)?.name ??
              students.find((s) => sid(s.id) === resolvedId)?.parent_name)
            : undefined;
    if (realName) name = String(realName);
  }
  if (!name) name = actorRoleLabel(role);
  return {
    key: actorKey(role, resolvedId, name),
    id: resolvedId,
    role,
    name,
    subtitle: actorRoleLabel(role),
  };
}

function resolveTarget(
  message: DbMessage,
  students: Student[],
  teachers: TeacherRef[],
  parents: ParentRef[],
  classes: { id: string; name: string }[],
  senderRole?: ActorRole,
): ChatActor {
  const rawToId =
    message.to_id == null || sid(message.to_id).trim() === "" ? null : sid(message.to_id);
  if (isGroupRoleTarget(message.to_role)) {
    const name = chatGroupLabel(message.to_role, rawToId, classes);
    return {
      key: `group:${message.to_role ?? "group"}:${rawToId ?? "all"}`,
      id: rawToId,
      role: "group",
      name,
      subtitle: "پیام گروهی",
      groupTargetRole: message.to_role,
      groupTargetId: rawToId,
    };
  }
  const role = normalizeActorRole(message.to_role);
  if (role === "admin" || (!rawToId && role === "unknown")) {
    return {
      key: "admin:admin",
      id: "admin",
      role: "admin",
      name: "مدیریت مرکز",
      subtitle: "مدیریت",
    };
  }
  if (role === "teacher") {
    const teacher = teachers.find((t) => sid(t.id) === rawToId);
    return {
      key: actorKey("teacher", rawToId, teacher?.name ?? "استاد"),
      id: rawToId,
      role: "teacher",
      name: teacher?.name ?? "استاد",
      subtitle: "استاد",
    };
  }
  if (role === "student") {
    const student = students.find((s) => sid(s.id) === rawToId);
    return {
      key: actorKey("student", rawToId, student?.name ?? "قرآن‌آموز"),
      id: rawToId,
      role: "student",
      name: student?.name ?? "قرآن‌آموز",
      subtitle: "قرآن‌آموز",
    };
  }
  if (role === "parent") {
    const parent = parents.find((p) => sid(p.id) === rawToId);
    const student = students.find((s) => sid(s.id) === rawToId);
    const name = parent?.name ?? student?.parent_name ?? "ولی قرآن‌آموز";
    return {
      key: actorKey("parent", rawToId, name),
      id: rawToId,
      role: "parent",
      name,
      subtitle: "ولی قرآن‌آموز",
    };
  }
  if (rawToId === "admin") {
    return {
      key: "admin:admin",
      id: "admin",
      role: "admin",
      name: "مدیریت مرکز",
      subtitle: "مدیریت",
    };
  }
  const probeOrder: ("teacher" | "student" | "parent")[] =
    senderRole === "student" || senderRole === "parent"
      ? ["teacher", "student", "parent"]
      : senderRole === "teacher"
        ? ["student", "parent", "teacher"]
        : ["teacher", "student", "parent"];
  for (const probe of probeOrder) {
    if (probe === "teacher") {
      const hit = teachers.find((t) => sid(t.id) === rawToId);
      if (hit)
        return {
          key: actorKey("teacher", rawToId, hit.name),
          id: rawToId,
          role: "teacher",
          name: hit.name,
          subtitle: "استاد",
        };
    } else if (probe === "student") {
      const hit = students.find((s) => sid(s.id) === rawToId);
      if (hit)
        return {
          key: actorKey("student", rawToId, hit.name),
          id: rawToId,
          role: "student",
          name: hit.name,
          subtitle: "قرآن‌آموز",
        };
    } else {
      const hitName =
        parents.find((p) => sid(p.id) === rawToId)?.name ??
        students.find((s) => sid(s.id) === rawToId)?.parent_name;
      if (hitName)
        return {
          key: actorKey("parent", rawToId, hitName),
          id: rawToId,
          role: "parent",
          name: hitName,
          subtitle: "ولی قرآن‌آموز",
        };
    }
  }
  return {
    key: actorKey("unknown", rawToId, "گیرنده نامشخص"),
    id: rawToId,
    role: "unknown",
    name: "گیرنده نامشخص",
    subtitle: "کاربر",
  };
}

function directConversationKey(sender: ChatActor, target: ChatActor): string {
  return `direct:${[sender.key, target.key].sort().join("|")}`;
}

function compareChatTime(a: DbMessage, b: DbMessage): number {
  return compareMessageDisplayTime(a, b);
}

function buildConversations(
  messages: DbMessage[],
  students: Student[],
  teachers: TeacherRef[],
  parents: ParentRef[],
  classes: { id: string; name: string }[],
  currentUserId: string,
  currentTeacher: CurrentTeacher | null,
): Conversation[] {
  const messageById = new Map<string, DbMessage>(messages.map((m) => [sid(m.id), m]));

  const findRootMessage = (message: DbMessage): DbMessage => {
    let current = message;
    const visited = new Set<string>();
    while (current.parent_message_id != null) {
      const parentId = sid(current.parent_message_id);
      if (visited.has(parentId)) break;
      visited.add(parentId);
      const parent = messageById.get(parentId);
      if (!parent) break;
      current = parent;
    }
    return current;
  };

  const chatMessages: ChatMessage[] = messages.map((raw) => {
    const sender = resolveSender(raw, students, teachers, parents, currentUserId, currentTeacher);
    const target = resolveTarget(raw, students, teachers, parents, classes, sender.role);
    return {
      raw,
      id: sid(raw.id),
      sender,
      target,
      sentAt: String(raw.created_at ?? raw.date ?? ""),
      isFromAdmin: sender.role === "admin",
    };
  });
  const chatMessageById = new Map<string, ChatMessage>(chatMessages.map((m) => [m.id, m]));

  const grouped = new Map<string, ChatMessage[]>();
  const rootByConversation = new Map<string, string>();

  for (const message of chatMessages) {
    const rootRaw = findRootMessage(message.raw);
    const rootMessage = chatMessageById.get(sid(rootRaw.id)) ?? message;
    const key =
      rootMessage.target.role === "group"
        ? `group-thread:${rootMessage.target.key}:${rootMessage.id}`
        : directConversationKey(rootMessage.sender, rootMessage.target);
    const list = grouped.get(key) ?? [];
    list.push(message);
    grouped.set(key, list);
    if (!rootByConversation.has(key)) rootByConversation.set(key, rootMessage.id);
  }

  return [...grouped.entries()]
    .map(([key, items]) => {
      const ordered = [...items].sort((a, b) => compareChatTime(a.raw, b.raw));
      const lastMessage = ordered[ordered.length - 1];
      const actors = new Map<string, ChatActor>();
      for (const item of ordered) {
        if (item.sender.role !== "group") actors.set(item.sender.key, item.sender);
        if (item.target.role !== "group") actors.set(item.target.key, item.target);
      }
      const participants = [...actors.values()];
      const groupTarget = ordered.find((i) => i.target.role === "group")?.target ?? null;
      const meKey = teachers[0] ? actorKey("teacher", sid(teachers[0].id), teachers[0].name) : "";
      const nonSelfParticipants = participants.filter((p) => p.key !== meKey && p.role !== "admin");
      const title = groupTarget
        ? groupTarget.name
        : nonSelfParticipants.length > 0
          ? nonSelfParticipants.map((p) => withRolePrefix(p.name, p.role)).join(" ↔ ")
          : participants.some((p) => p.role === "admin")
            ? "گفتگو با مدیریت"
            : participants.map((p) => withRolePrefix(p.name, p.role)).join(" ↔ ");
      const subtitle = groupTarget
        ? "مکالمه گروهی"
        : participants
            .map((p) => p.subtitle)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(" ↔ ");
      const unreadCount = ordered.filter(
        (item) =>
          item.raw.unread === true &&
          (messageIsDeliveredTo(item.raw, currentUserId) || item.target.key === meKey),
      ).length;
      return {
        key,
        rootMessageId: rootByConversation.get(key) ?? ordered[0].id,
        title,
        subtitle,
        isGroup: groupTarget !== null,
        groupTarget,
        participants,
        messages: ordered,
        lastMessage,
        unreadCount,
      };
    })
    .sort((a, b) => compareChatTime(b.lastMessage.raw, a.lastMessage.raw));
}

/* ╔══════════════════════════════════════╗
   ║           کامپوننت اصلی              ║
   ╚══════════════════════════════════════╝ */
function TeacherMessages() {
  const [teacher, setTeacher] = useState<CurrentTeacher | null>(null);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "inbox" | "sent">("all");
  const [activeTab, setActiveTab] = useState<MessageTab>("all");
  const [search, setSearch] = useState("");

  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [recipientRole, setRecipientRole] = useState<RecipientRole>("");
  const [recipientId, setRecipientId] = useState("");
  const [groupTarget, setGroupTarget] = useState<GroupTarget | "">("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyRecipientKey, setReplyRecipientKey] = useState("");
  const [replyingSending, setReplyingSending] = useState(false);

  /* ─── «دیده‌شده توسط استاد» — فقط محلی (localStorage)؛ هیچ نوشتاری روی پیام‌های دیگران نمی‌شود ─── */
  const [seenByTeacher, setSeenByTeacher] = useState<Set<string>>(() => {
    try {
      return new Set<string>(
        JSON.parse(localStorage.getItem(TEACHER_SEEN_KEY) ?? "[]") as string[],
      );
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(TEACHER_SEEN_KEY, JSON.stringify([...seenByTeacher].slice(-10000)));
    } catch {
      /* ignore */
    }
  }, [seenByTeacher]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const t = await getCurrentTeacher();
    setTeacher(t);

    if (!t) {
      setLoading(false);
      return;
    }

    const { data: clsData } = await supabase
      .from("classes")
      .select("id, name")
      .eq("teacher_id", t.id);

    const teacherClasses = (clsData ?? []).map((c: any) => ({
      id: String(c.id),
      name: c.name ?? "کلاس بدون نام",
    }));
    setClasses(teacherClasses);
    const classIds = teacherClasses.map((c) => c.id);
    let studentIds: string[] = [];
    let myStudents: Student[] = [];

    if (classIds.length > 0) {
      const { data: stuData } = await supabase
        .from("students")
        .select("id, name, parent_name, class_id")
        .in("class_id", classIds);

      myStudents = (stuData ?? []).map((s: any) => ({
        id: String(s.id),
        name: s.name ?? "بدون نام",
        parent_name: s.parent_name ?? null,
        class_id: s.class_id ? String(s.class_id) : null,
      }));
      setStudents(myStudents);
      studentIds = myStudents.map((s) => s.id);
    } else {
      setStudents([]);
    }

    const { data: mData } = await supabase
      .from("messages")
      .select("*")
      .order("date", { ascending: false });

    const allMessages = (mData ?? []) as DbMessage[];
    const currentUserId = getSession()?.userId ?? "";

    const relevantMessages = allMessages.filter((m) => {
      const isInboxFromAdmin = m.from_role === "admin";
      const isDirectToTeacher = m.to_role === "teacher" && String(m.to_id ?? "") === String(t.id);
      const isSentByThisTeacher =
        (currentUserId && String(m.sender_user_id ?? "") === currentUserId) ||
        (m.from_role === "teacher" && m.from_name === t.name);
      const isToMyStudent = studentIds.includes(String(m.to_id ?? ""));
      const isFromMyStudentName = studentIds.some((sid) => {
        const studentName = myStudents.find((s) => s.id === sid)?.name ?? "";
        return Boolean(studentName && m.from_name?.includes(studentName));
      });

      return (
        isInboxFromAdmin ||
        isDirectToTeacher ||
        isSentByThisTeacher ||
        isToMyStudent ||
        isFromMyStudentName
      );
    });

    setMessages(relevantMessages);
    /* نخستین اجرا: موجودی فعلی «دیده‌شده» فرض می‌شود تا همه یک‌باره قرمز نشوند */
    if (localStorage.getItem(TEACHER_SEEN_KEY) === null) {
      setSeenByTeacher(new Set(relevantMessages.map((x) => sid(x.id))));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ─── به‌روزرسانی زنده با تغییر هر پیام ─── */
  useEffect(() => {
    const channel = supabase
      .channel("teacher-messages-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        loadData();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const teachersRef = useMemo<TeacherRef[]>(
    () => (teacher ? [{ id: String(teacher.id), name: teacher.name }] : []),
    [teacher],
  );
  const myActorKey = teacher ? `teacher:${String(teacher.id)}` : "";
  const currentAuthUserId = getSession()?.userId ?? "";

  const unreadToMe = messages.filter(
    (message) =>
      message.unread &&
      ((currentAuthUserId && String(message.recipient_user_id ?? "") === currentAuthUserId) ||
        (message.to_role === "teacher" &&
          String(message.to_id ?? "") === String(teacher?.id ?? ""))),
  ).length;

  /* ─── فیلتر پیام‌محور (دریافتی/ارسالی + جستجو) ─── */
  const visible = useMemo(() => {
    let list = messages;
    if (filter === "inbox") {
      list = list.filter(
        (message) =>
          (currentAuthUserId && String(message.recipient_user_id ?? "") === currentAuthUserId) ||
          (message.to_role === "teacher" && String(message.to_id ?? "") === String(teacher?.id)),
      );
    } else if (filter === "sent") {
      list = list.filter(
        (message) =>
          (currentAuthUserId && String(message.sender_user_id ?? "") === currentAuthUserId) ||
          (message.from_role === "teacher" && message.from_name === teacher?.name),
      );
    }
    const q = search.trim();
    if (q) {
      list = list.filter(
        (m) => m.subject?.includes(q) || m.content?.includes(q) || m.from_name?.includes(q),
      );
    }
    return list;
  }, [messages, filter, teacher, search, currentAuthUserId]);

  const logicalMessages = useMemo(() => uniqueLogicalMessages(messages), [messages]);

  /* ─── گفت‌وگوها: هر campaign گروهی فقط یک حباب منطقی دارد ─── */
  const conversations = useMemo(
    () =>
      buildConversations(
        logicalMessages,
        students,
        teachersRef,
        [],
        classes,
        currentAuthUserId,
        teacher,
      ),
    [logicalMessages, students, teachersRef, classes, currentAuthUserId, teacher],
  );

  const visibleIds = useMemo(() => new Set(visible.map((m) => sid(m.id))), [visible]);

  /* ─── تشخیص ارسال گروهیِ expand‌شده (کپیِ هر نفر) ─── */
  const broadcastSignatures = useMemo(() => {
    const sigMap = new Map<string, Set<string>>();
    for (const m of messages) {
      if (isGroupRoleTarget(m.to_role)) continue;
      const sig = m.campaign_id
        ? `campaign:${m.campaign_id}`
        : `${normalizeChatName(m.from_name)}|${stripReplyPrefix(m.subject)}|${m.content}|${m.date}`;
      const bucket = sigMap.get(sig) ?? new Set<string>();
      bucket.add(`${m.to_role ?? ""}:${sid(m.to_id)}`);
      sigMap.set(sig, bucket);
    }
    const groupSigs = new Set<string>();
    for (const [sig, bucket] of sigMap) if (bucket.size > 1) groupSigs.add(sig);
    return groupSigs;
  }, [messages]);

  const sendKindOf = useCallback(
    (m: DbMessage): "group" | "individual" => {
      if (isGroupRoleTarget(m.to_role)) return "group";
      return broadcastSignatures.has(
        m.campaign_id
          ? `campaign:${m.campaign_id}`
          : `${normalizeChatName(m.from_name)}|${stripReplyPrefix(m.subject)}|${m.content}|${m.date}`,
      )
        ? "group"
        : "individual";
    },
    [broadcastSignatures],
  );

  const groupConvKeys = useMemo(() => {
    const s = new Set<string>();
    for (const c of conversations) {
      if (c.isGroup) {
        s.add(c.key);
        continue;
      }
      const rootMessages = c.messages.filter((cm) => cm.raw.parent_message_id == null);
      if (rootMessages.length > 0 && rootMessages.every((cm) => sendKindOf(cm.raw) === "group"))
        s.add(c.key);
    }
    return s;
  }, [conversations, sendKindOf]);

  const conversationItems = useMemo(
    () =>
      conversations.filter((c) => {
        if (activeTab === "individual" && groupConvKeys.has(c.key)) return false;
        if (activeTab === "group" && !groupConvKeys.has(c.key)) return false;
        return c.messages.some((cm) => visibleIds.has(cm.id));
      }),
    [conversations, visibleIds, activeTab, groupConvKeys],
  );

  /* ─── شمارش «جدید برای استاد» در هر چت ─── */
  const newCountOf = useCallback(
    (conversation: Conversation): number => {
      const logicalKeys = new Set<string>();
      for (const message of conversation.messages) {
        if (
          message.raw.unread === true &&
          (messageIsDeliveredTo(message.raw, currentAuthUserId) ||
            message.target.key === myActorKey)
        )
          logicalKeys.add(secureMessageLogicalKey(message.raw));
      }
      return logicalKeys.size;
    },
    [currentAuthUserId, myActorKey],
  );

  /* ─── گفت‌وگوی باز ─── */
  const selectedConversation = useMemo(
    () =>
      conversationItems.find((c) => c.key === selectedConversationKey) ??
      conversations.find((c) => c.key === selectedConversationKey) ??
      null,
    [conversationItems, conversations, selectedConversationKey],
  );

  /* ─── گیرندگان ممکن پاسخ در گفت‌وگوی باز ─── */
  const replyRecipients = useMemo(() => {
    if (!selectedConversation || !teacher) return [] as ChatActor[];
    const others = selectedConversation.participants.filter(
      (p) => p.key !== myActorKey && p.role !== "group" && p.role !== "unknown",
    );
    // پیش‌فرض: طرفِ آخرین پیام اول باشد
    const last = selectedConversation.lastMessage;
    const counterparty = last.sender.key === myActorKey ? last.target : last.sender;
    return [...others].sort((a, b) =>
      a.key === counterparty.key ? -1 : b.key === counterparty.key ? 1 : 0,
    );
  }, [selectedConversation, teacher, myActorKey]);

  useEffect(() => {
    if (!selectedConversation) {
      setReplyRecipientKey("");
      return;
    }
    setReplyRecipientKey((current) =>
      replyRecipients.some((r) => r.key === current) ? current : (replyRecipients[0]?.key ?? ""),
    );
  }, [selectedConversation, replyRecipients]);

  const markRead = async (m: DbMessage) => {
    if (!m.unread) return;
    await updateSecureMessageState(m.id, { unread: false });
    setMessages((prev) => prev.map((x) => (sid(x.id) === sid(m.id) ? { ...x, unread: false } : x)));
  };

  /* ─── باز کردن چت: فقط پیام‌هایی که گیرنده‌شان خود استاد است خوانده می‌شوند ─── */
  const openConversation = (conversation: Conversation) => {
    setSelectedConversationKey(conversation.key);
    for (const cm of conversation.messages) {
      if (
        cm.raw.unread &&
        (messageIsDeliveredTo(cm.raw, currentAuthUserId) || cm.target.key === myActorKey)
      )
        void markRead(cm.raw);
    }
    setSeenByTeacher((prev) => {
      const next = new Set(prev);
      for (const cm of conversation.messages) next.add(cm.id);
      return next;
    });
    setReplyContent("");
  };

  const filteredStudents = useMemo(() => {
    const q = recipientSearch.trim();
    if (!q) return students;
    return students.filter((s) => s.name.includes(q) || s.parent_name?.includes(q));
  }, [students, recipientSearch]);

  const individualOptions =
    recipientRole === "admin"
      ? [{ id: "admin", label: "مدیریت دارالقرآن" }]
      : recipientRole === "student"
        ? filteredStudents.map((s) => ({ id: s.id, label: s.name }))
        : recipientRole === "parent"
          ? filteredStudents
              .filter((s) => s.parent_name)
              .map((s) => ({ id: s.id, label: `${s.parent_name} (ولی ${s.name})` }))
          : [];

  const canSend =
    subject.trim() &&
    content.trim() &&
    ((mode === "individual" && recipientRole && recipientId) ||
      (mode === "group" &&
        groupTarget &&
        (!["class_parents", "class_students"].includes(groupTarget) || selectedClassId)));

  const resetForm = () => {
    setMode("individual");
    setRecipientRole("");
    setRecipientId("");
    setGroupTarget("");
    setSelectedClassId("");
    setSubject("");
    setContent("");
    setMessageFiles([]);
    setRecipientSearch("");
  };

  const sendMessage = async () => {
    if (!canSend) {
      toast.error("لطفاً گیرنده، موضوع و متن پیام را تکمیل کنید");
      return;
    }
    setSending(true);
    try {
      const result = await sendSecureMessage({
        targetType: mode === "individual" ? recipientRole : groupTarget,
        targetId:
          mode === "individual"
            ? recipientRole === "admin"
              ? "admin"
              : recipientId
            : ["class_parents", "class_students"].includes(groupTarget)
              ? selectedClassId
              : null,
        subject,
        content,
        files: messageFiles,
      });
      toast.success(`پیام امن برای ${result.recipientCount.toLocaleString("fa-IR")} حساب ارسال شد`);
      resetForm();
      await loadData();
    } catch (error) {
      toast.error("خطا در ارسال پیام: " + (error instanceof Error ? error.message : error));
    } finally {
      setSending(false);
    }
  };

  /* ─── پاسخ داخل چت: به گیرندهٔ انتخاب‌شده، متصل به ریشهٔ همان چت ─── */
  const sendReply = async () => {
    if (!selectedConversation || !replyContent.trim() || !teacher) return;
    const recipient = replyRecipients.find((r) => r.key === replyRecipientKey);
    if (!recipient) {
      toast.error("گیرندهٔ پاسخ مشخص نیست");
      return;
    }
    setReplyingSending(true);

    const lastRaw = selectedConversation.lastMessage.raw;
    const subjectSource = stripReplyPrefix(lastRaw.subject) || selectedConversation.title;
    try {
      await sendSecureMessage({
        targetType:
          recipient.role === "group" ? (recipient.groupTargetRole ?? "all") : recipient.role,
        targetId: recipient.role === "group" ? (recipient.groupTargetId ?? null) : recipient.id,
        subject: `پاسخ: ${subjectSource}`,
        content: replyContent,
        parentMessageId: selectedConversation.rootMessageId,
        files: replyFiles,
      });
      toast.success("✅ پاسخ امن ارسال شد");
      setReplyContent("");
      setReplyFiles([]);
      await loadData();
    } catch (error) {
      toast.error("خطا در ارسال پاسخ: " + (error instanceof Error ? error.message : error));
    } finally {
      setReplyingSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری...</span>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="پیام‌رسانی"
        description="هر قرآن‌آموز، ولی یا مدیر = یک چت واحد؛ ارسال فردی و اطلاعیه گروهی به کلاس‌های شما."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 shadow-card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <h2 className="font-display text-lg text-foreground flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" />
              گفتگوها ({toFa(conversationItems.length)})
            </h2>
            <div className="flex items-center gap-2">
              {unreadToMe > 0 && (
                <Badge className="bg-gold text-gold-foreground">{toFa(unreadToMe)} پیام جدید</Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => loadData()}
                disabled={loading}
                title="به‌روزرسانی"
              >
                <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />{" "}
                به‌روزرسانی
              </Button>
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="inbox">دریافتی</SelectItem>
                  <SelectItem value="sent">ارسال‌شده</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* تب‌ها: همه / فردی / گروهی */}
          <div className="flex items-center gap-1 bg-secondary/50 border p-1 rounded-xl mb-3">
            {[
              { key: "all" as MessageTab, label: "همه" },
              { key: "individual" as MessageTab, label: "👤 فردی" },
              { key: "group" as MessageTab, label: "📢 گروهی" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 text-xs py-1.5 px-3 rounded-lg font-bold transition-all ${activeTab === tab.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="جستجو در گفتگوها..."
              className="pr-9 text-sm h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2 max-h-[540px] overflow-y-auto pl-1">
            {conversationItems.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">گفتگویی یافت نشد.</p>
            )}
            {conversationItems.map((conversation) => {
              const newCount = newCountOf(conversation);
              const hasUnread = newCount > 0;
              const m = conversation.lastMessage.raw;
              return (
                <button
                  key={conversation.key}
                  onClick={() => openConversation(conversation)}
                  className={`group w-full text-right p-2.5 rounded-xl border transition flex items-center gap-2.5 ${
                    hasUnread
                      ? "border-red-300 bg-red-50/70 hover:bg-red-50 shadow-sm"
                      : "bg-card border-border hover:bg-secondary/50"
                  }`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback
                      className={
                        hasUnread
                          ? "bg-red-100 text-red-700 text-xs font-bold"
                          : "bg-primary/15 text-primary text-xs font-bold"
                      }
                    >
                      {conversation.isGroup ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        getInitials(conversation.title)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-[13px] truncate font-black ${hasUnread ? "text-red-700" : "text-foreground"}`}
                      >
                        {withRolePrefix(
                          conversation.lastMessage.sender.name,
                          conversation.lastMessage.sender.role,
                        )}
                      </span>
                      <span className="text-muted-foreground text-[11px] shrink-0">←</span>
                      <span
                        className={`text-[13px] truncate font-bold ${hasUnread ? "text-red-700/90" : "text-foreground/90"}`}
                      >
                        {conversation.lastMessage.target.name}
                      </span>
                      {(conversation.isGroup || groupConvKeys.has(conversation.key)) && (
                        <Badge className="bg-gold/20 text-gold-foreground border-0 text-[9px] py-0 shrink-0 font-bold">
                          گروهی
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground font-bold shrink-0">
                        ({toFa(conversation.messages.length)})
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {stripReplyPrefix(m.subject)
                        ? `موضوع: ${stripReplyPrefix(m.subject)} — `
                        : ""}
                      {m.content}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {hasUnread && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-600 text-white font-black animate-pulse">
                        {toFa(newCount)} جدید
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {fmtDateTime(m)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 shadow-card h-fit">
          <h2 className="font-display text-lg text-foreground mb-4 flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            پیام جدید
          </h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={mode === "individual" ? "default" : "outline"}
                className={mode === "individual" ? "gradient-primary text-primary-foreground" : ""}
                onClick={() => setMode("individual")}
              >
                پیام فردی
              </Button>
              <Button
                variant={mode === "group" ? "default" : "outline"}
                className={mode === "group" ? "gradient-primary text-primary-foreground" : ""}
                onClick={() => setMode("group")}
              >
                <Megaphone className="h-3.5 w-3.5 ml-1" />
                اطلاعیه گروهی
              </Button>
            </div>

            {mode === "individual" ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    نقش گیرنده
                  </label>
                  <Select
                    value={recipientRole}
                    onValueChange={(v) => {
                      const role = v as RecipientRole;
                      setRecipientRole(role);
                      setRecipientId(role === "admin" ? "admin" : "");
                      setRecipientSearch("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب نقش..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <span className="inline-flex items-center gap-2">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          مدیر / مدیریت دارالقرآن
                        </span>
                      </SelectItem>
                      <SelectItem value="student">قرآن‌آموز</SelectItem>
                      <SelectItem value="parent">ولی دانش‌آموز</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {recipientRole && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      گیرنده
                    </label>
                    {recipientRole !== "admin" && (
                      <div className="relative mb-2">
                        <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="جستجوی قرآن‌آموز..."
                          className="pr-9 text-sm"
                          value={recipientSearch}
                          onChange={(e) => setRecipientSearch(e.target.value)}
                        />
                      </div>
                    )}
                    <Select value={recipientId} onValueChange={setRecipientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="انتخاب..." />
                      </SelectTrigger>
                      <SelectContent>
                        {individualOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.label}
                          </SelectItem>
                        ))}
                        {individualOptions.length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            موردی یافت نشد
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            ) : (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  گروه گیرنده
                </label>
                <Select
                  value={groupTarget}
                  onValueChange={(v) => {
                    setGroupTarget(v as GroupTarget);
                    setSelectedClassId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب گروه..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_parents">همه والدین کلاس‌های من</SelectItem>
                    <SelectItem value="all_students">همه قرآن‌آموزان کلاس‌های من</SelectItem>
                    <SelectItem value="class_parents">والدین یک کلاس</SelectItem>
                    <SelectItem value="class_students">قرآن‌آموزان یک کلاس</SelectItem>
                  </SelectContent>
                </Select>
                {["class_parents", "class_students"].includes(groupTarget) && (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      انتخاب کلاس
                    </label>
                    <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                      <SelectTrigger>
                        <SelectValue placeholder="کلاس مورد نظر..." />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                        {classes.length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            کلاسی برای شما ثبت نشده است
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                موضوع
              </label>
              <Input
                placeholder="موضوع پیام..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">متن</label>
              <Textarea
                rows={4}
                placeholder="متن پیام خود را وارد کنید..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <MessageAttachmentPicker
              files={messageFiles}
              onChange={setMessageFiles}
              disabled={sending}
              compact
            />
            <Button
              className="w-full gradient-primary text-primary-foreground gap-2"
              onClick={sendMessage}
              disabled={sending || !canSend}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              ارسال پیام
            </Button>
          </div>
        </Card>
      </div>

      {/* ═══ مودال چت ═══ */}
      <Dialog
        open={!!selectedConversation}
        onOpenChange={(open) => !open && setSelectedConversationKey(null)}
      >
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-hidden p-0 gap-0" dir="rtl">
          {selectedConversation && teacher && (
            <div className="flex max-h-[88vh] flex-col">
              <div className="border-b p-4 flex items-start justify-between gap-3">
                <DialogHeader className="p-0 text-right">
                  <DialogTitle className="font-display text-base font-bold flex items-center gap-2">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                        {selectedConversation.isGroup ? (
                          <Users className="h-4 w-4" />
                        ) : (
                          getInitials(selectedConversation.title)
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {selectedConversation.title}
                  </DialogTitle>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {selectedConversation.isGroup ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-md border font-bold bg-gold/15 text-gold-foreground border-gold/30">
                        <Megaphone className="h-3 w-3" /> چت گروهی
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-md border font-bold bg-primary/10 text-primary border-primary/20">
                        <UserCheck className="h-3 w-3" /> چت فردی
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-bold">
                      {toFa(selectedConversation.messages.length)} پیام
                    </span>
                    <span className="text-[10px] text-muted-foreground font-bold">
                      · آخرین پیام: {fmtDateTime(selectedConversation.lastMessage.raw)}
                    </span>
                  </div>
                </DialogHeader>
                <button
                  onClick={() => setSelectedConversationKey(null)}
                  className="h-8 w-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedConversation.isGroup && (
                <div className="px-4 py-2 bg-gold/10 border-b border-gold/20 flex items-center gap-2 text-[11px] font-bold text-gold-foreground shrink-0">
                  <Megaphone className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    این چت مربوط به اطلاعیهٔ گروهی «
                    {selectedConversation.groupTarget?.name ?? selectedConversation.title}» است؛
                    اطلاعیه و پاسخ‌های مرتبط با آن اینجا نمایش داده می‌شوند.
                  </span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto bg-secondary/20 p-4 space-y-3">
                {selectedConversation.messages.map((tm, ti) => {
                  const prev = ti > 0 ? selectedConversation.messages[ti - 1] : null;
                  const showSender = !prev || prev.sender.key !== tm.sender.key;
                  const isMine =
                    messageIsSentBy(tm.raw, currentAuthUserId) || tm.sender.key === myActorKey;
                  const kind = sendKindOf(tm.raw);
                  return (
                    <div key={tm.id} className={`flex ${isMine ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[82%] rounded-2xl p-3.5 shadow-sm ${
                          isMine
                            ? "bg-primary/10 border border-primary/20 rounded-br-md"
                            : "bg-card border border-border rounded-bl-md"
                        }`}
                      >
                        {showSender && (
                          <div className="flex items-center gap-2 mb-1.5">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback
                                className={
                                  isMine
                                    ? "bg-primary/20 text-primary text-[10px] font-bold"
                                    : "bg-gold/20 text-gold-foreground text-[10px] font-bold"
                                }
                              >
                                {getInitials(tm.sender.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-bold">
                              {withRolePrefix(tm.sender.name, tm.sender.role)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {actorRoleLabel(tm.sender.role)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {kind === "group" ? (
                            <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md border font-bold bg-gold/15 text-gold-foreground border-gold/30">
                              <Megaphone className="h-2.5 w-2.5" /> گروهی
                              {tm.target.role === "group" ? ` ← ${tm.target.name}` : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md border font-bold bg-primary/10 text-primary border-primary/20">
                              <UserCheck className="h-2.5 w-2.5" /> فردی
                            </span>
                          )}
                          {tm.raw.subject && (
                            <span className="text-[10px] font-bold text-foreground/80">
                              موضوع: {stripReplyPrefix(tm.raw.subject)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-7 whitespace-pre-wrap">{tm.raw.content}</p>
                        <SecureMessageAttachments attachments={tm.raw.attachments} />
                        <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-muted-foreground">
                          <span>{fmtDateTime(tm.raw)}</span>
                          {isMine && !tm.raw.unread ? (
                            <CheckCheck className="h-3 w-3 text-primary" />
                          ) : isMine ? (
                            <Check className="h-3 w-3" />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t bg-card p-3 space-y-2">
                {replyRecipients.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-secondary/40 px-3 py-2.5 text-center text-xs font-bold text-muted-foreground">
                    گیرندهٔ معتبری برای پاسخ در این چت شناسایی نشد.
                  </div>
                ) : (
                  <>
                    {replyRecipients.length > 1 && (
                      <select
                        value={replyRecipientKey}
                        onChange={(e) => setReplyRecipientKey(e.target.value)}
                        className="h-9 w-full rounded-xl border bg-background px-3 text-sm font-bold"
                      >
                        {replyRecipients.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.name} — {r.subtitle}
                          </option>
                        ))}
                      </select>
                    )}
                    <MessageAttachmentPicker
                      files={replyFiles}
                      onChange={setReplyFiles}
                      disabled={replyingSending}
                      compact
                    />
                    <div className="flex gap-2">
                      <Textarea
                        rows={2}
                        className="resize-none text-sm flex-1"
                        placeholder={`پاسخ به ${(() => {
                          const rr = replyRecipients.find((r) => r.key === replyRecipientKey);
                          return rr ? withRolePrefix(rr.name, rr.role) : selectedConversation.title;
                        })()}...`}
                        value={replyContent}
                        onChange={(event) => setReplyContent(event.target.value)}
                      />
                      <Button
                        className="self-end gradient-primary text-primary-foreground gap-1.5"
                        size="sm"
                        onClick={sendReply}
                        disabled={!replyContent.trim() || replyingSending || !replyRecipientKey}
                      >
                        {replyingSending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Reply className="h-3.5 w-3.5" />
                        )}
                        پاسخ
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
