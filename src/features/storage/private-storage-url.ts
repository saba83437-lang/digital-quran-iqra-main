import { supabase } from "@/lib/supabase";
import { storageObjectPath } from "./storage-reference";

export function privateStoragePath(bucket: string, reference?: string | null): string | null {
  return storageObjectPath(bucket, reference);
}

export async function resolvePrivateStorageUrl(
  bucket: string,
  reference?: string | null,
  expiresIn = 60 * 60,
): Promise<string> {
  const value = String(reference ?? "").trim();
  if (!value) return "";
  const path = privateStoragePath(bucket, value);
  if (!path) return value;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return error ? "" : data.signedUrl;
}
