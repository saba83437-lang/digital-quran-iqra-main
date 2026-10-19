import { supabase } from "./supabase";

export type ProvisionEntityType = "student" | "parent" | "teacher";

export type ProvisionErrorCode =
  | "AUTH_TOKEN_REQUIRED"
  | "INVALID_AUTH_TOKEN"
  | "ADMIN_ACCESS_REQUIRED"
  | "INVALID_ENTITY_TYPE"
  | "INVALID_ENTITY_ID"
  | "INVALID_PHONE"
  | "PROFILE_NOT_FOUND"
  | "ROLE_ALREADY_EXISTS"
  | "AUTH_ACCOUNT_ALREADY_EXISTS"
  | "AUTH_ACCOUNT_CREATION_FAILED"
  | "ROLE_CREATION_FAILED"
  | "ROLE_CREATION_FAILED_CLEANUP_FAILED"
  | "FUNCTION_CONFIGURATION_ERROR"
  | "INTERNAL_SERVER_ERROR"
  | "UNKNOWN_ERROR";

export interface ProvisionResult {
  ok: boolean;
  code?: ProvisionErrorCode | string;
  userId?: string;
  email?: string;
  entityType?: ProvisionEntityType;
  entityId?: number | string;
  mustChangePassword?: boolean;
  error?: string;
}

export interface ProvisionAuthInput {
  entityType: ProvisionEntityType;
  entityId: number | string;
  phone: string;
  name?: string | null;
}

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  "https://htfgctazuosjrakkardp.supabase.co";

const PROVISION_USER_URL =
  `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/provision-user`;

function isValidInput(input: ProvisionAuthInput): boolean {
  if (!input.entityType) return false;
  if (input.entityId === null || input.entityId === undefined) return false;
  if (String(input.entityId).trim() === "") return false;
  if (!String(input.phone ?? "").trim()) return false;
  return true;
}

async function readProvisionResponse(
  response: Response,
): Promise<ProvisionResult> {
  const text = await response.text().catch(() => "");

  let payload: Partial<ProvisionResult> = {};

  if (text) {
    try {
      payload = JSON.parse(text) as Partial<ProvisionResult>;
    } catch {
      payload = {};
    }
  }

  if (payload.ok === true) {
    return {
      ok: true,
      code: payload.code,
      userId: payload.userId,
      email: payload.email,
      entityType: payload.entityType,
      entityId: payload.entityId,
      mustChangePassword: payload.mustChangePassword,
    };
  }

  return {
    ok: false,
    code: payload.code ?? `HTTP_${response.status}`,
    error:
      payload.error ??
      (text.trim() || `ساخت حساب ناموفق بود (${response.status})`),
  };
}

/**
 * ساخت حساب Auth برای دانش‌آموز، ولی یا استاد.
 *
 * این تابع فقط درخواست را به Edge Function ارسال می‌کند.
 * مجوز واقعی و بررسی نقش مدیر داخل Edge Function انجام می‌شود.
 *
 * رمز اولیه در Edge Function به‌صورت ثابت 12345678 تعیین شده است
 * و در این فایل یا response نمایش داده نمی‌شود.
 */
export async function provisionAuthAccount(
  input: ProvisionAuthInput,
): Promise<ProvisionResult> {
  if (!isValidInput(input)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: "اطلاعات لازم برای ساخت حساب کامل نیست.",
    };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return {
      ok: false,
      code: "AUTH_TOKEN_REQUIRED",
      error: "نشست مدیر معتبر نیست یا منقضی شده است.",
    };
  }

  try {
    const response = await fetch(PROVISION_USER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        entityType: input.entityType,
        entityId: input.entityId,
        phone: String(input.phone).trim(),
        name: input.name?.trim() || null,
      }),
    });

    return await readProvisionResponse(response);
  } catch (error) {
    return {
      ok: false,
      code: "FUNCTION_UNREACHABLE",
      error:
        error instanceof Error
          ? `ارتباط با سرویس ساخت حساب برقرار نشد: ${error.message}`
          : "ارتباط با سرویس ساخت حساب برقرار نشد.",
    };
  }
}