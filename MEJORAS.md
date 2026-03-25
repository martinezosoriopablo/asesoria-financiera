# Bucle de Mejora Continua — Asesoria Financiera

## Estado actual de la plataforma

Ultima auditoria: 2026-03-25

---

## RESUELTOS (2026-03-25)

- [x] Rutas rotas `/portfolio-comparison` y `/modelo-cartera` — redirigen a `/portfolio-designer`
- [x] Cron secret obligatorio — endpoint rechaza si `CRON_SECRET` no existe
- [x] UNIQUE constraint en `portfolio_snapshots(client_id, snapshot_date)` + indices de performance
- [x] Comite routes con auth de rol (`requireAdvisor`)
- [x] Admin subordinate access en endpoints principales (clients, cartolas, seguimiento, snapshots, risk-profile, portfolio-models)
- [x] Cuestionario de riesgo: pagina `/mi-perfil-inversor`, redirect preserva query params, reenvio habilitado
- [x] Chart period no borra la pagina (filtro client-side)
- [x] PerformanceAttribution usa `marketValueCLP` y TWR consistente
- [x] Boton eliminar cliente desde lista

---

## PENDIENTES — ALTO

### 1. Admin subordinate access en 3 endpoints restantes
- [ ] `app/api/advisor/messages/[clientId]/route.ts`
- [ ] `app/api/client/invite/route.ts`
- [ ] `app/api/clients/[id]/interactions/route.ts`
**Patron:** Agregar `getSubordinateAdvisorIds` check cuando `advisor.rol === "admin"`

### 2. Rate limiting en endpoints costosos
- [ ] `app/api/parse-portfolio-statement/route.ts` (AI/PDF)
- [ ] `app/api/parse-portfolio-excel/route.ts` (parsing)
- [ ] `app/api/generate-pdf/route.ts` (PDF generation)
- [ ] `app/api/analize-fund/route.ts` (AI)
- [ ] `app/api/comite/generar-cartera/route.ts` (AI)
**Patron:** `applyRateLimit(request, "nombre", { limit: 5, windowSeconds: 60 })`

### 3. N+1 queries en fill-prices
- [ ] `app/api/portfolio/fill-prices/route.ts:421-476`
**Fix:** Pre-fetch todos los `fintual_funds` en un solo query, usar Map para lookups O(1)

### 4. RLS en tablas sensibles
- [ ] `clients` — agregar politica por `asesor_id`
- [ ] `portfolio_snapshots` — politica por `client_id` -> `asesor_id`
- [ ] `client_cartolas` — politica por `client_id`
- [ ] `risk_profiles` — politica por `client_id`

### 5. Token Bolsa Santiago en header
- [ ] `lib/bolsa-santiago/client.ts:61` — mover de query param a `Authorization` header

### 6. OAuth CSRF protection
- [ ] `app/api/google/callback/route.ts` — validar `state` contra valor almacenado en session/cache

---

## PENDIENTES — MEDIO

### 7. Security headers
- [ ] Agregar en `next.config.ts`: HSTS, X-Content-Type-Options, X-Frame-Options, CSP

### 8. Validacion de formularios
- [ ] `app/clients/new/page.tsx` — validar RUT chileno, telefono, montos positivos, fecha nacimiento pasada

### 9. XSS en emails
- [ ] `app/api/client/invite/route.ts` — escapar `client.nombre` en HTML
- [ ] `app/api/send-questionnaire/route.ts` — escapar `displayName` en HTML

### 10. Race conditions en snapshots
- [ ] `app/api/portfolio/snapshots/[id]/route.ts:160-195` — crear DB function atomica para calcular y actualizar returns

### 11. Rate limiter persistente
- [ ] `lib/rate-limit.ts` — migrar de in-memory a Upstash Redis o Vercel KV para multi-instancia

### 12. Fintual sync atomico
- [ ] `app/api/cron/sync-fintual/route.ts` — wrappear en transaccion DB o usar batch upsert

### 13. Env vars validation
- [ ] Crear `lib/env.ts` que valide variables criticas al startup: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`

---

## PENDIENTES — BAJO

### 14. Dashboard error handling
- [ ] `app/dashboard/page.tsx:66` — mostrar banner de error en vez de catch vacio

### 15. Edit page stub
- [ ] `app/clients/[id]/edit/page.tsx` — implementar o remover ruta

### 16. Placeholder fetchFromMassive
- [ ] `app/api/funds/unified-profile/route.ts` — implementar o remover

### 17. Audit logging
- [ ] Implementar logs de acciones admin (creacion/eliminacion de clientes, cambios de rol)

---

## Proceso de mejora continua

### Cada sprint (semanal):
1. Revisar este archivo
2. Elegir 2-3 items del bloque ALTO
3. Implementar, testear, deployar
4. Mover a RESUELTOS con fecha

### Cada mes:
1. Correr auditoria completa (pedir a Claude: "Haz una auditoria completa")
2. Actualizar este archivo con nuevos hallazgos
3. Priorizar items nuevos

### Antes de cada deploy:
1. `npx next build` debe pasar sin errores
2. Verificar que no hay archivos sin commitear que el build necesite
3. Revisar que env vars esten configuradas en Vercel
