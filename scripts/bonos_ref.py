#!/usr/bin/env python3
"""
Bond oracle — reference calculations for validating TS implementation.
Uses 30/360 day count, semi-annual coupons, Newton-Raphson for YTM.
"""
import math

def days_30_360(d1, d2):
    """30/360 US (ISDA) day count between two (y,m,d) tuples."""
    y1, m1, dd1 = d1
    y2, m2, dd2 = d2
    dd1 = min(dd1, 30)
    dd2 = min(dd2, 30)
    if dd1 >= 30:
        dd2 = min(dd2, 30)
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (dd2 - dd1)

def coupon_dates_between(start, maturity, freq):
    """Generate coupon dates (as (y,m,d)) from maturity backward that fall after start."""
    months_per = 12 // freq
    dates = []
    d = list(maturity)
    while tuple(d) > tuple(start):
        dates.insert(0, tuple(d))
        d = list(d)
        d[1] -= months_per
        if d[1] <= 0:
            d[0] -= 1
            d[1] += 12
    return dates

def ytm_newton(face, coupon_rate, freq, maturity_date, price_pct, as_of_date):
    """YTM via Newton-Raphson. price_pct = clean price as % of par."""
    coupon = face * coupon_rate / freq
    months_per = 12 // freq

    # Count periods from as_of to maturity
    d = list(maturity_date)
    N = 0
    while tuple(d) > tuple(as_of_date):
        N += 1
        d = list(d)
        d[1] -= months_per
        if d[1] <= 0:
            d[0] -= 1
            d[1] += 12

    if N == 0:
        return float('nan')

    market_price = price_pct / 100 * face

    def price_fn(y):
        pv = sum(coupon / (1 + y)**i for i in range(1, N+1))
        pv += face / (1 + y)**N
        return pv

    def dprice_fn(y):
        dpv = sum(-i * coupon / (1 + y)**(i+1) for i in range(1, N+1))
        dpv -= N * face / (1 + y)**(N+1)
        return dpv

    y = coupon_rate / freq
    for _ in range(200):
        p = price_fn(y)
        dp = dprice_fn(y)
        if abs(dp) < 1e-14:
            break
        diff = p - market_price
        if abs(diff) < 1e-8:
            break
        y -= diff / dp
        if y <= -1:
            y = 0.001

    return y * freq

def dirty_price_at_ytm(face, coupon_rate, freq, maturity_date, ytm_annual, eval_date):
    """Calculate dirty price (clean PV + accrued) at a given YTM on eval_date."""
    coupon = face * coupon_rate / freq
    months_per = 12 // freq
    y = ytm_annual / freq  # periodic yield

    # Count remaining periods
    d = list(maturity_date)
    coupon_dates = []
    while tuple(d) > tuple(eval_date):
        coupon_dates.insert(0, tuple(d))
        d = list(d)
        d[1] -= months_per
        if d[1] <= 0:
            d[0] -= 1
            d[1] += 12

    N = len(coupon_dates)
    if N == 0:
        return face  # at maturity

    # Clean PV
    clean_pv = sum(coupon / (1 + y)**i for i in range(1, N+1))
    clean_pv += face / (1 + y)**N

    # Accrued interest (30/360)
    # Find prev coupon date
    prev = list(coupon_dates[0])
    prev[1] -= months_per
    if prev[1] <= 0:
        prev[0] -= 1
        prev[1] += 12
    prev = tuple(prev)

    days_since = days_30_360(prev, eval_date)
    total_days = days_30_360(prev, coupon_dates[0])
    accrued = coupon * (days_since / total_days) if total_days > 0 else 0

    return clean_pv + accrued

def clean_price_at_ytm(face, coupon_rate, freq, maturity_date, ytm_annual, eval_date):
    """Calculate clean price PV at a given YTM on eval_date (no accrued)."""
    coupon = face * coupon_rate / freq
    months_per = 12 // freq
    y = ytm_annual / freq

    d = list(maturity_date)
    coupon_dates = []
    while tuple(d) > tuple(eval_date):
        coupon_dates.insert(0, tuple(d))
        d = list(d)
        d[1] -= months_per
        if d[1] <= 0:
            d[0] -= 1
            d[1] += 12

    N = len(coupon_dates)
    if N == 0:
        return face

    clean_pv = sum(coupon / (1 + y)**i for i in range(1, N+1))
    clean_pv += face / (1 + y)**N
    return clean_pv

def accrued_interest(face, coupon_rate, freq, maturity_date, eval_date):
    """Accrued interest at eval_date using 30/360."""
    coupon = face * coupon_rate / freq
    months_per = 12 // freq

    # Find prev coupon on or before eval
    d = list(maturity_date)
    while tuple(d) > tuple(eval_date):
        d = list(d)
        d[1] -= months_per
        if d[1] <= 0:
            d[0] -= 1
            d[1] += 12
    prev = tuple(d)

    nxt = list(prev)
    nxt[1] += months_per
    if nxt[1] > 12:
        nxt[0] += 1
        nxt[1] -= 12
    nxt = tuple(nxt)

    days_since = days_30_360(prev, eval_date)
    total_days = days_30_360(prev, nxt)
    return coupon * (days_since / total_days) if total_days > 0 else 0

def coupons_in_period(face, coupon_rate, freq, maturity_date, start_date, end_date):
    """Sum of coupons paid between start (exclusive) and end (inclusive)."""
    coupon = face * coupon_rate / freq
    dates = coupon_dates_between(start_date, maturity_date, freq)
    total = 0
    for cd in dates:
        if tuple(start_date) < cd <= tuple(end_date):
            total += coupon
    return total

def decompose_observed(face, coupon_rate, freq, maturity_date,
                       purchase_date, purchase_clean_pct,
                       eval_date, observed_clean_pct):
    """
    CASO 3: International bond with observed FINRA price.
    Decompose total return into devengo + repricing.
    """
    purchase_ytm = ytm_newton(face, coupon_rate, freq, maturity_date,
                              purchase_clean_pct, purchase_date)

    cost_basis_dirty = face * purchase_clean_pct / 100 + \
        accrued_interest(face, coupon_rate, freq, maturity_date, purchase_date)

    mv_dirty = face * observed_clean_pct / 100 + \
        accrued_interest(face, coupon_rate, freq, maturity_date, eval_date)

    # Theoretical dirty price at purchase YTM on eval date
    theo_dirty = dirty_price_at_ytm(face, coupon_rate, freq, maturity_date,
                                     purchase_ytm, eval_date)

    # Theoretical clean price at purchase YTM on eval date
    theo_clean = clean_price_at_ytm(face, coupon_rate, freq, maturity_date,
                                     purchase_ytm, eval_date)

    coupons = coupons_in_period(face, coupon_rate, freq, maturity_date,
                                purchase_date, eval_date)

    # Devengo = (dirty@ytm_compra,eval - dirty@ytm_compra,compra) + cupones
    devengo = (theo_dirty - cost_basis_dirty) + coupons

    # Repricing = observed_clean - theoretical_clean (at purchase YTM)
    repricing = (observed_clean_pct - theo_clean / face * 100) * face / 100

    total = (mv_dirty - cost_basis_dirty) + coupons

    check = devengo + repricing - total

    return {
        'purchase_ytm': purchase_ytm,
        'cost_basis_dirty': cost_basis_dirty,
        'mv_dirty': mv_dirty,
        'theo_dirty': theo_dirty,
        'theo_clean': theo_clean,
        'coupons': coupons,
        'devengo': devengo,
        'repricing': repricing,
        'total': total,
        'check': check,
    }

def decompose_dcf_reprice(face, coupon_rate, freq, maturity_date,
                          purchase_date, purchase_clean_pct,
                          eval_date, new_yield):
    """
    CASO 1: Chilean bond — DCF reprice at new yield.
    """
    purchase_ytm = ytm_newton(face, coupon_rate, freq, maturity_date,
                              purchase_clean_pct, purchase_date)

    cost_basis_dirty = face * purchase_clean_pct / 100 + \
        accrued_interest(face, coupon_rate, freq, maturity_date, purchase_date)

    # Theoretical at purchase YTM
    theo_dirty_at_ytm = dirty_price_at_ytm(face, coupon_rate, freq, maturity_date,
                                            purchase_ytm, eval_date)

    # Actual at new yield
    dirty_at_new = dirty_price_at_ytm(face, coupon_rate, freq, maturity_date,
                                       new_yield, eval_date)
    clean_at_new = clean_price_at_ytm(face, coupon_rate, freq, maturity_date,
                                       new_yield, eval_date)

    theo_clean_at_ytm = clean_price_at_ytm(face, coupon_rate, freq, maturity_date,
                                            purchase_ytm, eval_date)

    coupons = coupons_in_period(face, coupon_rate, freq, maturity_date,
                                purchase_date, eval_date)

    devengo = (theo_dirty_at_ytm - cost_basis_dirty) + coupons

    # Repricing: DCF exact = clean@new_yield - clean@purchase_ytm
    repricing = clean_at_new - theo_clean_at_ytm

    mv_dirty = dirty_at_new
    total = (mv_dirty - cost_basis_dirty) + coupons

    check = devengo + repricing - total

    # Duration approximation for comparison
    from lib_duration import calc_mod_duration_py
    mod_dur = calc_mod_duration_py(face, coupon_rate, freq, maturity_date, purchase_ytm, eval_date)
    yield_delta = new_yield - purchase_ytm
    repricing_dur = -mod_dur * yield_delta * face

    return {
        'purchase_ytm': purchase_ytm,
        'cost_basis_dirty': cost_basis_dirty,
        'theo_dirty': theo_dirty_at_ytm,
        'dirty_at_new': dirty_at_new,
        'clean_at_new': clean_at_new,
        'theo_clean_at_ytm': theo_clean_at_ytm,
        'coupons': coupons,
        'devengo': devengo,
        'repricing_dcf': repricing,
        'repricing_dur': repricing_dur,
        'total': total,
        'check': check,
        'mod_duration': mod_dur,
    }

print("=" * 60)
print("CASO 3 — Internacional con precio observado FINRA")
print("=" * 60)
r = decompose_observed(
    face=100, coupon_rate=0.06, freq=2,
    maturity_date=(2030, 6, 15),
    purchase_date=(2024, 6, 15),
    purchase_clean_pct=98.0,
    eval_date=(2024, 12, 15),
    observed_clean_pct=96.5,
)
for k, v in r.items():
    print(f"  {k:25s} = {v:+.4f}" if isinstance(v, float) else f"  {k:25s} = {v}")
print()

print("=" * 60)
print("CASO 1 — Chileno con DCF reprice")
print("=" * 60)
# Need a simple duration calc for comparison
class lib_duration:
    @staticmethod
    def calc_mod_duration_py(face, coupon_rate, freq, maturity_date, ytm_annual, eval_date):
        coupon = face * coupon_rate / freq
        months_per = 12 // freq
        y = ytm_annual / freq

        d = list(maturity_date)
        dates = []
        while tuple(d) > tuple(eval_date):
            dates.insert(0, tuple(d))
            d = list(d)
            d[1] -= months_per
            if d[1] <= 0:
                d[0] -= 1
                d[1] += 12

        N = len(dates)
        if N == 0:
            return 0

        pv_total = 0
        weighted_time = 0
        for idx, dt in enumerate(dates):
            i = idx + 1
            is_last = idx == N - 1
            cf = coupon + face if is_last else coupon
            pv = cf / (1 + y)**i
            t_years = i / freq
            pv_total += pv
            weighted_time += t_years * pv

        mac = weighted_time / pv_total if pv_total > 0 else 0
        mod = mac / (1 + ytm_annual / freq)
        return mod

import sys
sys.modules['lib_duration'] = lib_duration

# First get purchase YTM, then set new_yield = purchase_ytm + 0.01
purchase_ytm = ytm_newton(100, 0.035, 2, (2032, 3, 1), 92.5, (2024, 3, 1))
print(f"  Purchase YTM: {purchase_ytm:.4f}")
new_yield = purchase_ytm + 0.01
print(f"  New yield:    {new_yield:.4f}")

r2 = decompose_dcf_reprice(
    face=100, coupon_rate=0.035, freq=2,
    maturity_date=(2032, 3, 1),
    purchase_date=(2024, 3, 1),
    purchase_clean_pct=92.5,
    eval_date=(2024, 9, 1),
    new_yield=new_yield,
)
for k, v in r2.items():
    print(f"  {k:25s} = {v:+.4f}" if isinstance(v, float) else f"  {k:25s} = {v}")
