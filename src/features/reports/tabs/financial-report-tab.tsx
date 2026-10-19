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

export function FinancialReportTab() {
  const {
    studentById,
    selectedSemester,
    setSelectedSemester,
    semesterOptions,
    filteredPayments,
    exportPaymentsReport,
    openPaymentHistory,
  } = useReportsTabContext();

  return (
    <TabsContent value="payments">
      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow="گزارش تراکنش‌های مالی"
          title={`گزارش مالی شهریه ترم‌ها (${toFa(filteredPayments.length)} پرداخت)`}
          icon={<Wallet className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-2 flex-wrap relative z-10">
              <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                <SelectTrigger className="w-48 h-8 text-xs font-semibold rounded-lg">
                  <SelectValue placeholder="همه ترم‌ها" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">همه ترم‌ها</SelectItem>
                  {semesterOptions.map((sem) => (
                    <SelectItem key={sem} value={sem}>
                      {sem}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ExportButton
                onExcel={() => exportPaymentsReport("excel")}
                onPDF={() => exportPaymentsReport("pdf")}
                onWord={() => exportPaymentsReport("word")}
                disabled={filteredPayments.length === 0}
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
                  <TableHead>ولی</TableHead>
                  <TableHead>نیمسال</TableHead>
                  <TableHead>مبلغ</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>سوابق</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((p, i) => {
                  const student = lookupReportItem(studentById, p.student_id);
                  return (
                    <TableRow key={p.id ?? i}>
                      <TableCell className="text-sm text-muted-foreground">{toFa(i + 1)}</TableCell>
                      <TableCell>
                        <button
                          className="font-bold text-[#4a5839] hover:underline cursor-pointer text-sm flex items-center gap-1.5"
                          onClick={() => student && openPaymentHistory(String(student.id))}
                        >
                          {student?.name ?? "—"}
                          <Eye className="h-3.5 w-3.5 text-[#cfa864]" />
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {student?.parent_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{p.semester ?? "—"}</TableCell>
                      <TableCell className="font-semibold text-sm">
                        {formatTomanFa(p.amount ?? 0)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {toFa(p.date) ?? "—"}
                      </TableCell>
                      <TableCell>
                        {p.status === "paid" && (
                          <Badge className="bg-success/15 text-success font-bold px-2 py-0.5 rounded-md">
                            پرداخت شده
                          </Badge>
                        )}
                        {p.status === "pending" && (
                          <Badge className="bg-warning/20 text-warning-foreground font-bold px-2 py-0.5 rounded-md">
                            در انتظار
                          </Badge>
                        )}
                        {p.status === "overdue" && (
                          <Badge className="bg-destructive/15 text-destructive font-bold px-2 py-0.5 rounded-md">
                            معوق
                          </Badge>
                        )}
                        {p.status === "cancelled" && (
                          <Badge variant="secondary" className="font-bold px-2 py-0.5 rounded-md">
                            لغوشده
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs rounded-lg font-bold"
                          onClick={() => student && openPaymentHistory(String(student.id))}
                        >
                          همه ترم‌ها
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredPayments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      سابقه مالی ثبت نشده
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filteredPayments.length > 0 && (
            <div className="mt-4 p-3 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-between">
              <span className="text-sm font-semibold text-success">
                جمع کل دریافتی
                {selectedSemester !== "all" ? ` — ${selectedSemester}` : ""}
              </span>
              <span className="font-bold text-success text-base">
                {formatTomanFa(
                  filteredPayments.reduce(
                    (sum, payment) =>
                      payment.status === "cancelled"
                        ? sum
                        : sum +
                          Number(
                            payment.paid_amount ??
                              (payment.status === "paid" ? (payment.amount ?? 0) : 0),
                          ),
                    0,
                  ),
                )}
              </span>
            </div>
          )}
        </div>
      </Card>
    </TabsContent>
  );
}
