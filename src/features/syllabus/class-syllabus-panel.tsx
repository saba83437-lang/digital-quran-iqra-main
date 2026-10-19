import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock3,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteClassSyllabusItem,
  loadClassSyllabus,
  reorderClassSyllabus,
  saveClassSyllabusItem,
  type ClassSyllabusItem,
  type SyllabusStatus,
} from "./syllabus-api";
import { syllabusProgress } from "./syllabus-domain";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

const STATUS_LABELS: Record<SyllabusStatus, string> = {
  planned: "برنامه‌ریزی‌شده",
  in_progress: "درحال اجرا",
  completed: "تکمیل‌شده",
};

const STATUS_STYLES: Record<SyllabusStatus, string> = {
  planned: "border-slate-200 bg-slate-50 text-slate-700",
  in_progress: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function StatusIcon({ status }: { status: SyllabusStatus }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "in_progress") return <Clock3 className="h-4 w-4" />;
  return <CircleDashed className="h-4 w-4" />;
}

function formatTargetDate(value?: string | null): string {
  if (!value) return "بدون تاریخ هدف";
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

interface FormState {
  title: string;
  description: string;
  status: SyllabusStatus;
  targetDate: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  status: "planned",
  targetDate: "",
};

export function ClassSyllabusPanel({
  classId,
  canManage = false,
  title = "برنامه آموزشی کلاس",
}: {
  classId: number | string | null | undefined;
  canManage?: boolean;
  title?: string;
}) {
  const normalizedClassId = classId == null ? null : Number(classId);
  const [items, setItems] = useState<ClassSyllabusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassSyllabusItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClassSyllabusItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!normalizedClassId || !Number.isFinite(normalizedClassId)) {
        setItems([]);
        setLoading(false);
        return;
      }
      silent ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setItems(await loadClassSyllabus([normalizedClassId]));
      } catch (loadError) {
        setItems([]);
        setError(loadError instanceof Error ? loadError.message : "خطا در دریافت برنامه آموزشی");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [normalizedClassId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => syllabusProgress(items), [items]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(item: ClassSyllabusItem) {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description,
      status: item.status,
      targetDate: item.target_date ?? "",
    });
    setFormOpen(true);
  }

  async function submitForm() {
    if (!normalizedClassId) return;
    if (form.title.trim().length < 2) {
      toast.error("عنوان سرفصل را وارد کنید");
      return;
    }
    setSaving(true);
    try {
      await saveClassSyllabusItem({
        id: editing?.id,
        classId: normalizedClassId,
        title: form.title,
        description: form.description,
        status: form.status,
        targetDate: form.targetDate || null,
        sortOrder: editing?.sort_order ?? null,
      });
      toast.success(editing ? "سرفصل به‌روزرسانی شد" : "سرفصل جدید افزوده شد");
      setFormOpen(false);
      await load(true);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "ذخیره سرفصل ناموفق بود");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item: ClassSyllabusItem, status: SyllabusStatus) {
    if (!normalizedClassId || item.status === status) return;
    try {
      await saveClassSyllabusItem({
        id: item.id,
        classId: normalizedClassId,
        title: item.title,
        description: item.description,
        status,
        targetDate: item.target_date,
        sortOrder: item.sort_order,
      });
      toast.success(`وضعیت «${item.title}» ذخیره شد`);
      await load(true);
    } catch (statusError) {
      toast.error(statusError instanceof Error ? statusError.message : "تغییر وضعیت ناموفق بود");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const deleted = await deleteClassSyllabusItem(deleteTarget.id);
      if (!deleted) throw new Error("سرفصل یافت نشد");
      toast.success("سرفصل حذف شد");
      setDeleteTarget(null);
      await load(true);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "حذف سرفصل ناموفق بود");
    } finally {
      setDeleting(false);
    }
  }

  async function move(itemIndex: number, direction: -1 | 1) {
    if (!normalizedClassId) return;
    const targetIndex = itemIndex + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    [next[itemIndex], next[targetIndex]] = [next[targetIndex], next[itemIndex]];
    setItems(next);
    setMovingId(items[itemIndex].id);
    try {
      await reorderClassSyllabus(normalizedClassId, next.map((item) => item.id));
    } catch (moveError) {
      toast.error(moveError instanceof Error ? moveError.message : "جابه‌جایی ناموفق بود");
      await load(true);
    } finally {
      setMovingId(null);
    }
  }

  if (loading) {
    return (
      <Card className="rounded-3xl p-8 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        <p className="mt-2 text-sm text-muted-foreground">در حال دریافت برنامه آموزشی...</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-3xl">
      <div className="border-b bg-gradient-to-l from-emerald-50 to-amber-50/60 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display flex items-center gap-2 text-lg font-black text-emerald-950">
              <BookOpen className="h-5 w-5 text-emerald-700" /> {title}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              پیشرفت واقعی بر اساس سرفصل‌های تکمیل‌شده
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={refreshing}
              onClick={() => void load(true)}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              تازه‌سازی
            </Button>
            {canManage && (
              <Button size="sm" onClick={openCreate} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> افزودن سرفصل
              </Button>
            )}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="mb-1.5 flex justify-between text-xs">
              <span>پیشرفت کلاس</span>
              <span className="font-bold">{toFa(stats.percent)}٪</span>
            </div>
            <Progress value={stats.percent} />
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge variant="outline">کل {toFa(stats.total)}</Badge>
            <Badge className="border-0 bg-emerald-100 text-emerald-800">
              تکمیل {toFa(stats.completed)}
            </Badge>
            <Badge className="border-0 bg-amber-100 text-amber-800">
              درحال اجرا {toFa(stats.inProgress)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-5">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
            <p className="text-sm text-rose-800">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              تلاش دوباره
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            <BookOpen className="mx-auto h-10 w-10 opacity-30" />
            <p className="mt-3 text-sm">هنوز سرفصل آموزشی برای این کلاس ثبت نشده است.</p>
            {canManage && (
              <Button size="sm" className="mt-4" onClick={openCreate}>
                اولین سرفصل را ثبت کن
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="rounded-2xl border bg-card p-4 transition hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-black text-emerald-800">
                    {toFa(index + 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-emerald-950">{item.title}</h4>
                      <Badge variant="outline" className={`gap-1 ${STATUS_STYLES[item.status]}`}>
                        <StatusIcon status={item.status} /> {STATUS_LABELS[item.status]}
                      </Badge>
                    </div>
                    {item.description && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatTargetDate(item.target_date)}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={index === 0 || movingId === item.id}
                        onClick={() => void move(index, -1)}
                        aria-label="انتقال به بالا"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={index === items.length - 1 || movingId === item.id}
                        onClick={() => void move(index, 1)}
                        aria-label="انتقال به پایین"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)} aria-label="ویرایش">
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(item)}
                        aria-label="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="mt-3 border-t pt-3">
                    <Select
                      value={item.status}
                      onValueChange={(value) => void changeStatus(item, value as SyllabusStatus)}
                    >
                      <SelectTrigger className="h-9 w-full sm:w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planned">برنامه‌ریزی‌شده</SelectItem>
                        <SelectItem value="in_progress">درحال اجرا</SelectItem>
                        <SelectItem value="completed">تکمیل‌شده</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={(open) => !saving && setFormOpen(open)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش سرفصل" : "افزودن سرفصل"}</DialogTitle>
            <DialogDescription>اطلاعات واقعی برنامه آموزشی این کلاس را ثبت کنید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>عنوان *</Label>
              <Input
                className="mt-1.5"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                maxLength={200}
              />
            </div>
            <div>
              <Label>توضیح</Label>
              <Textarea
                className="mt-1.5"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={4}
                maxLength={5000}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>وضعیت</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, status: value as SyllabusStatus }))
                  }
                >
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">برنامه‌ریزی‌شده</SelectItem>
                    <SelectItem value="in_progress">درحال اجرا</SelectItem>
                    <SelectItem value="completed">تکمیل‌شده</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>تاریخ هدف</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={form.targetDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, targetDate: event.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>
              انصراف
            </Button>
            <Button disabled={saving} onClick={() => void submitForm()}>
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>حذف سرفصل</DialogTitle>
            <DialogDescription>
              آیا از حذف «{deleteTarget?.title}» مطمئن هستید؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              انصراف
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
