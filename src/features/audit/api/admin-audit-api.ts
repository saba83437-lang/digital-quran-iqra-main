import { supabase } from "@/lib/supabase";
import {
  normalizeAdminAuditInput,
  validateAdminAuditInput,
  type AdminAuditInput,
} from "../domain/admin-audit-domain";

export async function logSecureAdminAction(input: AdminAuditInput): Promise<string> {
  const validationError = validateAdminAuditInput(input);
  if (validationError) throw new Error(validationError);
  const normalized = normalizeAdminAuditInput(input);

  const { data, error } = await supabase.rpc("secure_log_admin_action", {
    p_action: normalized.action,
    p_entity_type: normalized.entityType,
    p_entity_id: normalized.entityId || null,
    p_details: normalized.details,
  });
  if (error) {
    if (error.code === "PGRST202" || /secure_log_admin_action/i.test(error.message ?? ""))
      throw new Error("مدل امن Audit هنوز در Supabase فعال نشده است");
    throw new Error(error.message);
  }
  return String(data ?? "");
}
