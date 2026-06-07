# Landing Global — Visual Design Spec (Premium Dark)

**Goal:** Rediseñar visualmente la landing de Global (ya funcional en `app/(public)/page.tsx`) con estilo Premium Dark para la presentación del jueves.

**Scope:** Solo cambios visuales (Tailwind classes). Misma estructura de 7 secciones, mismo contenido, mismos links. Sin dependencias nuevas.

---

## Paleta de colores

| Elemento | Color | Tailwind |
|----------|-------|----------|
| Fondo base | `#0f172a` | `bg-slate-900` |
| Fondo alterno | `#1e293b` | `bg-slate-800` |
| Fondo footer | `#020617` | `bg-slate-950` |
| Acento primario | `#2563eb` | `bg-blue-600` |
| Texto primario | `#ffffff` | `text-white` |
| Texto secundario | `rgba(255,255,255,0.6)` | `text-white/60` |
| Texto terciario | `rgba(255,255,255,0.4)` | `text-white/40` |
| Bordes | `rgba(255,255,255,0.08)` | `border-white/[0.08]` |
| Card fondo | `rgba(255,255,255,0.04)` | `bg-white/[0.04]` |

## Sección 1: Navbar fijo

- Fondo: `bg-slate-900/95 backdrop-blur-sm`
- Borde inferior: `border-white/[0.08]`
- Logo: "Global" en `text-white font-bold text-xl`
- Links scroll: `text-white/60 hover:text-white`
- Botón "Portal Clientes": borde `border-white/20`, texto blanco
- Botón "Acceso Asesores": `bg-blue-600 text-white`
- Mobile: solo los dos botones

## Sección 2: Hero

- Fondo: `bg-gradient-to-br from-slate-900 via-[#1e3a5f] to-slate-900`
- Elementos decorativos: 2-3 círculos grandes con `border border-white/[0.06]` posicionados absolutos
- Pre-título: "GLOBAL" en `text-white/50 tracking-[0.2em] text-sm font-semibold`
- Headline: `text-4xl md:text-5xl lg:text-6xl font-bold text-white`
- Subtítulo: `text-lg text-white/60`
- CTA primario: `bg-blue-600 text-white` con hover
- CTA secundario: `border border-white/30 text-white`

## Sección 3: Servicios (4 cards)

- Fondo sección: `bg-slate-900`
- Título sección: "Nuestros servicios" con label `text-white/40 uppercase tracking-widest text-xs` arriba
- Grid: `grid sm:grid-cols-2 lg:grid-cols-4 gap-6`
- Cada card: `bg-white/[0.04] border border-white/[0.08] rounded-xl p-6`
- Icono: círculo con fondo tenue del color del servicio + icono Lucide
  - Financiera: `bg-blue-500/15 text-blue-400`
  - Seguros: `bg-emerald-500/15 text-emerald-400`
  - Tributaria: `bg-amber-500/15 text-amber-400`
  - Inmobiliaria: `bg-purple-500/15 text-purple-400`
- Título card: `text-white font-semibold`
- Descripción: `text-white/40 text-sm`

## Sección 4: Diferenciadores

- Fondo sección: `bg-slate-800`
- 3 columnas centradas
- Icono: `w-14 h-14` círculo con `bg-blue-500/10 border border-blue-500/20` + icono `text-blue-400`
- Título: `text-white font-semibold`
- Descripción: `text-white/50 text-sm`

## Sección 5: Como funciona

- Fondo sección: `bg-slate-900`
- 3 pasos con número en `bg-blue-600 text-white` círculo sólido
- Título: `text-white font-semibold`
- Descripción: `text-white/50 text-sm`

## Sección 6: CTA final

- Fondo: `bg-slate-800`
- Headline: `text-white font-bold text-3xl`
- Subtítulo: `text-white/60`
- Mismos dos botones que navbar

## Sección 7: Footer

- Fondo: `bg-slate-950`
- Logo: "Global" en `text-white font-bold`
- Texto columnas: `text-white/40`
- Links: `text-white/40 hover:text-white`
- Divider: `border-white/[0.08]`
- Copyright: `text-white/30`

---

## Archivos a modificar

1. `app/(public)/page.tsx` — rewrite visual completo (mismo contenido, nuevas classes)
2. `app/page.tsx` — sin cambios (re-export)

## Criterios de éxito

- Estilo Premium Dark consistente en todas las secciones
- Alternancia de fondos `slate-900` / `slate-800` para ritmo visual
- Cards con bordes y fondos sutiles, no planos
- Hero con elementos decorativos geométricos
- Responsive: mobile 1 col, desktop 2-4 cols
- Sin dependencias nuevas — solo Tailwind + Lucide
