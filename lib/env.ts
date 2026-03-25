// lib/env.ts
// Validates critical environment variables at import time (server-side only).
// Throws a single error listing ALL missing vars so you can fix them in one pass.

const requiredServerVars = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
] as const;

const requiredPublicVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

// Only validate when:
// 1. Running on the server (not in the browser)
// 2. Not during the Next.js build phase (some vars may not be set yet)
const isServer = typeof window === "undefined";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (isServer && !isBuildPhase) {
  const allRequired = [...requiredPublicVars, ...requiredServerVars];
  const missing = allRequired.filter(
    (v) => !process.env[v] || process.env[v]!.trim() === ""
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

// ---------------------------------------------------------------------------
// Typed exports — safe to use after the guard above has passed.
// ---------------------------------------------------------------------------

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
export const RESEND_API_KEY = process.env.RESEND_API_KEY!;
export const CRON_SECRET = process.env.CRON_SECRET!;
