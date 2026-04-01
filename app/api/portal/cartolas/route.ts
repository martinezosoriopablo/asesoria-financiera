// app/api/portal/cartolas/route.ts
// Client-facing: list uploaded cartolas and their status
// Shows both client-uploaded cartolas and advisor-uploaded snapshots

import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";

export async function GET() {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  // 1. Client-uploaded cartolas (from interactions)
  const { data: clientCartolas } = await admin
    .from("client_interactions")
    .select("id, titulo, descripcion, resultado, fecha, created_at")
    .eq("client_id", client!.id)
    .eq("tipo", "cartola_upload")
    .order("fecha", { ascending: false })
    .limit(50);

  // 2. Advisor-uploaded snapshots (statement/manual/excel sources)
  const { data: advisorSnapshots } = await admin
    .from("portfolio_snapshots")
    .select("id, snapshot_date, source, total_value, created_at")
    .eq("client_id", client!.id)
    .in("source", ["statement", "manual", "excel"])
    .order("snapshot_date", { ascending: false })
    .limit(50);

  // Merge both sources into a unified list
  const cartolas = [
    ...(clientCartolas || []).map(c => ({
      id: c.id,
      titulo: c.titulo,
      descripcion: c.descripcion,
      resultado: c.resultado || "pendiente",
      fecha: c.fecha,
      created_at: c.created_at,
      origen: "cliente" as const,
    })),
    ...(advisorSnapshots || [])
      // Exclude snapshots that match a client interaction date (avoid duplicates)
      .filter(s => !(clientCartolas || []).some(c => c.fecha === s.snapshot_date))
      .map(s => ({
        id: s.id,
        titulo: `Cartola ${new Date(s.snapshot_date).toLocaleDateString("es-CL")}`,
        descripcion: `Subida por tu asesor — Valor: $${Math.round(s.total_value).toLocaleString("es-CL")}`,
        resultado: "exitoso",
        fecha: s.snapshot_date,
        created_at: s.created_at,
        origen: "asesor" as const,
      })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return NextResponse.json({ cartolas });
}
