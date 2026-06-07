"use client";

import { useState } from "react";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import AdvisorSidebar from "@/components/shared/AdvisorSidebar";
import { Loader } from "lucide-react";

export default function AdvisorShellLayout({ children }: { children: React.ReactNode }) {
  const { advisor, loading } = useAdvisor();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-primary animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  return (
    <div className="min-h-screen bg-background">
      <AdvisorSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        advisorName={advisor.name}
        advisorEmail={advisor.email}
        advisorPhoto={advisor.photo}
        isAdmin={advisor.isAdmin}
        hasClientRole={advisor.hasClientRole}
      />

      <div className={`${sidebarCollapsed ? "pl-16" : "pl-60"} min-h-screen flex flex-col transition-all duration-200`}>
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
