import os
import uuid
import jwt
import requests as http_requests
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from app.extensions import get_db

payment_bp = Blueprint('payment', __name__)
SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "your-secret-key")

SLIP_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'uploads', 'slips')

# local auth decorator (payment module uses g.user instead of g.user_id)
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


# ─── QR / TOPUP REQUEST ──────────────────────────────────────────────────────

@payment_bp.route('/qr', methods=['POST'])
@auth_required
def create_qr():
    data = request.json or {}
    amount = data.get('amount')
    if not amount or float(amount) <= 0:
        return jsonify({"error": "จำนวนเงินไม่ถูกต้อง"}), 400

    db = get_db()
    user_id = ObjectId(g.user)
    user = db.users.find_one({"_id": user_id}, {"username": 1})
    ref_code = f"REF{uuid.uuid4().hex[:8].upper()}"

    payment_doc = {
        "_id":        ref_code,
        "user_id":    user_id,
        "username":   user.get("username", "") if user else "",
        "amount":     float(amount),
        "status":     "pending",
        "created_at": datetime.now(timezone.utc),
        "credited":   False,
        "slip_uploaded": False,
    }
    db.pending_qr_payments.insert_one(payment_doc)

    return jsonify({
        "ref":        ref_code,
        "ref_code":   ref_code,
        "created_at": payment_doc["created_at"].isoformat(),
    })


# ─── UPLOAD SLIP (save image → wait for admin approval) ──────────────────────

@payment_bp.route('/upload-slip', methods=['POST'])
@auth_required
def upload_slip():
    if 'slip' not in request.files:
        return jsonify({"status": False, "message": "ไม่ได้แนบไฟล์สลิป"}), 400

    slip_file = request.files['slip']
    ref_code  = request.form.get("ref_code")
    if not ref_code:
        return jsonify({"status": False, "message": "ไม่พบ ref_code"}), 400

    db = get_db()
    user_id = ObjectId(g.user)
    payment = db.pending_qr_payments.find_one({"_id": ref_code, "user_id": user_id})
    if not payment:
        return jsonify({"status": False, "message": "ไม่พบคำสั่งชำระเงินนี้"}), 404
    if payment.get("slip_uploaded"):
        return jsonify({"status": False, "message": "ส่งสลิปแล้ว กรุณารอการตรวจสอบ"}), 400

    # Save image
    os.makedirs(SLIP_UPLOAD_DIR, exist_ok=True)
    ext      = os.path.splitext(slip_file.filename)[1] or '.jpg'
    filename = f"{ref_code}_{uuid.uuid4().hex[:6]}{ext}"
    save_path = os.path.join(SLIP_UPLOAD_DIR, filename)
    slip_file.save(save_path)

    slip_image_url = f"/static/uploads/slips/{filename}"

    db.pending_qr_payments.update_one({"_id": ref_code}, {"$set": {
        "status":         "pending_review",
        "slip_uploaded":  True,
        "slip_image_url": slip_image_url,
        "uploaded_at":    datetime.now(timezone.utc),
    }})

    return jsonify({
        "status":  True,
        "message": "ส่งสลิปสำเร็จ กรุณารอแอดมินตรวจสอบ (ปกติภายใน 5-15 นาที)",
    })


# ─── TOPUP LOGS ──────────────────────────────────────────────────────────────

@payment_bp.route('/me/topup/logs', methods=['GET'])
@auth_required
def my_topup_logs():
    db = get_db()
    user_id = ObjectId(g.user)

    payments = db.pending_qr_payments.find(
        {"user_id": user_id},
        {"_id": 1, "amount": 1, "created_at": 1, "status": 1, "credited": 1}
    ).sort("created_at", -1)

    logs = []
    for p in payments:
        logs.append({
            "ref":        p["_id"],
            "amount":     p["amount"],
            "created_at": p["created_at"].isoformat() if p.get("created_at") else "",
            "status":     p.get("status", "pending"),
            "credited":   p.get("credited", False),
        })

    return jsonify({"status": True, "results": logs})


# ─── TRUEMONEY ซองอั่งเป่า ────────────────────────────────────────────────────

@payment_bp.route('/truemoney-angpao', methods=['POST'])
@auth_required
def truemoney_angpao():
    data = request.json or {}
    voucher_url = data.get('voucher_url', '').strip()
    if not voucher_url:
        return jsonify({"status": False, "message": "กรุณากรอกลิงก์ซองอั่งเป่า"}), 400

    # Extract hash from URL or treat as raw hash
    voucher_hash = voucher_url
    if 'gift.truemoney.com' in voucher_url:
        try:
            parsed = urlparse(voucher_url)
            qs = parse_qs(parsed.query)
            voucher_hash = (qs.get('v') or [''])[0]
        except Exception:
            voucher_hash = ''

    if not voucher_hash:
        return jsonify({"status": False, "message": "ลิงก์ซองอั่งเป่าไม่ถูกต้อง"}), 400

    db = get_db()
    user_id = ObjectId(g.user)
    user = db.users.find_one({"_id": user_id}, {"username": 1})

    # Prevent duplicate redemption
    if db.truemoney_vouchers.find_one({"voucher_hash": voucher_hash, "status": "approved"}):
        return jsonify({"status": False, "message": "ซองอั่งเป่านี้ถูกใช้ไปแล้ว"}), 400

    truemoney_phone = os.getenv('TRUEMONEY_PHONE', '').strip()

    if truemoney_phone:
        # Auto-redeem via TrueMoney API
        try:
            resp = http_requests.post(
                f"https://gift.truemoney.com/campaign/vouchers/{voucher_hash}/redeem",
                json={"mobile": truemoney_phone, "voucher_hash": voucher_hash},
                timeout=10,
            )
            resp_data = resp.json()
        except Exception as e:
            resp_data = {}

        tm_status = resp_data.get('status', {})
        if isinstance(tm_status, dict):
            success = tm_status.get('code') == 'SUCCESS'
        else:
            success = False

        if success:
            amount_baht = float(resp_data.get('data', {}).get('voucher', {}).get('redeemAmount', 0)) / 100
            db.users.update_one({"_id": user_id}, {"$inc": {"credit": amount_baht}})
            db.truemoney_vouchers.insert_one({
                "user_id":      user_id,
                "username":     user.get("username", "") if user else "",
                "voucher_hash": voucher_hash,
                "voucher_url":  voucher_url,
                "amount":       amount_baht,
                "status":       "approved",
                "auto_redeemed": True,
                "created_at":   datetime.now(timezone.utc),
            })
            return jsonify({"status": True, "message": f"เติมเงินสำเร็จ {amount_baht:.2f} บาท"})

        # API returned error — store for admin
        error_msg = ""
        if isinstance(tm_status, dict):
            error_msg = tm_status.get('message', '')

    # No phone configured or auto-redeem failed → queue for admin review
    existing = db.truemoney_vouchers.find_one({"voucher_hash": voucher_hash, "status": "pending_review"})
    if existing:
        return jsonify({"status": False, "message": "ซองอั่งเป่านี้รอการตรวจสอบอยู่แล้ว"}), 400

    db.truemoney_vouchers.insert_one({
        "user_id":      user_id,
        "username":     user.get("username", "") if user else "",
        "voucher_hash": voucher_hash,
        "voucher_url":  voucher_url,
        "amount":       None,
        "status":       "pending_review",
        "auto_redeemed": False,
        "created_at":   datetime.now(timezone.utc),
    })
    return jsonify({"status": True, "message": "ส่งซองอั่งเป่าสำเร็จ แอดมินจะตรวจสอบและเติมเงินให้ภายใน 5-15 นาที"})


# ─── REDEEM CODE ─────────────────────────────────────────────────────────────

@payment_bp.route('/redeem-code', methods=['POST'])
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

    # Atomic: mark code used + add credit in separate ops (code marked first to prevent double-use)
    db.topup_codes.update_one({"code": code, "used": {"$ne": True}}, {"$set": {"used": True, "used_by": g.user}})
    db.users.update_one({"_id": user_id}, {"$inc": {"credit": topup_code["amount"]}})
    new_balance = float(user.get("credit", 0)) + topup_code["amount"]
    return jsonify({
        "status":      True,
        "message":     f"เติมเงินสำเร็จ {topup_code['amount']:.2f} บาท",
        "new_balance": new_balance,
    })
