import { supabase } from "@/lib/supabase";
import type { NajmTerm } from "@/lib/najm";
import type { SharedNajmCatalog, SharedNajmPeriodResults } from "./types";

export async function getSharedNajmResultsCatalog() {
  const { data, error } = await supabase.rpc("get_shared_najm_results_catalog");
  return {
    data: error ? null : (data as SharedNajmCatalog),
    error: error?.message ?? null,
  };
}
export async function getSharedNajmPeriodResults(
  scope: "term" | "annual",
  yearKey: string,
  term: NajmTerm | null,
) {
  const { data, error } = await supabase.rpc("get_shared_najm_period_results", {
    p_scope: scope,
    p_year_key: yearKey,
    p_term: term,
  });
  return {
    data: error ? null : (data as SharedNajmPeriodResults),
    error: error?.message ?? null,
  };
}
