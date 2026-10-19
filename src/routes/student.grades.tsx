import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
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
import { ConductRecoveryHistoryDialog } from "@/features/recitation/components/conduct-recovery-history-dialog";
import {
  getNajmItemValue,
  najmAttendanceMax,
  najmExamItem,
  najmMaxSessionScore,
  loadNajmScoreItems,
  sortNajmItems,
  type NajmScoreItem,
} from "@/lib/najm";
import { getCurrentStudent } from "@/lib/student-utils";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/student/grades")({
  head: () => ({
    meta: [
      { title: "نتایج نمرات من — پنل قرآن‌آموز" },
      {
        name: "description",
        content: "نتایج نمرات من بر اساس آیتم‌ها و امتیازهای رسمی طرح نجم",
      },
    ],
  }),
  component: StudentGrades,
});

type GradeRow = {
  id: string;
  session_id: string;
  student_id: string;
  session_date: string;
  term: string;
  academic_year: string;
  is_absent: boolean;
  absence_kind: string | null;
  attendance: number;
  homework: number;
  exam_raw: number;
  discipline: number;
  special_progress: number;
  special_help: number;
  negative_disorder: number;
  negative_disrespect: number;
  custom_scores: Record<string, number>;
  recovery_bonus: number;
  session_score: number;
};

type ActiveTerm = { term: string; academic_year: string };

const DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ABSENCE_LABELS: Record<string, string> = {
  excused: "موجه",
  unexcused: "غیرموجه",
  informed: "با اطلاع",
};

function toFa(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => DIGITS[Number(digit)]);
}
function fixed(value: number | null, digits = 1): string {
  return value == null ? "—" : toFa(value.toFixed(digits));
}
function averageItem(
  records: GradeRow[],
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

function StudentGrades() {
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [scoreItems, setScoreItems] = useState<NajmScoreItem[]>([]);
  const [activeTerm, setActiveTerm] = useState<ActiveTerm | null>(null);
  const [studentName, setStudentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("current");

  async function loadData(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [student, items, termResult] = await Promise.all([
        getCurrentStudent(),
        loadNajmScoreItems(),
        supabase
          .from("najm_terms")
          .select("term, academic_year")
          .eq("is_active", true)
          .maybeSingle(),
      ]);
      if (!student) throw new Error("پروفایل قرآن‌آموز پیدا نشد.");
      setStudentName(student.name ?? "");
      setScoreItems(sortNajmItems(items));
      setActiveTerm((termResult.data as ActiveTerm | null) ?? null);

      const { data: recordData, error: recordError } = await supabase
        .from("najm_session_records")
        .select(
          "id, session_id, student_id, is_absent, absence_kind, attendance, homework, exam_raw, discipline, special_progress, special_help, negative_disorder, negative_disrespect, custom_scores, recovery_bonus, session_score",
        )
        .eq("student_id", String(student.id))
        .order("created_at", { ascending: false })
        .limit(1000);
      if (recordError) throw recordError;

      const sessionIds = [
        ...new Set((recordData ?? []).map((row) => String(row.session_id))),
      ];
      const { data: sessionData, error: sessionError } = sessionIds.length
        ? await supabase
            .from("najm_sessions")
            .select("id, session_date, term, academic_year, is_applied")
            .in("id", sessionIds)
        : { data: [], error: null };
      if (sessionError) throw sessionError;
      const sessionById = new Map(
        (
          (sessionData ?? []) as Array<{
            id: string;
            session_date: string;
            term: string;
            academic_year: string;
            is_applied: boolean | null;
          }>
        ).map((session) => [session.id, session]),
      );

      const nextRows = (recordData ?? []).flatMap((record) => {
        const session = sessionById.get(String(record.session_id));
        if (!session || session.is_applied === false) return [];
        const attendance = Number(record.attendance ?? 0);
        return [
          {
            id: String(record.id),
            session_id: String(record.session_id),
            student_id: String(record.student_id),
            session_date: session.session_date,
            term: session.term,
            academic_year: session.academic_year,
            is_absent: record.is_absent === true || attendance === 0,
            absence_kind:
              record.absence_kind == null ? null : String(record.absence_kind),
            attendance,
            homework: Number(record.homework ?? 0),
            exam_raw: Number(record.exam_raw ?? 0),
            discipline: Number(record.discipline ?? 0),
            special_progress: Number(record.special_progress ?? 0),
            special_help: Number(record.special_help ?? 0),
            negative_disorder: Number(record.negative_disorder ?? 0),
            negative_disrespect: Number(record.negative_disrespect ?? 0),
            custom_scores:
              (record.custom_scores as
                | Record<string, number>
                | null
                | undefined) ?? {},
            recovery_bonus: Number(record.recovery_bonus ?? 0),
            session_score: Number(record.session_score ?? 0),
          },
        ];
      });
      nextRows.sort((a, b) => b.session_date.localeCompare(a.session_date));
      setRows(nextRows);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "دریافت نتایج نمرات ناموفق بود.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const periods = useMemo(
    () => [...new Set(rows.map((row) => row.academic_year))],
    [rows],
  );
  const filtered =
    period === "all"
      ? rows
      : period === "current"
        ? activeTerm
          ? rows.filter(
              (row) =>
                row.term === activeTerm.term &&
                row.academic_year === activeTerm.academic_year,
            )
          : rows
        : rows.filter((row) => row.academic_year === period);
  const presentRows = filtered.filter((row) => !row.is_absent);
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
  const averageExamRaw = averageItem(presentRows, examItem);
  const averageHomework = averageItem(presentRows, homeworkItem);
  const averageDiscipline = averageItem(presentRows, disciplineItem);
  const averageSession = presentRows.length
    ? presentRows.reduce((sum, row) => sum + row.session_score, 0) /
      presentRows.length
    : null;

  if (loading)
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال دریافت نتایج
        نمرات من...
      </div>
    );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="نتایج نمرات من"
        description="تمام آیتم‌ها، نام‌ها، سقف‌ها، ضرایب و امتیازهای این صفحه مستقیماً از تنظیمات رسمی طرح نجم خوانده می‌شوند."
        actions={
          <Button
            variant="outline"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void loadData(true)}
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
      {error && (
        <Card className="border-rose-200 bg-rose-50 p-4 text-rose-700">
          {error}
        </Card>
      )}
      <Card className="max-w-sm rounded-2xl p-4">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">ترم فعال</SelectItem>
            <SelectItem value="all">کل سوابق</SelectItem>
            {periods.map((value) => (
              <SelectItem key={value} value={value}>
                {toFa(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          hint={`${toFa(presentRows.length)} جلسه حاضر`}
          icon={<Award className="h-5 w-5" />}
          tone="primary"
        />
      </div>

      <Card className="overflow-hidden rounded-3xl border-emerald-100 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-gradient-to-l from-emerald-950 to-emerald-800 p-5 text-white">
          <div>
            <h2 className="font-display text-lg font-black">
              ریز نمرات {studentName}
            </h2>
            <p className="mt-1 text-xs text-emerald-50/80">
              سبز: امتیاز مثبت و ویژه • قرمز: کسر امتیاز • طلایی: امتیاز ویژه
            </p>
          </div>
          <Badge className="border border-white/20 bg-white/10 text-white">
            {toFa(filtered.length)} رکورد
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
              {filtered.map((row, rowIndex) => (
                <TableRow
                  key={row.id}
                  className="border-emerald-50 odd:bg-white even:bg-slate-50/55 hover:bg-emerald-50/70"
                >
                  <TableCell className="p-1 text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600 xl:text-base">
                      {toFa(rowIndex + 1)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-1 text-center text-sm font-black text-slate-700 xl:text-base">
                    {toFa(row.session_date)}
                  </TableCell>
                  {displayItems.map((item) => {
                    const value = getNajmItemValue(row, item);
                    if (item.item_key === "attendance")
                      return (
                        <TableCell
                          key={item.item_key}
                          className={`text-center ${itemCellClass(item)}`}
                        >
                          <Badge variant="outline">
                            {row.is_absent
                              ? `غایب${row.absence_kind ? ` (${ABSENCE_LABELS[row.absence_kind] ?? row.absence_kind})` : ""}`
                              : value >= attendanceMax
                                ? "حاضر"
                                : `${toFa(Math.max(0, attendanceMax - value) * 10)} دقیقه تأخیر`}
                          </Badge>
                        </TableCell>
                      );
                    if (item.kind === "negative")
                      return (
                        <TableCell
                          key={item.item_key}
                          className={`text-center font-bold ${itemCellClass(item)}`}
                        >
                          -{toFa(value * item.weight)}
                        </TableCell>
                      );
                    if (item.kind === "special")
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
                      {row.is_absent ? (
                        "—"
                      ) : (
                        <Badge
                          className={examBadge(
                            getNajmItemValue(row, examItem) + 10,
                          )}
                        >
                          {toFa(getNajmItemValue(row, examItem) + 10)} /{" "}
                          {toFa(examItem.max_score + 10)}
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="bg-emerald-50/70 p-1 text-center [&_button]:h-7 [&_button]:max-w-full [&_button]:gap-0.5 [&_button]:whitespace-nowrap [&_button]:px-1 [&_button]:text-[10px] [&_svg]:hidden xl:[&_button]:text-xs">
                    {row.recovery_bonus > 0 ? (
                      <ConductRecoveryHistoryDialog
                        studentId={row.student_id}
                        sessionId={row.session_id}
                        recoveryBonus={row.recovery_bonus}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-1 text-center">
                    <span className="inline-flex min-w-[60px] items-center justify-center rounded-lg border border-amber-300 bg-gradient-to-br from-emerald-100 via-white to-amber-100 px-1.5 py-1.5 font-display text-sm font-black text-emerald-900 shadow-sm xl:text-base">
                      {toFa(row.session_score)} / {toFa(sessionScoreCap)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
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
          {filtered.map((row, rowIndex) => (
            <div
              key={row.id}
              className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between bg-emerald-950 px-3 py-2 text-white">
                <span className="font-black">ردیف {toFa(rowIndex + 1)}</span>
                <span className="font-bold">{toFa(row.session_date)}</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-slate-100 p-px">
                {displayItems.map((item) => {
                  const value = getNajmItemValue(row, item);
                  const shown =
                    item.item_key === "attendance"
                      ? row.is_absent
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
                      <span className="text-xs font-medium">{item.label}</span>
                      <span className="font-black">{shown}</span>
                    </div>
                  );
                })}
                {examItem && (
                  <div className="flex items-center justify-between bg-sky-50 p-2.5 text-sky-900">
                    <span className="text-xs font-medium">نمره آزمون</span>
                    <span className="font-black">
                      {row.is_absent
                        ? "—"
                        : `${toFa(getNajmItemValue(row, examItem) + 10)} / ${toFa(examItem.max_score + 10)}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between bg-emerald-50 p-2.5 text-emerald-800">
                  <span className="text-xs font-medium">جبران</span>
                  {row.recovery_bonus > 0 ? (
                    <ConductRecoveryHistoryDialog
                      studentId={row.student_id}
                      sessionId={row.session_id}
                      recoveryBonus={row.recovery_bonus}
                    />
                  ) : (
                    <span className="font-black">—</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-amber-200 bg-gradient-to-l from-emerald-100 via-white to-amber-100 px-3 py-2.5 text-emerald-900">
                <span className="font-bold">امتیاز جلسه</span>
                <span className="rounded-lg border border-amber-300 bg-white/70 px-3 py-1 font-display text-lg font-black text-emerald-900 shadow-sm">
                  {toFa(row.session_score)} / {toFa(sessionScoreCap)}
                </span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center text-muted-foreground">
              نتیجه‌ای برای این بازه وجود ندارد.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
