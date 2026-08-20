# Cobro (fees) + Consolidado por ubicación (v2.0 · Fase 2) — Design

**Fecha:** 2026-08-20
**Rama sugerida:** `feat/cobro-ubicacion`
**Estado:** Diseño aprobado (decisiones tomadas con el usuario). Pendiente review del spec → plan.

## Contexto y visión

Sub-proyecto **Fase 2** del roadmap v2.0 ([[project_v2_roadmap]]). Tras la demo, el usuario pidió poder registrar y ver **cuánto le cobra a cada cliente** (advisory fee, rebate, comisión de transacción) y **cuánto le rinde**, además de ver el patrimonio **consolidado vs por custodio** ("ubicación"). Ambas comparten una dimensión de negocio (el custodio / modelo de cobro) pero son dos entregables independientes que se diseñan juntos.

**Restricción transversal:** los asesores NO son especialistas → **simple pero completo**. Se apoya en los primitivos Fase 0 (`components/shared/`) y la paleta sobria (guard de ESLint). Reusa el patrón Fase 1: columnas nullable = "no configurado", funciones puras testeadas, helper compartido.

Decisiones tomadas con el usuario:
- **Cobro:** registro **+ ingreso estimado** (interno del asesor, NO se muestra al cliente).
- **Alcance del cobro:** **default del asesor** que pre-rellena a cada cliente + ajuste por cliente.
- **Consolidado/ubicación:** **toggle dentro del Seguimiento** (Consolidado / Por custodio).
- **Bloque de cobro:** vive **en la ficha del cliente**.
- **Comisión de transacción:** **solo informativa** (tasa por operación), NO se anualiza (es por evento, no recurrente).

## Parte A — Modelo de datos

**Migración `supabase/migrations/20260820_fees_model.sql`.** Todas las columnas **nullable** (null = "no configurado"; se muestra "— sin configurar —", no un 0 engañoso). Un `CHECK` restringe `cobro_tipo` a un set cerrado y **permite NULL**.

**`advisors`** (defaults del asesor — 4 columnas):
- `default_cobro_tipo TEXT CHECK (default_cobro_tipo IN ('agf','corredora','mixto'))`
- `default_rebate_pct NUMERIC`
- `default_advisory_fee_pct NUMERIC`
- `default_comision_transaccion_pct NUMERIC`

**`clients`** (por cliente — mismo set, sin prefijo `default_`):
- `cobro_tipo TEXT CHECK (cobro_tipo IN ('agf','corredora','mixto'))`
- `rebate_pct NUMERIC`
- `advisory_fee_pct NUMERIC`
- `comision_transaccion_pct NUMERIC`

**Prefill:** el POST `/api/clients` (creación) copia los `default_*` del asesor autenticado a las columnas del cliente nuevo, si el body no los trae. El asesor puede ajustarlos después por cliente. (Los porcentajes se guardan como número, ej. `0.8` = 0,8 %.)

**RLS/seguridad:** las columnas viven en tablas ya protegidas (`advisors`, `clients`); no requieren política nueva. La escritura pasa por rutas con `requireAdvisor()`.

## Parte B — Bloque de cobro en la ficha + ingreso estimado

### B.1 Función pura de estimación
`lib/fees/estimate.ts`:

```ts
export interface FeeInputs {
  advisory_fee_pct?: number | null;
  rebate_pct?: number | null;
}
// Ingreso anual recurrente estimado = (advisory_fee% + rebate%)/100 × base.
// La comisión de transacción NO entra (es por evento, no recurrente) — decisión del usuario.
// Devuelve null si no hay base o no hay ningún % configurado (para mostrar "— sin configurar —").
export function estimateAnnualRevenue(fees: FeeInputs, base: number | null | undefined): number | null {
  if (!base || base <= 0) return null;
  const adv = fees.advisory_fee_pct ?? 0;
  const reb = fees.rebate_pct ?? 0;
  if (adv <= 0 && reb <= 0) return null;
  return ((adv + reb) / 100) * base;
}
```

- **Base del cálculo (v1):** `client.patrimonio_estimado` (ya está en el cliente, sin fetch extra). El bloque etiqueta explícitamente **"estimado sobre patrimonio estimado"** para ser honesto. La función acepta `base` como parámetro → una iteración futura puede pasar el patrimonio **invertido real** (suma de snapshots) sin cambiar la firma. (Documentado como mejora, fuera de alcance de v1 para no acoplar la ficha al cómputo del Seguimiento.)
- Tests (Vitest): con base + ambos %, solo advisory, solo rebate, sin % → null, base 0/null → null.

### B.2 Componente `components/clients/CobroSection.tsx`
- Bloque en la **ficha del cliente** (`ClientDetail.tsx`), junto a patrimonio/servicios adicionales.
- **Muestra/edita** (inputs de la Fase 0 `Input`): tipo de cobro (select agf/corredora/mixto), rebate %, advisory fee %, comisión transacción %.
- Muestra el **ingreso estimado anual** (de `estimateAnnualRevenue`, formateado en la moneda del cliente) con la etiqueta de base, y la **comisión de transacción como "X % por operación"** (informativa, sin anualizar).
- Estados: campos sin configurar → "— sin configurar —" + un CTA suave "Configurar cobro". Copper solo como acento.
- **Guardado:** PATCH a `/api/clients/[id]` con los 4 campos (extiende el update existente; validar rangos 0–100). Interno del asesor — **sin cambios en portal ni reportes**.

### B.3 Defaults del asesor
- Bloque "Cobro por defecto" en el **perfil/ajustes del asesor** (donde el asesor ya configura su modelo de IA): edita los 4 `default_*` vía la ruta de update del perfil del asesor.
- Sirven de prefill al crear clientes (Parte A). No afectan clientes existentes.

## Parte C — Consolidado vs por custodio (toggle en Seguimiento)

### C.1 Función pura de agrupación
`lib/portfolio/group-by-custodian.ts`:

```ts
import { stripAccents } from "@/lib/text";
export interface CustodianGroup { custodio: string; valorCLP: number; pct: number; }
// Agrupa holdings por su custodio (snapshot.source), normalizando tildes/casing para no
// duplicar "Itaú AGF" vs "Itau AGF". `getSource` extrae el custodio de cada holding;
// `getValueCLP` su valor en CLP. Devuelve grupos ordenados por valor desc con su %.
export function groupByCustodian<T>(
  holdings: T[],
  getSource: (h: T) => string | null | undefined,
  getValueCLP: (h: T) => number
): CustodianGroup[] { /* … suma por clave normalizada, calcula pct sobre el total … */ }
```

- Normaliza la clave con `stripAccents` + trim + colapso de espacios (lección Fase 1: los bugs de custodio venían de tildes). Muestra el nombre "bonito" del primer holding de cada grupo.
- Tests (Vitest): varios custodios, tildes que deben unificar ("Itaú"/"Itau"), source vacío → grupo "Sin custodio", pct suma 100.

### C.2 Toggle en el Seguimiento
- Un toggle **"Consolidado / Por custodio"** en el Seguimiento (junto a las cajas de composición).
- **Consolidado** (default): la vista actual, sin cambios.
- **Por custodio:** usa `groupByCustodian` sobre los holdings vigentes (cada holding conoce su custodio vía el `source` del snapshot del que proviene) → muestra una lista/tabla con custodio, valor y %. Reusa primitivos Fase 0 y la paleta sobria.
- **Fuente del custodio por holding:** el Seguimiento une el/los snapshot(s) vigente(s); cada holding hereda el `source` de su snapshot. El plan confirmará el punto exacto donde los holdings ya traen (o se les puede adjuntar) su `source` antes de agrupar. Si un cliente tiene un solo custodio, "Por custodio" muestra un único grupo (100 %) — correcto, no un error.

## Componentes / archivos

**Crear:**
- `supabase/migrations/20260820_fees_model.sql`
- `lib/fees/estimate.ts` + `lib/fees/estimate.test.ts`
- `lib/portfolio/group-by-custodian.ts` + `lib/portfolio/group-by-custodian.test.ts`
- `components/clients/CobroSection.tsx`
- Sub-componente del toggle "Por custodio" en `components/seguimiento/` (p.ej. `CustodianBreakdown.tsx`).

**Modificar:**
- `app/api/clients/route.ts` (POST: prefill de `default_*` del asesor).
- `app/api/clients/[id]/route.ts` (PATCH: aceptar y validar los 4 campos de cobro).
- `components/clients/ClientDetail.tsx` (montar `CobroSection`).
- Perfil/ajustes del asesor (editar los `default_*`) + su ruta de update.
- Seguimiento (montar el toggle + `CustodianBreakdown`).
- `components/clients/hooks/useClientData.ts` (tipar los 4 campos en `Client`).

## Reuso (no reimplementar)
- Primitivos Fase 0 (`components/shared/*`: Card, Button, Input, PageHeader).
- `stripAccents` de `@/lib/text` (agrupación por custodio).
- El `source`/custodio ya existente en `portfolio_snapshots` y el `CUSTODIO` dropdown de `AddSnapshotModal` (tipos agf/corredora/internacional).
- El formateo de moneda existente del Seguimiento/ficha (moneda del cliente).

## Testing
- **Lógica pura:** `estimateAnnualRevenue` y `groupByCustodian` con Vitest (casos arriba).
- **UI:** verificación manual — configurar defaults del asesor → crear cliente (hereda) → editar cobro en la ficha → ver ingreso estimado; en Seguimiento, alternar Consolidado/Por custodio con un cliente multi-custodio.
- `tsc` 0; `npm run lint` con el guard de paleta; suite sin regresiones (ignorar los ~5 fallos pre-existentes del worktree viejo `subproyecto-b-benchmark`).

## Criterios de éxito
1. El asesor define sus % de cobro por defecto; un cliente nuevo los hereda y se pueden ajustar por cliente.
2. La ficha muestra un bloque de cobro con los 4 campos y un **ingreso estimado anual** = (advisory + rebate) × base, con la base etiquetada; la comisión de transacción aparece solo como tasa por operación.
3. El cobro es interno del asesor — no aparece en portal ni reportes al cliente.
4. En el Seguimiento, el toggle "Por custodio" desglosa el patrimonio por AGF/corredora/internacional (tildes unificadas), y "Consolidado" mantiene la vista actual.
5. Todo sobrio/consistente con Fase 0; `tsc` 0, lint y suite verdes.

## Fuera de alcance
- Mostrar los fees al cliente (portal/reportes).
- Anualizar la comisión de transacción con un turnover asumido.
- Usar el patrimonio invertido real como base del estimado (documentado como mejora futura; v1 usa `patrimonio_estimado`).
- Fase 3 (patrimonio+APV) y Fase 4 (PII).
