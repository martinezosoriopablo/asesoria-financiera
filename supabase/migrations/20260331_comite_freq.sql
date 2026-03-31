-- Add individual frequency per comité report (none/weekly/monthly)
ALTER TABLE client_report_config
  ADD COLUMN IF NOT EXISTS freq_macro TEXT DEFAULT 'none' CHECK (freq_macro IN ('none', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS freq_rv TEXT DEFAULT 'none' CHECK (freq_rv IN ('none', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS freq_rf TEXT DEFAULT 'none' CHECK (freq_rf IN ('none', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS freq_asset_allocation TEXT DEFAULT 'none' CHECK (freq_asset_allocation IN ('none', 'weekly', 'monthly'));

-- Migrate existing boolean values to new freq columns
UPDATE client_report_config SET freq_macro = 'weekly' WHERE send_macro = true;
UPDATE client_report_config SET freq_rv = 'weekly' WHERE send_rv = true;
UPDATE client_report_config SET freq_rf = 'weekly' WHERE send_rf = true;
UPDATE client_report_config SET freq_asset_allocation = 'weekly' WHERE send_asset_allocation = true;
