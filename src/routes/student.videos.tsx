import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  PlayCircle,
  X,
  Loader2,
  Filter,
  Search,
  Eye,
  Clock,
  Video as VideoIcon,
  BookOpen,
  Sparkles,
  Volume2,
  GraduationCap,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { getCurrentStudent, type CurrentStudent } from "@/lib/student-utils";
import { resolveVideoStorageReference } from "@/features/videos/storage/video-storage";
import { TrackedVideoPlayer } from "@/features/videos/progress/tracked-video-player";
import {
  formatWatchTime,
  loadMyVideoProgress,
  type VideoProgressRow,
} from "@/features/videos/progress/video-progress-api";

export const Route = createFileRoute("/student/videos")({
  head: () => ({
    meta: [
      { title: "دارالقرآن ٱلوالدین — ویدیوها" },
      { name: "description", content: "ویدیوهای آموزشی" },
    ],
  }),
  component: StudentVideos,
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(input: string | number | null | undefined): string {
  if (input == null) return "—";
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

interface Video {
  id: string;
  title: string;
  description: string | null;
  class_id: number | null;
  video_url: string;
  resolved_video_url: string;
  thumbnail_url: string | null;
  resolved_thumbnail_url: string;
  duration: string | null;
  source_type: "upload" | "link" | string;
  locked: boolean;
  views: number;
  tags: string[] | null;
  scheduled_at: string | null;
  sort_order: number | null;
  is_sample_recitation: boolean | null;
  related_surah: string | null;
  related_ayah: string | null;
  created_at: string;
  progress: VideoProgressRow | null;
}

const LEVEL_LABELS: Record<string, string> = {
  "مقدماتی": "مقدماتی",
  "متوسط": "متوسط",
  "پیشرفته": "پیشرفته",
  "حفظ": "حفظ",
  "تجوید": "تجوید",
  "صوت و لحن": "صوت و لحن",
};

function videoLevel(video: Video): string | null {
  return (video.tags ?? []).find((tag) => tag in LEVEL_LABELS) ?? null;
}

function videoCategory(video: Video): string | null {
  const tagged = (video.tags ?? []).find((tag) => !(tag in LEVEL_LABELS));
  if (tagged) return tagged;
  return video.is_sample_recitation ? "نمونه تلاوت" : null;
}

const CATEGORY_ICONS: Record<string, ReactNode> = {
  "حفظ": <BookOpen className="h-4 w-4" />,
  "تجوید": <Sparkles className="h-4 w-4" />,
  "صوت و لحن": <Volume2 className="h-4 w-4" />,
  "روخوانی": <BookOpen className="h-4 w-4" />,
  "روان‌خوانی": <Volume2 className="h-4 w-4" />,
  default: <GraduationCap className="h-4 w-4" />,
};

function StudentVideos() {
  const [student, setStudent] = useState<CurrentStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<Video[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await getCurrentStudent();
        setStudent(s);
        await loadVideos();
      } catch (err) {
        console.error("[student videos] خطا:", err);
      }
      setLoading(false);
    })();
  }, []);

  async function loadVideos() {
    const { data, error } = await supabase
      .from("videos")
      .select(
        "id, title, description, class_id, video_url, thumbnail_url, duration, source_type, locked, views, tags, scheduled_at, sort_order, is_sample_recitation, related_surah, related_ayah, created_at",
      )
      .eq("locked", false)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[student videos] خطا:", error);
      setVideos([]);
      return;
    }

    let progressByVideo = new Map<number, VideoProgressRow>();
    try {
      progressByVideo = await loadMyVideoProgress((data ?? []).map((row) => row.id));
    } catch (progressError) {
      console.warn("[student videos] دریافت پیشرفت ناموفق:", progressError);
    }

    const resolved = await Promise.all(
      (data ?? []).map(async (row) => ({
        ...row,
        id: String(row.id),
        resolved_video_url: await resolveVideoStorageReference(row.video_url),
        resolved_thumbnail_url: await resolveVideoStorageReference(row.thumbnail_url),
        progress: progressByVideo.get(Number(row.id)) ?? null,
      })),
    );
    setVideos(resolved as Video[]);
  }

  const updateVideoProgress = useCallback((progress: VideoProgressRow) => {
    setVideos((current) =>
      current.map((item) =>
        Number(item.id) === progress.video_id ? { ...item, progress } : item,
      ),
    );
    setSelectedVideo((current) =>
      current && Number(current.id) === progress.video_id ? { ...current, progress } : current,
    );
  }, []);

  function playVideo(video: Video) {
    // بازکردن Dialog به‌تنهایی View محسوب نمی‌شود؛ شمارنده با اولین Play واقعی افزایش می‌یابد.
    setSelectedVideo(video);
  }

  const updateVideoViews = useCallback((videoId: string, views: number) => {
    setVideos((current) =>
      current.map((item) => (item.id === videoId ? { ...item, views } : item)),
    );
    setSelectedVideo((current) =>
      current?.id === videoId ? { ...current, views } : current,
    );
  }, []);

  // مقادیر یکتا برای فیلترها
  const levels = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((video) => {
      const level = videoLevel(video);
      if (level) set.add(level);
    });
    return Array.from(set);
  }, [videos]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((video) => {
      const category = videoCategory(video);
      if (category) set.add(category);
    });
    return Array.from(set);
  }, [videos]);

  // فیلتر
  const filtered = useMemo(() => {
    return videos.filter((video) => {
      const level = videoLevel(video);
      const category = videoCategory(video);
      if (filterLevel !== "all" && level !== filterLevel) return false;
      if (filterCategory !== "all" && category !== filterCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        return (
          video.title.includes(q) ||
          (video.description ?? "").includes(q) ||
          (category ?? "").includes(q) ||
          (video.related_surah ?? "").includes(q)
        );
      }
      return true;
    });
  }, [videos, filterLevel, filterCategory, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری...</span>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="ویدیوهای آموزشی"
        description={
          student
            ? `ویدیوهای مناسب ${student.name}`
            : "ویدیوهای آموزشی"
        }
      />

      {/* آمار */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SimpleStat
          label="کل ویدیوها"
          value={videos.length}
          color="primary"
          icon={<VideoIcon />}
        />
        <SimpleStat
          label="قابل مشاهده"
          value={videos.length}
          color="emerald"
          icon={<PlayCircle />}
        />
        <SimpleStat
          label="نمونه‌های تلاوت"
          value={videos.filter((video) => video.is_sample_recitation).length}
          color="blue"
          icon={<BookOpen />}
        />
        <SimpleStat
          label="کل بازدیدها"
          value={videos.reduce((sum, v) => sum + (v.views ?? 0), 0)}
          color="amber"
          icon={<Eye />}
        />
      </div>

      {/* فیلترها */}
      {videos.length > 0 && (
        <Card className="p-3 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="جستجو در ویدیوها..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger>
                <SelectValue placeholder="سطح" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه سطوح</SelectItem>
                {levels.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LEVEL_LABELS[l] ?? l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterCategory}
              onValueChange={setFilterCategory}
            >
              <SelectTrigger>
                <SelectValue placeholder="دسته" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه دسته‌ها</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      {/* لیست ویدیوها */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <VideoIcon className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-display text-lg mb-1">
            {videos.length === 0
              ? "هنوز ویدیویی اضافه نشده است"
              : "ویدیویی با این فیلتر یافت نشد"}
          </h3>
          <p className="text-sm text-muted-foreground">
            به زودی ویدیوهای آموزشی جدید اضافه خواهند شد.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onClick={() => playVideo(v)}
            />
          ))}
        </div>
      )}

      {/* دیالوگ پخش ویدیو */}
      <Dialog
        open={!!selectedVideo}
        onOpenChange={(o) => !o && setSelectedVideo(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {selectedVideo && (
            <>
              <DialogHeader className="p-4 pb-2">
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {selectedVideo.title}
                </DialogTitle>
              </DialogHeader>

              {/* پخش‌کنندهٔ قابل رهگیری؛ آپارات در صورت دسترسی API به فایل مستقیم تبدیل می‌شود. */}
              <TrackedVideoPlayer
                videoId={selectedVideo.id}
                originalUrl={selectedVideo.video_url}
                resolvedUrl={selectedVideo.resolved_video_url}
                sourceType={selectedVideo.source_type}
                posterUrl={selectedVideo.resolved_thumbnail_url}
                initialProgress={selectedVideo.progress}
                onProgress={updateVideoProgress}
                onViewCounted={(views) => updateVideoViews(selectedVideo.id, views)}
              />

              {/* اطلاعات */}
              <div className="p-4 space-y-2 overflow-y-auto">
                {selectedVideo.description && (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {selectedVideo.description}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {videoLevel(selectedVideo) && (
                    <Badge variant="outline">
                      {LEVEL_LABELS[videoLevel(selectedVideo)!] ?? videoLevel(selectedVideo)}
                    </Badge>
                  )}
                  {videoCategory(selectedVideo) && (
                    <Badge variant="outline" className="gap-1">
                      {CATEGORY_ICONS[videoCategory(selectedVideo)!] ?? CATEGORY_ICONS.default}
                      {videoCategory(selectedVideo)}
                    </Badge>
                  )}
                  {selectedVideo.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {selectedVideo.duration}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {toFa(selectedVideo.views)} بازدید
                  </span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function VideoCard({
  video,
  onClick,
}: {
  video: Video;
  onClick: () => void;
}) {
  const level = videoLevel(video);
  const category = videoCategory(video);
  const categoryIcon = (category && CATEGORY_ICONS[category]) ?? CATEGORY_ICONS.default;

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-soft transition group"
      onClick={onClick}
    >
      {/* تصویر بندانگشتی */}
      <div className="relative aspect-video bg-gradient-to-br from-primary/20 to-gold/20 overflow-hidden">
        {video.resolved_thumbnail_url ? (
          <img
            src={video.resolved_thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <VideoIcon className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}
        {/* دکمه پخش */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
          <div className="bg-white/90 rounded-full p-3">
            <PlayCircle className="h-10 w-10 text-primary" />
          </div>
        </div>
        {/* مدت زمان */}
        {video.duration && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
            <Clock className="h-3 w-3 inline ml-1" />
            {video.duration}
          </div>
        )}
        {video.is_sample_recitation && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-amber-500 text-white border-0 gap-1">
              <Sparkles className="h-3 w-3" />
              نمونه تلاوت
            </Badge>
          </div>
        )}
      </div>

      {/* محتوا */}
      <div className="p-3">
        <h3 className="font-display text-sm leading-tight line-clamp-2 mb-2">
          {video.title}
        </h3>
        <div className="mb-3 rounded-xl bg-secondary/35 p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>
              {video.progress
                ? video.progress.completed_at
                  ? "تکمیل‌شده"
                  : video.progress.percent > 0
                    ? `ادامه از ${formatWatchTime(video.progress.last_position_seconds)}`
                    : "بازشده"
                : "شروع‌نشده"}
            </span>
            <span className="font-bold text-foreground">
              {toFa(Math.round(video.progress?.percent ?? 0))}٪
            </span>
          </div>
          <Progress value={video.progress?.percent ?? 0} />
          {video.progress && video.progress.watched_seconds > 0 && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              زمان تماشای فعال: {toFa(formatWatchTime(video.progress.watched_seconds))}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
          {level && (
            <Badge variant="outline" className="text-[10px] py-0">
              {LEVEL_LABELS[level] ?? level}
            </Badge>
          )}
          {category && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 gap-1"
            >
              {categoryIcon}
              {category}
            </Badge>
          )}
          <span className="text-muted-foreground flex items-center gap-1 mr-auto">
            <Eye className="h-3 w-3" />
            {toFa(video.views)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function SimpleStat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: "primary" | "emerald" | "blue" | "amber";
  icon: ReactNode;
}) {
  const colors = {
    primary: "text-primary bg-primary/5 border-primary/20",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
  }[color];

  return (
    <Card className={`p-3 border ${colors}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs opacity-80 mb-0.5">{label}</div>
          <div className="font-display text-xl">{toFa(value)}</div>
        </div>
        <div className={`rounded-lg p-2 ${colors}`}>{icon}</div>
      </div>
    </Card>
  );
}


