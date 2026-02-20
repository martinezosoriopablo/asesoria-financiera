"use client";

import React from "react";
import { Users, DollarSign, Calendar, AlertCircle } from "lucide-react";

interface StatsCardsProps {
  totalClientes: number;
  clientesActivos: number;
  prospectos: number;
  aumTotal: number;
  reunionesPendientes: number;
  reunionesEstaSemana: number;
}

export default function StatsCards({
  totalClientes,
  clientesActivos,
  prospectos,
  aumTotal,
  reunionesPendientes,
  reunionesEstaSemana,
}: StatsCardsProps) {
  const formatCurrency = (amount: number) => {
    if (amount >= 1000000000) {
      return `$${(amount / 1000000000).toFixed(1)}B`;
    }
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Clientes */}
      <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-slate-600 mb-1">Clientes</p>
            <p className="text-3xl font-bold text-slate-900">{totalClientes}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full font-semibold">
                {clientesActivos} Activos
              </span>
              <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full font-semibold">
                {prospectos} Prospectos
              </span>
            </div>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>

      {/* AUM */}
      <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-600">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-slate-600 mb-1">AUM Total</p>
            <p className="text-3xl font-bold text-slate-900">
              {formatCurrency(aumTotal)}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Assets Under Management
            </p>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Reuniones Esta Semana */}
      <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-indigo-500">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-slate-600 mb-1">Esta Semana</p>
            <p className="text-3xl font-bold text-slate-900">
              {reunionesEstaSemana}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Reuniones programadas
            </p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center">
            <Calendar className="w-6 h-6 text-indigo-600" />
          </div>
        </div>
      </div>

      {/* Reuniones Pendientes */}
      <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-slate-400">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-slate-600 mb-1">Pendientes</p>
            <p className="text-3xl font-bold text-slate-900">
              {reunionesPendientes}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Reuniones totales
            </p>
          </div>
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-slate-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
