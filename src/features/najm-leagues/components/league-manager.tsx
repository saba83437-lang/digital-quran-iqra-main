import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import {
  archiveNajmLeague,
  getNajmLeagueWorkspace,
  saveNajmLeague,
} from "../api";
import type { NajmLeague, NajmLeagueWorkspaceData } from "../types";
import { jalaliMonthTitle, nextJalaliMonthKey, toFa } from "../utils";
import {
  createCustomLeagueSymbolKey,
  createImageLeagueSymbolKey,
  LEAGUE_SYMBOL_PRESETS,
  LeagueSymbol,
  leagueSymbolImagePath,
  parseCustomLeagueSymbol,
  sanitizeLeagueSymbolText,
  type LeagueSymbolShape,
} from "./league-symbol";

const COLORS = [
  "#047857",
  "#0F766E",
  "#1D4ED8",
  "#7C3AED",
  "#BE123C",
  "#B45309",
];
const MAX_SYMBOL_FILE_SIZE = 2 * 1024 * 1024;
const SYMBOL_FILE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const SHAPES: Array<{ key: LeagueSymbolShape; title: string }> = [
  { key: "circle", title: "دایره" },
  { key: "rounded", title: "مربع گرد" },
  { key: "shield", title: "سپر" },
  { key: "hexagon", title: "شش‌ضلعی" },
];

export function LeagueManager({
  data,
  onChanged,
}: {
  data: NajmLeagueWorkspaceData;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<NajmLeague | "new" | null>(null);
  return (
    <section className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-black text-emerald-950">
            مدیریت رده‌های کلاس
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            استاد رده را یک‌بار ایجاد می‌کند؛ ویرایش پس از انتشار فقط در اختیار
            مدیر است.
          </p>
        </div>
        {data.can_create && (
          <Button className="gap-2" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            ساخت رده
          </Button>
        )}
      </div>
      {data.can_manage && data.leagues.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {data.leagues
            .filter((league) => !league.archived_at)
            .map((league) => (
              <div
                key={league.id}
                className="flex items-center gap-2 rounded-2xl border p-3"
              >
                <span
                  className="h-9 w-2 rounded-full"
                  style={{ background: league.color }}
                />
                <LeagueSymbol iconKey={league.icon_key} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{league.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {toFa(league.members.length)} عضو در ماه انتخابی
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditing(league)}
                  aria-label="ویرایش رده"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-rose-600"
                  onClick={async () => {
                    if (
                      !confirm(
                        `رده «${league.title}» از ماه ${data.month_key} آرشیو شود؟`,
                      )
                    )
                      return;
                    const result = await archiveNajmLeague(
                      league.id,
                      data.month_key,
                    );
                    if (result.error) toast.error(result.error);
                    else {
                      toast.success("رده آرشیو شد");
                      onChanged();
                    }
                  }}
                  aria-label="آرشیو رده"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
        </div>
      )}
      <LeagueEditor
        open={editing !== null}
        league={editing === "new" ? null : editing}
        data={data}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </section>
  );
}

type SymbolMode = "preset" | "custom" | "upload";

function LeagueEditor({
  open,
  league,
  data,
  onClose,
  onSaved,
}: {
  open: boolean;
  league: NajmLeague | null;
  data: NajmLeagueWorkspaceData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(LEAGUE_SYMBOL_PRESETS[0].key);
  const [symbolMode, setSymbolMode] = useState<SymbolMode>("preset");
  const [customText, setCustomText] = useState("⭐");
  const [customShape, setCustomShape] = useState<LeagueSymbolShape>("circle");
  const [customBackground, setCustomBackground] = useState("#047857");
  const [customForeground, setCustomForeground] = useState("#FFFFFF");
  const [symbolFile, setSymbolFile] = useState<File | null>(null);
  const [symbolPreview, setSymbolPreview] = useState("");
  const [month, setMonth] = useState(data.month_key);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] =
    useState<NajmLeagueWorkspaceData | null>(data);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  useEffect(() => {
    if (!open) return;
    const initialIcon = league?.icon_key ?? LEAGUE_SYMBOL_PRESETS[0].key;
    const custom = parseCustomLeagueSymbol(initialIcon);
    setTitle(league?.title ?? "");
    setColor(league?.color ?? COLORS[0]);
    setIcon(initialIcon);
    setSymbolMode(
      leagueSymbolImagePath(initialIcon)
        ? "upload"
        : custom
          ? "custom"
          : "preset",
    );
    setCustomText(custom?.text ?? "⭐");
    setCustomShape(custom?.shape ?? "circle");
    setCustomBackground(custom?.background ?? "#047857");
    setCustomForeground(custom?.foreground ?? "#FFFFFF");
    setSymbolFile(null);
    setMonth(data.month_key);
    setSelected(league?.members.map((item) => item.student_id) ?? []);
    setSearch("");
    setAvailability(data);
    setAvailabilityError("");
  }, [open, league, data]);

  useEffect(() => {
    if (!symbolFile) {
      setSymbolPreview("");
      return;
    }
    const preview = URL.createObjectURL(symbolFile);
    setSymbolPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [symbolFile]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    if (month === data.month_key) {
      setAvailability(data);
      if (league) {
        const sameLeague = data.leagues.find((item) => item.id === league.id);
        setSelected(
          sameLeague?.members.map((member) => member.student_id) ?? [],
        );
      }
      setAvailabilityLoading(false);
      setAvailabilityError("");
      return () => {
        active = false;
      };
    }
    setAvailability(null);
    setAvailabilityLoading(true);
    setAvailabilityError("");
    void getNajmLeagueWorkspace(data.class_id, month, {
      term: data.term,
      academicYear: data.academic_year,
    }).then((result) => {
      if (!active) return;
      setAvailabilityLoading(false);
      if (result.error || !result.data) {
        setAvailabilityError(
          result.error ?? "خطا در دریافت وضعیت اعضای ماه انتخاب‌شده",
        );
        return;
      }
      setAvailability(result.data);
      if (league) {
        const sameLeague = result.data.leagues.find(
          (item) => item.id === league.id,
        );
        setSelected(
          sameLeague?.members.map((member) => member.student_id) ?? [],
        );
      }
    });
    return () => {
      active = false;
    };
  }, [open, month, data, league]);

  const occupiedBy = useMemo(() => {
    const result = new Map<number, string>();
    for (const otherLeague of availability?.leagues ?? []) {
      if (otherLeague.archived_at || otherLeague.id === league?.id) continue;
      for (const member of otherLeague.members)
        result.set(member.student_id, otherLeague.title);
    }
    return result;
  }, [availability, league?.id]);

  useEffect(() => {
    if (!availability) return;
    setSelected((current) => current.filter((id) => !occupiedBy.has(id)));
  }, [availability, occupiedBy]);

  const students = useMemo(
    () =>
      data.students.filter((student) =>
        student.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [data.students, search],
  );

  const customIcon = createCustomLeagueSymbolKey({
    shape: customShape,
    background: customBackground,
    foreground: customForeground,
    text: customText,
  });

  async function uploadSymbol(): Promise<{
    iconKey: string;
    uploadedPath: string;
  } | null> {
    if (!symbolFile) return null;
    const extension = SYMBOL_FILE_EXTENSIONS[symbolFile.type];
    if (!extension) {
      toast.error("فرمت نماد باید PNG، JPEG یا WebP باشد");
      return null;
    }
    if (symbolFile.size > MAX_SYMBOL_FILE_SIZE) {
      toast.error("حجم فایل نماد باید حداکثر ۲ مگابایت باشد");
      return null;
    }
    const random = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const fileName = `${random}.${extension}`;
    const path = `league-icons/${fileName}`;
    const result = await supabase.storage
      .from("najm-posters")
      .upload(path, symbolFile, {
        upsert: false,
        contentType: symbolFile.type,
        cacheControl: "31536000",
      });
    if (result.error) {
      toast.error(`بارگذاری نماد ناموفق بود: ${result.error.message}`);
      return null;
    }
    return {
      iconKey: createImageLeagueSymbolKey(fileName),
      uploadedPath: path,
    };
  }

  async function submit() {
    const memberIds = selected.filter((id) => !occupiedBy.has(id));
    if (title.trim().length < 2) return toast.error("نام رده را وارد کنید");
    if (memberIds.length < 2) return toast.error("حداقل دو عضو انتخاب کنید");
    if (!/^\d{4}-\d{2}$/.test(month))
      return toast.error("ماه اثرگذاری باید مانند 1405-06 باشد");
    if (availabilityLoading || !availability)
      return toast.error("ابتدا وضعیت اعضای ماه انتخاب‌شده دریافت شود");
    if (availabilityError) return toast.error(availabilityError);

    let finalIcon = icon;
    let uploadedPath = "";
    setSaving(true);
    if (symbolMode === "custom") finalIcon = customIcon;
    if (symbolMode === "upload") {
      if (symbolFile) {
        const uploaded = await uploadSymbol();
        if (!uploaded) {
          setSaving(false);
          return;
        }
        finalIcon = uploaded.iconKey;
        uploadedPath = uploaded.uploadedPath;
      } else if (!leagueSymbolImagePath(icon)) {
        setSaving(false);
        return toast.error("تصویر نماد را انتخاب کنید");
      }
    }

    const result = await saveNajmLeague({
      id: league?.id,
      classId: data.class_id,
      term: data.term,
      academicYear: data.academic_year,
      title,
      color,
      iconKey: finalIcon,
      memberIds,
      effectiveMonth: month,
    });
    if (result.error && uploadedPath)
      await supabase.storage.from("najm-posters").remove([uploadedPath]);
    setSaving(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success(league ? "رده ویرایش شد" : "رده منتشر شد");
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>{league ? "ویرایش رده" : "ساخت رده جدید"}</DialogTitle>
          <DialogDescription>
            عضویت از ماه انتخاب‌شده اثر می‌گذارد و سوابق ماه‌های نهایی‌شده حفظ
            می‌شوند.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>نام رده</Label>
            <Input
              className="mt-1"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <Label>ماه اثرگذاری عضویت</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={data.month_key}>
                  ماه انتخابی — {jalaliMonthTitle(data.month_key)}
                </SelectItem>
                <SelectItem value={nextJalaliMonthKey(data.month_key)}>
                  ماه بعد —{" "}
                  {jalaliMonthTitle(nextJalaliMonthKey(data.month_key))}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>رنگ رده</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLORS.map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`انتخاب رنگ ${item}`}
                className={`h-9 w-9 rounded-full border-4 ${color === item ? "border-slate-900" : "border-white"}`}
                style={{ background: item }}
                onClick={() => setColor(item)}
              />
            ))}
            <Input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-9 w-12 p-1"
              aria-label="رنگ دلخواه رده"
            />
          </div>
        </div>
        <div className="rounded-2xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>نماد رده</Label>
            {data.can_manage && (
              <div className="flex rounded-xl bg-slate-100 p-1 text-xs">
                {(
                  [
                    ["preset", "گالری"],
                    ["custom", "ساخت نماد"],
                    ["upload", "بارگذاری"],
                  ] as Array<[SymbolMode, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSymbolMode(mode)}
                    className={`rounded-lg px-3 py-1.5 font-bold ${symbolMode === mode ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {(!data.can_manage || symbolMode === "preset") && (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {LEAGUE_SYMBOL_PRESETS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setIcon(item.key);
                    setSymbolMode("preset");
                  }}
                  title={item.title}
                  aria-label={item.title}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-[10px] transition hover:bg-emerald-50 ${icon === item.key && symbolMode === "preset" ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200"}`}
                >
                  <LeagueSymbol iconKey={item.key} size={30} />
                  <span className="line-clamp-1">{item.title}</span>
                </button>
              ))}
            </div>
          )}
          {data.can_manage && symbolMode === "custom" && (
            <div className="mt-3 grid gap-4 rounded-xl bg-slate-50 p-3 md:grid-cols-[120px_1fr]">
              <div className="flex items-center justify-center rounded-xl border bg-white p-4">
                <LeagueSymbol iconKey={customIcon} size={74} />
              </div>
              <div className="space-y-3">
                <div>
                  <Label>ایموجی یا حداکثر دو حرف</Label>
                  <Input
                    className="mt-1"
                    value={customText}
                    onChange={(event) =>
                      setCustomText(
                        sanitizeLeagueSymbolText(event.target.value),
                      )
                    }
                    placeholder="مثلاً ن یا 🌟"
                  />
                </div>
                <div>
                  <Label>شکل زمینه</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {SHAPES.map((shape) => (
                      <button
                        key={shape.key}
                        type="button"
                        onClick={() => setCustomShape(shape.key)}
                        className={`rounded-lg border px-3 py-1.5 text-xs ${customShape === shape.key ? "border-emerald-600 bg-emerald-50 font-bold" : "bg-white"}`}
                      >
                        {shape.title}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="text-xs font-bold">
                    رنگ زمینه
                    <Input
                      type="color"
                      value={customBackground}
                      onChange={(event) =>
                        setCustomBackground(event.target.value)
                      }
                      className="mt-1 h-9 w-16 p-1"
                    />
                  </label>
                  <label className="text-xs font-bold">
                    رنگ نماد
                    <Input
                      type="color"
                      value={customForeground}
                      onChange={(event) =>
                        setCustomForeground(event.target.value)
                      }
                      className="mt-1 h-9 w-16 p-1"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
          {data.can_manage && symbolMode === "upload" && (
            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border bg-white">
                <LeagueSymbol
                  iconKey={icon}
                  size={78}
                  imagePreview={symbolPreview || undefined}
                />
              </div>
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    document.getElementById("najm-league-symbol-file")?.click()
                  }
                >
                  <ImagePlus className="h-4 w-4" />
                  انتخاب تصویر نماد
                </Button>
                <input
                  id="najm-league-symbol-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file && !SYMBOL_FILE_EXTENSIONS[file.type]) {
                      toast.error("فرمت نماد باید PNG، JPEG یا WebP باشد");
                      event.target.value = "";
                      return;
                    }
                    if (file && file.size > MAX_SYMBOL_FILE_SIZE) {
                      toast.error("حجم فایل نماد باید حداکثر ۲ مگابایت باشد");
                      event.target.value = "";
                      return;
                    }
                    setSymbolFile(file);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  PNG، JPEG یا WebP؛ حداکثر ۲ مگابایت. تصویر مربع و زمینه شفاف
                  نتیجه بهتری دارد.
                </p>
              </div>
            </div>
          )}
          {!data.can_manage && (
            <p className="mt-2 text-xs text-muted-foreground">
              ساخت و بارگذاری نماد اختصاصی فقط در اختیار مدیر است.
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label>اعضای رده</Label>
            <span className="text-xs text-muted-foreground">
              {toFa(selected.length)} نفر انتخاب شده
            </span>
          </div>
          <div className="relative mt-2">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pr-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جستجوی قرآن‌آموز"
            />
          </div>
          {availabilityLoading && (
            <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال بررسی عضویت‌های {jalaliMonthTitle(month)}...
            </div>
          )}
          {availabilityError && (
            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {availabilityError}
            </div>
          )}
          {!availabilityLoading && !availabilityError && (
            <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto rounded-2xl border p-2 sm:grid-cols-2">
              {students.map((student) => {
                const assignedLeague = occupiedBy.get(student.id);
                const disabled = Boolean(assignedLeague);
                return (
                  <label
                    key={student.id}
                    className={`flex items-center gap-2 rounded-xl p-2 ${disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : "cursor-pointer hover:bg-secondary/50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={!disabled && selected.includes(student.id)}
                      disabled={disabled}
                      onChange={() =>
                        setSelected((value) =>
                          value.includes(student.id)
                            ? value.filter((id) => id !== student.id)
                            : [...value, student.id],
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 font-medium">
                      {student.name}
                    </span>
                    {assignedLeague && (
                      <span className="max-w-36 truncate rounded-full bg-slate-200 px-2 py-1 text-[10px] text-slate-600">
                        عضو رده «{assignedLeague}»
                      </span>
                    )}
                  </label>
                );
              })}
              {students.length === 0 && (
                <p className="col-span-full p-4 text-center text-sm text-muted-foreground">
                  قرآن‌آموزی با این نام پیدا نشد.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={
              saving || availabilityLoading || Boolean(availabilityError)
            }
          >
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            ذخیره و انتشار
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
