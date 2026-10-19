export type FinanceEntityId = string | number;
export type FinanceStatus = "paid" | "pending" | "overdue" | "cancelled";
export type TuitionDisplayStatus = FinanceStatus | "unbilled";
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "online" | "other";
export type FinanceSchemaMode = "professional" | "legacy";

export interface FinanceStudent {
  id: FinanceEntityId;
  name: string;
  class_id: FinanceEntityId | null;
  status: string | null;
}

export interface FinanceClass {
  id: FinanceEntityId;
  name: string;
}

export interface FinanceTerm {
  id: string;
  title: string;
  is_active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string | null;
}

export interface TuitionPlan {
  id: string;
  term_id: string | null;
  semester: string;
  amount: number;
  due_date: string | null;
  note: string | null;
  created_at?: string | null;
}

export interface TuitionInvoiceSummary {
  id: FinanceEntityId;
  student_id: FinanceEntityId;
  term_id: string | null;
  tuition_plan_id: string | null;
  semester: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: FinanceStatus;
  due_date: string | null;
  issued_at: string | null;
  latest_payment_at: string | null;
  latest_receipt_url: string | null;
  note?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  created_at?: string | null;
}

export interface PaymentTransaction {
  id: string;
  invoice_id: FinanceEntityId;
  amount: number;
  paid_at: string;
  payment_method: PaymentMethod;
  receipt_path: string | null;
  note: string | null;
  created_at: string;
}

export interface PaymentTransactionRevision {
  id: FinanceEntityId;
  transaction_id: string;
  invoice_id: FinanceEntityId;
  reason: string;
  old_data: Record<string, unknown>;
  new_data: Record<string, unknown>;
  edited_at: string;
  edited_by: string;
}

export interface FinanceWorkspaceSnapshot {
  mode: FinanceSchemaMode;
  stabilizationReady: boolean;
  students: FinanceStudent[];
  classes: FinanceClass[];
  terms: FinanceTerm[];
  plans: TuitionPlan[];
  invoices: TuitionInvoiceSummary[];
  warning: string | null;
}

export interface IssueInvoicesResult {
  requested: number;
  created: number;
  existing: number;
  invalid_student_ids: number;
}
