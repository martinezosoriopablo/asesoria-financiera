import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";

export async function GET() {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  const { data: messages, error: msgError } = await admin
    .from("messages")
    .select("*")
    .eq("client_id", client!.id)
    .order("sent_at", { ascending: true });

  if (msgError) {
    return NextResponse.json({ error: "Error cargando mensajes" }, { status: 500 });
  }

  return NextResponse.json({ messages: messages || [] });
}

export async function POST(req: Request) {
  const { client, error } = await requireClient();
  if (error) return error;

  const { content } = await req.json();
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  if (content.length > 5000) {
    return NextResponse.json({ error: "Mensaje muy largo (máx 5000 caracteres)" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      client_id: client!.id,
      advisor_id: client!.asesor_id,
      sender_role: "client",
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
