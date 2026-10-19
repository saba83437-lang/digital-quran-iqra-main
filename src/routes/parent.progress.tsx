import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode } from "react";
import {
  AlertCircle,
  Award,
  BookCheck,
  CalendarCheck,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useParentPortal } from "@/hooks/use-parent-portal";
import { useParentChildSelection } from "@/features/parent/parent-child-selection";
import { ClassSyllabusPanel } from "@/features/syllabus/class-syllabus-panel";

export const Route = createFileRoute("/parent/progress")({
  head: () => ({
    meta: [
      { title: "پیشرفت طرح نجم — پنل والدین" },
      { name: "description", content: "گزارش واقعی پیشرفت فرزندان بر پایه طرح نجم" },
    ],
  }),
  component: ParentProgress,
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}
function fixed(value: number | null, digits = 1): string {
  return value == null ? "—" : toFa(value.toFixed(digits));
}

function ParentProgress() {
  const { data, loading, refreshing, error, refresh } = useParentPortal();
  const { selectedId: activeChildId, setSelectedId: setChildId } =
    useParentChildSelection(data?.children ?? []);
  const child = data?.children.find((item) => String(item.id) === activeChildId) ?? null;
  const stats = child?.stats;

  if (loading) return <LoadingState />;
  if (!data || error)
    return <ErrorState message={error ?? "اطلاعات در دسترس نیست"} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="پیشرفت فرزندان در طرح نجم"
        description="تمام شاخص‌ها از رکوردهای واقعی طرح نجم محاسبه می‌شوند و مهارت ساختگی وجود ندارد."
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

      <Card className="rounded-2xl p-4">
        <Select value={activeChildId} onValueChange={setChildId}>
          <SelectTrigger>
            <SelectValue placeholder="انتخاب فرزند" />
          </SelectTrigger>
          <SelectContent>
            {data.children.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.name} — {item.class_name ?? "بدون کلاس"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {child && stats ? (
        <>
          <Card className="overflow-hidden rounded-3xl">
            <div className="bg-gradient-to-l from-emerald-900 to-emerald-700 p-5 text-white">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-display text-2xl font-black">{child.name}</h2>
                  <p className="mt-1 text-sm text-emerald-100">
                    {child.class_name ?? "بدون کلاس"} • {child.teacher_name ?? "استاد نامشخص"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge className="border border-white/20 bg-white/10 text-white">
                    {data.active_term?.title ?? "کل سوابق"}
                  </Badge>
                  <TrendBadge value={stats.improvement_delta} />
                </div>
              </div>
            </div>
            <div className="grid gap-6 p-5 lg:grid-cols-2">
              <div className="space-y-4">
                <h3 className="font-display font-black">شاخص‌های اصلی نجم</h3>
                <ProgressMetric
                  icon={<Award className="h-4 w-4" />}
                  label="عملکرد جلسه"
                  value={stats.performance_percent ?? 0}
                  display={
                    stats.average_session_score == null
                      ? "—"
                      : `${fixed(stats.average_session_score)} / ۳۰`
                  }
                />
                <ProgressMetric
                  icon={<CalendarCheck className="h-4 w-4" />}
                  label="حضور"
                  value={stats.attendance_rate}
                  display={`٪${toFa(stats.attendance_rate)}`}
                />
                <ProgressMetric
                  icon={<BookCheck className="h-4 w-4" />}
                  label="تکلیف"
                  value={(stats.average_homework ?? 0) * 20}
                  display={
                    stats.average_homework == null ? "—" : `${fixed(stats.average_homework)} / ۵`
                  }
                />
                <ProgressMetric
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="انضباط"
                  value={(stats.average_discipline ?? 0) * 20}
                  display={
                    stats.average_discipline == null
                      ? "—"
                      : `${fixed(stats.average_discipline)} / ۵`
                  }
                />
              </div>
              <div className="space-y-4">
                <h3 className="font-display font-black">خلاصه دوره</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SummaryBox label="جلسات ثبت‌شده" value={stats.session_count} />
                  <SummaryBox label="غیبت" value={stats.absent_count} />
                  <SummaryBox label="پیشرفت ویژه" value={stats.special_progress_total} />
                  <SummaryBox label="کمک ویژه" value={stats.special_help_total} />
                </div>
                <div
                  className={`rounded-2xl border p-4 ${stats.negative_total === 0 ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    <span className="font-bold">امتیازهای منفی انضباطی</span>
                  </div>
                  <p className="mt-2 font-display text-2xl font-black">
                    {toFa(stats.negative_total)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    بی‌نظمی + دو برابر بی‌احترامی
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <ClassSyllabusPanel
            classId={child.class_id}
            title={`برنامه آموزشی ${child.name}`}
          />

          <Card className="overflow-hidden rounded-3xl">
            <div className="border-b p-5">
              <h3 className="font-display text-lg font-black">روند جلسات اخیر</h3>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {child.current_records.slice(0, 9).map((record) => (
                <div key={record.id} className="rounded-2xl border bg-secondary/20 p-3">
                  <div className="flex justify-between">
                    <span className="font-medium">{toFa(record.session_date)}</span>
                    <Badge
                      className={
                        record.is_absent
                          ? "border-0 bg-rose-100 text-rose-700"
                          : "border-0 bg-emerald-100 text-emerald-700"
                      }
                    >
                      {record.is_absent ? "غایب" : `${toFa(record.session_score)}/۳۰`}
                    </Badge>
                  </div>
                  {!record.is_absent && (
                    <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[10px]">
                      <span className="rounded bg-white p-1">
                        آزمون {toFa(record.exam_display)}
                      </span>
                      <span className="rounded bg-white p-1">تکلیف {toFa(record.homework)}</span>
                      <span className="rounded bg-white p-1">انضباط {toFa(record.discipline)}</span>
                    </div>
                  )}
                </div>
              ))}
              {child.current_records.length === 0 && (
                <p className="col-span-full py-8 text-center text-muted-foreground">
                  جلسه‌ای در ترم فعال ثبت نشده است.
                </p>
              )}
            </div>
          </Card>
        </>
      ) : (
        <Card className="rounded-3xl border-dashed p-12 text-center text-muted-foreground">
          فرزندی انتخاب نشده است.
        </Card>
      )}
    </div>
  );
}

function ProgressMetric({
  icon,
  label,
  value,
  display,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  display: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 font-medium">
          {icon}
          {label}
        </span>
        <span className="font-bold">{display}</span>
      </div>
      <Progress value={Math.max(0, Math.min(100, value))} />
    </div>
  );
}
function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-secondary/40 p-3 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-black">{toFa(value)}</p>
    </div>
  );
}
function TrendBadge({ value }: { value: number | null }) {
  if (value == null)
    return (
      <Badge variant="outline" className="border-white/30 text-white">
        داده ناکافی
      </Badge>
    );
  return (
    <Badge
      className={
        value >= 0
          ? "border-0 bg-emerald-400 text-emerald-950"
          : "border-0 bg-amber-400 text-amber-950"
      }
    >
      {value >= 0 ? (
        <TrendingUp className="ml-1 h-3 w-3" />
      ) : (
        <TrendingDown className="ml-1 h-3 w-3" />
      )}
      {value >= 0 ? "+" : ""}
      {fixed(value)}
    </Badge>
  );
}
function LoadingState() {
  return (
    <div className="flex h-72 items-center justify-center gap-3">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      در حال محاسبه پیشرفت واقعی...
    </div>
  );
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="rounded-3xl p-10 text-center">
      <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
      <p className="mt-3">{message}</p>
      <Button className="mt-4" onClick={onRetry}>
        تلاش مجدد
      </Button>
    </Card>
  );
}
