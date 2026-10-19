import { useEffect, useMemo, useState } from "react";

const PARENT_CHILD_KEY = "parent:selected-child-id";

export function readRememberedParentChild(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(PARENT_CHILD_KEY) ?? "";
}

export function rememberParentChild(childId: string | number): void {
  if (typeof window === "undefined") return;
  const value = String(childId);
  if (value && value !== "all") localStorage.setItem(PARENT_CHILD_KEY, value);
}

export function useParentChildSelection(
  children: Array<{ id: string | number }>,
  options?: { allowAll?: boolean },
) {
  const allowAll = options?.allowAll === true;
  const idsKey = useMemo(() => children.map((child) => String(child.id)).join(","), [children]);
  const [selectedId, setSelectedIdState] = useState(() => {
    const remembered = readRememberedParentChild();
    return remembered || (allowAll ? "all" : "");
  });

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (selectedId === "all" && allowAll) return;
    if (selectedId && ids.includes(selectedId)) return;
    const remembered = readRememberedParentChild();
    const next = remembered && ids.includes(remembered) ? remembered : ids[0] ?? (allowAll ? "all" : "");
    setSelectedIdState(next);
  }, [allowAll, idsKey, selectedId]);

  const setSelectedId = (value: string) => {
    setSelectedIdState(value);
    if (value !== "all") rememberParentChild(value);
  };

  return { selectedId, setSelectedId };
}
