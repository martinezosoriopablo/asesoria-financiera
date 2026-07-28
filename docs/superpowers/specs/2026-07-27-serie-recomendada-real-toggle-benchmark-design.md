# Serie "Recomendado" con instrumentos reales + toggle de benchmark

**Fecha:** 2026-07-27
**Sub-proyecto:** B de 3 (A: vista Recomendación · **B: serie honesta + toggle benchmark** · C: Portfolio Designer → "Mi Benchmark")

## 1. Contexto y problema

Hoy la serie **"Recomendado"** que se dibuja en `RetornosComparados` (Seguimiento) **no** revaloriza los instrumentos que el asesor efectivamente eligió: usa **proxies genéricos por clase** (`lib/prices/recommended-proxies.ts`: RV→ACWI, RF→AGG, Alt→GLD+RWO, Caja→UF). Es decir, la línea "Recomendado" es en realidad un índice de mercado de la *asignación* recomendada, no de la *recomendación concreta*.

Con el sub-proyecto A ya guardamos en `clients.cartera_recomendada` una recomendación **enriquecida** con los instrumentos reales de cada decisión (`cartera[]` = `{clase, ticker, nombre, porcentaje}`, donde `ticker` es un ETF como `VOO`/`IEF`, un RUN de fondo chileno, o `null` para Caja).

**B corrige esto en tres partes:**

1. **Serie honesta.** `recommended-evolution` revaloriza los **instrumentos reales** de la Decisión (ETFs, fondos, y el fondo money-market de la Caja) vía el price service unificado.
2. **El proxy pasa a ser un benchmark de mercado.** La lógica de proxies actual deja de ser "Recomendado" y se ofrece como una **opción de benchmark** (índices por clase ponderados con la asignación recomendada).
3. **Toggle de benchmark** en `RetornosComparados`: la línea de **Benchmark** alterna entre **UF+2%** (comportamiento actual) y el **proxy de mercado**. La elección se guarda por cliente.

**Fuera de alcance:** órdenes de compra/venta o rebalanceo (eso ya lo hace la Radiografía; esta vista es de retornos), y el sub-proyecto C (retirar la pestaña "Comparación" de Portfolio Designer y evolucionarla a "Mi Benchmark").

## 2. Decisiones de diseño (cerradas con el usuario)

- **Cobertura de precios:** se revaloriza **todo instrumento real** vía `getMarketTickerPrices` (ETFs internacionales por Yahoo/AV, fondos chilenos por RUN/CMF, fondo MM de la Caja por su valor cuota). Cuando una posición **no** trae instrumento cotizable (Caja con `ticker` nulo, o un fondo sin serie de precios), se **sustituye por el proxy de mercado de su clase** (RV→ACWI, RF→AGG, Alt→GLD+RWO, **Caja→UF**). Así la serie queda siempre completa y el reemplazo es un índice honesto de esa clase. Regla de compliance: el fallback de Caja usa **UF** (CLP real, sin ruido FX ni spread inventado), nunca un rendimiento nominal fabricado.
- **Dos series en una sola llamada:** `recommended-evolution` devuelve `{ recommended, benchmarkProxy }`. Comparten el fetch de precios (se solapan en ACWI/AGG/UF/USD), así que un solo endpoint evita duplicar llamadas.
- **Persistencia del toggle:** **columna nueva** `clients.benchmark_mode text default 'uf_spread'` (valores `'uf_spread'` | `'market_proxy'`). Backward-compatible; **no** se toca el JSONB `benchmark_config` (que sigue siendo el `BenchmarkComponent[]` del benchmark UF+2%). Default inicial: `uf_spread` (comportamiento actual preservado).

## 3. Arquitectura

### 3.1 `lib/prices/recommended-real.ts` (nuevo)

Función pura `expandRealInstruments(cartera, resolveFn)` que convierte `cartera[]` (posiciones reales) a la misma forma `FlatProxy[]` que consume `computeRecommendedMonthlyReturnsCLP`, resolviendo cada posición a un ticker cotizable + moneda + clase, y **marcando** las que deberán sustituirse por proxy de clase.

```ts
import type { FlatProxy } from "@/lib/prices/recommended-proxies";

export interface RealPosition {
  clase: string;
  ticker: string | null; // ETF, RUN de fondo, o null (Caja)
  porcentaje: number;
}

// Resultado: cada componente ya listo para computeRecommendedMonthlyReturnsCLP,
// pesos globales que suman 1. `substituted` indica que se cayó al proxy de clase.
export interface RealComponent extends FlatProxy {
  clase: string;
  substituted: boolean;
}
```

- **Resolución de ticker/moneda:** por cada posición con `ticker`, se llama a `resolveSource({ fundName: ticker, securityId: ticker, marketValue: 0, market: "US" })` (inyectado como `resolveFn` para testeabilidad) para obtener `{ symbol, currency, source }`. RUN numérico → `cmf` (CLP); ETF US → `alphavantage`/`yahoo` (USD).
- **Normalización de pesos:** igual que `expandRecommendation` — clases no reconocidas se ignoran y el resto se re-normaliza a 100.
- **Marcado de sustitución (2 momentos):**
  - **En expand:** `ticker === null` (Caja u otra posición sin instrumento) → se emite directamente el proxy de su clase con `substituted: true`.
  - **En la ruta (tras el fetch):** si un ticker real devolvió **serie vacía** de precios, la ruta lo swap-ea por el proxy de su clase antes de computar. (La sustitución por hueco de un mes puntual ya la maneja `computeRecommendedMonthlyReturnsCLP` vía renormalización — eso no cambia.)

### 3.2 `app/api/portfolio/recommended-evolution/route.ts` (modificado)

Devuelve **dos** series:

```jsonc
{ "series": { "returns": {...}, "accumulated": n, "label": "Recomendado" },       // real (compat: `series` se mantiene)
  "benchmarkProxy": { "returns": {...}, "accumulated": n, "label": "Proxy mercado" } }
```

Flujo:
1. Lee `cartera_recomendada`. Deriva `cartera[]` (real) y `classWeights` (para el proxy, igual que hoy).
2. `realComponents = expandRealInstruments(cartera, resolveSource)`; `proxyComponents = expandRecommendation(classWeights)`.
3. Rango de fechas + `monthEnds` (sin cambios).
4. **Un** fetch de precios para la **unión** de tickers de ambas listas (dedup): USD observado, UF (si aplica), y `getMarketTickerPrices` por ticker único.
5. **Swap por serie vacía:** para cada `realComponent` cuyo ticker quedó sin precios, sustituir por el proxy de su clase (marcando `substituted`), y asegurar que ese proxy esté en `pricesByTicker`.
6. `computeRecommendedMonthlyReturnsCLP(realComponents, ...)` → serie **recommended**; `computeRecommendedMonthlyReturnsCLP(proxyComponents, ...)` → serie **benchmarkProxy**.
7. Responder ambas. Si no hay recomendación → `{ series: null, benchmarkProxy: null }` (igual que hoy para `series`).

> Backward-compat: el campo `series` (real) reemplaza al proxy que hoy va ahí. Consumidores existentes que leen `data.series.returns` siguen funcionando; ahora reflejan instrumentos reales.

### 3.3 Persistencia del modo

- **Migración** `supabase/migrations/20260727_benchmark_mode.sql`: `ALTER TABLE clients ADD COLUMN benchmark_mode text NOT NULL DEFAULT 'uf_spread';` (+ `CHECK (benchmark_mode IN ('uf_spread','market_proxy'))`).
- **`GET/PUT /api/benchmark/config`** (extender): el GET incluye `benchmark_mode`; el PUT acepta `benchmark_mode` opcional y lo persiste. No cambia el manejo de `benchmark_config` (components).

### 3.4 `components/seguimiento/hooks/useBenchmarkConfig.ts` (modificado)

- Al parsear la respuesta de `recommended-evolution`, guardar también `benchmarkProxyReturns` (de `benchmarkProxy.returns`).
- Exponer `benchmarkMode` (`'uf_spread' | 'market_proxy'`, seed desde el GET de config) y `setBenchmarkMode(mode)` que hace `PUT /api/benchmark/config` con `benchmark_mode` y actualiza el estado local.
- Nuevo retorno: `benchmarkProxyReturns`, `benchmarkMode`, `setBenchmarkMode`.

### 3.5 `components/seguimiento/RetornosComparados.tsx` (modificado)

- Nuevas props: `benchmarkProxyReturns?: Record<string, number>`, `benchmarkMode?: 'uf_spread' | 'market_proxy'`, `onBenchmarkModeChange?: (m) => void`.
- **Selección de la línea de benchmark:** si `benchmarkMode === 'market_proxy'` y hay `benchmarkProxyReturns`, la línea de **Benchmark** usa esos retornos y el label pasa a **"Proxy de mercado"**; si no, sigue con `benchmarkReturns` (UF+2%) y su label actual.
- **Toggle UI:** pill de dos estados en el header del componente (junto al título), estilo consistente con el toggle de `HoldingReturnsPanel`. `onClick` → `onBenchmarkModeChange`. Deshabilitado (con tooltip) si no hay `benchmarkProxyReturns` (p. ej. cliente sin recomendación guardada).
- `SeguimientoPage.tsx` cablea las props nuevas desde `useBenchmarkConfig`.

## 4. Data flow

```
clients.cartera_recomendada.cartera[]
   → expandRealInstruments(resolveSource)  →  realComponents (real + Caja→UF)
                                                     │
clients.cartera_recomendada (classWeights)          │  (un solo fetch de precios: unión de tickers)
   → expandRecommendation                → proxyComponents
                                                     │
   getMarketTickerPrices / BCCH (USD, UF) ───────────┤
                                                     ▼
        computeRecommendedMonthlyReturnsCLP ×2  →  { recommended, benchmarkProxy }
                                                     │
useBenchmarkConfig ──────────────────────────────────┤ (+ benchmark_mode del config)
                                                     ▼
RetornosComparados:  Portafolio · [Benchmark = UF+2% ↔ Proxy]  · Recomendado (cobre)
```

## 5. Manejo de errores / casos borde

- **Sin recomendación guardada** (`cartera_recomendada` nula o sin `cartera[]`): ambas series `null`; el toggle queda deshabilitado en "UF+2%". Igual que hoy.
- **Cliente sin cartolas / < 2 cierres:** `series: null` (sin cambios respecto al comportamiento actual).
- **Instrumento sin precios:** swap por proxy de clase (§3.1). Si además el proxy no cotiza un mes, `computeRecommendedMonthlyReturnsCLP` renormaliza por peso cubierto.
- **`benchmark_mode` inválido en BD:** el CHECK lo impide; el front trata cualquier valor no `market_proxy` como `uf_spread`.
- **Moneda:** un ETF USD real revaloriza en CLP con el dólar observado (misma convención que el proxy actual); un fondo chileno (RUN) es CLP directo.

## 6. Testing

- **`lib/prices/recommended-real.test.ts`** (nuevo):
  - Mezcla ETF USD (`VOO`) + fondo CLP (RUN) + Caja `null` → 3 componentes; pesos globales suman 1; la Caja emite proxy `UF` con `substituted: true`.
  - Clase no reconocida se ignora y el resto re-normaliza.
  - `resolveFn` inyectado (mock) para no pegarle a la red.
- **Reuso:** los tests actuales de `computeRecommendedMonthlyReturnsCLP` y `expandRecommendation` cubren el cálculo y el proxy (sin cambios).
- **Typecheck** `npx tsc --noEmit` → exit 0 tras cada tarea.
- **Verificación E2E** (preview/local): cliente con recomendación guardada (p. ej. el de prueba del sub-proyecto A) → la serie "Recomendado" refleja los ETFs reales; el toggle cambia la línea de Benchmark entre UF+2% y Proxy y **persiste** al recargar.

## 7. Reuso (no reinventar)

- `computeRecommendedMonthlyReturnsCLP`, `buildMonthEnds`, `RECOMMENDED_PROXIES`, `expandRecommendation` de `lib/prices/recommended-proxies.ts`.
- `getMarketTickerPrices`, `fetchBcchDailyPrices` de `lib/prices/market-series.ts`.
- `resolveSource` de `lib/prices/price-service.ts` (routing de fuente/moneda).
- Patrón de toggle-pill de `HoldingReturnsPanel`; patrón GET/PUT de `/api/benchmark/config`.
