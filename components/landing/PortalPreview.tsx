"use client";

import { useEffect, useRef } from "react";
import { useScrollReveal } from "./useScrollReveal";

function PortalChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function draw() {
      const w = c!.getBoundingClientRect().width;
      const h = 150;
      c!.width = w * dpr;
      c!.height = h * dpr;
      const x = c!.getContext("2d")!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);

      const n = 46;
      const v: number[] = [];
      let val = 50, s = 9;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      for (let i = 0; i < n; i++) { val += Math.sin(i * 0.4) * 1.4 + (i / n) * 1.5 + (rnd() - 0.4); v.push(val); }

      const mn = Math.min(...v), mx = Math.max(...v), pad = 6, gw = w - pad * 2, gh = h - pad * 2;
      const X = (i: number) => pad + (i / (n - 1)) * gw;
      const Y = (q: number) => pad + gh - ((q - mn) / (mx - mn)) * gh;

      x.beginPath(); x.moveTo(X(0), Y(v[0]));
      for (let i = 1; i < n; i++) x.lineTo(X(i), Y(v[i]));
      x.strokeStyle = "#5AA0E6"; x.lineWidth = 2; x.stroke();
      x.lineTo(X(n - 1), h); x.lineTo(X(0), h); x.closePath();
      const grd = x.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "rgba(90,160,230,.3)");
      grd.addColorStop(1, "rgba(90,160,230,0)");
      x.fillStyle = grd; x.fill();
    }

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);

  return <canvas ref={canvasRef} className="w-full block" height={150} />;
}

const tiles = [
  { label: "Rentab. YTD", value: "+12,4%", cls: "up" },
  { label: "Mercados", value: "+40", cls: "" },
  { label: "Fondos", value: "+200K", cls: "gd" },
  { label: "Update", value: "Diario", cls: "" },
];

export default function PortalPreview() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="portal" className="py-[100px]" style={{ background: "#05162C" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`text-center max-w-[720px] mx-auto mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Tu portal
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Tu patrimonio, siempre a la vista
          </h2>
        </div>

        <div
          className="max-w-[760px] mx-auto rounded-xl overflow-hidden"
          style={{
            background: "#060D18",
            border: "1px solid rgba(255,255,255,.09)",
            fontFamily: "var(--font-data)",
            boxShadow: "0 30px 60px rgba(0,0,0,.4)",
          }}
        >
          {/* Title bar */}
          <div
            className="flex items-center gap-2 px-4 py-[11px]"
            style={{ borderBottom: "1px solid rgba(255,255,255,.09)", background: "#04101e" }}
          >
            <div className="flex gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,.22)" }} />
              <i className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,.22)" }} />
              <i className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,.22)" }} />
            </div>
            <span className="ml-2 text-xs" style={{ color: "#7E93AD" }}>Global · Portal de clientes</span>
          </div>

          {/* Body */}
          <div
            className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr]"
            style={{ gap: "1px", background: "rgba(255,255,255,.09)" }}
          >
            <div className="p-[16px_18px]" style={{ background: "#060D18" }}>
              <div className="flex justify-between items-baseline mb-2.5 text-xs">
                <h4 className="text-[13px] font-semibold" style={{ color: "#cdd9ea" }}>Tu portafolio</h4>
                <span className="font-semibold" style={{ color: "#2ECC8F" }}>▲ +12,4% YTD</span>
              </div>
              <PortalChart />
            </div>
            <div
              className="grid grid-cols-2"
              style={{ gap: "1px", background: "rgba(255,255,255,.09)", borderTop: "1px solid rgba(255,255,255,.09)" }}
            >
              {tiles.map((t) => (
                <div key={t.label} className="p-[13px_16px]" style={{ background: "#060D18" }}>
                  <div className="text-[11px]" style={{ color: "#7E93AD" }}>{t.label}</div>
                  <div
                    className="text-[22px] mt-0.5"
                    style={{
                      fontFamily: "var(--font-display)",
                      color: t.cls === "up" ? "#2ECC8F" : t.cls === "gd" ? "#E3B877" : "#dfe7f1",
                    }}
                  >
                    {t.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-[13px] mt-3.5" style={{ color: "#9DB0CA" }}>
          Vista ilustrativa. Tu portal se actualiza diariamente desde feeds institucionales.
        </p>
      </div>
    </section>
  );
}
