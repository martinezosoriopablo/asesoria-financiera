# Recomendación — vehículos por clase (carteras mixtas: acciones y bonos directos)

**Fecha:** 2026-08-04
**Alcance:** mediano. Permitir que la recomendación (pestaña "Construir recomendación", tabla Comité | Mis Fondos | Decisión) se arme con **acciones y bonos directos**, no solo fondos/ETFs, sin ensuciar el flujo fila-por-fila. Se elige el **vehículo por clase de activo** una vez, al arranque.

## Contexto (estado actual, verificado en código y datos)

- La **Radiografía** (`/api/portfolio/radiografia`) ya clasifica TODO lo que el cliente tiene —acciones, bonos, ETFs, FFMM/FI, caja— en las 16 categorías del comité vía `classifyHolding` (`lib/comite-categories.ts`). El caso mixto ya cae ordenado en los mismos sleeves del lado del diagnóstico.
- La **Construir recomendación** arma el target por sleeve del comité y, por cada uno, la **Decisión** hoy solo permite: `mi_fondo` | `comite_etf` | `custom` (buscar fondo) | `caja`. No hay forma de recomendar/mantener un instrumento **directo**.
- El **comité** (`model_portfolios`) produce, por perfil:
  - `posiciones` (14 sleeves): clase de activo → **ETF** (`etf_us`/`etf_ucits`) + `vista` + `conviction` + `justificacion` + `modelo_pct`.
  - `sleeves` (4): tilts **por sector** → `{ sector, region, vista, conviction, etf_us, etf_ucits, tesis, peso_pct }`.
  - **NO** emite acciones ni bonos individuales. La unidad recomendada es siempre un ETF (amplio o sectorial).
- Los fondos preferidos del asesor viven en `advisor_preferred_funds` (`category` texto libre → sleeve vía `PREFERRED_TO_COMITE` + normalización de etiqueta, arreglada en commit 5d39571).

## Enfoque elegido (opción C — híbrido)

**El comité da la dirección (vista por sector / duración-crédito); el asesor elige el instrumento concreto desde su lista preferida, y además puede mantener lo que el cliente ya tiene.** No se agrega complejidad por fila: se pregunta el vehículo **una vez por clase** y la columna del medio se vuelve "vehículo-aware".

Descartado explícitamente (YAGNI): que el comité empiece a emitir acciones/bonos individuales (opción B). Se usan solo sus vistas por sector, que ya existen.

## Diseño

### 1. Config de vehículo por clase (setup, se pregunta una vez)

- Nuevo campo `clients.recomendacion_vehiculos` (JSONB), forma:
  `{ "rv": "fondos"|"etf"|"directo", "rf": "fondos"|"etf"|"directo", "alt": "fondos"|"etf"|"directo" }`.
- **Default / ausente = todo `fondos`** → comportamiento idéntico al actual (retrocompatible).
- UI: 3 toggles chicos en el header de `RecomendacionConstruir`, al lado de las casillas de Custodio existentes ("Vehículo — RV: [Fondos|ETF|Directo] · RF: […] · Alt: […]"). Cambiarlos persiste vía `PATCH /api/clients/[id]` y re-arma la tabla. La primera vez (config nula) los toggles se muestran resaltados como "Definí cómo invierte este cliente"; no es un modal bloqueante.

### 2. Lista de instrumentos preferidos (único dato nuevo)

- Extender `advisor_preferred_funds` (aditivo, retrocompatible):
  - `instrument_type text not null default 'fund'` — `fund` | `stock` | `bond`.
  - `sector text null` — solo acciones (ej. `technology`, `financials`), para cruzar con la vista del comité.
- Semántica de `category` por tipo (reusa el match `category → sleeve` ya normalizado):
  - `stock`: `category` = geografía → sleeve RV (ej. "RV USA", "RV Nacional"); `sector` = sector para el tag de vista.
  - `bond`: `category` = sleeve RF (ej. "RF USA"/"UST belly"/"High Yield").
  - `fund`: sin cambios.
- Gestión en `/advisor/fondos`: filtro/solapa por tipo (Fondos / Acciones / Bonos); el formulario muestra `sector` solo para acciones. `custodian_type` sigue aplicando (una acción/bono se compra en corredora/internacional).

### 3. Columna del medio "vehículo-aware" (`resolveMisFondos` → `resolveMisInstrumentos`)

Generalizar el resolver actual a `resolveMisInstrumentos(input)` que devuelve `MiInstrumentoOption[]` según el vehículo de la clase del sleeve:

- **`fondos`** → fondos preferidos del sleeve (lógica actual intacta).
- **`etf`** → ETF del comité del sleeve: `etf_us`/`etf_ucits` del `posicion`, y si hay tilt sectorial del sleeve, también el `etf_us` sectorial.
- **`directo` + rol RV** → dos orígenes combinados:
  1. `origen: "actual"` — acciones que el cliente **ya tiene** clasificadas en ese sleeve (desde el snapshot más reciente vía `classifyHolding`), con su `weightPct`, badge "YA LO TIENE".
  2. `origen: "preferido"` — acciones preferidas del asesor cuyo `category` mapea al sleeve, badge "MI ACCIÓN".
  Cada opción se **tagea con la vista sectorial del comité** buscando en `model_portfolios.sleeves` por `sector` (ej. `NVDA · tech: OW comité`). Si no hay match de sector, sin tag.
- **`directo` + rol RF** → igual, con **bonos**: los que el cliente ya tiene en ese sleeve RF + los bonos preferidos del asesor del sleeve. Tag = vista de duración/crédito del `posicion` del sleeve (ej. `belly: N comité`).

`MiInstrumentoOption` (generaliza `MiFondoOption`):
```
{ id, tipo: "fund"|"stock"|"bond"|"etf", ticker, fund_run|null, nombre,
  custodian_type, tac|null, rent_12m|null, isMapped,
  origen: "preferido"|"actual"|"comite", sector|null,
  vista_comite: string|null,   // "OW" | "UW" | "N" | null
  weight_pct|null }            // solo origen "actual"
```

### 4. Decisión

- `DecisionFuente` suma `accion` | `bono` (junto a `mi_fondo`/`comite_etf`/`custom`/`caja`).
- `Decision` suma `sector?: string | null`.
- `defaultDecision` extendido por vehículo:
  - `fondos` → mejor fondo (actual).
  - `etf` → ETF del comité del sleeve.
  - `directo` → si el cliente ya tiene una posición en el sleeve, se sugiere **mantenerla** (`accion`/`bono`, origen actual); si no, la primera preferida; si no hay, `caja`.
- La UI de la tabla (`RecomendacionTable`) renderiza las opciones genéricamente con badges `MI FONDO` / `MI ACCIÓN` / `YA LO TIENE (x%)` / vista comité; elegir una setea la Decisión con el `fuente` correcto. Buscar/caja/peso siguen igual. **La recomendación sigue siendo editable en todo momento.**

## Data flow

1. `GET /api/comite/recomendacion?clientId=…` (extendido):
   - lee `clients.recomendacion_vehiculos` (default fondos).
   - carga `advisor_preferred_funds` del asesor (todos los tipos) + enriquece FM/FI (getFichaMetrics, solo `fund`).
   - si alguna clase = `directo`: carga holdings del snapshot más reciente (excluye `source='api-prices'`) y los clasifica por sleeve con `classifyHolding`; carga `model_portfolios.sleeves` para las vistas sectoriales.
   - por cada `posicion` con `modelo_pct>0`: resuelve sleeve (`resolveCategoria`), arma columna Comité, llama `resolveMisInstrumentos` con el vehículo de la clase, y `defaultDecision`.
2. La UI persiste cambios de vehículo con `PATCH /api/clients/[id]` (`recomendacion_vehiculos`) y refetch.
3. Guardar la recomendación: sin cambios (`POST /api/comite/aplicar-cartera`, la Decisión ya lleva ticker/nombre/clase/peso; los nuevos `fuente` accion/bono se guardan igual en `cartera_recomendada`).

## Manejo de errores / bordes

- `recomendacion_vehiculos` nulo → todo `fondos` → idéntico a hoy (retrocompatibilidad total; ningún cliente existente cambia).
- Clase `directo` sin acciones/bonos preferidos y sin holdings actuales en el sleeve → "Sin equivalente" → default `caja` (el asesor busca).
- Sin snapshot / sin holdings → `directo` funciona igual con la lista preferida; simplemente no hay origen "actual".
- Sector de la acción sin match en `sleeves` del comité → opción sin tag (no rompe).
- `alt` en `directo` es raro: se permite (usa lista preferida + holdings), sin lógica especial.

## Testing

- **Unit (`resolve.test.ts` / nuevo `resolve-instrumentos.test.ts`):**
  - `resolveMisInstrumentos` para cada vehículo: `fondos` (idéntico al actual), `etf` (devuelve ETF del sleeve), `directo`+RV (combina actual+preferido, aplica tag de sector), `directo`+RF (bonos).
  - Tag de vista sectorial: acción con `sector=technology` matchea el `sleeves` OW tech → `vista_comite="OW"`.
  - `defaultDecision` por vehículo (incluye "mantener" cuando hay holding actual).
  - Retrocompat: sin `recomendacion_vehiculos` → ruta y salida idénticas a hoy (mismo set de tests que ya pasa).
- **tsc** limpio.
- **Verificación manual** en un cliente con cartera mixta real: setear RV=directo, confirmar que aparecen sus acciones actuales ("YA LO TIENE") + preferidas con tag de sector, y que se pueden elegir/mantener/editar.

## Archivos afectados (estimado)

- `supabase/migrations/` — nueva migración: `clients.recomendacion_vehiculos` (jsonb), `advisor_preferred_funds.instrument_type` + `.sector`.
- `lib/recomendacion/resolve.ts` + `types.ts` — `resolveMisInstrumentos`, `MiInstrumentoOption`, `DecisionFuente` (+accion/bono), `defaultDecision`.
- `lib/comite-categories.ts` — helper para leer vistas sectoriales de `sleeves` (mapa sector→vista), reuso de `classifyHolding`.
- `app/api/comite/recomendacion/route.ts` — leer vehículos, cargar holdings actuales + sleeves, pasar al resolver.
- `app/api/clients/[id]/route.ts` — aceptar `recomendacion_vehiculos` en PATCH.
- `components/recomendacion/RecomendacionConstruir.tsx` — toggles de vehículo en el header.
- `components/recomendacion/RecomendacionTable.tsx` — render genérico de opciones + badges + fuentes accion/bono.
- `app/(advisor-shell)/advisor/fondos/…` + `app/api/advisor/preferred-funds/…` — gestión de acciones/bonos (tipo + sector).

## Fuera de alcance

- Que el comité emita acciones/bonos individuales (se usan solo sus vistas por sector).
- Rebalanceo automático / plan de trades entre lo actual y el target (sigue en la Radiografía tal como está).
- Valorización de mercado de la cartera recomendada con instrumentos directos (la serie "Recomendado" sigue con proxies por clase).
