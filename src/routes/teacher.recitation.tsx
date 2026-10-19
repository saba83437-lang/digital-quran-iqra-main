import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileAudio, Loader2, Send, XCircle, Users, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import {
  listPublishedPassages,
  listMyAssignments,
  assignPassage,
  cancelAssignment,
  getClassAttempts,
} from "@/features/recitation/api/recitation-teacher-api";
import { getClasses } from "@/lib/database";
import {
  ASSIGNMENT_TYPE_LABELS,
  DIFFICULTY_LABELS,
  type RecitationAssignment,
  type RecitationPassage,
  type TeacherClassAttemptRow,
} from "@/features/recitation/domain/recitation-types";

export const Route = createFileRoute("/teacher/recitation")({
  component: TeacherRecitationPage,
});

interface ClassRow {
  id: number;
  name: string;
}

function TeacherRecitationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black flex items-center gap-3">
          <FileAudio className="h-8 w-8 text-primary" />
          چالش تقلید هوشمند
        </h1>
        <p className="text-muted-foreground mt-1">
          فرازهای منتشرشده را برای کلاس‌های خود انتخاب کنید و نتیجه تمرین قرآن‌آموزان را ببینید.
        </p>
      </div>

      <Tabs defaultValue="assign" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="assign">تخصیص فراز</TabsTrigger>
          <TabsTrigger value="list">تکالیف من</TabsTrigger>
          <TabsTrigger value="results">نتایج کلاس</TabsTrigger>
        </TabsList>

        <TabsContent value="assign">
          <PublishedPassagesTab />
        </TabsContent>
        <TabsContent value="list">
          <MyAssignmentsTab />
        </TabsContent>
        <TabsContent value="results">
          <ClassResultsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- تب ۱: فرازهای منتشرشده + تخصیص ---------------- */
function PublishedPassagesTab() {
  const [passages, setPassages] = useState<RecitationPassage[]>([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [assignTarget, setAssignTarget] = useState<RecitationPassage | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [ps, cs] = await Promise.all([listPublishedPassages(), getClasses()]);
        setPassages(ps);
        setClasses((cs as ClassRow[]).filter((c) => typeof c.id === "number"));
      } catch {
        toast.error("خطا در بارگذاری فرازها");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {passages.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            هنوز فرازی توسط مدیر منتشر نشده است.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {passages.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{p.title}</CardTitle>
              <div className="text-sm text-muted-foreground">
                {p.reciter}
                {p.surah ? ` • ${p.surah}` : ""}
                {p.ayah_start ? ` • آیات ${p.ayah_start} تا ${p.ayah_end ?? p.ayah_start}` : ""}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{DIFFICULTY_LABELS[p.difficulty]}</Badge>
                {p.maqam_primary && <Badge variant="outline">{p.maqam_primary}</Badge>}
              </div>
              <Dialog
                open={assignTarget?.id === p.id}
                onOpenChange={(open) => !open && setAssignTarget(null)}
              >
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setAssignTarget(p)}
                  >
                    <Send className="h-4 w-4" />
                    تخصیص به کلاس
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>تخصیص «{p.title}» به کلاس</DialogTitle>
                  </DialogHeader>
                  {assignTarget && (
                    <AssignDialogBody
                      passage={assignTarget}
                      classes={classes}
                      onDone={() => setAssignTarget(null)}
                    />
                  )}
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AssignDialogBody({
  passage,
  classes,
  onDone,
}: {
  passage: RecitationPassage;
  classes: ClassRow[];
  onDone: () => void;
}) {
  const [classId, setClassId] = useState<string>("");
  const [title, setTitle] = useState(passage.title);
  const [type, setType] = useState("practice");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!classId) {
      toast.error("کلاس را انتخاب کنید");
      return;
    }
    setSaving(true);
    try {
      await assignPassage({
        passageId: passage.id,
        versionId: passage.current_version_id!,
        classId: parseInt(classId),
        title: title || passage.title,
        type,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      toast.success("فراز به کلاس تخصیص داده شد");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "خطا در تخصیص");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>کلاس *</Label>
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger>
            <SelectValue placeholder="انتخاب کلاس..." />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>عنوان تخصیص</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label>نوع تخصیص</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="practice">تمرین</SelectItem>
            <SelectItem value="homework">تکلیف</SelectItem>
            <SelectItem value="daily_challenge">چالش روزانه</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>مهلت (اختیاری)</Label>
        <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </div>
      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? "در حال ثبت..." : "تخصیص فراز"}
      </Button>
    </div>
  );
}

/* ---------------- تب ۲: تخصیص‌های من ---------------- */
function MyAssignmentsTab() {
  const [assignments, setAssignments] = useState<RecitationAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setAssignments(await listMyAssignments());
    } catch {
      toast.error("خطا در بارگذاری تخصیص‌ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const cancel = async (id: string) => {
    if (!confirm("این تخصیص لغو شود؟")) return;
    try {
      await cancelAssignment(id);
      toast.success("تخصیص لغو شد");
      void load();
    } catch (e: any) {
      toast.error(e?.message || "خطا");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {assignments.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">هنوز تخصیصی ثبت نکرده‌اید.</p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3">
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {ASSIGNMENT_TYPE_LABELS[a.assignment_type]}
                    {a.due_at ? ` • مهلت: ${new Date(a.due_at).toLocaleDateString("fa-IR")}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.is_active ? (
                    <Badge variant="secondary">فعال</Badge>
                  ) : (
                    <Badge variant="outline">لغو شده</Badge>
                  )}
                  {a.is_active && (
                    <Button size="sm" variant="outline" onClick={() => void cancel(a.id)}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- تب ۳: نتایج کلاس ---------------- */
function ClassResultsTab() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [rows, setRows] = useState<TeacherClassAttemptRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getClasses().then((cs) => setClasses((cs as ClassRow[]).filter((c) => typeof c.id === "number")));
  }, []);

  const loadResults = async () => {
    if (!classId) return;
    setLoading(true);
    try {
      setRows(await getClassAttempts(parseInt(classId)));
    } catch (e: any) {
      toast.error(e?.message || "خطا در دریافت نتایج");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-52">
          <Label>کلاس</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب کلاس..." />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={loadResults} disabled={!classId || loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
          نمایش نتایج
        </Button>
      </div>

      {rows.length > 0 && (
        <Card>
          <CardContent className="pt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-right text-muted-foreground">
                  <th className="py-2">قرآن‌آموز</th>
                  <th className="py-2">فراز</th>
                  <th className="py-2">امتیاز</th>
                  <th className="py-2">ستاره</th>
                  <th className="py-2">XP</th>
                  <th className="py-2">سکه</th>
                  <th className="py-2">مدت</th>
                  <th className="py-2">زمان</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.attempt_id} className="border-b last:border-0">
                    <td className="py-2">{r.student_name}</td>
                    <td className="py-2 text-muted-foreground">{r.passage_title}</td>
                    <td className="py-2 font-bold">
                      {r.total_score !== null ? r.total_score : "—"}
                    </td>
                    <td className="py-2">
                      <StarRow count={r.stars} />
                    </td>
                    <td className="py-2">+{r.xp_awarded}</td>
                    <td className="py-2">+{r.coins_awarded}</td>
                    <td className="py-2">
                      {r.duration_ms ? `${Math.round(r.duration_ms / 1000)} ثانیه` : "—"}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {r.completed_at ? new Date(r.completed_at).toLocaleDateString("fa-IR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StarRow({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5 text-amber-500">
      {[1, 2, 3].map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= count ? "fill-amber-500" : "opacity-25"}`} />
      ))}
    </span>
  );
}
