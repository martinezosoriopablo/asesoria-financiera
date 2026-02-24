import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Función para clasificar familia simplificada
function getCategoriaSimple(familia: string | null): string {
  if (!familia) return 'Otros';
  
  const f = familia.toLowerCase();
  if (f.includes('accionario') || f.includes('renta variable')) {
    return 'Renta Variable';
  }
  if (f.includes('deuda') || f.includes('renta fija')) {
    return 'Renta Fija';
  }
  if (f.includes('balanceado')) {
    return 'Balanceado';
  }
  if (f.includes('estructurado') || f.includes('otro')) {
    return 'Alternativos';
  }
  return 'Otros';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, familia, clase, busqueda, ordenar, direccion, pagina, solo_con_datos_diarios } = body;
    
    // ACTION: LIST - Obtener lista de fondos
    if (action === 'list') {
      const limite = 50;
      const paginaNum = pagina || 1;
      
      // ✅ NUEVO: Si solo queremos fondos con datos, primero encontrar cuáles tienen datos
      let fondosIdsConDatos: string[] = [];
      
      if (solo_con_datos_diarios === true) {
        console.log('🔍 Comparador: Buscando fondos con datos diarios...');
        
        // Obtener IDs únicos de fondos que tienen datos (con paginación para evitar límite 1000)
        const allFondosIds = new Set<string>();
        let currentPage = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
          const { data: fondosConDatos } = await supabase
            .from('fondos_rentabilidades_diarias')
            .select('fondo_id')
            .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);
          
          if (fondosConDatos && fondosConDatos.length > 0) {
            fondosConDatos.forEach(f => allFondosIds.add(f.fondo_id));
            currentPage++;
            hasMore = fondosConDatos.length === pageSize; // Si trajo menos de 1000, no hay más
          } else {
            hasMore = false;
          }
          
          // Seguridad: no hacer más de 10 páginas (10,000 registros)
          if (currentPage >= 10) {
            console.log('⚠️ Límite de paginación alcanzado (10 páginas)');
            hasMore = false;
          }
        }
        
        fondosIdsConDatos = Array.from(allFondosIds);
        console.log(`✅ Encontrados ${fondosIdsConDatos.length} fondos únicos con datos diarios (${currentPage} páginas consultadas)`);
        
        // Si no hay fondos con datos, retornar vacío inmediatamente
        if (fondosIdsConDatos.length === 0) {
          console.log('⚠️ No se encontraron fondos con datos diarios');
          return NextResponse.json({
            success: true,
            fondos: [],
            total: 0,
            pagina: paginaNum,
            total_paginas: 0
          });
        }
      }
      
      // Construir query base
      let query = supabase
        .from('vw_fondos_completo')
        .select(`
          id,
          fo_run,
          fm_serie,
          nombre_fondo,
          nombre_agf,
          familia_estudios,
          clase_inversionista,
          rent_7d_nominal,
          rent_30d_nominal,
          rent_3m_nominal,
          rent_12m_nominal,
          tac_sintetica
        `, { count: 'exact' });
      
      // ✅ NUEVO: Si solo queremos fondos con datos, filtrar por los IDs encontrados
      if (solo_con_datos_diarios === true && fondosIdsConDatos.length > 0) {
        query = query.in('id', fondosIdsConDatos);
        console.log(`🎯 Filtrando query por ${fondosIdsConDatos.length} fondos con datos`);
      }
      
      // Aplicar filtros
      if (familia && familia !== 'todos') {
        const filtroFamilia = familia.toLowerCase();
        if (filtroFamilia.includes('renta variable') || filtroFamilia === 'rv') {
          query = query.or('familia_estudios.ilike.%accionario%,familia_estudios.ilike.%renta variable%');
        } else if (filtroFamilia.includes('renta fija') || filtroFamilia === 'rf') {
          query = query.or('familia_estudios.ilike.%deuda%,familia_estudios.ilike.%renta fija%');
        } else if (filtroFamilia.includes('balanceado')) {
          query = query.ilike('familia_estudios', '%balanceado%');
        } else if (filtroFamilia.includes('alternativos')) {
          query = query.or('familia_estudios.ilike.%estructurado%,familia_estudios.ilike.%otro%');
        }
      }
      
      if (clase && clase !== 'todos') {
        query = query.eq('clase_inversionista', clase);
      }
      
      if (busqueda) {
        query = query.or(`nombre_fondo.ilike.%${busqueda}%,nombre_agf.ilike.%${busqueda}%`);
      }
      
      // Ordenar
      const campoOrdenar = ordenar || 'rent_12m_nominal';
      const orderAscending = direccion === 'asc';
      query = query.order(campoOrdenar, { ascending: orderAscending, nullsFirst: false });
      
      // Paginación
      const inicio = (paginaNum - 1) * limite;
      query = query.range(inicio, inicio + limite - 1);
      
      const { data, error, count } = await query;
      
      if (error) {
        console.error('Error fetching fondos:', error);
        return NextResponse.json({ 
          success: false, 
          error: error.message 
        }, { status: 500 });
      }
      
      // Obtener conteo de datos diarios para cada fondo
      const fondosIds = data?.map(f => f.id) || [];
      
      console.log('🔍 API Fondos - Contando datos diarios para', fondosIds.length, 'fondos');
      
      const dailyDataCounts: { [key: string]: number } = {};
      const rentabilidadesAgregadas: { [key: string]: any } = {};
      
      if (fondosIds.length > 0) {
        // ✅ NUEVO: Usar COUNT individual por fondo (evita límite 1000)
        console.log('📊 Usando COUNT individual por fondo para evitar límite...');
        
        try {
          // Hacer todas las queries COUNT en paralelo
          const countPromises = fondosIds.map(async (fondoId) => {
            const { count } = await supabase
              .from('fondos_rentabilidades_diarias')
              .select('*', { count: 'exact', head: true })
              .eq('fondo_id', fondoId);
            
            return { fondoId, count: count || 0 };
          });
          
          // Esperar todas las queries
          const results = await Promise.all(countPromises);
          
          // Construir objeto de conteos
          results.forEach(({ fondoId, count }) => {
            if (count > 0) {
              dailyDataCounts[fondoId] = count;
            }
          });
          
          console.log('✅ Conteos completados:', Object.keys(dailyDataCounts).length, 'fondos con datos');
          console.log('📊 Conteos por fondo:', dailyDataCounts);
        } catch (error) {
          console.error('❌ Error contando datos diarios:', error);
        }

        // ✅ NUEVO: Obtener rentabilidades agregadas
        const { data: rentAgregadas } = await supabase
          .from('fondos_rentabilidades_latest')
          .select('fondo_id, rent_7d, rent_30d, rent_90d, rent_180d, rent_365d, rent_ytd, rent_3y, rent_5y, volatilidad_30d, volatilidad_365d, sharpe_365d, patrimonio_mm')
          .in('fondo_id', fondosIds);
        
        // Crear mapa de rentabilidades por fondo_id
        if (rentAgregadas) {
          rentAgregadas.forEach((record: any) => {
            rentabilidadesAgregadas[record.fondo_id] = record;
          });
        }
      }
      
      // Agregar categoría simple, contador de datos diarios, y rentabilidades agregadas a cada fondo
      const fondosConCategoria = data?.map(fondo => ({
        ...fondo,
        categoria_simple: getCategoriaSimple(fondo.familia_estudios),
        datos_diarios_count: dailyDataCounts[fondo.id] || 0,
        // Agregar rentabilidades agregadas si existen
        ...(rentabilidadesAgregadas[fondo.id] && {
          rent_7d_agregada: rentabilidadesAgregadas[fondo.id].rent_7d,
          rent_30d_agregada: rentabilidadesAgregadas[fondo.id].rent_30d,
          rent_90d_agregada: rentabilidadesAgregadas[fondo.id].rent_90d,
          rent_180d_agregada: rentabilidadesAgregadas[fondo.id].rent_180d,
          rent_365d_agregada: rentabilidadesAgregadas[fondo.id].rent_365d,
          rent_ytd_agregada: rentabilidadesAgregadas[fondo.id].rent_ytd,
          rent_3y_agregada: rentabilidadesAgregadas[fondo.id].rent_3y,
          rent_5y_agregada: rentabilidadesAgregadas[fondo.id].rent_5y,
          volatilidad_30d: rentabilidadesAgregadas[fondo.id].volatilidad_30d,
          volatilidad_365d: rentabilidadesAgregadas[fondo.id].volatilidad_365d,
          sharpe_365d: rentabilidadesAgregadas[fondo.id].sharpe_365d,
          patrimonio_mm: rentabilidadesAgregadas[fondo.id].patrimonio_mm
        })
      }));
      
      // Log de fondos con sus contadores
      if (fondosConCategoria && fondosConCategoria.length > 0) {
        console.log('📋 Ejemplo de fondos retornados:');
        fondosConCategoria.slice(0, 3).forEach(f => {
          console.log(`  - ${f.fo_run}-${f.fm_serie}: ${f.datos_diarios_count} datos diarios`);
        });
      }
      
      return NextResponse.json({
        success: true,
        fondos: fondosConCategoria,
        total: count,
        pagina: paginaNum,
        total_paginas: Math.ceil((count || 0) / limite)
      });
    }
    
    // ACTION: STATS - Obtener estadísticas
    if (action === 'stats') {
      // Construir query con filtros
      let query = supabase
        .from('vw_fondos_completo')
        .select('familia_estudios, clase_inversionista, rent_12m_nominal, tac_sintetica, nombre_agf');
      
      // Aplicar filtros
      if (familia && familia !== 'todos') {
        const filtroFamilia = familia.toLowerCase();
        if (filtroFamilia.includes('renta variable') || filtroFamilia === 'rv') {
          query = query.or('familia_estudios.ilike.%accionario%,familia_estudios.ilike.%renta variable%');
        } else if (filtroFamilia.includes('renta fija') || filtroFamilia === 'rf') {
          query = query.or('familia_estudios.ilike.%deuda%,familia_estudios.ilike.%renta fija%');
        } else if (filtroFamilia.includes('balanceado')) {
          query = query.ilike('familia_estudios', '%balanceado%');
        } else if (filtroFamilia.includes('alternativos')) {
          query = query.or('familia_estudios.ilike.%estructurado%,familia_estudios.ilike.%otro%');
        }
      }
      
      if (clase && clase !== 'todos') {
        query = query.eq('clase_inversionista', clase);
      }
      
      const { data: fondos, error } = await query;
      
      if (error) throw error;
      
      // Calcular estadísticas generales
      const stats = {
        total_fondos: fondos?.length || 0,
        por_familia: {} as any,
        por_clase: {} as any,
        rent_promedio: 0,
        tac_promedio: 0
      };
      
      let sumRent = 0;
      let countRent = 0;
      let sumTac = 0;
      let countTac = 0;
      
      // Stats por administradora
      const statsPorAGF: { [key: string]: {
        nombre_agf: string;
        total_fondos: number;
        tac_promedio: number;
        tac_min: number;
        tac_max: number;
        tac_values: number[];
      }} = {};
      
      fondos?.forEach(f => {
        // Por familia
        const cat = getCategoriaSimple(f.familia_estudios);
        stats.por_familia[cat] = (stats.por_familia[cat] || 0) + 1;
        
        // Por clase
        if (f.clase_inversionista) {
          stats.por_clase[f.clase_inversionista] = (stats.por_clase[f.clase_inversionista] || 0) + 1;
        }
        
        // Promedios generales (usando rent_12m_nominal ahora)
        if (f.rent_12m_nominal) {
          sumRent += f.rent_12m_nominal;
          countRent++;
        }
        if (f.tac_sintetica) {
          sumTac += f.tac_sintetica;
          countTac++;
        }
        
        // Stats por AGF
        if (f.nombre_agf) {
          if (!statsPorAGF[f.nombre_agf]) {
            statsPorAGF[f.nombre_agf] = {
              nombre_agf: f.nombre_agf,
              total_fondos: 0,
              tac_promedio: 0,
              tac_min: Infinity,
              tac_max: -Infinity,
              tac_values: []
            };
          }
          
          statsPorAGF[f.nombre_agf].total_fondos++;
          
          if (f.tac_sintetica !== null && f.tac_sintetica !== undefined) {
            statsPorAGF[f.nombre_agf].tac_values.push(f.tac_sintetica);
            statsPorAGF[f.nombre_agf].tac_min = Math.min(statsPorAGF[f.nombre_agf].tac_min, f.tac_sintetica);
            statsPorAGF[f.nombre_agf].tac_max = Math.max(statsPorAGF[f.nombre_agf].tac_max, f.tac_sintetica);
          }
        }
      });
      
      stats.rent_promedio = countRent > 0 ? sumRent / countRent : 0;
      stats.tac_promedio = countTac > 0 ? sumTac / countTac : 0;
      
      // Calcular promedios de TAC por AGF y limpiar
      const agfArray = Object.values(statsPorAGF).map(agf => {
        const tac_promedio = agf.tac_values.length > 0 
          ? agf.tac_values.reduce((a, b) => a + b, 0) / agf.tac_values.length 
          : 0;
        
        return {
          nombre_agf: agf.nombre_agf,
          total_fondos: agf.total_fondos,
          tac_promedio: tac_promedio,
          tac_min: agf.tac_min === Infinity ? 0 : agf.tac_min,
          tac_max: agf.tac_max === -Infinity ? 0 : agf.tac_max
        };
      }).sort((a, b) => b.total_fondos - a.total_fondos);
      
      return NextResponse.json({ 
        success: true, 
        stats,
        stats_por_agf: agfArray
      });
    }
    
    return NextResponse.json({ 
      success: false,
      error: 'Acción no válida' 
    }, { status: 400 });
    
  } catch (error: any) {
    console.error('Error en API fondos:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Error interno del servidor', 
        details: error.message 
      },
      { status: 500 }
    );
  }
}
