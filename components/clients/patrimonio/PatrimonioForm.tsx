// components/clients/patrimonio/PatrimonioForm.tsx
"use client";
import React from "react";
import MoneyInput from "@/components/shared/MoneyInput";
import { FieldDef } from "./schemas";

interface Props {
  fields: FieldDef[];
  value: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}

const WIDTH: Record<string, string> = {
  full: "basis-full", half: "basis-[calc(50%-6px)]", third: "basis-[calc(33.333%-8px)]",
};

export default function PatrimonioForm({ fields, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      {fields.map((f) => {
        if (f.showIf && !f.showIf(value)) return null;
        const w = WIDTH[f.width ?? "third"];
        return (
          <div key={f.key} className={`${w} min-w-[150px] grow`}>
            <label className="mb-1 block text-[10.5px] font-semibold text-gb-gray">{f.label}</label>
            {f.type === "money" ? (
              <MoneyInput
                monto={(value[`${f.key}_monto`] as number) ?? null}
                moneda={(value[`${f.key}_moneda`] as string) ?? "UF"}
                onMonto={(v) => onChange({ [`${f.key}_monto`]: v, [`${f.key}_moneda`]: (value[`${f.key}_moneda`] as string) ?? "UF" })}
                onMoneda={(v) => onChange({ [`${f.key}_moneda`]: v })}
              />
            ) : f.type === "switch" ? (
              <button
                type="button"
                onClick={() => onChange({ [f.key]: !value[f.key] })}
                className={`flex items-center gap-2 text-sm font-semibold ${value[f.key] ? "text-gb-success" : "text-gb-gray"}`}
              >
                <span className={`inline-block h-[19px] w-[34px] rounded-full ${value[f.key] ? "bg-gb-success" : "bg-gb-gray"} relative`}>
                  <span className={`absolute top-[2px] h-[15px] w-[15px] rounded-full bg-white transition-all ${value[f.key] ? "right-[2px]" : "left-[2px]"}`} />
                </span>
                {value[f.key] ? "Sí" : "No"}
              </button>
            ) : f.type === "select" ? (
              <select
                value={(value[f.key] as string) ?? ""}
                onChange={(e) => onChange({ [f.key]: e.target.value })}
                className="w-full rounded-md border border-gb-border bg-white px-3 py-2 text-sm text-gb-black"
              >
                {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                value={(value[f.key] as string) ?? ""}
                onChange={(e) => onChange({ [f.key]: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-gb-border bg-white px-3 py-2 text-sm text-gb-black"
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={(value[f.key] as string | number) ?? ""}
                onChange={(e) => onChange({ [f.key]: f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value })}
                className="w-full rounded-md border border-gb-border bg-white px-3 py-2 text-sm text-gb-black"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
