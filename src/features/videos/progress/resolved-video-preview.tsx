import { useEffect, useState } from "react";
import { Loader2, PlayCircle } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { resolvePlayableVideoSource, type PlayableVideoSource } from "./video-source";

/**
 * پیش‌نمایش مدیر بدون ثبت View یا Progress.
 * لینک آپارات از همان Proxy امن Player قرآن‌آموز حل می‌شود.
 */
export function ResolvedVideoPreview({
  videoId,
  originalUrl,
  resolvedUrl,
  sourceType,
  posterUrl,
  title,
}: {
  videoId: string | number;
  originalUrl: string;
  resolvedUrl: string;
  sourceType: string;
  posterUrl?: string | null;
  title: string;
}) {
  const [source, setSource] = useState<PlayableVideoSource | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
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
        if (active) setSource(resolved);
      })
      .catch((error) => {
        console.error("admin video preview failed:", error);
        if (active) setSource(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [originalUrl, resolvedUrl, sourceType, videoId]);

  if (loading) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-black text-white/75">
        <Loader2 className="ml-2 h-5 w-5 animate-spin" /> آماده‌سازی پیش‌نمایش...
      </div>
    );
  }

  if (!source?.url) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center bg-black text-white/70">
        <PlayCircle className="h-12 w-12 opacity-40" />
        <p className="mt-3 text-sm">منبع پیش‌نمایش در دسترس نیست</p>
      </div>
    );
  }

  if (source.kind === "native") {
    return (
      <video
        src={source.url}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full bg-black object-contain"
        poster={source.posterUrl || posterUrl || undefined}
      >
        مرورگر شما از پخش ویدیو پشتیبانی نمی‌کند.
      </video>
    );
  }

  return (
    <div className="bg-black">
      <iframe
        src={source.url}
        className="aspect-video w-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title={title}
      />
      <p className="border-t border-white/10 px-3 py-2 text-center text-[11px] text-amber-100/80">
        پیش‌نمایش از Player رسمی سرویس خارجی نمایش داده می‌شود.
      </p>
    </div>
  );
}
