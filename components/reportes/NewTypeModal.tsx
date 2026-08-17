"use client";
import { useState } from "react";

const SCOPES = ["date", "period", "month", "perfil"];
const USOS = ["distribucion", "insumo_cartera", "insumo_cierre"];
const FMTS = ["html", "json", "pdf", "mp3"];

export default function NewTypeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState("date");
  const [usos, setUsos] = useState<string[]>([]);
  const [fmts, setFmts] = useState<string[]>(["html"]);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const submit = async () => {
    const res = await fetch("/api/report-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label, scope_key: scope, default_usos: usos, formatos: fmts }),
    }).then((r) => r.json());
    if (res.success) onDone();
    else setErr(res.error);
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Nuevo tipo de reporte</h3>
        <input placeholder="id (snake_case)" value={id} onChange={(e) => setId(e.target.value)} className="border rounded px-2 py-1 w-full mb-2" />
        <input placeholder="Etiqueta" value={label} onChange={(e) => setLabel(e.target.value)} className="border rounded px-2 py-1 w-full mb-2" />
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="border rounded px-2 py-1 w-full mb-2">
          {SCOPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="text-sm mb-1">Usos por defecto</div>
        <div className="flex gap-3 mb-2">
          {USOS.map((u) => (
            <label key={u} className="text-sm flex gap-1">
              <input type="checkbox" checked={usos.includes(u)} onChange={() => toggle(usos, setUsos, u)} />
              {u}
            </label>
          ))}
        </div>
        <div className="text-sm mb-1">Formatos</div>
        <div className="flex gap-3 mb-2">
          {FMTS.map((f) => (
            <label key={f} className="text-sm flex gap-1">
              <input type="checkbox" checked={fmts.includes(f)} onChange={() => toggle(fmts, setFmts, f)} />
              {f}
            </label>
          ))}
        </div>
        {err && <div className="text-sm text-gb-danger mb-2">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
          <button onClick={submit} className="px-3 py-1.5 text-sm bg-gb-primary text-white rounded">Crear</button>
        </div>
      </div>
    </div>
  );
}
