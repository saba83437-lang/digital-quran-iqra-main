import { supabase } from "@/lib/supabase";
import type { HiddenGardenHub } from "@/features/hasanat/types/hidden-garden-stage-b";

export async function loadHiddenGardenHub() {
  const { data, error } = await supabase.rpc("get_hasanat_hidden_garden_hub");
  if (error) throw error;
  return data as HiddenGardenHub;
}

export async function hiddenGardenRpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
