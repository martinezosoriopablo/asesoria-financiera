// scripts/import-funds.ts

/**
 * Script para importar fondos mutuos desde Excel a Supabase
 * Versión FINAL corregida
 */

// Cargar variables de entorno PRIMERO
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

// ============================================================
// VERIFICAR VARIABLES DE ENTORNO
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Faltan variables de entorno en .env.local');
  console.error('');
  console.error('Asegúrate de tener:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.error('');
  console.error('💡 Obtén el SERVICE_ROLE_KEY en:');
  console.error('   Supabase Dashboard → Settings → API → service_role key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('✅ Conectado a Supabase');
console.log('');

// ============================================================
// MAPEO DE CATEGORÍAS
// ============================================================

const ASSET_CLASS_MAP: Record<string, string> = {
  'Accionario internacional': 'equity',
  'Accionario nacional': 'equity',
  'Deuda < 90 dias': 'money_market',
  'Deuda < 365 dias': 'money_market',
  'Deuda > 365 dias': 'fixed_income',
  'Balanceado conservador': 'balanced',
  'Balanceado moderado': 'balanced',
  'Balanceado agresivo': 'balanced',
  'Estructurados': 'alternative',
};

const SUB_CATEGORY_MAP: Record<string, string> = {
  'Accionario internacional': 'Global Equity',
  'Accionario nacional': 'Chile Equity',
  'Deuda < 90 dias': 'Money Market',
  'Deuda < 365 dias': 'Short Term Bonds',
  'Deuda > 365 dias': 'Long Term Bonds',
  'Balanceado conservador': 'Conservative',
  'Balanceado moderado': 'Moderate',
  'Balanceado agresivo': 'Aggressive',
  'Estructurados': 'Structured Products',
};

const GEOGRAPHIC_MAP: Record<string, string> = {
  'Accionario internacional': 'Global',
  'Accionario nacional': 'Chile',
  'Deuda < 90 dias': 'Chile',
  'Deuda < 365 dias': 'Chile',
  'Deuda > 365 dias': 'Chile',
  'Balanceado conservador': 'Chile',
  'Balanceado moderado': 'Chile',
  'Balanceado agresivo': 'Chile',
  'Estructurados': 'Global',
};

// ============================================================
// INTERFACES
// ============================================================

interface ExcelFund {
  fo_run: number;
  fm_serie: string;
  pat_total: number;
  fm_fecha_num: number;
  moneda_funcional: string;
  familia_estudios: string;
  clase_inversionista: string;
  nombre_fondo: string;
  nombre_agf: string;
  serie_digital: number;
  tac_sintetica: number;
}

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

async function importFundsFromExcel(filePath: string): Promise<void> {
  console.log('🚀 Iniciando importación de fondos mutuos');
  console.log('📂 Leyendo archivo Excel:', filePath);
  console.log('');
  
  // Leer Excel
  const workbook = XLSX.readFile(filePath);
  const sheetName = 'datos';
  
  if (!workbook.Sheets[sheetName]) {
    console.error(`❌ Error: No se encontró la hoja "${sheetName}" en el Excel`);
    console.error('Hojas disponibles:', workbook.SheetNames.join(', '));
    process.exit(1);
  }
  
  const worksheet = workbook.Sheets[sheetName];
  const data: ExcelFund[] = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`✅ ${data.length} fondos encontrados en Excel`);
  console.log('');
  
  let created = 0;
  let updated = 0;
  let errors = 0;
  const errorMessages: string[] = [];
  
  // Procesar en lotes de 50
  const batchSize = 50;
  const totalBatches = Math.ceil(data.length / batchSize);
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    
    console.log(`📦 Procesando lote ${currentBatch}/${totalBatches} (${batch.length} fondos)...`);
    
    for (const excelFund of batch) {
      try {
        const fundData = transformFundData(excelFund);
        
        // Verificar si el fondo ya existe
        const { data: existingFund, error: selectError } = await supabase
          .from('funds')
          .select('id')
          .eq('cmf_code', fundData.cmf_code)
          .eq('series', fundData.series)
          .single();
        
        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError;
        }
        
        if (existingFund) {
          // Actualizar
          const { error } = await supabase
            .from('funds')
            .update(fundData)
            .eq('id', existingFund.id);
          
          if (error) {
            errorMessages.push(`Error actualizando ${fundData.name}: ${error.message}`);
            errors++;
          } else {
            updated++;
          }
        } else {
          // Crear
          const { error } = await supabase
            .from('funds')
            .insert(fundData);
          
          if (error) {
            errorMessages.push(`Error creando ${fundData.name}: ${error.message}`);
            errors++;
          } else {
            created++;
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errorMessages.push(`Error procesando fondo: ${errorMessage}`);
        errors++;
      }
    }
    
    const progress = ((i + batch.length) / data.length * 100).toFixed(1);
    console.log(`   ✅ ${created} creados | 🔄 ${updated} actualizados | ❌ ${errors} errores | ${progress}% completado`);
    
    // Pausa para no saturar Supabase
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log('🎉 IMPORTACIÓN COMPLETADA');
  console.log('='.repeat(70));
  console.log(`✅ Fondos creados: ${created}`);
  console.log(`🔄 Fondos actualizados: ${updated}`);
  console.log(`❌ Errores: ${errors}`);
  console.log('='.repeat(70));
  
  if (errorMessages.length > 0 && errorMessages.length <= 10) {
    console.log('');
    console.log('⚠️  Primeros errores:');
    errorMessages.slice(0, 10).forEach(msg => console.log(`   - ${msg}`));
  }
  
  console.log('');
  console.log('🔍 Verifica los datos en Supabase Table Editor → funds');
}

// ============================================================
// TRANSFORMACIÓN DE DATOS
// ============================================================

interface FundData {
  ticker: string;
  name: string;
  series: string;
  provider: string;
  provider_code: string;
  asset_class: string;
  sub_category: string;
  geographic_focus: string;
  currency: string;
  total_expense_ratio: number;
  management_fee: number;
  aum: number;
  aum_currency: string;
  is_active: boolean;
  cmf_code: string;
  description: string;
  minimum_investment: number | null;
}

function transformFundData(excelFund: ExcelFund): FundData {
  const ticker = generateTicker(
    excelFund.nombre_agf,
    excelFund.nombre_fondo,
    excelFund.fm_serie,
    excelFund.fo_run
  );
  
  const provider = normalizeProvider(excelFund.nombre_agf);
  const assetClass = ASSET_CLASS_MAP[excelFund.familia_estudios] || 'balanced';
  const subCategory = SUB_CATEGORY_MAP[excelFund.familia_estudios] || excelFund.familia_estudios;
  const geographicFocus = GEOGRAPHIC_MAP[excelFund.familia_estudios] || 'Chile';
  
  const currency = excelFund.moneda_funcional === '$$' ? 'CLP' : 
                   excelFund.moneda_funcional === 'PROM' ? 'CLP' : 
                   'CLP';
  
  const ter = excelFund.tac_sintetica / 100;
  const aum = excelFund.pat_total * 1_000_000;
  
  const description = `${excelFund.nombre_fondo} Serie ${excelFund.fm_serie} - ${excelFund.familia_estudios} - ${excelFund.clase_inversionista}${excelFund.serie_digital === 1 ? ' (Digital)' : ''}`;
  
  const minimumInvestment = getMinimumInvestment(
    excelFund.clase_inversionista,
    excelFund.serie_digital
  );
  
  return {
    ticker,
    name: `${excelFund.nombre_fondo} ${excelFund.fm_serie}`,
    series: excelFund.fm_serie,
    provider,
    provider_code: excelFund.fo_run.toString(),
    asset_class: assetClass,
    sub_category: subCategory,
    geographic_focus: geographicFocus,
    currency,
    total_expense_ratio: ter,
    management_fee: ter,
    aum,
    aum_currency: currency,
    is_active: true,
    cmf_code: excelFund.fo_run.toString(),
    description,
    minimum_investment: minimumInvestment,
  };
}

function generateTicker(provider: string, fundName: string, series: string, foRun: number): string {
  const providerCode = provider.substring(0, 4).toUpperCase().replace(/\s/g, '');
  const fundCode = fundName.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, '');
  const seriesCode = series.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 3);
  return `${providerCode}-${fundCode}-${seriesCode}-${foRun}`;
}

function normalizeProvider(provider: string): string {
  const mapping: Record<string, string> = {
    'BANCHILE': 'Banchile Inversiones',
    'BCI': 'BCI Asset Management',
    'SURA': 'SURA Inversiones',
    'SANTANDER': 'Santander Asset Management',
    'PRINCIPAL': 'Principal',
    'LARRAINVIAL AM': 'LarrainVial Asset Management',
    'ITAU': 'Itaú Asset Management',
    'SECURITY': 'Security',
    'BICE': 'BICE Inversiones',
    'SCOTIA CHILE': 'Scotiabank Chile',
    'BANCOESTADO': 'BancoEstado',
    'ZURICH': 'Zurich',
    'BTG PACTUAL': 'BTG Pactual',
    'CREDICORP': 'Credicorp Capital',
    'PRUDENTIAL': 'Prudential',
  };
  return mapping[provider] || provider;
}

function getMinimumInvestment(claseInversionista: string, serieDigital: number): number | null {
  if (claseInversionista === 'Alto Patrimonio') return 5_000_000;
  if (claseInversionista === 'APV') return 10_000;
  if (serieDigital === 1) return 1_000;
  return 100_000;
}

// ============================================================
// EJECUCIÓN
// ============================================================

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.error('❌ Error: Debes especificar el archivo Excel');
    console.error('');
    console.error('Uso:');
    console.error('  npx ts-node scripts/import-funds.ts articles-91847_document_2.xlsx');
    process.exit(1);
  }
  
  try {
    await importFundsFromExcel(filePath);
    console.log('✅ Proceso completado exitosamente');
  } catch (error: unknown) {
    console.error('');
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('💥 Error fatal:', errorMessage);
    console.error('');
    if (errorStack) {
      console.error('Stack trace:', errorStack);
    }
    process.exit(1);
  }
}

main();
