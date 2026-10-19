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

export function GradesReportTab() {
  const {
    classes,
    filteredStudents,
    selectedClass,
    setSelectedClass,
    availableSessionDates,
    gradesDDateRange,
    setGradesDDateRange,
    gradesSessionDate,
    setGradesSessionDate,
    rangedGrades,
    gradesStudentOrder,
    exportGrades,
    openProfile,
  } = useReportsTabContext();

  return (
    <TabsContent value="grades">
      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow="سوابق تحصیلی"
          title={`گزارش نمرات ثبت‌شده (${toFa(rangedGrades.length)} رکورد)`}
          icon={<BookOpen className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-2 flex-wrap relative z-10">
              <ClassFilterSelect
                value={selectedClass}
                onChange={setSelectedClass}
                classes={classes}
              />
              <DateRangeFilter
                value={gradesDDateRange}
                onChange={(v) => {
                  setGradesDDateRange(v);
                  setGradesSessionDate(null);
                }}
              />
              <SessionDateFilter
                value={gradesSessionDate}

                onChange={setGradesSessionDate}
                dates={availableSessionDates}
              />
              <ExportButton
                onExcel={() => exportGrades("excel")}
                onPDF={() => exportGrades("pdf")}
                onWord={() => exportGrades("word")}
                disabled={rangedGrades.length === 0}
              />
            </div>
          }
        />
        <div className="p-5">
          {/* نمایش به تفکیک دانش‌آموز */}
          <div className="space-y-3">
            {filteredStudents.map((s) => {
              const sg = rangedGrades.filter((g) => String(g.student_id) === String(s.id));
              if (sg.length === 0) return null;
              const avg =
                sg.length > 0
                  ? (sg.reduce((acc, g) => acc + (g.grade ?? 0), 0) / sg.length).toFixed(1)
                  : "—";

              return (
                <div
                  key={s.id}
                  className="p-4 rounded-2xl quran-soft-clay-card shadow-sm cursor-pointer hover:-translate-y-0.5 transition-all duration-300 border border-[#cfa864]/10"
                  onClick={() => openProfile(s)}
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5d6d45]/10 text-[10px] font-black text-[#4a5839]">
                        {toFa(gradesStudentOrder.get(reportIdKey(s.id) ?? "") ?? 0)}
                      </span>
                      <span className="font-semibold text-sm text-[#2d2620] font-black">
                        {s.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-xs font-bold border-[#5d6d45]/30 text-[#4a5839] bg-[#5d6d45]/5 rounded-md"
                      >
                        {toFa(sg.length)} نمره
                      </Badge>
                    </div>
                    <span className="font-bold text-[#4a5839] text-sm">
                      میانگین: {toFa(avg)} / ۲۰
                    </span>
                  </div>
                  <div className="space-y-1.5 font-sans">
                    {sg.slice(0, 3).map((g, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs text-muted-foreground"
                      >
                        <span className="truncate font-semibold text-[#2d2620]">{g.subject}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground font-bold">{toFa(g.date)}</span>
                          <span className="font-black text-[#2d2620]">{toFa(g.grade)} / ۲۰</span>
                        </div>
                      </div>
                    ))}
                    {sg.length > 3 && (
                      <p className="text-xs text-[#4a5839] font-bold mt-1">
                        + {toFa(sg.length - 3)} نمره دیگر
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {rangedGrades.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-8">
                نمره‌ای در این بازه زمانی یافت نشد
              </p>
            )}
          </div>
        </div>
      </Card>
    </TabsContent>
  );
}
