from flask import Blueprint, request, jsonify, g
from bson import ObjectId
import uuid
import pytesseract
from datetime import datetime, timezone
from google.cloud import vision
from app.extensions import get_db
from app.models.user import User
from PIL import Image
import jwt
import os
import io
import re

# ✅ ข้อมูลบัญชีที่เรารับโอน (สำหรับตรวจสอบในสลิป)
OUR_ACCOUNT_KEYWORDS = [
    "0542716971",         # ← เลขบัญชีแบบติดกัน
    "054-2-71697-1",      # ← เลขบัญชีแบบมีขีด
    "วิชยุตม์",            # ← ชื่อเจ้าของบัญชี
    "แย้มสำรวย",           # ← นามสกุล
    "SCB",                # ← ชื่อธนาคารย่อ
    "ไทยพาณิชย์"          # ← ชื่อธนาคารเต็ม (OCR อาจเจอแบบนี้ได้)
]

payment_bp = Blueprint('payment', __name__)
SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "your-secret-key")

def extract_amount_from_image(image_path):
    client = vision.ImageAnnotatorClient()

    with io.open(image_path, "rb") as image_file:
        content = image_file.read()

    image = vision.Image(content=content)
    response = client.text_detection(image=image)

    if response.error.message:
        raise Exception(f'OCR error: {response.error.message}')

    texts = response.text_annotations
    if not texts:
        return None

    full_text = texts[0].description
    # หา pattern ยอดเงิน เช่น 2,500.00 หรือ 100.00
    match = re.findall(r'\d{1,3}(?:,\d{3})*\.\d{2}', full_text)
    if match:
        return float(match[0].replace(",", ""))
    return None

# ✅ Middleware สำหรับเช็ค token (ง่ายๆ)
def auth_required(f):
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401

        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            user_id = payload["user_id"]
            g.user = user_id
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

# ✅ สร้าง QR Payment (ต้อง login ก่อน)
@payment_bp.route('/qr', methods=['POST'])
@auth_required
def create_qr():
    data = request.json
    amount = data.get('amount')

    if not amount or float(amount) <= 0:
        return jsonify({"error": "จำนวนเงินไม่ถูกต้อง"}), 400

    db = get_db()
    user_id = ObjectId(g.user)  # ✅ แก้ตรงนี้
    ref_code = f"REF{uuid.uuid4().hex[:8].upper()}"
    qr_image_url = "https://via.placeholder.com/300x300.png?text=QR+Code"

    payment_doc = {
        "_id": ref_code,
        "user_id": user_id,
        "amount": float(amount),
        "qr_image_url": qr_image_url,
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
        "credited": False
    }
    db.pending_qr_payments.insert_one(payment_doc)

    return jsonify({
        "ref": ref_code,
        "ref_code": ref_code,
        "qr": qr_image_url,
        "created_at": payment_doc["created_at"].isoformat()
    })

# ✅ ตรวจสอบ QR และเติมเครดิตให้ user
@payment_bp.route('/check/<ref>', methods=['GET'])
@auth_required
def check_payment(ref):
    db = get_db()
    user_id = ObjectId(g.user)

    payment = db.pending_qr_payments.find_one({"_id": ref, "user_id": user_id})
    if not payment:
        return jsonify({"error": "ไม่พบรายการ"}), 404

    created_at = payment["created_at"]
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    time_diff = (datetime.now(timezone.utc) - created_at).total_seconds()

    if time_diff > 10 and payment["status"] == "pending":
        db.pending_qr_payments.update_one({"_id": ref}, {"$set": {"status": "paid"}})
        payment["status"] = "paid"

    if payment["status"] == "paid" and not payment.get("credited", False):
        user = db.users.find_one({"_id": user_id})
        if user:
            new_credit = user.get("credit", 0.0) + payment["amount"]
            db.users.update_one({"_id": user_id}, {"$set": {"credit": new_credit}})
            db.pending_qr_payments.update_one({"_id": ref}, {"$set": {"credited": True}})
            return jsonify({
                "message": "เติมเงินสำเร็จ",
                "credited": True,
                "new_balance": new_credit
            })

    return jsonify({
        "status": payment["status"],
        "credited": payment.get("credited", False),
        "amount": payment["amount"]
    })

# ✅ API: ดึงประวัติการเติมเงินของตัวเอง
@payment_bp.route('/me/topup/logs', methods=['GET'])
@auth_required
def my_topup_logs():
    db = get_db()
    user_id = ObjectId(g.user)

    payments = db.pending_qr_payments.find(
        {"user_id": user_id, "status": "paid"},
        {"_id": 1, "amount": 1, "created_at": 1, "credited": 1}
    ).sort("created_at", -1)

    logs = []
    for p in payments:
        logs.append({
            "ref": p["_id"],
            "amount": p["amount"],
            "created_at": p["created_at"].isoformat(),
            "credited": p.get("credited", False)
        })

    return jsonify({"status": True, "results": logs})

# ✅ Redeem Topup Code
@payment_bp.route('/redeem-code', methods=['POST'])
@auth_required
def redeem_code():
    data = request.json
    code = data.get('code', '').strip().upper()

    if not code:
        return jsonify({"status": False, "message": "กรุณากรอกรหัส"}), 400

    db = get_db()
    topup_code = db.topup_codes.find_one({"code": code})
    if not topup_code:
        return jsonify({"status": False, "message": "รหัสไม่ถูกต้อง"}), 404

    if topup_code.get("used"):
        return jsonify({"status": False, "message": "รหัสนี้ถูกใช้ไปแล้ว"}), 400

    db.topup_codes.update_one({"code": code}, {"$set": {"used": True}})
    user_id = ObjectId(g.user)
    user = db.users.find_one({"_id": user_id})
    if user:
        new_credit = user.get("credit", 0.0) + topup_code["amount"]
        db.users.update_one({"_id": user_id}, {"$set": {"credit": new_credit}})
        return jsonify({
            "status": True,
            "message": f"เติมเงินสำเร็จ {topup_code['amount']:.2f} บาท",
            "new_balance": new_credit
        })

    return jsonify({"status": False, "message": "ไม่พบ user"}), 500

@payment_bp.route('/upload-slip', methods=['POST'])
@auth_required
def upload_slip():
    import pytesseract
    from PIL import Image
    import io
    import re

    # ✅ เพิ่มคำที่ใช้ตรวจสอบบัญชีของเรา
    OUR_ACCOUNT_KEYWORDS = [
        "0542716971",
        "054-2-71697-1",
        "วิชยุตม์",
        "แย้มสำรวย",
        "SCB",
        "ไทยพาณิชย์"        # ธนาคารแบบเต็ม
    ]

    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

    if 'slip' not in request.files:
        return jsonify({"status": False, "message": "ไม่ได้แนบไฟล์สลิป"}), 400

    slip_file = request.files['slip']
    ref_code = request.form.get("ref_code")
    if not ref_code:
        return jsonify({"status": False, "message": "ไม่พบ ref_code"}), 400

    db = get_db()
    user_id = ObjectId(g.user)
    payment = db.pending_qr_payments.find_one({"_id": ref_code, "user_id": user_id})
    if not payment:
        return jsonify({"status": False, "message": "ไม่พบคำสั่งชำระเงินนี้"}), 404

    image_bytes = slip_file.read()
    image = Image.open(io.BytesIO(image_bytes))
    text = pytesseract.image_to_string(image, lang='tha+eng')

    print("🧾 OCR TEXT:\n", text)

    # ✅ ตรวจสอบว่ามีคำสำคัญของบัญชีเราครบหรือไม่
    if not all(keyword in text for keyword in OUR_ACCOUNT_KEYWORDS):
        return jsonify({
            "status": False,
            "message": "สลิปนี้ไม่ได้โอนเข้าบัญชีของร้าน กรุณาตรวจสอบอีกครั้ง"
        }), 400

    # ✅ ตรวจสอบยอดเงินจากสลิป
    matches = re.findall(r'(?:฿|\b)?([0-9]+(?:\.[0-9]{1,2})?)\s*(?:บาท|฿)?', text)
    if not matches:
        return jsonify({"status": False, "message": "ไม่พบยอดเงินในสลิป"}), 400

    slip_amount = None
    expected_amount = round(payment["amount"], 2)

    for amt in matches:
        try:
            if abs(float(amt) - expected_amount) <= 0.01:
                slip_amount = float(amt)
                break
        except:
            continue

    if not slip_amount:
        return jsonify({
            "status": False,
            "message": f"ไม่พบยอด {expected_amount:.2f}฿ ในสลิป"
        }), 400

    # ✅ อัปเดตฐานข้อมูลและเติมเครดิต
    db.pending_qr_payments.update_one({"_id": ref_code}, {
        "$set": {
            "status": "success",
            "ocr_amount": slip_amount,
            "ocr_verified": True,
            "ocr_uploaded_at": datetime.utcnow()
        }
    })

    db.users.update_one(
        {"_id": user_id},
        {"$inc": {"credit": slip_amount}}
    )

    db.topup_history.insert_one({
        "user_id": user_id,
        "ref_code": ref_code,
        "amount": slip_amount,
        "slip_verified": True,
        "timestamp": datetime.utcnow()
    })

    return jsonify({"status": True, "message": "✅ ตรวจสอบสลิปสำเร็จ เติมเครดิตเรียบร้อยแล้ว"})
