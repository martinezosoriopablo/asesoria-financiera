-- Cierra fuga RLS crítica en prod (ago 2026): elimina políticas permisivas {public}
-- con USING(true) que dejaban PII (clients/advisors/interacciones/reuniones/notificaciones)
-- legible por el rol anon (llave pública del frontend). Fueron agregadas fuera de las
-- migraciones del repo (drift de prod). La app NO se afecta: accede vía service role,
-- que salta RLS. Verificado con prueba externa (anon key → vacío tras el drop).
--
-- Fase 2 pendiente (diseñar con cuidado, no incluida aquí):
--   1) Reemplazar las políticas cmd=ALL "Solo usuarios autenticados pueden modificar
--      clientes/asesores" por políticas modify-only, para que un asesor logueado NO
--      pueda leer clientes/asesores de otros vía SELECT.
--   2) Volver get_accessible_client_ids() SECURITY DEFINER (get_accessible_advisor_ids
--      ya lo es) ANTES de endurecer el SELECT de clients, o se rompe el acceso a
--      clientes huérfanos/compartidos.
DROP POLICY IF EXISTS "Permitir lectura de clientes"        ON clients;
DROP POLICY IF EXISTS "Permitir lectura de asesores"        ON advisors;
DROP POLICY IF EXISTS "Permitir lectura de interacciones"   ON client_interactions;
DROP POLICY IF EXISTS "Permitir lectura de reuniones"       ON meetings;
DROP POLICY IF EXISTS "Service role manages notifications"  ON advisor_notifications;
DROP POLICY IF EXISTS "Service role manages executions"     ON rebalance_executions;
