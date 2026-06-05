// lib/ficha-extract.ts
// PDF extraction for CMF fichas — Gemini AI primary, regex fallback
// Used by: sync-fichas, fichas-upload

import { extractText } from "unpdf";

export interface ExtractedFichaData {
  tac_serie: number | null;
  nombre_fondo_pdf: string | null;
  serie_detectada: string | null;
  rent_1m: number | null;
  rent_3m: number | null;
  rent_6m: number | null;
  rent_12m: number | null;
  rescatable: boolean | null;
  plazo_rescate: string | null;
  horizonte_inversion: string | null;
  tolerancia_riesgo: string | null;
  objetivo: string | null;
  beneficio_apv: boolean;
  beneficio_57bis: boolean;
  beneficio_107lir: boolean;
  beneficio_108lir: boolean;
  notas_tributarias: string | null;
  extraction_method: "gemini" | "regex";
}

export interface ExtractionResult {
  data: ExtractedFichaData;
  gemini_exhausted?: boolean;
}

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_PROMPT = `Extrae datos de esta ficha de fondo mutuo chileno (CMF).

BENEFICIO TRIBUTARIO — MUY IMPORTANTE:
Busca la seccion "Beneficio Tributario" en el PDF. Veras varias opciones listadas (APV, APVC, 57 bis LIR, 107 LIR, 108 LIR).
Cada opcion tiene un cuadrado/checkbox. UNO de esos cuadrados tiene un simbolo de check/tick/palomita (✓) adentro o encima — ese es el beneficio activo.
Los demas cuadrados estan vacios. Responde con el nombre de la opcion que tiene el check.
Si no logras distinguir cual tiene el check, responde con el que visualmente se vea diferente (marcado, relleno, o con simbolo).
Si definitivamente ninguno tiene marca, responde null.

Responde SOLO JSON valido sin markdown ni backticks. Porcentajes como numeros (5.00 no "5.00%"). Serie solo el codigo (ej: "B", "AFP", no incluir fecha ni "Serie").

{"nombre_fondo": "str", "serie": "str", "tac_serie_pct": "num o null", "rent_1m_pct": "num o null", "rent_3m_pct": "num o null", "rent_6m_pct": "num o null", "rent_12m_pct": "num o null", "rescatable": "bool o null", "plazo_rescate": "str o null", "horizonte_inversion": "str o null", "tolerancia_riesgo": "str o null", "objetivo": "str max 500 o null", "beneficio_tributario": "str (APV/APVC/57 LIR/107 LIR/108 LIR) o null"}`;

// --- Primary: Gemini AI extraction ---
async function extractWithGemini(buffer: ArrayBuffer): Promise<{ data: ExtractedFichaData; exhausted: boolean } | null> {
  if (!GEMINI_KEY) return null;

  const base64 = Buffer.from(buffer).toString("base64");
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: "application/pdf", data: base64 } },
            { text: GEMINI_PROMPT },
          ] }],
          generationConfig: { temperature: 0, maxOutputTokens: 4000 },
        }),
        signal: AbortSignal.timeout(60000),
      }
    );
  } catch {
    return null;
  }

  if (res.status === 429) {
    return { data: null as unknown as ExtractedFichaData, exhausted: true };
  }
  if (!res.ok) return null;

  const json = await res.json();
  let text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  // Clean markdown wrapper
  text = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  try {
    const parsed = JSON.parse(text);
    console.log("[GEMINI RAW]", JSON.stringify(parsed, null, 2));
    const ben = (parsed.beneficio_tributario || "").toUpperCase();
    return {
      exhausted: false,
      data: {
        tac_serie: validateTAC(parsed.tac_serie_pct ?? null),
        nombre_fondo_pdf: parsed.nombre_fondo || null,
        serie_detectada: parsed.serie || null,
        rent_1m: parsed.rent_1m_pct ?? null,
        rent_3m: parsed.rent_3m_pct ?? null,
        rent_6m: parsed.rent_6m_pct ?? null,
        rent_12m: parsed.rent_12m_pct ?? null,
        rescatable: parsed.rescatable ?? null,
        plazo_rescate: parsed.plazo_rescate || null,
        horizonte_inversion: parsed.horizonte_inversion || null,
        tolerancia_riesgo: parsed.tolerancia_riesgo || null,
        objetivo: parsed.objetivo || null,
        beneficio_apv: ben === "APV" || ben === "APVC",
        beneficio_57bis: ben === "57 LIR" || ben === "57BIS",
        beneficio_107lir: ben === "107 LIR",
        beneficio_108lir: ben === "108 LIR",
        notas_tributarias: parsed.beneficio_tributario || null,
        extraction_method: "gemini",
      },
    };
  } catch {
    return null;
  }
}

// --- TAC validation: range 0.01% - 8% (some money market can be very low) ---
function validateTAC(tac: number | null): number | null {
  if (tac === null || tac === undefined) return null;
  if (tac < 0.01 || tac > 8) {
    console.warn(`[ficha-extract] TAC ${tac}% outside valid range (0.01-8%), discarding`);
    return null;
  }
  return tac;
}

// --- Fallback: regex extraction ---
function extractWithRegex(text: string): ExtractedFichaData {
  let tac_serie: number | null = null;
  const tacMatch = text.match(/TAC\s+Serie\s+(?:\(?(?:IVA\s+incluido|Exento\s+de\s+IVA)\)?[\s()]*)+\s*([\d,]+)%/i);
  if (tacMatch) tac_serie = validateTAC(parseFloat(tacMatch[1].replace(",", ".")));

  const parseRent = (label: string): number | null => {
    const re = new RegExp("(?:" + label + "\\s*){1,4}\\s+(-?[\\d,.]+)%", "i");
    const m = text.match(re);
    if (m) return parseFloat(m[1].replace(",", "."));
    return null;
  };

  let nombre_fondo_pdf: string | null = null;
  let serie_detectada: string | null = null;
  const headerMatch = text.match(/FONDO\s+MUTUO\s+([^|]+)\|\s*SERIE\s+(\S+)/i);
  if (headerMatch) {
    nombre_fondo_pdf = headerMatch[1].trim();
    serie_detectada = headerMatch[2].trim();
  }
  if (!serie_detectada) {
    const serieMatch = text.match(/\bSerie\s+([A-Z][\w-]*)\b/);
    if (serieMatch) serie_detectada = serieMatch[1].trim();
  }

  const rescatableMatch = text.match(/Fondo\s+es\s+Rescatable:(?:\s*Fondo\s+es\s+Rescatable:)*\s*(SI|NO)/i);
  const rescatable = rescatableMatch ? rescatableMatch[1].toUpperCase() === "SI" : null;

  const plazoMatch = text.match(/Plazo\s+Rescates:(?:\s*Plazo\s+Rescates:)*\s*([^\n]+)/i);
  const plazo_rescate = plazoMatch ? plazoMatch[1].trim() : null;

  const horizonteMatch = text.match(/((?:Corto|Mediano|Largo)(?:\s+(?:o|y|a)\s+(?:corto|mediano|largo))*\s+plazo)/i);
  const horizonte_inversion = horizonteMatch ? horizonteMatch[1].trim() : null;

  let tolerancia_riesgo: string | null = null;
  const toleranciaMatch = text.match(/Nivel\s+(alto|medio|bajo|moderado)/i);
  if (toleranciaMatch) {
    tolerancia_riesgo = toleranciaMatch[0].trim();
  } else {
    const tolSearchIdx = text.indexOf("Tolerancia al Riesgo");
    if (tolSearchIdx >= 0) {
      const after = text.substring(tolSearchIdx, tolSearchIdx + 200);
      const simpleMatch = after.match(/(?:Tolerancia[^:]*:?\s*(?:Tolerancia[^:]*:?\s*)*)\s*(Baja|Media|Alta|Moderada)/i);
      if (simpleMatch) tolerancia_riesgo = simpleMatch[1].trim();
    }
  }

  const objIdx = text.indexOf("Objetivo del Fondo");
  const tolIdx = text.indexOf("Tolerancia al Riesgo");
  const objetivo = objIdx >= 0 && tolIdx > objIdx
    ? text.substring(objIdx + "Objetivo del Fondo".length, tolIdx)
        .replace(/Objetivo del Fondo/g, "")
        .replace(/\n/g, " ").trim().substring(0, 500)
    : null;

  // Beneficio tributario — parse the section
  // CMF PDFs list beneficios with checkboxes. In extracted text, the checked one
  // often appears with a tick symbol (✓, ✔, X, x) or is the only one followed by "Sí"
  const { beneficio_apv, beneficio_57bis, beneficio_107lir, beneficio_108lir, notas_tributarias } =
    extractBeneficioTributario(text);

  return {
    tac_serie,
    nombre_fondo_pdf,
    serie_detectada,
    rent_1m: parseRent("1\\s*Mes"),
    rent_3m: parseRent("3\\s*Meses"),
    rent_6m: parseRent("6\\s*Meses"),
    rent_12m: parseRent("1\\s*Año"),
    rescatable,
    plazo_rescate,
    horizonte_inversion,
    tolerancia_riesgo,
    objetivo,
    beneficio_apv,
    beneficio_57bis,
    beneficio_107lir,
    beneficio_108lir,
    notas_tributarias,
    extraction_method: "regex",
  };
}

/**
 * Parse beneficio tributario from extracted PDF text.
 * CMF folletos have a section "Beneficio Tributario" with options like:
 * APV, APVC, 57 bis LIR, Artículo 107 LIR, Artículo 108 LIR
 * The selected one is marked with ✓, X, Sí, or visually distinct.
 */
function extractBeneficioTributario(text: string): {
  beneficio_apv: boolean;
  beneficio_57bis: boolean;
  beneficio_107lir: boolean;
  beneficio_108lir: boolean;
  notas_tributarias: string | null;
} {
  let beneficio_apv = false;
  let beneficio_57bis = false;
  let beneficio_107lir = false;
  let beneficio_108lir = false;
  let notas_tributarias: string | null = null;

  // Find the beneficio tributario section
  const benIdx = text.search(/Beneficio\s+Tributario/i);
  if (benIdx < 0) return { beneficio_apv, beneficio_57bis, beneficio_107lir, beneficio_108lir, notas_tributarias };

  // Extract ~800 chars after "Beneficio Tributario" header
  const section = text.substring(benIdx, benIdx + 800);

  // Strategy 1: Look for explicit check marks (✓, ✔, ☑) near each option
  const checkPattern = /[✓✔☑☒Xx]/;

  // Strategy 2: Look for "Sí" or "SI" next to an option
  // Strategy 3: Look for the pattern where one option is followed by different formatting

  // Check each beneficio type
  const patterns: Array<{ id: string; regex: RegExp; label: string }> = [
    { id: "apv", regex: /\bAPV[C]?\b/i, label: "APV" },
    { id: "57bis", regex: /\b57\s*(?:bis)?\s*(?:LIR|L\.I\.R)/i, label: "57bis" },
    { id: "107lir", regex: /\b(?:Art[íi]culo\s+)?107\s*(?:LIR|L\.I\.R)/i, label: "107LIR" },
    { id: "108lir", regex: /\b(?:Art[íi]culo\s+)?108\s*(?:LIR|L\.I\.R)/i, label: "108LIR" },
  ];

  let detected: string | null = null;

  function setDetected(id: string, label: string) {
    if (id === "apv") beneficio_apv = true;
    else if (id === "57bis") beneficio_57bis = true;
    else if (id === "107lir") beneficio_107lir = true;
    else if (id === "108lir") beneficio_108lir = true;
    detected = label;
  }

  for (const p of patterns) {
    const match = section.match(p.regex);
    if (!match) continue;

    const pos = match.index!;
    // Check surrounding ~30 chars for a check mark or "Sí"
    const vicinity = section.substring(Math.max(0, pos - 20), pos + match[0].length + 30);

    if (checkPattern.test(vicinity) || /\bS[íi]\b/i.test(vicinity)) {
      setDetected(p.id, p.label);
      break; // Only one beneficio should be active
    }
  }

  // Strategy 4: If no check marks found, try to find which option appears
  // after a pattern like "acogido a" or "corresponde a"
  if (!detected) {
    const acogidoMatch = section.match(/(?:acogido|corresponde|sujeto)\s+(?:al?\s+)?(?:beneficio\s+)?(?:del?\s+)?(APV|57\s*bis|107|108)/i);
    if (acogidoMatch) {
      const val = acogidoMatch[1].toUpperCase().replace(/\s+/g, "");
      if (val.includes("APV")) setDetected("apv", "APV");
      else if (val.includes("57")) setDetected("57bis", "57bis");
      else if (val.includes("107")) setDetected("107lir", "107LIR");
      else if (val.includes("108")) setDetected("108lir", "108LIR");
    }
  }

  // Strategy 5: Serie name often hints at the beneficio (e.g., "Serie APV", "Serie 57bis")
  if (!detected) {
    const serieHint = text.match(/Serie\s+(APV|57\s*bis|107|108)/i);
    if (serieHint) {
      const val = serieHint[1].toUpperCase().replace(/\s+/g, "");
      if (val.includes("APV")) setDetected("apv", "APV");
      else if (val.includes("57")) setDetected("57bis", "57bis");
      else if (val.includes("107")) setDetected("107lir", "107LIR");
      else if (val.includes("108")) setDetected("108lir", "108LIR");
    }
  }

  notas_tributarias = detected;
  return { beneficio_apv, beneficio_57bis, beneficio_107lir, beneficio_108lir, notas_tributarias };
}

// --- Main entry point: try Gemini first (with retry), fallback to regex ---
export async function extractFromPdf(buffer: ArrayBuffer): Promise<ExtractionResult> {
  // Try Gemini — retry once on 429 (rate limit) after 3 second delay
  let geminiResult = await extractWithGemini(buffer);

  if (geminiResult?.exhausted) {
    console.log("[ficha-extract] Gemini 429, retrying in 3s...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    geminiResult = await extractWithGemini(buffer);
  }

  if (geminiResult?.exhausted) {
    // Still exhausted after retry — fallback to regex, signal caller
    console.warn("[ficha-extract] Gemini quota exhausted after retry, falling back to regex");
    const result = await extractText(new Uint8Array(buffer));
    const text = (result.text as string[]).join("\n");
    return { data: extractWithRegex(text), gemini_exhausted: true };
  }
  if (geminiResult?.data) {
    return { data: geminiResult.data };
  }

  // Gemini failed or no key — use regex
  console.log("[ficha-extract] Gemini unavailable, using regex fallback");
  const result = await extractText(new Uint8Array(buffer));
  const text = (result.text as string[]).join("\n");
  return { data: extractWithRegex(text) };
}
