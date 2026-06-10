"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Lock, Mail, Loader, AlertCircle, Eye, EyeOff } from "lucide-react";
import GlobalLogo from "@/components/landing/GlobalLogo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/advisor";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos"
          : authError.message
      );
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand gradient */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#07203F]">
        {/* Mesh gradient */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 70% 40%, #14467E 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 20% 80%, #2E86E0 0%, transparent 60%)",
          }}
        />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="relative flex flex-col justify-between w-full p-12">
          <div className="flex items-center gap-3">
            <GlobalLogo variant="light" size={44} />
            <span className="text-2xl tracking-[0.12em] text-white font-medium">
              GLOBAL
            </span>
          </div>
          <div>
            <h2 className="text-3xl font-light text-white mb-4 leading-tight">
              Mas de 25 anos de <span className="text-[#6FB2EF]">experiencia</span>
            </h2>
            <p className="text-white/50 text-sm leading-relaxed max-w-md">
              Asesoria de inversiones independiente, sin conflictos de interes.
              Nuestro foco es construir relaciones duraderas y de largo plazo.
            </p>
          </div>
          <p className="text-white/25 text-xs">
            &copy; 2026 GLOBAL. Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="text-center mb-10">
            <div className="flex justify-center lg:hidden mb-4">
              <GlobalLogo size={56} />
            </div>
            <h1 className="text-2xl font-semibold text-[#0B2C5E] mt-2 lg:mt-0">
              Iniciar sesion
            </h1>
            <p className="text-sm text-[#5B6B82] mt-1.5">
              Ingresa con tus credenciales
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#0B2C5E] mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5B6B82]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-[#DCE7F4] rounded-lg text-sm focus:ring-2 focus:ring-[#2E86E0]/20 focus:border-[#2E86E0] transition-colors"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0B2C5E] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5B6B82]" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  className="w-full pl-10 pr-10 py-2.5 border border-[#DCE7F4] rounded-lg text-sm focus:ring-2 focus:ring-[#2E86E0]/20 focus:border-[#2E86E0] transition-colors"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B6B82] hover:text-[#0B2C5E] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0B2C5E] text-white text-sm font-medium rounded-lg hover:bg-[#07203F] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Ingresando...
                </>
              ) : (
                "Ingresar"
              )}
            </button>

            <div className="text-center">
              <Link
                href="/forgot-password"
                className="text-sm text-[#5B6B82] hover:text-[#2E86E0] transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>

          <p className="text-center text-xs text-[#5B6B82]/60 mt-10">
            GLOBAL — Plataforma de Asesoria Financiera
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader className="w-5 h-5 animate-spin text-[#5B6B82]" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
