// components/portal/patrimonio/PortalPatrimonioInventario.tsx
"use client";
import React from "react";
import { GRUPOS } from "@/components/clients/patrimonio/schemas";
import PatrimonioItemView from "./PatrimonioItemView";

type Items = { seguros: Record<string, unknown>[]; inmuebles: Record<string, unknown>[]; activos: Record<string, unknown>[] };

export default function PortalPatrimonioInventario({ seguros, inmuebles, activos }: Items) {
  const byKey: Record<string, Record<string, unknown>[]> = { seguros, inmuebles, activos };
  return (
    <div className="space-y-6">
      {GRUPOS.map((g) => {
        const items = byKey[g.key] ?? [];
        if (items.length === 0) return null;
        return (
          <section key={g.key}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gb-black">
              <span>{g.icono}</span> {g.titulo} <span className="text-xs font-normal text-gb-gray">({items.length})</span>
            </h3>
            <div className="space-y-3">
              {items.map((it, i) => (
                <PatrimonioItemView key={i} grupo={g} item={it as Record<string, unknown> & { tipo: string }} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
