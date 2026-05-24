# Smart Portfolio Pipeline — Design Spec

## Goal

Connect the investment committee's model portfolios, preferred funds, and client radiografía into a single intelligent pipeline that generates personalized portfolio proposals based on risk profile, custodian type, and committee vision.

## Architecture

Three sub-projects executed in order, each independently usable:

1. **Model Portfolios** — structured storage for committee-generated model portfolios by risk profile
2. **Extended Preferred Funds + Custodians + Mapping** — international instruments (Alpha Vantage), custodian configuration with commissions, and category-to-fund mapping by custodian type
3. **Smart Radiografía** — connects everything: compares client's actual portfolio vs model, proposes changes with concrete funds and cost estimates

## Sub-project 1: Model Portfolios

### Data Model

**Table: `model_portfolios`**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| version | int | Auto-increment per report_date |
| report_date | date | Committee session date |
| perfil | text | `ultra_conservador`, `conservador`, `moderado`, `crecimiento`, `agresivo`, `muy_agresivo` |
| posiciones | JSONB | Array of position objects |
| nota_comite | text | Committee's overall vision for this profile |
| created_by | UUID FK advisors | |
| created_at | timestamptz | Default now() |

**UNIQUE constraint:** `(perfil, report_date)`

**Position object schema:**

```json
{
  "categoria": "RV EEUU Large Cap",
  "peso": 20,
  "etf_ref": "SPY",
  "tesis": "Valuaciones razonables post-corrección, favorecer large cap quality."
}
```

Each committee session produces 6 rows (one per risk profile). The latest `report_date` per profile is the active model.

### JSON Input Format

The advisor generates this from their external AI committee and pastes/uploads it:

```json
{
  "report_date": "2026-05-23",
  "perfiles": {
    "ultra_conservador": {
      "nota_comite": "Preservación de capital...",
      "posiciones": [
        { "categoria": "RF Gobierno", "peso": 40, "etf_ref": "IEF", "tesis": "..." },
        { "categoria": "RF IG Corporativa", "peso": 35, "etf_ref": "LQD", "tesis": "..." },
        { "categoria": "Money Market", "peso": 25, "etf_ref": "BIL", "tesis": "..." }
      ]
    },
    "conservador": { ... },
    "moderado": { ... },
    "crecimiento": { ... },
    "agresivo": { ... },
    "muy_agresivo": { ... }
  }
}
```

### Endpoints

- **POST `/api/comite/model-portfolios`** — receives JSON, validates schema, upserts 6 rows (one per profile). Overwrites if same report_date exists.
- **GET `/api/comite/model-portfolios?perfil=moderado`** — returns latest active model for a profile. Without query param, returns all 6 active models.
- **GET `/api/comite/model-portfolios/history`** — returns list of all report_dates with versions.

### UI

Minimal addition to `ComiteReportsPanel.tsx`:
- Textarea/file input for JSON paste
- Display of current active models as a table (profile → categories with weights)
- Badge showing last committee date

### RLS

- Advisors can read all model portfolios (shared market view)
- Only the advisor who created can delete (soft delete via version)

---

## Sub-project 2: Extended Preferred Funds + Custodians + Mapping

### 2a. Extend `advisor_preferred_funds`

New columns:

| Column | Type | Description |
|--------|------|-------------|
| ticker | text | International instrument ticker ("SPY", "LQD"). Null for Chilean FM |
| instrument_type | text | "fund", "etf", "stock", "bond" |
| expense_ratio | numeric | ETF expense ratio (TER) from Alpha Vantage |
| description | text | Fund/ETF objective |
| custodian_type | text | "agf", "corredora", "internacional" |

Existing fields remain: `fund_run` (Chilean FM identifier), `fund_name`, `category`, `notes`, `active`.

For Chilean funds: `fund_run` is set, `ticker` is null.
For international: `ticker` is set, `fund_run` is null (or a placeholder like "ETF-SPY").

### Enrichment Flow for International Instruments

When advisor adds an ETF by ticker:
1. Call existing `/api/funds/etf-profile?symbol=SPY` (Alpha Vantage)
2. Extract: name, expense_ratio, description, returns, dividend_yield, holdings
3. Save to `advisor_preferred_funds` with enriched data

### 2b. Custodian Configuration

**Table: `custodian_config`**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| advisor_id | UUID FK advisors | |
| name | text | "Security AGF", "Security Corredora", "Stonex", "Pershing" |
| type | text | "agf", "corredora", "internacional" |
| commission_pct | numeric | Commission per transaction (%) |
| notes | text | |
| created_at | timestamptz | |

**UNIQUE constraint:** `(advisor_id, name)`

**Default commissions:** AGF: 0%, Corredora: 0.5%, Internacional: 0.1%

### Endpoints

- **CRUD `/api/advisor/custodians`** — manage custodian list with commissions
- **PATCH `/api/advisor/preferred-funds`** — extended to accept `ticker`, `instrument_type`, `custodian_type`, `expense_ratio`, `description`

### 2c. Category-to-Fund Mapping

**Table: `model_fund_mapping`**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| advisor_id | UUID FK advisors | |
| categoria | text | Committee category (e.g., "RV EEUU Large Cap") |
| custodian_type | text | "agf", "corredora", "internacional" |
| preferred_fund_id | UUID FK advisor_preferred_funds | |

**UNIQUE constraint:** `(advisor_id, categoria, custodian_type)`

### Mapping UI

New page accessible from sidebar (under "Herramientas" or next to "Mis Fondos"):

- Left column: categories from active model portfolios (auto-populated from `model_portfolios.posiciones`)
- Three columns: AGF, Corredora, Internacional
- Each cell: dropdown/search to pick from `advisor_preferred_funds` filtered by `custodian_type`
- Shows ETF reference and weight from the model as context

Example:

| Categoría Comité | Peso | AGF | Corredora | Internacional |
|---|---|---|---|---|
| RV EEUU Large Cap | 20% | Security Acc. EEUU B | — | SPY |
| RF IG Corporativa | 30% | Security Mid Term B | — | LQD |
| Alternativos Gold | 10% | Security Gold B | — | GLD |

### RLS

- All three tables: advisor can only access own rows
- `model_fund_mapping` references `advisor_preferred_funds` which is already advisor-scoped

---

## Sub-project 3: Smart Radiografía

### Flow

```
Client selected
    ↓
Detect risk profile → clients.perfil_riesgo (e.g., "moderado")
    ↓
Load model portfolio → latest model_portfolios where perfil = "moderado"
    ↓
Detect custodian → from snapshot source field or holdings metadata
    ↓
Determine custodian_type → "agf" | "corredora" | "internacional"
    ↓
Load mapping → model_fund_mapping for each categoria × custodian_type
    ↓
Load custodian config → commission_pct from custodian_config
    ↓
Compare actual vs model:
  - Per category: actual weight vs target weight → over/under
  - Per position: current fund vs mapped fund → same or change needed
    ↓
Calculate change costs:
  - Commission: position_value × commission_pct
  - Tax flag: "AGF→AGF same family = no tax" vs "rescue = check simulator"
    ↓
Feed everything to Claude prompt → generate smart report
```

### Custodian Detection

From the snapshot, infer custodian:
- If holdings have `securityId` that looks like a RUN (numeric, 4-5 digits) → likely Chilean FM → check if AGF or Corredora based on cartola source
- If holdings have CUSIP-shaped IDs → internacional (Stonex/Pershing)
- Fallback: use the cartola's `source` field or a client-level override

For the AGF vs Corredora distinction within Chilean brokers: the cartola upload already captures the custodian name. Store `custodian_name` on the snapshot or client record for reuse.

### Enhanced Claude Prompt

Additional sections injected into the existing xray-report prompt:

```
CARTERA MODELO DEL COMITÉ (Perfil: Moderado, Fecha: 2026-05-15):
Nota del comité: "Mantener sesgo defensivo en RF, aumentar RV desarrollada..."

Posiciones objetivo:
- RV EEUU Large Cap: 20% (ref: SPY) → Fondo recomendado: Security Acc. EEUU B (TAC 1.2%)
  Tesis: Valuaciones razonables post-corrección, favorecer large cap quality.
- RF IG Corporativa: 30% (ref: LQD) → Fondo recomendado: Security Mid Term B (TAC 0.8%)
  Tesis: Spreads atractivos en IG, duration 5-7 años.
[...]

DESVIACIONES ACTUAL VS MODELO:
| Categoría            | Target | Actual | Desviación | Estado          |
| RV EEUU Large Cap    | 20%    |  7.4%  | -12.6%     | SUBPONDERADO    |
| RF IG Corporativa    | 30%    | 11.9%  | -18.1%     | SUBPONDERADO    |
| Alternativos Gold    | 10%    | 26.2%  | +16.2%     | SOBREPONDERADO  |

COSTOS DE CAMBIO:
- Custodio: Security AGF
- Comisión por operación: 0%
- Traspasos FM dentro de misma AGF: sin costo tributario
- Rescates con ganancia: usar simulador tributario para calcular impacto

NOTA: Esta es la recomendación base del comité. Los fondos definitivos
se ajustarán según la situación particular del cliente.
```

### Report Sections (updated)

1. **Resumen Ejecutivo** — portfolio value, current state, main gap vs model
2. **Cartera Modelo vs Actual** — deviation table per category with over/under flags
3. **Análisis de Costos** — current TAC vs proposed + transaction commissions
4. **Propuesta de Ajuste** — specific fund changes with category, tesis, and cost
5. **Consideraciones Tributarias** — warnings about rescues, AGF transfers, link to simulator
6. **Visión del Comité** — relevant theses and overall market view for this profile
7. **Próximos Pasos** — meeting, confirm funds, execute, follow-up

### What Changes in Existing Code

- **`/api/portfolio/xray/route.ts`** — load model portfolio and mapping, compute deviations, pass to result
- **`/api/portfolio/xray-report/route.ts`** — enhanced prompt with model portfolio data, deviations, costs
- **`RadiografiaCartola.tsx`** — pass client's risk profile and custodian to API, display deviation table in UI
- **`SeguimientoPage.tsx`** — pass `perfil_riesgo` and custodian info to RadiografiaCartola

---

## Out of Scope

- **Automatic rebalancing** — advisor decides, platform only recommends
- **Post-implementation tracking** — comparing before/after a change (future)
- **Multiple custodians per client** — one client = one custodian for now
- **Committee JSON generation from within the platform** — advisor generates externally and pastes
- **Bond-specific recommendations** — bonds use FINRA data separately, not part of model portfolio mapping yet
- **Historical model portfolio comparison** — only latest active model used, history stored but no comparison UI

---

## Tech Stack

- **Database:** Supabase Postgres (3 new tables, 5 new columns)
- **AI:** Claude Sonnet 4 (default, configurable to Opus 4 in advisor profile)
- **ETF Data:** Alpha Vantage `ETF_PROFILE` + `OVERVIEW` (existing endpoint)
- **Bond Data:** FINRA `bond_prices` + `bond_catalog` (existing)
- **Tax:** Existing TaxSimulator (link, not integration)

## Implementation Order

1. Sub-project 1: Model Portfolios (schema + endpoints + minimal UI) — independent
2. Sub-project 2: Extended Funds + Custodians + Mapping — depends on Sub-project 1 for categories
3. Sub-project 3: Smart Radiografía — depends on both 1 and 2
