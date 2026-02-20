# Arquitectura de la Plataforma de Asesoría Financiera

## Estructura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ADVISOR DASHBOARD                               │
│                                 /advisor                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Dashboard  │  │  Clientes   │  │  Cartola &  │  │  Portfolio  │        │
│  │  /advisor   │  │  /clients   │  │   Riesgo    │  │  Designer   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                     HERRAMIENTAS (Dropdown)                      │       │
│  ├─────────────┬─────────────┬─────────────┬─────────────┐         │       │
│  │   Market    │  Centro de  │ Calculadora │  Educación  │         │       │
│  │  Dashboard  │   Fondos    │     APV     │ Financiera  │         │       │
│  └─────────────┴─────────────┴─────────────┴─────────────┘         │       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
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
app/portfolio-designer/
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
app/fund-center/
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
| `/analisis-cartola` | Análisis de cartola y riesgo | AnalizadorCartola |
| `/portfolio-designer` | Diseñador de portfolios | PortfolioDesignerPage |

### Herramientas (Dropdown)

| Ruta | Descripción | Componente |
|------|-------------|------------|
| `/market-dashboard` | Dashboard de mercado | MarketDashboard |
| `/fund-center` | Centro de fondos | FundCenterPage |
| `/calculadora-apv` | Calculadora APV | CalculadoraAPV |
| `/educacion-financiera` | Educación financiera | EducacionFinanciera |

### Rutas de Cliente

| Ruta | Descripción | Componente |
|------|-------------|------------|
| `/client/risk-profile` | Cuestionario de riesgo | RiskProfileWizard |
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
```

### APIs de Riesgo y Portfolio
```
/api/save-risk-profile          POST - Guardar perfil de riesgo
/api/portfolio-comparison       GET - Comparación de portfolio
/api/parse-portfolio-statement  POST - Parsear cartola
```

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
│   ├── ProposedFundFormV2.tsx
│   └── SavedModels.tsx
├── risk/
│   ├── ProfileGauge.tsx
│   ├── RetirementSummary.tsx
│   └── RiskProfileWizard.tsx
└── shared/
    └── AdvisorHeader.tsx
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

### Colores del Tema (Greybark)
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

---

## Flujo de Usuario

```
                                    ┌─────────────┐
                                    │   Login     │
                                    │  /login     │
                                    └──────┬──────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                         ADVISOR DASHBOARD                         │
│                            /advisor                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│   │  Ver/Crear  │    │  Análisis   │    │  Diseñar    │         │
│   │  Clientes   │    │  Cartola    │    │  Portfolio  │         │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│          │                  │                   │                │
│          ▼                  ▼                   ▼                │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│   │  /clients   │    │ /analisis-  │    │ /portfolio- │         │
│   │  /[id]      │    │  cartola    │    │  designer   │         │
│   └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                   │
│   ┌─────────────────────────────────────────────────────┐       │
│   │                   HERRAMIENTAS                       │       │
│   │                                                      │       │
│   │  /market-dashboard  /fund-center  /calculadora-apv  │       │
│   │                                                      │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

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
- **APIs externas:** Alpha Vantage, Yahoo Finance

---

*Última actualización: Febrero 2026*
