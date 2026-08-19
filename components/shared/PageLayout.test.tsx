// components/shared/PageLayout.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PageContainer from "./PageContainer";
import PageHeader from "./PageHeader";

describe("PageContainer", () => {
  it("default max-w-6xl con padding estándar", () => {
    const html = renderToStaticMarkup(<PageContainer>x</PageContainer>);
    expect(html).toContain("max-w-6xl");
    expect(html).toContain("px-5");
    expect(html).toContain("py-8");
  });
  it("wide → max-w-7xl", () => {
    const html = renderToStaticMarkup(<PageContainer wide>x</PageContainer>);
    expect(html).toContain("max-w-7xl");
  });
});

describe("PageHeader", () => {
  it("título serif navy + eyebrow copper con tracking amplio", () => {
    const html = renderToStaticMarkup(<PageHeader title="Seguimiento" eyebrow="Cliente" />);
    expect(html).toContain("font-serif");
    expect(html).toContain("Seguimiento");
    expect(html).toContain("Cliente");
    expect(html).toContain("text-gb-primary");
    expect(html).toContain("tracking-[0.22em]");
  });
  it("renderiza actions", () => {
    const html = renderToStaticMarkup(<PageHeader title="X" actions={<button>Ir</button>} />);
    expect(html).toContain("Ir");
  });
});
