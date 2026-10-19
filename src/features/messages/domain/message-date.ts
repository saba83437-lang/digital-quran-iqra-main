export interface MessageTimeLike {
  date?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  delivery_status?: "scheduled" | "delivered" | "cancelled" | string | null;
}

function parseLegacyDate(value?: string | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const direct = new Date(raw).getTime();
  if (!Number.isNaN(direct)) return direct;
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(raw);
  if (!match) return null;
  const parsed = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0),
  ).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function messageDisplayTimestamp(message: MessageTimeLike): number | null {
  const preferred =
    message.delivery_status === "scheduled"
      ? message.scheduled_at ?? message.created_at
      : message.delivery_status === "cancelled"
        ? message.cancelled_at ?? message.created_at
        : message.delivered_at ?? message.created_at;
  const timestamp = preferred ? new Date(preferred).getTime() : Number.NaN;
  if (!Number.isNaN(timestamp)) return timestamp;
  return parseLegacyDate(message.date);
}

export function formatIranianMessageDateTime(message: MessageTimeLike): string {
  const timestamp = messageDisplayTimestamp(message);
  if (timestamp == null) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

export function formatIranianMessageDate(message: MessageTimeLike): string {
  const timestamp = messageDisplayTimestamp(message);
  if (timestamp == null) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export function compareMessageDisplayTime(a: MessageTimeLike, b: MessageTimeLike): number {
  return (messageDisplayTimestamp(a) ?? 0) - (messageDisplayTimestamp(b) ?? 0);
}
