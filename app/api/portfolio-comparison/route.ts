// app/api/generate-pdf/route.ts

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { PortfolioComparisonPDF } from "@/components/pdf/PortfolioComparisonPDF";
import React from "react";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al generar PDF",
      },
      { status: 500 }
    );
  }
}
