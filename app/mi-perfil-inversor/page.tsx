// app/mi-perfil-inversor/page.tsx
// Redirect to canonical URL /client/risk-profile preserving query params

import { redirect } from "next/navigation";

export default async function MiPerfilInversorRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // Build query string from search params
  const entries = Object.entries(params).filter(([_, v]) => v !== undefined);
  const queryString = entries.length > 0
    ? "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
    : "";

  redirect(`/client/risk-profile${queryString}`);
}
