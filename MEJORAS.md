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
- [x] Admin subordinate access en messages, invite, interactions (2026-03-25)
- [x] Rate limiting en endpoints costosos: AI=5/min, non-AI=10/min (2026-03-25)
- [x] N+1 queries en fill-prices — pre-fetch fintual_funds con Map O(1) (2026-03-25)
- [x] Token Bolsa Santiago movido de query param a Authorization header (2026-03-25)
- [x] OAuth CSRF protection — state cookie en Google OAuth flow (2026-03-25)
- [x] RLS en clients, portfolio_snapshots, client_cartolas, risk_profiles + función helper admin (2026-03-25)
- [x] Security headers: HSTS, X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy (2026-03-25)
- [x] Validación formulario nuevo cliente: RUT mod11, teléfono +56, montos positivos, edad ≥18 (2026-03-25)
- [x] XSS en emails: escapeHtml en invite y questionnaire con lib/sanitize.ts (2026-03-25)
- [x] Race conditions en snapshots: función atómica calculate_snapshot_returns en PL/pgSQL (2026-03-25)
- [x] Rate limiter: MAX_ENTRIES cap + cleanup para evitar memory leaks, TODO Upstash (2026-03-25)
- [x] Fintual sync atómico: batch upsert por tabla, chunks de 1000 rows (2026-03-25)
- [x] Env vars validation: lib/env.ts valida 5 vars críticas al startup (2026-03-25)

- [x] Dashboard error handling: ya tenía manejo correcto, verificado (2026-03-25)
- [x] Edit page stub removido — edición ya existe como modal en ClientDetail (2026-03-25)
- [x] Placeholder fetchFromMassive removido de unified-profile (2026-03-25)
- [x] Audit logging: tabla audit_logs + lib/audit.ts + logs en create/delete client y CRUD advisors (2026-03-25)

---

## PENDIENTES

_Sin items pendientes. Próxima auditoría sugerida: 2026-04-25._

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
