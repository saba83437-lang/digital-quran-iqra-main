import { supabase } from "./supabase";

export type AdminAccountAction =
  | "list_accounts"
  | "force_password_change"
  | "set_account_active";

export interface ManagedAccount {
  id: string | null;
  role: "admin" | "teacher" | "student" | "parent" | null;
  role_label: string;
  name: string | null;
  phone: string | null;
  profile_id: string | null;
  is_active: boolean | null;
  must_change_password: boolean | null;
  account_status:
    | "connected"
    | "auth_missing"
    | "profile_without_mapping"
    | "mapping_without_profile"
    | "auth_without_mapping";
  email: string | null;
  email_confirmed: boolean;
  auth_created_at: string | null;
  last_sign_in_at: string | null;
  last_active_at: string | null;
  total_active_seconds: number;
  today_active_seconds: number;
  week_active_seconds: number;
  created_at: string | null;
  updated_at: string | null;
}

interface FunctionResponse<T> {
  ok?: boolean;
  accounts?: T;
  result?: unknown;
  code?: string;
  error?: string;
}

const functionUrl = `${(
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://htfgctazuosjrakkardp.supabase.co"
).replace(/\/+$/, "")}/functions/v1/admin-account-settings`;

async function callAdminAccountSettings<T>(body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("نشست مدیر معتبر نیست یا منقضی شده است.");
  }

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as FunctionResponse<T>;

  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || `عملیات تنظیمات حساب ناموفق بود (${response.status})`);
  }

  return (payload.accounts ?? payload.result) as T;
}

export async function loadManagedAccounts(): Promise<ManagedAccount[]> {
  const result = await callAdminAccountSettings<ManagedAccount[]>({
    action: "list_accounts",
  });
  return Array.isArray(result) ? result : [];
}

export async function forceManagedAccountPasswordChange(userId: string): Promise<void> {
  await callAdminAccountSettings({
    action: "force_password_change",
    userId,
  });
}

export async function setManagedAccountActive(
  userId: string,
  isActive: boolean,
): Promise<void> {
  await callAdminAccountSettings({
    action: "set_account_active",
    userId,
    isActive,
  });
}
