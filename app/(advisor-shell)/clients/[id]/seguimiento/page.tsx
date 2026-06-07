// app/clients/[id]/seguimiento/page.tsx

import SeguimientoPage from "@/components/seguimiento/SeguimientoPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientSeguimientoPage({ params }: PageProps) {
  const { id } = await params;
  return <SeguimientoPage clientId={id} />;
}
