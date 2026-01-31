// app/clients/[id]/edit/page.tsx

import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditClientPage({ params }: PageProps) {
  const { id } = await params;
  
  // Por ahora redirige al detalle
  // Puedes implementar un formulario de edición después
  redirect(`/clients/${id}`);
}
