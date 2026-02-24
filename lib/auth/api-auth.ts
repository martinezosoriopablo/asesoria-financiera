// lib/auth/api-auth.ts
// Helper para autenticación en API routes

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { AdvisorRole } from "@/lib/types/advisor";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface AuthenticatedUser {
  id: string;
  email: string;
  advisorId?: string;
  advisorEmail?: string;
}

export interface AdvisorProfile {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: AdvisorRole;  // Usando 'rol' (columna existente en DB)
  logo_url?: string | null;
  company_name?: string | null;
  parent_advisor_id?: string | null;
  activo: boolean;   // Usando 'activo' (columna existente en DB)
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  error: NextResponse | null;
}

/**
 * Verifica que el usuario esté autenticado en una API route.
 * Retorna el usuario autenticado o un error 401.
 *
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const { user, error } = await requireAuth();
 *   if (error) return error;
 *
 *   // user está garantizado como no-null aquí
 *   console.log(user.email);
 * }
 * ```
 */
export async function requireAuth(): Promise<AuthResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        user: null,
        error: NextResponse.json(
          { success: false, error: "No autorizado. Debe iniciar sesión." },
          { status: 401 }
        ),
      };
    }

    return {
      user: {
        id: user.id,
        email: user.email!,
      },
      error: null,
    };
  } catch (err) {
    console.error("Error en autenticación:", err);
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: "Error de autenticación" },
        { status: 500 }
      ),
    };
  }
}

/**
 * Verifica autenticación y obtiene el perfil del advisor.
 * Útil para APIs que necesitan el advisor_id para filtrar datos.
 *
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const { user, advisor, error } = await requireAdvisor();
 *   if (error) return error;
 *
 *   // Filtrar clientes por este advisor
 *   const clients = await getClientsByAdvisor(advisor.id);
 * }
 * ```
 */
export async function requireAdvisor(): Promise<{
  user: AuthenticatedUser | null;
  advisor: AdvisorProfile | null;
  error: NextResponse | null;
}> {
  const { user, error } = await requireAuth();
  if (error) {
    return { user: null, advisor: null, error };
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: advisor, error: advisorError } = await supabaseAdmin
      .from("advisors")
      .select("id, email, nombre, apellido, rol, logo_url, company_name, parent_advisor_id, activo")
      .eq("email", user!.email)
      .single();

    if (advisorError || !advisor) {
      return {
        user,
        advisor: null,
        error: NextResponse.json(
          { success: false, error: "Perfil de asesor no encontrado" },
          { status: 403 }
        ),
      };
    }

    // Verificar si el advisor está activo
    if (advisor.activo === false) {
      return {
        user,
        advisor: null,
        error: NextResponse.json(
          { success: false, error: "Cuenta de asesor desactivada" },
          { status: 403 }
        ),
      };
    }

    return {
      user: {
        ...user!,
        advisorId: advisor.id,
        advisorEmail: advisor.email,
      },
      advisor: {
        ...advisor,
        rol: advisor.rol || 'advisor',
        activo: advisor.activo ?? true,
      },
      error: null,
    };
  } catch (err) {
    console.error("Error obteniendo advisor:", err);
    return {
      user,
      advisor: null,
      error: NextResponse.json(
        { success: false, error: "Error obteniendo perfil de asesor" },
        { status: 500 }
      ),
    };
  }
}

/**
 * Verifica que el usuario sea un administrador.
 * Retorna error 403 si no tiene rol admin.
 *
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const { advisor, error } = await requireAdmin();
 *   if (error) return error;
 *
 *   // Solo admins llegan aquí
 *   const allAdvisors = await getAllAdvisors();
 * }
 * ```
 */
export async function requireAdmin(): Promise<{
  user: AuthenticatedUser | null;
  advisor: AdvisorProfile | null;
  error: NextResponse | null;
}> {
  const result = await requireAdvisor();

  if (result.error) {
    return result;
  }

  if (result.advisor?.rol !== 'admin') {
    return {
      user: result.user,
      advisor: result.advisor,
      error: NextResponse.json(
        { success: false, error: "Acceso denegado. Se requiere rol de administrador." },
        { status: 403 }
      ),
    };
  }

  return result;
}

/**
 * Obtiene los IDs de todos los advisors subordinados de un admin.
 * Incluye el ID del propio admin.
 */
export async function getSubordinateAdvisorIds(adminId: string): Promise<string[]> {
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const { data: subordinates } = await supabaseAdmin
    .from("advisors")
    .select("id")
    .eq("parent_advisor_id", adminId)
    .eq("activo", true);

  const ids = [adminId];
  if (subordinates) {
    ids.push(...subordinates.map(s => s.id));
  }

  return ids;
}

/**
 * Crea un cliente Supabase con service role para operaciones admin.
 * SOLO usar después de verificar autenticación con requireAuth() o requireAdvisor().
 */
export function createAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}
