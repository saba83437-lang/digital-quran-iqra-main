import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Award,
  BookOpen,
  CalendarCheck,
  ChevronLeft,
  GraduationCap,
  Heart,
  Loader2,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { AchievementShowcaseCard } from "@/components/achievement-showcase";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useParentPortal } from "@/hooks/use-parent-portal";
import { formatToman, type ParentPortalChild } from "@/lib/parent-utils";
import {
  rememberParentChild,
  useParentChildSelection,
} from "@/features/parent/parent-child-selection";

export const Route = createFileRoute("/parent/")({
  head: () => ({
    meta: [
      { title: "داشبورد ولی — بِرّ الوالدین" },
      { name: "description", content: "نمای واقعی طرح نجم، شهریه و پیام‌های فرزندان" },
    ],
  }),
  component: ParentDashboard,
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}
function fixed(value: number | null, digits = 1): string {
  return value == null ? "—" : toFa(value.toFixed(digits));
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
}

function ParentDashboard() {
  const { data, loading, refreshing, error, refresh } = useParentPortal();

  if (loading) return <LoadingState />;
  if (!data || error)
    return (
      <ErrorState
        message={error ?? "اطلاعات والدین در دسترس نیست"}
        onRetry={() => void refresh()}
      />
    );

  const children = data.children;
  const attendanceValues = children.map((child) => child.stats.attendance_rate);
  const examValues = children
    .map((child) => child.stats.average_exam)
    .filter((value): value is number => value != null);
  const averageAttendance = attendanceValues.length
    ? attendanceValues.reduce((sum, value) => sum + value, 0) / attendanceValues.length
    : 0;
  const averageExam = examValues.length
    ? examValues.reduce((sum, value) => sum + value, 0) / examValues.length
    : null;
  const allPayments = children.flatMap((child) => child.payments);
  const overdueCount = allPayments.filter((payment) => payment.status === "overdue").length;
  const pendingCount = allPayments.filter((payment) => payment.status === "pending").length;
  const unread = data.messages.filter((message) => !message.is_sent && message.unread).length;

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title={`السلام علیکم، ${data.parent.name}`}
        description={`نمای واقعی فعالیت فرزندان از طرح نجم${data.active_term ? ` • ${data.active_term.title}` : ""}`}
        actions={
          <Button
            variant="outline"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void refresh(true)}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            به‌روزرسانی
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/parent/progress" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard
            label="فرزندان متصل"
            value={toFa(children.length)}
            hint="مشاهده پیشرفت فرزندان"
            icon={<Heart className="h-5 w-5" />}
          />
        </Link>
        <Link to="/parent/grades" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard
            label="میانگین آزمون نجم"
            value={averageExam == null ? "—" : `${fixed(averageExam)} / ۲۰`}
            hint="مشاهده نمرات ترم فعال"
            icon={<GraduationCap className="h-5 w-5" />}
            tone="gold"
          />
        </Link>
        <Link to="/parent/attendance" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard
            label="میانگین حضور نجم"
            value={`٪${toFa(Math.round(averageAttendance))}`}
            hint="مشاهده حضور ترم فعال"
            icon={<CalendarCheck className="h-5 w-5" />}
            tone="success"
          />
        </Link>
        <Link to="/parent/payments" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <StatCard
            label="پرداخت نیازمند پیگیری"
            value={toFa(overdueCount + pendingCount)}
            hint={overdueCount ? `${toFa(overdueCount)} مورد معوق` : "مشاهده پرداخت‌ها"}
            icon={<AlertCircle className="h-5 w-5" />}
            tone={overdueCount ? "warning" : "success"}
          />
        </Link>
      </div>

      {children.length === 0 ? (
        <Card className="rounded-3xl border-dashed p-12 text-center text-muted-foreground">
          فرزندی به این حساب متصل نشده است.
        </Card>
      ) : (
        <>
          <section>
            <h2 className="mb-3 font-display text-xl font-black">فرزندان شما</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {children.map((child) => (
                <ChildOverviewCard key={child.id} child={child} />
              ))}
            </div>
          </section>
          {/* ویترین کامل افتخارات داخل داشبورد (به‌جای صفحه‌ی جداگانه) */}
          <ParentAchievementsSection children={children} />
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <Card className="rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display flex items-center gap-2 text-lg font-black">
              <BookOpen className="h-5 w-5 text-primary" />
              آخرین ارزیابی‌های نجم
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/parent/progress">
                مشاهده پیشرفت <ChevronLeft className="mr-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="space-y-2">
            {children
              .flatMap((child) =>
                child.current_records.slice(0, 2).map((record) => ({ child, record })),
              )
              .slice(0, 8)
              .map(({ child, record }) => (
                <div
                  key={`${child.id}-${record.id}`}
                  className="flex items-center gap-3 rounded-2xl border bg-secondary/20 p-3"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {initials(child.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {child.name} • {record.session_date}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      آزمون {toFa(record.exam_display)} • تکلیف {toFa(record.homework)}/۵ • انضباط{" "}
                      {toFa(record.discipline)}/۵
                    </p>
                  </div>
                  <Badge
                    className={
                      record.is_absent
                        ? "border-0 bg-rose-100 text-rose-700"
                        : "border-0 bg-emerald-100 text-emerald-700"
                    }
                  >
                    {record.is_absent ? "غایب" : `${toFa(record.session_score)} / ۳۰`}
                  </Badge>
                </div>
              ))}
            {children.every((child) => child.current_records.length === 0) && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                هنوز ارزیابی نجمی ثبت نشده است.
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-3xl p-5">
            <h2 className="font-display flex items-center gap-2 font-black">
              <Wallet className="h-5 w-5 text-primary" />
              خلاصه شهریه
            </h2>
            <div className="mt-4 space-y-2">
              {children.map((child) => {
                const latestPayment = child.payments.find(
                  (payment) => payment.status !== "cancelled",
                );
                return (
                  <div
                    key={child.id}
                    className="flex items-center justify-between border-b py-2 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{child.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {latestPayment?.semester ?? "صورتحساب ندارد"}
                      </p>
                    </div>
                    {latestPayment ? (
                      <div className="text-left">
                        <p className="text-xs font-bold">{formatToman(latestPayment.amount)}</p>
                        <PaymentBadge status={latestPayment.status} />
                      </div>
                    ) : (
                      <Badge variant="outline">بدون صورتحساب</Badge>
                    )}
                  </div>
                );
              })}
            </div>
            <Button asChild className="mt-4 w-full">
              <Link to="/parent/payments">مشاهده پرداخت‌ها</Link>
            </Button>
          </Card>

          <Card className="rounded-3xl p-5">
            <h2 className="font-display flex items-center gap-2 font-black">
              <MessageSquare className="h-5 w-5 text-primary" />
              پیام‌های واقعی{" "}
              {unread > 0 && (
                <Badge className="border-0 bg-amber-500 text-white">{toFa(unread)}</Badge>
              )}
            </h2>
            <div className="mt-3 space-y-2">
              {data.messages
                .filter((message) => !message.is_sent)
                .slice(0, 3)
                .map((message) => (
                  <div key={message.id} className="rounded-xl bg-secondary/30 p-2.5">
                    <div className="flex justify-between gap-2">
                      <p className="truncate text-xs font-bold">{message.from_name}</p>
                      <span className="text-[9px] text-muted-foreground">{message.date}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {message.subject}
                    </p>
                  </div>
                ))}
              {data.messages.filter((message) => !message.is_sent).length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">پیامی وجود ندارد.</p>
              )}
            </div>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link to="/parent/messages">صندوق پیام‌ها</Link>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ChildOverviewCard({ child }: { child: ParentPortalChild }) {
  const latestRecord = child.current_records[0];
  const latestPayment = child.payments.find((payment) => payment.status !== "cancelled");
  return (
    <Card className="overflow-hidden rounded-3xl">
      <div className="bg-gradient-to-l from-emerald-900 to-emerald-700 p-4 text-white">
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14 border-2 border-amber-300">
            <AvatarFallback className="bg-white/10 font-bold text-amber-200">
              {initials(child.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="font-display truncate text-lg font-black">{child.name}</h3>
            <p className="mt-1 truncate text-xs text-emerald-100">
              {child.class_name ?? "بدون کلاس"} • {child.teacher_name ?? "استاد نامشخص"}
            </p>
          </div>
          <Badge className="border-0 bg-amber-400 text-emerald-950">{child.level ?? "—"}</Badge>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <MetricBox
            label="آزمون"
            value={child.stats.average_exam == null ? "—" : `${fixed(child.stats.average_exam)}/۲۰`}
          />
          <MetricBox label="حضور" value={`٪${toFa(child.stats.attendance_rate)}`} />
          <MetricBox
            label="عملکرد"
            value={
              child.stats.performance_percent == null
                ? "—"
                : `٪${toFa(Math.round(child.stats.performance_percent))}`
            }
          />
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-muted-foreground">عملکرد نجم</span>
            <span className="font-bold">
              {child.stats.performance_percent == null
                ? "—"
                : `${toFa(Math.round(child.stats.performance_percent))}٪`}
            </span>
          </div>
          <Progress value={child.stats.performance_percent ?? 0} />
        </div>
        {latestRecord && (
          <div className="rounded-2xl border bg-secondary/20 p-3">
            <p className="text-[10px] text-muted-foreground">
              آخرین جلسه • {latestRecord.session_date}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">آزمون {toFa(latestRecord.exam_display)}</Badge>
              <Badge variant="outline">تکلیف {toFa(latestRecord.homework)}/۵</Badge>
              <Badge variant="outline">انضباط {toFa(latestRecord.discipline)}/۵</Badge>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/parent/grades" onClick={() => rememberParentChild(child.id)}>
              <GraduationCap className="ml-1 h-3.5 w-3.5" />
              نمرات
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/parent/attendance" onClick={() => rememberParentChild(child.id)}>
              <CalendarCheck className="ml-1 h-3.5 w-3.5" />
              حضور
            </Link>
          </Button>
        </div>
        {latestPayment && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">آخرین صورتحساب</span>
            <PaymentBadge status={latestPayment.status} />
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * بخش کارت بزرگ «افتخارات فرزند من» در داشبورد ولی؛
 * با انتخاب فرزند (در خانواده‌های چندفرزندی)، ویترین کامل همان کارت داشبورد شاگرد.
 */
function ParentAchievementsSection({ children }: { children: ParentPortalChild[] }) {
  const { selectedId, setSelectedId } = useParentChildSelection(children);
  const selected =
    children.find((child) => String(child.id) === selectedId) ?? children[0] ?? null;
  if (!selected) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-black">افتخارات فرزند من</h2>
      {children.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedId(String(child.id))}
              className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${selected.id === child.id ? "border-amber-300 bg-amber-50 text-amber-900" : "bg-card hover:bg-secondary/40"}`}
            >
              {child.name}
            </button>
          ))}
        </div>
      ) : null}
      <AchievementShowcaseCard
        studentId={selected.id}
        title={`افتخارات ${selected.name}`}
        subtitle="ویترین کامل افتخارات کسب‌شده، سطح فعلی، تاریخچه‌ی سطح‌ها و پیشرفت تا سطح بعدی."
      />
    </section>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display font-bold">{value}</p>
    </div>
  );
}
function PaymentBadge({ status }: { status: "paid" | "pending" | "overdue" | "cancelled" }) {
  return (
    <Badge
      className={
        status === "paid"
          ? "border-0 bg-emerald-100 text-emerald-700"
          : status === "overdue"
            ? "border-0 bg-rose-100 text-rose-700"
            : status === "cancelled"
              ? "border-0 bg-slate-100 text-slate-700"
              : "border-0 bg-amber-100 text-amber-700"
      }
    >
      {status === "paid"
        ? "پرداخت‌شده"
        : status === "overdue"
          ? "معوق"
          : status === "cancelled"
            ? "لغوشده"
            : "در انتظار"}
    </Badge>
  );
}
function LoadingState() {
  return (
    <div className="flex h-72 items-center justify-center gap-3" dir="rtl">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">در حال دریافت اطلاعات واقعی...</span>
    </div>
  );
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="rounded-3xl p-10 text-center" dir="rtl">
      <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
      <p className="mt-3 text-sm">{message}</p>
      <Button className="mt-4" onClick={onRetry}>
        تلاش مجدد
      </Button>
    </Card>
  );
}
