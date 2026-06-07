import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clients } = await sb.from("clients").select("id,nombre,apellido").ilike("apellido", "%concha%").limit(1);
const c = clients[0];

const { data: snaps } = await sb.from("portfolio_snapshots")
  .select("holdings,snapshot_date,source")
  .eq("client_id", c.id)
  .neq("source", "api-prices")
  .order("snapshot_date", { ascending: false })
  .limit(1);

const holdings = snaps[0].holdings || [];
const bonds = holdings.filter(h => h.assetType === "bond");
for (const b of bonds) {
  console.log({
    name: b.fundName,
    couponRate: b.couponRate,
    maturityDate: b.maturityDate,
    purchaseDate: b.purchaseDate,
    hasCoupon: !!b.couponRate,
    hasMaturity: !!b.maturityDate,
    hasPurchaseDate: !!b.purchaseDate,
    wouldEnterCalcBlock: !!(b.purchaseDate && b.maturityDate && (b.couponRate || 0) / 100 > 0),
  });
}
