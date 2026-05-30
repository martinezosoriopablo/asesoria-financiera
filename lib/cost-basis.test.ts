import { describe, it, expect } from 'vitest';
import { calculateCostBasis, matchHolding, enrichHoldingsWithCostBasis } from './cost-basis';

describe('matchHolding', () => {
  it('matches by securityId (RUN)', () => {
    const current = { fundName: 'Fondo A', securityId: '9876', quantity: 100, marketPrice: 15000, marketValue: 1500000 };
    const previous = [
      { fundName: 'Fondo A Renamed', securityId: '9876', quantity: 100, marketPrice: 14000, marketValue: 1400000, costBasis: 13000, costBasisDate: '2026-01-15' },
    ];
    const match = matchHolding(current, previous);
    expect(match).not.toBeNull();
    expect(match!.securityId).toBe('9876');
  });

  it('matches by fundName when no securityId', () => {
    const current = { fundName: 'Fondo Mutuo BCI', quantity: 50, marketPrice: 2000, marketValue: 100000 };
    const previous = [
      { fundName: 'Fondo Mutuo BCI', quantity: 50, marketPrice: 1900, marketValue: 95000, costBasis: 1800, costBasisDate: '2026-02-01' },
    ];
    const match = matchHolding(current, previous);
    expect(match).not.toBeNull();
    expect(match!.fundName).toBe('Fondo Mutuo BCI');
  });

  it('returns null when no match found', () => {
    const current = { fundName: 'Fondo Nuevo', securityId: 'XYZ', quantity: 10, marketPrice: 500, marketValue: 5000 };
    const previous = [
      { fundName: 'Fondo Viejo', securityId: 'ABC', quantity: 20, marketPrice: 300, marketValue: 6000 },
    ];
    const match = matchHolding(current, previous);
    expect(match).toBeNull();
  });
});

describe('calculateCostBasis', () => {
  it('new position (no previous) — uses cartola price', () => {
    const result = calculateCostBasis(
      { fundName: 'SPY', quantity: 10, marketPrice: 450, marketValue: 4500 },
      null,
      '2026-03-15'
    );
    expect(result.costBasis).toBe(450);
    expect(result.costBasisDate).toBe('2026-03-15');
  });

  it('same quantity — inherits previous cost basis', () => {
    const result = calculateCostBasis(
      { fundName: 'SPY', quantity: 10, marketPrice: 480, marketValue: 4800 },
      { fundName: 'SPY', quantity: 10, marketPrice: 450, marketValue: 4500, costBasis: 420, costBasisDate: '2026-01-10' },
      '2026-03-15'
    );
    expect(result.costBasis).toBe(420);
    expect(result.costBasisDate).toBe('2026-01-10');
  });

  it('quantity changed — new cost basis from cartola', () => {
    const result = calculateCostBasis(
      { fundName: 'SPY', quantity: 15, marketPrice: 480, marketValue: 7200 },
      { fundName: 'SPY', quantity: 10, marketPrice: 450, marketValue: 4500, costBasis: 420, costBasisDate: '2026-01-10' },
      '2026-03-15'
    );
    expect(result.costBasis).toBe(480);
    expect(result.costBasisDate).toBe('2026-03-15');
  });

  it('no marketPrice — calculates from marketValue/quantity', () => {
    const result = calculateCostBasis(
      { fundName: 'Fondo X', quantity: 200, marketValue: 1000000 },
      null,
      '2026-03-15'
    );
    expect(result.costBasis).toBe(5000);
    expect(result.costBasisDate).toBe('2026-03-15');
  });

  it('previous has no costBasis (legacy) — treats as new position', () => {
    const result = calculateCostBasis(
      { fundName: 'SPY', quantity: 10, marketPrice: 480, marketValue: 4800 },
      { fundName: 'SPY', quantity: 10, marketPrice: 450, marketValue: 4500 },
      '2026-03-15'
    );
    expect(result.costBasis).toBe(480);
    expect(result.costBasisDate).toBe('2026-03-15');
  });
});

describe('enrichHoldingsWithCostBasis', () => {
  it('enriches a full holdings array with mixed scenarios', () => {
    const current = [
      { fundName: 'Fondo A', securityId: '1234', quantity: 100, marketPrice: 5000, marketValue: 500000 },
      { fundName: 'Fondo B', securityId: '5678', quantity: 200, marketPrice: 3000, marketValue: 600000 },
      { fundName: 'Fondo C', securityId: '9999', quantity: 50, marketPrice: 10000, marketValue: 500000 },
    ];
    const previous = [
      { fundName: 'Fondo A', securityId: '1234', quantity: 100, marketPrice: 4500, marketValue: 450000, costBasis: 4000, costBasisDate: '2026-01-01' },
      { fundName: 'Fondo B', securityId: '5678', quantity: 150, marketPrice: 2800, marketValue: 420000, costBasis: 2500, costBasisDate: '2026-01-01' },
    ];

    const enriched = enrichHoldingsWithCostBasis(current, previous, '2026-03-15');

    // Fondo A: same quantity → inherit
    expect(enriched[0].costBasis).toBe(4000);
    expect(enriched[0].costBasisDate).toBe('2026-01-01');
    // Fondo B: quantity changed (150→200) → new cost basis
    expect(enriched[1].costBasis).toBe(3000);
    expect(enriched[1].costBasisDate).toBe('2026-03-15');
    // Fondo C: new position → cartola price
    expect(enriched[2].costBasis).toBe(10000);
    expect(enriched[2].costBasisDate).toBe('2026-03-15');
  });
});
