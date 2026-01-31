"use strict";
// scripts/import-funds-from-excel.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importFundsFromExcel = importFundsFromExcel;
exports.transformFundData = transformFundData;
/**
 * Script para importar fondos mutuos desde Excel oficial de CMF a Supabase
 *
 * Fuente: articles-91847_document_2.xlsx
 * Contiene: 2,071 fondos con RUN, series, costos y patrimonio
 */
var supabase_js_1 = require("@supabase/supabase-js");
var XLSX = require("xlsx");
// ============================================================
// CONFIGURACIÓN
// ============================================================
var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY);
// ============================================================
// MAPEO DE CATEGORÍAS
// ============================================================
// Mapeo de "familia_estudios" a asset_class
var ASSET_CLASS_MAP = {
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
var SUB_CATEGORY_MAP = {
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
var GEOGRAPHIC_MAP = {
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
// FUNCIONES PRINCIPALES
// ============================================================
function importFundsFromExcel(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var workbook, sheetName, worksheet, data, created, updated, skipped, errors, batchSize, i, batch, _i, batch_1, excelFund, fundData, existingFund, error, error, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('📂 Leyendo archivo Excel...');
                    workbook = XLSX.readFile(filePath);
                    sheetName = workbook.SheetNames[0];
                    worksheet = workbook.Sheets[sheetName];
                    data = XLSX.utils.sheet_to_json(worksheet);
                    console.log("\u2705 ".concat(data.length, " fondos encontrados en Excel"));
                    created = 0;
                    updated = 0;
                    skipped = 0;
                    errors = 0;
                    batchSize = 50;
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < data.length)) return [3 /*break*/, 14];
                    batch = data.slice(i, i + batchSize);
                    console.log("\n\uD83D\uDCE6 Procesando lote ".concat(Math.floor(i / batchSize) + 1, "/").concat(Math.ceil(data.length / batchSize), "..."));
                    _i = 0, batch_1 = batch;
                    _a.label = 2;
                case 2:
                    if (!(_i < batch_1.length)) return [3 /*break*/, 11];
                    excelFund = batch_1[_i];
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 9, , 10]);
                    fundData = transformFundData(excelFund);
                    return [4 /*yield*/, supabase
                            .from('funds')
                            .select('id')
                            .eq('ticker', fundData.ticker)
                            .single()];
                case 4:
                    existingFund = (_a.sent()).data;
                    if (!existingFund) return [3 /*break*/, 6];
                    return [4 /*yield*/, supabase
                            .from('funds')
                            .update(fundData)
                            .eq('id', existingFund.id)];
                case 5:
                    error = (_a.sent()).error;
                    if (error) {
                        console.error("\u274C Error actualizando ".concat(fundData.ticker, ":"), error.message);
                        errors++;
                    }
                    else {
                        updated++;
                    }
                    return [3 /*break*/, 8];
                case 6: return [4 /*yield*/, supabase
                        .from('funds')
                        .insert(fundData)];
                case 7:
                    error = (_a.sent()).error;
                    if (error) {
                        console.error("\u274C Error creando ".concat(fundData.ticker, ":"), error.message);
                        errors++;
                    }
                    else {
                        created++;
                    }
                    _a.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_1 = _a.sent();
                    console.error("\u274C Error procesando fondo:", error_1.message);
                    errors++;
                    return [3 /*break*/, 10];
                case 10:
                    _i++;
                    return [3 /*break*/, 2];
                case 11:
                    // Progreso
                    console.log("\u2705 Progreso: ".concat(created, " creados, ").concat(updated, " actualizados, ").concat(errors, " errores"));
                    // Pausa para no saturar Supabase
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                case 12:
                    // Pausa para no saturar Supabase
                    _a.sent();
                    _a.label = 13;
                case 13:
                    i += batchSize;
                    return [3 /*break*/, 1];
                case 14:
                    console.log('\n' + '='.repeat(60));
                    console.log('🎉 IMPORTACIÓN COMPLETADA');
                    console.log('='.repeat(60));
                    console.log("\u2705 Fondos creados: ".concat(created));
                    console.log("\uD83D\uDD04 Fondos actualizados: ".concat(updated));
                    console.log("\u23ED\uFE0F  Fondos omitidos: ".concat(skipped));
                    console.log("\u274C Errores: ".concat(errors));
                    console.log('='.repeat(60));
                    return [2 /*return*/];
            }
        });
    });
}
// ============================================================
// TRANSFORMACIÓN DE DATOS
// ============================================================
function transformFundData(excelFund) {
    // Generar ticker único
    var ticker = generateTicker(excelFund.nombre_agf, excelFund.nombre_fondo, excelFund.fm_serie, excelFund.fo_run);
    // Normalizar nombre de la administradora
    var provider = normalizeProvider(excelFund.nombre_agf);
    // Obtener clasificaciones
    var assetClass = ASSET_CLASS_MAP[excelFund.familia_estudios] || 'balanced';
    var subCategory = SUB_CATEGORY_MAP[excelFund.familia_estudios] || excelFund.familia_estudios;
    var geographicFocus = GEOGRAPHIC_MAP[excelFund.familia_estudios] || 'Chile';
    // Normalizar moneda
    var currency = excelFund.moneda_funcional === '$$' ? 'CLP' :
        excelFund.moneda_funcional === 'PROM' ? 'CLP' :
            'CLP';
    // Convertir TAC de porcentaje a decimal
    var ter = excelFund.tac_sintetica / 100;
    // Patrimonio en millones
    var aum = excelFund.pat_total * 1000000;
    // Descripción completa
    var description = "".concat(excelFund.nombre_fondo, " Serie ").concat(excelFund.fm_serie, " - ").concat(excelFund.familia_estudios, " - ").concat(excelFund.clase_inversionista).concat(excelFund.serie_digital === 1 ? ' (Digital)' : '');
    // Mínimo de inversión según clase
    var minimumInvestment = getMinimumInvestment(excelFund.clase_inversionista, excelFund.serie_digital);
    return {
        ticker: ticker,
        name: "".concat(excelFund.nombre_fondo, " ").concat(excelFund.fm_serie),
        series: excelFund.fm_serie,
        provider: provider,
        provider_code: excelFund.fo_run.toString(),
        asset_class: assetClass,
        sub_category: subCategory,
        geographic_focus: geographicFocus,
        currency: currency,
        total_expense_ratio: ter,
        aum: aum,
        aum_currency: currency,
        is_active: true,
        cmf_code: excelFund.fo_run.toString(),
        description: description,
        minimum_investment: minimumInvestment,
    };
}
// ============================================================
// FUNCIONES AUXILIARES
// ============================================================
function generateTicker(provider, fundName, series, foRun) {
    // Formato: PROVIDER-FUNDCODE-SERIES
    // Ejemplo: BANC-GLOB-A
    var providerCode = provider
        .substring(0, 4)
        .toUpperCase()
        .replace(/\s/g, '');
    var fundCode = fundName
        .substring(0, 4)
        .toUpperCase()
        .replace(/[^A-Z]/g, '');
    var seriesCode = series
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 3);
    return "".concat(providerCode, "-").concat(fundCode, "-").concat(seriesCode, "-").concat(foRun);
}
function normalizeProvider(provider) {
    var mapping = {
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
function getMinimumInvestment(claseInversionista, serieDigital) {
    // Estimaciones basadas en la clase de inversionista
    if (claseInversionista === 'Alto Patrimonio') {
        return 5000000; // $5M CLP
    }
    else if (claseInversionista === 'APV') {
        return 10000; // $10K CLP (APV suele tener mínimos bajos)
    }
    else if (serieDigital === 1) {
        return 1000; // $1K CLP (fondos digitales)
    }
    else {
        return 100000; // $100K CLP (retail standard)
    }
}
// ============================================================
// EJECUCIÓN
// ============================================================
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var filePath, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    filePath = process.argv[2] || './articles-91847_document_2.xlsx';
                    console.log('🚀 Iniciando importación de fondos mutuos');
                    console.log("\uD83D\uDCC1 Archivo: ".concat(filePath));
                    console.log('');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, importFundsFromExcel(filePath)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    console.error('💥 Error fatal:', error_2.message);
                    process.exit(1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}
