# Test Manual — Magic Link / Portal Cliente

## Pre-requisitos
- Migraciones aplicadas en Supabase
- App corriendo (local o Vercel)
- Un cliente de prueba con email real que puedas revisar

---

## Test 1: Flujo completo (Happy Path)
- [ ] Ir a ClientDetail del cliente de prueba
- [ ] Click "Invitar al portal"
- [ ] Verificar que el email llega (revisar bandeja)
- [ ] Click en el link del email
- [ ] Verificar que llega a `/portal/setup-password`
- [ ] Crear password (min 6 chars)
- [ ] Verificar redirect a `/portal/dashboard`
- [ ] Verificar que el dashboard muestra datos del cliente correcto

## Test 2: Login con password (después de setup)
- [ ] Cerrar sesión del portal
- [ ] Ir a `/portal/login`
- [ ] Ingresar email y password creado en Test 1
- [ ] Verificar que entra al dashboard correctamente

## Test 3: Link expirado / usado
- [ ] Intentar abrir el mismo link del Test 1 de nuevo
- [ ] Verificar que muestra mensaje "El link ha expirado" o similar
- [ ] Verificar que redirige a `/portal/login`

## Test 4: Re-invitación
- [ ] Desde ClientDetail, volver a invitar al mismo cliente
- [ ] Verificar que llega nuevo email
- [ ] Verificar que el nuevo link funciona
- [ ] (Si ya tiene password, verificar que el email dice "ya tienes cuenta")

## Test 5: Cross-client (seguridad)
- [ ] Estar logueado como Cliente A en el portal
- [ ] Intentar navegar a `/portal/dashboard?client_id=CLIENT_B_UUID`
- [ ] Verificar que NO muestra datos de Cliente B
- [ ] Las APIs del portal solo deben devolver datos del cliente autenticado

## Test 6: Rol incorrecto
- [ ] Estar logueado como Advisor en `/advisor`
- [ ] Intentar navegar a `/portal/dashboard`
- [ ] Verificar que redirige a `/advisor` (middleware bloquea)
- [ ] Viceversa: logueado como cliente, intentar `/advisor` → redirige a `/portal/dashboard`

## Test 7: Portal deshabilitado
- [ ] En Supabase, setear `portal_enabled = false` para el cliente de prueba
- [ ] Intentar login con email/password
- [ ] Verificar que devuelve error "Portal deshabilitado" (403)
- [ ] Restaurar `portal_enabled = true`

---

## Resultado
| Test | OK? | Notas |
|------|-----|-------|
| 1. Happy path | | |
| 2. Password login | | |
| 3. Link expirado | | |
| 4. Re-invitación | | |
| 5. Cross-client | | |
| 6. Rol incorrecto | | |
| 7. Portal deshabilitado | | |
