"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AdvisorInfo {
  user: User;
  email: string;
  name: string;
  photo: string;
}

export function useAdvisor() {
  const [advisor, setAdvisor] = useState<AdvisorInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        // Fetch advisor profile from DB
        supabase
          .from("advisors")
          .select("nombre, apellido, foto_url")
          .eq("email", user.email)
          .single()
          .then(({ data }) => {
            setAdvisor({
              user,
              email: user.email!,
              name: data
                ? `${data.nombre} ${data.apellido}`
                : user.email!,
              photo:
                data?.foto_url ||
                "https://zysotxkelepvotzujhxe.supabase.co/storage/v1/object/public/assets/foto.png",
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
