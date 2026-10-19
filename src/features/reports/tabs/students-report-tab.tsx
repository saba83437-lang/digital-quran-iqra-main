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

export function StudentsReportTab() {
  const {
    students,
    classes,
    filteredStudents,
    selectedClass,
    setSelectedClass,
    selectedClassData,
    exportStudents,
    openProfile,
  } = useReportsTabContext();

  return (
    <TabsContent value="students">
      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow="لیست کلی قرآن‌آموزان"
          title={`اسامی قرآن‌آموزان کلاس ${selectedClassData ? selectedClassData.name : "کلی"} (${toFa(filteredStudents.length)} نفر)`}
          icon={<Users className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-2 flex-wrap relative z-10">
              <ClassFilterSelect
                value={selectedClass}
                onChange={setSelectedClass}
                classes={classes}
              />
              <ExportButton
                onExcel={() => exportStudents("excel")}
                onPDF={() => exportStudents("pdf")}
                onWord={() => exportStudents("word")}
                disabled={filteredStudents.length === 0}
              />
            </div>
          }
        />
        <div className="p-5">
          <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 font-black">
                  <TableHead className="w-10">ردیف</TableHead>
                  <TableHead>نام قرآن‌آموز</TableHead>
                  <TableHead>سطح</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>میانگین نمره</TableHead>
                  <TableHead>حضور</TableHead>
                  <TableHead>شهریه</TableHead>
                  <TableHead>پروفایل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((s, idx) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm text-muted-foreground">{toFa(idx + 1)}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm">{s.level}</TableCell>
                    <TableCell>
                      {(!s.status || s.status === "active") && (
                        <Badge className="bg-success/15 text-success text-xs font-bold rounded-md px-2 py-0.5">
                          فعال
                        </Badge>
                      )}
                      {s.status === "inactive" && (
                        <Badge className="bg-secondary text-muted-foreground text-xs font-bold rounded-md px-2 py-0.5">
                          غیرفعال
                        </Badge>
                      )}
                      {s.status === "withdrawn" && (
                        <Badge className="bg-destructive/15 text-destructive text-xs font-bold rounded-md px-2 py-0.5">
                          انصرافی
                        </Badge>
                      )}
                      {s.status === "graduated" && (
                        <Badge className="bg-primary/10 text-[#4a5839] text-xs font-bold rounded-md px-2 py-0.5">
                          فارغ‌التحصیل
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-[#4a5839]">
                        {s.average_grade == null ? "—" : `${toFa(s.average_grade)} / ۲۰`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-semibold ${
                          s.attendance_rate == null
                            ? "text-muted-foreground"
                            : s.attendance_rate >= 90
                              ? "text-success"
                              : s.attendance_rate >= 75
                                ? "text-warning-foreground"
                                : "text-destructive"
                        }`}
                      >
                        {s.attendance_rate == null ? "—" : `٪${toFa(s.attendance_rate)}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      {s.tuition_status === "paid" && (
                        <Badge className="bg-success/15 text-success font-bold rounded-md px-2 py-0.5">
                          پرداخت شده
                        </Badge>
                      )}
                      {s.tuition_status === "pending" && (
                        <Badge className="bg-warning/20 text-warning-foreground font-bold rounded-md px-2 py-0.5">
                          در انتظار
                        </Badge>
                      )}
                      {s.tuition_status === "overdue" && (
                        <Badge className="bg-destructive/15 text-destructive font-bold rounded-md px-2 py-0.5">
                          معوق
                        </Badge>
                      )}
                      {s.tuition_status === "cancelled" && (
                        <Badge variant="secondary" className="font-bold rounded-md px-2 py-0.5">
                          لغوشده
                        </Badge>
                      )}
                      {s.tuition_status === "unbilled" && (
                        <Badge variant="outline" className="font-bold rounded-md px-2 py-0.5">
                          صورتحساب ندارد
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs rounded-lg font-bold"
                        onClick={() => openProfile(s)}
                      >
                        مشاهده
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredStudents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      قرآن‌آموزی یافت نشد
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
