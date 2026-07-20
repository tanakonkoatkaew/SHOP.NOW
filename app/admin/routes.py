import os
import uuid
import string
import secrets
from datetime import datetime, timezone, timedelta
from PIL import Image
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
    # Revenue = money actually collected on paid orders (Stripe + store credit)
    paid = list(db.pending_orders.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$summary.total"}}}
    ]))
    revenue = paid[0]["total"] if paid else 0

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
        "total_revenue": round(revenue, 2),
        "orders":        db.orders.count_documents({}),
        "pending_orders": pending_orders,
        "points_outstanding": points_outstanding,
        "top_products":  top_products,
        "revenue_by_day": revenue_by_day,
        "sales_by_category": sales_by_category,
    })


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

    # content check — extension alone is spoofable
    try:
        img = Image.open(file.stream)
        img.verify()
    except Exception:
        return jsonify({"status": False, "message": "ไฟล์ไม่ใช่รูปภาพที่ถูกต้อง"}), 400
    file.stream.seek(0)   # verify() consumes the stream

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
            "delivery_type": p.get("delivery_type", "digital"),
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
        "delivery_type": ("physical" if data.get("delivery_type") == "physical" else "digital"),
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
    if "delivery_type" in data:
        updates["delivery_type"] = "physical" if data["delivery_type"] == "physical" else "digital"

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
                "shipping_address": None,
            }
            order.append(rid)
        line_total = o.get("line_total")
        if line_total is None:
            line_total = float(o.get("product_price", 0)) * int(o.get("quantity", 1))
        receipts[rid]["items"].append({
            "name": o.get("product_name", ""),
            "quantity": o.get("quantity", 1),
            "delivery_type": o.get("delivery_type", "digital"),
        })
        if o.get("shipping_address") and not receipts[rid]["shipping_address"]:
            receipts[rid]["shipping_address"] = o["shipping_address"]
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


# ─── STORE CREDIT: gift codes & manual adjustment ────────────────────────────

_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _gen_topup_code():
    part = lambda: ''.join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    return f"SN-{part()}-{part()}"


@admin_bp.route('/topup-codes', methods=['GET'])
@admin_required
def list_topup_codes():
    db = get_db()
    docs = list(db.topup_codes.find().sort([("created_at", -1), ("_id", -1)]).limit(500))

    # resolve used_by user ids -> usernames
    usernames = {}
    for d in docs:
        uid = d.get("used_by")
        if uid and uid not in usernames:
            try:
                u = db.users.find_one({"_id": ObjectId(uid)})
                usernames[uid] = u.get("username", "—") if u else "—"
            except Exception:
                usernames[uid] = "—"

    results = []
    for d in docs:
        results.append({
            "id":         str(d["_id"]),
            "code":       d.get("code", ""),
            "amount":     float(d.get("amount", 0)),
            "used":       bool(d.get("used", False)),
            "used_by":    usernames.get(d.get("used_by"), ""),
            "created_at": d["created_at"].isoformat() if d.get("created_at") else "",
        })
    return jsonify({"status": True, "results": results})


@admin_bp.route('/topup-codes', methods=['POST'])
@admin_required
def create_topup_codes():
    db = get_db()
    data = request.json or {}

    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        amount = 0
    if amount <= 0:
        return jsonify({"status": False, "message": "จำนวนเงินต้องมากกว่า 0"}), 400
    if amount > 100000:
        return jsonify({"status": False, "message": "จำนวนเงินสูงสุด 100,000 ฿ ต่อโค้ด"}), 400

    try:
        count = int(data.get("count", 1))
    except (TypeError, ValueError):
        count = 1
    count = max(1, min(count, 50))

    custom = (data.get("code") or "").strip().upper()
    if custom:
        if db.topup_codes.find_one({"code": custom}):
            return jsonify({"status": False, "message": "โค้ดนี้มีอยู่แล้ว"}), 400
        codes = [custom]
    else:
        codes = []
        while len(codes) < count:
            c = _gen_topup_code()
            if c not in codes and not db.topup_codes.find_one({"code": c}):
                codes.append(c)

    now = datetime.now(timezone.utc)
    for c in codes:
        db.topup_codes.insert_one({
            "code":       c,
            "amount":     round(amount, 2),
            "used":       False,
            "created_at": now,
            "created_by": g.user_id,
        })
    return jsonify({"status": True, "codes": codes})


@admin_bp.route('/topup-codes/<code_id>', methods=['DELETE'])
@admin_required
def delete_topup_code(code_id):
    db = get_db()
    try:
        oid = ObjectId(code_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    code = db.topup_codes.find_one({"_id": oid})
    if not code:
        return jsonify({"status": False, "message": "ไม่พบโค้ด"}), 404
    if code.get("used"):
        return jsonify({"status": False, "message": "โค้ดนี้ถูกใช้ไปแล้ว ลบไม่ได้"}), 400

    db.topup_codes.delete_one({"_id": oid})
    return jsonify({"status": True, "message": "ลบโค้ดแล้ว"})


@admin_bp.route('/users/<user_id>/credit', methods=['POST'])
@admin_required
def adjust_user_credit(user_id):
    db = get_db()
    data = request.json or {}

    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        amount = 0
    if amount == 0:
        return jsonify({"status": False, "message": "จำนวนต้องไม่เป็น 0"}), 400
    if abs(amount) > 100000:
        return jsonify({"status": False, "message": "ปรับได้ครั้งละไม่เกิน 100,000 ฿"}), 400
    amount = round(amount, 2)
    note = (data.get("note") or "").strip()

    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    user = db.users.find_one({"_id": oid})
    if not user:
        return jsonify({"status": False, "message": "ไม่พบผู้ใช้"}), 404

    if amount < 0:
        # conditional update so the balance can never go negative
        res = db.users.update_one(
            {"_id": oid, "credit": {"$gte": -amount}},
            {"$inc": {"credit": amount}},
        )
        if res.modified_count == 0:
            return jsonify({
                "status": False,
                "message": f"เครดิตไม่พอหัก (คงเหลือ {float(user.get('credit', 0)):.2f} ฿)",
            }), 400
    else:
        db.users.update_one({"_id": oid}, {"$inc": {"credit": amount}})

    # audit trail
    db.credit_adjustments.insert_one({
        "user_id":    oid,
        "amount":     amount,
        "note":       note,
        "admin_id":   g.user_id,
        "created_at": datetime.now(timezone.utc),
    })

    if amount > 0:
        push_notification(
            db, user_id,
            title="ได้รับ Store Credit 💰",
            body=f"แอดมินเพิ่มเครดิตให้ {amount:,.2f} ฿" + (f" — {note}" if note else ""),
            ntype="success",
        )
    else:
        push_notification(
            db, user_id,
            title="Store Credit ถูกปรับ",
            body=f"แอดมินหักเครดิต {abs(amount):,.2f} ฿" + (f" — {note}" if note else ""),
            ntype="info",
        )

    updated = db.users.find_one({"_id": oid})
    return jsonify({"status": True, "new_credit": float(updated.get("credit", 0))})


# ─── REVIEW MODERATION ───────────────────────────────────────────────────────

@admin_bp.route('/reviews/<review_id>', methods=['DELETE'])
@admin_required
def delete_review(review_id):
    db = get_db()
    try:
        oid = ObjectId(review_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    res = db.reviews.delete_one({"_id": oid})
    if res.deleted_count == 0:
        return jsonify({"status": False, "message": "ไม่พบรีวิว"}), 404
    return jsonify({"status": True, "message": "ลบรีวิวแล้ว"})
