import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Upload,
  Loader2,
  CheckCircle,
  Settings2,
  Archive,
  FileAudio,
  Mic,
  CheckCheck,
  CircleAlert,
  Pause,
  Play,
  Music4,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import {
  getPassage,
  listPassageVersions,
  listAnalysisJobs,
  uploadAudioAndCreateVersion,
  approveVersion,
  updateScoringConfig,
  archivePassage,
  getAudioSignedUrl,
  runBrowserAnalysis,
} from "@/features/recitation/api/recitation-admin-api";
import {
  PASSAGE_STATUS_LABELS,
  ANALYSIS_STATUS_LABELS,
  DIFFICULTY_LABELS,
  type RecitationPassage,
  type RecitationPassageVersion,
  type RecitationAnalysisJob,
  type RecitationScoringConfig,
} from "@/features/recitation/domain/recitation-types";
import { DEFAULT_SCORING_CONFIG, weightsSumOk } from "@/features/recitation/domain/recitation-scoring";
import { NoteEditor } from "@/features/recitation/components/note-editor";

export const Route = createFileRoute("/admin/recitation-studio_/$passageId")({
  component: PassageDetailPage,
});

function PassageDetailPage() {
  const { passageId } = Route.useParams();
  const [passage, setPassage] = useState<RecitationPassage | null>(null);
  const [versions, setVersions] = useState<RecitationPassageVersion[]>([]);
  const [jobs, setJobs] = useState<RecitationAnalysisJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // نسخه‌ای که ویرایشگر نت‌نگار برای آن باز است
  const [editorVersion, setEditorVersion] = useState<RecitationPassageVersion | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, v, j] = await Promise.all([
        getPassage(passageId),
        listPassageVersions(passageId),
        listAnalysisJobs(passageId),
      ]);
      setPassage(p);
      setVersions(v);
      setJobs(j);
    } catch (e: any) {
      // نمایش متن واقعی خطا — نه فقط toast
      const message = e?.message || e?.error_description || String(e);
      console.error("خطا در بارگذاری جزئیات فراز:", e);
      setLoadError(message);
      toast.error("خطا در بارگذاری اطلاعات فراز");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [passageId]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      await uploadAudioAndCreateVersion(passageId, selectedFile);
      toast.success("صوت بارگذاری شد — نسخه جدید ساخته شد و جاب تحلیل ایجاد گردید");
      setSelectedFile(null);
      void load();
    } catch (e: any) {
      toast.error(e?.message || "آپلود ناموفق بود");
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (versionId: string, force: boolean) => {
    try {
      await approveVersion(versionId, { force });
      toast.success(force ? "نسخه با bypass تأیید و منتشر شد (تست)" : "نسخه تأیید و منتشر شد");
      void load();
    } catch (e: any) {
      toast.error(e?.message || "تأیید ناموفق بود");
    }
  };

  const handleArchive = async () => {
    if (!confirm("فراز آرشیو شود؟ دیگر برای قرآن‌آموزان نمایش داده نمی‌شود.")) return;
    try {
      await archivePassage(passageId);
      toast.success("فراز آرشیو شد");
      void load();
    } catch (e: any) {
      toast.error(e?.message || "خطا");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // اگر خطایی بود، آن را نشان بده (به‌جای صفحه خالی/گمراه‌کننده)
  if (loadError && !passage) {
    return (
      <div className="py-20 max-w-xl mx-auto space-y-4">
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <b>خطا در بارگذاری فراز:</b>
          <div dir="ltr" className="mt-1 font-mono text-xs break-all">{loadError}</div>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/recitation-studio">بازگشت به استودیو</Link>
        </Button>
      </div>
    );
  }

  if (!passage) {
    return <div className="py-20 text-center text-muted-foreground">فراز یافت نشد.</div>;
  }

  const canPublish = versions.some((v) => v.approved_at);
  const isPublished = passage.status === "published";

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/recitation-studio" className="hover:text-primary">
          استودیوی فرازها
        </Link>
        <ArrowRight className="h-4 w-4 rotate-180" />
        <span className="text-foreground">{passage.title}</span>
      </div>

      {/* سربرگ فراز */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <h1 className="font-display text-2xl font-black flex items-center gap-2">
                <FileAudio className="h-6 w-6 text-primary" />
                {passage.title}
              </h1>
              <div className="text-sm text-muted-foreground mt-1">
                {passage.reciter}
                {passage.surah ? ` • ${passage.surah}` : ""}
                {passage.ayah_start ? ` • آیات ${passage.ayah_start} تا ${passage.ayah_end ?? passage.ayah_start}` : ""}
                {passage.maqam_primary ? ` • مقام ${passage.maqam_primary}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge>{PASSAGE_STATUS_LABELS[passage.status]}</Badge>
              <Badge variant="outline">{DIFFICULTY_LABELS[passage.difficulty]}</Badge>
            </div>
          </div>
          {passage.description && (
            <p className="text-sm text-muted-foreground">{passage.description}</p>
          )}

          {/* آپلود صوت */}
          <div className="rounded-xl border border-dashed p-4 bg-muted/30">
            <div className="text-sm font-medium mb-2 flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              بارگذاری فایل صوتی مرجع (WAV بدون فشرده‌سازی ترجیح داده می‌شود، MP3 هم پشتیبانی است)
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <Input
                type="file"
                accept="audio/*"
                className="max-w-sm"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              <Button onClick={handleUpload} disabled={!selectedFile || uploading} className="gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "در حال بارگذاری..." : "بارگذاری و ساخت نسخه جدید"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              با بارگذاری، یک نسخه جدید ساخته می‌شود. سپس با دکمه «تحلیل خودکار صدا» منحنی ملودی
              (Pitch) و مسیر تونل بازی به‌صورت خودکار ساخته و ذخیره می‌شود.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* نسخه‌ها */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">نسخه‌ها و وضعیت تحلیل</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {versions.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              هنوز نسخه‌ای وجود ندارد. ابتدا فایل صوتی را بارگذاری کنید.
            </p>
          )}
          {versions.map((v) => (
            <div key={v.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">نسخه {v.version_no}</div>
                <div className="flex items-center gap-2">
                  <Badge variant={v.analysis_status === "approved" ? "default" : "outline"}>
                    {ANALYSIS_STATUS_LABELS[v.analysis_status]}
                  </Badge>
                  {v.approved_at && <Badge variant="secondary">منتشرشده ✓</Badge>}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {v.change_note ? `فایل: ${v.change_note}` : ""} • ایجاد:{" "}
                {new Date(v.created_at).toLocaleString("fa-IR")}
              </div>

              <VersionAudioPlayer audioPath={v.audio_path} />

              {/* خلاصه تحلیل (اگر موجود باشد) */}
              {v.analysis_status === "completed" || v.analysis_status === "approved" ? (
                <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-800">
                  تحلیل موجود است: {analysisSummary(v.analysis_json)}
                </div>
              ) : (
                <div className="text-xs bg-muted rounded-lg p-3 text-muted-foreground flex items-center gap-2">
                  <CircleAlert className="h-4 w-4" />
                  هنوز تحلیل هوشمند روی این نسخه انجام نشده است. از دکمه «تحلیل خودکار صدا» استفاده کنید.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <ScoringConfigDialog version={v} onSaved={() => void load()} />
                <NoteEditorButton version={v} onOpen={() => setEditorVersion(v)} />
                {v.analysis_status !== "approved" && (
                  <>
                    <AnalyzeButton version={v} onDone={() => void load()} />
                    <Button
                      size="sm"
                      onClick={() => handleApprove(v.id, false)}
                      className="gap-2"
                    >
                      <CheckCircle className="h-4 w-4" />
                      تأیید و انتشار
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm("تحلیل هنوز کامل نشده. برای تست، با bypass تأیید شود؟")) {
                          void handleApprove(v.id, true);
                        }
                      }}
                    >
                      تأیید تستی (بدون تحلیل)
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* جاب‌های تحلیل */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">جاب‌های تحلیل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between border-b pb-2">
                <span>
                  نسخه {versions.find((v) => v.id === j.version_id)?.version_no ?? "؟"} —{" "}
                  {ANALYSIS_STATUS_LABELS[j.status]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleString("fa-IR")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* اقدامات */}
      <div className="flex flex-wrap gap-3">
        {isPublished && (
          <Button
            variant="outline"
            onClick={handleArchive}
            className="gap-2 text-destructive border-destructive/40"
          >
            <Archive className="h-4 w-4" />
            آرشیو فراز
          </Button>
        )}
        {!isPublished && canPublish && (
          <Button
            onClick={async () => {
              const { publishPassage } = await import("@/features/recitation/api/recitation-admin-api");
              try {
                await publishPassage(passageId);
                toast.success("فراز منتشر شد");
                void load();
              } catch (e: any) {
                toast.error(e?.message || "خطا");
              }
            }}
          >
            انتشار با آخرین نسخه تأییدشده
          </Button>
        )}
      </div>

      {/* دیالوگ استودیوی نت‌نگار */}
      <Dialog
        open={!!editorVersion}
        onOpenChange={(open) => {
          if (!open) setEditorVersion(null);
        }}
      >
        <DialogContent className="max-w-[94vw] w-[840px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Music4 className="h-5 w-5 text-primary" />
              استودیوی نت‌نگار
              {editorVersion ? ` — نسخه ${editorVersion.version_no}` : ""}
            </DialogTitle>
          </DialogHeader>
          {editorVersion && (
            <NoteEditor
              version={editorVersion}
              passageTextHint={passage.description || null}
              onSaved={() => void load()}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function analysisSummary(analysis: Record<string, unknown>): string {
  const pitch = analysis.pitch as unknown[];
  const notes = analysis.notes as unknown[];
  const events = analysis.events as unknown[];
  const parts: string[] = [];
  if (Array.isArray(pitch)) parts.push(`${pitch.length} نقطه Pitch`);
  if (Array.isArray(notes)) parts.push(`${notes.length} نت`);
  if (Array.isArray(events)) parts.push(`${events.length} رویداد (تنفس/تحریر)`);
  return parts.join(" • ") || "—";
}

/** دکمه «تحلیل خودکار» — فایل صوتی نسخه را در مرورگر تحلیل و در دیتابیس ثبت می‌کند */
function AnalyzeButton({
  version,
  onDone,
}: {
  version: RecitationPassageVersion;
  onDone: () => void;
}) {
  const [running, setRunning] = useState(false);

  const handleAnalyze = async () => {
    if (running) return;
    setRunning(true);
    try {
      const quality = await runBrowserAnalysis(version.id, version.audio_path);
      toast.success(
        `تحلیل انجام شد: ${quality.coveragePercent}٪ پوشش صدا، ${quality.noteCount} نت، ${quality.breathCount} تنفس`,
      );
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "تحلیل ناموفق بود");
    } finally {
      setRunning(false);
    }
  };

  const canAnalyze =
    version.analysis_status === "pending" ||
    version.analysis_status === "processing" ||
    version.analysis_status === "failed" ||
    version.analysis_status === "completed";

  if (!canAnalyze) return null;

  return (
    <Button size="sm" variant="secondary" onClick={handleAnalyze} disabled={running} className="gap-2">
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      {running
        ? "در حال تحلیل صدا..."
        : version.analysis_status === "completed"
          ? "تحلیل مجدد"
          : "تحلیل خودکار صدا"}
    </Button>
  );
}

/** پخش صوت نسخه با لینک امضاشده */
function VersionAudioPlayer({ audioPath }: { audioPath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    let mounted = true;
    void getAudioSignedUrl(audioPath).then((u) => {
      if (mounted) setUrl(u);
    });
    return () => {
      mounted = false;
    };
  }, [audioPath]);

  const toggle = () => {
    if (!url) return;
    if (!audioEl) {
      const a = new Audio(url);
      a.onended = () => setPlaying(false);
      setAudioEl(a);
      void a.play();
      setPlaying(true);
      return;
    }
    if (playing) {
      audioEl.pause();
      setPlaying(false);
    } else {
      void audioEl.play();
      setPlaying(true);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={!url} className="gap-2">
      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      {playing ? "توقف پخش" : url ? "پخش صوت مرجع" : "در حال آماده‌سازی..."}
    </Button>
  );
}

/** دیالوگ تنظیمات امتیازدهی نسخه */
function ScoringConfigDialog({
  version,
  onSaved,
}: {
  version: RecitationPassageVersion;
  onSaved: () => void;
}) {
  const base = { ...DEFAULT_SCORING_CONFIG, ...(version.scoring_config ?? {}) } as RecitationScoringConfig;
  const [config, setConfig] = useState<RecitationScoringConfig>(base);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [force, setForce] = useState(false);

  const save = async () => {
    if (!weightsSumOk(config)) {
      toast.error("جمع وزن‌ها باید برابر ۱ باشد (مثلاً ۰.۳۵ + ۰.۱۵ + ...)");
      return;
    }
    setSaving(true);
    try {
      await updateScoringConfig(version.id, config);
      if (force) {
        await approveVersion(version.id, { force: true });
        toast.success("تنظیمات ذخیره شد و نسخه به‌صورت تستی تأیید و منتشر شد");
      } else {
        toast.success("تنظیمات امتیازدهی ذخیره شد");
      }
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  };

  const weightFields: Array<{ key: keyof RecitationScoringConfig; label: string }> = [
    { key: "pitchWeight", label: "درستی نت (Pitch)" },
    { key: "stabilityWeight", label: "ثبات نت" },
    { key: "transitionWeight", label: "انتقال‌ها" },
    { key: "timingWeight", label: "زمان‌بندی" },
    { key: "ornamentWeight", label: "تحریرها" },
    { key: "breathWeight", label: "تنفس" },
    { key: "energyWeight", label: "شدت صدا" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Settings2 className="h-4 w-4" />
          تنظیمات امتیازدهی
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تنظیمات امتیازدهی — نسخه {version.version_no}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {weightFields.map((f) => (
              <div key={String(f.key)} className="flex items-center justify-between gap-3">
                <Label className="text-sm">{f.label}</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="w-28 text-left"
                  value={config[f.key] as number}
                  onChange={(e) => setConfig({ ...config, [f.key]: parseFloat(e.target.value) || 0 })}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>آستانه ۱ ستاره</Label>
              <Input
                type="number"
                value={config.stars.one}
                onChange={(e) =>
                  setConfig({ ...config, stars: { ...config.stars, one: parseFloat(e.target.value) || 0 } })
                }
              />
            </div>
            <div>
              <Label>آستانه ۲ ستاره</Label>
              <Input
                type="number"
                value={config.stars.two}
                onChange={(e) =>
                  setConfig({ ...config, stars: { ...config.stars, two: parseFloat(e.target.value) || 0 } })
                }
              />
            </div>
            <div>
              <Label>آستانه ۳ ستاره</Label>
              <Input
                type="number"
                value={config.stars.three}
                onChange={(e) =>
                  setConfig({ ...config, stars: { ...config.stars, three: parseFloat(e.target.value) || 0 } })
                }
              />
            </div>
            <div>
              <Label>حداقل قبولی</Label>
              <Input
                type="number"
                value={config.passScore}
                onChange={(e) => setConfig({ ...config, passScore: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>XP به ازای هر ستاره</Label>
              <Input
                type="number"
                value={config.xp}
                onChange={(e) => setConfig({ ...config, xp: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>سکه به ازای هر ستاره</Label>
              <Input
                type="number"
                value={config.coins}
                onChange={(e) => setConfig({ ...config, coins: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>تلورانس نت (سنت)</Label>
              <Input
                type="number"
                value={config.pitchToleranceCents}
                onChange={(e) =>
                  setConfig({ ...config, pitchToleranceCents: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <Label>تلورانس زمان (میلی‌ثانیه)</Label>
              <Input
                type="number"
                value={config.timingToleranceMs}
                onChange={(e) =>
                  setConfig({ ...config, timingToleranceMs: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between border rounded-lg p-3">
            <div className="text-sm">
              <div className="font-medium">تأیید تستی این نسخه هم انجام شود</div>
              <div className="text-xs text-muted-foreground">
                فقط برای فاز 21A که تحلیل خودکار هنوز فعال نیست
              </div>
            </div>
            <Switch checked={force} onCheckedChange={setForce} />
          </div>

          <Button onClick={save} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            ذخیره تنظیمات {force && "و تأیید تستی"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** دکمه‌ی بازکردن ویرایشگر نت‌نگار — فقط وقتی تحلیل با نت موجود است فعال می‌شود */
function NoteEditorButton({
  version,
  onOpen,
}: {
  version: RecitationPassageVersion;
  onOpen: () => void;
}) {
  const aj = version.analysis_json as { notes?: unknown } | null;
  const noteCount = aj && Array.isArray(aj.notes) ? aj.notes.length : 0;
  const ready =
    (version.analysis_status === "completed" || version.analysis_status === "approved") &&
    noteCount > 0;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onOpen}
      disabled={!ready}
      className="gap-2"
      title={
        ready
          ? "نمایش نمودار پلکانی نت‌ها و ویرایش دقیق آن‌ها"
          : "ابتدا «تحلیل خودکار صدا» را روی این نسخه اجرا کنید"
      }
    >
      <Music4 className="h-4 w-4" />
      ویرایشگر نت‌نگار {noteCount > 0 ? `(${noteCount} نت)` : ""}
    </Button>
  );
}
