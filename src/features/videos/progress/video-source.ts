export type PlayableVideoSource =
  | {
      kind: "native";
      url: string;
      durationSeconds: number | null;
      posterUrl?: string | null;
      provider: "private" | "direct" | "aparat";
    }
  | {
      kind: "iframe";
      url: string;
      provider: "aparat" | "youtube" | "external";
      reason: string;
    };

export function extractAparatHash(value: string): string | null {
  const input = String(value ?? "").trim();
  const patterns = [
    /aparat\.com\/v\/([A-Za-z0-9_-]+)/i,
    /aparat\.com\/embed\/([A-Za-z0-9_-]+)/i,
    /videohash\/([A-Za-z0-9_-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(input);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function aparatEmbedUrl(value: string): string | null {
  const hash = extractAparatHash(value);
  return hash
    ? `https://www.aparat.com/video/video/embed/videohash/${encodeURIComponent(hash)}/vt/frame`
    : null;
}

export function youtubeEmbedUrl(value: string): string | null {
  const input = String(value ?? "").trim();
  const match =
    /youtu\.be\/([A-Za-z0-9_-]{6,})/i.exec(input) ??
    /youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/i.exec(input);
  return match?.[1]
    ? `https://www.youtube.com/embed/${encodeURIComponent(match[1])}?enablejsapi=1`
    : null;
}

export function isDirectMediaUrl(value: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(String(value ?? "").trim());
}

interface AparatProxyResponse {
  mediaUrl?: string;
  durationSeconds?: number | null;
  posterUrl?: string | null;
  frameUrl?: string | null;
  error?: string;
}

async function resolveAparat(
  value: string,
  videoId: string | number,
  accessToken: string,
): Promise<PlayableVideoSource> {
  const fallback = aparatEmbedUrl(value) ?? value;
  if (!extractAparatHash(value))
    return { kind: "iframe", url: fallback, provider: "aparat", reason: "شناسه آپارات نامعتبر است" };

  try {
    const response = await fetch(
      `/api/video/aparat-source?videoId=${encodeURIComponent(String(videoId))}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    const payload = (await response.json()) as AparatProxyResponse;
    if (!response.ok || !payload.mediaUrl) throw new Error(payload.error ?? `HTTP ${response.status}`);
    return {
      kind: "native",
      url: payload.mediaUrl,
      durationSeconds: payload.durationSeconds ?? null,
      posterUrl: payload.posterUrl ?? null,
      provider: "aparat",
    };
  } catch {
    return {
      kind: "iframe",
      url: fallback,
      provider: "aparat",
      reason:
        "Proxy امن آپارات در این نشست به منبع مستقیم دسترسی پیدا نکرد؛ iframe باز شده و View یا درصد ساختگی ثبت نمی‌شود.",
    };
  }
}

export async function resolvePlayableVideoSource(input: {
  videoId: string | number;
  accessToken: string;
  originalUrl: string;
  resolvedUrl: string;
  sourceType: string;
}): Promise<PlayableVideoSource> {
  const original = String(input.originalUrl ?? "").trim();
  const resolved = String(input.resolvedUrl ?? "").trim();

  if (extractAparatHash(original)) return resolveAparat(original, input.videoId, input.accessToken);
  const youtube = youtubeEmbedUrl(original);
  if (youtube)
    return {
      kind: "iframe",
      url: youtube,
      provider: "youtube",
      reason: "این لینک در Player خارجی باز می‌شود؛ در این نسخه فقط بازشدن آن ثبت می‌شود.",
    };

  if (input.sourceType === "upload" && resolved)
    return { kind: "native", url: resolved, durationSeconds: null, provider: "private" };
  if (isDirectMediaUrl(original) || isDirectMediaUrl(resolved))
    return {
      kind: "native",
      url: resolved || original,
      durationSeconds: null,
      provider: "direct",
    };
  if (resolved && !/^https?:\/\//i.test(original))
    return { kind: "native", url: resolved, durationSeconds: null, provider: "private" };

  return {
    kind: "iframe",
    url: resolved || original,
    provider: "external",
    reason: "سرویس این لینک، زمان پخش را به سامانه اعلام نمی‌کند؛ درصد ساختگی ثبت نمی‌شود.",
  };
}
