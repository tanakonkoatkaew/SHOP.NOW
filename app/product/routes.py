from flask import Blueprint, jsonify, request, g
from app.extensions import get_db
from app.middlewares import auth_required
from datetime import datetime, timezone
from bson import ObjectId
import uuid
from app.utils.logger import send_discord_log_async

product_bp = Blueprint('product', __name__)

# ✅ ดึงสินค้าทั้งหมด
@product_bp.route('/product', methods=['GET'])
def get_products():
    db = get_db()
    products_data = db.products.find()
    products = []
    for p in products_data:
        products.append({
            "id": str(p["_id"]),  # ✅ แปลง ObjectId เป็น string
            "name": p["name"],
            "price": p["price"],
            "image": p["image"],
            "cate": p["cate"]
        })
    return jsonify({"status": True, "results": products})


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

    return jsonify({
        "status": True,
        "result": {
            "id": str(product["_id"]),
            "name": product["name"],
            "price": product["price"],
            "image": product["image"],
            "warranty": product.get("warranty", False),
            "stock": product.get("stock", 0)
        }
    })


# ✅ สั่งซื้อสินค้า (ระบบตัด stock จริง)
@product_bp.route('/order/product/<product_id>', methods=['POST'])
@auth_required
def submit_order(product_id):
    db = get_db()
    data = request.json or {}
    submitted_data = data.get("submittedData", data)

    try:
        product = db.products.find_one({"_id": ObjectId(product_id)})
    except Exception:
        return jsonify({"status": False, "msg": "ID สินค้าไม่ถูกต้อง"}), 400

    if not product:
        return jsonify({"status": False, "msg": "ไม่พบสินค้า"}), 404

    try:
        quantity = int(submitted_data.get("qty", submitted_data.get("quantity", 1)))
    except (ValueError, TypeError):
        quantity = 1
    if quantity <= 0:
        return jsonify({"status": False, "msg": "จำนวนสินค้าต้องมากกว่า 0"}), 400
    if product.get("stock", 0) < quantity:
        return jsonify({"status": False, "msg": f"สินค้าคงเหลือไม่เพียงพอ (คงเหลือ {product.get('stock', 0)} ชิ้น)"}), 400

    user = db.users.find_one({"_id": ObjectId(g.user_id)})
    if not user:
        return jsonify({"status": False, "msg": "ไม่พบผู้ใช้"}), 404

    total_price = float(product["price"]) * quantity
    coupon_code = submitted_data.get("coupon_code")
    discount_percent = 0
    
    coupon_doc = None
    if coupon_code:
        coupon_doc = db.coupons.find_one({"code": coupon_code.upper()})
        if coupon_doc and not coupon_doc.get("used", False):
            discount_percent = float(coupon_doc.get("discount", 0))
            total_price = total_price * (1 - discount_percent / 100)

    if float(user.get("credit", 0)) < total_price:
        return jsonify({"status": False, "msg": "เครดิตไม่เพียงพอ"}), 400

    # Deduct credit and stock
    db.users.update_one({"_id": ObjectId(g.user_id)}, {"$inc": {"credit": -total_price}})
    db.products.update_one({"_id": product["_id"]}, {"$inc": {"stock": -quantity}})

    # Mark coupon as used (prevents reuse)
    if coupon_doc:
        db.coupons.update_one({"_id": coupon_doc["_id"]}, {"$set": {"used": True}})

    order_doc = {
        "_id": str(uuid.uuid4()),
        "user_id": g.user_id,
        "product_id": product["_id"],
        "product_name": product["name"],
        "product_price": product["price"],
        "product_image": product["image"],
        "product_discount": discount_percent,
        "category_name": product["cate"],
        "quantity": quantity,
        "dt_purchased": datetime.now(timezone.utc),
        "refund": False
    }
    db.orders.insert_one(order_doc)

    headers_copy = dict(request.headers)
    ip_address = request.headers.get("X-Forwarded-For", request.remote_addr)
    host_url = request.host_url
    referrer = request.referrer

    send_discord_log_async(
        event_type="🛒 สั่งซื้อสินค้าใหม่ (รอดำเนินการจัดส่ง)",
        request_headers=headers_copy,
        ip_address=ip_address,
        host_url=host_url,
        referrer=referrer,
        data={
            "User": user.get("username", "Unknown"),
            "Product": product["name"],
            "Quantity": f"{quantity} ชิ้น",
            "Total Price": f"{total_price} ฿",
            "Order ID": order_doc["_id"]
        }
    )

    return jsonify({"status": True, "orderId": order_doc["_id"]})


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

    if coupon.get("used", False):
        return jsonify({
            "status": False,
            "alreadyUsed": True,
            "msg": "คูปองนี้ถูกใช้ไปแล้ว"
        })

    return jsonify({
        "status": True,
        "discount": coupon.get("discount", 0.0),
        "msg": coupon.get("msg", "สามารถใช้คูปองได้")
    })

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
            "dt_purchased": log["dt_purchased"].strftime('%Y-%m-%d %H:%M:%S') if hasattr(log.get("dt_purchased"), "strftime") else str(log.get("dt_purchased", "")),
            "refund": log.get("refund", False)
        })

    return jsonify({"status": True, "results": result})
