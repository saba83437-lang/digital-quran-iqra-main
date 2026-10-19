import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarCheck, Check, Clock, Loader2, RefreshCw, X } from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useParentPortal } from "@/hooks/use-parent-portal";
import { useParentChildSelection } from "@/features/parent/parent-child-selection";
import type { ParentNajmRecord } from "@/lib/parent-utils";

export const Route = createFileRoute("/parent/attendance")({
  head: () => ({
    meta: [
      { title: "حضور طرح نجم — پنل والدین" },
      { name: "description", content: "حضور و غیاب واقعی ثبت‌شده در طرح نجم" },
    ],
  }),
  component: ParentAttendance,
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function monthKey(date: string): string {
  const parts = date.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "نامشخص";
}

function attendanceState(record: ParentNajmRecord): "present" | "partial" | "absent" {
  if (record.is_absent) return "absent";
  return record.attendance >= 5 ? "present" : "partial";
}

function ParentAttendance() {
  const { data, loading, refreshing, error, refresh } = useParentPortal();
  const { selectedId: activeChildId, setSelectedId: setChildId } =
    useParentChildSelection(data?.children ?? []);
  const [month, setMonth] = useState("all");
  useEffect(() => setMonth("all"), [activeChildId]);
  const child = data?.children.find((item) => String(item.id) === activeChildId) ?? null;
  const months = useMemo(
    () => [...new Set((child?.records ?? []).map((record) => monthKey(record.session_date)))],
    [child],
  );
  const records = (child?.records ?? []).filter(
    (record) => month === "all" || monthKey(record.session_date) === month,
  );
  const present = records.filter((record) => !record.is_absent).length;
  const full = records.filter((record) => attendanceState(record) === "present").length;
  const partial = records.filter((record) => attendanceState(record) === "partial").length;
  const absent = records.filter((record) => record.is_absent).length;
  const rate = records.length ? Math.round((present / records.length) * 100) : 0;

  if (loading) return <LoadingState />;
  if (!data || error)
    return <ErrorState message={error ?? "اطلاعات در دسترس نیست"} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="حضور و غیاب طرح نجم"
        description="این اطلاعات مستقیماً از رکوردهای رسمی جلسات طرح نجم خوانده می‌شوند."
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
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            value={activeChildId}
            onValueChange={(value) => {
              setChildId(value);
              setMonth("all");
            }}
          >
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
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه ماه‌ها</SelectItem>
              {months.map((item) => (
                <SelectItem key={item} value={item}>
                  {toFa(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="نرخ حضور"
          value={`٪${toFa(rate)}`}
          hint={`${toFa(records.length)} جلسه`}
          icon={<CalendarCheck className="h-5 w-5" />}
        />
        <StatCard
          label="حضور کامل"
          value={toFa(full)}
          hint="امتیاز حضور ۵"
          icon={<Check className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="حضور با کسر"
          value={toFa(partial)}
          hint="امتیاز حضور ۱ تا ۴"
          icon={<Clock className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label="غیبت"
          value={toFa(absent)}
          hint="حضور صفر"
          icon={<X className="h-5 w-5" />}
          tone="warning"
        />
      </div>

      <Card className="overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-display text-lg font-black">تاریخچه جلسات {child?.name ?? ""}</h2>
          <Badge variant="secondary">{toFa(records.length)} جلسه</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">تاریخ</TableHead>
                <TableHead className="text-right">وضعیت</TableHead>
                <TableHead className="text-right">امتیاز حضور</TableHead>
                <TableHead className="text-right">کلاس</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{toFa(record.session_date)}</TableCell>
                  <TableCell>
                    <AttendanceBadge record={record} />
                  </TableCell>
                  <TableCell>{toFa(record.attendance)} / ۵</TableCell>
                  <TableCell className="text-muted-foreground">
                    {record.class_name ?? child?.class_name ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                    جلسه‌ای برای این بازه ثبت نشده است.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function AttendanceBadge({ record }: { record: ParentNajmRecord }) {
  const state = attendanceState(record);
  if (state === "absent")
    return (
      <Badge className="border-0 bg-rose-100 text-rose-700">
        <X className="ml-1 h-3 w-3" />
        غایب
      </Badge>
    );
  if (state === "partial")
    return (
      <Badge className="border-0 bg-amber-100 text-amber-700">
        <Clock className="ml-1 h-3 w-3" />
        حاضر با کسر
      </Badge>
    );
  return (
    <Badge className="border-0 bg-emerald-100 text-emerald-700">
      <Check className="ml-1 h-3 w-3" />
      حاضر کامل
    </Badge>
  );
}
function LoadingState() {
  return (
    <div className="flex h-72 items-center justify-center gap-3">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      در حال دریافت حضور نجم...
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
