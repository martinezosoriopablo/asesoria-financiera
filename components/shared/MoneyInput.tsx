"use client";
import React from "react";
import { MONEDAS } from "@/lib/patrimonio/types";

interface Props {
  monto: number | null;
  moneda: string | null;
  onMonto: (v: number | null) => void;
  onMoneda: (v: string) => void;
  placeholder?: string;
}

export default function MoneyInput({ monto, moneda, onMonto, onMoneda, placeholder }: Props) {
  return (
    <div className="flex">
      <input
        type="number"
        inputMode="decimal"
        value={monto ?? ""}
        placeholder={placeholder}
        onChange={(e) => onMonto(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full min-w-0 rounded-l-md border border-r-0 border-gb-border px-3 py-2 text-sm text-gb-black focus:outline-none focus:ring-2 focus:ring-gb-primary/40"
      />
      <select
        value={moneda ?? "UF"}
        onChange={(e) => onMoneda(e.target.value)}
        className="rounded-r-md border border-gb-border bg-gb-light px-2 text-xs font-semibold text-gb-black focus:outline-none"
      >
        {MONEDAS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}
