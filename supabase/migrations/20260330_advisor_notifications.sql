-- Advisor notifications table
-- Tracks discrete events that require advisor attention

CREATE TABLE advisor_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('cartola_upload', 'questionnaire_completed', 'new_message', 'report_ready')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT, -- optional deep link (e.g. /clients?id=xxx)
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_notifications_advisor_unread ON advisor_notifications(advisor_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX idx_notifications_advisor_all ON advisor_notifications(advisor_id, created_at DESC);

-- RLS
ALTER TABLE advisor_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors see own notifications"
  ON advisor_notifications FOR SELECT
  USING (advisor_id IN (
    SELECT id FROM advisors WHERE email = auth.jwt() ->> 'email'
  ));

CREATE POLICY "Service role manages notifications"
  ON advisor_notifications FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable realtime for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE advisor_notifications;
