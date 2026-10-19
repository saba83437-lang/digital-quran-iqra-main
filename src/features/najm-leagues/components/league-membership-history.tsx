import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  History,
  Loader2,
  Search,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNajmLeagueMembershipHistory } from "../api";
import type {
  LeagueMembershipHistoryData,
  LeagueMembershipHistoryEvent,
  LeagueMembershipHistoryEventType,
  NajmLeagueWorkspaceData,
} from "../types";
import { jalaliMonthTitle, toFa } from "../utils";

const EVENT_LABELS: Record<LeagueMembershipHistoryEventType, string> = {
  joined: "ورود به رده",
  left: "خروج از رده",
  transferred: "انتقال بین رده‌ها",
  scheduled_join: "زمان‌بندی ورود",
  scheduled_leave: "زمان‌بندی خروج",
  schedule_cancelled: "لغو زمان‌بندی",
};

const EVENT_STYLES: Record<LeagueMembershipHistoryEventType, string> = {
  joined: "border-emerald-200 bg-emerald-50 text-emerald-800",
  left: "border-rose-200 bg-rose-50 text-rose-800",
  transferred: "border-blue-200 bg-blue-50 text-blue-800",
  scheduled_join: "border-violet-200 bg-violet-50 text-violet-800",
  scheduled_leave: "border-amber-200 bg-amber-50 text-amber-800",
  schedule_cancelled: "border-slate-200 bg-slate-100 text-slate-700",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "مدیر",
  teacher: "استاد",
  parent: "ولی",
  student: "قرآن‌آموز",
  system: "سامانه",
};

function eventDescription(event: LeagueMembershipHistoryEvent): string {
  const from = event.from_league_title ?? "رده قبلی";
  const to = event.to_league_title ?? "رده جدید";
  switch (event.event_type) {
    case "joined":
      return `وارد رده «${to}» شد.`;
    case "left":
      return `از رده «${from}» خارج شد.`;
    case "transferred":
      return `از رده «${from}» به رده «${to}» منتقل شد.`;
    case "scheduled_join":
      return `ورود به رده «${to}» زمان‌بندی شد.`;
    case "scheduled_leave":
      return `خروج از رده «${from}» زمان‌بندی شد.`;
    case "schedule_cancelled":
      return `زمان‌بندی عضویت در رده «${from}» لغو شد.`;
  }
}

function formatOccurredAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(date);
}

export function LeagueMembershipHistoryButton({
  data,
  variant = "outline",
}: {
  data: NajmLeagueWorkspaceData;
  variant?: "outline" | "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<LeagueMembershipHistoryData | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setHistory(null);
    setSearch("");
    setStudentFilter("all");
    setLeagueFilter("all");
    setEventFilter("all");
    setMonthFilter("all");
    void getNajmLeagueMembershipHistory({
      classId: data.class_id,
      term: data.term,
      academicYear: data.academic_year,
      limit: 500,
    }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.error || !result.data) {
        toast.error(result.error ?? "خطا در دریافت تاریخچه عضویت");
        return;
      }
      setHistory(result.data);
    });
    return () => {
      active = false;
    };
  }, [open, data.class_id, data.term, data.academic_year]);

  const months = useMemo(
    () =>
      [...new Set(history?.events.map((event) => event.effective_month) ?? [])]
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a)),
    [history],
  );

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fa");
    return (history?.events ?? []).filter((event) => {
      if (query && !event.student_name.toLocaleLowerCase("fa").includes(query))
        return false;
      if (studentFilter !== "all" && event.student_id !== Number(studentFilter))
        return false;
      if (
        leagueFilter !== "all" &&
        event.from_league_id !== leagueFilter &&
        event.to_league_id !== leagueFilter
      )
        return false;
      if (eventFilter !== "all" && event.event_type !== eventFilter)
        return false;
      if (monthFilter !== "all" && event.effective_month !== monthFilter)
        return false;
      return true;
    });
  }, [history, search, studentFilter, leagueFilter, eventFilter, monthFilter]);

  const personalView = history && !history.can_view_class_history;
  return (
    <>
      <Button
        type="button"
        variant={variant}
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <History className="h-4 w-4" />
        تاریخچه عضویت
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[92vh] max-w-5xl overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-emerald-700" />
              {personalView
                ? history?.role === "student"
                  ? "تاریخچه عضویت من"
                  : "تاریخچه عضویت فرزندان"
                : `تاریخچه عضویت کلاس ${data.class_name}`}
            </DialogTitle>
            <DialogDescription>
              تاریخچه فقط از زمان فعال‌سازی این قابلیت ثبت شده و سوابق پیشین
              بازسازی نشده‌اند.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              در حال دریافت تاریخچه...
            </div>
          ) : !history ? (
            <Card className="border-dashed p-8 text-center text-muted-foreground">
              تاریخچه در دسترس نیست.
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                {history.can_view_class_history && (
                  <div className="relative md:col-span-2 xl:col-span-1">
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="pr-9"
                      placeholder="جست‌وجوی قرآن‌آموز"
                    />
                  </div>
                )}
                {history.students.length > 1 && (
                  <Select
                    value={studentFilter}
                    onValueChange={setStudentFilter}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="همه افراد" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه افراد</SelectItem>
                      {history.students.map((student) => (
                        <SelectItem key={student.id} value={String(student.id)}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={leagueFilter} onValueChange={setLeagueFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="همه رده‌ها" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه رده‌ها</SelectItem>
                    {history.leagues.map((league) => (
                      <SelectItem key={league.id} value={league.id}>
                        {league.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={eventFilter} onValueChange={setEventFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="همه رخدادها" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه رخدادها</SelectItem>
                    {Object.entries(EVENT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="همه ماه‌ها" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه ماه‌ها</SelectItem>
                    {months.map((month) => (
                      <SelectItem key={month} value={month}>
                        {jalaliMonthTitle(month)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <span className="font-bold text-slate-700">
                  {toFa(filteredEvents.length)} رخداد نمایش داده می‌شود
                </span>
                {(studentFilter !== "all" ||
                  leagueFilter !== "all" ||
                  eventFilter !== "all" ||
                  monthFilter !== "all" ||
                  search) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearch("");
                      setStudentFilter("all");
                      setLeagueFilter("all");
                      setEventFilter("all");
                      setMonthFilter("all");
                    }}
                  >
                    پاک‌کردن فیلترها
                  </Button>
                )}
              </div>
              {filteredEvents.length === 0 ? (
                <Card className="rounded-3xl border-dashed p-10 text-center text-muted-foreground">
                  <CalendarClock className="mx-auto mb-3 h-9 w-9" />
                  هنوز رخدادی مطابق این محدوده ثبت نشده است.
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredEvents.map((event, index) => (
                    <HistoryEventCard
                      key={`${event.transaction_id}-${event.student_id}-${event.effective_month}-${event.event_type}-${index}`}
                      event={event}
                      showStudent={history.can_view_class_history}
                      onSelectStudent={() => {
                        setSearch("");
                        setStudentFilter(String(event.student_id));
                      }}
                    />
                  ))}
                </div>
              )}
              <p className="text-center text-xs text-muted-foreground">
                حداکثر ۵۰۰ رخداد اخیر این دوره نمایش داده می‌شود.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function HistoryEventCard({
  event,
  showStudent,
  onSelectStudent,
}: {
  event: LeagueMembershipHistoryEvent;
  showStudent: boolean;
  onSelectStudent: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm">
      <span className="absolute bottom-0 right-0 top-0 w-1 bg-emerald-500" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {showStudent ? (
              <button
                type="button"
                className="flex items-center gap-1 font-bold text-emerald-900 hover:underline"
                onClick={onSelectStudent}
              >
                <UserRound className="h-4 w-4" />
                {event.student_name}
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="flex items-center gap-1 font-bold text-emerald-900">
                <UserRound className="h-4 w-4" />
                {event.student_name}
              </span>
            )}
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-bold ${EVENT_STYLES[event.event_type]}`}
            >
              {EVENT_LABELS[event.event_type]}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-800">
            {eventDescription(event)}
          </p>
          <p className="text-xs text-muted-foreground">
            اثرگذاری از {jalaliMonthTitle(event.effective_month)}
          </p>
        </div>
        <div className="shrink-0 text-left text-xs leading-6 text-muted-foreground">
          <p>{formatOccurredAt(event.occurred_at)}</p>
          <p>
            ثبت‌کننده: {event.actor_name} —{" "}
            {ROLE_LABELS[event.actor_role] ?? event.actor_role}
          </p>
        </div>
      </div>
    </div>
  );
}
