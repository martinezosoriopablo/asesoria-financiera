import { NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { advisor, error } = await requireAdvisor();
  if (error) return error;

  const { clientId } = await params;
  const admin = createAdminClient();

  // Verify client belongs to this advisor
  const { data: client } = await admin
    .from("clients")
    .select("id, asesor_id")
    .eq("id", clientId)
    .single();

  if (!client || client.asesor_id !== advisor!.id) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const { data: messages } = await admin
    .from("messages")
    .select("*")
    .eq("client_id", clientId)
    .order("sent_at", { ascending: true });

  return NextResponse.json({ messages: messages || [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { advisor, error } = await requireAdvisor();
  if (error) return error;

  const { clientId } = await params;
  const { content } = await req.json();

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  if (content.length > 5000) {
    return NextResponse.json({ error: "Mensaje muy largo" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify client belongs to this advisor
  const { data: client } = await admin
    .from("clients")
    .select("id, asesor_id")
    .eq("id", clientId)
    .single();

  if (!client || client.asesor_id !== advisor!.id) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      client_id: clientId,
      advisor_id: advisor!.id,
      sender_role: "advisor",
      content: content.trim(),
    })
    .select()
    .single();

  if (insertError) {
    console.error("Error inserting message:", insertError);
    return NextResponse.json({ error: "Error enviando mensaje" }, { status: 500 });
  }

  return NextResponse.json({ message });
}
