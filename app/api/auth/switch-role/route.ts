// app/api/auth/switch-role/route.ts
// Switch active role for dual-role users (advisor + client)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/auth/api-auth";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { role } = await request.json();
  if (!role || !["advisor", "client"].includes(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const roles = (user.user_metadata?.roles as string[]) || [];

  // Legacy: if user has old `role` field but no `roles` array, build it
  if (roles.length === 0) {
    const oldRole = user.user_metadata?.role as string;
    if (oldRole) roles.push(oldRole);
  }

  // Verify user actually has the requested role
  if (role === "advisor") {
    const { data: advisorData } = await admin
      .from("advisors")
      .select("id")
      .eq("email", user.email!)
      .maybeSingle();
    if (!advisorData) {
      return NextResponse.json({ error: "No tienes perfil de asesor" }, { status: 403 });
    }
  }

  if (role === "client") {
    const { data: clientData } = await admin
      .from("clients")
      .select("id, portal_enabled")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!clientData || !clientData.portal_enabled) {
      return NextResponse.json({ error: "No tienes perfil de cliente activo" }, { status: 403 });
    }
  }

  // Update active_role in user metadata
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      active_role: role,
      roles: [...new Set([...roles, role])],
    },
  });

  const redirectTo = role === "advisor" ? "/advisor" : "/portal/dashboard";

  return NextResponse.json({ success: true, active_role: role, redirectTo });
}
