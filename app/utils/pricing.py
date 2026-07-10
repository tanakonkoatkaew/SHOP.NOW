"""Shared pricing helpers — flash sale & loyalty points.

Flash-sale fields on a product document (all optional):
    sale_price:  float  (the discounted unit price)
    sale_start:  datetime (UTC, aware) — sale not active before this
    sale_end:    datetime (UTC, aware) — sale not active after this

A sale is "active" when sale_price > 0 and (now within [start, end]).
When either bound is missing it is treated as open-ended on that side.

Loyalty:
    POINTS_EARN_RATE — fraction of the amount actually paid that is granted
                       back as reward points.
    POINTS_VALUE     — baht value of 1 reward point when redeemed.
"""
from datetime import datetime, timezone

POINTS_EARN_RATE = 0.05   # earn 5% of the paid amount as reward points
POINTS_VALUE     = 1.0    # 1 reward point == 1 baht at redemption


def _as_utc(dt):
    """Coerce a stored datetime to an aware UTC datetime, or None."""
    if not dt:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def sale_active(product, now=None):
    """Whether the product's flash sale is currently running."""
    try:
        sale_price = float(product.get("sale_price") or 0)
    except (TypeError, ValueError):
        return False
    if sale_price <= 0:
        return False
    try:
        if sale_price >= float(product.get("price", 0)):
            return False   # a "sale" that isn't cheaper is not a sale
    except (TypeError, ValueError):
        pass

    now = now or datetime.now(timezone.utc)
    start = _as_utc(product.get("sale_start"))
    end = _as_utc(product.get("sale_end"))
    if start and now < start:
        return False
    if end and now > end:
        return False
    return True


def effective_price(product, now=None):
    """Return the price a buyer pays right now for one unit.

    Returns a dict: {price, original, on_sale, sale_end (iso|None)}.
    """
    original = float(product.get("price", 0) or 0)
    if sale_active(product, now):
        end = _as_utc(product.get("sale_end"))
        return {
            "price":    round(float(product["sale_price"]), 2),
            "original": original,
            "on_sale":  True,
            "sale_end": end.isoformat() if end else None,
        }
    return {"price": original, "original": original, "on_sale": False, "sale_end": None}


def points_earned(amount_paid):
    """Reward points granted for paying `amount_paid` baht."""
    try:
        return round(float(amount_paid) * POINTS_EARN_RATE, 2)
    except (TypeError, ValueError):
        return 0.0
