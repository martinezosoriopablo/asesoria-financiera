import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Card from "./Card";

describe("Card", () => {
  it("default: fondo blanco, borde, esquina sobria", () => {
    const html = renderToStaticMarkup(<Card>contenido</Card>);
    expect(html).toContain("bg-white");
    expect(html).toContain("border-gb-border");
    expect(html).toContain("rounded-md");
    expect(html).toContain("contenido");
  });
  it("highlight: fondo navy", () => {
    const html = renderToStaticMarkup(<Card highlight>x</Card>);
    expect(html).toContain("bg-gb-black");
  });
  it("con title renderiza header serif", () => {
    const html = renderToStaticMarkup(<Card title="Rebalanceo">x</Card>);
    expect(html).toContain("font-serif");
    expect(html).toContain("Rebalanceo");
  });
});
