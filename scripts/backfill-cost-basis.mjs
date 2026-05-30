// scripts/backfill-cost-basis.mjs
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfill() {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, nombre, apellido');

  if (error) { console.error('Error fetching clients:', error); return; }

  console.log(`Processing ${clients.length} clients...`);
  let totalUpdated = 0;

  for (const client of clients) {
    const { data: snapshots, error: snapError } = await supabase
      .from('portfolio_snapshots')
      .select('id, snapshot_date, holdings, source')
      .eq('client_id', client.id)
      .neq('source', 'api-prices')
      .order('snapshot_date', { ascending: true });

    if (snapError || !snapshots || snapshots.length === 0) continue;

    console.log(`  ${client.nombre} ${client.apellido}: ${snapshots.length} snapshots`);

    let previousHoldings = [];
    let clientUpdated = 0;

    for (const snapshot of snapshots) {
      const holdings = snapshot.holdings || [];
      if (holdings.length === 0) {
        previousHoldings = [];
        continue;
      }

      const enriched = holdings.map((holding) => {
        const match = previousHoldings.find((prev) => {
          if (holding.securityId && prev.securityId) {
            return holding.securityId === prev.securityId;
          }
          return holding.fundName === prev.fundName;
        });

        const cartolaPrice = holding.marketPrice || (holding.quantity ? holding.marketValue / holding.quantity : holding.marketValue);

        if (!match || match.costBasis == null) {
          return { ...holding, costBasis: cartolaPrice, costBasisDate: snapshot.snapshot_date };
        }

        const currentQty = holding.quantity ?? 0;
        const previousQty = match.quantity ?? 0;

        if (currentQty === previousQty) {
          return { ...holding, costBasis: match.costBasis, costBasisDate: match.costBasisDate };
        }

        return { ...holding, costBasis: cartolaPrice, costBasisDate: snapshot.snapshot_date };
      });

      const { error: updateError } = await supabase
        .from('portfolio_snapshots')
        .update({ holdings: enriched })
        .eq('id', snapshot.id);

      if (updateError) {
        console.error(`    Error updating snapshot ${snapshot.id}:`, updateError.message);
      } else {
        clientUpdated++;
        totalUpdated++;
      }

      previousHoldings = enriched;
    }

    if (clientUpdated > 0) {
      console.log(`    Updated ${clientUpdated} snapshots`);
    }
  }

  console.log(`\nBackfill complete. ${totalUpdated} snapshots updated.`);
}

backfill().catch(console.error);
