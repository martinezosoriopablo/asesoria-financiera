import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clients } = await sb.from("clients").select("id,nombre,apellido").ilike("apellido", "%concha%").limit(1);
if (!clients || clients.length === 0) { console.log("no client"); process.exit(1); }
const c = clients[0];
console.log("Client:", c.nombre, c.apellido);

const { data: snaps } = await sb.from("portfolio_snapshots")
  .select("holdings,snapshot_date,source,cash_value,cash_percent")
  .eq("client_id", c.id)
  .neq("source", "api-prices")
  .order("snapshot_date", { ascending: false })
  .limit(1);

if (!snaps || snaps.length === 0) { console.log("no snap"); process.exit(1); }

const snap = snaps[0];
console.log("Snapshot:", snap.snapshot_date, "source:", snap.source);
console.log("cash_value:", snap.cash_value, "cash_percent:", snap.cash_percent);

const holdings = snap.holdings || [];
console.log("\nAll assetTypes:", [...new Set(holdings.map(h => h.assetType))]);
console.log("All assetClasses:", [...new Set(holdings.map(h => h.assetClass))]);

const bonds = holdings.filter(h => h.assetType === "bond");
console.log("\nBonds:");
for (const b of bonds) {
  console.log({
    name: b.fundName,
    qty: b.quantity,
    costBasis: b.costBasis,
    unitCost: b.unitCost,
    marketPrice: b.marketPrice,
    marketValue: b.marketValue,
    currency: b.currency,
  });
}

const cash = holdings.filter(h => h.assetType === "cash");
console.log("\nCash holdings:");
for (const c2 of cash) {
  console.log({ name: c2.fundName, qty: c2.quantity, marketValue: c2.marketValue, assetType: c2.assetType });
}
