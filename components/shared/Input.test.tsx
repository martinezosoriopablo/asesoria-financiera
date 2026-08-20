import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Input from "./Input";

describe("Input", () => {
  it("borde de marca + focus copper (nunca ring azul crudo)", () => {
    const html = renderToStaticMarkup(<Input placeholder="Email" />);
    expect(html).toContain("border-gb-border");
    expect(html).toContain("focus:border-gb-primary");
    expect(html).not.toContain("focus:ring-blue");
  });
  it("renderiza label y hint", () => {
    const html = renderToStaticMarkup(<Input label="Nombre" hint="Requerido" />);
    expect(html).toContain("Nombre");
    expect(html).toContain("Requerido");
  });
  it("asocia label e input vía name cuando no se pasa id", () => {
    const html = renderToStaticMarkup(<Input label="Correo" name="email" />);
    expect(html).toContain('for="email"');
    expect(html).toContain('id="email"');
  });
});
