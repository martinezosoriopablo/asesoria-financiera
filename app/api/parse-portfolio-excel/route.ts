// app/api/parse-portfolio-excel/route.ts
// Parser para archivos Excel de cartolas de AGF/corredoras chilenas
// Returns same format as PDF parser for consistency

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface Holding {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  unitCost?: number;
  costBasis?: number;
  marketPrice?: number;
  marketValue: number;
  unrealizedGainLoss?: number;
  assetClass?: string;
}

// Same response format as PDF parser
interface ParsedResponse {
  clientName?: string;
  accountNumber?: string;
  period?: string;
  beginningValue?: number;
  endingValue?: number;
  totalValue?: number;
  cashBalance?: number;
  holdings: Holding[];
  detectedCurrency: "USD" | "CLP";
  currencyConfidence: "high" | "medium" | "low";
  currencyReason: string;
  source?: string;
  error?: string;
}

// Column name mappings for different Chilean institutions
const COLUMN_MAPPINGS = {
  fundName: [
    "nombre", "fondo", "nombre fondo", "nombre del fondo", "instrumento",
    "security", "security name", "description", "descripcion", "descripción",
    "fund name", "fund", "asset", "activo", "titulo", "título", "nemotecnico",
    "nemotécnico", "serie", "nombre serie"
  ],
  quantity: [
    "cuotas", "cantidad", "qty", "quantity", "shares", "units", "unidades",
    "numero cuotas", "número cuotas", "n° cuotas", "nro cuotas", "acciones",
    "cantidad cuotas", "cuotas totales", "participacion", "participación"
  ],
  marketValue: [
    "valor total", "total", "market value", "valor mercado", "monto",
    "valor actual", "current value", "saldo", "balance", "valorización",
    "valorizacion", "valor", "monto total", "valor posicion", "valor posición",
    "valorizado"
  ],
  marketPrice: [
    "valor cuota", "precio", "price", "market price", "precio mercado",
    "precio actual", "current price", "unit price", "precio unitario",
    "valor unitario", "precio cierre", "ultimo precio", "último precio",
    "nav", "cotizacion", "cotización"
  ],
  costBasis: [
    "costo total", "total cost", "cost basis", "inversion", "inversión",
    "monto invertido", "valor libro", "book value", "costo", "cost",
    "precio compra", "base"
  ],
  securityId: [
    "ticker", "cusip", "isin", "simbolo", "símbolo", "codigo", "código",
    "id", "rut", "security id", "identificador", "nemotecnico", "nemotécnico"
  ]
};

// Chilean AGFs and brokers for source detection
const CHILEAN_SOURCES: Record<string, string[]> = {
  "BCI": ["bci", "banchile"],
  "BTG Pactual": ["btg", "pactual"],
  "LarrainVial": ["larrainvial", "larrain vial", "lv"],
  "Santander": ["santander"],
  "Security": ["security"],
  "Sura": ["sura"],
  "Itaú": ["itau", "itaú"],
  "Principal": ["principal"],
  "BICE": ["bice"],
  "Credicorp": ["credicorp"],
  "Scotia": ["scotia", "scotiabank"],
  "Compass": ["compass"],
  "Moneda": ["moneda"],
  "Euroamerica": ["euroamerica", "euroamérica"],
  "Nevasa": ["nevasa"],
  "Renta4": ["renta4", "renta 4"],
  "Vector": ["vector"],
  "Tanner": ["tanner"],
  "Pershing": ["pershing"],
};

// Parse Chilean number format (dots for thousands, commas for decimals)
function parseChileanNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return 0;

  let str = String(value).trim();

  // Remove currency symbols and whitespace
  str = str.replace(/[$€CLP\s]/gi, "");

  // Handle parentheses as negative
  if (str.startsWith("(") && str.endsWith(")")) {
    str = "-" + str.slice(1, -1);
  }

  // Handle percentage
  if (str.endsWith("%")) {
    str = str.slice(0, -1);
  }

  // Detect format based on separators
  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  if (hasComma && hasDot) {
    // Both present - determine which is decimal
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");

    if (lastComma > lastDot) {
      // Comma is decimal (Chilean: 1.234,56)
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // Dot is decimal (US: 1,234.56)
      str = str.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // Only commas - check if it's a decimal or thousand separator
    const parts = str.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Likely decimal: 1234,56
      str = str.replace(",", ".");
    } else {
      // Likely thousands: 1,234,567
      str = str.replace(/,/g, "");
    }
  } else if (hasDot && !hasComma) {
    // Only dots - check if it's decimal or thousands
    const parts = str.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      // Multiple dots or 3 digits after dot = thousands (Chilean: 1.234.567)
      str = str.replace(/\./g, "");
    }
    // Otherwise keep as decimal (1234.56)
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Función para detectar tipo de activo basado en el nombre
function detectAssetClass(fundName: string): string {
  const nameLower = fundName.toLowerCase();

  // Renta Fija
  if (
    nameLower.includes("money market") ||
    nameLower.includes("renta fija") ||
    nameLower.includes("fixed income") ||
    nameLower.includes("bond") ||
    nameLower.includes("bono") ||
    nameLower.includes("deposito") ||
    nameLower.includes("deuda") ||
    nameLower.includes("corporate") ||
    nameLower.includes("soberan") ||
    nameLower.includes("pacto") ||
    nameLower.includes("rf ")
  ) {
    return "Fixed Income";
  }

  // Alternativos
  if (
    nameLower.includes("alternativ") ||
    nameLower.includes("real estate") ||
    nameLower.includes("inmobiliario") ||
    nameLower.includes("private equity") ||
    nameLower.includes("hedge") ||
    nameLower.includes("commodity") ||
    nameLower.includes("infraestruct")
  ) {
    return "Alternatives";
  }

  // Cash / Liquidez
  if (
    nameLower.includes("cash") ||
    nameLower.includes("liquidez") ||
    nameLower.includes("disponible") ||
    nameLower.includes("efectivo")
  ) {
    return "Cash";
  }

  // Default: Renta Variable (equity, acciones, ETF, etc.)
  return "Equity";
}

// Normalize text for matching
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .trim();
}

// Find column index using mappings
function findColumnIndex(
  headers: unknown[],
  fieldType: keyof typeof COLUMN_MAPPINGS
): number {
  const possibleNames = COLUMN_MAPPINGS[fieldType];
  const normalizedHeaders = headers.map(h => normalizeText(String(h || "")));

  for (const name of possibleNames) {
    const normalizedName = normalizeText(name);
    const index = normalizedHeaders.findIndex(h =>
      h === normalizedName || h.includes(normalizedName) || normalizedName.includes(h)
    );
    if (index !== -1) return index;
  }
  return -1;
}

// Detect source from sheet content
function detectSource(workbook: XLSX.WorkBook, data: unknown[][]): string {
  const sheetNames = workbook.SheetNames.join(" ").toLowerCase();
  const content = data.slice(0, 10).flat().filter(Boolean).join(" ").toLowerCase();

  for (const [name, keywords] of Object.entries(CHILEAN_SOURCES)) {
    if (keywords.some(k => sheetNames.includes(k) || content.includes(k))) {
      return name;
    }
  }
  return "Excel";
}

// Detect currency based on values
function detectCurrency(holdings: Holding[], totalValue: number): {
  currency: "USD" | "CLP";
  confidence: "high" | "medium" | "low";
  reason: string;
} {
  if (totalValue > 1_000_000) {
    return {
      currency: "CLP",
      confidence: "high",
      reason: `Valor total ${totalValue.toLocaleString()} sugiere CLP`
    };
  }

  const avgValue = holdings.length > 0
    ? holdings.reduce((sum, h) => sum + h.marketValue, 0) / holdings.length
    : 0;

  if (avgValue > 100_000) {
    return {
      currency: "CLP",
      confidence: "medium",
      reason: `Valor promedio por posición ${avgValue.toLocaleString()} sugiere CLP`
    };
  }

  return {
    currency: "USD",
    confidence: "low",
    reason: "Valores sugieren USD o moneda extranjera"
  };
}

// Extract metadata from rows above the header
function extractMetadata(data: unknown[][], headerRowIndex: number): {
  clientName?: string;
  accountNumber?: string;
  period?: string;
} {
  const metadata: { clientName?: string; accountNumber?: string; period?: string } = {};

  for (let i = 0; i < headerRowIndex; i++) {
    const row = data[i];
    if (!row) continue;

    const rowText = row.map(c => String(c || "")).join(" ").toLowerCase();

    // Look for client/account patterns
    if (rowText.includes("cliente") || rowText.includes("nombre")) {
      const match = row.find(c => {
        const s = String(c || "");
        return s.length > 3 && !s.toLowerCase().includes("cliente") && !s.toLowerCase().includes("nombre");
      });
      if (match) metadata.clientName = String(match).trim();
    }

    if (rowText.includes("cuenta") || rowText.includes("rut")) {
      const match = row.find(c => {
        const s = String(c || "");
        return /[\d-]+/.test(s) && s.length > 3;
      });
      if (match) metadata.accountNumber = String(match).trim();
    }

    // Look for date patterns
    if (rowText.includes("fecha") || rowText.includes("periodo") || rowText.includes("al ")) {
      const dateCell = row.find(c => {
        const s = String(c || "");
        return /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(s) ||
               /\d{4}[\/\-\.]\d{1,2}/.test(s) ||
               /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(s);
      });
      if (dateCell) metadata.period = String(dateCell).trim();
    }
  }

  return metadata;
}

export async function POST(request: NextRequest): Promise<NextResponse<ParsedResponse>> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({
        holdings: [],
        detectedCurrency: "CLP",
        currencyConfidence: "low",
        currencyReason: "No file",
        error: "No se proporcionó archivo",
      }, { status: 400 });
    }

    // Verify extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls") && !fileName.endsWith(".csv")) {
      return NextResponse.json({
        holdings: [],
        detectedCurrency: "CLP",
        currencyConfidence: "low",
        currencyReason: "Invalid format",
        error: "Formato de archivo no soportado. Use .xlsx, .xls o .csv",
      }, { status: 400 });
    }

    // Read file
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to array of arrays
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    if (data.length < 2) {
      return NextResponse.json({
        holdings: [],
        detectedCurrency: "CLP",
        currencyConfidence: "low",
        currencyReason: "Empty file",
        error: "El archivo está vacío o no tiene datos suficientes",
      }, { status: 400 });
    }

    // Find header row (first row with recognizable column names)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i];
      if (!row || row.length < 2) continue;

      const headers = row.map(c => String(c || ""));
      const nameCol = findColumnIndex(headers, "fundName");
      const valueCol = findColumnIndex(headers, "marketValue");

      if (nameCol !== -1 && valueCol !== -1) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = (data[headerRowIndex] || []).map(c => String(c || ""));

    // Find column indices
    const nameCol = findColumnIndex(headers, "fundName");
    const valueCol = findColumnIndex(headers, "marketValue");
    const quantityCol = findColumnIndex(headers, "quantity");
    const priceCol = findColumnIndex(headers, "marketPrice");
    const costCol = findColumnIndex(headers, "costBasis");
    const tickerCol = findColumnIndex(headers, "securityId");

    // Validate minimum columns
    if (nameCol === -1 || valueCol === -1) {
      return NextResponse.json({
        holdings: [],
        detectedCurrency: "CLP",
        currencyConfidence: "low",
        currencyReason: "Missing columns",
        error: "No se encontraron las columnas requeridas (nombre del instrumento y valor de mercado)",
      }, { status: 400 });
    }

    // Parse holdings
    const holdings: Holding[] = [];
    let totalValue = 0;

    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const fundName = String(row[nameCol] || "").trim();

      // Skip empty rows or totals
      if (!fundName ||
          fundName.toLowerCase() === "total" ||
          fundName.toLowerCase() === "subtotal" ||
          fundName.toLowerCase() === "suma" ||
          fundName.toLowerCase() === "saldo final") {
        continue;
      }

      const marketValue = parseChileanNumber(row[valueCol]);
      if (marketValue === 0) continue;

      const holding: Holding = {
        fundName,
        marketValue,
        assetClass: detectAssetClass(fundName),
      };

      // Optional fields
      if (tickerCol !== -1 && row[tickerCol]) {
        holding.securityId = String(row[tickerCol]).trim() || null;
      }
      if (quantityCol !== -1) {
        holding.quantity = parseChileanNumber(row[quantityCol]);
      }
      if (priceCol !== -1) {
        holding.marketPrice = parseChileanNumber(row[priceCol]);
      }
      if (costCol !== -1) {
        const cost = parseChileanNumber(row[costCol]);
        if (cost > 0) {
          holding.costBasis = cost;
        }
      }

      // Calculate missing fields
      if (!holding.marketPrice && holding.quantity && holding.marketValue && holding.quantity > 0) {
        holding.marketPrice = holding.marketValue / holding.quantity;
      }
      if (holding.costBasis && holding.marketValue) {
        holding.unrealizedGainLoss = holding.marketValue - holding.costBasis;
      }

      holdings.push(holding);
      totalValue += marketValue;
    }

    if (holdings.length === 0) {
      return NextResponse.json({
        holdings: [],
        detectedCurrency: "CLP",
        currencyConfidence: "low",
        currencyReason: "No holdings found",
        error: "No se encontraron posiciones válidas en el archivo",
      }, { status: 400 });
    }

    // Extract metadata
    const metadata = extractMetadata(data, headerRowIndex);

    // Detect currency
    const currencyInfo = detectCurrency(holdings, totalValue);

    // Detect source
    const source = detectSource(workbook, data);

    // Calculate total cost if available
    const totalCost = holdings.reduce((sum, h) => sum + (h.costBasis || 0), 0);

    console.log(`Excel parsed: ${holdings.length} holdings, total ${totalValue}, source: ${source}`);

    return NextResponse.json({
      ...metadata,
      endingValue: totalValue,
      totalValue: totalValue,
      beginningValue: totalCost > 0 ? totalCost : undefined,
      holdings,
      detectedCurrency: currencyInfo.currency,
      currencyConfidence: currencyInfo.confidence,
      currencyReason: currencyInfo.reason,
      source,
    });
  } catch (error) {
    console.error("Error parsing Excel file:", error);
    return NextResponse.json({
      holdings: [],
      detectedCurrency: "CLP",
      currencyConfidence: "low",
      currencyReason: "Parse error",
      error: error instanceof Error ? error.message : "Error al procesar el archivo Excel",
    }, { status: 500 });
  }
}
