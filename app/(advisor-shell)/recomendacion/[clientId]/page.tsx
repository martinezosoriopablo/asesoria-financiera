"use client";

import { useParams } from "next/navigation";
import RecomendacionTabs from "@/components/recomendacion/RecomendacionTabs";

export default function RecomendacionClientPage() {
  const { clientId } = useParams<{ clientId: string }>();
  if (!clientId) return null;
  return <RecomendacionTabs clientId={clientId} />;
}
