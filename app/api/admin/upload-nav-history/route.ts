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
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó un archivo" },
        { status: 400 }
      );
    }

    // Leer archivo
    const buffer = Buffer.from(await file.arrayBuffer());
    const records = parseFile(buffer, file.name);

    if (records.length === 0) {
      return NextResponse.json(
        { error: "El archivo no contiene datos válidos" },
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

    // Procesar cada fondo
    for (const [cmfCode, navRecords] of Object.entries(byFund)) {
      try {
        // Buscar fondo
        const { data: fund, error: fundError } = await supabase
          .from("funds")
          .select("id")
          .eq("cmf_code", cmfCode)
          .single();

        if (fundError || !fund) {
          notFound++;
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
            errors++;
          } else {
            imported += batch.length;
          }
        }

        // Calcular rentabilidades
        const { data: returns, error: returnsError } = await supabase
          .rpc("calculate_fund_returns", { p_fund_id: fund.id })
          .single() as { data: Record<string, any>; error: any };

        if (returnsError) {
          errors++;
          continue;
        }

        // Actualizar fondo
        const { error: updateError } = await supabase
          .from("funds")
          .update({
            return_1y: returns.return_1y,
            return_3y: returns.return_3y,
            return_5y: returns.return_5y,
            return_10y: returns.return_10y,
            return_ytd: returns.return_ytd,
            return_mtd: returns.return_mtd,
            updated_at: new Date().toISOString(),
          })
          .eq("id", fund.id);

        if (updateError) {
          errors++;
        } else {
          updated++;
        }
      } catch (error) {
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Importación completada",
      stats: {
        totalRecords: records.length,
        totalFunds,
        imported,
        updated,
        errors,
        notFound,
      },
    });
  } catch (error: any) {
    console.error("Error en importación:", error);
    return NextResponse.json(
      { error: error.message || "Error en la importación" },
      { status: 500 }
    );
  }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function parseFile(buffer: Buffer, filename: string): NavRecord[] {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    const records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: any) => ({
      date: normalizeDate(record.fecha || record.date),
      cmf_code: (record.cmf_code || record.run || record.fo_run).toString(),
      nav: parseFloat(record.valor_cuota || record.nav || record.value),
    }));
  } else if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map((record: any) => ({
      date: normalizeDate(record.fecha || record.date),
      cmf_code: (record.cmf_code || record.run || record.fo_run).toString(),
      nav: parseFloat(record.valor_cuota || record.nav || record.value),
    }));
  }

  throw new Error("Formato de archivo no soportado");
}

function normalizeDate(dateValue: any): string {
  if (typeof dateValue === "number") {
    const date = XLSX.SSF.parse_date_code(dateValue);
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }

  if (typeof dateValue === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateValue)) {
      const [day, month, year] = dateValue.split("/");
      return `${year}-${month}-${day}`;
    }
    if (/^\d{8}$/.test(dateValue)) {
      return `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}`;
    }
  }

  if (dateValue instanceof Date) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  throw new Error(`Formato de fecha no reconocido: ${dateValue}`);
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
