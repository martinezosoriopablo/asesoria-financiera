// components/clients/ClientJourneyChecklist.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ClientJourneyChecklist from "./ClientJourneyChecklist";

describe("ClientJourneyChecklist", () => {
  it("renderiza los 5 pasos y resalta el siguiente", () => {
    const html = renderToStaticMarkup(<ClientJourneyChecklist client={{ id: "c1", perfil_riesgo: "moderado" }} />);
    expect(html).toContain("Perfil de riesgo");
    expect(html).toContain("Subir cartola");
    expect(html).toContain("Recomendación");
    // el "siguiente" (cartola) lleva el CTA principal navy
    expect(html).toContain("bg-gb-black");
  });
  it("cliente completo muestra journey completo", () => {
    const html = renderToStaticMarkup(
      <ClientJourneyChecklist client={{ id: "c1", perfil_riesgo: "x", tiene_portfolio: true, tiene_cartera_recomendada: true }} />
    );
    expect(html).toContain("completo");
  });
});
