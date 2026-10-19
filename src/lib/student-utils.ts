import { supabase } from "./supabase";
import { getSession } from "./auth";
import { displayTeacherNameOrNull } from "./display";
import { loadSecureCurrentStudentProfile } from "@/features/identity/api/secure-identity-api";
/* ================================================================== */
/* Types                                                              */
/* ================================================================== */
export interface CurrentStudent {
  id: string;
  name: string;
  level: string | null;
  class_id: string | null;
  class_name?: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_national_id?: string | null;
  parent_relation?: string | null;
  enrolled: string | null;
  attendance_rate: number | null;
  average_grade: number | null;
  tuition_status: string | null;
  avatar_url: string | null;
  national_id: string | null;
  birth_date?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: string | null;
  student_number?: string | null;
}

/* ================================================================== */
/* Helpers                                                            */
/* ================================================================== */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function toEnglishDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function todayJalali(): string {
  try {
    const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    return toEnglishDigits(`${y}/${m}/${d}`);
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
}

/* ================================================================== */
/* Main API                                                           */
/* ================================================================== */

/**
 * دریافت اطلاعات قرآن‌آموز فعلی.
 *
 * استراتژی:
 * ۱. کاربر با Supabase Auth وارد شده → student_auth را جستجو می‌کنیم
 *    تا student_id را پیدا کنیم.
 * ۲. اگر student_auth وجود نداشت یا mapping نبود، به‌عنوان fallback
 *    اولین رکورد فعال را برمی‌گردانیم (برای دمو).
 *
 * پیش‌نیاز: فایل `student_auth_schema.sql` اجرا شده باشد.
 */
export async function getCurrentStudent(): Promise<CurrentStudent | null> {
  try {
    // AppShell نشست واقعی Supabase Auth را اعتبارسنجی و این profile cache را می‌سازد.
    // این تابع عمداً fallback نمایشی ندارد تا هرگز اولین قرآن‌آموز دیتابیس
    // به کاربر ناشناس یا نقش دیگر نمایش داده نشود.
    const session = getSession();
    if (!session || session.role !== "student") return null;

    return await fetchStudentById(session.entityId);
  } catch (err) {
    console.error("[student-utils] خطای غیرمنتظره:", err);
    return null;
  }
}

/**
 * دریافت اطلاعات یک قرآن‌آموز با ID مشخص
 */
async function fetchStudentById(
  id: number | string
): Promise<CurrentStudent | null> {
  try {
    // سرور شناسه را فقط از auth.uid و user_roles می‌گیرد؛ شناسهٔ ورودی
    // صرفاً برای تطبیق دفاعی با نشست cacheشدهٔ برنامه استفاده می‌شود.
    const data = await loadSecureCurrentStudentProfile(id);
    if (!data || String(data.id) !== String(id)) {
      console.warn("[student-utils] پروفایل امن قرآن‌آموز با نشست جاری تطبیق ندارد");
      return null;
    }
    const classInfo = data.class_id ? await fetchClassInfo(data.class_id) : null;
    return normalizeStudent(data, classInfo);
  } catch (error) {
    console.warn("[student-utils] خطا در دریافت پروفایل امن قرآن‌آموز", error);
    return null;
  }
}

/**
 * دریافت اطلاعات کلاس به‌صورت جداگانه
 */
async function fetchClassInfo(classId: number | string) {
  const { data } = await supabase
    .from("classes")
    .select("id, name, level, schedule, teacher_id")
    .eq("id", classId)
    .maybeSingle();
  return data;
}

/**
 * دریافت اطلاعات کلاس قرآن‌آموز (نام، استاد، برنامه و...)
 */
export async function getStudentClass(studentId: string) {
  const { data: student } = await supabase
    .from("students")
    .select("class_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student?.class_id) return null;

  const { data: cls } = await supabase
    .from("classes")
    .select("id, name, level, schedule, teacher_id, term, academic_year")
    .eq("id", student.class_id)
    .maybeSingle();

  if (!cls) return null;

  // دریافت نام استاد
  let teacherName: string | null = null;
  if (cls.teacher_id) {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id, name")
      .eq("id", cls.teacher_id)
      .maybeSingle();
    teacherName = teacher?.name ?? null;
  }

  return {
    ...cls,
    teacher_name: displayTeacherNameOrNull(teacherName),
  };
}

/**
 * نرمال‌سازی داده خام به CurrentStudent
 */
function normalizeStudent(raw: any, classInfo?: any): CurrentStudent {
  return {
    id: String(raw.id),
    name: String(raw.name ?? "بدون نام"),
    level: raw.level ?? null,
    class_id: raw.class_id != null ? String(raw.class_id) : null,
    class_name: classInfo?.name ?? null,
    parent_name: raw.parent_name ?? null,
    parent_phone: raw.parent_phone ?? null,
    parent_national_id: raw.parent_national_id ?? null,
    parent_relation: raw.parent_relation ?? "پدر",
    enrolled: raw.enrolled ?? null,
    attendance_rate:
      raw.attendance_rate != null ? Number(raw.attendance_rate) : null,
    average_grade:
      raw.average_grade != null ? Number(raw.average_grade) : null,
    tuition_status: raw.tuition_status ?? "pending",
    avatar_url: raw.avatar_url ?? null,
    national_id: raw.national_id ?? null,
    birth_date: raw.birth_date ?? null,
    phone: raw.phone ?? null,
    address: raw.address ?? null,
    status: raw.status ?? "active",
    student_number: raw.student_number ?? null,
  };
}

/**
 * دریافت نام استاد کلاس
 */
export async function getClassTeacherName(classId: string): Promise<string | null> {
  const { data: cls } = await supabase
    .from("classes")
    .select("teacher_id")
    .eq("id", classId)
    .maybeSingle();

  if (!cls?.teacher_id) return null;

  const { data: teacher } = await supabase
    .from("teachers")
    .select("name")
    .eq("id", cls.teacher_id)
    .maybeSingle();

  return teacher?.name ?? null;
}
