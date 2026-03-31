# Bucle de Mejora Continua — Asesoria Financiera

## Estado actual de la plataforma

Ultima auditoria: 2026-03-31

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

### Auditoría #2 — Resueltos (2026-03-25)
- [x] CRÍTICO: save-risk-profile protegido con HMAC token + validación de inputs + origin check (2026-03-25)
- [x] CRÍTICO: HTML del comité sanitizado antes de guardar (sanitizeHtml en lib/sanitize.ts) (2026-03-25)
- [x] CRÍTICO: Snapshots endpoint con verificación de ownership + admin subordinate (2026-03-25)
- [x] ALTO: CSP removido unsafe-eval + agregado Permissions-Policy header (2026-03-25)
- [x] ALTO: Fill-prices paralelizado con concurrencia límite de 5 (parallelWithLimit) (2026-03-25)
- [x] ALTO: Debounce 300ms en búsqueda de market dashboard (2026-03-25)
- [x] ALTO: Memory leak fix en useAdvisor (isMounted ref) (2026-03-25)
- [x] ALTO: .env.example creado con todas las variables documentadas (2026-03-25)
- [x] ALTO: Hardcoded emails/URLs reemplazados por env vars (SENDER_EMAIL, APP_URL) (2026-03-25)

- [x] MEDIO: Paginación en seguimiento: limit/offset con default 500, count exact (2026-03-25)
- [x] MEDIO: Error messages genéricos en 6 rutas API, detalles solo en server logs (2026-03-25)
- [x] MEDIO: Select específico en advisor/stats en vez de select("*") (2026-03-25)
- [x] MEDIO: AAFM sync atómico con upsert en vez de delete+insert (2026-03-25)
- [x] BAJO: Console.log condicional con debugLog() en aafm-sync (2026-03-25)
- [x] BAJO: Escape key handler en 6 modales (2026-03-25)
- [x] BAJO: Hook dependencies resueltos en ClientsManager y ClientDetail (2026-03-25)
- [x] BAJO: Magic numbers extraídos a constantes en fill-prices y parse-excel (2026-03-25)

---

## RESUELTOS (2026-03-26)

- [x] Fund cuota history: derivación histórica de valores cuota usando rentabilidades AAFM (7d, 30d, 90d, 365d, YTD) (2026-03-26)
- [x] AAFM sync error: deduplicación de registros antes de upsert (múltiples series → mismo fondo_id) (2026-03-26)
- [x] Error messages mejorados en AAFM sync: mensaje específico en vez de genérico (2026-03-26)
- [x] API endpoint `/api/funds/historical-series` para consultar serie de cuotas históricas (2026-03-26)
- [x] Unique constraint en `fondos_rentabilidades_agregadas(fondo_id, fecha_calculo, fuente)` — habilita upsert atómico (2026-03-26)

## RESUELTOS (2026-03-27)

### Flujo del Asesor — Mejoras de workflow
- [x] **Portafolio Inicial como Línea Base** — `is_baseline` en snapshots, comparación visual inicial vs actual, badge dorado en tabla, estrella para marcar baseline (2026-03-27)
- [x] **Versionamiento de Recomendaciones** — tabla `recommendation_versions`, auto-guardado al aplicar, historial con timeline expandible y comparación lado a lado (2026-03-27)
- [x] **Reportes al Cliente** — tabla `client_report_config` + `client_reports`, asesor configura frecuencia y contenido (cartera + comentario IA + reportes comité), nueva pestaña "Reportes" en portal del cliente (2026-03-27)
- [x] **Contrato de Prestación de Servicios** — upload PDF en ficha del cliente, Supabase Storage bucket `contracts`, ver/descargar/reemplazar/eliminar (2026-03-27)
- [x] **Cuestionario desde Portal** — botón "Completar Perfil de Riesgo" en bienvenida del portal, genera link con token HMAC automáticamente (2026-03-27)
- [x] **Cliente sube Cartolas desde Portal** — nueva página `/portal/subir-cartola`, selecciona administradora, sube PDF/Excel, notifica al asesor por mensaje (2026-03-27)
- [x] **UI inteligente en portal** — bienvenida muestra CTA contextual: cuestionario pendiente → completar, sin cartolas → subir, onboarding steps actualizados dinámicamente (2026-03-27)

### Dashboard del Asesor
- [x] Links rotos en flujo de asesoría corregidos (portfolio-comparison, modelo-cartera) (2026-03-27)
- [x] WeeklyCalendar: eliminado debug banner y console.logs (2026-03-27)
- [x] GoogleCalendarConnect: alert() reemplazado por banners inline (2026-03-27)

### Admin
- [x] Sincronización de datos movida a página admin dedicada `/admin/data-sync` (2026-03-27)
- [x] Market dashboard limpio: solo lectura, sin botones de sync (2026-03-27)

### Usuarios Demo
- [x] Script para crear 3 perfiles demo: admin, asesor, cliente con credenciales funcionales (2026-03-27)
- [x] Login por email/password en portal del cliente (no depende de magic links) (2026-03-27)

## RESUELTOS (2026-03-30)

### Notificaciones al Asesor
- [x] **Tabla `advisor_notifications`** — eventos discretos con tipo, link, read_at, realtime habilitado (2026-03-30)
- [x] **API `/api/advisor/notifications`** — GET (listar con unreadCount) + PATCH (marcar leídas individual/todas) (2026-03-30)
- [x] **NotificationBell en header** — campana con badge rojo, dropdown con lista, iconos por tipo, polling 30s (2026-03-30)
- [x] **Trigger en upload-cartola** — crea notificación in-app al asesor automáticamente (2026-03-30)
- [x] **Trigger en save-risk-profile** — crea notificación in-app + email existente al asesor (2026-03-30)
- [x] **Helper `lib/notifications.ts`** — función reutilizable `createNotification()` (2026-03-30)

### Envío de Reportes por Email
- [x] **Cron `/api/cron/send-reports`** — ejecuta diario 12pm, verifica frecuencia por cliente (daily/weekly/monthly) (2026-03-30)
- [x] **Email con Resend** — template HTML con resumen de portafolio, composición, cambio de valor, link al portal (2026-03-30)
- [x] **Vercel cron configurado** — `0 12 * * 1-5` en vercel.json (2026-03-30)
- [x] **Notificación al asesor** — tipo `report_ready` cuando se envía reporte automático (2026-03-30)

### Re-envío de Cuestionario de Riesgo
- [x] **Botón en ficha del cliente** — "Re-enviar cuestionario de riesgo" en sección Perfil de Riesgo del ClientDetail (2026-03-30)

### Experiencia del Cliente (Portal)
- [x] **Gráfico de evolución** — SVG chart en dashboard del portal mostrando evolución histórica del portafolio (2026-03-30)
- [x] **API portfolio mejorada** — devuelve `history[]` con todos los snapshots para el chart (2026-03-30)
- [x] **Historial de cartolas** — nueva página `/portal/mis-cartolas` con estado (pendiente/procesada/error) (2026-03-30)
- [x] **API `/api/portal/cartolas`** — lista `client_interactions` tipo `cartola_upload` del cliente (2026-03-30)
- [x] **Badge de reportes sin leer** — `read_at` en `client_reports`, conteo en `/api/portal/me`, badge amber en topbar (2026-03-30)
- [x] **Pestaña "Mis Cartolas"** — agregada al PortalTopbar con icono FileUp (2026-03-30)

## RESUELTOS (2026-03-31)

### Precios Manuales — Importación Excel
- [x] **Importar Excel en modal de precios manuales** — botón "Importar Excel" (.xlsx/.xls/.csv) que parsea columnas fecha+valor cuota automáticamente, detecta formatos DD-MM-YYYY, YYYY-MM-DD, fechas seriales Excel (2026-03-31)
- [x] **Fix RLS en `manual_prices`** — upsert fallaba por falta de policy UPDATE; cambiado a admin client con autenticación previa verificada (2026-03-31)
- [x] **Yahoo Finance map para fondos internacionales** — tabla `security_yahoo_map` (CUSIP → Yahoo ticker), pre-fetch en fill-prices, búsqueda automática por CUSIP en Yahoo (2026-03-31)
- [x] **Detección de mercado en holdings** — campo `market` (CL/INT/US) en fill-prices para routing inteligente de fuente de precios (2026-03-31)
- [x] **Migración `manual_prices`** — tabla con validaciones, RLS para advisors, índice por security+fecha (2026-03-31)
- [x] **Migración `security_yahoo_map`** — mapeo CUSIP/ISIN a ticker Yahoo para fondos sin precio automático (2026-03-31)

### Infraestructura
- [x] **Dividendos en portfolio** — tabla `portfolio_dividends`, API POST/GET, modal en PortfolioEvolution, se suman al valor sin afectar cuotas (2026-03-31)
- [x] **Frecuencia de comité configurable** — migración `comite_freq` (2026-03-31)
- [x] **Send day configurable en reportes** — migración `report_send_day` (2026-03-31)
- [x] **Daily reports** — migración y endpoint de upload (2026-03-31)
- [x] **Cron send-reports** — endpoint + vercel.json configurado L-V 12pm (2026-03-31)

## PENDIENTES

### Próximos pasos del flujo
- [ ] **Firma electrónica del contrato** — integración con servicio de firma (e.g., DocuSign, FirmaVirtual)

_Próxima auditoría sugerida: 2026-04-06._

---

## Proceso de mejora continua

### Cada sprint (semanal):
1. Revisar este archivo y la sección PENDIENTES
2. Elegir 2-3 items prioritarios según impacto para el asesor y sus clientes
3. Implementar, testear, deployar
4. Mover a RESUELTOS con fecha
5. Identificar nuevas mejoras surgidas del uso real y agregarlas a PENDIENTES

### Cada mes:
1. Correr auditoría completa (pedir a Claude: "Haz una auditoría completa")
2. Actualizar este archivo con nuevos hallazgos
3. Priorizar items nuevos
4. Revisar mejoras resueltas — ¿alguna necesita iteración?
5. Evaluar métricas: ¿los clientes usan el portal? ¿el asesor usa las notificaciones?

### Cada conversación con Claude:
1. Leer MEJORAS.md para entender el estado actual
2. Al implementar mejoras, actualizar PENDIENTES → RESUELTOS con fecha
3. Si surgen nuevas ideas o bugs, agregarlos a PENDIENTES
4. Al finalizar, verificar que MEJORAS.md refleja el estado real de la plataforma

### Antes de cada deploy:
1. `npx next build` debe pasar sin errores
2. Verificar que no hay archivos sin commitear que el build necesite
3. Revisar que env vars estén configuradas en Vercel
4. Ejecutar migraciones SQL pendientes en Supabase
5. Verificar que cron jobs en vercel.json están actualizados
