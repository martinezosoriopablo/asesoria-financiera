// scripts/import-funds-from-excel.ts

/**
 * Script para importar fondos mutuos desde Excel oficial de CMF a Supabase
 * 
 * Fuente: articles-91847_document_2.xlsx
 * Contiene: 2,071 fondos con RUN, series, costos y patrimonio
 */

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'fs';

// ============================================================
// CONFIGURACIÓN
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================
// MAPEO DE CATEGORÍAS
// ============================================================

// Mapeo de "familia_estudios" a asset_class
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

// Mapeo de "familia_estudios" a sub_category
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

// Mapeo de "familia_estudios" a geographic_focus
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

interface FundForDB {
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
  aum: number;
  aum_currency: string;
  is_active: boolean;
  cmf_code: string;
  description: string;
  minimum_investment: number | null;
}

// ============================================================
// FUNCIONES PRINCIPALES
// ============================================================

async function importFundsFromExcel(filePath: string): Promise<void> {
  console.log('📂 Leyendo archivo Excel...');
  
  // Leer Excel
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data: ExcelFund[] = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`✅ ${data.length} fondos encontrados en Excel`);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Procesar en lotes de 50
  const batchSize = 50;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    console.log(`\n📦 Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(data.length / batchSize)}...`);
    
    for (const excelFund of batch) {
      try {
        const fundData = transformFundData(excelFund);
        
        // Verificar si el fondo ya existe
        const { data: existingFund } = await supabase
          .from('funds')
          .select('id')
          .eq('ticker', fundData.ticker)
          .single();
        
        if (existingFund) {
          // Actualizar fondo existente
          const { error } = await supabase
            .from('funds')
            .update(fundData)
            .eq('id', existingFund.id);
          
          if (error) {
            console.error(`❌ Error actualizando ${fundData.ticker}:`, error.message);
            errors++;
          } else {
            updated++;
          }
        } else {
          // Crear nuevo fondo
          const { error } = await supabase
            .from('funds')
            .insert(fundData);
          
          if (error) {
            console.error(`❌ Error creando ${fundData.ticker}:`, error.message);
            errors++;
          } else {
            created++;
          }
        }
      } catch (error: any) {
        console.error(`❌ Error procesando fondo:`, error.message);
        errors++;
      }
    }
    
    // Progreso
    console.log(`✅ Progreso: ${created} creados, ${updated} actualizados, ${errors} errores`);
    
    // Pausa para no saturar Supabase
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 IMPORTACIÓN COMPLETADA');
  console.log('='.repeat(60));
  console.log(`✅ Fondos creados: ${created}`);
  console.log(`🔄 Fondos actualizados: ${updated}`);
  console.log(`⏭️  Fondos omitidos: ${skipped}`);
  console.log(`❌ Errores: ${errors}`);
  console.log('='.repeat(60));
}

// ============================================================
// TRANSFORMACIÓN DE DATOS
// ============================================================

function transformFundData(excelFund: ExcelFund): FundForDB {
  // Generar ticker único
  const ticker = generateTicker(
    excelFund.nombre_agf,
    excelFund.nombre_fondo,
    excelFund.fm_serie,
    excelFund.fo_run
  );
  
  // Normalizar nombre de la administradora
  const provider = normalizeProvider(excelFund.nombre_agf);
  
  // Obtener clasificaciones
  const assetClass = ASSET_CLASS_MAP[excelFund.familia_estudios] || 'balanced';
  const subCategory = SUB_CATEGORY_MAP[excelFund.familia_estudios] || excelFund.familia_estudios;
  const geographicFocus = GEOGRAPHIC_MAP[excelFund.familia_estudios] || 'Chile';
  
  // Normalizar moneda
  const currency = excelFund.moneda_funcional === '$$' ? 'CLP' : 
                   excelFund.moneda_funcional === 'PROM' ? 'CLP' : 
                   'CLP';
  
  // Convertir TAC de porcentaje a decimal
  const ter = excelFund.tac_sintetica / 100;
  
  // Patrimonio en millones
  const aum = excelFund.pat_total * 1_000_000;
  
  // Descripción completa
  const description = `${excelFund.nombre_fondo} Serie ${excelFund.fm_serie} - ${excelFund.familia_estudios} - ${excelFund.clase_inversionista}${excelFund.serie_digital === 1 ? ' (Digital)' : ''}`;
  
  // Mínimo de inversión según clase
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
    aum,
    aum_currency: currency,
    is_active: true,
    cmf_code: excelFund.fo_run.toString(),
    description,
    minimum_investment: minimumInvestment,
  };
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function generateTicker(
  provider: string,
  fundName: string,
  series: string,
  foRun: number
): string {
  // Formato: PROVIDER-FUNDCODE-SERIES
  // Ejemplo: BANC-GLOB-A
  
  const providerCode = provider
    .substring(0, 4)
    .toUpperCase()
    .replace(/\s/g, '');
  
  const fundCode = fundName
    .substring(0, 4)
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  
  const seriesCode = series
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 3);
  
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

function getMinimumInvestment(
  claseInversionista: string,
  serieDigital: number
): number | null {
  // Estimaciones basadas en la clase de inversionista
  if (claseInversionista === 'Alto Patrimonio') {
    return 5_000_000; // $5M CLP
  } else if (claseInversionista === 'APV') {
    return 10_000; // $10K CLP (APV suele tener mínimos bajos)
  } else if (serieDigital === 1) {
    return 1_000; // $1K CLP (fondos digitales)
  } else {
    return 100_000; // $100K CLP (retail standard)
  }
}

// ============================================================
// EJECUCIÓN
// ============================================================

async function main() {
  const filePath = process.argv[2] || './articles-91847_document_2.xlsx';
  
  console.log('🚀 Iniciando importación de fondos mutuos');
  console.log(`📁 Archivo: ${filePath}`);
  console.log('');
  
  try {
    await importFundsFromExcel(filePath);
  } catch (error: any) {
    console.error('💥 Error fatal:', error.message);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main();
}

export { importFundsFromExcel, transformFundData };
