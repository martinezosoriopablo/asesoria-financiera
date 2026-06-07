import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clients } = await sb.from("clients").select("id,nombre,apellido").ilike("apellido", "%concha%").limit(1);
const c = clients[0];
console.log("Client:", c.nombre, c.apellido);

const { data: snaps } = await sb.from("portfolio_snapshots")
  .select("holdings,snapshot_date,source")
  .eq("client_id", c.id)
  .neq("source", "api-prices")
  .order("snapshot_date", { ascending: false })
  .limit(1);

const holdings = snaps[0].holdings || [];
console.log("Snapshot:", snaps[0].snapshot_date, "\n");

// Show ALL holdings
for (const h of holdings) {
  const isInmob = (h.fundName || "").toLowerCase().includes("inmob") ||
                  (h.assetClass || "").toLowerCase().includes("alter") ||
                  (h.securityId || "").startsWith("CFI");
  const marker = isInmob ? " <<<" : "";
  console.log(`${(h.fundName || "").padEnd(30)} type=${(h.assetType || "?").padEnd(6)} class=${(h.assetClass || "?").padEnd(12)} secId=${(h.securityId || "-").padEnd(12)} qty=${String(h.quantity || 0).padStart(8)} price=${String(h.marketPrice || 0).padStart(10)} value=${String(h.marketValue || 0).padStart(12)} cur=${h.currency || "?"}${marker}`);
}
