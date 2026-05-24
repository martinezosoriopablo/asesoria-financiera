# Smart Portfolio Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect committee model portfolios, preferred funds, custodian config, and radiografia into a pipeline that generates personalized portfolio proposals by risk profile and custodian type.

**Architecture:** Three phases executed in order. Phase 1: model_portfolios table + CRUD + minimal UI. Phase 2: extend advisor_preferred_funds with international instruments, add custodian_config and model_fund_mapping tables, mapping UI. Phase 3: enhance xray + xray-report to load model portfolio, compute deviations, and generate smart reports.

**Tech Stack:** Next.js 16 (App Router), Supabase Postgres, Tailwind v4, Claude API (Sonnet 4 default), Alpha Vantage (ETF profiles)

**Spec:** `docs/superpowers/specs/2026-05-23-smart-portfolio-pipeline-design.md`

---

## Phase 1: Model Portfolios

### Task 1: Database Migration — model_portfolios

**Files:**
- Create: `supabase/migrations/20260523_model_portfolios.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Model portfolios from investment committee
CREATE TABLE IF NOT EXISTS model_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL DEFAULT 1,
  report_date DATE NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN (
    'ultra_conservador', 'conservador', 'moderado',
    'crecimiento', 'agresivo', 'muy_agresivo'
  )),
  posiciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  nota_comite TEXT,
  created_by UUID REFERENCES advisors(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (perfil, report_date)
);

-- Auto-increment version per report_date
CREATE OR REPLACE FUNCTION set_model_portfolio_version()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO NEW.version
  FROM model_portfolios
  WHERE report_date = NEW.report_date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_model_portfolio_version
  BEFORE INSERT ON model_portfolios
  FOR EACH ROW
  EXECUTE FUNCTION set_model_portfolio_version();

-- RLS: all advisors can read, only creator can delete
ALTER TABLE model_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read all model portfolios"
  ON model_portfolios FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Advisors can insert model portfolios"
  ON model_portfolios FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creator can delete own model portfolios"
  ON model_portfolios FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Service role bypass
CREATE POLICY "Service role full access model_portfolios"
  ON model_portfolios FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 2: Run the migration in Supabase**

Copy the SQL above into the Supabase SQL Editor and execute it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523_model_portfolios.sql
git commit -m "feat: model_portfolios table for committee portfolios"
```

---

### Task 2: POST Endpoint — Upload Model Portfolios

**Files:**
- Create: `app/api/comite/model-portfolios/route.ts`

- [ ] **Step 1: Create the POST + GET endpoint**

```typescript
// app/api/comite/model-portfolios/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface PositionInput {
  categoria: string;
  peso: number;
  etf_ref?: string;
  tesis?: string;
}

interface PerfilInput {
  nota_comite?: string;
  posiciones: PositionInput[];
}

interface ModelPortfolioUpload {
  report_date: string;
  perfiles: Record<string, PerfilInput>;
}

const VALID_PERFILES = [
  "ultra_conservador", "conservador", "moderado",
  "crecimiento", "agresivo", "muy_agresivo",
];

// POST — receive JSON, upsert 6 rows (one per profile)
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "model-portfolios-post", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body: ModelPortfolioUpload = await request.json();

    // Validate
    if (!body.report_date || !body.perfiles) {
      return NextResponse.json(
        { success: false, error: "report_date y perfiles son requeridos" },
        { status: 400 }
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.report_date)) {
      return NextResponse.json(
        { success: false, error: "report_date debe tener formato YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const perfilKeys = Object.keys(body.perfiles);
    const invalidPerfiles = perfilKeys.filter((p) => !VALID_PERFILES.includes(p));
    if (invalidPerfiles.length > 0) {
      return NextResponse.json(
        { success: false, error: `Perfiles inválidos: ${invalidPerfiles.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate each profile's positions
    for (const [perfil, data] of Object.entries(body.perfiles)) {
      if (!data.posiciones || !Array.isArray(data.posiciones) || data.posiciones.length === 0) {
        return NextResponse.json(
          { success: false, error: `Perfil ${perfil} debe tener al menos una posición` },
          { status: 400 }
        );
      }
      const totalPeso = data.posiciones.reduce((sum, p) => sum + (p.peso || 0), 0);
      if (Math.abs(totalPeso - 100) > 1) {
        return NextResponse.json(
          { success: false, error: `Perfil ${perfil}: pesos suman ${totalPeso}%, deben sumar 100%` },
          { status: 400 }
        );
      }
    }

    // Delete existing rows for this report_date (upsert approach)
    await supabase
      .from("model_portfolios")
      .delete()
      .eq("report_date", body.report_date);

    // Insert new rows
    const rows = perfilKeys.map((perfil) => ({
      report_date: body.report_date,
      perfil,
      posiciones: body.perfiles[perfil].posiciones,
      nota_comite: body.perfiles[perfil].nota_comite || null,
      created_by: advisor!.id,
    }));

    const { data, error } = await supabase
      .from("model_portfolios")
      .insert(rows)
      .select("id, perfil, version, report_date");

    if (error) {
      console.error("Error inserting model portfolios:", error);
      return NextResponse.json(
        { success: false, error: "Error al guardar carteras modelo" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, inserted: data });
  } catch (error) {
    console.error("Error in model-portfolios POST:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

// GET — returns active models (latest report_date per profile)
// ?perfil=moderado — single profile
// no param — all 6 active models
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "model-portfolios-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const perfil = searchParams.get("perfil");

  // Get the latest report_date
  const { data: latest } = await supabase
    .from("model_portfolios")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .single();

  if (!latest) {
    return NextResponse.json({ success: true, models: [], report_date: null });
  }

  let query = supabase
    .from("model_portfolios")
    .select("*")
    .eq("report_date", latest.report_date)
    .order("perfil");

  if (perfil) {
    query = query.eq("perfil", perfil);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    models: data || [],
    report_date: latest.report_date,
  });
}
```

- [ ] **Step 2: Test via dev server**

Run `npm run dev`, then test with curl:
```bash
# POST a test model portfolio
curl -X POST http://localhost:3000/api/comite/model-portfolios \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"report_date":"2026-05-23","perfiles":{"moderado":{"nota_comite":"Test","posiciones":[{"categoria":"RV EEUU","peso":60,"etf_ref":"SPY","tesis":"Growth"},{"categoria":"RF IG","peso":40,"etf_ref":"LQD","tesis":"Income"}]}}}'

# GET active models
curl http://localhost:3000/api/comite/model-portfolios -H "Cookie: <session-cookie>"
```

- [ ] **Step 3: Commit**

```bash
git add app/api/comite/model-portfolios/route.ts
git commit -m "feat: model portfolios CRUD endpoints"
```

---

### Task 3: History Endpoint

**Files:**
- Create: `app/api/comite/model-portfolios/history/route.ts`

- [ ] **Step 1: Create the history endpoint**

```typescript
// app/api/comite/model-portfolios/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "model-portfolios-history", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  // Get distinct report_dates with count of profiles
  const { data, error } = await supabase
    .from("model_portfolios")
    .select("report_date, version, perfil, created_at")
    .order("report_date", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Group by report_date
  const grouped = new Map<string, { report_date: string; perfiles: string[]; created_at: string }>();
  for (const row of data || []) {
    const existing = grouped.get(row.report_date);
    if (existing) {
      existing.perfiles.push(row.perfil);
    } else {
      grouped.set(row.report_date, {
        report_date: row.report_date,
        perfiles: [row.perfil],
        created_at: row.created_at,
      });
    }
  }

  return NextResponse.json({
    success: true,
    history: Array.from(grouped.values()),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/comite/model-portfolios/history/route.ts
git commit -m "feat: model portfolios history endpoint"
```

---

### Task 4: UI — Model Portfolios in ComiteReportsPanel

**Files:**
- Modify: `components/comite/ComiteReportsPanel.tsx`

- [ ] **Step 1: Add model portfolio state and fetch logic**

Add after the existing state declarations (around line 55), add new state:

```typescript
// Model portfolios state
const [showModelUpload, setShowModelUpload] = useState(false);
const [modelJson, setModelJson] = useState("");
const [modelUploading, setModelUploading] = useState(false);
const [modelError, setModelError] = useState("");
const [activeModels, setActiveModels] = useState<Array<{
  id: string;
  perfil: string;
  posiciones: Array<{ categoria: string; peso: number; etf_ref?: string; tesis?: string }>;
  nota_comite: string | null;
  report_date: string;
}>>([]);
const [modelReportDate, setModelReportDate] = useState<string | null>(null);
```

- [ ] **Step 2: Add fetch and upload functions**

Add after the existing functions (around line 230):

```typescript
const fetchActiveModels = useCallback(async () => {
  try {
    const res = await fetch("/api/comite/model-portfolios");
    const data = await res.json();
    if (data.success) {
      setActiveModels(data.models || []);
      setModelReportDate(data.report_date);
    }
  } catch { /* silent */ }
}, []);

useEffect(() => { fetchActiveModels(); }, [fetchActiveModels]);

const handleModelUpload = async () => {
  setModelError("");
  setModelUploading(true);
  try {
    const parsed = JSON.parse(modelJson);
    const res = await fetch("/api/comite/model-portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    const data = await res.json();
    if (!data.success) {
      setModelError(data.error || "Error al subir");
    } else {
      setModelJson("");
      setShowModelUpload(false);
      fetchActiveModels();
    }
  } catch (e) {
    setModelError(e instanceof SyntaxError ? "JSON inválido" : "Error al procesar");
  } finally {
    setModelUploading(false);
  }
};
```

- [ ] **Step 3: Add model portfolio UI section**

Add at the end of the JSX return, before the closing `</div>`, a new section:

```tsx
{/* Model Portfolios Section */}
<div className="mt-8 border-t border-gb-border pt-6">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h3 className="text-lg font-semibold text-gb-black">Carteras Modelo</h3>
      {modelReportDate && (
        <span className="text-xs text-gb-gray">
          Ultima sesion: {modelReportDate}
        </span>
      )}
    </div>
    <button
      onClick={() => setShowModelUpload(!showModelUpload)}
      className="px-3 py-1.5 text-sm bg-gb-primary text-white rounded hover:bg-gb-primary/90"
    >
      {showModelUpload ? "Cancelar" : "Subir Carteras"}
    </button>
  </div>

  {showModelUpload && (
    <div className="mb-4 space-y-2">
      <textarea
        value={modelJson}
        onChange={(e) => setModelJson(e.target.value)}
        placeholder='Pegar JSON del comité con formato: { "report_date": "2026-05-23", "perfiles": { ... } }'
        rows={8}
        className="w-full border border-gb-border rounded p-3 text-sm font-mono"
      />
      {modelError && <p className="text-red-600 text-sm">{modelError}</p>}
      <button
        onClick={handleModelUpload}
        disabled={modelUploading || !modelJson.trim()}
        className="px-4 py-2 bg-gb-primary text-white rounded text-sm hover:bg-gb-primary/90 disabled:opacity-50"
      >
        {modelUploading ? "Procesando..." : "Procesar JSON"}
      </button>
    </div>
  )}

  {activeModels.length > 0 ? (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gb-border">
            <th className="text-left py-2 px-3 text-gb-gray font-medium">Perfil</th>
            <th className="text-left py-2 px-3 text-gb-gray font-medium">Categorias</th>
            <th className="text-left py-2 px-3 text-gb-gray font-medium">Nota Comite</th>
          </tr>
        </thead>
        <tbody>
          {activeModels.map((m) => (
            <tr key={m.id} className="border-b border-gb-border/50 hover:bg-gray-50">
              <td className="py-2 px-3 font-medium capitalize whitespace-nowrap">
                {m.perfil.replace(/_/g, " ")}
              </td>
              <td className="py-2 px-3">
                <div className="flex flex-wrap gap-1">
                  {m.posiciones.map((p, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700"
                      title={`${p.etf_ref || ""} — ${p.tesis || ""}`}
                    >
                      {p.categoria} ({p.peso}%)
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 px-3 text-gb-gray text-xs max-w-xs truncate">
                {m.nota_comite || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="text-sm text-gb-gray">No hay carteras modelo cargadas.</p>
  )}
</div>
```

- [ ] **Step 4: Add missing imports**

At the top of the file, ensure `useState`, `useCallback`, `useEffect` are imported from React (they likely already are).

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: Build succeeds (or only pre-existing errors)

- [ ] **Step 6: Commit**

```bash
git add components/comite/ComiteReportsPanel.tsx
git commit -m "feat: model portfolio upload UI in comite panel"
```

---

## Phase 2: Extended Preferred Funds + Custodians + Mapping

### Task 5: Database Migration — New Columns + Tables

**Files:**
- Create: `supabase/migrations/20260523_custodian_and_mapping.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 1. Extend advisor_preferred_funds with international instrument support
ALTER TABLE advisor_preferred_funds
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS instrument_type TEXT DEFAULT 'fund'
    CHECK (instrument_type IN ('fund', 'etf', 'stock', 'bond')),
  ADD COLUMN IF NOT EXISTS expense_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS custodian_type TEXT DEFAULT 'agf'
    CHECK (custodian_type IN ('agf', 'corredora', 'internacional'));

-- For international instruments, fund_run can be null or a placeholder
-- Drop the NOT NULL constraint on fund_run if it exists
-- (fund_run is already nullable based on the migration — it's TEXT)

-- Update unique constraint to handle international instruments
-- Current: UNIQUE(advisor_id, fund_run)
-- Need: allow multiple entries with different custodian_types
-- Actually, keep existing constraint since fund_run is the identifier

-- 2. Custodian configuration table
CREATE TABLE IF NOT EXISTS custodian_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('agf', 'corredora', 'internacional')),
  commission_pct NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (advisor_id, name)
);

ALTER TABLE custodian_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors manage own custodians"
  ON custodian_config FOR ALL
  TO authenticated
  USING (advisor_id = auth.uid())
  WITH CHECK (advisor_id = auth.uid());

CREATE POLICY "Service role full access custodian_config"
  ON custodian_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Category-to-fund mapping table
CREATE TABLE IF NOT EXISTS model_fund_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  categoria TEXT NOT NULL,
  custodian_type TEXT NOT NULL CHECK (custodian_type IN ('agf', 'corredora', 'internacional')),
  preferred_fund_id UUID NOT NULL REFERENCES advisor_preferred_funds(id),

  UNIQUE (advisor_id, categoria, custodian_type)
);

ALTER TABLE model_fund_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors manage own mappings"
  ON model_fund_mapping FOR ALL
  TO authenticated
  USING (advisor_id = auth.uid())
  WITH CHECK (advisor_id = auth.uid());

CREATE POLICY "Service role full access model_fund_mapping"
  ON model_fund_mapping FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 2: Run migration in Supabase**

Copy and run in Supabase SQL Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523_custodian_and_mapping.sql
git commit -m "feat: custodian_config + model_fund_mapping tables + extended preferred funds"
```

---

### Task 6: Extend Preferred Funds API

**Files:**
- Modify: `app/api/advisor/preferred-funds/route.ts`

- [ ] **Step 1: Update POST to accept new fields**

In the POST handler (line ~127), update to accept the new fields:

```typescript
// Replace the existing body destructuring:
const { fund_run, fund_name, category, notes, ticker, instrument_type, expense_ratio, description, custodian_type } = body;

// For international instruments, ticker is required instead of fund_run
if (!fund_run && !ticker) {
  return NextResponse.json({ error: "fund_run o ticker requerido" }, { status: 400 });
}

// For ETFs/stocks, generate a placeholder fund_run from ticker
const effectiveFundRun = fund_run || `ETF-${ticker}`;

const { data, error } = await supabase
  .from("advisor_preferred_funds")
  .upsert({
    advisor_id: advisor!.id,
    fund_run: effectiveFundRun,
    fund_name: fund_name || null,
    category: category || null,
    notes: notes || null,
    ticker: ticker || null,
    instrument_type: instrument_type || "fund",
    expense_ratio: expense_ratio ?? null,
    description: description || null,
    custodian_type: custodian_type || "agf",
    active: true,
  }, { onConflict: "advisor_id,fund_run" })
  .select()
  .single();
```

- [ ] **Step 2: Update PATCH to accept new fields**

In the PATCH handler (line ~165), extend the updates object:

```typescript
const { id, category, notes, ticker, instrument_type, expense_ratio, description, custodian_type } = await request.json();

if (!id) {
  return NextResponse.json({ error: "id requerido" }, { status: 400 });
}

const updates: Record<string, unknown> = {};
if (category !== undefined) updates.category = category || null;
if (notes !== undefined) updates.notes = notes || null;
if (ticker !== undefined) updates.ticker = ticker || null;
if (instrument_type !== undefined) updates.instrument_type = instrument_type;
if (expense_ratio !== undefined) updates.expense_ratio = expense_ratio;
if (description !== undefined) updates.description = description || null;
if (custodian_type !== undefined) updates.custodian_type = custodian_type;
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/api/advisor/preferred-funds/route.ts
git commit -m "feat: preferred funds API supports international instruments"
```

---

### Task 7: Custodian CRUD API

**Files:**
- Create: `app/api/advisor/custodians/route.ts`

- [ ] **Step 1: Create the CRUD endpoint**

```typescript
// app/api/advisor/custodians/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

const DEFAULT_COMMISSIONS: Record<string, number> = {
  agf: 0,
  corredora: 0.5,
  internacional: 0.1,
};

// GET — list advisor's custodians
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "custodians-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("custodian_config")
    .select("*")
    .eq("advisor_id", advisor!.id)
    .order("type", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, custodians: data || [] });
}

// POST — create or update custodian
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "custodians-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { name, type, commission_pct, notes } = await request.json();

  if (!name || !type) {
    return NextResponse.json({ error: "name y type son requeridos" }, { status: 400 });
  }

  if (!["agf", "corredora", "internacional"].includes(type)) {
    return NextResponse.json({ error: "type debe ser agf, corredora o internacional" }, { status: 400 });
  }

  const commission = commission_pct ?? DEFAULT_COMMISSIONS[type] ?? 0;

  const { data, error } = await supabase
    .from("custodian_config")
    .upsert({
      advisor_id: advisor!.id,
      name,
      type,
      commission_pct: commission,
      notes: notes || null,
    }, { onConflict: "advisor_id,name" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, custodian: data });
}

// PATCH — update commission/notes
export async function PATCH(request: NextRequest) {
  const blocked = await applyRateLimit(request, "custodians-patch", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id, commission_pct, notes } = await request.json();

  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (commission_pct !== undefined) updates.commission_pct = commission_pct;
  if (notes !== undefined) updates.notes = notes || null;

  const { error } = await supabase
    .from("custodian_config")
    .update(updates)
    .eq("id", id)
    .eq("advisor_id", advisor!.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE — remove custodian
export async function DELETE(request: NextRequest) {
  const blocked = await applyRateLimit(request, "custodians-delete", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { error } = await supabase
    .from("custodian_config")
    .delete()
    .eq("id", id)
    .eq("advisor_id", advisor!.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/advisor/custodians/route.ts
git commit -m "feat: custodian config CRUD API"
```

---

### Task 8: Model Fund Mapping API

**Files:**
- Create: `app/api/advisor/fund-mapping/route.ts`

- [ ] **Step 1: Create the mapping CRUD endpoint**

```typescript
// app/api/advisor/fund-mapping/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

// GET — list all mappings for advisor, enriched with fund names
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fund-mapping-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("model_fund_mapping")
    .select(`
      id,
      categoria,
      custodian_type,
      preferred_fund_id,
      advisor_preferred_funds!inner (
        id, fund_run, fund_name, ticker, category, instrument_type, custodian_type
      )
    `)
    .eq("advisor_id", advisor!.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, mappings: data || [] });
}

// POST — create or update a mapping
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fund-mapping-post", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { categoria, custodian_type, preferred_fund_id } = await request.json();

  if (!categoria || !custodian_type || !preferred_fund_id) {
    return NextResponse.json(
      { error: "categoria, custodian_type y preferred_fund_id son requeridos" },
      { status: 400 }
    );
  }

  // Verify the preferred_fund belongs to this advisor
  const { data: fund } = await supabase
    .from("advisor_preferred_funds")
    .select("id")
    .eq("id", preferred_fund_id)
    .eq("advisor_id", advisor!.id)
    .single();

  if (!fund) {
    return NextResponse.json({ error: "Fondo no encontrado" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("model_fund_mapping")
    .upsert({
      advisor_id: advisor!.id,
      categoria,
      custodian_type,
      preferred_fund_id,
    }, { onConflict: "advisor_id,categoria,custodian_type" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, mapping: data });
}

// DELETE — remove a mapping
export async function DELETE(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fund-mapping-delete", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { error } = await supabase
    .from("model_fund_mapping")
    .delete()
    .eq("id", id)
    .eq("advisor_id", advisor!.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/advisor/fund-mapping/route.ts
git commit -m "feat: model fund mapping CRUD API"
```

---

### Task 9: Mapping UI Page

**Files:**
- Create: `app/(advisor-shell)/advisor/fund-mapping/page.tsx`
- Modify: `components/shared/AdvisorSidebar.tsx` (add nav item)

- [ ] **Step 1: Create the mapping page**

```tsx
// app/(advisor-shell)/advisor/fund-mapping/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface Position {
  categoria: string;
  peso: number;
  etf_ref?: string;
}

interface PreferredFund {
  id: string;
  fund_run: string;
  fund_name: string | null;
  ticker: string | null;
  category: string | null;
  instrument_type: string;
  custodian_type: string;
}

interface MappingRow {
  id: string;
  categoria: string;
  custodian_type: string;
  preferred_fund_id: string;
  advisor_preferred_funds: PreferredFund;
}

const CUSTODIAN_TYPES = ["agf", "corredora", "internacional"] as const;
const CUSTODIAN_LABELS: Record<string, string> = {
  agf: "AGF",
  corredora: "Corredora",
  internacional: "Internacional",
};

export default function FundMappingPage() {
  const [categories, setCategories] = useState<Position[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [funds, setFunds] = useState<PreferredFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, mappingsRes, fundsRes] = await Promise.all([
        fetch("/api/comite/model-portfolios"),
        fetch("/api/advisor/fund-mapping"),
        fetch("/api/advisor/preferred-funds"),
      ]);

      const modelsData = await modelsRes.json();
      const mappingsData = await mappingsRes.json();
      const fundsData = await fundsRes.json();

      // Extract unique categories from all active model portfolios
      if (modelsData.success && modelsData.models?.length > 0) {
        const allPositions = new Map<string, Position>();
        for (const model of modelsData.models) {
          for (const pos of model.posiciones || []) {
            if (!allPositions.has(pos.categoria)) {
              allPositions.set(pos.categoria, pos);
            }
          }
        }
        setCategories(Array.from(allPositions.values()));
        setReportDate(modelsData.report_date);
      }

      if (mappingsData.success) setMappings(mappingsData.mappings || []);
      if (fundsData.success) setFunds(fundsData.funds || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getMapping = (categoria: string, custodianType: string) => {
    return mappings.find(
      (m) => m.categoria === categoria && m.custodian_type === custodianType
    );
  };

  const handleSelect = async (categoria: string, custodianType: string, fundId: string) => {
    const key = `${categoria}-${custodianType}`;
    setSaving(key);
    try {
      if (!fundId) {
        // Remove mapping
        const existing = getMapping(categoria, custodianType);
        if (existing) {
          await fetch(`/api/advisor/fund-mapping?id=${existing.id}`, { method: "DELETE" });
        }
      } else {
        await fetch("/api/advisor/fund-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoria,
            custodian_type: custodianType,
            preferred_fund_id: fundId,
          }),
        });
      }
      await fetchData();
    } catch { /* silent */ }
    setSaving(null);
  };

  const fundsForType = (custodianType: string) => {
    return funds.filter((f) => f.custodian_type === custodianType);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white border-b border-gb-border pb-4 mb-6">
        <h1 className="text-2xl font-semibold text-gb-black">Mapeo de Fondos</h1>
        <p className="text-sm text-gb-gray mt-1">
          Asigna fondos preferidos a cada categoria del comite, por tipo de custodio
          {reportDate && <span className="ml-2 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">Comite: {reportDate}</span>}
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12 text-gb-gray">
          <p className="text-lg mb-2">No hay carteras modelo cargadas</p>
          <p className="text-sm">Sube las carteras modelo desde el panel del Comite para empezar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gb-border">
                <th className="text-left py-3 px-3 text-gb-gray font-medium w-48">Categoria Comite</th>
                <th className="text-center py-3 px-2 text-gb-gray font-medium w-16">Peso</th>
                <th className="text-center py-3 px-2 text-gb-gray font-medium w-16">ETF Ref</th>
                {CUSTODIAN_TYPES.map((ct) => (
                  <th key={ct} className="text-left py-3 px-3 text-gb-gray font-medium">
                    {CUSTODIAN_LABELS[ct]}
                    <span className="text-xs text-gb-gray/60 ml-1">({fundsForType(ct).length})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.categoria} className="border-b border-gb-border/50 hover:bg-gray-50">
                  <td className="py-3 px-3 font-medium">{cat.categoria}</td>
                  <td className="py-3 px-2 text-center text-gb-gray">{cat.peso}%</td>
                  <td className="py-3 px-2 text-center text-xs text-gb-gray font-mono">{cat.etf_ref || "—"}</td>
                  {CUSTODIAN_TYPES.map((ct) => {
                    const mapping = getMapping(cat.categoria, ct);
                    const availableFunds = fundsForType(ct);
                    const key = `${cat.categoria}-${ct}`;
                    return (
                      <td key={ct} className="py-2 px-3">
                        <select
                          value={mapping?.preferred_fund_id || ""}
                          onChange={(e) => handleSelect(cat.categoria, ct, e.target.value)}
                          disabled={saving === key || availableFunds.length === 0}
                          className="w-full text-xs border border-gb-border rounded px-2 py-1.5 disabled:opacity-50"
                        >
                          <option value="">— Sin asignar —</option>
                          {availableFunds.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.ticker ? `${f.ticker} — ` : ""}{f.fund_name || f.fund_run}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add sidebar navigation item**

In `components/shared/AdvisorSidebar.tsx`, find the "Herramientas" tools section (around line 57 where "Mis Fondos" is defined). Add a new item after "Mis Fondos":

```typescript
{ label: "Mapeo Fondos", href: "/advisor/fund-mapping", icon: "grid" },
```

The exact icon used depends on the icon system. Check how existing items define their icon — if it uses Lucide icons or emoji or custom SVG, match that pattern. If using simple text labels, just add the entry.

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/(advisor-shell)/advisor/fund-mapping/page.tsx components/shared/AdvisorSidebar.tsx
git commit -m "feat: fund mapping UI page + sidebar nav item"
```

---

## Phase 3: Smart Radiografia

### Task 10: Enhance Xray Route — Load Model + Compute Deviations

**Files:**
- Modify: `app/api/portfolio/xray/route.ts`

- [ ] **Step 1: Add model portfolio loading and deviation computation**

At the top of the POST handler, after the existing `advisor` auth check and before the holdings analysis, add new parameters and model loading logic.

First, update the request body interface to accept new fields:

```typescript
// Add to the request body parsing (around line 153)
const { holdings, perfilRiesgo, custodianType } = body as {
  holdings: HoldingInput[];
  perfilRiesgo?: string;
  custodianType?: string;
};
```

After the existing pre-fetch block (around line 200), add model portfolio loading:

```typescript
// Load model portfolio if risk profile provided
let modelPortfolio: {
  perfil: string;
  posiciones: Array<{ categoria: string; peso: number; etf_ref?: string; tesis?: string }>;
  nota_comite: string | null;
  report_date: string;
} | null = null;

let fundMappings: Array<{
  categoria: string;
  custodian_type: string;
  preferred_fund_id: string;
  advisor_preferred_funds: { fund_name: string | null; ticker: string | null; fund_run: string };
}> = [];

let custodianConfig: { name: string; type: string; commission_pct: number } | null = null;

if (perfilRiesgo) {
  // Map client perfil_riesgo to model portfolio perfil
  const perfilMap: Record<string, string> = {
    defensivo: "ultra_conservador",
    conservador: "conservador",
    moderado: "moderado",
    agresivo: "agresivo",
    muy_agresivo: "muy_agresivo",
  };
  const modelPerfil = perfilMap[perfilRiesgo] || perfilRiesgo;

  // Get latest model portfolio for this profile
  const { data: latestDate } = await supabase
    .from("model_portfolios")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .single();

  if (latestDate) {
    const { data: model } = await supabase
      .from("model_portfolios")
      .select("perfil, posiciones, nota_comite, report_date")
      .eq("report_date", latestDate.report_date)
      .eq("perfil", modelPerfil)
      .single();

    if (model) {
      modelPortfolio = model as typeof modelPortfolio;
    }
  }

  // Load fund mappings for this advisor
  if (custodianType) {
    const { data: mappings } = await supabase
      .from("model_fund_mapping")
      .select(`
        categoria, custodian_type, preferred_fund_id,
        advisor_preferred_funds!inner (fund_name, ticker, fund_run)
      `)
      .eq("advisor_id", advisor!.id)
      .eq("custodian_type", custodianType);

    if (mappings) fundMappings = mappings as typeof fundMappings;

    // Load custodian config
    const { data: custodians } = await supabase
      .from("custodian_config")
      .select("name, type, commission_pct")
      .eq("advisor_id", advisor!.id)
      .eq("type", custodianType)
      .limit(1)
      .single();

    if (custodians) custodianConfig = custodians;
  }
}
```

- [ ] **Step 2: Add deviations to the response**

After the existing `result` object is built (around line 700), add model portfolio data:

```typescript
// Compute deviations if model portfolio exists
let modelData = null;
if (modelPortfolio) {
  // Map holdings to model categories based on their matched category
  // Build actual allocation by committee category
  const actualByCategory = new Map<string, number>();
  for (const h of result.holdings) {
    const cat = h.categoria || "Otros";
    actualByCategory.set(cat, (actualByCategory.get(cat) || 0) + (h.weight || 0));
  }

  const deviations = modelPortfolio.posiciones.map((pos) => {
    const actualWeight = actualByCategory.get(pos.categoria) || 0;
    const deviation = actualWeight - pos.peso;
    const mappedFund = fundMappings.find((m) => m.categoria === pos.categoria);
    return {
      categoria: pos.categoria,
      targetWeight: pos.peso,
      actualWeight: Math.round(actualWeight * 10) / 10,
      deviation: Math.round(deviation * 10) / 10,
      estado: deviation > 2 ? "SOBREPONDERADO" : deviation < -2 ? "SUBPONDERADO" : "EN_RANGO",
      etfRef: pos.etf_ref || null,
      tesis: pos.tesis || null,
      mappedFund: mappedFund ? {
        fundName: mappedFund.advisor_preferred_funds.fund_name,
        ticker: mappedFund.advisor_preferred_funds.ticker,
        fundRun: mappedFund.advisor_preferred_funds.fund_run,
      } : null,
    };
  });

  modelData = {
    perfil: modelPortfolio.perfil,
    reportDate: modelPortfolio.report_date,
    notaComite: modelPortfolio.nota_comite,
    deviations,
    custodian: custodianConfig ? {
      name: custodianConfig.name,
      type: custodianConfig.type,
      commissionPct: custodianConfig.commission_pct,
    } : null,
  };
}

// Add modelData to the response
return NextResponse.json({
  success: true,
  ...result,
  modelData,
});
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/api/portfolio/xray/route.ts
git commit -m "feat: xray loads model portfolio and computes deviations"
```

---

### Task 11: Enhance Xray Report — Smart Prompt

**Files:**
- Modify: `app/api/portfolio/xray-report/route.ts`

- [ ] **Step 1: Update request interface and prompt**

Add `modelData` to the request body type (line ~65):

```typescript
const { xrayData, clientName, advisoryFee, customContext, ufValue, usdValue, cartolaDate, currentValue, currentValueDate, modelData } = await request.json() as {
  xrayData: XrayData;
  clientName?: string;
  advisoryFee?: number;
  customContext?: string;
  ufValue?: number;
  usdValue?: number;
  cartolaDate?: string;
  currentValue?: number;
  currentValueDate?: string;
  modelData?: {
    perfil: string;
    reportDate: string;
    notaComite: string | null;
    deviations: Array<{
      categoria: string;
      targetWeight: number;
      actualWeight: number;
      deviation: number;
      estado: string;
      etfRef: string | null;
      tesis: string | null;
      mappedFund: { fundName: string | null; ticker: string | null } | null;
    }>;
    custodian: { name: string; type: string; commissionPct: number } | null;
  };
};
```

- [ ] **Step 2: Build model portfolio prompt section**

After the existing `positionComparison` block (around line 124) and before the prompt string, add:

```typescript
// Build model portfolio section for prompt
let modelSection = "";
if (modelData && modelData.deviations.length > 0) {
  const perfilLabel = modelData.perfil.replace(/_/g, " ");
  const deviationRows = modelData.deviations
    .map((d) => {
      const fundStr = d.mappedFund
        ? ` -> Fondo recomendado: ${d.mappedFund.fundName || d.mappedFund.ticker || "N/D"}`
        : "";
      return `- ${d.categoria}: Target ${d.targetWeight}%, Actual ${d.actualWeight}%, Desviacion ${d.deviation > 0 ? "+" : ""}${d.deviation}% [${d.estado}]${fundStr}${d.tesis ? `\n  Tesis: ${d.tesis}` : ""}`;
    })
    .join("\n");

  const custodianStr = modelData.custodian
    ? `\nCustodio: ${modelData.custodian.name} (${modelData.custodian.type}), Comision por operacion: ${modelData.custodian.commissionPct}%`
    : "";

  modelSection = `
CARTERA MODELO DEL COMITE (Perfil: ${perfilLabel}, Fecha: ${modelData.reportDate}):
${modelData.notaComite ? `Nota del comite: "${modelData.notaComite}"` : ""}

DESVIACIONES ACTUAL VS MODELO:
${deviationRows}
${custodianStr}

NOTA: Esta es la recomendacion base del comite. Los fondos definitivos se ajustaran segun la situacion particular del cliente.
`;
}
```

- [ ] **Step 3: Inject model section into the prompt**

In the prompt string (around line 160), add the model section after the `COMPARACION POSICION POR POSICION` block:

```typescript
// Add after the existing proposal section in the prompt:
${modelSection}
```

And update the FORMATO section to include new sections when model data is present:

```typescript
const formatSections = modelData ? `FORMATO DEL INFORME (usa exactamente estas secciones con ##):

## Resumen Ejecutivo
(2-3 oraciones. Describe que tiene el cliente hoy, como se compara vs el modelo del comite, y que podemos mejorar)

## Cartera Modelo vs Actual
(Tabla de desviaciones por categoria. Indica cuales estan sobre/subponderadas. Explica la vision del comite.)

## Posiciones del Cliente
(Analiza cada posicion relevante vs lo que recomienda el modelo)

## Analisis de Costos
(Costo actual vs propuesto. Si hay datos de comision del custodio, incluirlos. Cuantifica impacto a 10 anos)

## Propuesta de Ajuste
(Cambios especificos por categoria, con fondo recomendado, tesis del comite, y costo estimado de cada movimiento)

## Consideraciones Tributarias
(Si AGF->AGF misma familia: sin costo tributario. Si hay rescates con ganancia: advertir y sugerir usar simulador tributario. Si custodio es internacional: mencionar declaracion jurada)

## Vision del Comite
(Resumir las tesis relevantes del comite para este perfil de riesgo)

## Proximos Pasos
(3-4 acciones concretas: reunión, confirmar fondos, ejecutar, seguimiento)` :
`FORMATO DEL INFORME (usa exactamente estas secciones con ##):

## Resumen Ejecutivo
(2-3 oraciones. Describe que tiene el cliente hoy, cuanto le cuesta, y que podemos mejorar)

## Posiciones del Cliente
(Analiza cada posicion relevante: que fondo tiene, en que categoria cae, y si su TAC es competitivo o no)

## Analisis de Costos
(Distingue claramente: 1) lo que el cliente PAGA HOY, 2) lo que PAGARIA con la propuesta. Cuantifica el impacto a 10 anos)

## Propuesta de Referencia
(Describe los cambios sugeridos posicion por posicion. Aclara que es una referencia.)

## Observaciones del Asesor
(Deja esta seccion con 2-3 puntos genericos. El asesor completara despues)

## Proximos Pasos
(3-4 acciones concretas sugeridas)`;
```

Replace the existing format section in the prompt with `${formatSections}`.

- [ ] **Step 4: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add app/api/portfolio/xray-report/route.ts
git commit -m "feat: xray report includes model portfolio deviations and smart sections"
```

---

### Task 12: Update RadiografiaCartola + SeguimientoPage

**Files:**
- Modify: `components/seguimiento/RadiografiaCartola.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

- [ ] **Step 1: Pass risk profile and custodian to RadiografiaCartola**

In `SeguimientoPage.tsx`, find where `RadiografiaCartola` is rendered (search for `<RadiografiaCartola`). Add new props:

```tsx
<RadiografiaCartola
  holdings={/* existing */}
  clientName={/* existing */}
  clientId={/* existing */}
  fundsMeta={/* existing */}
  cartolaDate={/* existing */}
  currentValue={/* existing */}
  currentValueDate={/* existing */}
  perfilRiesgo={data?.client?.perfil_riesgo}
  custodianType={/* derive from snapshot source or cartola metadata */}
/>
```

For custodian type detection, look at the snapshot's `source` field or holdings metadata. Add this helper before the component:

```typescript
// Detect custodian type from snapshot data
function detectCustodianType(snapshot: Snapshot | null): string | undefined {
  if (!snapshot) return undefined;
  const source = (snapshot.source || "").toLowerCase();
  if (source.includes("stonex") || source.includes("pershing") || source.includes("interactive")) return "internacional";
  if (source.includes("corredora") || source.includes("brokerage")) return "corredora";
  if (source.includes("agf") || source.includes("security") || source.includes("banchile") || source.includes("larrain")) return "agf";
  // Check if holdings have CUSIP-shaped IDs → internacional
  const holdings = snapshot.holdings || [];
  const hasCusip = holdings.some((h: { securityId?: string }) => h.securityId && /^[A-Z0-9]{9}$/i.test(h.securityId));
  if (hasCusip) return "internacional";
  return undefined;
}
```

- [ ] **Step 2: Update RadiografiaCartola to use risk profile**

In `RadiografiaCartola.tsx`, add new props to the interface:

```typescript
interface RadiografiaCartolaProps {
  holdings: Holding[];
  clientName?: string;
  clientId?: string;
  fundsMeta?: FundMeta[];
  cartolaDate?: string;
  currentValue?: number;
  currentValueDate?: string;
  perfilRiesgo?: string;
  custodianType?: string;
}
```

In the function that calls `/api/portfolio/xray`, add the new fields to the request body:

```typescript
const res = await fetch("/api/portfolio/xray", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    holdings: holdingsPayload,
    perfilRiesgo,
    custodianType,
  }),
});
```

And in the function that calls `/api/portfolio/xray-report`, pass the model data:

```typescript
const res = await fetch("/api/portfolio/xray-report", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    xrayData: data,
    clientName,
    advisoryFee,
    customContext,
    ufValue,
    usdValue,
    cartolaDate,
    currentValue,
    currentValueDate,
    modelData: data.modelData,
  }),
});
```

- [ ] **Step 3: Display deviation table in RadiografiaCartola**

After the existing allocation summary display and before the report section, add a deviation table when model data is available:

```tsx
{data?.modelData && data.modelData.deviations.length > 0 && (
  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
    <h4 className="text-sm font-semibold text-gb-black mb-2">
      Cartera Modelo vs Actual
      <span className="ml-2 text-xs font-normal text-gb-gray">
        Perfil: {data.modelData.perfil.replace(/_/g, " ")} | Comite: {data.modelData.reportDate}
      </span>
    </h4>
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-blue-200">
          <th className="text-left py-1 px-2">Categoria</th>
          <th className="text-right py-1 px-2">Target</th>
          <th className="text-right py-1 px-2">Actual</th>
          <th className="text-right py-1 px-2">Desviacion</th>
          <th className="text-left py-1 px-2">Estado</th>
          <th className="text-left py-1 px-2">Fondo Recomendado</th>
        </tr>
      </thead>
      <tbody>
        {data.modelData.deviations.map((d: {
          categoria: string;
          targetWeight: number;
          actualWeight: number;
          deviation: number;
          estado: string;
          mappedFund: { fundName: string | null; ticker: string | null } | null;
        }) => (
          <tr key={d.categoria} className="border-b border-blue-100">
            <td className="py-1 px-2 font-medium">{d.categoria}</td>
            <td className="py-1 px-2 text-right">{d.targetWeight}%</td>
            <td className="py-1 px-2 text-right">{d.actualWeight}%</td>
            <td className={`py-1 px-2 text-right font-medium ${
              d.deviation > 2 ? "text-orange-600" : d.deviation < -2 ? "text-red-600" : "text-green-600"
            }`}>
              {d.deviation > 0 ? "+" : ""}{d.deviation}%
            </td>
            <td className="py-1 px-2">
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                d.estado === "SOBREPONDERADO" ? "bg-orange-100 text-orange-700" :
                d.estado === "SUBPONDERADO" ? "bg-red-100 text-red-700" :
                "bg-green-100 text-green-700"
              }`}>
                {d.estado === "EN_RANGO" ? "OK" : d.estado.toLowerCase().replace("_", " ")}
              </span>
            </td>
            <td className="py-1 px-2 text-gb-gray">
              {d.mappedFund ? (d.mappedFund.fundName || d.mappedFund.ticker || "—") : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

- [ ] **Step 4: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/RadiografiaCartola.tsx components/seguimiento/SeguimientoPage.tsx
git commit -m "feat: radiografia shows model portfolio deviations and passes risk profile"
```

---

## Profile Mapping Note

The existing client `perfil_riesgo` values (`defensivo`, `conservador`, `moderado`, `agresivo`, `muy_agresivo`) map to model portfolio `perfil` values as follows:

| Client perfil_riesgo | Model perfil |
|---|---|
| defensivo | ultra_conservador |
| conservador | conservador |
| moderado | moderado |
| (no equivalent yet) | crecimiento |
| agresivo | agresivo |
| muy_agresivo | muy_agresivo |

The `crecimiento` profile has no client-side equivalent yet. If the committee uses it, it can be added to the client risk profile options later. The mapping is done in Task 10's `perfilMap` object.

---

## Verification Checklist

After all tasks are complete:

- [ ] `npx next build` passes
- [ ] Model portfolio JSON upload works in Comite panel
- [ ] Active model portfolios display correctly
- [ ] Preferred funds accept international instruments (ticker, expense_ratio, custodian_type)
- [ ] Custodian config CRUD works
- [ ] Fund mapping page shows categories from active models
- [ ] Fund mapping saves and persists
- [ ] Radiografia for a client with perfil_riesgo shows deviation table
- [ ] Report includes model portfolio sections when available
- [ ] Report without model data still works as before (backward compatible)
