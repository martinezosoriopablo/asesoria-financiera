# Patrimonio a página propia + Simulador de jubilación (v2.0 · Fase 3) — Design

**Fecha:** 2026-08-21
**Rama sugerida:** `feat/patrimonio-jubilacion`
**Estado:** Diseño aprobado (decisiones tomadas con el usuario). Pendiente review del spec → plan.

## Contexto y visión

Sub-proyecto **Fase 3** del roadmap v2.0 ([[project_v2_roadmap]]), que completa la iniciativa de patrimonio ([[project_patrimonio_simulador]]: A modelo+captura, B resumen asesor, B2 espejo portal — todos mergeados; **C simulador de jubilación** era lo pendiente). Dos entregables ligados por el tema jubilación:

1. **Patrimonio a página propia.** Hoy `PatrimonioResumen` + `PatrimonioSection` viven como acordeón dentro de la ficha (`components/clients/ClientDetail.tsx:714`). Se mueven a su ruta `clients/[id]/patrimonio` para aligerar la ficha y darle espacio al simulador.
2. **Simulador de jubilación (sub-proyecto C).** Proyección de vida completa en UF real: acumulación previsional (AFP+APV) hasta el retiro y desacumulación hasta la expectativa de vida, con pensión estimada (renta vitalicia vs retiro programado), tasa de reemplazo y flujo pasivo (pensión + arriendos). **Reemplaza y elimina** la calculadora APV standalone (`app/(advisor-shell)/calculadora-apv/`) y su link en el sidebar.

**Restricción transversal:** los asesores NO son especialistas → **simple pero completo**. Primitivos Fase 0, paleta sobria. **Cumplimiento CMF:** todo rotulado como proyección ilustrativa con supuestos editables; sin retornos inventados.

Decisiones tomadas con el usuario:
- **Ambición:** proyección de vida completa (año a año, acumulación + desacumulación).
- **Renta vitalicia:** anualidad transparente (pensión = anualidad(saldo, tasa, años)); sin tablas de mortalidad.
- **Horizonte:** defaults editables retiro 65 / vida 90; sin default por sexo.
- **APV standalone:** reemplazar y borrar (el simulador vive por-cliente en la página de patrimonio).
- **Patrimonio:** página propia con link desde la ficha.
- **Términos:** UF real (evita modelar inflación).

## Parte A — Patrimonio a página propia

**Crear** `app/(advisor-shell)/clients/[id]/patrimonio/page.tsx`:
- Client component que recibe el `id` del cliente (via `useParams` o props del route segment).
- `PageContainer` + `PageHeader` (eyebrow "Cliente", título "Patrimonio", con el nombre del cliente cargado de `GET /api/clients/[id]`).
- Monta, en orden: `PatrimonioResumen` (neto + flujo), `PatrimonioSection` (inventario acordeón), y el nuevo `SimuladorJubilacion` (Parte B). Todos `clientId`-driven; reusan sus endpoints existentes.
- Un enlace "← Volver a la ficha" a `/clients/[id]`.

**Modificar** `components/clients/ClientDetail.tsx`:
- Reemplazar el mount inline de `PatrimonioSection` (~línea 714) — y el de `PatrimonioResumen` si está en la ficha — por un enlace/botón (primitivo `Button`/Link) **"Ver patrimonio completo →"** que navega a `/clients/[id]/patrimonio`.
- No se elimina lógica; solo se relocaliza la vista. La sección de servicios/cobro/otros de la ficha queda intacta.

## Parte B — Simulador de jubilación (motor + UI)

### B.1 Motor de proyección (lógica pura)
`lib/tax/apv-proyeccion.ts` — todo en **UF real**. Reusa `lib/tax/apv.ts` (`calcularTopeAPV_A_UF`, `calcularAhorroAPV_A_UF`, `calcularCreditoAPV_B_UF`) para el beneficio tributario del aporte APV.

```ts
export interface SimInput {
  edadActual: number;
  edadRetiro: number;              // default 65
  edadFinal: number;               // default 90 (expectativa)
  sueldoMensualUF: number;         // para tasa de reemplazo
  // Previsional
  afpSaldoUF: number;
  afpAporteMensualUF: number;
  apvSaldoUF: number;
  apvAporteMensualUF: number;
  apvRegimen: "A" | "B" | null;
  // Rentabilidades reales anuales (fracción, ej. 0.03 = 3% real)
  rentAcumulacion: number;         // durante acumulación
  rentPayout: number;              // durante desacumulación
  // Otros activos invertibles (fuera del previsional)
  otrosActivosUF: number;
  otrosActivosRentAnual: number;
  // Inmuebles
  arriendoNetoMensualUF: number;   // arriendo − dividendo (flujo pasivo)
  valorCasaUF: number;
}

export interface YearRow {
  edad: number;
  fase: "acumulacion" | "desacumulacion";
  saldoPrevisionalUF: number;      // AFP+APV vigente ese año
  otrosActivosUF: number;
  patrimonioNetoUF: number;        // previsional + otros + casa
  ingresoMensualUF: number;        // desacum: pensión elegida + arriendo neto; acum: 0
}

export interface SimResult {
  saldoPrevisionalAlRetiroUF: number;
  pensionVitaliciaMensualUF: number;
  pensionRetiroProgInicialMensualUF: number;
  tasaReemplazoVitalicia: number;         // pensiónVitalicia / sueldo (0 si sueldo=0)
  flujoPasivoTotalMensualUF: number;      // pensiónVitalicia + arriendo neto
  proyeccionVitalicia: YearRow[];         // proyección usando renta vitalicia en payout
  proyeccionRetiroProg: YearRow[];        // proyección usando retiro programado en payout
}

// Anualidad: convierte un saldo en pago mensual constante durante `anios` a tasa real anual.
// pago = saldo × iM / (1 − (1+iM)^(−meses)), iM = (1+tasaAnual)^(1/12) − 1. Si tasa=0 → saldo/meses.
export function anualidadMensualUF(saldoUF: number, tasaAnual: number, anios: number): number;

// Motor: acumula AFP+APV con aportes+rentabilidad real hasta el retiro, luego desacumula
// hasta edadFinal por las dos modalidades. Devuelve headline + ambas proyecciones año a año.
export function simularJubilacion(input: SimInput): SimResult;
```

**Modelo (determinista, UF real):**
- **Acumulación** (edadActual → edadRetiro), anual: `saldo_{t+1} = (saldo_t + aporteAnual) × (1 + rentAcumulacion)`. `afpAporteAnual = afpAporteMensualUF × 12`, ídem APV.
  - **Régimen APV A:** el Estado bonifica el ahorro (15% del aporte, con tope) → esa bonificación **capitaliza en el fondo**. El aporte APV efectivo del año = aporte + bonificación, calculada con `calcularAhorroAPV_A_UF`/`calcularTopeAPV_A_UF` de `lib/tax/apv.ts`. Compone.
  - **Régimen B:** el beneficio es un **crédito fiscal** (rebaja de impuesto) que va al bolsillo del contribuyente, **NO capitaliza en el fondo** APV. Por lo tanto NO aumenta el aporte del modelo de acumulación; se muestra aparte como "ahorro tributario anual estimado" (informativo, vía `calcularCreditoAPV_B_UF`), sin sumarlo al saldo.
  - Otros activos crecen a `otrosActivosRentAnual`.
- **Al retiro:** `saldoPrevisional = afp + apv`.
  - **Renta vitalicia:** `pensionVitaliciaMensualUF = anualidadMensualUF(saldoPrevisional, rentPayout, edadFinal − edadRetiro)`. Constante toda la desacumulación; el saldo previsional se considera "entregado a la compañía" → en `proyeccionVitalicia` el saldo previsional pasa a 0 al retiro (el patrimonio neto ya no lo incluye; el ingreso mensual lo refleja).
  - **Retiro programado:** año a año, `retiroAnual_t = saldo_t / (edadFinal − edad_t)`; `saldo_{t+1} = (saldo_t − retiroAnual_t) × (1 + rentPayout)`. Pensión mensual decreciente; `pensionRetiroProgInicialMensualUF` = la del primer año. En `proyeccionRetiroProg` el saldo previsional sí decae y suma al patrimonio neto.
- **Desacumulación** (edadRetiro → edadFinal): `ingresoMensualUF = pensión(modalidad) + arriendoNetoMensualUF`. Otros activos siguen rindiendo (no se consumen en el modelo base). `patrimonioNetoUF = saldoPrevisional(modalidad) + otrosActivos + valorCasa`.
- **Tasa de reemplazo:** `pensionVitaliciaMensualUF / sueldoMensualUF`.

**Tests (Vitest):** anualidad con tasa 0 (saldo/meses) y con tasa>0 (valor conocido); acumulación simple (1 año, sin aportes → saldo×(1+r)); retiro programado decreciente (saldo baja, pensión primer año = saldo/años); tasa de reemplazo; sueldo 0 → tasa 0; longitud de las proyecciones = edadFinal − edadActual.

### B.2 Precarga desde datos reales
`GET /api/clients/[id]/patrimonio/jubilacion` (nuevo, o extender el resumen existente): arma un `SimInput` parcial con:
- `edadActual` de `clients.fecha_nacimiento`.
- `sueldoMensualUF` de `clients.ingreso_mensual` (convertido a UF con `getCurrentRates` de `@/lib/bcch`).
- AFP/APV: de `client_activos_financieros` donde `tipo IN ('afp','apv')` — `saldo_monto/moneda` → UF, `aporte_monto/moneda` → UF, `regimen` (APV). Si el ingreso está pero no el aporte AFP, sugerir `10% × sueldo` (editable).
- Inmuebles: `arriendoNetoMensualUF` = Σ(arriendo − dividendo) de `client_inmuebles` que arriendan; `valorCasaUF` = valor de la casa habitación. Reusa la lógica de `computePatrimonioSummary` (B) donde aplique.
- Rentabilidades: defaults ilustrativos editables (ej. `rentAcumulacion = 0.03`, `rentPayout = 0.02`) — rotulados, no garantizados.
Todo lo precargado es **editable** en la UI (los datos del cliente suelen venir incompletos).

### B.3 UI `SimuladorJubilacion`
`components/clients/patrimonio/SimuladorJubilacion.tsx` (client component), montado en la página de patrimonio:
- **Panel de supuestos** (inputs Fase 0): edad, edad retiro (65), expectativa (90), sueldo, saldos y aportes AFP/APV, régimen, rentabilidades (acum/payout), arriendo neto, valor casa. Precargados del endpoint B.2, todos editables. Recalcula en vivo (`useMemo` sobre `simularJubilacion`).
- **Titular:** pensión estimada mensual **renta vitalicia vs retiro programado** (lado a lado), tasa de reemplazo, flujo pasivo total (pensión + arriendos).
- **Gráfico + tabla año a año:** patrimonio neto e ingreso mensual, con las fases acumulación/desacumulación marcadas; toggle entre modalidad vitalicia/programada para la curva. Usar el patrón de gráficos existente del proyecto (mismo que Seguimiento) o una tabla + barras simples con tokens de marca.
- **Disclaimer CMF** visible: "Proyección ilustrativa en UF reales. Supuestos editables; no garantiza rentabilidad ni constituye asesoría previsional."

## Parte C — Eliminar la calculadora APV standalone

- **Extraer** la lógica de proyección útil que hoy vive inline en `app/(advisor-shell)/calculadora-apv/page.tsx` (`calcularValorFuturo` y las proyecciones con/sin APV, postergación) hacia `lib/tax/apv-proyeccion.ts` si aporta al motor; el beneficio tributario ya está en `lib/tax/apv.ts` (se reusa). No duplicar.
- **Eliminar** el directorio `app/(advisor-shell)/calculadora-apv/` completo.
- **Eliminar** el link `{ href: "/calculadora-apv", label: "Calculadora APV", icon: Calculator }` en `components/shared/AdvisorSidebar.tsx:60` (y el import de `Calculator` si queda sin uso).
- Verificar que ninguna otra parte enlaza a `/calculadora-apv` (grep); si algo lo hace, repuntarlo a la página de patrimonio.

## Componentes / archivos

**Crear:**
- `app/(advisor-shell)/clients/[id]/patrimonio/page.tsx`
- `lib/tax/apv-proyeccion.ts` + `lib/tax/apv-proyeccion.test.ts`
- `app/api/clients/[id]/patrimonio/jubilacion/route.ts` (precarga)
- `components/clients/patrimonio/SimuladorJubilacion.tsx`

**Modificar:**
- `components/clients/ClientDetail.tsx` (acordeón → enlace a la página de patrimonio)
- `components/shared/AdvisorSidebar.tsx` (quitar link APV)

**Eliminar:**
- `app/(advisor-shell)/calculadora-apv/` (directorio)

## Reuso (no reimplementar)
- Primitivos Fase 0 (`components/shared/*`).
- `lib/tax/apv.ts` (beneficio tributario A/B) + sus tests.
- `computePatrimonioSummary` (`lib/patrimonio/summary.ts`) y el endpoint de resumen para el arriendo neto / valor casa.
- `getCurrentRates` de `@/lib/bcch` (UF, sin eur) para conversiones a UF.
- `PatrimonioResumen` y `PatrimonioSection` existentes (se mueven, no se reescriben).

## Testing
- **Lógica pura:** `anualidadMensualUF` y `simularJubilacion` con Vitest (casos arriba). El grueso del riesgo está acá → cobertura sólida.
- **UI/integración:** verificación manual — abrir la página de patrimonio de un cliente con AFP/APV/arriendos cargados → ver el simulador precargado → editar supuestos y ver el recálculo → confirmar que el link de la ficha navega y que el sidebar ya no muestra Calculadora APV.
- `tsc` 0; `npm run lint` con guard de paleta; suite sin regresiones (ignorar ~5 fallos pre-existentes del worktree viejo `subproyecto-b-benchmark`).

## Criterios de éxito
1. Existe `clients/[id]/patrimonio` con Resumen + Inventario + Simulador; la ficha enlaza ahí y ya no monta el acordeón inline.
2. El simulador precarga edad/sueldo/AFP/APV/arriendos del cliente y permite editar todos los supuestos; recalcula en vivo.
3. Muestra pensión estimada (vitalicia vs retiro programado), tasa de reemplazo, flujo pasivo, y una proyección año a año (acumulación + desacumulación) en UF real.
4. La calculadora APV standalone y su link del sidebar ya no existen; nada enlaza roto a `/calculadora-apv`.
5. Disclaimer CMF visible; sin retornos garantizados (defaults ilustrativos editables).
6. `tsc` 0, lint y suite verdes; lógica pura testeada.

## Fuera de alcance
- Tablas de mortalidad / CNU real (se usa anualidad transparente).
- Monte Carlo / escenarios estocásticos (proyección determinista).
- Modelar consumo de "otros activos" en la desacumulación (siguen rindiendo, no se giran en el modelo base).
- Inflación nominal (todo en UF real).
- Fase 4 (PII).
