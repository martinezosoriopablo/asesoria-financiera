// app/api/portal/cartolas/route.ts
// Client-facing: list uploaded cartolas and their status

import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";

export async function GET() {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  const { data: cartolas, error: dbError } = await admin
    .from("client_interactions")
    .select("id, titulo, descripcion, resultado, fecha, created_at")
    .eq("client_id", client!.id)
    .eq("tipo", "cartola_upload")
    .order("fecha", { ascending: false })
    .limit(50);

  if (dbError) {
    return NextResponse.json({ error: "Error cargando cartolas" }, { status: 500 });
  }

  return NextResponse.json({ cartolas: cartolas || [] });
}
