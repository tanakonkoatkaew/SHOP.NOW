from app.utils.logger import send_discord_log_async
from bson import ObjectId
from flask import Blueprint, request, jsonify, g
from app.extensions import get_db
from app.middlewares import auth_required
import bcrypt
import jwt
import datetime
import os

auth_bp = Blueprint('auth', __name__)
SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "your-secret-key")

def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr

# ✅ REGISTER
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    username = data.get('username')
    password = data.get('password')

    db = get_db()

    if db.users.find_one({'username': username}):
        return jsonify({"error": "Username already exists"}), 400

    if db.users.find_one({'email': email}):
        return jsonify({"error": "Email already exists"}), 400

    hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    db.users.insert_one({
        'email': email,
        'username': username,
        'password': hashed_pw,
        'credit': 0.0,
        'reward': 0.0
    })

    headers_copy = dict(request.headers)
    ip_address = request.headers.get("X-Forwarded-For", request.remote_addr)
    host_url = request.host_url
    referrer = request.referrer

    send_discord_log_async(
        event_type="🆕 สมัครสมาชิกใหม่",
        request_headers=headers_copy,
        ip_address=ip_address,
        host_url=host_url,
        referrer=referrer,
        data={
            "Username": username,
            "Email": email
        }
    )

    return jsonify({"message": "User registered successfully!"}), 200


# ✅ LOGIN
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    db = get_db()
    user = db.users.find_one({'username': username})
    if not user:
        return jsonify({"error": "User not found"}), 401

    if bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        token = jwt.encode({
            'user_id': str(user['_id']),
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, SECRET_KEY, algorithm="HS256")

        headers_copy = dict(request.headers)
        ip_address = request.headers.get("X-Forwarded-For", request.remote_addr)
        host_url = request.host_url
        referrer = request.referrer

        send_discord_log_async(
            event_type="🔐 เข้าสู่ระบบสำเร็จ",
            request_headers=headers_copy,
            ip_address=ip_address,
            host_url=host_url,
            referrer=referrer,
            data={
                "Username": username,
                "Email": user.get("email", "N/A")
            }
        )

        return jsonify({"token": token}), 200

    return jsonify({"error": "Invalid credentials"}), 401

# ✅ GET PROFILE เต็ม
@auth_bp.route('/me/profile')
@auth_required

def get_profile():
    db = get_db()
    try:
        user = db.users.find_one({"_id": ObjectId(g.user_id)})
    except Exception:
        return jsonify({"status": False, "message": "Invalid user ID"}), 400

    if not user:
        return jsonify({"status": False, "message": "ไม่พบผู้ใช้"}), 404

    return jsonify({
        "status": True,
        "data": {
            "username": user["username"],
            "email": user.get("email", ""),
            "phone": user.get("phone", ""),
            "credit": float(user.get("credit", 0)),
            "reward": float(user.get("reward", 0))
        }
    })


# ✅ GET PROFILE ย่อ
@auth_bp.route('/me/user', methods=['GET'])
@auth_required
def get_user_basic():
    db = get_db()
    try:
        user = db.users.find_one({"_id": ObjectId(g.user_id)})
    except Exception:
        return jsonify({"error": "Invalid user ID format"}), 400

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "status": True,
        "user": {
            "username": user["username"],
            "credit": float(user.get("credit", 0.0))
        }
    })
