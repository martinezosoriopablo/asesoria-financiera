import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

// GET - Fetch client profile data
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-perfil", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  return handleApiError("portal-perfil-get", async () => {
    const { data, error: dbError } = await admin
      .from("clients")
      .select("nombre, apellido, email, telefono, rut, fecha_nacimiento, display_currency")
      .eq("id", client!.id)
      .single();

    if (dbError) {
      return NextResponse.json({ success: false, error: "Error al cargar perfil" }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: data });
  });
}

// PUT - Update client profile (limited fields)
export async function PUT(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-perfil-put", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  return handleApiError("portal-perfil-put", async () => {
    const body = await request.json();

    // Only allow updating these fields
    const ALLOWED_FIELDS = ["nombre", "apellido", "telefono", "display_currency"];
    const updates: Record<string, string> = {};

    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        const value = String(body[field]).trim();
        if (field === "nombre" || field === "apellido") {
          if (!value) {
            return NextResponse.json(
              { success: false, error: `${field === "nombre" ? "Nombre" : "Apellido"} es requerido` },
              { status: 400 }
            );
          }
        }
        updates[field] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "No hay campos para actualizar" }, { status: 400 });
    }

    const { error: dbError } = await admin
      .from("clients")
      .update(updates)
      .eq("id", client!.id);

    if (dbError) {
      return NextResponse.json({ success: false, error: "Error al actualizar perfil" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  });
}
