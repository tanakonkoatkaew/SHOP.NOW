import os
import uuid
import jwt
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from app.extensions import get_db, limiter
from app.utils.logger import send_discord_log_async
from app.services.order_service import compute_order, finalize_order
from app.services import stripe_service

payment_bp = Blueprint('payment', __name__)
SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "your-secret-key")


def _sget(obj, key, default=None):
    """Read a key from a plain dict OR a StripeObject.

    stripe-python's StripeObject supports [] indexing but (in some versions)
    not .get(), so a shared accessor keeps webhook/confirm code working with
    both verified events (StripeObject) and unverified JSON (dict).
    """
    if obj is None:
        return default
    try:
        val = obj[key]
        return default if val is None else val
    except (KeyError, IndexError, TypeError):
        return getattr(obj, key, default)


# local auth decorator (payment module uses g.user)
def auth_required(f):
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            g.user = payload["user_id"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return wrapper


# ─── STRIPE CHECKOUT ─────────────────────────────────────────────────────────

@payment_bp.route('/checkout-session', methods=['POST'])
@auth_required
def create_checkout_session():
    """Phase 1: price the cart, stash a pending order, and hand back either a
    Stripe Checkout URL or (if fully covered by points/credit) a finished order."""
    db = get_db()
    data = request.json or {}
    items = data.get("items", [])
    if not isinstance(items, list) or not items:
        return jsonify({"status": False, "msg": "ตะกร้าว่างเปล่า"}), 400

    user = db.users.find_one({"_id": ObjectId(g.user)})
    if not user:
        return jsonify({"status": False, "msg": "ไม่พบผู้ใช้"}), 404

    ok, res, code = compute_order(
        db, user, items,
        coupon_code=data.get("coupon_code"),
        points_to_use=data.get("points", 0),
        credit_to_use=data.get("credit", 0),
    )
    if not ok:
        return jsonify(res), code

    # Physical goods need somewhere to ship to — snapshot the chosen address so a
    # later edit to the address book can't rewrite history on a placed order.
    shipping_address = None
    if res["requires_shipping"]:
        addr_id = data.get("address_id")
        addresses = user.get("addresses") or []
        shipping_address = next((a for a in addresses if a.get("id") == addr_id), None)
        if not shipping_address:
            return jsonify({
                "status": False,
                "requires_shipping": True,
                "msg": "กรุณาเลือกที่อยู่จัดส่ง (คำสั่งซื้อนี้มีสินค้าที่ต้องจัดส่ง)",
            }), 400

    summary = res["summary"]
    pending_id = str(uuid.uuid4())
    pending = {
        "_id": pending_id,
        "user_id": g.user,
        "line_items": res["line_items"],
        "summary": summary,
        "discount_percent": res["discount_percent"],
        "coupon_id": res["coupon_id"],
        "coupon_code": (data.get("coupon_code") or "").upper() or None,
        "points_used_pts": res["points_used_pts"],
        "requires_shipping": res["requires_shipping"],
        "shipping_address": shipping_address,
        "status": "awaiting_payment",
        "currency": os.getenv("STRIPE_CURRENCY", "thb"),
        "created_at": datetime.now(timezone.utc),
    }
    db.pending_orders.insert_one(pending)

    # Fully covered by points + store credit → no card payment needed
    if summary["total"] <= 0:
        fok, fres, fcode = finalize_order(db, pending, payment_ref=None)
        if fok:
            fres["paid"] = True
        return jsonify(fres), fcode

    if not stripe_service.is_configured():
        return jsonify({"status": False, "msg": "ระบบชำระเงินยังไม่ได้ตั้งค่า (STRIPE_SECRET_KEY)"}), 503

    base = request.host_url  # ends with '/'
    try:
        session = stripe_service.create_checkout_session(
            pending_id=pending_id,
            amount_thb=summary["total"],
            item_count=len(res["line_items"]),
            success_url=f"{base}checkout/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base}cart?canceled=1",
            customer_email=(user.get("email") or "").strip() or None,
        )
    except Exception as e:
        db.pending_orders.update_one({"_id": pending_id}, {"$set": {"status": "failed", "fail_reason": str(e)}})
        return jsonify({"status": False, "msg": f"สร้างรายการชำระเงินไม่สำเร็จ: {str(e)}"}), 502

    db.pending_orders.update_one({"_id": pending_id}, {"$set": {"session_id": session.id}})
    return jsonify({"status": True, "url": session.url, "pending_id": pending_id})


@payment_bp.route('/confirm', methods=['POST'])
@auth_required
def confirm_payment():
    """Called from the success page — finalize if Stripe says the session is paid.
    Idempotent (also safe alongside the webhook)."""
    db = get_db()
    session_id = (request.json or {}).get("session_id")
    if not session_id:
        return jsonify({"status": False, "msg": "ไม่พบ session_id"}), 400
    try:
        session = stripe_service.retrieve_session(session_id)
    except Exception as e:
        return jsonify({"status": False, "msg": f"ตรวจสอบการชำระเงินไม่สำเร็จ: {str(e)}"}), 502

    if _sget(session, "payment_status") != "paid":
        return jsonify({"status": False, "msg": "ยังไม่ได้รับชำระเงิน"}), 402

    pending_id = _sget(_sget(session, "metadata"), "pending_order_id") or _sget(session, "client_reference_id")
    pending = db.pending_orders.find_one({"_id": pending_id})
    if not pending:
        return jsonify({"status": False, "msg": "ไม่พบคำสั่งซื้อ"}), 404
    if str(pending.get("user_id")) != str(g.user):
        return jsonify({"status": False, "msg": "ไม่มีสิทธิ์เข้าถึงคำสั่งซื้อนี้"}), 403

    ok, res, code = finalize_order(db, pending, payment_ref=_sget(session, "payment_intent"))
    return jsonify(res), code


@payment_bp.route('/stripe/webhook', methods=['POST'])
def stripe_webhook():
    """Stripe → us. Verifies signature and finalizes on checkout.session.completed."""
    db = get_db()
    payload = request.get_data()
    sig = request.headers.get("Stripe-Signature", "")

    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    try:
        if secret:
            event = stripe_service.construct_webhook_event(payload, sig)
        else:
            # No signing secret configured (e.g. before setup) — parse unverified.
            import json
            event = json.loads(payload)
    except Exception as e:
        return jsonify({"error": f"Invalid webhook: {str(e)}"}), 400

    etype = _sget(event, "type")
    if etype == "checkout.session.completed":
        data = _sget(event, "data")
        session = _sget(data, "object")
        if _sget(session, "payment_status") == "paid":
            pending_id = _sget(_sget(session, "metadata"), "pending_order_id") or _sget(session, "client_reference_id")
            pending = db.pending_orders.find_one({"_id": pending_id})
            if pending:
                finalize_order(db, pending, payment_ref=_sget(session, "payment_intent"))

    return jsonify({"received": True}), 200


# ─── REDEEM CODE (store credit / gift card) ──────────────────────────────────

@payment_bp.route('/redeem-code', methods=['POST'])
@limiter.limit("5 per minute")    # กันการเดาโค้ดของขวัญ
@auth_required
def redeem_code():
    data = request.json or {}
    code = data.get('code', '').strip().upper()
    if not code:
        return jsonify({"status": False, "message": "กรุณากรอกรหัส"}), 400

    db = get_db()
    topup_code = db.topup_codes.find_one({"code": code})
    if not topup_code:
        return jsonify({"status": False, "message": "รหัสไม่ถูกต้อง"}), 404
    if topup_code.get("used"):
        return jsonify({"status": False, "message": "รหัสนี้ถูกใช้ไปแล้ว"}), 400

    user_id = ObjectId(g.user)
    user = db.users.find_one({"_id": user_id})
    if not user:
        return jsonify({"status": False, "message": "ไม่พบ user"}), 500

    # Mark used first (guards against double-use), then grant store credit
    result = db.topup_codes.update_one({"code": code, "used": {"$ne": True}}, {"$set": {"used": True, "used_by": g.user}})
    if result.modified_count == 0:
        return jsonify({"status": False, "message": "รหัสนี้ถูกใช้ไปแล้ว"}), 400
    db.users.update_one({"_id": user_id}, {"$inc": {"credit": topup_code["amount"]}})
    new_balance = float(user.get("credit", 0)) + topup_code["amount"]

    try:
        send_discord_log_async(
            event_type="🎁 ใช้โค้ดเติม Store Credit",
            request_headers=dict(request.headers),
            ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
            host_url=request.host_url,
            referrer=request.referrer,
            data={"User": user.get("username", "—"), "Amount": f"{topup_code['amount']:.2f} ฿", "Code": code},
        )
    except Exception:
        pass

    return jsonify({
        "status": True,
        "message": f"เติม Store Credit สำเร็จ {topup_code['amount']:.2f} บาท",
        "new_balance": new_balance,
    })
