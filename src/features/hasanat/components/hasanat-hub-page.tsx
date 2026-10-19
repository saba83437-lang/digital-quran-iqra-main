import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Filter,
  Gift,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GardenGivingPanel } from "@/features/hasanat/components/garden-giving-panel";
import { HiddenGardenPanel } from "@/features/hasanat/components/hidden-garden-panel";
import {
  KindnessAnnouncementBanner,
  KindnessPanel,
} from "@/features/hasanat/components/kindness-panel";
import { formatPersianDate } from "@/features/hasanat/utils/persian-datetime";

type Role = "admin" | "teacher" | "parent" | "student";
type Hub = {
  role: Role;
  period: {
    term: string;
    year_key: string;
    year_display: string;
    is_active: boolean;
  };
  periods: Array<{ term: string; year_key: string; year_display: string }>;
  accounts: any[];
  transactions: any[];
  rewards: any[];
  requests: any[];
  campaigns: any[];
  donations: any[];
  rules: any[];
  cases: any[];
  closures: any[];
};

const MEDIA_CACHE_KEY_PREFIX = "hasanat_media_cache_v1_";
const MEDIA_URL_TTL_MS = 6 * 24 * 60 * 60 * 1000; // 6 days
const memoryMediaCache = new Map<string, { url: string; expiresAt: number }>();

function getCachedMediaUrl(path: string): string | null {
  if (!path) return null;
  const mem = memoryMediaCache.get(path);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.url;
  }
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(MEDIA_CACHE_KEY_PREFIX + path)
        : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.expiresAt > Date.now() && parsed.url) {
        memoryMediaCache.set(path, parsed);
        return parsed.url;
      }
    }
  } catch {}
  return null;
}

function setCachedMediaUrl(path: string, url: string) {
  if (!path || !url) return;
  const item = { url, expiresAt: Date.now() + MEDIA_URL_TTL_MS };
  memoryMediaCache.set(path, item);
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(MEDIA_CACHE_KEY_PREFIX + path, JSON.stringify(item));
    }
  } catch {}
}

function invalidateMediaUrl(path: string) {
  if (!path) return;
  memoryMediaCache.delete(path);
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(MEDIA_CACHE_KEY_PREFIX + path);
    }
  } catch {}
}

const fa = (v: unknown) =>
  String(v ?? "").replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const money = (v: unknown) => fa(Number(v ?? 0).toFixed(2));

async function uploadHasanatImage(file: File, folder: string) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    return {
      path: "",
      error: new Error("تصویر باید PNG، JPG یا WebP و حداکثر ۵ مگابایت باشد"),
    };
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("hasanat-media")
    .upload(path, file, { contentType: file.type });
  if (!error) {
    invalidateMediaUrl(path);
  }
  return { path, error };
}

const statusLabel = (v: string) =>
  (
    ({
      pending: "در انتظار",
      completed: "تکمیل‌شده",
      cancelled: "لغوشده",
      rejected: "ردشده",
      active: "فعال",
      inactive: "غیرفعال",
      archived: "بایگانی",
      open: "باز",
      failed: "ناموفق",
      scheduled: "زمان‌بندی‌شده",
    }) as Record<string, string>
  )[v] ?? v;

const rewardTypeLabel = (v: string) =>
  (
    ({
      physical: "کالایی",
      privilege: "امتیاز ویژه",
      opportunity: "فرصت ویژه",
    }) as Record<string, string>
  )[v] ?? v;

const kindLabel = (v: string) =>
  (
    ({
      earning: "دریافت",
      earning_correction: "اصلاح دریافت",
      reward_reserved: "رزرو جایزه",
      reward_released: "آزادسازی رزرو",
      reward_spent: "دریافت جایزه",
      donation: "انفاق و بخشش",
      manual_adjustment: "اصلاح دستی",
      term_carry_in: "انتقال ورودی",
      term_carry_out: "انتقال خروجی",
      term_expiry: "انقضا",
    }) as Record<string, string>
  )[v] ?? v;

export function HasanatHubPage({ role }: { role: Role }) {
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("wallet");
  const [media, setMedia] = useState<Record<string, string>>({});

  // Wallet filter & sort states
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [accountSearch, setAccountSearch] = useState<string>("");
  const [accountSort, setAccountSort] = useState<
    "name" | "balance_desc" | "balance_asc"
  >("name");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("all");
  const [txKindFilter, setTxKindFilter] = useState<string>("all");
  const [txSearch, setTxSearch] = useState<string>("");

  const load = useCallback(async (term?: string, year?: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_hasanat_hub", {
      p_term: term ?? null,
      p_year: year ?? null,
    });
    if (error) toast.error(error.message);
    else setHub(data as Hub);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Fast image resolution with local persistent cache
  useEffect(() => {
    const paths = [...(hub?.rewards ?? []), ...(hub?.campaigns ?? [])]
      .map((x) => x.image_path)
      .filter(Boolean) as string[];
    if (!paths.length) return;

    const uniquePaths = [...new Set(paths)];
    const immediate: Record<string, string> = {};
    const uncached: string[] = [];

    for (const p of uniquePaths) {
      const cached = getCachedMediaUrl(p);
      if (cached) {
        immediate[p] = cached;
      } else {
        uncached.push(p);
      }
    }

    if (Object.keys(immediate).length > 0) {
      setMedia((prev) => ({ ...prev, ...immediate }));
    }

    if (uncached.length > 0) {
      void Promise.all(
        uncached.map(async (path) => {
          const { data } = await supabase.storage
            .from("hasanat-media")
            .createSignedUrl(path, 7 * 24 * 3600);
          if (data?.signedUrl) {
            setCachedMediaUrl(path, data.signedUrl);
            return [path, data.signedUrl] as const;
          }
          return [path, ""] as const;
        }),
      ).then((rows) => {
        const fresh = Object.fromEntries(rows.filter(([, u]) => Boolean(u)));
        setMedia((prev) => ({ ...prev, ...fresh }));
      });
    }
  }, [hub]);

  const run = async (key: string, fn: () => PromiseLike<{ error: any }>) => {
    setBusy(key);
    const { error } = await fn();
    if (error) toast.error(error.message);
    else {
      toast.success("عملیات با موفقیت انجام شد");
      await load(hub?.period.term, hub?.period.year_key);
    }
    setBusy("");
  };

  const account = hub?.accounts[0];

  const totalBalance = useMemo(
    () =>
      (hub?.accounts ?? []).reduce((acc, a) => acc + Number(a.balance ?? 0), 0),
    [hub?.accounts],
  );
  const totalReserved = useMemo(
    () =>
      (hub?.accounts ?? []).reduce(
        (acc, a) => acc + Number(a.reserved ?? 0),
        0,
      ),
    [hub?.accounts],
  );
  const totalAvailable = useMemo(
    () =>
      (hub?.accounts ?? []).reduce(
        (acc, a) => acc + Number(a.available ?? 0),
        0,
      ),
    [hub?.accounts],
  );

  const studentMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of hub?.accounts ?? []) {
      map.set(String(a.student_id), a);
    }
    return map;
  }, [hub?.accounts]);

  const classList = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; count: number; totalAvailable: number }
    >();
    for (const a of hub?.accounts ?? []) {
      const cid = a.class_id ? String(a.class_id) : "__none__";
      const cname = a.class_name ?? "بدون کلاس";
      const existing = map.get(cid) ?? {
        id: cid,
        name: cname,
        count: 0,
        totalAvailable: 0,
      };
      existing.count += 1;
      existing.totalAvailable += Number(a.available ?? 0);
      map.set(cid, existing);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "fa"),
    );
  }, [hub?.accounts]);

  const filteredAccounts = useMemo(() => {
    let list = hub?.accounts ?? [];
    if (selectedClassId !== "all") {
      if (selectedClassId === "__none__") {
        list = list.filter((a) => !a.class_id);
      } else {
        list = list.filter((a) => String(a.class_id) === selectedClassId);
      }
    }
    if (accountSearch.trim()) {
      const q = accountSearch.trim().toLowerCase();
      list = list.filter((a) =>
        (a.student_name ?? "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (accountSort === "balance_desc") {
        return Number(b.available ?? 0) - Number(a.available ?? 0);
      }
      if (accountSort === "balance_asc") {
        return Number(a.available ?? 0) - Number(b.available ?? 0);
      }
      return (a.student_name ?? "").localeCompare(b.student_name ?? "", "fa");
    });
  }, [hub?.accounts, selectedClassId, accountSearch, accountSort]);

  const filteredTransactions = useMemo(() => {
    let list = hub?.transactions ?? [];
    if (selectedClassId !== "all") {
      list = list.filter((t) => {
        const st = studentMap.get(String(t.student_id));
        if (selectedClassId === "__none__") return !st?.class_id;
        return String(st?.class_id) === selectedClassId;
      });
    }
    if (selectedStudentId !== "all") {
      list = list.filter((t) => String(t.student_id) === selectedStudentId);
    }
    if (txKindFilter !== "all") {
      if (txKindFilter === "earning") {
        list = list.filter((t) =>
          ["earning", "earning_correction"].includes(t.kind),
        );
      } else if (txKindFilter === "rewards") {
        list = list.filter((t) =>
          ["reward_reserved", "reward_released", "reward_spent"].includes(
            t.kind,
          ),
        );
      } else if (txKindFilter === "donation") {
        list = list.filter((t) => t.kind === "donation");
      } else if (txKindFilter === "admin") {
        list = list.filter((t) =>
          [
            "manual_adjustment",
            "term_carry_in",
            "term_carry_out",
            "term_expiry",
          ].includes(t.kind),
        );
      }
    }
    if (txSearch.trim()) {
      const q = txSearch.trim().toLowerCase();
      list = list.filter((t) => {
        const st = studentMap.get(String(t.student_id));
        const sName = (st?.student_name ?? "").toLowerCase();
        const title = (t.title ?? "").toLowerCase();
        const desc = (t.description ?? "").toLowerCase();
        return title.includes(q) || desc.includes(q) || sName.includes(q);
      });
    }
    return list;
  }, [
    hub?.transactions,
    selectedClassId,
    selectedStudentId,
    txKindFilter,
    txSearch,
    studentMap,
  ]);

  const selectableStudents = useMemo(() => {
    let list = hub?.accounts ?? [];
    if (selectedClassId !== "all") {
      if (selectedClassId === "__none__") {
        list = list.filter((a) => !a.class_id);
      } else {
        list = list.filter((a) => String(a.class_id) === selectedClassId);
      }
    }
    return list;
  }, [hub?.accounts, selectedClassId]);

  const tabs = useMemo(
    () => [
      { id: "wallet", title: "صندوق حسنات" },
      { id: "rewards", title: "🎁 برای خودم" },
      { id: "donations", title: "🤲 برای دیگران" },
      { id: "requests", title: "درخواست‌ها" },
      ...(role !== "parent"
        ? [{ id: "hidden", title: "🌱 کارهای پنهان" }]
        : []),
      { id: "kindness", title: "🔗 زنجیره مهربانی" },
      ...(role === "admin" ? [{ id: "manage", title: "مدیریت" }] : []),
    ],
    [role],
  );

  if (loading && !hub)
    return (
      <div className="flex h-72 items-center justify-center gap-2" dir="rtl">
        <Loader2 className="animate-spin" />
        در حال دریافت حسنات...
      </div>
    );

  return (
    <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-l from-emerald-950 via-emerald-800 to-amber-600 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles />
              <h1 className="text-2xl font-black">باغ حسنات</h1>
            </div>
            <p className="mt-2 text-sm text-white/75">
              انتخاب برای خودم، بخشش برای دیگران و نگهداری حسنات
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="انتخاب دوره حسنات"
              className="h-10 rounded-lg bg-white px-3 text-sm text-emerald-950"
              value={`${hub?.period.term ?? ""}|${hub?.period.year_key ?? ""}`}
              onChange={(event) => {
                const [term, year] = event.target.value.split("|");
                void load(term, year);
              }}
            >
              {hub?.periods.map((period) => (
                <option
                  key={`${period.term}|${period.year_key}`}
                  value={`${period.term}|${period.year_key}`}
                >
                  {period.term === "term1"
                    ? "ترم اول"
                    : period.term === "term2"
                      ? "ترم دوم"
                      : "تابستان"}{" "}
                  — {fa(period.year_display)}
                </option>
              ))}
              {hub &&
                !hub.periods.some(
                  (period) =>
                    period.term === hub.period.term &&
                    period.year_key === hub.period.year_key,
                ) && (
                  <option value={`${hub.period.term}|${hub.period.year_key}`}>
                    {fa(hub.period.year_display)}
                  </option>
                )}
            </select>
            <Button
              variant="secondary"
              onClick={() => void load(hub?.period.term, hub?.period.year_key)}
              disabled={loading}
            >
              <RefreshCw
                className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              به‌روزرسانی
            </Button>
          </div>
        </div>
        {role === "student" && account && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat label="موجودی کل" value={money(account.balance)} />
            <Stat label="رزروشده" value={money(account.reserved)} />
            <Stat label="قابل استفاده" value={money(account.available)} />
          </div>
        )}
        {role !== "student" && hub?.accounts && hub.accounts.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat label="مجموع موجودی" value={money(totalBalance)} />
            <Stat label="مجموع رزروشده" value={money(totalReserved)} />
            <Stat label="مجموع قابل استفاده" value={money(totalAvailable)} />
          </div>
        )}
      </section>

      <KindnessAnnouncementBanner />

      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((x) => (
          <Button
            key={x.id}
            variant={tab === x.id ? "default" : "outline"}
            onClick={() => setTab(x.id)}
          >
            {x.title}
          </Button>
        ))}
      </div>

      {hub && !hub.period.is_active && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          این دوره بسته یا غیرفعال است و فقط به‌صورت خواندنی نمایش داده می‌شود.
        </div>
      )}

      {tab === "wallet" && (
        <div className="space-y-4">
          {/* Class Filter Bar */}
          {classList.length > 0 &&
            (role === "admin" ||
              role === "teacher" ||
              (hub?.accounts?.length ?? 0) > 1) && (
              <div className="rounded-2xl border bg-card p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ml-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <Filter className="h-3.5 w-3.5" />
                    فیلتر کلاس:
                  </span>
                  <Button
                    size="sm"
                    variant={selectedClassId === "all" ? "default" : "outline"}
                    className="h-8 rounded-xl text-xs"
                    onClick={() => {
                      setSelectedClassId("all");
                      setSelectedStudentId("all");
                    }}
                  >
                    همه کلاس‌ها
                    <span className="mr-1.5 rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[10px]">
                      {fa(hub?.accounts?.length ?? 0)}
                    </span>
                  </Button>
                  {classList.map((c) => (
                    <Button
                      key={c.id}
                      size="sm"
                      variant={selectedClassId === c.id ? "default" : "outline"}
                      className="h-8 rounded-xl text-xs"
                      onClick={() => {
                        setSelectedClassId(c.id);
                        setSelectedStudentId("all");
                      }}
                    >
                      {c.name}
                      <span className="mr-1.5 rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[10px]">
                        {fa(c.count)}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

          <section className="grid gap-4 lg:grid-cols-12">
            {/* Accounts Column (Right in RTL) */}
            <Card className="flex flex-col p-5 lg:col-span-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <h2 className="flex items-center gap-2 text-base font-black">
                  <WalletCards className="h-5 w-5 text-emerald-600" />
                  حساب‌ها
                  <span className="text-xs font-normal text-muted-foreground">
                    ({fa(filteredAccounts.length)} نفر)
                  </span>
                </h2>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="مرتب‌سازی حساب‌ها"
                    className="h-8 rounded-lg border bg-background px-2 text-xs"
                    value={accountSort}
                    onChange={(e) => setAccountSort(e.target.value as any)}
                  >
                    <option value="name">مرتب‌سازی: الفبا</option>
                    <option value="balance_desc">بیشترین موجودی</option>
                    <option value="balance_asc">کمترین موجودی</option>
                  </select>
                </div>
              </div>

              {/* Account search box */}
              {((hub?.accounts?.length ?? 0) > 4 || accountSearch) && (
                <div className="relative mt-3">
                  <Search className="absolute right-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="جستجوی نام قرآن‌آموز..."
                    className="h-8 w-full rounded-xl border bg-muted/40 pr-8 pl-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                  />
                  {accountSearch && (
                    <button
                      type="button"
                      onClick={() => setAccountSearch("")}
                      className="absolute left-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              <div className="mt-3 max-h-[620px] flex-1 space-y-2.5 overflow-y-auto pr-0.5">
                {filteredAccounts.map((a) => {
                  const isSelected = selectedStudentId === String(a.student_id);
                  return (
                    <div
                      key={a.id}
                      className={`rounded-2xl border p-3.5 transition-all ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-50/70 shadow-sm"
                          : "border-border/70 bg-card hover:border-emerald-300 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <b className="text-sm font-bold">{a.student_name}</b>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <GraduationCap className="h-3.5 w-3.5" />
                            <span>{a.class_name ?? "بدون کلاس"}</span>
                            <span>•</span>
                            <span>{fa(a.academic_year_display)}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={isSelected ? "default" : "ghost"}
                          className="h-7 rounded-lg px-2.5 text-xs"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedStudentId("all");
                            } else {
                              setSelectedStudentId(String(a.student_id));
                            }
                          }}
                        >
                          {isSelected ? "نمایش همه" : "گردش حساب"}
                        </Button>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-2 text-center text-xs">
                        <div>
                          <p className="text-[10px] text-muted-foreground">
                            موجودی کل
                          </p>
                          <b className="text-xs">{money(a.balance)}</b>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">
                            رزروشده
                          </p>
                          <b
                            className={`text-xs ${
                              Number(a.reserved) > 0 ? "text-amber-600" : ""
                            }`}
                          >
                            {money(a.reserved)}
                          </b>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">
                            قابل استفاده
                          </p>
                          <b className="text-xs font-black text-emerald-700">
                            {money(a.available)}
                          </b>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!filteredAccounts.length && <Empty />}
              </div>
            </Card>

            {/* Transactions Column (Left in RTL) */}
            <Card className="flex flex-col p-5 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black">گردش حساب</h2>
                  <span className="text-xs font-normal text-muted-foreground">
                    ({fa(filteredTransactions.length)} تراکنش)
                  </span>
                </div>
                {selectedStudentId !== "all" && (
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-900">
                    <span>
                      قرآن‌آموز:{" "}
                      {studentMap.get(selectedStudentId)?.student_name ??
                        fa(selectedStudentId)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedStudentId("all")}
                      className="rounded-full p-0.5 hover:bg-emerald-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Transaction Filters Bar */}
              <div className="mt-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {/* Select Student Dropdown */}
                  {selectableStudents.length > 1 && (
                    <select
                      aria-label="انتخاب قرآن‌آموز برای فیلتر گردش حساب"
                      className="h-8 rounded-xl border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                    >
                      <option value="all">
                        همه قرآن‌آموزان ({fa(selectableStudents.length)})
                      </option>
                      {selectableStudents.map((s) => (
                        <option key={s.student_id} value={String(s.student_id)}>
                          {s.student_name} ({s.class_name ?? "بدون کلاس"})
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Transaction Category Dropdown */}
                  <select
                    aria-label="انتخاب نوع تراکنش"
                    className="h-8 rounded-xl border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    value={txKindFilter}
                    onChange={(e) => setTxKindFilter(e.target.value)}
                  >
                    <option value="all">همه انواع تراکنش‌ها</option>
                    <option value="earning">
                      ➕ کسب حسنات (حضور، انضباط، پیشرفت...)
                    </option>
                    <option value="rewards">
                      🎁 جوایز (رزرو، دریافت، آزادسازی)
                    </option>
                    <option value="donation">🤲 انفاق، وقف و بخشش</option>
                    <option value="admin">⚙️ مدیریت و انتقال دوره</option>
                  </select>
                </div>

                {/* Search in Transactions */}
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="جستجو در عنوان، شرح یا نام قرآن‌آموز..."
                    className="h-8 w-full rounded-xl border bg-muted/40 pr-8 pl-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                  />
                  {txSearch && (
                    <button
                      type="button"
                      onClick={() => setTxSearch("")}
                      className="absolute left-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Transactions List */}
              <div className="mt-3 max-h-[600px] flex-1 divide-y overflow-y-auto pr-0.5">
                {filteredTransactions.map((t) => {
                  const student = studentMap.get(String(t.student_id));
                  const delta = Number(t.balance_delta ?? 0);
                  return (
                    <div
                      key={t.id}
                      className="flex items-start justify-between gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <b className="text-sm">{t.title}</b>
                          {student &&
                            (role === "admin" ||
                              role === "teacher" ||
                              (hub?.accounts?.length ?? 0) > 1) && (
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {student.student_name}{" "}
                                {student.class_name
                                  ? `(${student.class_name})`
                                  : ""}
                              </span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {kindLabel(t.kind)} •{" "}
                          {formatPersianDate(t.created_at)}
                        </p>
                        {t.description && (
                          <p className="text-[11px] text-muted-foreground/80 italic">
                            {t.description}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-left">
                        <b
                          className={`block text-sm ${
                            delta >= 0
                              ? "font-black text-emerald-700"
                              : "font-black text-rose-700"
                          }`}
                        >
                          {delta > 0 ? "+" : ""}
                          {money(delta)}
                        </b>
                        {t.balance_after != null && (
                          <span className="block text-[10px] text-muted-foreground">
                            مانده: {money(t.balance_after)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!filteredTransactions.length && <Empty />}
              </div>
            </Card>
          </section>
        </div>
      )}

      {tab === "rewards" && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hub?.rewards.map((r) => {
            const cost = Number(r.cost);
            const studentAvailable = Number(account?.available ?? 0);
            const remaining = Math.max(0, cost - studentAvailable);
            const progressPercent = Math.min(
              100,
              Math.max(0, (studentAvailable / cost) * 100),
            );
            const isEligible = studentAvailable >= cost;
            const stockLeft =
              r.stock_quantity == null
                ? null
                : Number(r.stock_quantity) - Number(r.stock_reserved);
            const isOutOfStock = stockLeft !== null && stockLeft <= 0;
            const canRequest =
              isEligible &&
              !isOutOfStock &&
              r.status === "active" &&
              Boolean(hub?.period.is_active);

            return (
              <Card
                key={r.id}
                className="flex flex-col justify-between overflow-hidden p-5"
              >
                <div>
                  <div className="relative mb-4 flex h-44 w-full items-center justify-center overflow-hidden rounded-2xl bg-muted/60">
                    {r.image_path && media[r.image_path] ? (
                      <img
                        src={media[r.image_path]}
                        alt={r.title}
                        loading="eager"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Gift className="h-12 w-12 text-amber-600/80" />
                    )}
                    <span className="absolute right-2.5 top-2.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white shadow backdrop-blur-md">
                      {rewardTypeLabel(r.reward_type)}
                    </span>
                    {isOutOfStock && (
                      <span className="absolute left-2.5 top-2.5 rounded-lg bg-rose-600/90 px-2.5 py-1 text-[11px] font-bold text-white shadow backdrop-blur-md">
                        اتمام موجودی
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-black">{r.title}</h3>
                  </div>

                  <p className="mt-1 min-h-10 text-sm text-muted-foreground">
                    {r.description || "بدون توضیح"}
                  </p>

                  {/* Progress bar towards this reward for student and parent */}
                  {(role === "student" || role === "parent") && account && (
                    <div className="mt-4 space-y-1.5 rounded-2xl border bg-muted/40 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          فاصله تا دریافت:
                        </span>
                        <span className="font-bold">
                          {money(studentAvailable)} / {money(cost)} حسنه
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isEligible ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        {isEligible ? (
                          <span className="font-bold text-emerald-700">
                            ✓ آماده درخواست جایزه
                          </span>
                        ) : (
                          <span className="font-medium text-amber-700">
                            {money(remaining)} حسنه مانده تا فعال‌سازی
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {fa(Math.round(progressPercent))}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-end justify-between border-t pt-4">
                  <div>
                    <b className="text-xl text-emerald-700">{money(r.cost)}</b>{" "}
                    حسنه
                    <p className="text-xs text-muted-foreground">
                      {stockLeft == null
                        ? "موجودی نامحدود"
                        : `${fa(stockLeft)} عدد موجود`}
                    </p>
                  </div>
                  {role === "student" && hub?.period.is_active && (
                    <Button
                      disabled={busy === r.id || !canRequest}
                      variant={
                        isEligible && !isOutOfStock ? "default" : "outline"
                      }
                      className={
                        isEligible && !isOutOfStock
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : ""
                      }
                      onClick={() =>
                        void run(r.id, () =>
                          supabase.rpc("request_hasanat_reward", {
                            p_reward: r.id,
                          }),
                        )
                      }
                    >
                      {isOutOfStock
                        ? "اتمام موجودی"
                        : isEligible
                          ? "درخواست جایزه"
                          : `کسری ${money(remaining)}`}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
          {!hub?.rewards.length && <Empty />}
        </section>
      )}

      {tab === "donations" && (
        <GardenGivingPanel
          role={role}
          term={hub?.period.term}
          year={hub?.period.year_key}
          activePeriod={Boolean(hub?.period.is_active)}
          onWalletChanged={() =>
            void load(hub?.period.term, hub?.period.year_key)
          }
        />
      )}

      {tab === "requests" && (
        <Card className="p-5">
          <h2 className="font-black">درخواست‌های جایزه</h2>
          <div className="mt-4 divide-y">
            {hub?.requests.map((q) => (
              <div
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <b className="text-sm">
                    {q.reward_title_snapshot || "جایزه"}
                  </b>
                  <p className="text-xs text-muted-foreground">
                    قرآن‌آموز {q.student_name || fa(q.student_id)} •{" "}
                    {formatPersianDate(q.requested_at)} • {money(q.cost)} حسنه •{" "}
                    {statusLabel(q.status)}
                  </p>
                </div>
                {role === "admin" && q.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        void run(q.id + "c", () =>
                          supabase.rpc("admin_fulfill_hasanat_reward", {
                            p_request: q.id,
                          }),
                        )
                      }
                    >
                      تحویل داده شد
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reason = prompt("دلیل رد درخواست:");
                        if (reason)
                          void run(q.id + "r", () =>
                            supabase.rpc("admin_reject_hasanat_reward", {
                              p_request: q.id,
                              p_reason: reason,
                            }),
                          );
                      }}
                    >
                      رد
                    </Button>
                  </div>
                )}
                {role === "student" && q.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(q.id + "x", () =>
                        supabase.rpc("cancel_hasanat_reward_request", {
                          p_request: q.id,
                        }),
                      )
                    }
                  >
                    انصراف
                  </Button>
                )}
              </div>
            ))}
            {!hub?.requests.length && <Empty />}
          </div>
        </Card>
      )}

      {tab === "hidden" && role !== "parent" && (
        <HiddenGardenPanel role={role as "admin" | "teacher" | "student"} />
      )}

      {tab === "kindness" && <KindnessPanel role={role} />}

      {tab === "manage" && role === "admin" && hub && (
        <AdminPanel
          hub={hub}
          busy={busy}
          run={run}
          onSaved={() => void load(hub.period.term, hub.period.year_key)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
      <p className="text-xs text-white/70">{label}</p>
      <b className="text-2xl">{value}</b>
      <span className="mr-1 text-xs">حسنه</span>
    </div>
  );
}
function Empty() {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      موردی برای نمایش وجود ندارد.
    </div>
  );
}

function AdminPanel({
  hub,
  busy,
  run,
  onSaved,
}: {
  hub: Hub;
  busy: string;
  run: (key: string, fn: () => PromiseLike<{ error: any }>) => Promise<void>;
  onSaved: () => void;
}) {
  const [rewardForm, setRewardForm] = useState<any>({
    title: "",
    description: "",
    cost: 10,
    reward_type: "physical",
    stock_quantity: "",
    per_student_limit: "",
    sort_order: 0,
    status: "active",
  });
  const [rewardFile, setRewardFile] = useState<File | null>(null);
  const [editRewardId, setEditRewardId] = useState<string | null>(null);

  const resetRewardForm = () => {
    setRewardForm({
      title: "",
      description: "",
      cost: 10,
      reward_type: "physical",
      stock_quantity: "",
      per_student_limit: "",
      sort_order: 0,
      status: "active",
    });
    setRewardFile(null);
    setEditRewardId(null);
  };

  const editReward = (r: any) => {
    setEditRewardId(r.id);
    setRewardForm({
      id: r.id,
      title: r.title,
      description: r.description || "",
      cost: Number(r.cost),
      reward_type: r.reward_type || "physical",
      stock_quantity: r.stock_quantity ?? "",
      per_student_limit: r.per_student_limit ?? "",
      sort_order: r.sort_order ?? 0,
      status: r.status,
      image_path: r.image_path || null,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-black">قواعد کسب حسنات</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {hub.rules.map((rule) => (
            <div
              key={rule.item_key}
              className="flex items-center justify-between rounded-xl border p-3"
            >
              <div>
                <b>{rule.title}</b>
                <p className="text-xs text-muted-foreground">
                  کلید: {rule.item_key}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  aria-label={`ضریب ${rule.title}`}
                  className="w-20 rounded-lg border p-1 text-center text-sm"
                  defaultValue={rule.multiplier}
                  onBlur={(e) =>
                    void run(rule.item_key, () =>
                      supabase.rpc("admin_save_hasanat_rule", {
                        p_item_key: rule.item_key,
                        p_enabled: rule.enabled,
                        p_multiplier: Number(e.target.value),
                      }),
                    )
                  }
                />
                <Button
                  size="sm"
                  variant={rule.enabled ? "default" : "outline"}
                  onClick={() =>
                    void run(rule.item_key, () =>
                      supabase.rpc("admin_save_hasanat_rule", {
                        p_item_key: rule.item_key,
                        p_enabled: !rule.enabled,
                        p_multiplier: rule.multiplier,
                      }),
                    )
                  }
                >
                  {rule.enabled ? "فعال" : "غیرفعال"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-black">
            {editRewardId ? "ویرایش جایزه" : "تعریف جایزه جدید"}
          </h2>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run("reward-save", async () => {
                let image_path = rewardForm.image_path || null;
                if (rewardFile) {
                  const uploaded = await uploadHasanatImage(
                    rewardFile,
                    "rewards",
                  );
                  if (uploaded.error) return { error: uploaded.error };
                  image_path = uploaded.path;
                }
                const payload = {
                  ...rewardForm,
                  image_path,
                  cost: Number(rewardForm.cost),
                  reward_type: rewardForm.reward_type || "physical",
                  stock_quantity:
                    rewardForm.stock_quantity === ""
                      ? null
                      : Number(rewardForm.stock_quantity),
                  per_student_limit:
                    rewardForm.per_student_limit === ""
                      ? null
                      : Number(rewardForm.per_student_limit),
                  sort_order: Number(rewardForm.sort_order || 0),
                };
                if (editRewardId) payload.id = editRewardId;
                const res = await supabase.rpc("admin_save_hasanat_reward", {
                  p_data: payload,
                });
                if (!res.error) resetRewardForm();
                return res;
              });
            }}
          >
            <div>
              <label className="text-xs font-bold">عنوان جایزه</label>
              <input
                type="text"
                required
                className="mt-1 w-full rounded-xl border bg-background p-2 text-sm"
                value={rewardForm.title}
                onChange={(e) =>
                  setRewardForm({ ...rewardForm, title: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold">توضیحات</label>
              <textarea
                className="mt-1 w-full rounded-xl border bg-background p-2 text-sm"
                rows={2}
                value={rewardForm.description}
                onChange={(e) =>
                  setRewardForm({ ...rewardForm, description: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold">نوع جایزه</label>
                <select
                  aria-label="نوع جایزه"
                  className="mt-1 w-full rounded-xl border bg-background p-2 text-sm"
                  value={rewardForm.reward_type}
                  onChange={(e) =>
                    setRewardForm({
                      ...rewardForm,
                      reward_type: e.target.value,
                    })
                  }
                >
                  <option value="physical">فیزیکی (کالا)</option>
                  <option value="privilege">امتیاز ویژه (معافیت/اختیار)</option>
                  <option value="opportunity">فرصت ویژه (اردو/مسئولیت)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold">هزینه (حسنه)</label>
                <input
                  type="number"
                  min="1"
                  required
                  aria-label="هزینه جایزه"
                  className="mt-1 w-full rounded-xl border bg-background p-2 text-sm"
                  value={rewardForm.cost}
                  onChange={(e) =>
                    setRewardForm({ ...rewardForm, cost: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold">
                  موجودی (خالی = نامحدود)
                </label>
                <input
                  type="number"
                  min="0"
                  aria-label="موجودی جایزه"
                  className="mt-1 w-full rounded-xl border bg-background p-2 text-sm"
                  value={rewardForm.stock_quantity}
                  onChange={(e) =>
                    setRewardForm({
                      ...rewardForm,
                      stock_quantity: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold">
                  سقف هر قرآن‌آموز (خالی = بی‌نهایت)
                </label>
                <input
                  type="number"
                  min="1"
                  aria-label="سقف هر قرآن‌آموز"
                  className="mt-1 w-full rounded-xl border bg-background p-2 text-sm"
                  value={rewardForm.per_student_limit}
                  onChange={(e) =>
                    setRewardForm({
                      ...rewardForm,
                      per_student_limit: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold">ترتیب نمایش</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-background p-2 text-sm"
                  value={rewardForm.sort_order}
                  onChange={(e) =>
                    setRewardForm({
                      ...rewardForm,
                      sort_order: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold">وضعیت</label>
                <select
                  className="mt-1 w-full rounded-xl border bg-background p-2 text-sm"
                  value={rewardForm.status}
                  onChange={(e) =>
                    setRewardForm({ ...rewardForm, status: e.target.value })
                  }
                >
                  <option value="active">فعال</option>
                  <option value="inactive">غیرفعال</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold">تصویر جایزه</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="mt-1 w-full text-xs"
                onChange={(e) => setRewardFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy === "reward-save"}>
                {editRewardId ? "ذخیره تغییرات" : "افزودن جایزه"}
              </Button>
              {editRewardId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetRewardForm}
                >
                  انصراف
                </Button>
              )}
            </div>
          </form>
        </Card>
        <Card className="p-5">
          <h2 className="font-black">فهرست جوایز مدیریتی</h2>
          <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-1">
            {hub.rewards.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <b>{r.title}</b>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {rewardTypeLabel(r.reward_type)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    هزینه: {money(r.cost)} • موجودی:{" "}
                    {r.stock_quantity == null
                      ? "نامحدود"
                      : `${fa(Number(r.stock_quantity) - Number(r.stock_reserved))}/${fa(r.stock_quantity)}`}{" "}
                    • وضعیت: {statusLabel(r.status)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="cursor-pointer">
                    <span className="inline-flex h-8 items-center rounded-lg border px-2.5 text-xs hover:bg-muted">
                      عکس
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void run(`${r.id}-img`, async () => {
                          const uploaded = await uploadHasanatImage(
                            file,
                            "rewards",
                          );
                          if (uploaded.error) return { error: uploaded.error };
                          return supabase.rpc("admin_save_hasanat_reward", {
                            p_data: { ...r, image_path: uploaded.path },
                          });
                        });
                      }}
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => editReward(r)}
                  >
                    ویرایش
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(r.id, () =>
                        supabase.rpc("admin_save_hasanat_reward", {
                          p_data: {
                            ...r,
                            status:
                              r.status === "active" ? "inactive" : "active",
                          },
                        }),
                      )
                    }
                  >
                    {statusLabel(r.status)}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (
                        confirm("جایزه حذف یا در صورت داشتن سابقه بایگانی شود؟")
                      )
                        void run(`${r.id}-delete`, () =>
                          supabase.rpc("admin_delete_hasanat_reward", {
                            p_id: r.id,
                          }),
                        );
                    }}
                  >
                    حذف
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <h2 className="font-black">پرونده‌های اصلاح باز</h2>
        <div className="mt-3 space-y-2">
          {hub.cases.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap justify-between gap-2 rounded-xl border p-3"
            >
              <span>
                قرآن‌آموز {fa(c.student_id)} — کسری {money(c.outstanding)}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const note = prompt("یادداشت رسیدگی:");
                    if (note)
                      void run(c.id, () =>
                        supabase.rpc("admin_resolve_hasanat_case", {
                          p_case: c.id,
                          p_action: "apply",
                          p_note: note,
                        }),
                      );
                  }}
                >
                  اعمال
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const note = prompt("دلیل صرف‌نظر:");
                    if (note)
                      void run(c.id + "w", () =>
                        supabase.rpc("admin_resolve_hasanat_case", {
                          p_case: c.id,
                          p_action: "waive",
                          p_note: note,
                        }),
                      );
                  }}
                >
                  صرف‌نظر
                </Button>
              </div>
            </div>
          ))}
          {!hub.cases.length && <Empty />}
        </div>
      </Card>
    </div>
  );
}
