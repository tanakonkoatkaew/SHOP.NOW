"""Order pricing & fulfilment — shared by the direct-pay (Stripe) checkout flow.

Two pure-ish stages:
  compute_order()  — validate items + resolve live prices + stack discounts.
                     No DB writes (only reads). Returns the money breakdown.
  finalize_order() — called AFTER payment is confirmed. Idempotent: deducts
                     stock, spends points/credit, awards points, writes the
                     real order docs and sends the receipt.

Discount stacking order: flash sale (per unit) -> coupon (% of subtotal)
-> reward points (1 pt = POINTS_VALUE THB) -> store credit (THB).
Whatever is left is charged via Stripe.
"""
import uuid
from datetime import datetime, timezone
from bson import ObjectId

from app.utils.pricing import effective_price, points_earned, POINTS_VALUE
from app.utils.coupons import coupon_usable
from app.utils.notify import push_notification
from app.utils.receipt import send_order_receipt


def compute_order(db, user, raw_items, coupon_code=None, points_to_use=0, credit_to_use=0):
    """Validate a cart and compute the money breakdown. Read-only.

    Returns (ok: bool, payload: dict, http_code: int).
    On success payload has: line_items, summary, discount_percent, coupon_id.
    """
    line_items = []
    subtotal_original = 0.0
    subtotal = 0.0
    for raw in raw_items or []:
        pid = raw.get("product_id")
        try:
            qty = int(raw.get("qty", raw.get("quantity", 1)))
        except (ValueError, TypeError):
            qty = 1
        if qty <= 0:
            return False, {"status": False, "msg": "จำนวนสินค้าต้องมากกว่า 0"}, 400
        try:
            product = db.products.find_one({"_id": ObjectId(pid)})
        except Exception:
            return False, {"status": False, "msg": "ID สินค้าไม่ถูกต้อง"}, 400
        if not product:
            return False, {"status": False, "msg": "ไม่พบสินค้า"}, 404
        if int(product.get("stock", 0)) < qty:
            return False, {"status": False, "msg": f"{product['name']}: คงเหลือไม่พอ (เหลือ {product.get('stock', 0)})"}, 400

        ep = effective_price(product)
        line_total = ep["price"] * qty
        subtotal_original += ep["original"] * qty
        subtotal += line_total
        line_items.append({
            "product_id": str(product["_id"]),
            "name": product["name"],
            "image": product.get("image", ""),
            "cate": product.get("cate", ""),
            "qty": qty,
            "unit_price": ep["price"],
            "line_total": line_total,
            "delivery_type": product.get("delivery_type", "digital"),
        })

    if not line_items:
        return False, {"status": False, "msg": "ตะกร้าว่างเปล่า"}, 400

    # Any physical item in the cart means the order must be shipped somewhere
    requires_shipping = any(li["delivery_type"] == "physical" for li in line_items)

    flash_discount = round(subtotal_original - subtotal, 2)

    # Coupon — % of the post-flash subtotal
    coupon_id = None
    discount_percent = 0.0
    coupon_discount = 0.0
    if coupon_code:
        coupon_doc = db.coupons.find_one({"code": coupon_code.upper()})
        if coupon_doc and coupon_usable(coupon_doc):
            discount_percent = float(coupon_doc.get("discount", 0))
            coupon_discount = round(subtotal * discount_percent / 100, 2)
            coupon_id = coupon_doc["_id"]

    running = subtotal - coupon_discount

    # Reward points (1 pt = POINTS_VALUE THB)
    available_points = float(user.get("reward", 0) or 0)
    try:
        points_to_use = max(0.0, float(points_to_use or 0))
    except (TypeError, ValueError):
        points_to_use = 0.0
    max_points_by_total = running / POINTS_VALUE if POINTS_VALUE else 0
    points_used = round(min(points_to_use, available_points, max_points_by_total), 2)
    points_value = round(points_used * POINTS_VALUE, 2)
    running -= points_value

    # Store credit (redeem-code balance), THB
    available_credit = float(user.get("credit", 0) or 0)
    try:
        credit_to_use = max(0.0, float(credit_to_use or 0))
    except (TypeError, ValueError):
        credit_to_use = 0.0
    credit_used = round(min(credit_to_use, available_credit, running), 2)
    running -= credit_used

    total = round(max(0.0, running), 2)
    earned = points_earned(total)

    summary = {
        "subtotal": round(subtotal_original, 2),
        "flash_discount": flash_discount,
        "coupon_discount": coupon_discount,
        "points_used": points_value,
        "credit_used": credit_used,
        "total": total,
        "points_earned": earned,
    }
    return True, {
        "line_items": line_items,
        "summary": summary,
        "discount_percent": discount_percent,
        "coupon_id": coupon_id,
        "points_used_pts": points_used,
        "requires_shipping": requires_shipping,
    }, 200


def _refund_payment(payment_ref):
    """Best-effort refund of a Stripe PaymentIntent (used when we can't fulfil)."""
    if not payment_ref:
        return
    try:
        import stripe
        stripe.Refund.create(payment_intent=payment_ref)
    except Exception as e:
        print("[order] refund failed:", e)


def finalize_order(db, pending, payment_ref=None):
    """Fulfil a paid (or fully-covered) order. Idempotent.

    `pending` is a pending_orders doc. Returns (ok, payload, code).
    """
    pid = pending["_id"]

    # Atomically claim the order so webhook + confirm-redirect can't double-run.
    claimed = db.pending_orders.find_one_and_update(
        {"_id": pid, "status": "awaiting_payment"},
        {"$set": {"status": "finalizing"}},
    )
    if not claimed:
        # Already handled (or in flight) — return the resulting receipt if paid.
        cur = db.pending_orders.find_one({"_id": pid})
        if cur and cur.get("status") == "paid":
            return True, {"status": True, "receiptId": cur.get("receipt_id", pid), "summary": cur.get("summary", {})}, 200
        return False, {"status": False, "msg": "คำสั่งซื้อนี้กำลังถูกดำเนินการอยู่"}, 409

    user_id = pending["user_id"]
    line_items = pending["line_items"]

    # Deduct stock conditionally; roll back + refund if anything is out of stock.
    deducted = []
    for li in line_items:
        res = db.products.update_one(
            {"_id": ObjectId(li["product_id"]), "stock": {"$gte": li["qty"]}},
            {"$inc": {"stock": -li["qty"]}},
        )
        if res.modified_count == 0:
            for done in deducted:
                db.products.update_one({"_id": ObjectId(done["product_id"])}, {"$inc": {"stock": done["qty"]}})
            db.pending_orders.update_one({"_id": pid}, {"$set": {"status": "failed", "fail_reason": "out_of_stock"}})
            _refund_payment(payment_ref)
            push_notification(
                db, user_id,
                title="คำสั่งซื้อไม่สำเร็จ ❌",
                body=f"{li['name']} หมดสต็อกพอดี ระบบได้คืนเงินให้อัตโนมัติแล้ว",
                ntype="error",
            )
            return False, {"status": False, "msg": f"{li['name']} สินค้าหมด — คืนเงินให้อัตโนมัติแล้ว"}, 409
        deducted.append(li)

    summary = pending["summary"]
    points_used_pts = pending.get("points_used_pts", 0)
    credit_used = summary.get("credit_used", 0)
    earned = summary.get("points_earned", 0)

    # Spend points/credit, award earned points
    db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$inc": {"reward": (earned - points_used_pts), "credit": -credit_used}},
    )

    if pending.get("coupon_id"):
        db.coupons.update_one({"_id": pending["coupon_id"]}, {"$inc": {"used_count": 1}})

    # Write the real order docs (one per line, shared receipt id = pending id)
    now = datetime.now(timezone.utc)
    shipping_address = pending.get("shipping_address")
    receipt_items = []
    for li in line_items:
        delivery_type = li.get("delivery_type", "digital")
        # Only digital goods are delivered as a key/code; physical ones get shipped
        key_code = str(uuid.uuid4()).upper() if delivery_type == "digital" else ""
        db.orders.insert_one({
            "_id": str(uuid.uuid4()),
            "receipt_id": pid,
            "user_id": user_id,
            "product_id": ObjectId(li["product_id"]),
            "product_name": li["name"],
            "product_price": li["unit_price"],
            "product_image": li.get("image", ""),
            "product_discount": pending.get("discount_percent", 0),
            "category_name": li.get("cate", ""),
            "quantity": li["qty"],
            "line_total": li["line_total"],
            "key_code": key_code,
            "delivery_type": delivery_type,
            "shipping_address": shipping_address if delivery_type == "physical" else None,
            "status": "pending",
            "paid": True,
            "payment_ref": payment_ref,
            "amount_paid": summary.get("total", 0),
            "dt_purchased": now,
            "refund": False,
        })
        receipt_items.append({
            "name": li["name"], "qty": li["qty"],
            "unit_price": li["unit_price"], "line_total": li["line_total"],
            "key_code": key_code, "delivery_type": delivery_type,
        })

    db.pending_orders.update_one({"_id": pid}, {"$set": {
        "status": "paid", "receipt_id": pid, "paid_at": now, "payment_ref": payment_ref,
    }})

    user = db.users.find_one({"_id": ObjectId(user_id)})
    push_notification(
        db, user_id,
        title="ชำระเงินสำเร็จ 🎉",
        body=f"คำสั่งซื้อ #{str(pid)[:8].upper()} ({summary['total']:.2f} ฿) รับแล้ว กำลังดำเนินการจัดส่ง" +
             (f" · ได้รับ {earned:.2f} แต้ม ⭐" if earned > 0 else ""),
        ntype="success",
    )
    if user:
        try:
            send_order_receipt(user, str(pid), receipt_items, summary, shipping_address)
        except Exception as e:
            print("[order] receipt failed:", e)

    return True, {"status": True, "receiptId": str(pid), "summary": summary}, 200
