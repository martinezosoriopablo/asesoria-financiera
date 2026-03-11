// components/shared/ClientSelector.tsx
// Componente reutilizable para seleccionar clientes desde una lista desplegable

"use client";

import React, { useState, useEffect } from "react";
import { User, Loader, ChevronDown, Search, Mail, Plus } from "lucide-react";

export interface ClientOption {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  perfil_riesgo?: string;
  puntaje_riesgo?: number;
}

interface ClientSelectorProps {
  value: string | null;
  onChange: (client: ClientOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  showRiskProfile?: boolean;
  filterStatus?: string;
  className?: string;
  label?: string;
  allowNewEmail?: boolean; // Permite escribir un email nuevo (para enviar cuestionario a prospectos)
  onNewEmail?: (email: string) => void; // Callback cuando se ingresa un email nuevo
}

export default function ClientSelector({
  value,
  onChange,
  placeholder = "Seleccionar cliente...",
  disabled = false,
  showRiskProfile = true,
  filterStatus = "activo",
  className = "",
  label,
  allowNewEmail = false,
  onNewEmail,
}: ClientSelectorProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newEmailMode, setNewEmailMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  // Cargar clientes al montar
  useEffect(() => {
    async function fetchClients() {
      try {
        const url = filterStatus
          ? `/api/clients?status=${filterStatus}`
          : "/api/clients";
        const response = await fetch(url);
        const data = await response.json();
        if (data.success) {
          setClients(data.clients || []);
        }
      } catch (err) {
        console.error("Error loading clients:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, [filterStatus]);

  // Cliente seleccionado
  const selectedClient = clients.find((c) => c.id === value);

  // Filtrar clientes por búsqueda
  const filteredClients = clients.filter((client) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      client.nombre.toLowerCase().includes(search) ||
      client.apellido.toLowerCase().includes(search) ||
      client.email.toLowerCase().includes(search)
    );
  });

  const handleSelect = (client: ClientOption) => {
    onChange(client);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = () => {
    onChange(null);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || loading}
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2.5
          bg-white border border-gray-200 rounded-lg text-left
          ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-gray-300 cursor-pointer"}
          focus:outline-none focus:ring-2 focus:ring-blue-500
        `}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {newEmailMode ? (
            <Mail size={16} className="text-blue-500 flex-shrink-0" />
          ) : (
            <User size={16} className="text-gray-400 flex-shrink-0" />
          )}
          {loading ? (
            <span className="text-gray-400 flex items-center gap-2">
              <Loader size={14} className="animate-spin" />
              Cargando...
            </span>
          ) : newEmailMode && newEmail ? (
            <div className="min-w-0 flex-1">
              <span className="text-gray-900 truncate block">{newEmail}</span>
              <span className="text-xs text-blue-500 truncate block">Nuevo prospecto</span>
            </div>
          ) : selectedClient ? (
            <div className="min-w-0 flex-1">
              <span className="text-gray-900 truncate block">
                {selectedClient.nombre} {selectedClient.apellido}
              </span>
              <span className="text-xs text-gray-500 truncate block">
                {selectedClient.email}
              </span>
            </div>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-hidden">
            {/* Search Input */}
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Options */}
            <div className="max-h-60 overflow-y-auto">
              {/* Clear option */}
              {(value || newEmailMode) && (
                <button
                  onClick={() => {
                    handleClear();
                    setNewEmailMode(false);
                    setNewEmail("");
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 border-b border-gray-100"
                >
                  Sin cliente asignado
                </button>
              )}

              {/* New email option */}
              {allowNewEmail && (
                <button
                  onClick={() => {
                    setNewEmailMode(true);
                    setSearchTerm("");
                  }}
                  className="w-full px-3 py-2.5 text-left hover:bg-green-50 transition-colors border-b border-gray-100 flex items-center gap-2"
                >
                  <Plus size={14} className="text-green-600" />
                  <div>
                    <div className="font-medium text-green-700 text-sm">Enviar a nuevo email</div>
                    <div className="text-xs text-green-600">Prospecto sin cuenta</div>
                  </div>
                </button>
              )}

              {/* New email input mode */}
              {newEmailMode && allowNewEmail && (
                <div className="p-3 border-b border-gray-100 bg-green-50">
                  <label className="text-xs text-green-700 font-medium mb-1 block">
                    Email del prospecto
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="prospecto@email.com"
                      className="flex-1 px-3 py-1.5 text-sm border border-green-200 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newEmail && newEmail.includes("@")) {
                          onNewEmail?.(newEmail);
                          setIsOpen(false);
                        }
                      }}
                      disabled={!newEmail || !newEmail.includes("@")}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-40"
                    >
                      Usar
                    </button>
                  </div>
                </div>
              )}

              {!newEmailMode && (
                <>
                  {filteredClients.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-gray-500 text-center">
                      {searchTerm ? "No se encontraron clientes" : "No hay clientes disponibles"}
                    </div>
                  ) : (
                    filteredClients.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => handleSelect(client)}
                        className={`
                          w-full px-3 py-2.5 text-left hover:bg-blue-50 transition-colors
                          ${client.id === value ? "bg-blue-50" : ""}
                        `}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900 text-sm">
                              {client.nombre} {client.apellido}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {client.email}
                            </div>
                          </div>
                          {showRiskProfile && client.perfil_riesgo && (
                            <span className={`
                              text-xs px-2 py-0.5 rounded-full flex-shrink-0
                              ${client.perfil_riesgo === "conservador" || client.perfil_riesgo === "defensivo"
                                ? "bg-blue-100 text-blue-700"
                                : client.perfil_riesgo === "moderado"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-green-100 text-green-700"
                              }
                            `}>
                              {client.perfil_riesgo}
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
