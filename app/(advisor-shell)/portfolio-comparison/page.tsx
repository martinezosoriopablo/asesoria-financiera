import { redirect } from "next/navigation";

// Redirige a la herramienta unificada (Portfolio Designer) preservando el
// cliente y fijando la pestaña de Comparación. Sin esto, el link desde la
// ficha del cliente perdía el contexto y caía en el Designer vacío.
export default async function PortfolioComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client } = await searchParams;
  const q = client ? `&client=${encodeURIComponent(client)}` : "";
  redirect(`/portfolio-designer?mode=comparison${q}`);
}
