export const ASSIGNMENT_FILE_MAX_BYTES = 50 * 1024 * 1024;

export function normalizeAssignmentOwnerFolder(folder: string): string {
  const clean = String(folder ?? "").replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] === "submissions" && parts[1]) return `submission-assets/${parts[1]}`;
  if (parts[0] === "feedback" && parts[1]) return `feedback-assets/${parts[1]}`;
  const owner = parts.at(-1) || "admin";
  return `assignment-assets/${owner}`;
}

function safeExtension(fileName: string, mimeType: string): string {
  const raw = fileName.includes(".")
    ? fileName
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "")
    : "";
  if (raw) return raw.slice(0, 10);
  if (mimeType === "audio/webm") return "webm";
  if (mimeType === "application/pdf") return "pdf";
  return "bin";
}

export function assignmentObjectPath(
  folder: string,
  fileName: string,
  mimeType: string,
  uniqueToken: string,
): string {
  const ownerFolder = normalizeAssignmentOwnerFolder(folder);
  const token = uniqueToken.replace(/[^a-zA-Z0-9-]/g, "");
  if (!token) throw new Error("شناسه فایل معتبر نیست");
  return `${ownerFolder}/${token}.${safeExtension(fileName, mimeType)}`;
}

export function validateAssignmentUpload(file: { size: number }): string | null {
  if (file.size <= 0) return "فایل خالی است";
  if (file.size > ASSIGNMENT_FILE_MAX_BYTES) return "حجم فایل نباید بیشتر از ۵۰ مگابایت باشد";
  return null;
}
