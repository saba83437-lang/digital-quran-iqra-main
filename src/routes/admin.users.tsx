import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useMemo, useEffect } from "react";
import {
  UserPlus,
  Search,
  GraduationCap,
  BookOpen,
  Save,
  Edit,
  Trash2,
  Camera,
  Eye,
  MessageSquare,
  Download,
  CheckSquare,
  Square,
  Filter,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Upload,
  FileImage,
  FolderOpen,
  X,
  RefreshCw,
  FileText,
  Image,
  Users,
  AlertTriangle,
  ShieldCheck,
  Clock,
  UserCheck,
  UserX,
  Printer,
  Send,
  FileCheck,
  FileWarning,
  CreditCard,
  Calendar,
  Award,
  TrendingUp,
  Sparkles,
  Hash,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { loadCurrentTuitionStatusMap } from "@/features/finance/api/finance-api";
import { sendSecureMessage } from "@/features/messages/api/messages-api";
import { logSecureAdminAction } from "@/features/audit/api/admin-audit-api";
import { provisionAuthAccount } from "@/lib/provision-auth-utils";
import {
  loadSecureAdminStudents,
  loadSecureAdminTeachers,
} from "@/features/identity/api/secure-identity-api";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "مدیریت کاربران — بِرّ الوالدین" },
      { name: "description", content: "مدیریت دانش‌آموزان، اساتید و والدین مرکز قرآن" },
    ],
  }),
  component: UsersPage,
});

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const LEVELS = ["مقدماتی", "سطح ۱ تقلیدی", "سطح ۲ تقلیدی", "سطح ۳ تقلیدی", "پیشرفته"];
const RELATIONS = ["پدر", "مادر", "قیم", "سایر"];
const BUCKET = "student-files";

// فایل‌های هویتی باید در Storage خصوصی باشند. از این به بعد مقدار ذخیره‌شده، path فایل است
// و برای مشاهده/دانلود، Signed URL زمان‌دار ساخته می‌شود. برای رکوردهای قدیمی که Public URL دارند
// همچنان پشتیبانی backward-compatible وجود دارد.
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // ۲ مگابایت
const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024; // ۵ مگابایت
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"];
const OPTIONAL_STUDENT_COLUMNS = ["enrolled_at", "status", "documents_status"] as const;
const OPTIONAL_TEACHER_COLUMNS = [
  "national_id",
  "personnel_code",
  "birth_date",
  "avatar_url",
] as const;

type SortKey = "name" | "enrolled" | "level" | "tuition_status" | "status";
type SortDir = "asc" | "desc";
type DialogKind =
  | null
  | "student"
  | "teacher"
  | "editStudent"
  | "editTeacher"
  | "deleteStudent"
  | "deleteTeacher"
  | "viewStudent"
  | "message"
  | "bulkAction"
  | "documents";
type StudentStatus = "active" | "inactive" | "graduated" | "withdrawn";
type DocumentStatus = "complete" | "incomplete" | "pending_review" | "approved" | "rejected";

interface Student {
  id: string;
  name: string;
  national_id?: string;
  birth_date?: string;
  phone?: string;
  address?: string;
  level: string;
  class_id: string;
  parent_name: string;
  parent_phone: string;
  parent_national_id?: string;
  parent_relation?: string;
  enrolled: string;
  enrolled_at?: string;
  status?: StudentStatus;
  documents_status?: DocumentStatus;
  attendance_rate: number;
  average_grade: number;
  tuition_status: "paid" | "pending" | "overdue" | "cancelled" | "unbilled";
  avatar_url?: string;
  poster_avatar_url?: string;
  id_card_url?: string;
  birth_cert_url?: string;
  notes?: string;
}

interface Teacher {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  classes: number;
  avatar: string;
  avatar_url?: string;
  national_id?: string;
  personnel_code?: string;
  birth_date?: string;
}

interface Class {
  id: string;
  name: string;
  teacher_id?: string | null;
}

interface ParentRow {
  key: string;
  name: string;
  relation: string;
  phone: string;
  nationalId: string;
  studentIds: string[];
  studentNames: string[];
  overdueCount: number;
}

// ==================== ابزارهای امنیت، فایل، تاریخ و خروجی ====================
function normalizeText(value: string | undefined | null): string {
  const faToEn: Record<string, string> = {
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
  };
  return (value ?? "")
    .toString()
    .replace(/[۰-۹٠-٩]/g, (ch) => faToEn[ch] ?? ch)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toEnglishDigits(value: string): string {
  return normalizeText(value).replace(/[^0-9]/g, "");
}

function validateNationalId(value: string, required = false): boolean {
  const code = toEnglishDigits(value);
  if (!code) return !required;
  if (!/^\d{10}$/.test(code)) return false;
  if (/^(\d)\1{9}$/.test(code)) return false;
  const check = Number(code[9]);
  const sum = code
    .slice(0, 9)
    .split("")
    .reduce((acc, digit, idx) => acc + Number(digit) * (10 - idx), 0);
  const mod = sum % 11;
  return mod < 2 ? check === mod : check === 11 - mod;
}

function validateIranPhone(value: string, required = false): boolean {
  const phone = toEnglishDigits(value);
  if (!phone) return !required;
  return /^09\d{9}$/.test(phone);
}

function getStoragePath(value?: string | null): string {
  if (!value) return "";
  if (value.startsWith("blob:") || value.startsWith("data:")) return "";
  const marker = `/${BUCKET}/`;
  if (value.includes(marker)) return decodeURIComponent(value.split(marker)[1].split("?")[0]);
  if (/^https?:\/\//i.test(value)) return "";
  return value.split("?")[0].replace(/^\/+/, "");
}

function isImageFileValue(value?: string | null, file?: File | null): boolean {
  if (file) return file.type.startsWith("image/");
  if (!value) return false;
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(value);
}

async function resolveFileUrl(value?: string | null, expiresIn = 60 * 20): Promise<string> {
  if (!value) return "";
  if (value.startsWith("blob:") || value.startsWith("data:")) return value;
  const path = getStoragePath(value);
  if (!path) return value;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) {
    console.error("signed url error:", error);
    return value.startsWith("http") ? value : "";
  }
  return data.signedUrl;
}

async function openStoredFile(value?: string | null, label = "file") {
  const signedUrl = await resolveFileUrl(value, 60 * 10);
  if (!signedUrl) {
    toast.error("فایل در دسترس نیست");
    return;
  }
  await logAdminAction("download_document", "student_file", getStoragePath(value) || label, {
    label,
  });
  window.open(signedUrl, "_blank", "noopener,noreferrer");
}

function validateUploadFile(file: File, kind: "avatar" | "document"): boolean {
  const allowed = kind === "avatar" ? IMAGE_MIME_TYPES : DOCUMENT_MIME_TYPES;
  const maxSize = kind === "avatar" ? MAX_AVATAR_SIZE : MAX_DOCUMENT_SIZE;
  if (!allowed.includes(file.type)) {
    toast.error(
      kind === "avatar"
        ? "فرمت عکس پروفایل باید jpg، png، webp یا gif باشد"
        : "فرمت مدرک باید تصویر یا PDF باشد",
    );
    return false;
  }
  if (file.size > maxSize) {
    toast.error(`حجم فایل نباید بیشتر از ${Math.round(maxSize / 1024 / 1024)} مگابایت باشد`);
    return false;
  }
  return true;
}

function validatePosterAvatarFile(file: File): boolean {
  if (!["image/png", "image/webp"].includes(file.type)) {
    toast.error("عکس بدون پس‌زمینه مخصوص پوستر باید PNG یا WebP باشد");
    return false;
  }
  if (file.size > MAX_AVATAR_SIZE) {
    toast.error(
      `حجم عکس پوستر نباید بیشتر از ${Math.round(MAX_AVATAR_SIZE / 1024 / 1024)} مگابایت باشد`,
    );
    return false;
  }
  return true;
}

// آپلود فایل به Storage خصوصی؛ مقدار برگشتی path است، نه Public URL.
async function uploadFile(file: File, folder: string): Promise<string | null> {
  const rawExt =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin";
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${rawExt}`;
  const { error } = await supabase.storage.from(BUCKET).upload(fileName, file, {
    upsert: false,
    contentType: file.type || undefined,
    cacheControl: "3600",
  });
  if (error) {
    console.error("upload error:", error);
    return null;
  }
  return fileName;
}

// حذف فایل از Storage؛ هم path جدید و هم Public URL قدیمی را پشتیبانی می‌کند.
async function deleteStorageFile(value?: string | null): Promise<void> {
  try {
    const path = getStoragePath(value);
    if (!path) return;
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) console.error("delete storage error:", error);
  } catch (e) {
    console.error("delete storage error:", e);
  }
}

async function deleteStudentStorageFiles(students: Student[]): Promise<void> {
  const paths = students
    .flatMap((s) => [s.avatar_url, s.poster_avatar_url, s.id_card_url, s.birth_cert_url])
    .map(getStoragePath)
    .filter(Boolean);
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([...new Set(paths)]);
    if (error) console.error("bulk storage delete error:", error);
  } catch (e) {
    console.error("bulk storage delete exception:", e);
  }
}

function docTypeLabel(type: "avatar" | "id_card" | "birth_cert"): string {
  if (type === "avatar") return "عکس پروفایل";
  if (type === "id_card") return "کارت ملی";
  return "شناسنامه";
}

function tuitionLabel(status: Student["tuition_status"]): string {
  if (status === "paid") return "پرداخت شده";
  if (status === "overdue") return "معوق";
  if (status === "cancelled") return "لغوشده";
  if (status === "unbilled") return "صورتحساب ندارد";
  return "در انتظار";
}

function studentStatusLabel(status?: StudentStatus): string {
  if (status === "inactive") return "غیرفعال";
  if (status === "graduated") return "فارغ‌التحصیل";
  if (status === "withdrawn") return "انصرافی";
  return "فعال";
}

function getDocumentStatus(student: Student): DocumentStatus {
  if (student.documents_status) return student.documents_status;
  return student.avatar_url && student.id_card_url && student.birth_cert_url
    ? "complete"
    : "incomplete";
}

function documentStatusLabel(status: DocumentStatus): string {
  if (status === "approved") return "تأیید شده";
  if (status === "rejected") return "رد شده";
  if (status === "pending_review") return "در انتظار بررسی";
  if (status === "complete") return "کامل";
  return "ناقص";
}

function formatDateFa(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(d);
}

function csvCell(value: unknown): string {
  const v = String(value ?? "");
  return `"${v.replace(/"/g, '""')}"`;
}

function missingColumnFromError(error: any): string | null {
  const msg = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return OPTIONAL_STUDENT_COLUMNS.find((col) => msg.includes(col.toLowerCase())) ?? null;
}

async function insertStudentPayload(payload: Record<string, any>) {
  const current = { ...payload };
  const removedColumns: string[] = [];
  for (let i = 0; i <= OPTIONAL_STUDENT_COLUMNS.length; i++) {
    const { data, error } = await supabase.from("students").insert([current]).select("id").single();
    if (!error) return { data, error: null, removedColumns, payload: current };
    const missing = missingColumnFromError(error);
    if (missing && missing in current) {
      delete current[missing];
      removedColumns.push(missing);
      continue;
    }
    return { data: null, error, removedColumns, payload: current };
  }
  return {
    data: null,
    error: { message: "خطا در تشخیص ستون‌های جدول students" },
    removedColumns,
    payload: current,
  };
}

async function updateStudentPayload(id: string, payload: Record<string, any>) {
  const current = { ...payload };
  const removedColumns: string[] = [];
  for (let i = 0; i <= OPTIONAL_STUDENT_COLUMNS.length; i++) {
    const { error } = await supabase.from("students").update(current).eq("id", id);
    if (!error) return { error: null, removedColumns, payload: current };
    const missing = missingColumnFromError(error);
    if (missing && missing in current) {
      delete current[missing];
      removedColumns.push(missing);
      continue;
    }
    return { error, removedColumns, payload: current };
  }
  return {
    error: { message: "خطا در تشخیص ستون‌های جدول students" },
    removedColumns,
    payload: current,
  };
}

function missingTeacherColumnFromError(error: any): string | null {
  const msg = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return OPTIONAL_TEACHER_COLUMNS.find((col) => msg.includes(col.toLowerCase())) ?? null;
}

async function insertTeacherPayload(payload: Record<string, any>) {
  const current = { ...payload };
  const removedColumns: string[] = [];
  for (let i = 0; i <= OPTIONAL_TEACHER_COLUMNS.length; i++) {
    const { data, error } = await supabase.from("teachers").insert([current]).select("id").single();
    if (!error) return { data, error: null, removedColumns, payload: current };
    const missing = missingTeacherColumnFromError(error);
    if (missing && missing in current) {
      delete current[missing];
      removedColumns.push(missing);
      continue;
    }
    return { data: null, error, removedColumns, payload: current };
  }
  return {
    data: null,
    error: { message: "خطا در تشخیص ستون‌های جدول teachers" },
    removedColumns,
    payload: current,
  };
}

async function updateTeacherPayload(id: string, payload: Record<string, any>) {
  const current = { ...payload };
  const removedColumns: string[] = [];
  for (let i = 0; i <= OPTIONAL_TEACHER_COLUMNS.length; i++) {
    const { error } = await supabase.from("teachers").update(current).eq("id", id);
    if (!error) return { error: null, removedColumns, payload: current };
    const missing = missingTeacherColumnFromError(error);
    if (missing && missing in current) {
      delete current[missing];
      removedColumns.push(missing);
      continue;
    }
    return { error, removedColumns, payload: current };
  }
  return {
    error: { message: "خطا در تشخیص ستون‌های جدول teachers" },
    removedColumns,
    payload: current,
  };
}

async function recordStudentDocument(
  studentId: string,
  type: "avatar" | "id_card" | "birth_cert",
  file: File,
  filePath: string,
) {
  // اگر migration پیشنهادی اجرا شده باشد، تاریخچه و وضعیت بررسی مدارک ذخیره می‌شود؛ در غیر این صورت بی‌صدا رد می‌شود.
  try {
    await supabase.from("student_documents").insert([
      {
        student_id: studentId,
        type,
        file_path: getStoragePath(filePath) || filePath,
        mime_type: file.type,
        size: file.size,
        status: "pending_review",
        uploaded_at: new Date().toISOString(),
      },
    ]);
  } catch (e) {
    console.info("student_documents table is optional:", e);
  }
}

async function upsertParentRecord(
  studentId: string,
  student: Student | Record<string, any>,
): Promise<string | null> {
  try {
    const parentPayload = {
      name: student.parent_name,
      phone: student.parent_phone,
      national_id: student.parent_national_id || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("parents")
      .upsert(parentPayload, { onConflict: "phone" })
      .select("id")
      .single();
    if (error || !data?.id) {
      console.warn("parent profile upsert failed:", error?.message ?? "parent id missing");
      return null;
    }
    const { error: linkError } = await supabase.from("student_parents").upsert(
      {
        student_id: studentId,
        parent_id: data.id,
        relation: student.parent_relation || "پدر",
      },
      { onConflict: "student_id,parent_id" },
    );
    if (linkError) {
      console.warn("student-parent link upsert failed:", linkError.message);
      return null;
    }
    return String(data.id);
  } catch (e) {
    console.warn("parents/student_parents upsert failed:", e);
    return null;
  }
}

async function logAdminAction(
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
) {
  try {
    await logSecureAdminAction({ action, entityType, entityId, details });
  } catch (error) {
    // شکست Audit نباید عملیات اصلی را Rollback کند، اما در Console پنهان هم نمی‌شود.
    console.warn("secure admin audit failed:", error);
  }
}

function SecureImage({
  source,
  alt,
  className,
  fallback,
}: {
  source?: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    if (!source) return;
    resolveFileUrl(source).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [source]);
  if (!source) return <>{fallback ?? null}</>;
  if (!url) return <div className={className + " bg-secondary/40 animate-pulse"} />;
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function SecureAvatarImage({ source }: { source?: string | null }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    if (!source) return;
    resolveFileUrl(source).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [source]);
  return url ? <AvatarImage src={url} /> : null;
}

// عکس پرسنلی به‌صورت قاب دایره‌ای بزرگ با fallback به حرف اول نام
function ProfilePhoto({
  source,
  name,
  className,
}: {
  source?: string | null;
  name: string;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    if (!source) return;
    resolveFileUrl(source).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [source]);
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={
          className ??
          "h-28 w-28 object-cover rounded-full ring-4 ring-primary-foreground/80 shadow-lg"
        }
      />
    );
  }
  return (
    <div
      className={
        (className ?? "h-28 w-28 rounded-full ring-4 ring-primary-foreground/80 shadow-lg") +
        " bg-gradient-to-br from-primary/25 to-accent text-primary flex items-center justify-center text-4xl font-bold font-display"
      }
    >
      {name.charAt(0)}
    </div>
  );
}

// ==================== کامپوننت آپلود فایل ====================
interface FileUploadBoxProps {
  label: string;
  preview: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon?: React.ReactNode;
  hasFile?: boolean;
}

function FileUploadBox({
  label,
  preview,
  inputRef,
  accept = "image/*",
  onChange,
  icon,
  hasFile,
}: FileUploadBoxProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div
        className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <SecureImage
            source={preview}
            alt={label}
            className="h-20 w-full object-cover rounded mx-auto"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            {icon ?? <Upload className="h-6 w-6" />}
            <span className="text-xs">
              {hasFile ? "✅ فایل انتخاب شده (غیر تصویر)" : "کلیک کنید یا فایل را بکشید"}
            </span>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onChange} />
    </div>
  );
}

// ==================== فرم مشترک دانش‌آموز ====================
interface StudentFormProps {
  sName: string;
  setSName: (v: string) => void;
  sNationalId: string;
  setSNationalId: (v: string) => void;
  sBirthDate: string;
  setSBirthDate: (v: string) => void;
  sPhone: string;
  setSPhone: (v: string) => void;
  sAddress: string;
  setSAddress: (v: string) => void;
  sClass: string;
  setSClass: (v: string) => void;
  sLevel: string;
  setSLevel: (v: string) => void;
  sStatus: StudentStatus;
  setSStatus: (v: StudentStatus) => void;
  sNotes: string;
  setSNotes: (v: string) => void;
  pName: string;
  setPName: (v: string) => void;
  pPhone: string;
  setPPhone: (v: string) => void;
  pNationalId: string;
  setPNationalId: (v: string) => void;
  pRelation: string;
  setPRelation: (v: string) => void;
  classList: Class[];
  avatarPreview: string;
  avatarRef: React.RefObject<HTMLInputElement | null>;
  posterAvatarPreview: string;
  posterAvatarRef: React.RefObject<HTMLInputElement | null>;
  idCardPreview: string;
  idCardRef: React.RefObject<HTMLInputElement | null>;
  birthCertPreview: string;
  birthCertRef: React.RefObject<HTMLInputElement | null>;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPosterAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onIdCardChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBirthCertChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  idCardFile?: File | null;
  birthCertFile?: File | null;
}

function StudentForm({
  sName,
  setSName,
  sNationalId,
  setSNationalId,
  sBirthDate,
  setSBirthDate,
  sPhone,
  setSPhone,
  sAddress,
  setSAddress,
  sClass,
  setSClass,
  sLevel,
  setSLevel,
  sStatus,
  setSStatus,
  sNotes,
  setSNotes,
  pName,
  setPName,
  pPhone,
  setPPhone,
  pNationalId,
  setPNationalId,
  pRelation,
  setPRelation,
  classList,
  avatarPreview,
  avatarRef,
  posterAvatarPreview,
  posterAvatarRef,
  idCardPreview,
  idCardRef,
  birthCertPreview,
  birthCertRef,
  onAvatarChange,
  onPosterAvatarChange,
  onIdCardChange,
  onBirthCertChange,
  idCardFile,
  birthCertFile,
}: StudentFormProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-2">
      {/* اطلاعات دانش‌آموز */}
      <section className="space-y-3 rounded-lg border border-border p-4 bg-secondary/20">
        <h4 className="font-semibold text-sm text-primary border-b pb-2">اطلاعات قرآن‌آموز</h4>
        <Field label="نام و نام خانوادگی *">
          <Input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="علی محمدی" />
        </Field>
        <Field label="کد ملی">
          <Input
            value={sNationalId}
            onChange={(e) => setSNationalId(e.target.value)}
            placeholder="۰۰۱۲۳۴۵۶۷۸"
            dir="ltr"
          />
        </Field>
        <Field label="تاریخ تولد">
          <Input
            value={sBirthDate}
            onChange={(e) => setSBirthDate(e.target.value)}
            placeholder="۱۳۹۰/۰۱/۰۱"
          />
        </Field>
        <Field label="تماس قرآن‌آموز *">
          <Input
            value={sPhone}
            onChange={(e) => setSPhone(e.target.value)}
            placeholder="۰۹۱۶..."
            dir="ltr"
          />
        </Field>
        <Field label="آدرس">
          <Input value={sAddress} onChange={(e) => setSAddress(e.target.value)} />
        </Field>
        <Field label="کلاس *">
          <Select value={sClass} onValueChange={setSClass}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب کلاس" />
            </SelectTrigger>
            <SelectContent>
              {classList.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="سطح *">
          <Select value={sLevel} onValueChange={setSLevel}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب سطح" />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="وضعیت پرونده">
          <Select value={sStatus} onValueChange={(v) => setSStatus(v as StudentStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">فعال</SelectItem>
              <SelectItem value="inactive">غیرفعال</SelectItem>
              <SelectItem value="graduated">فارغ‌التحصیل</SelectItem>
              <SelectItem value="withdrawn">انصرافی</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="توضیحات">
          <Textarea
            value={sNotes}
            onChange={(e) => setSNotes(e.target.value)}
            rows={2}
            placeholder="هر توضیح اضافه‌ای..."
          />
        </Field>
      </section>

      {/* اطلاعات ولی */}
      <div className="space-y-4">
        <section className="space-y-3 rounded-lg border border-border p-4 bg-amber-50/50">
          <h4 className="font-semibold text-sm text-amber-800 border-b pb-2">اطلاعات ولی</h4>
          <Field label="نام ولی *">
            <Input
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="حسن محمدی"
            />
          </Field>
          <Field label="نسبت">
            <Select value={pRelation} onValueChange={setPRelation}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="شماره تماس ولی *">
            <Input
              value={pPhone}
              onChange={(e) => setPPhone(e.target.value)}
              placeholder="۰۹۱۶..."
              dir="ltr"
            />
          </Field>
          <Field label="کد ملی ولی">
            <Input
              value={pNationalId}
              onChange={(e) => setPNationalId(e.target.value)}
              placeholder="۰۰۱۲۳۴۵۶۷۸"
              dir="ltr"
            />
          </Field>
        </section>

        {/* آپلود فایل‌ها */}
        <section className="space-y-3 rounded-lg border border-border p-4 bg-blue-50/30">
          <h4 className="font-semibold text-sm text-blue-800 border-b pb-2">تصاویر و مدارک</h4>
          <p className="text-xs text-muted-foreground">
            عکس پرسنلی به‌طور خودکار به عنوان عکس پروفایل ثبت می‌شود.
          </p>
          <FileUploadBox
            label="عکس پرسنلی (پروفایل) *"
            preview={avatarPreview}
            inputRef={avatarRef}
            onChange={onAvatarChange}
            icon={<Camera className="h-6 w-6" />}
          />
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2">
            <p className="mb-2 text-[11px] leading-5 text-emerald-900">
              عکس بدون پس‌زمینه مخصوص پوستر اختیاری است؛ فایل PNG یا WebP شفاف بارگذاری کنید.
            </p>
            <FileUploadBox
              label="عکس پرسنلی بدون پس‌زمینه (پوستر)"
              preview={posterAvatarPreview}
              inputRef={posterAvatarRef}
              accept="image/png,image/webp"
              onChange={onPosterAvatarChange}
              icon={<Image className="h-6 w-6 text-emerald-700" />}
            />
          </div>
          <FileUploadBox
            label="تصویر کارت ملی"
            preview={idCardPreview}
            inputRef={idCardRef}
            accept="image/*,application/pdf"
            onChange={onIdCardChange}
            icon={<FileImage className="h-6 w-6" />}
            hasFile={!!idCardFile && !idCardPreview}
          />
          <FileUploadBox
            label="تصویر شناسنامه"
            preview={birthCertPreview}
            inputRef={birthCertRef}
            accept="image/*,application/pdf"
            onChange={onBirthCertChange}
            icon={<FileImage className="h-6 w-6" />}
            hasFile={!!birthCertFile && !birthCertPreview}
          />
        </section>
      </div>
    </div>
  );
}

// ==================== کامپوننت مدیریت مدارک ====================
interface DocumentsDialogProps {
  student: Student;
  onClose: () => void;
  onUpdate: () => void;
}

function DocumentsDialog({ student, onClose, onUpdate }: DocumentsDialogProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const avatarUpRef = useRef<HTMLInputElement>(null);
  const idCardUpRef = useRef<HTMLInputElement>(null);
  const birthCertUpRef = useRef<HTMLInputElement>(null);

  const docs: {
    type: "avatar" | "id_card" | "birth_cert";
    label: string;
    url: string | undefined;
    ref: React.RefObject<HTMLInputElement | null>;
  }[] = [
    { type: "avatar", label: "عکس پرسنلی (پروفایل)", url: student.avatar_url, ref: avatarUpRef },
    { type: "id_card", label: "کارت ملی", url: student.id_card_url, ref: idCardUpRef },
    { type: "birth_cert", label: "شناسنامه", url: student.birth_cert_url, ref: birthCertUpRef },
  ];

  const fieldMap = {
    avatar: "avatar_url",
    id_card: "id_card_url",
    birth_cert: "birth_cert_url",
  } as const;
  const folderMap = { avatar: "avatars", id_card: "id-cards", birth_cert: "birth-certs" } as const;

  const handleReplace = async (type: "avatar" | "id_card" | "birth_cert", file: File) => {
    if (!validateUploadFile(file, type === "avatar" ? "avatar" : "document")) return;
    setUploading(type);
    const oldUrl = student[fieldMap[type]];
    const newPath = await uploadFile(file, folderMap[type]);
    if (!newPath) {
      toast.error("خطا در آپلود فایل");
      setUploading(null);
      return;
    }

    const update: Partial<Student> = {
      [fieldMap[type]]: newPath,
      documents_status: "pending_review",
    };
    const { error } = await updateStudentPayload(student.id, update as Record<string, any>);
    if (error) {
      await deleteStorageFile(newPath);
      toast.error("خطا در ذخیره");
    } else {
      if (oldUrl) await deleteStorageFile(oldUrl);
      await recordStudentDocument(student.id, type, file, newPath);
      await logAdminAction("replace_document", "student", student.id, { type, path: newPath });
      toast.success(`${docTypeLabel(type)} بارگذاری شد ✅`);
      onUpdate();
    }
    setUploading(null);
  };

  const handleDelete = async (type: "avatar" | "id_card" | "birth_cert") => {
    setDeleting(type);
    const url = student[fieldMap[type]];
    const { error } = await updateStudentPayload(student.id, {
      [fieldMap[type]]: null,
      documents_status: "incomplete",
    });
    if (error) toast.error("خطا در حذف");
    else {
      if (url) await deleteStorageFile(url);
      await logAdminAction("delete_document", "student", student.id, { type });
      toast.success("مدرک حذف شد");
      onUpdate();
    }
    setDeleting(null);
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            مدارک — {student.name}
          </DialogTitle>
          <DialogDescription>مشاهده، دانلود، جایگزینی یا حذف مدارک بارگذاری‌شده</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {docs.map((doc) => (
            <div key={doc.type} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{doc.label}</span>
                {doc.url && (
                  <Badge variant="outline" className="text-xs text-success border-success/40">
                    بارگذاری شده
                  </Badge>
                )}
                {!doc.url && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    بدون مدرک
                  </Badge>
                )}
              </div>

              {doc.url ? (
                <div className="space-y-3">
                  {/* پیش‌نمایش */}
                  <div className="rounded-lg overflow-hidden bg-secondary/30 flex items-center justify-center min-h-[120px]">
                    {isImageFileValue(doc.url) ? (
                      <SecureImage
                        source={doc.url}
                        alt={doc.label}
                        className="max-h-48 max-w-full object-contain rounded"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 p-6 text-muted-foreground">
                        <FileText className="h-10 w-10" />
                        <span className="text-sm">فایل PDF</span>
                      </div>
                    )}
                  </div>

                  {/* دکمه‌ها */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-8 text-xs"
                      onClick={() => openStoredFile(doc.url, doc.label)}
                    >
                      <Download className="h-3 w-3" />
                      دانلود
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-8 text-xs"
                      onClick={() => doc.ref.current?.click()}
                      disabled={uploading === doc.type}
                    >
                      {uploading === doc.type ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      جایگزینی
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-8 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(doc.type)}
                      disabled={deleting === doc.type}
                    >
                      {deleting === doc.type ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      حذف
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-8 text-xs w-full"
                  onClick={() => doc.ref.current?.click()}
                  disabled={uploading === doc.type}
                >
                  {uploading === doc.type ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  بارگذاری مدرک
                </Button>
              )}

              {/* input مخفی */}
              <input
                ref={doc.ref}
                type="file"
                accept={doc.type === "avatar" ? "image/*" : "image/*,application/pdf"}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleReplace(doc.type, f);
                  e.target.value = "";
                }}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function applyDerivedTuitionStatuses(rows: Student[]): Promise<Student[]> {
  try {
    const statusByStudent = await loadCurrentTuitionStatusMap();
    if (statusByStudent === null) return rows;
    return rows.map((student) => ({
      ...student,
      tuition_status: statusByStudent.get(String(student.id)) ?? "unbilled",
    }));
  } catch (error) {
    console.warn("derived tuition status unavailable:", error);
    return rows;
  }
}

function UsersPage() {
  const [list, setList] = useState<Student[]>([]);
  const [teacherList, setTeacherList] = useState<Teacher[]>([]);
  const [classList, setClassList] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStudentStatus, setFilterStudentStatus] = useState("all");
  const [filterDocs, setFilterDocs] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkClass, setBulkClass] = useState("");
  const [bulkStudentStatus, setBulkStudentStatus] = useState<StudentStatus>("active");
  const [messageText, setMessageText] = useState("");
  const [messageTargets, setMessageTargets] = useState<string[]>([]);

  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [docsStudent, setDocsStudent] = useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "student" | "teacher";
    id: string;
    name: string;
  } | null>(null);

  // فایل‌های آپلود
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [posterAvatarFile, setPosterAvatarFile] = useState<File | null>(null);
  const [posterAvatarPreview, setPosterAvatarPreview] = useState<string>("");
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string>("");
  const [birthCertFile, setBirthCertFile] = useState<File | null>(null);
  const [birthCertPreview, setBirthCertPreview] = useState<string>("");

  const avatarRef = useRef<HTMLInputElement>(null);
  const posterAvatarRef = useRef<HTMLInputElement>(null);
  const idCardRef = useRef<HTMLInputElement>(null);
  const birthCertRef = useRef<HTMLInputElement>(null);
  const profileAvatarRef = useRef<HTMLInputElement>(null);
  const [pendingAvatarId, setPendingAvatarId] = useState<string | null>(null);

  // فرم دانش‌آموز
  const [sName, setSName] = useState("");
  const [sNationalId, setSNationalId] = useState("");
  const [sBirthDate, setSBirthDate] = useState("");
  const [sPhone, setSPhone] = useState("");
  const [sAddress, setSAddress] = useState("");
  const [sClass, setSClass] = useState("");
  const [sLevel, setSLevel] = useState("");
  const [sStatus, setSStatus] = useState<StudentStatus>("active");
  const [sNotes, setSNotes] = useState("");
  const [pName, setPName] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pNationalId, setPNationalId] = useState("");
  const [pRelation, setPRelation] = useState("پدر");

  // فرم استاد
  const [tName, setTName] = useState("");
  const [tSpecialty, setTSpecialty] = useState("");
  const [tPhone, setTPhone] = useState("");
  const [tNationalId, setTNationalId] = useState("");
  const [tPersonnelCode, setTPersonnelCode] = useState("");
  const [tBirthDate, setTBirthDate] = useState("");
  const [tAvatarFile, setTAvatarFile] = useState<File | null>(null);
  const [tAvatarPreview, setTAvatarPreview] = useState<string>("");
  const tAvatarRef = useRef<HTMLInputElement>(null);
  const [viewTeacher, setViewTeacher] = useState<Teacher | null>(null);

  const resetStudent = () => {
    setSName("");
    setSNationalId("");
    setSBirthDate("");
    setSPhone("");
    setSAddress("");
    setSClass("");
    setSLevel("");
    setSStatus("active");
    setSNotes("");
    setPName("");
    setPPhone("");
    setPNationalId("");
    setPRelation("پدر");
    setAvatarFile(null);
    setAvatarPreview("");
    setPosterAvatarFile(null);
    setPosterAvatarPreview("");
    setIdCardFile(null);
    setIdCardPreview("");
    setBirthCertFile(null);
    setBirthCertPreview("");
  };
  const resetTeacher = () => {
    setTName("");
    setTSpecialty("");
    setTPhone("");
    setTNationalId("");
    setTPersonnelCode("");
    setTBirthDate("");
    setTAvatarFile(null);
    setTAvatarPreview("");
  };

  // ==================== بارگذاری داده‌ها ====================
  const loadData = async () => {
    setLoading(true);
    let { data: classes, error: classError } = await supabase
      .from("classes")
      .select("id, name, teacher_id")
      .order("name");
    if (classError && /teacher_id/i.test(classError.message ?? "")) {
      const fallback = await supabase.from("classes").select("id, name").order("name");
      classes = fallback.data as any;
    }
    setClassList(classes ?? []);
    const [students, teachers] = await Promise.all([
      loadSecureAdminStudents(),
      loadSecureAdminTeachers(),
    ]);
    setList(await applyDerivedTuitionStatuses(students as Student[]));
    setTeacherList(teachers as Teacher[]);
    setLoading(false);
  };

  const refreshStudents = async () => {
    const data = await loadSecureAdminStudents();
    const refreshed = await applyDerivedTuitionStatuses(data as Student[]);
    setList(refreshed);
    // آپدیت viewStudent و docsStudent اگر باز هستند
    if (viewStudent) {
      const updated = refreshed.find((student) => student.id === viewStudent.id);
      if (updated) setViewStudent(updated);
    }
    if (docsStudent) {
      const updated = refreshed.find((student) => student.id === docsStudent.id);
      if (updated) setDocsStudent(updated);
    }
  };

  const refreshTeachers = async () => {
    const data = await loadSecureAdminTeachers();
    setTeacherList(data as Teacher[]);
  };

  useEffect(() => {
    loadData();
  }, []);

  // ==================== فیلتر + مرتب‌سازی ====================
  const filteredStudents = useMemo(() => {
    const q = normalizeText(search);
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : 0;

    let r = list.filter((s) => {
      const className = classList.find((c) => c.id === s.class_id)?.name ?? "";
      const haystack = normalizeText(
        [
          s.name,
          s.national_id,
          s.phone,
          s.parent_name,
          s.parent_phone,
          s.parent_national_id,
          className,
          s.level,
          s.notes,
        ].join(" "),
      );
      if (q && !haystack.includes(q)) return false;
      if (filterClass !== "all" && s.class_id !== filterClass) return false;
      if (filterLevel !== "all" && s.level !== filterLevel) return false;
      if (filterStatus !== "all" && s.tuition_status !== filterStatus) return false;
      if (filterStudentStatus !== "all" && (s.status ?? "active") !== filterStudentStatus)
        return false;
      if (filterDocs !== "all" && getDocumentStatus(s) !== filterDocs) return false;
      if (fromTs || toTs) {
        const enrolledTs = s.enrolled_at ? new Date(s.enrolled_at).getTime() : 0;
        if (!enrolledTs) return false;
        if (fromTs && enrolledTs < fromTs) return false;
        if (toTs && enrolledTs > toTs) return false;
      }
      return true;
    });
    r.sort((a, b) => {
      const av =
        sortKey === "enrolled" ? (a.enrolled_at ?? a.enrolled ?? "") : ((a as any)[sortKey] ?? "");
      const bv =
        sortKey === "enrolled" ? (b.enrolled_at ?? b.enrolled ?? "") : ((b as any)[sortKey] ?? "");
      if (sortDir === "asc") return String(av).localeCompare(String(bv), "fa", { numeric: true });
      return String(bv).localeCompare(String(av), "fa", { numeric: true });
    });
    return r;
  }, [
    list,
    search,
    filterClass,
    filterLevel,
    filterStatus,
    filterStudentStatus,
    filterDocs,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
    classList,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginated = filteredStudents.slice((page - 1) * pageSize, page * pageSize);

  const stats = useMemo(() => {
    const uniqueParents = new Set(
      list
        .map((s) => normalizeText(s.parent_national_id || s.parent_phone || s.parent_name))
        .filter(Boolean),
    );
    const now = new Date();
    return {
      students: list.length,
      active: list.filter((s) => (s.status ?? "active") === "active").length,
      teachers: teacherList.length,
      parents: uniqueParents.size,
      overdue: list.filter((s) => s.tuition_status === "overdue").length,
      incompleteDocs: list.filter(
        (s) => getDocumentStatus(s) !== "complete" && getDocumentStatus(s) !== "approved",
      ).length,
      recent: list.filter((s) => {
        if (!s.enrolled_at) return false;
        const d = new Date(s.enrolled_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length,
    };
  }, [list, teacherList]);

  const parentRows = useMemo<ParentRow[]>(() => {
    const map = new Map<string, ParentRow>();
    filteredStudents.forEach((s) => {
      const key = normalizeText(s.parent_national_id || s.parent_phone || s.parent_name || s.id);
      const existing = map.get(key) ?? {
        key,
        name: s.parent_name,
        relation: s.parent_relation ?? "—",
        phone: s.parent_phone,
        nationalId: s.parent_national_id ?? "",
        studentIds: [],
        studentNames: [],
        overdueCount: 0,
      };
      existing.studentIds.push(s.id);
      existing.studentNames.push(s.name);
      if (s.tuition_status === "overdue") existing.overdueCount += 1;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "fa"));
  }, [filteredStudents]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === "asc" ? (
        <ChevronUp className="h-3 w-3 inline" />
      ) : (
        <ChevronDown className="h-3 w-3 inline" />
      )
    ) : (
      <ChevronUp className="h-3 w-3 inline opacity-20" />
    );

  const allSelected = paginated.length > 0 && paginated.every((s) => selected.includes(s.id));
  const toggleAll = () =>
    allSelected
      ? setSelected((prev) => prev.filter((id) => !paginated.find((s) => s.id === id)))
      : setSelected((prev) => [...new Set([...prev, ...paginated.map((s) => s.id)])]);
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const studentTableHeader = [
    "ردیف",
    "نام",
    "تماس قرآن‌آموز",
    "کد ملی",
    "سطح",
    "وضعیت پرونده",
    "کلاس",
    "ولی",
    "تماس ولی",
    "شهریه",
    "وضعیت مدارک",
    "تاریخ ثبت‌نام",
    "آدرس",
  ];
  const studentTableRows = (rows: Student[]) =>
    rows.map((s, idx) => [
      idx + 1,
      s.name,
      s.phone ?? "",
      s.national_id ?? "",
      s.level,
      studentStatusLabel(s.status),
      classList.find((c) => c.id === s.class_id)?.name ?? "",
      s.parent_name,
      s.parent_phone,
      tuitionLabel(s.tuition_status),
      documentStatusLabel(getDocumentStatus(s)),
      formatDateFa(s.enrolled_at ?? s.enrolled),
      s.address ?? "",
    ]);

  // برای CSV ستون ردیف لازم نیست تکرار شود اگر نخواهیم؛ اما برای یکپارچگی همان آرایه استفاده می‌شود
  const exportCSV = (rows: Student[]) => {
    const data = studentTableRows(rows);
    const csv = [studentTableHeader, ...data].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const buildHtmlTable = (header: string[], rows: (string | number)[][]) => `
    <table>
      <thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i % 2 === 0 ? "even" : "odd"}">${r.map((c) => `<td>${String(c ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;

  const printDocumentTitle = (title: string, bodyHtml: string) => {
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("اجازه باز شدن پنجره چاپ داده نشد؛ پنجره‌های پاپ‌آپ را فعال کنید");
      return;
    }
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8" />
      <title>${title}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" />
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Vazirmatn', Tahoma, sans-serif; padding: 24px; color: #1f2937; }
        .doc-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #15803d; padding-bottom: 12px; margin-bottom: 18px; }
        h1 { font-size: 19px; margin: 0; color: #15803d; }
        .meta { color: #6b7280; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        th { background: #15803d; color: #fff; padding: 8px; text-align: right; font-weight: 600; }
        td { border-bottom: 1px solid #e5e7eb; padding: 7px 8px; text-align: right; }
        tr.even { background: #f0fdf4; }
        tr.odd { background: #ffffff; }
        .profile-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; background: #f0fdf4; border-radius: 10px; padding: 16px; border: 1px solid #bbf7d0; }
        .profile-photo { width: 120px; height: 120px; object-fit: cover; border-radius: 999px; border: 3px solid #15803d; }
        .section { margin-bottom: 16px; }
        .section h3 { font-size: 14px; color: #15803d; border-bottom: 2px solid #bbf7d0; padding-bottom: 4px; }
        .row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; border-bottom: 1px dashed #e5e7eb; }
        .row span:first-child { color: #6b7280; }
        .row span:last-child { font-weight: 600; }
        .docs { display: flex; gap: 12px; flex-wrap: wrap; }
        .docs img { width: 140px; height: 100px; object-fit: cover; border: 1px solid #ccc; border-radius: 8px; }
        @media print { body { padding: 0; } }
      </style>
    </head><body>
      <div class="doc-header">
        <h1>${title}</h1>
        <div class="meta">تاریخ خروجی: ${new Date().toLocaleDateString("fa-IR")}</div>
      </div>
      ${bodyHtml}
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  const exportStudentsPDF = (rows: Student[]) => {
    printDocumentTitle(
      "لیست قرآن‌آموزان",
      buildHtmlTable(studentTableHeader, studentTableRows(rows)),
    );
  };

  const exportStudentsWord = (rows: Student[]) => {
    const tableHtml = buildHtmlTable(studentTableHeader, studentTableRows(rows));
    const html = `<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8" />
      <style>
        body{font-family:Tahoma,Arial,sans-serif;}
        table{border-collapse:collapse;width:100%;}
        th{border:1px solid #999;padding:6px;text-align:right;font-size:12px;background:#15803d;color:#fff;}
        td{border:1px solid #999;padding:6px;text-align:right;font-size:12px;}
        tr.even{background:#f0fdf4;}
        h2{color:#15803d;}
      </style>
      </head><body><h2>لیست قرآن‌آموزان</h2>${tableHtml}</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `students-${new Date().toISOString().slice(0, 10)}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ==================== چاپ پروفایل قرآن‌آموز (شامل مدارک) ====================
  const printStudentProfile = async (student: Student) => {
    toast.info("در حال آماده‌سازی پرینت...");
    const [photoUrl, idCardUrl, birthCertUrl] = await Promise.all([
      resolveFileUrl(student.avatar_url, 60 * 5),
      resolveFileUrl(student.id_card_url, 60 * 5),
      resolveFileUrl(student.birth_cert_url, 60 * 5),
    ]);
    const className = classList.find((c) => c.id === student.class_id)?.name ?? "—";
    const body = `
      <div class="profile-header">
        ${photoUrl ? `<img class="profile-photo" src="${photoUrl}" />` : `<div class="profile-photo" style="display:flex;align-items:center;justify-content:center;font-size:32px;background:#eee;">${student.name.charAt(0)}</div>`}
        <div>
          <h2 style="margin:0;">${student.name}</h2>
          <div style="color:#666;font-size:13px;">${student.level} — ${className}</div>
        </div>
      </div>
      <div class="section"><h3>اطلاعات شخصی</h3>
        <div class="row"><span>کد ملی</span><span>${student.national_id || "—"}</span></div>
        <div class="row"><span>تاریخ تولد</span><span>${student.birth_date || "—"}</span></div>
        <div class="row"><span>تماس قرآن‌آموز</span><span>${student.phone || "—"}</span></div>
        <div class="row"><span>آدرس</span><span>${student.address || "—"}</span></div>
      </div>
      <div class="section"><h3>اطلاعات آموزشی</h3>
        <div class="row"><span>سطح</span><span>${student.level}</span></div>
        <div class="row"><span>کلاس</span><span>${className}</span></div>
        <div class="row"><span>میانگین نمره</span><span>${student.average_grade} / ۲۰</span></div>
        <div class="row"><span>درصد حضور</span><span>٪${student.attendance_rate}</span></div>
      </div>
      <div class="section"><h3>اطلاعات ولی</h3>
        <div class="row"><span>نام</span><span>${student.parent_name}</span></div>
        <div class="row"><span>نسبت</span><span>${student.parent_relation || "—"}</span></div>
        <div class="row"><span>تماس</span><span>${student.parent_phone}</span></div>
        <div class="row"><span>کد ملی ولی</span><span>${student.parent_national_id || "—"}</span></div>
      </div>
      <div class="section"><h3>وضعیت مالی</h3>
        <div class="row"><span>وضعیت شهریه</span><span>${tuitionLabel(student.tuition_status)}</span></div>
        ${student.notes ? `<div style="font-size:12px;color:#666;margin-top:6px;">${student.notes}</div>` : ""}
      </div>
      <div class="section"><h3>مدارک</h3>
        <div class="docs">
          ${idCardUrl ? `<div><div style="font-size:11px;margin-bottom:4px;">کارت ملی</div><img src="${idCardUrl}" /></div>` : ""}
          ${birthCertUrl ? `<div><div style="font-size:11px;margin-bottom:4px;">شناسنامه</div><img src="${birthCertUrl}" /></div>` : ""}
          ${!idCardUrl && !birthCertUrl ? `<div style="font-size:12px;color:#888;">مدرکی بارگذاری نشده است</div>` : ""}
        </div>
      </div>`;
    printDocumentTitle(`پروفایل — ${student.name}`, body);
  };

  // ==================== چاپ پروفایل استاد ====================
  const printTeacherProfile = async (teacher: Teacher) => {
    toast.info("در حال آماده‌سازی پرینت...");
    const photoUrl = await resolveFileUrl(teacher.avatar_url, 60 * 5);
    const body = `
      <div class="profile-header">
        ${photoUrl ? `<img class="profile-photo" src="${photoUrl}" />` : `<div class="profile-photo" style="display:flex;align-items:center;justify-content:center;font-size:32px;background:#eee;">${teacher.avatar}</div>`}
        <div>
          <h2 style="margin:0;">${teacher.name}</h2>
          <div style="color:#666;font-size:13px;">${teacher.specialty}</div>
        </div>
      </div>
      <div class="section"><h3>اطلاعات استاد</h3>
        <div class="row"><span>تخصص</span><span>${teacher.specialty}</span></div>
        <div class="row"><span>شماره تماس</span><span>${teacher.phone}</span></div>
        <div class="row"><span>کد ملی</span><span>${teacher.national_id || "—"}</span></div>
        <div class="row"><span>کد پرسنلی</span><span>${teacher.personnel_code || "—"}</span></div>
        <div class="row"><span>تاریخ تولد</span><span>${teacher.birth_date || "—"}</span></div>
        <div class="row"><span>تعداد کلاس‌ها</span><span>${teacher.classes}</span></div>
      </div>`;
    printDocumentTitle(`پروفایل — ${teacher.name}`, body);
  };

  // ==================== عملیات گروهی ====================
  const applyBulk = async () => {
    if (selected.length === 0) {
      toast.error("هیچ قرآن‌آموزی انتخاب نشده است");
      return;
    }
    if (bulkAction === "transfer" && !bulkClass) {
      toast.error("کلاس مقصد را انتخاب کنید");
      return;
    }

    setSaving(true);
    const selectedStudents = list.filter((s) => selected.includes(s.id));
    try {
      if (bulkAction === "delete") {
        const { error } = await supabase.from("students").delete().in("id", selected);
        if (error) toast.error("خطا در حذف");
        else {
          await deleteStudentStorageFiles(selectedStudents);
          await logAdminAction("bulk_delete_students", "student", null, { ids: selected });
          toast.success(`${selected.length} قرآن‌آموز حذف شد`);
          await refreshStudents();
        }
      } else if (bulkAction === "transfer") {
        const { error } = await supabase
          .from("students")
          .update({ class_id: bulkClass })
          .in("id", selected);
        if (error) toast.error("خطا در انتقال");
        else {
          toast.success(`${selected.length} نفر منتقل شد`);
          await refreshStudents();
        }
      } else if (bulkAction === "studentStatus") {
        const { error } = await supabase
          .from("students")
          .update({ status: bulkStudentStatus })
          .in("id", selected);
        if (error) toast.error("برای تغییر وضعیت پرونده، migration ستون status را اجرا کنید");
        else {
          toast.success(`وضعیت پرونده ${selected.length} نفر تغییر کرد`);
          await refreshStudents();
        }
      } else if (bulkAction === "export") {
        exportCSV(selectedStudents);
      }
      setSelected([]);
      setDialog(null);
    } finally {
      setSaving(false);
    }
  };

  // ==================== ثبت دانش‌آموز ====================
  const submitStudent = async () => {
    if (
      !sName.trim() ||
      !sClass ||
      !sLevel ||
      !sPhone.trim() ||
      !pName.trim() ||
      !pPhone.trim()
    ) {
      toast.error("نام، شماره تماس قرآن‌آموز، نام ولی و شماره تماس ولی الزامی است");
      return;
    }
    if (!avatarFile) {
      toast.error("عکس پرسنلی برای ثبت قرآن‌آموز الزامی است");
      return;
    }
    if (!validateUploadFile(avatarFile, "avatar")) return;
    if (posterAvatarFile && !validatePosterAvatarFile(posterAvatarFile)) return;
    if (idCardFile && !validateUploadFile(idCardFile, "document")) return;
    if (birthCertFile && !validateUploadFile(birthCertFile, "document")) return;

    setSaving(true);
    toast.info("در حال آپلود فایل‌ها...");

    const uploadedPaths: string[] = [];
    let avatarPath = "";
    let posterAvatarPath = "";
    let idCardPath = "";
    let birthCertPath = "";

    try {
      avatarPath = (await uploadFile(avatarFile, "avatars")) ?? "";
      if (!avatarPath) throw new Error("خطا در آپلود عکس پروفایل");
      uploadedPaths.push(avatarPath);

      if (posterAvatarFile) {
        posterAvatarPath = (await uploadFile(posterAvatarFile, "avatars/poster-cutouts")) ?? "";
        if (!posterAvatarPath) throw new Error("خطا در آپلود عکس بدون پس‌زمینه پوستر");
        uploadedPaths.push(posterAvatarPath);
      }

      if (idCardFile) {
        idCardPath = (await uploadFile(idCardFile, "id-cards")) ?? "";
        if (!idCardPath) throw new Error("خطا در آپلود کارت ملی");
        uploadedPaths.push(idCardPath);
      }
      if (birthCertFile) {
        birthCertPath = (await uploadFile(birthCertFile, "birth-certs")) ?? "";
        if (!birthCertPath) throw new Error("خطا در آپلود شناسنامه");
        uploadedPaths.push(birthCertPath);
      }

      const enrolledAt = new Date().toISOString();
      const payload: Record<string, any> = {
        name: sName.trim(),
        national_id: sNationalId.trim() || null,
        birth_date: sBirthDate.trim() || null,
        phone: sPhone.trim() || null,
        address: sAddress.trim() || null,
        level: sLevel,
        class_id: sClass,
        parent_name: pName.trim(),
        parent_phone: pPhone.trim(),
        parent_national_id: pNationalId.trim() || null,
        parent_relation: pRelation,
        notes: sNotes.trim() || null,
        enrolled: new Date(enrolledAt).toLocaleDateString("fa-IR"),
        enrolled_at: enrolledAt,
        status: sStatus,
        attendance_rate: 100,
        average_grade: 0,
        tuition_status: "pending",
        documents_status: idCardPath && birthCertPath ? "pending_review" : "incomplete",
        avatar_url: avatarPath,
        poster_avatar_url: posterAvatarPath || null,
        id_card_url: idCardPath || null,
        birth_cert_url: birthCertPath || null,
      };

      const result = await insertStudentPayload(payload);
      if (result.error) throw new Error(result.error.message ?? "خطا در ثبت دانش‌آموز");

      const newStudentId = result.data?.id;
      let studentAuthCreated = false;
      let parentAuthCreated = false;
      let parentProfileId: string | null = null;

      if (newStudentId) {
        parentProfileId = await upsertParentRecord(newStudentId, payload);
        await recordStudentDocument(newStudentId, "avatar", avatarFile, avatarPath);
        if (idCardFile && idCardPath)
          await recordStudentDocument(newStudentId, "id_card", idCardFile, idCardPath);
        if (birthCertFile && birthCertPath)
          await recordStudentDocument(newStudentId, "birth_cert", birthCertFile, birthCertPath);
        await logAdminAction("create_student", "student", newStudentId, { name: payload.name });

        const studentAuth = await provisionAuthAccount({
          entityType: "student",
          entityId: Number(newStudentId),
          phone: sPhone.trim(),
          name: payload.name,
        });
        studentAuthCreated = studentAuth.ok;
        if (!studentAuth.ok) {
          console.warn("[provision] student auth failed:", studentAuth);
        }

        if (parentProfileId) {
          const parentAuth = await provisionAuthAccount({
            entityType: "parent",
            entityId: parentProfileId,
            phone: pPhone.trim(),
            name: payload.parent_name,
          });
          parentAuthCreated = parentAuth.ok;
          if (!parentAuth.ok) {
            console.warn("[provision] parent auth failed:", parentAuth);
          }
        } else {
          console.warn("[provision] parent auth skipped: parent profile was not created");
        }
      }

      if (studentAuthCreated && parentAuthCreated) {
        toast.success("قرآن‌آموز و ولی با موفقیت ثبت شدند و حساب‌های ورود ساخته شد ✅");
      } else if (studentAuthCreated || parentAuthCreated) {
        toast.warning("اطلاعات ثبت شد، اما ساخت یکی از حساب‌های ورود کامل نشد ⚠️");
      } else {
        toast.warning("اطلاعات ثبت شد، اما حساب‌های ورود ساخته نشدند ⚠️");
      }
      resetStudent();
      setDialog(null);
      await refreshStudents();
    } catch (e: any) {
      await Promise.all(uploadedPaths.map((path) => deleteStorageFile(path)));
      toast.error(e?.message ?? "خطا در ثبت دانش‌آموز");
    } finally {
      setSaving(false);
    }
  };

  // ==================== ثبت استاد ====================
  const submitTeacher = async () => {
    if (!tName.trim() || !tSpecialty.trim() || !tPhone.trim()) {
      toast.error("فیلدهای ضروری را تکمیل کنید");
      return;
    }
    if (tAvatarFile && !validateUploadFile(tAvatarFile, "avatar")) return;

    setSaving(true);
    let avatarPath = "";
    try {
      if (tAvatarFile) {
        avatarPath = (await uploadFile(tAvatarFile, "teacher-avatars")) ?? "";
        if (!avatarPath) throw new Error("خطا در آپلود عکس پرسنلی");
      }
      const fullName = tName.trim().startsWith("استاد") ? tName.trim() : `استاد ${tName.trim()}`;
      const initials = fullName.split(" ").slice(-1)[0]?.charAt(0) ?? "؟";
      const payload: Record<string, any> = {
        name: fullName,
        specialty: tSpecialty.trim(),
        phone: tPhone.trim(),
        classes: 0,
        avatar: initials,
        national_id: tNationalId.trim() || null,
        personnel_code: tPersonnelCode.trim() || null,
        birth_date: tBirthDate.trim() || null,
        avatar_url: avatarPath || null,
      };
      const result = await insertTeacherPayload(payload);
      if (result.error) throw new Error(result.error.message ?? "خطا در ثبت استاد");

      const newTeacherId = result.data?.id;
      let teacherAuthCreated = false;

      if (newTeacherId) {
        const teacherAuth = await provisionAuthAccount({
          entityType: "teacher",
          entityId: Number(newTeacherId),
          phone: tPhone.trim(),
          name: fullName,
        });
        teacherAuthCreated = teacherAuth.ok;
        if (!teacherAuth.ok) {
          console.warn("[provision] teacher auth failed:", teacherAuth);
        }
        await logAdminAction("create_teacher", "teacher", String(newTeacherId), {
          name: fullName,
          authProvisioned: teacherAuth.ok,
        });
      }

      if (teacherAuthCreated) {
        toast.success("استاد و حساب ورود او با موفقیت ساخته شد ✅");
      } else {
        toast.warning("استاد ثبت شد، اما ساخت حساب ورود او ناموفق بود ⚠️");
      }
      resetTeacher();
      setDialog(null);
      await refreshTeachers();
    } catch (e: any) {
      if (avatarPath) await deleteStorageFile(avatarPath);
      toast.error(e?.message ?? "خطا در ثبت استاد");
    } finally {
      setSaving(false);
    }
  };

  // ==================== ویرایش دانش‌آموز ====================
  const openEditStudent = (s: Student) => {
    setEditStudent(s);
    setSName(s.name);
    setSNationalId(s.national_id ?? "");
    setSBirthDate(s.birth_date ?? "");
    setSPhone(s.phone ?? "");
    setSAddress(s.address ?? "");
    setSClass(s.class_id);
    setSLevel(s.level);
    setSStatus(s.status ?? "active");
    setSNotes(s.notes ?? "");
    setPName(s.parent_name);
    setPPhone(s.parent_phone);
    setPNationalId(s.parent_national_id ?? "");
    setPRelation(s.parent_relation ?? "پدر");
    setAvatarPreview(s.avatar_url ?? "");
    setPosterAvatarPreview(s.poster_avatar_url ?? "");
    setIdCardPreview(isImageFileValue(s.id_card_url) ? (s.id_card_url ?? "") : "");
    setBirthCertPreview(isImageFileValue(s.birth_cert_url) ? (s.birth_cert_url ?? "") : "");
    setAvatarFile(null);
    setPosterAvatarFile(null);
    setIdCardFile(null);
    setBirthCertFile(null);
    setDialog("editStudent");
  };

  const saveEditStudent = async () => {
    if (!editStudent) return;
    if (!sName.trim() || !sClass || !sLevel || !pName.trim() || !pPhone.trim()) {
      toast.error("فیلدهای ستاره‌دار را تکمیل کنید");
      return;
    }
    if (avatarFile && !validateUploadFile(avatarFile, "avatar")) return;
    if (posterAvatarFile && !validatePosterAvatarFile(posterAvatarFile)) return;
    if (idCardFile && !validateUploadFile(idCardFile, "document")) return;
    if (birthCertFile && !validateUploadFile(birthCertFile, "document")) return;

    setSaving(true);
    const newUploads: {
      type: "avatar" | "id_card" | "birth_cert";
      path: string;
      file: File;
      old?: string;
    }[] = [];
    let posterAvatarNewPath = "";

    try {
      let avatarUrl = editStudent.avatar_url ?? "";
      let posterAvatarUrl = editStudent.poster_avatar_url ?? "";
      let idCardUrl = editStudent.id_card_url ?? "";
      let birthCertUrl = editStudent.birth_cert_url ?? "";

      if (avatarFile) {
        const path = await uploadFile(avatarFile, "avatars");
        if (!path) throw new Error("خطا در آپلود عکس پروفایل");
        avatarUrl = path;
        newUploads.push({ type: "avatar", path, file: avatarFile, old: editStudent.avatar_url });
      }
      if (posterAvatarFile) {
        const path = await uploadFile(posterAvatarFile, "avatars/poster-cutouts");
        if (!path) throw new Error("خطا در آپلود عکس بدون پس‌زمینه پوستر");
        posterAvatarUrl = path;
        posterAvatarNewPath = path;
      }
      if (idCardFile) {
        const path = await uploadFile(idCardFile, "id-cards");
        if (!path) throw new Error("خطا در آپلود کارت ملی");
        idCardUrl = path;
        newUploads.push({ type: "id_card", path, file: idCardFile, old: editStudent.id_card_url });
      }
      if (birthCertFile) {
        const path = await uploadFile(birthCertFile, "birth-certs");
        if (!path) throw new Error("خطا در آپلود شناسنامه");
        birthCertUrl = path;
        newUploads.push({
          type: "birth_cert",
          path,
          file: birthCertFile,
          old: editStudent.birth_cert_url,
        });
      }

      const updatePayload: Record<string, any> = {
        name: sName.trim(),
        national_id: sNationalId.trim() || null,
        birth_date: sBirthDate.trim() || null,
        phone: sPhone.trim() || null,
        address: sAddress.trim() || null,
        class_id: sClass,
        level: sLevel,
        status: sStatus,
        parent_name: pName.trim(),
        parent_phone: pPhone.trim(),
        parent_national_id: pNationalId.trim() || null,
        parent_relation: pRelation,
        notes: sNotes.trim() || null,
        documents_status:
          avatarUrl && idCardUrl && birthCertUrl
            ? newUploads.length
              ? "pending_review"
              : getDocumentStatus(editStudent)
            : "incomplete",
        avatar_url: avatarUrl || null,
        poster_avatar_url: posterAvatarUrl || null,
        id_card_url: idCardUrl || null,
        birth_cert_url: birthCertUrl || null,
      };

      const result = await updateStudentPayload(editStudent.id, updatePayload);
      if (result.error) throw new Error(result.error.message ?? "خطا در ویرایش");

      for (const item of newUploads) {
        if (item.old) await deleteStorageFile(item.old);
        await recordStudentDocument(editStudent.id, item.type, item.file, item.path);
      }
      if (posterAvatarNewPath && editStudent.poster_avatar_url) {
        await deleteStorageFile(editStudent.poster_avatar_url);
      }
      await upsertParentRecord(editStudent.id, updatePayload);
      await logAdminAction("update_student", "student", editStudent.id, {
        name: updatePayload.name,
        changedDocuments: newUploads.map((x) => x.type),
      });

      toast.success("اطلاعات ذخیره شد ✅");
      setDialog(null);
      await refreshStudents();
    } catch (e: any) {
      await Promise.all(newUploads.map((item) => deleteStorageFile(item.path)));
      if (posterAvatarNewPath) await deleteStorageFile(posterAvatarNewPath);
      toast.error(e?.message ?? "خطا در ویرایش");
    } finally {
      setSaving(false);
    }
  };

  // ==================== ویرایش استاد ====================
  const openEditTeacher = (t: Teacher) => {
    setEditTeacher(t);
    setTName(t.name);
    setTSpecialty(t.specialty);
    setTPhone(t.phone);
    setTNationalId(t.national_id ?? "");
    setTPersonnelCode(t.personnel_code ?? "");
    setTBirthDate(t.birth_date ?? "");
    setTAvatarPreview(t.avatar_url ?? "");
    setTAvatarFile(null);
    setDialog("editTeacher");
  };
  const saveEditTeacher = async () => {
    if (!editTeacher) return;
    if (tAvatarFile && !validateUploadFile(tAvatarFile, "avatar")) return;
    setSaving(true);
    try {
      let avatarUrl = editTeacher.avatar_url ?? "";
      const oldAvatar = editTeacher.avatar_url;
      if (tAvatarFile) {
        const path = await uploadFile(tAvatarFile, "teacher-avatars");
        if (!path) throw new Error("خطا در آپلود عکس پرسنلی");
        avatarUrl = path;
      }
      const payload: Record<string, any> = {
        name: tName,
        specialty: tSpecialty,
        phone: tPhone,
        national_id: tNationalId.trim() || null,
        personnel_code: tPersonnelCode.trim() || null,
        birth_date: tBirthDate.trim() || null,
        avatar_url: avatarUrl || null,
      };
      const result = await updateTeacherPayload(editTeacher.id, payload);
      if (result.error) throw new Error(result.error.message ?? "خطا در ویرایش استاد");
      if (tAvatarFile && oldAvatar) await deleteStorageFile(oldAvatar);
      toast.success("اطلاعات استاد ویرایش شد ✅");
      setDialog(null);
      await refreshTeachers();
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در ویرایش استاد");
    } finally {
      setSaving(false);
    }
  };

  // ==================== حذف ====================
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const table = deleteTarget.type === "student" ? "students" : "teachers";
    const studentToDelete =
      deleteTarget.type === "student" ? list.find((s) => s.id === deleteTarget.id) : null;
    const { error } = await supabase.from(table).delete().eq("id", deleteTarget.id);
    if (error) toast.error("خطا در حذف");
    else {
      if (studentToDelete) await deleteStudentStorageFiles([studentToDelete]);
      await logAdminAction("delete", table, deleteTarget.id, { name: deleteTarget.name });
      toast.success("حذف شد ✅");
      setDeleteTarget(null);
      if (deleteTarget.type === "student") await refreshStudents();
      else await refreshTeachers();
    }
    setSaving(false);
  };

  // ==================== آپلود سریع عکس پروفایل از لیست ====================
  const handleProfileAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingAvatarId) return;
    if (!validateUploadFile(file, "avatar")) {
      e.target.value = "";
      return;
    }
    setSaving(true);
    const student = list.find((s) => s.id === pendingAvatarId);
    const newPath = await uploadFile(file, "avatars");
    if (!newPath) {
      toast.error("خطا در آپلود عکس");
    } else {
      const { error } = await updateStudentPayload(pendingAvatarId, {
        avatar_url: newPath,
        documents_status: "pending_review",
      });
      if (error) {
        await deleteStorageFile(newPath);
        toast.error("خطا در ذخیره عکس");
      } else {
        if (student?.avatar_url) await deleteStorageFile(student.avatar_url);
        await recordStudentDocument(pendingAvatarId, "avatar", file, newPath);
        await refreshStudents();
        toast.success("عکس پروفایل بارگذاری شد ✅");
      }
    }
    e.target.value = "";
    setSaving(false);
  };

  // ==================== ارسال پیام ====================
  const sendMessage = async () => {
    const targets = [...new Set(messageTargets)].filter(Boolean);
    if (!messageText.trim() || targets.length === 0) return;
    setSaving(true);
    const results = await Promise.allSettled(
      targets.map((targetId) =>
        sendSecureMessage({
          targetType: "student",
          targetId,
          subject: "پیام از مدیریت",
          content: messageText,
        }),
      ),
    );
    const sentCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - sentCount;
    if (sentCount > 0) {
      await logAdminAction("send_secure_message", "message", null, { count: sentCount });
      toast.success(`پیام امن برای ${sentCount} حساب ارسال شد ✅`);
      setDialog(null);
      setMessageText("");
      setMessageTargets([]);
    }
    if (failedCount > 0)
      toast.error(`${failedCount} گیرنده حساب Auth فعال و متصل ندارد یا ارسال ناموفق بود`);
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-2 text-muted-foreground">در حال بارگذاری...</span>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="مدیریت کاربران"
        description="مدیریت اطلاعات قرآن‌آموزان، اساتید و والدین مرکز."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gradient-primary text-primary-foreground gap-2">
                <UserPlus className="h-4 w-4" />
                افزودن کاربر
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  resetStudent();
                  setDialog("student");
                }}
                className="gap-2"
              >
                <GraduationCap className="h-4 w-4 text-primary" />
                افزودن قرآن‌آموز
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  resetTeacher();
                  setDialog("teacher");
                }}
                className="gap-2"
              >
                <BookOpen className="h-4 w-4" />
                افزودن استاد
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <input
        ref={profileAvatarRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleProfileAvatarUpload}
      />

      <Card className="p-5 shadow-card">
        {/* جستجو و فیلتر */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="نام، کد ملی، ولی، تماس، سطح..."
                className="pr-10"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={filterClass}
              onValueChange={(v) => {
                setFilterClass(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="همه کلاس‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه کلاس‌ها</SelectItem>
                {classList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterLevel}
              onValueChange={(v) => {
                setFilterLevel(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="همه سطوح" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه سطوح</SelectItem>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterStatus}
              onValueChange={(v) => {
                setFilterStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="همه وضعیت‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="paid">پرداخت شده</SelectItem>
                <SelectItem value="pending">در انتظار</SelectItem>
                <SelectItem value="overdue">معوق</SelectItem>
                <SelectItem value="unbilled">صورتحساب ندارد</SelectItem>
                <SelectItem value="cancelled">لغوشده</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Download className="h-3 w-3" />
                  خروجی
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportCSV(filteredStudents)} className="gap-2">
                  <FileText className="h-4 w-4" />
                  اکسل (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportStudentsPDF(filteredStudents)}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportStudentsWord(filteredStudents)}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Word
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {selected.length > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20 flex-wrap">
              <span className="text-sm font-semibold text-primary">
                {selected.length} نفر انتخاب شده
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  setBulkAction("transfer");
                  setDialog("bulkAction");
                }}
              >
                <Filter className="h-3 w-3" />
                انتقال به کلاس
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => exportCSV(list.filter((s) => selected.includes(s.id)))}
              >
                خروجی اکسل
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => exportStudentsPDF(list.filter((s) => selected.includes(s.id)))}
              >
                خروجی PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => exportStudentsWord(list.filter((s) => selected.includes(s.id)))}
              >
                خروجی Word
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 text-destructive"
                onClick={() => {
                  setBulkAction("delete");
                  setDialog("bulkAction");
                }}
              >
                <Trash2 className="h-3 w-3" />
                حذف گروهی
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setSelected([])}
              >
                لغو انتخاب
              </Button>
            </div>
          )}
        </div>

        <Tabs defaultValue="students" className="w-full">
          <TabsList className="bg-secondary">
            <TabsTrigger value="students">قرآن‌آموزان ({filteredStudents.length})</TabsTrigger>
            <TabsTrigger value="teachers">اساتید ({teacherList.length})</TabsTrigger>
            <TabsTrigger value="parents">والدین ({filteredStudents.length})</TabsTrigger>
          </TabsList>

          {/* قرآن‌آموزان */}
          <TabsContent value="students" className="mt-4">
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="w-8">
                      <button onClick={toggleAll}>
                        {allSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="w-10">ردیف</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>
                      قرآن‌آموز <SortIcon k="name" />
                    </TableHead>
                    <TableHead>تماس قرآن‌آموز</TableHead>
                    <TableHead>کد ملی</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("level")}>
                      سطح <SortIcon k="level" />
                    </TableHead>
                    <TableHead>کلاس</TableHead>
                    <TableHead>ولی</TableHead>
                    <TableHead>تماس ولی</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("enrolled")}>
                      ثبت‌نام <SortIcon k="enrolled" />
                    </TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((s, idx) => (
                    <TableRow key={s.id} className={selected.includes(s.id) ? "bg-primary/5" : ""}>
                      <TableCell>
                        <button onClick={() => toggleOne(s.id)}>
                          {selected.includes(s.id) ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(page - 1) * pageSize + idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="relative group">
                            <Avatar className="h-8 w-8">
                              <SecureAvatarImage source={s.avatar_url} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {s.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <button
                              className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                              onClick={() => {
                                setPendingAvatarId(s.id);
                                profileAvatarRef.current?.click();
                              }}
                            >
                              <Camera className="h-3 w-3 text-white" />
                            </button>
                          </div>
                          <span className="font-medium text-sm">{s.name}</span>
                          {/* نشانگر مدارک */}
                          {(s.id_card_url || s.birth_cert_url) && (
                            <span title="مدارک بارگذاری شده">
                              <FolderOpen className="h-3 w-3 text-muted-foreground" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" dir="ltr">
                        {s.phone || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" dir="ltr">
                        {s.national_id || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{s.level}</TableCell>
                      <TableCell className="text-sm">
                        {classList.find((c) => c.id === s.class_id)?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{s.parent_name}</TableCell>
                      <TableCell className="text-sm" dir="ltr">
                        {s.parent_phone}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.enrolled}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-primary"
                            title="مشاهده"
                            onClick={() => {
                              setViewStudent(s);
                              setDialog("viewStudent");
                            }}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="ویرایش"
                            onClick={() => openEditStudent(s)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="مدارک"
                            onClick={() => {
                              setDocsStudent(s);
                              setDialog("documents");
                            }}
                          >
                            <FolderOpen className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive"
                            title="حذف"
                            onClick={() =>
                              setDeleteTarget({ type: "student", id: s.id, name: s.name })
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginated.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        هیچ قرآن‌آموزی یافت نشد
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* صفحه‌بندی */}
            <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">نمایش</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-16 h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">از {filteredStudents.length} نفر</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .map((p, i, arr) => (
                    <span key={p}>
                      {i > 0 && arr[i - 1] !== p - 1 && (
                        <span className="px-1 text-muted-foreground">...</span>
                      )}
                      <Button
                        size="sm"
                        variant={p === page ? "default" : "outline"}
                        className="h-7 w-7 p-0 text-xs"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    </span>
                  ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* اساتید */}
          <TabsContent value="teachers" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teacherList.map((t) => (
                <Card key={t.id} className="p-4 border-border/70">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-amber-400">
                      <SecureAvatarImage source={t.avatar_url} />
                      <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                        {t.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.specialty}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground" dir="ltr">
                      {t.phone}
                    </span>
                    <Badge variant="secondary">{t.classes} کلاس</Badge>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1"
                      onClick={() => setViewTeacher(t)}
                    >
                      <Eye className="h-3 w-3" />
                      پروفایل
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1"
                      onClick={() => openEditTeacher(t)}
                    >
                      <Edit className="h-3 w-3" />
                      ویرایش
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget({ type: "teacher", id: t.id, name: t.name })}
                    >
                      <Trash2 className="h-3 w-3" />
                      حذف
                    </Button>
                  </div>
                </Card>
              ))}
              {teacherList.length === 0 && (
                <p className="text-muted-foreground text-sm col-span-3 text-center py-8">
                  استادی ثبت نشده
                </p>
              )}
            </div>
          </TabsContent>

          {/* والدین */}
          <TabsContent value="parents" className="mt-4">
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead>نام ولی</TableHead>
                    <TableHead>نسبت</TableHead>
                    <TableHead>قرآن‌آموز</TableHead>
                    <TableHead>شماره تماس</TableHead>
                    <TableHead>کد ملی</TableHead>
                    <TableHead>وضعیت شهریه</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.parent_name}</TableCell>
                      <TableCell className="text-sm">{s.parent_relation ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.name}</TableCell>
                      <TableCell className="text-sm" dir="ltr">
                        {s.parent_phone}
                      </TableCell>
                      <TableCell className="text-sm" dir="ltr">
                        {s.parent_national_id || "—"}
                      </TableCell>
                      <TableCell>
                        <TuitionBadge status={s.tuition_status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setMessageTargets([s.id]);
                            setMessageText("");
                            setDialog("message");
                          }}
                        >
                          <MessageSquare className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      {/* ==================== دیالوگ مشاهده پروفایل ==================== */}
      <Dialog open={dialog === "viewStudent"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 overflow-x-hidden"
          dir="rtl"
        >
          {viewStudent && (
            <div className="space-y-4 pb-5">
              {/* بنر سرپروفایل */}
              <div className="relative gradient-primary bg-islamic-pattern px-6 pt-6 pb-8 rounded-t-lg overflow-hidden">
                <div className="absolute inset-0 bg-islamic-pattern opacity-30 pointer-events-none" />
                <div className="relative flex items-center justify-between gap-2 mb-4">
                  <DialogHeader className="p-0">
                    <DialogTitle className="text-primary-foreground/90 text-xs font-normal flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-gold" />
                      پروفایل قرآن‌آموز
                    </DialogTitle>
                  </DialogHeader>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1 h-7 text-xs bg-primary-foreground/15 text-primary-foreground border-0 hover:bg-primary-foreground/25"
                    onClick={() => printStudentProfile(viewStudent)}
                  >
                    <Printer className="h-3 w-3" />
                    چاپ پروفایل
                  </Button>
                </div>
                <div className="relative flex items-center gap-4">
                  <ProfilePhoto source={viewStudent.avatar_url} name={viewStudent.name} />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xl text-primary-foreground font-display truncate">
                      {viewStudent.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge className="bg-gold/90 text-foreground border-0 text-[11px] gap-1">
                        <GraduationCap className="h-3 w-3" />
                        {viewStudent.level}
                      </Badge>
                      <Badge className="bg-primary-foreground/15 text-primary-foreground border-0 text-[11px]">
                        {classList.find((c) => c.id === viewStudent.class_id)?.name ?? "—"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-primary-foreground/70 mt-1.5 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      ثبت‌نام: {viewStudent.enrolled}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 space-y-4">
                {/* آمار کلیدی */}
                <div className="grid grid-cols-3 gap-3 -mt-2">
                  <div className="rounded-xl border border-border bg-card p-3 text-center shadow-sm">
                    <p className="text-xl font-bold text-primary">
                      {viewStudent.average_grade}
                      <span className="text-xs text-muted-foreground font-normal"> /۲۰</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                      <Award className="h-3 w-3" />
                      میانگین نمره
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 text-center shadow-sm">
                    <p className="text-xl font-bold text-success">٪{viewStudent.attendance_rate}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                      <TrendingUp className="h-3 w-3" />
                      درصد حضور
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 text-center shadow-sm flex flex-col items-center justify-center">
                    <TuitionBadge status={viewStudent.tuition_status} />
                    <p className="text-[11px] text-muted-foreground mt-1.5">وضعیت شهریه</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Section title="اطلاعات شخصی" icon={<Hash className="h-3.5 w-3.5" />}>
                    <Row label="کد ملی" value={viewStudent.national_id || "—"} />
                    <Row label="تاریخ تولد" value={viewStudent.birth_date || "—"} />
                    <Row label="تماس قرآن‌آموز" value={viewStudent.phone || "—"} />
                    <Row label="آدرس" value={viewStudent.address || "—"} />
                  </Section>
                  <Section title="اطلاعات آموزشی" icon={<BookOpen className="h-3.5 w-3.5" />}>
                    <Row label="سطح" value={viewStudent.level} />
                    <Row
                      label="کلاس"
                      value={classList.find((c) => c.id === viewStudent.class_id)?.name ?? "—"}
                    />
                    <Row label="میانگین نمره" value={`${viewStudent.average_grade} / ۲۰`} />
                    <Row label="درصد حضور" value={`٪${viewStudent.attendance_rate}`} />
                  </Section>
                  <Section title="اطلاعات ولی" icon={<Users className="h-3.5 w-3.5" />}>
                    <Row label="نام" value={viewStudent.parent_name} />
                    <Row label="نسبت" value={viewStudent.parent_relation || "—"} />
                    <Row label="تماس" value={viewStudent.parent_phone} />
                    <Row label="کد ملی ولی" value={viewStudent.parent_national_id || "—"} />
                  </Section>
                  <Section title="وضعیت مالی" icon={<CreditCard className="h-3.5 w-3.5" />}>
                    <div className="flex items-center gap-2 pt-0.5">
                      <TuitionBadge status={viewStudent.tuition_status} />
                    </div>
                    {viewStudent.notes && (
                      <p className="text-xs text-muted-foreground mt-2 leading-5">
                        {viewStudent.notes}
                      </p>
                    )}
                  </Section>
                </div>

                {/* مدارک */}
                <Section title="مدارک بارگذاری‌شده" icon={<FolderOpen className="h-3.5 w-3.5" />}>
                  <div className="grid grid-cols-2 gap-3 pt-1 md:grid-cols-4">
                    {[
                      {
                        label: "عکس پروفایل",
                        url: viewStudent.avatar_url,
                        icon: <Image className="h-8 w-8 text-muted-foreground" />,
                      },
                      {
                        label: "عکس شفاف پوستر",
                        url: viewStudent.poster_avatar_url,
                        icon: <Image className="h-8 w-8 text-emerald-700" />,
                      },
                      {
                        label: "کارت ملی",
                        url: viewStudent.id_card_url,
                        icon: <FileImage className="h-8 w-8 text-muted-foreground" />,
                      },
                      {
                        label: "شناسنامه",
                        url: viewStudent.birth_cert_url,
                        icon: <FileText className="h-8 w-8 text-muted-foreground" />,
                      },
                    ].map((doc) => (
                      <div
                        key={doc.label}
                        className="rounded-lg border border-border p-2 text-center space-y-1 bg-secondary/20"
                      >
                        <p className="text-xs text-muted-foreground">{doc.label}</p>
                        {doc.url ? (
                          <>
                            {doc.url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? (
                              <SecureImage
                                source={doc.url}
                                alt={doc.label}
                                className="h-16 w-full rounded object-contain"
                              />
                            ) : (
                              <div className="h-16 flex items-center justify-center">
                                {doc.icon}
                              </div>
                            )}
                            <a href={doc.url} target="_blank" rel="noreferrer" download>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs w-full gap-1"
                              >
                                <Download className="h-3 w-3" />
                                دانلود
                              </Button>
                            </a>
                          </>
                        ) : (
                          <div className="h-16 flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">بارگذاری نشده</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 gap-1 text-xs"
                    onClick={() => {
                      setDocsStudent(viewStudent);
                      setDialog("documents");
                    }}
                  >
                    <FolderOpen className="h-3 w-3" />
                    مدیریت مدارک
                  </Button>
                </Section>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== دیالوگ مدارک ==================== */}
      {dialog === "documents" && docsStudent && (
        <DocumentsDialog
          student={docsStudent}
          onClose={() => setDialog(null)}
          onUpdate={refreshStudents}
        />
      )}

      {/* ==================== دیالوگ افزودن دانش‌آموز ==================== */}
      <Dialog open={dialog === "student"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              افزودن قرآن‌آموز جدید
            </DialogTitle>
            <DialogDescription>اطلاعات قرآن‌آموز، ولی و مدارک را وارد کنید.</DialogDescription>
          </DialogHeader>
          <StudentForm
            sName={sName}
            setSName={setSName}
            sStatus={sStatus}
            setSStatus={setSStatus}
            sNationalId={sNationalId}
            setSNationalId={setSNationalId}
            sBirthDate={sBirthDate}
            setSBirthDate={setSBirthDate}
            sPhone={sPhone}
            setSPhone={setSPhone}
            sAddress={sAddress}
            setSAddress={setSAddress}
            sClass={sClass}
            setSClass={setSClass}
            sLevel={sLevel}
            setSLevel={setSLevel}
            sNotes={sNotes}
            setSNotes={setSNotes}
            pName={pName}
            setPName={setPName}
            pPhone={pPhone}
            setPPhone={setPPhone}
            pNationalId={pNationalId}
            setPNationalId={setPNationalId}
            pRelation={pRelation}
            setPRelation={setPRelation}
            classList={classList}
            avatarPreview={avatarPreview}
            avatarRef={avatarRef}
            posterAvatarPreview={posterAvatarPreview}
            posterAvatarRef={posterAvatarRef}
            idCardPreview={idCardPreview}
            idCardRef={idCardRef}
            birthCertPreview={birthCertPreview}
            birthCertRef={birthCertRef}
            onAvatarChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setAvatarFile(f);
                setAvatarPreview(URL.createObjectURL(f));
              }
            }}
            onPosterAvatarChange={(e) => {
              const f = e.target.files?.[0];
              if (f && validatePosterAvatarFile(f)) {
                setPosterAvatarFile(f);
                setPosterAvatarPreview(URL.createObjectURL(f));
              }
            }}
            onIdCardChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setIdCardFile(f);
                setIdCardPreview(f.type.startsWith("image") ? URL.createObjectURL(f) : "");
              }
            }}
            onBirthCertChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setBirthCertFile(f);
                setBirthCertPreview(f.type.startsWith("image") ? URL.createObjectURL(f) : "");
              }
            }}
            idCardFile={idCardFile}
            birthCertFile={birthCertFile}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetStudent();
                setDialog(null);
              }}
            >
              انصراف
            </Button>
            <Button
              onClick={submitStudent}
              disabled={saving}
              className="gradient-primary text-primary-foreground gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  در حال ذخیره...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  ثبت قرآن‌آموز
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== دیالوگ ویرایش دانش‌آموز ==================== */}
      <Dialog open={dialog === "editStudent"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>ویرایش اطلاعات — {editStudent?.name}</DialogTitle>
          </DialogHeader>
          <StudentForm
            sName={sName}
            setSName={setSName}
            sStatus={sStatus}
            setSStatus={setSStatus}
            sNationalId={sNationalId}
            setSNationalId={setSNationalId}
            sBirthDate={sBirthDate}
            setSBirthDate={setSBirthDate}
            sPhone={sPhone}
            setSPhone={setSPhone}
            sAddress={sAddress}
            setSAddress={setSAddress}
            sClass={sClass}
            setSClass={setSClass}
            sLevel={sLevel}
            setSLevel={setSLevel}
            sNotes={sNotes}
            setSNotes={setSNotes}
            pName={pName}
            setPName={setPName}
            pPhone={pPhone}
            setPPhone={setPPhone}
            pNationalId={pNationalId}
            setPNationalId={setPNationalId}
            pRelation={pRelation}
            setPRelation={setPRelation}
            classList={classList}
            avatarPreview={avatarPreview}
            avatarRef={avatarRef}
            posterAvatarPreview={posterAvatarPreview}
            posterAvatarRef={posterAvatarRef}
            idCardPreview={idCardPreview}
            idCardRef={idCardRef}
            birthCertPreview={birthCertPreview}
            birthCertRef={birthCertRef}
            onAvatarChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setAvatarFile(f);
                setAvatarPreview(URL.createObjectURL(f));
              }
            }}
            onPosterAvatarChange={(e) => {
              const f = e.target.files?.[0];
              if (f && validatePosterAvatarFile(f)) {
                setPosterAvatarFile(f);
                setPosterAvatarPreview(URL.createObjectURL(f));
              }
            }}
            onIdCardChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setIdCardFile(f);
                setIdCardPreview(f.type.startsWith("image") ? URL.createObjectURL(f) : "");
              }
            }}
            onBirthCertChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setBirthCertFile(f);
                setBirthCertPreview(f.type.startsWith("image") ? URL.createObjectURL(f) : "");
              }
            }}
            idCardFile={idCardFile}
            birthCertFile={birthCertFile}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              انصراف
            </Button>
            <Button
              onClick={saveEditStudent}
              disabled={saving}
              className="gradient-primary text-primary-foreground gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  در حال ذخیره...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  ذخیره تغییرات
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== دیالوگ افزودن استاد ==================== */}
      <Dialog open={dialog === "teacher"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              افزودن استاد جدید
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <FileUploadBox
              label="عکس پرسنلی"
              preview={tAvatarPreview}
              inputRef={tAvatarRef}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setTAvatarFile(f);
                  setTAvatarPreview(URL.createObjectURL(f));
                }
              }}
              icon={<Camera className="h-6 w-6" />}
            />
            <Field label="نام *">
              <Input
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                placeholder="محمد حسینی"
              />
            </Field>
            <Field label="تخصص *">
              <Input
                placeholder="تجوید و قرائت"
                value={tSpecialty}
                onChange={(e) => setTSpecialty(e.target.value)}
              />
            </Field>
            <Field label="شماره تماس *">
              <Input value={tPhone} onChange={(e) => setTPhone(e.target.value)} dir="ltr" />
            </Field>
            <Field label="کد ملی">
              <Input
                value={tNationalId}
                onChange={(e) => setTNationalId(e.target.value)}
                placeholder="۰۰۱۲۳۴۵۶۷۸"
                dir="ltr"
              />
            </Field>
            <Field label="کد پرسنلی">
              <Input
                value={tPersonnelCode}
                onChange={(e) => setTPersonnelCode(e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label="تاریخ تولد">
              <Input
                value={tBirthDate}
                onChange={(e) => setTBirthDate(e.target.value)}
                placeholder="۱۳۶۵/۰۱/۰۱"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetTeacher();
                setDialog(null);
              }}
            >
              انصراف
            </Button>
            <Button
              onClick={submitTeacher}
              disabled={saving}
              className="gradient-primary text-primary-foreground gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              ثبت استاد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== دیالوگ ویرایش استاد ==================== */}
      <Dialog open={dialog === "editTeacher"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>ویرایش اطلاعات استاد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <FileUploadBox
              label="عکس پرسنلی"
              preview={tAvatarPreview}
              inputRef={tAvatarRef}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setTAvatarFile(f);
                  setTAvatarPreview(URL.createObjectURL(f));
                }
              }}
              icon={<Camera className="h-6 w-6" />}
            />
            <Field label="نام">
              <Input value={tName} onChange={(e) => setTName(e.target.value)} />
            </Field>
            <Field label="تخصص">
              <Input value={tSpecialty} onChange={(e) => setTSpecialty(e.target.value)} />
            </Field>
            <Field label="شماره تماس">
              <Input value={tPhone} onChange={(e) => setTPhone(e.target.value)} dir="ltr" />
            </Field>
            <Field label="کد ملی">
              <Input
                value={tNationalId}
                onChange={(e) => setTNationalId(e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label="کد پرسنلی">
              <Input
                value={tPersonnelCode}
                onChange={(e) => setTPersonnelCode(e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label="تاریخ تولد">
              <Input
                value={tBirthDate}
                onChange={(e) => setTBirthDate(e.target.value)}
                placeholder="۱۳۶۵/۰۱/۰۱"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              انصراف
            </Button>
            <Button
              onClick={saveEditTeacher}
              disabled={saving}
              className="gradient-primary text-primary-foreground gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== دیالوگ پروفایل استاد ==================== */}
      <Dialog open={!!viewTeacher} onOpenChange={(o) => !o && setViewTeacher(null)}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden" dir="rtl">
          {viewTeacher && (
            <div className="space-y-4 pb-5">
              <div className="relative gradient-gold px-6 pt-6 pb-8 overflow-hidden">
                <div className="absolute inset-0 bg-islamic-pattern opacity-20 pointer-events-none" />
                <div className="relative flex items-center justify-between gap-2 mb-4">
                  <DialogHeader className="p-0">
                    <DialogTitle className="text-foreground/80 text-xs font-normal flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      پروفایل استاد
                    </DialogTitle>
                  </DialogHeader>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1 h-7 text-xs bg-foreground/10 text-foreground border-0 hover:bg-foreground/20"
                    onClick={() => printTeacherProfile(viewTeacher)}
                  >
                    <Printer className="h-3 w-3" />
                    چاپ پروفایل
                  </Button>
                </div>
                <div className="relative flex items-center gap-4">
                  <ProfilePhoto
                    source={viewTeacher.avatar_url}
                    name={viewTeacher.name}
                    className="h-24 w-24 object-cover rounded-full ring-4 ring-card shadow-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xl text-foreground font-display truncate">
                      {viewTeacher.name}
                    </h3>
                    <Badge className="bg-foreground/10 text-foreground border-0 text-[11px] mt-1.5 gap-1">
                      <BookOpen className="h-3 w-3" />
                      {viewTeacher.specialty}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="px-6 space-y-3">
                <div className="grid grid-cols-1 gap-3 -mt-2">
                  <div className="rounded-xl border border-border bg-card p-3 text-center shadow-sm">
                    <p className="text-xl font-bold text-primary">{viewTeacher.classes}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                      <Users className="h-3 w-3" />
                      تعداد کلاس‌های فعال
                    </p>
                  </div>
                </div>
                <Section title="اطلاعات استاد" icon={<Hash className="h-3.5 w-3.5" />}>
                  <Row label="شماره تماس" value={viewTeacher.phone} />
                  <Row label="کد ملی" value={viewTeacher.national_id || "—"} />
                  <Row label="کد پرسنلی" value={viewTeacher.personnel_code || "—"} />
                  <Row label="تاریخ تولد" value={viewTeacher.birth_date || "—"} />
                  <Row label="تعداد کلاس‌ها" value={String(viewTeacher.classes)} />
                </Section>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== ارسال پیام ==================== */}
      <Dialog open={dialog === "message"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              ارسال پیام
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>گیرنده</Label>
              <Label>
                گیرنده{messageTargets.length > 1 ? `ها (${messageTargets.length} نفر)` : ""}
              </Label>
              <div className="flex flex-wrap gap-1">
                {messageTargets.map((id) => (
                  <Badge key={id} variant="outline">
                    {list.find((s) => s.id === id)?.name ?? "—"}
                  </Badge>
                ))}
                {messageTargets.length === 0 && <Badge variant="outline">—</Badge>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>متن پیام</Label>
              <Textarea
                rows={4}
                placeholder="پیام خود را بنویسید..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              انصراف
            </Button>
            <Button
              className="gradient-primary text-primary-foreground"
              onClick={sendMessage}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "ارسال پیام"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== عملیات گروهی ==================== */}
      <Dialog open={dialog === "bulkAction"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأیید عملیات گروهی</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">{selected.length} قرآن‌آموز انتخاب شده</p>
            {bulkAction === "transfer" && (
              <div className="space-y-1">
                <Label>انتقال به کلاس</Label>
                <Select value={bulkClass} onValueChange={setBulkClass}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کلاس" />
                  </SelectTrigger>
                  <SelectContent>
                    {classList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === "delete" && (
              <p className="text-sm text-destructive font-semibold">
                آیا از حذف {selected.length} قرآن‌آموز اطمینان دارید؟
              </p>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              انصراف
            </Button>
            <Button
              variant={bulkAction === "delete" ? "destructive" : "default"}
              className={bulkAction !== "delete" ? "gradient-primary text-primary-foreground" : ""}
              onClick={applyBulk}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأیید و اجرا"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== تأیید حذف ==================== */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأیید حذف</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            آیا از حذف «{deleteTarget?.name}» اطمینان دارید؟ این عمل برگشت‌پذیر نیست.
          </p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              انصراف
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "بله، حذف شود"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2.5 shadow-sm">
      <h4 className="font-semibold text-sm text-primary flex items-center gap-1.5 pb-1.5 border-b border-border/60">
        {icon}
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function TuitionBadge({ status }: { status: Student["tuition_status"] }) {
  if (status === "paid")
    return <Badge className="bg-success/15 text-success border-success/30">پرداخت شده</Badge>;
  if (status === "overdue")
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30">معوق</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">لغوشده</Badge>;
  if (status === "unbilled") return <Badge variant="outline">صورتحساب ندارد</Badge>;
  return (
    <Badge className="bg-warning/20 text-warning-foreground border-warning/40">در انتظار</Badge>
  );
}

