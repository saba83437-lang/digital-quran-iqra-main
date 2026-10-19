import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TrendingUp, Loader2, Star, Trophy, Wallet, Clock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  getChildrenSummary,
  getChildGamification,
  getChildAttempts,
} from "@/features/recitation/api/recitation-parent-api";
import type {
  ParentChildSummary,
  RecitationAttempt,
  StudentGamification,
} from "@/features/recitation/domain/recitation-types";

export const Route = createFileRoute("/parent/imitation")({
  component: ParentImitationPage,
});

function ParentImitationPage() {
  const [children, setChildren] = useState<ParentChildSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [gamification, setGamification] = useState<StudentGamification | null>(null);
  const [attempts, setAttempts] = useState<RecitationAttempt[]>([]);
  const [childError, setChildError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadChildren();
  }, []);

  const loadChildren = async () => {
    try {
      const data = await getChildrenSummary();
      setChildren(data);
      if (data.length > 0) setSelectedId(String(data[0].student_id));
    } catch {
      toast.error("خطا در بارگذاری پیشرفت فرزندان");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    void (async () => {
      try {
        const sid = parseInt(selectedId);
        const [g, a] = await Promise.allSettled([getChildGamification(sid), getChildAttempts(sid)]);
        if (g.status === "fulfilled") setGamification(g.value);
        if (a.status === "fulfilled") setAttempts(a.value);
        const failed = [g, a].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
        if (failed.length > 0) {
          const messages = failed.map((f) => {
            const e = f.reason as any;
            return e?.message || e?.error_description || String(e);
          });
          console.error("خطاهای بارگذاری فرزند:", messages, failed.map((f) => f.reason));
          setChildError(messages.join(" | "));
        } else {
          setChildError(null);
        }
      } catch (e: any) {
        toast.error("خطا در بارگذاری اطلاعات فرزند");
        setChildError(e?.message || String(e));
      }
    })();
  }, [selectedId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-muted-foreground">
          هنوز فرزندی به حساب شما متصل نیست.
        </CardContent>
      </Card>
    );
  }

  const selected = children.find((c) => String(c.student_id) === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-primary" />
          پیشرفت تقلید فرزندان
        </h1>
        <p className="text-muted-foreground mt-1">
          تمرین‌های چالش تقلید هوشمند فرزند خود را دنبال کنید.
        </p>
      </div>

      {/* نمایش خطای واقعی (برای رفع سریع مشکل) */}
      {childError && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <b>خطا در برخی بخش‌ها:</b> {childError}
        </div>
      )}

      {/* انتخاب فرزند */}
      <div className="max-w-xs">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="انتخاب فرزند..." />
          </SelectTrigger>
          <SelectContent>
            {children.map((c) => (
              <SelectItem key={c.student_id} value={String(c.student_id)}>
                {c.student_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* کارت‌های خلاصه */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <SummaryCard
          icon={<Trophy className="h-5 w-5 text-sky-500" />}
          label="مجموع XP"
          value={String(gamification?.total_xp ?? selected?.total_xp ?? 0)}
        />
        <SummaryCard
          icon={<Wallet className="h-5 w-5 text-yellow-600" />}
          label="مجموع سکه"
          value={String(gamification?.total_coins ?? selected?.total_coins ?? 0)}
        />
        <SummaryCard
          icon={<Star className="h-5 w-5 text-amber-500" />}
          label="میانگین امتیاز"
          value={String(gamification?.avg_score ?? selected?.avg_score ?? 0)}
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5 text-emerald-600" />}
          label="زمان تمرین (دقیقه)"
          value={String(selected?.practice_minutes ?? 0)}
        />
      </div>

      {/* خلاصه همه فرزندان */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">خلاصه همه فرزندان</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right text-muted-foreground">
                <th className="py-2">نام</th>
                <th className="py-2">تعداد تمرین</th>
                <th className="py-2">میانگین امتیاز</th>
                <th className="py-2">XP</th>
                <th className="py-2">سکه</th>
                <th className="py-2">دقیقه تمرین</th>
              </tr>
            </thead>
            <tbody>
              {children.map((c) => (
                <tr key={c.student_id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{c.student_name}</td>
                  <td className="py-2">{c.attempts}</td>
                  <td className="py-2">{c.avg_score}</td>
                  <td className="py-2">+{c.total_xp}</td>
                  <td className="py-2">+{c.total_coins}</td>
                  <td className="py-2">{c.practice_minutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* آخرین تمرین‌های فرزند انتخاب‌شده */}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">آخرین تمرین‌های {selected.student_name}</CardTitle>
          </CardHeader>
          <CardContent>
            {attempts.filter((a) => a.completed_at).length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">
                هنوز تمرین کاملی ثبت نشده است.
              </p>
            ) : (
              <div className="space-y-2">
                {attempts
                  .filter((a) => a.completed_at)
                  .slice(0, 10)
                  .map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">فراز تمرین</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(a.completed_at!).toLocaleString("fa-IR")} •{" "}
                          {a.duration_ms ? `${Math.round(a.duration_ms / 1000)} ثانیه` : "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">امتیاز: {a.total_score ?? "—"}</Badge>
                        <span className="flex gap-0.5 text-amber-500">
                          {[1, 2, 3].map((i) => (
                            <Star key={i} className={`h-4 w-4 ${i <= a.stars ? "fill-amber-500" : "opacity-25"}`} />
                          ))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          +{a.xp_awarded} XP • +{a.coins_awarded} سکه
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground">
        امتیاز دقیق و تحلیل صوتی هر تمرین در فازهای بعدی (تحلیل هوشمند صوت) اضافه می‌شود.
        <Button variant="link" size="sm" className="px-0 h-auto text-xs" onClick={() => void loadChildren()}>
          به‌روزرسانی
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-1">{icon}</div>
        <div className="text-2xl font-black">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}
