import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

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
  "period": "string (ej: 'Jan 2025')",
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

REGLAS:
- Extrae TODOS los holdings/posiciones listados en el estado de cuenta
- Los números deben ser planos, sin símbolos de moneda ni comas
- Si un campo no se encuentra, usa null para strings y 0 para números
- unrealizedGainLoss puede ser negativo
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
        data.content.find((c: any) => c.type === "text")?.text || "";

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

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("Error in parse-portfolio-statement API:", error);
    return NextResponse.json(
      {
        error: error.message || "Error al analizar la cartola",
        details: "Verifica que el PDF sea una cartola o estado de cuenta válido",
      },
      { status: 500 }
    );
  }
}
