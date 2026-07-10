import os
import uuid
import jwt
import requests as http_requests
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from app.extensions import get_db
from app.utils.logger import send_discord_log_async

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


def crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if (crc & 0x8000):
                crc = (crc << 1) ^ 0x1021
            else:
                crc = crc << 1
            crc &= 0xFFFF
    return crc

def generate_promptpay_payload(promptpay_id, amount):
    import re
    promptpay_id = re.sub(r'[^0-9]', '', str(promptpay_id))
    
    if len(promptpay_id) == 10 and promptpay_id.startswith('0'):
        target = "0066" + promptpay_id[1:]
        merchant_info = f"0016A00000067701011101{len(target):02d}{target}"
    elif len(promptpay_id) == 13:
        merchant_info = f"0016A00000067701011102{len(promptpay_id):02d}{promptpay_id}"
    elif len(promptpay_id) == 15:
        merchant_info = f"0016A00000067701011103{len(promptpay_id):02d}{promptpay_id}"
    else:
        if len(promptpay_id) <= 10:
            target = "0066" + promptpay_id.lstrip('0')
            merchant_info = f"0016A00000067701011101{len(target):02d}{target}"
        else:
            merchant_info = f"0016A00000067701011102{len(promptpay_id):02d}{promptpay_id}"

    payload = "000201"
    payload += "010212"
    payload += f"29{len(merchant_info):02d}{merchant_info}"
    payload += "5303764"
    
    amount_str = f"{float(amount):.2f}"
    payload += f"54{len(amount_str):02d}{amount_str}"
    payload += "5802TH"
    payload += "6304"
    
    crc = crc16_ccitt(payload.encode('ascii'))
    payload += f"{crc:04X}"
    return payload

@payment_bp.route('/promptpay-qr', methods=['GET'])
@auth_required
def get_promptpay_qr():
    amount = request.args.get('amount')
    if not amount:
        return jsonify({"status": False, "message": "กรุณาระบุจำนวนเงิน"}), 400
    try:
        amount_val = float(amount)
        if amount_val <= 0:
            raise ValueError()
    except ValueError:
        return jsonify({"status": False, "message": "จำนวนเงินไม่ถูกต้อง"}), 400
        
    promptpay_id = os.getenv("PROMPTPAY_ID", "").strip()
    if not promptpay_id:
        return jsonify({"status": False, "message": "ระบบยังไม่ได้เปิดใช้งาน PromptPay ID ในการรับเงิน"}), 400
        
    try:
        qr_payload = generate_promptpay_payload(promptpay_id, amount_val)
        qr_image_url = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={qr_payload}"
        return jsonify({
            "status": True,
            "qr_payload": qr_payload,
            "qr_image_url": qr_image_url
        })
    except Exception as e:
        return jsonify({"status": False, "message": f"เกิดข้อผิดพลาดในการสร้าง QR Code: {str(e)}"}), 500


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

    # Manual-review mode (SLIP_AUTO_VERIFY != "true"): skip OCR entirely and queue
    # the slip for an admin to approve. Safe & free — no external API needed.
    auto_verify = os.getenv("SLIP_AUTO_VERIFY", "true").lower() == "true"
    if not auto_verify:
        db.pending_qr_payments.update_one({"_id": ref_code}, {"$set": {
            "status":         "pending_review",
            "slip_uploaded":  True,
            "slip_image_url": slip_image_url,
            "uploaded_at":    datetime.now(timezone.utc),
        }})
        try:
            send_discord_log_async(
                event_type="🧾 มีสลิปใหม่รอตรวจสอบ",
                request_headers=dict(request.headers),
                ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
                host_url=request.host_url,
                referrer=request.referrer,
                data={
                    "User": payment.get("username", "—"),
                    "Amount": f"{payment['amount']:.2f} ฿",
                    "Ref": ref_code,
                },
            )
        except Exception as e:
            print("[slip] admin notify failed:", e)
        return jsonify({
            "status":        True,
            "auto_verified": False,
            "message":       "ส่งสลิปสำเร็จ กำลังรอแอดมินตรวจสอบ (ปกติภายใน 5-15 นาที)",
        })

    # Perform automatic slip verification using Google Cloud Vision OCR
    from app.services.payment_service import verify_slip_ocr

    ocr_result = verify_slip_ocr(save_path, payment["amount"])
    
    if ocr_result["success"]:
        # Auto-approve: Add credit to user and set payment status to approved
        db.users.update_one(
            {"_id": payment["user_id"]},
            {"$inc": {"credit": payment["amount"]}}
        )
        db.pending_qr_payments.update_one({"_id": ref_code}, {"$set": {
            "status":         "approved",
            "credited":       True,
            "slip_uploaded":  True,
            "slip_image_url": slip_image_url,
            "uploaded_at":    datetime.now(timezone.utc),
            "approved_at":    datetime.now(timezone.utc),
            "transaction_id": ocr_result.get("transaction_id"),
            "auto_verified":  True,
        }})
        return jsonify({
            "status":        True,
            "auto_verified": True,
            "message":       f"เติมเงินสำเร็จ {payment['amount']:.2f} ฿ (ระบบตรวจสอบและเติมเงินอัตโนมัติสำเร็จ)",
        })
    else:
        # If it is a duplicate slip, reject it immediately to prevent double spending
        if ocr_result.get("is_duplicate"):
            db.pending_qr_payments.update_one({"_id": ref_code}, {"$set": {
                "status":         "rejected",
                "slip_uploaded":  True,
                "slip_image_url": slip_image_url,
                "uploaded_at":    datetime.now(timezone.utc),
                "rejected_at":    datetime.now(timezone.utc),
                "reject_reason":  ocr_result.get("message", "สลิปนี้ถูกใช้งานไปแล้ว"),
                "transaction_id": ocr_result.get("transaction_id"),
            }})
            return jsonify({
                "status":  False,
                "message": ocr_result.get("message", "สลิปนี้ถูกใช้งานยืนยันชำระเงินไปแล้วในระบบ"),
            }), 400
        else:
            # General mismatch or OCR read error -> Fallback to manual admin review
            db.pending_qr_payments.update_one({"_id": ref_code}, {"$set": {
                "status":         "pending_review",
                "slip_uploaded":  True,
                "slip_image_url": slip_image_url,
                "uploaded_at":    datetime.now(timezone.utc),
                "transaction_id": ocr_result.get("transaction_id"),
                "ocr_failed_reason": ocr_result.get("message"),
            }})
            return jsonify({
                "status":        True,
                "auto_verified": False,
                "message":       "ส่งสลิปสำเร็จ กำลังรอแอดมินตรวจสอบแบบปกติ (ไม่สามารถตรวจสลิปแบบอัตโนมัติได้)",
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
