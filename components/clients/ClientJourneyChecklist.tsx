"use client";
import Link from "next/link";
import Card from "@/components/shared/Card";
import { computeJourneySteps, type JourneyClient } from "@/lib/journey/steps";

interface Props {
  client: JourneyClient & { id: string; email?: string | null };
}

// CTA por paso (href al MISMO cliente por id). El paso "perfil" ofrece dos accesos.
function ctaHref(key: string, client: Props["client"]): { href: string; label: string }[] {
  switch (key) {
    case "datos": return [{ href: `/clients/${client.id}`, label: "Editar" }];
    case "perfil": return [
      { href: `/analisis-cartola?client=${encodeURIComponent(client.email ?? "")}`, label: "Enviar cuestionario" },
      { href: `/clients/${client.id}#riesgo`, label: "Estimar a mano" },
    ];
    case "cartola": return [{ href: `/clients/${client.id}/seguimiento`, label: "Subir cartola" }];
    case "recomendacion": return [{ href: `/recomendacion/${client.id}`, label: "Generar propuesta" }];
    case "comparar": return [{ href: `/clients/${client.id}/seguimiento`, label: "Comparar ideal vs actual" }];
    default: return [];
  }
}

export default function ClientJourneyChecklist({ client }: Props) {
  const steps = computeJourneySteps(client);
  const doneCount = steps.filter((s) => s.done).length;
  const complete = doneCount === steps.length;

  return (
    <Card title={complete ? "Journey completo ✓" : "Journey del cliente"} className="mb-6"
      action={<span className="text-xs text-gb-gray tabular-nums">{doneCount} de {steps.length}</span>}>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => {
          const ctas = ctaHref(s.key, client);
          return (
            <li key={s.key} className={`flex items-center gap-3 rounded-md border p-3 ${s.isNext ? "border-gb-primary bg-gb-primary-light/40" : "border-gb-border"}`}>
              <span className={`w-6 h-6 shrink-0 grid place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-gb-success text-white" : "bg-background text-gb-gray border border-gb-border"}`}>
                {s.done ? "✓" : i + 1}
              </span>
              <span className={`flex-1 text-sm ${s.done ? "text-gb-gray line-through" : "text-gb-black font-medium"}`}>{s.label}</span>
              <span className="flex gap-2">
                {ctas.map((c, j) => (
                  <Link key={c.href} href={c.href}
                    className={`text-xs font-semibold rounded-[3px] px-3 py-1.5 transition-colors ${s.isNext && j === 0 ? "bg-gb-black text-white hover:bg-gb-dark" : "text-gb-info hover:bg-gb-light border border-gb-border"}`}>
                    {c.label}
                  </Link>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
