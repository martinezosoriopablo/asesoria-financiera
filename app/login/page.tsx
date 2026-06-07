"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Lock, Mail, Loader, AlertCircle, Eye, EyeOff } from "lucide-react";

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
      {/* Left panel — branding + photo */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative flex flex-col justify-between w-full p-12">
          <span
            className="text-2xl tracking-[0.15em] text-white"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            GLOBAL
          </span>
          <div>
            <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
              Tu equipo financiero completo
            </h2>
            <p className="text-white/60 text-sm leading-relaxed max-w-md">
              Asesoria de inversiones, seguros internacionales, planificacion
              tributaria y soluciones inmobiliarias.
            </p>
          </div>
          <p className="text-white/30 text-xs">
            &copy; 2026 GLOBAL. Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="text-center mb-10">
            <span
              className="text-2xl tracking-[0.15em] text-gb-black lg:hidden"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              GLOBAL
            </span>
            <h1 className="text-xl font-semibold text-gb-black mt-2 lg:mt-0">
              Iniciar sesion
            </h1>
            <p className="text-sm text-gray-500 mt-1">
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
              <label className="block text-sm font-medium text-gb-black mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gb-black/20 focus:border-gb-black transition-colors"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gb-black mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gb-black/20 focus:border-gb-black transition-colors"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gb-black transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gb-dark disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
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
                className="text-sm text-gray-500 hover:text-gb-black transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>

          <p className="text-center text-xs text-gray-400 mt-10">
            GLOBAL — Plataforma de Asesoria Financiera
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader className="w-5 h-5 animate-spin text-gb-gray" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
