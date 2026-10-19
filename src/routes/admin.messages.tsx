import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import {
  Send,
  Megaphone,
  Inbox,
  Filter,
  Loader2,
  Users,
  MessageSquare,
  MailOpen,
  CalendarDays,
  Search,
  CheckCheck,
  Check,
  Reply,
  AlertCircle,
  Bell,
  GraduationCap,
  ShieldAlert,
  Star,
  X,
  FileText,
  Eye,
  ChevronDown,
  ChevronUp,
  PartyPopper,
  School,
  UserCheck,
  Paperclip,
  Clock,
  MoreVertical,
  Pin,
  Archive,
  Trash2,
  Forward,
  Download,
  FileSpreadsheet,
  LayoutList,
  LayoutGrid,
  EyeOff,
  Image,
  Music,
  File as FileIcon,
  Smartphone,
  MessageCircle,
  Monitor,
  Calendar,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  Crown,
  Sparkles,
  User,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import {
  cancelScheduledMessage,
  deleteSecureMessages,
  sendSecureMessage,
  updateSecureMessageState,
  type SecureMessageAttachment,
} from "@/features/messages/api/messages-api";
import { MessageAttachmentPicker } from "@/features/messages/components/message-attachment-picker";
import { MessageSchedulePicker } from "@/features/messages/components/message-schedule-picker";
import { SecureMessageAttachments } from "@/features/messages/components/secure-message-attachments";
import {
  formatScheduledAt,
  resolveScheduledAt,
  type MessageSchedulePreset,
} from "@/features/messages/domain/message-schedule";
import {
  compareMessageDisplayTime,
  formatIranianMessageDate,
  formatIranianMessageDateTime,
  messageDisplayTimestamp,
} from "@/features/messages/domain/message-date";
import {
  countLogicalMessages,
  messageIsDeliveredTo,
  messageIsSentBy,
  secureMessageLogicalKey,
  uniqueLogicalMessages,
} from "@/features/messages/domain/message-domain";
import { getSession } from "@/lib/auth";
import { withRolePrefix } from "@/lib/display";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/messages")({
  head: () => ({
    meta: [
      { title: "پیام‌رسانی — بِرّ الوالدین" },
      { name: "description", content: "نظارت بر تمامی مکاتبات مرکز" },
    ],
  }),
  component: MessagesPage,
});

/* ╔══════════════════════════════════════╗
   ║           انواع و اینترفیس‌ها        ║
   ╚══════════════════════════════════════╝ */
type Role = "admin" | "teacher" | "parent" | "student";
type GroupTarget =
  "all" | "all_teachers" | "all_parents" | "all_students" | "class_students" | "class_parents";
type Priority = "urgent" | "normal" | "info";
type TopicCategory =
  "tuition" | "educational" | "disciplinary" | "announcement" | "occasions" | "other";
type MessageTab = "all" | "individual" | "group" | "pinned" | "archived";
type ViewMode = "compact" | "expanded";
type SendChannel = "internal" | "sms" | "eitaa";

interface SeenEntry {
  user_name: string;
  seen_at: string;
}
interface DbMessage {
  id: string;
  created_at?: string;
  sender_user_id?: string;
  recipient_user_id?: string;
  campaign_id?: string;
  from_name: string;
  from_role: Role | null;
  from_id?: string | number | null;
  sender_id?: string | number | null;
  to_id: string | null;
  to_role: Role | GroupTarget | null;
  subject: string;
  content: string;
  date: string;
  unread: boolean;
  priority?: Priority | null;
  topic?: TopicCategory | null;
  replied?: boolean | null;
  delivered?: boolean | null;
  parent_message_id?: string | number | null;
  seen_by?: SeenEntry[] | null;
  is_starred?: boolean | null;
  is_pinned?: boolean | null;
  is_archived?: boolean | null;
  scheduled_at?: string | null;
  delivery_status?: "scheduled" | "delivered" | "cancelled";
  delivered_at?: string | null;
  cancelled_at?: string | null;
  channels?: SendChannel[] | null;
  attachments?: SecureMessageAttachment[] | null;
}

interface Teacher {
  id: string;
  name: string;
}
interface ParentRef {
  id: string;
  name: string;
}
interface SecureActorRef {
  userId: string;
  role: Role;
  entityId: string;
  name: string;
}
interface Student {
  id: string;
  name: string;
  parent_name: string | null;
  class_id: string | null;
}
interface QClass {
  id: string;
  name: string;
  teacher_id: string;
  level: string;
  enrolled: number;
  capacity: number;
}
type MessageCategory =
  | "to-admin"
  | "from-admin"
  | "broadcast"
  | "teacher-student"
  | "student-teacher"
  | "parent-teacher"
  | "teacher-parent"
  | "other";

/* ╔══════════════════════════════════════╗
   ║         پیکربندی و ثوابت             ║
   ╚══════════════════════════════════════╝ */
const categoryLabels: Record<MessageCategory, string> = {
  "to-admin": "ارسالی به مدیریت",
  "from-admin": "ارسالی از مدیریت",
  broadcast: "اطلاعیه گروهی",
  "teacher-student": "استاد ← قرآن‌آموز",
  "student-teacher": "قرآن‌آموز ← استاد",
  "parent-teacher": "والدین ← استاد",
  "teacher-parent": "استاد ← والدین",
  other: "سایر",
};

const categoryTone: Record<MessageCategory, string> = {
  "to-admin": "bg-[#5d6d45]/15 text-[#4a5839] border-[#5d6d45]/30",
  "from-admin": "bg-[#5d6d45]/15 text-[#4a5839] border-[#5d6d45]/30",
  broadcast: "bg-gold/25 text-gold-foreground",
  "teacher-student": "bg-gold/20 text-gold-foreground",
  "student-teacher": "bg-gold/20 text-gold-foreground",
  "parent-teacher": "bg-success/15 text-success",
  "teacher-parent": "bg-success/15 text-success",
  other: "bg-secondary text-muted-foreground",
};

const groupLabels: Record<GroupTarget, string> = {
  all: "همه اعضای مرکز",
  all_teachers: "همه اساتید",
  all_parents: "همه والدین",
  all_students: "همه قرآن‌آموزان",
  class_students: "قرآن‌آموزان یک کلاس",
  class_parents: "والدین یک کلاس",
};

const roleLabels: Record<Role, string> = {
  admin: "مدیر",
  teacher: "استاد",
  parent: "ولی دانش‌آموز",
  student: "قرآن‌آموز",
};

const priorityConfig: Record<Priority, { label: string; color: string; dot: string; bg: string }> =
  {
    urgent: {
      label: "فوری",
      color: "text-red-700",
      dot: "bg-red-500",
      bg: "bg-red-50 border-red-200",
    },
    normal: {
      label: "معمولی",
      color: "text-yellow-700",
      dot: "bg-yellow-500",
      bg: "bg-yellow-50 border-yellow-200",
    },
    info: {
      label: "اطلاع‌رسانی",
      color: "text-green-700",
      dot: "bg-green-500",
      bg: "bg-green-50 border-green-200",
    },
  };

const topicConfig: Record<TopicCategory, { label: string; icon: React.ReactNode; color: string }> =
  {
    tuition: {
      label: "شهریه",
      icon: <Star className="h-3 w-3" />,
      color: "bg-amber-100 text-amber-700",
    },
    educational: {
      label: "آموزشی",
      icon: <GraduationCap className="h-3 w-3" />,
      color: "bg-blue-100 text-blue-700",
    },
    disciplinary: {
      label: "انضباطی",
      icon: <ShieldAlert className="h-3 w-3" />,
      color: "bg-red-100 text-red-700",
    },
    announcement: {
      label: "اطلاع‌رسانی",
      icon: <Bell className="h-3 w-3" />,
      color: "bg-purple-100 text-purple-700",
    },
    occasions: {
      label: "مناسبت‌ها",
      icon: <PartyPopper className="h-3 w-3" />,
      color: "bg-pink-100 text-pink-700",
    },
    other: {
      label: "سایر",
      icon: <MessageSquare className="h-3 w-3" />,
      color: "bg-gray-100 text-gray-600",
    },
  };

const channelConfig: Record<SendChannel, { label: string; icon: React.ReactNode; color: string }> =
  {
    internal: {
      label: "پنل داخلی",
      icon: <Monitor className="h-3.5 w-3.5" />,
      color: "text-[#4a5839]",
    },
    sms: { label: "پیامک", icon: <Smartphone className="h-3.5 w-3.5" />, color: "text-blue-600" },
    eitaa: {
      label: "ایتا",
      icon: <MessageCircle className="h-3.5 w-3.5" />,
      color: "text-green-600",
    },
  };

const messageTemplates = [
  {
    id: "tuition_reminder",
    label: "🔔 یادآوری شهریه",
    subject: "یادآوری پرداخت شهریه ماه جاری",
    content:
      "بسم الله الرحمن الرحیم\n\nبا سلام و احترام\nبدینوسیله یادآوری می‌شود شهریه ماه جاری هنوز پرداخت نشده است.\nلطفاً در اسرع وقت اقدام فرمایید.\n\nبا تشکر\nمدیریت دارالقرآن بِرّ الوالدین",
    priority: "normal" as Priority,
    topic: "tuition" as TopicCategory,
  },
  {
    id: "absence_notice",
    label: "⚠️ اعلام غیبت",
    subject: "اطلاع‌رسانی غیبت قرآن‌آموز",
    content:
      "بسم الله الرحمن الرحیم\n\nبا سلام\nفرزند گرامی‌تان در جلسه اخیر غایب بوده‌اند.\nلطفاً در صورت ادامه غیبت اطلاع دهید.\n\nبا تشکر\nمدیریت دارالقرآن",
    priority: "urgent" as Priority,
    topic: "disciplinary" as TopicCategory,
  },
  {
    id: "holiday_notice",
    label: "🏖️ اطلاعیه تعطیلی",
    subject: "اطلاعیه تعطیلی مرکز قرآنی",
    content:
      "بسم الله الرحمن الرحیم\n\nبا سلام\nمرکز قرآنی در تاریخ [تاریخ] تعطیل خواهد بود.\n\nبا تشکر\nمدیریت دارالقرآن",
    priority: "info" as Priority,
    topic: "announcement" as TopicCategory,
  },
  {
    id: "congratulation",
    label: "🎉 تبریک مناسبت",
    subject: "تبریک و تهنیت",
    content:
      "بسم الله الرحمن الرحیم\n\nفرا رسیدن این مناسبت مبارک را تبریک عرض می‌نماییم.\n\nبا احترام\nمدیریت دارالقرآن بِرّ الوالدین",
    priority: "info" as Priority,
    topic: "occasions" as TopicCategory,
  },
  {
    id: "meeting_invite",
    label: "📋 دعوت به جلسه",
    subject: "دعوت به جلسه هماهنگی",
    content:
      "بسم الله الرحمن الرحیم\n\nاز شما دعوت می‌شود در جلسه هماهنگی شرکت فرمایید:\n\n📅 تاریخ: [تاریخ]\n⏰ ساعت: [ساعت]\n📍 مکان: [مکان]\n\nحضور شما الزامی است.\n\nبا تشکر\nمدیریت دارالقرآن",
    priority: "normal" as Priority,
    topic: "announcement" as TopicCategory,
  },
];

/* ╔══════════════════════════════════════╗
   ║    اینترفیس فیلتر (با index sig)    ║
   ╚══════════════════════════════════════╝ */
interface AdvancedFilters {
  search: string;
  category: MessageCategory | "all";
  fromRole: Role | "all";
  toRole: Role | GroupTarget | "all";
  status: "all" | "unread" | "read";
  priority: Priority | "all";
  topic: TopicCategory | "all";
  dateFrom: string;
  dateTo: string;
  [key: string]: string;
}

const defaultFilters: AdvancedFilters = {
  search: "",
  category: "all",
  fromRole: "all",
  toRole: "all",
  status: "all",
  priority: "all",
  topic: "all",
  dateFrom: "",
  dateTo: "",
};

/* ─── فرم پیش‌فرض ─── */
const emptyForm = {
  mode: "individual" as "individual" | "group",
  recipientRole: "" as Role | "",
  recipientId: "",
  groupTarget: "" as GroupTarget | "",
  selectedClassId: "",
  subject: "",
  content: "",
  priority: "normal" as Priority,
  topic: "other" as TopicCategory,
  template: "",
  scheduleEnabled: false,
  schedulePreset: "5m" as MessageSchedulePreset,
  scheduledDate: "",
  scheduledTime: "",
  channels: ["internal"] as SendChannel[],
  attachments: [] as File[],
};

// ==========================================
// EMBEDDED PHOTOGRAPHIC ASSETS (BASE64)
// ==========================================
const ISLAMIC_BG_BASE64 =
  "data:image/jpeg;base64,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";
const QURAN_RIHAL_BASE64 =
  "data:image/jpeg;base64,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";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
/* کلید نگهداری محلی «پیام‌های دیده‌شده توسط مدیر» (بدون هیچ نوشتاری در دیتابیس) */
const ADMIN_SEEN_KEY = "quran-admin-seen-message-ids";
function toFa(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function IslamicMosaicTiles() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.022] pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
    >
      <defs>
        <pattern id="mosaic-pattern" width="120" height="120" patternUnits="userSpaceOnUse">
          <path
            d="M60 0 L72 32 L104 20 L80 48 L112 60 L80 72 L104 100 L72 88 L60 120 L48 88 L16 100 L40 72 L8 60 L40 48 L16 20 L48 32 Z"
            fill="none"
            stroke="#5d6d45"
            strokeWidth="0.8"
          />
          <path
            d="M60 25 L67 43 L85 43 L70 54 L76 72 L60 61 L44 72 L50 54 L35 43 L53 43 Z"
            fill="none"
            stroke="#D4AF37"
            strokeWidth="0.6"
          />
          <circle cx="60" cy="60" r="10" fill="none" stroke="#5d6d45" strokeWidth="0.4" />
          <circle cx="0" cy="0" r="15" fill="none" stroke="#D4AF37" strokeWidth="0.4" />
          <circle cx="120" cy="0" r="15" fill="none" stroke="#D4AF37" strokeWidth="0.4" />
          <circle cx="0" cy="120" r="15" fill="none" stroke="#D4AF37" strokeWidth="0.4" />
          <circle cx="120" cy="120" r="15" fill="none" stroke="#D4AF37" strokeWidth="0.4" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#mosaic-pattern)" />
    </svg>
  );
}

function IslamicCrescentStarIcon({ className = "h-8 w-8 text-[#D4AF37]" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M12 3c.132 0 .263 0 .393.007a7.5 7.5 0 0 0 7.92 12.446A9 9 0 1 1 12 2.999z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="#D4AF37"
        strokeWidth="1.5"
      />
      <polygon
        points="15.5,7 16,9 18,9 16.5,10.2 17,12.2 15.5,11 14,12.2 14.5,10.2 13,9 15,9"
        fill="#D4AF37"
        stroke="#D4AF37"
        strokeWidth="0.5"
      />
    </svg>
  );
}

function GildedIslamicLacePattern() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.14] pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="gilded-lace" width="48" height="48" patternUnits="userSpaceOnUse">
          <path
            d="M 24 0 C 34 12, 34 36, 24 48 C 14 36, 14 12, 24 0 Z"
            fill="none"
            stroke="#cfa864"
            strokeWidth="0.8"
          />
          <path
            d="M 0 24 C 12 34, 36 34, 48 24 C 36 14, 12 14, 0 24 Z"
            fill="none"
            stroke="#cfa864"
            strokeWidth="0.8"
          />
          <path
            d="M 24 16 C 26 10, 30 10, 32 16 C 30 22, 26 22, 24 16 Z"
            fill="#cfa864"
            fillOpacity="0.3"
            stroke="#cfa864"
            strokeWidth="0.4"
          />
          <path
            d="M 24 32 C 22 38, 18 38, 16 32 C 18 26, 22 26, 24 32 Z"
            fill="#cfa864"
            fillOpacity="0.3"
            stroke="#cfa864"
            strokeWidth="0.4"
          />
          <path
            d="M 16 24 C 10 22, 10 18, 16 16 C 22 18, 22 22, 16 24 Z"
            fill="#cfa864"
            fillOpacity="0.3"
            stroke="#cfa864"
            strokeWidth="0.4"
          />
          <path
            d="M 32 24 C 38 26, 38 30, 32 32 C 26 30, 26 26, 32 24 Z"
            fill="#cfa864"
            fillOpacity="0.3"
            stroke="#cfa864"
            strokeWidth="0.4"
          />
          <circle cx="24" cy="24" r="2" fill="#D4AF37" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#gilded-lace)" />
    </svg>
  );
}

function IslamicRosette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="100" cy="100" r="72" />
        <circle cx="100" cy="100" r="46" />
        <path d="M100 18 121 70 174 47 130 86 182 100 130 114 174 153 121 130 100 182 79 130 26 153 70 114 18 100 70 86 26 47 79 70Z" />
        <path d="m100 35 17 42 43-18-35 32 42 9-42 9 35 32-43-18-17 42-17-42-43 18 35-32-42-9 42-9-35-32 43 18Z" />
        <circle cx="100" cy="100" r="18" />
      </g>
    </svg>
  );
}

function PrimaryStatCard({
  label,
  value,
  hint,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: ReactNode;
  tone: "turquoise" | "lapis" | "gold" | "ruby" | "violet";
  onClick: () => void;
}) {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const tiltX = ((y - centerY) / centerY) * 6; // Max 6 degrees soft tilt
    const tiltY = ((centerX - x) / centerX) * 6;
    setCoords({ x, y });
    setTilt({ x: tiltX, y: tiltY });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  };

  const toneCardClass = {
    turquoise: "quran-stat-card-turquoise",
    lapis: "quran-stat-card-lapis",
    gold: "quran-stat-card-gold",
    ruby: "quran-stat-card-ruby",
    violet: "quran-stat-card-violet",
  }[tone];

  // Cohesive Modern soft pastel icon borders & background matching the category items of the screenshot
  const iconAccents = {
    turquoise: "text-teal-700 bg-teal-50 border border-teal-100/50 shadow-sm",
    lapis: "text-blue-700 bg-blue-50 border border-blue-100/50 shadow-sm",
    gold: "text-amber-700 bg-amber-50 border border-amber-100/50 shadow-sm",
    ruby: "text-rose-700 bg-rose-50 border border-rose-100/50 shadow-sm",
    violet: "text-violet-700 bg-violet-50 border border-violet-100/50 shadow-sm",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      className={`quran-stat-card group relative min-h-36 overflow-hidden rounded-[2rem] p-5 text-right ${toneCardClass}`}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transformStyle: "preserve-3d",
      }}
    >
      <IslamicMosaicTiles />
      {/* Soft spotlight following cursor */}
      {isHovered && (
        <span
          className="pointer-events-none absolute rounded-full opacity-55 blur-xl transition-all duration-300"
          style={{
            width: "140px",
            height: "140px",
            background:
              "radial-gradient(circle, rgba(255, 245, 160, 0.22) 0%, rgba(212, 175, 55, 0) 70%)",
            left: `${coords.x - 70}px`,
            top: `${coords.y - 70}px`,
          }}
        />
      )}
      <span className="absolute -left-6 -top-6 h-20 w-20 rotate-45 bg-black/[0.01] transition-all duration-300 group-hover:scale-110" />
      <div
        className="relative flex h-full items-start justify-between gap-3"
        style={{ transform: "translateZ(12px)" }}
      >
        <div className="flex h-full min-w-0 flex-col justify-between">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-2xl font-black text-[#2d2620] md:text-3xl tracking-tight">
            {typeof value === "number" ? toFa(value) : value}
          </p>
          <p className="mt-2 truncate text-[10px] text-[#2d2620] font-bold bg-[#efebd9] border border-black/[0.02] rounded-full px-2.5 py-0.5 inline-block self-start transition-all duration-300">
            {hint}
          </p>
        </div>
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all duration-300 group-hover:scale-105 group-hover:rotate-3 ${iconAccents}`}
        >
          {icon}
        </span>
      </div>
    </button>
  );
}

function PanelHeading({
  eyebrow,
  title,
  icon,
  action,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="quran-panel-heading relative overflow-hidden flex items-center justify-between gap-3 border-b border-amber-100/50 px-6 py-4.5">
      {/* Traditional repeating gold arabesque lace mesh spanning the entire header band */}
      <GildedIslamicLacePattern />

      {/* Glowing bottom gold inlay line bordering the heading band */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#cfa864]/50 to-transparent" />

      <div className="relative z-10">
        <p className="text-xs font-black text-amber-800 font-sans tracking-wide">{eyebrow}</p>
        <h2 className="mt-1 flex items-center gap-2 font-sans text-base font-black text-[#2d2620]">
          <span className="text-[#4a5839]">{icon}</span>
          {title}
        </h2>
      </div>
      <div className="relative z-10">{action}</div>
    </div>
  );
}

// ==================== ابزارهای تاریخ 1 ====================
function isGroupTarget(v: string | null): v is GroupTarget {
  return [
    "all",
    "all_teachers",
    "all_parents",
    "all_students",
    "class_students",
    "class_parents",
  ].includes(v ?? "");
}

function categorize(m: DbMessage): MessageCategory {
  if (isGroupTarget(m.to_role)) return "broadcast";
  if (m.to_role === "admin") return "to-admin";
  if (m.from_role === "admin") return "from-admin";
  if (m.from_role === "teacher" && m.to_role === "student") return "teacher-student";
  if (m.from_role === "student" && m.to_role === "teacher") return "student-teacher";
  if (m.from_role === "parent" && m.to_role === "teacher") return "parent-teacher";
  if (m.from_role === "teacher" && m.to_role === "parent") return "teacher-parent";
  return "other";
}

function getInitials(name: string): string {
  const p = (name ?? "").trim().split(/\s+/);
  return p.length >= 2 ? p[0][0] + p[1][0] : (p[0]?.[0] ?? "؟");
}

function getTodayFa(): string {
  return new Date().toLocaleDateString("fa-IR");
}

function iranDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

/* ─── نمایش تاریخ و ساعت پیام ───
   ممکن است date به شکل fa-IR ذخیره شده باشد («۱۴۰۵/۰۵/۰۶») یا ISO؛
   در هر صورت با created_at (که ساعت هم دارد) کامل می‌شود. */
function fmtDateTime(message: DbMessage): string {
  return formatIranianMessageDateTime(message);
}

function stripReplyPrefix(subject: string | null | undefined): string {
  return String(subject ?? "")
    .replace(/^پاسخ:\s*/g, "")
    .trim();
}

function teacherNameById(teachers: Teacher[], id: unknown): string {
  const teacher = teachers.find((t) => sid(t.id) === sid(id));
  return teacher?.name ?? sid(id);
}

function findStudentByMessageName(
  students: Student[],
  name: string | null | undefined,
  role: string | null | undefined,
): Student | undefined {
  const normalized = normalizeChatName(name);
  if (role === "parent") {
    return students.find((student) => normalizeChatName(student.parent_name) === normalized);
  }
  return students.find((student) => normalizeChatName(student.name) === normalized);
}

/* ╔══════════════════════════════════════╗
   ║  موتور گفت‌وگو — جریان نمایش پیام‌ها      ║
   ║  (هر جفت «یک چت»؛ زنجیرهٔ پاسخ‌ها از ریشه؛ ║
   ║  اطلاعیهٔ گروهی به‌همراه همهٔ پاسخ‌هایش)    ║
   ╚══════════════════════════════════════╝ */
type ActorRole = Role | "group" | "unknown";

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

function chatGroupLabel(toRole: string | null, toId: string | null, classes: QClass[]): string {
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
  teachers: Teacher[],
  parents: ParentRef[],
): DirectoryMaps {
  const studentByName = new Map<string, string>();
  for (const s of students) studentByName.set(normalizeChatName(s.name), sid(s.id));
  const teacherByName = new Map<string, string>();
  for (const t of teachers) teacherByName.set(normalizeChatName(t.name), sid(t.id));
  const parentByName = new Map<string, string>();
  for (const p of parents) parentByName.set(normalizeChatName(p.name), sid(p.id));
  // اگر جدول parents نبود، نام ولی از روی قرآن‌آموزان هم استفاده می‌شود
  for (const s of students)
    if (s.parent_name && !parentByName.has(normalizeChatName(s.parent_name)))
      parentByName.set(normalizeChatName(s.parent_name), sid(s.id));
  return { studentByName, teacherByName, parentByName };
}

/* نام‌های سرنخ‌نما/عمومی که به‌جایشان نام واقعی از دایرکتوری درج می‌شود (رفع «نامشخص») */
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
  teachers: Teacher[],
  parents: ParentRef[],
  secureActorByUserId: Map<string, SecureActorRef>,
): ChatActor {
  const secureActor = message.sender_user_id
    ? secureActorByUserId.get(String(message.sender_user_id))
    : undefined;
  const role = normalizeActorRole(secureActor?.role ?? message.from_role);
  let name = String(secureActor?.name ?? message.from_name ?? "").trim();
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
    secureActor?.entityId ??
    (message.sender_id == null
      ? message.from_id == null
        ? null
        : sid(message.from_id)
      : sid(message.sender_id));
  if (!resolvedId && role === "student")
    resolvedId = maps.studentByName.get(normalizeChatName(name)) ?? null;
  if (!resolvedId && role === "teacher")
    resolvedId = maps.teacherByName.get(normalizeChatName(name)) ?? null;
  if (!resolvedId && role === "parent")
    resolvedId = maps.parentByName.get(normalizeChatName(name)) ?? null;
  /* اگر نام فرستنده عمومی/خالی بود و آیدی داریم، نام واقعی را از دایرکتوری بگیر */
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
  teachers: Teacher[],
  parents: ParentRef[],
  classes: QClass[],
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
  /* نقش نامشخص ولی با آیدی: نقش و نام را از دایرکتوری‌ها حدس بزن تا
     پیام‌های قدیمیِ بدون to_role هم در چتِ درست بنشینند و «نامشخص» نیاید.
     ترتیب جست‌وجو بر اساس نقش فرستنده است (قرآن‌آموز/ولی → استاد؛ استاد → قرآن‌آموز/ولی). */
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
  teachers: Teacher[],
  parents: ParentRef[],
  classes: QClass[],
  secureActorByUserId: Map<string, SecureActorRef>,
): Conversation[] {
  const messageById = new Map<string, DbMessage>(messages.map((m) => [sid(m.id), m]));

  // هر پاسخ به پیام ریشهٔ زنجیرهٔ خودش وصل می‌شود تا در همان چت باقی بماند
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
    const sender = resolveSender(raw, students, teachers, parents, secureActorByUserId);
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
    // اطلاعیهٔ گروهی و پاسخ‌هایش → «چت همان اطلاعیه»؛ مابقی → «چت جفت طرفین»
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
      const nonAdminParticipants = participants.filter((p) => p.role !== "admin");
      const title = groupTarget
        ? groupTarget.name
        : nonAdminParticipants.length > 0
          ? nonAdminParticipants.map((p) => withRolePrefix(p.name, p.role)).join(" ↔ ")
          : "گفتگو با مدیریت";
      const subtitle = groupTarget
        ? "مکالمه گروهی"
        : participants
            .map((p) => p.subtitle)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(" ↔ ");
      const unreadCount = ordered.filter(
        (i) => i.raw.unread === true && i.target.role === "admin",
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

function getAttachIcon(type: string) {
  if (type.startsWith("image/")) return <Image className="h-3.5 w-3.5" />;
  if (type.startsWith("audio/")) return <Music className="h-3.5 w-3.5" />;
  return <FileIcon className="h-3.5 w-3.5" />;
}

function formatBytes(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

/* ─── استخراج تاریخ‌های یکتا از پیام‌ها ─── */
function getUniqueDates(messages: DbMessage[]): { date: string; count: number }[] {
  const map = new Map<string, { date: string; count: number; time: number }>();
  for (const message of messages) {
    const date = formatIranianMessageDate(message);
    if (date === "—") continue;
    const current = map.get(date);
    map.set(date, {
      date,
      count: (current?.count ?? 0) + 1,
      time: Math.max(current?.time ?? 0, messageDisplayTimestamp(message) ?? 0),
    });
  }
  return [...map.values()]
    .sort((a, b) => b.time - a.time)
    .slice(0, 30)
    .map(({ date, count }) => ({ date, count }));
}

/* ╔══════════════════════════════════════╗
   ║      دیالوگ تأیید دومرحله‌ای         ║
   ╚══════════════════════════════════════╝ */
function ConfirmDialog({
  type,
  onConfirm,
  onCancel,
  count,
  chatCount,
}: {
  type: "delete" | "archive" | "delete-conversation" | "delete-bulk";
  count?: number;
  chatCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDelete = type === "delete" || type === "delete-conversation" || type === "delete-bulk";
  const isConvDelete = type === "delete-conversation";
  const isBulkDelete = type === "delete-bulk";
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <Card
        className="w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center space-y-4">
          <div
            className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto ${isDelete ? "bg-red-100" : "bg-amber-100"}`}
          >
            <AlertTriangle className={`h-7 w-7 ${isDelete ? "text-red-600" : "text-amber-600"}`} />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-foreground mb-1">
              {isBulkDelete
                ? "حذف دسته‌جمعی گفت‌وگوها"
                : isConvDelete
                  ? "حذف گفت‌وگو"
                  : isDelete
                    ? "حذف پیام"
                    : "آرشیو پیام"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isBulkDelete
                ? "گفت‌وگوهای انتخاب‌شده با همهٔ پیام‌هایشان حذف می‌شوند. آیا مطمئن هستید؟"
                : isConvDelete
                  ? "این گفت‌وگو با همهٔ پیام‌هایش حذف می‌شود. آیا مطمئن هستید؟"
                  : isDelete
                    ? "آیا مطمئن هستید؟ این عملیات غیرقابل بازگشت است."
                    : "پیام به بخش آرشیو منتقل می‌شود. می‌توانید بعداً آن را بازیابی کنید."}
            </p>
          </div>
          <div
            className={`rounded-xl p-3 text-xs text-right ${isDelete ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}
          >
            <p className={`font-medium mb-1 ${isDelete ? "text-red-700" : "text-amber-700"}`}>
              {isBulkDelete
                ? `⚠️ هشدار: ${chatCount != null ? toFa(chatCount) + " گفت‌وگو و " : ""}مجموعاً ${count != null ? toFa(count) + " " : ""}پیام برای همیشه حذف می‌شود و غیرقابل بازگشت است.`
                : isConvDelete
                  ? `⚠️ هشدار: همهٔ ${count != null ? toFa(count) + " " : ""}پیام‌های این گفت‌وگو برای همیشه حذف می‌شوند و این عملیات غیرقابل بازگشت است.`
                  : isDelete
                    ? "⚠️ هشدار: این پیام برای همیشه حذف می‌شود."
                    : "ℹ️ پیام از لیست اصلی حذف و در آرشیو نگهداری می‌شود."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={onCancel}>
              انصراف
            </Button>
            <Button
              className={
                isDelete
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-amber-600 hover:bg-amber-700 text-white"
              }
              onClick={onConfirm}
            >
              {isDelete ? (
                <>
                  <Trash2 className="h-4 w-4 ml-1" /> بله، حذف شود
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 ml-1" /> بله، آرشیو شود
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ╔══════════════════════════════════════╗
   ║      کامپوننت منوی سه‌نقطه           ║
   ╚══════════════════════════════════════╝ */
function MessageContextMenu({
  message,
  onReply,
  onStar,
  onPin,
  onArchive,
  onDelete,
  onForward,
}: {
  message: DbMessage;
  onReply: () => void;
  onStar: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onForward: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const items = [
    { icon: <Reply className="h-3.5 w-3.5" />, label: "پاسخ", onClick: onReply, color: "" },
    { icon: <Forward className="h-3.5 w-3.5" />, label: "ارجاع", onClick: onForward, color: "" },
    {
      icon: <Star className="h-3.5 w-3.5" />,
      label: message.is_starred ? "حذف ستاره" : "ستاره‌دار",
      onClick: onStar,
      color: "text-amber-500",
    },
    {
      icon: <Pin className="h-3.5 w-3.5" />,
      label: message.is_pinned ? "لغو پین" : "پین کردن",
      onClick: onPin,
      color: "text-primary",
    },
    {
      icon: <Archive className="h-3.5 w-3.5" />,
      label: message.is_archived ? "خارج از آرشیو" : "آرشیو",
      onClick: onArchive,
      color: "text-amber-600",
    },
    {
      icon: <Trash2 className="h-3.5 w-3.5" />,
      label: "حذف",
      onClick: onDelete,
      color: "text-red-500",
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-secondary text-muted-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 bg-popover border border-border rounded-xl shadow-xl w-40 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
                setOpen(false);
              }}
              className={`w-full text-right flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-secondary transition-colors ${item.color || "text-foreground"}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ╔══════════════════════════════════════╗
   ║         پیش‌نمایش پیام              ║
   ╚══════════════════════════════════════╝ */
function PreviewModal({
  form,
  onClose,
  onSend,
  resolveGroupLabel,
  teachers,
  students,
}: {
  form: typeof emptyForm;
  onClose: () => void;
  onSend: () => void;
  resolveGroupLabel: () => string;
  teachers: Teacher[];
  students: Student[];
}) {
  const recipientName = useMemo(() => {
    if (form.mode === "group") return resolveGroupLabel();
    if (form.recipientRole === "teacher")
      return teachers.find((t) => sid(t.id) === form.recipientId)?.name ?? "—";
    if (form.recipientRole === "student")
      return students.find((s) => sid(s.id) === form.recipientId)?.name ?? "—";
    if (form.recipientRole === "parent")
      return students.find((s) => sid(s.id) === form.recipientId)?.parent_name ?? "—";
    return "—";
  }, [form, teachers, students, resolveGroupLabel]);

  const pr = priorityConfig[form.priority];
  const tp = topicConfig[form.topic];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="font-display text-base font-bold flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" /> پیش‌نمایش پیام
          </h3>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="bg-secondary/40 rounded-xl p-4 space-y-2.5 text-sm">
            {[
              { label: "فرستنده", value: "مدیریت مرکز" },
              { label: "گیرنده", value: recipientName },
              { label: "موضوع", value: form.subject || "—" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{r.label}:</span>
                <span className="font-medium">{r.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">اولویت:</span>
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${pr.bg} ${pr.color}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${pr.dot}`} />
                {pr.label}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">دسته‌بندی:</span>
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${tp.color}`}
              >
                {tp.icon}
                {tp.label}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">کانال‌ها:</span>
              <div className="flex gap-1.5">
                {form.channels.map((ch) => (
                  <span
                    key={ch}
                    className={`text-xs flex items-center gap-0.5 ${channelConfig[ch].color}`}
                  >
                    {channelConfig[ch].icon}
                    <span>{channelConfig[ch].label}</span>
                  </span>
                ))}
              </div>
            </div>
            {form.scheduleEnabled && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">زمان ارسال:</span>
                <span className="text-xs">
                  {formatScheduledAt(
                    resolveScheduledAt({
                      preset: form.schedulePreset,
                      customJalaliDate: form.scheduledDate,
                      customTime: form.scheduledTime,
                    }),
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="border rounded-xl p-4">
            <p className="text-sm whitespace-pre-wrap leading-7">
              {form.content || "متنی وارد نشده..."}
            </p>
          </div>
          {form.attachments.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                پیوست‌ها ({toFa(form.attachments.length)}):
              </p>
              {form.attachments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs bg-secondary/40 rounded-lg px-3 py-2"
                >
                  {getAttachIcon(a.type)}
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            ویرایش
          </Button>
          <Button
            className="flex-1 gradient-primary text-primary-foreground gap-2"
            onClick={() => {
              onSend();
              onClose();
            }}
          >
            <Send className="h-4 w-4" />
            تأیید و ارسال
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ╔══════════════════════════════════════╗
   ║   انتخاب‌گر بصری بازه تاریخ (Chart) ║
   ══════════════════════════════════════╝ */
function DateRangeChart({
  messages,
  dateFrom,
  dateTo,
  onRangeChange,
}: {
  messages: DbMessage[];
  dateFrom: string;
  dateTo: string;
  onRangeChange: (from: string, to: string) => void;
}) {
  const data = useMemo(() => getUniqueDates(messages), [messages]);
  const [selecting, setSelecting] = useState(false);
  const [startIndex, setStartIndex] = useState<number | null>(null);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const handleClick = (idx: number) => {
    if (!selecting) {
      setSelecting(true);
      setStartIndex(idx);
      onRangeChange(data[idx].date, data[idx].date);
    } else {
      if (startIndex === null) return;
      const fromIdx = Math.min(startIndex, idx);
      const toIdx = Math.max(startIndex, idx);
      onRangeChange(data[toIdx].date, data[fromIdx].date);
      setSelecting(false);
      setStartIndex(null);
    }
  };

  const isSelected = (idx: number) => {
    if (startIndex === null) return false;
    const fromIdx = Math.min(startIndex, idx);
    const toIdx = Math.max(startIndex, idx);
    const selectedDates = data.slice(fromIdx, toIdx + 1).map((d) => d.date);
    return selectedDates.includes(data[idx].date);
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        داده‌ای برای نمایش وجود ندارد
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
          <BarChart3 className="h-3 w-3" /> انتخاب بازه زمانی (کلیک برای شروع، کلیک مجدد برای پایان)
        </label>
        {selecting && (
          <Badge variant="outline" className="text-[10px]">
            در حال انتخاب...
          </Badge>
        )}
      </div>
      <div className="flex items-end gap-1 h-20 overflow-x-auto pb-2">
        {data.map((d, idx) => {
          const height = Math.round((d.count / maxCount) * 100);
          const selected = isSelected(idx);
          return (
            <button
              key={d.date}
              onClick={() => handleClick(idx)}
              className={`flex flex-col items-center gap-1 min-w-[28px] group transition-all ${
                selected ? "scale-105" : "hover:scale-105"
              }`}
              title={`${toFa(d.date)}: ${toFa(d.count)} پیام`}
            >
              <span
                className={`text-[9px] font-bold transition-colors ${
                  selected
                    ? "text-primary"
                    : "text-muted-foreground opacity-0 group-hover:opacity-100"
                }`}
              >
                {toFa(d.count)}
              </span>
              <div
                className={`w-6 rounded-t transition-all ${
                  selected
                    ? "bg-gradient-to-t from-primary to-primary/60"
                    : "bg-gradient-to-t from-secondary to-secondary/60 group-hover:from-primary/40 group-hover:to-primary/20"
                }`}
                style={{ height: `${Math.max(height, 8)}px` }}
              />
              <span
                className={`text-[8px] transition-colors ${
                  selected ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                {toFa(d.date.split("/").slice(1).join("/"))}
              </span>
            </button>
          );
        })}
      </div>
      {(dateFrom || dateTo) && (
        <div className="flex items-center justify-between text-[10px] bg-secondary/40 rounded-lg px-3 py-2">
          <span className="text-muted-foreground">بازه انتخاب شده:</span>
          <span className="font-medium text-foreground">
            {toFa(dateFrom) || "—"} تا {toFa(dateTo) || "—"}
          </span>
          <button
            onClick={() => onRangeChange("", "")}
            className="text-red-500 hover:text-red-600 flex items-center gap-0.5"
          >
            <X className="h-3 w-3" /> حذف
          </button>
        </div>
      )}
    </div>
  );
}

/* ╔══════════════════════════════════════╗
   ║          کامپوننت اصلی صفحه         ║
   ╚══════════════════════════════════════╝ */
function MessagesPage() {
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<QClass[]>([]);
  const [parents, setParents] = useState<ParentRef[]>([]);
  const [secureActorByUserId, setSecureActorByUserId] = useState<Map<string, SecureActorRef>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState<AdvancedFilters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [replyRecipientKey, setReplyRecipientKey] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [replyingSending, setReplyingSending] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [activeTab, setActiveTab] = useState<MessageTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [showPreview, setShowPreview] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "delete" | "archive" | "delete-conversation" | "delete-bulk";
    message: DbMessage;
    conversation?: Conversation;
    conversations?: Conversation[];
  } | null>(null);
  /* ─── «دیده‌شده توسط مدیر» — فقط محلی (localStorage) ───
     روی پیام‌های دیگران هیچ‌گونه نوشتاری انجام نمی‌شود تا سیاست «نظارت پنهان»
     حفظ بماند؛ اما هر پیام تازه‌ای، در هر چتی، برای مدیر «جدید»/قرمز دیده می‌شود. */
  const [seenByAdmin, setSeenByAdmin] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(ADMIN_SEEN_KEY) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_SEEN_KEY, JSON.stringify([...seenByAdmin].slice(-10000)));
    } catch {
      /* ذخیره‌سازی محلی اختیاری است */
    }
  }, [seenByAdmin]);


  /* ─── بارگذاری ─── */
  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: t }, { data: s }, { data: c }, parentsResult, secureActorsResult] =
      await Promise.all([
        supabase.from("messages").select("*").order("date", { ascending: false }),
        supabase.from("teachers").select("id, name").order("name"),
        supabase.from("students").select("id, name, parent_name, class_id").order("name"),
        supabase
          .from("classes")
          .select("id, name, teacher_id, level, enrolled, capacity")
          .order("name"),
        // جدول والدین اختیاری است؛ اگر وجود نداشته باشد، نام ولی از روی قرآن‌آموزان حل می‌شود
        supabase.from("parents").select("id, name").order("name"),
        supabase
          .from("user_roles")
          .select("id, role, name, admin_id, teacher_id, student_id, parent_id")
          .eq("is_active", true),
      ]);
    setMessages((m as DbMessage[]) ?? []);
    /* نخستین اجرا بعد از این به‌روزرسانی: موجودی فعلی «دیده‌شده» فرض می‌شود
       تا همهٔ پیام‌های قدیمی یک‌باره قرمز نشوند؛ فقط پیام‌های بعدی «جدید» می‌شوند */
    if (localStorage.getItem(ADMIN_SEEN_KEY) === null) {
      setSeenByAdmin(new Set(((m as DbMessage[]) ?? []).map((x) => sid(x.id))));
    }
    setTeachers(t ?? []);
    setStudents(s ?? []);
    setClasses((c as QClass[]) ?? []);
    setParents(
      parentsResult.error
        ? []
        : ((parentsResult.data ?? []) as ParentRef[]).map((p) => ({
            id: sid(p.id),
            name: String(p.name ?? ""),
          })),
    );
    const actorMap = new Map<string, SecureActorRef>();
    for (const row of secureActorsResult.data ?? []) {
      const role = row.role as Role;
      const entityValue =
        role === "admin"
          ? (row.admin_id ?? "admin")
          : role === "teacher"
            ? row.teacher_id
            : role === "student"
              ? row.student_id
              : row.parent_id;
      if (entityValue == null) continue;
      actorMap.set(String(row.id), {
        userId: String(row.id),
        role,
        entityId: String(entityValue),
        name: String(row.name ?? ""),
      });
    }
    setSecureActorByUserId(actorMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ─── به‌روزرسانی زنده با تغییر هر پیام ─── */
  useEffect(() => {
    const channel = supabase
      .channel("admin-messages-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        loadData();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  /* ─── آمار منطقی پیام‌ها؛ Deliveryهای یک campaign فقط یک بار شمرده می‌شوند ─── */
  const currentAdminUserId = getSession()?.userId ?? "";
  const logicalMessages = useMemo(() => uniqueLogicalMessages(messages), [messages]);
  const totalMessages = logicalMessages.length;
  const unreadCount = countLogicalMessages(
    messages,
    (message) => message.unread === true && messageIsDeliveredTo(message, currentAdminUserId),
  );
  const todayKey = iranDateKey(new Date());
  const todayCount = countLogicalMessages(
    messages,
    (message) =>
      messageIsSentBy(message, currentAdminUserId) &&
      iranDateKey(String(message.created_at ?? "")) === todayKey,
  );
  const pinnedCount = countLogicalMessages(messages, (message) => message.is_pinned === true);
  const archivedCount = countLogicalMessages(messages, (message) => message.is_archived === true);

  /* ─── شمارش فیلترهای فعال ─── */
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search) n++;
    if (filters.category !== "all") n++;
    if (filters.fromRole !== "all") n++;
    if (filters.toRole !== "all") n++;
    if (filters.status !== "all") n++;
    if (filters.priority !== "all") n++;
    if (filters.topic !== "all") n++;
    if (filters.dateFrom) n++;
    if (filters.dateTo) n++;
    return n;
  }, [filters]);

  /* ─── نام گیرنده ─── */
  const resolveToName = useCallback(
    (m: DbMessage) => {
      if (m.to_role === "class_students") {
        const cls = classes.find((c) => sid(c.id) === sid(m.to_id));
        return cls ? `قرآن‌آموزان ${cls.name}` : "قرآن‌آموزان کلاس";
      }
      if (m.to_role === "class_parents") {
        const cls = classes.find((c) => sid(c.id) === sid(m.to_id));
        return cls ? `والدین ${cls.name}` : "والدین کلاس";
      }
      if (isGroupTarget(m.to_role)) return groupLabels[m.to_role];
      if (m.to_role === "admin") return "مدیریت مرکز";
      if (m.to_role === "teacher")
        return teachers.find((t) => sid(t.id) === sid(m.to_id))?.name ?? "—";
      if (m.to_role === "student")
        return students.find((s) => sid(s.id) === sid(m.to_id))?.name ?? "—";
      if (m.to_role === "parent")
        return students.find((s) => sid(s.id) === sid(m.to_id))?.parent_name ?? "—";
      return "—";
    },
    [teachers, students, classes],
  );

  const resolveGroupLabel = useCallback((): string => {
    if (form.mode !== "group") return "—";
    if (["class_students", "class_parents"].includes(form.groupTarget) && form.selectedClassId) {
      const cls = classes.find((c) => sid(c.id) === form.selectedClassId);
      const prefix = form.groupTarget === "class_students" ? "قرآن‌آموزان" : "والدین";
      return cls ? `${prefix} ${cls.name}` : (groupLabels[form.groupTarget as GroupTarget] ?? "—");
    }
    return groupLabels[form.groupTarget as GroupTarget] ?? "—";
  }, [form, classes]);

  /* ─── شمارش دسته‌ها ─── */
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: logicalMessages.filter((message) => !message.is_archived).length,
    };
    for (const m of logicalMessages) {
      if (!m.is_archived) {
        const k = categorize(m);
        c[k] = (c[k] ?? 0) + 1;
      }
    }
    return c;
  }, [logicalMessages]);

  /* ─── فیلتر + تب ─── */
  const visible = useMemo(() => {
    return logicalMessages.filter((m) => {
      if (activeTab === "pinned" && !m.is_pinned) return false;
      if (activeTab === "archived" && !m.is_archived) return false;
      if (activeTab !== "pinned" && activeTab !== "archived" && m.is_archived) return false;

      const cat = categorize(m);
      if (filters.category !== "all" && cat !== filters.category) return false;
      if (filters.fromRole !== "all" && m.from_role !== filters.fromRole) return false;
      if (filters.toRole !== "all" && m.to_role !== filters.toRole) return false;
      if (filters.status === "unread" && !m.unread) return false;
      if (filters.status === "read" && m.unread) return false;
      if (filters.priority !== "all" && (m.priority ?? "normal") !== filters.priority) return false;
      if (filters.topic !== "all" && (m.topic ?? "other") !== filters.topic) return false;
      if (filters.dateFrom && m.date < filters.dateFrom) return false;
      if (filters.dateTo && m.date > filters.dateTo) return false;

      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !m.subject?.toLowerCase().includes(q) &&
          !m.content?.toLowerCase().includes(q) &&
          !m.from_name?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [logicalMessages, filters, activeTab]);

  /* ─── گزینه‌های گیرنده ─── */
  const individualOptions = useMemo(() => {
    const q = recipientSearch.toLowerCase();
    let opts: { id: string; label: string; extra: string }[] = [];
    if (form.recipientRole === "teacher")
      opts = teachers.map((t) => ({
        id: sid(t.id),
        label: withRolePrefix(t.name, "teacher"),
        extra: "استاد",
      }));
    else if (form.recipientRole === "student")
      opts = students.map((s) => ({
        id: sid(s.id),
        label: s.name,
        extra: s.parent_name ? `ولی: ${s.parent_name}` : "",
      }));
    else if (form.recipientRole === "parent")
      opts = students
        .filter((s) => s.parent_name)
        .map((s) => ({ id: sid(s.id), label: s.parent_name!, extra: `فرزند: ${s.name}` }));

    return q
      ? opts.filter((o) => o.label.toLowerCase().includes(q) || o.extra.toLowerCase().includes(q))
      : opts;
  }, [form.recipientRole, teachers, students, recipientSearch]);

  /* ─── گفت‌وگوها: هر campaign گروهی فقط یک حباب منطقی دارد ─── */
  const conversations = useMemo(
    () =>
      buildConversations(
        logicalMessages,
        students,
        teachers,
        parents,
        classes,
        secureActorByUserId,
      ),
    [logicalMessages, students, teachers, parents, classes, secureActorByUserId],
  );

  const visibleIds = useMemo(() => new Set(visible.map((m) => sid(m.id))), [visible]);

  /* ─── تشخیص ارسال گروهیِ expand‌شده (اطلاعیه‌های استاد که رکوردِ هر نفرند) ─── */
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

  /* ─── کدام گفت‌وگو «گروهی» محسوب می‌شود؟ ───
     خودِ اطلاعیه (با زنجیرهٔ پاسخ‌هایش) یا چتی که هیچ پیامِ فردیِ آزاد ندارد
     (همهٔ پیام‌های ریشه‌دارِ آن کپیِ ارسال گروهی‌اند). چتِ ترکیبی (گروهی + فردی)
     به‌عنوان «مکالمهٔ فردیِ همان جفت» در تب فردی می‌ماند. */
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

  const activeChats = useMemo(
    () => conversations.filter((c) => c.messages.some((cm) => !cm.raw.is_archived)),
    [conversations],
  );
  const individualChatCount = useMemo(
    () => activeChats.filter((c) => !groupConvKeys.has(c.key)).length,
    [activeChats, groupConvKeys],
  );
  const groupChatCount = useMemo(
    () => activeChats.filter((c) => groupConvKeys.has(c.key)).length,
    [activeChats, groupConvKeys],
  );

  /* ─── لیست چت‌ها: تب «فردی/گروهی» روی گفت‌وگو جدا می‌کند؛ باقی فیلترها همان سیاست سابق ─── */
  const conversationItems = useMemo(
    () =>
      conversations.filter((c) => {
        if (activeTab === "individual" && groupConvKeys.has(c.key)) return false;
        if (activeTab === "group" && !groupConvKeys.has(c.key)) return false;
        return c.messages.some((cm) => visibleIds.has(cm.id));
      }),
    [conversations, visibleIds, activeTab, groupConvKeys],
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
    if (!selectedConversation) return [] as ChatActor[];
    if (selectedConversation.groupTarget) return [selectedConversation.groupTarget];
    return selectedConversation.participants.filter(
      (p) => p.role !== "admin" && p.role !== "unknown",
    );
  }, [selectedConversation]);

  useEffect(() => {
    if (!selectedConversation) {
      setReplyRecipientKey("");
      return;
    }
    setReplyRecipientKey((current) =>
      replyRecipients.some((r) => r.key === current) ? current : (replyRecipients[0]?.key ?? ""),
    );
  }, [selectedConversation, replyRecipients]);

  /* ─── ارسال پیام ─── */
  const resetForm = () => {
    setForm(emptyForm);
    setRecipientSearch("");
  };
  const canSend = Boolean(
    form.subject.trim() &&
    form.content.trim() &&
    ((form.mode === "individual" && form.recipientRole && form.recipientId) ||
      (form.mode === "group" &&
        form.groupTarget &&
        (!["class_students", "class_parents"].includes(form.groupTarget) || form.selectedClassId))),
  );

  const sendMessage = async () => {
    if (!canSend) {
      toast.error("لطفاً گیرنده، موضوع و متن پیام را تکمیل کنید");
      return;
    }
    let scheduledAt: string | null = null;
    if (form.scheduleEnabled) {
      scheduledAt = resolveScheduledAt({
        preset: form.schedulePreset,
        customJalaliDate: form.scheduledDate,
        customTime: form.scheduledTime,
      });
      const scheduledMillis = scheduledAt ? new Date(scheduledAt).getTime() : Number.NaN;
      if (!scheduledAt || Number.isNaN(scheduledMillis)) {
        toast.error("تاریخ جلالی و ساعت زمان‌بندی را کامل کنید");
        return;
      }
      if (scheduledMillis < Date.now() + 60_000) {
        toast.error("زمان ارسال باید حداقل یک دقیقه در آینده باشد");
        return;
      }
    }

    setSending(true);
    const isClassBased = ["class_students", "class_parents"].includes(form.groupTarget);
    try {
      const result = await sendSecureMessage({
        targetType: form.mode === "individual" ? form.recipientRole : form.groupTarget,
        targetId:
          form.mode === "individual"
            ? form.recipientId
            : isClassBased
              ? form.selectedClassId
              : null,
        subject: form.subject,
        content: form.content,
        priority: form.priority,
        topic: form.topic,
        files: form.attachments,
        scheduledAt,
      });
      toast.success(
        result.deliveryStatus === "scheduled"
          ? `پیام برای ${toFa(result.recipientCount)} حساب زمان‌بندی شد`
          : `✅ پیام امن برای ${toFa(result.recipientCount)} حساب ارسال شد`,
      );
      resetForm();
      await loadData();
    } catch (error) {
      toast.error("خطا در ارسال: " + (error instanceof Error ? error.message : error));
    } finally {
      setSending(false);
    }
  };

  /* ─── عملیات روی پیام ─── */
  const markRead = async (m: DbMessage) => {
    if (!m.unread) return;
    const entry: SeenEntry = { user_name: "مدیریت مرکز", seen_at: new Date().toISOString() };
    const prev = Array.isArray(m.seen_by) ? m.seen_by : [];
    await updateSecureMessageState(m.id, { unread: false });
    setMessages((previous) =>
      previous.map((item) =>
        item.id === m.id ? { ...item, unread: false, seen_by: [...prev, entry] } : item,
      ),
    );
  };

  const toggleStar = async (m: DbMessage, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const val = !m.is_starred;
    await updateSecureMessageState(m.id, { isStarred: val });
    setMessages((p) => p.map((x) => (x.id === m.id ? { ...x, is_starred: val } : x)));
    toast.success(val ? "⭐ ستاره‌دار شد" : "ستاره حذف شد");
  };

  const togglePin = async (m: DbMessage) => {
    const val = !m.is_pinned;
    await updateSecureMessageState(m.id, { isPinned: val });
    setMessages((p) => p.map((x) => (x.id === m.id ? { ...x, is_pinned: val } : x)));
    toast.success(val ? "📌 پین شد" : "پین برداشته شد");
  };

  const requestArchive = (m: DbMessage) => setConfirmDialog({ type: "archive", message: m });
  const confirmArchive = async () => {
    if (!confirmDialog) return;
    const m = confirmDialog.message;
    const val = !m.is_archived;
    await updateSecureMessageState(m.id, { isArchived: val });
    setMessages((p) => p.map((x) => (x.id === m.id ? { ...x, is_archived: val } : x)));
    toast.success(val ? "📦 آرشیو شد" : "از آرشیو خارج شد");
    setConfirmDialog(null);
  };

  const requestDelete = (m: DbMessage) => setConfirmDialog({ type: "delete", message: m });
  const requestDeleteConversation = (c: Conversation) =>
    setConfirmDialog({ type: "delete-conversation", message: c.lastMessage.raw, conversation: c });

  /* ─── حذف دسته‌جمعی گفت‌وگوهای انتخاب‌شده ─── */
  const toggleChatSelection = (key: string) =>
    setSelectedChats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const requestDeleteSelected = () => {
    const convs = conversations.filter((c) => selectedChats.has(c.key));
    if (convs.length === 0) return;
    setConfirmDialog({
      type: "delete-bulk",
      message: convs[0].lastMessage.raw,
      conversations: convs,
    });
  };

  const confirmDelete = async () => {
    if (!confirmDialog) return;
    /* حذف دسته‌جمعی گفت‌وگوهای انتخاب‌شده */
    if (confirmDialog.type === "delete-bulk" && confirmDialog.conversations) {
      const convs = confirmDialog.conversations;
      const ids = convs.flatMap((c) => c.messages.map((cm) => cm.id));
      if (ids.length === 0) {
        setConfirmDialog(null);
        return;
      }
      try {
        await deleteSecureMessages(ids);
        setMessages((previous) => previous.filter((item) => !ids.includes(sid(item.id))));
        if (selectedConversation && selectedChats.has(selectedConversation.key))
          setSelectedConversationKey(null);
        setSelectedChats(new Set());
        setSelectionMode(false);
        toast.success(`🗑️ ${toFa(convs.length)} گفت‌وگو با مجموع ${toFa(ids.length)} پیام حذف شد`);
      } catch (error) {
        toast.error("خطا در حذف دسته‌جمعی: " + (error instanceof Error ? error.message : error));
      }
      setConfirmDialog(null);
      return;
    }
    /* حذف کل گفت‌وگو (همهٔ پیام‌های این چت) */
    if (confirmDialog.type === "delete-conversation" && confirmDialog.conversation) {
      const ids = confirmDialog.conversation.messages.map((cm) => cm.id);
      if (ids.length === 0) {
        setConfirmDialog(null);
        return;
      }
      try {
        await deleteSecureMessages(ids);
        setMessages((previous) => previous.filter((item) => !ids.includes(sid(item.id))));
        if (selectedConversation?.key === confirmDialog.conversation!.key)
          setSelectedConversationKey(null);
        toast.success(`🗑️ گفت‌وگو با ${toFa(ids.length)} پیام حذف شد`);
      } catch (error) {
        toast.error("خطا در حذف گفت‌وگو: " + (error instanceof Error ? error.message : error));
      }
      setConfirmDialog(null);
      return;
    }
    /* حذف یک پیام */
    const delId = sid(confirmDialog.message.id);
    try {
      await deleteSecureMessages([confirmDialog.message.id]);
      setMessages((previous) => previous.filter((item) => sid(item.id) !== delId));
      if (
        selectedConversation &&
        !selectedConversation.messages.some((item) => item.id !== delId)
      ) {
        setSelectedConversationKey(null);
      }
      toast.success("🗑️ پیام حذف شد");
    } catch (error) {
      toast.error("خطا در حذف: " + (error instanceof Error ? error.message : error));
    }
    setConfirmDialog(null);
  };

  /* ─── باز کردن چت ───
     فقط پیام‌هایی که گیرنده‌شان «مدیریت» است خوانده می‌شوند؛
     باز کردن مکالمات استاد↔قرآن‌آموز / استاد↔ولی هیچ اثری
     (unread یا seen_by) روی پیام‌های آن‌ها ثبت نمی‌کند تا
     «دیده شد» برای طرفین نمایش داده نشود. */
  const openDetail = (conversation: Conversation) => {
    setSelectedConversationKey(conversation.key);
    for (const cm of conversation.messages) {
      if (
        cm.raw.unread &&
        (messageIsDeliveredTo(cm.raw, currentAdminUserId) || cm.target.role === "admin")
      )
        void markRead(cm.raw);
    }
    /* ثبت محلی «دیده‌شده توسط مدیر» برای همهٔ پیام‌های این چت —
       بدون هیچ نوشتاری روی پیام‌های دیگران؛ «جدید» بودن چت همین‌جا برداشته می‌شود */
    setSeenByAdmin((prev) => {
      const next = new Set(prev);
      for (const cm of conversation.messages) next.add(cm.id);
      return next;
    });
    setReplyContent("");
  };

  /* ─── شمارش «جدید برای مدیر» در هر چت ───
     پیامِ به‌سمت مدیر: بر اساس unread دیتابیس (با markRead همگام)؛
     پیامِ بین دیگران (نظارت): بر اساس «دیده‌نشده توسط مدیر»ی محلی. */
  const newCountOf = useCallback(
    (conversation: Conversation): number => {
      const logicalKeys = new Set<string>();
      for (const message of conversation.messages) {
        const isIncomingToAdmin =
          messageIsDeliveredTo(message.raw, currentAdminUserId) || message.target.role === "admin";
        if (
          (isIncomingToAdmin && message.raw.unread === true) ||
          (!isIncomingToAdmin && !seenByAdmin.has(message.id))
        )
          logicalKeys.add(secureMessageLogicalKey(message.raw));
      }
      return logicalKeys.size;
    },
    [seenByAdmin, currentAdminUserId],
  );

  /* ─── پاسخ سریع: به گیرندهٔ انتخاب‌شده، با اتصال به ریشهٔ همان چت ─── */
  const sendReply = async () => {
    if (!selectedConversation || !replyContent.trim()) return;
    const recipient = replyRecipients.find((r) => r.key === replyRecipientKey);
    if (!recipient) {
      toast.error("گیرندهٔ پاسخ مشخص نیست");
      return;
    }
    setReplyingSending(true);
    const lastRaw = selectedConversation.lastMessage.raw;
    const subjectSource = (lastRaw.subject ?? "").trim() || selectedConversation.title;
    const subject = subjectSource.startsWith("پاسخ:") ? subjectSource : `پاسخ: ${subjectSource}`;
    try {
      await sendSecureMessage({
        targetType:
          recipient.role === "group" ? (recipient.groupTargetRole ?? "all") : recipient.role,
        targetId: recipient.role === "group" ? (recipient.groupTargetId ?? null) : recipient.id,
        subject,
        content: replyContent,
        priority: lastRaw.priority,
        topic: lastRaw.topic,
        parentMessageId: selectedConversation.rootMessageId,
      });
      await updateSecureMessageState(lastRaw.id, { replied: true });
      setMessages((previous) =>
        previous.map((item) => (item.id === lastRaw.id ? { ...item, replied: true } : item)),
      );
      toast.success("✅ پاسخ ارسال شد");
      setReplyContent("");
      await loadData();
    } catch (error) {
      toast.error("خطا در ارسال پاسخ: " + (error instanceof Error ? error.message : error));
    } finally {
      setReplyingSending(false);
    }
  };

  /* ╔══════════════════════════════════════╗
     ║         توابع خروجی                  ║
     ╚══════════════════════════════════════╝ */
  const exportExcel = () => {
    const headers = [
      "شناسه",
      "فرستنده",
      "نقش فرستنده",
      "گیرنده",
      "موضوع",
      "متن",
      "تاریخ",
      "وضعیت",
      "اولویت",
      "دسته‌بندی",
    ];
    const rows = visible.map((m) => [
      m.id,
      m.from_name,
      m.from_role ? roleLabels[m.from_role] : "",
      resolveToName(m),
      m.subject,
      `"${m.content.replace(/"/g, '""')}"`,
      fmtDateTime(m),
      m.unread ? "خوانده‌نشده" : "خوانده‌شده",
      priorityConfig[(m.priority as Priority) ?? "normal"]?.label ?? "",
      topicConfig[(m.topic as TopicCategory) ?? "other"]?.label ?? "",
    ]);
    const csv = "﻿" + [headers, ...rows].map((r) => r.join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })),
      download: `مکاتبات-${getTodayFa()}.csv`,
    });
    a.click();
    toast.success("📊 فایل Excel دانلود شد");
  };

  const exportWord = () => {
    const rows = visible
      .map(
        (m) => `
      <tr>
        <td style="border:1px solid #ccc;padding:6px">${m.from_name}</td>
        <td style="border:1px solid #ccc;padding:6px">${resolveToName(m)}</td>
        <td style="border:1px solid #ccc;padding:6px">${m.subject}</td>
        <td style="border:1px solid #ccc;padding:6px">${m.content}</td>
        <td style="border:1px solid #ccc;padding:6px">${fmtDateTime(m)}</td>
        <td style="border:1px solid #ccc;padding:6px">${m.unread ? "خوانده‌نشده" : "خوانده‌شده"}</td>
      </tr>`,
      )
      .join("");
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8"/>
        <style>
          body { font-family: Tahoma, Arial; direction: rtl; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #1a4a2e; color: white; padding: 8px; border: 1px solid #ccc; }
          td { padding: 6px; }
          h2 { color: #1a4a2e; }
        </style>
      </head>
      <body>
        <h2>گزارش مکاتبات — دارالقرآن بِرّ الوالدین</h2>
        <p>تاریخ گزارش: ${getTodayFa()} | تعداد: ${toFa(visible.length)} پیام</p>
        <table>
          <thead>
            <tr>
              <th>فرستنده</th><th>گیرنده</th><th>موضوع</th>
              <th>متن</th><th>تاریخ</th><th>وضعیت</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>`;
    const blob = new Blob([html], { type: "application/msword;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `مکاتبات-${getTodayFa()}.doc`,
    });
    a.click();
    toast.success("📝 فایل Word دانلود شد");
  };

  const exportPdf = () => {
    const rows = visible
      .map(
        (m) => `
      <tr>
        <td>${m.from_name}</td>
        <td>${resolveToName(m)}</td>
        <td>${m.subject}</td>
        <td style="max-width:200px;word-wrap:break-word">${m.content.substring(0, 120)}${m.content.length > 120 ? "..." : ""}</td>
        <td>${fmtDateTime(m)}</td>
        <td>
          <span style="padding:2px 6px;border-radius:4px;font-size:11px;
            background:${m.unread ? "#fef3c7" : "#d1fae5"};
            color:${m.unread ? "#92400e" : "#065f46"}">
            ${m.unread ? "خوانده‌نشده" : "خوانده‌شده"}
          </span>
        </td>
      </tr>`,
      )
      .join("");
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("لطفاً popup را در مرورگر فعال کنید");
      return;
    }
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8"/>
        <title>گزارش مکاتبات</title>
        <style>
          @media print { @page { margin: 15mm; size: A4 landscape; } }
          body { font-family: Tahoma, Arial, sans-serif; direction: rtl; margin: 20px; color: #111; }
          h2 { color: #1a4a2e; border-bottom: 3px solid #c9a84c; padding-bottom: 8px; }
          .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #1a4a2e; color: white; padding: 8px 6px; text-align: right; border: 1px solid #ddd; }
          td { padding: 6px; border: 1px solid #ddd; vertical-align: top; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer { margin-top: 20px; font-size: 11px; color: #888; text-align: center; }
        </style>
      </head>
      <body>
        <h2>📋 گزارش مکاتبات — دارالقرآن بِرّ الوالدین</h2>
        <div class="meta">تاریخ گزارش: ${getTodayFa()} | تعداد پیام‌ها: ${toFa(visible.length)} مورد</div>
        <table>
          <thead>
            <tr>
              <th>فرستنده</th><th>گیرنده</th><th>موضوع</th>
              <th>متن پیام</th><th>تاریخ</th><th>وضعیت</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">این گزارش به صورت خودکار توسط سامانه مدیریت دارالقرآن تولید شده است.</div>
        <script>window.onload = () => { window.print(); }</script>
      </body></html>`);
    win.document.close();
    toast.success("🖨️ پنجره چاپ PDF باز شد");
  };

  /* ─── کمک‌متغیرهای مودال چت ─── */
  const selectedLastRaw = selectedConversation?.lastMessage.raw ?? null;
  const selectedHasAdminParticipant =
    selectedConversation?.participants.some((p) => p.role === "admin") ?? false;

  /* ─── بارگذاری ─── */
  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال بارگذاری...</span>
      </div>
    );
  }

  /* ╔══════════════════════════════════════╗
     ║                رِندِر               ║
     ╚══════════════════════════════════════╝ */
  return (
    <>
      <style>{dashboardStyles}</style>
      <div className="quran-admin-dashboard space-y-6" dir="rtl">
        {/* ================= HERO BINDING HEADER BANNER (GREEN LEATHER COVER) ================= */}
        <section
          className="quran-admin-hero relative overflow-hidden rounded-[2.25rem] text-white shadow-2xl transition-all duration-300 p-8"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(15, 45, 20, 0.97) 0%, rgba(25, 65, 35, 0.95) 50%, rgba(40, 95, 55, 0.97) 100%), url('" +
              ISLAMIC_BG_BASE64 +
              "')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <IslamicRosette className="absolute -left-20 -top-20 h-72 w-72 text-amber-200 opacity-[.07] animate-spin-slow" />

          <div className="relative flex items-center justify-between gap-4 flex-wrap z-10">
            <div>
              <div className="flex items-center gap-3 text-amber-200">
                <span className="quran-ornament-line" />
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold tracking-wide">
                  دارالقرآن تخصصی بِرّ الوالدین
                </span>
              </div>
              <h1 className="mt-3 font-display text-2xl font-black md:text-3xl text-white text-shadow-gold">
                مرکز پیام‌رسانی دارالقرآن
              </h1>
              <p className="mt-2 text-sm text-amber-50/90 font-quran text-lg">
                «وَقُلْ رَبِّ زِدْنِي عِلْمًا» — نظارت بر تمامی مکاتبات بین مدیریت، اساتید،
                قرآن‌آموزان و والدین مرکز
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="rounded-xl bg-[#5d6d45] text-white hover:bg-[#4a5839] border border-[#5d6d45]/20 shadow-md gap-2 font-bold"
                onClick={() => setForm((f) => ({ ...f, mode: "group" }))}
              >
                <Megaphone className="h-4 w-4" />
                ارسال اطلاعیه جدید
              </Button>
            </div>
          </div>
        </section>

        {/* ================= PRIMARY STAT CARDS (TACTILE GEMSTONES) ================= */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PrimaryStatCard
            label="تعداد کل پیام‌ها"
            value={totalMessages}
            hint="مکاتبات کلی"
            icon={<MessageSquare className="h-6 w-6" />}
            tone="turquoise"
            onClick={() => {}}
          />
          <PrimaryStatCard
            label="خوانده‌نشده"
            value={unreadCount}
            hint={unreadCount > 0 ? "نیازمند بررسی" : "پیام جدیدی نیست"}
            icon={<MailOpen className="h-6 w-6" />}
            tone="gold"
            onClick={() => {}}
          />
          <PrimaryStatCard
            label="ارسال‌شده امروز"
            value={todayCount}
            hint="ثبت‌شده امروز"
            icon={<CalendarDays className="h-6 w-6" />}
            tone="violet"
            onClick={() => {}}
          />
        </section>

        {/* ████  محتوای اصلی  ████ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" dir="rtl">
          {/* ═══ ستون چپ: لیست ═══ */}
          <Card className="lg:col-span-2 quran-panel rounded-[2rem] p-0 overflow-hidden relative">
            <PanelHeading
              eyebrow="صندوق پیام‌های دریافتی و ارسالی"
              title={`مکاتبات و گفتگوها (${toFa(conversationItems.length)} گفتگو)`}
              icon={<Inbox className="h-5 w-5" />}
              action={
                <div className="flex items-center gap-2 flex-wrap relative z-10">
                  {/* toggle نمایش */}
                  <div className="flex items-center rounded-lg border overflow-hidden bg-card/60 shadow-inner">
                    <button
                      onClick={() => setViewMode("compact")}
                      className={cn(
                        "p-1.5 transition-all h-8 w-8 flex items-center justify-center",
                        viewMode === "compact"
                          ? "bg-[#4a5839] text-white"
                          : "hover:bg-[#5d6d45]/10 text-muted-foreground",
                      )}
                    >
                      <LayoutList className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("expanded")}
                      className={cn(
                        "p-1.5 transition-all h-8 w-8 flex items-center justify-center",
                        viewMode === "expanded"
                          ? "bg-[#4a5839] text-white"
                          : "hover:bg-[#5d6d45]/10 text-muted-foreground",
                      )}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                  {/* خروجی */}
                  <div className="flex items-center rounded-lg border overflow-hidden bg-card/60 shadow-inner">
                    <button
                      onClick={exportExcel}
                      className="flex items-center gap-1 px-2.5 h-8 text-xs hover:bg-[#5d6d45]/10 transition-colors text-[#4a5839] font-bold"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-[#cfa864]" />
                      <span>Excel</span>
                    </button>
                    <div className="w-px h-5 bg-border" />
                    <button
                      onClick={exportWord}
                      className="flex items-center gap-1 px-2.5 h-8 text-xs hover:bg-[#5d6d45]/10 transition-colors text-[#4a5839] font-bold"
                    >
                      <FileText className="h-4 w-4 text-[#cfa864]" />
                      <span>Word</span>
                    </button>
                    <div className="w-px h-5 bg-border" />
                    <button
                      onClick={exportPdf}
                      className="flex items-center gap-1 px-2.5 h-8 text-xs hover:bg-[#5d6d45]/10 transition-colors text-[#4a5839] font-bold"
                    >
                      <Download className="h-4 w-4" />
                      <span>PDF</span>
                    </button>
                  </div>
                  {/* فیلتر */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs font-bold quran-soft-clay-card rounded-lg h-8"
                    onClick={() => setShowFilters((v) => !v)}
                  >
                    <Filter className="h-3.5 w-3.5 text-[#4a5839]" />
                    فیلتر
                    {activeFilterCount > 0 && (
                      <Badge className="h-4 min-w-4 p-0 flex items-center justify-center text-[10px] bg-[#4a5839] text-white rounded-full">
                        {toFa(activeFilterCount)}
                      </Badge>
                    )}
                    {showFilters ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              }
            />
            <div className="p-5 space-y-4">
              {/* تب‌ها */}
              <div className="flex items-center gap-1 bg-[#efebd9]/50 border border-black/[0.02] p-1 rounded-xl">
                {[
                  { key: "all" as MessageTab, label: "همه", count: counts.all },
                  { key: "individual" as MessageTab, label: "👤 فردی", count: individualChatCount },
                  { key: "group" as MessageTab, label: "📢 گروهی", count: groupChatCount },
                  { key: "pinned" as MessageTab, label: "📌 پین‌شده", count: pinnedCount },
                  { key: "archived" as MessageTab, label: "📦 آرشیو", count: archivedCount },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "flex-1 text-xs py-1.5 px-3 rounded-lg font-black transition-all",
                      activeTab === tab.key
                        ? "bg-card shadow-sm text-[#2d2620]"
                        : "text-muted-foreground hover:text-[#2d2620]",
                    )}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span
                        className={cn(
                          "mr-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                          activeTab === tab.key ? "bg-[#5d6d45]/10 text-[#4a5839]" : "bg-secondary",
                        )}
                      >
                        {toFa(tab.count)}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* نوار ابزار: انتخاب دسته‌جمعی + به‌روزرسانی */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    "rounded-xl text-xs gap-1.5 h-8",
                    selectionMode && "border-[#4a5839] bg-[#5d6d45]/10 text-[#4a5839] font-black",
                  )}
                  onClick={() => {
                    setSelectionMode((v) => !v);
                    setSelectedChats(new Set());
                  }}
                >
                  <CheckCheck className="h-3.5 w-3.5" /> انتخاب دسته‌جمعی
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-xs gap-1.5 h-8 text-muted-foreground"
                  onClick={() => loadData()}
                  disabled={loading}
                  title="به‌روزرسانی پیام‌ها"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> به‌روزرسانی
                </Button>
                {selectionMode && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl text-xs h-8"
                      onClick={() =>
                        setSelectedChats((prev) =>
                          prev.size === conversationItems.length
                            ? new Set()
                            : new Set(conversationItems.map((c) => c.key)),
                        )
                      }
                    >
                      {selectedChats.size === conversationItems.length &&
                      conversationItems.length > 0
                        ? "لغو انتخاب همه"
                        : "انتخاب همه"}
                    </Button>
                    <span className="text-xs text-muted-foreground font-bold">
                      {toFa(selectedChats.size)} گفت‌وگو انتخاب شد
                    </span>
                    <Button
                      size="sm"
                      className="rounded-xl text-xs gap-1 h-8 bg-red-600 hover:bg-red-700 text-white mr-auto"
                      disabled={selectedChats.size === 0}
                      onClick={requestDeleteSelected}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف ({toFa(selectedChats.size)})
                    </Button>
                  </>
                )}
              </div>

              {/* ═══ پنل فیلتر پیشرفته ═══ */}
              {showFilters && (
                <div className="p-4 rounded-2xl border bg-secondary/30 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* جستجو */}
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pr-9 text-sm"
                      placeholder="جستجو در متن، موضوع یا نام فرستنده..."
                      value={filters.search}
                      onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* نوع مکاتبه */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="h-3 w-3 text-[#4a5839]" /> نوع مکاتبه
                      </label>
                      <Select
                        value={filters.category}
                        onValueChange={(v) =>
                          setFilters((f) => ({ ...f, category: v as MessageCategory | "all" }))
                        }
                      >
                        <SelectTrigger className="text-xs h-8 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all" className="text-xs">
                            — همه انواع مکاتبه ({toFa(counts.all ?? 0)})
                          </SelectItem>
                          {(Object.keys(categoryLabels) as MessageCategory[]).map((k) => (
                            <SelectItem key={k} value={k} className="text-xs">
                              {categoryLabels[k]} ({toFa(counts[k] ?? 0)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* نقش فرستنده */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <UserCheck className="h-3 w-3 text-[#4a5839]" /> نقش فرستنده
                      </label>
                      <Select
                        value={filters.fromRole}
                        onValueChange={(v) =>
                          setFilters((f) => ({ ...f, fromRole: v as Role | "all" }))
                        }
                      >
                        <SelectTrigger className="text-xs h-8 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all" className="text-xs">
                            — همه فرستندگان
                          </SelectItem>
                          {(Object.keys(roleLabels) as Role[]).map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                              {roleLabels[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* وضعیت خواندن */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <MailOpen className="h-3 w-3 text-[#4a5839]" /> وضعیت خواندن
                      </label>
                      <Select
                        value={filters.status}
                        onValueChange={(v) =>
                          setFilters((f) => ({ ...f, status: v as "all" | "unread" | "read" }))
                        }
                      >
                        <SelectTrigger className="text-xs h-8 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all" className="text-xs">
                            — همه وضعیت‌ها
                          </SelectItem>
                          <SelectItem value="unread" className="text-xs">
                            خوانده‌نشده
                          </SelectItem>
                          <SelectItem value="read" className="text-xs">
                            خوانده‌شده
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* اولویت */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-[#4a5839]" /> اولویت پیام
                      </label>
                      <Select
                        value={filters.priority}
                        onValueChange={(v) =>
                          setFilters((f) => ({ ...f, priority: v as Priority | "all" }))
                        }
                      >
                        <SelectTrigger className="text-xs h-8 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all" className="text-xs">
                            — همه اولویت‌ها
                          </SelectItem>
                          <SelectItem value="urgent" className="text-xs">
                            🔴 فوری
                          </SelectItem>
                          <SelectItem value="normal" className="text-xs">
                            🟡 معمولی
                          </SelectItem>
                          <SelectItem value="info" className="text-xs">
                            🟢 اطلاع‌رسانی
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* دسته‌بندی موضوعی */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <Bell className="h-3 w-3 text-[#4a5839]" /> دسته‌بندی موضوعی
                      </label>
                      <Select
                        value={filters.topic}
                        onValueChange={(v) =>
                          setFilters((f) => ({ ...f, topic: v as TopicCategory | "all" }))
                        }
                      >
                        <SelectTrigger className="text-xs h-8 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all" className="text-xs">
                            — همه موضوعات
                          </SelectItem>
                          {(Object.keys(topicConfig) as TopicCategory[]).map((k) => (
                            <SelectItem key={k} value={k} className="text-xs">
                              {topicConfig[k].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* نقش گیرنده */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3 text-[#4a5839]" /> نقش گیرنده
                      </label>
                      <Select
                        value={filters.toRole}
                        onValueChange={(v) =>
                          setFilters((f) => ({ ...f, toRole: v as Role | GroupTarget | "all" }))
                        }
                      >
                        <SelectTrigger className="text-xs h-8 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all" className="text-xs">
                            — همه گیرندگان
                          </SelectItem>
                          {(Object.keys(roleLabels) as Role[]).map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                              {roleLabels[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* ═══ انتخاب‌گر بصری بازه تاریخ ═══ */}
                  <div className="border-t pt-3">
                    <DateRangeChart
                      messages={messages}
                      dateFrom={filters.dateFrom}
                      dateTo={filters.dateTo}
                      onRangeChange={(from, to) =>
                        setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }))
                      }
                    />
                  </div>
                  {activeFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs gap-1 text-muted-foreground"
                      onClick={() => setFilters(defaultFilters)}
                    >
                      <X className="h-3.5 w-3.5" /> پاک‌سازی همه فیلترها ({toFa(activeFilterCount)}{" "}
                      فیلتر فعال)
                    </Button>
                  )}
                </div>
              )}

              {/* ═══ لیست پیام‌ها ═══ */}
              <div className="space-y-2 max-h-[58vh] overflow-y-auto pl-1 quran-scroll">
                {conversationItems.length === 0 && (
                  <div className="p-12 text-center">
                    <Inbox className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-semibold">گفتگویی یافت نشد.</p>
                  </div>
                )}
                {conversationItems.map((conversation) => {
                  const m = conversation.lastMessage.raw;
                  const newCount = newCountOf(conversation);
                  const hasUnread = newCount > 0;
                  const isSelected = selectedChats.has(conversation.key);
                  const isCompact = viewMode === "compact";
                  return (
                    <div
                      key={conversation.key}
                      onClick={() =>
                        selectionMode
                          ? toggleChatSelection(conversation.key)
                          : openDetail(conversation)
                      }
                      className={cn(
                        "group w-full text-right rounded-xl border transition-all duration-200 cursor-pointer",
                        isCompact ? "p-2.5" : "p-3",
                        isSelected
                          ? "border-[#4a5839] bg-[#5d6d45]/15 shadow-sm"
                          : m.is_pinned
                            ? "border-primary/40 bg-primary/5 shadow-sm"
                            : hasUnread
                              ? "border-red-300 bg-red-50/70 hover:bg-red-50 shadow-sm"
                              : "bg-card border-border/50 hover:bg-[#5d6d45]/10",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        {selectionMode && (
                          <span
                            className={cn(
                              "h-4.5 w-4.5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all",
                              isSelected
                                ? "bg-[#4a5839] border-[#4a5839]"
                                : "border-muted-foreground/40 bg-background",
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </span>
                        )}
                        <div className="relative shrink-0">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback
                              className={cn(
                                "font-bold text-xs",
                                hasUnread
                                  ? "bg-red-100 text-red-700"
                                  : "bg-primary/15 text-primary",
                              )}
                            >
                              {conversation.isGroup ? (
                                <Users className="h-4 w-4" />
                              ) : (
                                getInitials(conversation.title)
                              )}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {m.is_pinned && <Pin className="h-3 w-3 text-[#4a5839] shrink-0" />}
                            <span
                              className={cn(
                                "text-[13px] truncate font-black",
                                hasUnread ? "text-red-700" : "text-foreground",
                              )}
                            >
                              {withRolePrefix(
                                conversation.lastMessage.sender.name,
                                conversation.lastMessage.sender.role,
                              )}
                            </span>
                            <span className="text-muted-foreground text-[11px] shrink-0">←</span>
                            <span
                              className={cn(
                                "text-[13px] truncate font-bold",
                                hasUnread ? "text-red-700/90" : "text-foreground/90",
                              )}
                            >
                              {withRolePrefix(
                                conversation.lastMessage.target.name,
                                conversation.lastMessage.target.role,
                              )}
                            </span>
                            {(conversation.isGroup || groupConvKeys.has(conversation.key)) && (
                              <Badge className="bg-gold/20 text-gold-foreground border-0 text-[9px] py-0 shrink-0 font-bold">
                                گروهی
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground font-sans font-bold shrink-0">
                              ({toFa(conversation.messages.length)})
                            </span>
                          </div>
                          {!isCompact && conversation.subtitle && (
                            <p className="text-[10px] text-muted-foreground truncate font-bold mt-0.5">
                              {conversation.subtitle}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {hasUnread && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-600 text-white font-black animate-pulse">
                              {toFa(newCount)} جدید
                            </span>
                          )}
                          <button
                            onClick={(e) => toggleStar(m, e)}
                            className={cn(
                              "h-6 w-6 rounded flex items-center justify-center transition-all hover:scale-110",
                              m.is_starred
                                ? "text-amber-400"
                                : "text-muted-foreground opacity-0 group-hover:opacity-100",
                            )}
                          >
                            <Star
                              className={cn("h-3.5 w-3.5", m.is_starred ? "fill-amber-400" : "")}
                            />
                          </button>
                          <span className="text-[10px] text-muted-foreground font-sans font-bold whitespace-nowrap">
                            {fmtDateTime(m)}
                          </span>
                          <MessageContextMenu
                            message={m}
                            onReply={() => openDetail(conversation)}
                            onStar={() => toggleStar(m)}
                            onPin={() => togglePin(m)}
                            onArchive={() => requestArchive(m)}
                            onDelete={() => requestDelete(m)}
                            onForward={() => {
                              setForm((f) => ({
                                ...emptyForm,
                                mode: "individual",
                                subject: `ارجاع: ${m.subject}`,
                                content: m.content,
                              }));
                              toast.info("محتوا در فرم کپی شد");
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* ═══ ستون راست: فرم ارسال ═══ */}
          <Card className="quran-panel rounded-[2rem] p-0 overflow-hidden relative h-fit lg:sticky lg:top-4 max-h-[90vh] overflow-y-auto quran-scroll">
            <PanelHeading
              eyebrow="مکاتبات سریع دارالقرآن"
              title="ارسال پیام و اطلاعیه جدید"
              icon={<Send className="h-5 w-5" />}
            />
            <div className="p-5 space-y-4">
              {/* حالت ارسال */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    mode: "individual",
                    icon: <UserCheck className="h-3.5 w-3.5 ml-1 text-[#4a5839]" />,
                    label: "پیام فردی",
                  },
                  {
                    mode: "group",
                    icon: <Megaphone className="h-3.5 w-3.5 ml-1 text-amber-500" />,
                    label: "اطلاعیه گروهی",
                  },
                ].map((btn) => (
                  <Button
                    key={btn.mode}
                    size="sm"
                    variant={form.mode === btn.mode ? "default" : "outline"}
                    className={cn(
                      "rounded-xl text-xs font-bold transition-all",
                      form.mode === btn.mode
                        ? "gradient-primary text-primary-foreground border-0"
                        : "hover:bg-[#5d6d45]/10",
                    )}
                    onClick={() => {
                      resetForm();
                      setForm((f) => ({ ...f, mode: btn.mode as "individual" | "group" }));
                    }}
                  >
                    {btn.icon}
                    {btn.label}
                  </Button>
                ))}
              </div>

              {/* قالب آماده */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1 font-black">
                  <FileText className="h-3.5 w-3.5 text-[#4a5839]" /> قالب آماده
                </label>
                <Select
                  value={form.template}
                  onValueChange={(v) => {
                    const tpl = messageTemplates.find((t) => t.id === v);
                    if (tpl)
                      setForm((f) => ({
                        ...f,
                        template: v,
                        subject: tpl.subject,
                        content: tpl.content,
                        priority: tpl.priority,
                        topic: tpl.topic,
                      }));
                  }}
                >
                  <SelectTrigger className="text-sm rounded-xl">
                    <SelectValue placeholder="انتخاب قالب (اختیاری)..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {messageTemplates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id} className="text-sm font-bold">
                        {tpl.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* گیرنده فردی */}
              {form.mode === "individual" ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-black">
                      نقش گیرنده
                    </label>
                    <Select
                      value={form.recipientRole}
                      onValueChange={(v) => {
                        setForm((f) => ({ ...f, recipientRole: v as Role, recipientId: "" }));
                        setRecipientSearch("");
                      }}
                    >
                      <SelectTrigger className="text-sm rounded-xl">
                        <SelectValue placeholder="انتخاب نقش..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="teacher">استاد</SelectItem>
                        <SelectItem value="student">قرآن‌آموز</SelectItem>
                        <SelectItem value="parent">ولی دانش‌آموز</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {form.recipientRole && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-black">
                        جستجو و انتخاب گیرنده
                      </label>
                      <Input
                        className="text-sm mb-2"
                        placeholder="جستجوی نام..."
                        value={recipientSearch}
                        onChange={(e) => setRecipientSearch(e.target.value)}
                      />
                      <Select
                        value={form.recipientId}
                        onValueChange={(v) => setForm((f) => ({ ...f, recipientId: v }))}
                      >
                        <SelectTrigger className="text-sm rounded-xl">
                          <SelectValue placeholder="انتخاب گیرنده..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {individualOptions.length > 0 ? (
                            individualOptions.map((o) => (
                              <SelectItem key={o.id} value={o.id} className="text-sm font-bold">
                                <div className="flex flex-col">
                                  <span>{o.label}</span>
                                  {o.extra && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {o.extra}
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              موردی یافت نشد
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      {form.recipientId && (
                        <div className="mt-1.5 text-[11px] bg-secondary/50 p-2.5 rounded-xl flex items-center gap-1.5 font-bold">
                          {form.recipientRole === "student" && (
                            <>
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">ولی:</span>
                              <span className="font-medium text-[#2d2620]">
                                {students.find((s) => sid(s.id) === form.recipientId)
                                  ?.parent_name ?? "—"}
                              </span>
                            </>
                          )}
                          {form.recipientRole === "parent" && (
                            <>
                              <School className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">فرزند:</span>
                              <span className="font-medium text-[#2d2620]">
                                {students.find((s) => sid(s.id) === form.recipientId)?.name ?? "—"}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1 font-black">
                      <Users className="h-3.5 w-3.5 text-[#4a5839]" /> گروه گیرنده
                    </label>
                    <Select
                      value={form.groupTarget}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          groupTarget: v as GroupTarget,
                          selectedClassId: "",
                        }))
                      }
                    >
                      <SelectTrigger className="text-sm rounded-xl">
                        <SelectValue placeholder="انتخاب گروه..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all">همه اعضای مرکز</SelectItem>
                        <SelectItem value="all_teachers">همه اساتید</SelectItem>
                        <SelectItem value="all_parents">همه والدین</SelectItem>
                        <SelectItem value="all_students">همه قرآن‌آموزان</SelectItem>
                        <div className="border-t my-1" />
                        <SelectItem value="class_students">قرآن‌آموزان یک کلاس خاص</SelectItem>
                        <SelectItem value="class_parents">والدین یک کلاس خاص</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {["class_students", "class_parents"].includes(form.groupTarget) && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-black">
                        انتخاب کلاس
                      </label>
                      <Select
                        value={form.selectedClassId}
                        onValueChange={(v) => setForm((f) => ({ ...f, selectedClassId: v }))}
                      >
                        <SelectTrigger className="text-sm rounded-xl">
                          <SelectValue placeholder="انتخاب کلاس..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {classes.map((c) => (
                            <SelectItem
                              key={sid(c.id)}
                              value={sid(c.id)}
                              className="text-sm font-bold"
                            >
                              <div className="flex flex-col">
                                <span>{c.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {c.level} · {toFa(c.enrolled)}/{toFa(c.capacity)} نفر
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.selectedClassId &&
                        (() => {
                          const cls = classes.find((c) => sid(c.id) === form.selectedClassId);
                          const cnt = students.filter(
                            (s) => sid(s.class_id) === form.selectedClassId,
                          ).length;
                          if (!cls) return null;
                          return (
                            <div className="mt-1.5 text-[11px] bg-secondary/50 p-2.5 rounded-xl font-bold border border-black/[0.02]">
                              <div className="font-semibold text-sm mb-0.5 text-[#2d2620]">
                                {cls.name}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {form.groupTarget === "class_students" ? "قرآن‌آموزان" : "والدین"}:{" "}
                                {toFa(cnt)} نفر · سطح: {cls.level}
                              </div>
                            </div>
                          );
                        })()}
                    </div>
                  )}
                </>
              )}

              {/* اولویت */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-black">
                  اولویت پیام
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(priorityConfig) as Priority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setForm((f) => ({ ...f, priority: p }))}
                      className={cn(
                        "text-[11px] py-2 px-2.5 rounded-xl border transition-all flex items-center justify-center gap-1 font-bold shadow-sm",
                        form.priority === p
                          ? `${priorityConfig[p].bg} ${priorityConfig[p].color} ring-1 ring-current`
                          : "border-border text-muted-foreground hover:bg-[#5d6d45]/10",
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", priorityConfig[p].dot)} />
                      {priorityConfig[p].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* موضوع دسته‌بندی */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-black">
                  دسته‌بندی موضوعی
                </label>
                <Select
                  value={form.topic}
                  onValueChange={(v) => setForm((f) => ({ ...f, topic: v as TopicCategory }))}
                >
                  <SelectTrigger className="text-sm rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {(Object.keys(topicConfig) as TopicCategory[]).map((k) => (
                      <SelectItem key={k} value={k} className="text-sm font-bold">
                        <span className="flex items-center gap-1.5">
                          {topicConfig[k].icon}
                          {topicConfig[k].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* موضوع */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-black">
                  موضوع
                </label>
                <Input
                  className="text-sm"
                  placeholder="موضوع پیام..."
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>

              {/* متن */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block font-black">
                  متن پیام
                </label>
                <Textarea
                  rows={4}
                  className="text-sm resize-none"
                  placeholder="متن پیام..."
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                />
              </div>

              {/* قابلیت‌های نیازمند سرویس سمت سرور */}
              <div className="space-y-2">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  <div className="flex items-center gap-2 font-black">
                    <Send className="h-3.5 w-3.5" />
                    کانال فعال: پیام داخلی امن
                  </div>
                  <p className="mt-1 text-[11px] leading-5">
                    پیامک و ایمیل تا اتصال سرویس واقعی ارسال غیرفعال‌اند.
                  </p>
                </div>
                <MessageSchedulePicker
                  enabled={form.scheduleEnabled}
                  preset={form.schedulePreset}
                  customDate={form.scheduledDate}
                  customTime={form.scheduledTime}
                  onEnabledChange={(enabled) =>
                    setForm((current) => ({ ...current, scheduleEnabled: enabled }))
                  }
                  onPresetChange={(preset) =>
                    setForm((current) => ({ ...current, schedulePreset: preset }))
                  }
                  onCustomDateChange={(scheduledDate) =>
                    setForm((current) => ({ ...current, scheduledDate }))
                  }
                  onCustomTimeChange={(scheduledTime) =>
                    setForm((current) => ({ ...current, scheduledTime }))
                  }
                />
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <MessageAttachmentPicker
                    files={form.attachments}
                    onChange={(files) => setForm((current) => ({ ...current, attachments: files }))}
                    disabled={sending}
                    compact
                  />
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    حداکثر ۵ فایل، هر فایل ۱۰ و مجموع ۲۵ مگابایت؛ دانلود فقط با لینک امضاشده.
                  </p>
                </div>
              </div>

              {/* دکمه‌های ارسال */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="outline"
                  className="gap-1.5 text-xs rounded-xl font-bold h-9.5"
                  onClick={() => setShowPreview(true)}
                  disabled={!form.content.trim()}
                >
                  <EyeOff className="h-3.5 w-3.5" /> پیش‌نمایش
                </Button>
                <Button
                  className="gradient-primary text-primary-foreground gap-1.5 text-xs rounded-xl h-9.5"
                  onClick={sendMessage}
                  disabled={sending || !canSend}
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  ارسال امن
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* ████  مودال پیش‌نمایش  ████ */}
        {showPreview && (
          <PreviewModal
            form={form}
            onClose={() => setShowPreview(false)}
            onSend={sendMessage}
            resolveGroupLabel={resolveGroupLabel}
            teachers={teachers}
            students={students}
          />
        )}

        {/* ████  دیالوگ تأیید دومرحله‌ای  ████ */}
        {confirmDialog && (
          <ConfirmDialog
            type={confirmDialog.type}
            count={
              confirmDialog.conversations
                ? confirmDialog.conversations.reduce((n, c) => n + c.messages.length, 0)
                : confirmDialog.conversation?.messages.length
            }
            chatCount={confirmDialog.conversations?.length}
            onConfirm={confirmDialog.type === "archive" ? confirmArchive : confirmDelete}
            onCancel={() => setConfirmDialog(null)}
          />
        )}

        {/* ████  مودال چت  ████ */}
        {selectedConversation && selectedLastRaw && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setSelectedConversationKey(null)}
          >
            <Card
              className="w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 rounded-[2.25rem] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* هدر */}
              <div className="p-5 border-b flex items-start justify-between gap-3 shrink-0 relative overflow-hidden bg-[#efebd9]/40 border-b border-[#cfbe9b]/30">
                <GildedIslamicLacePattern />
                <div className="flex items-start gap-3 min-w-0 relative z-10">
                  <Avatar className="h-11 w-11 shrink-0 border border-[#cfa864]/20">
                    <AvatarFallback className="bg-[#4a5839]/15 text-[#4a5839] font-black text-sm">
                      {selectedConversation.isGroup ? (
                        <Users className="h-5 w-5" />
                      ) : (
                        getInitials(selectedConversation.title)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-black text-[#2d2620] truncate">
                      {selectedConversation.title}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1 text-xs text-muted-foreground font-black">
                      <span className="font-bold">{selectedConversation.subtitle}</span>
                      <span className="font-sans font-bold">
                        · آخرین پیام: {fmtDateTime(selectedLastRaw)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {selectedConversation.isGroup ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-md border font-bold bg-[#cfa864]/10 text-[#8a6d2f] border-[#cfa864]/30">
                          <Megaphone className="h-3 w-3" /> چت گروهی
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-md border font-bold bg-[#5d6d45]/10 text-[#4a5839] border-[#5d6d45]/20">
                          <UserCheck className="h-3 w-3" /> چت فردی
                        </span>
                      )}
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-md border font-bold bg-secondary/60 text-muted-foreground border-border/60 font-sans">
                        {toFa(selectedConversation.messages.length)} پیام
                      </span>
                      {selectedLastRaw.priority && selectedLastRaw.priority !== "normal" && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-md border font-bold",
                            priorityConfig[selectedLastRaw.priority as Priority]?.bg,
                            priorityConfig[selectedLastRaw.priority as Priority]?.color,
                          )}
                        >
                          {selectedLastRaw.priority === "urgent" && (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {priorityConfig[selectedLastRaw.priority as Priority]?.label}
                        </span>
                      )}
                      {selectedLastRaw.topic && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-md font-bold",
                            topicConfig[selectedLastRaw.topic as TopicCategory]?.color,
                          )}
                        >
                          {topicConfig[selectedLastRaw.topic as TopicCategory]?.icon}
                          {topicConfig[selectedLastRaw.topic as TopicCategory]?.label}
                        </span>
                      )}
                      {selectedHasAdminParticipant &&
                        (selectedLastRaw.replied ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#4a5839] font-bold">
                            <Reply className="h-3.5 w-3.5" /> پاسخ‌داده‌شده
                          </span>
                        ) : !selectedLastRaw.unread ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#4a5839] font-bold">
                            <CheckCheck className="h-3.5 w-3.5" /> خوانده‌شده
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground font-bold">
                            <Check className="h-3.5 w-3.5" /> تحویل‌شده
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 relative z-10">
                  <button
                    onClick={() => toggleStar(selectedLastRaw)}
                    title="ستاره‌دار کردن"
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#5d6d45]/10 text-muted-foreground",
                      selectedLastRaw.is_starred ? "text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    <Star
                      className={cn("h-4 w-4", selectedLastRaw.is_starred ? "fill-amber-400" : "")}
                    />
                  </button>
                  <button
                    onClick={() => requestDeleteConversation(selectedConversation)}
                    title="حذف این گفت‌وگو"
                    className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setSelectedConversationKey(null)}
                    className="h-8 w-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* بنر اطلاعیهٔ گروهی */}
              {selectedConversation.isGroup && (
                <div className="px-5 py-2.5 bg-[#cfa864]/10 border-b border-[#cfa864]/25 flex items-center gap-2 text-[11px] font-bold text-[#8a6d2f] shrink-0">
                  <Megaphone className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    این چت مربوط به اطلاعیهٔ گروهی «
                    {selectedConversation.groupTarget?.name ?? selectedConversation.title}» است؛
                    اطلاعیه و همهٔ پاسخ‌های مرتبط با آن در همین‌جا نمایش داده می‌شوند.
                  </span>
                </div>
              )}
              {/* بنر نظارت پنهان (مکالماتی که مدیر طرف آن‌ها نیست) */}
              {!selectedHasAdminParticipant && (
                <div className="px-5 py-2 bg-secondary/40 border-b border-border/50 flex items-center gap-2 text-[11px] font-bold text-muted-foreground shrink-0">
                  <EyeOff className="h-3.5 w-3.5 shrink-0 text-[#4a5839]" />
                  <span>
                    نظارت پنهان: مشاهدهٔ این مکالمه توسط مدیر برای طرفین ثبت و نمایش داده نمی‌شود؛
                    وضعیت «دیده‌شده» هم نشان داده نمی‌شود.
                  </span>
                </div>
              )}
              {/* پیام‌های چت */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#efebd9]/10 quran-scroll">
                {selectedConversation.messages.map((tm, ti) => {
                  const prev = ti > 0 ? selectedConversation.messages[ti - 1] : null;
                  const showSender = !prev || prev.sender.key !== tm.sender.key;
                  const isOwnSide = selectedHasAdminParticipant
                    ? tm.isFromAdmin
                    : tm.sender.role === "teacher";
                  const kind = sendKindOf(tm.raw);
                  return (
                    <div
                      key={tm.id}
                      className={cn("flex", isOwnSide ? "justify-start" : "justify-end")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl p-3.5 shadow-sm border",
                          isOwnSide
                            ? "bg-[#5d6d45]/10 border-[#5d6d45]/20 rounded-br-md"
                            : "bg-card border-border/70 rounded-bl-md",
                        )}
                      >
                        {showSender && (
                          <div className="flex items-center gap-2 mb-1.5">
                            <Avatar className="h-6 w-6 border border-black/5">
                              <AvatarFallback
                                className={cn(
                                  "text-[10px] font-black",
                                  isOwnSide
                                    ? "bg-primary/20 text-[#4a5839]"
                                    : "bg-gold/20 text-gold-foreground",
                                )}
                              >
                                {getInitials(tm.sender.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-black text-[#2d2620] flex items-center gap-1">
                              {withRolePrefix(tm.sender.name, tm.sender.role)}
                              {tm.sender.role === "admin" ? (
                                <ShieldCheck className="h-3 w-3 text-[#4a5839]" />
                              ) : (
                                <User className="h-3 w-3 text-muted-foreground" />
                              )}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-bold">
                              {actorRoleLabel(tm.sender.role)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          {kind === "group" ? (
                            <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md border font-bold bg-[#cfa864]/10 text-[#8a6d2f] border-[#cfa864]/30">
                              <Megaphone className="h-2.5 w-2.5" /> گروهی
                              {isGroupRoleTarget(tm.raw.to_role) && (
                                <span>← {resolveToName(tm.raw)}</span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md border font-bold bg-[#5d6d45]/10 text-[#4a5839] border-[#5d6d45]/20">
                              <UserCheck className="h-2.5 w-2.5" /> فردی
                            </span>
                          )}
                          {tm.raw.subject && (
                            <span className="text-[10px] font-black text-[#2d2620]/80">
                              موضوع: {stripReplyPrefix(tm.raw.subject)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-7 text-[#2d2620]">
                          {tm.raw.content}
                        </p>
                        <SecureMessageAttachments attachments={tm.raw.attachments} />
                        {tm.raw.delivery_status === "scheduled" && (
                          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <span>
                              زمان‌بندی‌شده برای {tm.raw.scheduled_at ? fmtDateTime({ ...tm.raw, created_at: tm.raw.scheduled_at }) : "—"}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await cancelScheduledMessage(String(tm.raw.campaign_id));
                                  toast.success("ارسال زمان‌بندی‌شده لغو شد");
                                  await loadData();
                                } catch (error) {
                                  toast.error(error instanceof Error ? error.message : "لغو ناموفق بود");
                                }
                              }}
                            >
                              لغو
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-1 mt-1.5 text-[10px] text-muted-foreground font-sans font-bold">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              requestDelete(tm.raw);
                            }}
                            title="حذف این پیام"
                            className="h-5 w-5 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                          <span className="flex items-center gap-1">
                            <span>{fmtDateTime(tm.raw)}</span>
                            {selectedHasAdminParticipant &&
                              tm.raw.to_role === "admin" &&
                              !tm.raw.unread && <CheckCheck className="h-3 w-3 text-[#4a5839]" />}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* مشاهده‌کنندگان (فقط در چت‌هایی که مدیر طرف است؛ در نظارت پنهان نمایش داده نمی‌شود) */}
              {selectedHasAdminParticipant &&
                Array.isArray(selectedLastRaw.seen_by) &&
                selectedLastRaw.seen_by.length > 0 && (
                  <div className="px-5 py-2.5 border-t bg-secondary/30">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap font-bold">
                      <Eye className="h-3.5 w-3.5 shrink-0 text-[#4a5839]" />
                      <span>مشاهده شده توسط:</span>
                      {selectedLastRaw.seen_by.map((sv, i) => (
                        <span key={i} className="flex items-center gap-0.5 text-[#2d2620]">
                          {sv.user_name}
                          <span className="text-[9px] opacity-70 font-sans font-bold">
                            ({toFa(new Date(sv.seen_at).toLocaleDateString("fa-IR"))})
                          </span>
                          {i < selectedLastRaw.seen_by!.length - 1 && "،"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              {/* پاسخ سریع */}
              <div className="p-4 border-t shrink-0 bg-card">
                {replyRecipients.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-secondary/30 px-3 py-2.5 text-center text-xs font-bold text-muted-foreground">
                    گیرندهٔ معتبری برای پاسخ در این چت شناسایی نشد.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {replyRecipients.length > 1 && (
                      <select
                        id="reply-recipient"
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
                    <div className="flex gap-2">
                      <Textarea
                        rows={2}
                        className="text-sm resize-none flex-1 rounded-xl"
                        placeholder={
                          selectedConversation.groupTarget
                            ? `ارسال پیام به ${selectedConversation.groupTarget.name}...`
                            : "پاسخ سریع..."
                        }
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                      />
                      <Button
                        className="gradient-primary text-primary-foreground self-end gap-1.5 rounded-xl h-9.5"
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
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

const dashboardStyles = `
@import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Reem+Kufi:wght@400..700&family=Vazirmatn:wght@300;400;500;700;900&display=swap');

.font-quran {
  font-family: 'Amiri', 'Traditional Arabic', serif;
}
.font-kufi {
  font-family: 'Reem Kufi', sans-serif;
}
.font-sans {
  font-family: 'Vazirmatn', sans-serif;
}

.quran-admin-dashboard {
  --quran-olive: #4a5839;
  --quran-olive-light: #5d6d45;
  --quran-gold: #cfa864;
  --quran-cream: #faf8f2;
  background-color: #faf8f2 !important; /* Premium, warm neutral cream background from the screenshot */
  padding: 1.5rem;
  border-radius: 2.25rem;
}

.text-shadow-gold {
  text-shadow: 0 0 12px rgba(207, 168, 100, 0.45);
}

.text-shadow-brass {
  text-shadow: 0 1px 0 rgba(255,255,255,0.4);
}

.quran-admin-hero {
  border: 1px solid rgba(93, 109, 69, 0.2) !important;
  box-shadow: 0 15px 40px rgba(74, 88, 57, 0.15) !important;
}

.quran-panel {
  background: #ffffff !important; /* Clean, crisp white clay panel */
  border: 1px solid rgba(139, 94, 26, 0.18) !important; /* More distinct gold-wood border */
  box-shadow: 
    0 5px 12px rgba(45, 38, 30, 0.18), 
    0 1px 3px rgba(45, 38, 30, 0.10) !important; /* Smaller but darker, tactile 3D shadow from the reference image */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.quran-panel:hover {
  border-color: rgba(207, 168, 100, 0.5) !important; /* Gilded gold on hover */
  box-shadow: 
    0 8px 20px rgba(45, 38, 30, 0.24), 
    0 2px 6px rgba(207, 168, 100, 0.15) !important; /* Tight responsive hover shadow */
}

.quran-panel-heading {
  min-height: 72px;
  background:
    linear-gradient(90deg, #f7f3e8, #efebd9); /* Recessed warm cream header strip matching the screenshot */
  border-bottom: 1px solid rgba(139, 94, 26, 0.06);
}

.quran-ornament-line {
  width: 48px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #cfa864);
}

.quran-class-card {
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.quran-class-card::before {
  content: "";
  position: absolute;
  right: 0;
  top: 20%;
  bottom: 20%;
  width: 3px;
  border-radius: 4px;
  background: linear-gradient(180deg, #cfa864 0%, #4a5839 100%); /* Gold and olive green gradient */
  transition: all 0.3s ease;
}

.quran-class-card:hover::before {
  top: 0%;
  bottom: 0%;
  width: 4px;
}

.quran-gold-divider {
  width: 180px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #cfa864, transparent);
}

/* Beautiful Ceramic/Claymorphic Buttons & Cards matching the screenshot */
.quran-soft-clay-card {
  background: linear-gradient(135deg, #ffffff 0%, #faf5e6 100%) !important; /* Soft convex ceramic white */
  border: 1px solid rgba(139, 94, 26, 0.18) !important; /* More distinct gold-wood border */
  box-shadow: 
    0 5px 12px rgba(45, 38, 30, 0.18), 
    0 1px 3px rgba(45, 38, 30, 0.10),
    inset 0 2.5px 0 rgba(255,255,255,0.95), 
    inset 0 -2.5px 4px rgba(0,0,0,0.03) !important; /* Smaller, darker, more tactile 3D shadow */
  color: #2d2620 !important;
}

.quran-soft-clay-card:hover {
  border-color: rgba(207, 168, 100, 0.4) !important;
  box-shadow: 
    0 8px 18px rgba(45, 38, 30, 0.24), 
    inset 0 2.5px 0 rgba(255,255,255,0.95), 
    inset 0 -2.5px 4px rgba(0,0,0,0.03) !important;
}

/* Table Header Styles matching Soft UI */
thead tr {
  background: linear-gradient(90deg, #f7f3e8, #efebd9) !important;
  border-bottom: 2px solid #cfbe9b !important;
}
thead th {
  color: #4a5839 !important;
  font-weight: 700 !important;
  font-family: 'Vazirmatn', sans-serif !important;
  font-size: 13px !important;
}

/* Custom awakening hover & active click states for PrimaryStatCards */
.quran-stat-card {
  background: linear-gradient(135deg, #ffffff 0%, #faf5e6 100%) !important;
  border: 1px solid rgba(139, 94, 26, 0.18) !important; /* More distinct border */
  box-shadow: 
    0 5px 12px rgba(45, 38, 30, 0.18), 
    0 1px 3px rgba(45, 38, 30, 0.10),
    inset 0 2.5px 0 rgba(255,255,255,0.95), 
    inset 0 -2.5px 4px rgba(0,0,0,0.03) !important; /* Smaller, darker, more tactile 3D shadow */
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.quran-stat-card-turquoise:hover {
  background: linear-gradient(135deg, #ffffff 0%, #e6fcfc 100%) !important; /* Soft sky turquoise glow */
  border-color: #14b8a6 !important;
  box-shadow: 
    0 8px 18px rgba(20, 184, 166, 0.25), 
    inset 0 2.5px 0 rgba(255,255,255,0.95), 
    inset 0 -2.5px 4px rgba(20,184,166,0.04) !important;
}
.quran-stat-card-turquoise:active {
  transform: scale(0.97) !important;
  background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%) !important;
  box-shadow: inset 0 3px 6px rgba(13,148,136,0.2) !important;
}

.quran-stat-card-lapis:hover {
  background: linear-gradient(135deg, #ffffff 0%, #ebf5ff 100%) !important; /* Soft sapphire blue glow */
  border-color: #3b82f6 !important;
  box-shadow: 
    0 8px 18px rgba(59, 130, 246, 0.25), 
    inset 0 2.5px 0 rgba(255,255,255,0.95), 
    inset 0 -2.5px 4px rgba(59,130,246,0.04) !important;
}
.quran-stat-card-lapis:active {
  transform: scale(0.97) !important;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%) !important;
  box-shadow: inset 0 3px 6px rgba(29,78,216,0.2) !important;
}

.quran-stat-card-gold:hover {
  background: linear-gradient(135deg, #ffffff 0%, #fffbeb 100%) !important; /* Soft gold glow */
  border-color: #fbbf24 !important;
  box-shadow: 
    0 8px 18px rgba(245, 158, 11, 0.28), 
    inset 0 2.5px 0 rgba(255,255,255,0.95), 
    inset 0 -2.5px 4px rgba(245,158,11,0.04) !important;
}
.quran-stat-card-gold:active {
  transform: scale(0.97) !important;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%) !important;
  box-shadow: inset 0 3px 6px rgba(217,119,6,0.2) !important;
}

.quran-stat-card-ruby:hover {
  background: linear-gradient(135deg, #ffffff 0%, #fff1f2 100%) !important; /* Soft rose glow */
  border-color: #f43f5e !important;
  box-shadow: 
    0 8px 18px rgba(244, 63, 94, 0.25), 
    inset 0 2.5px 0 rgba(255,255,255,0.95), 
    inset 0 -2.5px 4px rgba(244,63,94,0.04) !important;
}
.quran-stat-card-ruby:active {
  transform: scale(0.97) !important;
  background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%) !important;
  box-shadow: inset 0 3px 6px rgba(225,29,72,0.15) !important;
}

.quran-stat-card-violet:hover {
  background: linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%) !important; /* Soft violet glow */
  border-color: #8b5cf6 !important;
  box-shadow: 
    0 8px 18px rgba(139, 92, 246, 0.25), 
    inset 0 2.5px 0 rgba(255,255,255,0.95), 
    inset 0 -2.5px 4px rgba(139,92,246,0.04) !important;
}
.quran-stat-card-violet:active {
  transform: scale(0.97) !important;
  background: linear-gradient(135deg, #f5f3ff 0%, #e0e7ff 100%) !important;
  box-shadow: inset 0 3px 6px rgba(109,40,217,0.2) !important;
}


/* Gilded distinct tables and list elements with soft shadows */
.quran-admin-dashboard table {
  border-collapse: separate !important;
  border-spacing: 0 4px !important; /* Subtle spacing between rows */
}
.quran-admin-dashboard tr {
  box-shadow: 0 1px 3px rgba(45, 38, 30, 0.10) !important; /* Smaller, darker, tactile row shadows */
  transition: all 0.2s ease !important;
}
.quran-admin-dashboard tr:hover {
  background-color: rgba(93, 109, 69, 0.04) !important;
  box-shadow: 0 3px 6px rgba(45, 38, 30, 0.18) !important; /* Tight pop-up hover shadow */
}

.quran-scroll::-webkit-scrollbar {
  width: 5px;
}
.quran-scroll::-webkit-scrollbar-track {
  background: rgba(74, 88, 57, 0.01);
}
.quran-scroll::-webkit-scrollbar-thumb {
  background: rgba(207, 168, 100, 0.2);
  border-radius: 10px;
}
.quran-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(207, 168, 100, 0.35);
}

@media (prefers-reduced-motion:reduce) {
  .quran-admin-dashboard * {
    transition: none !important;
    animation: none !important;
  }
}
`;
