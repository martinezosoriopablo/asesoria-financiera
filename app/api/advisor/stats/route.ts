// app/api/advisor/stats/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const { allowed, remaining } = rateLimit(`stats:${getClientIp(request)}`, { limit: 30, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes. Intenta en un momento." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { searchParams } = new URL(request.url);
    const advisorEmail = searchParams.get("email");
    if (!advisorEmail) {
      return NextResponse.json(
        { success: false, error: "Email del asesor es requerido" },
        { status: 400 }
      );
    }

    // Obtener estadísticas usando la función SQL
    const { data: stats, error: statsError } = await supabase
      .rpc("get_advisor_stats", { advisor_email: advisorEmail });

    if (statsError) {
      console.error("Error calling function:", statsError);
      
      // Fallback: calcular manualmente
      const { data: advisor } = await supabase
        .from("advisors")
        .select("id")
        .eq("email", advisorEmail)
        .single();

      if (!advisor) {
        return NextResponse.json(
          { success: false, error: "Asesor no encontrado" },
          { status: 404 }
        );
      }

      const { data: clients } = await supabase
        .from("clients")
        .select("*")
        .eq("asesor_id", advisor.id);

      const { data: meetings } = await supabase
        .from("meetings")
        .select("*")
        .eq("asesor_id", advisor.id)
        .eq("completada", false)
        .eq("cancelada", false)
        .gte("fecha", new Date().toISOString());

      const now = new Date();
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);

      const meetingsThisWeek = meetings?.filter(m => {
        const meetingDate = new Date(m.fecha);
        return meetingDate >= startOfWeek && meetingDate < endOfWeek;
      }) || [];

      const manualStats = {
        total_clientes: clients?.length || 0,
        clientes_activos: clients?.filter(c => c.status === "activo").length || 0,
        prospectos: clients?.filter(c => c.status === "prospecto").length || 0,
        aum_total: clients?.reduce((sum, c) => sum + (c.patrimonio_estimado || 0), 0) || 0,
        reuniones_pendientes: meetings?.length || 0,
        reuniones_esta_semana: meetingsThisWeek.length,
      };

      return NextResponse.json({
        success: true,
        stats: manualStats,
      });
    }

    return NextResponse.json({
      success: true,
      stats: stats[0],
    });
  } catch (error: any) {
    console.error("Error fetching advisor stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener estadísticas",
      },
      { status: 500 }
    );
  }
}
