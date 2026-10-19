import { ClipboardList, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getNajmItemValue } from "@/lib/najm";
import { ExportButton, DateRangeFilter, SessionDateFilter } from "../components/report-ui";
import { useReportsDialogContext } from "../context/reports-dialog-context";
import { formatTomanFa, najmNumber, najmTermLabel, toFa } from "../domain/report-display";
import { lookupReportItem } from "../domain/report-lookups";
import {
  NAJM_REPORT_ABSENCE_KIND_LABELS as NAJM_ABSENCE_KIND_LABELS,
  najmReportLateMinutes,
} from "../domain/report-najm";

export function PaymentHistoryDialog() {
  const {
    showPaymentHistory,
    closePaymentHistory,
    selectedPaymentStudent,
    paymentHistoryLoading,
    paymentHistoryError,
    paymentStudentHistory,
    exportPaymentHistory,
  } = useReportsDialogContext();

  return (
    <Dialog
      open={showPaymentHistory}
      onOpenChange={(open: boolean) => {
        if (!open) closePaymentHistory();
      }}
    >
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle>تاریخچه کامل مالی — {selectedPaymentStudent?.name ?? ""}</DialogTitle>
            {!paymentHistoryLoading && paymentStudentHistory.length > 0 && (
              <ExportButton
                onExcel={() => exportPaymentHistory("excel")}
                onPDF={() => exportPaymentHistory("pdf")}
                onWord={() => exportPaymentHistory("word")}
              />
            )}
          </div>
        </DialogHeader>
        {paymentHistoryLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="mr-2 text-sm text-muted-foreground">در حال بارگذاری...</span>
          </div>
        ) : paymentHistoryError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-800">
            دریافت تاریخچه مالی ناموفق بود: {paymentHistoryError}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {/* اطلاعات دانش‌آموز */}
            {selectedPaymentStudent && (
              <div className="p-3.5 rounded-2xl bg-[#efebd9]/40 border border-black/[0.02] flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-sm text-[#2d2620]">
                    {selectedPaymentStudent.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ولی: {selectedPaymentStudent.parent_name} |{" "}
                    {selectedPaymentStudent.parent_phone}
                  </p>
                </div>
                <Badge
                  className={cn(
                    "font-bold px-2 py-0.5 rounded-md",
                    selectedPaymentStudent.tuition_status === "paid"
                      ? "bg-success/15 text-success border-success/30"
                      : selectedPaymentStudent.tuition_status === "overdue"
                        ? "bg-destructive/15 text-destructive border-destructive/30"
                        : "bg-warning/20 text-warning-foreground border-warning/40",
                  )}
                >
                  {selectedPaymentStudent.tuition_status === "paid"
                    ? "پرداخت شده"
                    : selectedPaymentStudent.tuition_status === "overdue"
                      ? "معوق"
                      : selectedPaymentStudent.tuition_status === "cancelled"
                        ? "لغوشده"
                        : selectedPaymentStudent.tuition_status === "unbilled"
                          ? "صورتحساب ندارد"
                          : "در انتظار"}
                </Badge>
              </div>
            )}
            {/* لیست پرداخت‌ها به تفکیک ترم */}
            {paymentStudentHistory.length > 0 ? (
              <>
                {paymentStudentHistory.map((p, i) => {
                  const amount = Number(p.amount ?? 0);
                  const paidAmt =
                    p.status === "cancelled"
                      ? 0
                      : Number(p.paid_amount ?? (p.status === "paid" ? amount : 0));
                  const remaining = p.status === "cancelled" ? 0 : Math.max(0, amount - paidAmt);
                  return (
                    <div
                      key={i}
                      className="p-4 rounded-2xl quran-soft-clay-card shadow-sm border border-[#cfa864]/10"
                    >
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5d6d45]/10 text-[10px] font-black text-[#4a5839]">
                            {toFa(i + 1)}
                          </span>
                          <span className="font-semibold text-sm text-[#2d2620] font-black">
                            {p.semester ?? "—"}
                          </span>
                          {p.status === "paid" && (
                            <Badge className="bg-success/15 text-success text-xs font-bold rounded-md px-2 py-0.5">
                              پرداخت شده
                            </Badge>
                          )}
                          {p.status === "pending" && (
                            <Badge className="bg-warning/20 text-warning-foreground text-xs font-bold rounded-md px-2 py-0.5">
                              در انتظار
                            </Badge>
                          )}
                          {p.status === "overdue" && (
                            <Badge className="bg-destructive/15 text-destructive text-xs font-bold rounded-md px-2 py-0.5">
                              معوق
                            </Badge>
                          )}
                          {p.status === "cancelled" && (
                            <Badge
                              variant="secondary"
                              className="text-xs font-bold rounded-md px-2 py-0.5"
                            >
                              لغوشده
                            </Badge>
                          )}
                        </div>
                        <span className="font-bold text-[#2d2620] text-sm">
                          {formatTomanFa(paidAmt)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground font-sans">
                        <div>
                          <span>مبلغ کل: </span>
                          <span className="text-foreground font-medium">
                            {formatTomanFa(amount)}
                          </span>
                        </div>
                        <div>
                          <span>تاریخ: </span>
                          <span className="text-foreground">{toFa(p.date) ?? "—"}</span>
                        </div>
                        {remaining > 0 && (
                          <div className="col-span-2">
                            <span className="text-destructive font-medium">
                              باقیمانده: {formatTomanFa(remaining)}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* نوار پیشرفت پرداخت */}
                      {Number(p.amount ?? 0) > 0 && (
                        <div className="mt-3">
                          <div className="w-full h-2 bg-[#efebd9] border border-black/[0.02] shadow-inner rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                p.status === "paid"
                                  ? "bg-success"
                                  : p.status === "pending"
                                    ? "bg-warning"
                                    : "bg-destructive",
                              )}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((paidAmt / Number(p.amount ?? 1)) * 100),
                                )}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5 font-bold">
                            {toFa(
                              Math.min(100, Math.round((paidAmt / Number(p.amount ?? 1)) * 100)),
                            )}
                            ٪ پرداخت شده
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* جمع کل */}
                <div className="p-3.5 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-between text-sm quran-soft-clay-card">
                  <div>
                    <p className="text-sm font-semibold text-success">جمع کل پرداختی‌ها</p>
                    <p className="text-xs text-muted-foreground font-black mt-0.5">
                      {toFa(paymentStudentHistory.length)} ترم
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-success text-base">
                      {formatTomanFa(
                        paymentStudentHistory.reduce(
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
                    </p>
                    {paymentStudentHistory.some(
                      (payment) =>
                        payment.status !== "cancelled" &&
                        Number(payment.amount ?? 0) >
                          Number(
                            payment.paid_amount ??
                              (payment.status === "paid" ? (payment.amount ?? 0) : 0),
                          ),
                    ) && (
                      <p className="text-xs text-destructive font-bold mt-0.5">
                        باقیمانده:{" "}
                        {formatTomanFa(
                          paymentStudentHistory.reduce((sum, payment) => {
                            if (payment.status === "cancelled") return sum;
                            const paid = Number(
                              payment.paid_amount ??
                                (payment.status === "paid" ? (payment.amount ?? 0) : 0),
                            );
                            return sum + Math.max(0, Number(payment.amount ?? 0) - paid);
                          }, 0),
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                سابقه پرداختی یافت نشد
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
