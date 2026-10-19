import { supabase } from "./supabase";

let activeSessionId: string | null = null;

export async function startActivitySession(): Promise<void> {
  if (activeSessionId) return;
  const { data, error } = await supabase.rpc("start_my_activity_session");
  if (error || typeof data !== "string") {
    console.warn("[activity] session start failed:", error?.message ?? "invalid session id");
    return;
  }
  activeSessionId = data;
}

export async function heartbeatActivitySession(): Promise<void> {
  if (!activeSessionId || document.visibilityState !== "visible") return;
  const { error } = await supabase.rpc("heartbeat_my_activity_session", {
    p_session_id: activeSessionId,
  });
  if (error) console.warn("[activity] heartbeat failed:", error.message);
}

export async function endActivitySession(): Promise<void> {
  if (!activeSessionId) return;
  const sessionId = activeSessionId;
  activeSessionId = null;
  const { error } = await supabase.rpc("end_my_activity_session", {
    p_session_id: sessionId,
  });
  if (error) console.warn("[activity] session end failed:", error.message);
}
