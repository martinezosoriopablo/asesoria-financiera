// app/page.tsx — Re-exports the (public) landing page
// This file exists because app/(public)/page.tsx doesn't take priority
// when app/page.tsx exists. We re-export to avoid the conflict.

export { default } from "./(public)/page";
