// components/clients/patrimonio/PatrimonioSection.tsx
"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Loader, Plus, Trash2, Wallet } from "lucide-react";
import { GRUPOS } from "./schemas";
import PatrimonioForm from "./PatrimonioForm";
import { EntidadKey } from "@/lib/patrimonio/entidades";

type Item = Record<string, unknown> & { id: string; tipo: string };
type Data = Record<EntidadKey, Item[]>;

export default function PatrimonioSection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Data>({ seguros: [], inmuebles: [], activos: [] });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ entidad: EntidadKey; value: Record<string, unknown> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/patrimonio`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData({ seguros: d.seguros, inmuebles: d.inmuebles, activos: d.activos }); })
      .finally(() => setLoading(false));
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const startNew = (entidad: EntidadKey) => {
    const g = GRUPOS.find((x) => x.key === entidad)!;
    setErr(null);
    setDraft({ entidad, value: { tipo: g.tipos[0].value, ...(g.defaults ?? {}) } });
  };
  const startEdit = (entidad: EntidadKey, item: Item) => { setErr(null); setDraft({ entidad, value: { ...item } }); };

  const save = async () => {
    if (!draft) return;
    setSaving(true); setErr(null);
    const isEdit = typeof draft.value.id === "string";
    const url = isEdit
      ? `/api/clients/${clientId}/patrimonio/${draft.entidad}/${draft.value.id}`
      : `/api/clients/${clientId}/patrimonio/${draft.entidad}`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.value),
    });
    const j = await res.json();
    setSaving(false);
    if (!j.success) { setErr(j.error ?? "Error al guardar"); return; }
    setDraft(null); load();
  };

  const remove = async (entidad: EntidadKey, itemId: string) => {
    await fetch(`/api/clients/${clientId}/patrimonio/${entidad}/${itemId}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="rounded-lg border border-gb-border border-l-4 border-l-gb-primary bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-gb-black">
        <Wallet className="h-4 w-4 text-gb-primary" /> Patrimonio
      </h2>

      {loading ? (
        <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin text-gb-gray" /></div>
      ) : (
        GRUPOS.map((g) => {
          const items = data[g.key];
          return (
            <div key={g.key} className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <span>{g.icono}</span>
                <h3 className="text-sm font-bold text-gb-black">{g.titulo}</h3>
                <span className="text-xs text-gb-gray">{items.length}</span>
                <button onClick={() => startNew(g.key)}
                  className="ml-auto flex items-center gap-1 rounded-md border border-dashed border-gb-primary px-2.5 py-1 text-xs font-semibold text-gb-primary">
                  <Plus className="h-3 w-3" /> Agregar
                </button>
              </div>

              {items.map((it) => {
                const editing = draft?.entidad === g.key && draft.value.id === it.id;
                if (editing) return <EditorCard key={it.id} grupo={g} draft={draft!} setDraft={setDraft} save={save} saving={saving} err={err} onCancel={() => setDraft(null)} />;
                return (
                  <div key={it.id} className="mb-2 flex items-center gap-3 rounded-lg border border-gb-border px-3 py-2.5">
                    <span className="rounded-full bg-gb-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase text-gb-primary">
                      {g.tipos.find((t) => t.value === it.tipo)?.label ?? it.tipo}
                    </span>
                    <span className="text-sm font-semibold text-gb-black">
                      {(it.etiqueta as string) || (it.compania as string) || (it.institucion as string) || "—"}
                    </span>
                    <button onClick={() => startEdit(g.key, it)} className="ml-auto text-xs font-semibold text-gb-info">Editar</button>
                    <button onClick={() => remove(g.key, it.id)} className="text-gb-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}

              {draft?.entidad === g.key && !draft.value.id && (
                <EditorCard grupo={g} draft={draft} setDraft={setDraft} save={save} saving={saving} err={err} onCancel={() => setDraft(null)} />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function EditorCard({ grupo, draft, setDraft, save, saving, err, onCancel }: {
  grupo: (typeof GRUPOS)[number];
  draft: { entidad: EntidadKey; value: Record<string, unknown> };
  setDraft: (d: { entidad: EntidadKey; value: Record<string, unknown> }) => void;
  save: () => void; saving: boolean; err: string | null; onCancel: () => void;
}) {
  const patch = (p: Record<string, unknown>) => setDraft({ entidad: draft.entidad, value: { ...draft.value, ...p } });
  return (
    <div className="mb-2 rounded-lg border border-gb-primary p-3">
      <div className="mb-3">
        <label className="mb-1 block text-[10.5px] font-semibold text-gb-gray">Tipo</label>
        <select value={draft.value.tipo as string} onChange={(e) => patch({ tipo: e.target.value })}
          className="rounded-md border border-gb-border bg-white px-3 py-2 text-sm text-gb-black">
          {grupo.tipos.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <PatrimonioForm fields={grupo.fields} value={draft.value} onChange={patch} />
      {err && <p className="mt-2 text-xs text-gb-danger">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-gb-border px-3 py-1.5 text-xs font-semibold text-gb-gray">Cancelar</button>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1 rounded-md bg-gb-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {saving && <Loader className="h-3 w-3 animate-spin" />} Guardar
        </button>
      </div>
    </div>
  );
}
