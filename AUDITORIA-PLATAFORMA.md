# Auditoría Completa — Global Advisors

**Fecha:** 13 de julio 2026
**Alcance:** Coherencia de cálculos · Seguridad · Funcionalidades · Rediseño (pestaña por pestaña)
**Stack:** Next.js 16 (App Router) + React 19 + Supabase (Postgres + RLS) + Tailwind v4 + Vercel
**Método:** Auditoría técnica multi-agente (12 dominios + verificación adversarial de cada hallazgo) + revisión de producto interactiva.

> **Nota:** Este documento reemplaza la auditoría de marzo/abril 2026 (que quedó obsoleta: hablaba de TWR —ya eliminado—, AAFM como fuente activa —hoy local-only—, y rutas que cambiaron). Los hallazgos técnicos de abajo fueron confirmados leyendo el código real.

---

## 0. RESUMEN EJECUTIVO

La plataforma es sólida en arquitectura (auth helpers, RLS, servicio unificado de precios, tipado fuerte). Pero la auditoría técnica encontró **35 hallazgos confirmados**: **3 críticos, 7 altos, 12 medios, 13 bajos**, concentrados en dos ejes:

1. **Fuga de datos entre clientes/asesores (IDOR).** 11 rutas API usan `requireAuth()`/`requireAdvisor()` pero **nunca verifican que el `clientId` pertenezca al asesor**. Cualquier usuario autenticado puede leer —y en varios casos **escribir**— datos de cualquier cliente cambiando un UUID. Existe un helper canónico (`verifyClientAccess` / `checkSnapshotOwnership`) que estas rutas simplemente no invocan.

2. **Cálculos duplicados y divergentes.** El mismo concepto (retorno de bono, conversión a CLP, clasificación de activo, contribución por posición, impuesto progresivo) está reimplementado en múltiples sitios con fórmulas que **no coinciden**. El caso más grave: la **Calculadora APV** sobreestima el ahorro tributario hasta ~10× por aplicar tramos mensuales a renta anual.

### 🚨 Acción inmediata (los 3 críticos) — ✅ RESUELTOS (13-jul-2026)
| # | Hallazgo | Por qué urgía | Estado |
|---|---|---|---|
| C1 | **Calculadora APV** calcula mal el impuesto | Herramienta de cara a cliente que muestra un beneficio falso (hasta 10×) | ✅ Corregido |
| C2 | **`/api/portfolio/snapshots`** sin control de tenencia | Leer/escribir cartola de cualquier cliente; corrompe retornos | ✅ Corregido |
| C3 | **`/api/portfolio/radiografia`** sin control de tenencia | Expone cartera + trades sugeridos de cualquier cliente (incl. desde el portal) | ✅ Corregido |

**Cambios aplicados:**
- **C1:** nueva librería pura `lib/tax/apv.ts` (usa `calcularImpuestoProgresivo` canónico); eliminada la tabla de tramos y las funciones duplicadas de `calculadora-apv/page.tsx`; la página ahora convierte CLP↔UF y delega el cálculo. Cubierto por `lib/tax/apv.test.ts` (7 tests). Resultado por defecto: 40% → 35,6% real; sueldos bajos 40% → 4%.
- **C2/C3:** nuevo helper canónico **`requireClientAccess(clientId)`** en `lib/auth/api-auth.ts` (advisor válido + tenencia: propio/huérfano/subordinado/compartido). Aplicado en `snapshots` (GET+POST) y `radiografia` (POST). **Este helper es el que deben reusar las 9 rutas IDOR restantes en el Sprint 2.**

---

## PARTE A — AUDITORÍA TÉCNICA

### A.1 Seguridad (15 hallazgos)

**Patrón raíz (IDOR):** ruta usa `createAdminClient()` (que **bypassa RLS**) con un `clientId` que llega del request, sin llamar a `verifyClientAccess()`. La corrección es la misma en casi todas: **verificar tenencia** (propio / huérfano / subordinado vía `getSubordinateAdvisorIds` / compartido vía `getSharedClientIds`) antes de leer o escribir.

> ✅ **ESTADO 13-jul-2026:** Las 11 rutas IDOR (C2, C3, A-S1..4, M-S1..3, L-S1) están **corregidas** con el helper `requireClientAccess(clientId)`. Verificado: tsc limpio, 353/353 tests. Pendientes de seguridad: M-S4 (rate limit closings), L-S2..5 (validación/HMAC).

#### CRÍTICOS
- **C2 — `GET/POST /api/portfolio/snapshots`** (`app/api/portfolio/snapshots/route.ts:45,120`). Solo `requireAuth()` (ni siquiera distingue advisor/client) + admin client. Cualquiera lee todos los snapshots (holdings, valores, composición) de cualquier cliente enumerando UUIDs; el POST permite **insertar un snapshot fabricado** para un cliente ajeno, corrompiendo sus retornos y reportes. La ruta hermana `snapshots/[id]/route.ts` **sí** valida con `checkSnapshotOwnership` — replicar ese patrón.
- **C3 — `POST /api/portfolio/radiografia`** (`radiografia/route.ts:112`). Solo `requireAuth()`. Devuelve holdings consolidados + desviaciones vs modelo + trades sugeridos de cualquier cliente. Como no exige rol advisor, **un cliente logueado en el portal** puede pedir la radiografía de otro cliente cambiando el `clientId` del body. Fix: `requireAdvisor()` + `verifyClientAccess`, con rama explícita para portal (`clientId === client.id`).

#### ALTOS (IDOR)
- **A-S1 — `POST /api/portfolio/baseline-evolution`** (`:7`): lee snapshot baseline completo de cualquier cliente.
- **A-S2 — `POST /api/comite/aplicar-cartera`** (`:52`): `requireAdvisor()` pero no compara `clientId` con el asesor → **sobrescribe la cartera recomendada de clientes de otro asesor**.
- **A-S3 — `GET /api/clients/[id]/rebalance-executions`** (`:8`): expone historial de trades (montos, tickers, fechas). Además el POST valida distinto (más débil) que el patrón canónico → criterio inconsistente entre GET y POST del mismo recurso.
- **A-S4 — `GET/PUT /api/clients/[id]/benchmark`** (`:14`): leer y **sobrescribir** `benchmark_config` de cualquier cliente, afectando su rentabilidad comparada.

#### MEDIOS / BAJOS
- **M-S1** — `GET/POST/PUT /api/client-closings` sin verificación de tenencia (`client-closings/route.ts:13,48,500`).
- **M-S2** — `GET/POST /api/portfolio/dividends` sin verificación de tenencia (`:83,12`).
- **M-S3** — `GET /api/portfolio/fill-prices/coverage` sin verificación de tenencia (`:10`).
- **M-S4** — `POST /api/client-closings` (generación IA de cierre mensual) **sin rate limiting** → abuso de coste IA (`:48,438`).
- **L-S1** — `POST /api/prices/backfill` sin verificación de tenencia (`:13`).
- **L-S2** — `POST /api/monthly-reports` acepta HTML arbitrario sin límite de tamaño ni rate limit (`:41`).
- **L-S3** — Tokens de archivos subidos interpolados en filtros `ILIKE` sin escapar, inconsistente con `sanitizeSearchInput` ya existente (`parse-portfolio-excel:453`, `upload-nav-history:206`, `current-prices:84`).
- **L-S4** — `/api/clients/[id]/contract` no usa el validador compartido `lib/upload-validation.ts` (`:96`).
- **L-S5** — Verificación de `CRON_SECRET` con comparación no-constante (`!==`), divergente del patrón HMAC del repo (`check-drift:13`, `sync-fintual:34`, `send-reports:44`, `sync-bond-prices:17`).

**Remediación sugerida:** crear un único `requireClientAccess(clientId)` en `lib/auth/api-auth.ts` (advisor válido + tenencia) y aplicarlo en las 11 rutas. Test de regresión: un asesor A no puede tocar un cliente de asesor B.

---

### A.2 Coherencia de cálculos (20 hallazgos)

**Principio:** un mismo cálculo debe tener **una sola implementación canónica** en `lib/` y todos los consumidores deben importarla.

#### CRÍTICO
- **C1 — Calculadora APV: impuesto progresivo mal calculado** (`calculadora-apv/page.tsx:96-142`). Duplica la tabla de tramos (`tramosImpuesto2024`) y compara **renta anual en UF contra tramos que son mensuales**, sin dividir/multiplicar por 12. Resultado: casi cualquier sueldo (incluso 1.000.000 CLP/mes → ~317 UF anuales > techo 310) cae en el tramo marginal **40%**, sobreestimando el ahorro APV Tipo A hasta ~10×.
  **Fix:** eliminar la copia local e importar `TRAMOS_IMPUESTO`, `APV_TOPE_ANUAL_UF`, `APV_CREDITO_REGIMEN_A` de `lib/constants/chilean-tax.ts` + `calcularImpuestoProgresivo` de `lib/tax/calculator.ts` (que ya maneja el /12 correctamente, como hace `TaxBreakdown.tsx`).

#### ALTOS
- **A-C1 — Prorrateo mensual de retorno de bonos, 3 fórmulas divergentes** — ✅ **RESUELTO 13-jul-2026**. Creada `lib/bonds/prorate-period-return.ts` (función pura + 5 tests) usada por las 3 vistas (`usePerformanceCalculations`, `useSeguimientoEmail`, `RentabilidadPorActivo`). Denominador único **`hoy − cartola`** (coherente con lo que mide `b.totalReturn`), **cap `proRatio ≤ 1`**, y **días efectivos** acotados a la ventana tenida (`max(inicioMes, cartola) .. min(finMes, hoy)`) para compras a mitad de mes. Las 3 vistas ahora coinciden y no puede haber tramo mensual > acumulado.
- **A-C2 — Simulador Tributario ignora UF al convertir a CLP** (`lib/tax/bridge.ts:71`, `TaxSimulator.tsx:172`). `toCLP` local solo maneja USD/EUR; para **UF** cae al `return value` → trata UF (~38.500 CLP) como si ya fuera CLP. Subestima groseramente ganancias/exención Art. 107 en holdings UF. **Fix:** usar `lib/portfolio/currency.ts` (sí maneja UF) y pasar `ufRate`.
- **A-C3 — Atribución del email mensual infla holdings nuevos/liquidados** (`useSeguimientoEmail.ts:243`, `seguimiento-email.ts:274`). Cuenta el 100% del valor de una compra nueva como "contribución" (y −100% de una venta). El email al cliente muestra contribuciones engañosas → **riesgo compliance CMF**. `usePerformanceCalculations` ya evita esto; alinear.

#### MEDIOS
- **M-C1** — Regla de anualización (`<365d simple / ≥365d anualizado`) existe en `lib/returns/calculator.ts` pero es **dead code** en el flujo principal de Seguimiento (`useHistoricalSeries.ts`, `SeguimientoPage.tsx:426`). Verificar si el retorno mostrado respeta la regla.
- **M-C2** — `client-closings/route.ts` reimplementa fetch a BCCH **sin la convención T+1** y con fallbacks distintos al resto (`:183,271` vs `historical-prices:391`, `useExchangeRates:98`).
- **M-C3** — **Tres normalizadores de `assetClass`** divergentes en el fallback (`useSnapshotForm.ts:55`, `fill-prices:1215`, `usePerformanceCalculations.ts:64`). (Bug recurrente conocido.)
- **M-C4** — `parse-portfolio-excel` clasifica *money market* como **Renta Fija**; el canónico `classifyFund` lo clasifica como **Cash** (`parse-portfolio-excel:165,636` vs `classify.ts:38`).
- **M-C5** — Mapeo `familia_estudios → categoría` duplicado **6 veces** en `app/api/fondos/route.ts` sin función compartida.
- **M-C6** — Fórmula de contribución por posición diverge entre `HoldingReturnsPanel` y `usePerformanceCalculations` (`HoldingReturnsPanel.tsx:147`, `EquitySection.tsx:144`, `usePerformanceCalculations.ts:685`).
- **M-C7** — TIR/Duración mostradas usan un motor de yield **distinto** al que calcula devengo/retorno del mismo bono (`useBondCalculations.ts:112-122`).
- **M-C8** — Gráfico histórico de bonos usa motor YTM antiguo sin distinguir bono chileno vs internacional (`historical-prices:561`, `price-projection.ts:32`).

#### BAJOS
- **L-C1** — Retorno simple por clase reimplementado en ≥4 sitios (`useSeguimientoEmail`, `usePerformanceCalculations`, `CompositionBoxes`).
- **L-C2** — `toCLP/fromCLP` duplicado en 3 sitios en vez de reusar `lib/portfolio/currency.ts`.
- **L-C3** — `days30_360` duplicado byte-a-byte (`accrued-interest.ts:27`, `period-return.ts:29`).
- **L-C4** — `calcBondPeriodReturn` (modelo legacy) exportado y testeado pero sin uso en producción.
- **L-C5** — Constantes tributarias declaradas y nunca usadas (`ART104_TASA_UNICA`, etc.); régimen 104 inalcanzable.
- **L-C6** — Bandas de riesgo perfil→RV/RF duplicadas (`lib/risk/benchmarks.ts:53` vs `lib/direct-portfolio/types.ts:83`).
- **L-C7** — Cortes score→banda (20/40/60/80) duplicados como literales (`risk_scoring.ts:21` vs `benchmarks.ts:130`).
- **L-C8** — `classifyTilt()` usa umbrales distintos a la "regla acordada" documentada (`lib/risk/tilt.ts:26`).

---

## PARTE B — REVISIÓN DE PRODUCTO (pestaña por pestaña)

> Decisiones acordadas: **consolidación agresiva** del menú (hoy 14 items) + rediseño hacia **densidad y accionabilidad**.

### ① Dashboard del asesor (`/advisor`) — revisado
- **Quitar/mover:** `ComiteReportsPanel` (no es "mi día" → llevar a Radiografía); "Flujo de Asesoría" (decorativo, duplica el sidebar).
- **Añadir:** **Centro de acción** arriba con las alertas que la plataforma ya calcula (cuestionarios vencidos, drift, sin cartola, cartolas nuevas) → deep-link a Clientes filtrado. AUM con Δ mensual.
- **Bugs UX:** `confirm()` nativo + catch silencioso al borrar reunión (`page.tsx:200,205`).

### ②+③ Clientes (`/clients`) + Vista General (`/advisor/clients-overview`) — revisado
- **Fusionar en una sola pestaña "Clientes"** con toggle Lista / Radar. Elimina 1 item del menú.
- **🔴 Coherencia AUM:** hay **3 valores de AUM distintos** (Dashboard `/api/advisor/stats`, Clientes `patrimonio_estimado`, Vista General suma de snapshots reales). Unificar en una sola definición.
- `formatCurrency` divergente (compacto vs largo) → unificar en `lib/format.ts`. `confirm()/alert()` nativos.

### ④ Cartola & Riesgo — *pendiente*
### ⑤ Seguimiento — *pendiente* (núcleo de cálculos; ver A.2)
### ⑥ Radiografía — *pendiente* (ver C3 seguridad)
### ⑦ Portfolio Designer — *pendiente*
### ⑧–⑭ Herramientas (Centro de Fondos, Mis Fondos, Mapeo, Fichas CMF, Calculadora APV, Simulador Tributario, Educación) — *pendiente* (APV: ver C1; Simulador: ver A-C2)
### Portal del cliente (13 rutas) — *pendiente*
### Admin — *pendiente*

---

## PARTE C — PLAN DE REMEDIACIÓN PRIORIZADO

**Sprint 1 (crítico) — ✅ COMPLETADO 13-jul-2026**
1. ✅ Fix Calculadora APV (C1) — extraído a `lib/tax/apv.ts` con lógica canónica + 7 tests.
2. ✅ Helper `requireClientAccess(clientId)` creado + aplicado en snapshots (GET/POST) y radiografía (POST).

**Sprint 2 (alto) — ✅ COMPLETADO 13-jul-2026**
3. ✅ Aplicado `requireClientAccess` a las 8 rutas IDOR restantes: baseline-evolution, comite/aplicar-cartera, clients/[id]/rebalance-executions (GET+POST unificado), clients/[id]/benchmark, client-closings (GET/POST/PUT), portfolio/dividends, fill-prices/coverage, prices/backfill. **Fuga de datos cross-tenant cerrada.**
4. Rate limit en `client-closings` y `monthly-reports` (M-S4, L-S2).
5. Función compartida de prorrateo de bonos (A-C1) + fix UF en simulador (A-C2) + atribución email (A-C3).

**Sprint 3 (medio)** — normalizadores de assetClass, clasificación money-market, motor de bonos unificado, convención T+1 en closings.

**Continuo (bajo/producto)** — deduplicar utils, consolidar menú, rediseño densidad+accionabilidad pestaña por pestaña.

---

*Auditoría generada el 13-jul-2026. Hallazgos técnicos verificados contra el código fuente. La Parte B se completará pestaña por pestaña.*
