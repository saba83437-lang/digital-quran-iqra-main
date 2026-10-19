import { supabase } from "@/lib/supabase";
import type { KindnessHub } from "@/features/hasanat/types/kindness-stage-c";
export async function loadKindnessHub() {
  const { data, error } = await supabase.rpc("get_hasanat_kindness_hub");
  if (error) throw error;
  return data as KindnessHub;
}
export async function kindnessRpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
