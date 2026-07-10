from flask import Blueprint, jsonify, request, g
from app.extensions import get_db
from app.middlewares import auth_required
from datetime import datetime, timezone
from bson import ObjectId
import uuid
from app.utils.logger import send_discord_log_async
from app.utils.notify import push_notification
from app.utils.coupons import coupon_usable, coupon_remaining
from app.utils.pricing import effective_price, points_earned, POINTS_VALUE
from app.utils.receipt import send_order_receipt

product_bp = Blueprint('product', __name__)

# ✅ ดึงสินค้าทั้งหมด
@product_bp.route('/product', methods=['GET'])
def get_products():
    db = get_db()
    products_data = db.products.find()
    products = []
    for p in products_data:
        ep = effective_price(p)
        products.append({
            "id": str(p["_id"]),  # ✅ แปลง ObjectId เป็น string
            "name": p["name"],
            "price": ep["price"],                 # ราคาที่จ่ายจริงตอนนี้ (รวม flash sale)
            "original_price": ep["original"],
            "on_sale": ep["on_sale"],
            "sale_end": ep["sale_end"],
            "image": p["image"],
            "cate": p["cate"],
            "stock": int(p.get("stock", 0)),
            "description": p.get("description", ""),
        })
    return jsonify({"status": True, "results": products})


# ✅ สถิติสาธารณะสำหรับหน้าแรก (ไม่ต้องล็อกอิน)
def _pseudo_rating(text):
    """Mirror of the frontend ProductCard pseudoRating (int32 hash)."""
    h = 0
    for c in str(text):
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    if h >= 0x80000000:          # emulate JS signed Int32
        h -= 0x100000000
    return 3.5 + (abs(h) % 16) / 10


@product_bp.route('/stats', methods=['GET'])
def public_stats():
    db = get_db()
    products = list(db.products.find({}, {"_id": 1, "name": 1}))
    product_count = len(products)
    customers = db.users.count_documents({})

    if products:
        avg = sum(_pseudo_rating(str(p["_id"]) or p.get("name", "")) for p in products) / len(products)
    else:
        avg = 4.8

    return jsonify({
        "status":     True,
        "products":   product_count,
        "customers":  customers,
        "orders":     db.orders.count_documents({}),
        "avg_rating": round(avg, 1),
    })


# ✅ ดึงข้อมูลสินค้าแบบละเอียด
@product_bp.route('/product/<category_id>/<product_id>', methods=['GET'])
def get_product_detail(category_id, product_id):
    db = get_db()

    try:
        product = db.products.find_one({
            "_id": ObjectId(product_id),
            "cate": category_id
        })
    except Exception:
        return jsonify({"status": False, "message": "ID สินค้าไม่ถูกต้อง"}), 400

    if not product:
        return jsonify({"status": False, "message": "ไม่พบสินค้า"}), 404

    ep = effective_price(product)
    return jsonify({
        "status": True,
        "result": {
            "id": str(product["_id"]),
            "name": product["name"],
            "price": ep["price"],
            "original_price": ep["original"],
            "on_sale": ep["on_sale"],
            "sale_end": ep["sale_end"],
            "image": product["image"],
            "cate": product.get("cate", ""),
            "description": product.get("description", ""),
            "warranty": product.get("warranty", False),
            "stock": product.get("stock", 0)
        }
    })


# ─── SHARED CHECKOUT ENGINE ──────────────────────────────────────────────────

def _process_checkout(db, user_id, raw_items, coupon_code=None, points_to_use=0):
    """Process an order of one or more line items.

    raw_items: list of {"product_id": str, "qty": int}
    Discount stacking order: flash sale (per unit) → coupon (% of subtotal)
    → reward points (baht, 1 point = POINTS_VALUE ฿). Returns (ok, payload, http_code).
    """
    user = db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return False, {"status": False, "msg": "ไม่พบผู้ใช้"}, 404

    # 1. Normalise & validate items, resolve live prices
    line_items = []
    subtotal_original = 0.0   # sum at list price
    subtotal = 0.0            # sum at flash-sale price
    for raw in raw_items:
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
        unit = ep["price"]
        line_total = unit * qty
        subtotal_original += ep["original"] * qty
        subtotal += line_total
        line_items.append({
            "product": product,
            "qty": qty,
            "unit_price": unit,
            "original_unit": ep["original"],
            "on_sale": ep["on_sale"],
            "line_total": line_total,
        })

    if not line_items:
        return False, {"status": False, "msg": "ไม่มีสินค้าในคำสั่งซื้อ"}, 400

    flash_discount = round(subtotal_original - subtotal, 2)

    # 2. Coupon (percentage of the post-flash subtotal)
    coupon_doc = None
    coupon_discount = 0.0
    discount_percent = 0.0
    if coupon_code:
        coupon_doc = db.coupons.find_one({"code": coupon_code.upper()})
        if coupon_doc and coupon_usable(coupon_doc):
            discount_percent = float(coupon_doc.get("discount", 0))
            coupon_discount = round(subtotal * discount_percent / 100, 2)
        else:
            coupon_doc = None

    running_total = subtotal - coupon_discount

    # 3. Reward points (1 point = POINTS_VALUE ฿), capped by balance and by total
    available_points = float(user.get("reward", 0) or 0)
    try:
        points_to_use = max(0.0, float(points_to_use or 0))
    except (TypeError, ValueError):
        points_to_use = 0.0
    max_points_by_total = running_total / POINTS_VALUE if POINTS_VALUE else 0
    points_used = round(min(points_to_use, available_points, max_points_by_total), 2)
    points_value = round(points_used * POINTS_VALUE, 2)

    total = round(max(0.0, running_total - points_value), 2)

    # 4. Funds check
    if float(user.get("credit", 0)) < total:
        return False, {"status": False, "msg": "เครดิตไม่เพียงพอ"}, 400

    earned = points_earned(total)

    # 5. Commit — deduct stock conditionally to avoid overselling
    for li in line_items:
        res = db.products.update_one(
            {"_id": li["product"]["_id"], "stock": {"$gte": li["qty"]}},
            {"$inc": {"stock": -li["qty"]}},
        )
        if res.modified_count == 0:
            # A concurrent buyer took the stock — roll back what we already took
            for done in line_items:
                if done is li:
                    break
                db.products.update_one({"_id": done["product"]["_id"]}, {"$inc": {"stock": done["qty"]}})
            return False, {"status": False, "msg": f"{li['product']['name']}: สินค้าเพิ่งหมด กรุณาลองใหม่"}, 409

    # Credit & points balances
    db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$inc": {"credit": -total, "reward": (earned - points_used)}},
    )

    if coupon_doc:
        db.coupons.update_one({"_id": coupon_doc["_id"]}, {"$inc": {"used_count": 1}})

    # 6. Persist order docs (one per line, shared receipt) + collect receipt items
    receipt_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    receipt_items = []
    for li in line_items:
        product = li["product"]
        key_code = str(uuid.uuid4()).upper()
        order_doc = {
            "_id": str(uuid.uuid4()),
            "receipt_id": receipt_id,
            "user_id": user_id,
            "product_id": product["_id"],
            "product_name": product["name"],
            "product_price": li["unit_price"],
            "product_image": product.get("image", ""),
            "product_discount": discount_percent,
            "category_name": product["cate"],
            "quantity": li["qty"],
            "line_total": li["line_total"],
            "key_code": key_code,
            "status": "pending",
            "dt_purchased": now,
            "refund": False,
        }
        db.orders.insert_one(order_doc)
        receipt_items.append({
            "name": product["name"],
            "qty": li["qty"],
            "unit_price": li["unit_price"],
            "line_total": li["line_total"],
            "key_code": key_code,
        })

    summary = {
        "subtotal": round(subtotal_original, 2),
        "flash_discount": flash_discount,
        "coupon_discount": coupon_discount,
        "points_used": points_value,
        "total": total,
        "points_earned": earned,
    }

    # 7. Notify user (in-app) + Discord admin log + receipt over preferred channel
    item_label = ", ".join(f"{li['product']['name']} x{li['qty']}" for li in line_items)
    push_notification(
        db, user_id,
        title="สั่งซื้อสำเร็จ 🛒",
        body=f"คำสั่งซื้อ {item_label} ({total:.2f} ฿) รับแล้ว กำลังดำเนินการ" +
             (f" · ได้รับ {earned:.2f} แต้ม ⭐" if earned > 0 else ""),
        ntype="success",
    )

    try:
        send_discord_log_async(
            event_type="🛒 คำสั่งซื้อใหม่ (รอดำเนินการ)",
            request_headers=dict(request.headers),
            ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
            host_url=request.host_url,
            referrer=request.referrer,
            data={
                "User": user.get("username", "Unknown"),
                "Items": item_label,
                "Total": f"{total:.2f} ฿",
                "Points Earned": f"{earned:.2f}",
                "Receipt": receipt_id,
            },
        )
    except Exception as e:
        print("[checkout] discord log failed:", e)

    send_order_receipt(user, receipt_id, receipt_items, summary)

    return True, {
        "status": True,
        "receiptId": receipt_id,
        "orderId": receipt_id,          # backward-compat alias
        "summary": summary,
    }, 200


# ✅ สั่งซื้อสินค้าชิ้นเดียว (ระบบเดิม — คงไว้เพื่อ backward compat)
@product_bp.route('/order/product/<product_id>', methods=['POST'])
@auth_required
def submit_order(product_id):
    db = get_db()
    data = request.json or {}
    submitted = data.get("submittedData", data)
    qty = submitted.get("qty", submitted.get("quantity", 1))
    ok, payload, code = _process_checkout(
        db, g.user_id,
        [{"product_id": product_id, "qty": qty}],
        coupon_code=submitted.get("coupon_code"),
        points_to_use=submitted.get("points", 0),
    )
    return jsonify(payload), code


# ✅ ตะกร้าสินค้า — checkout หลายชิ้นในบิลเดียว
@product_bp.route('/checkout', methods=['POST'])
@auth_required
def checkout():
    db = get_db()
    data = request.json or {}
    items = data.get("items", [])
    if not isinstance(items, list) or not items:
        return jsonify({"status": False, "msg": "ตะกร้าว่างเปล่า"}), 400
    ok, payload, code = _process_checkout(
        db, g.user_id, items,
        coupon_code=data.get("coupon_code"),
        points_to_use=data.get("points", 0),
    )
    return jsonify(payload), code


# ✅ เช็คคูปอง
@product_bp.route('/checkCoupon/<code>', methods=['GET'])
def check_coupon(code):
    db = get_db()
    coupon = db.coupons.find_one({"code": code.upper()})

    if not coupon:
        return jsonify({
            "status": False,
            "alreadyUsed": False,
            "msg": "Coupon ไม่ถูกต้อง"
        })

    if not coupon_usable(coupon):
        return jsonify({
            "status": False,
            "alreadyUsed": True,
            "msg": "คูปองนี้ใช้ไม่ได้แล้ว (หมดสิทธิ์หรือถูกปิด)"
        })

    return jsonify({
        "status": True,
        "discount": coupon.get("discount", 0.0),
        "msg": coupon.get("msg", "สามารถใช้คูปองได้")
    })


# ✅ คูปองที่ใช้ได้ทั้งหมด (สาธารณะ — สำหรับหน้าคูปอง)
@product_bp.route('/coupons', methods=['GET'])
def public_coupons():
    db = get_db()
    results = []
    for c in db.coupons.find().sort("discount", -1):
        if not coupon_usable(c):
            continue
        results.append({
            "code":      c.get("code", ""),
            "discount":  float(c.get("discount", 0)),
            "msg":       c.get("msg", ""),
            "remaining": coupon_remaining(c),   # None = unlimited
        })
    return jsonify({"status": True, "results": results})


@product_bp.route('/me/logs/product/<int:start>/<int:limit>', methods=['GET'])
@auth_required
def get_user_purchase_logs(start, limit):
    db = get_db()

    logs = db.orders.find({"user_id": g.user_id}) \
                    .sort("dt_purchased", -1) \
                    .skip(start).limit(limit)

    result = []
    for log in logs:
        result.append({
            "product": {
                "name": log["product_name"],
                "price": log["product_price"],
                "image": log.get("product_image", "")
            },
            "quantity": log.get("quantity", 1),
            "status": log.get("status", "completed"),
            "receipt_id": log.get("receipt_id", ""),
            "dt_purchased": log["dt_purchased"].strftime('%Y-%m-%d %H:%M:%S') if hasattr(log.get("dt_purchased"), "strftime") else str(log.get("dt_purchased", "")),
            "refund": log.get("refund", False)
        })

    return jsonify({"status": True, "results": result})


# ✅ คำสั่งซื้อของฉัน จัดกลุ่มตามใบเสร็จ พร้อมสถานะจัดส่ง (timeline)
@product_bp.route('/me/orders', methods=['GET'])
@auth_required
def get_my_orders():
    db = get_db()
    docs = db.orders.find({"user_id": g.user_id}).sort("dt_purchased", -1).limit(300)

    receipts = {}
    order_index = []
    for o in docs:
        rid = o.get("receipt_id") or o["_id"]   # legacy orders had no receipt grouping
        purchased = o.get("dt_purchased")
        purchased_str = purchased.strftime('%Y-%m-%d %H:%M:%S') if hasattr(purchased, "strftime") else str(purchased or "")
        if rid not in receipts:
            receipts[rid] = {
                "receipt_id": rid,
                "status": o.get("status", "completed"),
                "dt_purchased": purchased_str,
                "refund": o.get("refund", False),
                "items": [],
                "total": 0.0,
            }
            order_index.append(rid)
        line_total = o.get("line_total")
        if line_total is None:
            line_total = float(o.get("product_price", 0)) * int(o.get("quantity", 1))
        receipts[rid]["items"].append({
            "name": o.get("product_name", ""),
            "image": o.get("product_image", ""),
            "price": o.get("product_price", 0),
            "quantity": o.get("quantity", 1),
            "key_code": o.get("key_code", ""),
        })
        receipts[rid]["total"] += float(line_total)

    return jsonify({"status": True, "results": [receipts[r] for r in order_index]})
