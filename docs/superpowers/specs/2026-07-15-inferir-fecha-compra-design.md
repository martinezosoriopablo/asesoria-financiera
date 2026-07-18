# Inferir fecha de compra desde el precio — Diseño

**Fecha:** 2026-07-15
**Estado:** Aprobado (pendiente review del spec)

## 1. Contexto y problema

Las cartolas traen el **precio de compra** por cuota de cada fondo (`unitCost` = `costBasis` por cuota) pero **no la fecha de compra** (`purchaseDate` existe en el holding JSONB pero llega vacío). La fecha de compra es importante para **cálculos tributarios**: corrección monetaria (UF de la fecha de adquisición), régimen Art. 107 (fecha pre/post 2022), y plazos de tenencia.

**Insight (validado con datos reales):** el `unitCost` de un fondo mutuo ES el valor cuota de una fecha específica. Se puede **inferir la fecha buscando en qué día el `valor_cuota` del fondo fue igual al `unitCost`**. Verificado con Heraldo (RUN 8336): `unitCost = 2284.0084` matchea **exactamente** el valor cuota del **2024-07-17** en `fund_cuota_history` (diff 0.00), con historia desde 2014.

**Decisiones de diseño (del usuario):**
- **Solo fechas exactas.** Si el `unitCost` es un promedio ponderado de varias compras (no matchea ninguna fecha exacta) → dejar `purchaseDate` vacío (el tributario usa su estimación actual). Mejor sin fecha que con una fecha mala.
- **Guardar al subir la cartola + backfill** de las existentes. Sin UI nueva (rellenar el campo `purchaseDate` existente).

## 2. Función pura de match

`lib/tax/infer-purchase-date.ts`:

```ts
export interface VCPoint { fecha: string; valorCuota: number; }
export interface InferredPurchase { date: string; }

export function inferPurchaseDate(unitCost: number, serie: VCPoint[]): InferredPurchase | null
```

**Lógica:**
1. Si `unitCost <= 0` o `serie` vacía → `null`.
2. Umbral de exactitud (tolerante solo a redondeo): `EPS = max(0.01, unitCost * 0.00005)`. (Para `unitCost=2284`, EPS ≈ 0.11; el match exacto tiene diff 0.00 y las fechas vecinas ~0.3+ quedan afuera.)
3. `matches = serie.filter(p => Math.abs(p.valorCuota - unitCost) <= EPS)`.
4. Si `matches.length === 0` → `null`.
5. Si todos los `matches` caen dentro de una **ventana contigua** (`maxFecha − minFecha ≤ 30 días`) → una sola compra/plateau → devolver la **fecha más antigua** del cluster.
6. Si los matches están **dispersos** (span > 30 días → el fondo pasó por ese precio en 2+ momentos distintos) → **ambiguo** → `null`.

**Por qué la ventana de 30 días:** un plateau (money market con vc plano, o días consecutivos con el mismo vc) genera varios matches adyacentes que son la misma compra → se resuelve a una fecha. Dos matches en años distintos (fondo que subió, bajó y volvió al precio) es genuinamente ambiguo → `null` (coherente con "solo exactas").

## 3. Enriquecimiento en la ingesta

`enrichPurchaseDates(holdings, supabase)` (nuevo, junto a `enrichHoldingsWithCostBasis` en `lib/cost-basis.ts` o módulo propio):

Para cada holding:
- Skip si ya tiene `purchaseDate` (no sobrescribir), o si no tiene `securityId` numérico (RUN), o `unitCost <= 0`.
- Resolver `fo_run` (+ `serie` si está) → `fondo_id` en `fondos_mutuos` (misma resolución que usa `prices-at-date`/`fill-prices`; si hay varias series sin serie explícita, resolver por precio como ya hace el código existente).
- Traer la serie de `fund_cuota_history` (`fecha`, `valor_cuota`) del `fondo_id` (ordenada; va desde 2014).
- Correr `inferPurchaseDate(unitCost, serie)`; si devuelve fecha, setear `holding.purchaseDate = date`.

**Dónde se llama:** en el **POST `/api/portfolio/snapshots`**, en el bloque de enriquecimiento de holdings (donde ya se llama `enrichHoldingsWithCostBasis`), antes del upsert. Async, no bloqueante del resto.

**Fuente:** `fund_cuota_history` (más completa históricamente, 2014→hoy). NO `fondos_rentabilidades_diarias` (más corta/rezagada).

## 4. Backfill

`scripts/backfill-purchase-dates.mjs`:
- Recorre snapshots `source in (manual, statement, excel)` de todos los clientes.
- Para cada holding sin `purchaseDate`, infiere (misma lógica, espejada como los otros scripts).
- Actualiza el `holdings` JSONB del snapshot solo si cambió algo. Log por cliente: cuántas fechas se rellenaron / cuántas quedaron sin match.

## 5. Uso tributario

`lib/tax/bridge.ts` (`convertToTaxHoldings`): cuando el holding tiene `purchaseDate`, usarla como `acquisitionDate` real y buscar la **UF de esa fecha** para `ufAtPurchase` (corrección monetaria), en vez de la estimación actual (`purchaseUFs` o fallback a UF de hoy). Se marca `confianzaBaja = false` para esos holdings (dato firme).

Es la mejora que motiva la feature. Requiere: pasar/derivar la UF de `purchaseDate` (vía el mismo mecanismo `purchaseUFs` que ya existe, ahora alimentado por la fecha inferida). Los holdings sin `purchaseDate` mantienen la estimación actual sin cambios.

## 6. Manejo de errores

- Si la query de `fund_cuota_history` falla o el fondo no está en `fondos_mutuos` → no se infiere (holding queda sin `purchaseDate`), no rompe la ingesta.
- Enriquecimiento no-fatal: un error en un holding no aborta el guardado del snapshot.

## 7. Testing

`lib/tax/infer-purchase-date.test.ts` (función pura):
- Match exacto único → devuelve esa fecha.
- Plateau contiguo (varios días mismo vc) → devuelve la más antigua.
- Matches dispersos (mismo vc en 2 años) → `null`.
- Sin match (promedio ponderado entre dos vc) → `null`.
- `unitCost <= 0` o serie vacía → `null`.
- Tolerancia de redondeo: diff 0.001 dentro de EPS → match; diff 0.5 fuera → no match (para vc chico).

## 8. Fuera de alcance (YAGNI)

- Sin UI nueva (se rellena `purchaseDate` existente; el tributario ya lo consume).
- Solo FM chilenos con RUN + valor cuota. No bonos, no internacionales (esos tienen su propio cost basis / no valor cuota chileno).
- No sobrescribir un `purchaseDate` ya presente (respeta datos manuales/futuros).
- No inferir cuando el match es ambiguo (dos épocas) — se deja vacío.

## 8b. Limitación conocida

El método asume que `unitCost` = valor cuota de un día. Si es un **promedio ponderado** de varias compras, puede pasar una de dos:
- **No matchea ninguna fecha** (lo común) → `purchaseDate` vacío (correcto, conservador).
- **Coincide por casualidad** con el valor cuota de una fecha (raro, requiere igualar a 4 decimales) → infiere una fecha *plausible pero incorrecta*.

No hay forma de distinguir una compra única real de un promedio que coincide. El riesgo es bajo (coincidencia exacta a 4 decimales es improbable) y se acepta dado el criterio "solo exactas". Si en el futuro la cartola trae la fecha real, ese valor manda (no se sobrescribe).

## 9. Pasos de implementación (alto nivel)

1. `lib/tax/infer-purchase-date.ts` (`inferPurchaseDate`) + tests.
2. `enrichPurchaseDates(holdings, supabase)` (resolución RUN→fondo_id + fetch vc + match).
3. Hook en el POST de snapshots (junto a `enrichHoldingsWithCostBasis`).
4. `scripts/backfill-purchase-dates.mjs` (+ correr en Heraldo, verificar).
5. Wiring en `lib/tax/bridge.ts` para usar `purchaseDate` → UF real.
