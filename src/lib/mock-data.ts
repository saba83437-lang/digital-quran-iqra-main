// Mock data for the Bar Al-Walidayn Quran Center management system.
// All data is in Persian and serves the admin + teacher panels.

export type Role = "admin" | "teacher" | "parent" | "student";

// Simulated logged-in student id (for the student panel)
export const currentStudentId = "s1";

export interface AttendanceRecord {
  date: string;
  status: "present" | "late" | "absent";
  note?: string;
  month: string;
}

export interface GradeRecord {
  subject: string;
  date: string;
  grade: number;
  teacher: string;
  className?: string;
  feedback?: string;
  month: string;
}

// Persian months (Jalali) and current month for monthly filtering
export const months = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
export const currentMonth = "آذر";

// Simulated parent → children mapping for the logged-in "parent" user
export const parentChildrenIds = ["s1", "s8"];

export const childAttendance: Record<string, AttendanceRecord[]> = {
  s1: [
    { date: "۱۴۰۳/۰۹/۲۵", status: "present", month: "آذر" },
    { date: "۱۴۰۳/۰۹/۲۳", status: "present", month: "آذر" },
    { date: "۱۴۰۳/۰۹/۲۰", status: "late", note: "۱۵ دقیقه تأخیر", month: "آذر" },
    { date: "۱۴۰۳/۰۹/۱۸", status: "present", month: "آذر" },
    { date: "۱۴۰۳/۰۹/۱۶", status: "present", month: "آذر" },
    { date: "۱۴۰۳/۰۹/۱۳", status: "absent", note: "غیبت موجه - بیماری", month: "آذر" },
    { date: "۱۴۰۳/۰۸/۲۸", status: "present", month: "آبان" },
    { date: "۱۴۰۳/۰۸/۲۵", status: "present", month: "آبان" },
    { date: "۱۴۰۳/۰۸/۲۰", status: "late", month: "آبان" },
    { date: "۱۴۰۳/۰۸/۱۵", status: "present", month: "آبان" },
    { date: "۱۴۰۳/۰۷/۲۵", status: "present", month: "مهر" },
    { date: "۱۴۰۳/۰۷/۲۰", status: "absent", note: "غیبت موجه", month: "مهر" },
  ],
  s8: [
    { date: "۱۴۰۳/۰۹/۲۵", status: "present", month: "آذر" },
    { date: "۱۴۰۳/۰۹/۲۳", status: "late", month: "آذر" },
    { date: "۱۴۰۳/۰۹/۲۰", status: "present", month: "آذر" },
    { date: "۱۴۰۳/۰۹/۱۸", status: "absent", note: "غیبت غیرموجه", month: "آذر" },
    { date: "۱۴۰۳/۰۹/۱۶", status: "present", month: "آذر" },
    { date: "۱۴۰۳/۰۸/۲۰", status: "present", month: "آبان" },
    { date: "۱۴۰۳/۰۸/۱۵", status: "present", month: "آبان" },
  ],
};

export const childGrades: Record<string, GradeRecord[]> = {
  s1: [
    { subject: "قرائت آیات ۱-۱۰ سوره بقره", date: "۱۴۰۳/۰۹/۱۸", grade: 19, teacher: "استاد فاطمه کریمی", className: "کلاس یاسین", feedback: "قرائت بسیار روان و دقیق بود. مراقب وقف‌ها باشید.", month: "آذر" },
    { subject: "حفظ سوره ناس", date: "۱۴۰۳/۰۹/۱۰", grade: 20, teacher: "استاد فاطمه کریمی", className: "کلاس یاسین", feedback: "عالی. ادامه دهید.", month: "آذر" },
    { subject: "تمرین احکام نون ساکن", date: "۱۴۰۳/۰۸/۲۸", grade: 17.5, teacher: "استاد فاطمه کریمی", className: "کلاس یاسین", month: "آبان" },
    { subject: "قرائت سوره فلق", date: "۱۴۰۳/۰۸/۲۰", grade: 18, teacher: "استاد فاطمه کریمی", className: "کلاس یاسین", feedback: "تلفظ ضاد نیاز به تمرین بیشتر دارد.", month: "آبان" },
    { subject: "روخوانی سوره توحید", date: "۱۴۰۳/۰۷/۲۲", grade: 18.5, teacher: "استاد فاطمه کریمی", className: "کلاس یاسین", month: "مهر" },
  ],
  s8: [
    { subject: "روخوانی صفحه ۳ جزء ۳۰", date: "۱۴۰۳/۰۹/۱۵", grade: 18, teacher: "استاد فاطمه کریمی", className: "کلاس یاسین", month: "آذر" },
    { subject: "حفظ آیات ابتدایی سوره فجر", date: "۱۴۰۳/۰۹/۰۸", grade: 17.5, teacher: "استاد فاطمه کریمی", className: "کلاس یاسین", feedback: "حفظ خوب اما سرعت بیان را کنترل کنید.", month: "آذر" },
    { subject: "تمرین مد طبیعی", date: "۱۴۰۳/۰۸/۳۰", grade: 18.5, teacher: "استاد فاطمه کریمی", className: "کلاس یاسین", month: "آبان" },
  ],
};

export interface Teacher {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  classes: number;
  avatar: string;
}

export interface Student {
  id: string;
  name: string;
  level: string;
  classId: string;
  parentName: string;
  parentPhone: string;
  enrolled: string;
  attendanceRate: number;
  averageGrade: number;
  tuitionStatus: "paid" | "pending" | "overdue";
}

export interface QClass {
  id: string;
  name: string;
  level: string;
  teacherId: string;
  capacity: number;
  enrolled: number;
  schedule: string;
}

export interface Video {
  id: string;
  title: string;
  level: string;
  duration: string;
  locked: boolean;
  views: number;
}

export interface Payment {
  id: string;
  studentId: string;
  amount: number;
  date: string;
  status: "paid" | "pending" | "overdue";
  semester: string;
}

export interface Assignment {
  id: string;
  title: string;
  classId: string;
  dueDate: string;
  submissions: number;
  total: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  submittedAt: string;
  type: "audio" | "file";
  reviewed: boolean;
  grade?: number;
}

export interface Message {
  id: string;
  from: string;
  fromRole: string;
  to: string;
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
}

export const teachers: Teacher[] = [
  { id: "t1", name: "استاد محمد حسینی", specialty: "تجوید و قرائت", phone: "۰۹۱۲۳۴۵۶۷۸۹", classes: 4, avatar: "م.ح" },
  { id: "t2", name: "استاد فاطمه کریمی", specialty: "حفظ قرآن", phone: "۰۹۱۲۲۳۳۴۴۵۵", classes: 3, avatar: "ف.ک" },
  { id: "t3", name: "استاد علی رضایی", specialty: "تفسیر و معارف", phone: "۰۹۱۲۸۸۷۷۶۶۵", classes: 2, avatar: "ع.ر" },
  { id: "t4", name: "استاد زهرا موسوی", specialty: "روخوانی مقدماتی", phone: "۰۹۱۲۵۵۴۴۳۳۲", classes: 3, avatar: "ز.م" },
];

export const classes: QClass[] = [
  { id: "c1", name: "حفظ جزء ۳۰ - گروه الف", level: "متوسط", teacherId: "t2", capacity: 15, enrolled: 10, schedule: "شنبه و دوشنبه ۱۶:۰۰" },
  { id: "c2", name: "تجوید پیشرفته", level: "پیشرفته", teacherId: "t1", capacity: 12, enrolled: 10, schedule: "یک‌شنبه و سه‌شنبه ۱۷:۳۰" },
  { id: "c3", name: "روخوانی مقدماتی - گروه ب", level: "مقدماتی", teacherId: "t4", capacity: 18, enrolled: 16, schedule: "شنبه و چهارشنبه ۱۵:۰۰" },
  { id: "c4", name: "تفسیر سوره یاسین", level: "متوسط", teacherId: "t3", capacity: 20, enrolled: 14, schedule: "پنج‌شنبه ۱۰:۰۰" },
  { id: "c5", name: "قرائت با صوت", level: "پیشرفته", teacherId: "t1", capacity: 10, enrolled: 9, schedule: "دوشنبه ۱۸:۰۰" },
  { id: "c6", name: "کلاس یاسین", level: "سطح ۳ تقلیدی", teacherId: "t2", capacity: 15, enrolled: 2, schedule: "یک‌شنبه و سه‌شنبه ۱۶:۳۰" },
];

export const students: Student[] = [
  { id: "s1", name: "علی محمدی", level: "سطح ۳ تقلیدی", classId: "c6", parentName: "حسن محمدی", parentPhone: "۰۹۱۲۱۱۱۲۲۳۳", enrolled: "۱۴۰۳/۰۷/۱۵", attendanceRate: 95, averageGrade: 18.5, tuitionStatus: "paid" },
  { id: "s2", name: "زهرا احمدی", level: "متوسط", classId: "c1", parentName: "رضا احمدی", parentPhone: "۰۹۱۲۲۲۲۳۳۴۴", enrolled: "۱۴۰۳/۰۷/۱۸", attendanceRate: 88, averageGrade: 17.2, tuitionStatus: "pending" },
  { id: "s3", name: "محمد رضایی", level: "پیشرفته", classId: "c2", parentName: "علی رضایی", parentPhone: "۰۹۱۲۳۳۳۴۴۵۵", enrolled: "۱۴۰۳/۰۶/۲۰", attendanceRate: 100, averageGrade: 19.5, tuitionStatus: "paid" },
  { id: "s4", name: "فاطمه کاظمی", level: "مقدماتی", classId: "c3", parentName: "مهدی کاظمی", parentPhone: "۰۹۱۲۴۴۴۵۵۶۶", enrolled: "۱۴۰۳/۰۸/۰۱", attendanceRate: 78, averageGrade: 15.8, tuitionStatus: "overdue" },
  { id: "s5", name: "حسین نوری", level: "مقدماتی", classId: "c3", parentName: "جواد نوری", parentPhone: "۰۹۱۲۵۵۵۶۶۷۷", enrolled: "۱۴۰۳/۰۸/۰۵", attendanceRate: 92, averageGrade: 17.0, tuitionStatus: "paid" },
  { id: "s6", name: "مریم صادقی", level: "متوسط", classId: "c4", parentName: "حمید صادقی", parentPhone: "۰۹۱۲۶۶۶۷۷۸۸", enrolled: "۱۴۰۳/۰۷/۰۲", attendanceRate: 85, averageGrade: 16.5, tuitionStatus: "paid" },
  { id: "s7", name: "ابوالفضل کریمی", level: "پیشرفته", classId: "c5", parentName: "اکبر کریمی", parentPhone: "۰۹۱۲۷۷۷۸۸۹۹", enrolled: "۱۴۰۳/۰۶/۲۵", attendanceRate: 98, averageGrade: 19.8, tuitionStatus: "paid" },
  { id: "s8", name: "نرگس حیدری", level: "سطح ۳ تقلیدی", classId: "c6", parentName: "سعید حیدری", parentPhone: "۰۹۱۲۸۸۸۹۹۰۰", enrolled: "۱۴۰۳/۰۷/۲۰", attendanceRate: 90, averageGrade: 18.0, tuitionStatus: "pending" },
];

export const videos: Video[] = [
  { id: "v1", title: "آموزش مخارج حروف - جلسه اول", level: "مقدماتی", duration: "۲۴:۱۵", locked: false, views: 142 },
  { id: "v2", title: "احکام مد و قصر", level: "متوسط", duration: "۳۵:۰۰", locked: false, views: 87 },
  { id: "v3", title: "تفسیر سوره فاتحه", level: "متوسط", duration: "۴۸:۳۰", locked: true, views: 0 },
  { id: "v4", title: "تمرین قرائت با صوت داوود", level: "پیشرفته", duration: "۲۸:۴۵", locked: false, views: 56 },
  { id: "v5", title: "حفظ آیات کلیدی جزء ۳۰", level: "متوسط", duration: "۵۲:۲۰", locked: false, views: 198 },
  { id: "v6", title: "وقف و ابتدا - بخش پیشرفته", level: "پیشرفته", duration: "۳۸:۱۰", locked: true, views: 0 },
];

export const payments: Payment[] = [
  { id: "p1", studentId: "s1", amount: 1_800_000, date: "۱۴۰۳/۰۷/۱۵", status: "paid", semester: "نیمسال اول ۱۴۰۳" },
  { id: "p2", studentId: "s2", amount: 1_800_000, date: "—", status: "pending", semester: "نیمسال اول ۱۴۰۳" },
  { id: "p3", studentId: "s3", amount: 2_200_000, date: "۱۴۰۳/۰۶/۲۰", status: "paid", semester: "نیمسال اول ۱۴۰۳" },
  { id: "p4", studentId: "s4", amount: 1_500_000, date: "—", status: "overdue", semester: "نیمسال اول ۱۴۰۳" },
  { id: "p5", studentId: "s5", amount: 1_500_000, date: "۱۴۰۳/۰۸/۰۵", status: "paid", semester: "نیمسال اول ۱۴۰۳" },
  { id: "p6", studentId: "s6", amount: 1_800_000, date: "۱۴۰۳/۰۷/۰۲", status: "paid", semester: "نیمسال اول ۱۴۰۳" },
  { id: "p7", studentId: "s7", amount: 2_200_000, date: "۱۴۰۳/۰۶/۲۵", status: "paid", semester: "نیمسال اول ۱۴۰۳" },
  { id: "p8", studentId: "s8", amount: 1_800_000, date: "—", status: "pending", semester: "نیمسال اول ۱۴۰۳" },
];

export const assignments: Assignment[] = [
  { id: "a1", title: "قرائت آیات ۱ تا ۱۰ سوره بقره", classId: "c1", dueDate: "۱۴۰۳/۰۹/۲۰", submissions: 10, total: 12 },
  { id: "a2", title: "تمرین مد لازم", classId: "c2", dueDate: "۱۴۰۳/۰۹/۱۸", submissions: 9, total: 10 },
  { id: "a3", title: "روخوانی صفحه ۵ جزء ۳۰", classId: "c3", dueDate: "۱۴۰۳/۰۹/۲۵", submissions: 12, total: 16 },
  { id: "a4", title: "حفظ ۵ آیه ابتدایی سوره یاسین", classId: "c4", dueDate: "۱۴۰۳/۰۹/۲۲", submissions: 11, total: 14 },
];

export const submissions: Submission[] = [
  { id: "sb1", assignmentId: "a1", studentId: "s1", submittedAt: "۱۴۰۳/۰۹/۱۸", type: "audio", reviewed: true, grade: 19 },
  { id: "sb2", assignmentId: "a1", studentId: "s2", submittedAt: "۱۴۰۳/۰۹/۱۹", type: "audio", reviewed: false },
  { id: "sb3", assignmentId: "a1", studentId: "s8", submittedAt: "۱۴۰۳/۰۹/۱۹", type: "audio", reviewed: false },
  { id: "sb4", assignmentId: "a2", studentId: "s3", submittedAt: "۱۴۰۳/۰۹/۱۶", type: "audio", reviewed: true, grade: 20 },
  { id: "sb5", assignmentId: "a3", studentId: "s4", submittedAt: "۱۴۰۳/۰۹/۲۲", type: "audio", reviewed: false },
  { id: "sb6", assignmentId: "a3", studentId: "s5", submittedAt: "۱۴۰۳/۰۹/۲۳", type: "file", reviewed: false },
  { id: "sb7", assignmentId: "a4", studentId: "s6", submittedAt: "۱۴۰۳/۰۹/۲۰", type: "audio", reviewed: true, grade: 17 },
];

export const messages: Message[] = [
  { id: "m1", from: "حسن محمدی", fromRole: "ولی دانش‌آموز", to: "مدیریت مرکز", subject: "درخواست تغییر کلاس", preview: "با سلام، می‌خواستم بدانم آیا امکان انتقال فرزندم به کلاس...", date: "امروز ۱۰:۳۰", unread: true },
  { id: "m2", from: "استاد محمد حسینی", fromRole: "معلم", to: "مدیریت مرکز", subject: "گزارش جلسه امروز", preview: "جلسه به خوبی برگزار شد و تمام دانش‌آموزان حضور داشتند...", date: "امروز ۰۹:۱۵", unread: true },
  { id: "m3", from: "رضا احمدی", fromRole: "ولی دانش‌آموز", to: "مدیریت مرکز", subject: "تشکر بابت پیگیری", preview: "از زحمات شما در پیگیری وضعیت تحصیلی فرزندم سپاسگزارم...", date: "دیروز", unread: false },
  { id: "m4", from: "استاد فاطمه کریمی", fromRole: "معلم", to: "مدیریت مرکز", subject: "نیاز به کتاب تمرین", preview: "برای کلاس حفظ جزء ۳۰ نیاز به کتاب‌های جدید داریم...", date: "دیروز", unread: false },
  { id: "m5", from: "مدیریت", fromRole: "مدیر", to: "همه معلمان", subject: "جلسه هماهنگی ماهانه", preview: "جلسه هماهنگی روز پنج‌شنبه ساعت ۱۶ برگزار می‌شود...", date: "۲ روز پیش", unread: false },
  { id: "m6", from: "علی محمدی", fromRole: "قرآن‌آموز", to: "استاد فاطمه کریمی", subject: "سوال درباره تکلیف", preview: "سلام استاد، آیا می‌توانم تکلیف این هفته را فردا تحویل دهم؟", date: "امروز ۱۱:۰۰", unread: true },
  { id: "m7", from: "استاد فاطمه کریمی", fromRole: "معلم", to: "علی محمدی", subject: "پاسخ: تکلیف", preview: "بله مشکلی نیست، حتماً تا فردا ارسال کنید.", date: "امروز ۱۱:۲۰", unread: false },
  { id: "m8", from: "سعید حیدری", fromRole: "ولی دانش‌آموز", to: "استاد فاطمه کریمی", subject: "وضعیت پیشرفت نرگس", preview: "سلام استاد، لطفاً درباره پیشرفت دخترم نرگس توضیح بفرمایید.", date: "دیروز", unread: false },
  { id: "m9", from: "استاد فاطمه کریمی", fromRole: "معلم", to: "سعید حیدری", subject: "پاسخ: پیشرفت نرگس", preview: "نرگس عملکرد بسیار خوبی دارد و در حفظ سوره‌ها پیشرفت قابل توجهی داشته‌اند.", date: "دیروز", unread: false },
];

export type MessageCategory = "teacher-student" | "student-teacher" | "parent-teacher" | "teacher-parent" | "to-admin" | "from-admin";

export function categorizeMessage(m: Message): MessageCategory {
  const fromTeacher = m.fromRole === "معلم";
  const fromStudent = m.fromRole === "قرآن‌آموز";
  const fromParent = m.fromRole === "ولی دانش‌آموز";
  const fromAdmin = m.fromRole === "مدیر";
  const toAdmin = m.to.includes("مدیریت");
  const toTeacher = m.to.includes("استاد");
  const toStudent = students.some((s) => s.name === m.to);
  const toParent = students.some((s) => s.parentName === m.to);

  if (fromAdmin) return "from-admin";
  if (toAdmin) return "to-admin";
  if (fromTeacher && toStudent) return "teacher-student";
  if (fromStudent && toTeacher) return "student-teacher";
  if (fromParent && toTeacher) return "parent-teacher";
  if (fromTeacher && toParent) return "teacher-parent";
  return "to-admin";
}

export function formatToman(n: number) {
  return new Intl.NumberFormat("fa-IR").format(n) + " تومان";
}

export function getTeacher(id: string) {
  return teachers.find((t) => t.id === id);
}

export function getClass(id: string) {
  return classes.find((c) => c.id === id);
}

export function getStudent(id: string) {
  return students.find((s) => s.id === id);
}
