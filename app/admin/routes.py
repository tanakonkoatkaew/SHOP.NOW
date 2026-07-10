import os
import uuid
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from app.extensions import get_db
from app.middlewares import admin_required
from app.utils.notify import push_notification
from app.utils.coupons import coupon_usable
from app.utils.pricing import effective_price
from app.utils.receipt import send_status_update, ORDER_STATUSES, STATUS_LABEL

admin_bp = Blueprint('admin', __name__)


def _parse_dt(value):
    """Parse an ISO / datetime-local string into an aware UTC datetime, or None."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

SLIP_FOLDER    = os.path.join(os.path.dirname(__file__), '..', 'static', 'uploads', 'slips')
PRODUCT_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'static', 'uploads', 'products')
UPLOAD_FOLDER  = SLIP_FOLDER  # legacy alias


# ─── DASHBOARD STATS ─────────────────────────────────────────────────────────

@admin_bp.route('/stats', methods=['GET'])
@admin_required
def stats():
    db = get_db()
    pending_slips = db.pending_qr_payments.count_documents({"status": "pending_review"})
    total_approved = list(db.pending_qr_payments.aggregate([
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]))
    revenue = total_approved[0]["total"] if total_approved else 0

    # Best-selling products (by number of orders / quantity)
    best_sellers = list(db.orders.aggregate([
        {"$group": {
            "_id": "$product_name",
            "qty": {"$sum": {"$ifNull": ["$quantity", 1]}},
            "orders": {"$sum": 1},
        }},
        {"$sort": {"qty": -1}},
        {"$limit": 5},
    ]))
    top_products = [
        {"name": b["_id"] or "—", "qty": b.get("qty", 0), "orders": b.get("orders", 0)}
        for b in best_sellers
    ]

    # Revenue over the last 14 days (by order line_total, falling back to price*qty)
    since = datetime.now(timezone.utc) - timedelta(days=13)
    daily_raw = list(db.orders.aggregate([
        {"$match": {"dt_purchased": {"$gte": since}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$dt_purchased"}},
            "revenue": {"$sum": {"$ifNull": ["$line_total", {"$multiply": ["$product_price", {"$ifNull": ["$quantity", 1]}]}]}},
            "orders": {"$sum": 1},
        }},
    ]))
    daily_map = {d["_id"]: d for d in daily_raw}
    revenue_by_day = []
    for i in range(14):
        day = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        d = daily_map.get(day, {})
        revenue_by_day.append({
            "date": day,
            "revenue": round(d.get("revenue", 0), 2),
            "orders": d.get("orders", 0),
        })

    # Sales split by category
    cat_raw = list(db.orders.aggregate([
        {"$group": {
            "_id": "$category_name",
            "qty": {"$sum": {"$ifNull": ["$quantity", 1]}},
            "revenue": {"$sum": {"$ifNull": ["$line_total", {"$multiply": ["$product_price", {"$ifNull": ["$quantity", 1]}]}]}},
        }},
        {"$sort": {"revenue": -1}},
    ]))
    sales_by_category = [
        {"cate": c["_id"] or "อื่นๆ", "qty": c.get("qty", 0), "revenue": round(c.get("revenue", 0), 2)}
        for c in cat_raw
    ]

    # Orders awaiting fulfilment (not yet completed / terminal)
    pending_orders = db.orders.count_documents({"status": {"$in": ["pending", "processing", "shipped"]}})

    # Loyalty points currently held across all users
    pts = list(db.users.aggregate([{"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$reward", 0]}}}}]))
    points_outstanding = round(pts[0]["total"], 2) if pts else 0

    return jsonify({
        "status": True,
        "users":         db.users.count_documents({}),
        "products":      db.products.count_documents({}),
        "pending_slips": pending_slips,
        "total_revenue": round(revenue, 2),
        "orders":        db.orders.count_documents({}),
        "pending_orders": pending_orders,
        "points_outstanding": points_outstanding,
        "top_products":  top_products,
        "revenue_by_day": revenue_by_day,
        "sales_by_category": sales_by_category,
    })


# ─── SLIP MANAGEMENT ─────────────────────────────────────────────────────────

@admin_bp.route('/slips', methods=['GET'])
@admin_required
def list_slips():
    db = get_db()
    status = request.args.get("status", "pending_review")
    query = {"slip_uploaded": True} if status == "all" else {"status": status}

    payments = db.pending_qr_payments.find(query).sort("created_at", -1).limit(200)
    results = []
    for p in payments:
        results.append({
            "ref":           p["_id"],
            "user_id":       str(p.get("user_id", "")),
            "username":      p.get("username", "—"),
            "amount":        p.get("amount", 0),
            "status":        p.get("status", ""),
            "created_at":    p["created_at"].isoformat() if p.get("created_at") else "",
            "slip_image_url": p.get("slip_image_url", ""),
        })
    return jsonify({"status": True, "results": results})


@admin_bp.route('/slips/<ref>/approve', methods=['POST'])
@admin_required
def approve_slip(ref):
    db = get_db()
    payment = db.pending_qr_payments.find_one({"_id": ref})
    if not payment:
        return jsonify({"status": False, "message": "ไม่พบรายการ"}), 404
    if payment.get("status") not in ("pending_review", "pending"):
        return jsonify({"status": False, "message": "รายการนี้ไม่ได้รอตรวจสอบ"}), 400

    db.users.update_one(
        {"_id": payment["user_id"]},
        {"$inc": {"credit": payment["amount"]}}
    )
    db.pending_qr_payments.update_one({"_id": ref}, {"$set": {
        "status": "approved",
        "credited": True,
        "approved_at": datetime.now(timezone.utc),
    }})
    push_notification(
        db, payment["user_id"],
        title="เติมเงินสำเร็จ ✅",
        body=f"ยอด {payment['amount']:.2f} ฿ ถูกเพิ่มเข้าบัญชีของคุณเรียบร้อยแล้ว",
        ntype="success",
    )
    return jsonify({"status": True, "message": f"อนุมัติ {payment['amount']:.2f} ฿ ให้ {payment.get('username','')} แล้ว"})


@admin_bp.route('/slips/<ref>/reject', methods=['POST'])
@admin_required
def reject_slip(ref):
    db = get_db()
    payment = db.pending_qr_payments.find_one({"_id": ref})
    if not payment:
        return jsonify({"status": False, "message": "ไม่พบรายการ"}), 404

    reason = request.json.get("reason", "") if request.is_json else ""
    db.pending_qr_payments.update_one({"_id": ref}, {"$set": {
        "status": "rejected",
        "reject_reason": reason,
        "rejected_at": datetime.now(timezone.utc),
    }})
    push_notification(
        db, payment["user_id"],
        title="สลิปเติมเงินถูกปฏิเสธ ❌",
        body=(f"เหตุผล: {reason}" if reason else "กรุณาตรวจสอบสลิปและลองใหม่อีกครั้ง"),
        ntype="error",
    )
    return jsonify({"status": True, "message": "ปฏิเสธสลิปแล้ว"})


# ─── PRODUCT IMAGE UPLOAD ────────────────────────────────────────────────────

ALLOWED_IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}

@admin_bp.route('/products/upload-image', methods=['POST'])
@admin_required
def upload_product_image():
    if 'image' not in request.files:
        return jsonify({"status": False, "message": "ไม่ได้แนบไฟล์"}), 400
    file = request.files['image']
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        return jsonify({"status": False, "message": "รองรับเฉพาะ JPG, PNG, GIF, WEBP"}), 400
    os.makedirs(PRODUCT_FOLDER, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    file.save(os.path.join(PRODUCT_FOLDER, filename))
    return jsonify({"status": True, "url": f"/static/uploads/products/{filename}"})


# ─── PRODUCT MANAGEMENT ──────────────────────────────────────────────────────

@admin_bp.route('/products', methods=['GET'])
@admin_required
def list_products():
    db = get_db()
    products = db.products.find().sort("name", 1)
    results = []
    for p in products:
        ep = effective_price(p)
        start = p.get("sale_start")
        end = p.get("sale_end")
        results.append({
            "id":          str(p["_id"]),
            "name":        p.get("name", ""),
            "price":       p.get("price", 0),
            "image":       p.get("image", ""),
            "cate":        p.get("cate", ""),
            "stock":       p.get("stock", 0),
            "warranty":    p.get("warranty", False),
            "description": p.get("description", ""),
            "sale_price":  p.get("sale_price", 0) or 0,
            "sale_start":  start.isoformat() if hasattr(start, "isoformat") else (start or ""),
            "sale_end":    end.isoformat() if hasattr(end, "isoformat") else (end or ""),
            "on_sale":     ep["on_sale"],
        })
    return jsonify({"status": True, "results": results})


@admin_bp.route('/products', methods=['POST'])
@admin_required
def create_product():
    db = get_db()
    data = request.json or {}
    if not data.get("name") or not data.get("price"):
        return jsonify({"status": False, "message": "กรุณากรอก name และ price"}), 400

    doc = {
        "name":        data["name"],
        "price":       float(data["price"]),
        "image":       data.get("image", ""),
        "cate":        data.get("cate", "other"),
        "stock":       int(data.get("stock", 0)),
        "warranty":    bool(data.get("warranty", False)),
        "description": data.get("description", ""),
        "sale_price":  float(data.get("sale_price") or 0),
        "sale_start":  _parse_dt(data.get("sale_start")),
        "sale_end":    _parse_dt(data.get("sale_end")),
    }
    result = db.products.insert_one(doc)
    return jsonify({"status": True, "id": str(result.inserted_id), "message": "เพิ่มสินค้าสำเร็จ"})


@admin_bp.route('/products/<product_id>', methods=['PUT'])
@admin_required
def update_product(product_id):
    db = get_db()
    data = request.json or {}
    try:
        oid = ObjectId(product_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    updates = {}
    if "name"        in data: updates["name"]        = data["name"]
    if "price"       in data: updates["price"]       = float(data["price"])
    if "image"       in data: updates["image"]       = data["image"]
    if "cate"        in data: updates["cate"]        = data["cate"]
    if "stock"       in data: updates["stock"]       = int(data["stock"])
    if "warranty"    in data: updates["warranty"]    = bool(data["warranty"])
    if "description" in data: updates["description"] = data["description"]
    if "sale_price"  in data: updates["sale_price"]  = float(data.get("sale_price") or 0)
    if "sale_start"  in data: updates["sale_start"]  = _parse_dt(data.get("sale_start"))
    if "sale_end"    in data: updates["sale_end"]    = _parse_dt(data.get("sale_end"))

    db.products.update_one({"_id": oid}, {"$set": updates})
    return jsonify({"status": True, "message": "อัพเดทสินค้าสำเร็จ"})


@admin_bp.route('/products/<product_id>', methods=['DELETE'])
@admin_required
def delete_product(product_id):
    db = get_db()
    try:
        oid = ObjectId(product_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    db.products.delete_one({"_id": oid})
    return jsonify({"status": True, "message": "ลบสินค้าสำเร็จ"})


# ─── TRUEMONEY VOUCHER MANAGEMENT ────────────────────────────────────────────

@admin_bp.route('/truemoney', methods=['GET'])
@admin_required
def list_truemoney():
    db = get_db()
    status = request.args.get("status", "pending_review")
    query = {} if status == "all" else {"status": status}
    vouchers = db.truemoney_vouchers.find(query).sort("created_at", -1).limit(200)
    results = []
    for v in vouchers:
        results.append({
            "id":           str(v["_id"]),
            "username":     v.get("username", "—"),
            "user_id":      str(v.get("user_id", "")),
            "voucher_hash": v.get("voucher_hash", ""),
            "voucher_url":  v.get("voucher_url", ""),
            "amount":       v.get("amount"),
            "status":       v.get("status", ""),
            "auto_redeemed": v.get("auto_redeemed", False),
            "created_at":   v["created_at"].isoformat() if v.get("created_at") else "",
        })
    return jsonify({"status": True, "results": results})


@admin_bp.route('/truemoney/<voucher_id>/approve', methods=['POST'])
@admin_required
def approve_truemoney(voucher_id):
    db = get_db()
    try:
        oid = ObjectId(voucher_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    voucher = db.truemoney_vouchers.find_one({"_id": oid})
    if not voucher:
        return jsonify({"status": False, "message": "ไม่พบรายการ"}), 404
    if voucher.get("status") != "pending_review":
        return jsonify({"status": False, "message": "รายการนี้ไม่ได้รอตรวจสอบ"}), 400

    data = request.json or {}
    amount = float(data.get("amount", 0))
    if amount <= 0:
        return jsonify({"status": False, "message": "กรุณาระบุจำนวนเงิน"}), 400

    db.users.update_one({"_id": voucher["user_id"]}, {"$inc": {"credit": amount}})
    db.truemoney_vouchers.update_one({"_id": oid}, {"$set": {
        "status":      "approved",
        "amount":      amount,
        "approved_at": datetime.now(timezone.utc),
    }})
    push_notification(
        db, voucher["user_id"],
        title="เติมเงินสำเร็จ ✅",
        body=f"ซองอั่งเปา {amount:.2f} ฿ ถูกเพิ่มเข้าบัญชีของคุณเรียบร้อยแล้ว",
        ntype="success",
    )
    return jsonify({"status": True, "message": f"เติมเงิน {amount:.2f} ฿ ให้ {voucher.get('username','')} แล้ว"})


@admin_bp.route('/truemoney/<voucher_id>/reject', methods=['POST'])
@admin_required
def reject_truemoney(voucher_id):
    db = get_db()
    try:
        oid = ObjectId(voucher_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    voucher = db.truemoney_vouchers.find_one({"_id": oid})
    if not voucher:
        return jsonify({"status": False, "message": "ไม่พบรายการ"}), 404

    reason = (request.json or {}).get("reason", "")
    db.truemoney_vouchers.update_one({"_id": oid}, {"$set": {
        "status":        "rejected",
        "reject_reason": reason,
        "rejected_at":   datetime.now(timezone.utc),
    }})
    push_notification(
        db, voucher["user_id"],
        title="ซองอั่งเปาถูกปฏิเสธ ❌",
        body=(f"เหตุผล: {reason}" if reason else "กรุณาตรวจสอบซองอั่งเปาและลองใหม่อีกครั้ง"),
        ntype="error",
    )
    return jsonify({"status": True, "message": "ปฏิเสธซองอั่งเป่าแล้ว"})


# ─── COUPON MANAGEMENT ───────────────────────────────────────────────────────

@admin_bp.route('/coupons', methods=['GET'])
@admin_required
def list_coupons():
    db = get_db()
    coupons = db.coupons.find().sort("_id", -1).limit(500)
    results = []
    for c in coupons:
        results.append({
            "id":         str(c["_id"]),
            "code":       c.get("code", ""),
            "discount":   float(c.get("discount", 0)),
            "msg":        c.get("msg", ""),
            "active":     bool(c.get("active", True)) and not c.get("used", False),
            "max_uses":   int(c.get("max_uses", 0) or 0),
            "used_count": int(c.get("used_count", 0) or 0),
            "usable":     coupon_usable(c),
        })
    return jsonify({"status": True, "results": results})


@admin_bp.route('/coupons', methods=['POST'])
@admin_required
def create_coupon():
    db = get_db()
    data = request.json or {}
    code = (data.get("code") or "").strip().upper()
    if not code:
        return jsonify({"status": False, "message": "กรุณากรอกโค้ดคูปอง"}), 400

    try:
        discount = float(data.get("discount", 0))
    except (TypeError, ValueError):
        return jsonify({"status": False, "message": "ส่วนลดไม่ถูกต้อง"}), 400
    if discount <= 0 or discount > 100:
        return jsonify({"status": False, "message": "ส่วนลดต้องอยู่ระหว่าง 1–100%"}), 400

    try:
        max_uses = int(data.get("max_uses", 0) or 0)
    except (TypeError, ValueError):
        max_uses = 0
    if max_uses < 0:
        max_uses = 0

    if db.coupons.find_one({"code": code}):
        return jsonify({"status": False, "message": "โค้ดนี้มีอยู่แล้ว"}), 400

    doc = {
        "code":       code,
        "discount":   discount,
        "msg":        data.get("msg", f"ส่วนลด {discount:.0f}%"),
        "active":     bool(data.get("active", True)),
        "max_uses":   max_uses,
        "used_count": 0,
    }
    result = db.coupons.insert_one(doc)
    return jsonify({"status": True, "id": str(result.inserted_id), "message": "สร้างคูปองสำเร็จ"})


@admin_bp.route('/coupons/<coupon_id>', methods=['PUT'])
@admin_required
def update_coupon(coupon_id):
    db = get_db()
    try:
        oid = ObjectId(coupon_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    data = request.json or {}
    updates = {}
    if "active" in data:
        updates["active"] = bool(data["active"])
        updates["used"] = False   # clear any legacy one-shot lock when re-enabling
    if "msg" in data:
        updates["msg"] = data["msg"]
    if "max_uses" in data:
        try:
            updates["max_uses"] = max(0, int(data["max_uses"]))
        except (TypeError, ValueError):
            pass
    if not updates:
        return jsonify({"status": False, "message": "ไม่มีข้อมูลให้แก้ไข"}), 400

    result = db.coupons.update_one({"_id": oid}, {"$set": updates})
    if result.matched_count == 0:
        return jsonify({"status": False, "message": "ไม่พบคูปอง"}), 404
    return jsonify({"status": True, "message": "อัปเดตคูปองแล้ว"})


@admin_bp.route('/coupons/<coupon_id>', methods=['DELETE'])
@admin_required
def delete_coupon(coupon_id):
    db = get_db()
    try:
        oid = ObjectId(coupon_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400
    result = db.coupons.delete_one({"_id": oid})
    if result.deleted_count == 0:
        return jsonify({"status": False, "message": "ไม่พบคูปอง"}), 404
    return jsonify({"status": True, "message": "ลบคูปองแล้ว"})


# ─── USER MANAGEMENT ─────────────────────────────────────────────────────────

@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    db = get_db()
    users = db.users.find().sort("username", 1)
    results = []
    for u in users:
        results.append({
            "id":       str(u["_id"]),
            "username": u.get("username", ""),
            "email":    u.get("email", ""),
            "credit":   float(u.get("credit", 0)),
            "reward":   float(u.get("reward", 0)),
            "is_admin": bool(u.get("is_admin", False)),
        })
    return jsonify({"status": True, "results": results})


@admin_bp.route('/users/<user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    db = get_db()
    data = request.json or {}
    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    updates = {}
    if "credit"   in data: updates["credit"]   = float(data["credit"])
    if "reward"   in data: updates["reward"]   = float(data["reward"])
    if "is_admin" in data: updates["is_admin"] = bool(data["is_admin"])

    db.users.update_one({"_id": oid}, {"$set": updates})
    return jsonify({"status": True, "message": "อัพเดทผู้ใช้สำเร็จ"})


@admin_bp.route('/users/<user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    if user_id == g.user_id:
        return jsonify({"status": False, "message": "ไม่สามารถลบบัญชีตัวเองได้"}), 400

    db.users.delete_one({"_id": oid})
    return jsonify({"status": True, "message": "ลบผู้ใช้สำเร็จ"})


# ─── USER ORDERS ─────────────────────────────────────────────────────────────

@admin_bp.route('/users/<user_id>/orders', methods=['GET'])
@admin_required
def list_user_orders(user_id):
    db = get_db()
    orders = db.orders.find({"user_id": user_id}).sort("dt_purchased", -1)
    results = []
    for o in orders:
        purchased_at = o.get("dt_purchased")
        if purchased_at and hasattr(purchased_at, 'strftime'):
            purchased_at = purchased_at.strftime('%Y-%m-%d %H:%M:%S')
        elif purchased_at:
            purchased_at = str(purchased_at)
        else:
            purchased_at = ""
            
        results.append({
            "id": o.get("_id"),
            "product_name": o.get("product_name", ""),
            "product_price": o.get("product_price", 0),
            "product_image": o.get("product_image", ""),
            "quantity": o.get("quantity", 1),
            "status": o.get("status", "completed"),
            "dt_purchased": purchased_at,
            "refund": o.get("refund", False)
        })
    return jsonify({"status": True, "results": results})


# ─── ORDER / FULFILMENT MANAGEMENT ───────────────────────────────────────────

@admin_bp.route('/orders', methods=['GET'])
@admin_required
def list_orders():
    """All orders grouped by receipt, most recent first (optional ?status=)."""
    db = get_db()
    status = request.args.get("status", "all")
    query = {} if status == "all" else {"status": status}
    docs = db.orders.find(query).sort("dt_purchased", -1).limit(500)

    receipts = {}
    order = []
    for o in docs:
        rid = o.get("receipt_id") or o["_id"]
        purchased = o.get("dt_purchased")
        purchased_str = purchased.strftime('%Y-%m-%d %H:%M:%S') if hasattr(purchased, "strftime") else str(purchased or "")
        if rid not in receipts:
            receipts[rid] = {
                "receipt_id": rid,
                "user_id": str(o.get("user_id", "")),
                "status": o.get("status", "completed"),
                "dt_purchased": purchased_str,
                "items": [],
                "total": 0.0,
            }
            order.append(rid)
        line_total = o.get("line_total")
        if line_total is None:
            line_total = float(o.get("product_price", 0)) * int(o.get("quantity", 1))
        receipts[rid]["items"].append({
            "name": o.get("product_name", ""),
            "quantity": o.get("quantity", 1),
        })
        receipts[rid]["total"] += float(line_total)

    # Attach usernames
    user_ids = {receipts[r]["user_id"] for r in order if receipts[r]["user_id"]}
    name_map = {}
    for uid in user_ids:
        try:
            u = db.users.find_one({"_id": ObjectId(uid)}, {"username": 1})
            if u:
                name_map[uid] = u.get("username", "")
        except Exception:
            pass
    for r in order:
        receipts[r]["username"] = name_map.get(receipts[r]["user_id"], "—")

    return jsonify({"status": True, "results": [receipts[r] for r in order]})


@admin_bp.route('/orders/<receipt_id>/status', methods=['POST'])
@admin_required
def update_order_status(receipt_id):
    db = get_db()
    new_status = ((request.json or {}).get("status") or "").strip()
    valid = set(ORDER_STATUSES) | {"refunded", "cancelled"}
    if new_status not in valid:
        return jsonify({"status": False, "message": "สถานะไม่ถูกต้อง"}), 400

    # Orders created before receipt grouping fall back to their own _id
    match = {"$or": [{"receipt_id": receipt_id}, {"_id": receipt_id}]}
    orders = list(db.orders.find(match))
    if not orders:
        return jsonify({"status": False, "message": "ไม่พบคำสั่งซื้อ"}), 404

    set_fields = {"status": new_status}
    if new_status == "refunded":
        set_fields["refund"] = True
    db.orders.update_many(match, {"$set": set_fields})

    user_id = orders[0].get("user_id")
    item_names = [o.get("product_name", "") for o in orders]
    label = STATUS_LABEL.get(new_status, new_status)
    if user_id:
        push_notification(
            db, user_id,
            title=f"อัปเดตคำสั่งซื้อ: {label}",
            body=f"คำสั่งซื้อ #{str(receipt_id)[:8].upper()} เปลี่ยนสถานะเป็น \"{label}\"",
            ntype="info" if new_status not in ("refunded", "cancelled") else "warning",
        )
        try:
            user = db.users.find_one({"_id": ObjectId(user_id)})
            if user:
                send_status_update(user, str(receipt_id), new_status, item_names)
        except Exception as e:
            print("[admin] status email failed:", e)

    return jsonify({"status": True, "message": f"อัปเดตสถานะเป็น \"{label}\" แล้ว"})
