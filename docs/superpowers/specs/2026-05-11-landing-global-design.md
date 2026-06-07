# Landing Page Global — Design Spec

**Goal:** Reemplazar la landing actual (Stonex Advisory) con la landing de Global, firma multi-servicio con 4 verticales. Presentacion el jueves.

**Scope:** Solo la landing page publica + ajuste de marca en login. No afecta el interior de la plataforma.

---

## Estructura (single page, 7 secciones)

### 1. Navbar fijo
- Logo "Global" (texto, reemplazable por imagen despues)
- Links: Servicios | Nosotros (scroll anchors)
- Dos botones: "Portal Clientes" (outline) | "Acceso Asesores" (solid azul)
- Ambos apuntan a `/login`. El sistema detecta rol post-login via `active_role`.
- Mobile: hamburger menu o solo los dos botones

### 2. Hero
- Headline: "Tu equipo financiero completo"
- Subtitulo: "Asesoria de inversiones, seguros internacionales, planificacion tributaria y soluciones inmobiliarias. Todo en un solo lugar."
- CTA primario: "Conoce nuestros servicios" (scroll a seccion servicios)
- CTA secundario: "Agenda una reunion" (scroll a contacto o link externo)
- Fondo: gradiente claro slate → blue suave

### 3. Servicios (4 cards en grid)

| Servicio | Icono Lucide | Descripcion |
|----------|-------------|-------------|
| Asesoria Financiera | TrendingUp | Gestion de portafolios, analisis de costos, recomendaciones personalizadas con datos CMF en tiempo real |
| Seguros Internacionales | Shield | Polizas con companias de USA. Productos no disponibles en Chile. Coberturas de vida, salud, patrimonio |
| Asesoria Tributaria | FileText | Planificacion tributaria personalizada. Optimizacion de carga fiscal. Red de especialistas |
| Soluciones Inmobiliarias | Building2 | Productos de inversion inmobiliaria. Asesoria en compra/venta. Gestion patrimonial |

Cada card: icono en circulo de color, titulo, descripcion (2-3 lineas). Sin "saber mas" — la info esta completa en la card.

### 4. Diferenciadores (3 columnas)
- **Acceso internacional** — Productos de USA y mercados globales que no estan disponibles en Chile
- **Todo integrado** — Un solo equipo para inversiones, seguros, impuestos e inmobiliario
- **Tecnologia + experiencia** — Plataforma propia con datos en tiempo real, respaldada por asesores humanos

### 5. Como funciona (3 pasos)
1. Agenda una reunion con tu asesor
2. Definimos tu estrategia personalizada
3. Gestion continua con reportes y seguimiento

### 6. CTA final
- "Empieza hoy"
- Dos botones: "Portal Clientes" | "Acceso Asesores" (mismos que navbar)

### 7. Footer
- Logo Global
- Columnas: Servicios (4 links internos) | Contacto (email, telefono) | Legal
- "© 2026 Global. Todos los derechos reservados."
- Sin referencia a Greybark ni ninguna otra marca interna

---

## Estilo visual

- **Paleta:** slate/gray base + azul como acento (consistente con el interior de la plataforma: gb-accent #2563eb)
- **Tipografia:** Geist (ya cargada en el proyecto via next/font)
- **Iconos:** Lucide React (ya instalado)
- **Sin emojis, sin stock photos** — solo iconos + color + espaciado generoso
- **Mobile responsive:** grid 1 col en mobile, 2-4 cols en desktop

---

## Cambios tecnicos

### Archivos a modificar
1. `app/(public)/page.tsx` — rewrite completo con la nueva landing
2. `app/login/page.tsx` — cambiar cualquier referencia a "Stonex" por "Global"

### Archivos que NO se tocan
- Dashboard, seguimiento, fondos, portal — todo el interior queda igual
- Middleware, auth, API routes — sin cambios

### Dependencias
- Ninguna nueva. Todo usa Next.js + Tailwind + Lucide que ya estan en el proyecto.

---

## Criterios de exito
- La landing carga rapido (sin API calls, todo estatico)
- Se ve profesional en desktop y mobile
- Los dos botones de acceso llevan a /login correctamente
- No hay referencia a Stonex, WAOP, ni Greybark en ningun lugar visible
- El nombre "Global" aparece consistente en navbar, footer, y title de la pagina
