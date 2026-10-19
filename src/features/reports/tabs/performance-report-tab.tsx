import type React from "react";
import {
  AlertCircle,
  CheckCheck,
  Database,
  GraduationCap,
  Minus,
  School,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { ExportButton, PanelHeading } from "../components/report-ui";
import { useReportsTabContext } from "../context/reports-tab-context";
import { toFa } from "../domain/report-display";

export function PerformanceReportTab() {
  const {
    classStats,
    teacherStats,
    studentFollowUpRows,
    studentTrendRows,
    dataQualityIssues,
    insufficientFollowUpDataCount,
    insufficientTrendDataCount,
    analyticsScopeLabel,
    exportClassPerformance,
    exportTeacherPerformance,
    exportStudentFollowUp,
    exportStudentTrends,
    exportDataQuality,
  } = useReportsTabContext();

  const urgentCount = studentFollowUpRows.filter((row) => row.priority === "urgent").length;
  const growthCount = studentTrendRows.filter((row) => row.direction === "growth").length;
  const declineCount = studentTrendRows.filter((row) => row.direction === "decline").length;
  const qualityErrorCount = dataQualityIssues.filter((row) => row.severity === "error").length;

  return (
    <TabsContent value="performance">
      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow="ارزیابی ساختار آموزشی"
          title="عملکرد کلاس‌های فعال"
          icon={<School className="h-5 w-5" />}
          action={
            <ExportButton
              onExcel={() => exportClassPerformance("excel")}
              onPDF={() => exportClassPerformance("pdf")}
              onWord={() => exportClassPerformance("word")}
              disabled={classStats.length === 0}
            />
          }
        />
        <div className="p-5">
          <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 font-black">
                  <TableHead className="w-10">ردیف</TableHead>
                  <TableHead>کلاس</TableHead>
                  <TableHead>استاد</TableHead>
                  <TableHead>قرآن‌آموز فعال</TableHead>
                  <TableHead>پر شدن ظرفیت</TableHead>
                  <TableHead>میانگین نمره</TableHead>
                  <TableHead>درصد حضور</TableHead>
                  <TableHead>میانگین غیبت</TableHead>
                  <TableHead>تعداد جلسات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classStats.map((item, index) => (
                  <TableRow key={String(item.id)}>
                    <TableCell className="text-sm text-muted-foreground">
                      {toFa(index + 1)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{item.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.teacherName}
                    </TableCell>
                    <TableCell className="text-sm">{toFa(item.studentCount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-[#efebd9] border border-black/[0.02] shadow-inner rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#4a5839] rounded-full"
                            style={{ width: `${item.fillRate}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold">٪{toFa(item.fillRate)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-[#4a5839] text-sm">
                      {item.avgGrade === "—" ? "—" : `${toFa(item.avgGrade)} / ۲۰`}
                    </TableCell>
                    <TableCell className="text-sm">٪{toFa(item.attendanceRate)}</TableCell>
                    <TableCell className="text-sm text-warning-foreground font-semibold">
                      {toFa(item.avgAbsence)}
                    </TableCell>
                    <TableCell className="text-sm">{toFa(item.sessionsCount)}</TableCell>
                  </TableRow>
                ))}
                {classStats.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-6 text-muted-foreground text-sm"
                    >
                      کلاس فعالی یافت نشد
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>

      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow="ارزیابی کادر آموزشی"
          title="عملکرد اساتید و مدرسین"
          icon={<GraduationCap className="h-5 w-5" />}
          action={
            <ExportButton
              onExcel={() => exportTeacherPerformance("excel")}
              onPDF={() => exportTeacherPerformance("pdf")}
              onWord={() => exportTeacherPerformance("word")}
              disabled={teacherStats.length === 0}
            />
          }
        />
        <div className="p-5">
          <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 font-black">
                  <TableHead className="w-10">ردیف</TableHead>
                  <TableHead>استاد</TableHead>
                  <TableHead>تخصص</TableHead>
                  <TableHead>کلاس‌های فعال</TableHead>
                  <TableHead>قرآن‌آموزان تحت آموزش</TableHead>
                  <TableHead>میانگین نمره</TableHead>
                  <TableHead>درصد حضور</TableHead>
                  <TableHead>تعداد جلسات برگزارشده</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teacherStats.map((item, index) => (
                  <TableRow key={String(item.id)}>
                    <TableCell className="text-sm text-muted-foreground">
                      {toFa(index + 1)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{item.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.specialty}
                    </TableCell>
                    <TableCell className="text-sm">{toFa(item.activeClassCount)}</TableCell>
                    <TableCell className="text-sm">{toFa(item.studentCount)}</TableCell>
                    <TableCell className="font-semibold text-[#4a5839] text-sm">
                      {item.avgGrade === "—" ? "—" : `${toFa(item.avgGrade)} / ۲۰`}
                    </TableCell>
                    <TableCell className="text-sm">٪{toFa(item.attendanceRate)}</TableCell>
                    <TableCell className="text-sm">{toFa(item.sessionsCount)}</TableCell>
                  </TableRow>
                ))}
                {teacherStats.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-6 text-muted-foreground text-sm"
                    >
                      استادی یافت نشد
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <AnalyticsSummaryCard
          label="نیازمند پیگیری"
          value={studentFollowUpRows.length}
          hint={`${toFa(urgentCount)} اولویت فوری`}
          icon={<Users className="h-5 w-5" />}
          tone="warning"
        />
        <AnalyticsSummaryCard
          label="داده ناکافی ارزیابی"
          value={insufficientFollowUpDataCount}
          hint="کمتر از ۳ جلسه"
          icon={<AlertCircle className="h-5 w-5" />}
          tone="muted"
        />
        <AnalyticsSummaryCard
          label="رشد / افت اخیر"
          value={`${toFa(growthCount)} / ${toFa(declineCount)}`}
          hint="سه جلسه اخیر در برابر سه جلسه قبل"
          icon={<TrendingUp className="h-5 w-5" />}
          tone="success"
        />
        <AnalyticsSummaryCard
          label="خطاهای کیفیت داده"
          value={qualityErrorCount}
          hint={`${toFa(dataQualityIssues.length)} نوع مسئله`}
          icon={<Database className="h-5 w-5" />}
          tone={qualityErrorCount > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow={`تحلیل قاعده‌محور — ${analyticsScopeLabel}`}
          title="قرآن‌آموزان نیازمند پیگیری آموزشی"
          icon={<AlertCircle className="h-5 w-5" />}
          action={
            <ExportButton
              onExcel={() => exportStudentFollowUp("excel")}
              onPDF={() => exportStudentFollowUp("pdf")}
              onWord={() => exportStudentFollowUp("word")}
              disabled={studentFollowUpRows.length === 0}
            />
          }
        />
        <div className="p-5">
          <p className="mb-4 text-xs leading-6 text-muted-foreground">
            قواعد مصوب: حداقل ۳ جلسه؛ حضور کمتر از ۷۵٪، میانگین کمتر از ۱۲، یا حداقل ۲ غیبت متوالی
            اخیر. وضعیت مالی و انضباطی در این ارزیابی دخالت ندارند.
          </p>
          <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 font-black">
                  <TableHead className="w-10">ردیف</TableHead>
                  <TableHead>قرآن‌آموز</TableHead>
                  <TableHead>کلاس</TableHead>
                  <TableHead>اولویت</TableHead>
                  <TableHead>جلسه</TableHead>
                  <TableHead>حضور</TableHead>
                  <TableHead>میانگین</TableHead>
                  <TableHead>غیبت متوالی</TableHead>
                  <TableHead>علت‌ها</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentFollowUpRows.map((row, index) => (
                  <TableRow key={row.studentId}>
                    <TableCell className="text-sm text-muted-foreground">
                      {toFa(index + 1)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{row.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.className}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          row.priority === "urgent"
                            ? "bg-destructive/15 text-destructive border-destructive/30"
                            : "bg-warning/20 text-warning-foreground border-warning/40"
                        }
                      >
                        {row.priority === "urgent" ? "فوری" : "پیگیری"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{toFa(row.sessionCount)}</TableCell>
                    <TableCell className="text-sm">٪{toFa(row.attendanceRate)}</TableCell>
                    <TableCell className="text-sm">
                      {row.averageGrade == null ? "—" : `${toFa(row.averageGrade)} / ۲۰`}
                    </TableCell>
                    <TableCell className="text-sm">{toFa(row.recentConsecutiveAbsences)}</TableCell>
                    <TableCell className="text-xs min-w-64">{row.reasons.join("؛ ")}</TableCell>
                  </TableRow>
                ))}
                {studentFollowUpRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-8 text-muted-foreground text-sm"
                    >
                      با قواعد فعلی، موردی برای پیگیری آموزشی شناسایی نشد.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>

      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow={`روند نمرات رسمی — ${analyticsScopeLabel}`}
          title="رشد یا افت سه جلسه اخیر"
          icon={<TrendingUp className="h-5 w-5" />}
          action={
            <ExportButton
              onExcel={() => exportStudentTrends("excel")}
              onPDF={() => exportStudentTrends("pdf")}
              onWord={() => exportStudentTrends("word")}
              disabled={studentTrendRows.length === 0}
            />
          }
        />
        <div className="p-5">
          <p className="mb-4 text-xs leading-6 text-muted-foreground">
            فقط قرآن‌آموزان دارای حداقل ۶ نمره بررسی می‌شوند. تغییر کمتر از یک نمره «پایدار» محسوب
            می‌شود. تعداد فاقد داده کافی: {toFa(insufficientTrendDataCount)} نفر.
          </p>
          <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 font-black">
                  <TableHead className="w-10">ردیف</TableHead>
                  <TableHead>قرآن‌آموز</TableHead>
                  <TableHead>کلاس</TableHead>
                  <TableHead>سه نمره قبل</TableHead>
                  <TableHead>سه نمره اخیر</TableHead>
                  <TableHead>تغییر</TableHead>
                  <TableHead>روند</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentTrendRows.map((row, index) => (
                  <TableRow key={row.studentId}>
                    <TableCell className="text-sm text-muted-foreground">
                      {toFa(index + 1)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{row.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.className}</TableCell>
                    <TableCell className="text-sm">{toFa(row.previousAverage)} / ۲۰</TableCell>
                    <TableCell className="text-sm">{toFa(row.recentAverage)} / ۲۰</TableCell>
                    <TableCell className="font-bold text-sm">
                      {row.delta > 0 ? "+" : ""}
                      {toFa(row.delta)}
                    </TableCell>
                    <TableCell>
                      <TrendBadge direction={row.direction} />
                    </TableCell>
                  </TableRow>
                ))}
                {studentTrendRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground text-sm"
                    >
                      هنوز برای هیچ قرآن‌آموزی شش نمره در ترم فعال ثبت نشده است.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>

      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow={`کنترل سازگاری — ${analyticsScopeLabel}`}
          title="کیفیت و کامل‌بودن ثبت داده‌ها"
          icon={<Database className="h-5 w-5" />}
          action={
            <ExportButton
              onExcel={() => exportDataQuality("excel")}
              onPDF={() => exportDataQuality("pdf")}
              onWord={() => exportDataQuality("word")}
              disabled={dataQualityIssues.length === 0}
            />
          }
        />
        <div className="p-5">
          <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 font-black">
                  <TableHead className="w-10">ردیف</TableHead>
                  <TableHead>سطح</TableHead>
                  <TableHead>موضوع</TableHead>
                  <TableHead>تعداد</TableHead>
                  <TableHead>نمونه/جزئیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataQualityIssues.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {toFa(index + 1)}
                    </TableCell>
                    <TableCell>
                      <QualityBadge severity={row.severity} />
                    </TableCell>
                    <TableCell className="font-medium text-sm">{row.title}</TableCell>
                    <TableCell className="text-sm">{toFa(row.count)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground min-w-64">
                      {row.details}
                    </TableCell>
                  </TableRow>
                ))}
                {dataQualityIssues.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-success text-sm font-bold"
                    >
                      <CheckCheck className="inline h-4 w-4 ml-1" />
                      مورد ناسازگاری شناسایی نشد.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>
    </TabsContent>
  );
}

function TrendBadge({ direction }: { direction: "growth" | "stable" | "decline" }) {
  if (direction === "growth")
    return (
      <Badge className="bg-success/15 text-success border-success/30 gap-1">
        <TrendingUp className="h-3 w-3" />
        رشد
      </Badge>
    );
  if (direction === "decline")
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1">
        <TrendingDown className="h-3 w-3" />
        افت
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      <Minus className="h-3 w-3" />
      پایدار
    </Badge>
  );
}

function QualityBadge({ severity }: { severity: "error" | "warning" | "info" }) {
  if (severity === "error")
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30">خطا</Badge>;
  if (severity === "warning")
    return <Badge className="bg-warning/20 text-warning-foreground border-warning/40">هشدار</Badge>;
  return <Badge variant="secondary">اطلاع</Badge>;
}

function AnalyticsSummaryCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
  tone: "success" | "warning" | "danger" | "muted";
}) {
  const toneClass = {
    success: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    warning: "border-amber-200 bg-amber-50/70 text-amber-900",
    danger: "border-rose-200 bg-rose-50/70 text-rose-800",
    muted: "border-slate-200 bg-slate-50/70 text-slate-700",
  }[tone];
  return (
    <Card className={`rounded-2xl p-4 border ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold">{label}</p>
          <p className="mt-2 text-2xl font-black">
            {typeof value === "number" ? toFa(value) : value}
          </p>
          <p className="mt-1 text-[10px] opacity-75">{hint}</p>
        </div>
        <span className="rounded-xl bg-white/70 p-2">{icon}</span>
      </div>
    </Card>
  );
}
