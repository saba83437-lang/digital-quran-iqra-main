import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import {
  Wallet,
  TrendingUp,
  AlertCircle,
  Download,
  Filter,
  Loader2,
  Plus,
  Edit,
  Trash2,
  Save,
  Settings,
  Upload,
  FileImage,
  X,
  Sparkles,
  Receipt,
  History,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatToman } from "@/lib/mock-data";
import islamicBackground from "@/assets/reports/islamic-background.jpg";
import {
  cancelInvoice,
  createFinanceReceiptSignedUrl,
  deleteTuitionPlan,
  editInvoicePayment,
  issueInvoices,
  loadFinanceWorkspace,
  loadInvoicePaymentRevisions,
  loadInvoiceTransactions,
  recordInvoicePayment,
  upsertTuitionPlan,
} from "@/features/finance/api/finance-api";
import {
  datetimeLocalToIso,
  financeReceiptObjectPath,
  financeStatusLabel,
  paymentMethodLabel,
  toDatetimeLocalValue,
  validateFinanceReceiptFile,
  validatePaymentEditReason,
  validatePlanAmount,
  validateTransactionAmount,
} from "@/features/finance/domain/finance-domain";
import type {
  FinanceClass,
  FinanceSchemaMode,
  FinanceStudent,
  FinanceTerm,
  PaymentMethod,
  PaymentTransaction,
  PaymentTransactionRevision,
  TuitionInvoiceSummary,
  TuitionPlan,
} from "@/features/finance/domain/finance-types";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({
    meta: [
      { title: "شهریه و پرداخت — بِرّ الوالدین" },
      { name: "description", content: "مدیریت شهریه قرآن‌آموزان مرکز قرآن" },
    ],
  }),
  component: PaymentsPage,
});

const BUCKET = "finance-receipts";

interface UploadedReceipt {
  path: string;
}

function sameId(a: unknown, b: unknown): boolean {
  return a != null && b != null && String(a) === String(b);
}

async function uploadReceipt(invoiceId: string | number, file: File): Promise<UploadedReceipt> {
  const path = financeReceiptObjectPath(invoiceId, file.type, crypto.randomUUID());
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(error.message);
  return { path };
}

async function removeUploadedReceipt(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn("receipt cleanup failed:", error.message);
}

function displayFinanceDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(date);
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

// ==========================================
// EMBEDDED PHOTOGRAPHIC ASSETS (BASE64)
// ==========================================
const ISLAMIC_BG_URL = islamicBackground;

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function formatTomanFa(value: number | string): string {
  return toFa(formatToman(Number(value)));
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
          <p className="mt-2 font-display text-lg font-black text-[#2d2620] md:text-xl tracking-tight">
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

function FinanceStatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return (
      <Badge className="bg-success/15 text-success border-success/30 font-bold px-2 py-0.5 rounded-md">
        پرداخت شده
      </Badge>
    );
  if (status === "overdue")
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/30 font-bold px-2 py-0.5 rounded-md">
        معوق
      </Badge>
    );
  if (status === "cancelled")
    return (
      <Badge variant="secondary" className="font-bold px-2 py-0.5 rounded-md">
        لغوشده
      </Badge>
    );
  return (
    <Badge className="bg-warning/20 text-warning-foreground border-warning/40 font-bold px-2 py-0.5 rounded-md">
      در انتظار
    </Badge>
  );
}

function PaymentsPage() {
  const [mode, setMode] = useState<FinanceSchemaMode>("legacy");
  const [stabilizationReady, setStabilizationReady] = useState(false);
  const [invoices, setInvoices] = useState<TuitionInvoiceSummary[]>([]);
  const [students, setStudents] = useState<FinanceStudent[]>([]);
  const [classes, setClasses] = useState<FinanceClass[]>([]);
  const [terms, setTerms] = useState<FinanceTerm[]>([]);
  const [plans, setPlans] = useState<TuitionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);

  const [filterClass, setFilterClass] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  type DialogKind =
    | null
    | "invoice"
    | "transaction"
    | "editTransaction"
    | "history"
    | "plan"
    | "deletePlan"
    | "applyAll"
    | "cancelInvoice";
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<TuitionInvoiceSummary | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<PaymentTransaction | null>(null);
  const [editingPlan, setEditingPlan] = useState<TuitionPlan | null>(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState<TuitionPlan | null>(null);
  const [applyAllPlan, setApplyAllPlan] = useState<TuitionPlan | null>(null);

  const [invoiceStudentId, setInvoiceStudentId] = useState("");
  const [invoicePlanId, setInvoicePlanId] = useState("");

  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionPaidAt, setTransactionPaidAt] = useState(() => toDatetimeLocalValue());
  const [transactionMethod, setTransactionMethod] = useState<PaymentMethod>("bank_transfer");
  const [transactionNote, setTransactionNote] = useState("");
  const [transactionReceiptFile, setTransactionReceiptFile] = useState<File | null>(null);
  const [transactionReceiptPath, setTransactionReceiptPath] = useState<string | null>(null);
  const [transactionEditReason, setTransactionEditReason] = useState("");
  const receiptRef = useRef<HTMLInputElement | null>(null);

  const [historyRows, setHistoryRows] = useState<PaymentTransaction[]>([]);
  const [historyRevisions, setHistoryRevisions] = useState<PaymentTransactionRevision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [planTermId, setPlanTermId] = useState("");
  const [planAmount, setPlanAmount] = useState("");
  const [planDueDate, setPlanDueDate] = useState("");
  const [planNote, setPlanNote] = useState("");

  const [applyScope, setApplyScope] = useState<"active" | "custom">("active");
  const [applyStudentIds, setApplyStudentIds] = useState<string[]>([]);
  const [cancelReason, setCancelReason] = useState("");

  const professionalMode = mode === "professional";

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const snapshot = await loadFinanceWorkspace();
      setMode(snapshot.mode);
      setStabilizationReady(snapshot.stabilizationReady);
      setInvoices(snapshot.invoices);
      setStudents(snapshot.students);
      setClasses(snapshot.classes);
      setTerms(snapshot.terms);
      setPlans(snapshot.plans);
      setSchemaWarning(snapshot.warning);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "خطا در دریافت اطلاعات مالی");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const studentById = useMemo(
    () => new Map(students.map((student) => [String(student.id), student])),
    [students],
  );
  const getStudent = (id: unknown) => studentById.get(String(id));
  const getStudentName = (id: unknown) => getStudent(id)?.name ?? "—";
  const getStudentClassId = (id: unknown) => getStudent(id)?.class_id ?? "";

  const semesterOptions = useMemo(() => {
    const fromPlans = plans.map((plan) => plan.semester);
    const extras = Array.from(new Set(invoices.map((invoice) => invoice.semester))).filter(
      (semester) => !fromPlans.includes(semester),
    );
    return [...fromPlans, ...extras];
  }, [plans, invoices]);

  const filtered = useMemo(
    () =>
      invoices.filter((invoice) => {
        if (filterClass !== "all" && !sameId(getStudentClassId(invoice.student_id), filterClass))
          return false;
        if (filterSemester !== "all" && invoice.semester !== filterSemester) return false;
        if (filterStatus !== "all" && invoice.status !== filterStatus) return false;
        return true;
      }),
    [invoices, filterClass, filterSemester, filterStatus, studentById],
  );

  const openInvoices = invoices.filter((invoice) => invoice.status !== "cancelled");
  const paidList = openInvoices.filter((invoice) => invoice.status === "paid");
  const pendingList = openInvoices.filter((invoice) => invoice.status === "pending");
  const overdueList = openInvoices.filter((invoice) => invoice.status === "overdue");
  const total = openInvoices.reduce((sum, invoice) => sum + invoice.paid_amount, 0);
  const expected = openInvoices.reduce((sum, invoice) => sum + invoice.remaining_amount, 0);

  const studentPayments = selectedStudentId
    ? invoices.filter((invoice) => sameId(invoice.student_id, selectedStudentId))
    : [];
  const selectedStudentName = selectedStudentId ? getStudentName(selectedStudentId) : "";

  const ensureProfessional = (): boolean => {
    if (professionalMode) return true;
    toast.error("مدل مالی جدید هنوز در Supabase فعال نشده است؛ عملیات مالی فعلاً فقط‌خواندنی است.");
    return false;
  };

  const exportExcel = () => {
    const rows: unknown[][] = [
      [
        "نام قرآن‌آموز",
        "نیمسال",
        "مبلغ کل",
        "پرداخت‌شده",
        "باقی‌مانده",
        "تاریخ صدور",
        "سررسید",
        "وضعیت",
      ],
    ];
    filtered.forEach((invoice) => {
      rows.push([
        getStudentName(invoice.student_id),
        invoice.semester,
        invoice.amount,
        invoice.paid_amount,
        invoice.remaining_amount,
        displayFinanceDate(invoice.issued_at),
        invoice.due_date ?? "",
        financeStatusLabel(invoice.status),
      ]);
    });
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "tuition-invoices.csv";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const openAddInvoice = (studentId?: string) => {
    if (!ensureProfessional()) return;
    setInvoiceStudentId(studentId ?? "");
    setInvoicePlanId("");
    setDialog("invoice");
  };

  const saveInvoice = async () => {
    if (!invoiceStudentId || !invoicePlanId) {
      toast.error("قرآن‌آموز و طرح شهریه را انتخاب کنید");
      return;
    }
    setSaving(true);
    try {
      const result = await issueInvoices(invoicePlanId, [invoiceStudentId]);
      if (result.created === 0 && result.existing > 0)
        toast.info("برای این قرآن‌آموز در این ترم قبلاً صورتحساب صادر شده است");
      else toast.success("صورتحساب با موفقیت صادر شد ✅");
      setDialog(null);
      await loadData();
    } catch (error) {
      toast.error("خطا در صدور صورتحساب: " + (error instanceof Error ? error.message : error));
    } finally {
      setSaving(false);
    }
  };

  const resetTransactionForm = () => {
    setSelectedTransaction(null);
    setTransactionAmount("");
    setTransactionPaidAt(toDatetimeLocalValue());
    setTransactionMethod("bank_transfer");
    setTransactionNote("");
    setTransactionReceiptFile(null);
    setTransactionReceiptPath(null);
    setTransactionEditReason("");
  };

  const selectTransactionReceipt = (file: File | null) => {
    if (!file) {
      setTransactionReceiptFile(null);
      return;
    }
    const validationError = validateFinanceReceiptFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!stabilizationReady) {
      toast.error("Bucket خصوصی رسید هنوز فعال نشده است؛ فعلاً رسید انتخاب نکنید");
      return;
    }
    setTransactionReceiptFile(file);
  };

  const openReceipt = async (reference: string | null | undefined) => {
    if (!reference) return;
    try {
      const signedUrl = await createFinanceReceiptSignedUrl(reference);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error("مشاهده رسید ممکن نیست: " + (error instanceof Error ? error.message : error));
    }
  };

  const openTransaction = (invoice: TuitionInvoiceSummary) => {
    if (!ensureProfessional()) return;
    if (invoice.status === "paid" || invoice.status === "cancelled") {
      toast.error(
        invoice.status === "paid"
          ? "این صورتحساب تسویه شده است"
          : "صورتحساب لغوشده قابل پرداخت نیست",
      );
      return;
    }
    setSelectedInvoice(invoice);
    resetTransactionForm();
    setDialog("transaction");
  };

  const saveTransaction = async () => {
    if (!selectedInvoice) return;
    const validationError = validateTransactionAmount(
      transactionAmount,
      selectedInvoice.remaining_amount,
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const paidAt = datetimeLocalToIso(transactionPaidAt);
    if (!paidAt) {
      toast.error("تاریخ پرداخت معتبر نیست");
      return;
    }

    setSaving(true);
    let uploadedReceipt: UploadedReceipt | null = null;
    try {
      if (transactionReceiptFile)
        uploadedReceipt = await uploadReceipt(selectedInvoice.id, transactionReceiptFile);
      await recordInvoicePayment({
        invoiceId: selectedInvoice.id,
        amount: Number(transactionAmount),
        paidAt,
        paymentMethod: transactionMethod,
        receiptPath: uploadedReceipt?.path ?? null,
        note: transactionNote.trim() || null,
      });
      toast.success("قسط با موفقیت ثبت شد ✅");
      setDialog(null);
      setSelectedInvoice(null);
      resetTransactionForm();
      await loadData();
    } catch (error) {
      if (uploadedReceipt) await removeUploadedReceipt(uploadedReceipt.path);
      toast.error("خطا در ثبت قسط: " + (error instanceof Error ? error.message : error));
    } finally {
      setSaving(false);
    }
  };

  const openEditTransaction = (transaction: PaymentTransaction) => {
    if (!stabilizationReady || !selectedInvoice) {
      toast.error("ویرایش حسابرسی‌شده هنوز در دیتابیس فعال نشده است");
      return;
    }
    setSelectedTransaction(transaction);
    setTransactionAmount(String(transaction.amount));
    setTransactionPaidAt(toDatetimeLocalValue(new Date(transaction.paid_at)));
    setTransactionMethod(transaction.payment_method);
    setTransactionNote(transaction.note ?? "");
    setTransactionReceiptFile(null);
    setTransactionReceiptPath(transaction.receipt_path);
    setTransactionEditReason("");
    setDialog("editTransaction");
  };

  const saveEditedTransaction = async () => {
    if (!selectedInvoice || !selectedTransaction) return;
    const validationError = validateTransactionAmount(
      transactionAmount,
      selectedInvoice.remaining_amount + selectedTransaction.amount,
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const reasonError = validatePaymentEditReason(transactionEditReason);
    if (reasonError) {
      toast.error(reasonError);
      return;
    }
    const paidAt = datetimeLocalToIso(transactionPaidAt);
    if (!paidAt) {
      toast.error("تاریخ پرداخت معتبر نیست");
      return;
    }

    setSaving(true);
    let uploadedReceipt: UploadedReceipt | null = null;
    try {
      if (transactionReceiptFile)
        uploadedReceipt = await uploadReceipt(selectedInvoice.id, transactionReceiptFile);
      await editInvoicePayment({
        transactionId: selectedTransaction.id,
        amount: Number(transactionAmount),
        paidAt,
        paymentMethod: transactionMethod,
        receiptPath: uploadedReceipt?.path ?? transactionReceiptPath,
        note: transactionNote.trim() || null,
        editReason: transactionEditReason.trim(),
      });
      toast.success("قسط ویرایش شد و سابقه قبل/بعد در Audit ثبت شد ✅");
      setDialog(null);
      resetTransactionForm();
      await loadData();
      await openHistory(selectedInvoice);
    } catch (error) {
      if (uploadedReceipt) await removeUploadedReceipt(uploadedReceipt.path);
      toast.error("خطا در ویرایش قسط: " + (error instanceof Error ? error.message : error));
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (invoice: TuitionInvoiceSummary) => {
    if (!ensureProfessional()) return;
    setSelectedInvoice(invoice);
    setDialog("history");
    setHistoryRows([]);
    setHistoryRevisions([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const [transactions, revisions] = await Promise.all([
        loadInvoiceTransactions(invoice.id),
        stabilizationReady ? loadInvoicePaymentRevisions(invoice.id) : Promise.resolve([]),
      ]);
      setHistoryRows(transactions);
      setHistoryRevisions(revisions);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "خطا در دریافت اقساط");
    } finally {
      setHistoryLoading(false);
    }
  };

  const resetPlanForm = () => {
    setPlanTermId("");
    setPlanAmount("");
    setPlanDueDate("");
    setPlanNote("");
    setEditingPlan(null);
  };

  const openAddPlan = () => {
    if (!ensureProfessional()) return;
    resetPlanForm();
    const activeTerm = terms.find((term) => term.is_active);
    if (activeTerm) setPlanTermId(activeTerm.id);
    setDialog("plan");
  };

  const openEditPlan = (plan: TuitionPlan) => {
    if (!ensureProfessional()) return;
    setEditingPlan(plan);
    setPlanTermId(plan.term_id ?? "");
    setPlanAmount(String(plan.amount));
    setPlanDueDate(plan.due_date ?? "");
    setPlanNote(plan.note ?? "");
    setDialog("plan");
  };

  const savePlan = async () => {
    if (!planTermId || planAmount === "") {
      toast.error("ترم نجم و مبلغ را وارد کنید");
      return;
    }
    const validationError = validatePlanAmount(planAmount);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      await upsertTuitionPlan({
        termId: planTermId,
        amount: Number(planAmount),
        dueDate: planDueDate || null,
        note: planNote.trim() || null,
      });
      toast.success("طرح شهریه ذخیره شد ✅");
      setDialog(null);
      resetPlanForm();
      await loadData();
    } catch (error) {
      toast.error("خطا در ذخیره طرح: " + (error instanceof Error ? error.message : error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeletePlan = async () => {
    if (!deletePlanTarget) return;
    setSaving(true);
    try {
      await deleteTuitionPlan(deletePlanTarget.id);
      toast.success("طرح شهریه حذف شد");
      setDialog(null);
      setDeletePlanTarget(null);
      await loadData();
    } catch (error) {
      toast.error(
        "حذف طرح ممکن نیست: " +
          (error instanceof Error ? error.message : "احتمالاً برای این طرح صورتحساب صادر شده است"),
      );
    } finally {
      setSaving(false);
    }
  };

  const openApplyAll = (plan: TuitionPlan) => {
    if (!ensureProfessional()) return;
    setApplyAllPlan(plan);
    setApplyScope("active");
    setApplyStudentIds(
      students
        .filter((student) => (student.status ?? "active") === "active")
        .map((student) => String(student.id)),
    );
    setDialog("applyAll");
  };

  const toggleApplyStudent = (studentId: string) => {
    setApplyStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  };

  const confirmApplyAll = async () => {
    if (!applyAllPlan) return;
    if (applyScope === "custom" && applyStudentIds.length === 0) {
      toast.error("حداقل یک قرآن‌آموز را انتخاب کنید");
      return;
    }
    setSaving(true);
    try {
      const result = await issueInvoices(
        applyAllPlan.id,
        applyScope === "active" ? null : applyStudentIds,
      );
      toast.success(
        `${toFa(result.created)} صورتحساب صادر شد؛ ${toFa(result.existing)} مورد قبلاً وجود داشت ✅`,
      );
      if (result.invalid_student_ids)
        toast.warning(`${toFa(result.invalid_student_ids)} شناسه نامعتبر نادیده گرفته شد`);
      setDialog(null);
      setApplyAllPlan(null);
      await loadData();
    } catch (error) {
      toast.error("خطا در صدور گروهی: " + (error instanceof Error ? error.message : error));
    } finally {
      setSaving(false);
    }
  };

  const openCancelInvoice = (invoice: TuitionInvoiceSummary) => {
    if (!ensureProfessional()) return;
    setSelectedInvoice(invoice);
    setCancelReason("");
    setDialog("cancelInvoice");
  };

  const confirmCancelInvoice = async () => {
    if (!selectedInvoice || !cancelReason.trim()) {
      toast.error("علت لغو را وارد کنید");
      return;
    }
    setSaving(true);
    try {
      await cancelInvoice(selectedInvoice.id, cancelReason.trim());
      toast.success("صورتحساب با حفظ سابقه لغو شد");
      setDialog(null);
      setSelectedInvoice(null);
      await loadData();
    } catch (error) {
      toast.error("لغو صورتحساب ممکن نیست: " + (error instanceof Error ? error.message : error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        در حال دریافت اطلاعات مالی...
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="rounded-3xl p-10 text-center" dir="rtl">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 text-sm">{loadError}</p>
        <Button className="mt-4" onClick={() => void loadData()}>
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  return (
    <>
      <style>{dashboardStyles}</style>
      <div className="quran-admin-dashboard space-y-6" dir="rtl">
        <section
          className="quran-admin-hero relative overflow-hidden rounded-[2.25rem] text-white shadow-2xl transition-all duration-300 p-8"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(15, 45, 20, 0.97) 0%, rgba(25, 65, 35, 0.95) 50%, rgba(40, 95, 55, 0.97) 100%), url('" +
              ISLAMIC_BG_URL +
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
                شهریه و پرداخت‌ها
              </h1>
              <p className="mt-2 text-sm text-amber-50/90 font-quran text-lg">
                «وَقُلْ رَبِّ زِدْنِي عِلْمًا» — مدیریت صورتحساب‌ها، اقساط و گزارش مالی مرکز
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                disabled={!professionalMode}
                className="rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 text-white font-bold gap-2"
                onClick={openAddPlan}
              >
                <Settings className="h-4 w-4" />
                تعریف شهریه ترم
              </Button>
              <Button
                disabled={!professionalMode || plans.length === 0}
                className="rounded-xl bg-[#5d6d45] text-white hover:bg-[#4a5839] border border-[#5d6d45]/20 shadow-md gap-2 font-bold"
                onClick={() => openAddInvoice()}
              >
                <Plus className="h-4 w-4" />
                صدور صورتحساب
              </Button>
              <Button
                variant="outline"
                className="rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 text-white font-bold gap-2"
                onClick={exportExcel}
              >
                <Download className="h-4 w-4" />
                خروجی اکسل
              </Button>
            </div>
          </div>
        </section>

        {schemaWarning && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {schemaWarning}
          </div>
        )}
        {professionalMode && !stabilizationReady && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            مرحله تثبیت ۸C هنوز در Supabase فعال نشده است؛ ثبت قسط بدون رسید کار می‌کند، اما ویرایش
            حسابرسی‌شده و رسید خصوصی موقتاً غیرفعال‌اند.
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PrimaryStatCard
            label="مجموع وصولی"
            value={formatTomanFa(total)}
            hint="وصول‌شده"
            icon={<Wallet className="h-6 w-6" />}
            tone="turquoise"
            onClick={() => {}}
          />
          <PrimaryStatCard
            label="صورتحساب‌های تسویه"
            value={toFa(paidList.length)}
            hint="پرداخت شده"
            icon={<TrendingUp className="h-6 w-6" />}
            tone="lapis"
            onClick={() => {}}
          />
          <PrimaryStatCard
            label="در انتظار"
            value={toFa(pendingList.length)}
            hint="قبل از سررسید یا بدون سررسید"
            icon={<Wallet className="h-6 w-6" />}
            tone="gold"
            onClick={() => {}}
          />
          <PrimaryStatCard
            label={`مانده کل (${toFa(overdueList.length)} معوق)`}
            value={formatTomanFa(expected)}
            hint="نیازمند پیگیری"
            icon={<AlertCircle className="h-6 w-6" />}
            tone="ruby"
            onClick={() => {}}
          />
        </section>

        <Card className="quran-panel rounded-[2rem] p-0 overflow-hidden relative">
          <PanelHeading
            eyebrow="تعرفه‌های آموزشی"
            title="مبالغ تعریف‌شده شهریه (به تفکیک ترم)"
            icon={<Settings className="h-5 w-5" />}
            action={
              <Button
                size="sm"
                variant="outline"
                disabled={!professionalMode}
                className="gap-1 h-8 text-xs font-bold quran-soft-clay-card rounded-lg relative z-10"
                onClick={openAddPlan}
              >
                <Plus className="h-3 w-3" />
                افزودن ترم جدید
              </Button>
            }
          />
          <div className="p-5">
            {plans.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                هنوز مبلغی برای هیچ ترمی تعریف نشده است.
              </p>
            ) : (
              <div className="space-y-3">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 quran-soft-clay-card flex-wrap"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#2d2620]">{plan.semester}</span>
                      <Badge
                        variant="secondary"
                        className="font-bold text-xs bg-[#5d6d45]/10 text-[#4a5839] border border-[#5d6d45]/15"
                      >
                        {formatTomanFa(plan.amount)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        سررسید: {plan.due_date ? displayFinanceDate(plan.due_date) : "تعیین نشده"}
                      </span>
                      {plan.note && (
                        <span className="text-xs text-muted-foreground">({plan.note})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        disabled={!professionalMode}
                        className="h-8 text-xs font-bold gradient-primary text-primary-foreground gap-1 rounded-lg"
                        onClick={() => openApplyAll(plan)}
                      >
                        صدور گروهی صورتحساب
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!professionalMode}
                        className="h-8 w-8 p-0 rounded-lg hover:bg-[#5d6d45]/10"
                        title="ویرایش طرح"
                        onClick={() => openEditPlan(plan)}
                      >
                        <Edit className="h-3.5 w-3.5 text-[#4a5839]" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!professionalMode}
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-lg"
                        title="حذف طرح"
                        onClick={() => {
                          setDeletePlanTarget(plan);
                          setDialog("deletePlan");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="quran-panel rounded-[2rem] p-4 relative overflow-hidden">
          <GildedIslamicLacePattern />
          <div className="relative z-10 flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="همه کلاس‌ها" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">همه کلاس‌ها</SelectItem>
                {classes.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterSemester} onValueChange={setFilterSemester}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="همه ترم‌ها" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">همه ترم‌ها</SelectItem>
                {semesterOptions.map((semester) => (
                  <SelectItem key={semester} value={semester}>
                    {semester}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="همه وضعیت‌ها" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="paid">پرداخت شده</SelectItem>
                <SelectItem value="pending">در انتظار</SelectItem>
                <SelectItem value="overdue">معوق</SelectItem>
                <SelectItem value="cancelled">لغوشده</SelectItem>
              </SelectContent>
            </Select>
            <Badge
              variant="outline"
              className="mr-auto text-xs font-bold border-[#5d6d45]/30 text-[#4a5839] bg-[#5d6d45]/5"
            >
              {toFa(filtered.length)} صورتحساب
            </Badge>
          </div>
        </Card>

        <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
          <PanelHeading
            eyebrow="امور مالی دارالقرآن"
            title="فهرست صورتحساب‌ها و اقساط"
            icon={<Wallet className="h-5 w-5" />}
          />
          <div className="p-5">
            <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50 font-black">
                    <TableHead className="w-10">ردیف</TableHead>
                    <TableHead>قرآن‌آموز</TableHead>
                    <TableHead>نیمسال</TableHead>
                    <TableHead>مبلغ کل</TableHead>
                    <TableHead>پرداخت‌شده</TableHead>
                    <TableHead>باقی‌مانده</TableHead>
                    <TableHead>آخرین فعالیت</TableHead>
                    <TableHead>رسید</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((invoice, index) => (
                    <TableRow key={String(invoice.id)}>
                      <TableCell className="text-sm text-muted-foreground">
                        {toFa(index + 1)}
                      </TableCell>
                      <TableCell
                        className="font-medium cursor-pointer text-primary hover:underline"
                        onClick={() => setSelectedStudentId(String(invoice.student_id))}
                      >
                        {getStudentName(invoice.student_id)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {invoice.semester}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatTomanFa(invoice.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-success font-semibold">
                        {formatTomanFa(invoice.paid_amount)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {invoice.remaining_amount > 0 ? (
                          <span className="text-destructive font-semibold">
                            {formatTomanFa(invoice.remaining_amount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {displayFinanceDate(invoice.latest_payment_at ?? invoice.issued_at)}
                      </TableCell>
                      <TableCell>
                        {invoice.latest_receipt_url ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[#4a5839] font-bold text-xs gap-1"
                            onClick={() => void openReceipt(invoice.latest_receipt_url)}
                          >
                            <FileImage className="h-3.5 w-3.5 text-[#cfa864]" />
                            مشاهده
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <FinanceStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={
                              !professionalMode ||
                              invoice.status === "paid" ||
                              invoice.status === "cancelled"
                            }
                            className="h-7 w-7 p-0 rounded-lg hover:bg-[#5d6d45]/10 text-muted-foreground"
                            title="ثبت قسط"
                            onClick={() => openTransaction(invoice)}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!professionalMode}
                            className="h-7 w-7 p-0 rounded-lg hover:bg-[#5d6d45]/10 text-muted-foreground"
                            title="تاریخچه اقساط"
                            onClick={() => void openHistory(invoice)}
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!professionalMode || invoice.status === "cancelled"}
                            className="h-7 w-7 p-0 text-destructive rounded-lg hover:bg-destructive/10"
                            title="لغو با حفظ سابقه"
                            onClick={() => openCancelInvoice(invoice)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="text-center py-8 text-muted-foreground font-semibold"
                      >
                        صورتحسابی یافت نشد
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>

        <Dialog
          open={!!selectedStudentId}
          onOpenChange={(open) => !open && setSelectedStudentId(null)}
        >
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>گزارش مالی — {selectedStudentName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2 max-h-[55vh] overflow-y-auto">
              {studentPayments.map((invoice) => (
                <div
                  key={String(invoice.id)}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-[#efebd9]/40 text-sm border border-black/[0.02] gap-3"
                >
                  <div>
                    <p className="font-semibold text-[#2d2620]">{invoice.semester}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      صدور: {displayFinanceDate(invoice.issued_at)}
                    </p>
                    {invoice.remaining_amount > 0 && (
                      <p className="text-xs text-destructive font-semibold">
                        باقی‌مانده: {formatTomanFa(invoice.remaining_amount)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">
                      {formatTomanFa(invoice.paid_amount)} / {formatTomanFa(invoice.amount)}
                    </span>
                    <FinanceStatusBadge status={invoice.status} />
                  </div>
                </div>
              ))}
              {studentPayments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">صورتحسابی یافت نشد</p>
              )}
            </div>
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setSelectedStudentId(null)}
              >
                بستن
              </Button>
              <Button
                disabled={!professionalMode || plans.length === 0}
                className="gradient-primary text-primary-foreground gap-2 rounded-xl"
                onClick={() => {
                  const id = selectedStudentId ?? "";
                  setSelectedStudentId(null);
                  openAddInvoice(id);
                }}
              >
                <Plus className="h-4 w-4" />
                صدور صورتحساب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialog === "invoice"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>صدور صورتحساب جدید</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">قرآن‌آموز *</Label>
                <Select value={invoiceStudentId} onValueChange={setInvoiceStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب قرآن‌آموز" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {students.map((student) => (
                      <SelectItem key={student.id} value={String(student.id)}>
                        {student.name}
                        {(student.status ?? "active") !== "active" ? " — غیرفعال" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">طرح شهریه *</Label>
                <Select value={invoicePlanId} onValueChange={setInvoicePlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب ترم" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.semester} — {formatTomanFa(plan.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                مبلغ و سررسید هنگام صدور ثابت می‌شوند و تغییر بعدی طرح، این صورتحساب را تغییر
                نمی‌دهد.
              </p>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                انصراف
              </Button>
              <Button onClick={() => void saveInvoice()} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                صدور
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialog === "transaction"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                ثبت قسط — {selectedInvoice ? getStudentName(selectedInvoice.student_id) : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {selectedInvoice && (
                <div className="rounded-xl bg-secondary/40 p-3 text-xs">
                  <p className="font-bold">{selectedInvoice.semester}</p>
                  <p className="mt-1">
                    مانده قابل پرداخت: {formatTomanFa(selectedInvoice.remaining_amount)}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">مبلغ قسط (تومان) *</Label>
                <Input
                  type="number"
                  min="1"
                  max={selectedInvoice?.remaining_amount}
                  value={transactionAmount}
                  onChange={(event) => setTransactionAmount(event.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">تاریخ و ساعت پرداخت *</Label>
                <Input
                  type="datetime-local"
                  value={transactionPaidAt}
                  onChange={(event) => setTransactionPaidAt(event.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">روش پرداخت</Label>
                <Select
                  value={transactionMethod}
                  onValueChange={(value) => setTransactionMethod(value as PaymentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدی</SelectItem>
                    <SelectItem value="card">کارت‌خوان</SelectItem>
                    <SelectItem value="bank_transfer">واریز بانکی</SelectItem>
                    <SelectItem value="online">آنلاین</SelectItem>
                    <SelectItem value="other">سایر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">توضیح (اختیاری)</Label>
                <Input
                  value={transactionNote}
                  onChange={(event) => setTransactionNote(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">رسید مستقل این قسط</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={!stabilizationReady}
                  onClick={() => receiptRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {transactionReceiptFile
                    ? transactionReceiptFile.name
                    : stabilizationReady
                      ? "انتخاب فایل رسید خصوصی"
                      : "پس از فعال‌شدن مرحله ۸C"}
                </Button>
                {transactionReceiptFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setTransactionReceiptFile(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                    حذف انتخاب
                  </Button>
                )}
                <input
                  ref={receiptRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(event) => {
                    selectTransactionReceipt(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                انصراف
              </Button>
              <Button onClick={() => void saveTransaction()} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                ثبت قسط
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={dialog === "editTransaction"}
          onOpenChange={(open) => !open && setDialog(null)}
        >
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>ویرایش حسابرسی‌شده قسط</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {selectedInvoice && selectedTransaction && (
                <div className="rounded-xl bg-secondary/40 p-3 text-xs">
                  <p className="font-bold">{selectedInvoice.semester}</p>
                  <p className="mt-1">
                    بیشترین مبلغ مجاز برای این قسط:{" "}
                    {formatTomanFa(selectedInvoice.remaining_amount + selectedTransaction.amount)}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">مبلغ قسط (تومان) *</Label>
                <Input
                  type="number"
                  min="1"
                  max={
                    selectedInvoice && selectedTransaction
                      ? selectedInvoice.remaining_amount + selectedTransaction.amount
                      : undefined
                  }
                  value={transactionAmount}
                  onChange={(event) => setTransactionAmount(event.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">تاریخ و ساعت پرداخت *</Label>
                <Input
                  type="datetime-local"
                  value={transactionPaidAt}
                  onChange={(event) => setTransactionPaidAt(event.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">روش پرداخت</Label>
                <Select
                  value={transactionMethod}
                  onValueChange={(value) => setTransactionMethod(value as PaymentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدی</SelectItem>
                    <SelectItem value="card">کارت‌خوان</SelectItem>
                    <SelectItem value="bank_transfer">واریز بانکی</SelectItem>
                    <SelectItem value="online">آنلاین</SelectItem>
                    <SelectItem value="other">سایر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">توضیح</Label>
                <Input
                  value={transactionNote}
                  onChange={(event) => setTransactionNote(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">رسید خصوصی</Label>
                {transactionReceiptPath && !transactionReceiptFile && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => void openReceipt(transactionReceiptPath)}
                    >
                      مشاهده رسید فعلی
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setTransactionReceiptPath(null)}
                    >
                      حذف اتصال
                    </Button>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => receiptRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {transactionReceiptFile ? transactionReceiptFile.name : "انتخاب رسید جایگزین"}
                </Button>
                {transactionReceiptFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setTransactionReceiptFile(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                    حذف انتخاب جدید
                  </Button>
                )}
                <input
                  ref={receiptRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(event) => {
                    selectTransactionReceipt(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">علت ویرایش *</Label>
                <Input
                  value={transactionEditReason}
                  onChange={(event) => setTransactionEditReason(event.target.value)}
                  placeholder="مثلاً اصلاح مبلغ واردشده"
                />
                <p className="text-[11px] text-muted-foreground">
                  مقدار قبل و بعد به‌صورت دائمی در Audit ثبت می‌شود.
                </p>
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setDialog("history")}>
                انصراف
              </Button>
              <Button onClick={() => void saveEditedTransaction()} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                ذخیره و ثبت Audit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialog === "history"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>تاریخچه اقساط — {selectedInvoice?.semester}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2 max-h-[55vh] overflow-y-auto">
              {historyLoading && (
                <div className="flex justify-center p-6">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
              {historyError && <p className="text-sm text-destructive">{historyError}</p>}
              {!historyLoading &&
                !historyError &&
                historyRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-xl border p-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-bold text-sm">{formatTomanFa(row.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {displayFinanceDate(row.paid_at)} — {paymentMethodLabel(row.payment_method)}
                      </p>
                      {row.note && <p className="text-xs mt-1">{row.note}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {row.receipt_path ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs font-bold text-primary"
                          onClick={() => void openReceipt(row.receipt_path)}
                        >
                          مشاهده رسید
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground px-2">بدون رسید</span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!stabilizationReady}
                        className="h-8 text-xs gap-1"
                        onClick={() => openEditTransaction(row)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        ویرایش
                      </Button>
                    </div>
                  </div>
                ))}
              {!historyLoading && !historyError && historyRows.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">
                  هنوز قسطی ثبت نشده است.
                </p>
              )}
              {!historyLoading && !historyError && historyRevisions.length > 0 && (
                <div className="mt-4 border-t pt-3 space-y-2">
                  <p className="text-sm font-black">سوابق ویرایش حسابرسی‌شده</p>
                  {historyRevisions.map((revision) => (
                    <div
                      key={String(revision.id)}
                      className="rounded-xl bg-secondary/40 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{revision.reason}</span>
                        <span className="text-muted-foreground">
                          {displayFinanceDate(revision.edited_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        مبلغ: {formatTomanFa(Number(revision.old_data.amount ?? 0))} ←{" "}
                        {formatTomanFa(Number(revision.new_data.amount ?? 0))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>
                بستن
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialog === "plan"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editingPlan ? "ویرایش طرح شهریه" : "تعریف شهریه ترم جدید"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">ترم نجم *</Label>
                <Select value={planTermId} onValueChange={setPlanTermId} disabled={!!editingPlan}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب ترم" />
                  </SelectTrigger>
                  <SelectContent>
                    {terms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.title}
                        {term.is_active ? " — فعال" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">مبلغ شهریه (تومان) *</Label>
                <Input
                  type="number"
                  min="0"
                  value={planAmount}
                  onChange={(event) => setPlanAmount(event.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">سررسید (اختیاری)</Label>
                <Input
                  type="date"
                  value={planDueDate}
                  onChange={(event) => setPlanDueDate(event.target.value)}
                  dir="ltr"
                />
                <p className="text-[11px] text-muted-foreground">
                  اگر خالی باشد، صورتحساب دارای مانده «در انتظار» می‌ماند.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">توضیح (اختیاری)</Label>
                <Input
                  value={planNote}
                  onChange={(event) => setPlanNote(event.target.value)}
                  placeholder="مثلاً شامل کتاب و آزمون"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                تغییر مبلغ طرح فقط روی صورتحساب‌هایی اثر دارد که بعداً صادر شوند.
              </p>
            </div>
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  resetPlanForm();
                  setDialog(null);
                }}
              >
                انصراف
              </Button>
              <Button onClick={() => void savePlan()} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                ذخیره
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialog === "applyAll"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>صدور گروهی صورتحساب</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                طرح «{applyAllPlan?.semester}» با مبلغ{" "}
                {applyAllPlan ? formatTomanFa(applyAllPlan.amount) : "—"}. صورتحساب‌های موجود دوباره
                ساخته یا تغییر داده نمی‌شوند.
              </p>
              <Select
                value={applyScope}
                onValueChange={(value) => setApplyScope(value as "active" | "custom")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">همه قرآن‌آموزان فعال</SelectItem>
                  <SelectItem value="custom">انتخاب دستی و استثناها</SelectItem>
                </SelectContent>
              </Select>
              {applyScope === "custom" && (
                <div className="max-h-64 overflow-y-auto rounded-xl border p-2 space-y-1">
                  {students.map((student) => {
                    const id = String(student.id);
                    return (
                      <label
                        key={id}
                        className="flex items-center gap-2 rounded-lg p-2 hover:bg-secondary/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={applyStudentIds.includes(id)}
                          onChange={() => toggleApplyStudent(id)}
                        />
                        <span className="text-sm">{student.name}</span>
                        <span className="mr-auto text-xs text-muted-foreground">
                          {(student.status ?? "active") === "active" ? "فعال" : "غیرفعال"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                تعداد هدف:{" "}
                {toFa(
                  applyScope === "active"
                    ? students.filter((student) => (student.status ?? "active") === "active").length
                    : applyStudentIds.length,
                )}
              </p>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                انصراف
              </Button>
              <Button onClick={() => void confirmApplyAll()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأیید و صدور اتمی"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialog === "cancelInvoice"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>لغو صورتحساب با حفظ سابقه</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <p className="text-sm text-muted-foreground">
                صورتحساب حذف نمی‌شود و فقط از مطالبات جاری کنار گذاشته خواهد شد. صورتحساب دارای قسط،
                بدون فرایند برگشت وجه قابل لغو نیست.
              </p>
              <Label>علت لغو *</Label>
              <Input
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="علت لغو را بنویسید"
              />
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                انصراف
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmCancelInvoice()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "لغو صورتحساب"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialog === "deletePlan"} onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>تأیید حذف طرح شهریه</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              اگر برای این طرح صورتحساب صادر شده باشد، دیتابیس از حذف آن جلوگیری می‌کند.
            </p>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                انصراف
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmDeletePlan()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "بله، حذف شود"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
