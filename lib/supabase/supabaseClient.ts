// lib/supabase/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

export function supabaseBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

