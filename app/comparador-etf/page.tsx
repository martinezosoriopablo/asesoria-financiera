// app/comparador-etf/page.tsx
// Redirect to new Fund Center

import { redirect } from "next/navigation";

export default function ComparadorETFRedirect() {
  redirect("/fund-center?mode=compare");
}
