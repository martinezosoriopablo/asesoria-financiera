// app/direct-portfolio/components/SecuritySearch.tsx
// Componente para buscar acciones/ETFs

"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Loader, X } from "lucide-react";
import type { SecuritySearchResult } from "@/lib/direct-portfolio/types";

interface SecuritySearchProps {
  onSelect: (security: SecuritySearchResult) => void;
  placeholder?: string;
  market?: "us" | "cl" | "all";
}

export default function SecuritySearch({
  onSelect,
  placeholder = "Buscar acción o ETF (ej: AAPL, BSANTANDER)",
  market = "all",
}: SecuritySearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SecuritySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/securities/search?q=${encodeURIComponent(query)}&market=${market}`
        );
        const data = await response.json();

        if (data.success) {
          setResults(data.results);
          setShowDropdown(true);
        } else {
          setError(data.error);
          setResults([]);
        }
      } catch (err) {
        setError("Error en la búsqueda");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, market]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (security: SecuritySearchResult) => {
    onSelect(security);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  };

  const getTypeLabel = (type: SecuritySearchResult["type"]) => {
    switch (type) {
      case "stock_us":
        return { label: "USA", color: "bg-blue-100 text-blue-800" };
      case "stock_cl":
        return { label: "Chile", color: "bg-green-100 text-green-800" };
      case "etf":
        return { label: "ETF", color: "bg-purple-100 text-purple-800" };
      default:
        return { label: type, color: "bg-gray-100 text-gray-800" };
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
        {loading && (
          <Loader
            size={18}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 animate-spin"
          />
        )}
        {!loading && query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setShowDropdown(false);
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Dropdown de resultados */}
      {showDropdown && (results.length > 0 || error) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {error ? (
            <div className="p-3 text-sm text-red-600">{error}</div>
          ) : (
            results.map((security) => {
              const typeInfo = getTypeLabel(security.type);
              return (
                <button
                  key={security.ticker}
                  onClick={() => handleSelect(security)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {security.ticker}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}
                      >
                        {typeInfo.label}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 truncate">
                      {security.name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {security.exchangeName}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Mensaje cuando no hay resultados */}
      {showDropdown && query.length >= 1 && !loading && results.length === 0 && !error && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          <div className="p-3 text-sm text-gray-500">
            No se encontraron resultados para &quot;{query}&quot;
          </div>
        </div>
      )}
    </div>
  );
}
