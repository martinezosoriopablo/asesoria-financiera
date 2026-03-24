import { Suspense } from "react";
import RiskProfileRedirectClient from "./redirect";

export default function RiskProfileRedirect() {
  return (
    <Suspense>
      <RiskProfileRedirectClient />
    </Suspense>
  );
}
