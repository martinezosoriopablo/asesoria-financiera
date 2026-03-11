// app/api/parse-portfolio-excel/route.ts
// Parser para archivos Excel de cartolas de AGF/corredoras chilenas

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface Holding {
  fundName: string;
  securityId: string | null;
  quantity: number;
  unitCost: number;
  costBasis: number;
  marketPrice: number;
  marketValue: number;
  unrealizedGainLoss: number;
  assetClass?: string;
}

interface ParsedData {
  success: boolean;
  data?: {
    clientName: string | null;
    accountNumber: string | null;
    period: string | null;
    totalValue: number;
    holdings: Holding[];
    byAssetClass: {
      Equity?: { value: number; percent: number };
      "Fixed Income"?: { value: number; percent: number };
      Alternatives?: { value: number; percent: number };
      Cash?: { value: number; percent: number };
    };
  };
  error?: string;
}

// Función para limpiar y convertir a número
function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // Remover caracteres no numéricos excepto punto, coma y signo negativo
    const cleaned = value
      .replace(/[^0-9.,-]/g, "")
      .replace(/\./g, "") // Quitar puntos de miles
      .replace(",", "."); // Convertir coma decimal a punto
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
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

// Función para encontrar columnas por nombre
function findColumnIndex(
  headers: unknown[],
  possibleNames: string[]
): number {
  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i] || "").toLowerCase().trim();
    for (const name of possibleNames) {
      if (header.includes(name.toLowerCase())) {
        return i;
      }
    }
  }
  return -1;
}

export async function POST(request: NextRequest): Promise<NextResponse<ParsedData>> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({
        success: false,
        error: "No se proporcionó archivo",
      });
    }

    // Verificar extensión
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls") && !fileName.endsWith(".csv")) {
      return NextResponse.json({
        success: false,
        error: "Formato de archivo no soportado. Use .xlsx, .xls o .csv",
      });
    }

    // Leer archivo
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });

    // Obtener la primera hoja
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertir a JSON
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    if (data.length < 2) {
      return NextResponse.json({
        success: false,
        error: "El archivo está vacío o no tiene datos suficientes",
      });
    }

    // Buscar la fila de encabezados (primera fila con datos útiles)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (row && row.some((cell) => {
        const cellStr = String(cell || "").toLowerCase();
        return (
          cellStr.includes("nombre") ||
          cellStr.includes("fondo") ||
          cellStr.includes("instrumento") ||
          cellStr.includes("security") ||
          cellStr.includes("ticker") ||
          cellStr.includes("monto") ||
          cellStr.includes("valor")
        );
      })) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = data[headerRowIndex] || [];

    // Encontrar índices de columnas
    const nameCol = findColumnIndex(headers, [
      "nombre", "fondo", "instrumento", "security", "name", "descripcion", "descripción"
    ]);
    const tickerCol = findColumnIndex(headers, [
      "ticker", "cusip", "isin", "simbolo", "símbolo", "codigo", "código", "id"
    ]);
    const quantityCol = findColumnIndex(headers, [
      "cantidad", "cuotas", "participacion", "participación", "quantity", "shares", "unidades"
    ]);
    const marketValueCol = findColumnIndex(headers, [
      "valor mercado", "market value", "valor", "monto", "saldo", "total", "valorizado"
    ]);
    const costCol = findColumnIndex(headers, [
      "costo", "cost", "precio compra", "base"
    ]);
    const priceCol = findColumnIndex(headers, [
      "precio", "price", "valor cuota", "nav", "cotizacion", "cotización"
    ]);

    // Validar que al menos tenemos nombre y valor
    if (nameCol === -1 || marketValueCol === -1) {
      return NextResponse.json({
        success: false,
        error: "No se encontraron las columnas requeridas (nombre del instrumento y valor de mercado)",
      });
    }

    // Parsear holdings
    const holdings: Holding[] = [];
    let totalValue = 0;

    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const fundName = String(row[nameCol] || "").trim();
      if (!fundName || fundName.toLowerCase() === "total" || fundName.toLowerCase() === "subtotal") {
        continue;
      }

      const marketValue = parseNumber(row[marketValueCol]);
      if (marketValue === 0) continue;

      const holding: Holding = {
        fundName,
        securityId: tickerCol !== -1 ? String(row[tickerCol] || "").trim() || null : null,
        quantity: quantityCol !== -1 ? parseNumber(row[quantityCol]) : 0,
        unitCost: costCol !== -1 ? parseNumber(row[costCol]) : 0,
        costBasis: costCol !== -1 ? parseNumber(row[costCol]) * (quantityCol !== -1 ? parseNumber(row[quantityCol]) : 1) : 0,
        marketPrice: priceCol !== -1 ? parseNumber(row[priceCol]) : 0,
        marketValue,
        unrealizedGainLoss: 0,
        assetClass: detectAssetClass(fundName),
      };

      // Calcular ganancia/pérdida si tenemos costo base
      if (holding.costBasis > 0) {
        holding.unrealizedGainLoss = holding.marketValue - holding.costBasis;
      }

      holdings.push(holding);
      totalValue += marketValue;
    }

    if (holdings.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No se encontraron posiciones válidas en el archivo",
      });
    }

    // Calcular composición por clase de activo
    const byAssetClass: Record<string, { value: number; percent: number }> = {};
    for (const holding of holdings) {
      const assetClass = holding.assetClass || "Equity";
      if (!byAssetClass[assetClass]) {
        byAssetClass[assetClass] = { value: 0, percent: 0 };
      }
      byAssetClass[assetClass].value += holding.marketValue;
    }

    // Calcular porcentajes
    for (const key of Object.keys(byAssetClass)) {
      byAssetClass[key].percent = totalValue > 0
        ? (byAssetClass[key].value / totalValue) * 100
        : 0;
    }

    return NextResponse.json({
      success: true,
      data: {
        clientName: null,
        accountNumber: null,
        period: null,
        totalValue,
        holdings,
        byAssetClass,
      },
    });
  } catch (error) {
    console.error("Error parsing Excel file:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Error al procesar el archivo Excel",
    });
  }
}
