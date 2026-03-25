import { createAdminClient } from "@/lib/auth/api-auth";

export async function logAuditEvent(params: {
  advisorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  await supabase.from("audit_logs").insert({
    advisor_id: params.advisorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    details: params.details,
  });
}
