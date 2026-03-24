-- Portal del Cliente: schema changes
-- Run in Supabase SQL Editor

-- 1.1 Columnas nuevas en tabla clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS auth_user_id    UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS portal_enabled  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS portal_invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_last_seen  TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS clients_auth_user_id_idx
  ON clients(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 1.2 Tabla messages
CREATE TABLE IF NOT EXISTS messages (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  advisor_id    UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  sender_role   TEXT NOT NULL CHECK (sender_role IN ('advisor', 'client')),
  content       TEXT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  read_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS messages_client_id_idx ON messages(client_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS messages_unread_idx ON messages(client_id, read_at)
  WHERE read_at IS NULL;

-- 1.3 RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Cliente lee solo sus mensajes
CREATE POLICY "client_read_own_messages"
  ON messages FOR SELECT
  USING (
    auth.uid() IN (
      SELECT auth_user_id FROM clients WHERE id = messages.client_id
    )
  );

-- Cliente escribe solo en su conversación
CREATE POLICY "client_insert_own_messages"
  ON messages FOR INSERT
  WITH CHECK (
    sender_role = 'client' AND
    auth.uid() IN (
      SELECT auth_user_id FROM clients WHERE id = messages.client_id
    )
  );

-- Asesor lee mensajes de sus clientes (via service role o matching advisor)
CREATE POLICY "advisor_read_client_messages"
  ON messages FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM advisors WHERE id = messages.advisor_id
    )
  );

-- Asesor inserta mensajes para sus clientes
CREATE POLICY "advisor_insert_messages"
  ON messages FOR INSERT
  WITH CHECK (
    sender_role = 'advisor' AND
    auth.uid() IN (
      SELECT id FROM advisors WHERE id = messages.advisor_id
    )
  );

-- RLS para que cliente lea su propio perfil
CREATE POLICY "client_read_own_profile"
  ON clients FOR SELECT
  USING (auth_user_id = auth.uid());

-- RLS para que cliente lea sus snapshots
CREATE POLICY "client_read_own_snapshots"
  ON portfolio_snapshots FOR SELECT
  USING (
    auth.uid() IN (
      SELECT auth_user_id FROM clients WHERE id = portfolio_snapshots.client_id
    )
  );

-- RLS para que cliente lea su perfil de riesgo
CREATE POLICY "client_read_own_risk_profile"
  ON risk_profiles FOR SELECT
  USING (
    auth.uid() IN (
      SELECT auth_user_id FROM clients WHERE id = risk_profiles.client_id
    )
  );

-- Habilitar Realtime para mensajes
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
