// app/api/portfolio/manual-prices/route.ts
// Subir precios manuales para fondos sin serie de tiempo automática
// Formato CSV: fecha,precio (el security_id se envía aparte)
// Ejemplo body: { securityId: "L51224282", csv: "2025-12-01,1674.94\n2025-12-02,1676.20" }
// También acepta formato legacy con 3 columnas: security_id,date,price

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

// Strict date format: YYYY-MM-DD
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Security ID: alphanumeric, 3-20 chars (CUSIP, ISIN, ticker, RUN)
const SECURITY_ID_REGEX = /^[A-Z0-9]{3,20}$/i;

interface ParsedRow {
  security_id: string;
  price_date: string;
  price: number;
  line: number;
}

function parseCSV(csvText: string, externalSecurityId?: string): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  const lines = csvText.trim().split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip header row
    if (i === 0 && /security_id|fecha|date|precio|price|valor/i.test(line)) continue;

    const parts = line.split(/[,;\t]/);

    let securityId: string;
    let dateStr: string;
    let priceStr: string;

    if (externalSecurityId) {
      // Simple format: date,price (security_id provided externally)
      if (parts.length < 2) {
        errors.push(`Línea ${i + 1}: esperado 2 columnas (fecha, precio), encontrado ${parts.length}`);
        continue;
      }
      securityId = externalSecurityId;
      dateStr = parts[0].trim();
      priceStr = parts[1].trim();
    } else {
      // Legacy 3-column format: security_id,date,price
      if (parts.length < 3) {
        errors.push(`Línea ${i + 1}: esperado 3 columnas (security_id, fecha, precio), encontrado ${parts.length}`);
        continue;
      }
      securityId = parts[0].trim();
      dateStr = parts[1].trim();
      priceStr = parts[2].trim();

      // Validate security_id
      if (!SECURITY_ID_REGEX.test(securityId)) {
        errors.push(`Línea ${i + 1}: security_id "${securityId}" inválido (solo alfanumérico, 3-20 chars)`);
        continue;
      }
    }

    // Validate date
    if (!DATE_REGEX.test(dateStr)) {
      errors.push(`Línea ${i + 1}: fecha "${dateStr}" inválida (formato requerido: YYYY-MM-DD)`);
      continue;
    }

    // Validate date is not in the future
    const dateObj = new Date(dateStr);
    if (dateObj > new Date()) {
      errors.push(`Línea ${i + 1}: fecha ${dateStr} es futura`);
      continue;
    }

    // Validate date is reasonable (not before 2000)
    if (dateObj.getFullYear() < 2000) {
      errors.push(`Línea ${i + 1}: fecha ${dateStr} es anterior a 2000`);
      continue;
    }

    // Validate price — accept both 1234.56 and 1234,56
    const normalizedPrice = priceStr.replace(",", ".");
    const price = parseFloat(normalizedPrice);
    if (isNaN(price) || price <= 0) {
      errors.push(`Línea ${i + 1}: precio "${priceStr}" inválido (debe ser número positivo)`);
      continue;
    }

    if (price > 1_000_000) {
      errors.push(`Línea ${i + 1}: precio ${price} parece demasiado alto (>1M). Verificar.`);
      continue;
    }

    rows.push({ security_id: securityId, price_date: dateStr, price, line: i + 1 });
  }

  // Check for duplicate dates per security
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.security_id}|${row.price_date}`;
    if (seen.has(key)) {
      errors.push(`Línea ${row.line}: fecha duplicada ${row.price_date} para ${row.security_id}`);
    }
    seen.add(key);
  }

  // Check dates are chronological per security
  const bySecId = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const arr = bySecId.get(row.security_id) || [];
    arr.push(row);
    bySecId.set(row.security_id, arr);
  }
  for (const [secId, secRows] of bySecId) {
    for (let i = 1; i < secRows.length; i++) {
      if (secRows[i].price_date < secRows[i - 1].price_date) {
        errors.push(`${secId}: fechas no están ordenadas cronológicamente`);
        break;
      }
    }

    // Check for suspicious price jumps (>50% between consecutive days)
    for (let i = 1; i < secRows.length; i++) {
      const ratio = secRows[i].price / secRows[i - 1].price;
      if (ratio > 1.5 || ratio < 0.5) {
        errors.push(
          `${secId}: salto de precio sospechoso entre ${secRows[i - 1].price_date} (${secRows[i - 1].price}) y ${secRows[i].price_date} (${secRows[i].price}) — ratio ${ratio.toFixed(2)}`
        );
      }
    }
  }

  return { rows, errors };
}

// POST: Subir precios manuales via CSV
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "manual-prices", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { csv, securityId, note } = await request.json();

    if (!csv || typeof csv !== "string") {
      return NextResponse.json(
        { success: false, error: "Se requiere campo 'csv' con el contenido del CSV" },
        { status: 400 }
      );
    }

    // If securityId provided, validate it
    if (securityId && !SECURITY_ID_REGEX.test(securityId)) {
      return NextResponse.json(
        { success: false, error: `securityId "${securityId}" inválido` },
        { status: 400 }
      );
    }

    // Parse and validate — if securityId provided, CSV is just date,price
    const { rows, errors } = parseCSV(csv, securityId || undefined);

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: "Errores de validación en el CSV",
        validationErrors: errors,
        validRows: rows.length,
      }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "CSV vacío o sin filas válidas" },
        { status: 400 }
      );
    }

    // Max 1000 rows per upload
    if (rows.length > 1000) {
      return NextResponse.json(
        { success: false, error: `Máximo 1000 filas por carga, recibidas ${rows.length}` },
        { status: 400 }
      );
    }

    // Upsert all rows
    const data = rows.map(r => ({
      security_id: r.security_id,
      price_date: r.price_date,
      price: r.price,
      currency: "USD",
      note: note || null,
      created_by: user.id,
    }));

    // Use admin client for upsert to bypass RLS (auth already verified above)
    const admin = createAdminClient();
    const { error: upsertError } = await admin
      .from("manual_prices")
      .upsert(data, { onConflict: "security_id,price_date" });

    if (upsertError) {
      console.error("Error upserting manual prices:", upsertError);
      return NextResponse.json(
        { success: false, error: upsertError.message },
        { status: 500 }
      );
    }

    // Summary
    const securities = new Set(rows.map(r => r.security_id));
    const dateRange = {
      from: rows[0].price_date,
      to: rows[rows.length - 1].price_date,
    };

    return NextResponse.json({
      success: true,
      message: `${rows.length} precios guardados para ${securities.size} instrumento(s)`,
      summary: {
        totalRows: rows.length,
        securities: Array.from(securities),
        dateRange,
      },
    });
  } catch (error: unknown) {
    console.error("Error in manual-prices:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

// GET: Obtener precios manuales (opcionalmente filtrar por security_id)
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "manual-prices-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const securityId = searchParams.get("securityId");

    const admin = createAdminClient();
    let query = admin
      .from("manual_prices")
      .select("*")
      .order("security_id")
      .order("price_date", { ascending: true });

    if (securityId) {
      query = query.eq("security_id", securityId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Error in manual-prices GET:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
