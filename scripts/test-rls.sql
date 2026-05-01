-- ==========================================================
-- TEST RLS — Script para Supabase SQL Editor
-- Ejecutar DESPUÉS de aplicar las 6 migraciones pendientes
-- ==========================================================
-- PREPARACIÓN: Necesitas 2 advisor UUIDs reales y 1 client UUID de cada uno.
-- Reemplaza los placeholders antes de ejecutar.

-- Paso 0: Identificar IDs de prueba
-- Ejecuta esto primero y anota los IDs:

SELECT id, email FROM auth.users WHERE raw_user_meta_data->>'role' = 'advisor' LIMIT 3;
SELECT id, nombre, asesor_id, auth_user_id FROM clients LIMIT 5;

-- ==========================================================
-- TEST 1: ANON no puede leer nada
-- ==========================================================
-- En Supabase SQL Editor, set role a anon:

SET ROLE anon;
SET request.jwt.claims = '{"role": "anon"}';

-- Todas estas queries deben devolver 0 filas:
SELECT count(*) AS "clients (debe ser 0)" FROM clients;
SELECT count(*) AS "portfolio_snapshots (debe ser 0)" FROM portfolio_snapshots;
SELECT count(*) AS "messages (debe ser 0)" FROM messages;
SELECT count(*) AS "client_report_config (debe ser 0)" FROM client_report_config;
SELECT count(*) AS "client_reports (debe ser 0)" FROM client_reports;
SELECT count(*) AS "recommendation_versions (debe ser 0)" FROM recommendation_versions;
SELECT count(*) AS "meetings (debe ser 0)" FROM meetings;
SELECT count(*) AS "client_interactions (debe ser 0)" FROM client_interactions;
SELECT count(*) AS "risk_profiles (debe ser 0)" FROM risk_profiles;

RESET ROLE;

-- ==========================================================
-- TEST 2: Advisor A NO ve datos de Advisor B
-- ==========================================================
-- Reemplaza ADVISOR_A_UUID y ADVISOR_B_UUID con IDs reales.
-- Reemplaza CLIENT_OF_B_UUID con un client cuyo asesor_id = ADVISOR_B_UUID.

-- Simular sesión de Advisor A:
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "ADVISOR_A_UUID", "role": "authenticated"}';

-- Estos deben devolver 0 filas (el cliente pertenece a B):
SELECT count(*) AS "clients de B vistos por A (debe ser 0)"
  FROM clients WHERE id = 'CLIENT_OF_B_UUID';

SELECT count(*) AS "snapshots de B vistos por A (debe ser 0)"
  FROM portfolio_snapshots WHERE client_id = 'CLIENT_OF_B_UUID';

SELECT count(*) AS "messages de B vistos por A (debe ser 0)"
  FROM messages WHERE client_id = 'CLIENT_OF_B_UUID';

SELECT count(*) AS "report_config de B vistos por A (debe ser 0)"
  FROM client_report_config WHERE client_id = 'CLIENT_OF_B_UUID';

SELECT count(*) AS "reports de B vistos por A (debe ser 0)"
  FROM client_reports WHERE client_id = 'CLIENT_OF_B_UUID';

SELECT count(*) AS "recommendations de B vistos por A (debe ser 0)"
  FROM recommendation_versions WHERE client_id = 'CLIENT_OF_B_UUID';

SELECT count(*) AS "interactions de B vistos por A (debe ser 0)"
  FROM client_interactions WHERE client_id = 'CLIENT_OF_B_UUID';

-- Meetings: advisor_id directo
SELECT count(*) AS "meetings de B vistos por A (debe ser 0)"
  FROM meetings WHERE advisor_id = 'ADVISOR_B_UUID';

RESET ROLE;

-- ==========================================================
-- TEST 3: Advisor A SÍ ve sus propios datos
-- ==========================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "ADVISOR_A_UUID", "role": "authenticated"}';

-- Debe devolver >= 1 fila (asumiendo que A tiene clientes):
SELECT count(*) AS "clientes propios de A (debe ser > 0)" FROM clients;
SELECT count(*) AS "snapshots propios de A (debe ser >= 0)" FROM portfolio_snapshots;

RESET ROLE;

-- ==========================================================
-- TEST 4: Cliente NO ve datos de otro cliente
-- ==========================================================
-- Reemplaza CLIENT_A_AUTH_UUID con el auth_user_id del cliente A
-- Reemplaza CLIENT_B_UUID con el id de otro cliente

SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "CLIENT_A_AUTH_UUID", "role": "authenticated", "user_metadata": {"active_role": "client"}}';

-- Cliente A no debe ver datos de Cliente B:
SELECT count(*) AS "snapshots de otro cliente (debe ser 0)"
  FROM portfolio_snapshots WHERE client_id = 'CLIENT_B_UUID';

SELECT count(*) AS "reports de otro cliente (debe ser 0)"
  FROM client_reports WHERE client_id = 'CLIENT_B_UUID';

SELECT count(*) AS "messages de otro cliente (debe ser 0)"
  FROM messages WHERE client_id = 'CLIENT_B_UUID';

RESET ROLE;

-- ==========================================================
-- TEST 5: INSERT cross-client bloqueado
-- ==========================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "ADVISOR_A_UUID", "role": "authenticated"}';

-- Intentar insertar un mensaje para un cliente que NO es de A:
-- Esto debe fallar con un error de política RLS
INSERT INTO messages (client_id, sender, content)
VALUES ('CLIENT_OF_B_UUID', 'advisor', 'Test malicioso');
-- Esperado: ERROR new row violates row-level security policy

RESET ROLE;

-- ==========================================================
-- TEST 6: Tablas nuevas de Fase 3
-- ==========================================================
-- Verificar que advisor_preferred_funds tiene RLS
-- (si la migración lo incluyó)

SET ROLE anon;
SET request.jwt.claims = '{"role": "anon"}';

SELECT count(*) AS "preferred_funds anon (debe ser 0)"
  FROM advisor_preferred_funds;

SELECT count(*) AS "ai_usage anon (debe ser 0)"
  FROM advisor_ai_usage;

RESET ROLE;

-- ==========================================================
-- LIMPIEZA
-- ==========================================================
-- Si el INSERT del Test 5 pasa (BUG!), borrar el registro de prueba:
-- DELETE FROM messages WHERE content = 'Test malicioso';

-- ==========================================================
-- RESUMEN DE RESULTADOS
-- ==========================================================
-- Test 1 (Anon): Todas las tablas = 0 filas          ✓/✗
-- Test 2 (Cross-advisor): Todas las queries = 0       ✓/✗
-- Test 3 (Own data): count > 0                        ✓/✗
-- Test 4 (Cross-client): Todas las queries = 0        ✓/✗
-- Test 5 (INSERT cross-client): Error RLS             ✓/✗
-- Test 6 (Tablas Fase 3): Anon = 0                    ✓/✗
