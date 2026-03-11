import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// AGFs chilenos conocidos
const CHILEAN_AGFS = [
  "banchile", "btg", "larrainvial", "santander", "security", "sura",
  "itau", "principal", "bice", "credicorp", "scotia", "compass",
  "moneda", "euroamerica", "nevasa", "renta4", "vector", "tanner"
];

// Detectar moneda basado en heurísticas
function detectCurrency(parsed: {
  holdings?: Array<{ marketValue?: number }>;
  endingValue?: number;
  clientName?: string;
}, rawText?: string): { currency: "USD" | "CLP"; confidence: "high" | "medium" | "low"; reason: string } {

  // Calcular valor total
  const totalValue = parsed.endingValue ||
    (parsed.holdings?.reduce((sum, h) => sum + (h.marketValue || 0), 0) || 0);

  // Buscar indicadores en el texto
  const textLower = (rawText || "").toLowerCase();
  const clientLower = (parsed.clientName || "").toLowerCase();

  // Indicadores fuertes de USD
  if (textLower.includes("usd") || textLower.includes("us$") || textLower.includes("u.s. dollar")) {
    return { currency: "USD", confidence: "high", reason: "Texto menciona USD explícitamente" };
  }

  // Indicadores fuertes de CLP
  if (textLower.includes("clp") || textLower.includes("pesos chilenos") || textLower.includes("peso chileno")) {
    return { currency: "CLP", confidence: "high", reason: "Texto menciona CLP explícitamente" };
  }

  // Verificar si es AGF chileno
  const isChileanAGF = CHILEAN_AGFS.some(agf =>
    textLower.includes(agf) || clientLower.includes(agf)
  );

  // Heurística principal: valor total
  // Portfolios en CLP típicamente son millones (ej: $50.000.000 CLP = ~$55,000 USD)
  // Portfolios en USD típicamente son miles o cientos de miles
  if (totalValue > 1_000_000) {
    // Valores muy altos sugieren CLP
    if (isChileanAGF) {
      return { currency: "CLP", confidence: "high", reason: `Valor ${totalValue.toLocaleString()} con AGF chileno` };
    }
    return { currency: "CLP", confidence: "medium", reason: `Valor alto: ${totalValue.toLocaleString()}` };
  } else if (totalValue > 0) {
    // Valores menores a 1 millón sugieren USD
    if (isChileanAGF) {
      // AGF chileno pero valor bajo - podría ser cuenta en USD
      return { currency: "USD", confidence: "medium", reason: `Valor ${totalValue.toLocaleString()} (bajo para CLP)` };
    }
    return { currency: "USD", confidence: "medium", reason: `Valor ${totalValue.toLocaleString()} sugiere USD` };
  }

  // Default basado en AGF
  if (isChileanAGF) {
    return { currency: "CLP", confidence: "low", reason: "AGF chileno detectado" };
  }

  return { currency: "USD", confidence: "low", reason: "Default USD (sin indicadores claros)" };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo PDF" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    console.log("Sending portfolio statement to Claude API...");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: `Analiza esta cartola o estado de cuenta de inversiones y extrae los datos como JSON.
El documento puede ser de cualquier institución financiera (corredora de bolsa, banco, custodio, clearing house, etc.).

RESPONDE ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones:
{
  "clientName": "string",
  "accountNumber": "string",
  "period": "string (ej: 'Jan 2025' o '31/01/2025')",
  "beginningValue": number,
  "endingValue": number,
  "fees": number,
  "cashBalance": number,
  "holdings": [
    {
      "fundName": "string (nombre completo del fondo o instrumento)",
      "securityId": "string (Security Identifier / CUSIP / ISIN / ticker)",
      "quantity": number,
      "unitCost": number,
      "costBasis": number,
      "marketPrice": number,
      "marketValue": number,
      "unrealizedGainLoss": number
    }
  ]
}

REGLAS IMPORTANTES PARA NÚMEROS:
- TODOS los números deben ser valores numéricos puros SIN formato
- Documentos chilenos usan PUNTOS para separar miles y COMAS para decimales
  Ejemplo: "113.179.528" en Chile = 113179528 (ciento trece millones)
  Ejemplo: "1.234,56" en Chile = 1234.56
- Documentos USA usan COMAS para miles y PUNTOS para decimales
  Ejemplo: "113,179,528" en USA = 113179528
- ELIMINA todos los separadores de miles y convierte comas decimales a puntos
- Si un campo no se encuentra, usa null para strings y 0 para números
- unrealizedGainLoss puede ser negativo

OTRAS REGLAS:
- Extrae TODOS los holdings/posiciones listados
- Busca secciones como "Portfolio Holdings", "Investment Positions", "Asset Detail", "Detalle de Inversiones", "Posiciones", etc.
- El documento puede ser de cualquier institución: Pershing, Banchile, BTG Pactual, LarrainVial, Credicorp, Itaú, Scotiabank, u otra

RESPONDE SOLO CON EL JSON, NADA MÁS.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Claude API error:", errorData);
      throw new Error("Error al analizar PDF con Claude API");
    }

    const data = await response.json();
    console.log("Claude API response received");

    let parsed;
    try {
      const textContent =
        data.content.find((c: { type: string; text?: string }) => c.type === "text")?.text || "";

      let jsonText = textContent.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?$/g, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/```\n?/g, "");
      }

      parsed = JSON.parse(jsonText);
      console.log("Portfolio statement parsed successfully");
    } catch (parseError) {
      console.error("Error parsing JSON from Claude:", parseError);
      console.log("Raw response:", data.content);
      throw new Error("Error al procesar respuesta de Claude");
    }

    // Detectar moneda
    const textContent = data.content.find((c: { type: string; text?: string }) => c.type === "text")?.text || "";
    const currencyDetection = detectCurrency(parsed, textContent);

    return NextResponse.json({
      ...parsed,
      detectedCurrency: currencyDetection.currency,
      currencyConfidence: currencyDetection.confidence,
      currencyReason: currencyDetection.reason,
    });
  } catch (error: unknown) {
    console.error("Error in parse-portfolio-statement API:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error al analizar la cartola",
        details: "Verifica que el PDF sea una cartola o estado de cuenta válido",
      },
      { status: 500 }
    );
  }
}
