import { supabase } from "@/lib/supabase";
import { finiteMoney, isFinanceStatus, legacyInvoiceStatus } from "../domain/finance-domain";
import type {
  FinanceClass,
  FinanceStudent,
  FinanceTerm,
  FinanceWorkspaceSnapshot,
  IssueInvoicesResult,
  PaymentMethod,
  PaymentTransaction,
  PaymentTransactionRevision,
  TuitionDisplayStatus,
  TuitionInvoiceSummary,
  TuitionPlan,
} from "../domain/finance-types";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error ?? "خطای نامشخص");
}

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code ?? "") : "";
  const message = errorMessage(error).toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function isMissingColumn(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code ?? "") : "";
  const message = errorMessage(error).toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes(columnName.toLowerCase()) && message.includes("column"))
  );
}

function rowValue(row: object, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function normalizeStudent(row: object): FinanceStudent {
  return {
    id: String(rowValue(row, "id") ?? ""),
    name: String(rowValue(row, "name") ?? "بدون نام"),
    class_id: rowValue(row, "class_id") == null ? null : String(rowValue(row, "class_id")),
    status: rowValue(row, "status") == null ? null : String(rowValue(row, "status")),
  };
}

function normalizeClass(row: object): FinanceClass {
  return {
    id: String(rowValue(row, "id") ?? ""),
    name: String(rowValue(row, "name") ?? "بدون نام"),
  };
}

function normalizeTerm(row: object): FinanceTerm {
  return {
    id: String(rowValue(row, "id") ?? ""),
    title: String(rowValue(row, "title") ?? "بدون عنوان"),
    is_active: rowValue(row, "is_active") === true,
    starts_at: rowValue(row, "starts_at") == null ? null : String(rowValue(row, "starts_at")),
    ends_at: rowValue(row, "ends_at") == null ? null : String(rowValue(row, "ends_at")),
    created_at: rowValue(row, "created_at") == null ? null : String(rowValue(row, "created_at")),
  };
}

function normalizePlan(row: object, professional: boolean): TuitionPlan {
  return {
    id: String(rowValue(row, "id") ?? ""),
    term_id:
      professional && rowValue(row, "term_id") != null ? String(rowValue(row, "term_id")) : null,
    semester: String(rowValue(row, "semester") ?? "بدون عنوان"),
    amount: finiteMoney(rowValue(row, "amount")),
    due_date:
      professional && rowValue(row, "due_date") != null ? String(rowValue(row, "due_date")) : null,
    note: rowValue(row, "note") == null ? null : String(rowValue(row, "note")),
    created_at: rowValue(row, "created_at") == null ? null : String(rowValue(row, "created_at")),
  };
}

function normalizeProfessionalInvoice(row: object): TuitionInvoiceSummary {
  const statusValue = rowValue(row, "status");
  const status = isFinanceStatus(statusValue) ? statusValue : "pending";
  return {
    id: String(rowValue(row, "id") ?? ""),
    student_id: String(rowValue(row, "student_id") ?? ""),
    term_id: rowValue(row, "term_id") == null ? null : String(rowValue(row, "term_id")),
    tuition_plan_id:
      rowValue(row, "tuition_plan_id") == null ? null : String(rowValue(row, "tuition_plan_id")),
    semester: String(rowValue(row, "semester") ?? "بدون عنوان"),
    amount: finiteMoney(rowValue(row, "amount")),
    paid_amount: finiteMoney(rowValue(row, "paid_amount")),
    remaining_amount: finiteMoney(rowValue(row, "remaining_amount")),
    status,
    due_date: rowValue(row, "due_date") == null ? null : String(rowValue(row, "due_date")),
    issued_at: rowValue(row, "issued_at") == null ? null : String(rowValue(row, "issued_at")),
    latest_payment_at:
      rowValue(row, "latest_payment_at") == null
        ? null
        : String(rowValue(row, "latest_payment_at")),
    latest_receipt_url:
      rowValue(row, "latest_receipt_url") == null
        ? null
        : String(rowValue(row, "latest_receipt_url")),
    note: rowValue(row, "note") == null ? null : String(rowValue(row, "note")),
    cancelled_at:
      rowValue(row, "cancelled_at") == null ? null : String(rowValue(row, "cancelled_at")),
    cancel_reason:
      rowValue(row, "cancel_reason") == null ? null : String(rowValue(row, "cancel_reason")),
    created_at: rowValue(row, "created_at") == null ? null : String(rowValue(row, "created_at")),
  };
}

function normalizeLegacyInvoice(row: object): TuitionInvoiceSummary {
  const amount = finiteMoney(rowValue(row, "amount"));
  const storedStatus = rowValue(row, "status");
  const paid = finiteMoney(rowValue(row, "paid_amount") ?? (storedStatus === "paid" ? amount : 0));
  return {
    id: String(rowValue(row, "id") ?? ""),
    student_id: String(rowValue(row, "student_id") ?? ""),
    term_id: null,
    tuition_plan_id: null,
    semester: String(rowValue(row, "semester") ?? "بدون عنوان"),
    amount,
    paid_amount: paid,
    remaining_amount: Math.max(0, amount - paid),
    status: legacyInvoiceStatus(amount, paid, storedStatus),
    due_date: null,
    issued_at: rowValue(row, "created_at") == null ? null : String(rowValue(row, "created_at")),
    latest_payment_at: null,
    latest_receipt_url:
      rowValue(row, "receipt_url") == null ? null : String(rowValue(row, "receipt_url")),
    created_at: rowValue(row, "created_at") == null ? null : String(rowValue(row, "created_at")),
  };
}

export async function loadFinanceWorkspace(): Promise<FinanceWorkspaceSnapshot> {
  const [studentsResult, classesResult, termsResult] = await Promise.all([
    supabase.from("students").select("id, name, class_id, status").order("name").limit(10000),
    supabase.from("classes").select("id, name").order("name").limit(10000),
    supabase
      .from("najm_terms")
      .select("id, title, is_active, starts_at, ends_at, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (studentsResult.error) throw new Error(`قرآن‌آموزان: ${studentsResult.error.message}`);
  if (classesResult.error) throw new Error(`کلاس‌ها: ${classesResult.error.message}`);
  if (termsResult.error) throw new Error(`ترم‌های نجم: ${termsResult.error.message}`);

  const students = (studentsResult.data ?? []).map((row) => normalizeStudent(row));
  const classes = (classesResult.data ?? []).map((row) => normalizeClass(row));
  const terms = (termsResult.data ?? []).map((row) => normalizeTerm(row));

  const professionalInvoices = await supabase
    .from("tuition_invoice_summary")
    .select(
      "id, student_id, term_id, tuition_plan_id, semester, amount, paid_amount, remaining_amount, status, due_date, issued_at, latest_payment_at, latest_receipt_url, note, cancelled_at, cancel_reason, created_at",
    )
    .order("issued_at", { ascending: false })
    .limit(10000);

  if (!professionalInvoices.error) {
    const plansResult = await supabase
      .from("tuition_plans")
      .select("id, term_id, semester, amount, due_date, note, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (plansResult.error) throw new Error(`طرح‌های شهریه: ${plansResult.error.message}`);

    const stabilizationResult = await supabase
      .from("payment_transaction_revisions")
      .select("id")
      .limit(1);
    const stabilizationReady = !stabilizationResult.error;
    if (stabilizationResult.error && !isMissingRelation(stabilizationResult.error)) {
      throw new Error(`کنترل تثبیت مالی: ${stabilizationResult.error.message}`);
    }

    return {
      mode: "professional",
      stabilizationReady,
      students,
      classes,
      terms,
      plans: (plansResult.data ?? []).map((row) => normalizePlan(row, true)),
      invoices: (professionalInvoices.data ?? []).map((row) => normalizeProfessionalInvoice(row)),
      warning: null,
    };
  }

  if (!isMissingRelation(professionalInvoices.error)) {
    throw new Error(`صورتحساب‌ها: ${professionalInvoices.error.message}`);
  }

  const [legacyPayments, legacyPlans] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, student_id, semester, amount, paid_amount, date, status, receipt_url, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase
      .from("tuition_plans")
      .select("id, semester, amount, note, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  if (legacyPayments.error) throw new Error(`داده مالی قدیمی: ${legacyPayments.error.message}`);
  if (legacyPlans.error) throw new Error(`طرح شهریه قدیمی: ${legacyPlans.error.message}`);

  return {
    mode: "legacy",
    stabilizationReady: false,
    students,
    classes,
    terms,
    plans: (legacyPlans.data ?? []).map((row) => normalizePlan(row, false)),
    invoices: (legacyPayments.data ?? []).map((row) => normalizeLegacyInvoice(row)),
    warning:
      "مدل مالی جدید هنوز در Supabase فعال نشده است؛ اطلاعات قدیمی فقط‌خواندنی نمایش داده می‌شود و عملیات مالی غیرفعال است.",
  };
}

function normalizePaymentTransaction(row: object, receiptColumn: string): PaymentTransaction {
  return {
    id: String(rowValue(row, "id")),
    invoice_id: String(rowValue(row, "invoice_id")),
    amount: finiteMoney(rowValue(row, "amount")),
    paid_at: String(rowValue(row, "paid_at")),
    payment_method: String(rowValue(row, "payment_method") ?? "other") as PaymentMethod,
    receipt_path:
      rowValue(row, receiptColumn) == null ? null : String(rowValue(row, receiptColumn)),
    note: rowValue(row, "note") == null ? null : String(rowValue(row, "note")),
    created_at: String(rowValue(row, "created_at")),
  };
}

export async function loadInvoiceTransactions(
  invoiceId: string | number,
): Promise<PaymentTransaction[]> {
  const modernResult = await supabase
    .from("payment_transactions")
    .select("id, invoice_id, amount, paid_at, payment_method, receipt_path, note, created_at")
    .eq("invoice_id", invoiceId)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (!modernResult.error)
    return (modernResult.data ?? []).map((row) => normalizePaymentTransaction(row, "receipt_path"));
  if (!isMissingColumn(modernResult.error, "receipt_path"))
    throw new Error(modernResult.error.message);

  const legacyResult = await supabase
    .from("payment_transactions")
    .select("id, invoice_id, amount, paid_at, payment_method, receipt_url, note, created_at")
    .eq("invoice_id", invoiceId)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (legacyResult.error) throw new Error(legacyResult.error.message);
  return (legacyResult.data ?? []).map((row) => normalizePaymentTransaction(row, "receipt_url"));
}

export async function loadInvoicePaymentRevisions(
  invoiceId: string | number,
): Promise<PaymentTransactionRevision[]> {
  const { data, error } = await supabase
    .from("payment_transaction_revisions")
    .select("id, transaction_id, invoice_id, reason, old_data, new_data, edited_at, edited_by")
    .eq("invoice_id", invoiceId)
    .order("edited_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    transaction_id: String(row.transaction_id),
    invoice_id: String(row.invoice_id),
    reason: String(row.reason),
    old_data: (row.old_data ?? {}) as Record<string, unknown>,
    new_data: (row.new_data ?? {}) as Record<string, unknown>,
    edited_at: String(row.edited_at),
    edited_by: String(row.edited_by),
  }));
}

export async function upsertTuitionPlan(input: {
  termId: string;
  amount: number;
  dueDate: string | null;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("finance_upsert_tuition_plan", {
    p_term_id: input.termId,
    p_amount: input.amount,
    p_due_date: input.dueDate,
    p_note: input.note,
  });
  if (error) throw new Error(error.message);
}

export async function issueInvoices(
  planId: string,
  studentIds: Array<string | number> | null,
): Promise<IssueInvoicesResult> {
  const normalizedIds = studentIds?.map((id) => Number(id)).filter(Number.isFinite) ?? null;
  const { data, error } = await supabase.rpc("finance_issue_invoices", {
    p_plan_id: planId,
    p_student_ids: normalizedIds,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    requested: finiteMoney(result.requested),
    created: finiteMoney(result.created),
    existing: finiteMoney(result.existing),
    invalid_student_ids: finiteMoney(result.invalid_student_ids),
  };
}

export async function recordInvoicePayment(input: {
  invoiceId: string | number;
  amount: number;
  paidAt: string;
  paymentMethod: PaymentMethod;
  receiptPath: string | null;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("finance_record_payment", {
    p_invoice_id: Number(input.invoiceId),
    p_amount: input.amount,
    p_paid_at: input.paidAt,
    p_payment_method: input.paymentMethod,
    // نام پارامتر RPC برای سازگاری ۸B حفظ شده، اما مقدار یک path خصوصی است.
    p_receipt_url: input.receiptPath,
    p_note: input.note,
  });
  if (error) throw new Error(error.message);
}

export async function editInvoicePayment(input: {
  transactionId: string;
  amount: number;
  paidAt: string;
  paymentMethod: PaymentMethod;
  receiptPath: string | null;
  note: string | null;
  editReason: string;
}): Promise<void> {
  const { error } = await supabase.rpc("finance_edit_payment", {
    p_transaction_id: input.transactionId,
    p_amount: input.amount,
    p_paid_at: input.paidAt,
    p_payment_method: input.paymentMethod,
    p_receipt_path: input.receiptPath,
    p_note: input.note,
    p_edit_reason: input.editReason,
  });
  if (error) throw new Error(error.message);
}

export async function createFinanceReceiptSignedUrl(reference: string): Promise<string> {
  const trimmed = reference.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const { data, error } = await supabase.storage
    .from("finance-receipts")
    .createSignedUrl(trimmed, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "ساخت لینک رسید ناموفق بود");
  return data.signedUrl;
}

export async function resolveFinanceReceiptReferences(
  references: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(references.map((value) => String(value ?? "").trim()).filter(Boolean)),
  );
  const resolved = new Map<string, string>();
  await Promise.all(
    unique.map(async (reference) => {
      try {
        resolved.set(reference, await createFinanceReceiptSignedUrl(reference));
      } catch (error) {
        console.warn("finance receipt signing failed:", error);
      }
    }),
  );
  return resolved;
}

export async function cancelInvoice(invoiceId: string | number, reason: string): Promise<void> {
  const { error } = await supabase.rpc("finance_cancel_invoice", {
    p_invoice_id: Number(invoiceId),
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function deleteTuitionPlan(planId: string): Promise<void> {
  const { error } = await supabase.from("tuition_plans").delete().eq("id", planId);
  if (error) throw new Error(error.message);
}

export async function loadCurrentTuitionStatusMap(): Promise<Map<
  string,
  TuitionDisplayStatus
> | null> {
  const { data: activeTerm, error: termError } = await supabase
    .from("najm_terms")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  if (termError) throw new Error(termError.message);
  if (!activeTerm?.id) return new Map();

  const { data, error } = await supabase
    .from("tuition_invoice_summary")
    .select("student_id, status")
    .eq("term_id", activeTerm.id);
  if (error) {
    if (isMissingRelation(error)) return null;
    throw new Error(error.message);
  }

  const map = new Map<string, TuitionDisplayStatus>();
  for (const row of data ?? []) {
    const status = isFinanceStatus(row.status) ? row.status : "pending";
    map.set(String(row.student_id), status);
  }
  return map;
}
