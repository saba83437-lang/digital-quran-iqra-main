import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolvePrivateStorageUrl } from "@/features/storage/private-storage-url";
import { getNajmLeagueWorkspace } from "@/features/najm-leagues/api";
import {
  createLeaguePosterLayout,
  LeagueClassPoster,
} from "@/features/najm-leagues/components/league-class-poster";
import { LeagueMembershipHistoryButton } from "@/features/najm-leagues/components/league-membership-history";
import type { NajmLeagueWorkspaceData } from "@/features/najm-leagues/types";
import { jalaliMonthTitle, toFa } from "@/features/najm-leagues/utils";
import {
  getSharedNajmPeriodResults,
  getSharedNajmResultsCatalog,
} from "../api";
import type {
  SharedNajmCatalog,
  SharedNajmClass,
  SharedNajmPeriodResults,
  SharedNajmRole,
  SharedNajmScope,
  SharedNajmStudentResult,
  SharedNajmTerm,
} from "../types";
import {
  ClassResultPoster,
  DEFAULT_CLASS_LAYOUT,
  DEFAULT_OVERALL_LAYOUT,
  OverallResultPoster,
  resolveReadOnlyLayout,
} from "./result-poster";

const DEFAULT_OVERALL_POSTER = "/najm-posters/poster-overall.png";
const DEFAULT_CLASS_POSTER = "/najm-posters/poster-class.png";
const roleTitle: Record<SharedNajmRole, string> = {
  teacher: "استاد",
  parent: "ولی",
  student: "قرآن‌آموز",
};

export function ReadOnlyNajmResultsPage({ role }: { role: SharedNajmRole }) {
  const [catalog, setCatalog] = useState<SharedNajmCatalog | null>(null);
  const [scope, setScope] = useState<SharedNajmScope>("monthly");
  const [periodKey, setPeriodKey] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [results, setResults] = useState<SharedNajmPeriodResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgrounds, setBackgrounds] = useState({
    overall: DEFAULT_OVERALL_POSTER,
    class: DEFAULT_CLASS_POSTER,
  });
  async function loadCatalog(showToast = false) {
    showToast ? setRefreshing(true) : setLoading(true);
    const response = await getSharedNajmResultsCatalog();
    setLoading(false);
    setRefreshing(false);
    if (response.error || !response.data)
      return toast.error(response.error ?? "خطا در دریافت دوره‌های نجم");
    setCatalog(response.data);
    const initial =
      response.data.terms.find((item) => item.is_active) ??
      response.data.terms[0];
    if (initial && !periodKey)
      setPeriodKey(`${initial.year_key}|${initial.term}`);
    if (showToast) toast.success("نتایج به‌روز شد");
  }
  useEffect(() => {
    void loadCatalog();
  }, []);
  const selectedTerm = useMemo(() => {
    if (!catalog) return null;
    const [year, term] = periodKey.split("|");
    return (
      catalog.terms.find(
        (item) => item.year_key === year && item.term === term,
      ) ?? null
    );
  }, [catalog, periodKey]);
  const months = useMemo(
    () =>
      catalog?.months.filter(
        (item) =>
          !selectedTerm ||
          (item.year_key === selectedTerm.year_key &&
            item.term === selectedTerm.term),
      ) ?? [],
    [catalog, selectedTerm],
  );
  useEffect(() => {
    if (!months.length) {
      setMonthKey("");
      return;
    }
    if (!months.some((item) => item.month_key === monthKey))
      setMonthKey(months[0].month_key);
  }, [months, monthKey]);
  useEffect(() => {
    if (!selectedTerm || scope === "monthly") {
      setResults(null);
      return;
    }
    let active = true;
    setLoading(true);
    void getSharedNajmPeriodResults(
      scope,
      selectedTerm.year_key,
      selectedTerm.term,
    ).then((response) => {
      if (!active) return;
      setLoading(false);
      if (response.error || !response.data) {
        setResults(null);
        toast.error(response.error ?? "خطا در دریافت نتایج");
      } else setResults(response.data);
    });
    return () => {
      active = false;
    };
  }, [scope, selectedTerm?.year_key, selectedTerm?.term]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      resolvePrivateStorageUrl(
        "najm-posters",
        selectedTerm?.overall_results_poster_path,
      ),
      resolvePrivateStorageUrl(
        "najm-posters",
        selectedTerm?.class_results_poster_path,
      ),
    ]).then(([overall, classPoster]) => {
      if (active)
        setBackgrounds({
          overall: overall || DEFAULT_OVERALL_POSTER,
          class: classPoster || DEFAULT_CLASS_POSTER,
        });
    });
    return () => {
      active = false;
    };
  }, [
    selectedTerm?.overall_results_poster_path,
    selectedTerm?.class_results_poster_path,
  ]);
  const classGroups = useMemo(() => {
    if (!catalog || !results) return [];
    const resultRows = results.rows;
    const map = new Map<number, SharedNajmStudentResult[]>();
    for (const row of resultRows) {
      const list = map.get(row.class_id) ?? [];
      list.push(row);
      map.set(row.class_id, list);
    }
    return [...map.entries()]
      .map(([id, students]) => ({
        info: catalog.classes.find((item) => item.id === id) ?? {
          id,
          name: students[0]?.class_name ?? "بدون کلاس",
          level: null,
          teacher_name: "استاد نامشخص",
          is_relevant: catalog.relevant_class_ids.includes(id),
        },
        students: [...students].sort(
          (a, b) =>
            b.total - a.total ||
            b.average - a.average ||
            a.name.localeCompare(b.name, "fa"),
        ),
        average:
          students.reduce((sum, item) => sum + item.average, 0) /
          students.length,
      }))
      .sort(
        (a, b) =>
          Number(b.info.is_relevant) - Number(a.info.is_relevant) ||
          a.info.name.localeCompare(b.info.name, "fa"),
      );
  }, [catalog, results]);
  if (loading && !catalog)
    return (
      <div className="flex h-64 items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        در حال دریافت نتایج نجم...
      </div>
    );
  if (!catalog)
    return (
      <Card className="p-10 text-center">نتایج طرح نجم در دسترس نیست.</Card>
    );
  return (
    <div className="space-y-6" dir="rtl">
      <header className="rounded-3xl border border-emerald-100 bg-gradient-to-l from-emerald-950 to-emerald-800 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black">
              نتایج طرح نجم — پنل {roleTitle[role]}
            </h1>
            <p className="mt-1 text-sm text-white/70">
              نمای فقط‌خواندنی پوسترهای رسمی که مدیر مرکز تنظیم کرده است
            </p>
          </div>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => void loadCatalog(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            به‌روزرسانی
          </Button>
        </div>
      </header>
      <Card className="rounded-3xl p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          {" "}
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["monthly", "ماهانه"],
                ["term", "ترمی"],
                ["annual", "سالانه"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={scope === value ? "default" : "outline"}
                onClick={() => setScope(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Select value={periodKey} onValueChange={setPeriodKey}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب دوره" />
            </SelectTrigger>
            <SelectContent>
              {catalog.terms.map((term, index) => (
                <SelectItem
                  key={`${term.year_key}|${term.term}|${index}`}
                  value={`${term.year_key}|${term.term}`}
                >
                  {term.title} — {toFa(term.year_key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {scope === "monthly" && (
          <div className="mt-3">
            <Select value={monthKey} onValueChange={setMonthKey}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب ماه" />
              </SelectTrigger>
              <SelectContent>
                {months.map((item) => (
                  <SelectItem
                    key={`${item.year_key}|${item.term}|${item.month_key}`}
                    value={item.month_key}
                  >
                    {jalaliMonthTitle(item.month_key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Card>
      {scope === "monthly" ? (
        <MonthlyResults
          catalog={catalog}
          term={selectedTerm}
          monthKey={monthKey}
        />
      ) : loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !results || !results.rows.length ? (
        <Empty text="برای این دوره نتیجه‌ای ثبت نشده است." />
      ) : scope === "annual" ? (
        <div className="space-y-8">
          <SectionTitle icon={<Sparkles />} title="۱۰ نفر برتر کل دارالقرآن" />
          <OverallResultPoster
            layout={resolveReadOnlyLayout(
              selectedTerm?.overall_results_layout,
              DEFAULT_OVERALL_LAYOUT,
            )}
            backgroundUrl={backgrounds.overall}
            students={results.rows.slice(0, 10)}
            title={selectedTerm?.title ?? "نتایج سالانه"}
            year={selectedTerm?.year_key ?? ""}
          />
          <ClassPosters
            groups={classGroups}
            layout={resolveReadOnlyLayout(
              selectedTerm?.class_results_layout,
              DEFAULT_CLASS_LAYOUT,
            )}
            background={backgrounds.class}
          />
        </div>
      ) : (
        <ClassPosters
          groups={classGroups}
          layout={resolveReadOnlyLayout(
            selectedTerm?.class_results_layout,
            DEFAULT_CLASS_LAYOUT,
          )}
          background={backgrounds.class}
        />
      )}
    </div>
  );
}
function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 font-display text-xl font-black text-emerald-950">
      {icon}
      {title}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <Card className="rounded-3xl border-dashed p-12 text-center text-muted-foreground">
      {text}
    </Card>
  );
}
function ClassPosters({
  groups,
  layout,
  background,
}: {
  groups: Array<{
    info: SharedNajmClass;
    students: SharedNajmPeriodResults["rows"];
    average: number;
  }>;
  layout: Parameters<typeof ClassResultPoster>[0]["layout"];
  background: string;
}) {
  return (
    <section className="space-y-6">
      <SectionTitle icon={<BarChart3 />} title="پوستر نتایج کلاس‌ها" />
      {groups.map((group, index) => (
        <ClassResultPoster
          key={group.info.id}
          layout={layout}
          backgroundUrl={background}
          classInfo={group.info}
          students={group.students}
          rank={index + 1}
        />
      ))}
    </section>
  );
}
function MonthlyResults({
  catalog,
  term,
  monthKey,
}: {
  catalog: SharedNajmCatalog;
  term: SharedNajmTerm | null;
  monthKey: string;
}) {
  if (!term || !monthKey) return <Empty text="ماه موردنظر را انتخاب کنید." />;
  const orderedClasses = [...catalog.classes].sort(
    (a, b) =>
      Number(b.is_relevant) - Number(a.is_relevant) ||
      a.name.localeCompare(b.name, "fa"),
  );
  return (
    <section className="space-y-6">
      <SectionTitle
        icon={<CalendarDays />}
        title={`پوستر رده‌های ماه ${jalaliMonthTitle(monthKey)}`}
      />
      {orderedClasses.map((item) => (
        <ReadOnlyLeagueClass
          key={item.id}
          classInfo={item}
          term={term}
          monthKey={monthKey}
        />
      ))}
    </section>
  );
}
function ReadOnlyLeagueClass({
  classInfo,
  term,
  monthKey,
}: {
  classInfo: SharedNajmClass;
  term: SharedNajmTerm;
  monthKey: string;
}) {
  const [data, setData] = useState<NajmLeagueWorkspaceData | null>(null);
  const [background, setBackground] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void getNajmLeagueWorkspace(classInfo.id, monthKey, {
      term: term.term,
      academicYear: term.academic_year,
    }).then(async (response) => {
      if (!active) return;
      if (response.data) {
        setData(response.data);
        const path = response.data.poster_setting?.background_path;
        setBackground(
          path
            ? (await resolvePrivateStorageUrl("najm-posters", path)) || ""
            : "",
        );
      } else {
        setData(null);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [classInfo.id, monthKey, term.term, term.academic_year]);
  if (loading)
    return (
      <Card className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </Card>
    );
  if (!data) {
    return (
      <Card className="rounded-3xl border-dashed p-8 text-center text-muted-foreground">
        اطلاعات کلاس {classInfo.name} در دسترس نیست.
      </Card>
    );
  }
  if (!data.leagues.some((league) => !league.archived_at)) {
    return (
      <Card className="rounded-3xl border-dashed p-8 text-center text-muted-foreground">
        <p>برای کلاس {classInfo.name} در این ماه رده‌ای وجود ندارد.</p>
        <div className="mt-4 flex justify-center">
          <LeagueMembershipHistoryButton data={data} />
        </div>
      </Card>
    );
  }
  const limit = data.poster_setting?.display_limit ?? null;
  return (
    <LeagueClassPoster
      data={data}
      layout={
        data.poster_setting?.layout ?? createLeaguePosterLayout(data, limit)
      }
      backgroundUrl={background}
      limit={limit}
    />
  );
}
