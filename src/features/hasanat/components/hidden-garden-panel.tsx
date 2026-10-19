import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Archive,
  Check,
  EyeOff,
  Flower2,
  Loader2,
  Plus,
  RefreshCw,
  Shuffle,
  Sprout,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PersianDateTimePicker } from "@/features/hasanat/components/persian-date-time-picker";
import { formatPersianDateTime } from "@/features/hasanat/utils/persian-datetime";
import {
  hiddenGardenRpc,
  loadHiddenGardenHub,
} from "@/features/hasanat/api/hidden-garden-stage-b";
import type {
  GardenPeriodMode,
  HiddenGardenHub,
  HiddenGardenStage,
  IkhlasAssignmentType,
  IkhlasMission,
  IkhlasMissionMode,
  StudentMission,
} from "@/features/hasanat/types/hidden-garden-stage-b";

type Role = "admin" | "teacher" | "parent" | "student";
const fa = (value: unknown) =>
  String(value ?? "").replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
const stageMeta: Record<
  HiddenGardenStage,
  { title: string; art: string; text: string }
> = {
  waiting: {
    title: "در انتظار نخستین کار پنهان",
    art: "🌱",
    text: "کار نیک پنهان، حتی اگر کسی نبیند، بی‌اثر نمی‌ماند.",
  },
  seed: {
    title: "بذر",
    art: "🌰",
    text: "بذر کوچکی در باغ اخلاص کاشته شده است.",
  },
  sprout: {
    title: "جوانه",
    art: "🌱",
    text: "جوانه‌ای آرام و بی‌صدا سر از خاک بیرون آورده است.",
  },
  leaf: {
    title: "برگ",
    art: "🍃",
    text: "باغ پنهان تو برگ‌های تازه‌ای پیدا کرده است.",
  },
  tree: {
    title: "درخت",
    art: "🌳",
    text: "کارهای پنهان، درختی استوار ساخته‌اند.",
  },
  garden: {
    title: "باغ",
    art: "🌿🌳🌷",
    text: "باغ اخلاص تو سبز و زنده است؛ بی‌نیاز از دیده‌شدن.",
  },
};
const periodLabels: Record<GardenPeriodMode, string> = {
  term: "ترمی",
  academic_year: "سال تحصیلی",
  lifetime: "دائمی",
};
const modeLabels: Record<IkhlasMissionMode, string> = {
  self_garden: "تأیید شخصی + رشد باغ",
  self_only: "تأیید شخصی بدون رشد باغ",
  display_only: "حتی به سامانه هم نگو",
};
export function HiddenGardenPanel({ role }: { role: Role }) {
  const [hub, setHub] = useState<HiddenGardenHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHub(await loadHiddenGardenHub());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "دریافت کارهای پنهان ناموفق بود.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);
  async function run<T>(key: string, action: () => Promise<T>) {
    setBusy(key);
    try {
      const result = await action();
      toast.success("با موفقیت ثبت شد.");
      await load();
      return result;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "عملیات ناموفق بود.",
      );
      return undefined;
    } finally {
      setBusy("");
    }
  }
  if (loading && !hub)
    return (
      <div className="flex min-h-52 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    );
  if (!hub)
    return (
      <Card className="p-6 text-center">
        اطلاعات کارهای پنهان در دسترس نیست.
      </Card>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">کارهای پنهان</h2>
          <p className="text-sm text-muted-foreground">
            نیکی‌هایی که برای دیده‌شدن انجام نمی‌شوند.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw
            className={`ml-1 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          تازه‌سازی
        </Button>
      </div>
      {role === "student" && (
        <StudentHiddenGarden hub={hub} busy={busy} run={run} />
      )}
      {role === "teacher" && <TeacherSharedMissions hub={hub} />}
      {role === "admin" && (
        <AdminHiddenGarden hub={hub} busy={busy} run={run} />
      )}
      {role === "parent" && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          جزئیات کارهای پنهان فرزند محرمانه است.
        </Card>
      )}
    </div>
  );
}

function StudentHiddenGarden({
  hub,
  busy,
  run,
}: {
  hub: HiddenGardenHub;
  busy: string;
  run: <T>(key: string, action: () => Promise<T>) => Promise<T | undefined>;
}) {
  const stage = stageMeta[hub.garden_stage || "waiting"];
  return (
    <>
      <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 text-center">
        <p className="text-xs text-muted-foreground">
          باغ {periodLabels[hub.period_mode]}
        </p>
        <div className="my-5 text-7xl" aria-hidden>
          {stage.art}
        </div>
        <h3 className="text-xl font-black text-emerald-950">{stage.title}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-emerald-900">
          {stage.text}
        </p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {(hub.missions as StudentMission[]).map((mission) => (
          <Card
            key={mission.assignment_id}
            className="p-5"
            style={{ borderTop: `4px solid ${mission.color}` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black">{mission.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {mission.description}
                </p>
              </div>
              {mission.mode === "display_only" ? (
                <EyeOff className="h-6 w-6 text-indigo-600" />
              ) : (
                <Sprout className="h-6 w-6 text-emerald-600" />
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              تا {formatPersianDateTime(mission.ends_at)}
            </p>
            {mission.mode === "display_only" ? (
              <div className="mt-4 rounded-xl bg-indigo-50 p-3 text-center text-sm font-bold text-indigo-900">
                حتی به سامانه هم نگو 🤍
              </div>
            ) : (
              <Button
                className="mt-4 w-full"
                variant={mission.is_completed ? "outline" : "default"}
                disabled={busy === mission.assignment_id}
                onClick={() =>
                  void run(mission.assignment_id, () =>
                    hiddenGardenRpc("set_hasanat_ikhlas_completion", {
                      p_assignment: mission.assignment_id,
                      p_completed: !mission.is_completed,
                    }),
                  )
                }
              >
                {mission.is_completed ? (
                  <>
                    <Check className="ml-1 h-4 w-4" />
                    انجام شد؛ برای لغو لمس کن
                  </>
                ) : (
                  "انجامش دادم"
                )}
              </Button>
            )}
          </Card>
        ))}
      </div>
      {!hub.missions.length && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          اکنون مأموریت فعالی برای تو وجود ندارد.
        </Card>
      )}
    </>
  );
}

function TeacherSharedMissions({ hub }: { hub: HiddenGardenHub }) {
  const missions = hub.missions as Array<{
    round_id: string;
    round_title: string;
    title: string;
    description: string;
    starts_at: string;
    ends_at: string;
    color: string;
  }>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {missions.map((mission) => (
        <Card
          key={mission.round_id}
          className="p-5"
          style={{ borderTop: `4px solid ${mission.color}` }}
        >
          <h3 className="font-black">{mission.title}</h3>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {mission.description}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            تا {formatPersianDateTime(mission.ends_at)}
          </p>
        </Card>
      ))}
      {!missions.length && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          مأموریت مشترک فعالی برای کلاس‌های شما وجود ندارد.
        </Card>
      )}
    </div>
  );
}

function AdminHiddenGarden({
  hub,
  busy,
  run,
}: {
  hub: HiddenGardenHub;
  busy: string;
  run: <T>(key: string, action: () => Promise<T>) => Promise<T | undefined>;
}) {
  return (
    <div className="space-y-5">
      <GardenPolicy hub={hub} busy={busy} run={run} />
      <div className="grid gap-5 xl:grid-cols-2">
        <MissionManager hub={hub} busy={busy} run={run} />
        <RoundManager hub={hub} busy={busy} run={run} />
      </div>
      <AdminIkhlasAudit hub={hub} />
    </div>
  );
}

type Runner = <T>(
  key: string,
  action: () => Promise<T>,
) => Promise<T | undefined>;
function GardenPolicy({
  hub,
  busy,
  run,
}: {
  hub: HiddenGardenHub;
  busy: string;
  run: Runner;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black">دوره باغ پنهان</h3>
          <p className="text-xs text-muted-foreground">
            تغییر دوره، فقط محاسبه مرحله نمایشی را تغییر می‌دهد و سابقه حذف
            نمی‌شود.
          </p>
        </div>
        <select
          className="h-10 rounded-lg border px-3 text-sm"
          value={hub.period_mode}
          disabled={busy === "period-mode"}
          onChange={(event) => {
            const next = event.target.value as GardenPeriodMode;
            if (confirm(`دوره باغ به «${periodLabels[next]}» تغییر کند؟`))
              void run("period-mode", () =>
                hiddenGardenRpc("admin_set_hasanat_garden_period_mode", {
                  p_mode: next,
                }),
              );
          }}
        >
          <option value="term">ترمی</option>
          <option value="academic_year">سال تحصیلی</option>
          <option value="lifetime">دائمی</option>
        </select>
      </div>
    </Card>
  );
}

function MissionManager({
  hub,
  busy,
  run,
}: {
  hub: HiddenGardenHub;
  busy: string;
  run: Runner;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<IkhlasMissionMode>("self_garden");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await run("mission-create", () =>
      hiddenGardenRpc("admin_save_hasanat_ikhlas_mission", {
        p_data: {
          title,
          description,
          mode,
          status: "draft",
          icon: "seedling",
          color: "#047857",
        },
      }),
    );
    if (result !== undefined) {
      setTitle("");
      setDescription("");
    }
  }
  function editMission(mission: IkhlasMission) {
    const nextTitle = prompt("عنوان مأموریت:", mission.title);
    const nextDescription = prompt("متن مأموریت:", mission.description);
    if (nextTitle && nextDescription)
      void run(`mission-edit-${mission.id}`, () =>
        hiddenGardenRpc("admin_save_hasanat_ikhlas_mission", {
          p_data: {
            ...mission,
            title: nextTitle,
            description: nextDescription,
          },
        }),
      );
  }
  return (
    <Card className="p-5">
      <h3 className="font-black">الگوهای مأموریت</h3>
      <form className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}>
        <input
          className="h-10 w-full rounded-lg border px-3 text-sm"
          placeholder="عنوان کوتاه"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          className="min-h-24 w-full rounded-lg border p-3 text-sm"
          placeholder="متن مأموریت"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <select
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={mode}
          onChange={(e) => setMode(e.target.value as IkhlasMissionMode)}
        >
          {Object.entries(modeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={busy === "mission-create"}>
          <Plus className="ml-1 h-4 w-4" />
          افزودن مأموریت
        </Button>
      </form>
      <div className="mt-5 space-y-2 border-t pt-4">
        {hub.templates.map((mission) => (
          <div key={mission.id} className="rounded-xl border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <b>{mission.title}</b>
                <p className="text-xs text-muted-foreground">
                  {modeLabels[mission.mode]} • {mission.status}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => editMission(mission)}
                >
                  ویرایش
                </Button>
                {mission.status !== "archived" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(`mission-status-${mission.id}`, () =>
                        hiddenGardenRpc("admin_save_hasanat_ikhlas_mission", {
                          p_data: {
                            ...mission,
                            status:
                              mission.status === "active" ? "draft" : "active",
                          },
                        }),
                      )
                    }
                  >
                    {mission.status === "active" ? "غیرفعال‌کردن" : "فعال‌سازی"}
                  </Button>
                )}
                {mission.status !== "archived" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm("مأموریت بایگانی شود؟"))
                        void run(`mission-archive-${mission.id}`, () =>
                          hiddenGardenRpc(
                            "admin_archive_hasanat_ikhlas_mission",
                            { p_id: mission.id },
                          ),
                        );
                    }}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RoundManager({
  hub,
  busy,
  run,
}: {
  hub: HiddenGardenHub;
  busy: string;
  run: Runner;
}) {
  const activeTemplates = hub.templates.filter(
    (item) => item.status === "active",
  );
  const [title, setTitle] = useState("");
  const [type, setType] = useState<IkhlasAssignmentType>("random_individual");
  const [classId, setClassId] = useState("");
  const [sharedMission, setSharedMission] = useState("");
  const [pool, setPool] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [autoAssign, setAutoAssign] = useState(false);
  useEffect(() => {
    if (!startsAt) setStartsAt(new Date(Date.now() + 5 * 60000).toISOString());
    if (!endsAt) setEndsAt(new Date(Date.now() + 7 * 86400000).toISOString());
  }, [startsAt, endsAt]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (type === "random_individual" && !pool.length)
      return toast.error("حداقل یک مأموریت برای انتخاب تصادفی تعیین کنید.");
    const id = await run<string>("round-create", () =>
      hiddenGardenRpc<string>("admin_save_hasanat_ikhlas_round", {
        p_data: {
          title,
          assignment_type: type,
          class_id: classId || null,
          shared_mission_id: type === "shared_class" ? sharedMission : null,
          starts_at: startsAt,
          ends_at: endsAt,
          auto_assign: autoAssign,
          status: "scheduled",
        },
      }),
    );
    if (id && type === "random_individual")
      await run("round-pool", () =>
        hiddenGardenRpc("admin_set_hasanat_ikhlas_round_pool", {
          p_round: id,
          p_missions: pool,
        }),
      );
    if (id) setTitle("");
  }
  return (
    <Card className="p-5">
      <h3 className="font-black">زمان‌بندی و تخصیص</h3>
      <form className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}>
        <input
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان نوبت هفتگی"
          required
        />
        <select
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as IkhlasAssignmentType)}
        >
          <option value="random_individual">تصادفی فردی</option>
          <option value="shared_class">مشترک کلاس</option>
        </select>
        <select
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          required={type === "shared_class"}
        >
          <option value="">
            {type === "random_individual" ? "همه کلاس‌ها" : "انتخاب کلاس"}
          </option>
          {hub.classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {type === "shared_class" ? (
          <select
            className="h-10 w-full rounded-lg border px-3 text-sm"
            value={sharedMission}
            onChange={(e) => setSharedMission(e.target.value)}
            required
          >
            <option value="">انتخاب مأموریت مشترک</option>
            {activeTemplates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-xl border p-3">
            <p className="mb-2 text-xs font-bold">مجموعه انتخاب تصادفی</p>
            {activeTemplates.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={pool.includes(item.id)}
                  onChange={(e) =>
                    setPool((current) =>
                      e.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.title}
              </label>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <PersianDateTimePicker
            label="شروع مأموریت"
            value={startsAt}
            onChange={setStartsAt}
            required
          />
          <PersianDateTimePicker
            label="پایان مأموریت"
            value={endsAt}
            onChange={setEndsAt}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoAssign}
            onChange={(e) => setAutoAssign(e.target.checked)}
          />
          تخصیص خودکار در زمان شروع
        </label>
        <Button type="submit" disabled={busy === "round-create"}>
          ساخت نوبت
        </Button>
      </form>
      <div className="mt-5 space-y-2 border-t pt-4">
        {hub.rounds.map((round) => (
          <div key={round.id} className="rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b>{round.title}</b>
                <p className="text-xs text-muted-foreground">
                  {round.assignment_type === "shared_class"
                    ? `مشترک ${round.class_name || "کلاس"}`
                    : `تصادفی ${round.class_name || "همه کلاس‌ها"}`}{" "}
                  • {round.status} • {fa(round.assignment_count)} تخصیص
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  از {formatPersianDateTime(round.starts_at)} تا{" "}
                  {formatPersianDateTime(round.ends_at)}
                </p>
              </div>
              <div className="flex gap-2">
                {round.status !== "ended" && round.status !== "archived" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `assign-${round.id}`}
                    onClick={() =>
                      void run(`assign-${round.id}`, () =>
                        hiddenGardenRpc("admin_assign_hasanat_ikhlas_round", {
                          p_round: round.id,
                        }),
                      )
                    }
                  >
                    <Shuffle className="ml-1 h-4 w-4" />
                    تخصیص
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm("این نوبت بایگانی و از دید کاربران خارج شود؟"))
                      void run(`round-archive-${round.id}`, () =>
                        hiddenGardenRpc("admin_save_hasanat_ikhlas_round", {
                          p_data: { ...round, status: "archived" },
                        }),
                      );
                  }}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AdminIkhlasAudit({ hub }: { hub: HiddenGardenHub }) {
  const gardens = useMemo(
    () => hub.student_gardens.filter((item) => Number(item.stamp_count) > 0),
    [hub.student_gardens],
  );
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Flower2 className="h-5 w-5 text-emerald-600" />
          <h3 className="font-black">ممیزی محرمانه باغ‌ها</h3>
        </div>
        <div className="mt-3 max-h-80 divide-y overflow-auto">
          {gardens.map((item) => (
            <div
              key={item.student_id}
              className="flex justify-between py-2 text-sm"
            >
              <span>{item.student_name}</span>
              <span>
                {fa(item.stamp_count)} مهر •{" "}
                {stageMeta[item.garden_stage].title}
              </span>
            </div>
          ))}
          {!gardens.length && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              هنوز مهر فعالی ثبت نشده است.
            </p>
          )}
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-black">آخرین تغییرهای تأیید</h3>
        <div className="mt-3 max-h-80 divide-y overflow-auto">
          {hub.completion_changes.map((item) => (
            <div key={item.id} className="py-2 text-sm">
              <b>{item.student_name}</b>
              <p className="text-xs text-muted-foreground">
                {item.mission_title} •{" "}
                {item.new_completed ? "انجام شد" : "لغو شد"} •{" "}
                {formatPersianDateTime(item.changed_at)}
              </p>
            </div>
          ))}
          {!hub.completion_changes.length && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              تغییری ثبت نشده است.
            </p>
          )}
        </div>
      </Card>
      <Card className="p-5 xl:col-span-2">
        <h3 className="font-black">تخصیص‌ها و وضعیت محرمانه فردی</h3>
        <div className="mt-3 max-h-96 divide-y overflow-auto">
          {hub.assignments.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <div>
                <b>{item.student_name}</b>
                <p className="text-xs text-muted-foreground">
                  {item.class_name} • {item.mission_title}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  پایان: {formatPersianDateTime(item.ends_at)}
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs">
                {item.mode === "display_only"
                  ? "هیچ وضعیتی ثبت نمی‌شود"
                  : item.is_completed
                    ? "انجام شده"
                    : "انجام نشده"}
              </span>
            </div>
          ))}
          {!hub.assignments.length && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              هنوز تخصیصی ثبت نشده است.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
