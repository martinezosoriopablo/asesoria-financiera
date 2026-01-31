import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fecha_actualizacion = formData.get('fecha_actualizacion') as string || new Date().toISOString().split('T')[0];
    const modo = formData.get('modo') as string || 'actualizar';

    console.log('📤 POST tac:', { fileName: file?.name, fecha_actualizacion, modo });
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

    console.log('📊 Excel procesado:', { totalFilas: data.length });

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'El archivo Excel está vacío' },
        { status: 400 }
      );
    }

    // ✅ OPTIMIZACIÓN 1: Obtener TODOS los fondos de una vez
    const fondosMap = new Map<string, string>(); // key: "fo_run-fm_serie", value: id
    const fondosNoEncontrados: string[] = [];
    
    // Extraer todos los fo_run-fm_serie únicos del Excel
    const fondosKeys = new Set<string>();
    for (const row of data) {
      const fo_run = (row as any).fo_run || (row as any).FO_RUN || (row as any).forun;
      const fm_serie = ((row as any).fm_serie || (row as any).FM_SERIE || (row as any).serie)?.toString().trim().toUpperCase();
      if (fo_run && fm_serie) {
        fondosKeys.add(`${fo_run}-${fm_serie}`);
      }
    }

    console.log('🔍 Buscando fondos en batch:', fondosKeys.size);

    // ✅ BATCH QUERY: Obtener todos los fondos de una vez
    const { data: fondos, error: fondosError } = await supabase
      .from('fondos_mutuos')
      .select('id, fo_run, fm_serie')
      .limit(10000);

    if (fondosError) {
      console.error('Error obteniendo fondos:', fondosError);
      return NextResponse.json(
        { success: false, error: 'Error al buscar fondos' },
        { status: 500 }
      );
    }

    // Crear mapa de fondos
    fondos?.forEach((fondo: any) => {
      const key = `${fondo.fo_run}-${fondo.fm_serie}`;
      fondosMap.set(key, fondo.id);
    });

    console.log('✅ Fondos encontrados:', fondosMap.size);

    // ✅ OPTIMIZACIÓN 2: Preparar todas las actualizaciones
    const updates: Array<{ id: string; fo_run: number; fm_serie: string; tac_sintetica: number }> = [];
    let errores = 0;
    
    for (const row of data) {
      try {
        const fo_run = parseInt((row as any).fo_run || (row as any).FO_RUN || (row as any).forun);
        const fm_serie = ((row as any).fm_serie || (row as any).FM_SERIE || (row as any).serie)?.toString().trim().toUpperCase();
        const tac_sintetica = parseFloat((row as any).tac_sintetica || (row as any).TAC_SINTETICA || (row as any).tac);
        
        if (!fo_run || !fm_serie || isNaN(tac_sintetica)) {
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

        updates.push({
          id: fondoId,
          fo_run,
          fm_serie,
          tac_sintetica
        });
      } catch (error) {
        errores++;
      }
    }

    console.log('📝 Updates preparados:', updates.length);

    if (updates.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No se pudieron procesar fondos válidos', 
          fondosNoEncontrados 
        },
        { status: 400 }
      );
    }

    // ✅ OPTIMIZACIÓN 3: Batch updates en grupos de 500
    const BATCH_SIZE = 500;
    let actualizados = 0;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      
      console.log(`💾 Procesando batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(updates.length / BATCH_SIZE)}...`);

      // Usar upsert para batch update
      const { error: upsertError } = await supabase
        .from('fondos_mutuos')
        .upsert(
          batch.map(u => ({
            id: u.id,
            fo_run: u.fo_run,
            fm_serie: u.fm_serie,
            tac_sintetica: u.tac_sintetica,
            updated_at: new Date().toISOString()
          })),
          { onConflict: 'id' }
        );

      if (upsertError) {
        console.error('Error en batch update:', upsertError);
        // Continuar con el siguiente batch
      } else {
        actualizados += batch.length;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Completado en ${totalTime}s: ${actualizados} fondos actualizados`);

    return NextResponse.json({
      success: true,
      actualizados: actualizados,
      errores: errores,
      fecha_actualizacion: fecha_actualizacion,
      modo: modo,
      fondosNoEncontrados: fondosNoEncontrados,
      tiempo_segundos: parseFloat(totalTime)
    });

  } catch (error: any) {
    console.error('❌ Error en API tac POST:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
