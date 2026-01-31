// app/clients/[id]/page.tsx

import ClientDetail from "@/components/clients/ClientDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ClientDetail clientId={id} />;
}
