# Bond Portfolio Support in Seguimiento

**Date:** 2026-05-19
**Status:** Approved
**Context:** Cliente StoneX con 17 bonos corporativos internacionales (USD 1.2M). Necesitamos soportar bonos en la plataforma con metricas especificas de renta fija.

## Principio de diseno

Un solo punto de entrada (seguimiento), deteccion automatica del tipo de cartola, vistas especializadas por asset class. La cartola es la fuente de verdad para precios. Los calculos de renta fija (duration, cash flows, devengo) son matematica pura — sin API de precios.

## 1. Deteccion y parseo de cartola

### Cambios al parser (`parse-portfolio-statement`)

Extender el prompt de Claude para que clasifique cada holding con `assetClass`:
- `"fund"` — fondos mutuos, ETFs
- `"bond"` — bonos corporativos, soberanos, agency
- `"stock_us"` — acciones/ETFs US
- `"stock_cl"` — acciones chilenas
- `"cash"` — cash, money market, sweep

Para bonos, extraer campos adicionales del texto del PDF:
- `cusip` — del parentesis en Description, ej: `(03938LBG8)`
- `couponRate` — del "CPN X.XXX%", ej: `6.000`
- `maturityDate` — del "DUE MM/DD/YY", ej: `2034-06-17`
- `creditRating` — del "Ratings Information: S&P:XXX", ej: `BBB`
- `bondType` — inferir de "SR NOTE", "UNSECD NOTE", "GTD NOTE", etc.
- `estIncomeYield` — del campo Est. Income Yield
- `estAnnualIncome` — del campo Est. Annual Income

El resultado del parseo incluye `cartolaMix`:
- `"funds_only"` — solo fondos/ETFs
- `"bonds_only"` — solo bonos (como esta cartola StoneX)
- `"mixed"` — fondos + bonos + acciones mezclados

### Formato JSON extendido del parser

```json
{
  "holdings": [
    {
      "fundName": "ARCELORMITTAL UNSECD NOTE CPN 6.000% DUE 06/17/34",
      "securityId": "03938LBG8",
      "assetClass": "bond",
      "market": "US",
      "quantity": 70000,
      "unitCost": 102.6525,
      "costBasis": 71856.77,
      "marketPrice": 105.3431,
      "marketValue": 73740.17,
      "unrealizedGainLoss": 1883.40,
      "currency": "USD",
      "bond": {
        "cusip": "03938LBG8",
        "couponRate": 6.0,
        "maturityDate": "2034-06-17",
        "creditRating": "BBB",
        "bondType": "corporate",
        "estIncomeYield": 5.695,
        "estAnnualIncome": 4200.00
      }
    }
  ],
  "cartolaMix": "bonds_only",
  "incomeDetail": {
    "monthToDate": 5843.18,
    "yearToDate": 33863.96,
    "items": [
      { "date": "2026-04-04", "description": "GLENCORE FDG LLC...", "cusip": "U37818BQ0", "amount": 1971.90 }
    ]
  }
}
```

## 2. Modelo de datos

### Cambio a tabla existente: `snapshot_holdings`

Agregar columna:
```sql
ALTER TABLE snapshot_holdings
ADD COLUMN asset_class TEXT NOT NULL DEFAULT 'fund'
CHECK (asset_class IN ('fund', 'bond', 'stock_us', 'stock_cl', 'etf', 'cash'));
```

Default `'fund'` para no romper data existente.

### Nueva tabla: `bond_details`

```sql
CREATE TABLE bond_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES snapshot_holdings(id) ON DELETE CASCADE,
  cusip TEXT,
  coupon_rate NUMERIC(6,3),          -- ej: 6.000
  coupon_frequency TEXT NOT NULL DEFAULT 'semiannual'
    CHECK (coupon_frequency IN ('monthly', 'quarterly', 'semiannual', 'annual')),
  maturity_date DATE NOT NULL,
  credit_rating TEXT,                 -- S&P rating, ej: BBB, BB+
  purchase_date DATE,                 -- editable por asesor
  purchase_yield NUMERIC(6,3),        -- TIR de compra (%)
  face_value NUMERIC(14,2),           -- valor par/nominal
  bond_type TEXT DEFAULT 'corporate'
    CHECK (bond_type IN ('corporate', 'sovereign', 'agency', 'municipal')),
  is_callable BOOLEAN DEFAULT FALSE,
  issuer TEXT,                        -- nombre corto del emisor
  UNIQUE(holding_id)
);
```

RLS: misma politica que `snapshot_holdings` (via snapshot → client → advisor).

### Futuro (no implementar ahora)

`stock_details` para acciones: ticker, exchange, sector, dividend_yield, market_cap.
La columna `asset_class` en `snapshot_holdings` ya deja el camino abierto.

## 3. Navegacion en seguimiento

### Tabs dinamicos

Cuando el asesor selecciona un cliente, seguimiento muestra tabs segun el contenido:

```
[Resumen] [Fondos] [Renta Fija]
```

- Tabs aparecen solo si hay holdings de ese `asset_class` en el snapshot mas reciente
- Si solo hay fondos: no aparece tab Renta Fija (comportamiento actual)
- Si solo hay bonos: no aparece tab Fondos
- Si hay ambos: aparecen todos los tabs

### Tab Resumen (nuevo)

- Patrimonio total consolidado (fondos + bonos + cash)
- Asset allocation pie chart (% fondos, % bonos, % cash)
- Evolucion del valor total (grafico de linea, multiples snapshots)
- Ingreso por cupones YTD (si hay bonos)

### Tab Fondos

La radiografia actual (`RadiografiaCartola`) sin cambios. Solo muestra holdings con `asset_class IN ('fund', 'etf')`.

### Tab Renta Fija (nuevo)

Vista completa descrita en seccion 4.

## 4. Vista Renta Fija

### Cards superiores (metricas agregadas)

| Card | Calculo |
|------|---------|
| Valor de mercado total | SUM(marketValue) de bonos |
| Duration modificada prom. | Promedio ponderado por marketValue |
| Yield promedio ponderado | Promedio ponderado por marketValue |
| Ingreso anual estimado | SUM(face_value x coupon_rate) |
| Rating promedio | Numerico ponderado → letra (AAA=1, AA+=2, ... CCC=21) |

### Tabla de posiciones

Columnas:
- Emisor (nombre corto extraido)
- CUSIP
- Cupon (%)
- Maturity (fecha)
- Rating S&P
- Face Value (USD)
- Precio (% del par)
- Market Value (USD)
- G/L (USD y %)
- Yield (%)
- Accion: click abre tabla de desarrollo

Ordenamiento default: por maturity date (proximos vencimientos primero).

### Calendario de cupones (proximos 12 meses)

Vista mensual tipo timeline o tabla:

| Mes | Bono | Monto USD |
|-----|------|-----------|
| Jun 2026 | ArcelorMittal 6.0% | 2,100.00 |
| Jun 2026 | Glencore 5.634% | 1,971.90 |
| Jul 2026 | Celanese 7.165% | 1,791.25 |
| ... | ... | ... |

Incluye total por mes. Cupones pasados (desde purchase_date) marcados como "Cobrado".

### Cash flow projection (grafico)

Grafico de barras stacked por mes/trimestre:
- Barras verdes = cupones
- Barras azules = principal al vencimiento
- Linea = acumulado

Horizonte: desde hoy hasta el ultimo vencimiento.

### Distribucion (2 graficos)

1. **Por rating**: bar chart horizontal (AAA, AA, A, BBB, BB, B, ...) con % del portfolio
2. **Por maturity bucket**: (0-2Y, 2-5Y, 5-10Y, 10Y+) con % del portfolio

## 5. Tabla de desarrollo

### Por bono individual (modal o panel expandible)

Se abre al hacer click en un bono desde la tabla de posiciones.

Encabezado:
- Emisor, CUSIP, cupon, maturity, rating, face value
- TIR de compra, purchase_date (editable)
- Coupon frequency (editable, default semiannual)

Tabla:

| # | Fecha | Tipo | Monto USD | Devengo acum. | Status |
|---|-------|------|-----------|---------------|--------|
| 1 | 2024-12-17 | Cupon | 2,100.00 | 2,100.00 | Cobrado |
| 2 | 2025-06-17 | Cupon | 2,100.00 | 4,200.00 | Cobrado |
| 3 | 2025-12-17 | Cupon | 2,100.00 | 6,300.00 | Cobrado |
| 4 | 2026-06-17 | Cupon | 2,100.00 | 8,400.00 | Pendiente |
| ... | ... | ... | ... | ... | ... |
| N | 2034-06-17 | Cupon + Principal | 72,100.00 | ... | Pendiente |

Calculo cupon semestral: `face_value x coupon_rate / 2`.
Status: `fecha <= hoy && fecha >= purchase_date` → Cobrado, sino Pendiente.

Resumen al pie:
- Total cupones cobrados: X USD
- Total cupones pendientes: Y USD
- Principal al vencimiento: Z USD
- Total cash flows: X + Y + Z USD

### Vista consolidada

Todos los flujos de todos los bonos en un solo timeline ordenado por fecha.
Cada fila muestra el emisor + monto. Totales mensuales/trimestrales.
Accesible como sub-tab dentro de Renta Fija.

## 6. Motor de calculos: `lib/bonds/`

Funciones puras sin dependencias externas.

### `lib/bonds/types.ts`

```typescript
interface BondParams {
  faceValue: number;
  couponRate: number;       // anual, ej: 0.06
  couponFrequency: number;  // pagos por ano: 1, 2, 4, 12
  maturityDate: string;     // ISO date
  purchaseDate: string;     // ISO date
  purchasePrice: number;    // % del par, ej: 102.65
  currentPrice: number;     // % del par, ej: 105.34
}

interface CashFlow {
  date: string;
  type: 'coupon' | 'principal' | 'coupon+principal';
  amount: number;
  cumulativeAmount: number;
  status: 'collected' | 'pending';
}

interface BondMetrics {
  macaulayDuration: number;
  modifiedDuration: number;
  yieldToMaturity: number;
  accruedInterest: number;
  totalCouponCollected: number;
  totalCouponPending: number;
  totalCashFlows: number;
}
```

### `lib/bonds/cash-flows.ts`

`generateCashFlows(bond: BondParams): CashFlow[]`
- Genera todos los flujos desde el primer cupon post-compra hasta maturity
- Ultimo flujo incluye principal + cupon
- Status basado en fecha vs hoy

### `lib/bonds/duration.ts`

`calcMacaulayDuration(bond: BondParams): number`
- Suma ponderada de tiempos de flujos descontados a YTM

`calcModifiedDuration(bond: BondParams): number`
- Macaulay / (1 + YTM/freq)

### `lib/bonds/yield.ts`

`calcYieldToMaturity(bond: BondParams): number`
- Newton-Raphson iterativo para resolver precio = sum(CF / (1+y)^t)
- Convergencia en ~10 iteraciones tipicamente

### `lib/bonds/accrued-interest.ts`

`calcAccruedInterest(bond: BondParams, settleDate: string): number`
- Interes devengado = cupon_periodico x (dias desde ultimo cupon / dias del periodo)
- Convencion 30/360 para corporativos US

### `lib/bonds/portfolio.ts`

`calcWeightedMetrics(bonds: BondWithMetrics[]): PortfolioMetrics`
- Duration promedio ponderada por market value
- Yield promedio ponderado por market value
- Rating promedio ponderado (escala numerica → letra)
- Ingreso anual total

## 7. Archivos a crear/modificar

### Nuevos
- `supabase/migrations/YYYYMMDD_bond_support.sql` — migration con asset_class + bond_details
- `lib/bonds/types.ts` — tipos TypeScript
- `lib/bonds/cash-flows.ts` — generacion de flujos
- `lib/bonds/duration.ts` — Macaulay y Modified duration
- `lib/bonds/yield.ts` — YTM por Newton-Raphson
- `lib/bonds/accrued-interest.ts` — interes devengado
- `lib/bonds/portfolio.ts` — metricas agregadas
- `components/seguimiento/BondPortfolioView.tsx` — vista principal renta fija
- `components/seguimiento/BondTable.tsx` — tabla de posiciones
- `components/seguimiento/BondDevelopmentModal.tsx` — tabla de desarrollo individual
- `components/seguimiento/CouponCalendar.tsx` — calendario de cupones
- `components/seguimiento/CashFlowProjection.tsx` — grafico de proyeccion
- `components/seguimiento/ConsolidatedCashFlows.tsx` — vista consolidada de flujos
- `components/seguimiento/BondDistributionCharts.tsx` — graficos por rating y maturity

### Modificar
- `app/api/parse-portfolio-statement/route.ts` — extender prompt para clasificar asset class y extraer bond fields
- `components/seguimiento/SeguimientoPage.tsx` — agregar tabs dinamicos y tab Resumen
- `components/seguimiento/ReviewSnapshotModal.tsx` — guardar bond_details al confirmar snapshot
- `app/api/clients/[id]/seguimiento/route.ts` — incluir bond_details en la respuesta

## 8. Fuera de alcance (fase 2+)

- Precios de bonos via API (Finnhub Bond API / FINRA TRACE)
- `stock_details` para acciones internacionales y locales (estructura lista con asset_class)
- Yield-to-call para bonos callable
- Dirty price vs clean price (la cartola ya da el precio)
- Accrued interest en el parser (la cartola no lo separa)
- Simulador tributario para bonos internacionales
