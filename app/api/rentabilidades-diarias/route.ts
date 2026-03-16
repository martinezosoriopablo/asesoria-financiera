import { NextRequest, NextResponse } from 'next/server';
import { requireAdvisor, requireAdmin, createAdminClient } from '@/lib/auth/api-auth';
import * as XLSX from 'xlsx';
import { applyRateLimit } from "@/lib/rate-limit";

// Interfaces for Excel data processing
interface ExcelRow {
  [key: string]: string | number | Date | null | undefined;
}

interface RentabilidadRegistro {
  fondo_id: string;
  fecha: string;
  valor_cuota: number;
  rent_diaria: number | null;
}

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "rentabilidades-diarias", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Leer headers
    const fo_run = request.headers.get('x-fo-run');
    const fm_serie = request.headers.get('x-fm-serie');

    if (!fo_run || !fm_serie) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros fo_run o fm_serie' },
        { status: 400 }
      );
    }

    // Buscar fondo
    const { data: fondo, error: fondoError } = await supabase
      .from('fondos_mutuos')
      .select('id, nombre_fondo')
      .eq('fo_run', parseInt(fo_run))
      .eq('fm_serie', fm_serie.toUpperCase())
      .single();

    if (fondoError || !fondo) {
      return NextResponse.json(
        { success: false, error: 'Fondo no encontrado' },
        { status: 404 }
      );
    }

    // ✅ FIX LÍMITE 1000: Ordenar descendente + reversar
    // Esto trae los MÁS RECIENTES si hay límite de Supabase
    const { data: datosDesc, error: datosError } = await supabase
      .from('fondos_rentabilidades_diarias')
      .select('fecha, valor_cuota, rent_diaria')
      .eq('fondo_id', fondo.id)
      .order('fecha', { ascending: false })  // Más recientes primero
      .limit(10000);
    
    if (datosError) {
      return NextResponse.json(
        { success: false, error: datosError.message },
        { status: 500 }
      );
    }

    // Reversar para orden cronológico
    const datos = datosDesc ? [...datosDesc].reverse() : [];
    
    return NextResponse.json({
      success: true,
      datos: datos,
      total: datos.length
    });

  } catch (error: unknown) {
    console.error('❌ Error en API rentabilidades-diarias GET:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, "rentabilidades-diarias-post", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError2 } = await requireAdmin();
  if (authError2) return authError2;

  const supabase = createAdminClient();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fo_run = formData.get('fo_run') as string;
    const fm_serie = formData.get('fm_serie') as string;
    const modo = formData.get('modo') as string || 'agregar';

    if (!file || !fo_run || !fm_serie) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros requeridos' },
        { status: 400 }
      );
    }

    // Buscar fondo
    const { data: fondo, error: fondoError } = await supabase
      .from('fondos_mutuos')
      .select('id')
      .eq('fo_run', parseInt(fo_run))
      .eq('fm_serie', fm_serie.toUpperCase())
      .single();

    if (fondoError || !fondo) {
      return NextResponse.json(
        { success: false, error: 'Fondo no encontrado' },
        { status: 404 }
      );
    }

    // Leer Excel
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'El archivo Excel está vacío' },
        { status: 400 }
      );
    }

    // ✅ FIX CARGA: Buscar nombres de columnas con múltiples variantes
    const primeraFila = data[0] as ExcelRow;
    const columnasDisponibles = Object.keys(primeraFila);
    
    // Función para encontrar columna (case-insensitive, con variantes)
    const findColumn = (row: ExcelRow, variants: string[]): string | number | Date | null | undefined => {
      for (const key of Object.keys(row)) {
        const keyLower = key.toLowerCase().trim();
        for (const variant of variants) {
          if (keyLower === variant.toLowerCase() || 
              keyLower.includes(variant.toLowerCase()) ||
              keyLower.replace(/[_\s]/g, '') === variant.toLowerCase().replace(/[_\s]/g, '')) {
            return row[key];
          }
        }
      }
      return null;
    };

    // ✅ NUEVO: Función para convertir fechas de Excel a formato ISO
    const convertirFechaExcel = (fecha: string | number | Date | null | undefined): string | null => {
      if (!fecha) return null;

      // Si ya es string con formato yyyy-mm-dd o similar, retornar tal cual
      if (typeof fecha === 'string') {
        // Verificar si parece una fecha
        if (fecha.match(/^\d{4}-\d{2}-\d{2}/) || fecha.match(/^\d{2}\/\d{2}\/\d{4}/)) {
          return fecha;
        }
        // Intentar parsear como número
        const num = parseFloat(fecha);
        if (isNaN(num)) return fecha; // Si no es número, retornar como está
        fecha = num; // Continuar con conversión de número
      }

      // Si es número, es fecha serial de Excel
      if (typeof fecha === 'number') {
        // Excel fecha serial: días desde 1899-12-30
        const excelEpoch = new Date(1899, 11, 30); // 30 dic 1899
        const fechaReal = new Date(excelEpoch.getTime() + fecha * 86400000); // 86400000 ms = 1 día
        
        // Formatear a yyyy-mm-dd
        const year = fechaReal.getFullYear();
        const month = String(fechaReal.getMonth() + 1).padStart(2, '0');
        const day = String(fechaReal.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      // Si es Date object
      if (fecha instanceof Date) {
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      return null;
    };

    // Preparar registros con búsqueda flexible
    const registros: RentabilidadRegistro[] = [];
    let errores = 0;
    const erroresDetalle: string[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as ExcelRow;
      try {
        // Buscar fecha (múltiples variantes)
        const fechaRaw = findColumn(row, [
          'fecha', 'Fecha', 'FECHA', 'date', 'Date', 'DATE',
          'fecha_valor', 'FechaValor', 'FECHA_VALOR'
        ]);

        // ✅ NUEVO: Convertir fecha de Excel a formato ISO
        const fecha = convertirFechaExcel(fechaRaw);

        // Buscar valor_cuota (múltiples variantes)
        const valor_cuota_raw = findColumn(row, [
          'valor_cuota', 'ValorCuota', 'VALOR_CUOTA', 'valor cuota',
          'cuota', 'Cuota', 'CUOTA',
          'valor', 'Valor', 'VALOR',
          'price', 'Price', 'PRICE'
        ]);

        // Buscar rent_diaria (múltiples variantes)
        const rent_diaria_raw = findColumn(row, [
          'rent_diaria', 'RentDiaria', 'RENT_DIARIA', 'rent diaria',
          'rentabilidad', 'Rentabilidad', 'RENTABILIDAD',
          'return', 'Return', 'RETURN',
          'rent', 'Rent', 'RENT'
        ]);

        // Validar y parsear
        if (!fecha) {
          erroresDetalle.push(`Fila ${i + 1}: Sin fecha o fecha inválida (${fechaRaw})`);
          errores++;
          continue;
        }

        const valor_cuota = parseFloat(String(valor_cuota_raw));
        if (isNaN(valor_cuota) || valor_cuota <= 0) {
          erroresDetalle.push(`Fila ${i + 1}: Valor cuota inválido (${valor_cuota_raw})`);
          errores++;
          continue;
        }

        const rent_diaria = parseFloat(String(rent_diaria_raw));

        registros.push({
          fondo_id: fondo.id,
          fecha: fecha,
          valor_cuota: valor_cuota,
          rent_diaria: isNaN(rent_diaria) ? null : rent_diaria
        });
      } catch (error) {
        console.error('Error procesando fila:', i, row, error);
        erroresDetalle.push(`Fila ${i + 1}: ${error}`);
        errores++;
      }
    }

    if (registros.length === 0) {
      const errorMsg = `No se pudieron procesar registros válidos. Errores: ${erroresDetalle.slice(0, 5).join('; ')}`;
      console.error('❌', errorMsg);
      return NextResponse.json(
        { 
          success: false, 
          error: errorMsg,
          columnasEncontradas: columnasDisponibles,
          sugerencia: 'Verifica que el Excel tenga columnas: fecha, valor_cuota, rent_diaria'
        },
        { status: 400 }
      );
    }

    // Si modo es reemplazar, borrar datos existentes
    if (modo === 'reemplazar') {
      const { error: deleteError } = await supabase
        .from('fondos_rentabilidades_diarias')
        .delete()
        .eq('fondo_id', fondo.id);

      if (deleteError) {
        console.error('⚠️ Error borrando datos:', deleteError);
      }
    }

    // Insertar nuevos registros
    const { error: insertError, data: insertData } = await supabase
      .from('fondos_rentabilidades_diarias')
      .insert(registros)
      .select();

    if (insertError) {
      console.error('❌ Error insertando datos:', insertError);
      return NextResponse.json(
        { success: false, error: 'Error al insertar datos: ' + insertError.message },
        { status: 500 }
      );
    }

    // ✅ NUEVO: Verificar que realmente se insertaron
    const { count: verificacionCount } = await supabase
      .from('fondos_rentabilidades_diarias')
      .select('*', { count: 'exact', head: true })
      .eq('fondo_id', fondo.id);

    return NextResponse.json({
      success: true,
      insertados: registros.length,
      verificados: verificacionCount,
      errores: errores,
      modo: modo,
      primerosErrores: erroresDetalle.slice(0, 5)
    });

  } catch (error: unknown) {
    console.error('❌ Error en API rentabilidades-diarias POST:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const blocked = applyRateLimit(request, "rentabilidades-diarias-delete", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError3 } = await requireAdmin();
  if (authError3) return authError3;

  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { fo_run, fm_serie } = body;

    if (!fo_run || !fm_serie) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros' },
        { status: 400 }
      );
    }

    // Buscar fondo
    const { data: fondo, error: fondoError } = await supabase
      .from('fondos_mutuos')
      .select('id')
      .eq('fo_run', parseInt(fo_run))
      .eq('fm_serie', fm_serie.toUpperCase())
      .single();

    if (fondoError || !fondo) {
      return NextResponse.json(
        { success: false, error: 'Fondo no encontrado' },
        { status: 404 }
      );
    }

    // Eliminar datos
    const { error: deleteError } = await supabase
      .from('fondos_rentabilidades_diarias')
      .delete()
      .eq('fondo_id', fondo.id);

    if (deleteError) {
      console.error('Error eliminando:', deleteError);
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    console.error('❌ Error en DELETE:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
