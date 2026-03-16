import { describe, it, expect } from "vitest";
import { sanitizeSearchInput } from "./sanitize";

describe("sanitizeSearchInput", () => {
  it("returns input unchanged when no special characters", () => {
    expect(sanitizeSearchInput("hello world")).toBe("hello world");
  });

  it("escapes % character", () => {
    expect(sanitizeSearchInput("100%")).toBe("100\\%");
  });

  it("escapes _ character", () => {
    expect(sanitizeSearchInput("some_value")).toBe("some\\_value");
  });

  it("escapes backslash character", () => {
    expect(sanitizeSearchInput("path\\file")).toBe("path\\\\file");
  });

  it("escapes multiple special characters", () => {
    expect(sanitizeSearchInput("%_\\")).toBe("\\%\\_\\\\");
  });

  it("truncates input to maxLength", () => {
    const long = "a".repeat(200);
    expect(sanitizeSearchInput(long).length).toBe(100);
  });

  it("truncates to custom maxLength", () => {
    expect(sanitizeSearchInput("abcdef", 3)).toBe("abc");
  });

  it("handles empty string", () => {
    expect(sanitizeSearchInput("")).toBe("");
  });

  it("preserves normal search terms with accents", () => {
    expect(sanitizeSearchInput("José García")).toBe("José García");
  });
});
