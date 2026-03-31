// POST /api/daily-report/upload
// Upload a daily market report (HTML + optional MP3 podcast)
// Auth: Bearer token via DAILY_REPORT_API_KEY
// Content-Type: multipart/form-data
// Fields: html (text), subject (text), period (am|pm), podcast (file, optional)
// Query: ?distribute=true to send emails immediately

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import { distributeDailyReport } from "@/lib/daily-report-distribution";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // Auth via API key
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.DAILY_REPORT_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const html = formData.get("html") as string | null;
    const subject = formData.get("subject") as string | null;
    const period = formData.get("period") as string | null;
    const podcastFile = formData.get("podcast") as File | null;

    // Validate required fields
    if (!html || !subject || !period) {
      return NextResponse.json(
        { error: "Missing required fields: html, subject, period" },
        { status: 400 }
      );
    }

    if (period !== "am" && period !== "pm") {
      return NextResponse.json(
        { error: "period must be 'am' or 'pm'" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const reportDate = new Date().toISOString().split("T")[0];

    // Upload podcast to Supabase Storage if provided
    let podcastUrl: string | null = null;
    if (podcastFile) {
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (podcastFile.size > maxSize) {
        return NextResponse.json(
          { error: "Podcast file too large (max 50MB)" },
          { status: 400 }
        );
      }

      const filePath = `${reportDate}/${period}.mp3`;
      const buffer = Buffer.from(await podcastFile.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("daily-reports")
        .upload(filePath, buffer, {
          contentType: "audio/mpeg",
          upsert: true,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        return NextResponse.json(
          { error: `Failed to upload podcast: ${uploadError.message}` },
          { status: 500 }
        );
      }

      const { data: urlData } = supabase.storage
        .from("daily-reports")
        .getPublicUrl(filePath);

      podcastUrl = urlData.publicUrl;
    }

    // Check for existing report (upsert)
    const { data: existing } = await supabase
      .from("daily_reports")
      .select("id")
      .eq("report_date", reportDate)
      .eq("period", period)
      .maybeSingle();

    let reportId: string;

    if (existing) {
      // Update existing report
      const { data, error } = await supabase
        .from("daily_reports")
        .update({
          subject,
          html_content: html,
          podcast_url: podcastUrl ?? undefined,
          distributed: false,
          distributed_at: null,
          recipients_count: 0,
        })
        .eq("id", existing.id)
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      reportId = data.id;
    } else {
      // Insert new report
      const { data, error } = await supabase
        .from("daily_reports")
        .insert({
          report_date: reportDate,
          period,
          subject,
          html_content: html,
          podcast_url: podcastUrl,
        })
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      reportId = data.id;
    }

    // Distribute if requested
    const shouldDistribute = request.nextUrl.searchParams.get("distribute") === "true";
    let distribution = null;

    if (shouldDistribute) {
      distribution = await distributeDailyReport(reportId);
    }

    return NextResponse.json({
      success: true,
      id: reportId,
      report_date: reportDate,
      period,
      podcast_url: podcastUrl,
      distributed: shouldDistribute,
      distribution,
    });
  } catch (err) {
    console.error("Error uploading daily report:", err);
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
