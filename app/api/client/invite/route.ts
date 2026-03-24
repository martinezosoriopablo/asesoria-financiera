import { NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const { advisor, error } = await requireAdvisor();
  if (error) return error;

  const { clientId } = await req.json();
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();

  // 1. Obtener datos del cliente
  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("id, email, nombre, apellido, asesor_id, portal_enabled, auth_user_id")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // Verificar que el cliente pertenece a este asesor
  if (client.asesor_id !== advisor!.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!client.email) {
    return NextResponse.json({ error: "El cliente no tiene email" }, { status: 400 });
  }

  let authUserId = client.auth_user_id;

  // 2. Crear usuario en Supabase Auth si no existe
  if (!authUserId) {
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: client.email,
      user_metadata: { role: "client", client_id: clientId },
      email_confirm: true,
    });

    if (createError) {
      // Si el usuario ya existe en auth, buscar por email
      if (createError.message?.includes("already been registered")) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.find((u) => u.email === client.email);
        if (existing) {
          authUserId = existing.id;
          // Actualizar metadata
          await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            user_metadata: { role: "client", client_id: clientId },
          });
        } else {
          return NextResponse.json({ error: "Error creando usuario: " + createError.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: "Error creando usuario: " + createError.message }, { status: 500 });
      }
    } else {
      authUserId = newUser.user.id;
    }

    // 3. Vincular auth_user_id en tabla clients
    await supabaseAdmin.from("clients").update({
      auth_user_id: authUserId,
      portal_enabled: true,
      portal_invited_at: new Date().toISOString(),
    }).eq("id", clientId);
  } else {
    // Ya tiene auth user, solo re-habilitar portal
    await supabaseAdmin.from("clients").update({
      portal_enabled: true,
      portal_invited_at: new Date().toISOString(),
    }).eq("id", clientId);
  }

  // 4. Generar magic link
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin
    .generateLink({ type: "magiclink", email: client.email });

  if (linkError || !linkData) {
    return NextResponse.json({ error: "Error generando link de acceso" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";
  // The hashed_token needs to be sent to the client for verification
  const portalLink = `${appUrl}/portal/login?token_hash=${linkData.properties.hashed_token}&type=magiclink`;

  // 5. Enviar email
  try {
    await resend.emails.send({
      from: "Greybark Advisors <noreply@greybark.cl>",
      to: client.email,
      subject: "Tu portal de inversiones está listo",
      html: `
        <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <img src="${appUrl}/logo-greybark.png" alt="Greybark Advisors" style="height: 40px; margin-bottom: 32px;" />
          <h1 style="font-size: 20px; color: #1a1a1a; margin-bottom: 16px;">
            Hola ${client.nombre},
          </h1>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 24px;">
            Tu asesor financiero te ha dado acceso al portal de inversiones de Greybark Advisors.
            Desde aquí podrás ver tu perfil de riesgo, seguir tu portafolio y comunicarte directamente.
          </p>
          <a href="${portalLink}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
            Acceder a mi portal
          </a>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
            Este link expira en 24 horas. Si necesitas uno nuevo, contacta a tu asesor.
          </p>
        </div>
      `,
    });
  } catch (emailError) {
    console.error("Error enviando email:", emailError);
    // Still return success since the user was created, just note the email issue
    return NextResponse.json({
      success: true,
      warning: "Usuario creado pero hubo un error enviando el email",
      portalLink, // Devolver el link para que el asesor lo comparta manualmente
    });
  }

  return NextResponse.json({ success: true });
}
