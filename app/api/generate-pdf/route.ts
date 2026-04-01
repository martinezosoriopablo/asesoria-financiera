// app/api/generate-pdf/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { PortfolioComparisonPDF } from "@/components/pdf/PortfolioComparisonPDF";
import React from "react";
import { applyRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "generate-pdf", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  try {
    const data = await request.json();

    // Validar datos mínimos
    if (!data.assetClasses || data.assetClasses.length === 0) {
      console.error("❌ No hay asset classes en los datos");
      return NextResponse.json(
        { success: false, error: "No hay datos para generar el PDF" },
        { status: 400 }
      );
    }

    // Generar PDF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(PortfolioComparisonPDF, { data }) as any;
    const pdfBuffer = await renderToBuffer(pdfElement);

    // Retornar PDF como respuesta
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="comparacion-portafolio-${Date.now()}.pdf"`,
      },
    });
  } catch (error: unknown) {
    console.error("Error generando PDF:", error);
    if (error instanceof Error) {
      console.error("Stack trace:", error.stack);
    }

    return NextResponse.json(
      {
        success: false,
        error: "Error al generar PDF",
      },
      { status: 500 }
    );
  }
}
