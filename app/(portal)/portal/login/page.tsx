"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Loader, CheckCircle, AlertCircle } from "lucide-react";
import { Suspense } from "react";

function PortalLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    if (tokenHash && type === "magiclink") {
      verifyMagicLink(tokenHash);
    } else {
      // Check if already logged in
      checkSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyMagicLink = async (tokenHash: string) => {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    if (error) {
      setStatus("error");
      setErrorMsg("El link ha expirado o ya fue utilizado. Contacta a tu asesor para recibir uno nuevo.");
      return;
    }

    setStatus("success");
    setTimeout(() => {
      router.push("/portal/bienvenida");
      router.refresh();
    }, 1500);
  };

  const checkSession = async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user && user.user_metadata?.role === "client") {
      router.push("/portal/dashboard");
      router.refresh();
    } else {
      setStatus("error");
      setErrorMsg("Para acceder a tu portal, usa el link que recibiste por email de tu asesor.");
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <img
          src="/logo-greybark.png"
          alt="Greybark Advisors"
          className="h-14 mx-auto mb-8"
        />

        {status === "loading" && (
          <div className="space-y-4">
            <Loader className="w-8 h-8 text-gb-gray animate-spin mx-auto" />
            <p className="text-sm text-gb-gray">Verificando acceso...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle className="w-10 h-10 text-gb-success mx-auto" />
            <div>
              <h1 className="text-lg font-semibold text-gb-black">Bienvenido</h1>
              <p className="text-sm text-gb-gray mt-1">Redirigiendo a tu portal...</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <AlertCircle className="w-10 h-10 text-gb-warning mx-auto" />
            <div>
              <h1 className="text-lg font-semibold text-gb-black">Acceso al Portal</h1>
              <p className="text-sm text-gb-gray mt-2">{errorMsg}</p>
            </div>
          </div>
        )}

        <p className="text-xs text-gb-gray mt-12">
          Greybark Advisors — Portal de Inversiones
        </p>
      </div>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-gb-gray" />
      </div>
    }>
      <PortalLoginContent />
    </Suspense>
  );
}
