from datetime import datetime, timezone
from flask import Blueprint, jsonify, g, request
from app.extensions import get_db
from app.middlewares import auth_required
from bson import ObjectId
from app.utils.coupons import coupon_usable, coupon_remaining
from app.utils.pricing import effective_price

product_bp = Blueprint('product', __name__)


def _rating_map(db, product_ids=None):
    """Real review aggregates: {product_id(ObjectId): {"avg": float, "count": int}}."""
    pipeline = []
    if product_ids is not None:
        pipeline.append({"$match": {"product_id": {"$in": list(product_ids)}}})
    pipeline.append({"$group": {
        "_id": "$product_id",
        "sum": {"$sum": "$rating"},
        "count": {"$sum": 1},
    }})
    result = {}
    for row in db.reviews.aggregate(pipeline):
        count = row["count"]
        result[row["_id"]] = {"avg": round(row["sum"] / count, 1), "count": count}
    return result


def _rating_field(rmap, product_oid):
    r = rmap.get(product_oid)
    return {"avg": r["avg"], "count": r["count"]} if r else {"avg": None, "count": 0}


# ✅ ดึงสินค้าทั้งหมด
@product_bp.route('/product', methods=['GET'])
def get_products():
    db = get_db()
    products_data = list(db.products.find())
    rmap = _rating_map(db)
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
            "rating": _rating_field(rmap, p["_id"]),
        })
    return jsonify({"status": True, "results": products})


# ✅ สถิติสาธารณะสำหรับหน้าแรก (ไม่ต้องล็อกอิน)
@product_bp.route('/stats', methods=['GET'])
def public_stats():
    db = get_db()
    agg = list(db.reviews.aggregate([
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}
    ]))
    avg_rating = round(agg[0]["avg"], 1) if agg else None

    return jsonify({
        "status":     True,
        "products":   db.products.count_documents({}),
        "customers":  db.users.count_documents({}),
        "orders":     db.orders.count_documents({}),
        "avg_rating": avg_rating,
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
            "rating": _rating_field(_rating_map(db, [product["_id"]]), product["_id"]),
        }
    })


# ─── PRODUCT REVIEWS ─────────────────────────────────────────────────────────

def _parse_product_oid(product_id):
    try:
        return ObjectId(product_id)
    except Exception:
        return None


def _has_purchased(db, user_id, product_oid):
    return db.orders.find_one({
        "user_id": user_id,
        "product_id": product_oid,
        "paid": True,
        "refund": False,
    }) is not None


def _serialize_review(r, users_map=None):
    user = (users_map or {}).get(r.get("user_id"), None)
    return {
        "id":         str(r["_id"]),
        "user": {
            "username": user.get("username", "ผู้ใช้") if user else "ผู้ใช้",
            "avatar":   user.get("avatar", "") if user else "",
        },
        "rating":     int(r.get("rating", 0)),
        "comment":    r.get("comment", ""),
        "created_at": r["created_at"].isoformat() if r.get("created_at") else "",
        "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else "",
    }


@product_bp.route('/product/<product_id>/reviews', methods=['GET'])
def list_reviews(product_id):
    oid = _parse_product_oid(product_id)
    if not oid:
        return jsonify({"status": False, "message": "ID สินค้าไม่ถูกต้อง"}), 400
    db = get_db()

    reviews = list(db.reviews.find({"product_id": oid}).sort("created_at", -1).limit(100))

    # batch-join reviewer names/avatars
    users_map = {}
    user_oids = []
    for r in reviews:
        try:
            user_oids.append(ObjectId(r["user_id"]))
        except Exception:
            pass
    for u in db.users.find({"_id": {"$in": user_oids}}, {"username": 1, "avatar": 1}):
        users_map[str(u["_id"])] = u

    summary = _rating_field(_rating_map(db, [oid]), oid)
    return jsonify({
        "status": True,
        "results": [_serialize_review(r, users_map) for r in reviews],
        "summary": {"avg_rating": summary["avg"], "count": summary["count"]},
    })


@product_bp.route('/product/<product_id>/reviews/me', methods=['GET'])
@auth_required
def my_review(product_id):
    oid = _parse_product_oid(product_id)
    if not oid:
        return jsonify({"status": False, "message": "ID สินค้าไม่ถูกต้อง"}), 400
    db = get_db()

    review = db.reviews.find_one({"product_id": oid, "user_id": g.user_id})
    return jsonify({
        "status": True,
        "result": _serialize_review(review) if review else None,
        "can_review": _has_purchased(db, g.user_id, oid),
    })


@product_bp.route('/product/<product_id>/reviews', methods=['POST'])
@auth_required
def save_review(product_id):
    oid = _parse_product_oid(product_id)
    if not oid:
        return jsonify({"status": False, "message": "ID สินค้าไม่ถูกต้อง"}), 400
    db = get_db()

    if not db.products.find_one({"_id": oid}):
        return jsonify({"status": False, "message": "ไม่พบสินค้า"}), 404

    data = request.json or {}
    try:
        rating = int(data.get("rating", 0))
    except (TypeError, ValueError):
        rating = 0
    if rating < 1 or rating > 5:
        return jsonify({"status": False, "message": "คะแนนไม่ถูกต้อง (1-5 ดาว)"}), 400
    comment = (data.get("comment") or "").strip()
    if len(comment) > 1000:
        return jsonify({"status": False, "message": "รีวิวยาวเกินไป (สูงสุด 1000 ตัวอักษร)"}), 400

    if not _has_purchased(db, g.user_id, oid):
        return jsonify({"status": False, "message": "ต้องซื้อสินค้านี้ก่อนจึงจะรีวิวได้"}), 403

    now = datetime.now(timezone.utc)
    db.reviews.update_one(
        {"product_id": oid, "user_id": g.user_id},
        {
            "$set": {"rating": rating, "comment": comment, "updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    review = db.reviews.find_one({"product_id": oid, "user_id": g.user_id})
    me = db.users.find_one({"_id": ObjectId(g.user_id)}, {"username": 1, "avatar": 1})
    summary = _rating_field(_rating_map(db, [oid]), oid)
    return jsonify({
        "status": True,
        "result": _serialize_review(review, {g.user_id: me} if me else None),
        "summary": {"avg_rating": summary["avg"], "count": summary["count"]},
    })


@product_bp.route('/product/<product_id>/reviews', methods=['DELETE'])
@auth_required
def delete_my_review(product_id):
    oid = _parse_product_oid(product_id)
    if not oid:
        return jsonify({"status": False, "message": "ID สินค้าไม่ถูกต้อง"}), 400
    db = get_db()

    res = db.reviews.delete_one({"product_id": oid, "user_id": g.user_id})
    if res.deleted_count == 0:
        return jsonify({"status": False, "message": "ไม่พบรีวิว"}), 404
    return jsonify({"status": True, "message": "ลบรีวิวแล้ว"})



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
