import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

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

// Post-procesar números que pueden haber sido mal parseados
// Ej: "113.800.300" parseado como 113.8003 en lugar de 113800300
function fixChileanNumbers(parsed: {
  holdings?: Array<{
    marketValue?: number;
    costBasis?: number;
    quantity?: number;
    marketPrice?: number;
    [key: string]: unknown;
  }>;
  endingValue?: number;
  beginningValue?: number;
  [key: string]: unknown;
}): void {
  // Función para detectar y corregir un número
  const fixNumber = (value: number | undefined): number | undefined => {
    if (value === undefined || value === null || value === 0) return value;

    // Si el número tiene muchos decimales (ej: 113.800300), probablemente
    // los puntos fueron interpretados como decimales en lugar de miles
    const strValue = value.toString();

    // Detectar patrón de número mal parseado: tiene decimales con 3+ dígitos
    // Ej: 113.800300 (debería ser 113800300) o 25.500 (debería ser 25500)
    if (strValue.includes('.')) {
      const parts = strValue.split('.');
      const decimalPart = parts[1] || '';

      // Si la parte decimal tiene 3+ dígitos o parece un grupo de miles
      // Ej: 113.800 -> decimal tiene 3 dígitos exactos (patrón de miles)
      if (decimalPart.length === 3 || decimalPart.length === 6) {
        // Probablemente mal parseado - remover los puntos
        const fixed = parseFloat(strValue.replace(/\./g, ''));
        if (!isNaN(fixed)) {
          return fixed;
        }
      }

      // Si el valor es muy pequeño para ser pesos chilenos pero tiene decimales
      // y parece un patrón de miles mal parseado
      if (value < 1000 && decimalPart.length >= 3) {
        const fixed = parseFloat(strValue.replace(/\./g, ''));
        if (!isNaN(fixed) && fixed > 10000) {
          return fixed;
        }
      }
    }

    return value;
  };

  // Corregir valores principales
  if (parsed.endingValue) {
    parsed.endingValue = fixNumber(parsed.endingValue) ?? parsed.endingValue;
  }
  if (parsed.beginningValue) {
    parsed.beginningValue = fixNumber(parsed.beginningValue) ?? parsed.beginningValue;
  }

  // Corregir holdings
  if (parsed.holdings && Array.isArray(parsed.holdings)) {
    for (const holding of parsed.holdings) {
      if (holding.marketValue) {
        holding.marketValue = fixNumber(holding.marketValue) ?? holding.marketValue;
      }
      if (holding.costBasis) {
        holding.costBasis = fixNumber(holding.costBasis) ?? holding.costBasis;
      }
      // quantity y marketPrice pueden tener decimales legítimos, no los corregimos
    }
  }
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "parse-statement", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
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
IMPORTANTE: El documento puede tener MÚLTIPLES PÁGINAS. Debes extraer TODOS los holdings de TODAS las páginas, no solo la primera.

RESPONDE ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones:
{
  "clientName": "string",
  "accountNumber": "string",
  "period": "string - LA FECHA ES MUY IMPORTANTE",
  "beginningValue": number,
  "endingValue": number,
  "fees": number,
  "cashBalance": number,
  "holdings": [
    {
      "fundName": "string (nombre completo del fondo o instrumento)",
      "securityId": "string (Security Identifier / CUSIP / ISIN / ticker)",
      "market": "CL | INT | US",
      "quantity": number,
      "unitCost": number,
      "costBasis": number,
      "marketPrice": number,
      "marketValue": number,
      "unrealizedGainLoss": number,
      "isPrevisional": boolean
    }
  ]
}

REGLAS PARA "period" (FECHA) - MUY IMPORTANTE:
- BUSCA la fecha del documento en estas ubicaciones típicas:
  * Encabezado: "Fecha:", "Date:", "Al:", "As of:", "Statement Date:", "Periodo:", "Cierre:"
  * Título: "Cartola al 31/01/2025", "Estado de Cuenta Enero 2025"
  * Pie de página o marca de agua con fecha
- Formatos comunes de fecha a buscar:
  * "al 31/01/2025" o "al 31-01-2025" o "al 31.01.2025"
  * "31 de enero de 2025" o "31 de Enero 2025"
  * "Enero 2025" o "Febrero 2026" (usar último día del mes)
  * "01/31/2025" o "2025-01-31" (formato ISO)
  * "Jan 31, 2025" o "January 2025"
- Si encuentras múltiples fechas, usa la fecha de CIERRE o la más reciente
- SIEMPRE incluye el campo period con la fecha encontrada, NO lo dejes null
- Formato de salida preferido: "DD/MM/YYYY" o el formato original del documento

REGLAS CRÍTICAS PARA NÚMEROS - FORMATO CHILENO:
En Chile y España, el formato de números es OPUESTO al de USA:
- PUNTO (.) = separador de MILES (como la coma en USA)
- COMA (,) = separador DECIMAL (como el punto en USA)

CONVERSIÓN OBLIGATORIA:
| En el PDF (Chile)  | En el JSON (número) |
| "113.800.300"      | 113800300           |
| "50.000.000"       | 50000000            |
| "1.234.567"        | 1234567             |
| "25.500"           | 25500               |
| "1.234,56"         | 1234.56             |
| "99,5"             | 99.5                |

PROCESO: Elimina TODOS los puntos (son miles), luego cambia la coma por punto decimal.

CONTEXTO: Los portfolios chilenos valen MILLONES de pesos.
- $113.800.300 = ciento trece millones (NO es 113.8)
- $25.500 = veinticinco mil quinientos (NO es 25.5)

Si un campo no se encuentra, usa null para strings y 0 para números.
unrealizedGainLoss puede ser negativo.

REGLAS PARA "market" (CLASIFICACIÓN DE MERCADO):
Clasifica CADA holding en uno de estos mercados:
- "CL" = Fondo mutuo chileno, ETF chileno, acción chilena, o ADR en Bolsa de Santiago
  Indicadores: AGF chileno (Banchile, BTG, LarrainVial, Santander, Security, etc.),
  RUN numérico de 3-5 dígitos, nemotécnicos como CFIETF*, acciones como BSANTANDER, SQM-B,
  ADRs chilenos terminados en "CL" (GOOGLCL, NVDACL, etc.), moneda CLP o UF
- "INT" = Fondo mutuo internacional (SICAV Luxemburgo, Irlanda, Bermuda, Caimán, etc.)
  Indicadores: CUSIP empezando con G (Bermuda) o L (Luxemburgo), ISIN con prefijo LU/IE/KY,
  gestoras como JPMorgan, Robeco, Schroder, Ninety One, Wellington, Franklin Templeton,
  Pershing/Banchile Corredores como custodio, precios en USD con decimales tipo NAV
- "US" = Acción o ETF listado en bolsa estadounidense (NYSE/NASDAQ)
  Indicadores: ticker corto 1-5 letras (AAPL, VOO, VTI, BND), precio en USD

REGLAS PARA "isPrevisional" (FONDOS PREVISIONALES vs VOLUNTARIOS):
Determina si cada holding es un fondo previsional (ahorro obligatorio/pensión) o voluntario:
- isPrevisional = true si:
  * El fondo pertenece a una AFP (Habitat, Capital, Cuprum, Modelo, PlanVital, Provida, Uno)
  * El nombre incluye "APV", "Ahorro Previsional", "Cuenta 2", "Cuenta Obligatoria"
  * La sección del documento dice "Ahorro Previsional", "Fondos de Pensiones", "AFP"
  * Es un fondo tipo A, B, C, D, E de una AFP
- isPrevisional = false si:
  * Es un fondo mutuo de una AGF (administradora general de fondos)
  * Es una acción, ETF, bono, o instrumento de renta fija
  * La sección dice "Inversiones Voluntarias", "Cartera de Inversión", "Fondos Mutuos"
  * No hay indicadores previsionales

OTRAS REGLAS:
- RECORRE TODAS LAS PÁGINAS del documento, no solo la primera
- Extrae TODOS los holdings/posiciones listados en todo el documento
- Busca secciones como "Portfolio Holdings", "Investment Positions", "Asset Detail", "Detalle de Inversiones", "Posiciones", etc.
- Si hay holdings en varias páginas (continuación de tabla), inclúyelos todos
- Verifica que el número total de holdings extraídos coincida con lo que muestra el documento

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

      // Post-procesar para corregir números mal parseados (formato chileno)
      fixChileanNumbers(parsed);
    } catch (parseError) {
      console.error("Error parsing JSON from Claude:", parseError);
      throw new Error("Error al procesar respuesta de Claude");
    }

    // Detectar moneda
    const textContent = data.content.find((c: { type: string; text?: string }) => c.type === "text")?.text || "";
    const currencyDetection = detectCurrency(parsed, textContent);

    // Si no se encontró fecha, intentar extraerla del texto de Claude
    if (!parsed.period) {
      const datePatterns = [
        // "al DD/MM/YYYY" format
        /al\s+(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/i,
        // DD/MM/YYYY or DD-MM-YYYY
        /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/,
        // YYYY-MM-DD
        /(\d{4})-(\d{2})-(\d{2})/,
        // Month Year (Spanish)
        /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i,
        // Month Year (English)
        /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
      ];

      for (const pattern of datePatterns) {
        const match = textContent.match(pattern);
        if (match) {
          parsed.period = match[0];
          break;
        }
      }
    }

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
        error: "Error al procesar la solicitud",
      },
      { status: 500 }
    );
  }
}
