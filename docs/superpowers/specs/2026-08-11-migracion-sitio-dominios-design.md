# Migración del sitio de marketing a dominios de producción (NIC Chile)

**Fecha:** 2026-08-11
**Estado:** Diseño aprobado (A–E + F1) — pendiente plan de implementación

## Objetivo

Publicar el sitio de marketing (6 HTML estáticos en `public/`) en sus dominios
definitivos de NIC Chile, sirviendo cada división desde su propio dominio pero
manteniendo un único proyecto Vercel (mismo deploy que el CRM).

## Contexto actual (verificado 2026-08-11)

- Sitio en vivo en `asesoria-financiera.vercel.app` (Vercel, proyecto `asesoria-financiera`).
- 6 páginas autocontenidas en `public/`: `global-companies.html`, `global-wealth.html`,
  `global-planning.html`, `global-properties.html`, `global-markets.html`,
  `global-corporate.html`.
- `app/page.tsx` redirige `/` → `/global-companies.html` (redirect, cambia URL).
- `middleware.ts` corre en todo salvo estáticos (matcher excluye `.html`, `.pdf`, imágenes);
  hoy solo llama `updateSession` (Supabase).
- Nav en las páginas usa links **relativos** (`href="global-wealth.html"`).
- Botones Portal/Asesores usan rutas de path absolutas (`/portal/login`, `/login`).
- Hay `og:url` por página; **no** hay `<link rel="canonical">`.

## Dominios (NIC Chile, ya comprados)

| Dominio | Rol |
|---|---|
| `globalcompanies.cl` | Maestro / home / origen de auth |
| `globalwealth.cl` | División Wealth |
| `globalplanning.cl` | División Planning |
| `globalmarkets.cl` | División Markets |
| `globalpropierties.cl` | División Properties (**oficial**, aunque tiene typo "propierties") |
| `globalproperty.cl` | Alias de Properties → 301 al oficial |
| `globalcorporates.cl` | Página Corporate |

## Diseño

### A. Hosting
Un solo proyecto Vercel sirve sitio + CRM en el mismo origen (Opción A). Los 7 dominios
se agregan al mismo proyecto; el código diferencia por header `Host`. No se separa infra.

### B. Routing por host (`middleware.ts`)
Se mueve el redirect de `/` desde `app/page.tsx` a `middleware.ts`. Para el path raíz `/`,
según el `Host` se hace **rewrite** (URL se mantiene) a la página de la división:

| Host | Acción sobre `/` | Resultado |
|---|---|---|
| `globalcompanies.cl`, `www.globalcompanies.cl` | rewrite → `/global-companies.html` | URL `globalcompanies.cl/` |
| `globalwealth.cl` | rewrite → `/global-wealth.html` | URL `globalwealth.cl/` |
| `globalplanning.cl` | rewrite → `/global-planning.html` | URL `globalplanning.cl/` |
| `globalmarkets.cl` | rewrite → `/global-markets.html` | URL `globalmarkets.cl/` |
| `globalpropierties.cl` | rewrite → `/global-properties.html` | URL `globalpropierties.cl/` |
| `globalcorporates.cl` | rewrite → `/global-corporate.html` | URL `globalcorporates.cl/` |
| `globalproperty.cl` | **301** → `https://globalpropierties.cl/` | salta al oficial |
| `www.*` (resto) | **301** → apex | (se resuelve en Vercel) |
| host desconocido / preview de Vercel | rewrite → `/global-companies.html` | fallback maestro |

Detalles de implementación:
- El rewrite se aplica **solo** cuando `pathname === "/"`. Para cualquier otro path, el
  middleware sigue delegando en `updateSession` (Supabase) como hoy.
- `globalproperty.cl` se maneja con `NextResponse.redirect(301)` antes de `updateSession`.
- La normalización de host ignora el puerto y es case-insensitive; en local/preview
  (host no `.cl`) cae al fallback maestro, dejando el comportamiento actual intacto.
- `app/page.tsx` deja de redirigir a una página fija; el routing raíz queda en el middleware.
  (Se conserva un fallback mínimo por si el middleware no interviene.)
- `www` → apex se resuelve preferentemente en **Vercel → Domains** (marcar `www` como
  redirect al apex), no en el middleware.

### F1. Navegación entre divisiones (decisión tomada)
Los links del nav quedan **relativos** (sin cambios). Consecuencia aceptada: al navegar
de una división a otra dentro de un dominio, la URL refleja el path (p.ej.
`globalwealth.cl/global-markets.html`). Se descartó F2 (nav con dominios `.cl` absolutos)
por complejidad y por romper el preview local.

### C. Auth centralizado en el dominio maestro
En las 6 páginas, los botones **Portal Clientes** y **Acceso Asesores** pasan de
`/portal/login` y `/login` a absolutos:
- `https://globalcompanies.cl/portal/login`
- `https://globalcompanies.cl/login`

Así todo el login ocurre en un único origen. Evita fragmentar la sesión de Supabase entre
7 dominios y no obliga a listar 7 juegos de redirect URLs.
- Supabase → Auth → URL Configuration → **Site URL = `https://globalcompanies.cl`**.
- Caveat de dev: estos botones apuntan a producción; probar auth se hace en el CRM local
  aparte (no desde el sitio estático servido en local).

### D. SEO / canonical
En cada una de las 6 páginas:
- Agregar `<link rel="canonical" href="https://globalcompanies.cl/<página>.html">`.
- Ajustar `og:url` para que apunte al mismo canonical.

Consolida el contenido duplicado (misma página servida en 2 hosts) hacia la marca maestra.
Tradeoff aceptado: Google tenderá a mostrar `globalcompanies.cl`, no el dominio de división.
SEO independiente por dominio exigiría páginas dinámicas (fuera de alcance, YAGNI).

### E. DNS + Vercel (runbook manual del usuario)
Por cada dominio, en NIC Chile:
- `A` `@` → `76.76.21.21`
- `CNAME` `www` → `cname.vercel-dns.com`

En Vercel → proyecto `asesoria-financiera` → Settings → Domains:
- Agregar los 7 dominios (+ variantes `www`).
- Marcar `globalproperty.cl` y los `www` como *redirect* al apex/oficial.
- Esperar verificación DNS + emisión automática de certificados SSL (Let's Encrypt).

## Componentes que se tocan

| Unidad | Cambio | Interfaz / dependencia |
|---|---|---|
| `middleware.ts` | Routing por host para `/` (rewrite/redirect) + delega resto a `updateSession` | Lee `request.headers.get("host")`; usa `NextResponse.rewrite/redirect` |
| `app/page.tsx` | Deja de fijar el destino raíz (lo asume el middleware) | — |
| `public/global-*.html` (×6) | Botones auth → absolutos a `globalcompanies.cl`; `<link rel=canonical>`; `og:url` | HTML estático |
| Vercel Domains | Alta de 7 dominios + redirects | Dashboard (manual) |
| NIC Chile DNS | Registros A/CNAME por dominio | Panel NIC (manual) |
| Supabase Auth | Site URL = `globalcompanies.cl` | Dashboard (manual) |

## Fuera de alcance
- "Últimos retoques" de contenido/diseño previos al deploy (se listan y ejecutan aparte,
  antes de apuntar el DNS).
- SEO independiente por dominio (requeriría páginas dinámicas).
- Separar el sitio estático a un hosting aparte (Opción B, descartada).

## Criterios de éxito
1. Cada dominio de división carga su página correspondiente manteniendo su propia URL.
2. `globalproperty.cl` redirige 301 a `globalpropierties.cl`.
3. `www.*` redirige al apex; todos con HTTPS válido.
4. Portal/Asesores desde cualquier dominio llevan al login en `globalcompanies.cl` y la
   sesión funciona.
5. Local/preview mantienen el comportamiento actual (fallback a la home maestra).
