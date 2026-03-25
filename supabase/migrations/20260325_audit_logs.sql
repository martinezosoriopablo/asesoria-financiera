CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_advisor ON audit_logs(advisor_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advisors_read_own_logs" ON audit_logs FOR SELECT USING (advisor_id = auth.uid());
CREATE POLICY "admin_read_all_logs" ON audit_logs FOR SELECT USING (
  auth.uid() IN (SELECT id FROM advisors WHERE rol = 'admin')
);
