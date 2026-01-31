import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo PDF" }, { status: 400 });
    }

    // Convert PDF to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    console.log("Sending PDF to Claude API for analysis...");

    // Call Claude API to extract data from PDF
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
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
                text: `Analiza este factsheet de fondo mutuo y extrae TODA la información en formato JSON.

IMPORTANTE: Responde ÚNICAMENTE con JSON válido, sin markdown, sin texto adicional, sin explicaciones.

Estructura JSON requerida:

{
  "nombre": "Nombre completo del fondo",
  "manager": "Nombre del manager principal",
  "experiencia_anos": número,
  "aum": número (en dólares, sin formato),
  "benchmark": "Nombre del benchmark/índice",
  "alpha": número (en porcentaje, puede ser negativo),
  "beta": número,
  "sharpe_ratio": número o null,
  "tracking_error": número (en porcentaje),
  "information_ratio": número,
  "r_squared": número (entre 0 y 1),
  "expense_ratio": número (en porcentaje),
  "dividend_yield": número (en porcentaje),
  "inception_date": "DD MMM YYYY",
  "retornos": {
    "1y": {"fondo": número, "benchmark": número},
    "3y": {"fondo": número, "benchmark": número},
    "5y": {"fondo": número, "benchmark": número},
    "10y": {"fondo": número, "benchmark": número}
  },
  "sectors": {
    "fondo": {
      "Sector1": porcentaje,
      "Sector2": porcentaje,
      ...
    },
    "benchmark": {
      "Sector1": porcentaje,
      "Sector2": porcentaje,
      ...
    }
  },
  "holdings": [
    {
      "ticker": "MSFT",
      "name": "Microsoft Corp",
      "fondo": porcentaje,
      "benchmark": porcentaje
    },
    ...top 10 holdings
  ],
  "historical": [
    {
      "date": "YYYY-MM-DD",
      "fondo": valor normalizado a 100,
      "benchmark": valor normalizado a 100
    },
    ...últimos 5 años, datos mensuales
  ],
  "active_share": número (en porcentaje),
  "num_posiciones": número
}

NOTAS CRÍTICAS:
1. Si un valor no está en el PDF, usa valores razonables o null
2. Para "historical", genera datos mensuales sintéticos normalizados a 100 basándote en los retornos anuales
3. Todos los porcentajes deben ser números (ej: 1.84 para 1.84%)
4. El AUM debe ser número sin formato (ej: 20200000000 para $20.2B)
5. Los sectores deben estar en español y agrupados correctamente
6. Asegúrate de que la suma de sectores sume ~100%

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

    // Extract JSON from Claude's response
    let fundData;
    try {
      // Claude might return text content
      const textContent = data.content.find((c: any) => c.type === "text")?.text || "";
      
      // Remove markdown code blocks if present
      let jsonText = textContent.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?$/g, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/```\n?/g, "");
      }

      fundData = JSON.parse(jsonText);
      console.log("Fund data parsed successfully");
    } catch (parseError) {
      console.error("Error parsing JSON from Claude:", parseError);
      console.log("Raw response:", data.content);
      throw new Error("Error al procesar respuesta de Claude");
    }

    // Validate required fields
    if (!fundData.nombre || !fundData.manager) {
      throw new Error("Datos incompletos del fondo");
    }

    return NextResponse.json(fundData);
  } catch (error: any) {
    console.error("Error in analyze-fund API:", error);
    return NextResponse.json(
      {
        error: error.message || "Error al analizar el fondo",
        details: "Verifica que el PDF sea un factsheet válido",
      },
      { status: 500 }
    );
  }
}
