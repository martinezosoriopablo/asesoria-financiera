import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mi Portal — Greybark Advisors",
  description: "Portal de inversiones para clientes",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
