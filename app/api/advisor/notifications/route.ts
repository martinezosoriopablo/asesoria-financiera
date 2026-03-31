// app/api/advisor/notifications/route.ts
// GET: list notifications for current advisor
// PATCH: mark notifications as read

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const { advisor, error } = await requireAdvisor();
  if (error) return error;

  const admin = createAdminClient();
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

  let query = admin
    .from("advisor_notifications")
    .select(`
      id, type, title, body, link, read_at, created_at,
      client_id,
      clients(nombre, apellido)
    `)
    .eq("advisor_id", advisor!.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data: notifications, error: fetchError } = await query;

  if (fetchError) {
    console.error("Error fetching notifications:", fetchError);
    return NextResponse.json({ error: "Error al obtener notificaciones" }, { status: 500 });
  }

  // Also get unread count
  const { count } = await admin
    .from("advisor_notifications")
    .select("id", { count: "exact", head: true })
    .eq("advisor_id", advisor!.id)
    .is("read_at", null);

  return NextResponse.json({
    success: true,
    notifications: notifications || [],
    unreadCount: count || 0,
  });
}

export async function PATCH(request: NextRequest) {
  const { advisor, error } = await requireAdvisor();
  if (error) return error;

  const admin = createAdminClient();
  const body = await request.json();
  const { notificationIds, markAll } = body;

  if (markAll) {
    const { error: updateError } = await admin
      .from("advisor_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("advisor_id", advisor!.id)
      .is("read_at", null);

    if (updateError) {
      return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
    }
  } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    const { error: updateError } = await admin
      .from("advisor_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("advisor_id", advisor!.id)
      .in("id", notificationIds);

    if (updateError) {
      return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
