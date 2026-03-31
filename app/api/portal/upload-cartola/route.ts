// app/api/portal/upload-cartola/route.ts
// Client-facing: upload cartola PDF/Excel for advisor review

import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { createNotification } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "desconocido";
    const fileType = (formData.get("fileType") as string) || "pdf";

    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Formato no soportado. Usa PDF, Excel o CSV." }, { status: 400 });
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Archivo muy grande (máx 15MB)" }, { status: 400 });
    }

    // Store raw file in Supabase Storage
    const filePath = `client-uploads/${client!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("contracts") // reuse same bucket, different folder
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Error al subir archivo" }, { status: 500 });
    }

    // Try to parse the file
    let parsedData = null;
    let parseError = null;

    try {
      const parseFormData = new FormData();
      parseFormData.append("file", file);

      const parseEndpoint = fileType === "excel"
        ? "/api/parse-portfolio-excel"
        : "/api/parse-portfolio-statement";

      // Call internal parse endpoint - we need to use the full URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      // Parse using internal logic directly instead of HTTP call
      // For simplicity, store file and let advisor parse it
      // The file is already stored, advisor can download and process
    } catch {
      // Parse is optional - file is already stored
    }

    // Save record to client_interactions as "cartola_upload"
    const { error: interactionError } = await admin
      .from("client_interactions")
      .insert({
        client_id: client!.id,
        tipo: "cartola_upload",
        titulo: `Cartola subida: ${source}`,
        descripcion: `Archivo: ${file.name} (${(file.size / 1024).toFixed(0)} KB)\nAdministradora: ${source}\nRuta: ${filePath}`,
        resultado: "pendiente",
        created_by: client!.email,
        fecha: new Date().toISOString(),
      });

    if (interactionError) {
      console.error("Interaction insert error:", interactionError);
    }

    // Also send a message and notification to the advisor
    if (client!.asesor_id) {
      await admin.from("messages").insert({
        client_id: client!.id,
        advisor_id: client!.asesor_id,
        sender_role: "client",
        content: `He subido una cartola de ${source} para tu revisión. Archivo: ${file.name}`,
      });

      await createNotification(admin, {
        advisorId: client!.asesor_id,
        clientId: client!.id,
        type: "cartola_upload",
        title: "Nueva cartola subida",
        body: `Cartola de ${source} — ${file.name}`,
        link: `/clients?id=${client!.id}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Cartola subida exitosamente. Tu asesor la revisará pronto.",
      filePath,
    });
  } catch (err) {
    console.error("Error in upload-cartola:", err);
    return NextResponse.json({ error: "Error al procesar archivo" }, { status: 500 });
  }
}
