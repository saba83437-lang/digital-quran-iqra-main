import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://htfgctazuosjrakkardp.supabase.co";
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_pdOrnZS7j3l-KPcc8Ax4pQ_ppTX_29j";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function extractAparatHash(value: string): string | null {
  const patterns = [
    /aparat\.com\/v\/([A-Za-z0-9_-]+)/i,
    /aparat\.com\/embed\/([A-Za-z0-9_-]+)/i,
    /videohash\/([A-Za-z0-9_-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function handleAparatSourceProxy(request: Request): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization))
    return jsonResponse({ error: "Authentication required" }, 401);

  const requestUrl = new URL(request.url);
  const videoId = requestUrl.searchParams.get("videoId") ?? "";
  if (!/^\d{1,18}$/.test(videoId)) return jsonResponse({ error: "Invalid video id" }, 400);

  // Same user JWT is used against PostgREST; videos RLS proves this user may read this video.
  const videoResponse = await fetch(
    `${supabaseUrl}/rest/v1/videos?select=id,video_url&id=eq.${encodeURIComponent(videoId)}&limit=1`,
    {
      headers: {
        apikey: supabasePublishableKey,
        authorization,
        accept: "application/json",
      },
    },
  );
  if (!videoResponse.ok)
    return jsonResponse({ error: "Video authorization failed" }, videoResponse.status);
  const rows = (await videoResponse.json()) as Array<{ id: number; video_url: string }>;
  const video = rows[0];
  if (!video) return jsonResponse({ error: "Video not found or access denied" }, 404);

  const hash = extractAparatHash(String(video.video_url ?? ""));
  if (!hash) return jsonResponse({ error: "Video is not an Aparat link" }, 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const aparatResponse = await fetch(
      `https://www.aparat.com/etc/api/video/videohash/${encodeURIComponent(hash)}`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    if (!aparatResponse.ok)
      return jsonResponse({ error: `Aparat returned ${aparatResponse.status}` }, 502);
    const payload = (await aparatResponse.json()) as {
      video?: {
        duration?: number | string;
        frame?: string;
        big_poster?: string;
        file_link?: string;
        file_link_all?: Array<{ profile?: string; urls?: string[] }>;
      };
    };
    const source = payload.video;
    const qualities = (source?.file_link_all ?? [])
      .flatMap((item) =>
        (item.urls ?? []).map((url) => ({
          url,
          quality: Number(String(item.profile ?? "0").replace(/\D/g, "")) || 0,
        })),
      )
      .filter((item) => /^https:\/\//i.test(item.url))
      .sort((a, b) => b.quality - a.quality);
    const selected = qualities.find((item) => item.quality <= 720) ?? qualities[0];
    const mediaUrl = selected?.url ?? source?.file_link;
    if (!mediaUrl || !/^https:\/\//i.test(mediaUrl))
      return jsonResponse({ error: "Aparat media source unavailable" }, 502);

    return jsonResponse({
      mediaUrl,
      durationSeconds: Number(source?.duration ?? 0) || null,
      posterUrl: source?.big_poster ?? null,
      frameUrl:
        source?.frame ??
        `https://www.aparat.com/video/video/embed/videohash/${encodeURIComponent(hash)}/vt/frame`,
      provider: "aparat",
    });
  } catch (error) {
    console.error("Aparat source proxy failed:", error);
    return jsonResponse({ error: "Aparat source request failed" }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/video/aparat-source") {
        return await handleAparatSourceProxy(request);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
