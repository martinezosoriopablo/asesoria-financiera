// app/direct-portfolio/page.tsx
// Direct Portfolio - Portafolios de acciones y bonos individuales

"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import {
  Loader,
  Plus,
  Briefcase,
  TrendingUp,
  Users,
  FileText,
  MoreVertical,
  Trash2,
  Eye,
} from "lucide-react";
import DirectMode from "./components/DirectMode";
import type { DirectPortfolio } from "@/lib/direct-portfolio/types";
import { formatCurrency } from "@/lib/direct-portfolio/types";

// ============================================================
// PORTFOLIO LIST
// ============================================================

function PortfolioListView({ onSelect }: { onSelect: (id: string) => void }) {
  const [portfolios, setPortfolios] = useState<DirectPortfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPortfolios() {
      try {
        const response = await fetch("/api/direct-portfolio");
        const data = await response.json();

        if (data.success) {
          setPortfolios(data.portfolios);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError("Error cargando portafolios");
      } finally {
        setLoading(false);
      }
    }
    fetchPortfolios();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de eliminar este portafolio?")) return;

    try {
      const response = await fetch(`/api/direct-portfolio/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        setPortfolios(portfolios.filter((p) => p.id !== id));
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Error eliminando portafolio");
    }
    setMenuOpen(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Portafolios</p>
              <p className="text-2xl font-semibold">{portfolios.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Con Cliente Asignado</p>
              <p className="text-2xl font-semibold">
                {portfolios.filter((p) => p.client_id).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Posiciones</p>
              <p className="text-2xl font-semibold">
                {portfolios.reduce(
                  (sum, p) => sum + (p.direct_portfolio_holdings?.length || 0),
                  0
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio list */}
      {portfolios.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No hay portafolios directos
          </h3>
          <p className="text-gray-500 mb-4">
            Cree un portafolio con acciones y bonos individuales
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">
                  Nombre
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">
                  Cliente
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">
                  Perfil
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">
                  Posiciones
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">
                  Creado
                </th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {portfolios.map((portfolio) => (
                <tr
                  key={portfolio.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => onSelect(portfolio.id)}
                >
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900">
                      {portfolio.nombre}
                    </div>
                    {portfolio.descripcion && (
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">
                        {portfolio.descripcion}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {portfolio.clients ? (
                      <div>
                        <div className="text-gray-900">
                          {portfolio.clients.nombre} {portfolio.clients.apellido}
                        </div>
                        <div className="text-xs text-gray-500">
                          {portfolio.clients.email}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">Sin asignar</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {portfolio.perfil_riesgo ? (
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          portfolio.perfil_riesgo === "defensivo"
                            ? "bg-green-100 text-green-800"
                            : portfolio.perfil_riesgo === "moderado"
                            ? "bg-blue-100 text-blue-800"
                            : portfolio.perfil_riesgo === "crecimiento"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {portfolio.perfil_riesgo.charAt(0).toUpperCase() +
                          portfolio.perfil_riesgo.slice(1)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {portfolio.direct_portfolio_holdings?.length || 0}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500">
                    {new Date(portfolio.created_at).toLocaleDateString("es-CL")}
                  </td>
                  <td className="py-3 px-4 relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(menuOpen === portfolio.id ? null : portfolio.id);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {menuOpen === portfolio.id && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(portfolio.id);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Eye size={14} />
                          Ver
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(portfolio.id);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"
                        >
                          <Trash2 size={14} />
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN CONTENT
// ============================================================

function DirectPortfolioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { advisor, loading: authLoading } = useAdvisor();

  // Get portfolio ID from URL
  const portfolioId = searchParams.get("id");
  const clientId = searchParams.get("client");
  const isNewMode = searchParams.get("new") === "true";

  const handleSelectPortfolio = (id: string) => {
    router.push(`/direct-portfolio?id=${id}`);
  };

  const handleNewPortfolio = () => {
    router.push("/direct-portfolio?new=true");
  };

  const handleBackToList = () => {
    router.push("/direct-portfolio");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!advisor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Debe iniciar sesión para acceder</p>
        </div>
      </div>
    );
  }

  const showEditor = portfolioId || isNewMode;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdvisorHeader
        advisorName={advisor?.name || ""}
        advisorEmail={advisor?.email || ""}
        advisorPhoto={advisor?.photo}
        advisorLogo={advisor?.logo}
        companyName={advisor?.companyName}
        isAdmin={advisor?.isAdmin}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {showEditor && (
              <button
                onClick={handleBackToList}
                className="text-gray-500 hover:text-gray-700"
              >
                ← Volver
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {showEditor ? "Portafolio Directo" : "Portafolios Directos"}
              </h1>
              <p className="text-gray-500">
                {showEditor
                  ? "Gestione acciones y bonos individuales"
                  : "Portafolios de acciones y bonos individuales"}
              </p>
            </div>
          </div>

          {!showEditor && (
            <button
              onClick={handleNewPortfolio}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={18} />
              Nuevo Portafolio
            </button>
          )}
        </div>

        {/* Content */}
        {showEditor ? (
          <DirectMode portfolioId={portfolioId || undefined} clientId={clientId || undefined} />
        ) : (
          <PortfolioListView onSelect={handleSelectPortfolio} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// PAGE EXPORT
// ============================================================

export default function DirectPortfolioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      }
    >
      <DirectPortfolioContent />
    </Suspense>
  );
}
