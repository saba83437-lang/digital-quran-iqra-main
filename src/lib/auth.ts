import { supabase } from "./supabase";

export type UserRole = "admin" | "teacher" | "student" | "parent";

/**
 * اطلاعات نقش و موجودیت کاربر در برنامه.
 *
 * نکته امنیتی: نسخه cache شده فقط برای تجربه کاربری و مسیریابی استفاده می‌شود.
 * مرجع واقعی احراز هویت، Supabase Auth و سیاست‌های RLS دیتابیس هستند.
 */
export interface AuthSession {
  /** شناسه کاربر در auth.users */
  userId: string;
  /** شناسه موجودیت متناظر برای سازگاری با بخش‌های قدیمی پروژه */
  id: string;
  entityId: string;
  role: UserRole;
  name: string;
  phone: string;
  mustChangePassword: boolean;
}

interface UserRoleRow {
  id: string;
  role: UserRole;
  name: string | null;
  admin_id: string | null;
  teacher_id: number | string | null;
  student_id: number | string | null;
  parent_id: string | null;
  is_active: boolean | null;
  must_change_password: boolean | null;
}

const SESSION_CACHE_KEY = "quran_center_auth_profile";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function toEnglishDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

/** تبدیل شماره‌های رایج ایران به قالب استاندارد E.164 موردنیاز Supabase Auth. */
export function normalizeIranPhone(value: string): string {
  let phone = toEnglishDigits(value)
    .trim()
    .replace(/[\s()-]/g, "");

  if (phone.startsWith("0098")) phone = `+98${phone.slice(4)}`;
  else if (phone.startsWith("98")) phone = `+${phone}`;
  else if (phone.startsWith("0")) phone = `+98${phone.slice(1)}`;
  else if (phone.startsWith("9")) phone = `+98${phone}`;

  return phone;
}

export function isValidIranPhone(value: string): boolean {
  return /^\+989\d{9}$/.test(normalizeIranPhone(value));
}

/**
 * پروژه فعلاً سرویس پیامک ندارد. برای حفظ تجربه «شماره + رمز»، شماره
 * به یک ایمیل داخلی در دامنه رزروشده invalid نگاشت می‌شود. این آدرس برای
 * ارسال ایمیل استفاده نمی‌شود و فقط شناسه ورود Supabase Auth است.
 */
export function internalAuthEmailForPhone(value: string): string {
  const normalizedPhone = normalizeIranPhone(value);
  if (!isValidIranPhone(normalizedPhone)) return "";
  return `${normalizedPhone.replace("+", "")}@iqra.invalid`;
}

function phoneFromAuthIdentity(phone?: string | null, email?: string | null): string {
  if (phone) return normalizeIranPhone(phone);
  const match = String(email ?? "")
    .toLowerCase()
    .match(/^(989\d{9})@iqra\.invalid$/);
  return match ? `+${match[1]}` : "";
}

function entityIdForRole(profile: UserRoleRow): string | null {
  const value =
    profile.role === "admin"
      ? profile.admin_id
      : profile.role === "teacher"
        ? profile.teacher_id
        : profile.role === "student"
          ? profile.student_id
          : profile.parent_id;

  return value == null ? null : String(value);
}

function writeSessionCache(session: AuthSession): void {
  if (!isBrowser()) return;
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_CACHE_KEY);
  // پاک‌سازی نشست قابل‌جعل نسخه قدیمی پروژه
  localStorage.removeItem("quran_center_session");
}

/**
 * نسخه همگام cache برای سازگاری با utilityهای قدیمی پروژه.
 * این مقدار نباید به‌عنوان مرز امنیتی استفاده شود.
 */
export function getSession(): AuthSession | null {
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!parsed.userId || !parsed.id || !parsed.entityId || !parsed.role) return null;
    return parsed as AuthSession;
  } catch {
    clearSession();
    return null;
  }
}

function buildAppSession(
  profile: UserRoleRow,
  phone: string | null | undefined,
): AuthSession | null {
  if (profile.is_active === false) return null;

  const entityId = entityIdForRole(profile);
  if (!entityId) return null;

  return {
    userId: profile.id,
    id: entityId,
    entityId,
    role: profile.role,
    name: profile.name?.trim() || "کاربر سامانه",
    phone: phone ?? "",
    mustChangePassword: profile.must_change_password === true,
  };
}

async function loadProfile(userId: string): Promise<UserRoleRow | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select(
      "id, role, name, admin_id, teacher_id, student_id, parent_id, is_active, must_change_password",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[auth] profile lookup failed:", error.message);
    return null;
  }

  return (data as UserRoleRow | null) ?? null;
}

/** دریافت و اعتبارسنجی نشست واقعی از Supabase Auth و جدول نقش‌ها. */
export async function getAuthenticatedSession(): Promise<AuthSession | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    clearSession();
    return null;
  }

  const profile = await loadProfile(session.user.id);
  if (!profile) {
    clearSession();
    return null;
  }

  const appSession = buildAppSession(
    profile,
    phoneFromAuthIdentity(session.user.phone, session.user.email),
  );
  if (!appSession) {
    clearSession();
    return null;
  }

  writeSessionCache(appSession);
  return appSession;
}

/**
 * ورود امن با شماره تلفن و رمز عبور از طریق Supabase Auth.
 * شماره به شناسه ایمیل داخلی تبدیل می‌شود؛ هیچ password_hash از جداول
 * عمومی خوانده یا در مرورگر مقایسه نمی‌شود.
 */
export async function loginWithPhone(
  phone: string,
  password: string,
): Promise<{ session: AuthSession | null; error: string | null }> {
  const normalizedPhone = normalizeIranPhone(phone);

  if (!isValidIranPhone(normalizedPhone)) {
    return { session: null, error: "شماره تماس معتبر نیست" };
  }
  if (!password || password.length < 6) {
    return { session: null, error: "رمز عبور باید حداقل ۶ کاراکتر باشد" };
  }

  clearSession();

  const internalEmail = internalAuthEmailForPhone(normalizedPhone);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password,
  });

  if (error || !data.user || !data.session) {
    return { session: null, error: "شماره تماس یا رمز عبور اشتباه است" };
  }

  const profile = await loadProfile(data.user.id);
  const appSession = profile ? buildAppSession(profile, normalizedPhone) : null;

  if (!appSession) {
    await supabase.auth.signOut();
    clearSession();
    return {
      session: null,
      error: "حساب کاربری فعال است اما نقش یا پرونده آن در سامانه تکمیل نشده است",
    };
  }

  writeSessionCache(appSession);
  return { session: appSession, error: null };
}

export function homePathForRole(role: UserRole): "/admin" | "/teacher" | "/student" | "/parent" {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/teacher";
  if (role === "parent") return "/parent";
  return "/student";
}

export async function logout(): Promise<void> {
  clearSession();
  const { error } = await supabase.auth.signOut();
  if (error) console.warn("[auth] sign out failed:", error.message);
}

/**
 * تغییر رمز برای کاربر واردشده. پس از اجرای مهاجرت فاز صفر،
 * وضعیت must_change_password نیز توسط RPC امن به‌روزرسانی می‌شود.
 */
export async function updateCurrentPassword(password: string): Promise<string | null> {
  if (password.length < 8) return "رمز عبور باید حداقل ۸ کاراکتر باشد";

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return error.message;

  const { error: profileError } = await supabase.rpc("mark_password_changed");
  if (profileError) console.warn("[auth] password flag update failed:", profileError.message);

  const current = getSession();
  if (current) writeSessionCache({ ...current, mustChangePassword: false });
  return null;
}
