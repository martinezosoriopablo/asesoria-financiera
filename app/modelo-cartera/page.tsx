// app/modelo-cartera/page.tsx
// Redirect to new Portfolio Designer

import { redirect } from "next/navigation";

export default function ModeloCarteraRedirect() {
  redirect("/portfolio-designer?mode=model");
}
