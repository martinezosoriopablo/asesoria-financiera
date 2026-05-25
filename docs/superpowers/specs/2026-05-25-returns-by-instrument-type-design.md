# Returns by Instrument Type — Design Spec

## Summary

Replace the "Por Clase de Activo" section in `PerformanceAttribution` with stacked horizontal bars where:
- Bar **length** is proportional to the **return** of that asset class
- Bar **segments** show the contribution of each **instrument type** (ETF, Acciones, Fondo Mutuo, FI, Bonos) to that class's return
- Negative returns extend to the left of a zero axis

## Current State

`components/seguimiento/PerformanceAttribution.tsx` section 1 ("Por Clase de Activo") uses a Recharts `BarChart` with single-color horizontal bars showing contribution per class (RV, RF, Alternativos, Cash). No sub-categorization by instrument type exists.

The data comes from comparing `firstSnapshot` vs `lastSnapshot` asset class values (equity_value, fixed_income_value, etc.).

## Data Source for Instrument Type

Each holding in the snapshot has optional fields from the xray enrichment. The xray route (`app/api/portfolio/xray/route.ts`) already classifies holdings with `instrumentType` (values: `fondo_mutuo`, `fondo_inversion`, `etf`, `stock`, `bond`). This field is available in the snapshot's `holdings` array.

**Display labels:**
| `instrumentType` value | Display label | Color |
|---|---|---|
| `etf` | ETFs | `#3b82f6` (blue) |
| `stock` | Acciones | `#10b981` (green) |
| `fondo_mutuo` | Fondos Mutuos | `#f59e0b` (amber) |
| `bond` | Bonos | `#8b5cf6` (purple) |
| `fondo_inversion` | FI | `#94a3b8` (slate) |
| unknown/missing | Otros | `#d1d5db` (gray) |

## Design

### Computation

For each asset class (RV, RF, Alternativos, Cash):
1. Group holdings by `instrumentType`
2. For each instrument type within the class, compute: `contribution = (endValue - startValue) / portfolioStartValue * 100`
3. The asset class return = sum of its instrument type contributions
4. Bar total length proportional to the class return (positive or negative)
5. Each segment width proportional to its contribution within the bar

### Visual Layout (pure Tailwind/HTML, no Recharts)

```
Legend: [ETFs] [Acciones] [Fondos Mutuos] [Bonos] [FI]

Scale:  -4%   -2%    0%    +2%   +4%   +6%   +8%

Renta Variable                    |████████████████████|  +8.2%
  +8.2%                           |ETFs 3.0|Acc 3.5|FM 1.7|

Renta Fija             |██████████|                        +4.5%
  +4.5%                |ETFs 2.0|Bonos 1.5|FM 1.0|

Alternativos           |████|                              +2.1%
  +2.1%                |ETFs 1.4|FI 0.7|

Cash                   |█|                                 +0.3%
  +0.3%                |FM|

────────────────────────────────────────────
Retorno Total Cartera                              +15.1%
```

For negative returns, the bar extends left from the zero line using red-tinted versions of the instrument colors.

### Implementation Approach

Replace the Recharts `BarChart` inside the `expandedSection === "assetClass"` block with a custom Tailwind-based stacked bar chart. This avoids Recharts complexity for stacked segments with mixed positive/negative bars.

Keep the existing computation of `assetClassAttribution` for the contribution totals per class (used by other sections). Add a new `useMemo` that computes per-instrument-type breakdown within each class using the holdings arrays from first/last snapshots.

### Matching Holdings Across Snapshots

Use `fundName` (or `securityId` when available) to match a holding between first and last snapshot — same logic already used in section 2 (position attribution). Map each holding to its asset class via the existing `assetClass` field, and to its instrument type via `instrumentType` (falling back to heuristic: if `fundName` includes "ETF" → etf, if numeric `securityId` → fondo_mutuo, else "otros").

### Props

No new props needed. The `snapshots` prop already contains holdings with `instrumentType` when available from xray enrichment.

### Summary Cards Below

Keep the 4 summary cards (one per class) showing total contribution %. Add a small text line under each showing the dominant instrument type (e.g., "Principal: ETFs (55%)").

## Scope

- Replace section 1 chart only — sections 2 (position attribution), 3 (benchmark comparison), and 4 (portfolio comparison) remain unchanged
- No API changes needed
- No new dependencies
- Single file change: `components/seguimiento/PerformanceAttribution.tsx`

## Out of Scope

- Tooltip/expansion on click (keep it simple with visible segments)
- Changes to xray or snapshot data model
- Changes to other sections of PerformanceAttribution
