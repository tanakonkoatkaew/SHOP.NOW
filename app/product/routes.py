from flask import Blueprint, jsonify, request, g
from app.extensions import get_db
from app.middlewares import auth_required
from datetime import datetime, timezone
from bson import ObjectId
import uuid

product_bp = Blueprint('product', __name__)

# ✅ ดึงสินค้าทั้งหมด
@product_bp.route('/product', methods=['GET'])
@auth_required
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
    data = request.json
    submitted_data = data.get("submittedData", {})

    try:
        product = db.products.find_one({"_id": ObjectId(product_id)})
    except Exception:
        return jsonify({"status": False, "msg": "ID สินค้าไม่ถูกต้อง"}), 400

    if not product:
        return jsonify({"status": False, "msg": "ไม่พบสินค้า"}), 404

    quantity = submitted_data.get("quantity", 1)
    if product["stock"] < quantity:
        return jsonify({"status": False, "msg": f"สินค้าคงเหลือไม่เพียงพอ (คงเหลือ {product['stock']} ชิ้น)"}), 400

    db.products.update_one({"_id": product["_id"]}, {"$inc": {"stock": -quantity}})

    order_doc = {
        "_id": str(uuid.uuid4()),
        "user_id": g.user_id,
        "product_id": product["_id"],
        "product_name": product["name"],
        "product_price": product["price"],
        "product_image": product["image"],
        "product_discount": submitted_data.get("discount", 0),
        "category_name": product["cate"],
        "quantity": quantity,
        "dt_purchased": datetime.now(timezone.utc),
        "refund": False
    }
    db.orders.insert_one(order_doc)

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
                "price": log["product_price"]
            },
            "dt_purchased": log["dt_purchased"].strftime('%Y-%m-%d %H:%M:%S'),
            "refund": log.get("refund", False)
        })

    return jsonify({"status": True, "results": result})
