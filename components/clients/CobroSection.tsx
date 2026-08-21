// components/clients/CobroSection.tsx
"use client";
import { useState } from "react";
import Card from "@/components/shared/Card";
import Button from "@/components/shared/Button";
import Input from "@/components/shared/Input";
import { estimateAnnualRevenue } from "@/lib/fees/estimate";
import type { Client } from "@/components/clients/hooks/useClientData";

const TIPOS = [
  { value: "", label: "— sin configurar —" },
  { value: "agf", label: "AGF (rebate)" },
  { value: "corredora", label: "Corredora (advisory fee)" },
  { value: "mixto", label: "Mixto" },
];

function fmt(n: number | null, currency = "CLP"): string {
  if (n == null) return "— sin configurar —";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export default function CobroSection({ client, onSaved }: { client: Client; onSaved?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cobro_tipo: client.cobro_tipo ?? "",
    rebate_pct: client.rebate_pct ?? "",
    advisory_fee_pct: client.advisory_fee_pct ?? "",
    comision_transaccion_pct: client.comision_transaccion_pct ?? "",
  });

  const base = client.patrimonio_estimado ?? null;
  const estimado = estimateAnnualRevenue(
    { advisory_fee_pct: Number(form.advisory_fee_pct) || null, rebate_pct: Number(form.rebate_pct) || null },
    base
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cobro_tipo: form.cobro_tipo || null,
          rebate_pct: form.rebate_pct === "" ? null : Number(form.rebate_pct),
          advisory_fee_pct: form.advisory_fee_pct === "" ? null : Number(form.advisory_fee_pct),
          comision_transaccion_pct: form.comision_transaccion_pct === "" ? null : Number(form.comision_transaccion_pct),
        }),
      });
      if (res.ok) {
        setEditing(false);
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Cobro" className="mb-6" action={
      !editing ? <button onClick={() => setEditing(true)} className="text-xs font-semibold text-gb-info hover:underline">Editar</button> : undefined
    }>
      {!editing ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-gb-gray text-xs">Tipo de cobro</p><p className="text-gb-black font-medium">{TIPOS.find(t => t.value === (client.cobro_tipo ?? ""))?.label}</p></div>
          <div><p className="text-gb-gray text-xs">Advisory fee</p><p className="text-gb-black font-medium">{client.advisory_fee_pct != null ? `${client.advisory_fee_pct}%` : "— sin configurar —"}</p></div>
          <div><p className="text-gb-gray text-xs">Rebate</p><p className="text-gb-black font-medium">{client.rebate_pct != null ? `${client.rebate_pct}%` : "— sin configurar —"}</p></div>
          <div><p className="text-gb-gray text-xs">Comisión transacción</p><p className="text-gb-black font-medium">{client.comision_transaccion_pct != null ? `${client.comision_transaccion_pct}% por operación` : "— sin configurar —"}</p></div>
          <div className="col-span-2 border-t border-gb-border pt-3 mt-1">
            <p className="text-gb-gray text-xs">Ingreso anual estimado <span className="text-gb-gray">(sobre patrimonio estimado)</span></p>
            <p className="text-lg font-semibold text-gb-primary">{fmt(estimateAnnualRevenue({ advisory_fee_pct: client.advisory_fee_pct, rebate_pct: client.rebate_pct }, base))}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-gb-gray">Tipo de cobro
            <select value={form.cobro_tipo} onChange={(e) => setForm({ ...form, cobro_tipo: e.target.value })}
              className="mt-1 w-full rounded-md border border-gb-border px-3 py-2 text-sm text-gb-black focus:border-gb-primary focus:outline-none">
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Advisory fee %" name="advisory_fee_pct" type="number" step="0.01" value={form.advisory_fee_pct} onChange={(e) => setForm({ ...form, advisory_fee_pct: e.target.value })} />
            <Input label="Rebate %" name="rebate_pct" type="number" step="0.01" value={form.rebate_pct} onChange={(e) => setForm({ ...form, rebate_pct: e.target.value })} />
            <Input label="Comisión tx %" name="comision_transaccion_pct" type="number" step="0.01" value={form.comision_transaccion_pct} onChange={(e) => setForm({ ...form, comision_transaccion_pct: e.target.value })} />
          </div>
          <p className="text-xs text-gb-gray">Ingreso anual estimado: <span className="font-semibold text-gb-primary">{fmt(estimado)}</span> (advisory + rebate sobre patrimonio estimado; la comisión de transacción no se anualiza).</p>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
