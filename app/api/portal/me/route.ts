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
    .maybeSingle();

  // Obtener nombre del asesor
  const { data: advisor } = await admin
    .from("advisors")
    .select("nombre, apellido, email, company_name, logo_url")
    .eq("id", client!.asesor_id)
    .maybeSingle();

  // Count ALL snapshots for onboarding status (includes advisor-uploaded and api-prices)
  const { count: snapshotCount } = await admin
    .from("portfolio_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client!.id);

  // Generate questionnaire link for portal access
  let questionnaireLink: string | null = null;
  if (!riskProfile && advisor) {
    const crypto = await import("crypto");
    const hmacSecret = process.env.CRON_SECRET || "fallback";
    const tokenPayload = `${client!.email}:${advisor.email}`;
    const token = crypto.createHmac("sha256", hmacSecret).update(tokenPayload).digest("hex");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    questionnaireLink = `${appUrl}/mi-perfil-inversor?email=${encodeURIComponent(client!.email)}&advisor=${encodeURIComponent(advisor.email)}&token=${token}`;
  }

  // Count unread reports for badge
  const { count: unreadReports } = await admin
    .from("client_reports")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client!.id)
    .is("read_at", null);

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
    hasSnapshots: (snapshotCount || 0) > 0,
    questionnaireLink,
    unreadReports: unreadReports || 0,
  });
}
