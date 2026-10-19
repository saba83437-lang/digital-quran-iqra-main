export interface AdminAuditInput {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Record<string, unknown>;
}

export function validateAdminAuditInput(input: AdminAuditInput): string | null {
  const action = input.action.trim();
  const entityType = input.entityType.trim();
  if (!action) return "عنوان عملیات Audit الزامی است";
  if (action.length > 100) return "عنوان عملیات Audit بیش از حد طولانی است";
  if (!entityType) return "نوع موجودیت Audit الزامی است";
  if (entityType.length > 100) return "نوع موجودیت Audit بیش از حد طولانی است";
  const details = input.details ?? {};
  if (Array.isArray(details) || details === null || typeof details !== "object")
    return "جزئیات Audit باید یک شیء باشد";
  if (new TextEncoder().encode(JSON.stringify(details)).length > 65_536)
    return "جزئیات Audit بیش از حد بزرگ است";
  return null;
}

export function normalizeAdminAuditInput(input: AdminAuditInput): Required<AdminAuditInput> {
  return {
    action: input.action.trim(),
    entityType: input.entityType.trim(),
    entityId: input.entityId == null ? "" : String(input.entityId),
    details: input.details ?? {},
  };
}
