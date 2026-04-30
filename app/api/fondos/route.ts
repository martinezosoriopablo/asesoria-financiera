import { NextRequest, NextResponse } from 'next/server';
import { requireAdvisor, createAdminClient } from '@/lib/auth/api-auth';
import { sanitizeSearchInput } from '@/lib/sanitize';
import { applyRateLimit } from "@/lib/rate-limit";

// Interface for rentabilidades agregadas record
interface RentabilidadesRecord {
  fondo_id: string;
  rent_7d: number | null;
  rent_30d: number | null;
  rent_90d: number | null;
  rent_180d: number | null;
  rent_365d: number | null;
  rent_ytd: number | null;
  rent_3y: number | null;
  rent_5y: number | null;
  volatilidad_30d: number | null;
  volatilidad_365d: number | null;
  sharpe_365d: number | null;
  patrimonio_mm: number | null;
}

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
  const blocked = await applyRateLimit(request, "fondos-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { action, familia, clase, busqueda, ordenar, direccion, pagina, solo_con_datos_diarios, incluir_fi } = body;
    
    // ACTION: LIST - Obtener lista de fondos
    if (action === 'list') {
      const limite = 50;
      const paginaNum = pagina || 1;
      
      // ✅ NUEVO: Si solo queremos fondos con datos, primero encontrar cuáles tienen datos
      let fondosIdsConDatos: string[] = [];
      
      if (solo_con_datos_diarios === true) {
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
            hasMore = false;
          }
        }
        
        fondosIdsConDatos = Array.from(allFondosIds);

        // Si no hay fondos con datos, retornar vacío inmediatamente
        if (fondosIdsConDatos.length === 0) {
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
        const sanitized = sanitizeSearchInput(busqueda);
        query = query.or(`nombre_fondo.ilike.%${sanitized}%,nombre_agf.ilike.%${sanitized}%`);
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
      
      const dailyDataCounts: { [key: string]: number } = {};
      const rentabilidadesAgregadas: { [key: string]: RentabilidadesRecord } = {};
      
      if (fondosIds.length > 0) {
        // ✅ NUEVO: Usar COUNT individual por fondo (evita límite 1000)
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
          rentAgregadas.forEach((record: RentabilidadesRecord) => {
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
      
      // Include FI results if requested
      if (incluir_fi) {
        let fiQuery = supabase
          .from('fondos_inversion')
          .select('id, rut, nombre, administradora, tipo')
          .eq('activo', true);

        if (busqueda) {
          const sanitized = sanitizeSearchInput(busqueda);
          fiQuery = fiQuery.or(`nombre.ilike.%${sanitized}%,administradora.ilike.%${sanitized}%`);
        }

        const { data: fiData } = await fiQuery.limit(50);

        if (fiData && fiData.length > 0) {
          // Get fichas for these FI
          const fiRuts = fiData.map(f => f.rut);
          const { data: fichas } = await supabase
            .from('fi_fichas')
            .select('fi_rut, tac_serie, rent_1m, rent_3m, rent_12m, horizonte_inversion')
            .in('fi_rut', fiRuts);

          const fichaMap: Record<string, { tac: number | null; rent_12m: number | null }> = {};
          fichas?.forEach((f: { fi_rut: string; tac_serie: number | null; rent_12m: number | null }) => {
            fichaMap[f.fi_rut] = { tac: f.tac_serie ? Number(f.tac_serie) : null, rent_12m: f.rent_12m ? Number(f.rent_12m) : null };
          });

          // Map FI to same format as FM
          const fiMapped = fiData.map(fi => ({
            id: fi.id,
            fo_run: parseInt(fi.rut) || 0,
            fm_serie: '-',
            nombre_fondo: fi.nombre,
            nombre_agf: fi.administradora,
            familia_estudios: null,
            clase_inversionista: null,
            rent_7d_nominal: null,
            rent_30d_nominal: null,
            rent_3m_nominal: null,
            rent_12m_nominal: fichaMap[fi.rut]?.rent_12m ?? null,
            tac_sintetica: fichaMap[fi.rut]?.tac ?? null,
            categoria_simple: fi.tipo === 'FIRES' ? 'FI Rescatable' : 'FI No Rescatable',
            datos_diarios_count: 0,
            tipo_fondo: 'FI',
          }));

          const combined = [...(fondosConCategoria || []), ...fiMapped];

          return NextResponse.json({
            success: true,
            fondos: combined,
            total: (count || 0) + fiMapped.length,
            pagina: paginaNum,
            total_paginas: Math.ceil(((count || 0) + fiMapped.length) / limite)
          });
        }
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
        por_familia: {} as { [key: string]: number },
        por_clase: {} as { [key: string]: number },
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
    
    // ACTION: RANKINGS - Top 10 rentables y baratos (respeta filtros)
    if (action === 'rankings') {
      // Helper to apply familia/clase filters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applyFilters = (q: any) => {
        let filtered = q;
        if (familia && familia !== 'todos') {
          const f = familia.toLowerCase();
          if (f.includes('renta variable') || f === 'rv') {
            filtered = filtered.or('familia_estudios.ilike.%accionario%,familia_estudios.ilike.%renta variable%');
          } else if (f.includes('renta fija') || f === 'rf') {
            filtered = filtered.or('familia_estudios.ilike.%deuda%,familia_estudios.ilike.%renta fija%');
          } else if (f.includes('balanceado')) {
            filtered = filtered.ilike('familia_estudios', '%balanceado%');
          } else if (f.includes('alternativos')) {
            filtered = filtered.or('familia_estudios.ilike.%estructurado%,familia_estudios.ilike.%otro%');
          }
        }
        if (clase && clase !== 'todos') {
          filtered = filtered.eq('clase_inversionista', clase);
        }
        return filtered;
      };

      // Top 10 más rentables (12m) from vw_fondos_completo
      const qRent = applyFilters(
        supabase
          .from('vw_fondos_completo')
          .select('fo_run, fm_serie, nombre_fondo, nombre_agf, rent_12m_nominal')
          .not('rent_12m_nominal', 'is', null)
          .order('rent_12m_nominal', { ascending: false })
          .limit(10)
      );
      const { data: topRentables } = await qRent;

      // Top 10 menor TAC (> 0.20% para excluir datos basura)
      const qTac = applyFilters(
        supabase
          .from('vw_fondos_completo')
          .select('fo_run, fm_serie, nombre_fondo, nombre_agf, tac_sintetica')
          .not('tac_sintetica', 'is', null)
          .gt('tac_sintetica', 0.20)
          .order('tac_sintetica', { ascending: true })
          .limit(10)
      );
      const { data: topBaratos } = await qTac;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let topRentablesList = (topRentables || []).map((f: any) => ({
        fo_run: f.fo_run,
        fm_serie: f.fm_serie,
        nombre_fondo: f.nombre_fondo,
        nombre_agf: f.nombre_agf,
        valor: f.rent_12m_nominal || 0,
        tipo: 'FM' as string,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let topBaratosList = (topBaratos || []).map((f: any) => ({
        fo_run: f.fo_run,
        fm_serie: f.fm_serie,
        nombre_fondo: f.nombre_fondo,
        nombre_agf: f.nombre_agf,
        valor: f.tac_sintetica || 0,
        tipo: 'FM' as string,
      }));

      // Include FI data if requested
      if (incluir_fi) {
        const { data: fiFichas } = await supabase
          .from('fi_fichas')
          .select('fi_rut, fi_serie, tac_serie, rent_12m')
          .not('tac_serie', 'is', null);

        if (fiFichas && fiFichas.length > 0) {
          // Get FI names
          const fiRuts = fiFichas.map((f: { fi_rut: string }) => f.fi_rut);
          const { data: fiNames } = await supabase
            .from('fondos_inversion')
            .select('rut, nombre, administradora')
            .in('rut', fiRuts);

          const nameMap: Record<string, { nombre: string; admin: string }> = {};
          fiNames?.forEach((f: { rut: string; nombre: string; administradora: string }) => {
            nameMap[f.rut] = { nombre: f.nombre, admin: f.administradora };
          });

          // Add FI to TAC rankings
          const fiBaratos = fiFichas
            .filter((f: { tac_serie: number | null }) => f.tac_serie != null && f.tac_serie > 0.20)
            .map((f: { fi_rut: string; fi_serie: string; tac_serie: number }) => ({
              fo_run: parseInt(f.fi_rut) || 0,
              fm_serie: f.fi_serie,
              nombre_fondo: nameMap[f.fi_rut]?.nombre || `FI ${f.fi_rut}`,
              nombre_agf: nameMap[f.fi_rut]?.admin || '',
              valor: Number(f.tac_serie),
              tipo: 'FI',
            }));

          // Merge and re-sort
          topBaratosList = [...topBaratosList, ...fiBaratos]
            .sort((a, b) => a.valor - b.valor)
            .slice(0, 10);

          // Add FI to rent rankings if they have rent_12m
          const fiRentables = fiFichas
            .filter((f: { rent_12m: number | null }) => f.rent_12m != null)
            .map((f: { fi_rut: string; fi_serie: string; rent_12m: number }) => ({
              fo_run: parseInt(f.fi_rut) || 0,
              fm_serie: f.fi_serie,
              nombre_fondo: nameMap[f.fi_rut]?.nombre || `FI ${f.fi_rut}`,
              nombre_agf: nameMap[f.fi_rut]?.admin || '',
              valor: Number(f.rent_12m),
              tipo: 'FI',
            }));

          topRentablesList = [...topRentablesList, ...fiRentables]
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 10);
        }
      }

      const rankings = {
        top_rentables: topRentablesList,
        top_baratos: topBaratosList,
      };

      return NextResponse.json({ success: true, rankings });
    }

    return NextResponse.json({
      success: false,
      error: 'Acción no válida'
    }, { status: 400 });
    
  } catch (error: unknown) {
    console.error('Error en API fondos:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
