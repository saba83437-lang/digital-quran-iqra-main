import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Award,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Download,
  FileAudio,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SecureAssignmentAudio,
  SecureAssignmentFileLink,
} from "@/features/assignments/components/secure-assignment-file";
import {
  loadParentAssignmentsSnapshot,
  type ParentSubmissionRow,
} from "@/features/assignments/api/parent-assignments-api";
import {
  buildParentAssignmentRows,
  type ParentAssignmentState,
  type ParentAssignmentViewRow,
} from "@/features/assignments/domain/parent-assignments-domain";
import { useParentPortal } from "@/hooks/use-parent-portal";
import { useParentChildSelection } from "@/features/parent/parent-child-selection";

export const Route = createFileRoute("/parent/assignments")({
  head: () => ({
    meta: [
      { title: "تکالیف فرزندان — پنل والدین" },
      { name: "description", content: "مشاهده تکالیف، تلاش‌ها و بازخورد استاد" },
    ],
  }),
  component: ParentAssignments,
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function stateLabel(state: ParentAssignmentState): string {
  if (state === "pending") return "منتظر ارسال";
  if (state === "expired") return "مهلت پایان یافته";
  if (state === "submitted") return "در انتظار بررسی";
  if (state === "approved") return "تأییدشده";
  if (state === "needs_revision") return "نیاز به اصلاح";
  return "ردشده";
}

function ParentAssignments() {
  const portal = useParentPortal();
  const [assignmentRows, setAssignmentRows] = useState<ParentAssignmentViewRow[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [assignmentRefreshing, setAssignmentRefreshing] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const { selectedId: childFilter, setSelectedId: setChildFilter } =
    useParentChildSelection(portal.data?.children ?? [], { allowAll: true });
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<ParentAssignmentViewRow | null>(null);

  const loadAssignments = useCallback(
    async (silent = false) => {
      if (!portal.data) return;
      if (silent) setAssignmentRefreshing(true);
      else setAssignmentLoading(true);
      setAssignmentError(null);
      try {
        const snapshot = await loadParentAssignmentsSnapshot();
        setAssignmentRows(
          buildParentAssignmentRows({
            children: portal.data.children.map((child) => ({
              id: child.id,
              name: child.name,
              class_id: child.class_id,
              class_name: child.class_name,
              teacher_name: child.teacher_name,
            })),
            assignments: snapshot.assignments,
            submissions: snapshot.submissions,
          }),
        );
      } catch (error) {
        setAssignmentError(error instanceof Error ? error.message : "خطا در دریافت تکالیف");
      } finally {
        setAssignmentLoading(false);
        setAssignmentRefreshing(false);
      }
    },
    [portal.data],
  );

  useEffect(() => {
    if (portal.data) void loadAssignments();
  }, [portal.data, loadAssignments]);

  const filteredRows = useMemo(
    () =>
      assignmentRows.filter(
        (row) =>
          (childFilter === "all" || String(row.child.id) === childFilter) &&
          (statusFilter === "all" || row.state === statusFilter),
      ),
    [assignmentRows, childFilter, statusFilter],
  );

  const stats = useMemo(
    () => ({
      total: assignmentRows.length,
      pending: assignmentRows.filter((row) => row.state === "pending").length,
      submitted: assignmentRows.filter((row) => row.state === "submitted").length,
      reviewed: assignmentRows.filter((row) =>
        ["approved", "needs_revision", "rejected"].includes(row.state),
      ).length,
    }),
    [assignmentRows],
  );

  if (portal.loading || (portal.data && assignmentLoading)) return <LoadingState />;
  if (!portal.data || portal.error)
    return (
      <ErrorState
        message={portal.error ?? "اطلاعات والد در دسترس نیست"}
        onRetry={() => void portal.refresh()}
      />
    );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="تکالیف فرزندان"
        description="مشاهده فقط‌خواندنی تکالیف، تاریخچه تلاش‌ها، نمره و بازخورد استاد"
        actions={
          <Button
            variant="outline"
            className="gap-2"
            disabled={portal.refreshing || assignmentRefreshing}
            onClick={async () => {
              await portal.refresh(true);
              await loadAssignments(true);
            }}
          >
            {portal.refreshing || assignmentRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            به‌روزرسانی
          </Button>
        }
      />

      {assignmentError && (
        <Card className="rounded-2xl border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="ml-2 inline h-4 w-4" />
          {assignmentError}
        </Card>
      )}

      <Card className="rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={childFilter} onValueChange={setChildFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه فرزندان</SelectItem>
              {portal.data.children.map((child) => (
                <SelectItem key={child.id} value={String(child.id)}>
                  {child.name} — {child.class_name ?? "بدون کلاس"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه وضعیت‌ها</SelectItem>
              <SelectItem value="pending">منتظر ارسال</SelectItem>
              <SelectItem value="submitted">در انتظار بررسی</SelectItem>
              <SelectItem value="approved">تأییدشده</SelectItem>
              <SelectItem value="needs_revision">نیاز به اصلاح</SelectItem>
              <SelectItem value="rejected">ردشده</SelectItem>
              <SelectItem value="expired">مهلت پایان یافته</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="کل تکالیف"
          value={toFa(stats.total)}
          icon={<BookOpenCheck className="h-5 w-5" />}
        />
        <StatCard
          label="منتظر ارسال"
          value={toFa(stats.pending)}
          icon={<Clock className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label="در انتظار بررسی"
          value={toFa(stats.submitted)}
          icon={<Send className="h-5 w-5" />}
          tone="primary"
        />
        <StatCard
          label="بررسی‌شده"
          value={toFa(stats.reviewed)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
        />
      </div>

      <Card className="overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-display text-lg font-black">فهرست تکالیف فرزندان</h2>
          <Badge variant="secondary">{toFa(filteredRows.length)} مورد</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">فرزند</TableHead>
                <TableHead className="text-right">تکلیف</TableHead>
                <TableHead className="text-right">استاد</TableHead>
                <TableHead className="text-right">مهلت</TableHead>
                <TableHead className="text-right">تلاش‌ها</TableHead>
                <TableHead className="text-right">آخرین نتیجه</TableHead>
                <TableHead className="text-right">جزئیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.child.name}</TableCell>
                  <TableCell>
                    <p className="font-bold">{row.assignment.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.child.class_name ?? "بدون کلاس"}
                    </p>
                  </TableCell>
                  <TableCell>{row.child.teacher_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.deadline.toLocaleString("fa-IR")}
                  </TableCell>
                  <TableCell>{toFa(row.attempts.length)}</TableCell>
                  <TableCell>
                    <StateBadge state={row.state} />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setSelected(row)}>
                      <History className="ml-1 h-3.5 w-3.5" />
                      مشاهده
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    تکلیفی با این فیلتر وجود ندارد.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AssignmentDetail row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AssignmentDetail({
  row,
  onClose,
}: {
  row: ParentAssignmentViewRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{row?.assignment.title ?? "جزئیات تکلیف"}</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4">
            <Card className="rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{row.child.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.child.class_name ?? "بدون کلاس"} — {row.child.teacher_name ?? "استاد"}
                  </p>
                </div>
                <StateBadge state={row.state} />
              </div>
              {row.assignment.description && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                  {row.assignment.description}
                </p>
              )}
              {row.assignment.notes && (
                <p className="mt-2 text-xs text-muted-foreground">{row.assignment.notes}</p>
              )}
            </Card>

            {row.assignment.audio_url && (
              <Card className="rounded-2xl p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <FileAudio className="h-4 w-4" /> توضیح صوتی استاد
                </p>
                <SecureAssignmentAudio
                  reference={row.assignment.audio_url}
                  controls
                  className="w-full"
                />
              </Card>
            )}

            {row.assignment.attachments.length > 0 && (
              <Card className="rounded-2xl p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <FileText className="h-4 w-4" /> فایل‌های تکلیف
                </p>
                <div className="space-y-2">
                  {row.assignment.attachments.map((file) => (
                    <SecureAssignmentFileLink
                      key={file.id}
                      reference={file.url}
                      className="flex items-center gap-2 rounded-xl border p-3 text-sm hover:bg-muted/40"
                    >
                      <Download className="h-4 w-4" />
                      <span className="flex-1 truncate">{file.name}</span>
                    </SecureAssignmentFileLink>
                  ))}
                </div>
              </Card>
            )}

            <div>
              <h3 className="mb-2 font-black">تاریخچه تلاش‌ها ({toFa(row.attempts.length)})</h3>
              <div className="space-y-3">
                {row.attempts.map((submission) => (
                  <AttemptCard key={submission.id} submission={submission} />
                ))}
                {row.attempts.length === 0 && (
                  <Card className="rounded-2xl p-5 text-center text-sm text-muted-foreground">
                    هنوز پاسخی ارسال نشده است.
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttemptCard({ submission }: { submission: ParentSubmissionRow }) {
  return (
    <Card className="rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-bold">تلاش {toFa(submission.attempt_no)}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(submission.submitted_at).toLocaleString("fa-IR")}
          </p>
        </div>
        <StateBadge state={submission.reviewed ? submission.status : "submitted"} />
      </div>

      {submission.content && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-sm leading-7">
          {submission.content}
        </p>
      )}
      {submission.audio_url && (
        <div className="mt-3">
          <SecureAssignmentAudio reference={submission.audio_url} controls className="w-full" />
        </div>
      )}
      {submission.file_url && (
        <SecureAssignmentFileLink
          reference={submission.file_url}
          className="mt-3 flex items-center gap-2 rounded-xl border p-3 text-sm hover:bg-muted/40"
        >
          <Download className="h-4 w-4" /> مشاهده فایل ارسالی
        </SecureAssignmentFileLink>
      )}

      {submission.reviewed && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
            <Award className="h-4 w-4" /> نتیجه بررسی استاد
          </div>
          {submission.grade != null && (
            <p className="mt-2 text-sm font-bold text-emerald-700">
              نمره: {toFa(submission.grade)} / ۲۰
            </p>
          )}
          {submission.feedback && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-blue-900">{submission.feedback}</p>
          )}
          {submission.feedback_audio_url && (
            <div className="mt-3">
              <SecureAssignmentAudio
                reference={submission.feedback_audio_url}
                controls
                className="w-full"
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function StateBadge({ state }: { state: ParentAssignmentState }) {
  const config: Record<ParentAssignmentState, { className: string; icon: ReactNode }> = {
    pending: { className: "bg-amber-100 text-amber-700", icon: <Clock className="h-3 w-3" /> },
    expired: { className: "bg-slate-100 text-slate-700", icon: <XCircle className="h-3 w-3" /> },
    submitted: { className: "bg-blue-100 text-blue-700", icon: <Send className="h-3 w-3" /> },
    approved: {
      className: "bg-emerald-100 text-emerald-700",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    needs_revision: {
      className: "bg-violet-100 text-violet-700",
      icon: <AlertCircle className="h-3 w-3" />,
    },
    rejected: { className: "bg-rose-100 text-rose-700", icon: <XCircle className="h-3 w-3" /> },
  };
  return (
    <Badge className={`border-0 gap-1 ${config[state].className}`}>
      {config[state].icon}
      {stateLabel(state)}
    </Badge>
  );
}

function LoadingState() {
  return (
    <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      در حال دریافت تکالیف فرزندان...
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="rounded-3xl p-10 text-center" dir="rtl">
      <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
      <p className="mt-3">{message}</p>
      <Button className="mt-4" onClick={onRetry}>
        تلاش مجدد
      </Button>
    </Card>
  );
}
