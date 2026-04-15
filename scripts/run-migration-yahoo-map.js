// Run the security_yahoo_map migration via Supabase REST API
const SUPABASE_URL = 'https://zysotxkelepvotzujhxe.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SQL = `
CREATE TABLE IF NOT EXISTS security_yahoo_map (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  security_id TEXT NOT NULL,
  yahoo_ticker TEXT NOT NULL,
  fund_name TEXT,
  currency TEXT DEFAULT 'USD',
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_security_yahoo_map UNIQUE (security_id)
);

INSERT INTO security_yahoo_map (security_id, yahoo_ticker, fund_name, currency, verified) VALUES
  ('G54420248', '0P000093LM', 'FTGF Western Asset US Core Plus Bond Fund Class A ACC USD', 'USD', true),
  ('G9519Z621', '0P0001BV91', 'Wellington Opportunistic Fixed Income Fund Class D UNHDG ACC USD', 'USD', true),
  ('L5447Q521', '0P0000NRIL', 'Ninety One GSF Latin American Equity Fund Class A ACC USD', 'USD', true),
  ('L54483638', '0P0000SVT9', 'Ninety One GSF Emerging Markets Corporate Debt Fund Class A ACC USD', 'USD', true),
  ('L57812882', '0P000019AY', 'JPMorgan US Value Fund Class A ACC USD', 'USD', true),
  ('L57819580', '0P00000DTX', 'JPMorgan US Select Equity Fund Class A ACC USD', 'USD', true),
  ('L57826114', '0P000019CG', 'JPMorgan US Aggregate Bond Fund Class A ACC USD', 'USD', true),
  ('L7S83N267', '0P00014ZMB', 'Robeco Global Credits Fund Class DH USD', 'USD', true),
  ('L8146A680', '0P00000APH', 'Schroder ISF Asian Opportunities Fund Class A ACC USD', 'USD', true)
ON CONFLICT (security_id) DO UPDATE SET
  yahoo_ticker = EXCLUDED.yahoo_ticker,
  fund_name = EXCLUDED.fund_name,
  verified = EXCLUDED.verified,
  updated_at = NOW();
`;

async function run() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
    },
    body: JSON.stringify({ query: SQL }),
  });

  if (!res.ok) {
    // Try raw SQL via the management API
    console.log('RPC not available, trying direct SQL...');
    const pgRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
      },
    });
    console.log('Status:', pgRes.status);
  }

  // Instead, create table and insert via individual REST calls
  console.log('Creating table via SQL query endpoint...');

  // Use Supabase's pg_net or just create the table
  // Actually, let's use the Supabase SQL editor URL
  const sqlRes = await fetch(SUPABASE_URL + '/rest/v1/', {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
    },
  });
  const tables = await sqlRes.text();
  console.log('Tables check:', tables.substring(0, 200));

  // Check if table exists
  const checkRes = await fetch(SUPABASE_URL + '/rest/v1/security_yahoo_map?select=count', {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Prefer': 'count=exact',
    },
  });

  if (checkRes.ok) {
    console.log('Table exists! Count header:', checkRes.headers.get('content-range'));
    // Insert seed data
    const seedData = [
      { security_id: 'G54420248', yahoo_ticker: '0P000093LM', fund_name: 'FTGF Western Asset US Core Plus Bond Fund Class A ACC USD', currency: 'USD', verified: true },
      { security_id: 'G9519Z621', yahoo_ticker: '0P0001BV91', fund_name: 'Wellington Opportunistic Fixed Income Fund Class D UNHDG ACC USD', currency: 'USD', verified: true },
      { security_id: 'L5447Q521', yahoo_ticker: '0P0000NRIL', fund_name: 'Ninety One GSF Latin American Equity Fund Class A ACC USD', currency: 'USD', verified: true },
      { security_id: 'L54483638', yahoo_ticker: '0P0000SVT9', fund_name: 'Ninety One GSF Emerging Markets Corporate Debt Fund Class A ACC USD', currency: 'USD', verified: true },
      { security_id: 'L57812882', yahoo_ticker: '0P000019AY', fund_name: 'JPMorgan US Value Fund Class A ACC USD', currency: 'USD', verified: true },
      { security_id: 'L57819580', yahoo_ticker: '0P00000DTX', fund_name: 'JPMorgan US Select Equity Fund Class A ACC USD', currency: 'USD', verified: true },
      { security_id: 'L57826114', yahoo_ticker: '0P000019CG', fund_name: 'JPMorgan US Aggregate Bond Fund Class A ACC USD', currency: 'USD', verified: true },
      { security_id: 'L7S83N267', yahoo_ticker: '0P00014ZMB', fund_name: 'Robeco Global Credits Fund Class DH USD', currency: 'USD', verified: true },
      { security_id: 'L8146A680', yahoo_ticker: '0P00000APH', fund_name: 'Schroder ISF Asian Opportunities Fund Class A ACC USD', currency: 'USD', verified: true },
    ];

    const insertRes = await fetch(SUPABASE_URL + '/rest/v1/security_yahoo_map', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(seedData),
    });
    console.log('Insert status:', insertRes.status, await insertRes.text());
  } else {
    console.log('Table does NOT exist yet. Status:', checkRes.status);
    console.log('You need to run the SQL migration in Supabase Dashboard:');
    console.log('Go to: https://supabase.com/dashboard/project/zysotxkelepvotzujhxe/sql');
    console.log('And paste the contents of: supabase/migrations/20260331_security_yahoo_map.sql');
  }
}

run().catch(console.error);
