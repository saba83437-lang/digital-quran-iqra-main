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

export function AttendanceReportTab() {
  const {
    classes,
    filteredStudents,
    selectedClass,
    setSelectedClass,
    availableSessionDates,
    attendanceDateRange,
    setAttendanceDateRange,
    attendanceSessionDate,
    setAttendanceSessionDate,
    rangedAttendance,
    attendanceStudentOrder,
    exportAttendance,
    openProfile,
  } = useReportsTabContext();

  return (
    <TabsContent value="attendance">
      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow="سوابق حضور و غیاب"
          title={`گزارش حضور و غیاب (${toFa(rangedAttendance.length)} رکورد)`}
          icon={<ListChecks className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-2 flex-wrap relative z-10">
              <ClassFilterSelect
                value={selectedClass}
                onChange={setSelectedClass}
                classes={classes}
              />
              <DateRangeFilter
                value={attendanceDateRange}
                onChange={(v) => {
                  setAttendanceDateRange(v);
                  setAttendanceSessionDate(null);
                }}
              />
              <SessionDateFilter
                value={attendanceSessionDate}
                onChange={setAttendanceSessionDate}
                dates={availableSessionDates}
              />
              <ExportButton
                onExcel={() => exportAttendance("excel")}
                onPDF={() => exportAttendance("pdf")}
                onWord={() => exportAttendance("word")}
                disabled={rangedAttendance.length === 0}
              />
            </div>
          }
        />
        <div className="p-5 space-y-4">
          {/* خلاصه آماری */}
          <div className="grid grid-cols-3 gap-3 mb-2">
            <div className="p-3.5 rounded-2xl bg-success/10 border border-success/20 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-success">
                {toFa(rangedAttendance.filter((a) => a.status === "present").length)}
              </p>
              <p className="text-xs text-muted-foreground font-black mt-1">حاضر</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-warning/10 border border-warning/20 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-warning-foreground">
                {toFa(rangedAttendance.filter((a) => a.status === "late").length)}
              </p>
              <p className="text-xs text-[#2d2620] font-black mt-1">با تأخیر</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-destructive">
                {toFa(rangedAttendance.filter((a) => a.status === "absent").length)}
              </p>
              <p className="text-xs text-muted-foreground font-black mt-1">غایب</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 font-black">
                  <TableHead className="w-10">ردیف</TableHead>
                  <TableHead>قرآن‌آموز</TableHead>
                  <TableHead>تعداد حضور</TableHead>
                  <TableHead>تعداد غیبت</TableHead>
                  <TableHead>درصد حضور</TableHead>
                  <TableHead>وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((s) => {
                  const att = rangedAttendance.filter((a) => String(a.student_id) === String(s.id));
                  if (att.length === 0) return null;
                  const present = att.filter(
                    (a) => a.status === "present" || a.status === "late",
                  ).length;
                  const absent = att.filter((a) => a.status === "absent").length;
                  const pct = att.length
                    ? Math.round((present / att.length) * 100)
                    : (s.attendance_rate ?? 0);

                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-secondary/30"
                      onClick={() => openProfile(s)}
                    >
                      <TableCell className="text-sm text-muted-foreground">
                        {toFa(attendanceStudentOrder.get(reportIdKey(s.id) ?? "") ?? 0)}
                      </TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-success font-semibold">{toFa(present)}</TableCell>
                      <TableCell className="text-destructive font-semibold">
                        {toFa(absent)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-[#efebd9] border border-black/[0.02] shadow-inner rounded-full overflow-hidden">
                            <div
                              className="h-full bg-success rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold">٪{toFa(pct)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "font-bold px-2 py-0.5 rounded-md",
                            pct >= 90
                              ? "bg-success/15 text-success border-success/30"
                              : pct >= 75
                                ? "bg-warning/20 text-warning-foreground border-warning/40"
                                : "bg-destructive/15 text-destructive border-destructive/30",
                          )}
                        >
                          {pct >= 90 ? "عالی" : pct >= 75 ? "متوسط" : "ضعیف"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredStudents.filter((s) =>
                  rangedAttendance.some((a) => String(a.student_id) === String(s.id)),
                ).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      رکوردی در این بازه زمانی یافت نشد
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
