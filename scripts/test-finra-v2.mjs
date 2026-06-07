import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const CLIENT_ID = process.env.FINRA_CLIENT_ID;
const CLIENT_SECRET = process.env.FINRA_CLIENT_SECRET;

const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
console.log('Getting token...');

const tokenRes = await fetch('https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials', {
  method: 'POST',
  headers: { 'Authorization': `Basic ${basicAuth}` },
});
const { access_token: token } = await tokenRes.json();
console.log('Token OK\n');

// Try the DynRep service (what the FINRA web portal uses)
const endpoints = [
  'https://services-dynarep.ddwa.finra.org/public/DynRep/FilteredSearch/Bond?cusip=097023CU7',
  'https://services-dynarep.ddwa.finra.org/public/DynRep/Bond?cusip=097023CU7',
  'https://gateway.finra.org/api/data/bond?cusip=097023CU7',
  'https://gateway.finra.org/api/bond/097023CU7',
  'https://gateway.finra.org/api/fixed-income/bond/097023CU7',
];

for (const url of endpoints) {
  console.log(`Trying: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    console.log(`  Status: ${res.status}`);
    if (res.ok) {
      const text = await res.text();
      console.log(`  Response: ${text.substring(0, 500)}`);
    } else if (res.status === 302 || res.status === 301) {
      console.log(`  Redirect: ${res.headers.get('location')}`);
    } else {
      const text = await res.text();
      console.log(`  Error: ${text.substring(0, 200)}`);
    }
  } catch (e) {
    console.log(`  Network error: ${e.message}`);
  }
  console.log('');
}

// Try the Developer API with different version patterns
console.log('--- Developer API v2/v3 attempts ---\n');
const apiUrls = [
  'https://api.finra.org/data/group/fixedIncomeMarket/name/trace?limit=1',
  'https://api.finra.org/data/v2/group/fixedIncomeMarket/name/trace?limit=1',
  'https://api.finra.org/v2/data/group/fixedIncomeMarket/name/trace?limit=1',
  // Maybe the group name is different
  'https://api.finra.org/data/group/fi/name/trace?limit=1',
  'https://api.finra.org/data/group/bond/name/trace?limit=1',
  'https://api.finra.org/data/group/trace/name/corporateBonds?limit=1',
  // Flat endpoint
  'https://api.finra.org/data/trace?limit=1',
  // Check what groups exist
  'https://api.finra.org/metadata',
  'https://api.finra.org/metadata/groups',
];

for (const url of apiUrls) {
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    const status = res.ok ? 'OK' : `${res.status}`;
    let detail = '';
    if (res.ok) {
      detail = (await res.text()).substring(0, 200);
    }
    console.log(`${status}: ${url} ${detail}`);
  } catch (e) {
    console.log(`ERR: ${url} - ${e.message}`);
  }
}

console.log('\nDone!');
