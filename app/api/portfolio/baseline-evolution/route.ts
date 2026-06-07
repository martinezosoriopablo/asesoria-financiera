// app/api/portfolio/baseline-evolution/route.ts
import { NextRequest } from 'next/server';
import { requireAuth, createAdminClient } from '@/lib/auth/api-auth';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { applyRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimitResult = await applyRateLimit(request, 'baseline-evolution', { limit: 10 });
  if (rateLimitResult) return rateLimitResult;

  const { error: authError } = await requireAuth();
  if (authError) return authError;

  return handleApiError('baseline-evolution', async () => {
    const { clientId } = await request.json();
    if (!clientId) return errorResponse('clientId es requerido', 400);

    const supabase = createAdminClient();

    // 1. Get baseline snapshot
    const { data: baseline, error: baselineError } = await supabase
      .from('portfolio_snapshots')
      .select('id, snapshot_date, total_value, holdings')
      .eq('client_id', clientId)
      .eq('is_baseline', true)
      .single();

    if (baselineError || !baseline) {
      return errorResponse('No se encontro portfolio inicial (baseline)', 404);
    }

    const holdings = baseline.holdings as Array<{
      fundName: string;
      securityId?: string;
      serie?: string;
      quantity?: number;
      marketPrice?: number;
      marketValue: number;
      assetClass?: string;
    }>;

    if (!holdings || holdings.length === 0) {
      return errorResponse('El portfolio inicial no tiene posiciones', 400);
    }

    // 2. Build holdings payload for historical-prices API
    const holdingsByRun: Array<{ run: string; serie: string; quantity: number; marketValue: number }> = [];
    const internationalHoldings: Array<{ symbol: string; quantity: number; marketValue: number; currency: string }> = [];
    const holdingsByName: Array<{ name: string; quantity: number; marketValue: number }> = [];

    for (const h of holdings) {
      if (h.assetClass === 'cash' || h.assetClass === 'efectivo') continue;

      const secId = h.securityId || '';
      const isRun = /^\d{3,6}$/.test(secId);
      const isCFI = secId.startsWith('CFI');
      const isInternational = !isRun && !isCFI && secId.length > 0;

      if (isRun) {
        holdingsByRun.push({
          run: secId,
          serie: h.serie || 'A',
          quantity: h.quantity || 0,
          marketValue: h.marketValue,
        });
      } else if (isInternational || isCFI) {
        const symbol = isCFI ? `${secId}.SN` : secId;
        internationalHoldings.push({
          symbol,
          quantity: h.quantity || 0,
          marketValue: h.marketValue,
          currency: isCFI ? 'CLP' : 'USD',
        });
      } else {
        holdingsByName.push({
          name: h.fundName,
          quantity: h.quantity || 0,
          marketValue: h.marketValue,
        });
      }
    }

    // 3. Call historical-prices internally
    const baseUrl = request.nextUrl.origin;
    const histResponse = await fetch(`${baseUrl}/api/portfolio/historical-prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        clientId,
        startDate: baseline.snapshot_date,
        holdings: holdingsByRun,
        holdingsByName,
        internationalHoldings,
      }),
    });

    if (!histResponse.ok) {
      const errBody = await histResponse.text();
      return errorResponse(`Error calculando evolucion: ${errBody}`, 500);
    }

    const histData = await histResponse.json();

    return successResponse({
      series: histData.series || [],
      baselineDate: baseline.snapshot_date,
      baselineValue: baseline.total_value,
      holdingsCount: holdings.length,
    });
  });
}
