import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Target,
  Loader2,
  Play,
  Star,
  Flame,
  Wallet,
  Trophy,
  History,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  listMyAssignments,
  getTodayChallenge,
  listPublishedPassages,
  getMyAttempts,
  getMyGamification,
} from "@/features/recitation/api/recitation-student-api";
import {
  ASSIGNMENT_TYPE_LABELS,
  DIFFICULTY_LABELS,
  type RecitationAssignment,
  type RecitationDailyChallenge,
  type RecitationPassage,
  type RecitationAttempt,
  type StudentGamification,
} from "@/features/recitation/domain/recitation-types";

export const Route = createFileRoute("/student/imitation")({
  component: StudentImitationPage,
});

function StudentImitationPage() {
  const [assignments, setAssignments] = useState<RecitationAssignment[]>([]);
  const [challenge, setChallenge] = useState<RecitationDailyChallenge | null>(null);
  const [freePassages, setFreePassages] = useState<RecitationPassage[]>([]);
  const [attempts, setAttempts] = useState<RecitationAttempt[]>([]);
  const [gamification, setGamification] = useState<StudentGamification | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        // با allSettled: اگر یکی از درخواست‌ها خطا داد، بقیه صفحه خراب نمی‌شود
        const [as, ch, fp, at, gm] = await Promise.allSettled([
          listMyAssignments(),
          getTodayChallenge(),
          listPublishedPassages(),
          getMyAttempts(),
          getMyGamification(),
        ]);
        if (as.status === "fulfilled") setAssignments(as.value);
        if (ch.status === "fulfilled") setChallenge(ch.value);
        if (fp.status === "fulfilled") setFreePassages(fp.value);
        if (at.status === "fulfilled") setAttempts(at.value);
        if (gm.status === "fulfilled") setGamification(gm.value);

        const failed = [as, ch, fp, at, gm].filter(
          (r) => r.status === "rejected",
        ) as PromiseRejectedResult[];
        if (failed.length > 0) {
          // نمایش پیام واقعی خطا — برای پیدا کردن سریع ریشه مشکل
          const messages = failed.map((f) => {
            const e = f.reason as any;
            return e?.message || e?.error_description || String(e);
          });
          console.error("خطاهای چالش تقلید:", messages, failed.map((f) => f.reason));
          setLoadError(messages.join(" | "));
        }
      } catch (e: any) {
        toast.error("خطا در بارگذاری چالش تقلید");
        setLoadError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const doneAttempts = attempts.filter((a) => a.completed_at);
  const bestScore = doneAttempts.reduce((best, a) => Math.max(best, a.total_score ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* نمایش خطای واقعی (برای رفع سریع مشکل) */}
      {loadError && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <b>خطا در برخی بخش‌ها:</b> {loadError}
        </div>
      )}

      {/* سربرگ */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 text-white p-6 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(#fff_0.8px,transparent_1px)] bg-[length:4px_4px] opacity-10" />
        <div className="relative">
          <h1 className="font-display text-3xl font-black flex items-center gap-3">
            <Target className="h-8 w-8 text-emerald-300" />
            چالش تقلید هوشمند
          </h1>
          <p className="mt-2 text-emerald-100/80 max-w-xl">
            صدای قاری را گوش کن، با دقت تقلید کن و در مسیر نورانی ملودی به پیش برو. هر چه دقیق‌تر
            بخوانی، ستاره و سکه بیشتری می‌گیری!
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            {gamification && (
              <>
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2">
                  <Trophy className="h-5 w-5 text-amber-300" />
                  <span className="font-bold">{gamification.total_xp}</span>
                  <span className="text-xs text-emerald-100/70">XP</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2">
                  <Wallet className="h-5 w-5 text-yellow-300" />
                  <span className="font-bold">{gamification.total_coins}</span>
                  <span className="text-xs text-emerald-100/70">سکه</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2">
                  <Star className="h-5 w-5 text-emerald-300" />
                  <span className="font-bold">{bestScore || "—"}</span>
                  <span className="text-xs text-emerald-100/70">بهترین امتیاز</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2">
                  <History className="h-5 w-5 text-sky-300" />
                  <span className="font-bold">{doneAttempts.length}</span>
                  <span className="text-xs text-emerald-100/70">تمرین انجام‌شده</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* چالش روزانه */}
      {challenge && (
        <DailyChallengeBanner challenge={challenge} />
      )}

      {/* تکالیف من */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          تکالیف من
        </h2>
        {assignments.filter((a) => a.is_active).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              استاد هنوز تکلیفی برای کلاس شما ثبت نکرده است.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {assignments
              .filter((a) => a.is_active)
              .map((a) => (
                <Card key={a.id} className="hover:border-primary/50 transition">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{a.title}</CardTitle>
                    <Badge className="w-fit">{ASSIGNMENT_TYPE_LABELS[a.assignment_type]}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {a.due_at && (
                      <div className="text-xs text-muted-foreground">
                        مهلت: {new Date(a.due_at).toLocaleDateString("fa-IR")}
                      </div>
                    )}
                    <Button asChild size="sm" className="w-full gap-2">
                      <Link to="/student/imitation/$assignmentId" params={{ assignmentId: a.id }}>
                        <Play className="h-4 w-4" />
                        شروع تمرین
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </section>

      {/* تمرین آزاد */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">تمرین آزاد</h2>
        {freePassages.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              هنوز فرازی برای تمرین آزاد منتشر نشده است.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {freePassages.map((p) => (
              <Card key={p.id} className="hover:border-primary/50 transition">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{p.title}</CardTitle>
                  <div className="text-sm text-muted-foreground">
                    {p.reciter}
                    {p.surah ? ` • ${p.surah}` : ""}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{DIFFICULTY_LABELS[p.difficulty]}</Badge>
                    {p.maqam_primary && <Badge variant="outline">{p.maqam_primary}</Badge>}
                  </div>
                  <Button asChild size="sm" variant="outline" className="w-full gap-2">
                    <Link to="/student/imitation/$assignmentId" params={{ assignmentId: `passage-${p.id}` }}>
                      <Play className="h-4 w-4" />
                      تمرین آزاد
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* تاریخچه من */}
      {doneAttempts.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            تاریخچه تمرین‌ها
          </h2>
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-muted-foreground">
                    <th className="py-2">فراز</th>
                    <th className="py-2">امتیاز</th>
                    <th className="py-2">ستاره</th>
                    <th className="py-2">XP</th>
                    <th className="py-2">سکه</th>
                    <th className="py-2">تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {doneAttempts.slice(0, 15).map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2">{passageTitle(a.passage_id, freePassages)}</td>
                      <td className="py-2 font-bold">{a.total_score ?? "—"}</td>
                      <td className="py-2">
                        <span className="flex gap-0.5 text-amber-500">
                          {[1, 2, 3].map((i) => (
                            <Star key={i} className={`h-4 w-4 ${i <= a.stars ? "fill-amber-500" : "opacity-25"}`} />
                          ))}
                        </span>
                      </td>
                      <td className="py-2">+{a.xp_awarded}</td>
                      <td className="py-2">+{a.coins_awarded}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {new Date(a.completed_at!).toLocaleDateString("fa-IR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

function passageTitle(passageId: string, passages: RecitationPassage[]): string {
  return passages.find((p) => p.id === passageId)?.title ?? "فراز";
}

function DailyChallengeBanner({ challenge }: { challenge: RecitationDailyChallenge }) {
  const [passage, setPassage] = useState<RecitationPassage | null>(null);

  useEffect(() => {
    void import("@/features/recitation/api/recitation-student-api")
      .then((api) => api.getPublishedPassage(challenge.passage_id))
      .then(setPassage)
      .catch(() => undefined);
  }, [challenge.passage_id]);

  return (
    <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-l from-amber-50 to-orange-50 p-5 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-amber-500/15 flex items-center justify-center">
          <Flame className="h-7 w-7 text-amber-600" />
        </div>
        <div>
          <div className="font-display font-bold text-lg">چالش روزانه امروز</div>
          <div className="text-sm text-muted-foreground">
            {passage ? (
              <>
                {passage.title} — {passage.reciter}
                {passage.maqam_primary ? ` • مقام ${passage.maqam_primary}` : ""}
              </>
            ) : (
              "در حال بارگذاری..."
            )}
          </div>
        </div>
      </div>
      <Button asChild className="gap-2">
        <Link to="/student/imitation/$assignmentId" params={{ assignmentId: "daily" }}>
          <Play className="h-4 w-4" />
          شرکت در چالش
        </Link>
      </Button>
    </div>
  );
}
