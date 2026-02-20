// app/mi-perfil-inversor/page.tsx
// Redirect to canonical URL /client/risk-profile

import { redirect } from "next/navigation";

export default function MiPerfilInversorRedirect() {
  redirect("/client/risk-profile");
}
