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

export function StudentProfileDialog() {
  const {
    showProfile,
    setShowProfile,
    selectedStudent,
    profileLoading,
    profileError,
    profileDateRange,
    setProfileDateRange,
    profileSessionDate,
    setProfileSessionDate,
    profileSessionDates,
    filteredProfileGrades,
    filteredProfileAttendance,
    studentPayments,
    exportStudentProfile,
  } = useReportsDialogContext();

  return (
    <Dialog open={showProfile} onOpenChange={setShowProfile}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle>پروفایل آموزشی — {selectedStudent?.name}</DialogTitle>
            {selectedStudent && !profileLoading && (
              <ExportButton
                onExcel={() => exportStudentProfile("excel")}
                onPDF={() => exportStudentProfile("pdf")}
                onWord={() => exportStudentProfile("word")}
              />
            )}
          </div>
          {selectedStudent && !profileLoading && (
            <div className="flex items-center gap-2 flex-wrap pt-2">
              <DateRangeFilter
                value={profileDateRange}
                onChange={(v) => {
                  setProfileDateRange(v);
                  setProfileSessionDate(null);
                }}
              />
              <SessionDateFilter
                value={profileSessionDate}
                onChange={setProfileSessionDate}
                dates={profileSessionDates}
              />
            </div>
          )}
        </DialogHeader>
        {profileLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="mr-2 text-sm text-muted-foreground">در حال بارگذاری...</span>
          </div>
        ) : (
          selectedStudent && (
            <div className="space-y-4 py-2">
              {profileError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  اطلاعات آموزشی نمایش داده می‌شود، اما دریافت بخش مالی ناموفق بود: {profileError}
                </div>
              )}
              {/* اطلاعات پایه */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-[#efebd9]/40 border border-black/[0.02]">
                <div>
                  <p className="text-xs text-muted-foreground font-black">نام</p>
                  <p className="font-semibold text-sm text-[#2d2620]">{selectedStudent.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-black">سطح</p>
                  <p className="font-semibold text-sm text-[#2d2620]">{selectedStudent.level}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-black">ولی</p>
                  <p className="font-semibold text-sm text-[#2d2620]">
                    {selectedStudent.parent_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-black">تاریخ ثبت‌نام</p>
                  <p className="font-semibold text-sm text-[#2d2620]">
                    {toFa(selectedStudent.enrolled)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-black">میانگین نمرات</p>
                  <p className="font-bold text-[#4a5839]">
                    {selectedStudent.average_grade == null
                      ? "—"
                      : `${toFa(selectedStudent.average_grade)} / ۲۰`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-black">درصد حضور</p>
                  <p className="font-bold text-success">
                    {selectedStudent.attendance_rate == null
                      ? "—"
                      : `٪${toFa(selectedStudent.attendance_rate)}`}
                  </p>
                </div>
              </div>

              {/* آمار کلی (بر اساس فیلتر انتخابی) */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3.5 rounded-2xl bg-success/10 border border-success/20 text-center quran-soft-clay-card">
                  <p className="text-lg font-black text-success">
                    {toFa(filteredProfileAttendance.filter((a) => a.status === "present").length)}
                  </p>
                  <p className="text-xs text-muted-foreground font-black mt-1">حضور</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-center quran-soft-clay-card">
                  <p className="text-lg font-black text-destructive">
                    {toFa(filteredProfileAttendance.filter((a) => a.status === "absent").length)}
                  </p>
                  <p className="text-xs text-muted-foreground font-black mt-1">غیبت</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-center quran-soft-clay-card">
                  <p className="text-lg font-black text-[#4a5839]">
                    {toFa(filteredProfileGrades.length)}
                  </p>
                  <p className="text-xs text-muted-foreground font-black mt-1">آزمون</p>
                </div>
              </div>

              {/* سوابق نمرات */}
              <div>
                <h4 className="font-semibold text-sm mb-2 text-[#2d2620] font-black">
                  سوابق نمرات
                  {(profileDateRange !== "all" || profileSessionDate) && (
                    <span className="text-xs text-muted-foreground font-normal">
                      {" "}
                      (بر اساس فیلتر انتخابی)
                    </span>
                  )}
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto quran-scroll">
                  {filteredProfileGrades.map((g, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#efebd9]/40 text-sm border border-black/[0.02]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5d6d45]/10 text-[10px] font-black text-[#4a5839]">
                          {toFa(i + 1)}
                        </span>
                        <div>
                          <p className="font-semibold text-sm text-[#2d2620]">{g.subject}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 font-sans">
                            {toFa(g.date)} — {g.teacher}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-[#4a5839]">{toFa(g.grade)} / ۲۰</span>
                    </div>
                  ))}
                  {filteredProfileGrades.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      نمره‌ای ثبت نشده
                    </p>
                  )}
                </div>
              </div>

              {/* سوابق حضور و غیاب */}
              <div>
                <h4 className="font-semibold text-sm mb-2 text-[#2d2620] font-black">
                  سوابق حضور و غیاب
                  {(profileDateRange !== "all" || profileSessionDate) && (
                    <span className="text-xs text-muted-foreground font-normal">
                      {" "}
                      (بر اساس فیلتر انتخابی)
                    </span>
                  )}
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto quran-scroll">
                  {filteredProfileAttendance.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#efebd9]/40 text-sm border border-black/[0.02]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5d6d45]/10 text-[10px] font-black text-[#4a5839]">
                          {toFa(i + 1)}
                        </span>
                        <div>
                          <p className="text-xs text-muted-foreground font-semibold">
                            {toFa(a.date)}
                          </p>
                          {a.note && (
                            <p className="text-xs text-muted-foreground mt-0.5">{a.note}</p>
                          )}
                        </div>
                      </div>
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
                  ))}
                  {filteredProfileAttendance.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      رکوردی ثبت نشده
                    </p>
                  )}
                </div>
              </div>

              {/* وضعیت مالی — همه ترم‌ها */}
              <div>
                <h4 className="font-semibold text-sm mb-2 text-[#2d2620] font-black">
                  وضعیت مالی — تمام ترم‌ها
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto quran-scroll">
                  {studentPayments.map((p, i) => {
                    const amount = Number(p.amount ?? 0);
                    const paidAmt =
                      p.status === "cancelled"
                        ? 0
                        : Number(p.paid_amount ?? (p.status === "paid" ? amount : 0));
                    const remaining = p.status === "cancelled" ? 0 : Math.max(0, amount - paidAmt);
                    return (
                      <div
                        key={i}
                        className="flex justify-between p-3.5 rounded-xl bg-[#efebd9]/40 text-sm border border-black/[0.02]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5d6d45]/10 text-[10px] font-black text-[#4a5839]">
                            {toFa(i + 1)}
                          </span>
                          <div>
                            <span className="font-semibold text-[#2d2620]">{p.semester}</span>
                            {p.date && (
                              <p className="text-xs text-muted-foreground mt-0.5">{toFa(p.date)}</p>
                            )}
                            {remaining > 0 && (
                              <p className="text-xs text-destructive font-semibold mt-0.5">
                                باقیمانده: {formatTomanFa(remaining)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">
                            {formatTomanFa(paidAmt)} / {formatTomanFa(amount)}
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
                      </div>
                    );
                  })}
                  {studentPayments.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      سابقه مالی ثبت نشده
                    </p>
                  )}
                </div>
                {studentPayments.length > 0 && (
                  <div className="mt-2.5 p-3 rounded-2xl bg-success/10 border border-success/20 flex justify-between text-sm quran-soft-clay-card">
                    <span className="text-muted-foreground font-black">جمع پرداختی‌ها:</span>
                    <span className="font-bold text-success text-base">
                      {formatTomanFa(
                        studentPayments.reduce(
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
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
