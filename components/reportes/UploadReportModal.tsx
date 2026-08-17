"use client";
import { useState } from "react";

const PERFILES = ["conservador", "moderado_conservador", "moderado", "moderado_agresivo", "agresivo"];
const USOS = [
  ["distribucion", "Distribución"],
  ["insumo_cartera", "Insumo cartera"],
  ["insumo_cierre", "Insumo cierre"],
] as const;

interface TypeRow { id: string; label: string; scope_key: string; default_usos: string[]; formatos: string[]; }

export default function UploadReportModal({ type, onClose, onDone }: {
  type: TypeRow; onClose: () => void; onDone: () => void;
}) {
  const [reportDate, setReportDate] = useState("");
  const [period, setPeriod] = useState(""); // am/pm
  const [month, setMonth] = useState(""); // YYYY-MM
  const [perfil, setPerfil] = useState("");
  const [html, setHtml] = useState("");
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [json, setJson] = useState("");
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [mp3, setMp3] = useState<File | null>(null);
  const [usos, setUsos] = useState<string[]>(type.default_usos);
  const [usosTouched, setUsosTouched] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const has = (f: string) => type.formatos.includes(f);
  const sk = type.scope_key;

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("type", type.id);
    if (sk === "month") fd.append("period", month);
    else {
      if (reportDate) fd.append("report_date", reportDate);
      if (sk === "period") fd.append("period", period);
      if (sk === "perfil") fd.append("perfil", perfil);
    }
    if (has("html")) {
      if (htmlFile) fd.append("html", htmlFile);          // archivo tiene prioridad
      else if (html.trim()) fd.append("html", html);       // fallback: texto pegado
    }
    if (has("json")) {
      if (jsonFile) fd.append("payload", jsonFile);        // archivo tiene prioridad
      else if (json.trim()) fd.append("payload", json);    // fallback: texto pegado
    }
    if (has("pdf") && pdf) fd.append("pdf", pdf);
    if (has("mp3") && mp3) fd.append("mp3", mp3);
    if (usosTouched) fd.append("usos", JSON.stringify(usos));
    const res = await fetch("/api/reports", { method: "POST", body: fd }).then((r) => r.json());
    setBusy(false);
    if (!res.success) {
      setMsg(`Error: ${res.error}`);
      return;
    }
    if (res.warning) {
      setMsg(`⚠ ${res.warning}`);
      setTimeout(onDone, 1500);
      return;
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-5 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Subir · {type.label}</h3>
        {(sk === "date" || sk === "period" || sk === "perfil") && (
          <label className="block text-sm mb-2">
            Fecha
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="block border rounded px-2 py-1 w-full" />
          </label>
        )}
        {sk === "period" && (
          <label className="block text-sm mb-2">
            Período
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="block border rounded px-2 py-1 w-full">
              <option value="">—</option>
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
          </label>
        )}
        {sk === "month" && (
          <label className="block text-sm mb-2">
            Mes
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="block border rounded px-2 py-1 w-full" />
          </label>
        )}
        {sk === "perfil" && (
          <label className="block text-sm mb-2">
            Perfil
            <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className="block border rounded px-2 py-1 w-full">
              <option value="">—</option>
              {PERFILES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
        {has("html") && (
          <div className="mb-2">
            <label className="block text-sm">
              HTML — subir archivo
              <input
                type="file"
                accept=".html,.htm,text/html"
                onChange={(e) => setHtmlFile(e.target.files?.[0] ?? null)}
                className="block w-full mt-1"
              />
            </label>
            {htmlFile ? (
              <p className="text-xs text-gb-gray mt-1">Se usará el archivo: <span className="font-medium">{htmlFile.name}</span></p>
            ) : (
              <label className="block text-sm mt-2">
                <span className="text-gb-gray">o pega el HTML</span>
                <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={4} className="block border rounded px-2 py-1 w-full font-mono text-xs" />
              </label>
            )}
          </div>
        )}
        {has("json") && (
          <div className="mb-2">
            <label className="block text-sm">
              JSON — subir archivo
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
                className="block w-full mt-1"
              />
            </label>
            {jsonFile ? (
              <p className="text-xs text-gb-gray mt-1">Se usará el archivo: <span className="font-medium">{jsonFile.name}</span></p>
            ) : (
              <label className="block text-sm mt-2">
                <span className="text-gb-gray">o pega el JSON</span>
                <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={4} className="block border rounded px-2 py-1 w-full font-mono text-xs" />
              </label>
            )}
          </div>
        )}
        {has("pdf") && (
          <label className="block text-sm mb-2">
            PDF
            <input type="file" accept=".pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className="block w-full" />
          </label>
        )}
        {has("mp3") && (
          <label className="block text-sm mb-2">
            MP3
            <input type="file" accept=".mp3" onChange={(e) => setMp3(e.target.files?.[0] ?? null)} className="block w-full" />
          </label>
        )}
        <div className="flex gap-3 my-3">
          {USOS.map(([id, label]) => (
            <label key={id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={usos.includes(id)}
                onChange={() => {
                  setUsosTouched(true);
                  setUsos((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
                }}
              />
              {label}
            </label>
          ))}
        </div>
        {msg && <div className="text-sm mb-2 text-amber-700">{msg}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
          <button onClick={submit} disabled={busy} className="px-3 py-1.5 text-sm bg-gb-primary text-white rounded">
            {busy ? "Subiendo…" : "Subir"}
          </button>
        </div>
      </div>
    </div>
  );
}
