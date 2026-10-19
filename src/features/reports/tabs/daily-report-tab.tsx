import type React from "react";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCheck,
  ClipboardList,
  Eye,
  GraduationCap,
  Layers,
  ListChecks,
  Search,
  School,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ClassFilterSelect,
  DateRangeFilter,
  ExportButton,
  PanelHeading,
  SessionDateFilter,
} from "../components/report-ui";
import { useReportsTabContext } from "../context/reports-tab-context";
import { formatTomanFa, najmTermLabel, toFa } from "../domain/report-display";
import { reportIdKey, sameReportId } from "../domain/report-id";
import { lookupReportItem } from "../domain/report-lookups";

export function DailyReportTab() {
  const {
    studentById,
    classes,
    selectedClass,
    setSelectedClass,
    availableSessionDates,
    dailyDateRange,
    setDailyDateRange,
    dailySessionDate,
    setDailySessionDate,
    dailyAttendance,
    dailyGrades,
    filteredSessionsList,
    exportDailyReport,
    openSessionDetail,
  } = useReportsTabContext();

  return (
    <TabsContent value="daily">
      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow="گزارش‌های عملکرد روزانه"
          title="بررسی فعالیت‌ها و ارزیابی‌های روزانه"
          icon={<Calendar className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-2 flex-wrap relative z-10">
              <ClassFilterSelect
                value={selectedClass}
                onChange={setSelectedClass}
                classes={classes}
              />
              <DateRangeFilter
                value={dailyDateRange}
                onChange={(v) => {
                  setDailyDateRange(v);
                  setDailySessionDate(null);
                }}
                showToday={true}
              />
              <SessionDateFilter
                value={dailySessionDate}
                onChange={setDailySessionDate}
                dates={availableSessionDates}
              />
              <ExportButton
                onExcel={() => exportDailyReport("excel")}
                onPDF={() => exportDailyReport("pdf")}
                onWord={() => exportDailyReport("word")}
                disabled={dailyAttendance.length === 0 && dailyGrades.length === 0}
              />
            </div>
          }
        />
        <div className="p-5 space-y-5">
          {/* فهرست جلسات برگزارشده در بازه انتخابی */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-sm text-[#2d2620] font-black">جلسات برگزارشده</h3>
              <Badge className="bg-[#5d6d45]/10 text-[#4a5839] border border-[#5d6d45]/15 font-bold rounded-md">
                {toFa(filteredSessionsList.length)} جلسه
              </Badge>
            </div>
            <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50 font-black">
                    <TableHead className="w-10">ردیف</TableHead>
                    <TableHead>تاریخ جلسه</TableHead>
                    <TableHead>کلاس</TableHead>
                    <TableHead>استاد</TableHead>
                    <TableHead>حاضر</TableHead>
                    <TableHead>غایب</TableHead>
                    <TableHead>میانگین نمره</TableHead>
                    <TableHead>جزئیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessionsList.slice(0, 30).map((s, index) => (
                    <TableRow key={s.key}>
                      <TableCell className="text-sm text-muted-foreground">
                        {toFa(index + 1)}
                      </TableCell>
                      <TableCell className="text-sm">{toFa(s.date)}</TableCell>
                      <TableCell className="font-medium text-sm">{s.className}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.teacherName}
                      </TableCell>
                      <TableCell className="text-success font-semibold text-sm">
                        {toFa(s.present)}
                      </TableCell>
                      <TableCell className="text-destructive font-semibold text-sm">
                        {toFa(s.absent)}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-primary">
                        {s.avgGrade !== "—" ? `${toFa(s.avgGrade)} / ۲۰` : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 rounded-lg"
                          onClick={() => openSessionDetail(s)}
                        >
                          <Eye className="h-3 w-3 text-[#4a5839]" />
                          مشاهده
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredSessionsList.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-6 text-muted-foreground text-sm"
                      >
                        جلسه‌ای در این بازه یافت نشد
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {filteredSessionsList.length > 30 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                و {toFa(filteredSessionsList.length - 30)} جلسه دیگر — برای مشاهده کامل خروجی بگیرید
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* حضور و غیاب روزانه */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-sm text-[#2d2620] font-black">حضور و غیاب</h3>
                <Badge className="bg-[#5d6d45]/10 text-[#4a5839] border border-[#5d6d45]/15 font-bold rounded-md">
                  {toFa(dailyAttendance.length)} رکورد
                </Badge>
              </div>
              <div className="rounded-2xl border border-border/70 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50 font-black">
                      <TableHead className="w-10">ردیف</TableHead>
                      <TableHead>قرآن‌آموز</TableHead>
                      <TableHead>تاریخ</TableHead>
                      <TableHead>وضعیت</TableHead>
                      <TableHead>یادداشت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyAttendance.slice(0, 20).map((a, i) => {
                      const student = lookupReportItem(studentById, a.student_id);
                      return (
                        <TableRow key={a.id ?? i}>
                          <TableCell className="text-xs text-muted-foreground">
                            {toFa(i + 1)}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {student?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {toFa(a.date)}
                          </TableCell>
                          <TableCell>
                            {a.status === "present" && (
                              <Badge className="bg-success/15 text-success text-xs font-bold rounded-md px-2 py-0.5">
                                حاضر
                              </Badge>
                            )}
                            {a.status === "late" && (
                              <Badge className="bg-warning/20 text-warning-foreground text-xs font-bold rounded-md px-2 py-0.5">
                                با تأخیر
                              </Badge>
                            )}
                            {a.status === "absent" && (
                              <Badge className="bg-destructive/15 text-destructive text-xs font-bold rounded-md px-2 py-0.5">
                                غایب
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {a.note ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {dailyAttendance.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-6 text-muted-foreground text-sm"
                        >
                          رکوردی یافت نشد
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {dailyAttendance.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  و {toFa(dailyAttendance.length - 20)} رکورد دیگر — برای مشاهده کامل خروجی بگیرید
                </p>
              )}
            </div>

            {/* نمرات روزانه */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-sm text-[#2d2620] font-black">نمرات ثبت‌شده</h3>
                <Badge className="bg-[#5d6d45]/10 text-[#4a5839] border border-[#5d6d45]/15 font-bold rounded-md">
                  {toFa(dailyGrades.length)} نمره
                </Badge>
              </div>
              <div className="rounded-2xl border border-border/70 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50 font-black">
                      <TableHead className="w-10">ردیف</TableHead>
                      <TableHead>قرآن‌آموز</TableHead>
                      <TableHead>موضوع</TableHead>
                      <TableHead>نمره</TableHead>
                      <TableHead>استاد</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyGrades.slice(0, 20).map((g, i) => {
                      const student = lookupReportItem(studentById, g.student_id);
                      return (
                        <TableRow key={g.id ?? i}>
                          <TableCell className="text-xs text-muted-foreground">
                            {toFa(i + 1)}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {student?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">{g.subject ?? "—"}</TableCell>
                          <TableCell>
                            <span
                              className={`font-bold text-sm ${
                                g.grade >= 17
                                  ? "text-success"
                                  : g.grade >= 14
                                    ? "text-primary"
                                    : "text-destructive"
                              }`}
                            >
                              {toFa(g.grade)} / ۲۰
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {g.teacher ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {dailyGrades.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-6 text-muted-foreground text-sm"
                        >
                          نمره‌ای ثبت نشده
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {dailyGrades.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  و {toFa(dailyGrades.length - 20)} رکورد دیگر — برای مشاهده کامل خروجی بگیرید
                </p>
              )}
            </div>
          </div>

          {/* خلاصه آماری روزانه */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-success/10 border border-success/20 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-success">
                {toFa(dailyAttendance.filter((a) => a.status === "present").length)}
              </p>
              <p className="text-xs text-muted-foreground font-black mt-1">حاضر</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-warning/10 border border-warning/20 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-warning-foreground">
                {toFa(dailyAttendance.filter((a) => a.status === "late").length)}
              </p>
              <p className="text-xs text-[#2d2620] font-black mt-1">با تأخیر</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-destructive">
                {toFa(dailyAttendance.filter((a) => a.status === "absent").length)}
              </p>
              <p className="text-xs text-muted-foreground font-black mt-1">غایب</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-[#4a5839]">
                {dailyGrades.length > 0
                  ? toFa(
                      (
                        dailyGrades.reduce((s, g) => s + (g.grade ?? 0), 0) / dailyGrades.length
                      ).toFixed(1),
                    )
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground font-black mt-1">میانگین نمره</p>
            </div>
          </div>
        </div>
      </Card>
    </TabsContent>
  );
}
