// app/portfolio-designer/page.tsx
// Portfolio Designer - Herramienta unificada de construcción de carteras

"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { BarChart3, User, Zap, TrendingUp, Loader } from "lucide-react";
import ComparisonMode from "./components/ComparisonModeV2";
import ModelMode from "./components/ModelMode";
import QuickMode from "./components/QuickMode";
import AnalysisMode from "./components/AnalysisMode";

// ============================================================
// TAB NAVIGATION
// ============================================================

interface TabConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  disabled?: boolean;
}

const TABS: TabConfig[] = [
  { id: "comparison", label: "Comparación", icon: BarChart3, description: "Actual vs Ideal" },
  { id: "model", label: "Modelo Cliente", icon: User, description: "Crear modelo" },
  { id: "quick", label: "Quick Build", icon: Zap, description: "Plantillas" },
  { id: "analysis", label: "Análisis", icon: TrendingUp, description: "Comparar fondos" },
];

function TabNavigation({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) {
  return (
    <div className="bg-white border-b border-gb-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-1 py-2" aria-label="Tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDisabled = tab.disabled;

            return (
              <button
                key={tab.id}
                onClick={() => !isDisabled && onTabChange(tab.id)}
                disabled={isDisabled}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${isActive
                    ? "bg-gb-black text-white"
                    : isDisabled
                      ? "text-gb-gray/50 cursor-not-allowed"
                      : "text-gb-gray hover:bg-gb-light hover:text-gb-black"
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {isDisabled && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-gb-light rounded text-gb-gray">
                    Pronto
                  </span>
                )}
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

function PortfolioDesignerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { advisor, loading: authLoading } = useAdvisor();

  // Get mode from URL or default to "comparison"
  const activeTab = searchParams.get("mode") || "comparison";

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", tab);
    // Preserve client param if exists
    const clientParam = searchParams.get("client");
    if (clientParam) params.set("client", clientParam);
    router.push(`/portfolio-designer?${params.toString()}`);
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
          <h1 className="text-2xl font-semibold text-gb-black">Portfolio Designer</h1>
          <p className="text-sm text-gb-gray mt-1">
            Herramienta unificada para diseñar, comparar y optimizar carteras de inversión
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Content based on active tab */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "comparison" && <ComparisonMode />}
        {activeTab === "model" && <ModelMode />}
        {activeTab === "quick" && <QuickMode />}
        {activeTab === "analysis" && <AnalysisMode />}
      </div>
    </div>
  );
}

// ============================================================
// EXPORT WITH SUSPENSE
// ============================================================

export default function PortfolioDesignerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    }>
      <PortfolioDesignerContent />
    </Suspense>
  );
}
