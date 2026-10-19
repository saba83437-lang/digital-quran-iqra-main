export const SECURE_MESSAGE_TARGETS = [
  "admin",
  "teacher",
  "student",
  "parent",
  "all",
  "all_teachers",
  "all_students",
  "all_parents",
  "class_students",
  "class_parents",
] as const;

export type SecureMessageTarget = (typeof SECURE_MESSAGE_TARGETS)[number];

export function isSecureMessageTarget(value: unknown): value is SecureMessageTarget {
  return SECURE_MESSAGE_TARGETS.includes(String(value ?? "") as SecureMessageTarget);
}

export function secureMessageTargetNeedsId(target: SecureMessageTarget): boolean {
  return ["teacher", "student", "parent", "class_students", "class_parents"].includes(target);
}

export interface SecureMessageIdentityRow {
  id: string | number;
  sender_user_id?: string | null;
  recipient_user_id?: string | null;
  campaign_id?: string | null;
  unread?: boolean | null;
  date?: string | null;
  created_at?: string | null;
  is_starred?: boolean | null;
  is_pinned?: boolean | null;
  is_archived?: boolean | null;
}

export function secureMessageLogicalKey(message: SecureMessageIdentityRow): string {
  return message.campaign_id ? `campaign:${message.campaign_id}` : `message:${message.id}`;
}

export function messageIsSentBy(message: SecureMessageIdentityRow, userId: string): boolean {
  return Boolean(userId) && String(message.sender_user_id ?? "") === userId;
}

export function messageIsDeliveredTo(message: SecureMessageIdentityRow, userId: string): boolean {
  return Boolean(userId) && String(message.recipient_user_id ?? "") === userId;
}

export function countLogicalMessages(
  messages: SecureMessageIdentityRow[],
  predicate: (message: SecureMessageIdentityRow) => boolean = () => true,
): number {
  return new Set(messages.filter(predicate).map(secureMessageLogicalKey)).size;
}

export function uniqueLogicalMessages<T extends SecureMessageIdentityRow>(messages: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const message of messages) {
    const key = secureMessageLogicalKey(message);
    if (!byKey.has(key)) byKey.set(key, message);
  }
  return [...byKey.values()];
}

export function validateSecureMessage(input: {
  targetType: unknown;
  targetId?: unknown;
  subject: unknown;
  content: unknown;
}): string | null {
  if (!isSecureMessageTarget(input.targetType)) return "نوع گیرنده پیام معتبر نیست";
  if (secureMessageTargetNeedsId(input.targetType) && !String(input.targetId ?? "").trim())
    return "انتخاب گیرنده پیام الزامی است";
  const subject = String(input.subject ?? "").trim();
  const content = String(input.content ?? "").trim();
  if (!subject) return "موضوع پیام الزامی است";
  if (subject.length > 200) return "موضوع پیام نباید بیشتر از ۲۰۰ کاراکتر باشد";
  if (!content) return "متن پیام الزامی است";
  if (content.length > 10000) return "متن پیام نباید بیشتر از ۱۰هزار کاراکتر باشد";
  return null;
}
