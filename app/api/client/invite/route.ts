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
  let isExistingUser = false;
  let hasPassword = false;

  // 2. Crear o vincular usuario en Supabase Auth
  if (!authUserId) {
    // Try to create a new auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: client.email,
      user_metadata: { role: "client", roles: ["client"], active_role: "client", client_id: clientId },
      email_confirm: true,
    });

    if (createError) {
      // User already exists in auth (e.g., they're an advisor) — link them
      if (createError.message?.includes("already been registered")) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.find((u) => u.email === client.email);
        if (existing) {
          authUserId = existing.id;
          isExistingUser = true;
          hasPassword = true; // Existing users already have a password

          // Add "client" to roles array without removing existing roles
          const currentRoles = (existing.user_metadata?.roles as string[]) || [];
          const currentRole = existing.user_metadata?.role as string;
          const roles = [...new Set([...currentRoles, ...(currentRole ? [currentRole] : []), "client"])];

          await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            user_metadata: {
              ...existing.user_metadata,
              roles,
              client_id: clientId,
              // Don't change active_role — let user switch manually
            },
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
    isExistingUser = true;
    // Ya tiene auth user, agregar rol client si no lo tiene
    const { data: { user: existingAuth } } = await supabaseAdmin.auth.admin.getUserById(authUserId);
    if (existingAuth) {
      const currentRoles = (existingAuth.user_metadata?.roles as string[]) || [];
      const currentRole = existingAuth.user_metadata?.role as string;
      const roles = [...new Set([...currentRoles, ...(currentRole ? [currentRole] : []), "client"])];
      hasPassword = true;

      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        user_metadata: {
          ...existingAuth.user_metadata,
          roles,
          client_id: clientId,
        },
      });
    }
    await supabaseAdmin.from("clients").update({
      portal_enabled: true,
      portal_invited_at: new Date().toISOString(),
    }).eq("id", clientId);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";
  let portalLink: string;
  let emailSubject: string;
  let emailBody: string;

  if (isExistingUser && hasPassword) {
    // User already has a password (e.g., they're also an advisor)
    // No need for recovery link — just send them to portal login
    portalLink = `${appUrl}/portal/login`;
    emailSubject = "Tu portal de inversiones está listo";
    emailBody = `
      <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 8px;">
        Tu asesor financiero te ha dado acceso al portal de inversiones de Greybark Advisors.
      </p>
      <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 24px;">
        Puedes acceder con tu email y contraseña actual. Si no recuerdas tu contraseña, usa la opción "Olvidé mi contraseña" en la página de inicio de sesión.
      </p>
      <a href="${portalLink}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
        Acceder al portal
      </a>
    `;
  } else {
    // New user — generate recovery link so they can set their password
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin
      .generateLink({ type: "recovery", email: client.email });

    if (linkError || !linkData) {
      console.error("Error generando link:", linkError);
      return NextResponse.json({ error: "Error generando link de acceso: " + (linkError?.message || "desconocido") }, { status: 500 });
    }

    portalLink = `${appUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/portal/setup-password`;
    emailSubject = "Tu portal de inversiones está listo — define tu contraseña";
    emailBody = `
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
    `;
  }

  // 5. Enviar email via Resend
  const senderEmail = process.env.SENDER_EMAIL || "noreply@greybark.cl";
  let emailSent = false;
  let emailError: string | null = null;

  try {
    const { data: emailData, error: resendError } = await resend.emails.send({
      from: `Greybark Advisors <${senderEmail}>`,
      to: client.email,
      subject: emailSubject,
      html: `
        <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <img src="${appUrl}/logo-greybark.png" alt="Greybark Advisors" style="height: 40px; margin-bottom: 32px;" />
          <h1 style="font-size: 20px; color: #1a1a1a; margin-bottom: 16px;">
            Hola ${escapeHtml(client.nombre || '')},
          </h1>
          ${emailBody}
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
