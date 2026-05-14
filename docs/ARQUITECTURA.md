# Arquitectura de la Plataforma de Asesoría Financiera

## Estructura General

```
┌──────────┬──────────────────────────────────────────────────────────┐
│ SIDEBAR  │                     CONTENIDO                            │
│ (fijo)   │                                                          │
│          │  Todas las rutas del asesor comparten el sidebar         │
│ GLOBAL   │  via el route group app/(advisor-shell)/layout.tsx       │
│          │                                                          │
│ Principal│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│ Dashboard│  │Dashboard│ │Clientes │ │Cartola &│ │Portfolio│       │
│ Clientes │  │/advisor │ │/clients │ │ Riesgo  │ │Designer │       │
│ Vista Grl│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│ Cartola  │                                                          │
│ Designer │  Herramientas                                            │
│          │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│Herramient│  │Centro de│ │  Mis    │ │ Fichas  │ │Calculad.│       │
│ Fondos   │  │ Fondos  │ │ Fondos  │ │  CMF    │ │  APV    │       │
│ Mis Fond.│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│ Fichas   │  ┌─────────┐                                            │
│ Calc APV │  │Educacion│                                            │
│ Educacion│  │Financ.  │                                            │
│          │  └─────────┘                                                          │
│          │                                                          │
│ 🔔 Notif │                                                          │
│ 👤 Perfil│                                                          │
│ ◀ Colapsr│                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

---

## Herramientas Consolidadas

### 1. Portfolio Designer (`/portfolio-designer`)

Herramienta unificada para diseñar, comparar y optimizar carteras de inversión.

```
┌─────────────────────────────────────────────────────────────────┐
│                      PORTFOLIO DESIGNER                         │
├─────────────┬─────────────┬─────────────┬─────────────┐        │
│ Comparación │   Modelo    │ Quick Build │  Análisis   │        │
│   (Tab 1)   │  (Tab 2)    │   (Tab 3)   │   (Tab 4)   │        │
└─────────────┴─────────────┴─────────────┴─────────────┘        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    CONTENIDO DEL TAB                     │   │
│  │                                                          │   │
│  │  • Comparación: Cartera actual vs ideal                 │   │
│  │  • Modelo: Crear modelo vinculado a cliente             │   │
│  │  • Quick Build: Plantillas predefinidas                 │   │
│  │  • Análisis: Comparar rendimiento de fondos             │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Estructura de archivos:**
```
app/(advisor-shell)/portfolio-designer/
├── page.tsx                      # Página principal con tabs
└── components/
    ├── ComparisonMode.tsx        # Modo comparación (ex /portfolio-comparison)
    ├── ModelMode.tsx             # Modo modelo (ex /modelo-cartera)
    ├── QuickMode.tsx             # Modo quick build (ex /portfolio-builder)
    └── AnalysisMode.tsx          # Modo análisis (nuevo)
```

**Redirects:**
```
/portfolio-comparison  →  /portfolio-designer?mode=comparison
/modelo-cartera        →  /portfolio-designer?mode=model
/portfolio-builder     →  /portfolio-designer?mode=quick
```

---

### 2. Centro de Fondos (`/fund-center`)

Herramienta unificada para buscar, comparar y analizar fondos de inversión.

```
┌─────────────────────────────────────────────────────────────────┐
│                       CENTRO DE FONDOS                          │
├─────────────────┬─────────────────┬─────────────────┐          │
│    Búsqueda     │   Comparador    │    Análisis     │          │
│     (Tab 1)     │     (Tab 2)     │     (Tab 3)     │          │
└─────────────────┴─────────────────┴─────────────────┘          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    CONTENIDO DEL TAB                     │   │
│  │                                                          │   │
│  │  • Búsqueda: Buscar fondos por ticker                   │   │
│  │  • Comparador: Comparar hasta 6 ETFs                    │   │
│  │  • Análisis: Analizar PDFs de factsheets                │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Estructura de archivos:**
```
app/(advisor-shell)/fund-center/
├── page.tsx                      # Página principal con tabs
└── components/
    ├── SearchMode.tsx            # Modo búsqueda (ex /fondos-internacionales)
    ├── CompareMode.tsx           # Modo comparador (ex /comparador-etf)
    └── AnalyzeMode.tsx           # Modo análisis (ex /analisis-fondos)
```

**Redirects:**
```
/fondos-internacionales  →  /fund-center?mode=search
/comparador-etf          →  /fund-center?mode=compare
/analisis-fondos         →  /fund-center?mode=analyze
```

---

### 3. Cuestionario de Riesgo (`/client/risk-profile`)

URL canónica para el cuestionario de perfil de riesgo.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUESTIONARIO DE RIESGO                       │
│                     /client/risk-profile                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   RiskProfileWizard                      │   │
│  │                                                          │   │
│  │  Pasos:                                                  │   │
│  │  1. Capacidad de riesgo                                 │   │
│  │  2. Tolerancia al riesgo                                │   │
│  │  3. Percepción actual                                   │   │
│  │  4. Comportamiento                                      │   │
│  │  5. Validación final                                    │   │
│  │  6. Objetivo                                            │   │
│  │  7. Planificación retiro (condicional)                  │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Redirects:**
```
/risk-profile         →  /client/risk-profile
/mi-perfil-inversor   →  /client/risk-profile
```

---

## Mapa de Rutas

### Rutas Principales (Navegación)

| Ruta | Descripción | Componente |
|------|-------------|------------|
| `/advisor` | Dashboard del asesor | AdvisorDashboardSimple |
| `/clients` | Gestión de clientes | ClientsManager |
| `/clients/[id]` | Detalle de cliente | ClientDetail |
| `/clients/[id]/seguimiento` | Seguimiento de cartolas y retornos | SeguimientoPage |
| `/analisis-cartola` | Análisis de cartola y riesgo | AnalizadorCartola |
| `/portfolio-designer` | Diseñador de portfolios | PortfolioDesignerPage |

### Herramientas (Sidebar)

| Ruta | Descripción | Componente |
|------|-------------|------------|
| `/market-dashboard` | Dashboard de mercado | MarketDashboard |
| `/fund-center` | Centro de fondos | FundCenterPage |
| `/calculadora-apv` | Calculadora APV | CalculadoraAPV |
| `/educacion-financiera` | Educación financiera | EducacionFinanciera |

### Rutas de Admin/Asesor Avanzado

| Ruta | Descripción | Componente |
|------|-------------|------------|
| `/advisor/fichas-review` | Revision de fichas CMF extraidas (FM + FI) | FichasReviewPage |
| `/advisor/fondos` | Fondos preferidos del asesor | FondosPreferidosPage |

### Rutas de Cliente (Portal)

| Ruta | Descripción | Componente |
|------|-------------|------------|
| `/portal/dashboard` | Dashboard del cliente | ClientDashboard |
| `/portal/messages` | Mensajeria con el asesor | ClientMessages |
| `/portal/risk-profile` | Ver perfil de riesgo | ClientRiskProfile |
| `/client/risk-profile` | Cuestionario de riesgo (link externo) | RiskProfileWizard |
| `/login` | Login | LoginPage |

### Redirects Activos

| Ruta Original | Redirige A |
|---------------|------------|
| `/portfolio-comparison` | `/portfolio-designer?mode=comparison` |
| `/modelo-cartera` | `/portfolio-designer?mode=model` |
| `/portfolio-builder` | `/portfolio-designer?mode=quick` |
| `/fondos-internacionales` | `/fund-center?mode=search` |
| `/comparador-etf` | `/fund-center?mode=compare` |
| `/analisis-fondos` | `/fund-center?mode=analyze` |
| `/risk-profile` | `/client/risk-profile` |
| `/mi-perfil-inversor` | `/client/risk-profile` |

---

## APIs

### APIs de Clientes
```
/api/clients                    GET, POST
/api/clients/[id]               GET, PUT, DELETE
/api/clients/[id]/interactions  GET, POST
/api/clients/stats              GET
/api/client/[email]             GET
```

### APIs de Fondos
```
/api/funds/search               GET - Buscar fondos
/api/funds/search-alpha         GET - Buscar via Alpha Vantage
/api/funds/etf-profile          GET - Perfil de ETF
/api/funds/full-profile         GET - Perfil completo
/api/etf/[ticker]               GET - Datos de ETF por ticker
/api/fondos                     GET - Lista de fondos
```

### APIs de Asesor
```
/api/advisor/profile            GET, PUT
/api/advisor/meetings           GET, POST
/api/advisor/stats              GET
/api/advisor/preferred-funds    GET, POST, PATCH, DELETE - Fondos preferidos (enriched con fichas FM+FI)
```

### APIs de Fichas CMF
```
/api/fondos/sync-fichas              GET (status), POST (sync por AGF) - Fichas FM via Gemini AI
/api/fondos-inversion/sync-fichas    GET (status), POST (sync por admin) - Fichas FI via Gemini AI
/api/admin/fichas-upload             POST - Upload manual de ficha PDF
/api/admin/fichas-review             GET - Review de todas las fichas (FM + FI)
```

### APIs de Riesgo y Portfolio
```
/api/save-risk-profile          POST - Guardar perfil de riesgo
/api/portfolio-comparison       GET - Comparación de portfolio
/api/parse-portfolio-statement  POST - Parsear cartola PDF
/api/parse-portfolio-excel      POST - Parsear cartola Excel
```

### APIs de Seguimiento (Cartolas & Snapshots)
```
/api/portfolio/snapshots             GET, POST - CRUD de snapshots
/api/portfolio/snapshots/[id]        GET, PUT, PATCH, DELETE - Snapshot individual
/api/portfolio/fill-prices           POST - Llenar precios intermedios entre cartolas
/api/portfolio/fill-prices/coverage  GET - Cobertura de precios por holding
/api/portfolio/current-prices        POST - Precios actuales para holdings (con detección USD→CLP)
/api/portfolio/historical-prices     POST - Serie histórica valor portafolio (cuotas × precios, con normalización USD→CLP)
/api/portfolio/manual-prices         GET, POST - Precios manuales del asesor
/api/clients/[id]/seguimiento       GET - Datos consolidados de seguimiento + métricas
/api/clients/[id]/snapshots         DELETE - Eliminar todos los snapshots
/api/clients/[id]/cartolas          GET, POST - Gestión de cartolas
/api/portfolio/xray                  POST - Radiografía del portafolio (costos, TAC, alternativas, propuesta)
/api/portfolio/xray-report           POST - Informe AI de radiografía (Claude, con propuesta merged y contexto del asesor)
/api/fondos/match-holdings           POST - Match automático de holdings a fondos mutuos/acciones
/api/fondos/search-price             GET  - Búsqueda de fondos por nombre o RUN (incluye TAC, rent_1m/3m/12m de vw_fondos_completo)
/api/fondos/lookup                   GET  - Búsqueda de fondos por nombre o RUN
/api/fondos-inversion/lookup         GET  - Búsqueda de fondos de inversión por nombre o RUT
/api/fondos-inversion/fetch-prices   POST - Scrape CMF precios de FI via 2captcha (rut, desde?, hasta?)
/api/clients/[id]/share              GET, POST, DELETE - Compartir cliente con otros asesores
/api/advisors                        GET  - Lista asesores del equipo
```

### Estrategia de Matching de Holdings

Al subir una cartola, el sistema intenta identificar cada holding automáticamente:

1. **Universo de búsqueda**: Si la cartola es de una AGF (ej: Security), todos los holdings se buscan dentro de los fondos de esa AGF, salvo que el nombre mencione explícitamente otra AGF
2. **Precio es prueba definitiva**: Se compara el `valor_cuota` del holding con el precio en DB a la fecha de la cartola (tolerancia 0.5%). Si el precio coincide → match confirmado (high confidence)
3. **Si precio no coincide**: El holding se marca visualmente como "No encontrado" (fondo amarillo + badge). Se abre automáticamente el diálogo de búsqueda por RUN para el primer holding sin match, y al resolverlo avanza al siguiente
4. **Búsqueda por RUN**: El diálogo de búsqueda incluye un input de texto donde el asesor puede escribir el RUN del fondo (ej: "8000") o buscar por nombre. El endpoint `search-price` detecta queries numéricas y hace match exacto contra `fo_run`/`run` en las tablas `fondos_mutuos` y `fintual_funds`
5. **Clasificación desde DB**: El tipo de fondo (RV/RF/Balanceado) viene de `familia_estudios` en `vw_fondos_completo`, no se infiere del nombre
6. **Nombre como confirmación**: El nombre se usa solo para desempatar entre múltiples matches por precio, no como criterio principal

La vista `vw_fondos_completo` contiene `familia_estudios` con valores CMF: "Accionario internacional", "Deuda < 365 dias", "Balanceado moderado", etc.

### APIs de Precios y Datos de Mercado
```
/api/cron/sync-fintual          GET - Sync diario catálogo y precios Fintual (10:00 L-V)
/api/cron/send-reports          GET - Envío automático reportes clientes (12:00 L-V)
/api/cron/check-drift           GET - Alertas drift vs recomendación (13:00 L-V)
/api/cmf/auto-sync              GET - Sync CMF fondos mutuos/inversión (21:00 L-V)
/api/aafm/sync                  POST - Sync AAFM (solo localhost, Vercel bloqueado)
```

Pipeline de precios (prioridad):
1. CMF fondos_rentabilidades_diarias — fuente más confiable para fondos mutuos (2500+)
2. CMF fondos_inversion_precios — fondos de inversión, scrapeados via 2captcha (on-demand desde radiografía o cron)
3. Fintual API — fondos mutuos con API abierta
4. Yahoo Finance — acciones, ETFs internacionales
5. Bolsa de Santiago — acciones chilenas
6. Manual prices — precios cargados por el asesor
7. Snapshot fallback — último precio conocido del portafolio

Auto-fill: Al abrir seguimiento, si los precios tienen >24h se ejecuta fill-prices automáticamente.

Calculo de Retornos (Simple Returns):
- **< 365 dias**: Retorno simple `(valor_final / valor_inicial) - 1` — nunca se anualiza
- **>= 365 dias**: Retorno anualizado `((valor_final / valor_inicial) ^ (365/dias)) - 1`
- **Implementacion**: `lib/returns/calculator.ts` con funciones puras
- **TWR eliminado**: Se removio TWR/Sharpe por complejidad y margen de error. Retornos simples son mas comparables.

### APIs Auxiliares
```
/api/market-stats               GET - Estadísticas de mercado
/api/exchange-rates             GET - Tipos de cambio
/api/tac                        GET - TAC de fondos
/api/generate-pdf               POST - Generar PDF
/api/send-questionnaire         POST - Enviar cuestionario
```

---

## Estructura de Componentes

```
components/
├── advisor/
│   └── AdvisorDashboardSimple.tsx
├── analisis/
│   ├── AnalizadorFondos.tsx
│   └── MOCK_FUND_DATA.ts
├── apv/
│   └── CalculadoraAPV.tsx
├── clients/
│   ├── ClientDetail.tsx
│   └── ClientsManager.tsx
├── comite/
│   ├── CarteraRecomendada.tsx
│   └── ComiteReportsPanel.tsx
├── dashboard/
│   ├── NewMeetingForm.tsx
│   └── StatsCards.tsx
├── educacion/
│   └── EducacionFinanciera.tsx
├── pdf/
│   └── CarteraComitePDF.tsx
├── portfolio/
│   ├── CommentaryPanel.tsx
│   ├── FundSelector.tsx
│   ├── PortfolioEvolution.tsx
│   ├── ProposedFundFormV2.tsx
│   └── SavedModels.tsx
├── seguimiento/
│   ├── SeguimientoPage.tsx       # Página principal de seguimiento (auto-fill precios)
│   ├── AddSnapshotModal.tsx      # Modal para agregar cartola (PDF/Excel/manual)
│   ├── ReviewSnapshotModal.tsx   # Revisión y validación de holdings
│   ├── SnapshotsTable.tsx        # Tabla de snapshots con métricas
│   ├── EvolucionChart.tsx        # Gráfico evolución del portafolio
│   ├── PerformanceAttribution.tsx # Atribución de rendimiento
│   ├── HoldingReturnsPanel.tsx   # Rentabilidad por activo (peso, P.Compra, P.Actual, TAC, contribución)
│   ├── RadiografiaCartola.tsx    # Radiografía: costos TAC, alternativas baratas, ahorro potencial
│   ├── BaselineComparison.tsx    # Comparación vs baseline
│   ├── ComparacionBar.tsx        # Actual vs recomendado
│   └── RecommendationHistory.tsx # Historial de recomendaciones
├── risk/
│   ├── ProfileGauge.tsx
│   ├── RetirementSummary.tsx
│   └── RiskProfileWizard.tsx
└── shared/
    ├── AdvisorSidebar.tsx       # Sidebar persistente (nav, notificaciones, menú usuario)
    ├── NotificationBell.tsx     # Campana de notificaciones
    └── AdvisorHeader.tsx        # Legacy (no usado en páginas actuales)
```

---

## Librerías de Riesgo

```
lib/risk/
├── benchmarks.ts           # Definición de benchmarks por perfil
├── benchmark_map.ts        # Mapeo de bloques de inversión
├── benchmark_weights.ts    # Pesos por benchmark
├── life_expectancy.ts      # Cálculo de esperanza de vida
├── risk_questionnaire_v1.ts # Preguntas del cuestionario
├── risk_scoring.ts         # Cálculo de scores
└── tilt.ts                 # Clasificación de tilts
```

---

## Estilos (Tailwind CSS)

### Colores del Tema (GLOBAL)
```css
--gb-black: #1a1a1a      /* Negro principal */
--gb-dark: #333333       /* Gris oscuro */
--gb-gray: #666666       /* Gris medio */
--gb-light: #f5f5f5      /* Fondo claro */
--gb-border: #e5e5e5     /* Bordes */
--gb-accent: #2563eb     /* Acento azul */
```

### Uso estandarizado
```jsx
// Correcto (Tailwind v4)
className="bg-gb-light text-gb-black border-gb-border"

// Incorrecto (legacy)
className="bg-[var(--gb-light)] text-[var(--gb-black)]"
```

### Títulos de página (convención)
Todas las páginas del asesor usan el mismo formato de header:
```jsx
<div className="bg-white border-b border-gb-border">
  <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    <h1 className="text-2xl font-semibold text-gb-black">Título</h1>
    <p className="text-sm text-gb-gray mt-1">Subtítulo descriptivo</p>
  </div>
</div>
```
No usar: `font-bold`, `text-xl`, `text-3xl`, `text-slate-900`, íconos en el header, ni links "Volver".

---

## Flujo de Usuario

```
                                    ┌─────────────┐
                                    │   Login     │
                                    │  /login     │
                                    └──────┬──────┘
                                           │
                                           ▼
┌──────────┬───────────────────────────────────────────────────────┐
│ SIDEBAR  │              ADVISOR DASHBOARD                        │
│ (siempre │                 /advisor                              │
│ visible) │                                                       │
│          │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│ Navega-  │   │  Clientes   │  │  Cartola &  │  │  Portfolio  │  │
│ ción +   │   │  /clients   │  │   Riesgo    │  │  Designer   │  │
│ Notif +  │   └─────────────┘  └─────────────┘  └─────────────┘  │
│ Perfil   │                                                       │
│          │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│          │   │  Centro de  │  │ Calculadora │  │  Educación  │  │
│          │   │   Fondos    │  │     APV     │  │ Financiera  │  │
│          │   └─────────────┘  └─────────────┘  └─────────────┘  │
│          │                                                       │
└──────────┴───────────────────────────────────────────────────────┘

                    FLUJO DE CLIENTE (EXTERNO)
                              │
                              ▼
                    ┌─────────────────┐
                    │ /client/risk-   │
                    │    profile      │
                    │  ?email=xxx     │
                    │  &advisor=yyy   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   Completar     │
                    │  Cuestionario   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Notificación   │
                    │   al Asesor     │
                    └─────────────────┘
```

---

## Tecnologías

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19, Tailwind CSS v4
- **Charts:** Recharts
- **PDF:** @react-pdf/renderer
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **AI:** Claude (analisis, reportes, xray), Gemini 2.5 Flash (extraccion fichas PDF)
- **APIs externas:** CMF, AAFM, Fintual, Yahoo Finance, Alpha Vantage, Bolsa de Santiago
- **Email:** Resend
- **CAPTCHA:** 2captcha (para CMF fondos de inversion)

---

## Radiografía del Portafolio (X-Ray)

Análisis semiautomático de la cartola del cliente ANTES del perfil de riesgo. Se activa desde la página de seguimiento cuando hay al menos un snapshot con holdings.

**API**: `POST /api/portfolio/xray`
- Input: array de holdings (`fundName`, `marketValue`, `serie`, `securityId`, `currency`, etc.)
- Matching: primero exacto por `fo_run` + `serie`, fallback a fuzzy por nombre contra `vw_fondos_completo` (5000+ fondos CMF)
- Si no matchea en fondos mutuos, busca en `fondos_inversion` por RUT o nombre fuzzy
- Fondos de inversión detectados se retornan con `isFondoInversion: true`, `fiRut`, `fiPrecioFecha`, `fiValorLibro`, `fiStale`
- `fondosInversionDetected`: array con RUT/nombre/stale de todos los FI encontrados en el portafolio
- Output: allocation, TAC promedio ponderado, costo anual, ahorro potencial, alternativas más baratas, propuesta optimizada

**API**: `POST /api/portfolio/xray-report`
- Input: xrayData (con propuesta merged), clientName, advisoryFee, customContext, ufValue, usdValue
- Genera informe profesional con Claude, distinguiendo claramente:
  - Portafolio actual del cliente (lo que tiene y lo que paga)
  - Portafolio de referencia propuesto (comparativo, no definitivo)
  - Valores deflactados en UF y USD cuando están disponibles
  - Comparación posición por posición con rentabilidad 12M
  - Espacio para observaciones del asesor
- El frontend envía los datos con todas las ediciones del asesor aplicadas (TAC overrides, fondos propuestos buscados manualmente, TAC propuestos editados)
- Valores defensivos: todos los `.toFixed()` y `.toLocaleString()` manejan null/undefined

**API**: `GET /api/fondos/search-price`
- Busca fondos por nombre, RUN o AGF
- Retorna `tac`, `rent_1m`, `rent_3m`, `rent_12m` (de `vw_fondos_completo`) junto con precio y metadata del fondo
- Usado en la radiografía para búsqueda manual de alternativas en la propuesta

**API**: `POST /api/fondos-inversion/fetch-prices`
- Scrape automático de precios de fondos de inversión desde CMF usando 2captcha (reCAPTCHA v2)
- Input: `{ rut, desde?, hasta? }` — si no se especifica rango, trae últimos 30 días
- Busca el fondo en `fondos_inversion`, obtiene `cmf_row` y `tipo`, ejecuta `scrapeFIPrices()`, persiste con `importFIRows()`
- Costo: ~$0.003 por solve (reCAPTCHA v2 via 2captcha)
- Requiere `TWOCAPTCHA_API_KEY` en env
- maxDuration: 120s (captcha solving puede tomar 20-60s)

**Componente**: `RadiografiaCartola.tsx`
- Tarjetas resumen: valor total (CLP + UF + USD), TAC promedio, costo anual (CLP + UF), ahorro potencial (se recalculan con ediciones)
- Barra de composición: Renta Variable / Fija / Balanceado / Alternativos / Otros
- Tabla de detalle por holding:
  - TAC editable inline (input numérico, se marca en azul si fue editado)
  - Fallback a `fundsMeta` para TAC si el xray no lo encontró
  - Categoría, APV, alternativas con TAC menor (expandible)
  - Badge "FI" con fecha de precio para fondos de inversión detectados
- **Fondos de inversión auto-fetch**: Al generar radiografía, si se detectan FI con precios desactualizados (>3 días), se scrapean automáticamente de CMF via 2captcha y se re-ejecuta el xray con datos frescos. Se muestra progreso por fondo durante el scraping.
- Tabla de propuesta con búsqueda:
  - TAC Actual editable (sincronizado con la tabla de detalle)
  - TAC Propuesto editable
  - Botón de búsqueda por fila → input inline que busca via `/api/fondos/search-price`
  - Al seleccionar un fondo, reemplaza la propuesta para esa posición
  - Recálculo automático de costos y ahorro neto (con advisory fee)
- Resumen de costos con 4 cards: Costo Actual, Costo Propuesto, Ahorro Neto, Rentabilidad 12M Ponderada (actual vs propuesta)
- Advisory fee editable (default 1%)
- Contexto personalizable (textarea siempre visible, se incluye al inicio del prompt AI, editable al regenerar)
- Informe AI editable post-generación (copiar, editar, regenerar)
- **Persistencia del informe**: Se guarda en `localStorage` por `clientId`. Al volver a la página del cliente, se carga el último informe guardado (incluye notas del asesor). Se actualiza al generar, regenerar o editar manualmente.

**Flujo recomendado**:
1. Crear cliente → subir cartola → **Radiografía** → perfil de riesgo → cartera recomendada → seguimiento

---

## Mejoras Implementadas (Auditoria Abril-Mayo 2026)

### Retornos
- **TWR eliminado**: Reemplazado por retornos simples (`lib/returns/calculator.ts`). Regla: < 365 dias = simple, >= 365 dias = anualizado.
- **Sharpe/volatilidad removidos**: Metricas complejas eliminadas por simplificacion.

### Fichas CMF (Gemini AI)
- **Extraccion con Gemini 2.5 Flash**: `lib/ficha-extract.ts` extrae TAC, horizonte, tolerancia riesgo, objetivo, beneficio tributario de folletos PDF.
- **Sync masivo**: FM via `/api/fondos/sync-fichas`, FI via `/api/fondos-inversion/sync-fichas`. Ambos usan Gemini con fallback a regex.
- **Review**: `/advisor/fichas-review` muestra FM + FI con beneficio tributario, objetivo, TAC comparativo.
- **Indicadores Gemini**: UI muestra si la extraccion fue via Gemini AI (verde) o regex fallback (amarillo).

### AI Usage Tracking
- **Tracking por asesor**: `advisor_ai_usage` tabla con tokens/costo por mes. Modelo configurable (Sonnet 4 / Opus 4).

### Precios y Seguimiento
- **Sin auto-fill al ver portafolio**: Ahora ejecuta fill-prices automáticamente si precios >24h al abrir seguimiento
- **Sin indicador de frescura de precios**: Badge verde/amarillo/rojo junto al botón "Llenar Precios"
- **Fire-and-forget sin error handling**: Cache de precios en current-prices ahora logea errores
- **CMF fallback sin try/catch**: Agregado error handling en lookup CMF
- **CMF activado tarde (30 días)**: Reducido threshold a 7 días (CMF es fuente más confiable)
- **Snapshot fallback indistinguible**: Nuevo source `snapshot_fallback` diferenciado de `snapshot`
- **api-prices cargados innecesariamente en fill-prices**: Filtro SQL directo `in("source", [...])` en vez de cargar todo y filtrar en memoria

### Snapshots
- **Race condition en baseline**: Marca `is_baseline` después del insert (si count=1), no antes
- **Cash flows fantasma por redondeo**: Tolerancia de 0.1% en diferencia de cuotas
- **Warning de tipos de cambio fallback**: Indicador visual cuando se usan valores estimados

---

### UX de Holdings No Matcheados

Cuando el auto-match no encuentra un fondo (precio no coincide o no hay resultado):

1. **Indicador visual**: El holding se resalta con fondo amarillo y badge "No encontrado" con ícono de alerta
2. **Banner resumen**: Sobre la tabla aparece "X fondos sin coincidencia de precio — requieren búsqueda manual por RUN"
3. **Diálogo automático**: Se abre automáticamente el panel de búsqueda para el primer holding sin match
4. **Flujo secuencial**: Al seleccionar un fondo en el diálogo, se avanza automáticamente al siguiente holding sin match
5. **Input de búsqueda**: El diálogo incluye un campo de texto con placeholder "Buscar por RUN (ej: 8000) o nombre..." que permite buscar por RUN numérico o por nombre libre

---

*Ultima actualizacion: Mayo 2026*
