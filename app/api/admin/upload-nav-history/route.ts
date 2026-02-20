// app/api/admin/upload-nav-history/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { parse } from "csv-parse/sync";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface NavRecord {
  date: string;
  cmf_code: string;
  nav: number;
}

export async function POST(request: NextRequest) {
  console.log("=== INICIO UPLOAD NAV HISTORY ===");

  try {
    console.log("1. Obteniendo formData...");
    const formData = await request.formData();

    console.log("2. Obteniendo archivo...");
    const file = formData.get("file") as File;

    if (!file) {
      console.log("ERROR: No se proporcionó archivo");
      return NextResponse.json(
        { error: "No se proporcionó un archivo" },
        { status: 400 }
      );
    }

    console.log(`3. Archivo recibido: ${file.name}, tamaño: ${file.size} bytes`);

    // Extraer identificador del fondo desde el nombre del archivo
    const fundIdentifier = extractFundIdentifier(file.name);
    console.log(`4. Fund identifier: ${fundIdentifier}`);

    // Leer archivo
    console.log("5. Leyendo arrayBuffer...");
    const arrayBuffer = await file.arrayBuffer();
    console.log(`6. ArrayBuffer size: ${arrayBuffer.byteLength}`);

    const buffer = Buffer.from(arrayBuffer);
    console.log(`7. Buffer size: ${buffer.length}`);

    console.log("8. Parseando archivo...");
    const records = parseFile(buffer, file.name, fundIdentifier);
    console.log(`9. Registros parseados: ${records.length}`);

    if (records.length === 0) {
      return NextResponse.json(
        { error: "El archivo no contiene datos válidos. Verifica que tenga columnas 'fecha' y 'valor_cuota' (o similares)." },
        { status: 400 }
      );
    }

    // Agrupar por fondo
    const byFund = groupByFund(records);
    const totalFunds = Object.keys(byFund).length;

    let imported = 0;
    let updated = 0;
    let errors = 0;
    let notFound = 0;
    const notFoundFunds: string[] = [];
    let lastCalculatedReturns: any = null;

    // Procesar cada fondo
    for (const [fundCode, navRecords] of Object.entries(byFund)) {
      try {
        // Buscar fondo por múltiples campos
        const fund = await findFund(fundCode);

        if (!fund) {
          notFound++;
          notFoundFunds.push(fundCode);
          continue;
        }

        // Preparar registros
        const navHistoryRecords = navRecords.map((record: NavRecord) => ({
          fund_id: fund.id,
          date: record.date,
          nav: record.nav,
          source: "import",
        }));

        // Insertar en lotes
        const batchSize = 500;
        for (let i = 0; i < navHistoryRecords.length; i += batchSize) {
          const batch = navHistoryRecords.slice(i, i + batchSize);

          const { error: insertError } = await supabase
            .from("nav_history")
            .upsert(batch, {
              onConflict: "fund_id,date",
              ignoreDuplicates: false,
            });

          if (insertError) {
            console.error("Error inserting batch:", insertError);
            errors++;
          } else {
            imported += batch.length;
          }
        }

        // Calcular rentabilidades
        console.log(`Calculando rentabilidades para fund_id: ${fund.id}`);
        const { data: returns, error: returnsError } = await supabase
          .rpc("calculate_fund_returns", { p_fund_id: fund.id });

        console.log("RPC returns:", JSON.stringify(returns));
        console.log("RPC error:", returnsError ? JSON.stringify(returnsError) : "none");

        if (returnsError) {
          console.error("Error calculating returns:", returnsError);
          // No es crítico, continuamos
        }

        // La función devuelve un array con una fila, tomamos el primer elemento
        const returnsData = Array.isArray(returns) ? returns[0] : returns;

        // Actualizar fondo con rentabilidades (si se calcularon)
        if (returnsData && (returnsData.return_1y !== null || returnsData.return_3y !== null)) {
          console.log("Updating fund with returns:", JSON.stringify(returnsData));
          const { error: updateError } = await supabase
            .from("funds")
            .update({
              return_1y: returnsData.return_1y,
              return_3y: returnsData.return_3y,
              return_5y: returnsData.return_5y,
              return_10y: returnsData.return_10y,
              return_ytd: returnsData.return_ytd,
              return_mtd: returnsData.return_mtd,
              updated_at: new Date().toISOString(),
            })
            .eq("id", fund.id);

          if (updateError) {
            console.error("Error updating fund:", updateError);
          }

          // Guardar para devolver al frontend
          lastCalculatedReturns = returnsData;
        } else {
          console.log("No returns calculated (possibly not enough historical data)");
        }

        updated++;
      } catch (error) {
        console.error("Error processing fund:", fundCode, error);
        errors++;
      }
    }

    console.log("Returning calculated returns:", JSON.stringify(lastCalculatedReturns));

    return NextResponse.json({
      success: true,
      message: notFound > 0
        ? `Importación completada. ${notFound} fondo(s) no encontrado(s): ${notFoundFunds.join(", ")}`
        : "Importación completada exitosamente",
      stats: {
        totalRecords: records.length,
        totalFunds,
        imported,
        updated,
        errors,
        notFound,
        notFoundFunds,
      },
      returns: lastCalculatedReturns,
    });
  } catch (error: any) {
    console.error("Error en importación:", error);
    return NextResponse.json(
      { error: error.message || "Error en la importación" },
      { status: 500 }
    );
  }
}

// Extraer identificador del fondo desde el nombre del archivo
function extractFundIdentifier(filename: string): string {
  // Remover extensión y limpiar
  const name = filename
    .replace(/\.(xlsx|xls|csv)$/i, "")
    .trim()
    .toUpperCase();
  return name;
}

// Buscar fondo por múltiples campos, o crear si no existe
async function findFund(identifier: string, autoCreate: boolean = true): Promise<{ id: string } | null> {
  const searchValue = identifier.trim().toUpperCase();

  // Buscar por símbolo/ticker (exacto)
  let { data: fund } = await supabase
    .from("funds")
    .select("id")
    .ilike("symbol", searchValue)
    .maybeSingle();

  if (fund) return fund;

  // Buscar por nombre (exacto primero)
  ({ data: fund } = await supabase
    .from("funds")
    .select("id")
    .ilike("name", searchValue)
    .maybeSingle());

  if (fund) return fund;

  // Buscar por nombre (parcial)
  ({ data: fund } = await supabase
    .from("funds")
    .select("id")
    .ilike("name", `%${searchValue}%`)
    .maybeSingle());

  if (fund) return fund;

  // Si no existe y autoCreate está activo, crear el fondo como externo
  if (autoCreate) {
    const { data: newFund, error: createError } = await supabase
      .from("funds")
      .insert({
        name: searchValue,
        symbol: searchValue,
        type: "external",
        provider: "Importado",
        asset_class: "equity", // Default, se puede cambiar después
        is_active: true,
        currency: "USD", // Default para fondos externos
      })
      .select("id")
      .single();

    if (createError) {
      console.error("Error creating fund:", createError);
      return null;
    }

    console.log(`Fondo externo creado: ${searchValue} (ID: ${newFund.id})`);
    return newFund;
  }

  return null;
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

// Helper para obtener valor de columna case-insensitive
function getColumnValue(record: any, ...possibleNames: string[]): any {
  // Crear un mapa de keys en lowercase para búsqueda case-insensitive
  const lowercaseMap: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    lowercaseMap[key.toLowerCase()] = key;
  }

  for (const name of possibleNames) {
    const lowerName = name.toLowerCase();
    if (lowercaseMap[lowerName]) {
      return record[lowercaseMap[lowerName]];
    }
  }
  return undefined;
}

function parseFile(buffer: Buffer, filename: string, fundIdentifier?: string): NavRecord[] {
  const ext = filename?.split(".")?.pop()?.toLowerCase() || "";
  let rawRecords: any[] = [];

  console.log(`Parseando archivo: ${filename}, extensión: ${ext}, fundIdentifier: ${fundIdentifier}`);

  try {
    if (ext === "csv") {
      rawRecords = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else if (ext === "xlsx" || ext === "xls") {
      // Convertir buffer a Uint8Array para mejor compatibilidad
      const uint8Array = new Uint8Array(buffer);
      const workbook = XLSX.read(uint8Array, {
        type: "array",
        cellDates: false, // Mantener fechas como números de serie
        cellNF: false,
        cellText: false,
      });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("El archivo Excel no contiene hojas");
      }

      const sheetName = workbook.SheetNames[0];
      console.log(`Hoja encontrada: ${sheetName}`);
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw new Error(`No se pudo leer la hoja: ${sheetName}`);
      }

      rawRecords = XLSX.utils.sheet_to_json(worksheet, {
        defval: null, // Valor por defecto para celdas vacías
        raw: true, // Mantener valores crudos (números de serie para fechas)
      });

      console.log(`Registros crudos: ${rawRecords.length}`);
      if (rawRecords.length > 0) {
        console.log(`Primera fila keys: ${Object.keys(rawRecords[0] || {}).join(", ")}`);
        console.log(`Primera fila: ${JSON.stringify(rawRecords[0])}`);
      }
    } else {
      throw new Error(`Formato de archivo no soportado: ${ext}`);
    }
  } catch (parseErr: any) {
    console.error("Error parseando archivo:", parseErr);
    throw new Error(`Error leyendo archivo: ${parseErr?.message || parseErr}`);
  }

  // Parsear registros con búsqueda case-insensitive de columnas
  const parsedRecords: NavRecord[] = [];

  for (let i = 0; i < rawRecords.length; i++) {
    const record = rawRecords[i];

    // Saltar si el registro es null/undefined o no es objeto
    if (!record || typeof record !== "object") {
      continue;
    }

    try {
      // Obtener fecha (case-insensitive)
      const dateValue = getColumnValue(record, "fecha", "date", "FECHA", "DATE", "Fecha");
      if (dateValue === undefined || dateValue === null) continue;

      // Obtener valor cuota (case-insensitive)
      const navValue = getColumnValue(record, "valor_cuota", "VALOR_CUOTA", "nav", "NAV", "value", "VALUE", "cuota", "CUOTA");
      if (navValue === undefined || navValue === null) continue;

      // Obtener código del fondo (case-insensitive) o usar el identificador del archivo
      let cmfCode = getColumnValue(record, "cmf_code", "CMF_CODE", "run", "RUN", "fo_run", "FO_RUN", "codigo", "CODIGO", "fund_id");

      // Si no hay columna de código, usar el identificador del nombre del archivo
      if ((cmfCode === undefined || cmfCode === null) && fundIdentifier) {
        cmfCode = fundIdentifier;
      }

      if (!cmfCode) continue;

      const normalizedDate = normalizeDate(dateValue);
      // Limpiar símbolos de moneda y formateo ($, €, £, comas, espacios)
      const cleanNavValue = String(navValue)
        .replace(/[$€£]/g, "")
        .replace(/,/g, "")
        .replace(/\s/g, "")
        .trim();
      const parsedNav = parseFloat(cleanNavValue);

      if (normalizedDate && normalizedDate.length > 0 && !isNaN(parsedNav) && parsedNav > 0) {
        parsedRecords.push({
          date: normalizedDate,
          cmf_code: String(cmfCode || ""),
          nav: parsedNav,
        });
      }
    } catch (err: any) {
      // Ignorar filas con errores de parseo
      console.warn(`Error parsing row ${i}:`, err?.message || err);
    }
  }

  console.log(`Registros parseados: ${parsedRecords.length}`);
  return parsedRecords;
}

function normalizeDate(dateValue: any): string {
  // Número de serie de Excel (ej: 44197 = 1 enero 2021)
  if (typeof dateValue === "number") {
    // Convertir número de serie Excel a fecha
    // Excel cuenta desde 1 enero 1900, pero tiene un bug con el año bisiesto 1900
    const excelEpoch = new Date(1899, 11, 30); // 30 dic 1899
    const date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Fecha como string
  if (typeof dateValue === "string") {
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    // DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateValue)) {
      const [day, month, year] = dateValue.split("/");
      return `${year}-${month}-${day}`;
    }
    // MM/DD/YYYY (formato US)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
      const parts = dateValue.split("/");
      const month = parts[0].padStart(2, "0");
      const day = parts[1].padStart(2, "0");
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    // YYYYMMDD
    if (/^\d{8}$/.test(dateValue)) {
      return `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}`;
    }
  }

  // Objeto Date de JavaScript
  if (dateValue instanceof Date) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  console.warn(`Formato de fecha no reconocido: ${dateValue} (tipo: ${typeof dateValue})`);
  return ""; // Retornar vacío en lugar de lanzar error
}

function groupByFund(records: NavRecord[]): Record<string, NavRecord[]> {
  const grouped: Record<string, NavRecord[]> = {};

  for (const record of records) {
    if (!grouped[record.cmf_code]) {
      grouped[record.cmf_code] = [];
    }
    grouped[record.cmf_code].push(record);
  }

  for (const cmfCode in grouped) {
    grouped[cmfCode].sort((a, b) => a.date.localeCompare(b.date));
  }

  return grouped;
}
