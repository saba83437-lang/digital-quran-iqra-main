import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createMessageAttachmentSignedUrl,
  type SecureMessageAttachment,
} from "../api/messages-api";

function formatSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function SecureMessageAttachments({
  attachments,
}: {
  attachments?: SecureMessageAttachment[] | null;
}) {
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const rows = Array.isArray(attachments) ? attachments : [];
  if (!rows.length) return null;

  async function openAttachment(attachment: SecureMessageAttachment) {
    setLoadingPath(attachment.path);
    try {
      const url = await createMessageAttachmentSignedUrl(attachment.path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "دریافت فایل ناموفق بود");
    } finally {
      setLoadingPath(null);
    }
  }

  return (
    <div className="mt-3 space-y-1.5 border-t pt-3">
      <p className="text-xs font-bold text-muted-foreground">پیوست‌ها:</p>
      {rows.map((attachment) => (
        <button
          key={attachment.path}
          type="button"
          onClick={() => void openAttachment(attachment)}
          disabled={loadingPath === attachment.path}
          className="flex w-full items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-right text-xs font-bold transition hover:bg-secondary"
        >
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
          <span className="text-muted-foreground">{formatSize(Number(attachment.size ?? 0))}</span>
          {loadingPath === attachment.path ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </button>
      ))}
    </div>
  );
}
