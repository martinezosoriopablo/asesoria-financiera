// components/shared/Button.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "./Button";

describe("Button", () => {
  it("primary usa navy (bg-gb-black), nunca copper", () => {
    const html = renderToStaticMarkup(<Button>Guardar</Button>);
    expect(html).toContain("bg-gb-black");
    expect(html).not.toContain("gb-primary");
    expect(html).toContain("Guardar");
  });
  it("secondary usa azure (text-gb-info) con borde", () => {
    const html = renderToStaticMarkup(<Button variant="secondary">X</Button>);
    expect(html).toContain("text-gb-info");
    expect(html).toContain("border-gb-border");
  });
  it("pasa className y props nativos", () => {
    const html = renderToStaticMarkup(<Button className="mt-4" disabled>X</Button>);
    expect(html).toContain("mt-4");
    expect(html).toContain("disabled");
  });
});
