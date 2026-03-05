// app/api/generate-pdf/route.ts

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { PortfolioComparisonPDF } from "@/components/pdf/PortfolioComparisonPDF";
import React from "react";

export async function POST(request: NextRequest) {
  try {
    console.log("📄 Iniciando generación de PDF...");
    
    const data = await request.json();
    console.log("📦 Datos recibidos:", {
      clientName: data.clientName,
      totalInvestment: data.totalInvestment,
      assetClassesCount: data.assetClasses?.length,
    });

    // Validar datos mínimos
    if (!data.assetClasses || data.assetClasses.length === 0) {
      console.error("❌ No hay asset classes en los datos");
      return NextResponse.json(
        { success: false, error: "No hay datos para generar el PDF" },
        { status: 400 }
      );
    }

    console.log("🎨 Renderizando componente PDF...");
    
    // Generar PDF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = React.createElement(PortfolioComparisonPDF, { data }) as any;
    const pdfBuffer = await renderToBuffer(pdfElement);

    console.log("✅ PDF generado exitosamente");

    // Retornar PDF como respuesta
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="comparacion-portafolio-${Date.now()}.pdf"`,
      },
    });
  } catch (error: unknown) {
    console.error("💥 Error generando PDF:", error);
    const errorMessage = error instanceof Error ? error.message : "Error al generar PDF";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Stack trace:", errorStack);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}
