import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  FileAudio,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  CalendarClock,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  listPassages,
  createPassage,
  setDailyChallenge,
  getTodayChallenge,
} from "@/features/recitation/api/recitation-admin-api";
import {
  PASSAGE_STATUS_LABELS,
  DIFFICULTY_LABELS,
  type RecitationPassage,
  type RecitationDailyChallenge,
} from "@/features/recitation/domain/recitation-types";

export const Route = createFileRoute("/admin/recitation-studio")({
  component: RecitationStudioPage,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  analyzing: "outline",
  review: "outline",
  published: "default",
  archived: "outline",
};

function RecitationStudioPage() {
  const [passages, setPassages] = useState<RecitationPassage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [todayChallenge, setTodayChallenge] = useState<RecitationDailyChallenge | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listPassages({
        search: search || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setPassages(data);
      setTodayChallenge(await getTodayChallenge());
    } catch {
      toast.error("خطا در بارگذاری فرازها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search, statusFilter]);

  const handleCreate = async (form: Record<string, string>) => {
    try {
      await createPassage({
        title: form.title,
        reciter: form.reciter,
        surah: form.surah,
        ayah_start: form.ayah_start ? parseInt(form.ayah_start) : undefined,
        ayah_end: form.ayah_end ? parseInt(form.ayah_end) : undefined,
        maqam_primary: form.maqam_primary,
        difficulty: parseInt(form.difficulty || "1"),
        description: form.description,
        tags: form.tags
          ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      });
      toast.success("فراز جدید ساخته شد");
      setShowCreate(false);
      void load();
    } catch (e: any) {
      toast.error(e?.message || "ساخت فراز ناموفق بود");
    }
  };

  const published = passages.filter((p) => p.status === "published");
  const analyzing = passages.filter((p) => p.status === "analyzing" || p.status === "review");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-black flex items-center gap-3">
            <FileAudio className="h-8 w-8 text-primary" />
            استودیوی هوشمند فرازها
          </h1>
          <p className="text-muted-foreground mt-1">
            مرکز تولید، تحلیل، بازبینی و انتشار فرازهای آموزشی چالش تقلید هوشمند — فقط مدیر
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              ایجاد فراز جدید
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>ایجاد فراز جدید</DialogTitle>
            </DialogHeader>
            <CreatePassageForm onSubmit={handleCreate} />
          </DialogContent>
        </Dialog>
      </div>

      {/* آمار سریع */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatCard label="کل فرازها" value={passages.length} />
        <StatCard label="منتشر شده" value={published.length} />
        <StatCard label="در حال تحلیل/بازبینی" value={analyzing.length} />
        <StatCard
          label="چالش روزانه"
          value={todayChallenge ? "فعال ✓" : "تنظیم نشده"}
          accent={!!todayChallenge}
        />
      </div>

      {/* تنظیم چالش روزانه */}
      <DailyChallengeCard passages={published} current={todayChallenge} onSaved={() => void load()} />

      {/* جستجو و فیلتر */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="جستجو: عنوان، قاری، سوره..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه وضعیت‌ها</SelectItem>
            <SelectItem value="draft">پیش‌نویس</SelectItem>
            <SelectItem value="analyzing">در حال تحلیل</SelectItem>
            <SelectItem value="review">در انتظار بازبینی</SelectItem>
            <SelectItem value="published">منتشر شده</SelectItem>
            <SelectItem value="archived">آرشیو</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => void load()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          به‌روزرسانی
        </Button>
      </div>

      {/* لیست فرازها */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : passages.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            هنوز فرازی ثبت نشده است. با دکمه «ایجاد فراز جدید» شروع کنید.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {passages.map((p) => (
            <Card key={p.id} className="overflow-hidden hover:border-primary/50 transition">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="text-lg leading-snug">{p.title}</CardTitle>
                  <Badge variant={STATUS_COLORS[p.status] as any}>
                    {PASSAGE_STATUS_LABELS[p.status]}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {p.reciter}
                  {p.surah ? ` • ${p.surah}` : ""}
                  {p.ayah_start ? ` • آیات ${p.ayah_start} تا ${p.ayah_end ?? p.ayah_start}` : ""}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{DIFFICULTY_LABELS[p.difficulty] ?? p.difficulty}</Badge>
                  {p.maqam_primary && <Badge variant="outline">{p.maqam_primary}</Badge>}
                  {p.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
                <Button asChild size="sm" className="w-full gap-2">
                  <Link to="/admin/recitation-studio/$passageId" params={{ passageId: p.id }}>
                    <Eye className="h-4 w-4" />
                    مدیریت فراز و نسخه‌ها
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-4">
        فقط مدیر می‌تواند فراز ایجاد، تحلیل، ویرایش و منتشر کند. استاد فقط فرازهای منتشرشده را به
        کلاس خود تخصیص می‌دهد.
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-emerald-500/40 bg-emerald-50/40" : ""}>
      <CardContent className="py-4">
        <div className={`text-2xl font-black ${accent ? "text-emerald-700" : ""}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

function DailyChallengeCard({
  passages,
  current,
  onSaved,
}: {
  passages: RecitationPassage[];
  current: RecitationDailyChallenge | null;
  onSaved: () => void;
}) {
  const [passageId, setPassageId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!passageId) return;
    setSaving(true);
    try {
      // آخرین نسخه تأییدشده همان current_version است — از API فراز می‌گیریم
      const { getPassage } = await import("@/features/recitation/api/recitation-admin-api");
      const passage = await getPassage(passageId);
      if (!passage.current_version_id) {
        toast.error("این فراز نسخه تأییدشده ندارد");
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      await setDailyChallenge(today, passageId, passage.current_version_id);
      toast.success("چالش روزانه تنظیم شد");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "خطا در تنظیم چالش");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          چالش روزانه قرآن‌آموزان
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-52">
          <Label>فراز امروز</Label>
          <Select value={passageId} onValueChange={setPassageId}>
            <SelectTrigger>
              <SelectValue placeholder={current ? "چالش امروز قبلاً تنظیم شده" : "انتخاب فراز منتشرشده..."} />
            </SelectTrigger>
            <SelectContent>
              {passages.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title} — {p.reciter}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSave} disabled={!passageId || saving}>
          {saving ? "در حال ثبت..." : "ذخیره چالش امروز"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CreatePassageForm({ onSubmit }: { onSubmit: (form: Record<string, string>) => void }) {
  const [form, setForm] = useState<Record<string, string>>({
    title: "",
    reciter: "مصطفی اسماعیل",
    surah: "",
    ayah_start: "",
    ayah_end: "",
    maqam_primary: "",
    difficulty: "1",
    description: "",
    tags: "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-4"
    >
      <div>
        <Label>عنوان فراز *</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="مثال: آغاز سوره الرحمن"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>قاری *</Label>
          <Input value={form.reciter} onChange={(e) => setForm({ ...form, reciter: e.target.value })} required />
        </div>
        <div>
          <Label>سوره</Label>
          <Input value={form.surah} onChange={(e) => setForm({ ...form, surah: e.target.value })} placeholder="الرحمن" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>آیه شروع</Label>
          <Input
            type="number"
            value={form.ayah_start}
            onChange={(e) => setForm({ ...form, ayah_start: e.target.value })}
          />
        </div>
        <div>
          <Label>آیه پایان</Label>
          <Input
            type="number"
            value={form.ayah_end}
            onChange={(e) => setForm({ ...form, ayah_end: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>مقام اصلی</Label>
          <Input
            value={form.maqam_primary}
            onChange={(e) => setForm({ ...form, maqam_primary: e.target.value })}
            placeholder="رست، حجاز، بیات..."
          />
        </div>
        <div>
          <Label>درجه سختی (۱ تا ۱۰)</Label>
          <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} — {DIFFICULTY_LABELS[n]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>توضیحات آموزشی</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="نکات آموزشی برای این فراز..."
          rows={2}
        />
      </div>
      <div>
        <Label>برچسب‌ها (با ویرگول جدا کنید)</Label>
        <Input
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          placeholder="مقام رست, تحریر قوی, کشش"
        />
      </div>
      <Button type="submit" className="w-full">
        ایجاد فراز
      </Button>
    </form>
  );
}
