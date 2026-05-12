from flask import Blueprint, request, jsonify, g
from app.extensions import get_db
import jwt
import os

order_bp = Blueprint('order', __name__)
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")

# ✅ Middleware
def auth_required(f):
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
    wrapper.__name__ = f.__name__
    return wrapper

# ✅ API เรียกดูประวัติการสั่งซื้อ
@order_bp.route('/api/orders/logs', methods=['GET'])
@auth_required
def get_purchase_logs():
    db = get_db()
    orders = db.orders.find({"user_id": g.user}).sort("dt_purchased", -1)

    logs = []
    for o in orders:
        logs.append({
            "order_id": o["_id"],
            "product_name": o["product"]["name"],
            "product_image": o["product"]["image"],
            "price": o["product"]["price"],
            "purchased_at": o["dt_purchased"]
        })

    return jsonify({
        "status": True,
        "results": logs
    })