import { ClipboardList, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getNajmItemValue } from "@/lib/najm";
import { ConductRecoveryHistoryDialog } from "@/features/recitation/components/conduct-recovery-history-dialog";
import { ExportButton, DateRangeFilter, SessionDateFilter } from "../components/report-ui";
import { useReportsDialogContext } from "../context/reports-dialog-context";
import { formatTomanFa, najmNumber, najmTermLabel, toFa } from "../domain/report-display";
import { lookupReportItem } from "../domain/report-lookups";
import {
  NAJM_REPORT_ABSENCE_KIND_LABELS as NAJM_ABSENCE_KIND_LABELS,
  najmReportLateMinutes,
} from "../domain/report-najm";

export function NajmSessionDetailDialog() {
  const {
    najmDetailSession,
    closeNajmDetail,
    najmDetailLoading,
    najmDetailError,
    najmDetailRecords,
    najmScoreItems,
    najmDetailExamItem,
    najmDetailAttendanceMax,
    najmDetailSummary,
    exportNajmSessionDetail,
  } = useReportsDialogContext();

  return (
    <Dialog
      open={najmDetailSession !== null}
      onOpenChange={(open: boolean) => !open && closeNajmDetail()}
    >
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#2d2620]">
            <ClipboardList className="h-5 w-5 text-[#4a5839]" />
            ریز نمرات کلاس ثبت‌شده — {najmDetailSession?.className}
          </DialogTitle>
        </DialogHeader>

        {najmDetailSession && (
          <div className="space-y-4">
            {/* مشخصات کلاس ثبت‌شده */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <div className="rounded-2xl bg-emerald-50 p-3 border border-black/[0.02]">
                <div className="text-[11px] text-muted-foreground">کلاس</div>
                <div className="mt-1 font-black text-emerald-950">
                  {najmDetailSession.className}
                </div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3 border border-black/[0.02]">
                <div className="text-[11px] text-muted-foreground">استاد</div>
                <div className="mt-1 font-black text-emerald-950">
                  {najmDetailSession.teacherName}
                </div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3 border border-black/[0.02]">
                <div className="text-[11px] text-muted-foreground">تاریخ</div>
                <div className="mt-1 font-black text-emerald-950">
                  {toFa(najmDetailSession.session_date ?? "—")}
                </div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3 border border-black/[0.02]">
                <div className="text-[11px] text-muted-foreground">ترم / سال</div>
                <div className="mt-1 font-black text-emerald-950">
                  {najmTermLabel(najmDetailSession.term)} •{" "}
                  {toFa(najmDetailSession.academic_year ?? "—")}
                </div>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3 border border-black/[0.02]">
                <div className="text-[11px] text-muted-foreground">امتیاز کل جلسه</div>
                <div className="mt-1 font-black text-amber-800">
                  {toFa(najmDetailSession.totalScore)}
                </div>
              </div>
              <div
                className={`rounded-2xl p-3 border border-black/[0.02] ${
                  najmDetailSession.is_applied === true ? "bg-emerald-50" : "bg-amber-50"
                }`}
              >
                <div className="text-[11px] text-muted-foreground">وضعیت</div>
                <div className="mt-1 font-black">
                  {najmDetailSession.is_applied === true ? (
                    <span className="text-emerald-800">اعمال‌شده ✓</span>
                  ) : (
                    <span className="text-amber-800">معلق ⏳</span>
                  )}
                </div>
              </div>
            </div>

            {najmDetailLoading ? (
              <div className="flex h-56 items-center justify-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">در حال دریافت ریز نمرات...</span>
              </div>
            ) : najmDetailError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
                دریافت ریزنمرات جلسه ناموفق بود: {najmDetailError}
              </div>
            ) : najmDetailRecords.length === 0 ? (
              <div className="rounded-2xl bg-secondary/40 p-8 text-center text-sm text-muted-foreground">
                رکوردی برای این جلسه ثبت نشده است.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">حاضر: {toFa(najmDetailSummary.present)}</Badge>
                    <Badge variant="outline" className="border-amber-200 text-amber-700">
                      تأخیر: {toFa(najmDetailSummary.late)}
                    </Badge>
                    <Badge variant="outline" className="border-rose-200 text-rose-700">
                      غایب: {toFa(najmDetailSummary.absent)}
                    </Badge>
                    <Badge className="bg-[#D4AF37] text-emerald-950">
                      امتیاز کل: {toFa(najmDetailSummary.score)}
                    </Badge>
                  </div>
                  <ExportButton
                    onExcel={() => exportNajmSessionDetail("excel")}
                    onPDF={() => exportNajmSessionDetail("pdf")}
                    onWord={() => exportNajmSessionDetail("word")}
                  />
                </div>

                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <table className="w-full min-w-[1080px] text-xs md:text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-secondary/50 text-muted-foreground">
                        <th className="p-2 text-center">ردیف</th>
                        <th className="p-2 text-right">قرآن‌آموز</th>
                        {najmScoreItems.map((item) => (
                          <th
                            key={item.item_key}
                            className={
                              "p-2 text-center " +
                              (item.kind === "negative"
                                ? "bg-rose-50"
                                : item.kind === "special"
                                  ? "bg-emerald-50"
                                  : "")
                            }
                            title={
                              !item.is_active
                                ? "این آیتم اکنون غیرفعال است؛ مقادیر قبلی منجمد نمایش داده می‌شود"
                                : undefined
                            }
                          >
                            {item.label}
                            {item.kind === "negative" && item.weight > 1 && (
                              <span className="block text-[10px] font-normal text-rose-500">
                                هر واحد {toFa(item.weight)}−
                              </span>
                            )}
                          </th>
                        ))}
                        {najmDetailExamItem && <th className="p-2 text-center">نمره نمایشی</th>}
                        <th className="p-2 text-center">جبران</th>
                        <th className="p-2 text-center">امتیاز جلسه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {najmDetailRecords.map((record, recordIndex) => {
                        const attendance = najmNumber(record.attendance);
                        const absent = attendance === 0 || record.is_absent === true;
                        const absenceKindLabel = record.absence_kind
                          ? (NAJM_ABSENCE_KIND_LABELS[record.absence_kind] ?? record.absence_kind)
                          : "";
                        return (
                          <tr key={record.id} className="border-t hover:bg-secondary/30">
                            <td className="p-2 text-center text-muted-foreground">
                              {toFa(recordIndex + 1)}
                            </td>
                            <td className="p-2 font-bold">{record.student_name || "بدون نام"}</td>
                            {najmScoreItems.map((item) => {
                              const value = getNajmItemValue(record, item);
                              const cellClass =
                                item.kind === "negative"
                                  ? "p-2 text-center bg-rose-50/70 text-rose-700"
                                  : item.kind === "special"
                                    ? "p-2 text-center bg-emerald-50/60"
                                    : "p-2 text-center";

                              if (item.item_key === "attendance") {
                                return (
                                  <td key={item.item_key} className={cellClass}>
                                    <Badge variant="outline">
                                      {absent
                                        ? absenceKindLabel
                                          ? `غایب (${absenceKindLabel})`
                                          : "غایب"
                                        : attendance >= najmDetailAttendanceMax
                                          ? "حاضر"
                                          : `${toFa(najmReportLateMinutes(attendance, najmDetailAttendanceMax) ?? 0)} دقیقه تأخیر`}
                                    </Badge>
                                  </td>
                                );
                              }

                              if (item.kind === "negative") {
                                return (
                                  <td key={item.item_key} className={cellClass}>
                                    -{toFa(value * item.weight)}
                                  </td>
                                );
                              }

                              if (item.kind === "special") {
                                return (
                                  <td key={item.item_key} className={cellClass}>
                                    {value > 0 ? (
                                      <Badge className="bg-[#D4AF37] text-emerald-950">
                                        +{toFa(value)}
                                      </Badge>
                                    ) : (
                                      toFa(value)
                                    )}
                                  </td>
                                );
                              }

                              return (
                                <td key={item.item_key} className={cellClass}>
                                  {toFa(value)}
                                </td>
                              );
                            })}
                            {najmDetailExamItem && (
                              <td className="p-2 text-center font-bold text-emerald-700">
                                {absent
                                  ? "—"
                                  : toFa(getNajmItemValue(record, najmDetailExamItem) + 10)}
                              </td>
                            )}
                            <td className="p-2 text-center">
                              {najmNumber(record.recovery_bonus) > 0 && record.session_id ? (
                                <ConductRecoveryHistoryDialog
                                  studentId={String(record.student_id ?? "")}
                                  sessionId={record.session_id}
                                  recoveryBonus={najmNumber(record.recovery_bonus)}
                                />
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="p-2 text-center font-black text-emerald-950">
                              {toFa(najmNumber(record.session_score))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  مقادیر همان امتیازهای ثبت‌شده در همان جلسه است (منجمد زمانی)؛ آیتم غیرفعال‌شده نیز
                  با مقدار قبلی خود نمایش داده می‌شود.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
