# Auditoría Completa — Greybark Advisors
## Plataforma de Asesoría Financiera

**Fecha:** 23 de marzo 2026 (actualizado 14 de abril 2026)
**Stack:** Next.js 16 + React 19 + Supabase + TypeScript + Tailwind CSS v4
**Deployment:** Vercel (asesoria-financiera.vercel.app)
**Marca:** Greybark Advisors

---

## 1. MAPA COMPLETO DE FUNCIONALIDADES

### 1.1 Gestión de Clientes (CRM)
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Lista de clientes con búsqueda y filtros | ✅ Funciona | `/clients` |
| Crear nuevo cliente | ✅ Funciona | `/clients/new` |
| Detalle de cliente | ✅ Funciona | `/clients/[id]` |
| Editar cliente | ✅ Funciona | `/clients/[id]/edit` |
| Eliminar cliente | ✅ Funciona | API DELETE |
| Filtro por estado (prospecto/activo/inactivo) | ✅ Funciona | `/clients` |
| Filtro por perfil de riesgo | ✅ Funciona | `/clients` |
| Estadísticas de clientes (AUM, total, activos) | ✅ Funciona | `/api/clients/stats` |
| Jerarquía de asesores (admin ve subordinados) | ✅ Funciona | RLS + API |

### 1.2 Perfil de Riesgo
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Cuestionario 7 pasos (wizard) | ✅ Funciona | `/(public)/risk-profile` |
| Scoring multi-dimensional (capacidad, tolerancia, percepción, compostura) | ✅ Funciona | `lib/risk/` |
| Generación de benchmark ideal | ✅ Funciona | Automático |
| Envío de cuestionario por email | ✅ Funciona | `/api/send-questionnaire` |
| Gauge visual del perfil | ✅ Funciona | `ProfileGauge` |
| Resumen de jubilación | ✅ Funciona | `RetirementSummary` |

### 1.3 Análisis de Cartolas (Portafolio)
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Parseo de cartolas PDF | ✅ Funciona | `/api/parse-portfolio-statement` |
| Parseo de cartolas Excel | ✅ Funciona | `/api/parse-portfolio-excel` |
| Precios manuales (CSV/Excel import) | ✅ Funciona | `/api/portfolio/manual-prices` |
| Dividendos en portafolio | ✅ Funciona | `/api/portfolio/dividends` |
| Snapshots de portafolio | ✅ Funciona | `portfolio_snapshots` |
| Clasificación automática RV/RF/Alt/Cash | ✅ Funciona | `lib/funds/` |
| Comparación actual vs ideal | ✅ Funciona | Portfolio Designer |
| Cálculo TWR (Time-Weighted Return) | ✅ Funciona | Fill prices |
| Llenado de precios intermedios (multi-fuente) | ✅ Funciona | `/api/portfolio/fill-prices` |

### 1.4 Diseñador de Portafolios
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Modo Comparación (actual vs ideal) | ✅ Funciona | `/portfolio-designer` tab 1 |
| Modo Modelo (crear plantillas) | ✅ Funciona | Tab 2 |
| Modo Quick Build (carteras prediseñadas) | ✅ Funciona | Tab 3 |
| Modo Análisis (comparar fondos) | ✅ Funciona | Tab 4 |
| Modo Directo (acciones y bonos) | ✅ Funciona | Tab 5 |
| Guardar modelos de portafolio | ✅ Funciona | `portfolio_models` |

### 1.5 Centro de Fondos
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Búsqueda de fondos por nombre/ticker | ✅ Funciona | `/fund-center` tab 1 |
| Comparación side-by-side de ETFs (hasta 6) | ✅ Funciona | Tab 2 |
| Análisis de factsheets PDF | ✅ Funciona | Tab 3 |

### 1.6 Dashboard de Mercado (Fondos Chilenos)
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Lista de fondos mutuos chilenos | ✅ Funciona | `/market-dashboard` |
| Filtros por categoría, administradora | ✅ Funciona | Filtros inline |
| Sync catálogo Fintual | ✅ Funciona | Admin only |
| Sync precios AAFM | ✅ Funciona | Admin only |
| Upload rentabilidades diarias | ✅ Funciona | Modal |
| Upload TAC (gastos) | ✅ Funciona | Modal |
| Detalle de fondo individual | ✅ Funciona | Modal |

### 1.7 Seguimiento de Clientes
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Timeline de snapshots | ✅ Funciona | `/clients/[id]/seguimiento` |
| Gráficos de evolución de cartera (TWR + Valor) | ✅ Funciona | Recharts |
| Panel de retornos por holding | ✅ Funciona | `HoldingReturnsPanel` |
| Tabla de rebalanceo por holding | ✅ Funciona | Comprar/Vender/Mantener |
| Registro de ejecuciones (buy/sell) | ✅ Funciona | `rebalance_executions` |
| Comparación baseline vs actual | ✅ Funciona | `BaselineComparison` |
| Historial de recomendaciones | ✅ Funciona | `RecommendationHistory` |

### 1.8 Herramientas del Asesor
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Dashboard principal del asesor | ✅ Funciona | `/advisor` |
| Integración Google Calendar | ✅ Funciona | OAuth 2.0 |
| Calendario semanal | ✅ Funciona | `WeeklyCalendar` |
| Crear reuniones | ✅ Funciona | `NewMeetingForm` |
| Acciones rápidas | ✅ Funciona | Links directos |

### 1.9 Comité de Inversiones
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Generar cartera recomendada | ✅ Funciona | `/api/comite/generar-cartera` |
| Upload datos de comité | ✅ Funciona | `/api/comite/upload` |
| Aplicar cartera a clientes | ✅ Funciona | `/api/comite/aplicar-cartera` |
| Exportar PDF del comité | ✅ Funciona | `CarteraComitePDF` |

### 1.10 Portal del Cliente
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Login email/password + "Olvidé mi contraseña" | ✅ Funciona | `/portal/login` |
| Setup de contraseña (invitación) | ✅ Funciona | `/portal/setup-password` |
| Cambiar contraseña | ✅ Funciona | `/portal/cambiar-password` |
| Dashboard (valor, evolución, composición) | ✅ Funciona | `/portal/dashboard` |
| Cartera recomendada vs actual | ✅ Funciona | `/portal/dashboard` |
| Bienvenida con onboarding steps | ✅ Funciona | `/portal/bienvenida` |
| Subir cartolas | ✅ Funciona | `/portal/subir-cartola` |
| Historial de cartolas (propias + asesor) | ✅ Funciona | `/portal/mis-cartolas` |
| Reportes del asesor | ✅ Funciona | `/portal/reportes` |
| Mensajes con el asesor | ✅ Funciona | `/portal/mensajes` |
| Completar cuestionario de riesgo | ✅ Funciona | Link HMAC |

### 1.11 Sistema Dual-Role
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Switch role (advisor ↔ client) | ✅ Funciona | `/api/auth/switch-role` |
| Botón "Ir a mi Portal Cliente" (asesor) | ✅ Funciona | AdvisorHeader |
| Botón "Vista Asesor" (cliente) | ✅ Funciona | PortalTopbar |
| Invitación a usuario existente | ✅ Funciona | No sobreescribe roles |
| Middleware routing por active_role | ✅ Funciona | middleware.ts |

### 1.12 Notificaciones y Cron Jobs
| Funcionalidad | Estado | Ruta |
|---|---|---|
| NotificationBell con polling 30s | ✅ Funciona | AdvisorHeader |
| Tipos: cartola, cuestionario, rebalanceo, reporte | ✅ Funciona | `advisor_notifications` |
| Cron reportes L-V 12pm | ✅ Funciona | `/api/cron/send-reports` |
| Cron check-drift L-V 1pm | ✅ Funciona | `/api/cron/check-drift` |
| Cron sync Fintual L-V 10am | ✅ Funciona | `/api/cron/sync-fintual` |
| Sync FI CMF diario 21:00 (local) | ✅ Funciona | Task Scheduler + `scripts/sync-fi-diario.bat` |

### 1.13 Otras Herramientas
| Funcionalidad | Estado | Ruta |
|---|---|---|
| Calculadora APV | ✅ Funciona | `/calculadora-apv` |
| Educación financiera | ✅ Funciona | `/educacion-financiera` |
| Generación de reportes PDF | ✅ Funciona | `@react-pdf/renderer` |
| Admin: gestión de asesores | ✅ Funciona | `/admin/advisors` |
| Admin: sincronización de datos | ✅ Funciona | `/admin/data-sync` |
| Vista general de clientes | ✅ Funciona | `/advisor/clients-overview` |

---

## 2. INTEGRACIONES EXTERNAS

| Servicio | Propósito | Estado |
|---|---|---|
| **Fintual API** | Catálogo de fondos mutuos chilenos + precios | ✅ Activo |
| **AAFM** | Precios diarios, rentabilidades, patrimonio | ✅ Activo |
| **CMF** | Fondos de inversión FIRES (152 fondos, precios diarios via scraping + 2captcha) | ✅ Activo |
| **Yahoo Finance** | Precios internacionales (acciones, ETFs) | ✅ Activo |
| **Alpha Vantage** | Fallback de precios cuando Yahoo no disponible | ✅ Activo |
| **Bolsa de Santiago** | Precios en tiempo real acciones chilenas | ✅ Activo |
| **Banco Central Chile** | Tipo de cambio (UF, USD/CLP) | ✅ Activo |
| **Google Calendar** | Sincronización de reuniones | ✅ Activo |
| **Resend** | Envío de emails (cuestionarios) | ✅ Activo |
| **OpenFIGI** | Identificadores de securities (ISIN/CUSIP) | ⚠️ Opcional |
| **Finnhub** | Datos de bonos | ⚠️ Opcional |
| **Supabase** | BD PostgreSQL + Auth + RLS | ✅ Core |

### Resolución de precios multi-fuente (cascada):
1. Fintual (fondos chilenos)
2. Bolsa de Santiago (acciones chilenas)
3. Yahoo Finance (internacional + .SN)
4. Alpha Vantage (fallback)
5. Manual prices (Excel/CSV upload)
6. Yahoo CUSIP search (auto-discovery)

---

## 3. ARQUITECTURA DE SEGURIDAD

| Aspecto | Implementación | Evaluación |
|---|---|---|
| Autenticación | Supabase Auth (email/password) | ✅ Sólido |
| Middleware de sesión | `updateSession` en middleware.ts | ✅ Correcto |
| Roles | admin / advisor / client con dual-role support | ✅ Funciona |
| Dual-role | `user_metadata.roles[]` + `active_role`, switch vía API | ✅ Implementado |
| RLS en Supabase | Habilitado en tablas sensibles | ✅ Bien |
| API auth helpers | `requireAuth()`, `requireAdvisor()`, `requireAdmin()`, `requireClient()` | ✅ Consistente |
| Rate limiting | Upstash Redis (prod) + in-memory fallback (dev), 68 endpoints | ✅ Robusto |
| Error tracking | Sentry client/server/edge, global-error.tsx | ✅ Activo |
| Tokens Google | RLS estricto por advisor_id | ✅ Seguro |
| Service role key | Solo en server-side para operaciones privilegiadas | ✅ Correcto |

---

## 4. LO QUE FUNCIONA BIEN

### Fortalezas Técnicas
1. **Stack moderno y coherente** — Next.js 16 + React 19 + TypeScript estricto. Buena elección tecnológica.
2. **Multi-source price resolution** — La cascada de 5 fuentes para precios es robusta y bien diseñada.
3. **Seguridad bien implementada** — Auth, RLS, rate limiting, separación de roles. Pasó auditoría de seguridad reciente.
4. **Tipado fuerte** — TypeScript con tipos de Supabase bien definidos.
5. **Separación de concerns** — API routes claros, componentes separados por dominio, lib/ bien organizada.
6. **Cálculos financieros sólidos** — TWR, scoring de riesgo multi-dimensional, clasificación de activos.

### Fortalezas de Producto
1. **Cuestionario de riesgo completo** — 7 pasos, multi-dimensional, genera benchmark automático.
2. **Parseo de cartolas inteligente** — Acepta PDF y Excel, clasifica automáticamente.
3. **Dashboard de mercado chileno** — Integración nativa con Fintual + AAFM, datos locales relevantes.
4. **Portfolio Designer versátil** — 5 modos cubren distintos flujos de trabajo del asesor.
5. **Comité de inversiones** — Workflow completo desde generación hasta aplicación a clientes.
6. **Google Calendar sync** — Reduce fricción para gestión de agenda.

---

## 5. ÁREAS DE MEJORA

### 5.1 Mejoras Técnicas Prioritarias

| Área | Problema | Impacto | Sugerencia |
|---|---|---|---|
| **Loading states** | No hay skeleton loaders consistentes | UX pobre en cargas | Implementar Suspense boundaries con skeletons |
| **Error handling UI** | Errores genéricos sin guía al usuario | Frustración | Error boundaries con mensajes accionables |
| **Offline/slow network** | Sin manejo de estado offline | Pérdida de datos | Optimistic updates + queue de acciones |
| **Caché de datos** | Sin SWR/React Query, fetch directo | Re-fetching innecesario | Implementar React Query o SWR |
| **Tests** | Vitest configurado pero cobertura desconocida | Riesgo de regresiones | Ampliar tests, especialmente en cálculos financieros |
| **Cron jobs** | Solo sync Fintual programado | Datos desactualizados | Agregar crons para AAFM, precios, exchange rates |
| **Mobile responsive** | No evaluado exhaustivamente | Asesores usan tablets | Auditar responsive en tablets y móviles |
| **Internacionalización** | Mezcla español/inglés en código | Inconsistencia | Definir idioma único para UI |
| ~~**Logging/monitoring**~~ | ✅ RESUELTO — Sentry client/server/edge | — | — |

### 5.2 Mejoras de Producto

| Área | Oportunidad | Valor |
|---|---|---|
| ~~**Notificaciones**~~ | ✅ RESUELTO — NotificationBell + triggers automáticos | — |
| ~~**Dashboard de rendimiento**~~ | ✅ RESUELTO — Vista consolidada `/advisor/clients-overview` | — |
| ~~**Reportes periódicos**~~ | ✅ RESUELTO — Cron L-V, email Resend, config por cliente | — |
| ~~**Alertas de rebalanceo**~~ | ✅ RESUELTO — Cron check-drift + tracking ejecuciones | — |
| **Historial de interacciones** | Seguimiento básico, sin notas enriquecidas | Medio — memoria institucional |
| **Onboarding flow** | Sin flujo guiado para nuevos asesores | Medio — adopción |
| **Multi-moneda** | Manejo parcial de USD/CLP/UF | Medio — clientes con inversiones mixtas |
| **Comparación temporal** | No compara rendimiento entre períodos fácilmente | Medio — análisis de tendencias |
| **Export masivo** | Sin export CSV/Excel de clientes/portafolios | Bajo — compliance y reportería |
| **Dark mode** | No implementado | Bajo — preferencia visual |

### 5.3 Deuda Técnica Identificada

1. **Archivos sin commitear en git** — Hay muchos archivos untracked (scripts de test, componentes nuevos, API routes, migraciones) que necesitan commit.
2. **Scripts sueltos** — Varios scripts de sync/test en `/scripts/` que podrían consolidarse.
3. **Google Fonts cargado externamente** — El `<link>` a Google Fonts en layout.tsx podría usar `next/font` para mejor performance.
4. ~~**Sin rate limiting global**~~ ✅ RESUELTO — Upstash Redis en 68 endpoints.
5. ~~**Sin CLAUDE.md**~~ ✅ RESUELTO — Memory system + CONTEXTO-CLAUDE-CHAT.md + MEJORAS.md proveen contexto completo.

---

## 6. EXPERIENCIA DEL CLIENTE (UX FLOW)

### 6.1 Journey del Asesor (usuario principal)

```
LOGIN → DASHBOARD ASESOR → [elegir acción]
  │
  ├── Gestión de clientes
  │     ├── Ver lista → Buscar/Filtrar → Ver detalle
  │     ├── Crear nuevo → Completar datos → Enviar cuestionario riesgo
  │     └── Editar → Actualizar info
  │
  ├── Análisis de portafolio
  │     ├── Subir cartola (PDF/Excel) → Parseo automático → Ver composición
  │     ├── Comparar vs benchmark → Ver gaps → Proponer ajustes
  │     └── Seguimiento temporal → Ver evolución → Calcular TWR
  │
  ├── Diseño de portafolio
  │     ├── Quick Build (plantilla rápida)
  │     ├── Modelo (crear/guardar modelo personalizado)
  │     ├── Análisis (comparar fondos)
  │     └── Directo (agregar acciones/bonos individuales)
  │
  ├── Investigación de fondos
  │     ├── Buscar por nombre/ticker
  │     ├── Comparar hasta 6 ETFs
  │     └── Analizar factsheet PDF
  │
  ├── Agenda
  │     ├── Ver calendario semanal
  │     ├── Crear reunión
  │     └── Sync con Google Calendar
  │
  └── Market Dashboard
        ├── Ver fondos mutuos chilenos
        ├── Filtrar por categoría/administradora
        └── [Admin] Sincronizar datos Fintual/AAFM
```

### 6.2 Journey del Cliente (usuario final)

```
RECIBE EMAIL INVITACIÓN → Configura contraseña (nuevo) o Login directo (existente)
  → LOGIN PORTAL (email/password, "¿Olvidaste tu contraseña?")
  → BIENVENIDA (onboarding steps contextuales)
  ├── Completar perfil de riesgo (7 pasos, detecta si ya completado)
  ├── Subir cartolas (PDF/Excel)
  ├── Ver dashboard (valor, evolución, composición, cartera recomendada)
  ├── Leer reportes del asesor
  ├── Mensajes con el asesor
  ├── Historial de cartolas (propias + asesor con badge)
  ├── Cambiar contraseña
  └── [Si dual-role] Cambiar a Vista Asesor
```

### 6.3 Puntos de Fricción Identificados

1. ~~**Sin portal de cliente**~~ ✅ RESUELTO — Portal completo
2. ~~**Sin notificaciones**~~ ✅ RESUELTO — NotificationBell + triggers automáticos
3. **Navegación densa** — Muchas herramientas pero sin guía de flujo de trabajo recomendado.
4. **Sin onboarding** — Un asesor nuevo no sabe por dónde empezar.
5. **Cartola manual** — El cliente o asesor debe subir la cartola manualmente, no hay conexión directa con bancos/corredoras.
6. ~~**Sin chat/mensajería**~~ ✅ RESUELTO — Sistema de mensajes integrado

---

## 7. BASE DE DATOS — ESQUEMA PRINCIPAL

### Tablas Core
- `advisors` — Perfil del asesor (rol, empresa, logo, jerarquía)
- `clients` — Datos del cliente (perfil riesgo, patrimonio, status)
- `risk_profiles` — Resultados del cuestionario (4 dimensiones + score global)
- `portfolio_snapshots` — Cartolas parseadas (holdings JSONB, valores, retornos)
- `portfolio_models` — Plantillas de portafolio guardadas

### Tablas de Fondos Mutuos
- `fintual_providers` — AGFs (administradoras)
- `fintual_funds` — Catálogo de fondos/series
- `fintual_prices` — Precios históricos diarios

### Tablas de Fondos de Inversión (CMF)
- `fondos_inversion` — Catálogo de 152 fondos FIRES (rut, nombre, administradora, tipo, series_detectadas, sync status)
- `fondos_inversion_precios` — Precios diarios por serie (valor_libro, valor_economico, patrimonio_neto, n_aportantes, rent_diaria)

### Tablas de Inversión Directa
- `direct_portfolios` — Portafolios de acciones/bonos
- `direct_portfolio_holdings` — Posiciones individuales
- `security_prices_cache` — Caché de precios

### Tablas de Precios y Seguimiento
- `manual_prices` — Precios subidos manualmente por el asesor (Excel/CSV)
- `security_yahoo_map` — Mapeo CUSIP/ISIN → Yahoo ticker para fondos internacionales
- `portfolio_dividends` — Registro de dividendos recibidos por cliente

### Tablas de Reportes y Notificaciones
- `client_report_config` — Configuración de reportes por cliente
- `client_reports` — Reportes generados/enviados
- `advisor_notifications` — Notificaciones in-app del asesor
- `recommendation_versions` — Historial de recomendaciones

### Tablas de Ejecución y Seguimiento
- `rebalance_executions` — Operaciones buy/sell ejecutadas post-recomendación
- `fondos_rentabilidades_agregadas` — Rentabilidades históricas AAFM

### Tablas de Soporte
- `advisor_google_tokens` — OAuth tokens (RLS estricto)
- `advisor_meetings` — Reuniones
- `client_contracts` — Contratos de prestación de servicios
- `audit_logs` — Registro de auditoría

---

## 8. MÉTRICAS CLAVE DE LA PLATAFORMA

| Métrica | Valor |
|---|---|
| Rutas de página | ~20 |
| API endpoints | ~70+ |
| Componentes React | ~55+ |
| Tablas en BD | ~27 |
| Integraciones externas | 11 |
| Dependencias (prod) | 15+ |
| Dependencias (dev) | 12 |
| Líneas de código estimadas | ~20,000-25,000 |

---

## 9. RESUMEN EJECUTIVO

**Greybark Advisors** es una plataforma de asesoría financiera robusta y bien construida, enfocada en el mercado chileno con capacidad internacional. Cubre el ciclo completo: captación de clientes → evaluación de riesgo → análisis de portafolio → diseño de cartera → seguimiento.

### Lo mejor:
- Integración profunda con el ecosistema financiero chileno (Fintual, AAFM, Bolsa de Santiago, Banco Central)
- Resolución de precios multi-fuente con fallback inteligente
- Cuestionario de riesgo multi-dimensional sofisticado
- Seguridad bien implementada (auth, RLS, rate limiting)
- Stack técnico moderno y mantenible

### Lo que más impacto tendría mejorar:
1. ~~**Portal de cliente**~~ ✅ RESUELTO — Portal completo con dashboard, reportes, cartolas, mensajes, dual-role
2. ~~**Notificaciones automáticas**~~ ✅ RESUELTO — Alertas de rebalanceo, reportes periódicos, cuestionario completado
3. ~~**Reportes automáticos**~~ ✅ RESUELTO — Cron L-V, email con Resend, configuración por cliente
4. **Mejor UX de carga** — Skeleton loaders, optimistic updates, caché con SWR/React Query
5. ~~**Monitoring en producción**~~ ✅ RESUELTO — Sentry + Upstash Redis rate limiting
6. **Onboarding de asesor** — Flujo guiado para primer uso de la plataforma
7. **Firma electrónica** — Integración con servicio de firma para contratos

---

*Este documento fue generado como auditoría completa de la plataforma Greybark Advisors para su revisión y planificación estratégica.*
