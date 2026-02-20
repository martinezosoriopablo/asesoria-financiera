// app/portfolio-builder/page.tsx
// Redirect to new Portfolio Designer

import { redirect } from "next/navigation";

export default function PortfolioBuilderRedirect() {
  redirect("/portfolio-designer?mode=quick");
}
