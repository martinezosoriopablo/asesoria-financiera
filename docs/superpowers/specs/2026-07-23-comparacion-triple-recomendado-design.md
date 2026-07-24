# Comparación triple: Recomendado vs Inicial vs Mercado

**Fecha:** 2026-07-23
**Estado:** Diseño aprobado (pendiente revisión del spec)
**Contexto:** Seguimiento — cierre de la serie de consistencia de moneda (ver [[project_moneda_reporte_seguimiento]]).

## Problema

Hoy la comparación del portafolio del cliente vive en tres piezas separadas:

- **ComparacionBar** — composición actual vs recomendada (% por clase, estático). Es *asignación*, no retorno.
- **BaselineComparison** — snapshot inicial vs actual (valores/composición, punto a punto).
- **RetornosComparados** — retornos mensuales + acumulado de **3 series**: Portafolio (real), UF+2% (mercado) y **Portfolio Inicial** (revalorización real del baseline vía `baseline-evolution`).

Falta la 4ª línea que cierra la historia para el asesor: **cuánto habría rendido la estrategia RECOMENDADA en el mercado**, en el tiempo, junto a las otras tres. Con eso el asesor responde de un vistazo: *¿la recomendación bate a lo que el cliente tenía (Inicial) y al mercado (UF+2%)?*

## Objetivo

Agregar la serie **Recomendado** a `RetornosComparados`, de modo que muestre 4 series de retorno (mensual + acumulado), todas en la moneda que gobierna el toggle (CLP/USD/UF):

1. **Portafolio** (verde) — retorno real del cliente.
2. **Recomendado** (cobre `#EB7838`) — estrategia recomendada revalorizada a mercado. **NUEVO.**
3. **Portfolio Inicial** (naranja) — baseline revalorizado.
4. **UF +2%** (amarillo) — benchmark de mercado.

## Decisiones de diseño

### Método del Recomendado: estrategia en el mercado (real)

`cartera_recomendada` es **nivel-clase** (RV/RF/Alt/Caja %), sin tickers por instrumento. Para obtener su retorno en el tiempo, se pondera cada clase por un **índice de mercado representativo** y se revaloriza con precios reales. Es el rendimiento REAL de mercado de la estrategia recomendada — consistente con la línea "Inicial", que también es una revalorización real.

Descartadas: (A) "efecto asignación" con los retornos por clase del propio cliente — es hipotético, no mercado real; (C) revalorizar los ETFs concretos del modelo del comité — requiere mapear la recomendación a un perfil de modelo con ETFs, mucho más trabajo.

### Mapa clase → índice (blend ponderado)

Cada clase mapea a una **mezcla ponderada** de tickers (no un solo ticker), para que Alternativos sea honesto (oro + REITs, no solo oro). Vive en `lib/prices/recommended-proxies.ts` como constante ajustable.

| Clase (`cartera_recomendada`) | Proxy | Composición |
|---|---|---|
| Renta Variable | Acciones globales (MSCI ACWI) | `ACWI` 100% |
| Renta Fija | Bonos agregados US | `AGG` 100% |
| Alternativos | Oro + REIT global | `GLD` 50% / `RWO` 50% |
| Caja | UF (money-market proxy) | `UF` +0 |

Notas:
- **ACWI** (no VT): alinea con el benchmarking MSCI del comité. Ambos son acciones globales incl. emergentes; ACWI = large/mid MSCI, VT = FTSE all-cap más ancho.
- **AGG** es US aggregate; si se quisiera RF global se agrega `BNDX` al blend. Ajustable.
- Los nombres de clase se normalizan (acentos/mayúsculas) antes de mapear. Clases no reconocidas se ignoran (no contribuyen) y se re-normalizan los pesos sobre las clases mapeadas para que sumen 100%.

### Cálculo — nuevo endpoint `POST /api/portfolio/recommended-evolution`

Paralelo a `baseline-evolution`. Autenticado (`requireAuth` + verificación de acceso al cliente).

**Input:** `{ clientId }`.

**Proceso:**
1. Lee `cartera_recomendada` del cliente. Si no existe → `{ success: true, series: null }` (la línea no se dibuja).
2. Extrae pesos por clase (`cartera: [{clase, porcentaje}]`, o `equity_percent`/`fixed_income_percent` como fallback, mismo patrón que `check-drift`).
3. Expande cada clase a su blend de tickers vía `RECOMMENDED_PROXIES`, multiplicando peso-de-clase × peso-dentro-del-blend → lista consolidada `BenchmarkComponent[]`.
4. Rango de fechas: desde la primera cartola real del cliente (`source in manual/statement/excel`) hasta hoy.
5. Para cada ticker de mercado: fetch de la serie vía price-service (`resolveSource` + `getStoredPrices`/`fetchPriceRange` + `storeInternationalPrices`), y **convierte la serie a CLP** con el dólar observado (T+1) para tickers USD. `UF` se maneja como en `benchmark-returns` (inflación real de la UF + spread → ya es CLP).
6. Calcula el **retorno mensual en CLP** de cada ticker (mes contra mes, cierre de mes, `findClosestPrice` con ventana 7 días), pondera por su peso consolidado y suma → `returns: Record<"YYYY-MM", number>` en **CLP nominal**.
7. `accumulated` = compuesto de los meses. `label` = "Recomendado".

**Output:** `{ success: true, series: { returns, accumulated, label } }`.

**Por qué CLP y no la moneda nativa del ticker:** CLP es la moneda canónica interna; Portafolio e Inicial también son CLP y el front las re-basa a R con `fxRateAt`. Devolver CLP mantiene las 4 líneas en la misma base y evita el FX espurio (un ETF USD daría retorno USD que el front re-basaría mal si lo tratara como CLP). Por eso NO se reutiliza `benchmark-returns` tal cual (devuelve moneda nativa) — se usa su misma mecánica pero con conversión a CLP.

### Front — hook `useBenchmarkConfig`

Nuevo `useEffect` (espejo del de `baseline-evolution`): cuando hay `clientId` y snapshots, hace `POST /api/portfolio/recommended-evolution`, guarda `recommendedReturns` (Record) y `recommendedAccReturn`. Se expone en el retorno del hook.

Condición de fetch: sólo si el cliente tiene `cartera_recomendada` (se puede inferir de `seg.recommendation`, ya disponible en la página). Si no, queda `undefined` y la serie no aparece.

### Front — `RetornosComparados`

Nueva prop `recommendedReturns?: Record<string, number>` + `recommendedLabel = "Recomendado"`. Se agrega como **4ª serie**:

- `MonthData` gana `recommended: number | null`.
- Re-base idéntico: `rebaseCLP(recReturn, dates.start, dates.end)` con `fxRateAt` — mismo transform que benchmark y comparison.
- Acumulado = compuesto de los meses (igual que las demás).
- Barra **cobre `#EB7838`**, 4ª tarjeta de acumulado, columna en la tabla resumen.
- Guard `hasRecommended = chartData.some(d => d.recommended != null)` para render condicional (como `hasBenchmark`/`hasComparison`).

Quedan 4 barras por mes: Portafolio · Recomendado · Portfolio Inicial · UF+2%. Si resulta cargado visualmente, se puede migrar la vista mensual a líneas acumuladas en una iteración posterior — fuera de alcance de este spec.

### Front — `SeguimientoPage`

Pasa `recommendedReturns={recommendedReturns}` a `RetornosComparados` (junto a las props ya existentes: `benchmarkReturns`, `comparisonReturns=baselineMonthlyReturns`, `displayCurrency`, `fxRateAt`).

## Consistencia de moneda

El endpoint devuelve **CLP nominal**. El front re-basa CLP→R con `fxRateAt` a las fechas de cada mes, idéntico a Portafolio e Inicial. Las 4 líneas viven en la moneda del toggle sin FX espurio. En CLP quedan tal cual; en USD/UF se ajustan por el FX real de cada punta.

## Manejo de errores / bordes

- **Sin `cartera_recomendada`** → serie null, línea no se dibuja (las otras 3 siguen).
- **Sin precios de un ticker** (fetch vacío) → ese ticker no contribuye; se re-normalizan los pesos restantes del mes para no subvalorar. (Si TODO el blend falla, el mes queda sin dato → barra "—".)
- **Sin cartola real** → no hay rango; serie vacía.
- **Falla BCCH/price-service** → se degrada como el resto (la línea puede no aparecer; nunca rompe la página).

## Testing

- Unit del cálculo de retornos mensuales ponderados en CLP (pesos de clase × blend, conversión USD→CLP, re-normalización cuando falta un ticker). Fixtures de precios en memoria (sin red).
- `resolveSource` ya cubierto; `RECOMMENDED_PROXIES` es data — un test de sanidad de que las clases conocidas mapean y suman 100%.
- Verificación manual en localhost con un cliente con recomendación y ≥2 cartolas (Felipe Fortt / B&B), CLP y USD: la línea Recomendado aparece, acumulado coherente, re-base correcto entre monedas.

## Fuera de alcance

- Migrar la vista mensual de barras a líneas (posible iteración futura).
- Unificar ComparacionBar/BaselineComparison en la misma vista (siguen como están; esto sólo agrega la serie de retorno del recomendado).
- Editor UI del mapa de proxies (por ahora constante en código).
