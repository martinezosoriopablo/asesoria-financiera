# FINRA Bond Price Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape corporate bond prices from FINRA's free web portal using Playwright, triggered via a localhost-only API route, and store in Supabase.

**Architecture:** A Playwright scraper (`lib/finra/scraper.ts`) logs into the FINRA Gateway portal, searches each CUSIP, and extracts last trade price/yield/date. An API route (`app/api/bonds/sync-finra/route.ts`) guards with localhost-only check, fetches active bond CUSIPs from snapshots, calls the scraper, and upserts results into `bond_prices` table. Two UI buttons trigger it: one in admin data-sync page, one in seguimiento bond section.

**Tech Stack:** Playwright (devDependency), Next.js API route, Supabase

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260519_bond_prices.sql` | Create | `bond_prices` table |
| `lib/finra/scraper.ts` | Create | Playwright login + CUSIP search + price extraction |
| `app/api/bonds/sync-finra/route.ts` | Create | Localhost-only API, orchestrates scraper + DB upsert |
| `app/(advisor-shell)/admin/data-sync/page.tsx` | Modify | Add "Sync Bonos FINRA" button |
| `components/seguimiento/BondSyncButton.tsx` | Create | Reusable button for seguimiento page |

---

### Task 1: Database migration — `bond_prices` table

**Files:**
- Create: `supabase/migrations/20260519_bond_prices.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260519_bond_prices.sql
-- Store bond prices scraped from FINRA TRACE portal

CREATE TABLE IF NOT EXISTS bond_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cusip TEXT NOT NULL,
  isin TEXT,
  issuer TEXT,
  price_date DATE NOT NULL,
  last_price NUMERIC,
  yield_to_maturity NUMERIC,
  volume NUMERIC,
  source TEXT NOT NULL DEFAULT 'finra',
  raw_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cusip, price_date, source)
);

-- RLS: advisors can read all bond prices (public market data)
ALTER TABLE bond_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read bond prices"
  ON bond_prices FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM advisors WHERE user_id = auth.uid())
  );

-- Service role inserts (from API route)
CREATE POLICY "Service role can insert bond prices"
  ON bond_prices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update bond prices"
  ON bond_prices FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_bond_prices_cusip_date ON bond_prices(cusip, price_date DESC);
CREATE INDEX idx_bond_prices_date ON bond_prices(price_date DESC);
```

- [ ] **Step 2: Apply migration**

Run in Supabase SQL editor or via CLI:
```bash
# If using Supabase CLI:
supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260519_bond_prices.sql
git commit -m "feat(bonds): add bond_prices table for FINRA price data"
```

---

### Task 2: Install Playwright

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install playwright as devDependency**

```bash
npm install -D playwright
npx playwright install chromium
```

Note: Only chromium is needed, skip firefox/webkit to save disk space.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add playwright devDependency for FINRA scraper"
```

---

### Task 3: FINRA scraper library

**Files:**
- Create: `lib/finra/scraper.ts`

- [ ] **Step 1: Create the scraper module**

```typescript
// lib/finra/scraper.ts
// Playwright scraper for FINRA Gateway bond portal
// Logs in, searches each CUSIP, extracts last trade price/yield/date
//
// REQUIRES: FINRA_USER and FINRA_PASSWORD in .env.local
// REQUIRES: playwright + chromium installed (npx playwright install chromium)

import { chromium, type Browser, type Page } from "playwright";

export interface BondPriceResult {
  cusip: string;
  isin?: string;
  issuer?: string;
  priceDate?: string;    // YYYY-MM-DD
  lastPrice?: number;    // % of par
  yieldToMaturity?: number;
  volume?: number;
  raw?: Record<string, string>;
  error?: string;
}

const FINRA_LOGIN_URL = "https://gateway.finra.org/app/data";
const LOGIN_TIMEOUT = 30000;
const SEARCH_TIMEOUT = 15000;

function getCredentials(): { user: string; password: string } {
  const user = process.env.FINRA_USER;
  const password = process.env.FINRA_PASSWORD;
  if (!user || !password) {
    throw new Error("FINRA_USER and FINRA_PASSWORD must be set in .env.local");
  }
  return { user, password };
}

export async function scrapeBondPrices(
  cusips: string[],
  onProgress?: (cusip: string, index: number, total: number) => void
): Promise<BondPriceResult[]> {
  const { user, password } = getCredentials();
  const results: BondPriceResult[] = [];

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Step 1: Login
    console.log("[FINRA] Navigating to portal...");
    await page.goto(FINRA_LOGIN_URL, { waitUntil: "networkidle", timeout: LOGIN_TIMEOUT });

    // The portal redirects to SSO login — wait for the login form
    await page.waitForSelector('input[name="username"], input[name="IDToken1"], input[type="email"]', {
      timeout: LOGIN_TIMEOUT,
    });

    console.log("[FINRA] Login form detected, filling credentials...");

    // FINRA uses various SSO forms — try common field names
    const usernameField = await page.$('input[name="username"]')
      || await page.$('input[name="IDToken1"]')
      || await page.$('input[type="email"]');

    const passwordField = await page.$('input[name="password"]')
      || await page.$('input[name="IDToken2"]')
      || await page.$('input[type="password"]');

    if (!usernameField || !passwordField) {
      throw new Error("Could not find login form fields. FINRA may have changed their login page.");
    }

    await usernameField.fill(user);
    await passwordField.fill(password);

    // Submit — try button click or Enter
    const submitButton = await page.$('button[type="submit"], input[type="submit"], #loginButton_0');
    if (submitButton) {
      await submitButton.click();
    } else {
      await passwordField.press("Enter");
    }

    // Wait for login to complete — portal should load
    await page.waitForURL("**/app/**", { timeout: LOGIN_TIMEOUT });
    console.log("[FINRA] Login successful");

    // Step 2: Navigate to Fixed Income search
    // Wait for the SPA to load
    await page.waitForTimeout(3000);

    // Step 3: Search each CUSIP
    for (let i = 0; i < cusips.length; i++) {
      const cusip = cusips[i];
      onProgress?.(cusip, i, cusips.length);
      console.log(`[FINRA] Searching ${cusip} (${i + 1}/${cusips.length})...`);

      try {
        const result = await searchBondByCUSIP(page, cusip);
        results.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[FINRA] Error searching ${cusip}: ${msg}`);
        results.push({ cusip, error: msg });
      }

      // Small delay between searches to avoid rate limiting
      if (i < cusips.length - 1) {
        await page.waitForTimeout(1500);
      }
    }

    await browser.close();
    browser = null;

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[FINRA] Scraper error:", msg);
    // Mark remaining CUSIPs as failed
    for (const cusip of cusips) {
      if (!results.find(r => r.cusip === cusip)) {
        results.push({ cusip, error: msg });
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}

async function searchBondByCUSIP(page: Page, cusip: string): Promise<BondPriceResult> {
  // Navigate to bond search or use the search bar
  // FINRA Gateway uses a SPA — look for the search input
  const searchInput = await page.$('input[placeholder*="Search"], input[placeholder*="CUSIP"], input[aria-label*="search"], #bondSearch');

  if (searchInput) {
    // Clear and type CUSIP
    await searchInput.click({ clickCount: 3 });
    await searchInput.fill(cusip);
    await searchInput.press("Enter");
    await page.waitForTimeout(2000);
  } else {
    // Try direct URL navigation to bond detail
    await page.goto(`https://gateway.finra.org/app/data/bond/${cusip}`, {
      waitUntil: "networkidle",
      timeout: SEARCH_TIMEOUT,
    });
    await page.waitForTimeout(3000);
  }

  // Extract bond data from the page
  const data = await page.evaluate(() => {
    const getText = (selectors: string[]): string => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      // Try finding by label text
      const allLabels = document.querySelectorAll("td, th, dt, label, span, div");
      const result: Record<string, string> = {};
      allLabels.forEach(el => {
        const text = el.textContent?.trim() || "";
        if (text.includes("Last Sale Price") || text.includes("Last Trade Price")) {
          const next = el.nextElementSibling;
          if (next) result["lastPrice"] = next.textContent?.trim() || "";
        }
        if (text.includes("Yield") && !text.includes("Yield to")) {
          const next = el.nextElementSibling;
          if (next) result["yield"] = next.textContent?.trim() || "";
        }
        if (text.includes("Yield to Maturity") || text.includes("YTM")) {
          const next = el.nextElementSibling;
          if (next) result["ytm"] = next.textContent?.trim() || "";
        }
        if (text.includes("Trade Date") || text.includes("Last Trade")) {
          const next = el.nextElementSibling;
          if (next) result["tradeDate"] = next.textContent?.trim() || "";
        }
        if (text.includes("Volume")) {
          const next = el.nextElementSibling;
          if (next) result["volume"] = next.textContent?.trim() || "";
        }
        if (text.includes("ISIN")) {
          const next = el.nextElementSibling;
          if (next) result["isin"] = next.textContent?.trim() || "";
        }
        if (text.includes("Issuer")) {
          const next = el.nextElementSibling;
          if (next) result["issuer"] = next.textContent?.trim() || "";
        }
      });
      return JSON.stringify(result);
    };

    return getText([]);
  });

  // Parse the extracted data
  let parsed: Record<string, string> = {};
  try {
    parsed = JSON.parse(data);
  } catch {
    // data was a simple string, not JSON
  }

  const parseNumber = (s?: string): number | undefined => {
    if (!s) return undefined;
    const cleaned = s.replace(/[,$%]/g, "").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  };

  const parseDate = (s?: string): string | undefined => {
    if (!s) return undefined;
    // Try MM/DD/YYYY format
    const match = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const [, m, d, y] = match;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return undefined;
  };

  return {
    cusip,
    isin: parsed.isin || undefined,
    issuer: parsed.issuer || undefined,
    priceDate: parseDate(parsed.tradeDate),
    lastPrice: parseNumber(parsed.lastPrice),
    yieldToMaturity: parseNumber(parsed.ytm) || parseNumber(parsed.yield),
    volume: parseNumber(parsed.volume),
    raw: parsed,
  };
}
```

- [ ] **Step 2: Add FINRA credentials to .env.local**

Add to `.env.local`:
```
FINRA_USER=your_finra_username
FINRA_PASSWORD=your_finra_password
```

- [ ] **Step 3: Commit**

```bash
git add lib/finra/scraper.ts
git commit -m "feat(bonds): add FINRA portal Playwright scraper"
```

---

### Task 4: API route — sync FINRA bond prices

**Files:**
- Create: `app/api/bonds/sync-finra/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
// app/api/bonds/sync-finra/route.ts
// Localhost-only API route that scrapes FINRA for bond prices
// and upserts into bond_prices table.

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";

export async function POST(request: NextRequest) {
  // Localhost-only guard (same pattern as AAFM sync)
  const host = request.headers.get("host") || "";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!isLocal && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Este endpoint solo funciona desde localhost (requiere Playwright)" },
      { status: 403 }
    );
  }

  // Auth check
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Get CUSIPs from request body, or fetch active ones from snapshots
    const body = await request.json().catch(() => ({}));
    let cusips: string[] = body.cusips || [];

    if (cusips.length === 0) {
      // Fetch all unique CUSIPs from active bond holdings across all snapshots
      const { data: snapshots } = await supabase
        .from("portfolio_snapshots")
        .select("holdings")
        .order("created_at", { ascending: false })
        .limit(100);

      const cusipSet = new Set<string>();
      for (const snap of snapshots || []) {
        const holdings = snap.holdings as Array<{
          assetType?: string;
          securityId?: string;
          cusip?: string;
        }>;
        if (!Array.isArray(holdings)) continue;
        for (const h of holdings) {
          if (h.assetType === "bond") {
            const id = h.securityId || h.cusip;
            if (id) cusipSet.add(id);
          }
        }
      }
      cusips = Array.from(cusipSet);
    }

    if (cusips.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No se encontraron bonos en los snapshots activos",
        updated: 0,
      });
    }

    // Dynamic import to avoid loading Playwright in Vercel
    const { scrapeBondPrices } = await import("@/lib/finra/scraper");
    const results = await scrapeBondPrices(cusips);

    // Upsert results into bond_prices
    let updated = 0;
    let errors = 0;
    const errorDetails: Array<{ cusip: string; error: string }> = [];

    for (const result of results) {
      if (result.error || !result.lastPrice) {
        errors++;
        errorDetails.push({ cusip: result.cusip, error: result.error || "No price found" });
        continue;
      }

      const priceDate = result.priceDate || new Date().toISOString().split("T")[0];

      const { error: upsertError } = await supabase
        .from("bond_prices")
        .upsert({
          cusip: result.cusip,
          isin: result.isin,
          issuer: result.issuer,
          price_date: priceDate,
          last_price: result.lastPrice,
          yield_to_maturity: result.yieldToMaturity,
          volume: result.volume,
          source: "finra",
          raw_data: result.raw,
          fetched_at: new Date().toISOString(),
        }, {
          onConflict: "cusip,price_date,source",
        });

      if (upsertError) {
        errors++;
        errorDetails.push({ cusip: result.cusip, error: upsertError.message });
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      total: cusips.length,
      updated,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      results: results.map(r => ({
        cusip: r.cusip,
        issuer: r.issuer,
        lastPrice: r.lastPrice,
        ytm: r.yieldToMaturity,
        date: r.priceDate,
        ok: !r.error && !!r.lastPrice,
      })),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en sync FINRA";
    console.error("[FINRA sync] Error:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// GET: return status info
export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  // Get latest bond prices
  const { data: latest } = await supabase
    .from("bond_prices")
    .select("cusip, issuer, price_date, last_price, yield_to_maturity")
    .order("price_date", { ascending: false })
    .limit(50);

  // Count unique CUSIPs
  const uniqueCusips = new Set((latest || []).map(r => r.cusip));

  return NextResponse.json({
    success: true,
    configured: !!process.env.FINRA_USER && !!process.env.FINRA_PASSWORD,
    totalBonds: uniqueCusips.size,
    latestDate: latest?.[0]?.price_date || null,
    prices: latest || [],
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/bonds/sync-finra/route.ts
git commit -m "feat(bonds): add FINRA sync API route (localhost-only)"
```

---

### Task 5: Add FINRA sync button to admin data-sync page

**Files:**
- Modify: `app/(advisor-shell)/admin/data-sync/page.tsx`

- [ ] **Step 1: Add state variables for FINRA sync**

In the component, after the existing sync state variables (around line 66), add:

```typescript
const [syncingFINRA, setSyncingFINRA] = useState(false);
const [finraStatus, setFinraStatus] = useState<{ configured: boolean; totalBonds: number; latestDate: string | null } | null>(null);
```

- [ ] **Step 2: Add FINRA status fetch to useEffect**

Inside the existing `useEffect` (around line 84), add to the `fetchStatus` function after the existing Promise.all:

```typescript
// Also fetch FINRA bond status
fetch('/api/bonds/sync-finra').then(r => r.json())
  .then(d => { if (d.success) setFinraStatus(d); })
  .catch(() => {});
```

- [ ] **Step 3: Add FINRA sync handler**

After `handleFillPrices` (around line 243), add:

```typescript
const handleSyncFINRA = async () => {
  setSyncingFINRA(true);
  try {
    const res = await fetch('/api/bonds/sync-finra', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      addResult('finra', `${data.updated} bonos actualizados de ${data.total} (${data.errors} errores)`, data.errors === 0);
      // Refresh status
      fetch('/api/bonds/sync-finra').then(r => r.json())
        .then(d => { if (d.success) setFinraStatus(d); })
        .catch(() => {});
    } else {
      addResult('finra', data.error, false);
    }
  } catch {
    addResult('finra', 'Error de conexión', false);
  }
  setSyncingFINRA(false);
};
```

- [ ] **Step 4: Add FINRA section to the UI**

After the CMF Sync section (around line 533), add a new section:

```tsx
{/* FINRA Bond Prices */}
<div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '24px' }}>
  <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
    Precios de Bonos (FINRA)
  </h2>
  <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
    Scraping del portal FINRA para precios de bonos corporativos. Solo funciona desde localhost (Playwright).
  </p>

  {finraStatus && (
    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '13px' }}>
      <span style={{ color: finraStatus.configured ? '#10b981' : '#ef4444', fontWeight: '600' }}>
        {finraStatus.configured ? 'Credenciales OK' : 'Sin credenciales FINRA'}
      </span>
      {finraStatus.totalBonds > 0 && (
        <span style={{ color: '#666' }}>
          {finraStatus.totalBonds} bonos · Último: {finraStatus.latestDate}
        </span>
      )}
    </div>
  )}

  <button
    onClick={handleSyncFINRA}
    disabled={syncingFINRA}
    style={{
      padding: '12px 24px',
      borderRadius: '8px',
      border: 'none',
      backgroundColor: syncingFINRA ? '#94a3b8' : '#7c3aed',
      color: 'white',
      cursor: syncingFINRA ? 'not-allowed' : 'pointer',
      fontWeight: '700',
      fontSize: '14px',
    }}
  >
    {syncingFINRA ? 'Buscando precios en FINRA...' : 'Sync Bonos FINRA'}
  </button>

  {syncingFINRA && (
    <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#f5f3ff', border: '1px solid #c4b5fd', fontSize: '13px', color: '#5b21b6' }}>
      Abriendo browser, logueándose en FINRA y buscando cada CUSIP... (puede tardar ~60s para 17 bonos)
    </div>
  )}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add "app/(advisor-shell)/admin/data-sync/page.tsx"
git commit -m "feat(bonds): add FINRA sync button to admin data-sync page"
```

---

### Task 6: BondSyncButton for seguimiento page

**Files:**
- Create: `components/seguimiento/BondSyncButton.tsx`

- [ ] **Step 1: Create the reusable button**

```tsx
"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  cusips?: string[];
  onSyncComplete?: () => void;
}

export default function BondSyncButton({ cusips, onSyncComplete }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);

    try {
      const res = await fetch("/api/bonds/sync-finra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cusips ? { cusips } : {}),
      });

      const data = await res.json();

      if (data.success) {
        setResult({
          ok: data.errors === 0,
          msg: `${data.updated}/${data.total} bonos actualizados${data.errors > 0 ? ` (${data.errors} errores)` : ""}`,
        });
        onSyncComplete?.();
      } else {
        setResult({ ok: false, msg: data.error });
      }
    } catch {
      setResult({ ok: false, msg: "Error de conexión — verificar que corre desde localhost" });
    }

    setSyncing(false);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Actualizando..." : "Sync FINRA"}
      </button>

      {result && (
        <span className={`text-xs ${result.ok ? "text-green-600" : "text-red-600"}`}>
          {result.msg}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/seguimiento/BondSyncButton.tsx
git commit -m "feat(bonds): add BondSyncButton component for seguimiento"
```

---

### Task 7: Test end-to-end with a manual script

**Files:**
- Modify: `scripts/test-finra-bonds.mjs` (already exists, repurpose)

- [ ] **Step 1: Replace test script with a quick Playwright validation**

```javascript
// scripts/test-finra-bonds.mjs
// Quick test: login to FINRA, search one bond, see what we get
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const { chromium } = await import('playwright');

const user = process.env.FINRA_USER;
const pass = process.env.FINRA_PASSWORD;

if (!user || !pass) {
  console.error('Set FINRA_USER and FINRA_PASSWORD in .env.local');
  process.exit(1);
}

console.log('Launching browser...');
const browser = await chromium.launch({ headless: false }); // headless: false to see what happens
const page = await browser.newPage();

console.log('Navigating to FINRA...');
await page.goto('https://gateway.finra.org/app/data', { waitUntil: 'networkidle', timeout: 30000 });

console.log('Current URL:', page.url());
console.log('Page title:', await page.title());

// Take screenshot to see the current state
await page.screenshot({ path: '/tmp/finra-1-initial.png', fullPage: true });
console.log('Screenshot saved to /tmp/finra-1-initial.png');

// Wait for login form
try {
  await page.waitForSelector('input[type="password"], input[name="IDToken2"]', { timeout: 15000 });
  console.log('Login form found!');

  // Find and fill fields
  const inputs = await page.$$('input');
  console.log(`Found ${inputs.length} input fields:`);
  for (const input of inputs) {
    const name = await input.getAttribute('name');
    const type = await input.getAttribute('type');
    const placeholder = await input.getAttribute('placeholder');
    console.log(`  - name="${name}" type="${type}" placeholder="${placeholder}"`);
  }

  await page.screenshot({ path: '/tmp/finra-2-login.png', fullPage: true });
  console.log('Login screenshot saved');

} catch {
  console.log('No login form found — page may have loaded differently');
  await page.screenshot({ path: '/tmp/finra-2-noform.png', fullPage: true });
}

// Keep browser open for 30s so you can see
console.log('Browser stays open for 30s — inspect manually...');
await page.waitForTimeout(30000);

await browser.close();
console.log('Done!');
```

- [ ] **Step 2: Add FINRA portal credentials to .env.local**

```
FINRA_USER=your_email@example.com
FINRA_PASSWORD=your_finra_password
```

- [ ] **Step 3: Run the test**

```bash
node scripts/test-finra-bonds.mjs
```

Expected: Browser opens, FINRA login page appears, screenshots are saved. This tells us the exact form field names and page structure for the scraper.

- [ ] **Step 4: Adapt `lib/finra/scraper.ts` selectors based on screenshots**

Look at the screenshots and update the selectors in `scraper.ts` to match the actual login form and bond search page structure. This step is iterative — run the test, check screenshots, adjust selectors, repeat.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-finra-bonds.mjs
git commit -m "feat(bonds): add FINRA scraper test script"
```

---

### Task 8: Build verification

- [ ] **Step 1: Run build to verify no TypeScript errors**

```bash
npm run build
```

Expected: Build succeeds. The Playwright import in `lib/finra/scraper.ts` is dynamically imported in the API route, so it won't break Vercel builds (Playwright is a devDependency).

- [ ] **Step 2: Fix any build issues if needed**

If the build fails because of Playwright types, add to the API route's dynamic import:

```typescript
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scrapeBondPrices } = await import("@/lib/finra/scraper");
```

If Playwright types cause issues at build time, add `lib/finra/scraper.ts` to `tsconfig.json` exclude list or wrap types with conditional checks.

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat(bonds): FINRA bond price scraper complete"
```
