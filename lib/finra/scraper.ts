// lib/finra/scraper.ts
// FINRA bond price scraper using Playwright for auth + REST API for data
//
// Flow:
// 1. Playwright logs into FINRA Gateway portal
// 2. Extract session cookies + XSRF token
// 3. Call DynRep REST API to read bond watchlist (pre-configured with target bonds)
// 4. Return structured price data
//
// REQUIRES: FINRA_USER and FINRA_PASSWORD in .env.local
// REQUIRES: playwright + chromium installed (npx playwright install chromium)
// REQUIRES: Bonds must be added to the FINRA watchlist manually via the portal

import { chromium, type Browser } from "playwright";

export interface BondPriceResult {
  cusip: string;
  issuerName: string;
  couponRate: number;
  maturityDate: string;
  lastSalePrice: number;
  lastSaleYield: number;
  lastTradeDate?: string;
  priceChange?: number;
  priceChangePct?: number;
  productSymbol?: string;
}

export interface ScrapeResult {
  success: boolean;
  bonds: BondPriceResult[];
  error?: string;
  loginTimeMs?: number;
  queryTimeMs?: number;
}

const SECURITY_ANSWERS: Record<string, string> = {
  "high school": "Santiago",
  city: "Santiago",
  "first boss": "Martin",
  supervisor: "Martin",
  boss: "Martin",
  "middle name": "Aurora",
  mother: "Aurora",
};

function findSecurityAnswer(questionText: string): string | null {
  const q = questionText.toLowerCase();
  for (const [key, answer] of Object.entries(SECURITY_ANSWERS)) {
    if (q.includes(key)) return answer;
  }
  return null;
}

function getCredentials(): { user: string; password: string } {
  const user = process.env.FINRA_USER;
  const password = process.env.FINRA_PASSWORD;
  if (!user || !password) {
    throw new Error("FINRA_USER and FINRA_PASSWORD must be set in .env.local");
  }
  return { user, password };
}

const BASE = "https://services-dynarep.ddwa.finra.org";

/**
 * Login to FINRA and extract session cookies + XSRF token
 */
async function loginAndGetSession(): Promise<{
  cookies: string;
  xsrfToken: string;
  dxtId: string;
  browser: Browser;
}> {
  const { user, password } = getCredentials();

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Capture XSRF token and dxt-id from API responses
  let xsrfToken = "";
  let dxtId = "";

  page.on("response", async (response) => {
    // Grab XSRF token from Set-Cookie
    const setCookies = response.headers()["set-cookie"] || "";
    const xsrfMatch = setCookies.match(/XSRF-TOKEN=([^;]+)/);
    if (xsrfMatch) xsrfToken = xsrfMatch[1];
  });

  page.on("request", (request) => {
    const h = request.headers();
    if (h["x-xsrf-token"] && !xsrfToken) xsrfToken = h["x-xsrf-token"];
    if (h["dxt-id"] && !dxtId) dxtId = h["dxt-id"];
  });

  // Navigate to portal
  await page.goto("https://gateway.finra.org/app/data", {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  // Login
  await page.click("#individual-username");
  await page.type("#individual-username", user, { delay: 20 });
  await page.click("#password");
  await page.type("#password", password, { delay: 20 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const btn = document.querySelector("#submit-button") as HTMLButtonElement;
    if (btn) {
      btn.disabled = false;
      btn.click();
    }
  });
  await page.waitForTimeout(3000);

  // Handle security question
  const pageText = await page.evaluate(() => document.body.innerText);
  if (pageText.includes("Security Question")) {
    const answer = findSecurityAnswer(pageText);
    if (answer) {
      await page.click("#securityQuestionAnswer");
      await page.type("#securityQuestionAnswer", answer, { delay: 20 });
      const cb = await page.$("#bindDevice");
      if (cb) await cb.check({ force: true }).catch(() => {});
      await page.evaluate(() => {
        const btn = document.querySelector(
          "#submit-button"
        ) as HTMLButtonElement;
        if (btn) {
          btn.disabled = false;
          btn.click();
        }
      });
      await page.waitForTimeout(5000);
    }
  }

  // Wait for SPA to load and capture tokens
  await page.waitForTimeout(10000);

  // Get cookies
  const allCookies = await context.cookies();
  const cookieStr = allCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // Extract XSRF from cookies if not captured from headers
  if (!xsrfToken) {
    const xsrfCookie = allCookies.find((c) => c.name === "XSRF-TOKEN");
    if (xsrfCookie) xsrfToken = xsrfCookie.value;
  }

  // Generate a dxt-id if not captured
  if (!dxtId) {
    dxtId = crypto.randomUUID();
  }

  await page.close();

  return { cookies: cookieStr, xsrfToken, dxtId, browser };
}

/**
 * Fetch bond prices from the FINRA watchlist
 * Bonds must be pre-added to the watchlist via the FINRA portal
 */
async function fetchWatchlistPrices(session: {
  cookies: string;
  xsrfToken: string;
  dxtId: string;
}): Promise<BondPriceResult[]> {
  const headers: Record<string, string> = {
    Cookie: session.cookies,
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-xsrf-token": session.xsrfToken,
    "dxt-id": `${session.dxtId},${session.dxtId}`,
    Referer: "https://gateway.finra.org/",
  };

  // Read the watchlist
  const wlRes = await fetch(`${BASE}/reporting/v1/watchlist/`, { headers, signal: AbortSignal.timeout(15000) });
  if (!wlRes.ok) {
    throw new Error(`Watchlist fetch failed: ${wlRes.status}`);
  }

  const wl = await wlRes.json();
  const items = wl.returnBody?.watchlistItems || [];

  return items.map(
    (item: {
      cusip?: string;
      issuerName: string;
      productSymbol: string;
      coupon: number;
      maturityDate: string;
      lastSalePrice: number;
      lastSaleYield: number;
      updatedTime?: string;
      priceChangeNumber?: number;
      priceChangePercent?: number;
    }) => ({
      cusip: item.cusip || "",
      issuerName: item.issuerName,
      couponRate: item.coupon,
      maturityDate: item.maturityDate,
      lastSalePrice: item.lastSalePrice,
      lastSaleYield: item.lastSaleYield,
      lastTradeDate: item.updatedTime?.split("T")[0],
      priceChange: item.priceChangeNumber,
      priceChangePct: item.priceChangePercent,
      productSymbol: item.productSymbol,
    })
  );
}

/**
 * Main entry point: login, fetch watchlist prices, close browser
 */
export async function scrapeBondPrices(): Promise<ScrapeResult> {
  let browser: Browser | null = null;

  try {
    const loginStart = Date.now();
    const session = await loginAndGetSession();
    browser = session.browser;
    const loginTimeMs = Date.now() - loginStart;

    const queryStart = Date.now();
    const bonds = await fetchWatchlistPrices(session);
    const queryTimeMs = Date.now() - queryStart;

    await browser.close();
    browser = null;

    return {
      success: true,
      bonds,
      loginTimeMs,
      queryTimeMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[FINRA scraper]", message);
    return { success: false, bonds: [], error: message };
  } finally {
    if (browser) await browser.close();
  }
}
