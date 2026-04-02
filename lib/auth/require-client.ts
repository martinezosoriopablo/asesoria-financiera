import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "./api-auth";

export interface PortalClient {
  id: string;
  authUserId: string;
  email: string;
  nombre: string;
  apellido: string;
  asesor_id: string;
}

export async function requireClient(): Promise<{
  client: PortalClient | null;
  error: NextResponse | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        client: null,
        error: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
      };
    }

    // Check active role (supports dual-role users)
    const activeRole = user.user_metadata?.active_role || user.user_metadata?.role;
    const roles = (user.user_metadata?.roles as string[]) || [];
    if (activeRole !== "client" && !roles.includes("client")) {
      return {
        client: null,
        error: NextResponse.json({ error: "Acceso solo para clientes" }, { status: 403 }),
      };
    }

    const clientId = user.user_metadata?.client_id;
    if (!clientId) {
      return {
        client: null,
        error: NextResponse.json({ error: "Cliente no vinculado" }, { status: 403 }),
      };
    }

    // Obtener datos del cliente
    const admin = createAdminClient();
    const { data: clientData, error: clientError } = await admin
      .from("clients")
      .select("id, nombre, apellido, email, asesor_id, portal_enabled")
      .eq("id", clientId)
      .single();

    if (clientError || !clientData) {
      return {
        client: null,
        error: NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 }),
      };
    }

    if (!clientData.portal_enabled) {
      return {
        client: null,
        error: NextResponse.json({ error: "Portal deshabilitado" }, { status: 403 }),
      };
    }

    // Actualizar last_seen
    await admin
      .from("clients")
      .update({ portal_last_seen: new Date().toISOString() })
      .eq("id", clientId);

    return {
      client: {
        id: clientData.id,
        authUserId: user.id,
        email: clientData.email,
        nombre: clientData.nombre,
        apellido: clientData.apellido,
        asesor_id: clientData.asesor_id,
      },
      error: null,
    };
  } catch (err) {
    console.error("Error en requireClient:", err);
    return {
      client: null,
      error: NextResponse.json({ error: "Error de autenticación" }, { status: 500 }),
    };
  }
}
