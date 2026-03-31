// lib/notifications.ts
// Helper to create advisor notifications

import { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType =
  | "cartola_upload"
  | "questionnaire_completed"
  | "new_message"
  | "report_ready";

interface CreateNotificationParams {
  advisorId: string;
  clientId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

export async function createNotification(
  supabase: SupabaseClient,
  params: CreateNotificationParams
) {
  const { error } = await supabase.from("advisor_notifications").insert({
    advisor_id: params.advisorId,
    client_id: params.clientId || null,
    type: params.type,
    title: params.title,
    body: params.body || null,
    link: params.link || null,
  });

  if (error) {
    console.error("Error creating notification:", error);
  }

  return { error };
}
