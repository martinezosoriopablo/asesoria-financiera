"use client";

import React, { useState } from "react";
import { Target, ClipboardList } from "lucide-react";
import RecomendacionPage from "./RecomendacionPage";
import RecomendacionConstruir from "./RecomendacionConstruir";

type Tab = "radiografia" | "construir";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "radiografia", label: "Radiografía", icon: Target },
  { id: "construir", label: "Construir recomendación", icon: ClipboardList },
];

export default function RecomendacionTabs({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState<Tab>("radiografia");

  return (
    <div>
      <div className="bg-white border-b border-gb-border">
        <div className="px-6 max-w-7xl mx-auto">
          <nav className="flex gap-1 py-2" aria-label="Tabs">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${active ? "bg-gb-black text-white" : "text-gb-gray hover:bg-gb-light hover:text-gb-black"}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {tab === "radiografia" ? (
        <RecomendacionPage clientId={clientId} />
      ) : (
        <div className="p-6 max-w-7xl mx-auto">
          <RecomendacionConstruir clientId={clientId} />
        </div>
      )}
    </div>
  );
}
