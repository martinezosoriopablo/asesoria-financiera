import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError } from "@/lib/api-response";

export async function POST() {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  return handleApiError("portal-messages-read-post", async () => {
    // Mark all unread advisor messages as read
    await admin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", client!.id)
      .eq("sender_role", "advisor")
      .is("read_at", null);

    return NextResponse.json({ success: true });
  });
}
