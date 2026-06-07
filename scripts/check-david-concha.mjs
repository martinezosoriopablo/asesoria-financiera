import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("URL:", url ? url.substring(0, 30) + "..." : "MISSING");
console.log("Key:", key ? key.substring(0, 10) + "..." : "MISSING");
const sb = createClient(url, key);

// Find David Concha
const { data: clients, error: clientErr } = await sb
  .from("clients")
  .select("id, nombre, apellido")
  .ilike("apellido", "%concha%")
  .limit(10);

if (clientErr) console.log("Error:", clientErr.message);
console.log("Clients:", clients?.map(c => `${c.nombre} ${c.apellido} (${c.id})`));

if (!clients || clients.length === 0) {
  console.log("No client found with name 'concha'");
  process.exit(1);
}

const client = clients[0];
console.log(`\nCliente: ${client.nombre} ${client.apellido} (${client.id})\n`);

// Get latest snapshot
const { data: snapshots } = await sb
  .from("portfolio_snapshots")
  .select("id, snapshot_date, total_value, holdings, source")
  .eq("client_id", client.id)
  .neq("source", "api-prices")
  .order("snapshot_date", { ascending: false })
  .limit(3);

if (!snapshots || snapshots.length === 0) {
  console.log("No snapshots found");
  process.exit(1);
}

for (const snap of snapshots) {
  console.log(`=== Snapshot ${snap.snapshot_date} (${snap.source}) ===`);
  console.log(`Total value: ${snap.total_value?.toLocaleString()}\n`);

  const holdings = snap.holdings || [];
  console.log(`${"Instrumento".padEnd(27)} ${"Cant".padStart(8)} ${"Precio".padStart(10)} ${"Valor".padStart(10)} ${"Mon".padStart(4)} ${"Cupón".padStart(6)} ${"Vencimiento".padStart(12)} ${"F.Compra".padStart(12)} ${"secId".padStart(12)}`);
  console.log("-".repeat(105));

  for (const h of holdings) {
    if (h.assetType !== "bond") continue; // only show bonds
    const name = (h.fundName || "").substring(0, 25).padEnd(27);
    const qty = String(h.quantity || 0).padStart(8);
    const price = String(h.marketPrice || 0).padStart(10);
    const value = String(h.marketValue || 0).padStart(10);
    const cur = (h.currency || "?").padStart(4);
    const cpn = String(h.couponRate || "-").padStart(6);
    const mat = (h.maturityDate || "-").padStart(12);
    const pdate = (h.purchaseDate || "-").padStart(12);
    const sid = (h.securityId || "").padStart(12);
    console.log(`${name} ${qty} ${price} ${value} ${cur} ${cpn} ${mat} ${pdate} ${sid}`);
  }
  console.log();
}
