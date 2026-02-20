// app/portfolio-comparison/page.tsx
// Redirect to new Portfolio Designer

import { redirect } from "next/navigation";

export default function PortfolioComparisonRedirect() {
  redirect("/portfolio-designer?mode=comparison");
}
