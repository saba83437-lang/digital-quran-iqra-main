import { useCallback, useEffect, useState } from "react";
import { loadParentPortalData, type ParentPortalData } from "@/lib/parent-utils";

export function useParentPortal() {
  const [data, setData] = useState<ParentPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    const result = await loadParentPortalData();
    setData(result.data);
    setError(result.error);
    setLoading(false);
    setRefreshing(false);
    return result;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, refreshing, error, refresh };
}
