"use client";

import EducacionFinanciera from "@/components/educacion/EducacionFinanciera";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { Loader } from "lucide-react";

export default function Page() {
  const { advisor, loading } = useAdvisor();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  return (
    <div className="min-h-screen bg-background">
      <AdvisorHeader
        advisorName={advisor.name}
        advisorEmail={advisor.email}
        advisorPhoto={advisor.photo}
        advisorLogo={advisor.logo}
        companyName={advisor.companyName}
        isAdmin={advisor.isAdmin}
      />
      <EducacionFinanciera />
    </div>
  );
}
