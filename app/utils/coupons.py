"""Shared coupon helpers.

Coupon document shape:
    code:       str   (uppercase, unique)
    discount:   float (percent 1-100)
    msg:        str
    active:     bool  (admin on/off toggle; default True)
    max_uses:   int   (0 = unlimited)
    used_count: int
    used:       bool  (legacy single-use flag — still honored as "disabled")
"""


def coupon_usable(c):
    """Whether a coupon can currently be applied."""
    if not c:
        return False
    if not c.get("active", True):
        return False
    if c.get("used", False):                 # legacy one-shot flag
        return False
    max_uses = int(c.get("max_uses", 0) or 0)
    used_count = int(c.get("used_count", 0) or 0)
    if max_uses > 0 and used_count >= max_uses:
        return False
    return True


def coupon_remaining(c):
    """Remaining uses, or None if unlimited."""
    max_uses = int(c.get("max_uses", 0) or 0)
    if max_uses <= 0:
        return None
    return max(0, max_uses - int(c.get("used_count", 0) or 0))
