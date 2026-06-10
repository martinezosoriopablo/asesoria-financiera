"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import PortalSidebar from "@/components/portal/PortalSidebar";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { Loader } from "lucide-react";

// Pages that should NOT show the sidebar (auth/setup pages)
const NO_SIDEBAR_PATHS = ["/portal/login", "/portal/setup-password"];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("portal-sidebar-collapsed") === "true";
    }
    return false;
  });
  const [clientInfo, setClientInfo] = useState<{
    nombre: string;
    email: string;
    hasAdvisorRole: boolean;
    unreadMessages: number;
    unreadReports: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const isNoSidebarPage = NO_SIDEBAR_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (isNoSidebarPage) {
      setLoading(false);
      return;
    }

    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.client) {
          setClientInfo({
            nombre: `${data.client.nombre} ${data.client.apellido}`,
            email: data.client.email,
            hasAdvisorRole: data.hasAdvisorRole || false,
            unreadMessages: data.unreadMessages || 0,
            unreadReports: data.unreadReports || 0,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isNoSidebarPage]);

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("portal-sidebar-collapsed", String(next));
  };

  // Auth/setup pages render without sidebar
  if (isNoSidebarPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-6 h-6 text-gb-gray animate-spin" />
      </div>
    );
  }

  // If no client info (not authenticated), render children without sidebar
  if (!clientInfo) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gb-light">
      <PortalSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        clientName={clientInfo.nombre}
        clientEmail={clientInfo.email}
        hasAdvisorRole={clientInfo.hasAdvisorRole}
        unreadMessages={clientInfo.unreadMessages}
        unreadReports={clientInfo.unreadReports}
      />
      <div
        className={`${sidebarCollapsed ? "pl-16" : "pl-60"} min-h-screen flex flex-col transition-all duration-200`}
      >
        <main className="flex-1"><ErrorBoundary>{children}</ErrorBoundary></main>
      </div>
    </div>
  );
}
