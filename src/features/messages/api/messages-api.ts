import { supabase } from "@/lib/supabase";
import { validateSecureMessage, type SecureMessageTarget } from "../domain/message-domain";

export type { SecureMessageTarget } from "../domain/message-domain";

export const SECURE_MESSAGES_CHANGED_EVENT = "secure-messages-changed";
export const MESSAGE_ATTACHMENTS_BUCKET = "message-attachments";
export const MAX_MESSAGE_FILES = 5;
export const MAX_MESSAGE_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_MESSAGE_TOTAL_SIZE = 25 * 1024 * 1024;

const ALLOWED_MESSAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "audio/mpeg", "audio/wav", "audio/webm", "audio/ogg", "audio/mp4",
  "application/pdf", "text/plain", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export interface SecureMessageAttachment {
  name: string;
  path: string;
  mime_type: string;
  size: number;
}

function emitSecureMessagesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SECURE_MESSAGES_CHANGED_EVENT));
}

export interface SecureMessageSendInput {
  targetType: SecureMessageTarget | string;
  targetId?: string | number | null;
  subject: string;
  content: string;
  priority?: string | null;
  topic?: string | null;
  parentMessageId?: string | number | null;
  files?: File[];
  scheduledAt?: string | null;
}

export interface SecureMessageSendResult {
  campaignId: string;
  recipientCount: number;
  deliveryStatus: "delivered" | "scheduled";
  scheduledAt: string | null;
}

function rpcErrorMessage(error: { message?: string; code?: string } | null): string {
  if (!error) return "خطای نامشخص پیام‌رسان";
  if (error.code === "PGRST202" || /secure_send_message/i.test(error.message ?? ""))
    return "قابلیت جدید پیام‌ها هنوز در Supabase فعال نشده است";
  return error.message || "خطا در عملیات پیام";
}

export function validateMessageFiles(files: File[]): string | null {
  if (files.length > MAX_MESSAGE_FILES) return `حداکثر ${MAX_MESSAGE_FILES} فایل مجاز است`;
  let total = 0;
  for (const file of files) {
    total += file.size;
    if (file.size <= 0 || file.size > MAX_MESSAGE_FILE_SIZE)
      return `حجم فایل «${file.name}» باید حداکثر ۱۰ مگابایت باشد`;
    if (!ALLOWED_MESSAGE_MIME_TYPES.has(file.type))
      return `نوع فایل «${file.name}» مجاز نیست`;
  }
  if (total > MAX_MESSAGE_TOTAL_SIZE) return "مجموع حجم پیوست‌ها نباید بیشتر از ۲۵ مگابایت باشد";
  return null;
}

function safeExtension(file: File): string {
  return (
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) ||
    "bin"
  );
}

async function uploadMessageFiles(files: File[]): Promise<SecureMessageAttachment[]> {
  if (files.length === 0) return [];
  const validationError = validateMessageFiles(files);
  if (validationError) throw new Error(validationError);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) throw new Error("نشست ورود معتبر نیست");

  const uploaded: SecureMessageAttachment[] = [];
  try {
    for (const file of files) {
      const path = `${userId}/${crypto.randomUUID()}.${safeExtension(file)}`;
      const { error } = await supabase.storage.from(MESSAGE_ATTACHMENTS_BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (error) throw new Error(`بارگذاری «${file.name}» ناموفق بود: ${error.message}`);
      uploaded.push({ name: file.name, path, mime_type: file.type, size: file.size });
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length)
      await supabase.storage.from(MESSAGE_ATTACHMENTS_BUCKET).remove(uploaded.map((item) => item.path));
    throw error;
  }
}

async function cleanupUploadedMessageFiles(attachments: SecureMessageAttachment[]): Promise<void> {
  if (!attachments.length) return;
  await supabase.storage.from(MESSAGE_ATTACHMENTS_BUCKET).remove(attachments.map((item) => item.path));
}

export async function createMessageAttachmentSignedUrl(
  path: string,
  expiresIn = 60 * 10,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function secureMessagingIsReady(): Promise<boolean> {
  const { error } = await supabase
    .from("messages")
    .select("id, sender_user_id, recipient_user_id, campaign_id")
    .limit(1);
  if (!error) return true;
  const message = error.message.toLowerCase();
  if (error.code === "42703" || error.code === "PGRST204" || message.includes("column"))
    return false;
  throw new Error(error.message);
}

export async function sendSecureMessage(
  input: SecureMessageSendInput,
): Promise<SecureMessageSendResult> {
  const validationError = validateSecureMessage(input);
  if (validationError) throw new Error(validationError);
  const subject = input.subject.trim();
  const content = input.content.trim();
  const files = input.files ?? [];
  let attachments: SecureMessageAttachment[] = [];

  try {
    attachments = await uploadMessageFiles(files);
    const { data, error } = await supabase.rpc("secure_send_message_v2", {
      p_target_type: input.targetType,
      p_target_id: input.targetId == null ? null : String(input.targetId),
      p_subject: subject,
      p_content: content,
      p_priority: input.priority?.trim() || "normal",
      p_topic: input.topic?.trim() || "other",
      p_parent_message_id: input.parentMessageId == null ? null : Number(input.parentMessageId),
      p_attachments: attachments,
      p_scheduled_at: input.scheduledAt || null,
    });
    if (error) {
      // During code-first cutover, preserve immediate text-only messaging until SQL is installed.
      if ((error.code === "PGRST202" || /secure_send_message_v2/i.test(error.message))
          && files.length === 0 && !input.scheduledAt) {
        const legacy = await supabase.rpc("secure_send_message", {
          p_target_type: input.targetType,
          p_target_id: input.targetId == null ? null : String(input.targetId),
          p_subject: subject,
          p_content: content,
          p_priority: input.priority?.trim() || "normal",
          p_topic: input.topic?.trim() || "other",
          p_parent_message_id: input.parentMessageId == null ? null : Number(input.parentMessageId),
        });
        if (legacy.error) throw new Error(rpcErrorMessage(legacy.error));
        const legacyResult = (legacy.data ?? {}) as Record<string, unknown>;
        emitSecureMessagesChanged();
        return {
          campaignId: String(legacyResult.campaign_id ?? ""),
          recipientCount: Number(legacyResult.recipient_count ?? 0),
          deliveryStatus: "delivered",
          scheduledAt: null,
        };
      }
      throw new Error(rpcErrorMessage(error));
    }
    const result = (data ?? {}) as Record<string, unknown>;
    emitSecureMessagesChanged();
    return {
      campaignId: String(result.campaign_id ?? ""),
      recipientCount: Number(result.recipient_count ?? 0),
      deliveryStatus: result.delivery_status === "scheduled" ? "scheduled" : "delivered",
      scheduledAt: result.scheduled_at == null ? null : String(result.scheduled_at),
    };
  } catch (error) {
    await cleanupUploadedMessageFiles(attachments);
    throw error;
  }
}

export async function cancelScheduledMessage(campaignId: string): Promise<number> {
  const { data: rows } = await supabase
    .from("messages")
    .select("attachments")
    .eq("campaign_id", campaignId)
    .eq("delivery_status", "scheduled")
    .limit(1);
  const attachments = Array.isArray(rows?.[0]?.attachments)
    ? (rows![0].attachments as unknown as SecureMessageAttachment[])
    : [];

  const { data, error } = await supabase.rpc("secure_cancel_scheduled_message", {
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  // Cancelled rows no longer protect the files; remove the single shared campaign payload.
  await cleanupUploadedMessageFiles(attachments);
  emitSecureMessagesChanged();
  return Number(data ?? 0);
}

export async function updateSecureMessageState(
  messageId: string | number,
  changes: {
    unread?: boolean;
    isStarred?: boolean;
    isPinned?: boolean;
    isArchived?: boolean;
    replied?: boolean;
  },
): Promise<void> {
  const { error } = await supabase.rpc("secure_update_message_state", {
    p_message_id: Number(messageId),
    p_unread: changes.unread ?? null,
    p_is_starred: changes.isStarred ?? null,
    p_is_pinned: changes.isPinned ?? null,
    p_is_archived: changes.isArchived ?? null,
    p_replied: changes.replied ?? null,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  emitSecureMessagesChanged();
}

export async function deleteSecureMessages(messageIds: Array<string | number>): Promise<number> {
  const normalized = Array.from(
    new Set(messageIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))),
  );
  if (normalized.length === 0) return 0;
  const { data: attachmentRows } = await supabase
    .from("messages")
    .select("campaign_id, attachments")
    .in("id", normalized);
  const attachmentsByPath = new Map<string, SecureMessageAttachment>();
  for (const row of attachmentRows ?? []) {
    if (!Array.isArray(row.attachments)) continue;
    for (const attachment of row.attachments as unknown as SecureMessageAttachment[])
      attachmentsByPath.set(attachment.path, attachment);
  }

  const { data, error } = await supabase.rpc("secure_delete_messages", {
    p_message_ids: normalized,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  await cleanupUploadedMessageFiles([...attachmentsByPath.values()]);
  emitSecureMessagesChanged();
  return Number(data ?? 0);
}
