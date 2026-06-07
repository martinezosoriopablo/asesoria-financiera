# Greybark Advisors

Plataforma de asesoria financiera para asesores independientes en Chile. Permite gestionar clientes, perfilar riesgo, analizar cartolas, diseñar portafolios y generar reportes profesionales.

## Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Estilos:** Tailwind CSS v4
- **Deploy:** Vercel
- **AI:** Claude (analisis, reportes) + Gemini 2.5 Flash (extraccion fichas PDF)
- **Email:** Resend
- **Datos:** CMF, Fintual API, Yahoo Finance, AAFM

## Desarrollo

```bash
npm install
npm run dev          # Servidor de desarrollo (localhost:3000)
npm run build        # Build de produccion
npm run lint         # ESLint
npm run test:run     # Tests (Vitest)
```

## Estructura

```
app/                 # Next.js App Router (pages + API routes)
app/api/             # ~112 API route handlers
app/(portal)/        # Portal del cliente
components/          # React components por dominio
lib/                 # Utilidades, logica de negocio, integraciones
lib/auth/            # Autenticacion (API routes + portal)
lib/returns/         # Calculadora de retornos simples
lib/risk/            # Scoring de riesgo, benchmarks, cuestionario
lib/ficha-extract.ts # Extraccion de fichas CMF (Gemini + regex)
supabase/migrations/ # Migraciones SQL
scripts/             # Scripts one-off
docs/                # Documentacion del proyecto
```

## Roles

- **Asesor** (`/advisor/*`, `/clients/*`, `/portfolio-designer`, `/fund-center`) — gestion de clientes y herramientas
- **Cliente** (`/portal/*`) — portal informativo, perfil de riesgo, mensajeria

## Documentacion

- `CLAUDE.md` — Guia tecnica para desarrollo
- `docs/GREYBARK-ARCHITECTURE.md` — Arquitectura completa del sistema
- `docs/ARQUITECTURA.md` — Mapa de rutas, APIs y componentes
- `docs/INSTRUCTIVO_PLATAFORMA.md` — Manual de uso para asesores
- `docs/INTENCION.md` — Documento de intencion del producto
