import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";

export async function GET() {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  // Obtener perfil de riesgo
  const { data: riskProfile } = await admin
    .from("risk_profiles")
    .select("*")
    .eq("client_id", client!.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Obtener nombre del asesor
  const { data: advisor } = await admin
    .from("advisors")
    .select("nombre, apellido, email, company_name, logo_url")
    .eq("id", client!.asesor_id)
    .single();

  return NextResponse.json({
    client: {
      id: client!.id,
      nombre: client!.nombre,
      apellido: client!.apellido,
      email: client!.email,
    },
    riskProfile,
    advisor: advisor ? {
      nombre: `${advisor.nombre} ${advisor.apellido}`,
      email: advisor.email,
      company: advisor.company_name,
      logo: advisor.logo_url,
    } : null,
  });
}
