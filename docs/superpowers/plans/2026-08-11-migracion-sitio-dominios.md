# Migración del sitio a dominios NIC Chile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir cada dominio de división desde su propia URL con un solo deploy Vercel, centralizando el login en `globalcompanies.cl`, y dejar el runbook de DNS/Vercel/Supabase listo para ejecutar.

**Architecture:** Routing por `Host` en `middleware.ts` que hace *rewrite* del path raíz `/` a la página estática de la división (URL intacta) o *301* para el alias `globalproperty.cl`. La lógica vive en una función pura testeable (`lib/site/host-routing.ts`). Los 12 HTML (6 ES + 6 EN) apuntan los botones de auth a `globalcompanies.cl` y ganan `<link rel="canonical">`. El DNS/Vercel/Supabase es un runbook manual.

**Tech Stack:** Next.js 16 middleware (Edge), Vitest, HTML estático en `public/`.

## Global Constraints

- Trabajar en una rama nueva partiendo de **`master`** (p.ej. `deploy/dominios-produccion`), **no** en `feat/repositorio-reportes` (es trabajo de reportes, no relacionado). El sitio solo llega a producción vía `master` (Vercel deploya master).
- Dominio oficial de Properties = **`globalpropierties.cl`** (con el typo "propierties"); `globalproperty.cl` → **301** a él.
- Login siempre en el origen maestro: botones apuntan a `https://globalcompanies.cl/portal/login` y `https://globalcompanies.cl/login`.
- El routing por host aplica **solo** a `pathname === "/"`. Cualquier otro path delega en `updateSession` (Supabase) sin cambios.
- Host desconocido (local, `*.vercel.app`, preview) → rewrite a `/global-companies.html` (mantiene el comportamiento actual).
- Nav queda **relativo** (decisión F1). No convertir el nav a dominios absolutos.
- Entorno OneDrive: el file-watcher de `next dev` a veces no toma cambios; si algo no se refleja en local, **reiniciar `npm run dev`** antes de re-debuggear.
- No tocar `app/page.tsx` (queda como fallback: redirige `/` → `/global-companies.html`).

---

### Task 1: Función pura de routing por host

**Files:**
- Create: `lib/site/host-routing.ts`
- Test: `lib/site/host-routing.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type HostRoute = { kind: "rewrite"; path: string } | { kind: "redirect"; url: string } | { kind: "pass" }`
  - `function normalizeHost(host: string | null): string`
  - `function resolveHostRoute(rawHost: string | null, pathname: string): HostRoute`

- [ ] **Step 1: Write the failing test**

```ts
// lib/site/host-routing.test.ts
import { describe, it, expect } from "vitest";
import { normalizeHost, resolveHostRoute } from "./host-routing";

describe("normalizeHost", () => {
  it("lowercases, strips port and www", () => {
    expect(normalizeHost("WWW.GlobalWealth.cl:3000")).toBe("globalwealth.cl");
  });
  it("handles null", () => {
    expect(normalizeHost(null)).toBe("");
  });
});

describe("resolveHostRoute", () => {
  it("passes through non-root paths", () => {
    expect(resolveHostRoute("globalwealth.cl", "/login")).toEqual({ kind: "pass" });
  });
  it("rewrites each division host at root", () => {
    expect(resolveHostRoute("globalwealth.cl", "/")).toEqual({ kind: "rewrite", path: "/global-wealth.html" });
    expect(resolveHostRoute("globalplanning.cl", "/")).toEqual({ kind: "rewrite", path: "/global-planning.html" });
    expect(resolveHostRoute("globalmarkets.cl", "/")).toEqual({ kind: "rewrite", path: "/global-markets.html" });
    expect(resolveHostRoute("globalpropierties.cl", "/")).toEqual({ kind: "rewrite", path: "/global-properties.html" });
    expect(resolveHostRoute("globalcorporates.cl", "/")).toEqual({ kind: "rewrite", path: "/global-corporate.html" });
    expect(resolveHostRoute("globalcompanies.cl", "/")).toEqual({ kind: "rewrite", path: "/global-companies.html" });
  });
  it("treats www the same as apex", () => {
    expect(resolveHostRoute("www.globalmarkets.cl", "/")).toEqual({ kind: "rewrite", path: "/global-markets.html" });
  });
  it("301-redirects the property alias", () => {
    expect(resolveHostRoute("globalproperty.cl", "/")).toEqual({ kind: "redirect", url: "https://globalpropierties.cl/" });
    expect(resolveHostRoute("www.globalproperty.cl", "/")).toEqual({ kind: "redirect", url: "https://globalpropierties.cl/" });
  });
  it("falls back to master home for unknown host", () => {
    expect(resolveHostRoute("asesoria-financiera.vercel.app", "/")).toEqual({ kind: "rewrite", path: "/global-companies.html" });
    expect(resolveHostRoute("localhost", "/")).toEqual({ kind: "rewrite", path: "/global-companies.html" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/site/host-routing.test.ts`
Expected: FAIL — `Cannot find module './host-routing'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/site/host-routing.ts
export type HostRoute =
  | { kind: "rewrite"; path: string }
  | { kind: "redirect"; url: string }
  | { kind: "pass" };

const DIVISION_BY_HOST: Record<string, string> = {
  "globalcompanies.cl": "/global-companies.html",
  "globalwealth.cl": "/global-wealth.html",
  "globalplanning.cl": "/global-planning.html",
  "globalmarkets.cl": "/global-markets.html",
  "globalpropierties.cl": "/global-properties.html",
  "globalcorporates.cl": "/global-corporate.html",
};

const REDIRECT_BY_HOST: Record<string, string> = {
  "globalproperty.cl": "https://globalpropierties.cl/",
};

const MASTER_HOME = "/global-companies.html";

export function normalizeHost(host: string | null): string {
  if (!host) return "";
  return host.split(":")[0].toLowerCase().replace(/^www\./, "");
}

export function resolveHostRoute(rawHost: string | null, pathname: string): HostRoute {
  if (pathname !== "/") return { kind: "pass" };
  const host = normalizeHost(rawHost);
  if (REDIRECT_BY_HOST[host]) return { kind: "redirect", url: REDIRECT_BY_HOST[host] };
  const page = DIVISION_BY_HOST[host];
  if (page) return { kind: "rewrite", path: page };
  return { kind: "rewrite", path: MASTER_HOME };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/site/host-routing.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/site/host-routing.ts lib/site/host-routing.test.ts
git commit -m "feat(deploy): routing por host para dominios de división (función pura)"
```

---

### Task 2: Cablear el routing en `middleware.ts`

**Files:**
- Modify: `middleware.ts:1-12` (todo el archivo)

**Interfaces:**
- Consumes: `resolveHostRoute` de `lib/site/host-routing.ts`; `updateSession` de `@/lib/supabase/middleware`.
- Produces: middleware que hace rewrite/redirect en `/` y delega el resto.

- [ ] **Step 1: Reemplazar el contenido de `middleware.ts`**

```ts
import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { resolveHostRoute } from "@/lib/site/host-routing";

export async function middleware(request: NextRequest) {
  const route = resolveHostRoute(request.headers.get("host"), request.nextUrl.pathname);

  if (route.kind === "redirect") {
    return NextResponse.redirect(route.url, 301);
  }

  if (route.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = route.path;
    return NextResponse.rewrite(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mov|html|pdf)$).*)",
  ],
};
```

- [ ] **Step 2: Reiniciar el dev server (gotcha OneDrive)**

Reiniciar `npm run dev` para que Next recargue el middleware. Esperar a que responda `http://localhost:3000/`.

- [ ] **Step 3: Verificar rewrite por host con curl (Host header)**

Run:
```bash
curl -s -H "Host: globalwealth.cl" http://localhost:3000/ | grep -o "Global Wealth" | head -1
curl -s -H "Host: globalmarkets.cl" http://localhost:3000/ | grep -o "Global Markets" | head -1
curl -s -H "Host: globalpropierties.cl" http://localhost:3000/ | grep -o "Global Properties" | head -1
```
Expected: cada comando imprime el nombre de la división correspondiente (contenido de esa página servido en `/`).

- [ ] **Step 4: Verificar el 301 del alias y el fallback**

Run:
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -H "Host: globalproperty.cl" http://localhost:3000/
curl -s -H "Host: localhost" http://localhost:3000/ | grep -o "Asesoría Patrimonial 360" | head -1
```
Expected: primera línea `301 https://globalpropierties.cl/`; segunda imprime `Asesoría Patrimonial 360` (fallback a home maestra).

- [ ] **Step 5: Confirmar que las rutas del CRM no se afectan**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login`
Expected: `200` (la página de login del asesor sigue respondiendo; el middleware delegó a `updateSession` por no ser `/`).

- [ ] **Step 6: Commit**

```bash
git add middleware.ts
git commit -m "feat(deploy): middleware sirve cada dominio de división (rewrite/301 por host)"
```

---

### Task 3: Auth absoluto + canonical en los 12 HTML

**Files:**
- Create: `scripts/apply-marketing-domain-edits.mjs`
- Create: `lib/site/marketing-html.test.ts`
- Modify: `public/global-*.html` (6) y `public/en/global-*.html` (6) — vía el script

**Interfaces:**
- Consumes: nada.
- Produces: 12 HTML con botones auth absolutos a `globalcompanies.cl` y un `<link rel="canonical">` que espeja el `og:url` existente.

- [ ] **Step 1: Escribir el guard test (falla primero)**

```ts
// lib/site/marketing-html.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = join(process.cwd(), "public");
const files = [
  ...readdirSync(PUBLIC).filter((f) => /^global-.*\.html$/.test(f)).map((f) => join(PUBLIC, f)),
  ...readdirSync(join(PUBLIC, "en")).filter((f) => /^global-.*\.html$/.test(f)).map((f) => join(PUBLIC, "en", f)),
];

describe("marketing HTML — listo para dominios", () => {
  it("encuentra 12 páginas", () => {
    expect(files.length).toBe(12);
  });

  for (const file of files) {
    const html = readFileSync(file, "utf8");

    it(`${file}: sin links de auth root-relativos`, () => {
      expect(html).not.toMatch(/href="\/login"/);
      expect(html).not.toMatch(/href="\/portal\/login"/);
    });

    it(`${file}: auth apunta a globalcompanies.cl`, () => {
      expect(html).toContain('href="https://globalcompanies.cl/login"');
      expect(html).toContain('href="https://globalcompanies.cl/portal/login"');
    });

    it(`${file}: canonical espeja el og:url`, () => {
      const og = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
      expect(og).toBeTruthy();
      expect(html).toContain(`<link rel="canonical" href="${og}">`);
    });
  }
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/site/marketing-html.test.ts`
Expected: FAIL — los HTML aún tienen `href="/login"` y no tienen `rel="canonical"`.

- [ ] **Step 3: Escribir el script de edición**

```js
// scripts/apply-marketing-domain-edits.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = join(process.cwd(), "public");
const targets = [
  ...readdirSync(PUBLIC).filter((f) => /^global-.*\.html$/.test(f)).map((f) => join(PUBLIC, f)),
  ...readdirSync(join(PUBLIC, "en")).filter((f) => /^global-.*\.html$/.test(f)).map((f) => join(PUBLIC, "en", f)),
];

let changed = 0;
for (const file of targets) {
  let html = readFileSync(file, "utf8");

  // 1) Auth absoluto al dominio maestro (nav desktop + móvil). Orden: portal antes que login.
  html = html.replaceAll('href="/portal/login"', 'href="https://globalcompanies.cl/portal/login"');
  html = html.replaceAll('href="/login"', 'href="https://globalcompanies.cl/login"');

  // 2) Canonical que espeja el og:url ya existente (insertar una sola vez, antes del og:url).
  if (!/rel="canonical"/.test(html)) {
    const m = html.match(/<meta property="og:url" content="([^"]+)">/);
    if (m) {
      html = html.replace(m[0], `<link rel="canonical" href="${m[1]}">\n${m[0]}`);
    }
  }

  writeFileSync(file, html);
  changed++;
}
console.log(`Actualizados ${changed} archivos`);
```

- [ ] **Step 4: Ejecutar el script**

Run: `node scripts/apply-marketing-domain-edits.mjs`
Expected: imprime `Actualizados 12 archivos`.

- [ ] **Step 5: Correr el guard test (ahora pasa)**

Run: `npx vitest run lib/site/marketing-html.test.ts`
Expected: PASS (todos los casos, incluye "encuentra 12 páginas").

- [ ] **Step 6: Commit**

```bash
git add scripts/apply-marketing-domain-edits.mjs lib/site/marketing-html.test.ts public/global-*.html public/en/global-*.html
git commit -m "feat(deploy): auth absoluto a globalcompanies.cl + canonical en las 12 páginas"
```

---

### Task 4: Runbook manual de DNS / Vercel / Supabase

**Files:**
- Create: `docs/deploy/runbook-dominios-nic-chile.md`

**Interfaces:**
- Consumes: nada (documentación operativa que ejecuta el usuario).
- Produces: checklist reproducible de publicación.

- [ ] **Step 1: Escribir el runbook**

```markdown
# Runbook — Publicar el sitio en dominios NIC Chile

Prerrequisito: el código de las Tasks 1–3 está en `master` y Vercel deployó (build verde).

## 1. Agregar dominios en Vercel
Vercel → proyecto `asesoria-financiera` → Settings → Domains → Add, uno por uno:
- `globalcompanies.cl` y `www.globalcompanies.cl`
- `globalwealth.cl` y `www.globalwealth.cl`
- `globalplanning.cl` y `www.globalplanning.cl`
- `globalmarkets.cl` y `www.globalmarkets.cl`
- `globalpropierties.cl` y `www.globalpropierties.cl`
- `globalcorporates.cl` y `www.globalcorporates.cl`
- `globalproperty.cl` y `www.globalproperty.cl`

Para cada `www.*`: usar la opción **Redirect to** el apex correspondiente.
Para `globalproperty.cl` (apex y www): el 301 real lo hace el middleware; en Vercel basta
con agregarlo apuntando al proyecto (o Redirect a `globalpropierties.cl` si se prefiere en el borde).

## 2. DNS en NIC Chile (por cada dominio)
En el panel de zona DNS de cada dominio:
- Registro `A`  · nombre `@` (apex) · valor `76.76.21.21`
- Registro `CNAME` · nombre `www` · valor `cname.vercel-dns.com`

Guardar. La propagación puede tardar minutos/horas. Vercel emite el SSL (Let's Encrypt)
automáticamente cuando el DNS resuelve; esperar el check verde por dominio.

## 3. Supabase
Dashboard → Authentication → URL Configuration:
- **Site URL** = `https://globalcompanies.cl`
- Redirect URLs: mantener `https://globalcompanies.cl/**` (el login vive solo aquí).

## 4. Verificación en vivo (por dominio)
- `https://globalwealth.cl/` muestra Wealth con esa URL en la barra.
- `https://globalmarkets.cl/`, `.../planning`, `globalpropierties.cl/`, `globalcorporates.cl/` idem.
- `https://globalproperty.cl/` redirige (301) a `https://globalpropierties.cl/`.
- `https://www.<dominio>/` redirige al apex.
- Botón **Portal Clientes / Acceso Asesores** desde cualquier dominio abre el login en
  `globalcompanies.cl` y la sesión funciona.
- Candado HTTPS válido en todos.
- Probar el **formulario de contacto** (Web3Forms) en al menos una página en vivo.

## 5. Rollback
Si algo sale mal, quitar el dominio de Vercel → Domains revierte al estado previo sin tocar código.
```

- [ ] **Step 2: Verificar que el markdown renderiza sin secciones vacías**

Run: `grep -n "TODO\|TBD\|<placeholder>" docs/deploy/runbook-dominios-nic-chile.md || echo "sin placeholders"`
Expected: `sin placeholders`.

- [ ] **Step 3: Commit**

```bash
git add docs/deploy/runbook-dominios-nic-chile.md
git commit -m "docs(deploy): runbook DNS/Vercel/Supabase para dominios NIC Chile"
```

---

## Cierre (fuera de tareas de código)

1. Abrir PR de la rama `deploy/dominios-produccion` → `master` y mergear (el usuario mergea; Vercel deploya).
2. Ejecutar el runbook (`docs/deploy/runbook-dominios-nic-chile.md`).
3. "Últimos retoques" de contenido: listarlos y aplicarlos **antes** de apuntar el DNS (fuera de alcance de este plan).

## Criterios de éxito (del spec)

1. Cada dominio de división carga su página manteniendo su propia URL. → Task 1+2 (verificado por curl) + runbook §4.
2. `globalproperty.cl` → 301 → `globalpropierties.cl`. → Task 1+2 (curl) + runbook §4.
3. `www.*` → apex, todos con HTTPS. → runbook §1–2, §4.
4. Portal/Asesores llevan al login en `globalcompanies.cl` y la sesión funciona. → Task 3 + runbook §3–4.
5. Local/preview mantienen el comportamiento actual. → Task 1 (fallback) + Task 2 Step 4.
```
