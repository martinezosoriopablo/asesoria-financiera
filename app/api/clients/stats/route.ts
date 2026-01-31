// app/api/clients/stats/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data: clients, error } = await supabase
      .from("clients")
      .select("*");

    if (error) throw error;

    const stats = {
      total_clientes: clients?.length || 0,
      clientes_activos: clients?.filter(c => c.status === "activo").length || 0,
      prospectos: clients?.filter(c => c.status === "prospecto").length || 0,
      inactivos: clients?.filter(c => c.status === "inactivo").length || 0,
      patrimonio_total: clients?.reduce((sum, c) => sum + (c.patrimonio_estimado || 0), 0) || 0,
      por_perfil: {
        conservador: clients?.filter(c => c.perfil_riesgo === "conservador").length || 0,
        moderado: clients?.filter(c => c.perfil_riesgo === "moderado").length || 0,
        agresivo: clients?.filter(c => c.perfil_riesgo === "agresivo").length || 0,
        muy_agresivo: clients?.filter(c => c.perfil_riesgo === "muy_agresivo").length || 0,
      },
    };

    // Calcular clientes que necesitan seguimiento (más de 30 días sin interacción)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const clientsNeedingFollowup = clients?.filter(client => {
      if (!client.last_interaction) return true;
      return new Date(client.last_interaction) < thirtyDaysAgo;
    }).length || 0;

    return NextResponse.json({
      success: true,
      stats: {
        ...stats,
        clientes_sin_seguimiento: clientsNeedingFollowup,
      },
    });
  } catch (error: any) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener estadísticas",
      },
      { status: 500 }
    );
  }
}
