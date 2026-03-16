import { describe, it, expect, vi } from "vitest";
import { successResponse, errorResponse, getErrorMessage, handleApiError } from "./api-response";

describe("successResponse", () => {
  it("returns JSON with success: true and data", async () => {
    const res = successResponse({ clients: [], total: 0 });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.clients).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("accepts custom status code", async () => {
    const res = successResponse({ id: "123" }, 201);
    expect(res.status).toBe(201);
  });
});

describe("errorResponse", () => {
  it("returns JSON with success: false and error message", async () => {
    const res = errorResponse("Something went wrong", 400);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Something went wrong");
  });

  it("defaults to status 500", async () => {
    const res = errorResponse("Internal error");
    expect(res.status).toBe(500);
  });
});

describe("getErrorMessage", () => {
  it("extracts message from Error instance", () => {
    expect(getErrorMessage(new Error("test error"))).toBe("test error");
  });

  it("returns string errors directly", () => {
    expect(getErrorMessage("string error")).toBe("string error");
  });

  it("returns fallback for unknown types", () => {
    expect(getErrorMessage(42)).toBe("Error interno del servidor");
    expect(getErrorMessage(null)).toBe("Error interno del servidor");
    expect(getErrorMessage(undefined)).toBe("Error interno del servidor");
  });

  it("accepts custom fallback", () => {
    expect(getErrorMessage({}, "custom fallback")).toBe("custom fallback");
  });
});

describe("handleApiError", () => {
  it("returns the handler result on success", async () => {
    const res = await handleApiError("test-route", async () => {
      return successResponse({ data: "ok" });
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBe("ok");
  });

  it("catches errors and returns 500", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await handleApiError("test-route", async () => {
      throw new Error("DB connection failed");
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("DB connection failed");
    expect(consoleSpy).toHaveBeenCalledWith("Error en test-route:", expect.any(Error));

    consoleSpy.mockRestore();
  });

  it("handles non-Error throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await handleApiError("test-route", async () => {
      throw "string error";
    });
    const body = await res.json();

    expect(body.error).toBe("string error");

    vi.restoreAllMocks();
  });
});
