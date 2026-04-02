"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Loader, CheckCircle, AlertCircle, LogIn } from "lucide-react";
import { Suspense } from "react";

function PortalLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "login">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    if (tokenHash && type === "magiclink") {
      verifyMagicLink(tokenHash);
    } else {
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
      setStatus("login");
      setErrorMsg("El link ha expirado. Puedes ingresar con tu email y contraseña.");
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

    const activeRole = user?.user_metadata?.active_role || user?.user_metadata?.role;
    const roles = (user?.user_metadata?.roles as string[]) || [];
    if (user && (activeRole === "client" || roles.includes("client"))) {
      router.push("/portal/dashboard");
      router.refresh();
    } else {
      setStatus("login");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoginLoading(true);
    setErrorMsg("");

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg("Email o contraseña incorrectos");
      setLoginLoading(false);
      return;
    }

    const userRoles = (data.user?.user_metadata?.roles as string[]) || [];
    const userRole = data.user?.user_metadata?.role as string;
    const hasClientRole = userRoles.includes("client") || userRole === "client";

    if (!hasClientRole) {
      await supabase.auth.signOut();
      setErrorMsg("Esta cuenta no tiene acceso al portal de clientes");
      setLoginLoading(false);
      return;
    }

    // Set active_role to client for dual-role users
    try {
      await fetch("/api/auth/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "client" }),
      });
    } catch {}

    setStatus("success");
    setTimeout(() => {
      router.push("/portal/bienvenida");
      router.refresh();
    }, 1000);
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

        {status === "login" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-gb-black">Portal de Inversiones</h1>
              <p className="text-sm text-gb-gray mt-1">Ingresa con tus credenciales</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-medium text-gb-gray mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                  placeholder="tu@email.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gb-gray mb-1">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              <div className="text-right">
                <a
                  href="/forgot-password"
                  className="text-xs text-gb-accent hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </a>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading || !email || !password}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gb-black text-white rounded-lg text-sm font-medium hover:bg-gb-dark disabled:opacity-40 transition-colors"
              >
                {loginLoading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Ingresar
                  </>
                )}
              </button>
            </form>
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
