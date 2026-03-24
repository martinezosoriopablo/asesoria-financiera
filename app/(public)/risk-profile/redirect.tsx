"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function RiskProfileRedirectClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const params = searchParams.toString();
    router.replace(`/client/risk-profile${params ? `?${params}` : ""}`);
  }, [searchParams, router]);

  return null;
}
