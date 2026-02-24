// app/api/admin/advisors/route.ts
// API para gestión de asesores (solo admins)

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";

// GET - Obtener lista de asesores
export async function GET(request: NextRequest) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    let query = supabase
      .from("advisors")
      .select("id, email, nombre, apellido, foto_url, logo_url, company_name, rol, parent_advisor_id, activo, created_at")
      .order("created_at", { ascending: false });

    // Si es admin, puede ver sus subordinados + él mismo
    // Si es advisor normal, solo ve su propio perfil
    if (advisor!.rol === 'admin') {
      // Admin ve: él mismo + sus subordinados
      query = query.or(`id.eq.${advisor!.id},parent_advisor_id.eq.${advisor!.id}`);
    } else {
      // Advisor normal solo ve su perfil
      query = query.eq("id", advisor!.id);
    }

    const { data: advisors, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      advisors: advisors || [],
      total: advisors?.length || 0,
      isAdmin: advisor!.rol === 'admin',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener asesores";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Crear nuevo asesor (solo admins)
export async function POST(request: NextRequest) {
  const { advisor, error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();

    // Validar campos requeridos
    if (!body.email || !body.nombre || !body.apellido) {
      return NextResponse.json(
        { success: false, error: "email, nombre y apellido son requeridos" },
        { status: 400 }
      );
    }

    // Verificar que el email no exista
    const { data: existingAdvisor } = await supabase
      .from("advisors")
      .select("id")
      .eq("email", body.email)
      .single();

    if (existingAdvisor) {
      return NextResponse.json(
        { success: false, error: "Ya existe un asesor con ese email" },
        { status: 400 }
      );
    }

    // Crear el asesor como subordinado del admin actual
    const { data: newAdvisor, error } = await supabase
      .from("advisors")
      .insert({
        email: body.email,
        nombre: body.nombre,
        apellido: body.apellido,
        foto_url: body.foto_url || null,
        logo_url: body.logo_url || advisor!.logo_url, // Heredar logo del admin
        company_name: body.company_name || advisor!.company_name, // Heredar empresa del admin
        rol: body.rol || 'advisor',
        parent_advisor_id: advisor!.id, // Siempre subordinado del admin que lo crea
        activo: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      advisor: newAdvisor,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al crear asesor";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// PUT - Actualizar asesor (solo admins pueden actualizar subordinados)
export async function PUT(request: NextRequest) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "id es requerido" },
        { status: 400 }
      );
    }

    // Verificar permisos
    // Un advisor puede actualizar su propio perfil (campos limitados)
    // Un admin puede actualizar cualquier subordinado
    const { data: targetAdvisor, error: fetchError } = await supabase
      .from("advisors")
      .select("id, parent_advisor_id")
      .eq("id", body.id)
      .single();

    if (fetchError || !targetAdvisor) {
      return NextResponse.json(
        { success: false, error: "Asesor no encontrado" },
        { status: 404 }
      );
    }

    const isSelf = targetAdvisor.id === advisor!.id;
    const isSubordinate = targetAdvisor.parent_advisor_id === advisor!.id;
    const isAdmin = advisor!.rol === 'admin';

    if (!isSelf && !(isAdmin && isSubordinate)) {
      return NextResponse.json(
        { success: false, error: "No tiene permiso para modificar este asesor" },
        { status: 403 }
      );
    }

    // Construir objeto de actualización
    const updateData: Record<string, unknown> = {};

    // Campos que cualquier advisor puede actualizar de sí mismo
    if (body.nombre) updateData.nombre = body.nombre;
    if (body.apellido) updateData.apellido = body.apellido;
    if (body.foto_url !== undefined) updateData.foto_url = body.foto_url;

    // Campos que solo admin puede actualizar
    if (isAdmin) {
      if (body.email !== undefined && !isSelf) updateData.email = body.email; // Admin puede cambiar email de subordinados
      if (body.logo_url !== undefined) updateData.logo_url = body.logo_url;
      if (body.company_name !== undefined) updateData.company_name = body.company_name;
      // Solo actualizar rol si el valor es válido
      if (body.rol !== undefined && !isSelf && ['admin', 'advisor'].includes(body.rol)) {
        updateData.rol = body.rol;
      }
      if (body.activo !== undefined && !isSelf) updateData.activo = body.activo;
    }

    updateData.updated_at = new Date().toISOString();

    const { data: updatedAdvisor, error: updateError } = await supabase
      .from("advisors")
      .update(updateData)
      .eq("id", body.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      advisor: updatedAdvisor,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al actualizar asesor";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE - Desactivar asesor (solo admins)
export async function DELETE(request: NextRequest) {
  const { advisor, error: authError } = await requireAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const advisorId = searchParams.get("id");

  if (!advisorId) {
    return NextResponse.json(
      { success: false, error: "id es requerido" },
      { status: 400 }
    );
  }

  // No puede desactivarse a sí mismo
  if (advisorId === advisor!.id) {
    return NextResponse.json(
      { success: false, error: "No puede desactivar su propia cuenta" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  try {
    // Verificar que sea subordinado
    const { data: targetAdvisor } = await supabase
      .from("advisors")
      .select("id, parent_advisor_id")
      .eq("id", advisorId)
      .single();

    if (!targetAdvisor || targetAdvisor.parent_advisor_id !== advisor!.id) {
      return NextResponse.json(
        { success: false, error: "No tiene permiso para desactivar este asesor" },
        { status: 403 }
      );
    }

    // Soft delete - solo desactivar
    const { error: updateError } = await supabase
      .from("advisors")
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq("id", advisorId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: "Asesor desactivado correctamente",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al desactivar asesor";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
