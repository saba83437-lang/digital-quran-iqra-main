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

export function SessionDetailDialog() {
  const {
    studentById,
    showSessionDetail,
    setShowSessionDetail,
    selectedSession,
    exportSessionDetail,
  } = useReportsDialogContext();

  return (
    <Dialog open={showSessionDetail} onOpenChange={setShowSessionDetail}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle>
              جزئیات جلسه — {selectedSession?.className} — {toFa(selectedSession?.date)}
            </DialogTitle>
            {selectedSession && (
              <ExportButton
                onExcel={() => exportSessionDetail("excel")}
                onPDF={() => exportSessionDetail("pdf")}
                onWord={() => exportSessionDetail("word")}
              />
            )}
          </div>
        </DialogHeader>
        {selectedSession && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3.5 rounded-2xl bg-success/10 border border-success/20 text-center quran-soft-clay-card">
                <p className="text-lg font-black text-success">{toFa(selectedSession.present)}</p>
                <p className="text-xs text-muted-foreground font-black mt-1">حاضر</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-center quran-soft-clay-card">
                <p className="text-lg font-black text-destructive">
                  {toFa(selectedSession.absent)}
                </p>
                <p className="text-xs text-muted-foreground font-black mt-1">غایب</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-center quran-soft-clay-card">
                <p className="text-lg font-black text-[#4a5839]">
                  {selectedSession.avgGrade !== "—"
                    ? `${toFa(selectedSession.avgGrade)} / ۲۰`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground font-black mt-1">میانگین نمره</p>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2 text-[#2d2620] font-black">حضور و غیاب</h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto quran-scroll">
                {selectedSession.attendanceRecords.map((a, i) => {
                  const st = lookupReportItem(studentById, a.student_id);
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#efebd9]/40 text-sm border border-black/[0.02]"
                    >
                      <span className="flex items-center gap-2 font-bold text-[#2d2620]">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5d6d45]/10 text-[10px] font-black text-[#4a5839]">
                          {toFa(i + 1)}
                        </span>
                        {st?.name ?? "—"}
                      </span>
                      {a.status === "present" && (
                        <Badge className="bg-success/15 text-success text-xs font-bold rounded-md px-2 py-0.5">
                          حاضر
                        </Badge>
                      )}
                      {a.status === "late" && (
                        <Badge className="bg-warning/20 text-warning-foreground text-xs font-bold rounded-md px-2 py-0.5">
                          با تأخیر • {toFa(a.late_minutes ?? 0)} دقیقه
                        </Badge>
                      )}
                      {a.status === "absent" && (
                        <Badge className="bg-destructive/15 text-destructive text-xs font-bold rounded-md px-2 py-0.5">
                          غایب
                        </Badge>
                      )}
                    </div>
                  );
                })}
                {selectedSession.attendanceRecords.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    حضور و غیاب ثبت نشده
                  </p>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2 text-[#2d2620] font-black">نمرات</h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto quran-scroll">
                {selectedSession.gradeRecords.map((g, i) => {
                  const st = lookupReportItem(studentById, g.student_id);
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#efebd9]/40 text-sm border border-black/[0.02]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5d6d45]/10 text-[10px] font-black text-[#4a5839]">
                          {toFa(i + 1)}
                        </span>
                        <div>
                          <p className="font-black text-sm text-[#2d2620]">{st?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 font-sans">
                            {g.subject}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-[#4a5839]">{toFa(g.grade)} / ۲۰</span>
                    </div>
                  );
                })}
                {selectedSession.gradeRecords.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">نمره‌ای ثبت نشده</p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
