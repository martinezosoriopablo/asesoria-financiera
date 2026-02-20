// app/api/comite/generar-cartera/route.ts
// Agente que genera cartera recomendada basada en reportes del comité + perfil cliente

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

interface PortfolioHolding {
  fundName: string;
  securityId?: string;
  marketValue: number;
  quantity?: number;
}

interface PortfolioComposition {
  RV: number;
  RF: number;
  alternativo: number;
  cash: number;
}

interface PortfolioData {
  composition?: PortfolioComposition;
  statement?: {
    holdings: PortfolioHolding[];
    endingValue?: number;
  };
  savedAt?: string;
}

interface ClientProfile {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
  monto_inversion?: number;
  portfolio_data?: PortfolioData | null;
}

interface ComiteReport {
  type: string;
  content: string;
  report_date: string;
}

interface CarteraRecomendada {
  resumenEjecutivo: string;
  cartera: {
    clase: string;
    ticker: string;
    nombre: string;
    porcentaje: number;
    justificacion: string;
  }[];
  riesgos: string[];
  proximosMonitorear: string[];
}

export async function POST(request: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, error: "API key de Anthropic no configurada" },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServerClient();

    // Verificar autenticación
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Obtener datos del request
    const body = await request.json();
    const { clientId, montoInversion } = body;

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: "Se requiere clientId" },
        { status: 400 }
      );
    }

    // 1. Obtener perfil del cliente (incluyendo portfolio_data si existe)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, nombre, apellido, email, perfil_riesgo, puntaje_riesgo, portfolio_data")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    // 2. Obtener los 4 reportes del comité
    const { data: reports, error: reportsError } = await supabase
      .from("comite_reports")
      .select("type, content, report_date")
      .in("type", ["macro", "rv", "rf", "asset_allocation"]);

    if (reportsError) {
      console.error("Error fetching reports:", reportsError);
      return NextResponse.json(
        { success: false, error: "Error al obtener reportes del comité" },
        { status: 500 }
      );
    }

    if (!reports || reports.length < 4) {
      return NextResponse.json(
        {
          success: false,
          error: `Faltan reportes del comité. Subidos: ${reports?.length || 0}/4`,
        },
        { status: 400 }
      );
    }

    // 3. Construir el prompt para Claude
    const prompt = buildPrompt(client, reports, montoInversion);

    // 4. Llamar a Claude
    console.log("Calling Claude to generate portfolio recommendation...");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", errorText);
      return NextResponse.json(
        { success: false, error: "Error al generar recomendación" },
        { status: 500 }
      );
    }

    const claudeResponse = await response.json();
    const content = claudeResponse.content?.[0]?.text || "";

    // 5. Parsear la respuesta JSON
    let carteraData: CarteraRecomendada;
    try {
      // Extraer JSON del response (puede venir con markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No se encontró JSON en la respuesta");
      }
      carteraData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Error parsing Claude response:", parseError);
      console.error("Raw content:", content);
      return NextResponse.json(
        { success: false, error: "Error al procesar la recomendación" },
        { status: 500 }
      );
    }

    // 6. Devolver la recomendación
    return NextResponse.json({
      success: true,
      cliente: {
        nombre: `${client.nombre} ${client.apellido}`,
        perfil: client.perfil_riesgo,
        puntaje: client.puntaje_riesgo,
        monto: montoInversion,
      },
      recomendacion: carteraData,
      generadoEn: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in generar-cartera:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error interno" },
      { status: 500 }
    );
  }
}

function buildPrompt(
  client: ClientProfile,
  reports: ComiteReport[],
  montoInversion?: number
): string {
  // Organizar reportes por tipo
  const reportsByType: Record<string, string> = {};
  for (const report of reports) {
    // Extraer solo el contenido relevante del HTML (sin CSS/scripts)
    const cleanContent = extractTextFromHTML(report.content);
    reportsByType[report.type] = cleanContent;
  }

  const montoStr = montoInversion
    ? `USD ${montoInversion.toLocaleString()}`
    : "No especificado";

  // Construir sección de cartera actual si existe
  let carteraActualSection = "";
  if (client.portfolio_data?.composition || client.portfolio_data?.statement?.holdings) {
    carteraActualSection = `
## CARTERA ACTUAL DEL CLIENTE

El cliente ya tiene una cartera de inversiones que debemos analizar y comparar con la recomendación ideal.
`;

    if (client.portfolio_data.composition) {
      const comp = client.portfolio_data.composition;
      carteraActualSection += `
### Composición Actual (% del portafolio)
- Renta Variable: ${comp.RV?.toFixed(1) || 0}%
- Renta Fija: ${comp.RF?.toFixed(1) || 0}%
- Alternativos: ${comp.alternativo?.toFixed(1) || 0}%
- Cash/Liquidez: ${comp.cash?.toFixed(1) || 0}%
`;
    }

    if (client.portfolio_data.statement?.holdings && client.portfolio_data.statement.holdings.length > 0) {
      carteraActualSection += `
### Holdings Actuales
`;
      for (const holding of client.portfolio_data.statement.holdings.slice(0, 15)) {
        const value = holding.marketValue ? `$${holding.marketValue.toLocaleString()}` : "N/A";
        carteraActualSection += `- ${holding.fundName} (${holding.securityId || "N/A"}): ${value}\n`;
      }
      if (client.portfolio_data.statement.holdings.length > 15) {
        carteraActualSection += `... y ${client.portfolio_data.statement.holdings.length - 15} posiciones más\n`;
      }
    }

    if (client.portfolio_data.statement?.endingValue) {
      carteraActualSection += `
### Valor Total Actual: $${client.portfolio_data.statement.endingValue.toLocaleString()}
`;
    }
  }

  return `Eres un asesor financiero senior de Greybark Research. Tu tarea es generar una cartera de inversión personalizada para un cliente, basándote en:
1. El perfil de riesgo del cliente
2. Los reportes actuales del Comité de Inversiones
${client.portfolio_data ? "3. La cartera actual del cliente (para comparar y sugerir cambios)" : ""}

## CLIENTE
- Nombre: ${client.nombre} ${client.apellido}
- Perfil de Riesgo: ${client.perfil_riesgo}
- Puntaje de Riesgo: ${client.puntaje_riesgo}/100
- Monto a Invertir: ${montoStr}
${carteraActualSection}
## REPORTES DEL COMITÉ DE INVERSIONES

### REPORTE MACRO
${reportsByType.macro || "No disponible"}

### REPORTE RENTA VARIABLE
${reportsByType.rv || "No disponible"}

### REPORTE RENTA FIJA
${reportsByType.rf || "No disponible"}

### REPORTE ASSET ALLOCATION
${reportsByType.asset_allocation || "No disponible"}

## INSTRUCCIONES

Genera una recomendación de cartera que:
1. Se ajuste al perfil de riesgo del cliente (${client.perfil_riesgo})
2. Incorpore las visiones tácticas del Comité (OW/UW por región, sector, duración)
3. Use los ETFs recomendados en el Focus List cuando sea apropiado
4. Explique de forma clara y personalizada por qué cada posición
${client.portfolio_data ? "5. Compare la cartera actual del cliente con la ideal y sugiera cambios específicos" : ""}

## FORMATO DE RESPUESTA

Responde ÚNICAMENTE con JSON válido (sin markdown, sin explicaciones fuera del JSON):

{
  "resumenEjecutivo": "Texto de 2-3 párrafos dirigido al cliente explicando: su perfil, la visión actual del comité, ${client.portfolio_data ? "cómo está su cartera actual vs lo ideal, " : ""}y cómo se traduce en su cartera recomendada. Debe ser cálido y profesional, usando su nombre.",
  "cartera": [
    {
      "clase": "Renta Variable" | "Renta Fija" | "Commodities" | "Cash",
      "ticker": "SPY",
      "nombre": "SPDR S&P 500 ETF",
      "porcentaje": 20,
      "justificacion": "Breve explicación de por qué este ETF, vinculado a la visión del comité"
    }
  ],
  ${client.portfolio_data ? `"cambiosSugeridos": [
    {
      "tipo": "vender" | "reducir" | "mantener" | "aumentar" | "comprar",
      "instrumento": "Nombre del fondo/ETF actual o nuevo",
      "razon": "Por qué hacer este cambio"
    }
  ],` : ""}
  "riesgos": [
    "Riesgo 1 a monitorear",
    "Riesgo 2 a monitorear"
  ],
  "proximosMonitorear": [
    "Evento o dato a monitorear en las próximas semanas"
  ]
}

REGLAS:
- Los porcentajes deben sumar 100%
- Usa los ETFs del Focus List del reporte de Asset Allocation cuando sea posible
- El resumenEjecutivo debe mencionar al cliente por su nombre
- Máximo 8-10 posiciones en la cartera
- Incluye al menos 2-3 riesgos relevantes del reporte Macro
- El tono debe ser profesional pero accesible
${client.portfolio_data ? "- En cambiosSugeridos, indica qué fondos actuales vender/reducir y qué nuevos comprar/aumentar" : ""}`;
}

function extractTextFromHTML(html: string): string {
  // Remover tags de script y style
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remover CSS inline muy largos
  text = text.replace(/style="[^"]{200,}"/gi, "");

  // Remover tags HTML pero mantener el contenido
  text = text.replace(/<[^>]+>/g, " ");

  // Limpiar espacios múltiples
  text = text.replace(/\s+/g, " ").trim();

  // Limitar longitud para no exceder contexto
  const maxLength = 15000;
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + "... [contenido truncado]";
  }

  return text;
}
