# Consistencia de Retornos en Seguimiento

**Fecha:** 2026-05-29
**Contexto:** Heraldo (Felipe Fortt) muestra 5 numeros distintos de "retorno" en la misma pagina de Seguimiento. Cada seccion calcula con metodologia diferente.

## Problema

| Seccion | Numero | Fuente | Metodologia |
|---------|--------|--------|-------------|
| RentabilidadPorActivo (total) | 3.26% | holdingReturnsData (quotes live vs unitCost) | Ganancia desde compra |
| RentabilidadPorActivo (RV+RF) | 4.70% + 0.57% | Misma fuente | Returns individuales, no suman al total porque son returns no contribuciones |
| HoldingReturnsPanel | 3.57% | Quotes live vs unitCost | Ganancia desde compra (ponderacion diferente?) |
| RetornosComparados (acumulado) | 10.43% | historicalSeries (daily dot-product) | Evolucion precios mercado |
| PerformanceAttribution | 12.6% | metrics.totalReturn (snapshot total_value ratio) | Ratio de totales de cartola |

## Principio rector

- **Precio de adquisicion** (unitCost): lo que pago el cliente. Se respeta siempre como base para ganancia.
- **Precios de mercado**: para valorizar el portafolio cada dia y calcular evolucion.

Estos son conceptos distintos que producen numeros distintos legitimamente. El error es mostrarlos como si fueran lo mismo.

## Diseno: Dos familias de metricas

### Familia A: "Ganancia desde compra"

- **Base:** unitCost (costo de adquisicion del cliente)
- **Valor actual:** precio de mercado hoy (quote live)
- **Formula por holding:** `(marketPrice_hoy / unitCost - 1) * 100`
- **Formula portafolio:** promedio ponderado por valor de mercado actual
- **Fuente unica:** `holdingReturnsData` (calculado en HoldingReturnsPanel)
- **Consistencia:** `holdingReturnsData.portfolioReturn`, `instrumentBreakdown.reduce(sum contributions)`, y PORTFOLIO TOTAL de RentabilidadPorActivo (Acumulado) deben dar el MISMO numero. Si difieren, hay bug de ponderacion.

### Familia B: "Evolucion de mercado"

- **Base:** precio de mercado en fecha de primera cartola
- **Valor actual:** precio de mercado hoy
- **Formula diaria:** `SUM(qty * price_t)` para cada dia
- **Formula mensual:** `valor_fin_mes / valor_fin_mes_anterior - 1`
- **Formula acumulada:** `valor_hoy / valor_primera_fecha - 1`
- **Fuente unica:** `historicalSeries` (del API historical-prices)

## Mapeo de secciones

| Seccion | Familia | Etiqueta nueva | Fuente de datos |
|---------|---------|----------------|-----------------|
| Cards superiores | A | "Costo Total" / "Valor Actual" / "Ganancia" | holdingReturnsData (costBasis, totalValue) |
| HoldingReturnsPanel | A | "Ganancia/Perdida por Posicion" (sin cambio) | holdingReturnsData |
| RentabilidadPorActivo (Acumulado) | A | "Ganancia Acumulada por Activo" | holdingReturnsData.portfolioReturn |
| RentabilidadPorActivo (meses pasados) | B | "Retorno Mensual por Activo" | prices-at-date API (precios de mercado) |
| PerformanceAttribution | A | "Atribucion de Ganancia (desde costo)" | holdingReturnsData via instrumentBreakdown |
| EvolucionChart | B | "Evolucion del Portafolio" (sin cambio) | historicalSeries |
| RetornosComparados | B | "Retorno Mensual vs Benchmark" (sin cambio) | historicalSeries |
| Period returns (1M/3M/6M/1Y) | B | "Retorno del Periodo" (sin cambio) | historicalSeries |

## Cambios concretos

### 1. Consistency fix: Familia A (3.26% vs 3.57%)

**Archivos:** `PerformanceAttribution.tsx`, `RentabilidadPorActivo.tsx`

Investigar y corregir por que `instrumentBreakdown.reduce(sum contributions)` y `holdingReturnsData.portfolioReturn` dan numeros distintos. Probablemente:
- instrumentBreakdown agrupa por assetClass y pondera por peso de la clase
- portfolioReturn pondera por holding individual

Ambos deben usar la misma formula: `SUM(holding_return_i * weight_i)` donde `weight_i = marketValue_i / totalMarketValue`.

### 2. Eliminar metrics.totalReturn como fuente de retornos

**Archivo:** `SeguimientoPage.tsx`

`metrics.totalReturn` (del API seguimiento) calcula `(lastSnapshot.total_value / firstSnapshot.total_value - 1)` usando los totales de la cartola. Esto es una tercera metodologia que no coincide ni con A ni con B. Ya no se pasa como prop a PerformanceAttribution (fix previo). Si se usa en cards, reemplazar por holdingReturnsData.

**Archivo:** `api/clients/[id]/seguimiento/route.ts`

`calculateMetrics()` sigue calculando `totalReturn` para compatibilidad, pero ninguna seccion de retornos lo usa como numero principal. Las cards de valor usan `initialValue`/`currentValue` como fallback cuando holdingReturnsData no esta disponible.

### 3. Relabeling de secciones

**PerformanceAttribution.tsx:**
- Header: "Atribucion de Rendimiento" -> "Atribucion de Ganancia"
- Subtitulo: agregar "(desde costo de adquisicion)"
- "Retorno Total Cartera" -> "Ganancia Total Cartera"

**RentabilidadPorActivo.tsx:**
- Cuando muestra Acumulado: subtitulo "Ganancia desde primera cartola (costo de adquisicion)"
- Cuando muestra mes especifico: subtitulo "Retorno del mes (precios de mercado)"

**RetornosComparados.tsx:**
- Sin cambio en etiqueta (ya dice "Retornos Comparados")
- El acumulado al final de las barras ya se entiende como acumulado de retornos mensuales

### 4. Cards superiores: usar holdingReturnsData

**Archivo:** `SeguimientoPage.tsx` (seccion de cards ~linea 857)

Cuando holdingReturnsData esta disponible:
- "Valor Inicial" -> mostrar costBasis total (SUM de unitCost * qty por holding)
- "Valor Actual" -> holdingReturnsData.totalValue
- "Ganancia" -> portfolioReturn con badge de color

Fallback (sin holdingReturnsData): mantener metrics.initialValue / metrics.currentValue.

## Lo que NO cambia

- Logica interna de HoldingReturnsPanel (ya usa unitCost correctamente)
- Logica de historicalSeries / RetornosComparados (ya usa precios de mercado)
- APIs: historical-prices, prices-at-date, backfill-cmf
- EvolucionChart
- BenchmarkConfig / benchmark returns

## Verificacion

1. `npm run build` — sin errores
2. Caso Fortt: las 3 secciones de Familia A (HoldingReturnsPanel, RentabilidadPorActivo Acumulado, PerformanceAttribution) muestran el MISMO numero
3. RetornosComparados acumulado puede diferir (es Familia B) pero la etiqueta lo deja claro
4. Cada seccion tiene subtitulo indicando si es "desde costo" o "precios de mercado"
