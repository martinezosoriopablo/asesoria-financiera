import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://zysotxkelepvotzujhxe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5c290eGtlbGVwdm90enVqaHhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjUyNjk3NCwiZXhwIjoyMDgyMTAyOTc0fQ.Ansi89kIfptszv0I3DzmPJdqrEpi7tLbckiobvw6QRM'
);

async function checkClient() {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, nombre, apellido, email, perfil_riesgo, puntaje_riesgo, portfolio_data')
    .ilike('email', '%andres%');

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('Found', clients.length, 'clients matching "andres"');

  for (const data of clients) {

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('=== CLIENT DATA ===');
  console.log('Client:', data.nombre, data.apellido);
  console.log('Email:', data.email);
  console.log('Perfil:', data.perfil_riesgo, '- Puntaje:', data.puntaje_riesgo);
  console.log('Has portfolio_data:', data.portfolio_data ? 'YES' : 'NO');

  if (data.portfolio_data) {
    console.log('\n=== PORTFOLIO DATA ===');
    console.log('Keys:', Object.keys(data.portfolio_data));

    if (data.portfolio_data.composition) {
      console.log('\nComposition (raw):');
      console.log(JSON.stringify(data.portfolio_data.composition, null, 2));
    }

    if (data.portfolio_data.statement) {
      console.log('\nStatement:');
      console.log('  Holdings count:', data.portfolio_data.statement.holdings?.length || 0);
      console.log('  Ending Value:', data.portfolio_data.statement.endingValue);

      if (data.portfolio_data.statement.holdings?.length > 0) {
        console.log('\n  First 5 holdings:');
        data.portfolio_data.statement.holdings.slice(0, 5).forEach((h, i) => {
          console.log(`    ${i+1}. ${h.fundName} (${h.securityId}): $${h.marketValue}`);
        });
      }
    }

    if (data.portfolio_data.savedAt) {
      console.log('\nSaved at:', data.portfolio_data.savedAt);
    }
  } else {
    console.log('\n*** NO PORTFOLIO DATA FOUND ***');
    console.log('The cartola has not been saved for this client.');
  }
  console.log('\n-----------------------------------\n');
  }
}

checkClient();
