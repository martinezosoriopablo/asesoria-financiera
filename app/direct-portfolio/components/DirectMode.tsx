// app/direct-portfolio/components/DirectMode.tsx
// Componente principal del modo de portafolio directo

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Save,
  Loader,
  RefreshCw,
  Download,
  User,
  Briefcase,
} from "lucide-react";
import HoldingsTable from "./HoldingsTable";
import AddStockModal from "./AddStockModal";
import AddBondModal from "./AddBondModal";
import AllocationChart from "./AllocationChart";
import RiskBandsDisplay from "./RiskBandsDisplay";
import type {
  DirectPortfolio,
  DirectPortfolioHolding,
  RiskProfile,
  SecurityQuote,
} from "@/lib/direct-portfolio/types";
import { formatCurrency, getAssetClass } from "@/lib/direct-portfolio/types";

interface DirectModeProps {
  portfolioId?: string;
  clientId?: string;
}

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  perfil_riesgo?: string;
}

export default function DirectMode({ portfolioId, clientId }: DirectModeProps) {
  // Estado del portafolio
  const [portfolio, setPortfolio] = useState<DirectPortfolio | null>(null);
  const [holdings, setHoldings] = useState<DirectPortfolioHolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clientes disponibles
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    clientId || null
  );

  // Datos del portafolio
  const [nombre, setNombre] = useState("Nuevo Portafolio");
  const [perfilRiesgo, setPerfilRiesgo] = useState<RiskProfile | null>(null);

  // Modales
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showAddBondModal, setShowAddBondModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<DirectPortfolioHolding | null>(null);

  // Precios actuales
  const [pricesLoading, setPricesLoading] = useState(false);

  // Cargar clientes
  useEffect(() => {
    async function fetchClients() {
      try {
        const response = await fetch("/api/clients?status=activo");
        const data = await response.json();
        if (data.success) {
          setClients(data.clients);
        }
      } catch (err) {
        console.error("Error loading clients:", err);
      }
    }
    fetchClients();
  }, []);

  // Cargar portafolio existente
  useEffect(() => {
    async function fetchPortfolio() {
      if (!portfolioId) return;

      setLoading(true);
      try {
        const response = await fetch(`/api/direct-portfolio/${portfolioId}`);
        const data = await response.json();

        if (data.success) {
          setPortfolio(data.portfolio);
          setNombre(data.portfolio.nombre);
          setPerfilRiesgo(data.portfolio.perfil_riesgo);
          setSelectedClientId(data.portfolio.client_id);
          setHoldings(data.portfolio.direct_portfolio_holdings || []);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError("Error cargando portafolio");
      } finally {
        setLoading(false);
      }
    }
    fetchPortfolio();
  }, [portfolioId]);

  // Actualizar precios de todos los holdings
  const refreshAllPrices = useCallback(async () => {
    if (holdings.length === 0) return;

    setPricesLoading(true);
    const updatedHoldings = [...holdings];

    for (let i = 0; i < updatedHoldings.length; i++) {
      const holding = updatedHoldings[i];
      if (holding.tipo === "bond") continue; // Bonos no tienen precio en tiempo real

      if (holding.ticker) {
        try {
          const response = await fetch(
            `/api/securities/quote/${encodeURIComponent(holding.ticker)}`
          );
          const data = await response.json();

          if (data.success && data.quote) {
            updatedHoldings[i] = {
              ...holding,
              precio_actual: data.quote.price,
              valor_mercado: holding.cantidad * data.quote.price,
            };
          }
        } catch (err) {
          console.error(`Error fetching price for ${holding.ticker}:`, err);
        }
      }
    }

    // Calcular peso del portafolio
    const totalValue = updatedHoldings.reduce(
      (sum, h) => sum + (h.valor_mercado || 0),
      0
    );

    if (totalValue > 0) {
      updatedHoldings.forEach((h) => {
        h.peso_portafolio = ((h.valor_mercado || 0) / totalValue) * 100;
      });
    }

    setHoldings(updatedHoldings);
    setPricesLoading(false);
  }, [holdings]);

  // Actualizar precio de un holding específico
  const refreshHoldingPrice = async (holding: DirectPortfolioHolding) => {
    if (!holding.ticker || holding.tipo === "bond") return;

    try {
      const response = await fetch(
        `/api/securities/quote/${encodeURIComponent(holding.ticker)}`
      );
      const data = await response.json();

      if (data.success && data.quote) {
        const updatedHoldings = holdings.map((h) => {
          if (h.id === holding.id) {
            return {
              ...h,
              precio_actual: data.quote.price,
              valor_mercado: h.cantidad * data.quote.price,
            };
          }
          return h;
        });

        // Recalcular pesos
        const totalValue = updatedHoldings.reduce(
          (sum, h) => sum + (h.valor_mercado || 0),
          0
        );

        updatedHoldings.forEach((h) => {
          h.peso_portafolio = totalValue > 0 ? ((h.valor_mercado || 0) / totalValue) * 100 : 0;
        });

        setHoldings(updatedHoldings);
      }
    } catch (err) {
      console.error("Error refreshing price:", err);
    }
  };

  // Guardar portafolio
  const savePortfolio = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        nombre,
        perfil_riesgo: perfilRiesgo,
        client_id: selectedClientId,
      };

      let response;
      if (portfolio?.id) {
        // Actualizar existente
        response = await fetch(`/api/direct-portfolio/${portfolio.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Crear nuevo
        response = await fetch("/api/direct-portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            holdings: holdings.map((h) => ({
              tipo: h.tipo,
              ticker: h.ticker,
              nombre: h.nombre,
              cantidad: h.cantidad,
              precio_compra: h.precio_compra,
              fecha_compra: h.fecha_compra,
              cupon: h.cupon,
              vencimiento: h.vencimiento,
              valor_nominal: h.valor_nominal,
              cusip: h.cusip,
              isin: h.isin,
            })),
          }),
        });
      }

      const data = await response.json();

      if (data.success) {
        setPortfolio(data.portfolio);
        // Actualizar la URL si es nuevo
        if (!portfolio?.id && data.portfolio.id) {
          window.history.replaceState(
            {},
            "",
            `/direct-portfolio?id=${data.portfolio.id}`
          );
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Error guardando portafolio");
    } finally {
      setSaving(false);
    }
  };

  // Agregar holding
  const handleAddHolding = async (holdingData: Partial<DirectPortfolioHolding>) => {
    if (portfolio?.id) {
      // Si el portafolio ya existe, guardar en la base de datos
      const response = await fetch(`/api/direct-portfolio/${portfolio.id}/holdings`, {
        method: holdingData.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(holdingData),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      if (holdingData.id) {
        // Actualizar existente
        setHoldings(
          holdings.map((h) => (h.id === holdingData.id ? { ...h, ...data.holding } : h))
        );
      } else {
        // Agregar nuevo
        setHoldings([...holdings, data.holding]);
      }
    } else {
      // Portafolio no guardado aún, mantener en estado local
      const newHolding: DirectPortfolioHolding = {
        id: holdingData.id || `temp-${Date.now()}`,
        portfolio_id: "",
        tipo: holdingData.tipo!,
        ticker: holdingData.ticker || null,
        nombre: holdingData.nombre!,
        cantidad: holdingData.cantidad!,
        precio_compra: holdingData.precio_compra || null,
        fecha_compra: holdingData.fecha_compra || null,
        cupon: holdingData.cupon || null,
        vencimiento: holdingData.vencimiento || null,
        valor_nominal: holdingData.valor_nominal || null,
        cusip: holdingData.cusip || null,
        isin: holdingData.isin || null,
        created_at: new Date().toISOString(),
      };

      if (holdingData.id) {
        setHoldings(holdings.map((h) => (h.id === holdingData.id ? newHolding : h)));
      } else {
        setHoldings([...holdings, newHolding]);
      }
    }

    // Actualizar precios después de agregar
    setTimeout(() => refreshAllPrices(), 500);
  };

  // Eliminar holding
  const handleDeleteHolding = async (holdingId: string) => {
    if (portfolio?.id) {
      const response = await fetch(
        `/api/direct-portfolio/${portfolio.id}/holdings?holding_id=${holdingId}`,
        { method: "DELETE" }
      );

      const data = await response.json();
      if (!data.success) {
        setError(data.error);
        return;
      }
    }

    setHoldings(holdings.filter((h) => h.id !== holdingId));
  };

  // Editar holding
  const handleEditHolding = (holding: DirectPortfolioHolding) => {
    setEditingHolding(holding);
    if (holding.tipo === "bond") {
      setShowAddBondModal(true);
    } else {
      setShowAddStockModal(true);
    }
  };

  // Calcular totales
  const totalValue = holdings.reduce((sum, h) => sum + (h.valor_mercado || 0), 0);
  const selectedClient = clients.find((c) => c.id === selectedClientId);

  // Actualizar precios al cargar holdings
  useEffect(() => {
    if (holdings.length > 0 && !pricesLoading) {
      refreshAllPrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="text-2xl font-bold text-gray-900 border-none focus:outline-none focus:ring-0 w-full bg-transparent"
              placeholder="Nombre del Portafolio"
            />
            <div className="flex items-center gap-4 mt-2">
              {/* Selector de cliente */}
              <div className="flex items-center gap-2">
                <User size={16} className="text-gray-400" />
                <select
                  value={selectedClientId || ""}
                  onChange={(e) => setSelectedClientId(e.target.value || null)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin cliente asignado</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.nombre} {client.apellido}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mostrar perfil del cliente si existe */}
              {selectedClient?.perfil_riesgo && (
                <span className="text-sm text-gray-500">
                  Perfil cliente: {selectedClient.perfil_riesgo}
                </span>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <button
              onClick={refreshAllPrices}
              disabled={pricesLoading || holdings.length === 0}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={pricesLoading ? "animate-spin" : ""}
              />
              Actualizar Precios
            </button>
            <button
              onClick={savePortfolio}
              disabled={saving || !nombre.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Guardar
            </button>
          </div>
        </div>

        {/* Resumen rápido */}
        <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Valor Total</p>
            <p className="text-xl font-semibold text-gray-900">
              {formatCurrency(totalValue, "USD")}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Posiciones</p>
            <p className="text-xl font-semibold text-gray-900">
              {holdings.length}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Renta Variable</p>
            <p className="text-xl font-semibold text-blue-600">
              {totalValue > 0
                ? (
                    (holdings
                      .filter((h) => getAssetClass(h.tipo) === "renta_variable")
                      .reduce((sum, h) => sum + (h.valor_mercado || 0), 0) /
                      totalValue) *
                    100
                  ).toFixed(1)
                : 0}
              %
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Renta Fija</p>
            <p className="text-xl font-semibold text-amber-600">
              {totalValue > 0
                ? (
                    (holdings
                      .filter((h) => getAssetClass(h.tipo) === "renta_fija")
                      .reduce((sum, h) => sum + (h.valor_mercado || 0), 0) /
                      totalValue) *
                    100
                  ).toFixed(1)
                : 0}
              %
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Botones para agregar */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            setEditingHolding(null);
            setShowAddStockModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={18} />
          Agregar Acción / ETF
        </button>
        <button
          onClick={() => {
            setEditingHolding(null);
            setShowAddBondModal(true);
          }}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-2"
        >
          <Plus size={18} />
          Agregar Bono
        </button>
      </div>

      {/* Tabla de holdings */}
      <HoldingsTable
        holdings={holdings}
        onDelete={handleDeleteHolding}
        onEdit={handleEditHolding}
        onRefreshPrice={refreshHoldingPrice}
        loading={pricesLoading}
      />

      {/* Gráficos y análisis */}
      {holdings.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AllocationChart holdings={holdings} />
          <RiskBandsDisplay
            holdings={holdings}
            perfilRiesgo={perfilRiesgo}
            onChangeProfile={setPerfilRiesgo}
          />
        </div>
      )}

      {/* Modales */}
      <AddStockModal
        isOpen={showAddStockModal}
        onClose={() => {
          setShowAddStockModal(false);
          setEditingHolding(null);
        }}
        onAdd={handleAddHolding}
        editHolding={editingHolding?.tipo !== "bond" ? editingHolding : null}
      />

      <AddBondModal
        isOpen={showAddBondModal}
        onClose={() => {
          setShowAddBondModal(false);
          setEditingHolding(null);
        }}
        onAdd={handleAddHolding}
        editHolding={editingHolding?.tipo === "bond" ? editingHolding : null}
      />
    </div>
  );
}
