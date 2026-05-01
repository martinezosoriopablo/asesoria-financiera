// app/api/portfolio/generar-carta-corredor/route.ts
// Generates a pre-drafted broker email using Claude for the client to copy and send

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { trackAIUsage } from "@/lib/ai-usage";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

interface Operacion {
  tipo: "comprar" | "vender";
  fondo: string;
  monto: number;
  moneda: string;
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "generar-carta", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { clientId, operaciones } = body as { clientId: string; operaciones: Operacion[] };

    if (!clientId || !operaciones || operaciones.length === 0) {
      return NextResponse.json({ error: "clientId y operaciones son requeridos" }, { status: 400 });
    }

    // Get client data — verify ownership
    const { data: client } = await supabase
      .from("clients")
      .select("nombre, apellido, rut, asesor_id")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    if (client.asesor_id !== advisor!.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const prompt = `Genera un email formal pero conciso que un cliente de inversiones enviara a su corredor o AGF para ejecutar las siguientes operaciones.

DATOS DEL CLIENTE:
- Nombre: ${client.nombre} ${client.apellido}
- RUT: ${client.rut || "No disponible"}

OPERACIONES SOLICITADAS:
${operaciones.map((op: Operacion) =>
  `- ${op.tipo.toUpperCase()}: ${op.fondo} por ${op.moneda} ${op.monto.toLocaleString("es-CL")}`
).join("\n")}

REGLAS:
1. El email es del CLIENTE al corredor (primera persona)
2. Tono formal pero amigable, estilo chileno
3. Incluir: saludo, instrucciones claras de cada operacion, despedida
4. NO incluir datos del asesor ni de la plataforma
5. Maximo 200 palabras
6. El asunto del email debe ser: "Instrucciones de operacion - ${client.nombre} ${client.apellido}"

Responde SOLO en formato JSON valido, sin texto adicional:
{
  "asunto": "...",
  "cuerpo": "..."
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Claude API error:", errorData);
      throw new Error("Error al generar carta con Claude");
    }

    const data = await response.json();

    // Track AI usage (non-blocking)
    if (data.usage) {
      trackAIUsage({
        advisorId: advisor!.id,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        model: "claude-sonnet-4-20250514",
      });
    }

    const text = data.content.find((c: { type: string; text?: string }) => c.type === "text")?.text || "";

    let carta;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      carta = jsonMatch ? JSON.parse(jsonMatch[0]) : { asunto: "Instrucciones de operacion", cuerpo: text };
    } catch {
      carta = { asunto: "Instrucciones de operacion", cuerpo: text };
    }

    return NextResponse.json({ success: true, carta });
  } catch (error) {
    console.error("Error generating carta corredor:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error al generar carta" },
      { status: 500 }
    );
  }
}
