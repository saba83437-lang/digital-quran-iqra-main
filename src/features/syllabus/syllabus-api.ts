import { supabase } from "@/lib/supabase";

export type SyllabusStatus = "planned" | "in_progress" | "completed";

export interface ClassSyllabusItem {
  id: string;
  class_id: number;
  title: string;
  description: string;
  status: SyllabusStatus;
  target_date: string | null;
  sort_order: number;
  is_active: boolean;
  completed_at: string | null;
  completed_by_user_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SaveSyllabusItemInput {
  id?: string | null;
  classId: number;
  title: string;
  description?: string;
  status?: SyllabusStatus;
  targetDate?: string | null;
  sortOrder?: number | null;
}

function friendlyError(message: string): string {
  if (/class_syllabus_items|schema cache|could not find/i.test(message))
    return "مدل برنامه آموزشی مرحله ۱۷ هنوز در Supabase فعال نشده است";
  return message;
}

export async function loadClassSyllabus(
  classIds: Array<number | string>,
): Promise<ClassSyllabusItem[]> {
  const normalized = [...new Set(classIds.map(Number).filter(Number.isFinite))];
  if (normalized.length === 0) return [];
  const { data, error } = await supabase
    .from("class_syllabus_items")
    .select(
      "id, class_id, title, description, status, target_date, sort_order, is_active, completed_at, completed_by_user_id, created_by_user_id, created_at, updated_at",
    )
    .in("class_id", normalized)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(friendlyError(error.message));
  return (data ?? []).map((item) => ({
    ...item,
    id: String(item.id),
    class_id: Number(item.class_id),
    sort_order: Number(item.sort_order ?? 0),
  })) as ClassSyllabusItem[];
}

export async function saveClassSyllabusItem(input: SaveSyllabusItemInput): Promise<string> {
  const { data, error } = await supabase.rpc("secure_save_class_syllabus_item", {
    p_class_id: input.classId,
    p_title: input.title.trim(),
    p_description: input.description?.trim() ?? "",
    p_status: input.status ?? "planned",
    p_target_date: input.targetDate || null,
    p_sort_order: input.sortOrder ?? null,
    p_item_id: input.id ?? null,
  });
  if (error) throw new Error(friendlyError(error.message));
  return String(data);
}

export async function deleteClassSyllabusItem(itemId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("secure_delete_class_syllabus_item", {
    p_item_id: itemId,
  });
  if (error) throw new Error(friendlyError(error.message));
  return data === true;
}

export async function reorderClassSyllabus(
  classId: number,
  orderedIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc("secure_reorder_class_syllabus", {
    p_class_id: classId,
    p_item_ids: orderedIds,
  });
  if (error) throw new Error(friendlyError(error.message));
}

