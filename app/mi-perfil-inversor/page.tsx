import { Suspense } from "react";
import RiskProfileWizard from "@/components/risk/RiskProfileWizard";

export default function MiPerfilInversorPage() {
  return (
    <Suspense>
      <RiskProfileWizard />
    </Suspense>
  );
}
