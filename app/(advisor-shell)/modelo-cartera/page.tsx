import { redirect } from "next/navigation";

// Redirige a la herramienta unificada (Portfolio Designer) preservando el
// cliente y fijando la pestaña de Modelo Cliente.
export default async function ModeloCarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client } = await searchParams;
  const q = client ? `&client=${encodeURIComponent(client)}` : "";
  redirect(`/portfolio-designer?mode=model${q}`);
}
