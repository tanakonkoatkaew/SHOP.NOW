import os
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from app.extensions import get_db
from app.middlewares import admin_required

admin_bp = Blueprint('admin', __name__)

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

    return jsonify({
        "status": True,
        "users":         db.users.count_documents({}),
        "products":      db.products.count_documents({}),
        "pending_slips": pending_slips,
        "total_revenue": round(revenue, 2),
        "orders":        db.orders.count_documents({}),
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
        results.append({
            "id":          str(p["_id"]),
            "name":        p.get("name", ""),
            "price":       p.get("price", 0),
            "image":       p.get("image", ""),
            "cate":        p.get("cate", ""),
            "stock":       p.get("stock", 0),
            "warranty":    p.get("warranty", False),
            "description": p.get("description", ""),
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
    return jsonify({"status": True, "message": "ปฏิเสธซองอั่งเป่าแล้ว"})


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
            "dt_purchased": purchased_at,
            "refund": o.get("refund", False)
        })
    return jsonify({"status": True, "results": results})
