# Mi Patrimonio — espejo en el portal del cliente (Sub-proyecto B2) — Design

**Fecha:** 2026-08-13
**Rama:** `feat/portal-patrimonio`
**Estado:** Diseño aprobado. Pendiente review del spec → plan de implementación.

## Contexto y visión

Sub-proyecto **B2** de la iniciativa de patrimonio.

- **A. Modelo + captura (asesor)** — HECHO (mergeado).
- **B. Resumen calculado (asesor)** — HECHO (mergeado): `lib/patrimonio/summary.ts` (`computePatrimonioSummary`), `GET /api/clients/[id]/patrimonio/resumen`, UI `PatrimonioResumen`.
- **B2. Espejo en el portal del cliente** (este spec): el cliente ve, **read-only**, su resumen de patrimonio (neto + flujo pasivo) **+ el inventario** de sus seguros/inmuebles/activos. Es "la página resumen del cliente" de la visión original.
- **C. Simulador de jubilación/flujos** — fuera de alcance.

## Decisiones de diseño (aprobadas)

1. **Alcance:** resumen (arriba) + **inventario read-only** (abajo). El cliente ve sus productos tal como el asesor los capturó, sin editar.
2. **Ubicación:** nueva página `app/(portal)/portal/patrimonio/page.tsx` ("Mi Patrimonio") + link en `components/portal/PortalSidebar.tsx`. `mis-servicios` queda como está.
3. **Reuso total del cálculo:** `computePatrimonioSummary` (B) y el pull de portafolio (último snapshot del propio cliente). No se reimplementa lógica.
4. **Toggle de moneda** UF/CLP/USD en el resumen (gobierna los agregados, via `fromCLP`). **Sin** toggle "incluir casa" en el portal (se muestra el patrimonio neto **total**, con la casa incluida) — más simple para el cliente.
5. **Curación cliente-friendly:**
   - En el inventario se **oculta `notas`** (notas internas del asesor).
   - Se muestran **todos los demás campos capturados** (póliza, compañía, prima, cobertura, deducible, ubicación, valores, crédito, arriendo, saldos, régimen, etc.).
   - Los montos del inventario se muestran en **su moneda de origen** (ej. "Prima 4,5 UF"); el toggle de moneda aplica al **resumen** (agregados), no a cada ítem.
6. **Read-only siempre:** el portal no edita patrimonio (el asesor es el único que captura, [[project_advisor_workflow]]).

## Endpoint

`GET /api/portal/patrimonio`
- Auth: `requireClient()` de `@/lib/auth/require-client` → `{ client, error }`; `if (error) return error`. Usa `client.id` (el propio cliente logueado) — el cliente NUNCA pasa un id (no hay IDOR posible).
- `createAdminClient()` tras el auth. Carga las 3 tablas de patrimonio por `client_id = client.id`, el valor del portafolio (último `portfolio_snapshots.total_value`, `.neq("source","api-prices")`, orden desc, limit 1), y `getCurrentRates()`.
- Llama `computePatrimonioSummary(...)` y devuelve:
  ```
  { success, seguros: [], inmuebles: [], activos: [], resumen: PatrimonioSummary, rates: { usd, eur, uf } }
  ```
  (Devuelve el inventario crudo además del resumen, para las tarjetas read-only. `eur` va como 0 — `getCurrentRates` no lo entrega y las monedas son solo CLP/UF/USD.)
- Respuestas vía `successResponse`/`errorResponse` + `handleApiError`; rate-limit por ruta.

## UI (portal)

- **Página** `app/(portal)/portal/patrimonio/page.tsx` ("use client"): hace un fetch a `/api/portal/patrimonio` y compone:
  - **`PortalPatrimonioResumen`** — arriba: tarjetas Patrimonio neto (total) + Flujo pasivo mensual, con toggle **UF/CLP/USD** (via `fromCLP`) y el desglose por categoría. Estado vacío suave + nota si no hay portafolio (`portafolioDisponible=false`). Estilo del portal (cliente-friendly).
  - **`PortalPatrimonioInventario`** — abajo: tres bloques (Seguros / Inmuebles / Activos), cada uno con tarjetas **read-only** por ítem. Cada tarjeta se renderiza recorriendo los `FieldDef` del grupo en **`components/clients/patrimonio/schemas.ts`** (reuso de A): muestra `label: valor` por cada campo con valor, respetando los `showIf` (crédito/arriendo/devolución/régimen), formateando los `money` como `monto moneda`, y **omitiendo `notas`** y los campos vacíos. Un componente `PatrimonioItemView` (dirigido por schema) hace el render.
- **Link en `PortalSidebar.tsx`:** ítem "Mi Patrimonio" → `/portal/patrimonio` (ícono tipo cartera).
- Paleta/tokens del app (`--gb-*`), sin hardcodear hex.

## Reuso (no reimplementar)

- `computePatrimonioSummary` + `PatrimonioSummary` (`lib/patrimonio/summary.ts`, B).
- `fromCLP` / `ExchangeRates` (`lib/portfolio/currency.ts`).
- `GRUPOS` / `FieldDef` (`components/clients/patrimonio/schemas.ts`, A) para el render read-only del inventario.
- Tipos de A (`Seguro`/`Inmueble`/`ActivoFinanciero`/`PatrimonioData`).

## Fuera de alcance (explícito)

- Edición de patrimonio desde el portal (siempre read-only).
- Simulador de jubilación (C).
- Retirar/migrar la página `mis-servicios` (se deja como está; se evalúa aparte).

## Testing

- La lógica de agregación ya está testeada (B, `lib/patrimonio/summary.test.ts`); B2 no agrega lógica pura nueva (salvo, si se extrae, un helper puro de "valor de un FieldDef → string" que se testea).
- **Ruta y UI:** verificación manual. Smoke: loguearse como un cliente con patrimonio → `/portal/patrimonio` muestra el resumen (neto + flujo, toggle de moneda) y las tarjetas read-only de sus seguros/inmuebles/activos, **sin** el campo notas y **sin** poder editar. Cliente sin datos → estado vacío suave.

## Criterios de éxito

1. `GET /api/portal/patrimonio` devuelve inventario + resumen del **propio** cliente logueado (sin parámetro de id; imposible ver otro cliente).
2. `/portal/patrimonio` muestra el resumen (con toggle de moneda) + el inventario read-only espejo de lo capturado, ocultando `notas`.
3. Los montos del inventario aparecen en su moneda de origen; los agregados del resumen responden al toggle.
4. El cliente no puede editar nada; estado vacío/without-portafolio comunicado.
5. `tsc` sin errores nuevos; suite sin regresiones.
