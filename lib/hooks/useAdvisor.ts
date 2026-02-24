"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { AdvisorRole } from "@/lib/types/advisor";

interface AdvisorInfo {
  user: User;
  id: string;
  email: string;
  name: string;
  photo: string;
  logo?: string | null;
  companyName?: string | null;
  role: AdvisorRole;
  isAdmin: boolean;
  parentAdvisorId?: string | null;
}

export function useAdvisor() {
  const [advisor, setAdvisor] = useState<AdvisorInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        // Fetch advisor profile from DB with new fields
        supabase
          .from("advisors")
          .select("id, nombre, apellido, foto_url, logo_url, company_name, rol, parent_advisor_id")
          .eq("email", user.email)
          .single()
          .then(({ data }) => {
            const role: AdvisorRole = data?.rol || 'advisor';
            setAdvisor({
              user,
              id: data?.id || '',
              email: user.email!,
              name: data
                ? `${data.nombre} ${data.apellido}`
                : user.email!,
              photo:
                data?.foto_url ||
                "https://zysotxkelepvotzujhxe.supabase.co/storage/v1/object/public/assets/foto.png",
              logo: data?.logo_url || null,
              companyName: data?.company_name || null,
              role,
              isAdmin: role === 'admin',
              parentAdvisorId: data?.parent_advisor_id || null,
            });
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });
  }, []);

  const logout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return { advisor, loading, logout };
}
