# Consistent Pricing Model & Initial Portfolio Evolution

> **Principle**: El precio de adquisicion siempre viene de la cartola. Los precios de mercado vienen del price service unificado. Todos los componentes usan las mismas fuentes. El portfolio inicial se revaloriza a mercado para medir el valor de la asesoria.

## Problem

### 1. Inconsistencia de fuentes de precios

Actualmente HoldingReturnsPanel hace llamadas directas a Yahoo, Fintual y FINRA, bypaseando el price service unificado (`lib/prices/`). Como PerformanceAttribution y RentabilidadPorActivo (modo acumulado) dependen de `holdingReturnsData` que viene de HoldingReturnsPanel, la inconsistencia se propaga. Un mismo holding puede mostrar retornos distintos en EvolucionChart vs HoldingReturnsPanel.

### 2. Modelo de costo base no definido

No existe una regla clara sobre cual es el "precio inicial" de una posicion. Algunos componentes usan `unitCost`, otros `costBasis`, otros `marketPrice` del snapshot. Debe haber una sola regla: el precio de la cartola es el costo base, y se mantiene mientras la quantity no cambie.

### 3. Portfolio inicial no se revaloriza

El baseline (`is_baseline` en `portfolio_snapshots`) solo se usa para comparacion estatica de allocation (BaselineComparison). No existe una curva de "como te habria ido sin asesoria" revalorizada a precios de mercado.

## Design Decisions

### D1: Modelo de costo base por posicion

**Regla**: El precio de adquisicion siempre viene de la cartola. No del precio de mercado del dia de compra.

- El precio de mercado (cierre) puede diferir del precio real de transaccion, especialmente en dias volatiles
- La cartola refleja el precio real al que el cliente adquirio

**Persistencia del costo base entre cartolas**:

| Escenario | Accion |
|---|---|
| Posicion existe en cartola anterior, **misma quantity** en cartola nueva | Mantener costo base de la cartola anterior |
| Posicion existe en cartola anterior, **quantity cambio** en cartola nueva | Nuevo costo base = precio de la cartola nueva |
| Posicion **nueva** (no existia antes) | Costo base = precio de la cartola nueva |
| Posicion **desaparece** de la cartola nueva | Se considera vendida, no contribuye a retornos futuros |

**Deteccion de cambio**: Se compara `quantity` (cuotas/acciones) entre cartolas sucesivas del mismo custodio. No se compara `marketValue` porque ese varia con el precio spot.

**Campo a usar**: `marketPrice` de la cartola como precio unitario de adquisicion (precio por cuota/accion). Si no existe, calcular `marketValue / quantity`.

### D2: Dos tipos de retorno

**Retorno acumulado (desde adquisicion)**:
```
retorno = (precio_mercado_hoy - precio_cartola) / precio_cartola
```
- `precio_cartola` = costo base segun reglas de D1
- `precio_mercado_hoy` = price service unificado

**Retornos intermedios (periodo a periodo)**:
```
retorno_mes = (precio_mercado_fin - precio_mercado_inicio) / precio_mercado_inicio
```
- Ambos precios vienen del price service
- Conceptualmente: "vendes y recompras cada dia", el costo base del dia siguiente es el cierre anterior
- Aplica para barras mensuales (RentabilidadPorActivo), periodos (RetornosComparados), etc.

### D3: Todas las fuentes de precios pasan por el price service

**Antes**: HoldingReturnsPanel hacia llamadas directas a Yahoo/Fintual/FINRA.

**Despues**: Todos los componentes obtienen precios de mercado via las API routes centralizadas que usan `lib/prices/price-service.ts`:

| Necesidad | API Route | Price Service |
|---|---|---|
| Precio actual de un holding | `GET /api/prices/quote` | `fetchLatestPrice()` |
| Precios en dos fechas (retorno) | `POST /api/portfolio/prices-at-date` | `resolveSource()` + `fetchPriceRange()` |
| Serie historica del portfolio | `POST /api/portfolio/historical-prices` | `resolveSource()` + backfill |
| Precios de benchmark | `GET /api/prices/historical` | AlphaVantage/Yahoo/BCCH |

**Eliminado**: Llamadas directas a Yahoo (`yahoo-finance2`), Fintual API, o FINRA desde componentes frontend.

### D4: Tracking de costo base en snapshots

Nuevo campo `cost_basis` en los holdings del snapshot (dentro del JSONB `holdings`):

```typescript
interface SnapshotHolding {
  // ... campos existentes
  costBasis: number;      // precio unitario de adquisicion (de cartola)
  costBasisDate: string;  // fecha de la cartola que fijo este costo base (YYYY-MM-DD)
}
```

**Calculo al guardar snapshot**:
1. Obtener snapshot anterior del mismo cliente (y custodio si aplica)
2. Para cada holding en el nuevo snapshot:
   - Buscar mismo instrumento en snapshot anterior (match por RUN+serie, securityId, o CUSIP)
   - Si existe y `quantity` es igual: copiar `costBasis` y `costBasisDate` del anterior
   - Si existe y `quantity` cambio: `costBasis = marketPrice` (o `marketValue/quantity`), `costBasisDate = snapshot_date`
   - Si no existe (nueva posicion): `costBasis = marketPrice`, `costBasisDate = snapshot_date`

**Backfill**: Para snapshots existentes sin `costBasis`, correr un script que procese cronologicamente y aplique las mismas reglas.

### D5: Evolucion del portfolio inicial (baseline)

**Concepto**: El snapshot marcado `is_baseline = true` define la composicion del portfolio que el cliente tenia antes de la asesoria. Se revaloriza a precios de mercado actuales para responder: "como te habria ido si no hubieras cambiado nada".

**Implementacion**:
- Usar el mismo `POST /api/portfolio/historical-prices` API, pasando los holdings del baseline
- Esto genera una serie temporal: valor del portfolio inicial valorizado a mercado cada dia
- La serie se calcula desde la fecha del baseline hasta hoy

**Nuevo endpoint** (o extension del existente):
```
POST /api/portfolio/baseline-evolution
Body: { clientId: string }
Response: { series: { date: string, value: number }[], baselineDate: string, baselineValue: number }
```

Internamente:
1. Obtener snapshot con `is_baseline = true` para el cliente
2. Extraer holdings con sus quantities
3. Llamar `historical-prices` con esos holdings fijos (no cambian en el tiempo)
4. Retornar serie temporal

### D6: Tres lineas en Seguimiento

**EvolucionChart** muestra 3 series:
1. **Portfolio actual** (linea verde) — ya existe, viene de `historicalSeries`
2. **Portfolio inicial** (linea gris/naranja) — nueva, viene de `baseline-evolution`
3. **Benchmark** (linea amarilla punteada) — ya existe parcialmente, viene de benchmark config

**RetornosComparados** muestra 3 barras por mes:
1. **Portfolio actual** (verde) — ya existe
2. **Portfolio inicial** (naranja) — usa `comparisonReturns` prop (ya existe el slot, no se usa)
3. **Benchmark** (amarillo) — ya existe

**Summary Cards** agregan una linea comparativa:
- "Tu portfolio: +8.2% | Sin cambios: +3.1% | Benchmark: +5.0%"

## Component Changes

### HoldingReturnsPanel (cambio mayor)

**Antes**: Fetch directo a Yahoo/Fintual/FINRA para cada holding.

**Despues**:
1. Obtener costo base de cada holding desde el snapshot (`costBasis` field)
2. Obtener precios actuales via `POST /api/portfolio/prices-at-date` (una sola llamada con todos los holdings)
3. Calcular retorno acumulado: `(precio_mercado - costBasis) / costBasis`
4. Exponer `holdingReturnsData` con la misma interfaz para que PerformanceAttribution y RentabilidadPorActivo no cambien

**Eliminado**: Toda logica de fetch directo a Yahoo, Fintual, FINRA. Logica de deteccion de moneda CLP/USD (se mueve al price service si no esta).

### PerformanceAttribution (cambio menor)

- Sigue consumiendo `holdingReturnsData` de HoldingReturnsPanel
- Como HoldingReturnsPanel ahora usa price service, los numeros seran consistentes automaticamente
- Sin cambios de interfaz

### RentabilidadPorActivo (sin cambios)

- Modo acumulado: ya usa `holdingReturnsData` (consistente via HoldingReturnsPanel)
- Meses pasados: ya usa `prices-at-date` API (consistente)
- Sin cambios necesarios

### EvolucionChart (cambio menor)

- Agregar segunda serie (`baselineSeries`) como prop opcional
- Agregar tercera serie (`benchmarkSeries`) como prop opcional
- Leyenda: "Portfolio Actual", "Portfolio Inicial", "Benchmark"
- Colores: verde, naranja, amarillo punteado

### RetornosComparados (cambio menor)

- Pasar retornos del baseline via `comparisonReturns` prop (ya existe)
- Cambiar label default de comparador a "Portfolio Inicial"
- Sin cambios estructurales

### SeguimientoPage (orquestacion)

- Fetch baseline evolution al cargar (si hay baseline distinto del snapshot actual)
- Distribuir `baselineSeries` a EvolucionChart
- Calcular `comparisonReturns` mensuales desde baselineSeries y pasarlos a RetornosComparados
- Agregar linea comparativa a Summary Cards

### BaselineComparison (deprecar o simplificar)

- La comparacion estatica de allocation se vuelve menos relevante si tenemos la curva de evolucion
- Evaluar si mantener como complemento visual o remover para evitar duplicacion

## Snapshot Save Flow (cost basis)

Al guardar un snapshot nuevo (POST /api/portfolio/snapshots):

```
1. Recibir nuevo snapshot con holdings[]
2. Obtener snapshot anterior del cliente (mismo custodio si aplica)
3. Para cada holding en nuevo snapshot:
   a. Buscar match en snapshot anterior (por instrumentId/RUN/securityId)
   b. Si match encontrado Y quantity igual:
      - holding.costBasis = anterior.costBasis
      - holding.costBasisDate = anterior.costBasisDate
   c. Si match encontrado Y quantity diferente:
      - holding.costBasis = holding.marketPrice || (holding.marketValue / holding.quantity)
      - holding.costBasisDate = snapshot.snapshot_date
   d. Si no hay match (posicion nueva):
      - holding.costBasis = holding.marketPrice || (holding.marketValue / holding.quantity)
      - holding.costBasisDate = snapshot.snapshot_date
4. Guardar snapshot con holdings enriquecidos
5. Si es primer snapshot del cliente: marcar is_baseline = true
```

## Data Flow Diagram

```
Cartola (upload/manual)
    |
    v
POST /api/portfolio/snapshots
    |-- cost basis calculation (D1/D4)
    |-- is_baseline auto-set (first snapshot)
    |
    v
portfolio_snapshots (DB)
    |
    +---> SeguimientoPage
            |
            |-- holdings con costBasis
            |       |
            |       v
            |   HoldingReturnsPanel
            |       |-- POST /api/portfolio/prices-at-date --> price-service --> AV/Yahoo/CMF
            |       |-- retorno = (mercado - costBasis) / costBasis
            |       |
            |       v
            |   holdingReturnsData
            |       |-- PerformanceAttribution (consume)
            |       |-- RentabilidadPorActivo acumulado (consume)
            |
            |-- POST /api/portfolio/historical-prices --> price-service
            |       |
            |       v
            |   historicalSeries
            |       |-- EvolucionChart (linea verde)
            |       |-- Summary Cards (1M/3M/6M/1Y)
            |       |-- RetornosComparados (barras verdes)
            |
            |-- POST /api/portfolio/baseline-evolution
            |       |
            |       v
            |   baselineSeries
            |       |-- EvolucionChart (linea naranja)
            |       |-- RetornosComparados (barras naranjas via comparisonReturns)
            |       |-- Summary Cards (linea comparativa)
            |
            |-- benchmark config --> /api/prices/historical
                    |
                    v
                benchmarkSeries
                    |-- EvolucionChart (linea amarilla)
                    |-- RetornosComparados (barras amarillas)
```

## Out of Scope

- Cambios al Portfolio Designer o radiografia (proyecto separado)
- Dividendos y ajustes de corporate actions (tracking existente separado)
- TWR, Sharpe, o metricas avanzadas (eliminadas por decision previa)
- Cambios a la UI de BaselineComparison mas alla de evaluar si deprecar
- Backfill script para snapshots existentes (se hara como tarea separada post-implementacion)
