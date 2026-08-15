// components/portal/patrimonio/PatrimonioItemView.tsx
"use client";
import React from "react";
import { GRUPOS } from "@/components/clients/patrimonio/schemas";
import { formatFieldValue } from "@/components/clients/patrimonio/itemDisplay";

type Grupo = (typeof GRUPOS)[number];
type Item = Record<string, unknown> & { tipo: string };

export default function PatrimonioItemView({ grupo, item }: { grupo: Grupo; item: Item }) {
  const badge = grupo.tipos.find((t) => t.value === item.tipo)?.label ?? String(item.tipo);
  const rows = grupo.fields
    .filter((f) => f.key !== "notas")            // ocultar notas internas
    .filter((f) => !f.showIf || f.showIf(item))  // respetar condicionales
    .map((f) => ({ label: f.label, value: formatFieldValue(f, item) }))
    .filter((r) => r.value !== null);

  return (
    <div className="rounded-lg border border-gb-border bg-white p-4">
      <span className="inline-block rounded-full bg-gb-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gb-primary">
        {badge}
      </span>
      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between gap-3 text-sm">
            <span className="text-gb-gray">{r.label}</span>
            <span className="text-right font-medium text-gb-black">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
