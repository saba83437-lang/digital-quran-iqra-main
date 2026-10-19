import type { ReactNode } from "react";
import { CheckCircle2, HeartHandshake } from "lucide-react";

import type { ConductRecoveryCase } from "@/features/recitation/api/conduct-recovery-api";

interface ConductRecoveryPanelProps {
  cases: ConductRecoveryCase[];
  selected: boolean;
  disabled: boolean;
  appliedBonus?: number;
  historyAction?: ReactNode;
  onToggle: () => void;
}

function toPersianDigits(value: number | string): string {
  const digits = "۰۱۲۳۴۵۶۷۸۹";
  return String(value).replace(/[0-9]/g, (digit) => digits[Number(digit)]);
}

/** Compact recovery cell: open cases remain actionable and persisted recovery
 * stays attributable after refresh, even after all related cases are resolved. */
export function ConductRecoveryPanel({
  cases,
  selected,
  disabled,
  appliedBonus = 0,
  historyAction,
  onToggle,
}: ConductRecoveryPanelProps) {
  if (cases.length === 0 && appliedBonus <= 0 && !historyAction) return null;

  const remainingAmount = cases.reduce(
    (sum, recoveryCase) => sum + Math.max(0, recoveryCase.remaining_amount),
    0,
  );
  const remainingSessions =
    cases.length > 0
      ? Math.min(
          ...cases.map((recoveryCase) => Math.max(0, recoveryCase.recovery_sessions_remaining)),
        )
      : 0;

  return (
    <div className="flex min-w-[150px] flex-col items-center gap-1">
      {appliedBonus > 0 && (
        <div className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />+{toPersianDigits(appliedBonus)} جبران ثبت‌شده
        </div>
      )}
      {cases.length > 0 && (
        <>
          <div className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-emerald-800">
            <HeartHandshake className="h-3 w-3 shrink-0" />
            <span>باقی‌مانده: {toPersianDigits(remainingAmount)}</span>
            <span className="text-emerald-700/70">({toPersianDigits(remainingSessions)} جلسه)</span>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={onToggle}
            className={[
              "inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 text-[10px] font-bold transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                : "border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50",
            ].join(" ")}
          >
            {selected && <CheckCircle2 className="h-3 w-3 shrink-0" />}
            {selected ? "جبران انتخاب شد" : "ثبت جبران"}
          </button>
        </>
      )}
      {historyAction}
    </div>
  );
}
