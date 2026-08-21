# Patrimonio a página propia + Simulador de jubilación (v2.0 · Fase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover el patrimonio del cliente a su ruta propia y agregar un simulador de jubilación (proyección de vida en UF real) que reemplaza la calculadora APV standalone.

**Architecture:** Un motor de proyección puro y testeado (`lib/tax/apv-proyeccion.ts`) alimentado por un endpoint de precarga que arma un `SimInput` desde los datos reales del cliente. La UI (`SimuladorJubilacion`) recalcula en vivo y vive en una página nueva `clients/[id]/patrimonio` junto al resumen e inventario ya existentes. Se elimina `calculadora-apv` y su link.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Supabase + Tailwind v4 + recharts ^3.6.0 + Vitest.

## Global Constraints

- **UF real:** TODO el modelo trabaja en UF (términos reales); no se modela inflación nominal. Conversión CLP↔UF con `getCurrentRates` de `@/lib/bcch` (devuelve `{usd, uf}`, SIN eur).
- **Cumplimiento CMF:** el simulador muestra un disclaimer visible: "Proyección ilustrativa en UF reales. Supuestos editables; no garantiza rentabilidad ni constituye asesoría previsional." Rentabilidades = defaults ilustrativos editables, nunca presentadas como garantizadas.
- **Beneficio tributario APV — decisión de modelado (simplificación deliberada del spec):** el beneficio APV se muestra como **ahorro tributario anual informativo** (vía `lib/tax/apv.ts`) y **NO se capitaliza** en el fondo de la proyección. Motivo: los nombres de `apv.ts` (`calcularAhorroAPV_A_UF` = ahorro por deducción; `calcularCreditoAPV_B_UF` = crédito 15% tope 600 UF) no calzan limpio con "régimen A bonifica al fondo", y codificar una capitalización posiblemente errónea contradiría la regla CMF de no inventar cifras. La acumulación usa los aportes tal cual se ingresan.
- **Paleta sobria:** solo tokens de marca `gb-*` (`gb-black` navy, `gb-primary` copper acento, `gb-info` azure, `gb-success`/`gb-danger` solo mercado/variación), `background`/`foreground`. Prohibidas clases de color crudas (`bg-blue-*`, `text-green-*`, `bg-gradient-*`). Para las series del gráfico, usar los hex de marca directos (navy `#0B2140`, copper `#EB7838`, azure `#5AA0E6`) como en los charts existentes — son colores de datos, no chrome.
- **Primitivos Fase 0:** reusar `components/shared/` (`PageContainer`, `PageHeader`, `Card`, `Button`, `Input`). No reimplementar.
- **Commits:** staging explícito por archivo (NO `git add -A` ni `git commit -am`). Mensajes `feat(...)`/`test(...)`/`chore(...)`.
- **Rama:** `feat/patrimonio-jubilacion` desde master. Verificar `git rev-parse --abbrev-ref HEAD` al inicio de cada tarea.
- **Verificación por tarea:** `npx tsc --noEmit -p tsconfig.json` → 0 errores nuevos; funciones puras con `npx vitest run <archivo>`; lint con `npx eslint <archivos>`.
- **Gotcha OneDrive:** el file-watcher de `next dev` puede no reflejar cambios; verificar en build. Warnings `.git/worktrees/*: Permission denied` en commits son inocuos.

---

## File Structure

**Crear:**
- `lib/tax/apv-proyeccion.ts` + `lib/tax/apv-proyeccion.test.ts` — motor de proyección (puro).
- `app/api/clients/[id]/patrimonio/jubilacion/route.ts` — precarga `SimInput` desde datos reales.
- `components/clients/patrimonio/SimuladorJubilacion.tsx` — UI del simulador.
- `app/(advisor-shell)/clients/[id]/patrimonio/page.tsx` — página propia de patrimonio.

**Modificar:**
- `components/clients/ClientDetail.tsx` — acordeón → enlace a la página de patrimonio.
- `components/shared/AdvisorSidebar.tsx` — quitar link "Calculadora APV".

**Eliminar:**
- `app/(advisor-shell)/calculadora-apv/` (directorio completo).

---

## Task 1: Motor de proyección `apv-proyeccion.ts`

**Files:**
- Create: `lib/tax/apv-proyeccion.ts`, `lib/tax/apv-proyeccion.test.ts`

**Interfaces:**
- Consumes: `calcularAhorroAPV_A_UF`, `calcularCreditoAPV_B_UF` de `@/lib/tax/apv`.
- Produces: `anualidadMensualUF(saldoUF, tasaAnual, anios): number`, `simularJubilacion(input: SimInput): SimResult`, y los tipos `SimInput`, `YearRow`, `SimResult` (definidos abajo).

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/tax/apv-proyeccion.test.ts
import { describe, it, expect } from "vitest";
import { anualidadMensualUF, simularJubilacion, type SimInput } from "./apv-proyeccion";

const baseInput: SimInput = {
  edadActual: 40, edadRetiro: 65, edadFinal: 90, sueldoMensualUF: 100,
  afpSaldoUF: 1000, afpAporteMensualUF: 10, apvSaldoUF: 0, apvAporteMensualUF: 0, apvRegimen: null,
  rentAcumulacion: 0.03, rentPayout: 0.02,
  otrosActivosUF: 0, otrosActivosRentAnual: 0,
  arriendoNetoMensualUF: 0, valorCasaUF: 0,
};

describe("anualidadMensualUF", () => {
  it("tasa 0 → saldo / meses", () => {
    expect(anualidadMensualUF(1200, 0, 10)).toBeCloseTo(10, 6); // 1200 / 120
  });
  it("tasa > 0 → pago mayor que saldo/meses (rinde durante el pago)", () => {
    const pago = anualidadMensualUF(1200, 0.05, 10);
    expect(pago).toBeGreaterThan(10);
    expect(pago).toBeLessThan(15);
  });
  it("anios 0 → 0", () => {
    expect(anualidadMensualUF(1000, 0.03, 0)).toBe(0);
  });
});

describe("simularJubilacion", () => {
  it("longitud de ambas proyecciones = edadFinal − edadActual", () => {
    const r = simularJubilacion(baseInput);
    expect(r.proyeccionVitalicia).toHaveLength(50);
    expect(r.proyeccionRetiroProg).toHaveLength(50);
  });
  it("acumula el previsional hasta el retiro (crece con aportes+rentabilidad)", () => {
    const r = simularJubilacion(baseInput);
    // Empieza en 1000; con aportes de 120/año a 3% real por 25 años debe superar el saldo inicial + aportes nominales.
    expect(r.saldoPrevisionalAlRetiroUF).toBeGreaterThan(1000 + 120 * 25);
  });
  it("renta vitalicia constante y > 0; retiro programado inicial > 0", () => {
    const r = simularJubilacion(baseInput);
    expect(r.pensionVitaliciaMensualUF).toBeGreaterThan(0);
    expect(r.pensionRetiroProgInicialMensualUF).toBeGreaterThan(0);
    // En la proyección vitalicia el ingreso mensual es constante en la desacumulación.
    const desacum = r.proyeccionVitalicia.filter((y) => y.fase === "desacumulacion");
    expect(desacum[0].ingresoMensualUF).toBeCloseTo(desacum[desacum.length - 1].ingresoMensualUF, 6);
  });
  it("tasa de reemplazo = pensión vitalicia / sueldo", () => {
    const r = simularJubilacion(baseInput);
    expect(r.tasaReemplazoVitalicia).toBeCloseTo(r.pensionVitaliciaMensualUF / 100, 6);
  });
  it("sueldo 0 → tasa de reemplazo 0", () => {
    const r = simularJubilacion({ ...baseInput, sueldoMensualUF: 0 });
    expect(r.tasaReemplazoVitalicia).toBe(0);
  });
  it("flujo pasivo total = pensión vitalicia + arriendo neto", () => {
    const r = simularJubilacion({ ...baseInput, arriendoNetoMensualUF: 5 });
    expect(r.flujoPasivoTotalMensualUF).toBeCloseTo(r.pensionVitaliciaMensualUF + 5, 6);
  });
  it("retiro programado: el saldo previsional decae en la desacumulación", () => {
    const r = simularJubilacion(baseInput);
    const desacum = r.proyeccionRetiroProg.filter((y) => y.fase === "desacumulacion");
    expect(desacum[desacum.length - 1].saldoPrevisionalUF).toBeLessThan(desacum[0].saldoPrevisionalUF);
  });
  it("ahorro tributario informativo: régimen B da crédito > 0 y NO cambia el saldo al retiro", () => {
    const sinApv = simularJubilacion({ ...baseInput, apvAporteMensualUF: 5, apvRegimen: null });
    const conB = simularJubilacion({ ...baseInput, apvAporteMensualUF: 5, apvRegimen: "B" });
    expect(conB.ahorroTributarioAnualUF).toBeGreaterThan(0);
    // El crédito B no capitaliza → mismo saldo previsional al retiro que sin régimen.
    expect(conB.saldoPrevisionalAlRetiroUF).toBeCloseTo(sinApv.saldoPrevisionalAlRetiroUF, 6);
  });
});
```

- [ ] **Step 2: Correr el test → falla**

Run: `npx vitest run lib/tax/apv-proyeccion.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Escribir la implementación**

```ts
// lib/tax/apv-proyeccion.ts
// Motor de proyección de jubilación en UF real (determinista). Ver spec Fase 3.
// El beneficio tributario APV es informativo (no capitaliza) — ver Global Constraints del plan.
import { calcularAhorroAPV_A_UF, calcularCreditoAPV_B_UF } from "@/lib/tax/apv";

export interface SimInput {
  edadActual: number;
  edadRetiro: number;
  edadFinal: number;
  sueldoMensualUF: number;
  afpSaldoUF: number;
  afpAporteMensualUF: number;
  apvSaldoUF: number;
  apvAporteMensualUF: number;
  apvRegimen: "A" | "B" | null;
  rentAcumulacion: number;   // fracción anual real, ej 0.03
  rentPayout: number;        // fracción anual real durante la desacumulación
  otrosActivosUF: number;
  otrosActivosRentAnual: number;
  arriendoNetoMensualUF: number;
  valorCasaUF: number;
}

export interface YearRow {
  edad: number;
  fase: "acumulacion" | "desacumulacion";
  saldoPrevisionalUF: number;
  otrosActivosUF: number;
  patrimonioNetoUF: number;
  ingresoMensualUF: number;
}

export interface SimResult {
  saldoPrevisionalAlRetiroUF: number;
  pensionVitaliciaMensualUF: number;
  pensionRetiroProgInicialMensualUF: number;
  tasaReemplazoVitalicia: number;
  flujoPasivoTotalMensualUF: number;
  ahorroTributarioAnualUF: number;
  proyeccionVitalicia: YearRow[];
  proyeccionRetiroProg: YearRow[];
}

// Convierte un saldo en pago mensual constante durante `anios` a tasa real anual.
export function anualidadMensualUF(saldoUF: number, tasaAnual: number, anios: number): number {
  const meses = Math.round(anios * 12);
  if (meses <= 0) return 0;
  const iM = Math.pow(1 + tasaAnual, 1 / 12) - 1;
  if (iM === 0) return saldoUF / meses;
  return (saldoUF * iM) / (1 - Math.pow(1 + iM, -meses));
}

export function simularJubilacion(input: SimInput): SimResult {
  const {
    edadActual, edadRetiro, edadFinal, sueldoMensualUF,
    afpSaldoUF, afpAporteMensualUF, apvSaldoUF, apvAporteMensualUF, apvRegimen,
    rentAcumulacion, rentPayout, otrosActivosUF, otrosActivosRentAnual,
    arriendoNetoMensualUF, valorCasaUF,
  } = input;

  // Beneficio tributario informativo (NO capitaliza).
  const apvAporteAnual = apvAporteMensualUF * 12;
  const sueldoAnualUF = sueldoMensualUF * 12;
  let ahorroTributarioAnualUF = 0;
  if (apvRegimen === "A") {
    ahorroTributarioAnualUF = calcularAhorroAPV_A_UF(sueldoAnualUF, apvAporteAnual).ahorroAnualUF;
  } else if (apvRegimen === "B") {
    ahorroTributarioAnualUF = calcularCreditoAPV_B_UF(apvAporteAnual).creditoAnualUF;
  }

  const aporteAnual = (afpAporteMensualUF + apvAporteMensualUF) * 12;

  // --- Fase de acumulación (compartida): edadActual → edadRetiro ---
  let saldoPrev = afpSaldoUF + apvSaldoUF;
  let otros = otrosActivosUF;
  const accum: YearRow[] = [];
  for (let edad = edadActual; edad < edadRetiro; edad++) {
    saldoPrev = (saldoPrev + aporteAnual) * (1 + rentAcumulacion);
    otros = otros * (1 + otrosActivosRentAnual);
    accum.push({
      edad: edad + 1,
      fase: "acumulacion",
      saldoPrevisionalUF: saldoPrev,
      otrosActivosUF: otros,
      patrimonioNetoUF: saldoPrev + otros + valorCasaUF,
      ingresoMensualUF: 0,
    });
  }
  const saldoPrevisionalAlRetiroUF = saldoPrev;
  const otrosAlRetiro = otros;

  const aniosPayout = Math.max(0, edadFinal - edadRetiro);

  // --- Renta vitalicia: pensión constante; el saldo previsional se "entrega". ---
  const pensionVitaliciaMensualUF = anualidadMensualUF(saldoPrevisionalAlRetiroUF, rentPayout, aniosPayout);
  const proyeccionVitalicia: YearRow[] = [...accum];
  {
    let otrosV = otrosAlRetiro;
    for (let edad = edadRetiro; edad < edadFinal; edad++) {
      otrosV = otrosV * (1 + otrosActivosRentAnual);
      proyeccionVitalicia.push({
        edad: edad + 1,
        fase: "desacumulacion",
        saldoPrevisionalUF: 0,
        otrosActivosUF: otrosV,
        patrimonioNetoUF: otrosV + valorCasaUF,
        ingresoMensualUF: pensionVitaliciaMensualUF + arriendoNetoMensualUF,
      });
    }
  }

  // --- Retiro programado: giro anual = saldo / años restantes; pensión decreciente. ---
  const proyeccionRetiroProg: YearRow[] = [...accum];
  let pensionRetiroProgInicialMensualUF = 0;
  {
    let saldoRP = saldoPrevisionalAlRetiroUF;
    let otrosRP = otrosAlRetiro;
    for (let edad = edadRetiro; edad < edadFinal; edad++) {
      const aniosRestantes = edadFinal - edad; // >= 1
      const retiroAnual = aniosRestantes > 0 ? saldoRP / aniosRestantes : saldoRP;
      const pensionMensual = retiroAnual / 12;
      if (edad === edadRetiro) pensionRetiroProgInicialMensualUF = pensionMensual;
      saldoRP = (saldoRP - retiroAnual) * (1 + rentPayout);
      otrosRP = otrosRP * (1 + otrosActivosRentAnual);
      proyeccionRetiroProg.push({
        edad: edad + 1,
        fase: "desacumulacion",
        saldoPrevisionalUF: saldoRP,
        otrosActivosUF: otrosRP,
        patrimonioNetoUF: saldoRP + otrosRP + valorCasaUF,
        ingresoMensualUF: pensionMensual + arriendoNetoMensualUF,
      });
    }
  }

  const tasaReemplazoVitalicia = sueldoMensualUF > 0 ? pensionVitaliciaMensualUF / sueldoMensualUF : 0;
  const flujoPasivoTotalMensualUF = pensionVitaliciaMensualUF + arriendoNetoMensualUF;

  return {
    saldoPrevisionalAlRetiroUF,
    pensionVitaliciaMensualUF,
    pensionRetiroProgInicialMensualUF,
    tasaReemplazoVitalicia,
    flujoPasivoTotalMensualUF,
    ahorroTributarioAnualUF,
    proyeccionVitalicia,
    proyeccionRetiroProg,
  };
}
```

- [ ] **Step 4: Correr el test → pasa**

Run: `npx vitest run lib/tax/apv-proyeccion.test.ts`
Expected: PASS (todos). Si algún `toBeGreaterThan`/`toBeLessThan` falla, revisar el signo del modelo, NO relajar el test sin entender por qué.

- [ ] **Step 5: Commit**

```bash
git add lib/tax/apv-proyeccion.ts lib/tax/apv-proyeccion.test.ts
git commit -m "feat(jubilacion): motor de proyección de jubilación (UF real, lógica pura)"
```

---

## Task 2: Endpoint de precarga `jubilacion`

**Files:**
- Create: `app/api/clients/[id]/patrimonio/jubilacion/route.ts`

**Interfaces:**
- Consumes: `requireAdvisor`/patrón de auth de las otras rutas de patrimonio, `getCurrentRates` de `@/lib/bcch`, `computePatrimonioSummary` de `@/lib/patrimonio/summary`.
- Produces: `GET` que devuelve `{ input: Partial<SimInput>, rates }` con los campos precargables desde datos reales.

Tarea de integración. **Lee primero** una ruta hermana existente para copiar el patrón EXACTO de auth + verificación de acceso al cliente + fetch: `app/api/clients/[id]/patrimonio/resumen/route.ts` (usa `requireAdvisor`, verifica acceso, hace `getCurrentRates`, `computePatrimonioSummary`, y responde con `successResponse`). NO inventes el patrón de auth: cópialo de esa ruta.

- [ ] **Step 1:** Crear `app/api/clients/[id]/patrimonio/jubilacion/route.ts` siguiendo el patrón de `resumen/route.ts`:
  1. Mismo `applyRateLimit` + auth + verificación de acceso al cliente que `resumen`.
  2. Fetch del cliente (`clients`: `fecha_nacimiento`, `ingreso_mensual`), de `client_activos_financieros` (para AFP/APV), y de `client_inmuebles` (para arriendo neto / casa) — o reusar `computePatrimonioSummary` para `flujoPasivoMensual` y `casa_habitacion` como en `resumen`.
  3. `const rates = await getCurrentRates();` — convertir CLP→UF dividiendo por `rates.uf`. Helper local: `const toUF = (montoCLP: number) => rates.uf > 0 ? montoCLP / rates.uf : 0;` (los montos de patrimonio con moneda propia ya se normalizan a CLP con la lógica de `summary`; para los activos crudos, convertir según su `*_moneda` a CLP primero — reutiliza el mismo criterio que `computePatrimonioSummary`/`clp()` si está exportado, o convierte USD/UF/CLP a CLP y luego a UF).
  4. Calcular:
     - `edadActual` = años desde `fecha_nacimiento` a hoy (si falta, omitir el campo).
     - `sueldoMensualUF` = `ingreso_mensual` (CLP) → UF.
     - AFP: de `client_activos_financieros` con `tipo === 'afp'` → `afpSaldoUF` (saldo → UF), `afpAporteMensualUF` (aporte → UF; si no hay aporte pero sí sueldo, sugerir `sueldoMensualUF * 0.10`).
     - APV: `tipo === 'apv'` → `apvSaldoUF`, `apvAporteMensualUF`, `apvRegimen` (campo `regimen`, "A"/"B"/null).
     - `arriendoNetoMensualUF` = `summary.flujoPasivoMensual` (CLP) → UF.
     - `valorCasaUF` = `summary.activos.casa_habitacion` (CLP) → UF.
  5. Responder `successResponse({ input, rates: { usd: rates.usd, uf: rates.uf } })` donde `input` es un `Partial<SimInput>` con los campos calculados (omitir los que no se pudieron derivar; la UI pone defaults para `edadRetiro=65`, `edadFinal=90`, `rentAcumulacion=0.03`, `rentPayout=0.02`, `otrosActivosRentAnual=0`).

- [ ] **Step 2: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. Lectura: mismo patrón de auth/verificación de acceso que `resumen` (sin IDOR); responde `{ input, rates }`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/clients/[id]/patrimonio/jubilacion/route.ts"
git commit -m "feat(jubilacion): endpoint de precarga del simulador desde datos reales"
```

---

## Task 3: UI `SimuladorJubilacion`

**Files:**
- Create: `components/clients/patrimonio/SimuladorJubilacion.tsx`

**Interfaces:**
- Consumes: `simularJubilacion`/`SimInput`/`SimResult` (Task 1), el endpoint `GET /api/clients/[id]/patrimonio/jubilacion` (Task 2), primitivos `Card`/`Input`, recharts, `formatNumber`/`formatCurrency` de `@/lib/format`.
- Produces: `export default function SimuladorJubilacion({ clientId }: { clientId: string })`.

- [ ] **Step 1:** Crear el componente. Carga la precarga (o defaults si falla), estado editable de todos los supuestos, recálculo en vivo con `useMemo(simularJubilacion)`, titular, gráfico recharts y tabla, + disclaimer CMF. SOLO tokens de marca `gb-*`; para las series del chart usar los hex de marca.

```tsx
// components/clients/patrimonio/SimuladorJubilacion.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import Card from "@/components/shared/Card";
import Input from "@/components/shared/Input";
import { simularJubilacion, type SimInput } from "@/lib/tax/apv-proyeccion";
import { formatNumber } from "@/lib/format";

const DEFAULTS: SimInput = {
  edadActual: 40, edadRetiro: 65, edadFinal: 90, sueldoMensualUF: 0,
  afpSaldoUF: 0, afpAporteMensualUF: 0, apvSaldoUF: 0, apvAporteMensualUF: 0, apvRegimen: null,
  rentAcumulacion: 0.03, rentPayout: 0.02, otrosActivosUF: 0, otrosActivosRentAnual: 0,
  arriendoNetoMensualUF: 0, valorCasaUF: 0,
};

const uf = (n: number) => `${formatNumber(Math.round(n))} UF`;

export default function SimuladorJubilacion({ clientId }: { clientId: string }) {
  const [input, setInput] = useState<SimInput>(DEFAULTS);
  const [modalidad, setModalidad] = useState<"vitalicia" | "programado">("vitalicia");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/clients/${clientId}/patrimonio/jubilacion`)
      .then((r) => r.json())
      .then((d) => { if (!cancel && d?.success && d.input) setInput((prev) => ({ ...prev, ...d.input })); })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoaded(true); });
    return () => { cancel = true; };
  }, [clientId]);

  const result = useMemo(() => simularJubilacion(input), [input]);

  const set = <K extends keyof SimInput>(k: K, v: SimInput[K]) => setInput((p) => ({ ...p, [k]: v }));
  const num = (k: keyof SimInput) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === "" ? 0 : Number(e.target.value)) as SimInput[keyof SimInput]);
  const pct = (k: keyof SimInput) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, ((Number(e.target.value) || 0) / 100) as SimInput[keyof SimInput]);

  const proy = modalidad === "vitalicia" ? result.proyeccionVitalicia : result.proyeccionRetiroProg;
  const chartData = proy.map((y) => ({ edad: y.edad, Patrimonio: Math.round(y.patrimonioNetoUF), Ingreso: Math.round(y.ingresoMensualUF) }));

  return (
    <Card title="Simulador de jubilación">
      {/* Supuestos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Input label="Edad actual" type="number" value={input.edadActual} onChange={num("edadActual")} />
        <Input label="Edad de retiro" type="number" value={input.edadRetiro} onChange={num("edadRetiro")} />
        <Input label="Expectativa de vida" type="number" value={input.edadFinal} onChange={num("edadFinal")} />
        <Input label="Sueldo (UF/mes)" type="number" value={input.sueldoMensualUF} onChange={num("sueldoMensualUF")} />
        <Input label="AFP saldo (UF)" type="number" value={input.afpSaldoUF} onChange={num("afpSaldoUF")} />
        <Input label="AFP aporte (UF/mes)" type="number" value={input.afpAporteMensualUF} onChange={num("afpAporteMensualUF")} />
        <Input label="APV saldo (UF)" type="number" value={input.apvSaldoUF} onChange={num("apvSaldoUF")} />
        <Input label="APV aporte (UF/mes)" type="number" value={input.apvAporteMensualUF} onChange={num("apvAporteMensualUF")} />
        <label className="text-xs font-medium text-gb-dark">Régimen APV
          <select value={input.apvRegimen ?? ""} onChange={(e) => set("apvRegimen", (e.target.value || null) as SimInput["apvRegimen"])}
            className="mt-1.5 w-full rounded-md border border-gb-border px-3 py-2 text-sm text-gb-black focus:border-gb-primary focus:outline-none">
            <option value="">—</option><option value="A">A</option><option value="B">B</option>
          </select>
        </label>
        <Input label="Rentab. acumulación %" type="number" step="0.1" value={Math.round(input.rentAcumulacion * 1000) / 10} onChange={pct("rentAcumulacion")} />
        <Input label="Rentab. pago %" type="number" step="0.1" value={Math.round(input.rentPayout * 1000) / 10} onChange={pct("rentPayout")} />
        <Input label="Arriendo neto (UF/mes)" type="number" value={input.arriendoNetoMensualUF} onChange={num("arriendoNetoMensualUF")} />
        <Input label="Valor casa (UF)" type="number" value={input.valorCasaUF} onChange={num("valorCasaUF")} />
      </div>

      {/* Titular */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="rounded-md border border-gb-border p-3">
          <p className="text-xs text-gb-gray">Pensión renta vitalicia</p>
          <p className="text-lg font-semibold text-gb-black">{uf(result.pensionVitaliciaMensualUF)}<span className="text-xs text-gb-gray">/mes</span></p>
        </div>
        <div className="rounded-md border border-gb-border p-3">
          <p className="text-xs text-gb-gray">Pensión retiro programado (inicial)</p>
          <p className="text-lg font-semibold text-gb-black">{uf(result.pensionRetiroProgInicialMensualUF)}<span className="text-xs text-gb-gray">/mes</span></p>
        </div>
        <div className="rounded-md border border-gb-border p-3">
          <p className="text-xs text-gb-gray">Tasa de reemplazo</p>
          <p className="text-lg font-semibold text-gb-primary">{Math.round(result.tasaReemplazoVitalicia * 100)}%</p>
        </div>
        <div className="rounded-md border border-gb-border p-3">
          <p className="text-xs text-gb-gray">Flujo pasivo total</p>
          <p className="text-lg font-semibold text-gb-black">{uf(result.flujoPasivoTotalMensualUF)}<span className="text-xs text-gb-gray">/mes</span></p>
        </div>
      </div>

      {/* Toggle modalidad */}
      <div className="flex items-center gap-2 mb-3">
        {(["vitalicia", "programado"] as const).map((m) => (
          <button key={m} onClick={() => setModalidad(m)}
            className={`text-xs font-semibold rounded-[3px] px-3 py-1.5 border ${modalidad === m ? "bg-gb-black text-white border-transparent" : "text-gb-info border-gb-border hover:bg-gb-light"}`}>
            {m === "vitalicia" ? "Renta vitalicia" : "Retiro programado"}
          </button>
        ))}
      </div>

      {/* Gráfico */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E4DD" />
            <XAxis dataKey="edad" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => formatNumber(v)} />
            <Legend />
            <Area type="monotone" dataKey="Patrimonio" stroke="#0B2140" fill="#0B2140" fillOpacity={0.12} name="Patrimonio neto (UF)" />
            <Area type="monotone" dataKey="Ingreso" stroke="#EB7838" fill="#EB7838" fillOpacity={0.15} name="Ingreso mensual (UF)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-4 text-xs text-gb-gray">
        Proyección ilustrativa en UF reales. Supuestos editables; no garantiza rentabilidad ni constituye asesoría previsional.
        {result.ahorroTributarioAnualUF > 0 && ` Ahorro tributario APV estimado: ${uf(result.ahorroTributarioAnualUF)}/año (informativo, no capitaliza en el fondo).`}
      </p>
      {!loaded && <p className="text-xs text-gb-gray mt-1">Cargando datos del cliente…</p>}
    </Card>
  );
}
```

**NOTA:** verificar que `@/lib/format` exporta `formatNumber`. Si no, usar `Intl.NumberFormat("es-CL")` inline. Verificar la firma real del primitivo `Input` (acepta `type`/`step`/`value`/`onChange` como passthrough — confirmado en Fase 2). Verificar que recharts se importa como en `components/seguimiento/EvolucionChart.tsx`.

- [ ] **Step 2: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. `npx eslint components/clients/patrimonio/SimuladorJubilacion.tsx` → sin errores nuevos (paleta).

- [ ] **Step 3: Commit**

```bash
git add components/clients/patrimonio/SimuladorJubilacion.tsx
git commit -m "feat(jubilacion): UI del simulador (supuestos editables + gráfico + disclaimer)"
```

---

## Task 4: Página propia de patrimonio

**Files:**
- Create: `app/(advisor-shell)/clients/[id]/patrimonio/page.tsx`

**Interfaces:**
- Consumes: `PatrimonioResumen`, `PatrimonioSection` (existentes), `SimuladorJubilacion` (Task 3), primitivos `PageContainer`/`PageHeader`.

Tarea de integración. **Lee primero** cómo `ClientDetail.tsx` monta `PatrimonioSection`/`PatrimonioResumen` (props que reciben: `clientId`) y cómo otras páginas del route-group `(advisor-shell)` obtienen el `id` del segmento dinámico (`useParams` en client component).

- [ ] **Step 1:** Crear `app/(advisor-shell)/clients/[id]/patrimonio/page.tsx` (client component):
  - Obtener `id` del segmento (via `useParams()` de `next/navigation`).
  - `PageContainer` + `PageHeader` (eyebrow "Cliente", título "Patrimonio"). Cargar el nombre del cliente con `GET /api/clients/[id]` para el subtítulo (o mostrar solo "Patrimonio" si prefieres no fetch — decisión: fetch simple del nombre, tolerante a error).
  - Un Link "← Volver a la ficha" a `/clients/${id}`.
  - Montar en orden: `<PatrimonioResumen clientId={id} />`, `<PatrimonioSection clientId={id} />`, `<SimuladorJubilacion clientId={id} />` (usar los nombres/props reales verificados en ClientDetail; si `PatrimonioResumen` recibe otra prop, ajustar).
  - Solo tokens de marca.

- [ ] **Step 2: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. `npx eslint "app/(advisor-shell)/clients/[id]/patrimonio/page.tsx"` → sin errores nuevos. Lectura: la ruta monta los 3 componentes con el `id` correcto.

- [ ] **Step 3: Commit**

```bash
git add "app/(advisor-shell)/clients/[id]/patrimonio/page.tsx"
git commit -m "feat(patrimonio): página propia de patrimonio (resumen + inventario + simulador)"
```

---

## Task 5: La ficha enlaza a la página de patrimonio

**Files:**
- Modify: `components/clients/ClientDetail.tsx`

Tarea de integración.

- [ ] **Step 1:** En `components/clients/ClientDetail.tsx`, ubicar el mount de `<PatrimonioSection clientId={client.id} />` (~línea 714) y, si está, el de `PatrimonioResumen`. Reemplazar AMBOS por un bloque compacto con un enlace a la página nueva:

```tsx
import Link from "next/link";
// … donde estaba PatrimonioSection:
<div className="mb-6">
  <Link href={`/clients/${client.id}/patrimonio`}
    className="inline-flex items-center gap-2 rounded-[3px] border border-gb-border px-4 py-2.5 text-sm font-semibold text-gb-info hover:bg-gb-light transition-colors">
    Ver patrimonio completo →
  </Link>
</div>
```

  - Quitar los imports de `PatrimonioSection`/`PatrimonioResumen` si quedan sin uso (evita warnings). Si `Link` ya está importado, no duplicar.

- [ ] **Step 2: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. `npx eslint components/clients/ClientDetail.tsx` → sin errores NUEVOS (los warnings pre-existentes de `Send`/`setClient` no cuentan). Lectura: la ficha ya no monta el acordeón de patrimonio; muestra el enlace.

- [ ] **Step 3: Commit**

```bash
git add components/clients/ClientDetail.tsx
git commit -m "feat(patrimonio): la ficha enlaza a la página de patrimonio (quita acordeón inline)"
```

---

## Task 6: Eliminar la calculadora APV standalone

**Files:**
- Delete: `app/(advisor-shell)/calculadora-apv/` (directorio)
- Modify: `components/shared/AdvisorSidebar.tsx`

- [ ] **Step 1:** Verificar que nada más enlaza a `/calculadora-apv`:

Run: `grep -rn "calculadora-apv" --include=*.tsx --include=*.ts .` (excluyendo docs). Esperado: solo el propio directorio + el link del sidebar. Si hay otros, repuntarlos a `/clients/[id]/patrimonio` o reportarlo.

- [ ] **Step 2:** Eliminar el link del sidebar en `components/shared/AdvisorSidebar.tsx:60`: quitar la línea `{ href: "/calculadora-apv", label: "Calculadora APV", icon: Calculator },`. Si `Calculator` (de lucide-react) queda sin uso, quitar su import.

- [ ] **Step 3:** Eliminar el directorio:

```bash
git rm -r "app/(advisor-shell)/calculadora-apv"
```

- [ ] **Step 4: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. `grep -rn "calculadora-apv" --include=*.tsx --include=*.ts .` → vacío (fuera de docs). `npx eslint components/shared/AdvisorSidebar.tsx` → sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add components/shared/AdvisorSidebar.tsx
git commit -m "chore(jubilacion): elimina la calculadora APV standalone + su link (reemplazada por el simulador)"
```

(El `git rm` ya stageó la eliminación del directorio; el `git add` del sidebar completa el commit.)

---

## Notas de ejecución

- **Modelos:** Task 1 (motor puro, código completo) → transcripción con TDD, subagente económico-medio. Tasks 2–6 (integración) → sonnet. **NO usar haiku** (lección Fase 0/1).
- **Orden:** 1 (motor) → 2 (endpoint) → 3 (UI, usa 1+2) → 4 (página, monta 3) → 5 (ficha enlaza) → 6 (borra standalone). Task 3 depende de 1+2; Task 4 de 3.
- **Al terminar:** `npx tsc --noEmit` + `npx vitest run lib/tax/apv-proyeccion.test.ts lib/tax/apv.test.ts` + lint de los archivos tocados; review final de rama (opus) antes de mergear a master.
- **Sin migración:** esta fase NO agrega columnas (reusa `client_activos_financieros`/`client_inmuebles` de sub-proyecto A, ya en prod). No hay paso manual de Supabase.
- **Gotcha OneDrive:** verificar en build si algo "no aparece" en localhost tras un edit.
