// app/(public)/risk-profile/page.tsx
// Redirect to canonical URL /client/risk-profile

import { redirect } from "next/navigation";

export default function RiskProfileRedirect() {
  // Note: In Next.js 15+, we use a simpler redirect
  // Query params will be handled client-side by the target page
  redirect("/client/risk-profile");
}
