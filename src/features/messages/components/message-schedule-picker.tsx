import { useEffect, useMemo } from "react";
import { CalendarClock, Check } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  daysInJalaliMonth,
  formatScheduledAt,
  jalaliPartsToKey,
  parseJalaliKey,
  resolveScheduledAt,
  tehranTodayJalaliParts,
  type MessageSchedulePreset,
} from "../domain/message-schedule";

const PRESETS: Array<{ value: MessageSchedulePreset; label: string }> = [
  { value: "5m", label: "۵ دقیقه بعد" },
  { value: "15m", label: "۱۵ دقیقه بعد" },
  { value: "1h", label: "یک ساعت بعد" },
  { value: "tomorrow9", label: "فردا ساعت ۹" },
  { value: "custom", label: "زمان دلخواه" },
];

export function MessageSchedulePicker({
  enabled,
  preset,
  customDate,
  customTime,
  onEnabledChange,
  onPresetChange,
  onCustomDateChange,
  onCustomTimeChange,
}: {
  enabled: boolean;
  preset: MessageSchedulePreset;
  customDate: string;
  customTime: string;
  onEnabledChange: (enabled: boolean) => void;
  onPresetChange: (preset: MessageSchedulePreset) => void;
  onCustomDateChange: (value: string) => void;
  onCustomTimeChange: (value: string) => void;
}) {
  const today = tehranTodayJalaliParts();
  const selected = parseJalaliKey(customDate) ?? {
    year: today.jy,
    month: today.jm,
    day: today.jd,
  };
  const years = Array.from({ length: 4 }, (_, index) => today.jy + index);
  const daysInMonth = daysInJalaliMonth(selected.year, selected.month);
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const [selectedHour = "09", selectedMinute = "00"] = customTime.split(":");
  const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
  const minutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

  useEffect(() => {
    if (!enabled || preset !== "custom") return;
    if (!parseJalaliKey(customDate))
      onCustomDateChange(jalaliPartsToKey(today.jy, today.jm, today.jd));
    if (!customTime) {
      const now = new Date();
      const nextHour = (now.getHours() + 1) % 24;
      onCustomTimeChange(`${String(nextHour).padStart(2, "0")}:00`);
    }
  }, [customDate, customTime, enabled, onCustomDateChange, onCustomTimeChange, preset, today.jd, today.jm, today.jy]);

  const resolved = useMemo(
    () =>
      enabled
        ? resolveScheduledAt({ preset, customJalaliDate: customDate, customTime })
        : null,
    [customDate, customTime, enabled, preset],
  );

  function updateDate(next: Partial<typeof selected>) {
    const value = { ...selected, ...next };
    const maxDay = daysInJalaliMonth(value.year, value.month);
    onCustomDateChange(jalaliPartsToKey(value.year, value.month, Math.min(value.day, maxDay)));
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-xs">
      <label className="flex cursor-pointer items-center gap-2 font-black">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <CalendarClock className="h-4 w-4" /> زمان‌بندی واقعی ارسال
      </label>

      {enabled && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {PRESETS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onPresetChange(item.value)}
                className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition ${
                  preset === item.value
                    ? "border-amber-500 bg-amber-100 text-amber-950"
                    : "bg-white hover:bg-amber-50"
                }`}
              >
                {preset === item.value && <Check className="ml-1 inline h-3 w-3" />}
                {item.label}
              </button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="space-y-2 rounded-xl border bg-white p-3">
              <p className="font-bold">تاریخ جلالی و ساعت ۲۴ساعته</p>
              <div className="grid grid-cols-3 gap-2">
                <Select value={String(selected.year)} onValueChange={(value) => updateDate({ year: Number(value) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((year) => <SelectItem key={year} value={String(year)}>{year.toLocaleString("fa-IR", { useGrouping: false })}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(selected.month)} onValueChange={(value) => updateDate({ month: Number(value) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                      <SelectItem key={month} value={String(month)}>ماه {month.toLocaleString("fa-IR")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(selected.day)} onValueChange={(value) => updateDate({ day: Number(value) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {days.map((day) => <SelectItem key={day} value={String(day)}>روز {day.toLocaleString("fa-IR")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" dir="ltr">
                <Select
                  value={selectedHour}
                  onValueChange={(hour) => onCustomTimeChange(`${hour}:${selectedMinute}`)}
                >
                  <SelectTrigger className="font-mono"><SelectValue placeholder="ساعت" /></SelectTrigger>
                  <SelectContent>
                    {hours.map((hour) => (
                      <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="font-bold">:</span>
                <Select
                  value={minutes.includes(selectedMinute) ? selectedMinute : "00"}
                  onValueChange={(minute) => onCustomTimeChange(`${selectedHour}:${minute}`)}
                >
                  <SelectTrigger className="font-mono"><SelectValue placeholder="دقیقه" /></SelectTrigger>
                  <SelectContent>
                    {minutes.map((minute) => (
                      <SelectItem key={minute} value={minute}>{minute}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">
                ساعت به‌صورت ۲۴ساعته است؛ برای مثال ۱۴:۳۰ یعنی دو و نیم بعدازظهر.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            <span className="font-bold">زمان نهایی: </span>
            {resolved ? formatScheduledAt(resolved) : "تاریخ و ساعت را کامل کنید"}
          </div>
        </div>
      )}
    </div>
  );
}
