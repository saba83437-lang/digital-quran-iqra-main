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

export function SessionsReportTab() {
  const {
    classes,
    filteredStudents,
    selectedClass,
    setSelectedClass,
    studentSessionRowsById,
    openProfile,
  } = useReportsTabContext();

  return (
    <TabsContent value="sessions">
      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow="تحلیل پویایی جلسات"
          title="عملکرد جلسات — به تفکیک قرآن‌آموز"
          icon={<Layers className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-2 flex-wrap relative z-10">
              <ClassFilterSelect
                value={selectedClass}
                onChange={setSelectedClass}
                classes={classes}
              />
            </div>
          }
        />
        <div className="p-5 space-y-3">
          {filteredStudents.map((s, studentIndex) => {
            const studentSessions = studentSessionRowsById.get(reportIdKey(s.id) ?? "") ?? [];
            return (
              <div
                key={s.id}
                className="p-4 rounded-2xl quran-soft-clay-card shadow-sm cursor-pointer hover:-translate-y-0.5 transition-all duration-300 border border-[#cfa864]/10"
                onClick={() => openProfile(s)}
              >
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5d6d45]/10 text-[10px] font-black text-[#4a5839]">
                      {toFa(studentIndex + 1)}
                    </span>
                    <span className="font-semibold text-sm text-[#2d2620] font-black">
                      {s.name}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-xs font-bold border-[#5d6d45]/30 text-[#4a5839] bg-[#5d6d45]/5 rounded-md"
                  >
                    {toFa(studentSessions.length)} جلسه
                  </Badge>
                </div>
                <div className="space-y-1.5 font-sans">
                  {studentSessions.slice(0, 3).map((sessionRow) => (
                    <div
                      key={sessionRow.key}
                      className="flex items-center justify-between text-xs text-muted-foreground"
                    >
                      <span className="truncate font-semibold text-[#2d2620]">
                        {sessionRow.className} — {toFa(sessionRow.date)}
                      </span>
                      <span className="font-bold text-[#2d2620] mr-2">
                        {!sessionRow.isApplied
                          ? "معلق"
                          : sessionRow.status === "absent"
                            ? "غایب"
                            : sessionRow.status === "late"
                              ? `${toFa(sessionRow.grade)} / ۲۰ • ${toFa(sessionRow.lateMinutes)} دقیقه تأخیر`
                              : `${toFa(sessionRow.grade)} / ۲۰`}
                      </span>
                    </div>
                  ))}
                  {studentSessions.length > 3 && (
                    <p className="text-xs text-[#4a5839] font-bold mt-1">
                      + {toFa(studentSessions.length - 3)} جلسه دیگر
                    </p>
                  )}
                  {studentSessions.length === 0 && (
                    <p className="text-xs text-muted-foreground font-semibold">جلسه‌ای ثبت نشده</p>
                  )}
                </div>
              </div>
            );
          })}
          {filteredStudents.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">قرآن‌آموزی یافت نشد</p>
          )}
        </div>
      </Card>
    </TabsContent>
  );
}
