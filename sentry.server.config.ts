import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Performance Monitoring
  tracesSampleRate: 0.1,

  // Filter noisy errors
  ignoreErrors: [
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],
});
