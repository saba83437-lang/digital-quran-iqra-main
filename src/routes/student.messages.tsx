// ============================================================
//  پنل قرآن‌آموز - پیام‌رسانی چت‌محور (هر مخاطب = یک چت)
//  گیرندگان مجاز: فقط «استادِ خودش» و «مدیریت مرکز»
//  + نمایش اطلاعیه‌های گروهی (همه/کلاس) در قالب چت گروهی
//  مسیر مقصد: src/routes/student.messages.tsx
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  MessageSquare,
  Loader2,
  Send,
  Plus,
  Search,
  Inbox,
  Reply,
  Mail,
  Users,
  UserCheck,
  Megaphone,
  RefreshCw,
  X,
  CheckCheck,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  messageDisplayTimestamp,
} from "@/features/messages/domain/message-date";
import {
  countLogicalMessages,
  messageIsDeliveredTo,
  messageIsSentBy,
  secureMessageLogicalKey,
} from "@/features/messages/domain/message-domain";
import { withRolePrefix } from "@/lib/display";
import { getSession } from "@/lib/auth";
import { getCurrentStudent, type CurrentStudent } from "@/lib/student-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/student/messages")({
  head: () => ({
    meta: [
      { title: "دارالقرآن ٱلوالدین — پیام‌ها" },
      { name: "description", content: "پیام‌های قرآن‌آموز" },
    ],
  }),
  component: StudentMessages,
});

/* ╔══════════════════════════════════════╗
   ║           انواع و ابزارها            ║
   ╚══════════════════════════════════════╝ */
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
interface StudentRef {
  id: string;
  name: string;
  parent_name: string | null;
  class_id?: string | null;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const STUDENT_SEEN_KEY = "quran-student-seen-message-ids";

function toFa(input: string | number | null | undefined): string {
  if (input == null) return "—";
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
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

function fmtDateTime(message: DbMessage): string {
  return formatIranianMessageDateTime(message);
}

function stripReplyPrefix(subject: string | null | undefined): string {
  return String(subject ?? "")
    .replace(/^پاسخ:\s*/g, "")
    .trim();
}

function relativeTime(m: DbMessage): string {
  const t = messageDisplayTimestamp(m);
  if (t == null) return fmtDateTime(m);
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "لحظاتی پیش";
  if (minutes < 60) return `${toFa(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toFa(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${toFa(days)} روز پیش`;
  return fmtDateTime(m);
}

/* ╔══════════════════════════════════════╗
   ║  موتور گفت‌وگو — همان جریان پنل مدیریت ║
   ╚══════════════════════════════════════╝ */
type ActorRole = "admin" | "teacher" | "parent" | "student" | "group" | "unknown";
type MessageTab = "all" | "individual" | "group";

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

function buildDirectoryMaps(students: StudentRef[], teachers: TeacherRef[], parents: ParentRef[]) {
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

function resolveSender(
  message: DbMessage,
  students: StudentRef[],
  teachers: TeacherRef[],
  parents: ParentRef[],
): ChatActor {
  const role = normalizeActorRole(message.from_role);
  let name = String(message.from_name ?? "").trim();
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
  let resolvedId =
    message.sender_id == null
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
  students: StudentRef[],
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
  students: StudentRef[],
  teachers: TeacherRef[],
  parents: ParentRef[],
  classes: { id: string; name: string }[],
  selfKeys: Set<string>,
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
    const sender = resolveSender(raw, students, teachers, parents);
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
      const counterparties = participants.filter((p) => !selfKeys.has(p.key));
      const title = groupTarget
        ? groupTarget.name
        : counterparties.length > 0
          ? counterparties.map((p) => withRolePrefix(p.name, p.role)).join(" ↔ ")
          : "گفتگوی من";
      const subtitle = groupTarget
        ? "مکالمه گروهی"
        : participants
            .map((p) => p.subtitle)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(" ↔ ");
      const unreadCount = ordered.filter(
        (i) => i.raw.unread === true && selfKeys.has(i.target.key),
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
function StudentMessages() {
  const [student, setStudent] = useState<CurrentStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [myTeacher, setMyTeacher] = useState<TeacherRef | null>(null);
  const [myClass, setMyClass] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "inbox" | "sent">("all");
  const [activeTab, setActiveTab] = useState<MessageTab>("all");

  // دیالوگ ارسال پیام جدید
  const [composeOpen, setComposeOpen] = useState(false);
  // گیرندگان مجاز قرآن‌آموز: فقط «استادِ خودش» و «مدیریت مرکز»
  const [recipientOptions, setRecipientOptions] = useState<
    { to_id: string; to_role: string; label: string }[]
  >([]);
  const [composeData, setComposeData] = useState({
    to_id: "",
    to_role: "",
    subject: "",
    content: "",
  });
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyingSending, setReplyingSending] = useState(false);

  /* ─── «دیده‌شده توسط قرآن‌آموز» — فقط محلی (برای اطلاعیه‌ها؛ پرچم unread مشترک دست نمی‌خورد) ─── */
  const [seenByMe, setSeenByMe] = useState<Set<string>>(() => {
    try {
      return new Set<string>(
        JSON.parse(localStorage.getItem(STUDENT_SEEN_KEY) ?? "[]") as string[],
      );
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STUDENT_SEEN_KEY, JSON.stringify([...seenByMe].slice(-10000)));
    } catch {
      /* ignore */
    }
  }, [seenByMe]);

  /* گیرندگان مجاز: فقط استادِ کلاس خودم (در صورت ثبت) + مدیریت مرکز */
  const resolveRecipients = useCallback(
    async (
      s: CurrentStudent | null,
    ): Promise<{ to_id: string; to_role: string; label: string }[]> => {
      const opts: { to_id: string; to_role: string; label: string }[] = [];
      if (s?.class_id) {
        const { data: cls } = await supabase
          .from("classes")
          .select("id, name, teacher_id")
          .eq("id", s.class_id)
          .maybeSingle();
        if (cls) setMyClass({ id: String(cls.id), name: String(cls.name ?? "کلاس من") });
        if (cls?.teacher_id) {
          const { data: t } = await supabase
            .from("teachers")
            .select("id, name")
            .eq("id", cls.teacher_id)
            .maybeSingle();
          if (t) {
            const teacherRef = { id: String(t.id), name: String(t.name) };
            setMyTeacher(teacherRef);
            opts.push({
              to_id: teacherRef.id,
              to_role: "teacher",
              label: `${withRolePrefix(teacherRef.name, "teacher")} (استاد من)`,
            });
          }
        }
      }
      opts.push({ to_id: "admin", to_role: "admin", label: "مدیریت مرکز" });
      setRecipientOptions(opts);
      return opts;
    },
    [],
  );

  const loadMessages = useCallback(async (s: CurrentStudent) => {
    // پیام‌های مستقیم به این قرآن‌آموز
    const { data: inbox } = await supabase
      .from("messages")
      .select("*")
      .eq("to_id", s.id)
      .order("date", { ascending: false });
    // پیام‌های ارسالی بر اساس هویت امن Auth
    const currentUserId = getSession()?.userId ?? "";
    const { data: sent } = await supabase
      .from("messages")
      .select("*")
      .eq("sender_user_id", currentUserId)
      .order("date", { ascending: false });
    // اطلاعیه‌های عمومی قرآن‌آموزان
    const { data: broadcasts } = await supabase
      .from("messages")
      .select("*")
      .in("to_role", ["all_students", "all_users", "all"])
      .order("date", { ascending: false });
    // اطلاعیه‌های کلاس خودش
    let classMsgs: any[] = [];
    if (s.class_id) {
      const { data: cm } = await supabase
        .from("messages")
        .select("*")
        .in("to_role", ["class_students", "students_class", "class"])
        .eq("to_id", s.class_id)
        .order("date", { ascending: false });
      classMsgs = cm ?? [];
    }

    const all = [
      ...((inbox ?? []) as any[]),
      ...((sent ?? []) as any[]),
      ...((broadcasts ?? []) as any[]),
      ...(classMsgs as any[]),
    ];
    const map = new Map<string, DbMessage>();
    for (const m of all) {
      const id = String(m.id);
      if (!map.has(id)) map.set(id, m as DbMessage);
    }
    setMessages(Array.from(map.values()));

    /* نخستین اجرا: موجودی فعلی «دیده‌شده» فرض می‌شود */
    if (localStorage.getItem(STUDENT_SEEN_KEY) === null) {
      setSeenByMe(new Set(all.map((x) => String(x.id))));
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getCurrentStudent();
      setStudent(s);
      if (s) await Promise.all([loadMessages(s), resolveRecipients(s)]);
    } catch (err) {
      console.error("[student messages] خطا:", err);
    }
    setLoading(false);
  }, [loadMessages, resolveRecipients]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /* ─── به‌روزرسانی زنده ─── */
  useEffect(() => {
    const channel = supabase
      .channel("student-messages-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void loadAll();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAll]);

  const meRef = useMemo<StudentRef[]>(
    () =>
      student
        ? [
            {
              id: sid(student.id),
              name: student.name,
              parent_name: null,
              class_id: sid(student.class_id),
            },
          ]
        : [],
    [student],
  );
  const teachersRef = useMemo<TeacherRef[]>(() => (myTeacher ? [myTeacher] : []), [myTeacher]);
  const classesRef = useMemo(() => (myClass ? [myClass] : []), [myClass]);
  const selfKeys = useMemo(
    () => new Set<string>(student ? [`student:${sid(student.id)}`] : []),
    [student],
  );
  const myActorKey = student ? `student:${sid(student.id)}` : "";
  const currentAuthUserId = getSession()?.userId ?? "";

  /* ─── فیلتر پیام‌محور ─── */
  const visible = useMemo(() => {
    let list = messages;
    if (filterTab === "unread")
      list = list.filter(
        (message) =>
          message.unread &&
          (messageIsDeliveredTo(message, currentAuthUserId) ||
            sid(message.to_id) === sid(student?.id)),
      );
    else if (filterTab === "inbox")
      list = list.filter(
        (message) =>
          messageIsDeliveredTo(message, currentAuthUserId) || message.from_role !== "student",
      );
    else if (filterTab === "sent")
      list = list.filter(
        (message) => messageIsSentBy(message, currentAuthUserId) || message.from_role === "student",
      );
    const q = searchQuery.trim();
    if (q)
      list = list.filter(
        (m) => m.subject?.includes(q) || m.content?.includes(q) || m.from_name?.includes(q),
      );
    return list;
  }, [messages, filterTab, searchQuery, student, currentAuthUserId]);

  const conversations = useMemo(
    () => buildConversations(messages, meRef, teachersRef, [], classesRef, selfKeys),
    [messages, meRef, teachersRef, classesRef, selfKeys],
  );

  const visibleIds = useMemo(() => new Set(visible.map((m) => sid(m.id))), [visible]);

  /* ─── تشخیص ارسال گروهیِ expand‌شده ─── */
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

  /* ─── شمارش «جدید برای من»: مستقیم = unread دیتابیس؛ اطلاعیه = دیده‌نشدهٔ محلی ─── */
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

  const selectedConversation = useMemo(
    () =>
      conversationItems.find((c) => c.key === selectedConversationKey) ??
      conversations.find((c) => c.key === selectedConversationKey) ??
      null,
    [conversationItems, conversations, selectedConversationKey],
  );

  /* گیرندگان پاسخ: طرف مقابلِ چت (استاد یا مدیریت) */
  const replyRecipients = useMemo(() => {
    if (!selectedConversation) return [] as ChatActor[];
    return selectedConversation.participants.filter(
      (p) => !selfKeys.has(p.key) && p.role !== "group" && p.role !== "unknown",
    );
  }, [selectedConversation, selfKeys]);
  const replyRecipient = replyRecipients[0] ?? null;

  const stats = useMemo(
    () => ({
      total: countLogicalMessages(messages),
      inbox: countLogicalMessages(messages, (message) =>
        messageIsDeliveredTo(message, currentAuthUserId),
      ),
      unread: countLogicalMessages(
        messages,
        (message) => message.unread === true && messageIsDeliveredTo(message, currentAuthUserId),
      ),
      sent: countLogicalMessages(messages, (message) =>
        messageIsSentBy(message, currentAuthUserId),
      ),
    }),
    [messages, currentAuthUserId],
  );

  const markRead = async (m: DbMessage) => {
    if (!m.unread) return;
    await updateSecureMessageState(m.id, { unread: false });
    setMessages((prev) => prev.map((x) => (sid(x.id) === sid(m.id) ? { ...x, unread: false } : x)));
  };

  /* باز کردن چت: فقط پیام‌های مستقیم به خودم خوانده می‌شوند؛ اطلاعیه‌ها فقط محلی */
  const openConversation = (conversation: Conversation) => {
    setSelectedConversationKey(conversation.key);
    for (const cm of conversation.messages) {
      if (
        cm.raw.unread &&
        (messageIsDeliveredTo(cm.raw, currentAuthUserId) || cm.target.key === myActorKey)
      )
        void markRead(cm.raw);
    }
    setSeenByMe((prev) => {
      const next = new Set(prev);
      for (const cm of conversation.messages) next.add(cm.id);
      return next;
    });
    setReplyContent("");
  };

  async function openCompose(subject = "") {
    const def = recipientOptions[0];
    setComposeData({ to_id: def?.to_id ?? "", to_role: def?.to_role ?? "", subject, content: "" });
    setComposeOpen(true);
  }

  async function sendMessage() {
    if (!student || !composeData.to_id || !composeData.subject.trim()) {
      toast.error("لطفاً گیرنده و موضوع را مشخص کنید.");
      return;
    }
    setSending(true);
    try {
      await sendSecureMessage({
        targetType: composeData.to_role || (composeData.to_id === "admin" ? "admin" : "teacher"),
        targetId: composeData.to_id,
        subject: composeData.subject,
        content: composeData.content,
        files: composeFiles,
      });
      setComposeData({ to_id: "", to_role: "", subject: "", content: "" });
      setComposeFiles([]);
      setComposeOpen(false);
      toast.success("پیام امن ارسال شد");
      await loadAll();
    } catch (err) {
      console.error("Send message error:", err);
      toast.error(err instanceof Error ? err.message : "خطا در ارسال پیام");
    } finally {
      setSending(false);
    }
  }

  /* پاسخ داخل چت: متصل به ریشهٔ همان چت */
  async function sendReply() {
    if (!selectedConversation || !replyContent.trim() || !student || !replyRecipient) return;
    setReplyingSending(true);
    try {
      const lastRaw = selectedConversation.lastMessage.raw;
      const subjectSource = stripReplyPrefix(lastRaw.subject) || selectedConversation.title;
      await sendSecureMessage({
        targetType: replyRecipient.role,
        targetId: replyRecipient.id,
        subject: `پاسخ: ${subjectSource}`,
        content: replyContent,
        parentMessageId: selectedConversation.rootMessageId,
        files: replyFiles,
      });
      setReplyContent("");
      setReplyFiles([]);
      toast.success("پاسخ امن ارسال شد");
      await loadAll();
    } catch (err) {
      console.error("reply error:", err);
      toast.error(err instanceof Error ? err.message : "خطا در ارسال پاسخ");
    } finally {
      setReplyingSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری...</span>
      </div>
    );
  }

  if (!student) {
    return (
      <Card className="p-12 text-center">
        <h3 className="font-display text-lg">اطلاعات قرآن‌آموز یافت نشد</h3>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="پیام‌ها"
        description={`گفتگوهای شما با استاد (${myTeacher?.name ?? "—"}) و مدیریت — هر مخاطب یک چت واحد.`}
      />

      {/* نوار اقدامات */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => void openCompose()} className="gap-2">
          <Plus className="h-4 w-4" />
          پیام جدید
        </Button>
        <Button
          variant="outline"
          onClick={() => void loadAll()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          به‌روزرسانی
        </Button>
      </div>

      {/* آمار */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SimpleStat
          label="کل پیام‌ها"
          value={stats.total}
          color="blue"
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <SimpleStat
          label="دریافتی"
          value={stats.inbox}
          color="emerald"
          icon={<Inbox className="h-5 w-5" />}
        />
        <SimpleStat
          label="خوانده‌نشده"
          value={stats.unread}
          color="rose"
          icon={<Mail className="h-5 w-5" />}
        />
        <SimpleStat
          label="ارسالی"
          value={stats.sent}
          color="amber"
          icon={<Send className="h-5 w-5" />}
        />
      </div>

      {/* فیلتر + جستجو */}
      <Card className="p-3 mb-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex gap-1 flex-1">
            {[
              { key: "all", label: "همه" },
              { key: "unread", label: "خوانده‌نشده" },
              { key: "inbox", label: "دریافتی" },
              { key: "sent", label: "ارسالی" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key as typeof filterTab)}
                className={`px-3 py-2 rounded-lg text-sm transition ${
                  filterTab === tab.key
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-1 items-center rounded-lg border bg-card px-1">
            {[
              { key: "all" as MessageTab, label: "همه" },
              { key: "individual" as MessageTab, label: "👤 فردی" },
              { key: "group" as MessageTab, label: "📢 گروهی" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 text-xs py-1.5 px-3 rounded-md font-bold transition-all ${activeTab === tab.key ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="جستجو..."
              className="pr-9 w-full md:w-[220px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* لیست گفتگوها */}
      {conversationItems.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-display text-lg mb-1">
            {messages.length === 0 ? "هنوز پیامی ندارید" : "گفتگویی با این فیلتر یافت نشد"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            برای ارتباط با استاد یا مدیریت، پیام جدیدی ارسال کنید.
          </p>
          <Button onClick={() => void openCompose()} className="gap-2">
            <Plus className="h-4 w-4" />
            ارسال پیام
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {conversationItems.map((conversation) => {
            const newCount = newCountOf(conversation);
            const hasUnread = newCount > 0;
            return (
              <button
                key={conversation.key}
                onClick={() => openConversation(conversation)}
                className={`w-full text-right p-3 bg-card rounded-xl border transition shadow-sm hover:shadow-soft flex items-center gap-2.5 ${
                  hasUnread ? "border-red-300 bg-red-50/70" : "border-border/70"
                }`}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback
                    className={
                      hasUnread
                        ? "bg-red-100 text-red-700 font-bold"
                        : "bg-primary/10 text-primary font-bold"
                    }
                  >
                    {conversation.isGroup ? (
                      <Users className="h-4 w-4" />
                    ) : (
                      getInitials(conversation.title)
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`text-sm truncate font-black ${hasUnread ? "text-red-700" : "text-foreground"}`}
                    >
                      {conversation.title}
                    </span>
                    {conversation.isGroup && (
                      <Badge className="bg-gold/20 text-gold-foreground border-0 text-[9px] py-0 shrink-0 font-bold">
                        گروهی
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground font-bold shrink-0">
                      ({toFa(conversation.messages.length)})
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {withRolePrefix(
                      conversation.lastMessage.sender.name,
                      conversation.lastMessage.sender.role,
                    )}
                    : {conversation.lastMessage.raw.content}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {hasUnread && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-600 text-white font-black animate-pulse">
                      {toFa(newCount)} جدید
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {relativeTime(conversation.lastMessage.raw)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* مودال چت */}
      <Dialog
        open={!!selectedConversation}
        onOpenChange={(open) => !open && setSelectedConversationKey(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden p-0 gap-0" dir="rtl">
          {selectedConversation && (
            <div className="flex max-h-[85vh] flex-col">
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
                      · آخرین: {fmtDateTime(selectedConversation.lastMessage.raw)}
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
                    اطلاعیهٔ گروهی «
                    {selectedConversation.groupTarget?.name ?? selectedConversation.title}» و
                    پاسخ‌های آن — می‌توانید برای مدیریت پاسخ بنویسید.
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

              <div className="border-t bg-card p-3">
                {replyRecipient ? (
                  <div className="space-y-2">
                    <MessageAttachmentPicker
                      files={replyFiles}
                      onChange={setReplyFiles}
                      disabled={replyingSending}
                      compact
                    />
                    <div className="flex gap-2">
                    <textarea
                      rows={2}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      placeholder={`پاسخ به ${withRolePrefix(replyRecipient.name, replyRecipient.role)}...`}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                    />
                    <Button
                      className="self-end gradient-primary text-primary-foreground gap-1.5"
                      size="sm"
                      onClick={() => void sendReply()}
                      disabled={!replyContent.trim() || replyingSending}
                    >
                      {replyingSending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Reply className="h-3.5 w-3.5" />
                      )}
                      پاسخ
                    </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-secondary/40 px-3 py-2.5 text-center text-xs font-bold text-muted-foreground">
                    گیرنده‌ای برای پاسخ در این چت نیست.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* دیالوگ ارسال پیام جدید (گیرنده: فقط استاد من یا مدیریت) */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              ارسال پیام جدید
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1">گیرنده *</label>
              <Select
                value={composeData.to_id ? `${composeData.to_role}|${composeData.to_id}` : ""}
                onValueChange={(v) => {
                  const sep = v.indexOf("|");
                  const to_role = v.slice(0, sep);
                  const to_id = v.slice(sep + 1);
                  setComposeData({ ...composeData, to_id, to_role });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب گیرنده" />
                </SelectTrigger>
                <SelectContent>
                  {recipientOptions.map((r) => (
                    <SelectItem key={`${r.to_role}|${r.to_id}`} value={`${r.to_role}|${r.to_id}`}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!recipientOptions.some((r) => r.to_role === "teacher") && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  استادی برای کلاس شما ثبت نشده است؛ فعلاً می‌توانید به مدیریت پیام بدهید.
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">موضوع *</label>
              <Input
                value={composeData.subject}
                onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
                placeholder="موضوع پیام"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">متن پیام</label>
              <textarea
                value={composeData.content}
                onChange={(e) => setComposeData({ ...composeData, content: e.target.value })}
                placeholder="پیام خود را اینجا بنویسید..."
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
            <MessageAttachmentPicker
              files={composeFiles}
              onChange={setComposeFiles}
              disabled={sending}
              compact
            />
          </div>
          <div className="border-t pt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setComposeOpen(false)}>
              انصراف
            </Button>
            <Button onClick={() => void sendMessage()} disabled={sending} className="gap-2">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              ارسال
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SimpleStat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: "amber" | "blue" | "emerald" | "rose" | "primary";
  icon: ReactNode;
}) {
  const colors = {
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    rose: "text-rose-700 bg-rose-50 border-rose-100",
    primary: "text-primary bg-primary/5 border-primary/20",
  }[color];

  return (
    <Card className={`p-3 border ${colors}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs opacity-80 mb-0.5">{label}</div>
          <div className="font-display text-xl">{toFa(value)}</div>
        </div>
        <div className={`rounded-lg p-2 ${colors}`}>{icon}</div>
      </div>
    </Card>
  );
}
