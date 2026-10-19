// ============================================================
//  نام نمایشی افراد + پیشوند نقش (کل پروژه)
//  قانون: اسم همیشه در دیتابیس «خام» ذخیره می‌شود؛
//  پیشوند فقط لحظهٔ نمایش اضافه می‌شود.
// ============================================================

export type DisplayRole =
  | "teacher"
  | "student"
  | "parent"
  | "admin"
  | "group"
  | string
  | null
  | undefined;

const TEACHER_PREFIX_RE = /^استاد[\s‌]/;

/**
 * اسم فرد + نقش → اسم نمایشی با پیشوند مناسب.
 * فعلاً فقط اساتید پیشوند «استاد» می‌گیرند؛ بقیهٔ نقش‌ها بدون تغییر.
 * ضدتکرار است: اگر اسم از قبل با «استاد » شروع شود، دوباره اضافه نمی‌کند.
 */
export function withRolePrefix(
  name: string | null | undefined,
  role: DisplayRole,
): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  if (role === "teacher") return displayTeacherName(n);
  return n;
}

/** اسم استاد → «استاد فلانی» (ضدتکرار) */
export function displayTeacherName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return TEACHER_PREFIX_RE.test(n) ? n : `استاد ${n}`;
}

/** مثل displayTeacherName ولی null/خالی را به‌صورت null حفظ می‌کند (برای فیلدهای nullable) */
export function displayTeacherNameOrNull(
  name: string | null | undefined,
): string | null {
  const d = displayTeacherName(name);
  return d === "" ? null : d;
}
