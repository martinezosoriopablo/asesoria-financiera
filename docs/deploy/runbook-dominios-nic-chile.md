# Runbook — Publicar el sitio en dominios NIC Chile

Prerrequisito: el código de las Tasks 1–3 está en `master` y Vercel deployó (build verde).

## 1. Agregar dominios en Vercel
Vercel → proyecto `asesoria-financiera` → Settings → Domains → Add, uno por uno:
- `globalcompanies.cl` y `www.globalcompanies.cl`
- `globalwealth.cl` y `www.globalwealth.cl`
- `globalplanning.cl` y `www.globalplanning.cl`
- `globalmarkets.cl` y `www.globalmarkets.cl`
- `globalproperties.cl` y `www.globalproperties.cl`
- `globalcorporates.cl` y `www.globalcorporates.cl`
- `globalproperty.cl` y `www.globalproperty.cl`

Para cada `www.*`: usar la opción **Redirect to** el apex correspondiente.
Para `globalproperty.cl` (apex y www): el 301 real lo hace el middleware; en Vercel basta
con agregarlo apuntando al proyecto (o Redirect a `globalproperties.cl` si se prefiere en el borde).

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
- `https://globalmarkets.cl/`, `.../planning`, `globalproperties.cl/`, `globalcorporates.cl/` idem.
- `https://globalproperty.cl/` redirige (301) a `https://globalproperties.cl/`.
- `https://www.<dominio>/` redirige al apex.
- Botón **Portal Clientes / Acceso Asesores** desde cualquier dominio abre el login en
  `globalcompanies.cl` y la sesión funciona.
- Candado HTTPS válido en todos.
- Probar el **formulario de contacto** (Web3Forms) en al menos una página en vivo.

## 5. Rollback
Si algo sale mal, quitar el dominio de Vercel → Domains revierte al estado previo sin tocar código.
