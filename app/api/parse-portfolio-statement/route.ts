import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { extractText, getDocumentProxy } from "unpdf";
import { validateUpload } from "@/lib/upload-validation";
import { errorResponse, handleApiError } from "@/lib/api-response";

export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// AGFs chilenos conocidos
const CHILEAN_AGFS = [
  "banchile", "bci", "btg", "larrainvial", "santander", "security", "sura",
  "itau", "principal", "bice", "credicorp", "scotia", "compass",
  "moneda", "euroamerica", "nevasa", "renta4", "vector", "tanner",
  "raymond james"
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

// Post-procesar bonos: extraer couponRate, maturityDate, creditRating del fundName
// cuando Claude los deja embebidos en el nombre (ej: "AT&T INC 4.750% 05/15/2046 BBB+")
const SP_RATING_REGEX = /\b(AAA|AA\+|AA-|AA|A\+|A-|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|CCC\+|CCC-|CCC|CC|C|D|NR|WR)\b/i;
const COUPON_REGEX = /\b(\d{1,2}(?:\.\d{1,4})?)\s*%/;
const MATURITY_DATE_REGEX = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/;
const MATURITY_ISO_REGEX = /\b(\d{4})-(\d{2})-(\d{2})\b/;

// Moody's → S&P conversion
const MOODYS_TO_SP: Record<string, string> = {
  "AAA": "AAA", "AA1": "AA+", "AA2": "AA", "AA3": "AA-",
  "A1": "A+", "A2": "A", "A3": "A-",
  "BAA1": "BBB+", "BAA2": "BBB", "BAA3": "BBB-",
  "BA1": "BB+", "BA2": "BB", "BA3": "BB-",
  "B1": "B+", "B2": "B", "B3": "B-",
  "CAA1": "CCC+", "CAA2": "CCC", "CAA3": "CCC-",
  "CA": "CC", "C": "C",
};
const MOODYS_REGEX = /\b(Aaa|Aa[123]|A[123]|Baa[123]|Ba[123]|B[123]|Caa[123]|Ca|C)\b/i;

function convertMoodysToSP(rating: string): string {
  return MOODYS_TO_SP[rating.toUpperCase()] || rating;
}

function extractRatingFromText(text: string): string | null {
  // Try S&P-style first
  const spMatch = text.match(SP_RATING_REGEX);
  if (spMatch) return spMatch[1].toUpperCase();
  // Try Moody's and convert
  const moodysMatch = text.match(MOODYS_REGEX);
  if (moodysMatch) return convertMoodysToSP(moodysMatch[1]);
  return null;
}

function extractBondFields(holdings: Array<Record<string, unknown>>): void {
  for (const h of holdings) {
    if (h.assetType !== "bond") continue;
    const name = String(h.fundName || "");
    if (!name) continue;

    // Extract couponRate from fundName if missing
    if (!h.couponRate || h.couponRate === 0) {
      const couponMatch = name.match(COUPON_REGEX);
      if (couponMatch) {
        h.couponRate = parseFloat(couponMatch[1]);
      }
    }

    // Extract maturityDate from fundName if missing
    if (!h.maturityDate) {
      // Try MM/DD/YYYY or MM-DD-YYYY
      const dateMatch = name.match(MATURITY_DATE_REGEX);
      if (dateMatch) {
        const [, p1, p2, year] = dateMatch;
        // Assume MM/DD/YYYY (US format, common in Stonex)
        const month = p1.padStart(2, "0");
        const day = p2.padStart(2, "0");
        h.maturityDate = `${year}-${month}-${day}`;
      } else {
        // Try YYYY-MM-DD
        const isoMatch = name.match(MATURITY_ISO_REGEX);
        if (isoMatch) {
          h.maturityDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
        }
      }
    }

    // Extract creditRating from fundName if missing
    if (!h.creditRating) {
      h.creditRating = extractRatingFromText(name);
    }
    // Convert Moody's rating to S&P if needed
    if (h.creditRating && typeof h.creditRating === "string") {
      const moodysCheck = String(h.creditRating).match(MOODYS_REGEX);
      if (moodysCheck) {
        h.creditRating = convertMoodysToSP(moodysCheck[1]);
      }
    }

    // Clean fundName: remove extracted data, keep issuer name only
    let cleanName = name;
    // Remove coupon (e.g., "4.750%")
    cleanName = cleanName.replace(/\s*\d{1,2}(?:\.\d{1,4})?\s*%/g, "");
    // Remove date (e.g., "05/15/2046" or "2046-05-15")
    cleanName = cleanName.replace(/\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/g, "");
    cleanName = cleanName.replace(/\s*\d{4}-\d{2}-\d{2}/g, "");
    // Remove S&P-style rating
    cleanName = cleanName.replace(SP_RATING_REGEX, "");
    // Remove Moody's-style rating
    cleanName = cleanName.replace(MOODYS_REGEX, "");
    // Remove "Rating Information:" prefix and Moody's/S&P labels
    cleanName = cleanName.replace(/Rating\s*Information\s*:?/gi, "");
    cleanName = cleanName.replace(/Moody'?s?\s*:\s*/gi, "");
    cleanName = cleanName.replace(/S&P\s*:\s*/gi, "");
    cleanName = cleanName.replace(/Fitch\s*:\s*/gi, "");
    // Remove trailing/leading spaces, dashes, slashes
    cleanName = cleanName.replace(/[\s\/\-]+$/g, "").replace(/^[\s\/\-]+/g, "").trim();
    // Collapse multiple spaces
    cleanName = cleanName.replace(/\s{2,}/g, " ");

    if (cleanName.length >= 3) {
      h.fundName = cleanName;
    }
  }
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

  return handleApiError("parse-statement-post", async () => {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const password = formData.get("password") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo PDF" },
        { status: 400 }
      );
    }

    const uploadError = validateUpload(file, {
      maxSizeMB: 10,
      allowedTypes: ["application/pdf"],
      allowedExtensions: [".pdf"],
    });
    if (uploadError) return errorResponse(uploadError, 400);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // If password provided, decrypt PDF via pdf.js and send as text instead of document
    let contentBlock: { type: string; source?: Record<string, string>; text?: string };
    if (password) {
      try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer), { password });
        const { text: pdfText } = await extractText(pdf, { mergePages: true });
        if (!pdfText || pdfText.trim().length === 0) {
          return NextResponse.json(
            { error: "No se pudo extraer texto del PDF protegido. Verifica la contraseña." },
            { status: 400 }
          );
        }
        contentBlock = {
          type: "text",
          text: `[Contenido extraído de PDF protegido con contraseña]\n\n${pdfText}`,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("password") || msg.includes("Password") || msg.includes("decrypt")) {
          return NextResponse.json(
            { error: "Contraseña incorrecta para el PDF" },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: `Error al desencriptar PDF: ${msg}` },
          { status: 400 }
        );
      }
    } else {
      const base64 = buffer.toString("base64");
      contentBlock = {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      };
    }

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
              contentBlock,
              {
                type: "text",
                text: `Analiza esta cartola o estado de cuenta de inversiones y extrae los datos como JSON.
El documento puede ser de cualquier institución financiera (corredora de bolsa, banco, custodio, clearing house, etc.).
IMPORTANTE: El documento puede tener MÚLTIPLES PÁGINAS. Debes extraer TODOS los holdings de TODAS las páginas, no solo la primera.

RESPONDE ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones:
{
  "clientName": "string",
  "accountNumber": "string",
  "institution": "string (nombre de la institución: BCI, LarrainVial, Santander, Raymond James, Stonex, etc.)",
  "institutionType": "agf | corredora | internacional",
  "period": "string - LA FECHA ES MUY IMPORTANTE",
  "beginningValue": number,
  "endingValue": number,
  "fees": number,
  "cashBalance": number,
  "holdings": [
    {
      "fundName": "string (nombre completo del fondo o instrumento)",
      "securityId": "string — Para acciones y ETFs: SIEMPRE usar el TICKER (ej: CRDO, QQQ, SPY, MU). Para bonos: usar el CUSIP. Si el documento muestra TICKER/CUSIP (ej: CRDO/G25457105), usar SOLO el ticker para stocks/ETFs y SOLO el CUSIP para bonds.",
      "market": "CL | INT | US",
      "assetType": "fund | etf | stock | bond | cash | other",
      "quantity": number,
      "unitCost": number,
      "costBasis": number,
      "marketPrice": number,
      "marketValue": number,
      "unrealizedGainLoss": number,
      "isPrevisional": boolean,
      "couponRate": number | null,
      "maturityDate": "string (YYYY-MM-DD) | null",
      "creditRating": "string | null",
      "currency": "string (USD, CLP, EUR, etc.)",
      "estIncomeYield": number | null,
      "estAnnualIncome": number | null
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

REGLAS PARA "assetType" (TIPO DE INSTRUMENTO):
- "bond" = Bono corporativo, soberano, treasury, note. Indicadores: cupón (ej "4.750%"), fecha de vencimiento (ej "02/15/2030"), CUSIP, calificación crediticia (BBB+, BB, etc.), "Fixed Income", "Corporate Bond", "Treasury", "Note"
- "fund" = Fondo mutuo (chileno o internacional)
- "etf" = ETF listado en bolsa
- "stock" = Acción individual
- "cash" = Efectivo, money market, sweep, depósito a plazo
- "other" = Cualquier otro instrumento

REGLAS PARA BONOS (assetType = "bond"):
- "fundName": SOLO el nombre del emisor, SIN cupón, SIN fecha, SIN rating. Ej: "AT&T Inc", "Goldman Sachs Group Inc", "Ford Motor Co"
- "couponRate": Tasa del cupón como porcentaje (ej: 4.75 para un bono con cupón 4.750%). EXTRAER del nombre/descripción del bono, NO dejarlo null.
- "maturityDate": Fecha de vencimiento en formato YYYY-MM-DD. EXTRAER del nombre/descripción del bono (ej: "05/15/2046" → "2046-05-15"). NO dejarlo null.
- "creditRating": Rating crediticio. BUSCAR en la línea debajo del nombre del bono donde aparece "Rating Information", "Moody's:", "S&P:", "Fitch:". Usar el rating S&P si hay varios (ej: "Moody's: Baa2 / S&P: BBB" → "BBB"). Si solo hay Moody's, convertir a escala S&P (Aaa→AAA, Aa1→AA+, A1→A+, Baa1→BBB+, Ba1→BB+, B1→B+, Caa1→CCC+). NO dejarlo null si aparece rating.
- "quantity": Valor nominal (face value / par value), NO el número de bonos. Ej: 200000 para USD 200,000 face value
- "marketPrice": Precio como porcentaje del par (ej: 98.50 para un bono cotizando a 98.5% del par)
- "marketValue": Valor de mercado total en la moneda del documento
- "costBasis": Costo de adquisición total
- "unitCost": Precio de compra como porcentaje del par
- "securityId": CUSIP o ISIN del bono
- "currency": Moneda del bono (generalmente USD para bonos internacionales)

FORMATO TÍPICO DE BONOS EN CARTOLAS (ej: Stonex, Pershing):
La descripción del bono suele tener esta estructura:
  Línea 1: "EMISOR CUPÓN% MM/DD/YYYY" (ej: "AT&T INC 4.750% 05/15/2046")
  Línea 2: "Rating Information: Moody's: Baa2 / S&P: BBB" (o similar)
  Línea 3: CUSIP, cantidad, precios, etc.
DEBES descomponer la línea 1 en: fundName="AT&T INC", couponRate=4.75, maturityDate="2046-05-15"
DEBES extraer el rating de la línea 2 en: creditRating="BBB"

REGLAS PARA "estIncomeYield" y "estAnnualIncome":
- "estIncomeYield": Rendimiento estimado anual (%). Aparece como "Est. Income Yield", "Yield", "Income Yield" en la cartola. Para bonos es el cupón / precio. Para acciones/ETFs es el dividend yield. Si no aparece, usar null.
- "estAnnualIncome": Ingreso anual estimado en la moneda del instrumento. Aparece como "Est. Annual Income", "Annual Income". Para bonos son los cupones anuales. Para acciones/ETFs son los dividendos anuales estimados. Si no aparece, usar null.

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

REGLAS PARA "institution" e "institutionType":
- "institution": Nombre de la institución financiera que emite el documento. Buscar en encabezado, logo, pie de página.
  Ejemplos: "BCI", "LarrainVial", "Santander", "BTG Pactual", "Stonex", "Pershing", "Raymond James", "Credicorp", "Security"
- "institutionType": Tipo de institución:
  * "agf" = Administradora General de Fondos. Solo vende fondos mutuos propios. Indicadores: "AGF", "Administradora", solo tiene fondos mutuos de la misma casa, RUN numéricos
  * "corredora" = Corredora de Bolsa. Puede tener acciones, ETFs, fondos de múltiples casas, bonos. Indicadores: "Corredores", "Corredora de Bolsa", mezcla de instrumentos de distintas gestoras, acciones chilenas, ETFs
  * "internacional" = Custodio internacional. Indicadores: Stonex, Pershing, Raymond James, clearing house, instrumentos en USD, bonos corporativos, fondos SICAV, CUSIPs

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

      // Post-procesar bonos: extraer campos del fundName si Claude los dejó embebidos
      if (parsed.holdings && Array.isArray(parsed.holdings)) {
        extractBondFields(parsed.holdings as Array<Record<string, unknown>>);
      }
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
  });
}
