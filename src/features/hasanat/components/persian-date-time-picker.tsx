import { useEffect, useMemo, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getTehranPersianParts,
  PERSIAN_MONTHS,
  persianMonthLength,
  persianPartsToIso,
  type PersianDateTimeParts,
} from "@/features/hasanat/utils/persian-datetime";

const fa = (value: number) =>
  String(value).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
const range = (start: number, length: number) =>
  Array.from({ length }, (_, index) => start + index);

export function PersianDateTimePicker({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  futureYears = 10,
}: {
  label: string;
  value: string;
  onChange: (isoValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  futureYears?: number;
}) {
  const [parts, setParts] = useState<PersianDateTimeParts | null>(() =>
    value ? getTehranPersianParts(value) : null,
  );
  useEffect(() => {
    setParts(value ? getTehranPersianParts(value) : null);
  }, [value]);
  const currentYear = getTehranPersianParts(new Date()).year;
  const years = useMemo(
    () => range(currentYear - 2, futureYears + 3),
    [currentYear, futureYears],
  );

  function commit(next: PersianDateTimeParts) {
    const maxDay = persianMonthLength(next.year, next.month);
    const normalized = { ...next, day: Math.min(next.day, maxDay) };
    setParts(normalized);
    onChange(persianPartsToIso(normalized));
  }

  function initialize() {
    const now = new Date();
    now.setSeconds(0, 0);
    const initial = getTehranPersianParts(now);
    setParts(initial);
    onChange(now.toISOString());
  }

  if (!parts) {
    return (
      <div>
        <p className="mb-1 text-xs font-medium">{label}</p>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center"
          disabled={disabled}
          onClick={initialize}
        >
          <CalendarDays className="ml-2 h-4 w-4" />
          انتخاب تاریخ و ساعت شمسی
        </Button>
        {required && <input className="sr-only" value="" required readOnly />}
      </div>
    );
  }

  const dayCount = persianMonthLength(parts.year, parts.month);
  return (
    <fieldset disabled={disabled} className="rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <legend className="px-1 text-xs font-bold">{label} — زمان تهران</legend>
        {!required && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setParts(null);
              onChange("");
            }}
          >
            <X className="ml-1 h-4 w-4" /> حذف
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="text-[11px] text-muted-foreground">
          روز
          <select
            aria-label={`${label}، روز`}
            className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm"
            value={parts.day}
            onChange={(event) =>
              commit({ ...parts, day: Number(event.target.value) })
            }
          >
            {range(1, dayCount).map((day) => (
              <option key={day} value={day}>
                {fa(day)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground sm:col-span-1">
          ماه
          <select
            aria-label={`${label}، ماه`}
            className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm"
            value={parts.month}
            onChange={(event) =>
              commit({ ...parts, month: Number(event.target.value) })
            }
          >
            {PERSIAN_MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          سال
          <select
            aria-label={`${label}، سال`}
            className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm"
            value={parts.year}
            onChange={(event) =>
              commit({ ...parts, year: Number(event.target.value) })
            }
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {fa(year)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          ساعت
          <select
            aria-label={`${label}، ساعت`}
            className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm"
            value={parts.hour}
            onChange={(event) =>
              commit({ ...parts, hour: Number(event.target.value) })
            }
          >
            {range(0, 24).map((hour) => (
              <option key={hour} value={hour}>
                {fa(hour).padStart(2, "۰")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          دقیقه
          <select
            aria-label={`${label}، دقیقه`}
            className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm"
            value={parts.minute}
            onChange={(event) =>
              commit({ ...parts, minute: Number(event.target.value) })
            }
          >
            {range(0, 60).map((minute) => (
              <option key={minute} value={minute}>
                {fa(minute).padStart(2, "۰")}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
