import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ClipboardList,
  Loader2,
  Send,
  Upload,
  Mic,
  FileText,
  Image as ImageIcon,
  FileAudio,
  FileVideo,
  File as FileIcon,
  Paperclip,
  X,
  PlayCircle,
  PauseCircle,
  Square,
  CheckCircle2,
  AlertCircle,
  Clock,
  Star,
  MessageSquare,
  Calendar,
  Award,
  TrendingUp,
  TrendingDown,
  Sparkles,
  BookOpen,
  Volume2,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { displayTeacherName } from "@/lib/display";
import { getCurrentStudent, type CurrentStudent } from "@/lib/student-utils";
import { uploadAssignmentAudio, uploadAssignmentFile } from "@/lib/storage";
import {
  SecureAssignmentAudio,
  SecureAssignmentFileLink,
} from "@/features/assignments/components/secure-assignment-file";
import { toast } from "sonner";

export const Route = createFileRoute("/student/assignments")({
  head: () => ({
    meta: [
      { title: "دارالقرآن ٱلوالدین — تکالیف" },
      { name: "description", content: "تکالیف قرآن‌آموز" },
    ],
  }),
  component: StudentAssignments,
});

/* ================================================================== */
/* ثابت‌ها                                                            */
/* ================================================================== */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const TYPE_LABELS: Record<string, { label: string; icon: ReactNode; color: string }> = {
  hifz: {
    label: "حفظ",
    icon: <BookOpen className="h-4 w-4" />,
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  tajwid: {
    label: "تجوید",
    icon: <Sparkles className="h-4 w-4" />,
    color: "bg-purple-100 text-purple-700 border-purple-200",
  },
  sout_lahn: {
    label: "صوت و لحن",
    icon: <Volume2 className="h-4 w-4" />,
    color: "bg-pink-100 text-pink-700 border-pink-200",
  },
};

function toFa(input: string | number | null | undefined): string {
  if (input == null) return "—";
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

function fileTypeIcon(type: string): ReactNode {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (type.startsWith("audio/")) return <FileAudio className="h-4 w-4" />;
  if (type.startsWith("video/")) return <FileVideo className="h-4 w-4" />;
  if (type.includes("pdf") || type.includes("word")) return <FileText className="h-4 w-4" />;
  return <FileIcon className="h-4 w-4" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getDeadlineDate(a: Assignment): Date {
  const created = new Date(a.created_at);
  return new Date(created.getTime() + (a.deadline_hours ?? 24) * 3600 * 1000);
}

function getRemainingMs(a: Assignment): number {
  return getDeadlineDate(a).getTime() - Date.now();
}

function getRemainingPercent(a: Assignment): number {
  const total = Math.max(1, (a.deadline_hours ?? 24) * 3600 * 1000);
  const remaining = Math.max(0, getRemainingMs(a));
  return Math.round((remaining / total) * 100);
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "۰۰:۰۰:۰۰";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function canResubmit(submission: Submission | null): boolean {
  return submission?.status === "needs_revision" || submission?.status === "rejected";
}

/* ================================================================== */
/* Types                                                              */
/* ================================================================== */
interface Assignment {
  id: string;
  title: string;
  description: string;
  audio_url: string | null;
  attachments: { id: string; name: string; url: string; type: string; size: number }[];
  due_date: string;
  due_time: string | null;
  deadline_hours: number;
  type: string;
  is_required: boolean;
  notes: string;
  teacher_id: string;
  class_id: string;
  target_type: string;
  target_students: string[];
  session_date: string | null;
  created_at: string;
}

interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_at: string;
  type: "audio" | "file" | "text";
  content: string;
  file_url: string | null;
  audio_url: string | null;
  reviewed: boolean;
  grade: number | null;
  feedback: string | null;
  feedback_audio_url: string | null;
  status: "pending" | "approved" | "needs_revision" | "rejected";
  reviewed_at: string | null;
}

interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

interface AudioClip {
  url: string;
  duration: number;
  blob?: Blob;
}

const STATUS_INFO: Record<string, { label: string; color: string; icon: ReactNode }> = {
  pending: {
    label: "در انتظار بررسی",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    label: "تأیید شده",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  needs_revision: {
    label: "نیاز به اصلاح",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  rejected: {
    label: "رد شده",
    color: "bg-rose-100 text-rose-700 border-rose-200",
    icon: <X className="h-3 w-3" />,
  },
};

/* ================================================================== */
/* کامپوننت اصلی                                                     */
/* ================================================================== */
function StudentAssignments() {
  const [student, setStudent] = useState<CurrentStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // دیالوگ ارسال
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState<Assignment | null>(null);
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const s = await getCurrentStudent();
        setStudent(s);
        if (s) await loadAll(s);
      } catch (err) {
        console.error("[student assignments] خطا:", err);
      }
      setLoading(false);
    })();
  }, []);

  async function loadAll(s: CurrentStudent) {
    if (!s.class_id) {
      setAssignments([]);
      setSubmissions([]);
      return;
    }

    // ۱. تکالیف کلاس این قرآن‌آموز
    const { data: aList } = await supabase
      .from("assignments")
      .select("*")
      .eq("class_id", s.class_id)
      .order("created_at", { ascending: false });
    const list = ((aList ?? []) as Assignment[]).filter((a) => {
      if (a.target_type === "all") return true;
      return Array.isArray(a.target_students) && a.target_students.includes(s.id);
    });
    setAssignments(list);

    // ۲. ارسال‌های این قرآن‌آموز
    const { data: subs } = await supabase.from("submissions").select("*").eq("student_id", s.id);
    setSubmissions(
      ((subs ?? []) as Submission[]).filter((s) => list.some((a) => a.id === s.assignment_id)),
    );

    // ۳. نام استادها
    const teacherIds = Array.from(new Set(list.map((a) => String(a.teacher_id)).filter(Boolean)));
    if (teacherIds.length > 0) {
      const { data: teachers } = await supabase
        .from("teachers")
        .select("id, name")
        .in("id", teacherIds);
      const map: Record<string, string> = {};
      for (const t of teachers ?? []) map[String(t.id)] = displayTeacherName(t.name);
      setTeacherNames(map);
    }
  }

  // محاسبه وضعیت هر تکلیف برای این قرآن‌آموز
  const enriched = useMemo(() => {
    return assignments.map((a) => {
      const allSubmissions = submissions
        .filter((s) => s.assignment_id === a.id)
        .sort((x, y) => new Date(y.submitted_at).getTime() - new Date(x.submitted_at).getTime());
      const mySub = allSubmissions[0];
      const expired = getRemainingMs(a) <= 0;
      return { assignment: a, submission: mySub ?? null, allSubmissions, expired };
    });
  }, [assignments, submissions]);

  const filtered = useMemo(() => {
    if (filterStatus === "all") return enriched;
    if (filterStatus === "pending") {
      // منتظر ارسال (هنوز ارسال نکرده و منقضی نشده)
      return enriched.filter((e) => !e.submission && !e.expired);
    }
    if (filterStatus === "submitted") {
      // ارسال شده ولی هنوز بررسی نشده
      return enriched.filter((e) => e.submission && !e.submission.reviewed);
    }
    if (filterStatus === "reviewed") {
      // بررسی شده (تأیید/رد/اصلاح)
      return enriched.filter((e) => e.submission?.reviewed);
    }
    if (filterStatus === "expired") {
      // منقضی شده و ارسال نشده
      return enriched.filter((e) => e.expired && !e.submission);
    }
    return enriched;
  }, [enriched, filterStatus]);

  // آمار
  const stats = useMemo(() => {
    let pending = 0,
      submitted = 0,
      reviewed = 0,
      expired = 0;
    for (const e of enriched) {
      if (!e.submission && !e.expired) pending++;
      else if (e.submission && !e.submission.reviewed) submitted++;
      else if (e.submission?.reviewed) reviewed++;
      else if (e.expired && !e.submission) expired++;
    }
    return { pending, submitted, reviewed, expired, total: enriched.length };
  }, [enriched]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری...</span>
      </div>
    );
  }

  if (!student) {
    return (
      <Card className="student-empty-card p-12 text-center">
        <h3 className="font-display text-lg">اطلاعات قرآن‌آموز یافت نشد</h3>
      </Card>
    );
  }

  return (
    <>
      <style>{studentAssignmentsStyle}</style>
      <PageHeader title="تکالیف من" description={`تکالیف کلاس ${student.class_name ?? ""}`} />

      <Card className="student-assignments-hero relative mb-6 overflow-hidden border-0 p-5 md:p-6 text-white shadow-xl">
        <div className="student-assignments-pattern absolute inset-0 opacity-35" />
        <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-gold/25 blur-3xl" />
        <div className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-emerald-300/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-gold ring-1 ring-white/20 backdrop-blur-sm">
              <ClipboardList className="h-7 w-7" />
            </div>
            <div>
              <Badge className="mb-2 border-gold/30 bg-white/10 text-amber-100 hover:bg-white/15">
                دفتر تکالیف قرآن‌آموز
              </Badge>
              <h2 className="font-display text-2xl font-black md:text-3xl">
                تکالیف و تمرین‌های من
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50/75">
                تکالیف فعال، زمان باقی‌مانده، بازخورد استاد و تاریخچه ارسال‌های شما در یک نمای منظم.
              </p>
            </div>
          </div>
          <Badge className="w-fit bg-gold text-gold-foreground border-0">
            {student.class_name ?? "کلاس شما"}
          </Badge>
        </div>
      </Card>

      {/* آمار */}
      <div className="student-assignments-stats grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SimpleStat label="در انتظار ارسال" value={stats.pending} color="amber" icon={<Clock />} />
        <SimpleStat
          label="ارسال‌شده در انتظار بررسی"
          value={stats.submitted}
          color="blue"
          icon={<Send />}
        />
        <SimpleStat
          label="بررسی‌شده"
          value={stats.reviewed}
          color="emerald"
          icon={<CheckCircle2 />}
        />
        <SimpleStat label="منقضی‌شده" value={stats.expired} color="rose" icon={<AlertCircle />} />
      </div>

      {/* فیلتر */}
      <Card className="student-filter-card p-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { v: "all", l: "همه", c: "" },
            { v: "pending", l: `در انتظار ارسال (${toFa(stats.pending)})`, c: "text-amber-700" },
            { v: "submitted", l: "ارسال‌شده", c: "text-blue-700" },
            { v: "reviewed", l: "بررسی‌شده", c: "text-emerald-700" },
            { v: "expired", l: "منقضی‌شده", c: "text-rose-700" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setFilterStatus(f.v)}
              className={
                "px-3 py-1.5 text-xs rounded-md transition " +
                (filterStatus === f.v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted " + f.c)
              }
            >
              {f.l}
            </button>
          ))}
        </div>
      </Card>

      {/* لیست */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-display text-lg mb-1">
            {enriched.length === 0
              ? "هنوز تکلیفی برای شما تعریف نشده"
              : "تکلیفی با این فیلتر یافت نشد"}
          </h3>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ assignment, submission, allSubmissions, expired }) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              submission={submission}
              allSubmissions={allSubmissions}
              expired={expired}
              teacherName={teacherNames[String(assignment.teacher_id)] ?? null}
              onSubmit={() => {
                setSubmittingAssignment(assignment);
                setSubmitOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* دیالوگ ارسال تکلیف */}
      {submitOpen && submittingAssignment && (
        <SubmitAssignmentDialog
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          assignment={submittingAssignment}
          existingSubmission={
            submissions
              .filter((s) => s.assignment_id === submittingAssignment.id)
              .sort(
                (x, y) => new Date(y.submitted_at).getTime() - new Date(x.submitted_at).getTime(),
              )[0] ?? null
          }
          previousSubmissions={submissions
            .filter((s) => s.assignment_id === submittingAssignment.id)
            .sort(
              (x, y) => new Date(y.submitted_at).getTime() - new Date(x.submitted_at).getTime(),
            )}
          student={student}
          onSubmitted={() => {
            setSubmitOpen(false);
            setSubmittingAssignment(null);
            loadAll(student);
          }}
        />
      )}
    </>
  );
}

/* ================================================================== */
/* نوار زمان معکوس تکلیف                                             */
/* ================================================================== */
function CountdownLine({ assignment }: { assignment: Assignment }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = getDeadlineDate(assignment).getTime() - now;
  const percent = getRemainingPercent(assignment);
  const expired = remaining <= 0;
  const barColor = expired
    ? "bg-rose-500"
    : percent > 50
      ? "bg-emerald-500"
      : percent > 25
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="countdown-line mb-3 rounded-xl border border-border/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          زمان باقی‌مانده
        </span>
        <span
          className={
            expired ? "font-bold text-rose-700" : "font-display font-bold text-emerald-800"
          }
        >
          {expired ? "مهلت تمام شده" : toFa(formatRemaining(remaining))}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border/60">
        <div
          className={"h-full rounded-full transition-all duration-1000 " + barColor}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1 text-left text-[10px] text-muted-foreground">
        {expired ? "۰٪" : `${toFa(percent)}٪`}
      </div>
    </div>
  );
}

/* ================================================================== */
/* کارت تکلیف                                                        */
/* ================================================================== */
function AssignmentCard({
  assignment,
  submission,
  allSubmissions,
  expired,
  teacherName,
  onSubmit,
}: {
  assignment: Assignment;
  submission: Submission | null;
  allSubmissions: Submission[];
  expired: boolean;
  teacherName: string | null;
  onSubmit: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const typeInfo = TYPE_LABELS[assignment.type] ?? TYPE_LABELS.hifz;
  const status = submission?.status ?? "pending";
  const statusInfo = submission ? STATUS_INFO[status] : null;

  return (
    <Card className="student-assignment-card p-4 transition">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge className={`${typeInfo.color} border gap-1`}>
              {typeInfo.icon}
              {typeInfo.label}
            </Badge>
            {statusInfo && (
              <Badge className={`${statusInfo.color} border gap-1`}>
                {statusInfo.icon}
                {statusInfo.label}
              </Badge>
            )}
            {assignment.is_required && !submission && (
              <Badge variant="outline" className="text-rose-700 border-rose-200">
                اجباری
              </Badge>
            )}
            {expired && !submission && (
              <Badge variant="outline" className="text-rose-700 border-rose-200">
                منقضی شده
              </Badge>
            )}
          </div>
          <h3 className="font-display text-lg leading-tight mb-1">{assignment.title}</h3>
          {assignment.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{assignment.description}</p>
          )}
        </div>
      </div>

      {/* اطلاعات */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-muted-foreground mb-3">
        {teacherName && (
          <div className="flex items-center gap-1.5">
            <span className="text-foreground font-medium">{teacherName}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <span>مهلت: {assignment.due_date}</span>
        </div>
        {submission?.submitted_at && (
          <div className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" />
            <span>ارسال: {submission.submitted_at}</span>
          </div>
        )}
      </div>

      <CountdownLine assignment={assignment} />

      {/* فیدبک معلم */}
      {submission?.reviewed && (
        <Card className="student-feedback-card p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Award className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">بازخورد استاد</span>
            {submission.grade != null && <GradeDisplay grade={submission.grade} />}
          </div>
          {submission.feedback && (
            <p className="text-sm text-foreground/90 mb-2">{submission.feedback}</p>
          )}
          {submission.feedback_audio_url && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-1">
                <FileAudio className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs">فایل صوتی اصلاحی:</span>
              </div>
              <SecureAssignmentAudio
                reference={submission.feedback_audio_url}
                controls
                className="w-full h-9"
              />
            </div>
          )}
        </Card>
      )}

      {/* دکمه‌ها */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {!submission && !expired && (
            <Button onClick={onSubmit} className="gap-2">
              <Send className="h-4 w-4" />
              ارسال تکلیف
            </Button>
          )}
          {!submission && expired && (
            <Button disabled variant="outline" className="gap-2">
              <Clock className="h-4 w-4" />
              مهلت تمام شده
            </Button>
          )}
          {submission && canResubmit(submission) && (
            <Button onClick={onSubmit} className="gap-2" variant="outline">
              <Send className="h-4 w-4" />
              ارسال مجدد
            </Button>
          )}
          {submission && !canResubmit(submission) && (
            <Badge variant="outline" className="text-emerald-700 border-emerald-200 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {submission.status === "approved" ? "تأیید شده" : "ارسال شما ثبت شده"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {allSubmissions.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 border-primary/30 text-primary history-button"
              onClick={() => setHistoryOpen(true)}
            >
              <Clock className="h-3 w-3" />
              {toFa(allSubmissions.length)} ارسال در تاریخچه
            </Button>
          )}
          {assignment.attachments.length > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <Paperclip className="h-3 w-3" />
              {toFa(assignment.attachments.length)} فایل ضمیمه
            </Badge>
          )}
        </div>
      </div>

      <SubmissionHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        assignmentTitle={assignment.title}
        submissions={allSubmissions}
      />
    </Card>
  );
}

function SubmissionHistoryDialog({
  open,
  onOpenChange,
  assignmentTitle,
  submissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentTitle: string;
  submissions: Submission[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="student-history-dialog max-w-3xl max-h-[85vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>تاریخچه ارسال‌های تکلیف</DialogTitle>
          <DialogDescription>{assignmentTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {submissions.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
              هنوز ارسالی برای این تکلیف ثبت نشده است.
            </div>
          ) : (
            submissions.map((submission, index) => {
              const info = STATUS_INFO[submission.status] ?? STATUS_INFO.pending;
              return (
                <Card key={submission.id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">تلاش {toFa(submissions.length - index)}</Badge>
                        <Badge className={`${info.color} border gap-1`}>
                          {info.icon}
                          {info.label}
                        </Badge>
                        {submission.reviewed && (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-200">
                            بررسی شده
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        زمان ارسال: {new Date(submission.submitted_at).toLocaleString("fa-IR")}
                      </div>
                    </div>
                    {submission.grade != null && <GradeDisplay grade={submission.grade} />}
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    {submission.content && (
                      <div className="rounded-xl border bg-muted/25 p-3">
                        <div className="mb-1 text-xs text-muted-foreground">متن ارسالی</div>
                        <p className="whitespace-pre-wrap leading-7">{submission.content}</p>
                      </div>
                    )}
                    {submission.audio_url && (
                      <div className="rounded-xl border bg-muted/25 p-3">
                        <div className="mb-2 text-xs text-muted-foreground">فایل صوتی ارسالی</div>
                        <SecureAssignmentAudio
                          reference={submission.audio_url}
                          controls
                          className="w-full"
                        />
                      </div>
                    )}
                    {submission.file_url && (
                      <SecureAssignmentFileLink
                        reference={submission.file_url}
                        className="flex items-center gap-2 rounded-xl border bg-muted/25 p-3 hover:bg-muted/40"
                      >
                        <Paperclip className="h-4 w-4" />
                        <span className="flex-1">مشاهده / دانلود فایل ارسالی</span>
                      </SecureAssignmentFileLink>
                    )}
                    {submission.feedback && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-800">
                        <div className="mb-1 text-xs font-bold">بازخورد استاد</div>
                        <p className="whitespace-pre-wrap leading-7">{submission.feedback}</p>
                      </div>
                    )}
                    {submission.feedback_audio_url && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                        <div className="mb-2 text-xs font-bold text-blue-800">
                          بازخورد صوتی استاد
                        </div>
                        <SecureAssignmentAudio
                          reference={submission.feedback_audio_url}
                          controls
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/* دیالوگ ارسال تکلیف                                                */
/* ================================================================== */
function SubmitAssignmentDialog({
  open,
  onOpenChange,
  assignment,
  existingSubmission,
  previousSubmissions,
  student,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assignment: Assignment;
  existingSubmission: Submission | null;
  previousSubmissions: Submission[];
  student: CurrentStudent;
  onSubmitted: () => void;
}) {
  const [type, setType] = useState<"audio" | "file" | "text">("text");
  const [content, setContent] = useState(
    existingSubmission?.status === "needs_revision" || existingSubmission?.status === "rejected"
      ? (existingSubmission.content ?? "")
      : "",
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleSubmit() {
    setSaving(true);
    try {
      const payload: any = {
        assignment_id: assignment.id,
        student_id: student.id,
        submitted_at: new Date().toISOString(),
        type,
        content: content || "",
        file_url: files[0]?.url ?? null,
        audio_url: audioUrl,
        reviewed: false,
        status: "pending",
        attempt_no: previousSubmissions.length + 1,
      };
      // ارسال مجدد نباید رکورد قبلی را پاک/ویرایش کند؛
      // هر بار یک رکورد جدید ثبت می‌شود تا تاریخچه همه تلاش‌ها محفوظ بماند.
      const { error } = await supabase.from("submissions").insert(payload);
      if (error) throw error;
      toast.success(
        existingSubmission && canResubmit(existingSubmission)
          ? "ارسال مجدد با موفقیت ثبت شد"
          : "تکلیف با موفقیت ارسال شد",
      );
      onSubmitted();
    } catch (err: any) {
      console.error("Submit error:", err);
      const message = String(err?.message ?? "خطای نامشخص");
      if (message.toLowerCase().includes("duplicate") || message.includes("unique")) {
        toast.error(
          "ارسال مجدد ممکن نشد؛ لطفاً صفحه را تازه‌سازی کرده و دوباره تلاش کنید.",
        );
      } else {
        toast.error("خطا در ارسال تکلیف: " + message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="student-submit-dialog max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {existingSubmission && canResubmit(existingSubmission)
              ? "ارسال مجدد تکلیف"
              : "ارسال تکلیف"}
            : {assignment.title}
          </DialogTitle>
          <DialogDescription>
            {existingSubmission && canResubmit(existingSubmission)
              ? "استاد این تکلیف را نیازمند اصلاح یا رد شده ثبت کرده است؛ می‌توانید نسخه اصلاح‌شده را دوباره ارسال کنید. ارسال قبلی در تاریخچه باقی می‌ماند."
              : "نوع ارسال را انتخاب کرده و محتوای تکلیف خود را بارگذاری کنید."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 px-1">
          {/* توضیحات تکلیف */}
          {assignment.description && (
            <Card className="p-3 bg-muted/30">
              <h4 className="text-xs font-medium text-muted-foreground mb-1">شرح تکلیف:</h4>
              <p className="text-sm whitespace-pre-wrap">{assignment.description}</p>
            </Card>
          )}

          {/* فایل صوتی استاد */}
          {assignment.audio_url && (
            <Card className="p-3 bg-primary/5 border-primary/20">
              <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <FileAudio className="h-3.5 w-3.5" />
                فایل صوتی توضیح استاد:
              </h4>
              <SecureAssignmentAudio
                reference={assignment.audio_url}
                controls
                className="w-full h-9"
              />
            </Card>
          )}

          {/* فایل‌های ضمیمه استاد */}
          {assignment.attachments.length > 0 && (
            <Card className="p-3">
              <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5" />
                فایل‌های ضمیمه استاد:
              </h4>
              <div className="space-y-1.5">
                {assignment.attachments.map((f) => (
                  <SecureAssignmentFileLink
                    key={f.id}
                    reference={f.url}
                    className="flex items-center gap-2 p-2 bg-muted/30 rounded text-sm hover:bg-muted/50"
                  >
                    {fileTypeIcon(f.type)}
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                  </SecureAssignmentFileLink>
                ))}
              </div>
            </Card>
          )}

          {existingSubmission && canResubmit(existingSubmission) && (
            <Card className="border-blue-200 bg-blue-50 p-3 text-blue-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-sm">
                  <p className="font-bold">امکان ارسال مجدد فعال است.</p>
                  {existingSubmission.feedback && (
                    <p className="mt-1 leading-6">بازخورد استاد: {existingSubmission.feedback}</p>
                  )}
                </div>
              </div>
            </Card>
          )}

          {previousSubmissions.length > 0 && (
            <Card className="p-3 border-border/70 bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold">تاریخچه ارسال‌های قبلی</h4>
                <Badge variant="outline" className="text-xs">
                  {toFa(previousSubmissions.length)} ارسال
                </Badge>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {previousSubmissions.map((submission, index) => {
                  const info = STATUS_INFO[submission.status] ?? STATUS_INFO.pending;
                  return (
                    <div key={submission.id} className="rounded-xl border bg-card p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground">
                          ارسال {toFa(previousSubmissions.length - index)} •{" "}
                          {new Date(submission.submitted_at).toLocaleDateString("fa-IR")}
                        </div>
                        <Badge className={`${info.color} border gap-1 text-[10px]`}>
                          {info.icon}
                          {info.label}
                        </Badge>
                      </div>
                      {submission.grade != null && (
                        <div className="mt-1 text-muted-foreground">
                          نمره: {toFa(submission.grade)} / ۲۰
                        </div>
                      )}
                      {submission.feedback && (
                        <div className="mt-1 text-blue-700">بازخورد: {submission.feedback}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* انتخاب نوع ارسال */}
          <div>
            <Label className="text-sm font-medium mb-2 block">نوع ارسال</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "text", l: "متن", icon: <FileText className="h-4 w-4" /> },
                { v: "audio", l: "ضبط صوتی", icon: <Mic className="h-4 w-4" /> },
                { v: "file", l: "فایل", icon: <Upload className="h-4 w-4" /> },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setType(opt.v as any)}
                  className={
                    "p-3 rounded-lg border-2 transition flex flex-col items-center gap-1 text-sm " +
                    (type === opt.v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50")
                  }
                >
                  {opt.icon}
                  <span>{opt.l}</span>
                </button>
              ))}
            </div>
          </div>

          {/* محتوا بر اساس نوع */}
          {type === "text" && (
            <div>
              <Label className="text-sm font-medium mb-2 block">متن پاسخ</Label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="پاسخ خود را اینجا بنویسید..."
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
          )}

          {type === "audio" && (
            <div>
              <Label className="text-sm font-medium mb-2 block">ضبط صوتی پاسخ</Label>
              <StudentAudioRecorder
                studentId={student.id}
                onRecorded={(url, duration) => {
                  setAudioUrl(url);
                  setAudioDuration(duration);
                }}
                onClear={() => {
                  setAudioUrl(null);
                  setAudioDuration(0);
                }}
              />
            </div>
          )}

          {type === "file" && (
            <div>
              <Label className="text-sm font-medium mb-2 block">بارگذاری فایل</Label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 hover:bg-muted/30 transition"
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  فایل را انتخاب کنید (PDF، تصویر، صوت، ویدیو)
                </p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  e.target.value = "";
                  setUploadingFile(true);
                  try {
                    const uploaded = await uploadAssignmentFile(f, `submissions/${student.id}`);
                    if (!uploaded) {
                      toast.error("خطا در بارگذاری فایل. لطفاً دوباره تلاش کنید.");
                      return;
                    }
                    setFiles([
                      {
                        id: Math.random().toString(36).slice(2),
                        name: f.name,
                        url: uploaded.url,
                        type: f.type,
                        size: f.size,
                      },
                    ]);
                  } finally {
                    setUploadingFile(false);
                  }
                }}
              />
              {uploadingFile && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  در حال بارگذاری فایل...
                </div>
              )}
              {files.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                      {fileTypeIcon(f.type)}
                      <span className="text-sm flex-1 truncate">{f.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {formatBytes(f.size)}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setFiles([])}
                        className="h-7 w-7 text-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* یادداشت اضافی (اختیاری) */}
          <div>
            <Label className="text-sm font-medium mb-2 block">یادداشت اضافی (اختیاری)</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="اگر توضیحی دارید اینجا بنویسید..."
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>
        </div>

        {/* فوتر */}
        <div className="border-t pt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || uploadingFile || (!content && !audioUrl && files.length === 0)}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {existingSubmission && canResubmit(existingSubmission) ? "ارسال مجدد" : "ارسال نهایی"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/* ضبط صوتی قرآن‌آموز                                                 */
/* ================================================================== */
function StudentAudioRecorder({
  studentId,
  onRecorded,
  onClear,
}: {
  studentId: string;
  onRecorded: (url: string, duration: number) => void;
  onClear: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [savedDuration, setSavedDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("مرورگر شما از ضبط صوتی پشتیبانی نمی‌کند.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const duration = recordingTime;
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setUploading(true);
        try {
          const uploaded = await uploadAssignmentAudio(blob, `submissions/${studentId}`);
          if (!uploaded) {
            toast.error("خطا در بارگذاری فایل صوتی. لطفاً دوباره تلاش کنید.");
            return;
          }
          setAudioUrl(uploaded.url);
          setSavedDuration(duration);
          onRecorded(uploaded.url, duration);
        } finally {
          setUploading(false);
          setRecordingTime(0);
        }
      };
      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.error("Recording error:", err);
      toast.error("خطا در دسترسی به میکروفون. لطفاً اجازه دهید.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  function deleteRecording() {
    setAudioUrl(null);
    setSavedDuration(0);
    onClear();
  }

  function togglePlay() {
    if (!audioRef.current || !audioUrl) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  }

  if (uploading) {
    return (
      <div className="flex items-center gap-3 p-3 bg-muted/30 border border-dashed rounded-lg">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال بارگذاری فایل صوتی...</span>
      </div>
    );
  }

  if (audioUrl) {
    return (
      <div className="space-y-2">
        <SecureAssignmentAudio
          ref={audioRef}
          reference={audioUrl}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={togglePlay}
            className="shrink-0"
          >
            {playing ? <PauseCircle className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <FileAudio className="h-4 w-4 text-emerald-700" />
            <span className="text-sm">ضبط صوتی آماده شد</span>
            <Badge variant="outline" className="text-xs">
              {formatDuration(savedDuration)}
            </Badge>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={deleteRecording}
            className="text-rose-600 hover:bg-rose-50"
            title="حذف"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/30 border border-dashed rounded-lg">
      {recording ? (
        <>
          <div className="flex items-center gap-2 flex-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <span className="text-sm font-medium text-rose-700">در حال ضبط...</span>
            <Badge variant="outline" className="text-xs">
              {formatDuration(recordingTime)}
            </Badge>
          </div>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={stopRecording}
            className="gap-1"
          >
            <Square className="h-3.5 w-3.5" />
            توقف
          </Button>
        </>
      ) : (
        <>
          <Mic className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground flex-1">
            برای شروع ضبط، روی میکروفون کلیک کنید
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={startRecording}
            className="gap-1"
          >
            <Mic className="h-3.5 w-3.5" />
            شروع ضبط
          </Button>
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* کامپوننت‌های کمکی                                                  */
/* =================================================================-- */
function SimpleStat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: "amber" | "blue" | "emerald" | "rose";
  icon: ReactNode;
}) {
  const colors = {
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    rose: "text-rose-700 bg-rose-50 border-rose-100",
  }[color];

  return (
    <Card className={`p-3 border ${colors}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs opacity-80 mb-0.5">{label}</div>
          <div className="font-display text-xl">{toFa(value)}</div>
        </div>
        <div className={`rounded-lg p-2 ${colors}`}>{icon}</div>
      </div>
    </Card>
  );
}

function GradeDisplay({ grade }: { grade: number }) {
  let colorClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
  let icon = <TrendingUp className="h-3.5 w-3.5" />;
  if (grade < 10) {
    colorClass = "bg-rose-100 text-rose-700 border-rose-200";
    icon = <TrendingDown className="h-3.5 w-3.5" />;
  } else if (grade < 15) {
    colorClass = "bg-amber-100 text-amber-700 border-amber-200";
    icon = <AlertCircle className="h-3.5 w-3.5" />;
  }
  return (
    <Badge className={`${colorClass} gap-1 px-2.5 py-1`}>
      <Star className="h-3.5 w-3.5" />
      <span className="font-display">{toFa(grade.toFixed(1))}</span>
      <span className="text-xs opacity-70">/۲۰</span>
    </Badge>
  );
}

const studentAssignmentsStyle = `
.student-assignments-hero {
  background:
    radial-gradient(circle at 15% 20%, rgba(212, 175, 55, 0.28), transparent 30%),
    radial-gradient(circle at 85% 20%, rgba(16, 185, 129, 0.18), transparent 28%),
    linear-gradient(135deg, #064E3B 0%, #065F46 48%, #047857 100%);
  border-radius: 2rem;
}
.student-assignments-pattern {
  background-image:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,.22) 0 2px, transparent 2.8px),
    linear-gradient(45deg, transparent 0 48%, rgba(255,255,255,.10) 49% 50%, transparent 51%);
  background-size: 72px 72px, 36px 36px;
}
.student-assignments-stats > *,
.student-filter-card,
.student-empty-card,
.student-assignment-card,
.student-submit-dialog,
.student-history-dialog {
  border: 1px solid rgba(212, 175, 55, 0.16) !important;
  background: linear-gradient(135deg, #ffffff, #FFF8E7 125%) !important;
  border-radius: 1.75rem !important;
  box-shadow: 0 12px 32px rgba(6, 78, 59, .06) !important;
}
.student-assignment-card {
  position: relative;
  overflow: hidden;
}
.student-assignment-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: .18;
  background-image:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,.18) 0 2px, transparent 2.8px),
    linear-gradient(45deg, transparent 0 48%, rgba(6,78,59,.05) 49% 50%, transparent 51%);
  background-size: 72px 72px, 38px 38px;
}
.student-assignment-card > * {
  position: relative;
  z-index: 1;
}
.student-assignment-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 42px rgba(6, 78, 59, .12) !important;
}
.student-assignment-card h3 {
  color: #064E3B;
  font-weight: 900;
}
.countdown-line {
  background: linear-gradient(135deg, rgba(6,78,59,.04), rgba(212,175,55,.08));
  border-color: rgba(212,175,55,.18) !important;
}
.student-feedback-card {
  border: 1px solid rgba(212,175,55,.22) !important;
  background: linear-gradient(135deg, rgba(6,78,59,.05), rgba(212,175,55,.10)) !important;
  border-radius: 1.25rem !important;
}
.history-button {
  border-radius: 999px;
  background: rgba(6,78,59,.04);
}
.student-submit-dialog [data-slot="dialog-header"],
.student-history-dialog [data-slot="dialog-header"] {
  border-bottom: 1px solid rgba(212,175,55,.18);
  padding-bottom: .75rem;
}
.student-filter-card button {
  border-radius: .9rem;
}
.student-filter-card button.bg-primary {
  background: #064E3B !important;
}
`;
