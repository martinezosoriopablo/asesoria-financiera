"use client";

import React from "react";
import Link from "next/link";
import { Check, AlertTriangle } from "lucide-react";
import { computeJourneySteps, type JourneyClient, type JourneyStep } from "@/lib/clients/journey";

function NodeCircle({ step, index }: { step: JourneyStep; index: number }) {
  const base = "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0";
  if (step.status === "done") {
    return <div className={`${base} bg-gb-success text-white`}><Check className="w-4 h-4" /></div>;
  }
  if (step.status === "current") {
    return <div className={`${base} bg-gb-primary text-white ring-4 ring-gb-primary/20`}>{index + 1}</div>;
  }
  return <div className={`${base} bg-gb-light text-gb-gray border border-gb-border`}>{index + 1}</div>;
}

export default function JourneyStepper({ client }: { client: JourneyClient }) {
  const steps = computeJourneySteps(client, new Date());
  const current = steps.find((s) => s.status === "current");

  return (
    <div className="bg-white rounded-lg border border-gb-border p-4 mb-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {steps.map((step, i) => (
              <React.Fragment key={step.key}>
                <Link href={step.href} className="flex flex-col items-center gap-1 px-2 group">
                  <NodeCircle step={step} index={i} />
                  <span className={`text-xs font-medium ${step.status === "pending" ? "text-gb-gray" : "text-gb-black"} group-hover:underline`}>
                    {step.label}
                  </span>
                  <span className="text-[10px] text-gb-gray flex items-center gap-0.5">
                    {step.warn && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                    {step.detail}
                  </span>
                </Link>
                {i < steps.length - 1 && (
                  <div className={`h-0.5 w-8 shrink-0 ${step.status === "done" ? "bg-gb-success" : "bg-gb-border"}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="shrink-0">
          {current ? (
            <Link
              href={current.href}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white bg-gb-primary hover:bg-gb-primary/90 transition-colors"
            >
              Continuar → {current.label}
            </Link>
          ) : (
            <Link
              href={`/clients/${client.id}/seguimiento`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-gb-success bg-green-50 hover:bg-green-100 transition-colors"
            >
              <Check className="w-4 h-4" /> Todo al día
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
