import type { NajmTermRow, PaymentRow, TuitionPlanRow } from "./report-types.js";

const ARABIC_YEH = /ي/g;
const ARABIC_KAF = /ك/g;

export function normalizeSemesterTitle(value: unknown): string {
  return String(value ?? "")
    .replace(ARABIC_YEH, "ی")
    .replace(ARABIC_KAF, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fa-IR");
}

export function resolveActiveTuitionPlan(
  activeTerm: NajmTermRow | null,
  plans: TuitionPlanRow[],
): TuitionPlanRow | null {
  const activeTitle = normalizeSemesterTitle(activeTerm?.title);
  if (!activeTitle) return null;
  return plans.find((plan) => normalizeSemesterTitle(plan.semester) === activeTitle) ?? null;
}

export function activeSemesterPayments(
  activeTerm: NajmTermRow | null,
  plan: TuitionPlanRow | null,
  payments: PaymentRow[],
): PaymentRow[] {
  if (!activeTerm || !plan) return [];
  const title = normalizeSemesterTitle(plan.semester);
  return payments.filter(
    (payment) =>
      payment.status !== "cancelled" && normalizeSemesterTitle(payment.semester) === title,
  );
}

export function paidAmount(payment: PaymentRow): number {
  if (payment.status === "cancelled") return 0;
  return Number(payment.paid_amount ?? (payment.status === "paid" ? (payment.amount ?? 0) : 0));
}
