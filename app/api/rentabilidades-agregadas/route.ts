import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Obtener rentabilidades agregadas más recientes de cada fondo
    const { data, error } = await supabase
      .from('fondos_rentabilidades_latest')
      .select('*')
      .order('nombre_fondo', { ascending: true });
    
    if (error) {
      console.error('Error obteniendo rentabilidades agregadas:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: data?.length || 0
    });
    
  } catch (error: any) {
    console.error('Error en API rentabilidades-agregadas GET:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fecha_calculo = formData.get('fecha_calculo') as string || new Date().toISOString().split('T')[0];
    const modo = formData.get('modo') as string || 'reemplazar';

    console.log('📤 POST rentabilidades-agregadas:', { fileName: file?.name, fecha_calculo, modo });
    const startTime = Date.now();

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Falta el archivo Excel' },
        { status: 400 }
      );
    }

    // Leer Excel
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log('📊 Excel procesado:', { totalFilas: data.length, primeraFila: data[0] });
    console.log('📋 Columnas detectadas:', data[0] ? Object.keys(data[0]) : 'ninguna');

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'El archivo Excel está vacío' },
        { status: 400 }
      );
    }

    // ✅ OPTIMIZACIÓN 1: Obtener TODOS los fondos con paginación (Supabase limita a 1000 por query)
    const fondosMap = new Map<string, string>(); // key: "fo_run-fm_serie", value: id
    const fondosNoEncontrados: string[] = [];

    console.log('🔍 Buscando fondos en batch (con paginación)...');

    // Paginar para obtener todos los fondos (Supabase limita a 1000 por query)
    const PAGE_SIZE = 1000;
    let currentPage = 0;
    let hasMore = true;

    while (hasMore) {
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: fondos, error: fondosError } = await supabase
        .from('fondos_mutuos')
        .select('id, fo_run, fm_serie')
        .range(from, to);

      if (fondosError) {
        console.error('Error obteniendo fondos (página ' + currentPage + '):', fondosError);
        return NextResponse.json(
          { success: false, error: 'Error al buscar fondos' },
          { status: 500 }
        );
      }

      // Agregar fondos al mapa
      fondos?.forEach((fondo: any) => {
        const key = `${fondo.fo_run}-${fondo.fm_serie}`;
        fondosMap.set(key, fondo.id);
      });

      // Si trajo menos de PAGE_SIZE, no hay más páginas
      hasMore = fondos !== null && fondos.length === PAGE_SIZE;
      currentPage++;

      // Seguridad: máximo 10 páginas (10,000 fondos)
      if (currentPage >= 10) hasMore = false;
    }

    console.log('✅ Fondos cargados:', fondosMap.size, '(' + currentPage + ' páginas)');

    // ✅ OPTIMIZACIÓN 2: Preparar registros sin queries individuales
    const registros: any[] = [];
    let errores = 0;
    
    for (const row of data) {
      try {
        // Buscar fo_run en diferentes posibles nombres de columna
        const fo_run = (row as any).fo_run || (row as any).FO_RUN || (row as any).forun ||
                       (row as any)['1'] || (row as any)['FO_RUN'] || (row as any)['Fo_Run'] ||
                       (row as any).run || (row as any).RUN;
        const fm_serie = ((row as any).fm_serie || (row as any).FM_SERIE || (row as any).serie ||
                         (row as any).SERIE || (row as any).Serie)?.toString().trim().toUpperCase();
        
        if (!fo_run || !fm_serie) {
          if (errores < 3) {
            console.log('⚠️ Fila sin fo_run o fm_serie:', { fo_run, fm_serie, row: JSON.stringify(row).substring(0, 200) });
          }
          errores++;
          continue;
        }

        const fondoKey = `${fo_run}-${fm_serie}`;
        const fondoId = fondosMap.get(fondoKey);

        if (!fondoId) {
          fondosNoEncontrados.push(fondoKey);
          errores++;
          continue;
        }

        // Extraer rentabilidades (soportar diferentes nombres y formato europeo con comas)
        const parseNum = (val: any) => {
          if (val === null || val === undefined || val === '') return null;
          // Si es número, retornarlo directamente
          if (typeof val === 'number') return val;
          // Si es string, convertir comas a puntos (formato europeo)
          let strVal = String(val).trim();
          // Si tiene múltiples comas (dato corrupto como "77,16,54"), retornar null
          const commaCount = (strVal.match(/,/g) || []).length;
          if (commaCount > 1) return null;
          // Reemplazar coma por punto
          strVal = strVal.replace(',', '.');
          const num = parseFloat(strVal);
          return isNaN(num) ? null : num;
        };

        const registro = {
          fondo_id: fondoId,
          fecha_calculo,
          rent_7d: parseNum((row as any).rent_7d || (row as any).rent_7dias || (row as any).RENT_7D),
          rent_30d: parseNum((row as any).rent_30d || (row as any).rent_30dias || (row as any).RENT_30D),
          rent_90d: parseNum((row as any).rent_90d || (row as any).rent_90dias || (row as any).RENT_90D),
          rent_180d: parseNum((row as any).rent_180d || (row as any).rent_180dias || (row as any).RENT_180D),
          rent_365d: parseNum((row as any).rent_365d || (row as any).rent_365 || (row as any).rent_1y || (row as any).RENT_365D || (row as any).RENT_365),
          rent_ytd: parseNum((row as any).rent_ytd || (row as any).YTD || (row as any).RENT_YTD),
          rent_3y: parseNum((row as any).rent_3y || (row as any).RENT_3Y),
          rent_5y: parseNum((row as any).rent_5y || (row as any).RENT_5Y),
          rent_desde_inicio: parseNum((row as any).rent_desde_inicio || (row as any).rent_inception),
          volatilidad_30d: parseNum((row as any).volatilidad_30d || (row as any).vol_30d),
          volatilidad_365d: parseNum((row as any).volatilidad_365d || (row as any).vol_365d),
          sharpe_365d: parseNum((row as any).sharpe_365d || (row as any).sharpe),
          sortino_365d: parseNum((row as any).sortino_365d || (row as any).sortino),
          max_drawdown_365d: parseNum((row as any).max_drawdown_365d || (row as any).max_dd),
          patrimonio_mm: parseNum((row as any).patrimonio_mm || (row as any).patrimonio),
          num_partícipes: parseNum((row as any).num_participes || (row as any).participes),
          fuente: 'manual'
        };

        registros.push(registro);
      } catch (error) {
        console.error('Error procesando fila:', row, error);
        errores++;
      }
    }

    console.log('📝 Registros preparados:', { total: registros.length, errores });

    if (registros.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No se pudieron procesar registros válidos', 
          fondosNoEncontrados 
        },
        { status: 400 }
      );
    }

    // Si modo es 'reemplazar', borrar datos de la misma fecha
    if (modo === 'reemplazar') {
      console.log('🗑️ Borrando datos existentes de la fecha:', fecha_calculo);
      const { error: deleteError } = await supabase
        .from('fondos_rentabilidades_agregadas')
        .delete()
        .eq('fecha_calculo', fecha_calculo);

      if (deleteError) {
        console.error('Error borrando datos existentes:', deleteError);
      }
    }

    // ✅ OPTIMIZACIÓN 3: Batch insert en grupos de 1000
    const BATCH_SIZE = 1000;
    let insertados = 0;

    for (let i = 0; i < registros.length; i += BATCH_SIZE) {
      const batch = registros.slice(i, i + BATCH_SIZE);
      
      console.log(`💾 Insertando batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(registros.length / BATCH_SIZE)}...`);

      const { error: insertError } = await supabase
        .from('fondos_rentabilidades_agregadas')
        .insert(batch);

      if (insertError) {
        console.error('❌ Error insertando batch:', insertError);
        // Continuar con el siguiente batch
      } else {
        insertados += batch.length;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Completado en ${totalTime}s: ${insertados} registros insertados`);

    return NextResponse.json({
      success: true,
      insertados: insertados,
      errores: errores,
      fecha_calculo: fecha_calculo,
      modo: modo,
      fondosNoEncontrados: fondosNoEncontrados,
      tiempo_segundos: parseFloat(totalTime)
    });

  } catch (error: any) {
    console.error('❌ Error en API rentabilidades-agregadas POST:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
