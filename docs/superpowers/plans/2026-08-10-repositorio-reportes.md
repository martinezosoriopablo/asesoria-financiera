# Repositorio unificado de reportes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a central report repository (`report_types` + `reports` + `vw_reports_vigentes`) that unifies the four fragmented report stores, then re-point existing consumers to it without breaking them.

**Architecture:** One Postgres table `reports` (multiformat: html/json/pdf/mp3) with a data-driven `report_types` catalog and a `vw_reports_vigentes` view that returns the latest version per (type, scope-key). Pure logic (usos resolution, scope validation) lives in `lib/reports/` and is unit-tested with vitest; SQL migrations, API routes, and UI get manual verification. Existing consumers migrate one at a time; old tables drop only after each consumer is verified identical.

**Tech Stack:** Next.js 16 App Router + React 19, Supabase Postgres (RLS + Storage), Tailwind v4, Vitest.

## Global Constraints

- Migrations live in `supabase/migrations/`, named `YYYYMMDD_description.sql`. Today's date prefix: `20260810`. Migrations are applied manually (Supabase dashboard) per CLAUDE.md.
- API routes: auth via `requireAdvisor()` from `lib/auth/api-auth.ts` (returns `{ user, advisor, error }` — check `if (error) return error`). Service client via `createAdminClient()` AFTER auth. Rate-limit via `applyRateLimit(request, "route-name", { limit: N })`. Responses via `successResponse(dataObj, status?)` / `errorResponse(msg, status)`; wrap logic in `handleApiError("route-name", async () => { ... })`. Upload validation via `validateUpload(file, { maxSizeMB, allowedTypes, allowedExtensions })`.
- Path alias `@/` maps to project root.
- Usos vocabulary (exact strings): `'distribucion'`, `'insumo_cartera'`, `'insumo_cierre'`.
- Scope keys (exact strings): `'date'`, `'period'`, `'month'`, `'perfil'`.
- Perfil vocabulary (exact strings, from comité): `'conservador'`, `'moderado_conservador'`, `'moderado'`, `'moderado_agresivo'`, `'agresivo'`.
- Report type ids (exact strings): `macro`, `rv`, `rf`, `asset_allocation`, `arbol_decision`, `sectorial`, `seleccion_acciones`, `diario`, `cierre_mensual`, `cartera_modelo`.
- Spanish for UI strings, DB comments, and API error messages (codebase convention).
- Run tests with `npm run test:run`; a single file with `npx vitest run <path>`.
- OneDrive gotcha: after editing files, `next dev` may not hot-reload — restart `npm run dev` if a change doesn't show in localhost.

---

## File Structure

**Created:**
- `supabase/migrations/20260810_reports_repository.sql` — schema (report_types, reports, view, RLS) + seed
- `supabase/migrations/20260810_reports_storage.sql` — `reports` Storage bucket + policies
- `supabase/migrations/20260811_reports_backfill.sql` — idempotent backfill from 4 old tables
- `supabase/migrations/20260812_reports_drop_legacy.sql` — drop old tables (Phase 5)
- `lib/reports/types.ts` — TS interfaces (`ReportRow`, `ReportTypeDef`, `Uso`, `ScopeKey`)
- `lib/reports/catalog.ts` — seed catalog mirror + `requiredScopeFields()`
- `lib/reports/catalog.test.ts`
- `lib/reports/validate.ts` — `resolveUsos()`, `validateReportInput()`, `insumoNeedsTextWarning()`
- `lib/reports/validate.test.ts`
- `app/api/reports/route.ts` — POST (ingest) + GET (list)
- `app/api/reports/[id]/route.ts` — GET (one) + DELETE
- `app/api/report-types/route.ts` — GET + POST (custom type)
- `app/(advisor-shell)/advisor/reportes/page.tsx` — repository page
- `components/reportes/RepositorioReportes.tsx` — list-by-type view
- `components/reportes/UploadReportModal.tsx` — upload flow
- `components/reportes/ReportHistoryModal.tsx` — history per type
- `components/reportes/ReportViewer.tsx` — multiformat viewer
- `components/reportes/NewTypeModal.tsx` — custom type creation

**Modified (Phase 4 re-point):**
- `app/api/comite/recomendacion/route.ts` — read `cartera_modelo` from view
- `app/api/client-closings/route.ts:98` — read `cierre_mensual` from view
- `lib/daily-report-distribution.ts` — read `diario` from view
- `app/api/clients/[id]/reports/route.ts:128` — read comité context from view
- `app/api/comite/generar-cartera/route.ts:142` — read `insumo_cartera` from view
- `app/(advisor-shell)/advisor/page.tsx` + `app/(advisor-shell)/advisor/fund-mapping/page.tsx` — link to new page

**Deleted (Phase 5):**
- `app/api/comite/upload/route.ts`, `app/api/comite/upload-report/route.ts`, `app/api/comite/[type]/route.ts`, `app/api/monthly-reports/route.ts`, `components/comite/ComiteReportsPanel.tsx`

---

## PHASE 0 — Schema + seed

### Task 1: Schema migration + seed

**Files:**
- Create: `supabase/migrations/20260810_reports_repository.sql`

**Interfaces:**
- Produces: tables `report_types`, `reports`; view `vw_reports_vigentes` (columns = `reports.*` plus `usos_efectivos text[]`).

- [ ] **Step 1: Write the migration SQL**

```sql
-- Repositorio unificado de reportes: catálogo de tipos + reportes + vista de vigentes.

CREATE TABLE IF NOT EXISTS report_types (
  id            text PRIMARY KEY,
  label         text NOT NULL,
  scope_key     text NOT NULL CHECK (scope_key IN ('date','period','month','perfil')),
  default_usos  text[] NOT NULL DEFAULT '{}',
  formatos      text[] NOT NULL DEFAULT '{html}',
  is_custom     boolean NOT NULL DEFAULT false,
  orden         int NOT NULL DEFAULT 100,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL REFERENCES report_types(id),
  title         text,
  report_date   date NOT NULL,
  period        text,
  perfil        text,
  content_html  text,
  payload       jsonb,
  pdf_url       text,
  audio_url     text,
  usos          text[],
  uploaded_by   uuid REFERENCES advisors(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_type_date ON reports(type, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_scope ON reports(type, period, perfil, report_date DESC);

CREATE OR REPLACE VIEW vw_reports_vigentes AS
SELECT DISTINCT ON (r.type, COALESCE(r.period,''), COALESCE(r.perfil,''))
       r.*,
       COALESCE(r.usos, rt.default_usos) AS usos_efectivos
FROM reports r
JOIN report_types rt ON rt.id = r.type
ORDER BY r.type, COALESCE(r.period,''), COALESCE(r.perfil,''),
         r.report_date DESC, r.created_at DESC;

-- RLS (misma política que comite_reports): lectura para advisors, escritura service-role.
ALTER TABLE report_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisors_read_report_types" ON report_types
  FOR SELECT USING (auth.uid() IN (SELECT id FROM advisors));
CREATE POLICY "service_write_report_types" ON report_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "advisors_read_reports" ON reports
  FOR SELECT USING (auth.uid() IN (SELECT id FROM advisors));
CREATE POLICY "service_write_reports" ON reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed de tipos curados
INSERT INTO report_types (id, label, scope_key, default_usos, formatos, orden) VALUES
  ('macro','Macro','date','{distribucion,insumo_cartera}','{html,pdf}',10),
  ('rv','Renta Variable','date','{distribucion,insumo_cartera}','{html,pdf}',20),
  ('rf','Renta Fija','date','{distribucion,insumo_cartera}','{html,pdf}',30),
  ('asset_allocation','Asset Allocation','date','{insumo_cartera}','{html,json,pdf}',40),
  ('arbol_decision','Árbol de Decisión','date','{insumo_cartera}','{html,json,pdf}',50),
  ('sectorial','Análisis sectorial/coyuntura','date','{distribucion,insumo_cartera}','{html,pdf}',60),
  ('seleccion_acciones','Selección de acciones','date','{insumo_cartera}','{html,pdf}',70),
  ('diario','Reporte diario (AM/PM)','period','{distribucion}','{html,mp3}',80),
  ('cierre_mensual','Cierre mensual','month','{insumo_cierre,distribucion}','{html,pdf}',90),
  ('cartera_modelo','Cartera modelo','perfil','{}','{json}',100)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply the migration** (Supabase dashboard SQL editor, or local `supabase db push` if configured). Manually paste and run the file contents.

- [ ] **Step 3: Verify schema + seed**

Run in SQL editor:
```sql
SELECT id, scope_key, default_usos, formatos FROM report_types ORDER BY orden;
SELECT count(*) FROM report_types;               -- expect 10
SELECT * FROM vw_reports_vigentes;               -- expect 0 rows, no error
```
Expected: 10 seed rows; view resolves with `usos_efectivos` column present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260810_reports_repository.sql
git commit -m "feat(reportes): schema report_types + reports + vw_reports_vigentes + seed"
```

### Task 2: Storage bucket for PDFs

**Files:**
- Create: `supabase/migrations/20260810_reports_storage.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- Bucket privado para PDFs de reportes. MP3 reusa el bucket 'daily-reports' existente.
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports','reports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "advisors_read_reports_bucket" ON storage.objects
  FOR SELECT USING (bucket_id = 'reports' AND auth.uid() IN (SELECT id FROM advisors));
CREATE POLICY "service_write_reports_bucket" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'reports') WITH CHECK (bucket_id = 'reports');
```

- [ ] **Step 2: Apply + verify** — in dashboard, confirm bucket `reports` exists under Storage.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260810_reports_storage.sql
git commit -m "feat(reportes): bucket privado 'reports' para PDFs"
```

---

## PHASE 1 — Pure logic + endpoints

### Task 3: Types + catalog module

**Files:**
- Create: `lib/reports/types.ts`
- Create: `lib/reports/catalog.ts`
- Test: `lib/reports/catalog.test.ts`

**Interfaces:**
- Produces:
  - `type Uso = 'distribucion' | 'insumo_cartera' | 'insumo_cierre'`
  - `type ScopeKey = 'date' | 'period' | 'month' | 'perfil'`
  - `interface ReportTypeDef { id: string; label: string; scopeKey: ScopeKey; defaultUsos: Uso[]; formatos: Array<'html'|'json'|'pdf'|'mp3'>; }`
  - `const SEED_TYPES: ReportTypeDef[]` (mirror of DB seed, same 10 ids)
  - `function requiredScopeFields(scopeKey: ScopeKey): Array<'report_date'|'period'|'perfil'>`

- [ ] **Step 1: Write the failing test** — `lib/reports/catalog.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { SEED_TYPES, requiredScopeFields } from "./catalog";

describe("catalog", () => {
  it("has the 10 curated types", () => {
    expect(SEED_TYPES.map(t => t.id).sort()).toEqual(
      ["arbol_decision","asset_allocation","cartera_modelo","cierre_mensual",
       "diario","macro","rf","rv","sectorial","seleccion_acciones"]
    );
  });

  it("cartera_modelo is json-only, perfil-scoped, no usos", () => {
    const c = SEED_TYPES.find(t => t.id === "cartera_modelo")!;
    expect(c.scopeKey).toBe("perfil");
    expect(c.formatos).toEqual(["json"]);
    expect(c.defaultUsos).toEqual([]);
  });

  it("requiredScopeFields maps each scope key", () => {
    expect(requiredScopeFields("date")).toEqual(["report_date"]);
    expect(requiredScopeFields("period")).toEqual(["report_date","period"]);
    expect(requiredScopeFields("month")).toEqual(["period"]);
    expect(requiredScopeFields("perfil")).toEqual(["report_date","perfil"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/reports/catalog.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `lib/reports/types.ts`**

```ts
export type Uso = "distribucion" | "insumo_cartera" | "insumo_cierre";
export type ScopeKey = "date" | "period" | "month" | "perfil";
export type Formato = "html" | "json" | "pdf" | "mp3";

export interface ReportTypeDef {
  id: string;
  label: string;
  scopeKey: ScopeKey;
  defaultUsos: Uso[];
  formatos: Formato[];
}

export interface ReportRow {
  id: string;
  type: string;
  title: string | null;
  report_date: string;
  period: string | null;
  perfil: string | null;
  content_html: string | null;
  payload: unknown | null;
  pdf_url: string | null;
  audio_url: string | null;
  usos: Uso[] | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Write `lib/reports/catalog.ts`**

```ts
import type { ReportTypeDef, ScopeKey } from "./types";

export const SEED_TYPES: ReportTypeDef[] = [
  { id: "macro", label: "Macro", scopeKey: "date", defaultUsos: ["distribucion","insumo_cartera"], formatos: ["html","pdf"] },
  { id: "rv", label: "Renta Variable", scopeKey: "date", defaultUsos: ["distribucion","insumo_cartera"], formatos: ["html","pdf"] },
  { id: "rf", label: "Renta Fija", scopeKey: "date", defaultUsos: ["distribucion","insumo_cartera"], formatos: ["html","pdf"] },
  { id: "asset_allocation", label: "Asset Allocation", scopeKey: "date", defaultUsos: ["insumo_cartera"], formatos: ["html","json","pdf"] },
  { id: "arbol_decision", label: "Árbol de Decisión", scopeKey: "date", defaultUsos: ["insumo_cartera"], formatos: ["html","json","pdf"] },
  { id: "sectorial", label: "Análisis sectorial/coyuntura", scopeKey: "date", defaultUsos: ["distribucion","insumo_cartera"], formatos: ["html","pdf"] },
  { id: "seleccion_acciones", label: "Selección de acciones", scopeKey: "date", defaultUsos: ["insumo_cartera"], formatos: ["html","pdf"] },
  { id: "diario", label: "Reporte diario (AM/PM)", scopeKey: "period", defaultUsos: ["distribucion"], formatos: ["html","mp3"] },
  { id: "cierre_mensual", label: "Cierre mensual", scopeKey: "month", defaultUsos: ["insumo_cierre","distribucion"], formatos: ["html","pdf"] },
  { id: "cartera_modelo", label: "Cartera modelo", scopeKey: "perfil", defaultUsos: [], formatos: ["json"] },
];

export function requiredScopeFields(scopeKey: ScopeKey): Array<"report_date" | "period" | "perfil"> {
  switch (scopeKey) {
    case "date": return ["report_date"];
    case "period": return ["report_date", "period"];
    case "month": return ["period"];
    case "perfil": return ["report_date", "perfil"];
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/reports/catalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/reports/types.ts lib/reports/catalog.ts lib/reports/catalog.test.ts
git commit -m "feat(reportes): tipos + catálogo seed con requiredScopeFields"
```

### Task 4: Validation + usos resolution

**Files:**
- Create: `lib/reports/validate.ts`
- Test: `lib/reports/validate.test.ts`

**Interfaces:**
- Consumes: `ReportTypeDef`, `Uso`, `Formato`, `requiredScopeFields` from Task 3.
- Produces:
  - `function resolveUsos(reportUsos: Uso[] | null | undefined, typeDefaults: Uso[]): Uso[]`
  - `interface ReportInput { report_date?: string; period?: string; perfil?: string; formatosPresentes: Formato[]; usos?: Uso[] | null; }`
  - `function validateReportInput(def: ReportTypeDef, input: ReportInput): string | null` (returns error message or null)
  - `function insumoNeedsTextWarning(effectiveUsos: Uso[], hasHtml: boolean, hasPayload: boolean): boolean`

- [ ] **Step 1: Write the failing test** — `lib/reports/validate.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { resolveUsos, validateReportInput, insumoNeedsTextWarning } from "./validate";
import { SEED_TYPES } from "./catalog";

const macro = SEED_TYPES.find(t => t.id === "macro")!;
const diario = SEED_TYPES.find(t => t.id === "diario")!;
const cartera = SEED_TYPES.find(t => t.id === "cartera_modelo")!;

describe("resolveUsos", () => {
  it("uses type defaults when report usos is null", () => {
    expect(resolveUsos(null, macro.defaultUsos)).toEqual(["distribucion","insumo_cartera"]);
  });
  it("empty array override means no usos (explicit)", () => {
    expect(resolveUsos([], macro.defaultUsos)).toEqual([]);
  });
  it("override wins when provided", () => {
    expect(resolveUsos(["distribucion"], macro.defaultUsos)).toEqual(["distribucion"]);
  });
});

describe("validateReportInput", () => {
  it("date-scoped requires report_date", () => {
    expect(validateReportInput(macro, { formatosPresentes: ["html"] }))
      .toMatch(/report_date/);
  });
  it("period-scoped requires period in {am,pm}", () => {
    expect(validateReportInput(diario, { report_date: "2026-08-10", period: "xx", formatosPresentes: ["html"] }))
      .toMatch(/am.*pm/i);
  });
  it("perfil-scoped requires valid perfil", () => {
    expect(validateReportInput(cartera, { report_date: "2026-08-10", perfil: "loco", formatosPresentes: ["json"] }))
      .toMatch(/perfil/);
  });
  it("rejects a format not in the type's formatos", () => {
    expect(validateReportInput(cartera, { report_date: "2026-08-10", perfil: "moderado", formatosPresentes: ["pdf"] }))
      .toMatch(/formato/i);
  });
  it("passes a valid input", () => {
    expect(validateReportInput(macro, { report_date: "2026-08-10", formatosPresentes: ["html"] }))
      .toBeNull();
  });
});

describe("insumoNeedsTextWarning", () => {
  it("warns when insumo tagged but only pdf/mp3 present", () => {
    expect(insumoNeedsTextWarning(["insumo_cartera"], false, false)).toBe(true);
  });
  it("no warning when html present", () => {
    expect(insumoNeedsTextWarning(["insumo_cartera"], true, false)).toBe(false);
  });
  it("no warning when not an insumo", () => {
    expect(insumoNeedsTextWarning(["distribucion"], false, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/reports/validate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `lib/reports/validate.ts`**

```ts
import type { ReportTypeDef, Uso, Formato } from "./types";
import { requiredScopeFields } from "./catalog";

const VALID_PERIODS_AMPM = ["am", "pm"];
const VALID_PERFILES = ["conservador","moderado_conservador","moderado","moderado_agresivo","agresivo"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function resolveUsos(reportUsos: Uso[] | null | undefined, typeDefaults: Uso[]): Uso[] {
  return reportUsos == null ? typeDefaults : reportUsos;
}

export interface ReportInput {
  report_date?: string;
  period?: string;
  perfil?: string;
  formatosPresentes: Formato[];
  usos?: Uso[] | null;
}

export function validateReportInput(def: ReportTypeDef, input: ReportInput): string | null {
  const required = requiredScopeFields(def.scopeKey);
  if (required.includes("report_date") && !input.report_date) {
    return "Falta report_date para este tipo de reporte.";
  }
  if (def.scopeKey === "period") {
    if (!input.period || !VALID_PERIODS_AMPM.includes(input.period)) {
      return "El reporte diario requiere period 'am' o 'pm'.";
    }
  }
  if (def.scopeKey === "month") {
    if (!input.period || !MONTH_RE.test(input.period)) {
      return "El cierre mensual requiere period con formato 'YYYY-MM'.";
    }
  }
  if (def.scopeKey === "perfil") {
    if (!input.perfil || !VALID_PERFILES.includes(input.perfil)) {
      return "Este tipo requiere un perfil válido.";
    }
  }
  if (input.formatosPresentes.length === 0) {
    return "Debe subir al menos un formato de contenido.";
  }
  for (const f of input.formatosPresentes) {
    if (!def.formatos.includes(f)) {
      return `El formato '${f}' no está permitido para el tipo '${def.id}'.`;
    }
  }
  return null;
}

export function insumoNeedsTextWarning(effectiveUsos: Uso[], hasHtml: boolean, hasPayload: boolean): boolean {
  const isInsumo = effectiveUsos.includes("insumo_cartera") || effectiveUsos.includes("insumo_cierre");
  return isInsumo && !hasHtml && !hasPayload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/reports/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reports/validate.ts lib/reports/validate.test.ts
git commit -m "feat(reportes): validación de scope/formato + resolución de usos + warning insumo-sin-texto"
```

### Task 5: Ingest endpoint — `POST /api/reports` + `GET /api/reports`

**Files:**
- Create: `app/api/reports/route.ts`

**Interfaces:**
- Consumes: `SEED_TYPES` fallback, `validateReportInput`, `resolveUsos`, `insumoNeedsTextWarning` from Tasks 3-4; helpers from Global Constraints.
- Produces: `POST /api/reports` (multipart) → `{ success, report, warning? }`; `GET /api/reports?type=&vigente=&desde=&hasta=` → `{ success, reports }`.

- [ ] **Step 1: Write `app/api/reports/route.ts`**

```ts
// app/api/reports/route.ts
// POST: ingesta unificada de un reporte (html/json/pdf/mp3). GET: listar (vigentes o historial).
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateUpload } from "@/lib/upload-validation";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { validateReportInput, resolveUsos, insumoNeedsTextWarning } from "@/lib/reports/validate";
import type { Formato, ReportTypeDef, Uso } from "@/lib/reports/types";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "reports-ingest", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("reports-post", async () => {
    const { user, advisor, error: authError } = await requireAdvisor();
    if (authError) return authError;

    const supabase = createAdminClient();
    const form = await request.formData();
    const type = form.get("type") as string | null;
    if (!type) return errorResponse("Falta 'type'.", 400);

    // Definición del tipo (desde DB; permite custom)
    const { data: typeRow } = await supabase
      .from("report_types").select("*").eq("id", type).maybeSingle();
    if (!typeRow) return errorResponse(`Tipo de reporte desconocido: ${type}`, 400);
    const def: ReportTypeDef = {
      id: typeRow.id, label: typeRow.label, scopeKey: typeRow.scope_key,
      defaultUsos: typeRow.default_usos as Uso[], formatos: typeRow.formatos as Formato[],
    };

    const report_date = (form.get("report_date") as string | null) || undefined;
    const period = (form.get("period") as string | null) || undefined;
    const perfil = (form.get("perfil") as string | null) || undefined;
    const usosRaw = form.get("usos") as string | null; // JSON array o null
    const usos: Uso[] | null = usosRaw ? (JSON.parse(usosRaw) as Uso[]) : null;

    // Contenido
    const htmlField = form.get("html");
    let content_html: string | null = null;
    if (htmlField instanceof File) content_html = await htmlField.text();
    else if (typeof htmlField === "string" && htmlField.trim()) content_html = htmlField;

    const payloadRaw = form.get("payload") as string | null;
    const payload = payloadRaw ? JSON.parse(payloadRaw) : null;

    const pdfFile = form.get("pdf") as File | null;
    const mp3File = form.get("mp3") as File | null;

    const formatosPresentes: Formato[] = [];
    if (content_html) formatosPresentes.push("html");
    if (payload) formatosPresentes.push("json");
    if (pdfFile) formatosPresentes.push("pdf");
    if (mp3File) formatosPresentes.push("mp3");

    const validationError = validateReportInput(def, { report_date, period, perfil, formatosPresentes, usos });
    if (validationError) return errorResponse(validationError, 400);

    // Subir archivos a Storage
    let pdf_url: string | null = null;
    if (pdfFile) {
      const err = validateUpload(pdfFile, { maxSizeMB: 20, allowedExtensions: [".pdf"], allowedTypes: ["application/pdf"] });
      if (err) return errorResponse(err, 400);
      const path = `${type}/${report_date || period}/${Date.now()}-${pdfFile.name}`;
      const { error: upErr } = await supabase.storage.from("reports")
        .upload(path, Buffer.from(await pdfFile.arrayBuffer()), { contentType: "application/pdf", upsert: true });
      if (upErr) return errorResponse(`Error subiendo PDF: ${upErr.message}`, 500);
      pdf_url = path; // se sirve vía URL firmada al leer
    }
    let audio_url: string | null = null;
    if (mp3File) {
      const err = validateUpload(mp3File, { maxSizeMB: 50, allowedExtensions: [".mp3"], allowedTypes: ["audio/mpeg","audio/mp3"] });
      if (err) return errorResponse(err, 400);
      const path = `${report_date || period}/${type}-${Date.now()}.mp3`;
      const { error: upErr } = await supabase.storage.from("daily-reports")
        .upload(path, Buffer.from(await mp3File.arrayBuffer()), { contentType: "audio/mpeg", upsert: true });
      if (upErr) return errorResponse(`Error subiendo MP3: ${upErr.message}`, 500);
      const { data: urlData } = supabase.storage.from("daily-reports").getPublicUrl(path);
      audio_url = urlData.publicUrl;
    }

    // Título: campo explícito o <title> del HTML
    const titleField = form.get("title") as string | null;
    const titleFromHtml = content_html?.match(/<title>([^<]+)<\/title>/i)?.[1];
    const title = titleField || titleFromHtml || def.label;

    const effectiveUsos = resolveUsos(usos, def.defaultUsos);
    const warning = insumoNeedsTextWarning(effectiveUsos, !!content_html, !!payload)
      ? "Este reporte está marcado como insumo IA pero no tiene cuerpo HTML/JSON — la IA no podrá leerlo."
      : undefined;

    const { data, error } = await supabase.from("reports").insert({
      type, title,
      report_date: report_date || `${period}-01`, // cierre_mensual usa 'YYYY-MM' → fecha del día 1
      period: period ?? null, perfil: perfil ?? null,
      content_html, payload, pdf_url, audio_url,
      usos, // null = hereda default
      uploaded_by: advisor?.id ?? user?.id ?? null,
    }).select().single();

    if (error) return errorResponse(`Error al guardar: ${error.message}`, 500);
    return successResponse({ report: data, warning });
  });
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "reports-list", { limit: 60, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("reports-get", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const supabase = createAdminClient();
    const sp = request.nextUrl.searchParams;
    const type = sp.get("type");
    const vigente = sp.get("vigente") === "true";
    const from = vigente ? "vw_reports_vigentes" : "reports";

    let q = supabase.from(from).select("*").order("report_date", { ascending: false }).limit(200);
    if (type) q = q.eq("type", type);
    if (sp.get("desde")) q = q.gte("report_date", sp.get("desde"));
    if (sp.get("hasta")) q = q.lte("report_date", sp.get("hasta"));

    const { data, error } = await q;
    if (error) return errorResponse(error.message, 500);
    return successResponse({ reports: data || [] });
  });
}
```

- [ ] **Step 2: Manual verification** — with `npm run dev` running and logged in as advisor, from the browser console on any advisor page:

```js
const fd = new FormData();
fd.append("type","macro"); fd.append("report_date","2026-08-10");
fd.append("html","<title>Macro test</title><p>hola</p>");
await fetch("/api/reports",{method:"POST",body:fd}).then(r=>r.json());
// expect { success:true, report:{ id, type:'macro', title:'Macro test', usos:null } }
await fetch("/api/reports?type=macro&vigente=true").then(r=>r.json());
// expect the row with usos_efectivos ['distribucion','insumo_cartera']
```
Expected: insert succeeds; vigente list returns the row with `usos_efectivos`.

- [ ] **Step 3: Verify the insumo warning path**

```js
const fd = new FormData();
fd.append("type","asset_allocation"); fd.append("report_date","2026-08-10");
const pdf = new File([new Uint8Array([37,80,68,70])],"x.pdf",{type:"application/pdf"});
fd.append("pdf", pdf);
await fetch("/api/reports",{method:"POST",body:fd}).then(r=>r.json());
// expect success:true with warning about "insumo IA ... no podrá leerlo"
```
Expected: `warning` present.

- [ ] **Step 4: Commit**

```bash
git add app/api/reports/route.ts
git commit -m "feat(reportes): endpoint de ingesta POST/GET /api/reports (multiformato + storage + warning)"
```

### Task 6: `GET`/`DELETE /api/reports/[id]` + signed PDF URL

**Files:**
- Create: `app/api/reports/[id]/route.ts`

**Interfaces:**
- Produces: `GET /api/reports/[id]` → `{ success, report }` (with `pdf_signed_url` when `pdf_url` present); `DELETE /api/reports/[id]` → `{ success }`.

- [ ] **Step 1: Write `app/api/reports/[id]/route.ts`**

```ts
// app/api/reports/[id]/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await applyRateLimit(request, "reports-get-one", { limit: 60, windowSeconds: 60 });
  if (blocked) return blocked;
  return handleApiError("reports-id-get", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const { id } = await params;
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) return errorResponse("Reporte no encontrado", 404);
    let pdf_signed_url: string | null = null;
    if (data.pdf_url) {
      const { data: signed } = await supabase.storage.from("reports").createSignedUrl(data.pdf_url, 60 * 60);
      pdf_signed_url = signed?.signedUrl ?? null;
    }
    return successResponse({ report: { ...data, pdf_signed_url } });
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await applyRateLimit(request, "reports-delete", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;
  return handleApiError("reports-id-delete", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const { id } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) return errorResponse(error.message, 500);
    return successResponse({ deleted: id });
  });
}
```

- [ ] **Step 2: Manual verification** — GET the id from Task 5, confirm `report` returns; for a PDF report confirm `pdf_signed_url` is a working link; DELETE it and confirm it disappears from `GET /api/reports`.

- [ ] **Step 3: Commit**

```bash
git add app/api/reports/[id]/route.ts
git commit -m "feat(reportes): GET/DELETE /api/reports/[id] con URL firmada de PDF"
```

### Task 7: `GET`/`POST /api/report-types`

**Files:**
- Create: `app/api/report-types/route.ts`

**Interfaces:**
- Produces: `GET /api/report-types` → `{ success, types }` (ordered by `orden`); `POST` body `{ id, label, scope_key, default_usos, formatos }` → `{ success, type }` (sets `is_custom=true`).

- [ ] **Step 1: Write `app/api/report-types/route.ts`**

```ts
// app/api/report-types/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

const SCOPE_KEYS = ["date","period","month","perfil"];

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "report-types-get", { limit: 60, windowSeconds: 60 });
  if (blocked) return blocked;
  return handleApiError("report-types-get", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("report_types").select("*").order("orden");
    if (error) return errorResponse(error.message, 500);
    return successResponse({ types: data || [] });
  });
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "report-types-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;
  return handleApiError("report-types-post", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const body = await request.json();
    const { id, label, scope_key, default_usos, formatos } = body || {};
    if (!id || !/^[a-z0-9_]+$/.test(id)) return errorResponse("id inválido (usar snake_case).", 400);
    if (!label) return errorResponse("Falta label.", 400);
    if (!SCOPE_KEYS.includes(scope_key)) return errorResponse("scope_key inválido.", 400);
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("report_types").insert({
      id, label, scope_key,
      default_usos: Array.isArray(default_usos) ? default_usos : [],
      formatos: Array.isArray(formatos) && formatos.length ? formatos : ["html"],
      is_custom: true, orden: 200,
    }).select().single();
    if (error) return errorResponse(error.message, 500);
    return successResponse({ type: data });
  });
}
```

- [ ] **Step 2: Manual verification** — `GET /api/report-types` returns 10 seed types ordered; `POST` a custom `{id:"prueba_custom",label:"Prueba",scope_key:"date",default_usos:["distribucion"],formatos:["html"]}` succeeds and appears in GET.

- [ ] **Step 3: Commit**

```bash
git add app/api/report-types/route.ts
git commit -m "feat(reportes): catálogo GET + alta de tipo custom POST /api/report-types"
```

---

## PHASE 2 — Backfill

### Task 8: Idempotent backfill migration

**Files:**
- Create: `supabase/migrations/20260811_reports_backfill.sql`

**Interfaces:**
- Consumes: `reports` schema. Produces: rows in `reports` mirroring the 4 legacy tables. Old tables untouched and still authoritative for consumers until Phase 4.

- [ ] **Step 1: Write the backfill SQL** (idempotent via `NOT EXISTS` guards on natural keys)

```sql
-- Backfill de las 4 tablas legacy → reports. Idempotente (re-ejecutable).

-- comite_reports (1 por tipo, sin historial). usos=NULL → hereda default del tipo.
INSERT INTO reports (type, title, report_date, content_html, usos, uploaded_by, created_at)
SELECT c.type, c.title, COALESCE(c.report_date, CURRENT_DATE), c.content, NULL, NULL, c.uploaded_at
FROM comite_reports c
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.type = c.type AND r.report_date = COALESCE(c.report_date, CURRENT_DATE)
);

-- monthly_reports → cierre_mensual, period=month ('YYYY-MM'), report_date = día 1.
INSERT INTO reports (type, title, report_date, period, content_html, created_at)
SELECT 'cierre_mensual', m.title, to_date(m.month || '-01','YYYY-MM-DD'), m.month, m.html_content, m.created_at
FROM monthly_reports m
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.type = 'cierre_mensual' AND r.period = m.month
);

-- daily_reports → diario, period=am/pm, audio_url = podcast_url.
INSERT INTO reports (type, title, report_date, period, content_html, audio_url, created_at)
SELECT 'diario', d.subject, d.report_date, d.period, d.html_content, d.podcast_url, d.created_at
FROM daily_reports d
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.type='diario' AND r.report_date=d.report_date AND r.period=d.period
);

-- model_portfolios → cartera_modelo, perfil, payload={posiciones,sleeves}. Conserva historial por report_date.
INSERT INTO reports (type, title, report_date, perfil, payload, created_at)
SELECT 'cartera_modelo',
       'Cartera modelo ' || mp.perfil,
       mp.report_date, mp.perfil,
       jsonb_build_object('posiciones', mp.posiciones, 'sleeves', mp.sleeves),
       COALESCE(mp.created_at, now())
FROM model_portfolios mp
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.type='cartera_modelo' AND r.perfil=mp.perfil AND r.report_date=mp.report_date
);
```

> Note: if `model_portfolios` column names differ (verify against `supabase/migrations/20260526_comite_pipeline.sql`), adjust `mp.sleeves`/`mp.posiciones`/`mp.created_at` accordingly before running.

- [ ] **Step 2: Verify column names before running** — open `supabase/migrations/20260526_comite_pipeline.sql`, confirm `model_portfolios` has `perfil`, `posiciones`, `sleeves`, `report_date`, `created_at`. Fix the SQL if any differ.

- [ ] **Step 3: Apply the migration + verify counts**

```sql
SELECT (SELECT count(*) FROM comite_reports)  AS old_comite,
       (SELECT count(*) FROM reports WHERE type IN ('macro','rv','rf','asset_allocation')) AS new_comite;
SELECT (SELECT count(*) FROM monthly_reports) AS old_month,
       (SELECT count(*) FROM reports WHERE type='cierre_mensual') AS new_month;
SELECT (SELECT count(*) FROM daily_reports)   AS old_daily,
       (SELECT count(*) FROM reports WHERE type='diario') AS new_daily;
SELECT (SELECT count(*) FROM model_portfolios) AS old_mp,
       (SELECT count(*) FROM reports WHERE type='cartera_modelo') AS new_mp;
```
Expected: new counts ≥ old counts for each pair (comité may map custom types too). Re-run the migration once and confirm counts do NOT change (idempotency).

- [ ] **Step 4: Verify carteras vigentes resolve one-per-perfil**

```sql
SELECT perfil, report_date FROM vw_reports_vigentes WHERE type='cartera_modelo' ORDER BY perfil;
```
Expected: exactly one row per perfil (the latest report_date).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811_reports_backfill.sql
git commit -m "feat(reportes): backfill idempotente de las 4 tablas legacy → reports"
```

---

## PHASE 3 — Repository UI

### Task 9: Repository page + list-by-type

**Files:**
- Create: `app/(advisor-shell)/advisor/reportes/page.tsx`
- Create: `components/reportes/RepositorioReportes.tsx`

**Interfaces:**
- Consumes: `GET /api/report-types`, `GET /api/reports?vigente=true`.
- Produces: `<RepositorioReportes />` client component rendering one card per type with usos badges, "vigente: <fecha>", and _Subir_ / _Historial_ buttons that open the modals from Tasks 10-11.

- [ ] **Step 1: Write the page** — `app/(advisor-shell)/advisor/reportes/page.tsx`

```tsx
import RepositorioReportes from "@/components/reportes/RepositorioReportes";

export const metadata = { title: "Repositorio de reportes" };

export default function Page() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-gb-black mb-1">Repositorio de reportes</h1>
      <p className="text-sm text-gb-gray mb-6">Biblioteca central del comité. Sube, versiona y define el uso de cada reporte.</p>
      <RepositorioReportes />
    </div>
  );
}
```

- [ ] **Step 2: Write `components/reportes/RepositorioReportes.tsx`** — fetches types + vigentes, renders cards. Follow the visual conventions and lucide-icon usage in `components/comite/ComiteReportsPanel.tsx`. Card shows: `label`, usos badges (map `distribucion`→"Distribución", `insumo_cartera`→"Insumo cartera", `insumo_cierre`→"Insumo cierre"), the vigente report's `report_date` (or "sin versión"), and two buttons. State holds `types`, `vigentesByType` (Map), plus `uploadType` / `historyType` to drive the modals. Include a "＋ Nuevo tipo" button that opens `NewTypeModal` (Task 13).

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import UploadReportModal from "./UploadReportModal";
import ReportHistoryModal from "./ReportHistoryModal";
import NewTypeModal from "./NewTypeModal";

interface TypeRow { id: string; label: string; scope_key: string; default_usos: string[]; formatos: string[]; }
interface Vigente { id: string; type: string; report_date: string; usos_efectivos: string[]; }
const USO_LABEL: Record<string,string> = { distribucion:"Distribución", insumo_cartera:"Insumo cartera", insumo_cierre:"Insumo cierre" };

export default function RepositorioReportes() {
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [vig, setVig] = useState<Record<string, Vigente>>({});
  const [uploadType, setUploadType] = useState<TypeRow | null>(null);
  const [historyType, setHistoryType] = useState<TypeRow | null>(null);
  const [newType, setNewType] = useState(false);

  const load = useCallback(async () => {
    const [t, v] = await Promise.all([
      fetch("/api/report-types").then(r => r.json()),
      fetch("/api/reports?vigente=true").then(r => r.json()),
    ]);
    setTypes(t.types || []);
    const map: Record<string, Vigente> = {};
    for (const r of (v.reports || []) as Vigente[]) if (!map[r.type]) map[r.type] = r;
    setVig(map);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setNewType(true)} className="text-sm text-gb-info underline">＋ Nuevo tipo</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {types.map(t => {
          const usos = vig[t.id]?.usos_efectivos ?? t.default_usos;
          return (
            <div key={t.id} className="bg-white border border-gb-border rounded-lg p-4">
              <div className="font-medium text-gb-black">{t.label}</div>
              <div className="flex flex-wrap gap-1 my-2">
                {usos.map(u => <span key={u} className="text-xs px-2 py-0.5 rounded-full bg-gb-primary/10 text-gb-primary">{USO_LABEL[u] ?? u}</span>)}
              </div>
              <div className="text-xs text-gb-gray mb-3">{vig[t.id] ? `Vigente: ${vig[t.id].report_date}` : "Sin versión"}</div>
              <div className="flex gap-2">
                <button onClick={() => setUploadType(t)} className="text-sm px-3 py-1.5 rounded bg-gb-primary text-white">Subir</button>
                <button onClick={() => setHistoryType(t)} className="text-sm px-3 py-1.5 rounded border border-gb-border">Historial</button>
              </div>
            </div>
          );
        })}
      </div>
      {uploadType && <UploadReportModal type={uploadType} onClose={() => setUploadType(null)} onDone={() => { setUploadType(null); load(); }} />}
      {historyType && <ReportHistoryModal type={historyType} onClose={() => setHistoryType(null)} onChanged={load} />}
      {newType && <NewTypeModal onClose={() => setNewType(false)} onDone={() => { setNewType(false); load(); }} />}
    </div>
  );
}
```

- [ ] **Step 3: Add sidebar link** — in `components/**/AdvisorSidebar.tsx` (find with `grep -rl "fund-mapping\|/advisor/fondos" components`), add a nav entry `{ href: "/advisor/reportes", label: "Reportes" }` next to the existing Comité/Research entries, matching the surrounding item shape.

- [ ] **Step 4: Manual verification** — restart `npm run dev` (OneDrive), visit `/advisor/reportes`: 10 cards render with usos badges; the Macro card shows "Vigente: 2026-08-10" from the Task 5 test insert.

- [ ] **Step 5: Commit**

```bash
git add app/(advisor-shell)/advisor/reportes/page.tsx components/reportes/RepositorioReportes.tsx components/**/AdvisorSidebar.tsx
git commit -m "feat(reportes): página Repositorio de reportes (tarjetas por tipo + sidebar)"
```

### Task 10: Upload modal

**Files:**
- Create: `components/reportes/UploadReportModal.tsx`

**Interfaces:**
- Consumes: `POST /api/reports`; prop `type: { id, label, scope_key, default_usos, formatos }`, `onClose()`, `onDone()`.
- Produces: modal that, per `scope_key`, shows the right key fields and, per `formatos`, the right file/text inputs, with usos checkboxes pre-checked from `default_usos`.

- [ ] **Step 1: Write the modal.** Fields by `scope_key`: `date`→date input (report_date); `period`→date input + AM/PM select; `month`→month input (`YYYY-MM`, submit as `period`); `perfil`→date input + perfil select (5 perfiles). Inputs by `formatos`: `html`→textarea or .html file; `json`→textarea (parsed to `payload`); `pdf`→file; `mp3`→file. Usos: three checkboxes pre-checked from `default_usos`; submit `usos` only if the user changed them from default (else omit → inherit). Build `FormData` and POST. Show returned `warning` (amber) if present before closing.

```tsx
"use client";
import { useState } from "react";

const PERFILES = ["conservador","moderado_conservador","moderado","moderado_agresivo","agresivo"];
const USOS = [["distribucion","Distribución"],["insumo_cartera","Insumo cartera"],["insumo_cierre","Insumo cierre"]] as const;

export default function UploadReportModal({ type, onClose, onDone }: {
  type: { id: string; label: string; scope_key: string; default_usos: string[]; formatos: string[] };
  onClose: () => void; onDone: () => void;
}) {
  const [reportDate, setReportDate] = useState("");
  const [period, setPeriod] = useState("");      // am/pm
  const [month, setMonth] = useState("");        // YYYY-MM
  const [perfil, setPerfil] = useState("");
  const [html, setHtml] = useState("");
  const [json, setJson] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [mp3, setMp3] = useState<File | null>(null);
  const [usos, setUsos] = useState<string[]>(type.default_usos);
  const [usosTouched, setUsosTouched] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const has = (f: string) => type.formatos.includes(f);
  const sk = type.scope_key;

  const submit = async () => {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.append("type", type.id);
    if (sk === "month") fd.append("period", month);
    else {
      if (reportDate) fd.append("report_date", reportDate);
      if (sk === "period") fd.append("period", period);
      if (sk === "perfil") fd.append("perfil", perfil);
    }
    if (has("html") && html.trim()) fd.append("html", html);
    if (has("json") && json.trim()) fd.append("payload", json);
    if (has("pdf") && pdf) fd.append("pdf", pdf);
    if (has("mp3") && mp3) fd.append("mp3", mp3);
    if (usosTouched) fd.append("usos", JSON.stringify(usos));
    const res = await fetch("/api/reports", { method: "POST", body: fd }).then(r => r.json());
    setBusy(false);
    if (!res.success) { setMsg(`Error: ${res.error}`); return; }
    if (res.warning) { setMsg(`⚠ ${res.warning}`); setTimeout(onDone, 1500); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-5 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Subir · {type.label}</h3>
        {(sk === "date" || sk === "period" || sk === "perfil") && (
          <label className="block text-sm mb-2">Fecha
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="block border rounded px-2 py-1 w-full" /></label>
        )}
        {sk === "period" && (
          <label className="block text-sm mb-2">Período
            <select value={period} onChange={e => setPeriod(e.target.value)} className="block border rounded px-2 py-1 w-full">
              <option value="">—</option><option value="am">AM</option><option value="pm">PM</option></select></label>
        )}
        {sk === "month" && (
          <label className="block text-sm mb-2">Mes
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="block border rounded px-2 py-1 w-full" /></label>
        )}
        {sk === "perfil" && (
          <label className="block text-sm mb-2">Perfil
            <select value={perfil} onChange={e => setPerfil(e.target.value)} className="block border rounded px-2 py-1 w-full">
              <option value="">—</option>{PERFILES.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
        )}
        {has("html") && <label className="block text-sm mb-2">HTML<textarea value={html} onChange={e => setHtml(e.target.value)} rows={4} className="block border rounded px-2 py-1 w-full font-mono text-xs" /></label>}
        {has("json") && <label className="block text-sm mb-2">JSON<textarea value={json} onChange={e => setJson(e.target.value)} rows={4} className="block border rounded px-2 py-1 w-full font-mono text-xs" /></label>}
        {has("pdf") && <label className="block text-sm mb-2">PDF<input type="file" accept=".pdf" onChange={e => setPdf(e.target.files?.[0] ?? null)} className="block w-full" /></label>}
        {has("mp3") && <label className="block text-sm mb-2">MP3<input type="file" accept=".mp3" onChange={e => setMp3(e.target.files?.[0] ?? null)} className="block w-full" /></label>}
        <div className="flex gap-3 my-3">
          {USOS.map(([id, label]) => (
            <label key={id} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={usos.includes(id)} onChange={() => { setUsosTouched(true); setUsos(u => u.includes(id) ? u.filter(x => x !== id) : [...u, id]); }} />{label}</label>
          ))}
        </div>
        {msg && <div className="text-sm mb-2 text-amber-700">{msg}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
          <button onClick={submit} disabled={busy} className="px-3 py-1.5 text-sm bg-gb-primary text-white rounded">{busy ? "Subiendo…" : "Subir"}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification** — Upload a `cierre_mensual` (month picker) with HTML; upload a `cartera_modelo` (perfil select) with JSON `{"posiciones":[]}`; upload a `diario` with AM + MP3 file. Each appears as the new vigente on its card after `onDone` reloads.

- [ ] **Step 3: Commit**

```bash
git add components/reportes/UploadReportModal.tsx
git commit -m "feat(reportes): modal de subida (campos por scope + inputs por formato + usos override)"
```

### Task 11: History modal + viewer

**Files:**
- Create: `components/reportes/ReportHistoryModal.tsx`
- Create: `components/reportes/ReportViewer.tsx`

**Interfaces:**
- Consumes: `GET /api/reports?type=<id>` (full history), `GET /api/reports/[id]`, `DELETE /api/reports/[id]`.
- Produces: `ReportHistoryModal` lists all versions (date, period/perfil, uploaded_by, Ver/Eliminar); `ReportViewer` renders one report by format: html→sandboxed iframe (`srcDoc`), pdf→`<iframe src={pdf_signed_url}>`, mp3→`<audio>`, json→`<pre>` (cartera table optional, JSON `<pre>` acceptable for v1).

- [ ] **Step 1: Write `ReportViewer.tsx`** — accepts `reportId`, fetches `/api/reports/[id]`, renders by available field:

```tsx
"use client";
import { useEffect, useState } from "react";

export default function ReportViewer({ reportId }: { reportId: string }) {
  const [r, setR] = useState<any>(null);
  useEffect(() => { fetch(`/api/reports/${reportId}`).then(x => x.json()).then(d => setR(d.report)); }, [reportId]);
  if (!r) return <div className="text-sm text-gb-gray">Cargando…</div>;
  return (
    <div className="space-y-3">
      {r.content_html && <iframe sandbox="allow-same-origin" srcDoc={r.content_html} className="w-full h-[60vh] border rounded" />}
      {r.pdf_signed_url && <iframe src={r.pdf_signed_url} className="w-full h-[60vh] border rounded" />}
      {r.audio_url && <audio controls src={r.audio_url} className="w-full" />}
      {r.payload && !r.content_html && <pre className="text-xs bg-gb-light p-3 rounded overflow-auto max-h-[60vh]">{JSON.stringify(r.payload, null, 2)}</pre>}
    </div>
  );
}
```

- [ ] **Step 2: Write `ReportHistoryModal.tsx`** — fetch `/api/reports?type=<id>`, list versions; a "Ver" toggles an inline `<ReportViewer reportId=…>`; "Eliminar" calls DELETE then refetches and `onChanged()`.

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import ReportViewer from "./ReportViewer";

export default function ReportHistoryModal({ type, onClose, onChanged }: {
  type: { id: string; label: string }; onClose: () => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const load = useCallback(() => { fetch(`/api/reports?type=${type.id}`).then(r => r.json()).then(d => setRows(d.reports || [])); }, [type.id]);
  useEffect(() => { load(); }, [load]);
  const del = async (id: string) => { await fetch(`/api/reports/${id}`, { method: "DELETE" }); load(); onChanged(); };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-5 w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Historial · {type.label}</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gb-gray"><th>Fecha</th><th>Clave</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="py-1">{r.report_date}{i === 0 && <span className="ml-2 text-xs text-gb-success">vigente</span>}</td>
                <td>{r.period || r.perfil || "—"}</td>
                <td className="text-right">
                  <button onClick={() => setViewing(viewing === r.id ? null : r.id)} className="text-gb-info underline mr-3">Ver</button>
                  <button onClick={() => del(r.id)} className="text-gb-danger underline">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {viewing && <div className="mt-4"><ReportViewer reportId={viewing} /></div>}
        <div className="flex justify-end mt-4"><button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cerrar</button></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification** — Open history for `cartera_modelo`: multiple perfiles/dates listed, first row per key marked "vigente". "Ver" renders the JSON; for a Macro HTML report the iframe shows formatted content; delete a test version and confirm it disappears and the card's vigente updates.

- [ ] **Step 4: Commit**

```bash
git add components/reportes/ReportHistoryModal.tsx components/reportes/ReportViewer.tsx
git commit -m "feat(reportes): historial por tipo + viewer multiformato"
```

### Task 12: New custom-type modal

**Files:**
- Create: `components/reportes/NewTypeModal.tsx`

**Interfaces:**
- Consumes: `POST /api/report-types`.
- Produces: modal with id, label, scope_key select, usos checkboxes, formatos checkboxes → POST → `onDone()`.

- [ ] **Step 1: Write the modal** — inputs: `id` (snake_case), `label`, `scope_key` select (date/period/month/perfil), `default_usos` (3 checkboxes), `formatos` (4 checkboxes). POST JSON to `/api/report-types`; on `success` call `onDone()`, else show error.

```tsx
"use client";
import { useState } from "react";
const SCOPES = ["date","period","month","perfil"];
const USOS = ["distribucion","insumo_cartera","insumo_cierre"];
const FMTS = ["html","json","pdf","mp3"];

export default function NewTypeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [id, setId] = useState(""); const [label, setLabel] = useState("");
  const [scope, setScope] = useState("date");
  const [usos, setUsos] = useState<string[]>([]); const [fmts, setFmts] = useState<string[]>(["html"]);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const submit = async () => {
    const res = await fetch("/api/report-types", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label, scope_key: scope, default_usos: usos, formatos: fmts }) }).then(r => r.json());
    if (res.success) onDone(); else setErr(res.error);
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Nuevo tipo de reporte</h3>
        <input placeholder="id (snake_case)" value={id} onChange={e => setId(e.target.value)} className="border rounded px-2 py-1 w-full mb-2" />
        <input placeholder="Etiqueta" value={label} onChange={e => setLabel(e.target.value)} className="border rounded px-2 py-1 w-full mb-2" />
        <select value={scope} onChange={e => setScope(e.target.value)} className="border rounded px-2 py-1 w-full mb-2">{SCOPES.map(s => <option key={s}>{s}</option>)}</select>
        <div className="text-sm mb-1">Usos por defecto</div>
        <div className="flex gap-3 mb-2">{USOS.map(u => <label key={u} className="text-sm flex gap-1"><input type="checkbox" checked={usos.includes(u)} onChange={() => toggle(usos, setUsos, u)} />{u}</label>)}</div>
        <div className="text-sm mb-1">Formatos</div>
        <div className="flex gap-3 mb-2">{FMTS.map(f => <label key={f} className="text-sm flex gap-1"><input type="checkbox" checked={fmts.includes(f)} onChange={() => toggle(fmts, setFmts, f)} />{f}</label>)}</div>
        {err && <div className="text-sm text-gb-danger mb-2">{err}</div>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cancelar</button><button onClick={submit} className="px-3 py-1.5 text-sm bg-gb-primary text-white rounded">Crear</button></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification** — Create a custom type `informe_especial` (scope date, uso distribucion, formato html+pdf); it appears as a new card; upload a report to it; it becomes vigente.

- [ ] **Step 3: Commit**

```bash
git add components/reportes/NewTypeModal.tsx
git commit -m "feat(reportes): modal de alta de tipo custom"
```

---

## PHASE 4 — Re-point consumers (one at a time, each verified)

### Task 13: Recomendación 3-col reads cartera_modelo from the view

**Files:**
- Modify: `app/api/comite/recomendacion/route.ts:76-80`

**Interfaces:**
- Consumes: `vw_reports_vigentes` (`type='cartera_modelo'`, `perfil`, `payload.posiciones`).

- [ ] **Step 1: Capture current output (baseline)** — with `npm run dev`, pick a client id with a perfil + snapshot. Save the JSON:

```bash
curl -s "http://localhost:3000/api/comite/recomendacion?clientId=<ID>" > /tmp/rec_before.json
```
(Use the browser Network tab if the route needs a session cookie.) Keep `rec_before.json`.

- [ ] **Step 2: Modify the model-portfolio query** — replace lines 77-80 (the `model_portfolios` fetch) with a read from the view, mapping `payload.posiciones` into the existing `posiciones` shape:

```ts
    // 3. Cartera-modelo del comité (vigente por perfil, desde el repositorio unificado)
    const { data: carteraRow } = await supabase
      .from("vw_reports_vigentes")
      .select("report_date, payload")
      .eq("type", "cartera_modelo").eq("perfil", perfilModelo).maybeSingle();
    if (!carteraRow) return successResponse({ ok: false, reason: "sin_modelo", perfil_modelo: perfilModelo });
    const modelo = { report_date: carteraRow.report_date, posiciones: (carteraRow.payload as { posiciones?: unknown })?.posiciones ?? [] };
```

The rest of the handler (`modelo.posiciones`, `modelo.report_date`) is unchanged.

- [ ] **Step 3: Compare output to baseline**

```bash
curl -s "http://localhost:3000/api/comite/recomendacion?clientId=<ID>" > /tmp/rec_after.json
diff <(jq -S . /tmp/rec_before.json) <(jq -S . /tmp/rec_after.json)
```
Expected: **no diff** (identical rows). If different, investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add app/api/comite/recomendacion/route.ts
git commit -m "refactor(reportes): recomendación 3-col lee cartera_modelo desde vw_reports_vigentes"
```

### Task 14: Cierre → explicación de resultados reads cierre_mensual from repo

**Files:**
- Modify: `app/api/client-closings/route.ts:97-99`

**Interfaces:**
- Consumes: `vw_reports_vigentes` (`type='cierre_mensual'`, `period=<month>`), field `content_html`.

- [ ] **Step 1: Modify the monthly_reports fetch** — replace the `.from("monthly_reports").select("id, title, html_content")` lookup (around line 98) with a read from the view keyed by the target month, aliasing to the existing variable shape (`report.html_content`):

```ts
    const { data: reportRow } = await supabase
      .from("vw_reports_vigentes")
      .select("id, title, content_html, period")
      .eq("type", "cierre_mensual").eq("period", month).maybeSingle();
    const report = reportRow ? { id: reportRow.id, title: reportRow.title, html_content: reportRow.content_html } : null;
```

Confirm `month` (the `YYYY-MM` variable already used by this route) is in scope at that point; if the existing code used a different variable name for the month, reuse it.

- [ ] **Step 2: Manual verification** — POST `/api/client-closings` for a client + month that has a `cierre_mensual` report (migrated in Task 8). Confirm the generated explanation text is produced (non-empty) and references the month's context, same as before.

- [ ] **Step 3: Commit**

```bash
git add app/api/client-closings/route.ts
git commit -m "refactor(reportes): cierre lee cierre_mensual desde vw_reports_vigentes"
```

### Task 15: Daily distribution reads diario from repo

**Files:**
- Modify: `lib/daily-report-distribution.ts`

**Interfaces:**
- Consumes: `reports` (`type='diario'`) instead of `daily_reports`. The distributor still takes a report id; now it's a `reports.id`.

- [ ] **Step 1: Find the read** — `grep -n "daily_reports" lib/daily-report-distribution.ts`. Replace the `.from("daily_reports").select(...).eq("id", reportId)` with `.from("reports").select("id, subject:title, html_content:content_html, audio_url, report_date, period").eq("id", reportId).eq("type","diario")`. Map columns: `subject`→`title`, `html_content`→`content_html`, `podcast_url`→`audio_url`.

- [ ] **Step 2: Update the ingest write** — in `app/api/daily-report/upload/route.ts`, replace the `daily_reports` upsert (lines 86-133) with an INSERT into `reports` (`type:'diario'`, `report_date`, `period`, `content_html: html`, `title: subject`, `audio_url: podcastUrl`), returning the new id used by `distributeDailyReport`. Keep the API-key auth and MP3 upload logic unchanged (MP3 still goes to `daily-reports` bucket).

- [ ] **Step 3: Manual verification** — POST to `/api/daily-report/upload` with the `DAILY_REPORT_API_KEY` (an `am` HTML report + optional MP3) with `?distribute=false`. Confirm a `reports` row (`type='diario'`) is created; then trigger distribution for that id and confirm it sends (or dry-run logs recipients).

- [ ] **Step 4: Commit**

```bash
git add lib/daily-report-distribution.ts app/api/daily-report/upload/route.ts
git commit -m "refactor(reportes): distribución diaria lee/escribe type='diario' en reports"
```

### Task 16: Client report commentary + generar-cartera read insumos from repo

**Files:**
- Modify: `app/api/clients/[id]/reports/route.ts:128-131`
- Modify: `app/api/comite/generar-cartera/route.ts:142` (the `comite_reports` fetch)

**Interfaces:**
- Consumes: `vw_reports_vigentes` with `usos_efectivos` for filtering.

- [ ] **Step 1: Client report commentary** — replace the `.from("comite_reports").select("type, title, content, report_date").in("type", comiteTypes...)` (lines 128-131) with a read from the view for the same types, mapping `content_html`→`content`:

```ts
    const { data: comiteRows } = await supabase
      .from("vw_reports_vigentes")
      .select("type, title, content_html, report_date")
      .in("type", comiteTypes.length > 0 ? comiteTypes : ["macro","rv","rf","asset_allocation"]);
    const comiteReports = (comiteRows || []).map(r => ({ type: r.type, title: r.title, content: r.content_html ?? "", report_date: r.report_date }));
```

The downstream `stripHtml(r.content)` and `comiteIncluded` logic is unchanged.

- [ ] **Step 2: generar-cartera** — replace its `comite_reports` fetch (line 142) with a view read filtered to reports whose `usos_efectivos` contains `insumo_cartera`:

```ts
    const { data: reportRows } = await supabase
      .from("vw_reports_vigentes")
      .select("type, title, content_html, payload, report_date, usos_efectivos")
      .contains("usos_efectivos", ["insumo_cartera"]);
    const reports = (reportRows || []).map(r => ({ type: r.type, title: r.title, content: r.content_html ?? (r.payload ? JSON.stringify(r.payload) : ""), report_date: r.report_date }));
```

Match the shape `buildPrompt` expects (verify the `reports` variable fields it reads: `title`, `content`, `report_date`; adjust the map if it reads others).

- [ ] **Step 3: Manual verification** — Generate a client report (POST `/api/clients/[id]/reports`) for a client with a snapshot; confirm `market_commentary` is produced and `comite_reports_included` lists the vigente reports. Call `generar-cartera` and confirm the AI still returns a cartera (the prompt now includes only `insumo_cartera` reports).

- [ ] **Step 4: Commit**

```bash
git add app/api/clients/[id]/reports/route.ts app/api/comite/generar-cartera/route.ts
git commit -m "refactor(reportes): comentario cliente + generar-cartera leen insumos desde vw_reports_vigentes"
```

### Task 17: Point the old UI entry points at the new page

**Files:**
- Modify: `app/(advisor-shell)/advisor/page.tsx`, `app/(advisor-shell)/advisor/fund-mapping/page.tsx`

**Interfaces:** none (link change only).

- [ ] **Step 1: Replace embeds** — where these pages render `<ComiteReportsPanel />`, replace with a link/CTA to `/advisor/reportes` (`<Link href="/advisor/reportes">Ir al repositorio de reportes</Link>`), or embed `<RepositorioReportes />` read-only if the section is meant to stay inline. Remove the now-unused `ComiteReportsPanel` import.

- [ ] **Step 2: Manual verification** — advisor home + fund-mapping no longer show the old upload panel; the link opens `/advisor/reportes`. `npm run build` compiles (no dangling import).

- [ ] **Step 3: Commit**

```bash
git add app/(advisor-shell)/advisor/page.tsx app/(advisor-shell)/advisor/fund-mapping/page.tsx
git commit -m "refactor(reportes): entradas viejas enlazan al Repositorio de reportes"
```

---

## PHASE 5 — Drop legacy

### Task 18: Delete legacy write routes + panel, then drop tables

**Files:**
- Delete: `app/api/comite/upload/route.ts`, `app/api/comite/upload-report/route.ts`, `app/api/comite/[type]/route.ts`, `app/api/monthly-reports/route.ts`, `components/comite/ComiteReportsPanel.tsx`
- Create: `supabase/migrations/20260812_reports_drop_legacy.sql`

- [ ] **Step 1: Confirm nothing references the legacy tables/routes**

```bash
grep -rn "comite_reports\|monthly_reports\|daily_reports\|model_portfolios" app lib components | grep -v "supabase/migrations"
grep -rn "ComiteReportsPanel\|/api/comite/upload\|/api/monthly-reports\|/api/comite/\[type\]" app components
```
Expected: no results (all consumers re-pointed in Phase 4). If any remain, re-point them before dropping.

- [ ] **Step 2: Delete the legacy files**

```bash
git rm app/api/comite/upload/route.ts app/api/comite/upload-report/route.ts app/api/comite/[type]/route.ts app/api/monthly-reports/route.ts components/comite/ComiteReportsPanel.tsx
```

- [ ] **Step 3: Write the drop migration** — `supabase/migrations/20260812_reports_drop_legacy.sql`

```sql
-- Deprecación: las 4 tablas legacy fueron migradas a reports y ningún consumidor las usa.
DROP TABLE IF EXISTS comite_reports;
DROP TABLE IF EXISTS monthly_reports;
DROP TABLE IF EXISTS daily_reports;
DROP TABLE IF EXISTS model_portfolios;
```

> Do NOT apply this migration until Phase 4 is verified in production and a backup snapshot exists. Applying it is the point of no return for the legacy data.

- [ ] **Step 4: Verify build + tests**

Run: `npm run build && npm run test:run`
Expected: build succeeds; all vitest suites pass (including `lib/reports/*`).

- [ ] **Step 5: Commit** (do not apply the drop migration yet if you want a grace period)

```bash
git add -A
git commit -m "chore(reportes): elimina rutas/panel legacy + migración de drop de tablas viejas"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** §4 schema→Tasks 1-2; §4.1 seed→Task 1; §4.3 view→Task 1; §4.4 RLS/Storage→Tasks 1-2; §5 ingest/API→Tasks 5-7; §6 UI→Tasks 9-12; §7 re-point→Tasks 13-17; §8 backfill→Task 8; §9 phases→Tasks map 1:1; §10 out-of-scope respected (no Spec 2/3 work); §11 risks→Task 13 baseline-diff + Task 18 grace-period note.
- **Insumo-without-text warning** (§5 rule 8): Task 4 (`insumoNeedsTextWarning`) + Task 5 wiring + Task 5 Step 3 verification.
- **Vigente auto** (§4.3): view-based, verified in Task 8 Step 4 and Task 11 Step 3.
- **Type consistency:** `resolveUsos`, `validateReportInput`, `insumoNeedsTextWarning`, `requiredScopeFields`, `SEED_TYPES` names identical across Tasks 3-5. View column `usos_efectivos` used identically in Task 1, 5, 16. Perfil vocabulary identical in Global Constraints, Task 4, Task 10.
