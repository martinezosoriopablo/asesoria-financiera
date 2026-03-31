import { NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/sanitize";

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

  // Verificar que el cliente pertenece a este asesor (o subordinado si es admin)
  if (client.asesor_id && client.asesor_id !== advisor!.id) {
    if (advisor!.rol === "admin") {
      const allowedIds = await getSubordinateAdvisorIds(advisor!.id);
      if (!allowedIds.includes(client.asesor_id)) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
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
    // Ya tiene auth user, actualizar metadata y re-habilitar portal
    await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      user_metadata: { role: "client", client_id: clientId },
    });
    await supabaseAdmin.from("clients").update({
      portal_enabled: true,
      portal_invited_at: new Date().toISOString(),
    }).eq("id", clientId);
  }

  // 4. Generar link de invitación (requiere que el usuario defina contraseña)
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin
    .generateLink({ type: "invite", email: client.email });

  if (linkError || !linkData) {
    console.error("Error generando link:", linkError);
    return NextResponse.json({ error: "Error generando link de acceso" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";
  // Use auth callback to exchange token, then redirect to setup-password
  const portalLink = `${appUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite&next=/portal/setup-password`;

  // 5. Enviar email via Resend
  const senderEmail = process.env.SENDER_EMAIL || "noreply@greybark.cl";
  let emailSent = false;
  let emailError: string | null = null;

  try {
    const { data: emailData, error: resendError } = await resend.emails.send({
      from: `Greybark Advisors <${senderEmail}>`,
      to: client.email,
      subject: "Tu portal de inversiones está listo — define tu contraseña",
      html: `
        <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <img src="${appUrl}/logo-greybark.png" alt="Greybark Advisors" style="height: 40px; margin-bottom: 32px;" />
          <h1 style="font-size: 20px; color: #1a1a1a; margin-bottom: 16px;">
            Hola ${escapeHtml(client.nombre || '')},
          </h1>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 8px;">
            Tu asesor financiero te ha dado acceso al portal de inversiones de Greybark Advisors.
          </p>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 24px;">
            Haz clic en el botón para crear tu contraseña y acceder a tu portafolio, perfil de riesgo y comunicación directa con tu asesor.
          </p>
          <a href="${portalLink}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
            Crear contraseña y acceder
          </a>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
            Este link expira en 24 horas. Si necesitas uno nuevo, contacta a tu asesor.
          </p>
        </div>
      `,
    });

    if (resendError) {
      console.error("Resend API error:", resendError);
      emailError = resendError.message;
    } else {
      emailSent = true;
      console.log("Email enviado:", emailData?.id);
    }
  } catch (err) {
    console.error("Error enviando email:", err);
    emailError = err instanceof Error ? err.message : "Error desconocido";
  }

  if (!emailSent) {
    return NextResponse.json({
      success: true,
      warning: `Email no enviado: ${emailError}. Comparte el link manualmente.`,
      portalLink,
    });
  }

  return NextResponse.json({ success: true, portalLink });
}
