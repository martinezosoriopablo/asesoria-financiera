import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDailyPrices, fetchQuote } from "./alphavantage";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ALPHA_VANTAGE_API_KEY", "test-key");
});

describe("fetchDailyPrices", () => {
  it("parses TIME_SERIES_DAILY response correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "Time Series (Daily)": {
          "2026-05-27": { "4. close": "450.50" },
          "2026-05-26": { "4. close": "448.00" },
          "2026-05-23": { "4. close": "445.25" },
        },
      }),
    });

    const prices = await fetchDailyPrices("SPY");
    expect(prices).toHaveLength(3);
    expect(prices[0]).toEqual({ date: "2026-05-23", price: 445.25 });
    expect(prices[2]).toEqual({ date: "2026-05-27", price: 450.50 });
  });

  it("returns empty array when API key missing", async () => {
    vi.stubEnv("ALPHA_VANTAGE_API_KEY", "");
    const prices = await fetchDailyPrices("SPY");
    expect(prices).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty array on rate limit (Note in response)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Note: "Thank you for using Alpha Vantage!",
      }),
    });

    const prices = await fetchDailyPrices("SPY");
    expect(prices).toEqual([]);
  });

  it("returns empty array on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const prices = await fetchDailyPrices("SPY");
    expect(prices).toEqual([]);
  });
});

describe("fetchQuote", () => {
  it("parses GLOBAL_QUOTE response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "Global Quote": {
          "05. price": "450.50",
          "07. latest trading day": "2026-05-27",
        },
      }),
    });

    const quote = await fetchQuote("SPY");
    expect(quote).toEqual({ price: 450.5, date: "2026-05-27" });
  });

  it("returns null when no data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ "Global Quote": {} }),
    });

    const quote = await fetchQuote("INVALID");
    expect(quote).toBeNull();
  });
});
