import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  TrendingUp,
  TrendingDown,
  CalendarDays,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { getCurrentStudent, type CurrentStudent } from "@/lib/student-utils";

export const Route = createFileRoute("/student/attendance")({
  head: () => ({
    meta: [
      { title: "دارالقرآن ٱلوالدین — حضور و غیاب" },
      { name: "description", content: "سابقه حضور و غیاب قرآن‌آموز" },
    ],
  }),
  component: StudentAttendance,
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(input: string | number | null | undefined): string {
  if (input == null) return "—";
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function monthNameToNumber(name: string): number {
  return PERSIAN_MONTHS.findIndex((m) => m === name) + 1;
}

function parseDelayMinutes(note: string | null | undefined): number {
  const v = String(note ?? "").trim();
  if (!v) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "absent" | "late";
  note: string | null;
  created_at: string;
}

function StudentAttendance() {
  const [student, setStudent] = useState<CurrentStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filterMonth, setFilterMonth] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const s = await getCurrentStudent();
        setStudent(s);
        if (s) await loadAttendance(s);
      } catch (err) {
        console.error("[student attendance] خطا:", err);
      }
      setLoading(false);
    })();
  }, []);

  async function loadAttendance(s: CurrentStudent) {
    const { data } = await supabase
      .from("attendance")
      .select("id, student_id, date, status, note, created_at")
      .eq("student_id", s.id)
      .order("date", { ascending: false })
      .limit(200);
    setRecords(((data ?? []) as any[]).map((r) => ({
      id: String(r.id),
      date: String(r.date),
      status: normalizeStatus(r.status),
      note: r.note ?? null,
      created_at: String(r.created_at),
    })));
  }

  function normalizeStatus(s: any): "present" | "absent" | "late" {
    const v = String(s ?? "").trim().toLowerCase();
    if (v === "present" || v === "حاضر") return "present";
    if (v === "absent" || v === "غایب") return "absent";
    return "late";
  }

  // استخراج ماه‌های منحصر به فرد
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      const parts = r.date.split("/");
      if (parts.length >= 2) {
        const y = parts[0];
        const m = parseInt(parts[1], 10);
        if (m >= 1 && m <= 12) {
          set.add(`${y}/${String(m).padStart(2, "0")}`);
        }
      }
    });
    return Array.from(set).sort().reverse();
  }, [records]);

  // فیلتر
  const filtered = useMemo(() => {
    if (filterMonth === "all") return records;
    return records.filter((r) => r.date.startsWith(filterMonth));
  }, [records, filterMonth]);

  // آمار کلی
  const overallStats = useMemo(() => {
    let present = 0,
      absent = 0,
      late = 0;
    for (const r of records) {
      if (r.status === "present") present++;
      else if (r.status === "absent") absent++;
      else late++;
    }
    const total = records.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, absent, late, total, rate };
  }, [records]);

  // آمار فیلتر شده
  const filteredStats = useMemo(() => {
    let present = 0,
      absent = 0,
      late = 0;
    for (const r of filtered) {
      if (r.status === "present") present++;
      else if (r.status === "absent") absent++;
      else late++;
    }
    const total = filtered.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, absent, late, total, rate };
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری...</span>
      </div>
    );
  }

  if (!student) {
    return (
      <Card className="p-12 text-center">
        <h3 className="font-display text-lg">اطلاعات قرآن‌آموز یافت نشد</h3>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="حضور و غیاب من"
        description={`سابقه کامل حضور و غیاب ${student.name}`}
      />

      {/* آمار کلی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SimpleStat
          label="درصد حضور کل"
          value={overallStats.rate + "٪"}
          color={overallStats.rate >= 80 ? "emerald" : overallStats.rate >= 60 ? "amber" : "rose"}
          icon={<TrendingUp />}
        />
        <SimpleStat
          label="حاضر"
          value={overallStats.present}
          color="emerald"
          icon={<CheckCircle2 />}
        />
        <SimpleStat
          label="غایب"
          value={overallStats.absent}
          color="rose"
          icon={<XCircle />}
        />
        <SimpleStat
          label="با تأخیر"
          value={overallStats.late}
          color="amber"
          icon={<Clock />}
        />
      </div>

      {/* فیلتر ماهانه */}
      {availableMonths.length > 0 && (
        <Card className="p-3 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>فیلتر بر اساس ماه:</span>
            </div>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه ماه‌ها</SelectItem>
                {availableMonths.map((m) => {
                  const [y, mo] = m.split("/");
                  const monthName = PERSIAN_MONTHS[parseInt(mo, 10) - 1] ?? "";
                  return (
                    <SelectItem key={m} value={m}>
                      {monthName} {toFa(y)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {filterMonth !== "all" && (
              <Badge variant="outline" className="text-xs">
                نمایش {toFa(filteredStats.total)} روز •
                درصد حضور: {toFa(filteredStats.rate)}٪
              </Badge>
            )}
          </div>
        </Card>
      )}

      {/* لیست */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-display text-lg mb-1">
            هنوز سابقه حضور و غیابی ثبت نشده
          </h3>
          <p className="text-sm text-muted-foreground">
            پس از ثبت جلسات توسط استاد، اینجا نمایش داده می‌شود.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              لیست جلسات ({toFa(filtered.length)} جلسه)
            </span>
          </div>
          <ul className="divide-y">
            {filtered.map((r) => {
              const delay = parseDelayMinutes(r.note);
              return <AttendanceRow key={r.id} record={r} delay={delay} />;
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

function AttendanceRow({
  record,
  delay,
}: {
  record: AttendanceRecord;
  delay: number;
}) {
  const config = {
    present: {
      label: "حاضر",
      color: "bg-emerald-100 text-emerald-700 border-emerald-200",
      icon: <CheckCircle2 className="h-4 w-4" />,
      rowBg: "hover:bg-emerald-50/30",
    },
    absent: {
      label: "غایب",
      color: "bg-rose-100 text-rose-700 border-rose-200",
      icon: <XCircle className="h-4 w-4" />,
      rowBg: "hover:bg-rose-50/30",
    },
    late: {
      label: delay > 0 ? `تأخیر (${toFa(delay)} دقیقه)` : "تأخیر",
      color: "bg-amber-100 text-amber-700 border-amber-200",
      icon: <Clock className="h-4 w-4" />,
      rowBg: "hover:bg-amber-50/30",
    },
  }[record.status];

  return (
    <li className={"px-4 py-3 flex items-center gap-3 transition " + config.rowBg}>
      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-muted/30">
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{toFa(record.date)}</div>
        <div className="text-xs text-muted-foreground">
          {getPersianDateLabel(record.date)}
        </div>
      </div>
      <Badge className={`${config.color} gap-1 px-3 py-1`}>
        {config.icon}
        <span>{config.label}</span>
      </Badge>
    </li>
  );
}

function getPersianDateLabel(jDate: string): string {
  try {
    const parts = jDate.split("/");
    if (parts.length < 3) return "";
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const monthName = PERSIAN_MONTHS[m - 1] ?? "";
    const days = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
    return `${days[(m + d) % 7]} ${toFa(d)} ${monthName}`;
  } catch {
    return "";
  }
}

function SimpleStat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: "amber" | "emerald" | "rose" | "blue";
  icon: React.ReactNode;
}) {
  const colors = {
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    rose: "text-rose-700 bg-rose-50 border-rose-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
  }[color];

  return (
    <Card className={`p-3 border ${colors}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs opacity-80 mb-0.5">{label}</div>
          <div className="font-display text-xl">{toFa(value)}</div>
        </div>
        <div className={`rounded-lg p-2 ${colors}`}>{icon}</div>
      </div>
    </Card>
  );
}
