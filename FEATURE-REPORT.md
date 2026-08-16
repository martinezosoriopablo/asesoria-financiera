# Feature: correo de contacto configurable por asesor

## Migración
- `supabase/migrations/20260816_advisor_contact_email.sql` — `ALTER TABLE advisors ADD COLUMN IF NOT EXISTS contact_email text;` (nullable, fallback a `advisors.email`).

## Helper
- `lib/advisor-email.ts` — `advisorContactEmail(a)`: retorna `a.contact_email || a.email || null`.

## Archivos modificados

### `lib/auth/api-auth.ts`
`requireAdvisor()` es el punto central que alimenta `GET /api/advisor/profile` (y muchas otras rutas que ya tenían `advisor` en scope). Se agregó `contact_email` al `.select(...)` de la tabla `advisors` (línea ~115) y al interface `AdvisorProfile` (campo opcional `contact_email?: string | null`). Esto habilitó, sin tocar código adicional, que `advisor` ya trajera `contact_email` en las rutas `seguimiento/send-email`, `portfolio/radiografia/send-email` y `client/invite` (todas usan `requireAdvisor()`).

### `app/api/advisor/profile/route.ts`
- GET: sin cambios explícitos — ya retorna el objeto `advisor` completo de `requireAdvisor()`, que ahora incluye `contact_email`.
- PUT: se agregó `'contact_email'` a `allowedFields` (whitelist). Se agregó normalización: string vacío se guarda como `null` antes del `.update()`.

### `app/(advisor-shell)/advisor/profile/page.tsx`
- Interface `AdvisorProfile`: se agregó `contact_email: string | null`.
- Se agregó un campo `<input type="email">` "Correo de contacto (para notificaciones y respuestas)" justo debajo del email de login (solo lectura), con texto de ayuda "Si lo dejas vacío, se usa tu correo de acceso." Mismo estilo Tailwind/gb-* que los campos hermanos (ícono `Mail`, borde `gb-border`, focus `gb-accent`).
- `handleSubmit`: se agregó `contact_email: profile.contact_email` al body del PUT.

## Rutas de email de asesor — wiring

### Con reply-to / destinatario actualizado
1. **`app/api/save-risk-profile/route.ts`** — notificación AL asesor (`to: advisorEmail`). Ambos lookups de asesor (`.select("email")` → `client.asesor_id` y el fallback `firstAdvisor`) ahora seleccionan `email, contact_email` y usan `advisorContactEmail(advisor)` en vez de `advisor?.email`.
2. **`app/api/send-questionnaire/route.ts`** — client-facing. El `.select(...)` del asesor (buscado por `advisorEmail` del body) ahora incluye `contact_email`; `replyTo` se calcula con `advisorContactEmail(advisor) || replyTo` (mantiene el default `SENDER_EMAIL` si el asesor no tiene ninguno de los dos).
3. **`app/api/seguimiento/send-email/route.ts`** — client-facing. `advisor` viene de `requireAdvisor()` (ya trae `contact_email` gracias al cambio en `api-auth.ts`). Se agregó `replyTo: advisorContactEmail(advisor) || undefined` al `resend.emails.send(...)`.
4. **`app/api/portfolio/radiografia/send-email/route.ts`** — client-facing. Mismo patrón que seguimiento: `advisor` de `requireAdvisor()`, se agregó `replyTo: advisorContactEmail(advisor) || undefined`.
5. **`app/api/cron/send-reports/route.ts`** — cron que envía reporte al cliente. El `.select(...)` del advisor (por `client.asesor_id`) ahora incluye `contact_email`; se agregó `replyTo: advisorContactEmail(advisor) || undefined` al `resend.emails.send(...)`.
6. **`app/api/client/invite/route.ts`** — invitación al portal (client-facing). `advisor` viene de `requireAdvisor()` (ya trae `contact_email`). Se agregó `replyTo: advisorContactEmail(advisor) || undefined` al `resend.emails.send(...)`.

### Omitidas (sin contexto de asesor disponible)
- **`lib/daily-report-distribution.ts`** — SKIPPED. Es un broadcast del reporte diario de mercado a TODOS los clientes con `send_daily_report = true`; no hay lookup ni concepto de "asesor del cliente" en esta ruta (los emails se arman directo desde `clients` + `daily_reports`, en batches, sin join a `advisors`). No se inventó un advisor context — reportado tal cual pide la tarea.

`from` no se tocó en ninguna ruta (sigue siendo el dominio verificado de Resend en cada caso).

## Verificación
- `npx tsc --noEmit` → 0 errores.
