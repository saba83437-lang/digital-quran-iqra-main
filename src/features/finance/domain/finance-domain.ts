import type {
  FinanceStatus,
  PaymentMethod,
  TuitionDisplayStatus,
  TuitionInvoiceSummary,
} from "./finance-types";

export function finiteMoney(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function nonnegativeMoney(value: unknown): number {
  return Math.max(0, finiteMoney(value));
}

export function invoiceRemaining(invoice: Pick<TuitionInvoiceSummary, "remaining_amount">): number {
  return nonnegativeMoney(invoice.remaining_amount);
}

export function financeStatusLabel(
  status: TuitionDisplayStatus | string | null | undefined,
): string {
  if (status === "paid") return "پرداخت شده";
  if (status === "overdue") return "معوق";
  if (status === "cancelled") return "لغوشده";
  if (status === "unbilled") return "صورتحساب ندارد";
  return "در انتظار";
}

export function paymentMethodLabel(method: PaymentMethod | string): string {
  if (method === "cash") return "نقدی";
  if (method === "card") return "کارت‌خوان";
  if (method === "bank_transfer") return "واریز بانکی";
  if (method === "online") return "آنلاین";
  return "سایر";
}

export function isFinanceStatus(value: unknown): value is FinanceStatus {
  return value === "paid" || value === "pending" || value === "overdue" || value === "cancelled";
}

export function legacyInvoiceStatus(
  amount: unknown,
  paidAmount: unknown,
  storedStatus: unknown,
): FinanceStatus {
  if (storedStatus === "cancelled") return "cancelled";
  const total = nonnegativeMoney(amount);
  const paid = nonnegativeMoney(paidAmount);
  if (total <= 0 || paid >= total || storedStatus === "paid") return "paid";
  if (storedStatus === "overdue") return "overdue";
  return "pending";
}

export function toDatetimeLocalValue(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function validateTransactionAmount(amount: unknown, remaining: unknown): string | null {
  const parsedAmount = finiteMoney(amount);
  const parsedRemaining = nonnegativeMoney(remaining);
  if (!Number.isInteger(parsedAmount)) return "مبلغ قسط باید عدد صحیح تومان باشد";
  if (parsedAmount <= 0) return "مبلغ قسط باید بیشتر از صفر باشد";
  if (parsedAmount > parsedRemaining) return "مبلغ قسط از مانده صورتحساب بیشتر است";
  return null;
}

export function validatePlanAmount(amount: unknown): string | null {
  const parsed = finiteMoney(amount);
  if (!Number.isInteger(parsed)) return "مبلغ شهریه باید عدد صحیح تومان باشد";
  if (parsed < 0) return "مبلغ شهریه نمی‌تواند منفی باشد";
  return null;
}

export const FINANCE_RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const FINANCE_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export function validateFinanceReceiptFile(file: { size: number; type: string }): string | null {
  if (
    !FINANCE_RECEIPT_MIME_TYPES.includes(file.type as (typeof FINANCE_RECEIPT_MIME_TYPES)[number])
  )
    return "فرمت رسید باید JPG، PNG، WebP یا PDF باشد";
  if (file.size <= 0) return "فایل رسید خالی است";
  if (file.size > FINANCE_RECEIPT_MAX_BYTES) return "حجم رسید نباید بیشتر از ۵ مگابایت باشد";
  return null;
}

export function financeReceiptObjectPath(
  invoiceId: string | number,
  mimeType: string,
  uniqueToken: string,
): string {
  const normalizedInvoiceId = String(invoiceId).trim();
  if (!/^\d+$/.test(normalizedInvoiceId)) throw new Error("شناسه صورتحساب معتبر نیست");
  const extension =
    mimeType === "application/pdf"
      ? "pdf"
      : mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";
  const safeToken = uniqueToken.replace(/[^a-zA-Z0-9-]/g, "");
  if (!safeToken) throw new Error("شناسه فایل رسید معتبر نیست");
  return `${normalizedInvoiceId}/${safeToken}.${extension}`;
}

export function isHttpReceiptReference(value: string | null | undefined): boolean {
  return /^https?:\/\//i.test(String(value ?? "").trim());
}

export function validatePaymentEditReason(value: string): string | null {
  const reason = value.trim();
  if (!reason) return "علت ویرایش قسط الزامی است";
  if (reason.length < 3) return "علت ویرایش را کمی کامل‌تر بنویسید";
  return null;
}
