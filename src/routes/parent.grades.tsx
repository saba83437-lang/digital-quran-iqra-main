import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Award,
  BookCheck,
  GraduationCap,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

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
import { useParentChildSelection } from "@/features/parent/parent-child-selection";
import { ConductRecoveryHistoryDialog } from "@/features/recitation/components/conduct-recovery-history-dialog";
import { useParentPortal } from "@/hooks/use-parent-portal";
import {
  getNajmItemValue,
  najmAttendanceMax,
  najmExamItem,
  najmMaxSessionScore,
  sortNajmItems,
  type NajmScoreItem,
} from "@/lib/najm";
import type { ParentNajmRecord } from "@/lib/parent-utils";

export const Route = createFileRoute("/parent/grades")({
  head: () => ({
    meta: [
      { title: "نتایج نمرات فرزند — پنل والدین" },
      {
        name: "description",
        content: "نتایج نمرات فرزند بر اساس آیتم‌ها و امتیازهای رسمی طرح نجم",
      },
    ],
  }),
  component: ParentGrades,
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ABSENCE_LABELS: Record<string, string> = {
  excused: "موجه",
  unexcused: "غیرموجه",
  informed: "با اطلاع",
};

function toFa(value: number | string): string {
  return String(value).replace(
    /[0-9]/g,
    (digit) => PERSIAN_DIGITS[Number(digit)],
  );
}
function fixed(value: number | null, digits = 1): string {
  return value == null ? "—" : toFa(value.toFixed(digits));
}
function averageItem(
  records: ParentNajmRecord[],
  item: NajmScoreItem | null,
): number | null {
  if (!item || records.length === 0) return null;
  return (
    records.reduce((sum, record) => sum + getNajmItemValue(record, item), 0) /
    records.length
  );
}
function examBadge(value: number) {
  if (value >= 18) return "border-0 bg-emerald-100 text-emerald-700";
  if (value >= 15) return "border-0 bg-amber-100 text-amber-700";
  return "border-0 bg-rose-100 text-rose-700";
}
function itemHeaderClass(item: NajmScoreItem): string {
  if (item.kind === "negative")
    return "border-x border-rose-100 bg-rose-100/80 text-rose-800";
  if (item.kind === "special")
    return "border-x border-amber-100 bg-amber-100/80 text-amber-900";
  return "border-x border-emerald-100 bg-emerald-100/70 text-emerald-900";
}
function itemCellClass(item: NajmScoreItem): string {
  if (item.kind === "negative")
    return "border-x border-rose-50 bg-rose-50/70 p-1 text-sm font-black text-rose-700 xl:text-base";
  if (item.kind === "special")
    return "border-x border-amber-50 bg-amber-50/60 p-1 text-sm font-black text-amber-900 xl:text-base";
  return "border-x border-emerald-50 bg-emerald-50/45 p-1 text-sm font-black text-emerald-900 xl:text-base";
}

function ParentGrades() {
  const { data, loading, refreshing, error, refresh } = useParentPortal();
  const { selectedId: activeChildId, setSelectedId: setChildId } =
    useParentChildSelection(data?.children ?? []);
  const [period, setPeriod] = useState("current");
  useEffect(() => setPeriod("current"), [activeChildId]);

  const child =
    data?.children.find((item) => String(item.id) === activeChildId) ?? null;
  const scoreItems = useMemo(
    () => sortNajmItems(data?.score_items ?? []),
    [data?.score_items],
  );
  const homeworkItem =
    scoreItems.find((item) => item.item_key === "homework") ?? null;
  const disciplineItem =
    scoreItems.find((item) => item.item_key === "discipline") ?? null;
  const examItem = najmExamItem(scoreItems);
  const displayItems = scoreItems.filter(
    (item) => item.item_key !== "exam_raw",
  );
  const attendanceMax = najmAttendanceMax(scoreItems);
  const sessionScoreCap = najmMaxSessionScore(scoreItems);

  const records =
    period === "current"
      ? (child?.current_records ?? [])
      : period === "all"
        ? (child?.records ?? [])
        : (child?.records ?? []).filter(
            (record) => record.academic_year === period,
          );
  const presentRecords = records.filter((record) => !record.is_absent);
  const averageExamRaw = averageItem(presentRecords, examItem);
  const averageHomework = averageItem(presentRecords, homeworkItem);
  const averageDiscipline = averageItem(presentRecords, disciplineItem);
  const averageSession = presentRecords.length
    ? presentRecords.reduce((sum, record) => sum + record.session_score, 0) /
      presentRecords.length
    : null;
  const periods = useMemo(
    () => [
      ...new Set((child?.records ?? []).map((record) => record.academic_year)),
    ],
    [child],
  );

  if (loading) return <LoadingState />;
  if (!data || error)
    return (
      <ErrorState
        message={error ?? "اطلاعات در دسترس نیست"}
        onRetry={() => void refresh()}
      />
    );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="نتایج نمرات فرزند"
        description="تمام آیتم‌ها، نام‌ها، سقف‌ها، ضرایب و امتیازهای این صفحه مستقیماً از تنظیمات رسمی طرح نجم خوانده می‌شوند."
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
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">ترم فعال</SelectItem>
              <SelectItem value="all">کل سوابق</SelectItem>
              {periods.map((year) => (
                <SelectItem key={year} value={year}>
                  {toFa(year)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={`میانگین ${examItem?.label ?? "آزمون"}`}
          value={
            averageExamRaw == null
              ? "—"
              : `${fixed(averageExamRaw + 10)} / ${toFa((examItem?.max_score ?? 10) + 10)}`
          }
          hint="نمره نمایشی آزمون"
          icon={<GraduationCap className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label={`میانگین ${homeworkItem?.label ?? "تکلیف"}`}
          value={
            averageHomework == null
              ? "—"
              : `${fixed(averageHomework)} / ${toFa(homeworkItem?.max_score ?? 0)}`
          }
          hint="سقف واقعی تنظیمات نجم"
          icon={<BookCheck className="h-5 w-5" />}
          tone="primary"
        />
        <StatCard
          label={`میانگین ${disciplineItem?.label ?? "نظم"}`}
          value={
            averageDiscipline == null
              ? "—"
              : `${fixed(averageDiscipline)} / ${toFa(disciplineItem?.max_score ?? 0)}`
          }
          hint="سقف واقعی تنظیمات نجم"
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="میانگین امتیاز جلسه"
          value={
            averageSession == null
              ? "—"
              : `${fixed(averageSession)} / ${toFa(sessionScoreCap)}`
          }
          hint={`${toFa(presentRecords.length)} جلسه حاضر`}
          icon={<Award className="h-5 w-5" />}
          tone="primary"
        />
      </div>

      <Card className="overflow-hidden rounded-3xl border-emerald-100 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-gradient-to-l from-emerald-950 to-emerald-800 p-5 text-white">
          <div>
            <h2 className="font-display text-lg font-black">
              ریز نمرات {child?.name ?? ""}
            </h2>
            <p className="mt-1 text-xs text-emerald-50/80">
              سبز: امتیاز مثبت و ویژه • قرمز: کسر امتیاز • طلایی: امتیاز ویژه
            </p>
          </div>
          <Badge className="border border-white/20 bg-white/10 text-white">
            {toFa(records.length)} رکورد
          </Badge>
        </div>
        <div className="hidden bg-white lg:block">
          <Table className="w-full table-fixed text-[10px] xl:text-xs">
            <TableHeader>
              <TableRow className="border-emerald-100 bg-slate-50 hover:bg-slate-50">
                <TableHead className="h-auto w-9 px-1 py-2 text-center font-black">
                  ردیف
                </TableHead>
                <TableHead className="h-auto w-[82px] px-1 py-2 text-center text-xs font-black xl:text-sm">
                  تاریخ
                </TableHead>
                {displayItems.map((item) => (
                  <TableHead
                    key={item.item_key}
                    className={`h-auto px-1 py-2 text-center font-black leading-tight ${itemHeaderClass(item)}`}
                    title={
                      !item.is_active
                        ? "این آیتم اکنون غیرفعال است؛ مقدار تاریخی آن نمایش داده می‌شود"
                        : undefined
                    }
                  >
                    <span className="block text-xs font-black leading-tight xl:text-sm">
                      {item.label}
                    </span>
                    <span
                      className={`mx-auto mt-1 inline-flex items-center justify-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold leading-none xl:text-[10px] ${
                        item.kind === "negative"
                          ? "border-rose-200 bg-white/75 text-rose-700"
                          : item.kind === "special"
                            ? "border-amber-300 bg-white/75 text-amber-800"
                            : "border-emerald-200 bg-white/75 text-emerald-800"
                      }`}
                    >
                      {item.kind === "negative"
                        ? `هر واحد ${toFa(item.weight)}−`
                        : `از ${toFa(item.max_score)}`}
                    </span>
                  </TableHead>
                ))}
                {examItem && (
                  <TableHead className="h-auto w-[76px] bg-sky-50 px-1 py-2 text-center font-black leading-tight text-sky-900">
                    نمره نمایشی
                  </TableHead>
                )}
                <TableHead className="h-auto w-[68px] bg-emerald-100 px-1 py-2 text-center font-black text-emerald-900">
                  جبران
                </TableHead>
                <TableHead className="h-auto w-[76px] border-x border-amber-200 bg-gradient-to-b from-emerald-100 to-amber-50 px-1 py-2 text-center font-black leading-tight text-emerald-900">
                  امتیاز جلسه
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record, recordIndex) => {
                const absent = record.is_absent || record.attendance === 0;
                return (
                  <TableRow
                    key={record.id}
                    className="border-emerald-50 odd:bg-white even:bg-slate-50/55 hover:bg-emerald-50/70"
                  >
                    <TableCell className="p-1 text-center">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600 xl:text-base">
                        {toFa(recordIndex + 1)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap p-1 text-center text-sm font-black text-slate-700 xl:text-base">
                      {toFa(record.session_date)}
                    </TableCell>
                    {displayItems.map((item) => {
                      const value = getNajmItemValue(record, item);
                      if (item.item_key === "attendance") {
                        return (
                          <TableCell
                            key={item.item_key}
                            className={`text-center ${itemCellClass(item)}`}
                          >
                            <Badge variant="outline">
                              {absent
                                ? `غایب${record.absence_kind ? ` (${ABSENCE_LABELS[record.absence_kind] ?? record.absence_kind})` : ""}`
                                : value >= attendanceMax
                                  ? "حاضر"
                                  : `${toFa(Math.max(0, attendanceMax - value) * 10)} دقیقه تأخیر`}
                            </Badge>
                          </TableCell>
                        );
                      }
                      if (item.kind === "negative") {
                        return (
                          <TableCell
                            key={item.item_key}
                            className={`text-center font-bold ${itemCellClass(item)}`}
                          >
                            -{toFa(value * item.weight)}
                          </TableCell>
                        );
                      }
                      if (item.kind === "special") {
                        return (
                          <TableCell
                            key={item.item_key}
                            className={`text-center ${itemCellClass(item)}`}
                          >
                            {value > 0 ? (
                              <Badge className="bg-[#D4AF37] text-sm font-black text-emerald-950 xl:text-base">
                                +{toFa(value)}
                              </Badge>
                            ) : (
                              toFa(value)
                            )}
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell
                          key={item.item_key}
                          className={`text-center font-bold ${itemCellClass(item)}`}
                        >
                          {toFa(value)}
                        </TableCell>
                      );
                    })}
                    {examItem && (
                      <TableCell className="bg-sky-50/55 p-1 text-center">
                        {absent ? (
                          "—"
                        ) : (
                          <Badge
                            className={examBadge(
                              getNajmItemValue(record, examItem) + 10,
                            )}
                          >
                            {toFa(getNajmItemValue(record, examItem) + 10)} /{" "}
                            {toFa(examItem.max_score + 10)}
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="bg-emerald-50/70 p-1 text-center [&_button]:h-7 [&_button]:max-w-full [&_button]:gap-0.5 [&_button]:whitespace-nowrap [&_button]:px-1 [&_button]:text-[10px] [&_svg]:hidden xl:[&_button]:text-xs">
                      {record.recovery_bonus > 0 ? (
                        <ConductRecoveryHistoryDialog
                          studentId={record.student_id}
                          sessionId={record.session_id}
                          recoveryBonus={record.recovery_bonus}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-1 text-center">
                      <span className="inline-flex min-w-[60px] items-center justify-center rounded-lg border border-amber-300 bg-gradient-to-br from-emerald-100 via-white to-amber-100 px-1.5 py-1.5 font-display text-sm font-black text-emerald-900 shadow-sm xl:text-base">
                        {toFa(record.session_score)} / {toFa(sessionScoreCap)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {records.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={displayItems.length + (examItem ? 5 : 4)}
                    className="py-12 text-center text-muted-foreground"
                  >
                    نتیجه‌ای برای این بازه وجود ندارد.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 bg-slate-50/70 p-3 lg:hidden">
          {records.map((record, recordIndex) => {
            const absent = record.is_absent || record.attendance === 0;
            return (
              <div
                key={record.id}
                className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between bg-emerald-950 px-3 py-2 text-white">
                  <span className="font-black">
                    ردیف {toFa(recordIndex + 1)}
                  </span>
                  <span className="font-bold">{toFa(record.session_date)}</span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-slate-100 p-px">
                  {displayItems.map((item) => {
                    const value = getNajmItemValue(record, item);
                    const shown =
                      item.item_key === "attendance"
                        ? absent
                          ? "غایب"
                          : value >= attendanceMax
                            ? "حاضر"
                            : `${toFa(Math.max(0, attendanceMax - value) * 10)}د تأخیر`
                        : item.kind === "negative"
                          ? `-${toFa(value * item.weight)}`
                          : item.kind === "special" && value > 0
                            ? `+${toFa(value)}`
                            : `${toFa(value)} / ${toFa(item.max_score)}`;
                    return (
                      <div
                        key={item.item_key}
                        className={`flex items-center justify-between gap-2 p-2.5 ${itemCellClass(item)}`}
                      >
                        <span className="text-xs font-medium">
                          {item.label}
                        </span>
                        <span className="font-black">{shown}</span>
                      </div>
                    );
                  })}
                  {examItem && (
                    <div className="flex items-center justify-between bg-sky-50 p-2.5 text-sky-900">
                      <span className="text-xs font-medium">نمره آزمون</span>
                      <span className="font-black">
                        {absent
                          ? "—"
                          : `${toFa(getNajmItemValue(record, examItem) + 10)} / ${toFa(examItem.max_score + 10)}`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between bg-emerald-50 p-2.5 text-emerald-800">
                    <span className="text-xs font-medium">جبران</span>
                    {record.recovery_bonus > 0 ? (
                      <ConductRecoveryHistoryDialog
                        studentId={record.student_id}
                        sessionId={record.session_id}
                        recoveryBonus={record.recovery_bonus}
                      />
                    ) : (
                      <span className="font-black">—</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-amber-200 bg-gradient-to-l from-emerald-100 via-white to-amber-100 px-3 py-2.5 text-emerald-900">
                  <span className="font-bold">امتیاز جلسه</span>
                  <span className="rounded-lg border border-amber-300 bg-white/70 px-3 py-1 font-display text-lg font-black text-emerald-900 shadow-sm">
                    {toFa(record.session_score)} / {toFa(sessionScoreCap)}
                  </span>
                </div>
              </div>
            );
          })}
          {records.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center text-muted-foreground">
              نتیجه‌ای برای این بازه وجود ندارد.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-72 items-center justify-center gap-3">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      در حال دریافت نتایج نمرات فرزند...
    </div>
  );
}
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
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
