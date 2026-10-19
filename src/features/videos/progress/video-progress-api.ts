import { supabase } from "@/lib/supabase";

export interface VideoProgressRow {
  video_id: number;
  student_id?: number;
  watched_seconds: number;
  percent: number;
  last_position_seconds: number;
  duration_seconds: number | null;
  last_watched_at: string;
  completed_at: string | null;
}

export interface VideoProgressUpdateResult {
  progress: VideoProgressRow;
  viewCounted: boolean;
  views: number | null;
  sessionActiveWatchedSeconds: number;
}

function normalize(row: Record<string, unknown>): VideoProgressRow {
  return {
    video_id: Number(row.video_id),
    student_id: row.student_id == null ? undefined : Number(row.student_id),
    watched_seconds: Number(row.watched_seconds ?? 0),
    percent: Number(row.percent ?? 0),
    last_position_seconds: Number(row.last_position_seconds ?? 0),
    duration_seconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    last_watched_at: String(row.last_watched_at ?? ""),
    completed_at: row.completed_at == null ? null : String(row.completed_at),
  };
}

export async function loadMyVideoProgress(videoIds: Array<string | number>) {
  const ids = [...new Set(videoIds.map(Number).filter(Number.isFinite))];
  if (ids.length === 0) return new Map<number, VideoProgressRow>();
  const { data, error } = await supabase
    .from("video_watch_progress")
    .select(
      "video_id, watched_seconds, percent, last_position_seconds, duration_seconds, last_watched_at, completed_at",
    )
    .in("video_id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((row) => {
      const progress = normalize(row as Record<string, unknown>);
      return [progress.video_id, progress] as const;
    }),
  );
}

export async function updateMyVideoProgress(input: {
  videoId: string | number;
  playbackSessionId: string;
  positionSeconds: number;
  durationSeconds: number;
  watchedDelta?: number;
  completed?: boolean;
  sessionEnded?: boolean;
}): Promise<VideoProgressUpdateResult> {
  const { data, error } = await supabase.rpc("secure_update_video_progress_v2", {
    p_video_id: Number(input.videoId),
    p_playback_session_id: input.playbackSessionId,
    p_position_seconds: Math.max(0, Math.floor(input.positionSeconds)),
    p_duration_seconds: Math.max(1, Math.floor(input.durationSeconds)),
    p_watched_delta: Math.max(0, Math.floor(input.watchedDelta ?? 0)),
    p_completed: input.completed === true,
    p_session_ended: input.sessionEnded === true,
  });
  if (error) {
    if (/secure_update_video_progress_v2|schema cache|could not find/i.test(error.message)) {
      throw new Error("ثبت امن مشاهده ویدیو هنوز در Supabase فعال نشده است");
    }
    throw new Error(error.message);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    progress: normalize(result),
    viewCounted: result.view_counted === true,
    views: result.views == null ? null : Number(result.views),
    sessionActiveWatchedSeconds: Number(result.session_active_watched_seconds ?? 0),
  };
}

export function formatWatchTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}
