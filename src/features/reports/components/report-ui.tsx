import type { ReactNode } from "react";
import {
  Calendar,
  CalendarClock,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  School,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportDateRange as DateRange } from "../domain/report-date";
import { reportIdKey } from "../domain/report-id";
import type { ClassRow } from "../domain/report-types";
import { toFa } from "../domain/report-display";

function IslamicMosaicTiles() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.022] pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
    >
      <defs>
        <pattern id="mosaic-pattern" width="120" height="120" patternUnits="userSpaceOnUse">
          <path
            d="M60 0 L72 32 L104 20 L80 48 L112 60 L80 72 L104 100 L72 88 L60 120 L48 88 L16 100 L40 72 L8 60 L40 48 L16 20 L48 32 Z"
            fill="none"
            stroke="#5d6d45"
            strokeWidth="0.8"
          />
          <path
            d="M60 25 L67 43 L85 43 L70 54 L76 72 L60 61 L44 72 L50 54 L35 43 L53 43 Z"
            fill="none"
            stroke="#D4AF37"
            strokeWidth="0.6"
          />
          <circle cx="60" cy="60" r="10" fill="none" stroke="#5d6d45" strokeWidth="0.4" />
          <circle cx="0" cy="0" r="15" fill="none" stroke="#D4AF37" strokeWidth="0.4" />
          <circle cx="120" cy="0" r="15" fill="none" stroke="#D4AF37" strokeWidth="0.4" />
          <circle cx="0" cy="120" r="15" fill="none" stroke="#D4AF37" strokeWidth="0.4" />
          <circle cx="120" cy="120" r="15" fill="none" stroke="#D4AF37" strokeWidth="0.4" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#mosaic-pattern)" />
    </svg>
  );
}

function GildedIslamicLacePattern() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.14] pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="gilded-lace" width="48" height="48" patternUnits="userSpaceOnUse">
          <path
            d="M 24 0 C 34 12, 34 36, 24 48 C 14 36, 14 12, 24 0 Z"
            fill="none"
            stroke="#cfa864"
            strokeWidth="0.8"
          />
          <path
            d="M 0 24 C 12 34, 36 34, 48 24 C 36 14, 12 14, 0 24 Z"
            fill="none"
            stroke="#cfa864"
            strokeWidth="0.8"
          />
          <path
            d="M 24 16 C 26 10, 30 10, 32 16 C 30 22, 26 22, 24 16 Z"
            fill="#cfa864"
            fillOpacity="0.3"
            stroke="#cfa864"
            strokeWidth="0.4"
          />
          <path
            d="M 24 32 C 22 38, 18 38, 16 32 C 18 26, 22 26, 24 32 Z"
            fill="#cfa864"
            fillOpacity="0.3"
            stroke="#cfa864"
            strokeWidth="0.4"
          />
          <path
            d="M 16 24 C 10 22, 10 18, 16 16 C 22 18, 22 22, 16 24 Z"
            fill="#cfa864"
            fillOpacity="0.3"
            stroke="#cfa864"
            strokeWidth="0.4"
          />
          <path
            d="M 32 24 C 38 26, 38 30, 32 32 C 26 30, 26 26, 32 24 Z"
            fill="#cfa864"
            fillOpacity="0.3"
            stroke="#cfa864"
            strokeWidth="0.4"
          />
          <circle cx="24" cy="24" r="2" fill="#D4AF37" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#gilded-lace)" />
    </svg>
  );
}

export function IslamicRosette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="100" cy="100" r="72" />
        <circle cx="100" cy="100" r="46" />
        <path d="M100 18 121 70 174 47 130 86 182 100 130 114 174 153 121 130 100 182 79 130 26 153 70 114 18 100 70 86 26 47 79 70Z" />
        <path d="m100 35 17 42 43-18-35 32 42 9-42 9 35 32-43-18-17 42-17-42-43 18 35-32-42-9 42-9-35-32 43 18Z" />
        <circle cx="100" cy="100" r="18" />
      </g>
    </svg>
  );
}

export function PanelHeading({
  eyebrow,
  title,
  icon,
  action,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="quran-panel-heading relative overflow-hidden flex items-center justify-between gap-3 border-b border-amber-100/50 px-6 py-4.5">
      {/* Traditional repeating gold arabesque lace mesh spanning the entire header band */}
      <GildedIslamicLacePattern />

      {/* Glowing bottom gold inlay line bordering the heading band */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#cfa864]/50 to-transparent" />

      <div className="relative z-10">
        <p className="text-xs font-black text-amber-800 font-sans tracking-wide">{eyebrow}</p>
        <h2 className="mt-1 flex items-center gap-2 font-sans text-base font-black text-[#2d2620]">
          <span className="text-[#4a5839]">{icon}</span>
          {title}
        </h2>
      </div>
      <div className="relative z-10">{action}</div>
    </div>
  );
}

// موتور خروجی XLSX / چاپ PDF / DOCX در features/reports/export قرار دارد.

// ==================== دکمه خروجی ====================
interface ExportButtonProps {
  onExcel: () => void;
  onPDF: () => void;
  onWord: () => void;
  disabled?: boolean;
}

export function ExportButton({ onExcel, onPDF, onWord, disabled }: ExportButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 h-8 font-bold text-xs quran-soft-clay-card rounded-lg"
          disabled={disabled}
        >
          <Download className="h-3.5 w-3.5 text-[#4a5839]" />
          خروجی
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 rounded-xl">
        <DropdownMenuItem onClick={onExcel} className="gap-2 font-bold text-xs">
          <FileSpreadsheet className="h-4 w-4 text-green-600" />
          Excel (XLSX)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPDF} className="gap-2 font-bold text-xs">
          <FileText className="h-4 w-4 text-red-500" />
          PDF (چاپ)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onWord} className="gap-2 font-bold text-xs">
          <FileText className="h-4 w-4 text-blue-600" />
          Word (DOCX)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ==================== فیلتر بازه زمانی ====================
interface DateRangeFilterProps {
  value: DateRange;
  onChange: (v: DateRange) => void;
  showToday?: boolean;
}

export function DateRangeFilter({ value, onChange, showToday = true }: DateRangeFilterProps) {
  return (
    <Select value={value} onValueChange={(v: string) => onChange(v as DateRange)}>
      <SelectTrigger className="w-44 h-8 text-xs font-semibold rounded-lg">
        <Calendar className="h-3 w-3 ml-1 text-[#4a5839]" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        {showToday && <SelectItem value="today">امروز</SelectItem>}
        <SelectItem value="week">هفته اخیر</SelectItem>
        <SelectItem value="month">ماه اخیر</SelectItem>
        <SelectItem value="term">ترم اخیر</SelectItem>
        <SelectItem value="all">همه زمان‌ها</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ==================== فیلتر تاریخ جلسه دقیق ====================
interface SessionDateFilterProps {
  value: string | null;
  onChange: (v: string | null) => void;
  dates: string[];
}

export function SessionDateFilter({ value, onChange, dates }: SessionDateFilterProps) {
  return (
    <Select value={value ?? "all"} onValueChange={(v: string) => onChange(v === "all" ? null : v)}>
      <SelectTrigger className="w-44 h-8 text-xs font-semibold rounded-lg">
        <CalendarClock className="h-3 w-3 ml-1 text-[#4a5839]" />
        <SelectValue placeholder="تاریخ جلسه" />
      </SelectTrigger>
      <SelectContent className="max-h-72 rounded-xl">
        <SelectItem value="all">همه جلسات (بازه زمانی)</SelectItem>
        {dates.map((d) => (
          <SelectItem key={d} value={d}>
            جلسه {toFa(d)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ==================== فیلتر کلاس (داخل هر جدول) ====================
interface ClassFilterSelectProps {
  value: string;
  onChange: (v: string) => void;
  classes: ClassRow[];
  className?: string;
}

export function ClassFilterSelect({ value, onChange, classes, className }: ClassFilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? "w-48 h-8 text-xs font-semibold rounded-lg"}>
        <School className="h-3 w-3 ml-1 text-[#4a5839]" />
        <SelectValue placeholder="همه کلاس‌ها" />
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        <SelectItem value="all">همه کلاس‌ها</SelectItem>
        {classes.map((c) => {
          const classId = reportIdKey(c.id);
          if (!classId) return null;
          return (
            <SelectItem key={classId} value={classId}>
              {c.name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// ==================== کارت آماری فشرده ====================
interface MiniStatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "primary" | "gold" | "success" | "warning" | "destructive" | "muted";
}

export function MiniStatCard({ label, value, icon, tone = "primary" }: MiniStatCardProps) {
  const tones: Record<string, string> = {
    primary: "text-blue-700 bg-blue-50 border border-blue-100/50 shadow-sm",
    gold: "text-amber-700 bg-amber-50 border border-amber-100/50 shadow-sm",
    success: "text-teal-700 bg-teal-50 border border-teal-100/50 shadow-sm",
    warning: "text-rose-700 bg-rose-50 border border-rose-100/50 shadow-sm",
    destructive: "text-red-700 bg-red-50 border border-red-100/50 shadow-sm",
    muted: "text-violet-700 bg-violet-50 border border-violet-100/50 shadow-sm",
  };

  return (
    <Card className="p-3.5 quran-soft-clay-card rounded-2xl shadow-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md border border-[#cfa864]/20 relative overflow-hidden">
      <IslamicMosaicTiles />
      <div className="relative z-10 flex items-center gap-2.5">
        <div
          className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${tones[tone]}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground font-black leading-tight truncate">
            {label}
          </p>
          <p className="text-sm font-black font-display text-[#2d2620] tracking-tight mt-1 leading-tight">
            {typeof value === "number" ? toFa(value) : value}
          </p>
        </div>
      </div>
    </Card>
  );
}
