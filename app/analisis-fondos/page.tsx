// app/analisis-fondos/page.tsx
// Redirect to new Fund Center

import { redirect } from "next/navigation";

export default function AnalisisFondosRedirect() {
  redirect("/fund-center?mode=analyze");
}
