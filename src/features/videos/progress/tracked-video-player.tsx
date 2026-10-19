import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import {
  formatWatchTime,
  updateMyVideoProgress,
  type VideoProgressRow,
} from "./video-progress-api";
import { resolvePlayableVideoSource, type PlayableVideoSource } from "./video-source";

const MAX_WATCH_DELTA_PER_REQUEST = 15;
const SAVE_INTERVAL_SECONDS = 8;
const MEDIA_CLOCK_TOLERANCE_SECONDS = 1;

function newPlaybackSessionId(): string {
  return crypto.randomUUID();
}

function getResumePosition(progress?: VideoProgressRow | null): number | null {
  if (!progress) return null;
  const saved = Math.max(0, Math.floor(progress.last_position_seconds));
  if (saved <= 2) return null;
  if (progress.duration_seconds && saved >= progress.duration_seconds - 2) return null;
  return saved;
}

export function TrackedVideoPlayer({
  videoId,
  originalUrl,
  resolvedUrl,
  sourceType,
  posterUrl,
  initialProgress,
  onProgress,
  onViewCounted,
}: {
  videoId: string | number;
  originalUrl: string;
  resolvedUrl: string;
  sourceType: string;
  posterUrl?: string | null;
  initialProgress?: VideoProgressRow | null;
  onProgress: (progress: VideoProgressRow) => void;
  onViewCounted?: (views: number) => void;
}) {
  const openingResumeRef = useRef({
    videoId: String(videoId),
    position: getResumePosition(initialProgress),
  });
  if (openingResumeRef.current.videoId !== String(videoId)) {
    openingResumeRef.current = {
      videoId: String(videoId),
      position: getResumePosition(initialProgress),
    };
  }
  const resumePosition = openingResumeRef.current.position;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<PlayableVideoSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaReady, setMediaReady] = useState(false);
  const [awaitingPlaybackChoice, setAwaitingPlaybackChoice] = useState(resumePosition != null);
  const [progress, setProgress] = useState<VideoProgressRow | null>(initialProgress ?? null);
  const [, setSessionDisplayTick] = useState(0);
  const [sessionConfirmedWatched, setSessionConfirmedWatched] = useState(0);
  const [sessionQualified, setSessionQualified] = useState(false);
  const pendingWatchedRef = useRef(0);
  const inFlightWatchedRef = useRef(0);
  const lastMediaTimeRef = useRef<number | null>(null);
  const lastWallTimeRef = useRef<number | null>(null);
  const lastSavedPositionRef = useRef(initialProgress?.last_position_seconds ?? 0);
  const seekingRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const playbackSessionIdRef = useRef("");
  const playbackEndedRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const onProgressRef = useRef(onProgress);
  const onViewCountedRef = useRef(onViewCounted);

  onProgressRef.current = onProgress;
  onViewCountedRef.current = onViewCounted;

  useEffect(() => {
    mountedRef.current = true;
    playbackSessionIdRef.current = newPlaybackSessionId();
    playbackEndedRef.current = false;
    playbackStartedRef.current = false;
    setMediaReady(false);
    setAwaitingPlaybackChoice(resumePosition != null);
    setSessionConfirmedWatched(0);
    setSessionQualified(false);
    pendingWatchedRef.current = 0;
    inFlightWatchedRef.current = 0;
    lastMediaTimeRef.current = null;
    lastWallTimeRef.current = null;
    seekingRef.current = false;
    setLoading(true);

    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const accessToken = data.session?.access_token ?? "";
        if (!accessToken) throw new Error("نشست ورود معتبر نیست");
        return resolvePlayableVideoSource({
          videoId,
          accessToken,
          originalUrl,
          resolvedUrl,
          sourceType,
        });
      })
      .then((resolved) => {
        if (!mountedRef.current) return;
        setSource(resolved);
        setLoading(false);
      })
      .catch((error) => {
        console.error("prepare video source failed:", error);
        if (!mountedRef.current) return;
        setSource(null);
        setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [originalUrl, resolvedUrl, resumePosition, sourceType, videoId]);

  const resetMediaClock = useCallback(() => {
    const player = videoRef.current;
    lastMediaTimeRef.current = player?.currentTime ?? null;
    lastWallTimeRef.current = performance.now();
  }, []);

  const stopMediaClock = useCallback(() => {
    lastMediaTimeRef.current = null;
    lastWallTimeRef.current = null;
  }, []);

  const sampleActiveWatch = useCallback(
    (options?: { allowPaused?: boolean; allowHidden?: boolean }) => {
      const player = videoRef.current;
      if (!player || !Number.isFinite(player.currentTime)) return;

      const now = performance.now();
      const currentMediaTime = player.currentTime;
      const previousMediaTime = lastMediaTimeRef.current;
      const previousWallTime = lastWallTimeRef.current;

      lastMediaTimeRef.current = currentMediaTime;
      lastWallTimeRef.current = now;

      if (previousMediaTime == null || previousWallTime == null) return;
      if (seekingRef.current) return;
      if (player.paused && !options?.allowPaused) return;
      if (document.visibilityState === "hidden" && !options?.allowHidden) return;
      if (player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      const mediaDelta = currentMediaTime - previousMediaTime;
      const wallDelta = Math.max(0, (now - previousWallTime) / 1000);
      if (mediaDelta <= 0 || wallDelta <= 0) return;

      const playbackRate = Math.max(0.25, Math.min(player.playbackRate || 1, 16));
      const largestContinuousDelta = wallDelta * playbackRate + MEDIA_CLOCK_TOLERANCE_SECONDS;

      // A jump larger than real playback could have produced is a seek/discontinuity.
      if (mediaDelta > largestContinuousDelta) return;

      pendingWatchedRef.current += mediaDelta;
    },
    [],
  );

  const persist = useCallback(
    (completed = false, force = false, sessionEnded = false) => {
      const player = videoRef.current;
      if (
        !playbackStartedRef.current ||
        !player ||
        !Number.isFinite(player.duration) ||
        player.duration <= 0
      ) {
        return;
      }

      const currentPosition = Math.max(0, Math.floor(player.currentTime));
      const wholePending = Math.max(0, Math.floor(pendingWatchedRef.current));
      const positionChanged =
        Math.abs(currentPosition - lastSavedPositionRef.current) >= SAVE_INTERVAL_SECONDS;

      if (!force && !completed && wholePending < SAVE_INTERVAL_SECONDS && !positionChanged) {
        return;
      }

      const playbackSessionId =
        playbackSessionIdRef.current || (playbackSessionIdRef.current = newPlaybackSessionId());
      const durationSeconds = Math.max(1, Math.floor(player.duration));
      const deltas: number[] = [];
      let remaining = wholePending;

      while (remaining > 0) {
        const chunk = Math.min(remaining, MAX_WATCH_DELTA_PER_REQUEST);
        deltas.push(chunk);
        remaining -= chunk;
      }
      if (deltas.length === 0) deltas.push(0);

      // Keep the fractional remainder instead of discarding it on every save.
      pendingWatchedRef.current -= wholePending;
      inFlightWatchedRef.current += wholePending;
      lastSavedPositionRef.current = currentPosition;

      deltas.forEach((delta, index) => {
        const isLastChunk = index === deltas.length - 1;
        saveChainRef.current = saveChainRef.current.then(async () => {
          try {
            const result = await updateMyVideoProgress({
              videoId,
              playbackSessionId,
              positionSeconds: currentPosition,
              durationSeconds,
              watchedDelta: delta,
              completed: completed && isLastChunk,
              sessionEnded: sessionEnded && isLastChunk,
            });

            inFlightWatchedRef.current = Math.max(0, inFlightWatchedRef.current - delta);
            if (!mountedRef.current) return;
            setProgress(result.progress);
            if (playbackSessionIdRef.current === playbackSessionId) {
              setSessionConfirmedWatched(result.sessionActiveWatchedSeconds);
              const resultDuration = result.progress.duration_seconds ?? durationSeconds;
              setSessionQualified(
                result.sessionActiveWatchedSeconds >= Math.ceil(resultDuration * 0.5),
              );
            }
            onProgressRef.current(result.progress);
            if (result.viewCounted && result.views != null) {
              onViewCountedRef.current?.(result.views);
            }
          } catch (error) {
            inFlightWatchedRef.current = Math.max(0, inFlightWatchedRef.current - delta);
            if (playbackSessionIdRef.current === playbackSessionId) {
              pendingWatchedRef.current += delta;
              lastSavedPositionRef.current = -1_000_000;
            }
            if (mountedRef.current) {
              toast.error(error instanceof Error ? error.message : "ذخیره پیشرفت ویدیو ناموفق بود");
            }
          }
        });
      });
    },
    [videoId],
  );

  useEffect(() => {
    const visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        sampleActiveWatch({ allowHidden: true });
        stopMediaClock();
        persist(false, true, false);
      } else if (videoRef.current && !videoRef.current.paused) {
        resetMediaClock();
      }
    };

    document.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      document.removeEventListener("visibilitychange", visibilityHandler);
      sampleActiveWatch({ allowPaused: true, allowHidden: true });
      persist(false, true, true);
    };
  }, [persist, resetMediaClock, sampleActiveWatch, stopMediaClock]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = videoRef.current;
      if (!player || player.paused || seekingRef.current || document.visibilityState === "hidden") {
        return;
      }
      sampleActiveWatch();
      setSessionDisplayTick((tick) => tick + 1);
      persist(false, false, false);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [persist, sampleActiveWatch]);

  function handleLoadedMetadata() {
    setMediaReady(true);
    if (awaitingPlaybackChoice) {
      stopMediaClock();
    } else {
      resetMediaClock();
    }
    setSessionDisplayTick((tick) => tick + 1);
  }

  function choosePlaybackStart(positionSeconds: number) {
    const player = videoRef.current;
    if (!player || !mediaReady) return;

    const safePosition = Math.min(
      Math.max(0, positionSeconds),
      Math.max(0, player.duration - 0.25),
    );
    player.currentTime = safePosition;
    lastSavedPositionRef.current = Math.floor(safePosition);
    setAwaitingPlaybackChoice(false);
    resetMediaClock();
    void player.play().catch((error) => {
      toast.error(error instanceof Error ? error.message : "شروع پخش ویدیو ناموفق بود");
    });
  }

  function handlePlay() {
    if (!playbackSessionIdRef.current || playbackEndedRef.current) {
      playbackSessionIdRef.current = newPlaybackSessionId();
      playbackEndedRef.current = false;
      setSessionConfirmedWatched(0);
      setSessionQualified(false);
      pendingWatchedRef.current = 0;
      inFlightWatchedRef.current = 0;
      lastSavedPositionRef.current = Math.max(0, Math.floor(videoRef.current?.currentTime ?? 0));
    }
    playbackStartedRef.current = true;
    resetMediaClock();
  }

  function handlePlaying() {
    resetMediaClock();
  }

  function handleTimeUpdate() {
    const player = videoRef.current;
    if (!player) return;
    sampleActiveWatch();
    setSessionDisplayTick((tick) => tick + 1);
    persist(false, false, false);
  }

  function handlePause() {
    sampleActiveWatch({ allowPaused: true });
    stopMediaClock();
    persist(false, true, false);
  }

  function handleWaiting() {
    sampleActiveWatch();
    stopMediaClock();
  }

  function handleSeeking() {
    seekingRef.current = true;
    stopMediaClock();
  }

  function handleSeeked() {
    seekingRef.current = false;
    resetMediaClock();
    setSessionDisplayTick((tick) => tick + 1);
    persist(false, true, false);
  }

  function handleEnded() {
    sampleActiveWatch({ allowPaused: true });
    stopMediaClock();
    playbackEndedRef.current = true;
    persist(true, true, true);
    playbackStartedRef.current = false;
  }

  if (loading) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-black text-white/75">
        <Loader2 className="ml-2 h-5 w-5 animate-spin" /> آماده‌سازی پخش‌کننده...
      </div>
    );
  }

  if (!source?.url) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center bg-black text-white/75">
        <PlayCircle className="h-12 w-12 opacity-50" />
        <p className="mt-3 text-sm">منبع ویدیو قابل دسترس نیست</p>
      </div>
    );
  }

  if (source.kind === "iframe") {
    return (
      <div className="space-y-3 bg-black pb-3">
        <iframe
          src={source.url}
          className="aspect-video w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title="پخش ویدیو"
        />
        <div className="mx-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-6 text-amber-100">
          <ExternalLink className="mt-1 h-4 w-4 shrink-0" />
          {source.reason}
        </div>
      </div>
    );
  }

  const playerDuration = videoRef.current?.duration;
  const runtimeDuration = Number.isFinite(playerDuration)
    ? (playerDuration as number)
    : (progress?.duration_seconds ?? initialProgress?.duration_seconds);
  const sessionViewThreshold = runtimeDuration ? Math.ceil(runtimeDuration * 0.5) : null;
  const displayedSessionWatched = sessionViewThreshold
    ? Math.min(
        sessionConfirmedWatched + pendingWatchedRef.current + inFlightWatchedRef.current,
        sessionViewThreshold,
      )
    : 0;
  const sessionViewPercent = sessionViewThreshold
    ? Math.min(100, (displayedSessionWatched * 100) / sessionViewThreshold)
    : 0;

  return (
    <div className="bg-black">
      <div className="relative">
        <video
          ref={videoRef}
          src={source.url}
          controls={!awaitingPlaybackChoice}
          autoPlay={!awaitingPlaybackChoice}
          playsInline
          className="aspect-video w-full"
          poster={source.posterUrl || posterUrl || undefined}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPlaying={handlePlaying}
          onTimeUpdate={handleTimeUpdate}
          onPause={handlePause}
          onWaiting={handleWaiting}
          onSeeking={handleSeeking}
          onSeeked={handleSeeked}
          onEnded={handleEnded}
        >
          مرورگر شما از پخش ویدیو پشتیبانی نمی‌کند.
        </video>
        {awaitingPlaybackChoice && resumePosition != null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75 p-5 text-white backdrop-blur-sm">
            <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/15 bg-black/70 p-5 text-center shadow-2xl">
              <PlayCircle className="mx-auto h-10 w-10 text-sky-300" />
              <div className="space-y-1">
                <p className="font-bold">این ویدیو را قبلاً تماشا کرده‌اید</p>
                <p className="text-sm text-white/70">
                  می‌توانید از {formatWatchTime(resumePosition)} ادامه دهید یا از ابتدا شروع کنید.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  disabled={!mediaReady}
                  onClick={() => choosePlaybackStart(resumePosition)}
                >
                  ادامه از {formatWatchTime(resumePosition)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!mediaReady}
                  className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={() => choosePlaybackStart(0)}
                >
                  شروع از ابتدا
                </Button>
              </div>
              {!mediaReady && <p className="text-xs text-white/55">در حال آماده‌سازی ویدیو...</p>}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2 border-t border-white/10 px-4 py-3 text-white">
        {sessionViewThreshold != null && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                برای ثبت بازدید این نشست: {formatWatchTime(displayedSessionWatched)} از{" "}
                {formatWatchTime(sessionViewThreshold)}
              </span>
              {sessionQualified && (
                <Badge className="border-0 bg-sky-500">بازدید این نشست ثبت شد</Badge>
              )}
            </div>
            <Progress value={sessionViewPercent} className="bg-white/15" />
          </>
        )}
      </div>
    </div>
  );
}
