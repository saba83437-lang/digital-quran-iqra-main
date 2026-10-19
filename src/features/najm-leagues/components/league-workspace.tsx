import { useEffect, useState } from "react";
import {
  Crown,
  Loader2,
  RefreshCw,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNajmLeagueWorkspace } from "../api";
import type { LeagueRole, NajmLeagueWorkspaceData } from "../types";
import { currentJalaliMonthKey, jalaliMonthTitle, toFa } from "../utils";
import { LeagueManager } from "./league-manager";
import { LeagueMembershipHistoryButton } from "./league-membership-history";
import { LeagueSymbol } from "./league-symbol";

export function NajmLeagueWorkspace({
  role,
  classId,
  monthKey = currentJalaliMonthKey(),
  management = true,
}: {
  role: LeagueRole;
  classId: number;
  monthKey?: string;
  management?: boolean;
}) {
  const [data, setData] = useState<NajmLeagueWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  async function load(showToast = false) {
    setLoading(true);
    const result = await getNajmLeagueWorkspace(classId, monthKey);
    setLoading(false);
    if (result.error || !result.data) {
      setData(null);
      toast.error(result.error ?? "خطا در دریافت رده‌ها");
      return;
    }
    setData(result.data);
    if (showToast) toast.success("رده‌ها به‌روز شدند");
  }
  useEffect(() => {
    void load();
  }, [classId, monthKey]);
  if (loading)
    return (
      <div className="flex h-48 items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        در حال دریافت رده‌های نجم...
      </div>
    );
  if (!data)
    return <Card className="p-8 text-center">اطلاعات رده در دسترس نیست.</Card>;
  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-black text-emerald-950">
            رده‌های {data.class_name}
          </h2>
          <p className="text-sm text-muted-foreground">
            رتبه ماهانه {jalaliMonthTitle(monthKey)} بر اساس مجموع رسمی امتیاز
            جلسه
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LeagueMembershipHistoryButton data={data} />
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void load(true)}
          >
            <RefreshCw className="h-4 w-4" />
            به‌روزرسانی
          </Button>
        </div>
      </div>
      {data.month_finalized && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          این ماه نهایی شده و جدول آن فقط‌خواندنی است.
        </div>
      )}
      {management &&
        !data.month_finalized &&
        (data.can_create || data.can_manage) && (
          <LeagueManager data={data} onChanged={() => void load()} />
        )}
      {data.leagues.filter((league) => !league.archived_at).length === 0 ? (
        <Card className="rounded-3xl border-dashed p-10 text-center">
          <Trophy className="mx-auto h-12 w-12 text-amber-500" />
          <h3 className="mt-3 font-display text-xl font-black">
            هنوز هیچ رده‌ای برای این کلاس راه‌اندازی نشده است
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            مدیر یا استاد کلاس می‌تواند اولین رده را با حداقل دو عضو ایجاد کند.
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {data.leagues
            .filter((league) => !league.archived_at)
            .map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
        </div>
      )}
    </div>
  );
}

function LeagueCard({
  league,
}: {
  league: NajmLeagueWorkspaceData["leagues"][number];
}) {
  return (
    <Card className="overflow-hidden rounded-3xl border-0 shadow-md">
      <div
        className="flex items-center justify-between px-5 py-4 text-white"
        style={{
          background: `linear-gradient(135deg,${league.color},${league.color}cc)`,
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
            <LeagueSymbol iconKey={league.icon_key} size={34} />
          </span>
          <div>
            <h3 className="font-display text-xl font-black">{league.title}</h3>
            <p className="text-xs text-white/75">
              {toFa(league.members.length)} عضو
            </p>
          </div>
        </div>
        <Crown className="h-7 w-7 text-amber-300" />
      </div>
      <div className="divide-y">
        {league.members.map((member) => (
          <div
            key={member.student_id}
            className="grid grid-cols-[42px_1fr_auto] items-center gap-3 p-3 hover:bg-slate-50"
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full font-display font-black ${member.rank === 1 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
            >
              {toFa(member.rank)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold">{member.student_name}</p>
              <p
                className={`mt-1 flex items-center gap-1 text-xs ${member.growth > 0 ? "text-emerald-700" : member.growth < 0 ? "text-rose-600" : "text-muted-foreground"}`}
              >
                <TrendingUp className="h-3 w-3" />
                رشد: {member.growth > 0 ? "+" : ""}
                {toFa(member.growth)}
              </p>
            </div>
            <div className="text-left">
              <p
                className="font-display text-lg font-black"
                style={{ color: league.color }}
              >
                {toFa(member.monthly_score)}
              </p>
              <Badge variant="outline" className="text-[10px]">
                امتیاز ماه
              </Badge>
            </div>
          </div>
        ))}
      </div>
      {league.members.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          <Users className="mx-auto h-8 w-8" />
          عضوی برای این ماه وجود ندارد.
        </div>
      )}
    </Card>
  );
}
