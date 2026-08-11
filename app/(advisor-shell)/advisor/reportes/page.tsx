import RepositorioReportes from "@/components/reportes/RepositorioReportes";

export const metadata = { title: "Repositorio de reportes" };

export default function Page() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-gb-black mb-1">Repositorio de reportes</h1>
      <p className="text-sm text-gb-gray mb-6">Biblioteca central del comité. Sube, versiona y define el uso de cada reporte.</p>
      <RepositorioReportes />
    </div>
  );
}
