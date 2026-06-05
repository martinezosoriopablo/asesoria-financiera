// app/api/portal/upload-cartola/route.ts
// Client-facing: upload cartola PDF/Excel for advisor review

import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { createNotification } from "@/lib/notifications";
import { validateUpload } from "@/lib/upload-validation";
import { errorResponse, handleApiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  return handleApiError("portal-upload-cartola-post", async () => {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "desconocido";

    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    const uploadErr = validateUpload(file, {
      maxSizeMB: 10,
      allowedTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
      ],
      allowedExtensions: [".pdf", ".xlsx", ".xls", ".csv"],
    });
    if (uploadErr) return errorResponse(uploadErr, 400);

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

    // Parse is optional — file is already stored, advisor can download and process

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
  });
}
