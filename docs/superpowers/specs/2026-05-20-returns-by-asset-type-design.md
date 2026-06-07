# Retornos por Tipo de Activo — Design Spec

**Fecha:** 2026-05-20
**Objetivo:** Rediseñar HoldingReturnsPanel para mostrar retornos con desglose por clase de activo, incluyendo dividendos (RV) y devengo/cupones (RF).

## Arquitectura

El panel de rentabilidad por activo se divide en **secciones por clase**: Renta Variable, Renta Fija, Cash. Cada sección tiene columnas optimizadas para su tipo. Las secciones se muestran/ocultan según la composición real de la cartera (detección por `assetType` de holdings).

Los dividendos de acciones/ETFs se obtienen de Alpha Vantage (endpoint DIVIDENDS) y se almacenan en una tabla normalizada `dividend_history`. Los retornos de bonos se desglosan en devengo (accrued interest), diferencia de precio de mercado, y cupones cobrados.

**Principio central:** Solo medimos lo que ocurre entre cartolas (snapshot A → snapshot B). No inferimos nada previo a la primera cartola.

## Decisiones de diseño

### 1. Layout: Secciones separadas por clase

Tres secciones dentro de HoldingReturnsPanel, cada una con su tabla y subtotales:

- **Renta Variable** (fondos mutuos, ETFs, acciones)
- **Renta Fija** (bonos corporativos)
- **Cash / Money Market**

### 2. Columnas por sección

**Renta Variable:**

| Columna | Descripción |
|---------|-------------|
| Activo | Nombre o ticker |
| Tipo | Badge: Fondo / ETF / Stock |
| Peso | % del portafolio total |
| P. Compra | Precio de la primera cartola donde aparece |
| P. Actual | Precio del snapshot más reciente |
| Valor | marketValue actual |
| Retorno | (P.Actual / P.Compra - 1) × 100 |
| Dividendos* | Monto de dividendos entre cartolas / marketValue inicio |
| Ret. Total | Retorno + Dividendos |
| Contrib. | Ret.Total × Peso / 100 |

*Columna Dividendos solo visible si `hasStocksOrETFs` es true.

**Renta Fija:**

| Columna | Descripción |
|---------|-------------|
| Emisor | Nombre del emisor (truncado) |
| Rating | Badge con color por calidad crediticia |
| Cupón | Tasa cupón anual (%) |
| Venc. | Fecha maturity (MMM YYYY) |
| Peso | % del portafolio total |
| P. Compra | unitCost (% del par) |
| P. Mercado | Precio FINRA más reciente (% del par) |
| YTM | Yield-to-maturity actual calculado con lib/bonds/yield.ts |
| Devengo | Accrued interest del período (30/360) en USD |
| Dif. Precio | (precioMercado - precioCompra) / 100 × faceValue en USD |
| Cupones | Cupones cobrados en el período (auto-calc, editable) |
| Ret. Total | (devengo + difPrecio + cupones) / costBasis × 100 |
| Contrib. | Ret.Total × Peso / 100 |

**Cash:**
Línea simple con saldo.

### 3. Dividendos: fuente y período

- **Fuente:** Alpha Vantage `function=DIVIDENDS` endpoint.
- **Período:** Solo dividendos con `ex_dividend_date` entre la fecha del snapshot anterior y el snapshot actual.
- **Cálculo:** `dividendosPeriodo = quantity × dividendAmount` para cada evento en el rango.
- **Retorno dividendos:** `dividendosPeriodo / marketValueInicio × 100`.
- **Aplica a:** stocks y ETFs. Fondos mutuos chilenos no pagan dividendos (muestran "-").

### 4. Storage: tabla `dividend_history`

Tabla normalizada, un fetch de Alpha Vantage sirve para todos los clientes que tengan ese ticker.

```sql
CREATE TABLE dividend_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker text NOT NULL,
  ex_dividend_date date NOT NULL,
  payment_date date,
  amount numeric NOT NULL,
  source text NOT NULL DEFAULT 'alphavantage',
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(ticker, ex_dividend_date, source)
);

CREATE INDEX idx_dividend_history_ticker_date
  ON dividend_history(ticker, ex_dividend_date DESC);
```

No necesita RLS — datos públicos de mercado, igual que `bond_prices`.

### 5. Bonos: desglose de retorno

**Devengo (accrued interest):**
- Convención: 30/360 (estándar US corporate bonds).
- Cálculo: `faceValue × (couponRate / frequency) × (diasEnPeriodo / 180)` para semi-annual.
- Ya implementado en `lib/bonds/accrued-interest.ts`.

**Diferencia de precio:**
- `(precioMercadoActual - precioCompra) / 100 × faceValue`.
- Precio mercado viene de `bond_prices` (FINRA TRACE).
- Precio compra viene de `unitCost` de la cartola.

**Cupones cobrados:**
- Auto-calculados usando `lib/bonds/cash-flows.ts`: genera schedule desde maturityDate + couponFrequency, filtra los que caen entre snapshot A y B.
- Monto: `faceValue × couponRate / frequency`.
- Override manual: el asesor puede corregir el monto (ej: retención de impuesto, fecha ajustada por feriado).
- Almacenamiento del override: campo en `bond_overrides` o inline en snapshot (decisión de implementación).

**YTM:**
- Calculado con `lib/bonds/yield.ts` (Newton-Raphson) usando precio de mercado actual.

### 6. Vista adaptativa

Detección por `assetType` de los holdings del snapshot:

```typescript
const hasEquity = holdings.some(h => ['fund','etf','stock'].includes(h.assetType))
const hasBonds = holdings.some(h => h.assetType === 'bond')
const hasStocksOrETFs = holdings.some(h => ['etf','stock'].includes(h.assetType))
const hasCash = holdings.some(h => h.assetType === 'cash')
```

| Composición | Secciones | Columna Dividendos |
|-------------|-----------|-------------------|
| Solo fondos | RV + Cash | No |
| Fondos + acciones/ETFs | RV + Cash | Sí |
| Solo renta fija | RF + Cash | No |
| Mixto completo | RV + RF + Cash | Sí (en RV) |

### 7. Resumen superior

Cards con métricas agregadas:
- Valor Total
- Retorno Total (ponderado)
- % Renta Variable
- % Renta Fija

## Archivos involucrados

### Modificar

- `components/seguimiento/HoldingReturnsPanel.tsx` — Refactor completo: secciones RV/RF/Cash, columnas por tipo, lógica adaptativa.

### Crear

- `supabase/migrations/20260520_dividend_history.sql` — Tabla `dividend_history`.
- `lib/alphavantage-dividends.ts` — Fetch y cache de dividendos desde Alpha Vantage DIVIDENDS endpoint. Rate limiting (0.8s entre calls).
- `lib/bonds/period-return.ts` — Cálculo de retorno por bono entre dos fechas: devengo + dif. precio + cupones cobrados.
- `app/api/dividends/sync/route.ts` — API route para sincronizar dividendos de un array de tickers. Usa `alphavantage-dividends.ts`, upsert a `dividend_history`.

### Ya existentes (reutilizar)

- `lib/bonds/accrued-interest.ts` — Devengo 30/360.
- `lib/bonds/yield.ts` — YTM Newton-Raphson.
- `lib/bonds/cash-flows.ts` — Schedule de cupones.
- `lib/bonds/types.ts` — BondHolding, BondParams.

## Fuera de alcance

- Forward calendar de dividendos (múltiples trimestres futuros).
- Dividendos de fondos mutuos chilenos (no aplica).
- TWR, Sharpe, volatilidad (removidos por decisión previa).
- Reporte AI sobre retornos por activo (puede agregarse después).
