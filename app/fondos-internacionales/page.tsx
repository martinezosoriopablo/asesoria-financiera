// app/fondos-internacionales/page.tsx
// Redirect to new Fund Center

import { redirect } from "next/navigation";

export default function FondosInternacionalesRedirect() {
  redirect("/fund-center?mode=search");
}
