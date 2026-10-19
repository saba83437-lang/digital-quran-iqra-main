import { useRef } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { validateMessageFiles } from "../api/messages-api";

function formatSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageAttachmentPicker({
  files,
  onChange,
  disabled = false,
  compact = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    const next = [...files, ...selected];
    const error = validateMessageFiles(next);
    if (error) return toast.error(error);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif,audio/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        onChange={selectFiles}
      />
      <Button
        type="button"
        size={compact ? "sm" : "default"}
        variant="outline"
        disabled={disabled}
        className="gap-1.5"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-4 w-4" /> پیوست فایل
      </Button>
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 rounded-xl border bg-secondary/35 px-3 py-2 text-xs">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatSize(file.size)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}
                aria-label="حذف پیوست"
                className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
