import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";

export interface LeagueSymbolPreset {
  key: string;
  title: string;
  glyph: string;
}

export const LEAGUE_SYMBOL_PRESETS: LeagueSymbolPreset[] = [
  { key: "trophy", title: "جام قهرمانی", glyph: "🏆" },
  { key: "crown", title: "تاج", glyph: "👑" },
  { key: "star", title: "ستاره", glyph: "⭐" },
  { key: "sparkles", title: "درخشش", glyph: "✨" },
  { key: "shield", title: "سپر", glyph: "🛡️" },
  { key: "moon", title: "ماه", glyph: "🌙" },
  { key: "sun", title: "خورشید", glyph: "☀️" },
  { key: "diamond", title: "الماس", glyph: "💎" },
  { key: "medal", title: "مدال", glyph: "🥇" },
  { key: "rocket", title: "موشک", glyph: "🚀" },
  { key: "fire", title: "شعله", glyph: "🔥" },
  { key: "lightning", title: "رعدوبرق", glyph: "⚡" },
  { key: "heart", title: "قلب", glyph: "💚" },
  { key: "book", title: "کتاب", glyph: "📖" },
  { key: "quran", title: "قرآن", glyph: "📗" },
  { key: "lantern", title: "فانوس", glyph: "🏮" },
  { key: "flag", title: "پرچم", glyph: "🚩" },
  { key: "mountain", title: "کوه", glyph: "⛰️" },
  { key: "eagle", title: "عقاب", glyph: "🦅" },
  { key: "lion", title: "شیر", glyph: "🦁" },
  { key: "tree", title: "درخت", glyph: "🌳" },
  { key: "flower", title: "گل", glyph: "🌺" },
  { key: "gem", title: "نشان درخشان", glyph: "🔰" },
  { key: "target", title: "هدف", glyph: "🎯" },
];

export type LeagueSymbolShape = "circle" | "rounded" | "shield" | "hexagon";

const SHAPE_CODE: Record<LeagueSymbolShape, string> = {
  circle: "c",
  rounded: "r",
  shield: "s",
  hexagon: "h",
};
const CODE_SHAPE: Record<string, LeagueSymbolShape> = {
  c: "circle",
  r: "rounded",
  s: "shield",
  h: "hexagon",
};

export function sanitizeLeagueSymbolText(value: string): string {
  return Array.from(value.replace(/~/g, "").trim()).slice(0, 2).join("");
}

export function createCustomLeagueSymbolKey(input: {
  shape: LeagueSymbolShape;
  background: string;
  foreground: string;
  text: string;
}): string {
  const text = sanitizeLeagueSymbolText(input.text) || "⭐";
  return `c~${SHAPE_CODE[input.shape]}~${input.background.replace("#", "")}~${input.foreground.replace("#", "")}~${text}`;
}

export function createImageLeagueSymbolKey(fileName: string): string {
  return `i~${fileName}`;
}

export function leagueSymbolImagePath(iconKey: string): string | null {
  if (!iconKey.startsWith("i~")) return null;
  const fileName = iconKey.slice(2);
  return /^[A-Za-z0-9_-]{12,30}\.(png|jpe?g|webp)$/i.test(fileName)
    ? `league-icons/${fileName}`
    : null;
}

export function parseCustomLeagueSymbol(iconKey: string): {
  shape: LeagueSymbolShape;
  background: string;
  foreground: string;
  text: string;
} | null {
  const [prefix, shapeCode, background, foreground, ...textParts] =
    iconKey.split("~");
  const shape = CODE_SHAPE[shapeCode];
  const text = sanitizeLeagueSymbolText(textParts.join("~"));
  if (
    prefix !== "c" ||
    !shape ||
    !/^[0-9a-f]{6}$/i.test(background) ||
    !/^[0-9a-f]{6}$/i.test(foreground) ||
    !text
  )
    return null;
  return {
    shape,
    background: `#${background}`,
    foreground: `#${foreground}`,
    text,
  };
}

function shapeStyle(shape: LeagueSymbolShape): CSSProperties {
  if (shape === "circle") return { borderRadius: "9999px" };
  if (shape === "rounded") return { borderRadius: "28%" };
  if (shape === "shield")
    return { clipPath: "polygon(8% 5%,92% 5%,86% 72%,50% 100%,14% 72%)" };
  return {
    clipPath: "polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0 50%)",
  };
}

const imageUrlCache = new Map<string, { url: string; expiresAt: number }>();

async function resolveSymbolImage(path: string): Promise<string> {
  const cached = imageUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage
    .from("najm-posters")
    .createSignedUrl(path, 60 * 30);
  if (error) return "";
  imageUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + 25 * 60 * 1000,
  });
  return data.signedUrl;
}

export function LeagueSymbol({
  iconKey,
  size = 32,
  className = "",
  imagePreview,
}: {
  iconKey: string;
  size?: number | string;
  className?: string;
  imagePreview?: string;
}) {
  const imagePath = leagueSymbolImagePath(iconKey);
  const [imageUrl, setImageUrl] = useState(imagePreview ?? "");

  useEffect(() => {
    let active = true;
    if (imagePreview) {
      setImageUrl(imagePreview);
      return () => {
        active = false;
      };
    }
    if (!imagePath) {
      setImageUrl("");
      return () => {
        active = false;
      };
    }
    setImageUrl("");
    void resolveSymbolImage(imagePath).then((url) => {
      if (active) setImageUrl(url);
    });
    return () => {
      active = false;
    };
  }, [imagePath, imagePreview]);

  const commonStyle: CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
  };

  if (imagePath || imagePreview)
    return (
      <span
        className={`inline-flex items-center justify-center overflow-hidden rounded-[24%] bg-white/15 ${className}`}
        style={commonStyle}
        aria-hidden
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <span className="animate-pulse">✦</span>
        )}
      </span>
    );

  const custom = parseCustomLeagueSymbol(iconKey);
  if (custom)
    return (
      <span
        className={`inline-flex items-center justify-center font-black leading-none shadow-sm ${className}`}
        style={{
          ...commonStyle,
          ...shapeStyle(custom.shape),
          color: custom.foreground,
          backgroundColor: custom.background,
          fontSize: typeof size === "number" ? size * 0.48 : "48%",
        }}
        aria-hidden
      >
        {custom.text}
      </span>
    );

  const preset = LEAGUE_SYMBOL_PRESETS.find((item) => item.key === iconKey);
  return (
    <span
      className={`inline-flex items-center justify-center leading-none ${className}`}
      style={{
        ...commonStyle,
        fontSize: typeof size === "number" ? size * 0.78 : "78%",
      }}
      aria-hidden
    >
      {preset?.glyph ?? "🏆"}
    </span>
  );
}
