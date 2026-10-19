import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCheck,
  Inbox,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Reply,
  Search,
  Send,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useParentPortal } from "@/hooks/use-parent-portal";
import { sendSecureMessage, type SecureMessageAttachment } from "@/features/messages/api/messages-api";
import { MessageAttachmentPicker } from "@/features/messages/components/message-attachment-picker";
import { SecureMessageAttachments } from "@/features/messages/components/secure-message-attachments";
import {
  compareMessageDisplayTime,
  formatIranianMessageDateTime,
} from "@/features/messages/domain/message-date";
import {
  countLogicalMessages,
  messageIsDeliveredTo,
  messageIsSentBy,
  secureMessageLogicalKey,
} from "@/features/messages/domain/message-domain";
import { getSession } from "@/lib/auth";
import { withRolePrefix } from "@/lib/display";
import { supabase } from "@/lib/supabase";
import { markParentMessageRead, type ParentPortalMessage } from "@/lib/parent-utils";

export const Route = createFileRoute("/parent/messages")({
  head: () => ({
    meta: [
      { title: "پیام‌های واقعی والد — بِرّ الوالدین" },
      { name: "description", content: "ارتباط واقعی با مدیریت و استادان فرزندان" },
    ],
  }),
  component: ParentMessages,
});

/* ╔══════════════════════════════════════╗
   ║           انواع و ابزارها            ║
   ╚══════════════════════════════════════╝ */
interface DbMessage {
  id: string | number;
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
  /* آیدی اصلی گیرنده پیش از یکپارچه‌سازی (برای خوانده‌شدن) */
  orig_to_id?: string | null;
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
const PARENT_SEEN_KEY = "quran-parent-seen-message-ids";

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
function ParentMessages() {
  const { data, loading, refreshing, error, refresh } = useParentPortal();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<MessageTab>("all");
  const [filterTab, setFilterTab] = useState<"all" | "inbox" | "sent">("all");
  const [search, setSearch] = useState("");
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyingSending, setReplyingSending] = useState(false);

  /* ─── «دیده‌شده توسط ولی» — فقط محلی (برای اطلاعیه‌ها؛ پرچم unread مشترک دست نمی‌خورد) ─── */
  const [seenByMe, setSeenByMe] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(PARENT_SEEN_KEY) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PARENT_SEEN_KEY, JSON.stringify([...seenByMe].slice(-10000)));
    } catch {
      /* ignore */
    }
  }, [seenByMe]);

  /* نخستین اجرا پس از دریافت داده: موجودی فعلی «دیده‌شده» فرض می‌شود */
  useEffect(() => {
    if (data && localStorage.getItem(PARENT_SEEN_KEY) === null) {
      setSeenByMe(new Set(data.messages.map((m) => sid(m.id))));
    }
  }, [data]);

  /* ─── به‌روزرسانی زنده ─── */
  useEffect(() => {
    const channel = supabase
      .channel("parent-messages-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void refresh(true);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  /* آیدی‌هایی که پیامِ به آن‌ها یعنی پیام به «خودِ ولی» (ولی + فرزندان) */
  const myTargetIds = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set<string>([sid(data.parent.id), ...data.children.map((c) => sid(c.id))]);
  }, [data]);

  const teachersRef = useMemo<TeacherRef[]>(
    () =>
      (data?.message_recipients ?? [])
        .filter((r) => r.role === "teacher")
        .map((r) => ({ id: r.id, name: r.name })),
    [data],
  );
  const parentsRef = useMemo<ParentRef[]>(
    () => (data ? [{ id: "self", name: data.parent.name }] : []),
    [data],
  );
  const childrenRef = useMemo<StudentRef[]>(
    () =>
      (data?.children ?? []).map((c) => ({
        id: sid(c.id),
        name: c.name,
        parent_name: data!.parent.name,
        class_id: c.class_id == null ? null : sid(c.class_id),
      })),
    [data],
  );
  const classesRef = useMemo(
    () =>
      (data?.children ?? [])
        .filter((c) => c.class_id != null && c.class_name)
        .map((c) => ({ id: sid(c.class_id), name: String(c.class_name) })),
    [data],
  );
  const selfKeys = useMemo(() => new Set<string>(["parent:self"]), []);
  const myActorKey = "parent:self";
  const currentAuthUserId = getSession()?.userId ?? "";

  /* یکپارچه‌سازی هویت ولی: پیامِ به parent با آیدیِ ولی یا هر فرزند → به «خودِ ولی» می‌رسد
     تا رفت‌وبرگشت با استاد در «یک چت» باقی بماند (نه دو تکه به‌ازای هر آیدی) */
  const engineMessages = useMemo<DbMessage[]>(() => {
    if (!data) return [];
    return data.messages.map((m) => {
      const normalizedToId =
        m.to_role === "parent" && m.to_id != null && myTargetIds.has(sid(m.to_id))
          ? "self"
          : m.to_id;
      return { ...m, orig_to_id: m.to_id, to_id: normalizedToId };
    });
  }, [data, myTargetIds]);

  /* ─── فیلتر پیام‌محور ─── */
  const visible = useMemo(() => {
    let list = engineMessages;
    if (filterTab === "inbox") list = list.filter((m) => !(m as ParentPortalMessage).is_sent);
    else if (filterTab === "sent") list = list.filter((m) => (m as ParentPortalMessage).is_sent);
    const q = search.trim();
    if (q)
      list = list.filter(
        (m) => m.subject?.includes(q) || m.content?.includes(q) || m.from_name?.includes(q),
      );
    return list;
  }, [engineMessages, filterTab, search]);

  const conversations = useMemo(
    () =>
      buildConversations(
        engineMessages,
        childrenRef,
        teachersRef,
        parentsRef,
        classesRef,
        selfKeys,
      ),
    [engineMessages, childrenRef, teachersRef, parentsRef, classesRef, selfKeys],
  );

  const visibleIds = useMemo(() => new Set(visible.map((m) => sid(m.id))), [visible]);

  /* ─── تشخیص ارسال گروهیِ expand‌شده ─── */
  const broadcastSignatures = useMemo(() => {
    const sigMap = new Map<string, Set<string>>();
    for (const m of engineMessages) {
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
  }, [engineMessages]);

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

  /* ─── شمارش «جدید برای ولی»: مستقیم = unread دیتابیس؛ اطلاعیه = دیده‌نشدهٔ محلی ─── */
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
    [currentAuthUserId],
  );

  const selectedConversation = useMemo(
    () =>
      conversationItems.find((c) => c.key === selectedConversationKey) ??
      conversations.find((c) => c.key === selectedConversationKey) ??
      null,
    [conversationItems, conversations, selectedConversationKey],
  );

  /* گیرندگان پاسخ: طرف مقابل چت (استاد یا مدیریت) */
  const replyRecipients = useMemo(() => {
    if (!selectedConversation) return [] as ChatActor[];
    return selectedConversation.participants.filter(
      (p) => !selfKeys.has(p.key) && p.role !== "group" && p.role !== "unknown",
    );
  }, [selectedConversation, selfKeys]);
  const replyRecipient = replyRecipients[0] ?? null;

  const unread = countLogicalMessages(
    engineMessages,
    (message) => message.unread === true && messageIsDeliveredTo(message, currentAuthUserId),
  );

  if (loading) return <LoadingState />;
  if (!data || error)
    return <ErrorState message={error ?? "اطلاعات در دسترس نیست"} onRetry={() => void refresh()} />;
  const portalData = data;

  async function openConversation(conversation: Conversation) {
    setSelectedConversationKey(conversation.key);
    /* در مدل Delivery مستقل، پیام مستقیم و گروهیِ همین والد هر دو قابل خواندن‌اند. */
    for (const cm of conversation.messages) {
      if (
        cm.raw.unread &&
        (messageIsDeliveredTo(cm.raw, currentAuthUserId) || cm.target.key === myActorKey)
      ) {
        const err = await markParentMessageRead(Number(cm.raw.id));
        if (err) toast.error(err);
      }
    }
    setSeenByMe((prev) => {
      const next = new Set(prev);
      for (const cm of conversation.messages) next.add(cm.id);
      return next;
    });
    setReplyContent("");
    void refresh(true);
  }

  async function sendMessage() {
    if (!to || !subject.trim() || !body.trim())
      return toast.error("گیرنده، موضوع و متن پیام الزامی است");
    const recipient = portalData.message_recipients.find(
      (item) => `${item.role}:${item.id}` === to,
    );
    if (!recipient) return toast.error("گیرنده معتبر نیست");
    setSending(true);
    try {
      await sendSecureMessage({
        targetType: recipient.role,
        targetId: recipient.id,
        subject,
        content: body,
        files: messageFiles,
      });
      toast.success("پیام امن در دیتابیس ثبت شد");
      setTo("");
      setSubject("");
      setBody("");
      setMessageFiles([]);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ارسال پیام ناموفق بود");
    } finally {
      setSending(false);
    }
  }

  /* پاسخ داخل چت: متصل به ریشهٔ همان چت */
  async function sendReply() {
    if (!selectedConversation || !replyContent.trim() || !replyRecipient) return;
    setReplyingSending(true);
    const lastRaw = selectedConversation.lastMessage.raw;
    const subjectSource = stripReplyPrefix(lastRaw.subject) || selectedConversation.title;
    try {
      await sendSecureMessage({
        targetType: replyRecipient.role,
        targetId: replyRecipient.id,
        subject: `پاسخ: ${subjectSource}`,
        content: replyContent,
        parentMessageId: selectedConversation.rootMessageId,
        files: replyFiles,
      });
      toast.success("✅ پاسخ امن ارسال شد");
      setReplyContent("");
      setReplyFiles([]);
      await refresh(true);
    } catch (error) {
      toast.error("خطا در ارسال پاسخ: " + (error instanceof Error ? error.message : error));
    } finally {
      setReplyingSending(false);
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-black">پیام‌رسانی</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            هر مخاطب (استاد یا مدیریت) یک چت واحد — تب فردی/گروهی هم دارید.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          disabled={refreshing}
          onClick={() => void refresh(true)}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          به‌روزرسانی
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <Card className="overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between border-b p-4 flex-wrap gap-2">
            <div className="flex items-center gap-1 bg-secondary/50 border p-1 rounded-xl">
              {[
                { key: "all" as MessageTab, label: "همه" },
                { key: "individual" as MessageTab, label: "👤 فردی" },
                { key: "group" as MessageTab, label: "📢 گروهی" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`text-xs py-1.5 px-3 rounded-lg font-bold transition-all ${activeTab === tab.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {(
                  [
                    { key: "all", label: "همه" },
                    { key: "inbox", label: "دریافتی" },
                    { key: "sent", label: "ارسالی" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilterTab(f.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs transition ${filterTab === f.key ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:bg-secondary"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="جستجو..."
                  className="pr-8 h-8 w-[140px] text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {unread > 0 && (
                <Badge className="border-0 bg-amber-500 text-white">
                  {toFa(unread)} خوانده‌نشده
                </Badge>
              )}
            </div>
          </div>

          <div className="p-3 space-y-2 max-h-[560px] overflow-y-auto">
            {conversationItems.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">
                <Inbox className="mx-auto h-10 w-10 opacity-40" />
                <p className="mt-3">گفتگویی وجود ندارد.</p>
              </div>
            )}
            {conversationItems.map((conversation) => {
              const newCount = newCountOf(conversation);
              const hasUnread = newCount > 0;
              return (
                <button
                  key={conversation.key}
                  onClick={() => void openConversation(conversation)}
                  className={`w-full text-right p-3 rounded-xl border transition flex items-center gap-2.5 ${
                    hasUnread
                      ? "border-red-300 bg-red-50/70"
                      : "bg-card border-border/70 hover:bg-secondary/30"
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
                      {fmtDateTime(conversation.lastMessage.raw)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="h-fit rounded-3xl p-5">
          <h2 className="font-display flex items-center gap-2 text-lg font-black">
            <Send className="h-5 w-5 text-primary" />
            پیام جدید
          </h2>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">گیرنده</label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب گیرنده" />
                </SelectTrigger>
                <SelectContent>
                  {portalData.message_recipients.map((item) => (
                    <SelectItem key={`${item.role}:${item.id}`} value={`${item.role}:${item.id}`}>
                      {item.name} — {item.role === "admin" ? "مدیریت" : "استاد"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">موضوع</label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">متن پیام</label>
              <Textarea rows={7} value={body} onChange={(event) => setBody(event.target.value)} />
            </div>
            <MessageAttachmentPicker
              files={messageFiles}
              onChange={setMessageFiles}
              disabled={sending}
              compact
            />
            <Button className="w-full gap-2" disabled={sending} onClick={() => void sendMessage()}>
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
                    پاسخ‌های آن — می‌توانید پاسخ بنویسید.
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
                            <CheckCheck className="h-3 w-3 text-emerald-600" />
                          ) : isMine ? (
                            <Mail className="h-3 w-3 opacity-60" />
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
                    <Textarea
                      rows={2}
                      className="resize-none text-sm flex-1"
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
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-72 items-center justify-center gap-3">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      در حال دریافت پیام‌های واقعی...
    </div>
  );
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="rounded-3xl p-10 text-center">
      <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
      <p className="mt-3">{message}</p>
      <Button className="mt-4" onClick={onRetry}>
        تلاش مجدد
      </Button>
    </Card>
  );
}
