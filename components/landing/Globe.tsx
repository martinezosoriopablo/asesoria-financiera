"use client";

import { useEffect, useRef } from "react";
import globeData from "./globe-data.json";

const PTS = globeData.PTS as number[][];
const EX = globeData.EX as { n: string; p: number[]; home?: number }[];
const TILT = -0.32;

function rot(p: number[], a: number): [number, number, number] {
  const [x, y, z] = p;
  const y1 = y * Math.cos(TILT) - z * Math.sin(TILT);
  const z1 = y * Math.sin(TILT) + z * Math.cos(TILT);
  const x2 = x * Math.cos(a) + z1 * Math.sin(a);
  const z2 = -x * Math.sin(a) + z1 * Math.cos(a);
  return [x2, y1, z2];
}

export default function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W: number, H: number, cx: number, cy: number, R: number;
    let ang = 2.0;
    let rafId: number;

    function size() {
      const r = cvs!.getBoundingClientRect();
      W = r.width; H = r.height; cx = W / 2; cy = H / 2;
      R = Math.min(W, H) * 0.44;
      cvs!.width = W * dpr; cvs!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame() {
      ctx!.clearRect(0, 0, W, H);

      for (let k = 0; k < PTS.length; k++) {
        const p = PTS[k];
        const rr = rot(p, ang);
        if (rr[2] < -0.04) continue;
        const sx = cx - rr[0] * R;
        const sy = cy - rr[1] * R;
        const d = (rr[2] + 1) / 2;
        ctx!.beginPath();
        ctx!.arc(sx, sy, p[3] ? 0.7 + d * 1.5 : 0.6 + d * 0.7, 0, 6.283);
        ctx!.fillStyle = p[3]
          ? `rgba(208,131,76,${(0.25 + d * 0.7).toFixed(2)})`
          : `rgba(95,150,205,${(0.05 + d * 0.13).toFixed(2)})`;
        ctx!.fill();
      }

      ctx!.font = '600 12px "Hanken Grotesk",sans-serif';
      ctx!.textBaseline = "middle";
      const vis: { e: typeof EX[0]; sx: number; sy: number; d: number }[] = [];
      for (const e of EX) {
        if (e.n === "Nasdaq") continue;
        const rr = rot(e.p, ang);
        if (rr[2] < -0.02) continue;
        vis.push({ e, sx: cx - rr[0] * R, sy: cy - rr[1] * R, d: (rr[2] + 1) / 2 });
      }
      vis.sort((a, b) => b.d - a.d);

      const placed: { x: number; y: number; w: number; h: number }[] = [];
      for (const v of vis) {
        const col = v.e.home ? "#E3B877" : "#7ab4ee";
        ctx!.beginPath(); ctx!.arc(v.sx, v.sy, v.e.home ? 4 : 3, 0, 6.283);
        ctx!.fillStyle = col; ctx!.fill();
        ctx!.beginPath(); ctx!.arc(v.sx, v.sy, 7, 0, 6.283);
        ctx!.strokeStyle = col + "99"; ctx!.lineWidth = 1; ctx!.stroke();
        if (v.d > 0.5) {
          const a = Math.min(1, (v.d - 0.5) / 0.2);
          const tw = ctx!.measureText(v.e.n).width;
          const lx = v.sx + 11, ly = v.sy;
          const rc = { x: lx - 3, y: ly - 9, w: tw + 6, h: 18 };
          const ov = placed.some(
            (p) => !(rc.x > p.x + p.w || rc.x + rc.w < p.x || rc.y > p.y + p.h || rc.y + rc.h < p.y)
          );
          if (!ov) {
            ctx!.fillStyle = (v.e.home ? "rgba(227,184,119," : "rgba(225,232,244,") + a.toFixed(2) + ")";
            ctx!.fillText(v.e.n, lx, ly);
            placed.push(rc);
          }
        }
      }

      if (!reduce) {
        ang -= 0.0011;
        rafId = requestAnimationFrame(frame);
      }
    }

    size();
    frame();
    const onResize = () => { size(); if (reduce) frame(); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full aspect-square relative z-[1]" style={{ maxWidth: 500 }} />;
}
