"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { BarChart3, Search, TrendingUp, Loader } from "lucide-react";
import ExplorarTab from "@/components/fund-center/ExplorarTab";
import BuscarTab from "@/components/fund-center/BuscarTab";
import CompararTab from "@/components/fund-center/CompararTab";

// ============================================================
// TAB NAVIGATION
// ============================================================

interface TabConfig {
  id: string;
  label: string;
  icon: React.ElementType;
}

const TABS: TabConfig[] = [
  { id: "explorar", label: "Explorar", icon: BarChart3 },
  { id: "buscar", label: "Buscar", icon: Search },
  { id: "comparar", label: "Comparar", icon: TrendingUp },
];

function TabNavigation({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) {
  return (
    <div className="bg-white border-b border-gb-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-1 py-2" aria-label="Tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-gb-black text-white"
                    : "text-gb-gray hover:bg-gb-light hover:text-gb-black"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

// ============================================================
// MAIN CONTENT
// ============================================================

function FundCenterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { advisor, loading: authLoading } = useAdvisor();

  const activeTab = searchParams.get("mode") || "explorar";

  const handleTabChange = (tab: string) => {
    router.push(`/fund-center?mode=${tab}`);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gb-light">
      <AdvisorHeader
        advisorName={advisor?.name || ""}
        advisorEmail={advisor?.email || ""}
        advisorPhoto={advisor?.photo}
        advisorLogo={advisor?.logo}
        companyName={advisor?.companyName}
        isAdmin={advisor?.isAdmin}
      />

      {/* Page Header */}
      <div className="bg-white border-b border-gb-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-semibold text-gb-black">Centro de Fondos</h1>
          <p className="text-sm text-gb-gray mt-1">
            Explora, busca y compara fondos mutuos, fondos de inversión y ETFs
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "explorar" && <ExplorarTab />}
        {activeTab === "buscar" && <BuscarTab />}
        {activeTab === "comparar" && <CompararTab />}
      </div>
    </div>
  );
}

// ============================================================
// EXPORT WITH SUSPENSE
// ============================================================

export default function FundCenterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    }>
      <FundCenterContent />
    </Suspense>
  );
}
