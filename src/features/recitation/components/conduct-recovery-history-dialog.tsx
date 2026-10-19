import { useState } from "react";
import { HeartHandshake, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  loadConductRecoveryHistory,
  type ConductRecoveryCase,
  type ConductRecoveryHistory,
} from "@/features/recitation/api/conduct-recovery-api";

interface ConductRecoveryHistoryDialogProps {
  studentId: string | number;
  sessionId: string;
  recoveryBonus?: number;
  triggerLabel?: string;
  disabled?: boolean;
}

const DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value).replace(/[0-9]/g, (digit) => DIGITS[Number(digit)]);
}

function conductLabel(value: ConductRecoveryCase["conduct_type"]): string {
  return value === "negative_disrespect" ? "بی‌احترامی" : "بی‌نظمی";
}

function statusLabel(value: ConductRecoveryCase["status"]): string {
  return (
    {
      open: "باز",
      in_recovery: "در حال جبران",
      resolved: "جبران‌شده",
      expired: "منقضی",
      escalated: "ارجاع‌شده",
    }[value] ?? value
  );
}

export function ConductRecoveryHistoryDialog({
  studentId,
  sessionId,
  recoveryBonus = 0,
  triggerLabel = "جزئیات جبران",
  disabled = false,
}: ConductRecoveryHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ConductRecoveryHistory | null>(null);

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || history || loading) return;
    setLoading(true);
    setError(null);
    try {
      setHistory(await loadConductRecoveryHistory({ studentId, sessionId }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "دریافت تاریخچه جبران ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => void handleOpenChange(true)}
        className="h-7 gap-1 px-2 text-[10px] text-emerald-700"
      >
        <HeartHandshake className="h-3.5 w-3.5" />
        {recoveryBonus > 0 ? `+${toFa(recoveryBonus)} جبران` : triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={(value) => void handleOpenChange(value)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>تاریخچه جبران رفتاری</DialogTitle>
            <DialogDescription>
              ارتباط پرونده رفتاری، جلسه مبدأ و رویدادهای جبران ثبت‌شده
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> در حال دریافت تاریخچه...
            </div>
          )}
          {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {!loading && !error && history && (
            <div className="space-y-5">
              <section className="space-y-2">
                <h3 className="font-bold text-emerald-950">موارد رفتاری ایجادشده در این جلسه</h3>
                {history.sourceCases.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-muted-foreground">
                    موردی ثبت نشده است.
                  </p>
                ) : (
                  history.sourceCases.map((item) => (
                    <div key={item.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{conductLabel(item.conduct_type)}</Badge>
                        <Badge variant="secondary">{statusLabel(item.status)}</Badge>
                        <span>جلسه مبدأ: {toFa(item.source_session_date)}</span>
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        کسر اولیه: {toFa(item.initial_deduction)} • جبران‌شده:{" "}
                        {toFa(item.recovered_amount)} • باقی‌مانده: {toFa(item.remaining_amount)}
                      </p>
                    </div>
                  ))
                )}
              </section>

              <section className="space-y-2">
                <h3 className="font-bold text-emerald-950">جبران‌های اعمال‌شده در این جلسه</h3>
                {history.appliedEvents.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-muted-foreground">
                    رویداد جبرانی ثبت نشده است.
                  </p>
                ) : (
                  history.appliedEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-emerald-600">+{toFa(event.amount)} جبران</Badge>
                        <Badge variant="outline">{conductLabel(event.conduct_type)}</Badge>
                        <Badge variant="secondary">{statusLabel(event.case_status)}</Badge>
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        جلسه مبدأ: {toFa(event.source_session_date)} • جلسه مقصد:{" "}
                        {toFa(event.target_session_date)} • ثبت:{" "}
                        {toFa(new Date(event.created_at).toLocaleString("fa-IR"))}
                      </p>
                    </div>
                  ))
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
