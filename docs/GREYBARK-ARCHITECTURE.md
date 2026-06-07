# Greybark Advisors — Arquitectura de Plataforma

> Documento tecnico para evaluacion de plataforma. Actualizado: Junio 2026.

---

## 1. Vision General

**Greybark Advisors** es una plataforma SaaS de asesoria financiera para asesores independientes en Chile. Permite gestionar clientes, perfilar riesgo, analizar carteras (fondos mutuos, fondos de inversion, ETFs, acciones, bonos), generar recomendaciones con IA, y producir reportes periodicos automaticos.

**Modelo**: No transaccional — el asesor recomienda, el cliente ejecuta en su propia corredora/custodio.

**Estado**: En produccion, con clientes reales, datos reales, y flujos automatizados funcionando diariamente.

---

## 2. Stack Tecnologico

| Capa | Tecnologia | Version |
|------|-----------|---------|
| **Frontend** | Next.js (App Router) + React | 16.1.6 / 19.2 |
| **Estilos** | Tailwind CSS | v4 |
| **Base de datos** | Supabase (Postgres + Auth + RLS) | — |
| **Hosting** | Vercel (Edge Functions) | Region: iad1 |
| **IA** | Anthropic Claude (Sonnet 4 / Opus 4) + Google Gemini 2.5 Flash | — |
| **Email** | Resend | — |
| **Calendario** | Google Calendar API (OAuth por asesor) | — |
| **Rate Limiting** | Upstash Redis | — |
| **Error Tracking** | Sentry | — |
| **Testing** | Vitest | 4.0 |
| **PDF** | @react-pdf/renderer + unpdf | — |
| **Excel** | xlsx | — |

---

## 3. Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL                                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  App Router   │  │  149 API     │  │  4 Cron Jobs      │  │
│  │  46 paginas   │  │  Routes      │  │  (Fintual, CMF,   │  │
│  │  80 components│  │              │  │   Reports, Drift) │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                 │                    │             │
│         └────────────┬────┴────────────────────┘             │
│                      │                                       │
│              ┌───────▼────────┐                              │
│              │  Middleware     │  Auth + Role routing         │
│              │  (proxy.ts)    │  Advisor vs Client portal    │
│              └───────┬────────┘                              │
└──────────────────────┼──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────────┐
        │              │                  │
   ┌────▼────┐   ┌─────▼─────┐   ┌──────▼──────┐
   │Supabase │   │ Claude /  │   │  Fuentes    │
   │Postgres │   │ Gemini AI │   │  de Precios │
   │+ Auth   │   └───────────┘   │  (CMF,      │
   │+ RLS    │                   │   Fintual,  │
   │+ Storage│                   │   Yahoo,    │
   └─────────┘                   │   AAFM,     │
                                 │   BCCH)     │
                                 └─────────────┘
```

---

## 4. Roles y Rutas

La plataforma tiene dos arboles de rutas separados, protegidos por middleware:

### Asesor (`/advisor/*`, `/clients/*`, `/fund-center`, etc.)
- Dashboard con metricas, calendario, notificaciones
- Gestion completa de clientes (crear, editar, compartir)
- Perfilamiento de riesgo con cuestionario configurable
- Diseno de portafolios y modelos de cartera
- Seguimiento de portafolios con series de precios
- Centro de fondos (buscar, comparar, explorar)
- Sincronizacion de fichas CMF con extraccion Gemini AI
- Generacion de reportes y cartas a corredores con Claude AI
- Comite de inversiones (macro, RV, RF)

### Cliente Portal (`/portal/*`)
- Dashboard personal con resumen de cartera
- Subida de cartolas
- Mensajeria directa con asesor (realtime)
- Visualizacion de reportes
- Cuestionario de riesgo

### Admin
- Gestion de asesores (jerarquia padre/subordinado)
- Carga de datos NAV historicos
- Sincronizacion de datos
- Revision de fichas extraidas

---

## 5. Funcionalidades Principales

### 5.1 Gestion de Clientes
- CRUD completo con soft-delete
- Compartir clientes entre asesores (editor/viewer)
- Jerarquia de asesores (admin ve subordinados)
- Contratos digitales (upload PDF)
- Historial de interacciones (llamadas, reuniones, emails)
- Portal cliente con acceso independiente

### 5.2 Perfilamiento de Riesgo
- Cuestionario de 15+ preguntas con scoring automatico
- Frecuencia configurable por cliente (90d / 180d / 1 ano / 2 anos)
- Alerta automatica cuando cuestionario esta vencido
- Benchmark de portafolio por perfil (conservador → agresivo)
- Calculadora APV/retiro

### 5.3 Portafolio y Seguimiento
- Snapshots de cartera (statement, manual, Excel, API prices)
- Retornos simples: < 365 dias = simple, >= 365 dias = anualizado
- Calculo atomico via funcion Postgres (sin race conditions)
- Snapshot baseline (portafolio inicial para comparacion)
- Evolucion temporal con graficos
- Radiografia de cartola (desglose por clase de activo)
- Atribucion de rendimiento por holding
- Comparacion actual vs recomendado
- Dividendos manuales
- Drift check automatico (cron diario 13:00)

### 5.4 Recomendaciones y Rebalanceo
- Cartera recomendada por cliente (JSONB versionado)
- Historial de versiones de recomendaciones
- Tracking de ejecucion de rebalanceos (buy/sell/hold)
- Comite de inversiones: carga informes macro/RV/RF
- Generacion de cartera via Claude AI usando informes del comite
- Fondos preferidos por asesor con 3 modos de seleccion

### 5.5 Centro de Fondos
- Busqueda unificada: fondos mutuos + FI + ETFs + acciones
- Comparador lado a lado
- Perfil completo de fondo (TAC, rentabilidades, riesgo, objetivo)
- Fichas PDF de CMF con extraccion automatica via Gemini AI
- 2,500+ fichas extraidas con datos: TAC, beneficio tributario, horizonte, tolerancia, objetivo
- Sync manual por AGF/administradora desde la plataforma

### 5.6 Fuentes de Precios (5 fuentes)

| Fuente | Cobertura | Frecuencia | Metodo |
|--------|-----------|------------|--------|
| **CMF** | Fondos mutuos + FI chilenos | Diario 21:00 (cron) | Web scraping |
| **Fintual API** | Fondos Fintual | Diario 10:00 (cron) | REST API publica |
| **Yahoo Finance** | ETFs, acciones internacionales | On-demand | Raw v8 API |
| **AAFM** | Rentabilidades fondos | Manual (localhost) | Scraping + 2Captcha |
| **Manual** | Bonos, fondos sin auto-sync | Manual por asesor | CSV upload |

Fuentes adicionales de datos:
- **Banco Central Chile (BCCH)**: Tipos de cambio (USD, EUR, UF)
- **Bolsa de Santiago**: Datos de acciones chilenas
- **Finnhub**: Datos de bonos internacionales
- **OpenFIGI**: Identificadores de valores (CUSIP/ISIN)

### 5.7 Reportes y Distribucion
- Configuracion por cliente: frecuencia (diario/semanal/mensual)
- Tipos: portafolio, macro, RV, RF, asset allocation
- Distribucion automatica via cron (12:00 weekdays)
- Informes diarios con contenido HTML + podcast URL
- Generacion PDF (comparacion de portafolios, cartera comite)
- Carta a corredor: email formal generado por Claude AI

### 5.8 Inteligencia Artificial

**Claude (Anthropic)**:
- Modelo configurable por asesor (Sonnet 4 default, Opus 4 premium)
- Generacion de carteras recomendadas desde informes de comite
- Carta formal a corredor (email draft)
- Analisis de fondos
- Comentarios de portafolio
- Tracking de tokens/costo por asesor por mes (tabla advisor_ai_usage)

**Gemini 2.5 Flash (Google)**:
- Extraccion de datos de fichas PDF de CMF
- 12/12 campos extraidos (vs ~65% con regex)
- Detecta beneficio tributario visual (checkmarks en PDF)
- Costo: ~$1-3 USD para 3,500 fichas

### 5.9 Mensajeria y Notificaciones
- Chat asesor-cliente (realtime via Supabase)
- Notificaciones in-app (cartola subida, cuestionario completado, reporte listo, alerta drift)
- Notificaciones Telegram para fallos de sincronizacion
- Email transaccional via Resend (cuestionarios, reportes)

### 5.10 Calendario
- Integracion Google Calendar (OAuth por asesor)
- Vista semanal en dashboard
- Creacion de reuniones

---

## 6. Base de Datos

### 6.1 Tablas Principales (25+)

**Usuarios y acceso:**
- `advisors` — Perfiles de asesores (jerarquia, modelo AI, drift threshold)
- `clients` — Clientes (asesor, auth, contrato, frecuencia cuestionario, modo fondos)
- `client_advisors` — Compartir clientes entre asesores (editor/viewer)

**Portafolio:**
- `portfolio_snapshots` — Snapshots historicos con retornos (DECIMAL 12,4)
- `portfolio_dividends` — Dividendos registrados
- `direct_portfolios` / `direct_portfolio_holdings` — Carteras directas (acciones/bonos)
- `recommendation_versions` — Versiones de cartera recomendada
- `rebalance_executions` — Ejecuciones de rebalanceo

**Fondos:**
- `fondos_mutuos` — Catalogo fondos mutuos (fuente CMF)
- `fondos_inversion` / `fondos_inversion_precios` — FI con precios por serie
- `fintual_providers` / `fintual_funds` / `fintual_prices` — Ecosistema Fintual
- `fund_cuota_history` — Precios historicos de cuotas
- `fund_fichas` / `fi_fichas` — Fichas extraidas (TAC, beneficios, objetivo)
- `fondos_rentabilidades_diarias` / `fondos_rentabilidades_agregadas` — Rentabilidades

**Reportes:**
- `client_report_config` — Configuracion de reportes por cliente
- `client_reports` — Reportes generados y enviados
- `daily_reports` — Informes diarios (HTML + podcast)

**Comunicacion:**
- `messages` — Mensajeria asesor-cliente (realtime)
- `advisor_notifications` — Notificaciones (realtime)

**Tracking:**
- `advisor_ai_usage` — Tokens/costo AI por mes
- `advisor_preferred_funds` — Lista de fondos preferidos
- `audit_logs` — Auditoria de acciones
- `tac_upload_log` — Registro de cargas TAC

**Precios:**
- `security_prices_cache` — Cache de precios actuales
- `security_yahoo_map` — Mapeo CUSIP/ISIN → Yahoo Finance
- `manual_prices` — Precios cargados manualmente
- `international_prices` — Precios internacionales (ticker+price_date, AV/Yahoo)
- `dividend_history` — Historial de dividendos

**Cierres y configuracion:**
- `client_monthly_closings` — Cierres mensuales por cliente
- `clients.display_currency` — Moneda de visualizacion por cliente
- `clients.servicios_adicionales` — Servicios adicionales contratados (JSONB)

### 6.2 Vistas
- `vw_fondos_completo` — Fondos mutuos consolidados con metadata
- `vw_fintual_funds_latest` — Fondos Fintual con precio actual

### 6.3 Funciones RPC (8)
- `get_accessible_advisor_ids()` — IDs propios + subordinados
- `get_accessible_client_ids()` — Clientes propios + subordinados + compartidos + huerfanos
- `calculate_snapshot_returns()` — Calculo atomico de retornos
- `search_fintual_funds()` — Busqueda full-text de fondos Fintual
- `increment_ai_usage()` — Upsert atomico de uso AI
- `get_fichas_sync_status()` — Estado de sync fichas FM
- `get_fi_fichas_sync_status()` — Estado de sync fichas FI
- `update_updated_at_column()` — Trigger de updated_at

### 6.4 Seguridad (RLS)
- **25 tablas** con Row-Level Security habilitado
- Patron: API routes usan `requireAuth()` → `createAdminClient()` (service role bypass)
- Acceso directo desde browser bloqueado por RLS
- Funciones helper (`get_accessible_advisor_ids`, `get_accessible_client_ids`) centralizan logica de autorizacion
- Jerarquia: asesor ve lo propio + subordinados + compartidos
- Portal cliente: acceso solo a datos propios via `auth_user_id`

---

## 7. Integraciones Externas (16 servicios)

| Servicio | Proposito | Autenticacion |
|----------|-----------|---------------|
| Supabase | BD + Auth + RLS + Storage + Realtime | Service Role Key |
| Anthropic Claude | IA (carteras, emails, analisis) | API Key |
| Google Gemini | Extraccion PDF fichas | API Key |
| Resend | Email transaccional | API Key |
| Google Calendar | Agenda del asesor | OAuth 2.0 por asesor |
| Upstash Redis | Rate limiting | REST Token |
| CMF Chile | Precios fondos mutuos + FI | Web scraping |
| Fintual | Precios fondos Fintual | API publica |
| Yahoo Finance | Precios ETFs/acciones internacionales | npm package |
| AAFM | Rentabilidades fondos | Scraping (localhost) |
| Banco Central Chile | Tipos de cambio | API credenciales |
| Bolsa de Santiago | Acciones chilenas | API Token |
| Finnhub | Datos de bonos | API Key |
| OpenFIGI | Identificadores de valores | API |
| Sentry | Error tracking | DSN |
| 2Captcha | Resolver CAPTCHAs CMF/AAFM | API Key |

---

## 8. Cron Jobs (Automatizacion Diaria)

| Horario | Ruta | Funcion |
|---------|------|---------|
| 10:00 L-V | `/api/cron/sync-fintual` | Sincronizar precios Fintual |
| 12:00 L-V | `/api/cron/send-reports` | Generar y distribuir reportes |
| 13:00 L-V | `/api/cron/check-drift` | Verificar drift de portafolios |
| 21:00 L-V | `/api/cmf/auto-sync` | Sincronizar precios CMF (FM + FI) |

---

## 9. Seguridad

- **Headers HTTP**: HSTS, X-Content-Type-Options, X-Frame-Options (DENY), CSP, Permissions-Policy
- **RLS en 25 tablas**: Ninguna tabla sensible accesible sin autorizacion
- **Rate limiting**: Todos los endpoints protegidos (Upstash Redis con fallback in-memory)
- **Auth**: Supabase Auth con middleware de roles (advisor/client/admin)
- **ErrorBoundary**: React error boundaries en layout del asesor previenen crashes de pagina completa
- **Circuit breaker**: EODHD API limitado a 18 calls/dia con fallback automatico a Yahoo
- **Price fallback logging**: Cadenas de fallback (AV→Yahoo, EODHD→Yahoo, Bolsa→Yahoo) logean warnings cuando fuente primaria falla
- **Service Role**: Solo usado despues de verificacion de auth en API routes
- **Sanitizacion**: Input sanitization en rutas criticas
- **Audit**: Logs de acciones administrativas

---

## 10. Metricas del Codebase

| Metrica | Valor |
|---------|-------|
| API Routes | 149 endpoints |
| Paginas | 46 |
| Componentes React | 80 |
| Modulos lib/ | 40+ |
| Migraciones SQL | 53 |
| Tablas con RLS | 25 |
| Funciones RPC | 8 |
| Cron jobs | 4 |
| Integraciones externas | 16 |
| Tests | Vitest (unit + integration) |
| Fichas extraidas | 2,500+ (Gemini AI + regex fallback) |

---

## 11. Costos Operativos Estimados

| Servicio | Plan | Costo Mensual |
|----------|------|---------------|
| Vercel | Pro | ~$20 USD |
| Supabase | Pro | ~$25 USD |
| Anthropic Claude | Pay per use | ~$5-15 USD (segun uso AI) |
| Google Gemini | Pay per use | ~$1-3 USD (fichas) |
| Resend | Free/Starter | $0-20 USD |
| Upstash Redis | Free tier | $0 |
| Sentry | Free tier | $0 |
| 2Captcha | Pay per use | ~$1 USD |
| **Total estimado** | | **~$50-85 USD/mes** |

---

## 12. Roadmap y Oportunidades

### Completado recientemente (Abril-Junio 2026)
- Extraccion de fichas con Gemini AI (12/12 campos, beneficio tributario)
- Tracking de uso AI por asesor
- Fondos preferidos con 3 modos de seleccion
- Compartir clientes entre asesores
- Frecuencia de cuestionario configurable
- RLS completo en todas las tablas sensibles
- Fondos de inversion (FIRES/FINRE) con precios y fichas
- Migracion completa de rutas advisor a route group `(advisor-shell)` con sidebar persistente
- Portal cliente v2 (seguimiento, radiografia, servicios)
- Cierres mensuales por cliente
- Moneda de visualizacion configurable por cliente
- Servicios adicionales por cliente
- Duracion y accrued interest de bonos
- Landing page y login rediseñados

### Oportunidades de expansion
- **Multi-tenant**: Soporte para multiples firmas de asesoria
- **Pagos**: Cobro a clientes por asesoria (Khipu, Flow, Transbank)
- **App movil**: Portal cliente nativo (React Native)
- **Compliance**: Reportes regulatorios automaticos
- **Integracion corredoras**: Conexion directa para ejecucion de ordenes
- **White-label**: Marca personalizada por firma
- **Mercados adicionales**: Expansion a Peru, Colombia, Mexico

---

*Documento generado para evaluacion de plataforma. Greybark Advisors © 2026.*
