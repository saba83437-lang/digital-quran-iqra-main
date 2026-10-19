import { supabase } from "./supabase";
import {
  loadSecureAdminStudents,
  loadSecureAdminTeachers,
} from "@/features/identity/api/secure-identity-api";

// ==================== STUDENTS ====================
export async function getStudents() {
  try {
    return await loadSecureAdminStudents();
  } catch (error) {
    console.error("getStudents:", error);
    return [];
  }
}

export async function addStudent(student: {
  name: string;
  level: string;
  class_id: string;
  parent_name: string;
  parent_phone: string;
  enrolled: string;
  attendance_rate: number;
  average_grade: number;
  tuition_status: string;
}) {
  const { data, error } = await supabase.from("students").insert([student]).select("id").single();
  if (error) {
    console.error("addStudent:", error);
    return null;
  }
  return data;
}

export async function updateStudent(
  id: string,
  updates: Partial<{
    name: string;
    level: string;
    class_id: string;
    parent_name: string;
    parent_phone: string;
    attendance_rate: number;
    average_grade: number;
    tuition_status: string;
    avatar_url: string;
  }>,
) {
  const { error } = await supabase.from("students").update(updates).eq("id", id);
  if (error) console.error("updateStudent:", error);
}

export async function deleteStudent(id: string) {
  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) console.error("deleteStudent:", error);
}

// ==================== TEACHERS ====================
export async function getTeachers() {
  try {
    return await loadSecureAdminTeachers();
  } catch (error) {
    console.error("getTeachers:", error);
    return [];
  }
}

export async function addTeacher(teacher: {
  name: string;
  specialty: string;
  phone: string;
  classes: number;
  avatar: string;
}) {
  const { data, error } = await supabase.from("teachers").insert([teacher]).select("id").single();
  if (error) {
    console.error("addTeacher:", error);
    return null;
  }
  return data;
}

export async function updateTeacher(
  id: string,
  updates: Partial<{
    name: string;
    specialty: string;
    phone: string;
    avatar_url: string;
  }>,
) {
  const { error } = await supabase.from("teachers").update(updates).eq("id", id);
  if (error) console.error("updateTeacher:", error);
}

export async function deleteTeacher(id: string) {
  const { error } = await supabase.from("teachers").delete().eq("id", id);
  if (error) console.error("deleteTeacher:", error);
}

// ==================== CLASSES ====================
export async function getClasses() {
  const { data, error } = await supabase.from("classes").select("*").order("name");
  if (error) {
    console.error("getClasses:", error);
    return [];
  }
  return data ?? [];
}

export async function addClass(cls: {
  name: string;
  teacher_id: string;
  level: string;
  schedule: string;
  capacity: number;
  enrolled: number;
}) {
  const { data, error } = await supabase.from("classes").insert([cls]).select().single();
  if (error) {
    console.error("addClass:", error);
    return null;
  }
  return data;
}

export async function updateClass(
  id: string,
  updates: Partial<{
    name: string;
    teacher_id: string;
    level: string;
    schedule: string;
    capacity: number;
    enrolled: number;
  }>,
) {
  const { error } = await supabase.from("classes").update(updates).eq("id", id);
  if (error) console.error("updateClass:", error);
}

export async function deleteClass(id: string) {
  const { error } = await supabase.from("classes").delete().eq("id", id);
  if (error) console.error("deleteClass:", error);
}

// ==================== GRADES ====================
export async function getGrades(studentId?: string) {
  let query = supabase.from("grades").select("*").order("date", { ascending: false });
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  if (error) {
    console.error("getGrades:", error);
    return [];
  }
  return data ?? [];
}

export async function addGrade(grade: {
  student_id: string;
  subject: string;
  date: string;
  grade: number;
  teacher: string;
  class_name: string;
  feedback?: string;
  month: string;
}) {
  const { error } = await supabase.from("grades").insert([grade]);
  if (error) console.error("addGrade:", error);
}

export async function addGrades(
  grades: {
    student_id: string;
    subject: string;
    date: string;
    grade: number;
    teacher: string;
    class_name: string;
    feedback?: string;
    month: string;
  }[],
) {
  const { error } = await supabase.from("grades").insert(grades);
  if (error) console.error("addGrades:", error);
}

// ==================== ATTENDANCE ====================
export async function getAttendance(studentId?: string) {
  let query = supabase.from("attendance").select("*").order("date", { ascending: false });
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  if (error) {
    console.error("getAttendance:", error);
    return [];
  }
  return data ?? [];
}

export async function addAttendance(
  records: {
    student_id: string;
    date: string;
    status: string;
    note?: string;
  }[],
) {
  const { error } = await supabase.from("attendance").insert(records);
  if (error) console.error("addAttendance:", error);
}

// ==================== PAYMENTS ====================
export async function getPayments(studentId?: string) {
  let query = supabase.from("payments").select("*").order("date", { ascending: false });
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  if (error) {
    console.error("getPayments:", error);
    return [];
  }
  return data ?? [];
}

// DEPRECATED در مرحله ۸B: View سازگاری payments فقط‌خواندنی است.
// صدور صورتحساب و ثبت قسط باید از API/RPCهای src/features/finance انجام شود.
export async function addPayment(_payment: {
  student_id: string;
  semester: string;
  amount: number;
  date: string;
  status: string;
}) {
  throw new Error("addPayment is deprecated; use finance_issue_invoices/finance_record_payment");
}

export async function updatePayment(_id: string, _status: string) {
  throw new Error(
    "updatePayment is deprecated; finance status is derived and cannot be edited manually",
  );
}

// ==================== MESSAGES ====================
export async function getMessages(toId?: string) {
  let query = supabase.from("messages").select("*").order("date", { ascending: false });
  if (toId) query = query.eq("to_id", toId);
  const { data, error } = await query;
  if (error) {
    console.error("getMessages:", error);
    return [];
  }
  return data ?? [];
}

// DEPRECATED در مرحله ۱۰C: ارسال/ویرایش مستقیم messages ممنوع است.
// از src/features/messages/api/messages-api.ts استفاده شود.
export async function addMessage(_msg: {
  from_name: string;
  to_id: string;
  subject: string;
  content: string;
  date: string;
  unread: boolean;
}) {
  throw new Error("addMessage is deprecated; use sendSecureMessage");
}

export async function markMessageRead(_id: string) {
  throw new Error("markMessageRead is deprecated; use updateSecureMessageState");
}

// ==================== SEED DATA (داده‌های اولیه) ====================
export async function seedInitialData() {
  // چک میکنیم آیا داده قبلاً وارد شده
  const { data: existing } = await supabase.from("students").select("id").limit(1);
  if (existing && existing.length > 0) return;

  // اساتید اولیه
  const { data: teachers } = await supabase
    .from("teachers")
    .insert([
      {
        name: "استاد محمد حسینی",
        specialty: "تجوید و قرائت",
        phone: "09161234567",
        classes: 2,
        avatar: "م",
      },
      {
        name: "استاد فاطمه کریمی",
        specialty: "حفظ قرآن",
        phone: "09169876543",
        classes: 1,
        avatar: "ف",
      },
      {
        name: "استاد علی رضایی",
        specialty: "ترتیل و تلاوت",
        phone: "09165554433",
        classes: 1,
        avatar: "ع",
      },
      {
        name: "استاد زینب موسوی",
        specialty: "آموزش مقدماتی",
        phone: "09163332211",
        classes: 1,
        avatar: "ز",
      },
    ])
    .select("id");

  if (!teachers) return;

  // کلاس‌های اولیه
  const { data: cls } = await supabase
    .from("classes")
    .insert([
      {
        name: "حفظ جزء ۳۰ - گروه الف",
        teacher_id: teachers[0].id,
        level: "مقدماتی",
        schedule: "شنبه و دوشنبه ۱۶:۰۰",
        capacity: 15,
        enrolled: 8,
      },
      {
        name: "تجوید پیشرفته",
        teacher_id: teachers[0].id,
        level: "پیشرفته",
        schedule: "یکشنبه و سه‌شنبه ۱۷:۰۰",
        capacity: 10,
        enrolled: 6,
      },
      {
        name: "روخوانی مقدماتی - گروه ب",
        teacher_id: teachers[1].id,
        level: "مقدماتی",
        schedule: "چهارشنبه ۱۵:۰۰",
        capacity: 20,
        enrolled: 5,
      },
    ])
    .select();

  if (!cls) return;

  // دانش‌آموزان اولیه
  await supabase.from("students").insert([
    {
      name: "علی محمدی",
      level: "سطح ۳ تقلیدی",
      class_id: cls[0].id,
      parent_name: "حسن محمدی",
      parent_phone: "09161111111",
      enrolled: "۱۴۰۳/۰۷/۱۵",
      attendance_rate: 92,
      average_grade: 18.5,
      tuition_status: "paid",
    },
    {
      name: "زهرا احمدی",
      level: "متوسط",
      class_id: cls[0].id,
      parent_name: "رضا احمدی",
      parent_phone: "09162222222",
      enrolled: "۱۴۰۳/۰۷/۱۸",
      attendance_rate: 85,
      average_grade: 16.2,
      tuition_status: "pending",
    },
    {
      name: "محمد رضایی",
      level: "پیشرفته",
      class_id: cls[1].id,
      parent_name: "علی رضایی",
      parent_phone: "09163333333",
      enrolled: "۱۴۰۳/۰۶/۲۰",
      attendance_rate: 95,
      average_grade: 19.1,
      tuition_status: "paid",
    },
    {
      name: "فاطمه کاظمی",
      level: "مقدماتی",
      class_id: cls[2].id,
      parent_name: "مهدی کاظمی",
      parent_phone: "09164444444",
      enrolled: "۱۴۰۳/۰۸/۰۱",
      attendance_rate: 78,
      average_grade: 14.8,
      tuition_status: "overdue",
    },
    {
      name: "حسین نوری",
      level: "مقدماتی",
      class_id: cls[2].id,
      parent_name: "جواد نوری",
      parent_phone: "09165555555",
      enrolled: "۱۴۰۳/۰۸/۰۵",
      attendance_rate: 88,
      average_grade: 17.3,
      tuition_status: "paid",
    },
  ]);

  console.log("✅ داده‌های اولیه با موفقیت وارد شدند");
}
