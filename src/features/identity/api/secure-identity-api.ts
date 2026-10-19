import { supabase } from "@/lib/supabase";

function asObject(value: unknown): Record<string, any> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function asRows(value: unknown): Record<string, any>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, any> =>
          item != null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function secureIdentityError(scope: string, message?: string): Error {
  return new Error(`${scope}: ${message?.trim() || "خطای نامشخص سرویس هویت"}`);
}

/**
 * پروفایل کامل قرآن‌آموز جاری.
 *
 * شناسه واقعی فقط از auth.uid در RPC امن تعیین می‌شود. پارامتر قبلی برای
 * سازگاری callerهای فعلی حفظ شده، اما عمداً در query استفاده نمی‌شود.
 */
export async function loadSecureCurrentStudentProfile(
  _legacyStudentId: string | number,
): Promise<Record<string, any> | null> {
  const { data, error } = await supabase.rpc("secure_current_student_profile");
  if (error) throw secureIdentityError("پروفایل قرآن‌آموز", error.message);
  return asObject(data);
}

/**
 * پروفایل کامل استاد جاری.
 *
 * شناسه واقعی فقط از auth.uid در RPC امن تعیین می‌شود. پارامتر قبلی برای
 * سازگاری callerهای فعلی حفظ شده، اما عمداً در query استفاده نمی‌شود.
 */
export async function loadSecureCurrentTeacherProfile(
  _legacyTeacherId: string | number,
): Promise<Record<string, any> | null> {
  const { data, error } = await supabase.rpc("secure_current_teacher_profile");
  if (error) throw secureIdentityError("پروفایل استاد", error.message);
  return asObject(data);
}

/** فهرست کامل قرآن‌آموزان؛ مجوز مدیر داخل RPC کنترل می‌شود. */
export async function loadSecureAdminStudents(): Promise<Record<string, any>[]> {
  const { data, error } = await supabase.rpc("secure_admin_students");
  if (error) throw secureIdentityError("فهرست قرآن‌آموزان مدیر", error.message);
  return asRows(data);
}

/** فهرست کامل اساتید؛ مجوز مدیر داخل RPC کنترل می‌شود. */
export async function loadSecureAdminTeachers(): Promise<Record<string, any>[]> {
  const { data, error } = await supabase.rpc("secure_admin_teachers");
  if (error) throw secureIdentityError("فهرست اساتید مدیر", error.message);
  return asRows(data);
}

/** اطلاعات قرآن‌آموزان کلاس‌های استاد جاری؛ دامنه دسترسی داخل RPC کنترل می‌شود. */
export async function loadSecureTeacherStudents(): Promise<Record<string, any>[]> {
  const { data, error } = await supabase.rpc("secure_teacher_students");
  if (error) throw secureIdentityError("فهرست قرآن‌آموزان استاد", error.message);
  return asRows(data);
}
