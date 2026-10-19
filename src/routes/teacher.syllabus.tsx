import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClassSyllabusPanel } from "@/features/syllabus/class-syllabus-panel";
import { supabase } from "@/lib/supabase";
import { getCurrentTeacher } from "@/lib/teacher-utils";

export const Route = createFileRoute("/teacher/syllabus")({
  head: () => ({
    meta: [
      { title: "برنامه آموزشی کلاس‌های من — استاد" },
      { name: "description", content: "مدیریت سرفصل کلاس‌های تخصیص‌یافته" },
    ],
  }),
  component: TeacherSyllabus,
});

interface ClassOption {
  id: number;
  name: string;
  level: string | null;
}

function TeacherSyllabus() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    silent ? setRefreshing(true) : setLoading(true);
    const teacher = await getCurrentTeacher();
    if (!teacher) {
      setClasses([]);
      setLoading(false);
      setRefreshing(false);
      toast.error("پروفایل فعال استاد یافت نشد");
      return;
    }
    const { data, error } = await supabase
      .from("classes")
      .select("id, name, level")
      .eq("teacher_id", teacher.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name");
    if (error) {
      toast.error(error.message);
      setClasses([]);
    } else {
      const rows = (data ?? []).map((item) => ({
        id: Number(item.id),
        name: String(item.name ?? "بدون نام"),
        level: item.level == null ? null : String(item.level),
      }));
      setClasses(rows);
      setClassId((current) =>
        current && rows.some((item) => String(item.id) === current)
          ? current
          : String(rows[0]?.id ?? ""),
      );
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = classes.find((item) => String(item.id) === classId) ?? null;

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">در حال دریافت کلاس‌های شما...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="برنامه آموزشی کلاس‌های من"
        description="سرفصل را تعریف کنید و وضعیت واقعی اجرای آن را ثبت کنید"
        actions={
          <Button variant="outline" disabled={refreshing} onClick={() => void load(true)}>
            <RefreshCw className={`ml-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            تازه‌سازی
          </Button>
        }
      />
      <Card className="rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_2fr] md:items-center">
          <div className="flex items-center gap-2 font-bold">
            <BookOpen className="h-5 w-5 text-primary" /> انتخاب کلاس
          </div>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger>
            <SelectContent>
              {classes.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.name} — {item.level ?? "بدون سطح"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {selected ? (
        <ClassSyllabusPanel classId={selected.id} canManage title={`برنامه آموزشی ${selected.name}`} />
      ) : (
        <Card className="rounded-3xl border-dashed p-12 text-center text-muted-foreground">
          کلاس فعالی برای شما ثبت نشده است.
        </Card>
      )}
    </div>
  );
}
