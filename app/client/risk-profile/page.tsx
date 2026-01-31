import { Suspense } from "react";
import RiskProfileWizard from "@/components/risk/RiskProfileWizard";

export default function RiskProfilePage() {
  return (
    <Suspense>
      <RiskProfileWizard />
    </Suspense>
  );
}
