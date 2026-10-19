import {
  forwardRef,
  type AnchorHTMLAttributes,
  type AudioHTMLAttributes,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import { useAssignmentSignedUrl } from "../storage/assignment-storage";

export const SecureAssignmentAudio = forwardRef<
  HTMLAudioElement,
  Omit<AudioHTMLAttributes<HTMLAudioElement>, "src"> & { reference?: string | null }
>(function SecureAssignmentAudio({ reference, ...props }, ref) {
  const { url, loading, error } = useAssignmentSignedUrl(reference);
  if (loading)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال آماده‌سازی صوت...
      </span>
    );
  if (error || !url)
    return <span className="text-xs text-destructive">فایل صوتی در دسترس نیست</span>;
  return <audio ref={ref} src={url} {...props} />;
});

export function SecureAssignmentFileLink({
  reference,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  reference?: string | null;
  children: ReactNode;
}) {
  const { url, loading, error } = useAssignmentSignedUrl(reference);
  if (loading)
    return (
      <span className={props.className}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال آماده‌سازی فایل...
      </span>
    );
  if (error || !url) return <span className="text-xs text-destructive">فایل در دسترس نیست</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}
