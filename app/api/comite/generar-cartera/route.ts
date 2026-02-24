// app/api/comite/generar-cartera/route.ts
// Agente que genera cartera recomendada basada en reportes del comité + perfil cliente

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBenchmarkFromScore } from "@/lib/risk/benchmarks";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

interface PortfolioHolding {
  fundName: string;
  securityId?: string;
  marketValue: number;
  quantity?: number;
}

interface PortfolioComposition {
  // Legacy format
  RV?: number;
  RF?: number;
  alternativo?: number;
  cash?: number;
  // New format from fund_classifier
  byAssetClass?: {
    Equity?: { value: number; percent: number };
    "Fixed Income"?: { value: number; percent: number };
    Cash?: { value: number; percent: number };
  };
  byRegion?: Record<string, { value: number; percent: number }>;
  holdings?: Array<{
    fundName: string;
    securityId: string;
    assetClass: string;
    region: string;
    marketValue: number;
    percentOfPortfolio: number;
  }>;
  totalValue?: number;
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
  contextoPerfil: string;
  resumenEjecutivo: string;
  cartera: {
    clase: string;
    ticker: string;
    nombre: string;
    descripcionSimple: string;
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

    // Debug: Log portfolio_data
    console.error("=== DEBUG: Client Data ===");
    console.error("Client ID:", client.id);
    console.error("Client Name:", client.nombre, client.apellido);
    console.error("Portfolio Data exists:", !!client.portfolio_data);
    console.error("Portfolio Data raw:", JSON.stringify(client.portfolio_data, null, 2));
    if (client.portfolio_data) {
      console.error("Portfolio composition:", client.portfolio_data.composition);
      console.error("Portfolio holdings count:", client.portfolio_data.statement?.holdings?.length || 0);
    }
    console.error("========================");

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
      // Debug info
      _debug: {
        hasPortfolioData: !!client.portfolio_data,
        portfolioDataKeys: client.portfolio_data ? Object.keys(client.portfolio_data) : [],
        holdingsCount: client.portfolio_data?.statement?.holdings?.length || 0,
      },
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
  const portfolioData = client.portfolio_data;

  // Check for composition data in either format
  const hasComposition = portfolioData?.composition?.byAssetClass ||
                         portfolioData?.composition?.RV !== undefined;
  const hasHoldings = (portfolioData?.statement?.holdings?.length ?? 0) > 0 ||
                      (portfolioData?.composition?.holdings?.length ?? 0) > 0;

  if (hasComposition || hasHoldings) {
    carteraActualSection = `
## CARTERA ACTUAL DEL CLIENTE

El cliente ya tiene una cartera de inversiones que debemos analizar y comparar con la recomendación ideal.
`;

    // Handle new format (from fund_classifier)
    if (portfolioData?.composition?.byAssetClass) {
      const byClass = portfolioData.composition.byAssetClass;
      const equityPct = byClass.Equity?.percent || 0;
      const fixedIncomePct = byClass["Fixed Income"]?.percent || 0;
      const cashPct = byClass.Cash?.percent || 0;
      const totalValue = portfolioData.composition.totalValue || portfolioData.statement?.endingValue || 0;

      carteraActualSection += `
### Composición Actual (% del portafolio)
- Renta Variable (Equity): ${equityPct.toFixed(1)}%
- Renta Fija (Fixed Income): ${fixedIncomePct.toFixed(1)}%
- Cash/Liquidez: ${cashPct.toFixed(1)}%
- Valor Total: $${totalValue.toLocaleString()}
`;

      // Add regional breakdown if available
      if (portfolioData.composition.byRegion) {
        carteraActualSection += `
### Distribución por Región
`;
        for (const [region, data] of Object.entries(portfolioData.composition.byRegion)) {
          carteraActualSection += `- ${region}: ${(data as any).percent.toFixed(1)}%\n`;
        }
      }

      // Add holdings from composition if available
      const compositionHoldings = portfolioData.composition.holdings;
      if (compositionHoldings && compositionHoldings.length > 0) {
        carteraActualSection += `
### Holdings Actuales (${compositionHoldings.length} posiciones)
`;
        for (const holding of compositionHoldings.slice(0, 10)) {
          const pct = holding.percentOfPortfolio?.toFixed(1) || "N/A";
          carteraActualSection += `- ${holding.fundName} (${holding.assetClass}, ${holding.region}): ${pct}% - $${holding.marketValue.toLocaleString()}\n`;
        }
        if (compositionHoldings.length > 10) {
          carteraActualSection += `... y ${compositionHoldings.length - 10} posiciones más\n`;
        }
      }
    }
    // Handle legacy format
    else if (portfolioData?.composition) {
      const comp = portfolioData.composition;
      carteraActualSection += `
### Composición Actual (% del portafolio)
- Renta Variable: ${comp.RV?.toFixed(1) || 0}%
- Renta Fija: ${comp.RF?.toFixed(1) || 0}%
- Alternativos: ${comp.alternativo?.toFixed(1) || 0}%
- Cash/Liquidez: ${comp.cash?.toFixed(1) || 0}%
`;
    }

    // Add statement holdings if available (legacy format)
    const statementHoldings = portfolioData?.statement?.holdings;
    if (statementHoldings && statementHoldings.length > 0 && !portfolioData?.composition?.holdings) {
      carteraActualSection += `
### Holdings Actuales
`;
      for (const holding of statementHoldings.slice(0, 15)) {
        const value = holding.marketValue ? `$${holding.marketValue.toLocaleString()}` : "N/A";
        carteraActualSection += `- ${holding.fundName} (${holding.securityId || "N/A"}): ${value}\n`;
      }
      if (statementHoldings.length > 15) {
        carteraActualSection += `... y ${statementHoldings.length - 15} posiciones más\n`;
      }
    }

    if (portfolioData?.statement?.endingValue && !portfolioData?.composition?.totalValue) {
      carteraActualSection += `
### Valor Total Actual: $${portfolioData.statement.endingValue.toLocaleString()}
`;
    }
  }

  // Obtener distribución recomendada usando el sistema de benchmarks real
  const benchmark = getBenchmarkFromScore(client.puntaje_riesgo, true, "global");
  const distribucion = {
    rv: benchmark.weights.equities,
    rf: benchmark.weights.fixedIncome,
    alt: benchmark.weights.alternatives,
    cash: benchmark.weights.cash,
  };

  // Mapeo de banda a descripción amigable
  const bandDescriptions: Record<string, string> = {
    defensivo: "defensivo, priorizando la preservación de capital",
    moderado: "moderado, buscando un balance entre crecimiento y seguridad",
    crecimiento: "orientado al crecimiento, con mayor exposición a renta variable",
    agresivo: "agresivo, maximizando el potencial de crecimiento a largo plazo",
  };
  const bandaDescripcion = bandDescriptions[benchmark.band] || "moderado";

  return `Eres un asesor financiero de Greybark Research. Tu tarea es generar una cartera de inversión personalizada para un cliente.

IMPORTANTE: El cliente NO es un especialista en finanzas. Debes explicar todo en lenguaje simple y educativo, como si le explicaras a alguien que recién comienza a invertir.

## CLIENTE
- Nombre: ${client.nombre} ${client.apellido}
- Perfil de Riesgo: ${client.perfil_riesgo}
- Puntaje de Riesgo: ${client.puntaje_riesgo}/100
- Monto a Invertir: ${montoStr}

## DISTRIBUCIÓN RECOMENDADA PARA SU PERFIL
- Perfil del cliente: ${client.perfil_riesgo} (puntaje: ${client.puntaje_riesgo}/100)
- Banda de inversión: ${benchmark.band} (${bandaDescripcion})
- Renta Variable (acciones): ${distribucion.rv}%
- Renta Fija (bonos): ${distribucion.rf}%
- Alternativos: ${distribucion.alt}%
- Cash/Liquidez: ${distribucion.cash}%

IMPORTANTE: La cartera DEBE respetar aproximadamente esta distribución. Un cliente ${client.perfil_riesgo} con banda ${benchmark.band} debe tener ~${distribucion.rv}% en renta variable.
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

## INSTRUCCIONES DE LENGUAJE

CRÍTICO - Usa lenguaje educativo y simple:
1. Cuando menciones un ETF, SIEMPRE explica qué es en términos simples
   - Ejemplo: "VOO (Vanguard S&P 500): Invierte en las 500 empresas más grandes de Estados Unidos como Apple, Microsoft y Amazon"
   - Ejemplo: "TLT (iShares 20+ Year Treasury Bond): Invierte en bonos del gobierno de EE.UU. a largo plazo, considerados muy seguros"
2. Evita jerga técnica sin explicar. Si usas términos como "duración", "spread", "beta", explícalos
3. Explica POR QUÉ algo es bueno para el cliente, no solo qué es
4. Usa analogías cuando ayude a entender

## FORMATO DE RESPUESTA

Responde ÚNICAMENTE con JSON válido (sin markdown, sin comentarios):

{
  "contextoPerfil": "Un párrafo explicando qué significa ser un inversionista con perfil ${client.perfil_riesgo}. DEBE incluir los porcentajes exactos: ${distribucion.rv}% en renta variable, ${distribucion.rf}% en renta fija, ${distribucion.alt}% en alternativos y ${distribucion.cash}% en liquidez. Ejemplo: '${client.nombre}, usted tiene un perfil ${client.perfil_riesgo} con un puntaje de ${client.puntaje_riesgo}/100, lo que lo ubica en una estrategia ${bandaDescripcion}. Para su perfil, la distribución recomendada es: ${distribucion.rv}% en renta variable (acciones), ${distribucion.rf}% en renta fija (bonos), ${distribucion.alt}% en inversiones alternativas y ${distribucion.cash}% en liquidez. Esto significa que [explicar beneficio según perfil].' Ser cálido y profesional.",
  "resumenEjecutivo": "Texto de 2-3 párrafos dirigido al cliente explicando la visión actual del mercado en términos simples, ${client.portfolio_data ? "cómo está su cartera actual comparada con lo ideal, " : ""}y qué estamos recomendando. NO repetir la explicación del perfil (ya está en contextoPerfil). Usar lenguaje accesible.",
  "cartera": [
    {
      "clase": "Renta Variable" | "Renta Fija" | "Commodities" | "Cash",
      "ticker": "VOO",
      "nombre": "Vanguard S&P 500 ETF",
      "descripcionSimple": "Invierte en las 500 empresas más grandes de Estados Unidos. Incluye gigantes tecnológicos como Apple y Microsoft, bancos, empresas de salud y consumo.",
      "porcentaje": 20,
      "justificacion": "Le recomendamos este fondo porque [razón vinculada a visión del comité en lenguaje simple]"
    }
  ],
  ${client.portfolio_data ? `"cambiosSugeridos": [
    {
      "tipo": "vender" | "reducir" | "mantener" | "aumentar" | "comprar",
      "instrumento": "Nombre del fondo/ETF con explicación simple",
      "razon": "Explicación clara de por qué hacer este cambio, en lenguaje simple"
    }
  ],` : ""}
  "riesgos": [
    "Explicación simple de un riesgo. Por ejemplo: 'Si la inflación en EE.UU. sube más de lo esperado, los bonos podrían perder valor temporalmente'",
    "Otro riesgo explicado de forma accesible"
  ],
  "proximosMonitorear": [
    "Evento explicado claramente. Por ejemplo: 'La reunión de la Reserva Federal el 15 de marzo, donde decidirán si suben o bajan las tasas de interés'"
  ]
}

REGLAS CRÍTICAS:
- Los porcentajes deben sumar 100%
- CRÍTICO: La suma de posiciones de Renta Variable debe ser aproximadamente ${distribucion.rv}% (±5%)
- CRÍTICO: La suma de posiciones de Renta Fija debe ser aproximadamente ${distribucion.rf}% (±5%)
- El contextoPerfil DEBE incluir los porcentajes exactos: ${distribucion.rv}% RV, ${distribucion.rf}% RF
- Cada posición en cartera DEBE tener descripcionSimple explicando qué hace ese ETF
- Usa los ETFs del Focus List del reporte de Asset Allocation cuando sea posible
- Máximo 8-10 posiciones en la cartera
- Incluye al menos 2-3 riesgos relevantes del reporte Macro
- TODO debe estar en lenguaje simple, como explicándole a alguien sin conocimiento financiero
${client.portfolio_data ? "- En cambiosSugeridos, explica claramente qué fondos vender/reducir y por qué" : ""}`;
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
