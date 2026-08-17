# Resumen de patrimonio y flujos del cliente (Sub-proyecto B) — Design

**Fecha:** 2026-08-13
**Rama:** `feat/patrimonio-resumen`
**Estado:** Diseño aprobado. Pendiente review del spec → plan de implementación.

## Contexto y visión

Sub-proyecto **B** de la iniciativa de patrimonio (ver `2026-08-12-patrimonio-cliente-design.md`, sub-proyecto A, ya mergeado a `master`).

- **A. Modelo + captura** (HECHO): 3 tablas `client_seguros`/`client_inmuebles`/`client_activos_financieros`, API `/api/clients/[id]/patrimonio`, sección "Patrimonio" en la ficha.
- **B. Resumen calculado** (este spec): patrimonio neto + flujo pasivo, calculados a partir de A + el valor del portafolio del Seguimiento, en UF/CLP/USD. **Alcance de B = lado ASESOR** (una franja/resumen arriba de la sección Patrimonio).
- **B2. Espejo en el portal del cliente** (siguiente, fuera de alcance aquí): reusa el mismo cálculo, read-only para el cliente.
- **C. Simulador de jubilación/flujos** (fuera de alcance): proyección en el tiempo (AFP renta vitalicia/retiro programado, payout APV, arriendo 100% neto cuando el crédito termine). Reemplaza el simulador de APV.

## Decisiones de diseño (aprobadas en brainstorming)

1. **Flujo mensual = flujo PASIVO tipo jubilación**, foto de HOY. Fórmula: `Σ (arriendo_mensual − dividendo_mensual)` sobre los inmuebles que se arriendan. Se resta el dividendo (cuota del crédito) porque mientras se paga el crédito el arrendatario no recibe el 100% del arriendo. **NO** incluye ahorro periódico ni primas de seguros (esos son gastos de la vida activa, no flujo pasivo). La proyección completa de jubilación es C.
2. **Patrimonio neto = activos − pasivos**, con un **toggle "incluir casa habitación"** (encendido por defecto):
   - Encendido → **Patrimonio total** (incluye la casa donde vive y su hipoteca).
   - Apagado → **Patrimonio invertible** = total − (valor de la casa habitación − saldo de su hipoteca).
3. **Monedas:** un **toggle UF/CLP/USD** gobierna TODOS los números del resumen (mismo patrón que el Seguimiento). Cada monto se convierte desde su moneda de origen a CLP para agregar, y se muestra en la moneda elegida. Tipos de cambio desde `/api/exchange-rates` (UF y dólar observado). Reusar `toCLP`/`fromCLP` de `lib/portfolio/currency.ts`.
4. **Enfoque:** endpoint `/resumen` + **lógica pura** en `lib/patrimonio/summary.ts` (Vitest, TDD). Reutilizable para B2 (portal) y para emails/reportes.
5. **Valor del portafolio (híbrido):** se toma **automático** del Seguimiento — el total en CLP del último snapshot del cliente (excluyendo `source=api-prices`, igual que el filtro del Seguimiento). No se re-digita.

## El modelo de cálculo — `lib/patrimonio/summary.ts` (pura)

**Firma:** `computePatrimonioSummary(items: PatrimonioData, portfolioCLP: number | null, rates: ExchangeRates): PatrimonioSummary`

Donde `PatrimonioData` = `{ seguros, inmuebles, activos }` (los tipos de A) y `ExchangeRates` = `{ usd, uf }` (CLP por USD, CLP por UF) de `lib/portfolio/currency.ts`.

Cada par `(monto, moneda)` → CLP con `toCLP(monto, moneda, rates)`. Montos `null`/faltantes cuentan como 0 (se omiten).

**Activos por categoría (en CLP):**
| Categoría | Fuente |
|---|---|
| `portafolio` | `portfolioCLP` (del Seguimiento; 0 si no hay snapshot) |
| `inmuebles_inversion` | Σ `valor_estimado_venta` de inmuebles `tipo='inversion'` |
| `casa_habitacion` | Σ `valor_estimado_venta` de inmuebles `tipo='habitacion'` |
| `apv` | Σ `saldo` de activos `tipo='apv'` |
| `afp` | Σ `saldo` de activos `tipo='afp'` |
| `cuenta_ahorro` | Σ `saldo` de activos `tipo='cuenta_ahorro'` |
| `otro_financiero` | Σ `saldo` de activos `tipo IN ('ahorro_periodico','otro')` (los que tengan saldo) |
| `ahorro_seguros` | Σ `componente_ahorro` de seguros (típicamente `vida_con_ahorro`) |

`activos.total` = suma de todas las categorías.

**Pasivos (en CLP):**
- `credito_total` = Σ `credito_saldo` de inmuebles con `tiene_credito=true`.
- `credito_casa_habitacion` = Σ `credito_saldo` de inmuebles `tipo='habitacion'` con crédito (sub-conjunto, para el toggle).

**Patrimonio:**
- `patrimonioNeto` (total, incluye casa) = `activos.total − credito_total`.
- `patrimonioInvertible` (sin casa) = `patrimonioNeto − (casa_habitacion − credito_casa_habitacion)`.

**Flujo pasivo mensual (CLP):**
- `flujoPasivoMensual` = Σ sobre inmuebles con `se_arrienda=true` de `toCLP(arriendo_mensual) − toCLP(credito_cuota_mensual)` (cuota = 0 si no tiene crédito). Puede ser **negativo** (arriendo < dividendo): se muestra tal cual, honesto.

**Retorno (`PatrimonioSummary`, todo en CLP):**
```ts
interface PatrimonioSummary {
  activos: { portafolio: number; inmuebles_inversion: number; casa_habitacion: number;
             apv: number; afp: number; cuenta_ahorro: number; otro_financiero: number;
             ahorro_seguros: number; total: number };
  pasivos: { credito_total: number; credito_casa_habitacion: number };
  patrimonioNeto: number;        // incluye casa habitación
  patrimonioInvertible: number;  // sin casa ni su hipoteca
  flujoPasivoMensual: number;
  portafolioDisponible: boolean; // false si no había snapshot (portafolio=0)
}
```

La conversión final a la moneda elegida (UF/CLP/USD) la hace la **UI** con `fromCLP(valorCLP, moneda, rates)` — la lib devuelve siempre CLP para no duplicar lógica de display.

## Fuente del valor del portafolio

`portfolioCLP` = total en CLP del **último snapshot** de `portfolio_snapshots` del cliente, excluyendo `source='api-prices'` (mismo criterio que `GET /api/clients/[id]/seguimiento`). Si el cliente no tiene snapshots → `portfolioCLP=null` → `portafolio=0` y `portafolioDisponible=false` (la UI muestra un aviso "sin portafolio cargado"). El campo exacto (`total_value` vs suma de `marketValueCLP` de holdings) se confirma al implementar, reusando el helper que ya usa el Seguimiento.

## API

`GET /api/clients/[id]/patrimonio/resumen`
- Auth: `requireClientAccess(id)` (patrón de A; cierra IDOR). `createAdminClient()` tras el auth.
- Junta: (1) los items de patrimonio (query a las 3 tablas por `client_id`), (2) el valor del portafolio (último snapshot), (3) los tipos de cambio (`exchange-rates`).
- Llama `computePatrimonioSummary(...)` y devuelve `{ ...summary, rates }` (los `rates` van en la respuesta para que la UI convierta a UF/USD sin otro fetch).
- Respuestas vía `successResponse`/`errorResponse` + `handleApiError`; rate-limit por ruta.

## UI (asesor)

- **`components/clients/patrimonio/PatrimonioResumen.tsx`** — se monta **arriba** de `PatrimonioSection` en `ClientDetail` (la "franja calculada" del mockup de A).
- Contenido:
  - **Toggle de moneda** UF / CLP / USD (gobierna todos los números).
  - Tarjeta **Patrimonio neto** (número grande) con el **toggle "incluir casa habitación"**; subtítulo "Activos X · Pasivos −Y". Al apagar el toggle muestra el invertible.
  - Tarjeta **Flujo pasivo mensual** (número grande; verde si ≥0, rojo si <0); subtítulo "arriendos − dividendos".
  - **Desglose expandible**: activos por categoría (con su valor en la moneda elegida), pasivos, y el detalle del flujo (por inmueble: arriendo − dividendo = neto).
  - **Estado vacío / aviso**: si no hay datos de patrimonio aún → mensaje suave. Si no hay portafolio (`portafolioDisponible=false`) → nota "portafolio no incluido (sin cartola cargada)".
- Paleta/tokens del app (`--gb-*`), fuentes del proyecto, sin hardcodear hex. Reusa `MoneyInput`/estilos existentes donde aplique (el toggle de moneda es nuevo, chico).
- Se refresca cuando cambian los items (tras guardar en la sección Patrimonio): la sección puede exponer un callback o el resumen re-fetchea `/resumen` al montarse y cuando la sección notifica un cambio.

## Fuera de alcance de B (explícito)

- **B2**: espejo read-only en el portal del cliente (`/portal`), reusando `computePatrimonioSummary` y el endpoint.
- **C**: proyección de jubilación/flujos en el tiempo (AFP, APV payout, arriendo neto post-crédito, valor casa a futuro).
- Capturar sueldo/gastos personales (no están en A; el flujo de B es solo pasivo).

## Testing

- **Lógica pura con Vitest (TDD):** `lib/patrimonio/summary.test.ts` cubre: agregación por categoría, conversión multi-moneda (UF/CLP/USD → CLP), patrimonio neto total vs invertible (con/sin casa + su hipoteca), flujo pasivo (con crédito, sin crédito, negativo), y bordes (portafolio null, montos faltantes, sin inmuebles).
- **Ruta y UI:** verificación manual (convención del repo). Smoke: un cliente con 1 depto de inversión (arriendo+crédito), 1 casa habitación, APV, y portafolio → confirmar que neto/invertible/flujo cuadran con un cálculo a mano, y que los toggles de moneda y de casa funcionan.

## Criterios de éxito

1. `computePatrimonioSummary` calcula neto total, invertible y flujo pasivo correctos, con conversión multi-moneda, verificado por tests contra ejemplos a mano.
2. `GET /api/clients/[id]/patrimonio/resumen` devuelve el resumen para un cliente accesible (y 403/404 para uno no accesible — IDOR cerrado).
3. La franja de resumen aparece arriba de la sección Patrimonio; el toggle UF/CLP/USD cambia todos los números; el toggle "incluir casa" alterna total ↔ invertible.
4. Si no hay portafolio/datos, la UI lo comunica sin romperse.
5. `tsc` sin errores nuevos y `lib/patrimonio` (incl. summary) en verde.
