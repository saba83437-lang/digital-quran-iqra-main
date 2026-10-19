import { supabase } from "@/lib/supabase";
import type { GivingHub } from "@/features/hasanat/types/garden-stage-a";

const MEDIA_CACHE_KEY_PREFIX = "hasanat_media_cache_v1_";
const MEDIA_URL_TTL_MS = 6 * 24 * 60 * 60 * 1000; // 6 days
const memoryMediaCache = new Map<string, { url: string; expiresAt: number }>();

export function getCachedMediaUrl(path: string): string | null {
  if (!path) return null;
  const mem = memoryMediaCache.get(path);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.url;
  }
  try {
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem(MEDIA_CACHE_KEY_PREFIX + path)
        : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.expiresAt > Date.now() && parsed.url) {
        memoryMediaCache.set(path, parsed);
        return parsed.url;
      }
    }
  } catch {}
  return null;
}

export function setCachedMediaUrl(path: string, url: string) {
  if (!path || !url) return;
  const item = { url, expiresAt: Date.now() + MEDIA_URL_TTL_MS };
  memoryMediaCache.set(path, item);
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(MEDIA_CACHE_KEY_PREFIX + path, JSON.stringify(item));
    }
  } catch {}
}

export function invalidateMediaUrl(path: string) {
  if (!path) return;
  memoryMediaCache.delete(path);
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(MEDIA_CACHE_KEY_PREFIX + path);
    }
  } catch {}
}

export async function loadHasanatGivingHub(term?: string, year?: string) {
  const { data, error } = await supabase.rpc("get_hasanat_giving_hub", {
    p_term: term || null,
    p_year: year || null,
  });
  if (error) throw error;
  return data as GivingHub;
}

export async function hasanatRpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export async function uploadHasanatMedia(file: File, folder: string) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("فرمت تصویر باید PNG، JPG یا WebP باشد.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("حجم تصویر نباید بیشتر از ۵ مگابایت باشد.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("hasanat-media")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function signHasanatMedia(
  paths: Array<string | null | undefined>,
) {
  const uniquePaths = [...new Set(paths.filter(Boolean) as string[])];
  const result: Record<string, string> = {};
  const uncached: string[] = [];

  for (const p of uniquePaths) {
    const cached = getCachedMediaUrl(p);
    if (cached) {
      result[p] = cached;
    } else {
      uncached.push(p);
    }
  }

  if (uncached.length > 0) {
    await Promise.all(
      uncached.map(async (path) => {
        const { data } = await supabase.storage
          .from("hasanat-media")
          .createSignedUrl(path, 7 * 24 * 3600);
        if (data?.signedUrl) {
          setCachedMediaUrl(path, data.signedUrl);
          result[path] = data.signedUrl;
        } else {
          result[path] = "";
        }
      }),
    );
  }

  return result;
}
