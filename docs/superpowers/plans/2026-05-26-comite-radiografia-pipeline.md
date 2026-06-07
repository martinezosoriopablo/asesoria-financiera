# Comite -> Radiografia Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pipeline that takes structured comite model portfolio data, maps client holdings to comite categories, compares actual vs model allocation, and generates per-custodian trade recommendations.

**Architecture:** New SQL migration updates `model_portfolios` schema (5 profiles, rich posiciones, sleeves) and adds custodian columns to snapshots. A new shared module `lib/comite-categories.ts` defines the canonical 16-category system with classification logic. A new API route `POST /api/portfolio/radiografia` orchestrates the full pipeline. The existing model-portfolios API is updated for the enriched schema.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, TypeScript

**Spec:** `docs/superpowers/specs/2026-05-26-comite-radiografia-pipeline-design.md`

---

## File Structure

### New files:
- `supabase/migrations/20260526_comite_pipeline.sql` -- Migration: update model_portfolios CHECK + sleeves, add custodian to snapshots
- `lib/comite-categories.ts` -- Canonical 16-category system, ETF mappings, classification rules, profile mapping
- `lib/comite-categories.test.ts` -- Tests for classification logic
- `app/api/portfolio/radiografia/route.ts` -- Main radiografia pipeline endpoint
- `app/api/comite/categories/route.ts` -- GET canonical categories list
- `app/api/advisor/fund-mapping/auto-suggest/route.ts` -- Auto-suggest fund mappings

### Modified files:
- `app/api/comite/model-portfolios/route.ts` -- Update interfaces + VALID_PERFILES for 5 profiles + sleeves
- `app/api/portfolio/snapshots/route.ts` -- Accept and persist custodian + custodian_type
- `components/seguimiento/ReviewSnapshotModal.tsx` -- Send custodian + custodian_type when saving snapshot

---

## Task 1: SQL Migration -- Schema Updates

**Files:**
- Create: `supabase/migrations/20260526_comite_pipeline.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 1. Drop and recreate model_portfolios with updated CHECK constraint
-- (Table doesn't exist in production yet, so we can CREATE fresh)

-- Drop existing migration artifacts if they exist
DROP TABLE IF EXISTS model_portfolios CASCADE;
DROP FUNCTION IF EXISTS set_model_portfolio_version() CASCADE;

CREATE TABLE model_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL DEFAULT 1,
  report_date DATE NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN (
    'conservador', 'moderado_conservador', 'moderado',
    'moderado_agresivo', 'agresivo'
  )),
  posiciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  sleeves JSONB NOT NULL DEFAULT '[]'::jsonb,
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

-- RLS
ALTER TABLE model_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read all model portfolios"
  ON model_portfolios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Advisors can insert model portfolios"
  ON model_portfolios FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creator can delete own model portfolios"
  ON model_portfolios FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Service role full access model_portfolios"
  ON model_portfolios FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Add custodian columns to portfolio_snapshots
ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS custodian TEXT,
  ADD COLUMN IF NOT EXISTS custodian_type TEXT
    CHECK (custodian_type IN ('agf', 'corredora', 'internacional'));
```

- [ ] **Step 2: Execute the migration in Supabase**

Run in Supabase SQL editor (production). Verify:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'model_portfolios' ORDER BY ordinal_position;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'portfolio_snapshots' AND column_name IN ('custodian', 'custodian_type');
```

Expected: `model_portfolios` has columns `id, version, report_date, perfil, posiciones, sleeves, nota_comite, created_by, created_at`. `portfolio_snapshots` has `custodian` and `custodian_type`.

- [ ] **Step 3: Also execute the custodian_config and model_fund_mapping migration if not already present**

Check if tables exist first:
```sql
SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'custodian_config');
SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'model_fund_mapping');
```

If either is missing, execute `supabase/migrations/20260523_custodian_and_mapping.sql`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260526_comite_pipeline.sql
git commit -m "feat: migration for enriched model_portfolios + custodian on snapshots"
```

---

## Task 2: Comite Categories Module

**Files:**
- Create: `lib/comite-categories.ts`
- Create: `lib/comite-categories.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// lib/comite-categories.test.ts
import { describe, it, expect } from "vitest";
import {
  COMITE_CATEGORIES,
  classifyHolding,
  mapClientProfile,
  type ClassifiedHolding,
} from "./comite-categories";

describe("COMITE_CATEGORIES", () => {
  it("has 16 categories", () => {
    expect(COMITE_CATEGORIES).toHaveLength(16);
  });

  it("all categories have required fields", () => {
    for (const cat of COMITE_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(["rv", "rf", "alt", "cash"]).toContain(cat.role);
    }
  });
});

describe("classifyHolding", () => {
  it("maps VOO directly to rv_usa_large_cap (high confidence)", () => {
    const result = classifyHolding({
      fundName: "Vanguard S&P 500 ETF",
      securityId: "VOO",
      marketValue: 10000,
    });
    expect(result.categoria).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("high");
  });

  it("maps IEF to rf_ust_belly", () => {
    const result = classifyHolding({
      fundName: "iShares 7-10 Year Treasury",
      securityId: "IEF",
      marketValue: 5000,
    });
    expect(result.categoria).toBe("rf_ust_belly");
    expect(result.confidence).toBe("high");
  });

  it("maps GLD to alt_gold", () => {
    const result = classifyHolding({
      fundName: "SPDR Gold Shares",
      securityId: "GLD",
      marketValue: 3000,
    });
    expect(result.categoria).toBe("alt_gold");
    expect(result.confidence).toBe("high");
  });

  it("maps SGOV to cash_tbills", () => {
    const result = classifyHolding({
      fundName: "iShares 0-3 Month Treasury",
      securityId: "SGOV",
      marketValue: 2000,
    });
    expect(result.categoria).toBe("cash_tbills");
    expect(result.confidence).toBe("high");
  });

  it("maps Chilean equity fund by familia to rv_chile", () => {
    const result = classifyHolding({
      fundName: "BCI Acciones Nacionales",
      securityId: "1234",
      marketValue: 5000,
      familiaEstudios: "Accionario Nacional",
    });
    expect(result.categoria).toBe("rv_chile");
    expect(result.confidence).toBe("medium");
  });

  it("maps Chilean short-term debt fund to rf_chile", () => {
    const result = classifyHolding({
      fundName: "BCI Renta Corto Plazo",
      securityId: "5678",
      marketValue: 5000,
      familiaEstudios: "Deuda < 365 días Nacional",
    });
    expect(result.categoria).toBe("rf_chile");
    expect(result.confidence).toBe("medium");
  });

  it("maps international equity fund to rv_usa_large_cap", () => {
    const result = classifyHolding({
      fundName: "BCI Acciones USA",
      securityId: "9012",
      marketValue: 5000,
      familiaEstudios: "Accionario USA",
    });
    expect(result.categoria).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("medium");
  });

  it("maps GOOGLCL to rv_usa_large_cap (Chilean ADR)", () => {
    const result = classifyHolding({
      fundName: "Alphabet Inc",
      securityId: "GOOGLCL",
      marketValue: 8000,
    });
    expect(result.categoria).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("medium");
  });

  it("maps bond with CUSIP to rf_ig_corp", () => {
    const result = classifyHolding({
      fundName: "APPLE INC 3.25% 2026",
      securityId: "037833AK6",
      marketValue: 10000,
      couponRate: 3.25,
      maturityDate: "2026-02-09",
    });
    expect(result.categoria).toBe("rf_ig_corp");
    expect(result.confidence).toBe("medium");
  });

  it("maps cash holding to cash_tbills (USD) or rf_chile (CLP)", () => {
    const usd = classifyHolding({
      fundName: "Cash USD",
      marketValue: 1000,
      assetClass: "cash",
      currency: "USD",
    });
    expect(usd.categoria).toBe("cash_tbills");

    const clp = classifyHolding({
      fundName: "Efectivo CLP",
      marketValue: 500000,
      assetClass: "cash",
      currency: "CLP",
    });
    expect(clp.categoria).toBe("rf_chile");
  });

  it("falls back to assetClass with low confidence", () => {
    const result = classifyHolding({
      fundName: "Unknown Fund XYZ",
      marketValue: 5000,
      assetClass: "equity",
    });
    expect(result.categoria).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("low");
  });
});

describe("mapClientProfile", () => {
  it("maps defensivo to conservador", () => {
    expect(mapClientProfile("defensivo")).toBe("conservador");
  });
  it("maps conservador to conservador", () => {
    expect(mapClientProfile("conservador")).toBe("conservador");
  });
  it("maps moderado to moderado", () => {
    expect(mapClientProfile("moderado")).toBe("moderado");
  });
  it("maps agresivo to moderado_agresivo", () => {
    expect(mapClientProfile("agresivo")).toBe("moderado_agresivo");
  });
  it("maps muy_agresivo to agresivo", () => {
    expect(mapClientProfile("muy_agresivo")).toBe("agresivo");
  });
  it("returns input if already a valid model profile", () => {
    expect(mapClientProfile("moderado_conservador")).toBe("moderado_conservador");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/comite-categories.test.ts
```

Expected: FAIL — module `./comite-categories` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/comite-categories.ts

export type ComiteRole = "rv" | "rf" | "alt" | "cash";
export type Confidence = "high" | "medium" | "low";

export interface ComiteCategory {
  id: string;
  label: string;
  role: ComiteRole;
  etf_us: string | null;
  etf_ucits: string | null;
}

export interface ClassifiedHolding {
  categoria: string;
  confidence: Confidence;
}

export interface HoldingForClassification {
  fundName: string;
  securityId?: string | null;
  marketValue: number;
  assetClass?: string;
  currency?: string;
  familiaEstudios?: string | null;
  couponRate?: number | null;
  maturityDate?: string | null;
}

// -- Canonical 16 categories --

export const COMITE_CATEGORIES: ComiteCategory[] = [
  // RV
  { id: "rv_usa_large_cap", label: "RV USA Large Cap", role: "rv", etf_us: "VOO", etf_ucits: "CSPX" },
  { id: "rv_desarrollados_ex_us", label: "RV Desarrollados ex-US", role: "rv", etf_us: "VEA", etf_ucits: "IWDA" },
  { id: "rv_emergentes", label: "RV Emergentes", role: "rv", etf_us: "VWO", etf_ucits: "EIMI" },
  { id: "rv_chile", label: "RV Chile", role: "rv", etf_us: "ECH", etf_ucits: null },
  // RF
  { id: "rf_ust_belly", label: "UST 3-10yr Belly", role: "rf", etf_us: "IEF", etf_ucits: "IDTM" },
  { id: "rf_ust_short", label: "UST 1-3yr Short Duration", role: "rf", etf_us: "SHY", etf_ucits: "IBTS" },
  { id: "rf_ig_corp", label: "US IG Corporate Bonds", role: "rf", etf_us: "LQD", etf_ucits: "LQDE" },
  { id: "rf_tips", label: "US TIPS", role: "rf", etf_us: "TIP", etf_ucits: "ITPS" },
  { id: "rf_high_yield", label: "US High Yield", role: "rf", etf_us: "HYG", etf_ucits: "IHYG" },
  { id: "rf_em_sovereign", label: "EM Sovereign USD", role: "rf", etf_us: "EMB", etf_ucits: "EMHC" },
  { id: "rf_chile", label: "RF Chile", role: "rf", etf_us: null, etf_ucits: null },
  // Alt
  { id: "alt_gold", label: "Gold", role: "alt", etf_us: "GLD", etf_ucits: "SGLN" },
  { id: "alt_reits", label: "US REITs", role: "alt", etf_us: "VNQ", etf_ucits: "IPRP" },
  // Cash
  { id: "cash_tbills", label: "US T-Bills 0-3M", role: "cash", etf_us: "SGOV", etf_ucits: "ERNS" },
];

// -- ETF ticker -> category lookup (built from COMITE_CATEGORIES) --

const ETF_TO_CATEGORY = new Map<string, string>();
for (const cat of COMITE_CATEGORIES) {
  if (cat.etf_us) ETF_TO_CATEGORY.set(cat.etf_us, cat.id);
  if (cat.etf_ucits) ETF_TO_CATEGORY.set(cat.etf_ucits, cat.id);
}

// Add secondary ETF tickers that map to the same categories
const EXTRA_ETF_MAP: Record<string, string> = {
  // RV USA alternatives
  SPY: "rv_usa_large_cap", IVV: "rv_usa_large_cap", VTI: "rv_usa_large_cap",
  QQQ: "rv_usa_large_cap", DIA: "rv_usa_large_cap", IWM: "rv_usa_large_cap",
  // Developed ex-US
  EFA: "rv_desarrollados_ex_us", VXUS: "rv_desarrollados_ex_us",
  // Emerging
  EEM: "rv_emergentes", IEMG: "rv_emergentes",
  // RF
  AGG: "rf_ust_belly", BND: "rf_ust_belly", GOVT: "rf_ust_belly",
  VCSH: "rf_ust_short", VGSH: "rf_ust_short",
  VCIT: "rf_ig_corp", IGIB: "rf_ig_corp",
  STIP: "rf_tips", VTIP: "rf_tips",
  JNK: "rf_high_yield", SHYG: "rf_high_yield",
  PCY: "rf_em_sovereign", VWOB: "rf_em_sovereign",
  // Alt
  IAU: "alt_gold", SLV: "alt_gold",
  VNQI: "alt_reits", XLRE: "alt_reits",
  // Cash
  BIL: "cash_tbills", SHV: "cash_tbills",
};
for (const [ticker, catId] of Object.entries(EXTRA_ETF_MAP)) {
  ETF_TO_CATEGORY.set(ticker, catId);
}

// -- Profile mapping --

const VALID_MODEL_PROFILES = new Set([
  "conservador", "moderado_conservador", "moderado", "moderado_agresivo", "agresivo",
]);

const CLIENT_TO_MODEL: Record<string, string> = {
  defensivo: "conservador",
  conservador: "conservador",
  moderado: "moderado",
  agresivo: "moderado_agresivo",
  muy_agresivo: "agresivo",
};

export function mapClientProfile(clientProfile: string): string {
  if (VALID_MODEL_PROFILES.has(clientProfile)) return clientProfile;
  return CLIENT_TO_MODEL[clientProfile] || "moderado";
}

// -- Preferred fund category -> comite category lookup --

export const PREFERRED_TO_COMITE: Record<string, string[]> = {
  rv_usa_large_cap: ["RV Internacional", "RV USA", "RV Global"],
  rv_desarrollados_ex_us: ["RV Internacional", "RV Europa", "RV Global"],
  rv_emergentes: ["RV Emergentes", "RV Internacional"],
  rv_chile: ["RV Nacional"],
  rf_ust_belly: ["RF Internacional", "RF USD"],
  rf_ust_short: ["RF Internacional", "RF Corto Plazo"],
  rf_ig_corp: ["RF Internacional", "RF Corporativa"],
  rf_tips: ["RF Internacional"],
  rf_high_yield: ["RF High Yield", "RF Internacional"],
  rf_em_sovereign: ["RF Emergentes", "RF Internacional"],
  rf_chile: ["RF Nacional", "RF Corto Plazo"],
  alt_gold: ["Alternativos", "Commodities"],
  alt_reits: ["Alternativos", "Inmobiliario"],
  cash_tbills: ["Money Market", "Liquidez"],
};

// -- Classification engine --

const CHILEAN_ADR_RE = /^[A-Z]{3,10}CL$/;

export function classifyHolding(h: HoldingForClassification): ClassifiedHolding {
  const secId = (h.securityId || "").trim().toUpperCase();
  const familia = (h.familiaEstudios || "").toLowerCase();
  const currency = (h.currency || "USD").toUpperCase();

  // Priority 1: Direct ETF/ticker match
  if (secId && ETF_TO_CATEGORY.has(secId)) {
    return { categoria: ETF_TO_CATEGORY.get(secId)!, confidence: "high" };
  }

  // Priority 2: Chilean fund by familia_estudios
  if (familia) {
    const isEquity = familia.includes("accionario") || familia.includes("renta variable");
    const isDebt = familia.includes("deuda") || familia.includes("renta fija");
    const isBalanced = familia.includes("balanceado");

    if (isEquity) {
      if (familia.includes("nacional") || familia.includes("chile") || familia.includes("local")) {
        return { categoria: "rv_chile", confidence: "medium" };
      }
      if (familia.includes("emergente")) {
        return { categoria: "rv_emergentes", confidence: "medium" };
      }
      if (familia.includes("europa") || familia.includes("japón") || familia.includes("japon") || familia.includes("desarrollado")) {
        return { categoria: "rv_desarrollados_ex_us", confidence: "medium" };
      }
      // Default international equity -> USA
      return { categoria: "rv_usa_large_cap", confidence: "medium" };
    }

    if (isDebt) {
      const isLocal = familia.includes("nacional") || familia.includes("chile") || familia.includes("local") || familia.includes("uf");
      if (isLocal || currency === "CLP") {
        return { categoria: "rf_chile", confidence: "medium" };
      }
      if (familia.includes("high yield") || familia.includes("alto rendimiento")) {
        return { categoria: "rf_high_yield", confidence: "medium" };
      }
      if (familia.includes("emergente")) {
        return { categoria: "rf_em_sovereign", confidence: "medium" };
      }
      if (familia.includes("corto") || familia.includes("< 365") || familia.includes("money market")) {
        return { categoria: "rf_ust_short", confidence: "medium" };
      }
      return { categoria: "rf_ust_belly", confidence: "medium" };
    }

    if (isBalanced) {
      // Balanced funds: classify as rv_usa_large_cap with low confidence (needs advisor review)
      return { categoria: "rv_usa_large_cap", confidence: "low" };
    }
  }

  // Priority 3: Instrument type + geography
  // Chilean ADR (e.g. GOOGLCL, NVDACL)
  if (secId && CHILEAN_ADR_RE.test(secId)) {
    return { categoria: "rv_usa_large_cap", confidence: "medium" };
  }

  // Bond with CUSIP
  const hasCoupon = h.couponRate != null && h.couponRate > 0;
  const hasMaturity = h.maturityDate != null && h.maturityDate.length > 0;
  if ((hasCoupon && hasMaturity) || (secId && /^[A-Z0-9]{9}$/i.test(secId) && !/^\d+$/.test(secId))) {
    return { categoria: "rf_ig_corp", confidence: "medium" };
  }

  // Cash
  const name = (h.fundName || "").toLowerCase();
  const isCash = h.assetClass === "cash" || /cash|efect|money\s*market|liquidez|sweep/i.test(name);
  if (isCash) {
    return { categoria: currency === "CLP" ? "rf_chile" : "cash_tbills", confidence: "medium" };
  }

  // Non-numeric securityId = stock
  if (secId && !/^\d+$/.test(secId)) {
    return { categoria: "rv_usa_large_cap", confidence: "low" };
  }

  // Priority 4: assetClass fallback
  switch (h.assetClass) {
    case "equity": return { categoria: "rv_usa_large_cap", confidence: "low" };
    case "fixedIncome": return { categoria: "rf_ust_belly", confidence: "low" };
    case "alternatives": return { categoria: "alt_gold", confidence: "low" };
    case "cash": return { categoria: currency === "CLP" ? "rf_chile" : "cash_tbills", confidence: "low" };
  }

  // Ultimate fallback: numeric securityId (Chilean fund) with no familia
  if (/^\d+$/.test(secId)) {
    return { categoria: currency === "CLP" ? "rf_chile" : "rv_usa_large_cap", confidence: "low" };
  }

  return { categoria: "rv_usa_large_cap", confidence: "low" };
}

// Helper: get category by ID
export function getCategoryById(id: string): ComiteCategory | undefined {
  return COMITE_CATEGORIES.find((c) => c.id === id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/comite-categories.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/comite-categories.ts lib/comite-categories.test.ts
git commit -m "feat: comite categories module with classification engine"
```

---

## Task 3: Update Model Portfolios API

**Files:**
- Modify: `app/api/comite/model-portfolios/route.ts`

- [ ] **Step 1: Update the interfaces and VALID_PERFILES**

Replace the entire interfaces + VALID_PERFILES section (lines 6-26) with:

```typescript
interface PositionInput {
  categoria: string;
  role: "rv" | "rf" | "alt" | "cash";
  bench_pct: number;
  modelo_pct: number;
  broad_neto_pct?: number | null;
  delta_pp: number;
  vista: "OW" | "UW" | "N";
  conviction: "ALTA" | "MEDIA" | "BAJA" | null;
  etf_us: string | null;
  etf_ucits: string | null;
  justificacion: string | null;
}

interface SleeveInput {
  region: string;
  sector: string;
  vista: "OW" | "UW" | "N";
  conviction: "ALTA" | "MEDIA" | "BAJA";
  etf_us: string | null;
  etf_ucits: string | null;
  peso_pct: number;
  tesis: string | null;
}

interface PerfilInput {
  nota_comite?: string;
  posiciones: PositionInput[];
  sleeves?: SleeveInput[];
}

interface ModelPortfolioUpload {
  report_date: string;
  perfiles: Record<string, PerfilInput>;
}

const VALID_PERFILES = [
  "conservador", "moderado_conservador", "moderado",
  "moderado_agresivo", "agresivo",
];
```

- [ ] **Step 2: Update the validation to use `modelo_pct` instead of `peso`**

In the POST handler, replace the weight validation:

```typescript
      const totalPeso = data.posiciones.reduce((sum, p) => sum + (p.modelo_pct || 0), 0);
```

- [ ] **Step 3: Update the insert to include sleeves**

Replace the insert rows mapping:

```typescript
    const rows = perfilKeys.map((perfil) => ({
      report_date: body.report_date,
      perfil,
      posiciones: body.perfiles[perfil].posiciones,
      sleeves: body.perfiles[perfil].sleeves || [],
      nota_comite: body.perfiles[perfil].nota_comite || null,
      created_by: advisor!.id,
    }));
```

- [ ] **Step 4: Update the GET comment from "6 active models" to "5 active models"**

Line 123 comment: change `6` to `5`.

- [ ] **Step 5: Commit**

```bash
git add app/api/comite/model-portfolios/route.ts
git commit -m "feat: update model-portfolios API for enriched schema (5 profiles + sleeves)"
```

---

## Task 4: Persist Custodian on Snapshots

**Files:**
- Modify: `app/api/portfolio/snapshots/route.ts` (lines ~128-267)
- Modify: `components/seguimiento/ReviewSnapshotModal.tsx` (lines ~910-937)

- [ ] **Step 1: Update snapshots POST to accept custodian fields**

In `app/api/portfolio/snapshots/route.ts`, add `custodian` and `custodianType` to the destructured body (around line 129):

```typescript
    const {
      clientId,
      snapshotDate,
      totalValue,
      totalCostBasis,
      composition,
      holdings,
      source = "manual",
      cashFlows,
      custodian,
      custodianType,
    } = body;
```

- [ ] **Step 2: Add custodian to snapshotData object**

In the `snapshotData` object (around line 267), add after `source`:

```typescript
      source,
      custodian: custodian || null,
      custodian_type: custodianType || null,
```

- [ ] **Step 3: Update ReviewSnapshotModal to send custodian when saving**

In `components/seguimiento/ReviewSnapshotModal.tsx`, the `handleSave` function builds the request body (around line 913). Add custodian fields.

First, find the `sources` variable used in the body. The `uniqueSources` comes from uploaded files. We need to derive custodian from the first source's CUSTODIAN_OPTIONS match.

Add after the `body: JSON.stringify({` line (around line 913), alongside the existing fields:

```typescript
          // Custodian info (derived from first source)
          custodian: uniqueSources?.[0] || null,
          custodianType: (() => {
            const src = uniqueSources?.[0];
            if (!src) return null;
            if (/AGF/i.test(src)) return "agf";
            if (/Corredora/i.test(src)) return "corredora";
            if (/Raymond|Stonex|Pershing/i.test(src)) return "internacional";
            return null;
          })(),
```

- [ ] **Step 4: Commit**

```bash
git add app/api/portfolio/snapshots/route.ts components/seguimiento/ReviewSnapshotModal.tsx
git commit -m "feat: persist custodian + custodian_type on portfolio snapshots"
```

---

## Task 5: Categories API Endpoint

**Files:**
- Create: `app/api/comite/categories/route.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
// app/api/comite/categories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { COMITE_CATEGORIES } from "@/lib/comite-categories";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "comite-categories", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error } = await requireAdvisor();
  if (error) return error;

  return NextResponse.json({
    success: true,
    categories: COMITE_CATEGORIES,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/comite/categories/route.ts
git commit -m "feat: GET /api/comite/categories endpoint"
```

---

## Task 6: Auto-Suggest Fund Mapping Endpoint

**Files:**
- Create: `app/api/advisor/fund-mapping/auto-suggest/route.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
// app/api/advisor/fund-mapping/auto-suggest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { COMITE_CATEGORIES, PREFERRED_TO_COMITE } from "@/lib/comite-categories";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fund-mapping-suggest", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  const { custodianType } = (await request.json()) as { custodianType: string };

  if (!custodianType || !["agf", "corredora", "internacional"].includes(custodianType)) {
    return NextResponse.json(
      { success: false, error: "custodianType debe ser agf, corredora, o internacional" },
      { status: 400 }
    );
  }

  // For internacional: return ETFs directly from comite, no fund mapping needed
  if (custodianType === "internacional") {
    const suggestions = COMITE_CATEGORIES.map((cat) => ({
      categoria: cat.id,
      categoriaLabel: cat.label,
      suggestedFund: null,
      suggestedFundId: null,
      etfDirect: cat.etf_us,
      etfUcits: cat.etf_ucits,
      confidence: "high" as const,
    }));
    return NextResponse.json({ success: true, suggestions, isInternacional: true });
  }

  // Load advisor's preferred funds for this custodian type
  const { data: preferredFunds } = await supabase
    .from("advisor_preferred_funds")
    .select("id, fund_name, fund_run, category, ticker, expense_ratio, custodian_type")
    .eq("advisor_id", advisor!.id)
    .eq("custodian_type", custodianType)
    .eq("active", true);

  // Load existing mappings to mark already-mapped categories
  const { data: existingMappings } = await supabase
    .from("model_fund_mapping")
    .select("categoria, preferred_fund_id")
    .eq("advisor_id", advisor!.id)
    .eq("custodian_type", custodianType);

  const existingMap = new Map(
    (existingMappings || []).map((m) => [m.categoria, m.preferred_fund_id])
  );

  const funds = preferredFunds || [];

  const suggestions = COMITE_CATEGORIES.map((cat) => {
    // If already mapped, return existing mapping
    if (existingMap.has(cat.id)) {
      const mappedFundId = existingMap.get(cat.id);
      const mappedFund = funds.find((f) => f.id === mappedFundId);
      return {
        categoria: cat.id,
        categoriaLabel: cat.label,
        suggestedFund: mappedFund?.fund_name || null,
        suggestedFundId: mappedFundId,
        etfDirect: null,
        etfUcits: null,
        confidence: "confirmed" as const,
        alreadyMapped: true,
      };
    }

    // Auto-suggest: find preferred fund whose category matches
    const matchingCategories = PREFERRED_TO_COMITE[cat.id] || [];
    const candidates = funds.filter((f) => matchingCategories.includes(f.category));

    if (candidates.length === 0) {
      return {
        categoria: cat.id,
        categoriaLabel: cat.label,
        suggestedFund: null,
        suggestedFundId: null,
        etfDirect: null,
        etfUcits: null,
        confidence: "none" as const,
        alreadyMapped: false,
      };
    }

    // Pick best: lowest expense_ratio, or first
    const best = candidates.reduce((a, b) => {
      if (a.expense_ratio != null && b.expense_ratio != null) {
        return a.expense_ratio < b.expense_ratio ? a : b;
      }
      return a;
    });

    return {
      categoria: cat.id,
      categoriaLabel: cat.label,
      suggestedFund: best.fund_name,
      suggestedFundId: best.id,
      etfDirect: null,
      etfUcits: null,
      confidence: candidates.length === 1 ? ("high" as const) : ("medium" as const),
      alreadyMapped: false,
    };
  });

  return NextResponse.json({ success: true, suggestions, isInternacional: false });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/advisor/fund-mapping/auto-suggest/route.ts
git commit -m "feat: auto-suggest fund mapping endpoint"
```

---

## Task 7: Radiografia Pipeline API

**Files:**
- Create: `app/api/portfolio/radiografia/route.ts`

This is the main orchestration endpoint. It loads snapshots, classifies holdings, loads the model, compares, and generates recommendations.

- [ ] **Step 1: Write the endpoint**

```typescript
// app/api/portfolio/radiografia/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  COMITE_CATEGORIES,
  classifyHolding,
  mapClientProfile,
  getCategoryById,
  type HoldingForClassification,
} from "@/lib/comite-categories";

interface RadiografiaRequest {
  clientId: string;
  perfilOverride?: string;
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "radiografia", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { clientId, perfilOverride } = (await request.json()) as RadiografiaRequest;

    if (!clientId) {
      return NextResponse.json({ success: false, error: "clientId requerido" }, { status: 400 });
    }

    // 1. Load client + risk profile
    const { data: client } = await supabase
      .from("clients")
      .select("id, first_name, last_name")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
    }

    const { data: riskProfile } = await supabase
      .from("risk_profiles")
      .select("perfil_riesgo")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const clientPerfil = perfilOverride || riskProfile?.perfil_riesgo || "moderado";
    const modelPerfil = mapClientProfile(clientPerfil);

    // 2. Load latest snapshots (group by custodian if multiple)
    const { data: snapshots } = await supabase
      .from("portfolio_snapshots")
      .select("id, snapshot_date, total_value, holdings, custodian, custodian_type, source")
      .eq("client_id", clientId)
      .not("source", "eq", "api-prices")
      .order("snapshot_date", { ascending: false });

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({ success: false, error: "No hay snapshots para este cliente" }, { status: 404 });
    }

    // Get latest snapshot per custodian (or just latest if no custodian set)
    const latestByCustodian = new Map<string, typeof snapshots[0]>();
    for (const snap of snapshots) {
      const key = snap.custodian || "__default__";
      if (!latestByCustodian.has(key)) {
        latestByCustodian.set(key, snap);
      }
    }

    // 3. Consolidate holdings across custodians
    interface TaggedHolding {
      fundName: string;
      securityId: string | null;
      marketValue: number;
      marketValueCLP: number;
      quantity: number;
      assetClass: string;
      currency: string;
      custodian: string;
      custodianType: string;
      familiaEstudios?: string | null;
      couponRate?: number | null;
      maturityDate?: string | null;
    }

    const allHoldings: TaggedHolding[] = [];
    let totalValueCLP = 0;

    for (const [custodianKey, snap] of latestByCustodian.entries()) {
      const holdings = (snap.holdings || []) as Array<Record<string, unknown>>;
      for (const h of holdings) {
        const mv = (h.marketValueCLP || h.marketValue || 0) as number;
        allHoldings.push({
          fundName: (h.fundName || "") as string,
          securityId: (h.securityId || null) as string | null,
          marketValue: (h.marketValue || 0) as number,
          marketValueCLP: mv,
          quantity: (h.quantity || 0) as number,
          assetClass: (h.assetClass || "") as string,
          currency: (h.currency || "CLP") as string,
          custodian: snap.custodian || custodianKey,
          custodianType: snap.custodian_type || "corredora",
          couponRate: (h.couponRate || null) as number | null,
          maturityDate: (h.maturityDate || null) as string | null,
        });
        totalValueCLP += mv;
      }
    }

    if (totalValueCLP === 0) {
      return NextResponse.json({ success: false, error: "Portafolio con valor 0" }, { status: 400 });
    }

    // 4. Enrich with familia_estudios for Chilean funds
    const numericSecIds = allHoldings
      .filter((h) => h.securityId && /^\d+$/.test(h.securityId))
      .map((h) => parseInt(h.securityId!, 10));

    let familiaMap = new Map<number, string>();
    if (numericSecIds.length > 0) {
      const { data: fondos } = await supabase
        .from("vw_fondos_completo")
        .select("fo_run, familia_estudios")
        .in("fo_run", numericSecIds);
      if (fondos) {
        for (const f of fondos) {
          if (f.familia_estudios) familiaMap.set(f.fo_run, f.familia_estudios);
        }
      }
    }

    // 5. Classify each holding
    const classifiedHoldings = allHoldings.map((h) => {
      const forClassification: HoldingForClassification = {
        fundName: h.fundName,
        securityId: h.securityId,
        marketValue: h.marketValueCLP,
        assetClass: h.assetClass,
        currency: h.currency,
        familiaEstudios: h.securityId && /^\d+$/.test(h.securityId)
          ? familiaMap.get(parseInt(h.securityId, 10)) || null
          : null,
        couponRate: h.couponRate,
        maturityDate: h.maturityDate,
      };
      const classification = classifyHolding(forClassification);
      return {
        ...h,
        categoria: classification.categoria,
        confidence: classification.confidence,
        weightPct: (h.marketValueCLP / totalValueCLP) * 100,
      };
    });

    // 6. Load model portfolio
    const { data: latestDate } = await supabase
      .from("model_portfolios")
      .select("report_date")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestDate) {
      return NextResponse.json({
        success: false,
        error: "No hay carteras modelo cargadas. Suba el modelo del comité primero.",
      }, { status: 404 });
    }

    const { data: modelPortfolio } = await supabase
      .from("model_portfolios")
      .select("perfil, posiciones, sleeves, nota_comite, report_date")
      .eq("report_date", latestDate.report_date)
      .eq("perfil", modelPerfil)
      .maybeSingle();

    if (!modelPortfolio) {
      return NextResponse.json({
        success: false,
        error: `No hay modelo para perfil ${modelPerfil} en fecha ${latestDate.report_date}`,
      }, { status: 404 });
    }

    const posiciones = modelPortfolio.posiciones as Array<{
      categoria: string;
      role: string;
      modelo_pct: number;
      vista: string;
      conviction: string | null;
      etf_us: string | null;
      etf_ucits: string | null;
    }>;

    // 7. Load fund mappings for each custodian type present
    const custodianTypes = [...new Set(classifiedHoldings.map((h) => h.custodianType))];
    const fundMappings = new Map<string, Map<string, { fundName: string; ticker: string | null; fundId: string }>>();

    for (const ct of custodianTypes) {
      if (ct === "internacional") continue; // uses ETF directly
      const { data: mappings } = await supabase
        .from("model_fund_mapping")
        .select("categoria, preferred_fund_id, advisor_preferred_funds(fund_name, ticker, fund_run)")
        .eq("advisor_id", advisor!.id)
        .eq("custodian_type", ct);

      const catMap = new Map<string, { fundName: string; ticker: string | null; fundId: string }>();
      if (mappings) {
        for (const m of mappings) {
          const pf = m.advisor_preferred_funds as unknown as { fund_name: string; ticker: string | null; fund_run: string } | null;
          if (pf) {
            catMap.set(m.categoria, {
              fundName: pf.fund_name,
              ticker: pf.ticker,
              fundId: m.preferred_fund_id,
            });
          }
        }
      }
      fundMappings.set(ct, catMap);
    }

    // 8. Build category comparison
    // Aggregate actual weights by category
    const actualByCategory = new Map<string, number>();
    for (const h of classifiedHoldings) {
      const current = actualByCategory.get(h.categoria) || 0;
      actualByCategory.set(h.categoria, current + h.weightPct);
    }

    // Build posiciones lookup
    const modelByCategory = new Map<string, typeof posiciones[0]>();
    for (const p of posiciones) {
      // Match by category label (comite uses labels like "RV USA Large Cap")
      // Find the canonical ID
      const catDef = COMITE_CATEGORIES.find(
        (c) => c.label === p.categoria || c.id === p.categoria
      );
      if (catDef) {
        modelByCategory.set(catDef.id, p);
      }
    }

    const categories = COMITE_CATEGORIES.map((cat) => {
      const modelPos = modelByCategory.get(cat.id);
      const targetPct = modelPos?.modelo_pct || 0;
      const actualPct = actualByCategory.get(cat.id) || 0;
      const deltaPp = actualPct - targetPct;
      const estado = deltaPp > 2 ? "SOBREPONDERADO" : deltaPp < -2 ? "SUBPONDERADO" : "EN_RANGO";

      const currentHoldings = classifiedHoldings
        .filter((h) => h.categoria === cat.id)
        .map((h) => ({
          fundName: h.fundName,
          securityId: h.securityId,
          marketValueCLP: h.marketValueCLP,
          weightPct: h.weightPct,
          custodian: h.custodian,
          custodianType: h.custodianType,
          classificationConfidence: h.confidence,
        }));

      // Determine proposed action
      let proposedAction = null;
      if (Math.abs(deltaPp) > 2) {
        const direction = deltaPp > 0 ? "sell" : "buy";
        const amountCLP = Math.abs(deltaPp / 100) * totalValueCLP;

        // Pick instrument based on custodian
        // Find the primary custodian for this category (most holdings or first)
        const primaryCustodian = currentHoldings[0]?.custodianType ||
          custodianTypes[0] || "corredora";

        let instrument = cat.label;
        let ticker: string | null = null;
        let custodian = currentHoldings[0]?.custodian || "";

        if (primaryCustodian === "internacional") {
          instrument = cat.etf_us || cat.label;
          ticker = cat.etf_us;
        } else {
          const mapping = fundMappings.get(primaryCustodian)?.get(cat.id);
          if (mapping) {
            instrument = mapping.fundName;
            ticker = mapping.ticker;
          }
        }

        proposedAction = {
          direction: direction as "buy" | "sell" | "hold",
          amountCLP,
          instrument,
          ticker,
          custodian,
          custodianType: primaryCustodian,
        };
      }

      return {
        categoria: cat.id,
        categoriaLabel: cat.label,
        role: cat.role,
        targetPct,
        actualPct: Math.round(actualPct * 100) / 100,
        deltaPp: Math.round(deltaPp * 100) / 100,
        estado,
        vista: (modelPos?.vista || "N") as "OW" | "UW" | "N",
        conviction: modelPos?.conviction || null,
        currentHoldings,
        proposedAction,
      };
    });

    // 9. Aggregated allocation by role
    const allocation = {
      rv: { actual: 0, target: 0, delta: 0 },
      rf: { actual: 0, target: 0, delta: 0 },
      alt: { actual: 0, target: 0, delta: 0 },
      cash: { actual: 0, target: 0, delta: 0 },
    };

    for (const cat of categories) {
      const role = cat.role as keyof typeof allocation;
      allocation[role].actual += cat.actualPct;
      allocation[role].target += cat.targetPct;
    }
    for (const role of Object.keys(allocation) as Array<keyof typeof allocation>) {
      allocation[role].actual = Math.round(allocation[role].actual * 100) / 100;
      allocation[role].target = Math.round(allocation[role].target * 100) / 100;
      allocation[role].delta = Math.round((allocation[role].actual - allocation[role].target) * 100) / 100;
    }

    // 10. Flags
    const flags: Array<{ type: string; holdingName: string; message: string }> = [];

    for (const h of classifiedHoldings) {
      if (h.confidence === "low") {
        flags.push({
          type: "low_confidence_classification",
          holdingName: h.fundName,
          message: `"${h.fundName}" fue clasificado como ${getCategoryById(h.categoria)?.label || h.categoria} con baja confianza. Revise manualmente.`,
        });
      }
    }

    // Check for unmapped custodians (non-internacional)
    for (const ct of custodianTypes) {
      if (ct === "internacional") continue;
      const mapping = fundMappings.get(ct);
      if (!mapping || mapping.size === 0) {
        flags.push({
          type: "unmapped_custodian",
          holdingName: "",
          message: `No hay mapeo de fondos para custodio tipo "${ct}". Configure en Mapeo Fondos.`,
        });
      }
    }

    const sleeves = (modelPortfolio.sleeves || []) as Array<Record<string, unknown>>;

    return NextResponse.json({
      success: true,
      data: {
        clientId,
        clientName: `${client.first_name} ${client.last_name}`,
        perfilModelo: modelPerfil,
        perfilCliente: clientPerfil,
        reportDate: modelPortfolio.report_date,
        notaComite: modelPortfolio.nota_comite,
        totalValueCLP,
        categories,
        allocation,
        flags,
        sleeves,
        custodians: [...latestByCustodian.entries()].map(([key, snap]) => ({
          name: snap.custodian || key,
          type: snap.custodian_type || "corredora",
          snapshotDate: snap.snapshot_date,
        })),
      },
    });
  } catch (error) {
    console.error("Error in radiografia:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/portfolio/radiografia/route.ts
git commit -m "feat: radiografia pipeline API endpoint"
```

---

## Task 8: Update Xray Profile Mapping

**Files:**
- Modify: `app/api/portfolio/xray/route.ts` (lines ~230-237)

The existing xray route uses the old profile mapping. Update it to use the shared module.

- [ ] **Step 1: Add import**

At the top of the file, add:

```typescript
import { mapClientProfile } from "@/lib/comite-categories";
```

- [ ] **Step 2: Replace the inline perfilMap**

Replace lines ~230-238:

```typescript
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
```

With:

```typescript
    if (perfilRiesgo) {
      const modelPerfil = mapClientProfile(perfilRiesgo);
```

- [ ] **Step 3: Commit**

```bash
git add app/api/portfolio/xray/route.ts
git commit -m "refactor: use shared mapClientProfile in xray route"
```

---

## Task 9: Final Integration Test

- [ ] **Step 1: Run all existing tests**

```bash
npx vitest run
```

Expected: All existing tests pass + new comite-categories tests pass.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No errors.

- [ ] **Step 3: Test build**

```bash
npm run build
```

Expected: Clean build, no type errors.

- [ ] **Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat: comite -> radiografia pipeline (migration, categories, API endpoints)"
git push
```
