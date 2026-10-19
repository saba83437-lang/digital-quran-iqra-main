import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Archive,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PersianDateTimePicker } from "@/features/hasanat/components/persian-date-time-picker";
import {
  kindnessRpc,
  loadKindnessHub,
} from "@/features/hasanat/api/kindness-stage-c";
import { formatPersianDateTime } from "@/features/hasanat/utils/persian-datetime";
import type {
  KindnessHub,
  KindnessRole,
} from "@/features/hasanat/types/kindness-stage-c";

const fa = (value: unknown) =>
  String(value ?? "").replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const message = (error: unknown) =>
  (error as { message?: string })?.message || "عملیات ناموفق بود.";

function useKindness(refreshMs = 0) {
  const [hub, setHub] = useState<KindnessHub | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setHub(await loadKindnessHub());
    } catch (error) {
      toast.error(message(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    if (!refreshMs) return;
    const timer = window.setInterval(() => void load(), refreshMs);
    return () => window.clearInterval(timer);
  }, [load, refreshMs]);
  useEffect(() => {
    const candidates = [hub?.hero?.ends_at, hub?.next_hero_at]
      .filter(Boolean)
      .map((value) => new Date(value as string).getTime());
    if (!candidates.length) return;
    const delay = Math.min(...candidates) - Date.now() + 100;
    if (delay <= 0 || delay > 2_147_000_000) return;
    const timer = window.setTimeout(() => void load(), delay);
    return () => window.clearTimeout(timer);
  }, [hub?.hero?.ends_at, hub?.next_hero_at, load]);
  return { hub, loading, load };
}

export function KindnessAnnouncementBanner() {
  const { hub } = useKindness(30000);
  if (!hub?.hero) return null;
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-emerald-50 p-4 text-center shadow-sm">
        <div className="flex items-center justify-center gap-2 font-black text-emerald-950">
          <Sparkles className="h-5 w-5 text-amber-600" />
          یک قهرمان گمنام در میان ماست
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          نام و دلیل این انتخاب پنهان می‌ماند؛ نیکی برای دیده‌شدن نیست.
        </p>
      </div>
      {hub.my_private_hero && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-950 p-5 text-center text-white shadow-lg">
          <ShieldCheck className="mx-auto mb-2 h-7 w-7" />
          <p className="font-black">این پیام فقط برای توست</p>
          <p className="mt-2 text-sm leading-7 text-emerald-50">
            {hub.my_private_hero.private_message}
          </p>
        </div>
      )}
    </div>
  );
}

export function KindnessPanel({ role }: { role: KindnessRole }) {
  const { hub, loading, load } = useKindness(30000);
  const [busy, setBusy] = useState("");
  async function run<T>(key: string, action: () => Promise<T>) {
    setBusy(key);
    try {
      const value = await action();
      toast.success("با موفقیت ثبت شد.");
      await load();
      return value;
    } catch (error) {
      toast.error(message(error));
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
        اطلاعات زنجیره مهربانی در دسترس نیست.
      </Card>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">زنجیره مهربانی</h2>
          <p className="text-sm text-muted-foreground">
            هر حلقه، نشانی جمعی از یک کار خوب است؛ بدون نام و رتبه.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="ml-1 h-4 w-4" />
          تازه‌سازی
        </Button>
      </div>
      <ChainGrid hub={hub} />
      {role === "admin" && (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <HeroManager hub={hub} busy={busy} run={run} />
            <ChainManager hub={hub} busy={busy} run={run} />
          </div>
          <KindnessAudit hub={hub} run={run} />
        </div>
      )}
    </div>
  );
}

type Runner = <T>(
  key: string,
  action: () => Promise<T>,
) => Promise<T | undefined>;
function ChainGrid({ hub }: { hub: KindnessHub }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {hub.chains.map((chain) => {
        const target =
          chain.target_rings == null ? null : Number(chain.target_rings);
        const progress =
          chain.progress_percent == null
            ? null
            : Number(chain.progress_percent);
        return (
          <Card
            key={`${chain.id}-${chain.class_id ?? "global"}`}
            className="overflow-hidden p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-emerald-600" />
                <h3 className="font-black">{chain.title}</h3>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800">
                {chain.scope_type === "global"
                  ? "کل دارالقرآن"
                  : chain.class_name}
              </span>
            </div>
            <div
              className="my-5 flex min-h-12 flex-wrap justify-center gap-1 text-2xl"
              aria-label={`${fa(chain.ring_count)} حلقه فعال`}
            >
              {Array.from(
                { length: Math.min(Number(chain.ring_count), 24) },
                (_, i) => (
                  <span key={i}>🔗</span>
                ),
              )}
              {Number(chain.ring_count) > 24 && (
                <span className="text-sm font-bold">
                  +{fa(Number(chain.ring_count) - 24)}
                </span>
              )}
              {Number(chain.ring_count) === 0 && (
                <span className="text-sm text-muted-foreground">
                  زنجیره در انتظار نخستین حلقه است.
                </span>
              )}
            </div>
            <div className="flex justify-between text-xs">
              <b>{fa(chain.ring_count)} حلقه فعال</b>
              {target !== null && <span>هدف {fa(target)}</span>}
            </div>
            {progress !== null && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-600"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
            )}
          </Card>
        );
      })}
      {!hub.chains.length && (
        <Card className="p-6 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
          هنوز زنجیره فعالی تنظیم نشده است.
        </Card>
      )}
    </div>
  );
}

function HeroManager({
  hub,
  busy,
  run,
}: {
  hub: KindnessHub;
  busy: string;
  run: Runner;
}) {
  const [student, setStudent] = useState("");
  const [privateMessage, setPrivateMessage] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  useEffect(() => {
    if (!publishAt)
      setPublishAt(new Date(Date.now() + 5 * 60000).toISOString());
    if (!endsAt) setEndsAt(new Date(Date.now() + 7 * 86400000).toISOString());
  }, [publishAt, endsAt]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (new Date(endsAt) <= new Date(publishAt))
      return toast.error("زمان پایان باید بعد از انتشار باشد.");
    const result = await run("hero-create", () =>
      kindnessRpc("admin_save_hasanat_anonymous_hero", {
        p_data: {
          student_id: Number(student),
          private_message: privateMessage,
          publish_at: publishAt,
          ends_at: endsAt,
        },
      }),
    );
    if (result !== undefined) {
      setStudent("");
      setPrivateMessage("");
    }
  }
  return (
    <Card className="p-5">
      <h3 className="font-black">قهرمان گمنام</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        نام و پیام خصوصی فقط در ممیزی مدیر و حساب کودک منتخب دیده می‌شود.
      </p>
      <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
        <select
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={student}
          onChange={(e) => setStudent(e.target.value)}
          required
        >
          <option value="">انتخاب قرآن‌آموز</option>
          {hub.students.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.class_name || "بدون کلاس"}
            </option>
          ))}
        </select>
        <textarea
          className="min-h-24 w-full rounded-lg border p-3 text-sm"
          value={privateMessage}
          onChange={(e) => setPrivateMessage(e.target.value)}
          placeholder="پیام خصوصی و دلیل انتخاب برای کودک"
          required
        />
        <PersianDateTimePicker
          label="زمان دقیق انتشار"
          value={publishAt}
          onChange={setPublishAt}
          required
        />
        <PersianDateTimePicker
          label="زمان دقیق پایان"
          value={endsAt}
          onChange={setEndsAt}
          required
        />
        <Button
          type="submit"
          disabled={
            busy === "hero-create" ||
            !student ||
            !privateMessage ||
            !publishAt ||
            !endsAt
          }
        >
          زمان‌بندی اعلان
        </Button>
      </form>
    </Card>
  );
}

function ChainManager({
  hub,
  busy,
  run,
}: {
  hub: KindnessHub;
  busy: string;
  run: Runner;
}) {
  const [roundId, setRoundId] = useState("");
  const [missionId, setMissionId] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"class" | "global">("class");
  const [target, setTarget] = useState("");
  const round = useMemo(
    () => hub.round_options.find((item) => item.round_id === roundId),
    [hub.round_options, roundId],
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await run("chain-create", () =>
      kindnessRpc("admin_save_hasanat_chain_config", {
        p_data: {
          round_id: roundId,
          mission_id: missionId,
          scope_type: scope,
          public_title: title,
          target_rings: target ? Number(target) : null,
        },
      }),
    );
    if (result !== undefined) {
      setMissionId("");
      setTitle("");
      setTarget("");
    }
  }
  return (
    <Card className="p-5">
      <h3 className="font-black">تنظیم حلقه‌سازی</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        این تنظیم باید پیش از تخصیص نوبت ثبت شود.
      </p>
      <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
        <select
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={roundId}
          onChange={(e) => {
            setRoundId(e.target.value);
            setMissionId("");
          }}
          required
        >
          <option value="">انتخاب نوبت تخصیص‌نیافته</option>
          {hub.round_options.map((item) => (
            <option key={item.round_id} value={item.round_id}>
              {item.round_title} — {item.class_name || "همه کلاس‌ها"}
            </option>
          ))}
        </select>
        <select
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={missionId}
          onChange={(e) => setMissionId(e.target.value)}
          required
        >
          <option value="">انتخاب مأموریت</option>
          {(round?.missions || []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <input
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان عمومی زنجیره"
          required
        />
        <select
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={scope}
          onChange={(e) => setScope(e.target.value as "class" | "global")}
        >
          <option value="class">زنجیره کلاس</option>
          <option value="global">زنجیره کل دارالقرآن</option>
        </select>
        <input
          type="number"
          min="1"
          step="1"
          className="h-10 w-full rounded-lg border px-3 text-sm"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="هدف اختیاری تعداد حلقه"
        />
        <Button
          type="submit"
          disabled={busy === "chain-create" || !roundId || !missionId || !title}
        >
          ثبت زنجیره
        </Button>
      </form>
    </Card>
  );
}

function KindnessAudit({ hub, run }: { hub: KindnessHub; run: Runner }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="p-5">
        <h3 className="font-black">اعلان‌های محرمانه</h3>
        <div className="mt-3 max-h-96 divide-y overflow-auto">
          {hub.announcements.map((item) => (
            <div key={item.id} className="py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <b>{item.student_name}</b>
                  <p className="text-xs text-muted-foreground">
                    {item.class_name} • {item.status}
                  </p>
                </div>
                {item.status !== "archived" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm("اعلان بایگانی شود؟"))
                        void run(`hero-archive-${item.id}`, () =>
                          kindnessRpc("admin_archive_hasanat_anonymous_hero", {
                            p_id: item.id,
                          }),
                        );
                    }}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="mt-2 rounded-lg bg-muted p-2 text-xs">
                {item.private_message}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {formatPersianDateTime(item.publish_at)} تا{" "}
                {formatPersianDateTime(item.ends_at)}
              </p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-black">زنجیره‌های تنظیم‌شده</h3>
        <div className="mt-3 max-h-96 divide-y overflow-auto">
          {hub.configs.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 py-3 text-sm"
            >
              <div>
                <b>{item.public_title}</b>
                <p className="text-xs text-muted-foreground">
                  {item.round_title} • {item.mission_title} •{" "}
                  {item.scope_type === "global" ? "دارالقرآن" : "کلاس"} •{" "}
                  {item.status}
                </p>
              </div>
              {item.status !== "archived" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const canDelete = hub.round_options.some(
                      (round) => round.round_id === item.round_id,
                    );
                    if (
                      !confirm(
                        canDelete
                          ? "تنظیم زنجیره حذف شود؟"
                          : "زنجیره بایگانی شود؟",
                      )
                    )
                      return;
                    void run(`chain-close-${item.id}`, () =>
                      kindnessRpc(
                        canDelete
                          ? "admin_delete_hasanat_chain_config"
                          : "admin_archive_hasanat_chain_config",
                        { p_id: item.id },
                      ),
                    );
                  }}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5 xl:col-span-2">
        <h3 className="font-black">ممیزی محرمانه حلقه‌ها</h3>
        <div className="mt-3 max-h-96 divide-y overflow-auto">
          {hub.ring_events.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap justify-between gap-2 py-3 text-sm"
            >
              <div>
                <b>{item.student_name}</b>
                <p className="text-xs text-muted-foreground">
                  {item.class_name} • {item.mission_title_snapshot}
                </p>
              </div>
              <span
                className={
                  item.action === "add" ? "text-emerald-700" : "text-rose-700"
                }
              >
                {item.action === "add" ? "حلقه افزوده شد" : "حلقه برداشته شد"} •{" "}
                {formatPersianDateTime(item.created_at)}
              </span>
            </div>
          ))}
          {!hub.ring_events.length && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              هنوز رویداد حلقه‌ای ثبت نشده است.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
