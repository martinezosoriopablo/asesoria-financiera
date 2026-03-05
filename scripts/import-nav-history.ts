// scripts/import-nav-history.ts

/**
 * Script para importar valores cuota desde Excel/CSV
 * 
 * Formato esperado del archivo:
 * - fecha,cmf_code,valor_cuota
 * - 2024-11-22,8707,2548.50
 * - 2024-11-21,8707,2545.30
 * 
 * Uso: npx ts-node scripts/import-nav-history.ts valores_cuota.csv
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// CONFIGURACIÓN
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Faltan variables de entorno');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================
// INTERFACES
// ============================================================

interface NavRecord {
  date: string;
  cmf_code: string;
  nav: number;
}

interface ImportStats {
  totalRecords: number;
  totalFunds: number;
  imported: number;
  updated: number;
  errors: number;
  notFound: number;
}

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

async function importNavHistory(filePath: string): Promise<void> {
  console.log('🚀 Iniciando importación de valores cuota');
  console.log('📂 Archivo:', filePath);
  console.log('');

  const stats: ImportStats = {
    totalRecords: 0,
    totalFunds: 0,
    imported: 0,
    updated: 0,
    errors: 0,
    notFound: 0,
  };

  // Leer archivo
  const records = readFile(filePath);
  stats.totalRecords = records.length;
  console.log(`✅ ${records.length} registros leídos del archivo`);
  console.log('');

  // Agrupar por fondo
  const byFund = groupByFund(records);
  stats.totalFunds = Object.keys(byFund).length;
  console.log(`📊 ${stats.totalFunds} fondos únicos encontrados`);
  console.log('');

  // Procesar cada fondo
  let processedFunds = 0;
  for (const [cmfCode, navRecords] of Object.entries(byFund)) {
    processedFunds++;
    console.log(`[${processedFunds}/${stats.totalFunds}] Procesando fondo ${cmfCode}...`);

    try {
      // Buscar fondo en Supabase
      const { data: fund, error: fundError } = await supabase
        .from('funds')
        .select('id, name')
        .eq('cmf_code', cmfCode)
        .single();

      if (fundError || !fund) {
        console.log(`  ⚠️  Fondo ${cmfCode} no encontrado en BD, saltando...`);
        stats.notFound++;
        continue;
      }

      console.log(`  ✓ Fondo encontrado: ${fund.name}`);
      console.log(`  📈 Importando ${navRecords.length} valores cuota...`);

      // Preparar registros para inserción
      const navHistoryRecords = navRecords.map((record: NavRecord) => ({
        fund_id: fund.id,
        date: record.date,
        nav: record.nav,
        source: 'import',
      }));

      // Insertar en lotes de 500
      const batchSize = 500;
      for (let i = 0; i < navHistoryRecords.length; i += batchSize) {
        const batch = navHistoryRecords.slice(i, i + batchSize);

        const { error: insertError } = await supabase
          .from('nav_history')
          .upsert(batch, {
            onConflict: 'fund_id,date',
            ignoreDuplicates: false,
          });

        if (insertError) {
          console.error(`  ❌ Error insertando lote: ${insertError.message}`);
          stats.errors++;
        } else {
          stats.imported += batch.length;
        }
      }

      // Calcular rentabilidades
      console.log(`  🧮 Calculando rentabilidades...`);
      const { data: returns, error: returnsError } = await supabase
        .rpc('calculate_fund_returns', { p_fund_id: fund.id })
        .single();

      if (returnsError) {
        console.error(`  ❌ Error calculando rentabilidades: ${returnsError.message}`);
        stats.errors++;
        continue;
      }

      // Actualizar fondo con rentabilidades
      const { error: updateError } = await supabase
        .from('funds')
        .update({
          return_1y: returns.return_1y,
          return_3y: returns.return_3y,
          return_5y: returns.return_5y,
          return_10y: returns.return_10y,
          return_ytd: returns.return_ytd,
          return_mtd: returns.return_mtd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fund.id);

      if (updateError) {
        console.error(`  ❌ Error actualizando rentabilidades: ${updateError.message}`);
        stats.errors++;
      } else {
        stats.updated++;
        console.log(`  ✅ Rentabilidades actualizadas:`);
        if (returns.return_1y) console.log(`     1Y: ${(returns.return_1y * 100).toFixed(2)}%`);
        if (returns.return_3y) console.log(`     3Y: ${(returns.return_3y * 100).toFixed(2)}% anual`);
        if (returns.return_ytd) console.log(`     YTD: ${(returns.return_ytd * 100).toFixed(2)}%`);
      }

      console.log('');

      // Pausa breve para no saturar
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Error procesando fondo ${cmfCode}: ${errorMessage}`);
      stats.errors++;
    }
  }

  // Resumen final
  console.log('');
  console.log('='.repeat(70));
  console.log('🎉 IMPORTACIÓN COMPLETADA');
  console.log('='.repeat(70));
  console.log(`📊 Registros procesados: ${stats.totalRecords}`);
  console.log(`🏦 Fondos únicos: ${stats.totalFunds}`);
  console.log(`✅ Valores cuota importados: ${stats.imported}`);
  console.log(`🔄 Fondos actualizados: ${stats.updated}`);
  console.log(`⚠️  Fondos no encontrados: ${stats.notFound}`);
  console.log(`❌ Errores: ${stats.errors}`);
  console.log('='.repeat(70));
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function readFile(filePath: string): NavRecord[] {
  const ext = path.extname(filePath).toLowerCase();
  const fileContent = fs.readFileSync(filePath);

  if (ext === '.csv') {
    // Leer CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: Record<string, unknown>) => ({
      date: normalizeDate(record.fecha || record.date),
      cmf_code: String(record.cmf_code || record.run || record.fo_run),
      nav: parseFloat(String(record.valor_cuota || record.nav || record.value)),
    }));
  } else if (ext === '.xlsx' || ext === '.xls') {
    // Leer Excel
    const workbook = XLSX.read(fileContent);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map((record) => {
      const r = record as Record<string, unknown>;
      return {
        date: normalizeDate(r.fecha || r.date),
        cmf_code: String(r.cmf_code || r.run || r.fo_run),
        nav: parseFloat(String(r.valor_cuota || r.nav || r.value)),
      };
    });
  } else {
    throw new Error(`Formato de archivo no soportado: ${ext}`);
  }
}

function normalizeDate(dateValue: unknown): string {
  // Si es un número (Excel serial date)
  if (typeof dateValue === 'number') {
    const date = XLSX.SSF.parse_date_code(dateValue);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }

  // Si es un string
  if (typeof dateValue === 'string') {
    // Intentar parsear diferentes formatos
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    // DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateValue)) {
      const [day, month, year] = dateValue.split('/');
      return `${year}-${month}-${day}`;
    }
    // YYYYMMDD
    if (/^\d{8}$/.test(dateValue)) {
      return `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}`;
    }
  }

  // Si es un objeto Date
  if (dateValue instanceof Date) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
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

  // Ordenar por fecha dentro de cada fondo
  for (const cmfCode in grouped) {
    grouped[cmfCode].sort((a, b) => a.date.localeCompare(b.date));
  }

  return grouped;
}

// ============================================================
// EJECUCIÓN
// ============================================================

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('❌ Error: Debes especificar el archivo');
    console.error('');
    console.error('Uso:');
    console.error('  npx ts-node scripts/import-nav-history.ts valores_cuota.csv');
    console.error('  npx ts-node scripts/import-nav-history.ts valores_cuota.xlsx');
    console.error('');
    console.error('Formato esperado del archivo:');
    console.error('  fecha,cmf_code,valor_cuota');
    console.error('  2024-11-22,8707,2548.50');
    console.error('  2024-11-21,8707,2545.30');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: Archivo no encontrado: ${filePath}`);
    process.exit(1);
  }

  try {
    await importNavHistory(filePath);
    console.log('✅ Proceso completado exitosamente');
  } catch (error: unknown) {
    console.error('');
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('💥 Error fatal:', errorMessage);
    if (errorStack) {
      console.error('Stack trace:', errorStack);
    }
    process.exit(1);
  }
}

main();
