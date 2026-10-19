import { supabase } from "@/lib/supabase";
import { storageObjectPath } from "@/features/storage/storage-reference";

export const VIDEO_STORAGE_BUCKET = "videos";

export function videoStoragePath(reference?: string | null): string | null {
  return storageObjectPath(VIDEO_STORAGE_BUCKET, reference);
}

/** External links remain unchanged; private bucket references become short-lived URLs. */
export async function resolveVideoStorageReference(
  reference?: string | null,
  expiresIn = 60 * 60,
): Promise<string> {
  const value = String(reference ?? "").trim();
  if (!value) return "";
  const path = videoStoragePath(value);
  if (!path) return value;

  const { data, error } = await supabase.storage
    .from(VIDEO_STORAGE_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) return "";
  return data.signedUrl;
}
