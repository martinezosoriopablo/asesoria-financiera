// lib/api-response.ts
// Helper centralizado para respuestas de API y manejo de errores

import { NextResponse } from "next/server";

/**
 * Respuesta exitosa estandarizada.
 */
export function successResponse<T extends Record<string, unknown>>(
  data: T,
  status = 200
) {
  return NextResponse.json({ success: true, ...data }, { status });
}

/**
 * Respuesta de error estandarizada.
 */
export function errorResponse(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * Extrae un mensaje legible de un error desconocido.
 */
export function getErrorMessage(error: unknown, fallback = "Error interno del servidor"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/**
 * Wrapper para handlers de API que centraliza el try-catch.
 * Captura errores, loguea con console.error, y retorna respuesta 500 estandarizada.
 *
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const blocked = applyRateLimit(request, "my-route", { limit: 30 });
 *   if (blocked) return blocked;
 *
 *   const { advisor, error: authError } = await requireAdvisor();
 *   if (authError) return authError;
 *
 *   return handleApiError("mi-ruta", async () => {
 *     const supabase = createAdminClient();
 *     const { data, error } = await supabase.from("tabla").select("*");
 *     if (error) throw error;
 *     return successResponse({ data });
 *   });
 * }
 * ```
 */
export async function handleApiError(
  routeName: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error: unknown) {
    console.error(`Error en ${routeName}:`, error);
    return errorResponse(getErrorMessage(error));
  }
}
