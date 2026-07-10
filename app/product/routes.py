from flask import Blueprint, jsonify, request, g
from app.extensions import get_db
from app.middlewares import auth_required
from datetime import datetime, timezone
from bson import ObjectId
import uuid
from app.utils.logger import send_discord_log_async
from app.utils.notify import push_notification
from app.utils.coupons import coupon_usable, coupon_remaining

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
        if coupon_doc and coupon_usable(coupon_doc):
            discount_percent = float(coupon_doc.get("discount", 0))
            total_price = total_price * (1 - discount_percent / 100)
        else:
            coupon_doc = None   # invalid/expired coupon → no discount, don't consume

    if float(user.get("credit", 0)) < total_price:
        return jsonify({"status": False, "msg": "เครดิตไม่เพียงพอ"}), 400

    # Deduct credit and stock
    db.users.update_one({"_id": ObjectId(g.user_id)}, {"$inc": {"credit": -total_price}})
    db.products.update_one({"_id": product["_id"]}, {"$inc": {"stock": -quantity}})

    # Count one use against the coupon (respects max_uses; unlimited if 0)
    if coupon_doc:
        db.coupons.update_one({"_id": coupon_doc["_id"]}, {"$inc": {"used_count": 1}})

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

    push_notification(
        db, g.user_id,
        title="สั่งซื้อสำเร็จ 🛒",
        body=f"คำสั่งซื้อ {product['name']} x{quantity} ({total_price:.2f} ฿) กำลังดำเนินการจัดส่ง",
        ntype="success",
    )

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

    # Send delivery notification to user (Google -> Gmail, Discord/Webhook -> Webhook)
    user_discord_webhook = user.get("discord_id", "").strip()
    user_email = user.get("email", "").strip()
    is_google_user = bool(user.get("google_user_id"))

    if is_google_user and user_email:
        try:
            key_code = str(uuid.uuid4()).upper()
            subject = f"🎉 จัดส่งสินค้าสำเร็จ! - {product['name']} (ShopNow)"
            
            body_html = f"""
            <html>
            <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 30px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div style="text-align: center; margin-bottom: 25px;">
                        <span style="font-size: 40px;">🎉</span>
                        <h2 style="color: #f59e0b; margin-top: 10px; font-weight: 800; font-family: sans-serif;">จัดส่งสินค้าสำเร็จ!</h2>
                        <p style="color: #64748b; font-size: 14px;">ขอบคุณสำหรับการสั่งซื้อสินค้าจาก ShopNow</p>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <table style="width: 100%; font-size: 15px; border-collapse: collapse; font-family: sans-serif;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">🛒 สินค้าที่สั่งซื้อ:</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #0f172a;">{product['name']}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">📦 จำนวน:</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #0f172a;">{quantity} ชิ้น</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">💰 ราคารวม:</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #f59e0b;">{total_price} ฿</td>
                        </tr>
                    </table>
                    <div style="margin-top: 25px; background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 15px; text-align: center; font-family: sans-serif;">
                        <div style="font-size: 12px; color: #b45309; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px;">🔑 รหัสจัดส่งสินค้า (Key/Code)</div>
                        <div style="font-family: monospace; font-size: 18px; color: #78350f; font-weight: bold; letter-spacing: 1px;">{key_code}</div>
                    </div>
                    <div style="margin-top: 25px; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center; font-family: sans-serif;">
                        เลขที่ใบเสร็จ: <code>{order_doc['_id']}</code><br>
                        วันเวลาสั่งซื้อ: {datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")}
                    </div>
                    <div style="margin-top: 30px; text-align: center; font-size: 13px; color: #64748b; font-weight: 600; font-family: sans-serif;">
                        ขอบคุณที่ใช้บริการ ShopNow! ❤️
                    </div>
                </div>
            </body>
            </html>
            """
            
            body_text = f"""
            จัดส่งสินค้าสำเร็จ! (ShopNow)
            ========================
            🛒 สินค้าที่สั่งซื้อ: {product['name']}
            📦 จำนวน: {quantity} ชิ้น
            💰 ราคารวม: {total_price} ฿
            🔑 รหัสจัดส่งสินค้า (Key/Code): {key_code}
            
            เลขที่ใบเสร็จ: {order_doc['_id']}
            วันเวลาสั่งซื้อ: {datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")}
            
            ขอบคุณที่ใช้บริการ ShopNow! ❤️
            """
            from app.utils.email_sender import send_email_async
            send_email_async(user_email, subject, body_html, body_text)
        except Exception as e:
            print("[❌] Failed to initiate email sending:", e)

    elif user_discord_webhook and (user_discord_webhook.startswith("https://discord.com/api/webhooks/") or user_discord_webhook.startswith("https://discordapp.com/api/webhooks/")):
        try:
            personal_embed = {
                "title": "🎉 จัดส่งสินค้าสำเร็จ! (ShopNow)",
                "color": 0xFFB900,
                "fields": [
                    {"name": "🛒 สินค้าที่สั่งซื้อ", "value": product["name"], "inline": False},
                    {"name": "📦 จำนวน", "value": f"{quantity} ชิ้น", "inline": True},
                    {"name": "💰 ราคารวม", "value": f"{total_price} ฿", "inline": True},
                    {"name": "🔑 รหัสจัดส่งสินค้า (Key/Code)", "value": f"```{str(uuid.uuid4()).upper()}```", "inline": False},
                    {"name": "📝 เลขที่ใบเสร็จ", "value": f"`{order_doc['_id']}`", "inline": False},
                    {"name": "📅 วันเวลาสั่งซื้อ", "value": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S"), "inline": False}
                ],
                "footer": {"text": "ขอบคุณที่ใช้บริการ ShopNow! ❤️"}
            }
            
            def send_personal_discord():
                import requests as http_requests
                try:
                    http_requests.post(user_discord_webhook, json={"embeds": [personal_embed]}, timeout=5)
                except Exception as e:
                    print("[❌] User Personal Discord Webhook Failed to post:", e)
            
            import threading
            threading.Thread(target=send_personal_discord).start()
        except Exception as e:
            print("[❌] User Personal Discord Webhook Failed to start thread:", e)

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
            "dt_purchased": log["dt_purchased"].strftime('%Y-%m-%d %H:%M:%S') if hasattr(log.get("dt_purchased"), "strftime") else str(log.get("dt_purchased", "")),
            "refund": log.get("refund", False)
        })

    return jsonify({"status": True, "results": result})
