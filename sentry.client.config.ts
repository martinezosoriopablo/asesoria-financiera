import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Performance Monitoring
  tracesSampleRate: 0.1, // 10% of transactions

  // Session replay for debugging UI issues
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

  // Filter noisy errors
  ignoreErrors: [
    "ResizeObserver loop",
    "Loading chunk",
    "Network request failed",
    "AbortError",
    "TypeError: Failed to fetch",
    "TypeError: NetworkError",
    "TypeError: cancelled",
  ],
});
