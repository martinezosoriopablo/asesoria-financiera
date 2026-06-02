"use client";

import { useParams } from "next/navigation";
import RecomendacionPage from "@/components/recomendacion/RecomendacionPage";

export default function RecomendacionClientPage() {
  const { clientId } = useParams<{ clientId: string }>();
  if (!clientId) return null;
  return <RecomendacionPage clientId={clientId} />;
}
