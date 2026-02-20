import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greybark Advisors",
  description: "Plataforma de Asesoría Financiera — Greybark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
