import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { assignmentObjectPath, validateAssignmentUpload } from "./assignment-storage-domain";

export {
  ASSIGNMENT_FILE_MAX_BYTES,
  assignmentObjectPath,
  normalizeAssignmentOwnerFolder,
  validateAssignmentUpload,
} from "./assignment-storage-domain";

export const ASSIGNMENT_FILES_BUCKET = "assignments";

export async function uploadPrivateAssignmentFile(
  file: File | Blob,
  folder: string,
  originalName: string,
): Promise<string> {
  const validationError = validateAssignmentUpload(file);
  if (validationError) throw new Error(validationError);
  const mimeType = file.type || "application/octet-stream";
  const path = assignmentObjectPath(folder, originalName, mimeType, crypto.randomUUID());
  const { error } = await supabase.storage.from(ASSIGNMENT_FILES_BUCKET).upload(path, file, {
    upsert: false,
    contentType: mimeType,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function createAssignmentSignedUrl(reference: string): Promise<string> {
  const value = String(reference ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const { data, error } = await supabase.storage
    .from(ASSIGNMENT_FILES_BUCKET)
    .createSignedUrl(value, 60 * 30);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "ساخت لینک فایل ناموفق بود");
  return data.signedUrl;
}

export function useAssignmentSignedUrl(reference?: string | null): {
  url: string;
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState({
    url: "",
    loading: Boolean(reference),
    error: null as string | null,
  });

  useEffect(() => {
    let cancelled = false;
    const value = String(reference ?? "").trim();
    if (!value) {
      setState({ url: "", loading: false, error: null });
      return () => {
        cancelled = true;
      };
    }
    setState({ url: "", loading: true, error: null });
    void createAssignmentSignedUrl(value)
      .then((url) => {
        if (!cancelled) setState({ url, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled)
          setState({
            url: "",
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [reference]);

  return state;
}
