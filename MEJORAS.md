# Bucle de Mejora Continua — Asesoria Financiera

## Estado actual de la plataforma

Ultima auditoria: 2026-04-01

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

### Seguimiento de Cartolas — Mejoras UX
- [x] **Gráfico dual: Rentabilidad TWR + Valor** — modo default "Rentabilidad TWR", escala acotada para valor con padding 10% (2026-03-31)
- [x] **Auto-baseline primera cartola** — primera cartola se marca automáticamente como `is_baseline` (2026-03-31)
- [x] **PerformanceAttribution con baseline** — pasa snapshot baseline como `previousPortfolio` en vez de null (2026-03-31)
- [x] **Banner de fondos con precios manuales** — banner azul mostrando qué fondos usan precios manuales + fecha del último dato (2026-03-31)
- [x] **Modal de precios con carga de existentes** — al seleccionar fondo manual, carga precios ya guardados para editar/extender (2026-03-31)
- [x] **Fix RLS en coverage endpoint** — `manual_prices` se leía con RLS que bloqueaba silenciosamente, cambiado a admin client (2026-03-31)

### Bugs Críticos Corregidos
- [x] **fill-prices: assetClass no matcheaba** — holdings tenían `"Equity"`, `"Fixed Income"` pero el código filtraba por `"equity"`, `"fixedIncome"`. Agregado `normalizeAC()` que normaliza case y espacios. Soporta español (`Renta Variable`, `Renta Fija`) e inglés. Esto causaba que todos los snapshots intermedios tuvieran `equity_value=0`, `fixed_income_value=0`, haciendo invisible la atribución de rendimiento (2026-03-31)
- [x] **Snapshots fantasma pre-cartola** — fill-prices generaba snapshots hasta 2 años antes de la primera cartola. Limpiados 444 snapshots stale. Causa raíz: existían snapshots de ejecuciones anteriores con cartolas diferentes (2026-03-31)
- [x] **PerformanceAttribution vacía** — componente usaba primer snapshot (intermedio con eq=0) para calcular. Ahora filtra solo snapshots con datos reales de asset class (2026-03-31)
- [x] **Invitación apuntaba a localhost** — `NEXT_PUBLIC_APP_URL` sin `https://` + Supabase Site URL en localhost. Agregado `getAppUrl()` helper + fallback magic link para usuarios ya registrados (2026-03-31)
- [x] **HoldingReturnsPanel mostraba 0% rentabilidad** — componente usaba snapshot manual (con precios congelados) para "P. Actual". Ahora prefiere el último snapshot api-prices que tiene precios de mercado reales. También normalización de etiquetas assetClass case-insensitive (2026-03-31)
- [x] **AAFM 403 Forbidden** — cookies de sesión no se extraían correctamente en Vercel. Mejorado: fallback `set-cookie` header cuando `getSetCookie()` no existe, manejo de redirects, retry automático en 403 con sesión fresca (2026-03-31)

## RESUELTOS (2026-04-01)

### Portal del Cliente — Acceso y Seguridad
- [x] **Fix portal login** — auth user de andres.auger11@gmail.com sin metadata `role: "client"`, corregido con script admin (2026-04-01)
- [x] **Fix portal dashboard crash** — snapshot holdings tenían `fundName`/`marketValue` pero portal esperaba `nombre`/`valor`/`porcentaje`, transformación agregada en `/api/portal/portfolio` (2026-04-01)
- [x] **Fix `.single()` crash en portal/me** — `.maybeSingle()` para risk_profiles y advisors que pueden no existir (2026-04-01)
- [x] **Invitación con setup de contraseña** — cambiado de `generateLink({ type: "magiclink" })` a `type: "recovery"` + página `/portal/setup-password` para definir contraseña (2026-04-01)
- [x] **Fix email de invitación** — `resend.emails.send()` no lanza error, retorna `{ error }`. Mejorado handling + link copiable como fallback (2026-04-01)
- [x] **Auth callback mejorado** — `/auth/callback` ahora maneja `token_hash` + `type` (invite/recovery/magiclink) via `verifyOtp()` además de OAuth/PKCE (2026-04-01)
- [x] **Cambiar contraseña (cliente)** — nueva página `/portal/cambiar-password` con verificación de contraseña actual + icono Lock en topbar desktop y mobile (2026-04-01)
- [x] **Cambiar contraseña (asesor)** — sección en `/advisor/profile` con formulario de cambio de contraseña (2026-04-01)

### Portfolio Designer — Búsqueda de Fondos y Flujo Completo
- [x] **Búsqueda universal de fondos** — modal de búsqueda en ComparisonModeV2 que consulta 3 fuentes en paralelo: BD local, Fintual/AAFM (fondos mutuos CL, RUN), Alpha Vantage (ETFs internacionales) (2026-04-01)
- [x] **Agregar/eliminar posiciones manualmente** — botón "Agregar posición" + búsqueda + botón eliminar por fila en portafolio recomendado (2026-04-01)
- [x] **Cargar último snapshot como Actual** — ComparisonModeV2 ahora carga el último snapshot del API (más actualizado) en vez de solo `portfolio_data`, con fallback (2026-04-01)
- [x] **Resumen de rebalanceo post-guardado** — al guardar cartera recomendada, muestra tabla de acciones: comprar/vender/mantener por instrumento con montos estimados (2026-04-01)

### Seguimiento — Panel de Rebalanceo
- [x] **Tabla de rebalanceo por holding** — nueva sección entre ComparacionBar y BaselineComparison: Instrumento | Actual % | Recomendado % | Diferencia (pp) | Acción, con conteo de operaciones en header (2026-04-01)

### ModelMode — Conexión con Cartera Recomendada
- [x] **Cargar cartera recomendada del cliente** — al seleccionar cliente en ModelMode, carga `cartera_recomendada` desde API y muestra tabla resumen como referencia antes de los bloques de asset class (2026-04-01)

### Portal del Cliente — Consistencia de datos
- [x] **Cuestionario ya completado** — si el cliente ya completó el cuestionario por email, al abrir el link muestra mensaje "ya completado" con opción de repetir. Endpoint `/api/check-risk-profile` con validación HMAC (2026-04-01)
- [x] **Cartolas del asesor visibles en portal** — "Mis Cartolas" ahora muestra tanto las subidas por el cliente como los snapshots cargados por el asesor (con badge "Asesor"). Deduplicación por fecha (2026-04-01)
- [x] **hasSnapshots incluye todo** — el onboarding step "Portafolio analizado" ahora cuenta todos los snapshots, no solo cartolas del cliente (2026-04-01)

### Sprint 1: Portal — Cartera Recomendada visible
- [x] **Cartera recomendada en dashboard del cliente** — nueva sección en `/portal/dashboard` mostrando comparación Actual vs Objetivo por clase de activo + tabla detallada de instrumentos con % objetivo (2026-04-01)
- [x] **API portfolio enriquecida** — `/api/portal/portfolio` ahora retorna `carteraRecomendada` del campo `clients.cartera_recomendada` (2026-04-01)

### Sprint 2: Vista Consolidada del Asesor
- [x] **API `/api/advisor/clients-overview`** — endpoint consolidado que retorna todos los clientes con datos enriquecidos (portfolio, drift, TWR, contacto, reportes) usando batch fetching para evitar N+1 (2026-04-01)
- [x] **Página `/advisor/clients-overview`** — dashboard con 7 métricas resumen (Clientes, AUM, TWR promedio, Recomendaciones, Drift alto, Sin contacto 30d+, Con portafolio), búsqueda, filtro por perfil de riesgo y estado, ordenamiento por 6 columnas, iconos de estado (2026-04-01)
- [x] **Link en navegación** — "Vista General" agregado al AdvisorHeader con icono Activity (2026-04-01)

### Sprint 3: Alertas de Rebalanceo + Tracking de Ejecución
- [x] **Tabla `rebalance_executions`** — registra operaciones ejecutadas post-recomendación: ticker, acción (buy/sell/hold), % actual vs objetivo, montos, notas (2026-04-01)
- [x] **Tipo `rebalance_alert` en notificaciones** — nueva categoría de alerta con icono amber en NotificationBell (2026-04-01)
- [x] **Cron `/api/cron/check-drift`** — verifica drift de todos los clientes diariamente (L-V 1pm), crea alertas cuando drift > umbral del asesor, evita duplicados dentro de 7 días (2026-04-01)
- [x] **`drift_threshold` configurable** — campo en tabla advisors (default 5%) para personalizar umbral de alerta por asesor (2026-04-01)
- [x] **API `/api/clients/[id]/rebalance-executions`** — GET para listar historial, POST para registrar batch de ejecuciones (2026-04-01)
- [x] **UI de ejecución en Seguimiento** — botón "Registrar ejecución" en tabla de rebalanceo que guarda operaciones comprar/vender, historial expandible con detalle de cada trade (2026-04-01)

### Sprint 4: Infraestructura
- [x] **Upstash Redis rate limiting** — `@upstash/ratelimit` + `@upstash/redis` con sliding window, fallback a in-memory cuando Redis no configurado, 68 endpoints migrados a async `await applyRateLimit()` (2026-04-01)
- [x] **Sentry error tracking** — `@sentry/nextjs` con client/server/edge configs, `global-error.tsx` para captura de errores React, `instrumentation.ts` para server-side, source maps protegidos, 10% trace sampling (2026-04-01)
- [x] **CSP actualizado** — agregado `https://*.sentry.io` a `connect-src` para permitir reportes de errores (2026-04-01)
- [x] **Cron check-drift** — verificación diaria de drift L-V 1pm configurada en `vercel.json` (2026-04-01)
- [x] **`.env.example` actualizado** — documentadas variables de Upstash Redis y Sentry (opcionales) (2026-04-01)

### Sistema Dual-Role (Asesor + Cliente)
- [x] **Endpoint `/api/auth/switch-role`** — cambia `active_role` en `user_metadata`, valida que el usuario tenga el rol solicitado en BD (advisors/clients), retorna URL de redirección (2026-04-01)
- [x] **Middleware actualizado** — usa `active_role > role (legacy)` para determinar routing portal vs advisor (2026-04-01)
- [x] **Invite dual-role** — si el email ya existe (e.g., es asesor), agrega "client" a `roles[]` sin sobreescribir metadata existente, envía email con link a login (no recovery) (2026-04-01)
- [x] **Portal login dual-role** — `handleLogin` verifica `roles[]` array (no solo `role`), llama switch-role para setear `active_role: "client"` al entrar (2026-04-01)
- [x] **require-client dual-role** — verifica `active_role` o `roles.includes("client")` (2026-04-01)
- [x] **Botón "Ir a mi Portal Cliente"** — en AdvisorHeader (desktop dropdown + mobile), auto-detecta `roles[]` sin necesidad de prop en call sites (2026-04-01)
- [x] **Botón "Vista Asesor"** — en PortalTopbar (desktop + mobile), auto-detecta rol advisor del usuario (2026-04-01)
- [x] **"¿Olvidaste tu contraseña?"** — link agregado en portal login apuntando a `/forgot-password` (2026-04-01)
- [x] **`useAdvisor` hook** — ahora expone `hasClientRole` derivado de `user_metadata.roles` (2026-04-01)

## RESUELTOS (2026-04-14)

### Fondos de Inversión CMF — Carga completa
- [x] **Pipeline de scraping CMF FI** — Scraper (`lib/cmf-fi-auto.ts`) + importador (`lib/cmf-fi-import.ts`) para descargar precios de fondos de inversión directamente desde CMF via 2captcha (reCAPTCHA v2) (2026-04-10)
- [x] **Catálogo de 152 fondos FIRES** — `data/cmf/fondos-inversion.json` con RUT, nombre, administradora, tipo. Bootstrap via `scripts/bootstrap-fondos-inversion.ts` (2026-04-10)
- [x] **DB: tablas `fondos_inversion` + `fondos_inversion_precios`** — Catálogo + precios diarios por serie (valor_libro, valor_economico, patrimonio_neto, n_aportantes, rent_diaria). Unique constraint `(fondo_id, serie, fecha)` (2026-04-10)
- [x] **Script CLI `scripts/sync-fi-diario.ts`** — Sync batch con flags: `--limit`, `--rut`, `--days`, `--continue-on-error`. ~40s/fondo (captcha dominated), ~$0.45 para 152 fondos (2026-04-10)
- [x] **Carga inicial completa** — 152/152 fondos procesados: 140 con precios + 12 empty (sin datos en rango). Total 2,841 filas de precios cargadas. 6 fondos fallaron por timeout y se reintentaron exitosamente (2026-04-14)
- [x] **Admin UI `/admin/fondos`** — Búsqueda dual (FM + FI), precios por serie, historial 15 días, badge de sync (2026-04-10)
- [x] **API `/api/fondos-inversion/lookup`** — Búsqueda por nombre/RUT/administradora + detalle con historial (2026-04-10)
- [x] **Automatización diaria** — Task Scheduler Windows `SyncFI-CMF-Diario` a las 21:00, logs en `logs/sync-fi-YYYYMMDD.log`, script wrapper `scripts/sync-fi-diario.bat` (2026-04-14)

---

## PENDIENTES

### Próximos pasos del flujo
- [ ] **Firma electrónica del contrato** — integración con servicio de firma (e.g., DocuSign, FirmaVirtual)
- [ ] **Aprobación de cartera por cliente** — flujo para que el cliente acepte/rechace la recomendación del asesor desde el portal
- [ ] **ModelMode tilts → cartera recomendada** — guardar resultado de tilts en ModelMode directamente como cartera_recomendada
- [ ] **Dashboard de performance consolidado** — gráfico histórico de AUM total y TWR promedio del asesor
- [ ] **Onboarding de asesor nuevo** — flujo guiado para primer uso de la plataforma

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
