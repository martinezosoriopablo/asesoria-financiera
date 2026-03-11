// lib/google/calendar-client.ts
// Cliente para Google Calendar API con OAuth per-advisor

import { createClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ||
  `${process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app"}/api/google/callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  token_expiry: Date;
}

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  conferenceData?: {
    createRequest?: {
      requestId: string;
      conferenceSolutionKey: { type: string };
    };
  };
}

export interface Meeting {
  id: string;
  titulo: string;
  descripcion?: string;
  fecha: string;
  duracion_minutos: number;
  tipo: string;
  ubicacion?: string;
  link_virtual?: string;
  google_event_id?: string;
  clients?: {
    nombre: string;
    apellido: string;
    email?: string;
  };
}

/**
 * Verifica si Google Calendar está configurado
 */
export function isGoogleCalendarConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/**
 * Genera la URL de autorización de Google OAuth
 */
export function getGoogleAuthUrl(advisorId: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // Forzar pantalla de consentimiento para obtener refresh_token
    state: advisorId, // Pasamos el advisor_id para identificar al usuario
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Intercambia el código de autorización por tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error obteniendo tokens: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_expiry: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Refresca el access_token usando el refresh_token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  token_expiry: Date;
}> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error refrescando token: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    token_expiry: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Obtiene un access_token válido para el advisor, refrescando si es necesario
 */
export async function getValidAccessToken(advisorId: string): Promise<string | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Obtener tokens del advisor
  const { data: tokenData, error } = await supabase
    .from("advisor_google_tokens")
    .select("*")
    .eq("advisor_id", advisorId)
    .single();

  if (error || !tokenData) {
    return null;
  }

  // Verificar si el token está vencido (con 5 min de margen)
  const expiryTime = new Date(tokenData.token_expiry).getTime();
  const now = Date.now() + 5 * 60 * 1000; // 5 minutos de margen

  if (now >= expiryTime) {
    // Refrescar token
    try {
      const newTokens = await refreshAccessToken(tokenData.refresh_token);

      // Actualizar en la base de datos
      await supabase
        .from("advisor_google_tokens")
        .update({
          access_token: newTokens.access_token,
          token_expiry: newTokens.token_expiry.toISOString(),
        })
        .eq("advisor_id", advisorId);

      return newTokens.access_token;
    } catch (err) {
      console.error("Error refrescando token de Google:", err);
      return null;
    }
  }

  return tokenData.access_token;
}

/**
 * Crea un evento en Google Calendar
 */
export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEvent,
  calendarId: string = "primary"
): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error creando evento: ${error.error?.message || "Error desconocido"}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Actualiza un evento en Google Calendar
 */
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: Partial<CalendarEvent>,
  calendarId: string = "primary"
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error actualizando evento: ${error.error?.message || "Error desconocido"}`);
  }
}

/**
 * Elimina un evento de Google Calendar
 */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId: string = "primary"
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.json();
    throw new Error(`Error eliminando evento: ${error.error?.message || "Error desconocido"}`);
  }
}

/**
 * Convierte una reunión de la app a formato de Google Calendar
 */
export function meetingToCalendarEvent(meeting: Meeting): CalendarEvent {
  const startDate = new Date(meeting.fecha);
  const endDate = new Date(startDate.getTime() + (meeting.duracion_minutos || 60) * 60 * 1000);

  const clientName = meeting.clients
    ? `${meeting.clients.nombre} ${meeting.clients.apellido}`
    : "Cliente";

  const event: CalendarEvent = {
    summary: `${meeting.titulo} - ${clientName}`,
    description: meeting.descripcion || `Reunión con ${clientName}`,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: "America/Santiago",
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: "America/Santiago",
    },
  };

  // Agregar ubicación según tipo
  if (meeting.tipo === "presencial" && meeting.ubicacion) {
    event.location = meeting.ubicacion;
  } else if (meeting.tipo === "virtual" && meeting.link_virtual) {
    event.location = meeting.link_virtual;
    event.description += `\n\nEnlace: ${meeting.link_virtual}`;
  }

  // Agregar cliente como attendee si tiene email
  if (meeting.clients?.email) {
    event.attendees = [
      {
        email: meeting.clients.email,
        displayName: `${meeting.clients.nombre} ${meeting.clients.apellido}`,
      },
    ];
  }

  // Si es reunión virtual, crear Google Meet automáticamente
  if (meeting.tipo === "virtual" && !meeting.link_virtual) {
    event.conferenceData = {
      createRequest: {
        requestId: `meeting-${meeting.id}-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  return event;
}

/**
 * Sincroniza una reunión con Google Calendar
 */
export async function syncMeetingToGoogle(
  advisorId: string,
  meeting: Meeting
): Promise<string | null> {
  const accessToken = await getValidAccessToken(advisorId);
  if (!accessToken) {
    console.log("No hay token de Google Calendar para el advisor:", advisorId);
    return null;
  }

  const event = meetingToCalendarEvent(meeting);

  try {
    if (meeting.google_event_id) {
      // Actualizar evento existente
      await updateCalendarEvent(accessToken, meeting.google_event_id, event);
      return meeting.google_event_id;
    } else {
      // Crear nuevo evento
      const eventId = await createCalendarEvent(accessToken, event);
      return eventId;
    }
  } catch (err) {
    console.error("Error sincronizando con Google Calendar:", err);
    return null;
  }
}

/**
 * Elimina una reunión de Google Calendar
 */
export async function deleteMeetingFromGoogle(
  advisorId: string,
  googleEventId: string
): Promise<boolean> {
  const accessToken = await getValidAccessToken(advisorId);
  if (!accessToken) {
    return false;
  }

  try {
    await deleteCalendarEvent(accessToken, googleEventId);
    return true;
  } catch (err) {
    console.error("Error eliminando evento de Google Calendar:", err);
    return false;
  }
}

/**
 * Obtiene los eventos del calendario para un rango de fechas
 */
export async function getCalendarEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
  calendarId: string = "primary"
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error obteniendo eventos: ${error.error?.message || "Error desconocido"}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Revoca el acceso a Google Calendar para un advisor
 */
export async function revokeGoogleAccess(advisorId: string): Promise<boolean> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Obtener token para revocar
  const { data: tokenData } = await supabase
    .from("advisor_google_tokens")
    .select("access_token")
    .eq("advisor_id", advisorId)
    .single();

  if (tokenData?.access_token) {
    // Revocar token en Google
    await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, {
      method: "POST",
    });
  }

  // Eliminar de la base de datos
  const { error } = await supabase
    .from("advisor_google_tokens")
    .delete()
    .eq("advisor_id", advisorId);

  return !error;
}
