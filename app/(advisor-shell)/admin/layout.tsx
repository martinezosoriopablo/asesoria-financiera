"use client";

// Guard de las rutas /admin/*: solo el administrador puede verlas.
// El borde de seguridad real está en las APIs (/api/admin/* usan requireAdmin);
// esto evita además que un asesor común llegue a las pantallas por URL.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { Loader } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { advisor, loading } = useAdvisor();
  const router = useRouter();

  useEffect(() => {
    if (!loading && advisor && !advisor.isAdmin) {
      router.replace("/advisor");
    }
  }, [loading, advisor, router]);

  // Mientras carga o si no es admin, no se renderiza el contenido de admin.
  if (loading || !advisor || !advisor.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-primary animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
