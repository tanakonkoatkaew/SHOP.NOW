from flask import Blueprint, jsonify, g
from app.extensions import get_db
from app.middlewares import auth_required
from bson import ObjectId
from app.utils.coupons import coupon_usable, coupon_remaining
from app.utils.pricing import effective_price

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
            "delivery_type": p.get("delivery_type", "digital"),
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
            "stock": product.get("stock", 0),
            "delivery_type": product.get("delivery_type", "digital"),
        }
    })



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
                "shipping_address": None,
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
            "delivery_type": o.get("delivery_type", "digital"),
        })
        if o.get("shipping_address") and not receipts[rid]["shipping_address"]:
            receipts[rid]["shipping_address"] = o["shipping_address"]
        receipts[rid]["total"] += float(line_total)

    return jsonify({"status": True, "results": [receipts[r] for r in order_index]})
