from app.utils.logger import send_discord_log_async
from bson import ObjectId
from flask import Blueprint, request, jsonify, g
from app.extensions import get_db, get_jwt_secret
from app.middlewares import auth_required
import bcrypt
import jwt
import datetime
import os

auth_bp = Blueprint('auth', __name__)
SECRET_KEY = get_jwt_secret()

# ─── Login brute-force protection (DB-backed, works across gunicorn workers) ──
MAX_FAILED_ATTEMPTS = 5           # lock after this many consecutive failures
LOCKOUT_MINUTES     = 15          # duration of the lock / attempt window


def _login_locked_for(db, key):
    """Return remaining lockout seconds for `key` (username|ip), or 0 if free."""
    rec = db.login_attempts.find_one({"_id": key})
    if not rec:
        return 0
    if rec.get("count", 0) < MAX_FAILED_ATTEMPTS:
        return 0
    last = rec.get("last")
    if not last:
        return 0
    elapsed = (datetime.datetime.utcnow() - last).total_seconds()
    remaining = LOCKOUT_MINUTES * 60 - elapsed
    return int(remaining) if remaining > 0 else 0


def _record_login_failure(db, key):
    now = datetime.datetime.utcnow()
    rec = db.login_attempts.find_one({"_id": key})
    # Reset the counter if the previous window already expired
    if rec and rec.get("last") and (now - rec["last"]).total_seconds() > LOCKOUT_MINUTES * 60:
        db.login_attempts.update_one({"_id": key}, {"$set": {"count": 1, "last": now}})
    else:
        db.login_attempts.update_one(
            {"_id": key},
            {"$inc": {"count": 1}, "$set": {"last": now}},
            upsert=True,
        )


def _clear_login_failures(db, key):
    db.login_attempts.delete_one({"_id": key})

def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr

# ❌ REGISTER — disabled (OAuth-only policy: users must sign up via Google / Discord)
@auth_bp.route('/register', methods=['POST'])
def register():
    return jsonify({
        "status": False,
        "message": "การสมัครผ่านช่องทางนี้ถูกปิดใช้งาน กรุณาสมัคร/เข้าสู่ระบบด้วย Google หรือ Discord"
    }), 403


def _register_legacy_disabled():
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

    # Brute-force protection — throttle by username + client IP
    ip_address = get_client_ip()
    lock_key = f"{username}|{ip_address}"
    locked = _login_locked_for(db, lock_key)
    if locked:
        return jsonify({
            "error": f"พยายามเข้าสู่ระบบผิดเกินกำหนด กรุณาลองใหม่ในอีก {locked // 60 + 1} นาที"
        }), 429

    user = db.users.find_one({'username': username})
    if not user:
        _record_login_failure(db, lock_key)
        return jsonify({"error": "Invalid credentials"}), 401

    if bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        _clear_login_failures(db, lock_key)
        token = jwt.encode({
            'user_id': str(user['_id']),
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, SECRET_KEY, algorithm="HS256")

        headers_copy = dict(request.headers)
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

    _record_login_failure(db, lock_key)
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
            "reward": float(user.get("reward", 0)),
            "avatar": user.get("avatar", ""),
            "discord_id": user.get("discord_id", ""),
            "line_id": user.get("line_id", ""),
            # ที่อยู่จัดส่ง
            "recipient":   user.get("recipient", ""),
            "address":     user.get("address", ""),
            "subdistrict": user.get("subdistrict", ""),
            "district":    user.get("district", ""),
            "province":    user.get("province", ""),
            "postal_code": user.get("postal_code", ""),
        }
    })

# ✅ UPDATE PROFILE
@auth_bp.route('/me/profile', methods=['PUT'])
@auth_required
def update_profile():
    db = get_db()
    data = request.json or {}
    
    update_fields = {}
    
    if "username" in data and data["username"].strip():
        # Check if new username is already taken by someone else
        existing = db.users.find_one({"username": data["username"].strip(), "_id": {"$ne": ObjectId(g.user_id)}})
        if existing:
            return jsonify({"status": False, "message": "Username นี้ถูกใช้งานแล้ว"}), 400
        update_fields["username"] = data["username"].strip()
        
    if "phone" in data:
        update_fields["phone"] = data["phone"].strip()
    if "avatar" in data:
        update_fields["avatar"] = data["avatar"].strip()
    if "discord_id" in data:
        update_fields["discord_id"] = data["discord_id"].strip()
    if "line_id" in data:
        update_fields["line_id"] = data["line_id"].strip()

    # ที่อยู่จัดส่ง
    for key in ("recipient", "address", "subdistrict", "district", "province"):
        if key in data:
            update_fields[key] = str(data[key]).strip()

    if "postal_code" in data:
        postal = str(data["postal_code"]).strip()
        if postal and not (postal.isdigit() and len(postal) == 5):
            return jsonify({"status": False, "message": "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก"}), 400
        update_fields["postal_code"] = postal

    if update_fields:
        db.users.update_one({"_id": ObjectId(g.user_id)}, {"$set": update_fields})
        
    return jsonify({"status": True, "message": "อัพเดทโปรไฟล์สำเร็จ"})


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
            "id":       str(user["_id"]),
            "username": user["username"],
            "credit":   float(user.get("credit", 0.0)),
            "reward":   float(user.get("reward", 0.0)),
            "is_admin": bool(user.get("is_admin", False)),
        }
    })


# ─── IN-APP NOTIFICATIONS ────────────────────────────────────────────────────

@auth_bp.route('/me/notifications', methods=['GET'])
@auth_required
def list_notifications():
    db = get_db()
    docs = db.notifications.find({"user_id": str(g.user_id)}).sort("created_at", -1).limit(50)
    items = []
    unread = 0
    for d in docs:
        if not d.get("read", False):
            unread += 1
        items.append({
            "id":         d["_id"],
            "title":      d.get("title", ""),
            "body":       d.get("body", ""),
            "type":       d.get("type", "info"),
            "read":       bool(d.get("read", False)),
            "created_at": d["created_at"].isoformat() if d.get("created_at") else "",
        })
    return jsonify({"status": True, "unread": unread, "results": items})


@auth_bp.route('/me/notifications/read', methods=['POST'])
@auth_required
def mark_notifications_read():
    db = get_db()
    data = request.json or {}
    nid = data.get("id")
    if nid:
        db.notifications.update_one({"_id": nid, "user_id": str(g.user_id)}, {"$set": {"read": True}})
    else:
        db.notifications.update_many({"user_id": str(g.user_id), "read": False}, {"$set": {"read": True}})
    return jsonify({"status": True})


# ─── DISCORD OAUTH2 LOGIN ────────────────────────────────────────────────────

@auth_bp.route('/discord')
def discord_redirect():
    client_id = os.getenv("DISCORD_CLIENT_ID", "").strip()
    redirect_uri = os.getenv("DISCORD_REDIRECT_URI", "").strip()
    if not client_id or not redirect_uri:
        return "Discord OAuth is not configured in .env", 400
        
    discord_auth_url = f"https://discord.com/oauth2/authorize?client_id={client_id}&redirect_uri={redirect_uri}&response_type=code&scope=identify+email"
    from flask import redirect
    return redirect(discord_auth_url)


@auth_bp.route('/discord/callback')
def discord_callback():
    from flask import redirect
    code = request.args.get('code')
    if not code:
        return "Authorization code not found in request", 400
        
    client_id = os.getenv("DISCORD_CLIENT_ID", "").strip()
    client_secret = os.getenv("DISCORD_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("DISCORD_REDIRECT_URI", "").strip()
    
    if not client_id or not client_secret or not redirect_uri:
        return "Discord OAuth configuration error", 400
        
    # 1. Exchange code for access token
    token_url = "https://discord.com/api/oauth2/token"
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    import requests as http_requests
    try:
        token_resp = http_requests.post(token_url, data=data, headers=headers, timeout=10)
        if token_resp.status_code != 200:
            return f"Failed to retrieve access token: {token_resp.text}", 400
        token_data = token_resp.json()
    except Exception as e:
        return f"Network error during token exchange: {str(e)}", 500
        
    access_token = token_data.get("access_token")
    if not access_token:
        return "Access token not found in response", 400
        
    # 2. Get user info from Discord API
    user_url = "https://discord.com/api/users/@me"
    user_headers = {
        "Authorization": f"Bearer {access_token}"
    }
    try:
        user_resp = http_requests.get(user_url, headers=user_headers, timeout=10)
        if user_resp.status_code != 200:
            return f"Failed to retrieve user info from Discord: {user_resp.text}", 400
        user_data = user_resp.json()
    except Exception as e:
        return f"Network error during user info fetch: {str(e)}", 500
        
    discord_user_id = user_data.get("id")
    discord_username = user_data.get("username")
    discord_email = user_data.get("email", "")
    avatar_hash = user_data.get("avatar")
    
    if not discord_user_id or not discord_username:
        return "Incomplete user profile received from Discord", 400
        
    avatar_url = ""
    if avatar_hash:
        avatar_url = f"https://cdn.discordapp.com/avatars/{discord_user_id}/{avatar_hash}.png"
        
    # 3. Find or create user in MongoDB
    db = get_db()
    
    # Try by discord_user_id
    user = db.users.find_one({"discord_user_id": discord_user_id})
    
    # If not found, try by email and link the account
    if not user and discord_email:
        user = db.users.find_one({"email": discord_email})
        if user:
            db.users.update_one({"_id": user["_id"]}, {"$set": {"discord_user_id": discord_user_id}})
            
    if not user:
        # Create a new user
        # Ensure username is unique
        base_username = discord_username
        username = base_username
        counter = 1
        while db.users.find_one({"username": username}):
            username = f"{base_username}{counter}"
            counter += 1
            
        import uuid
        placeholder_pw = bcrypt.hashpw(uuid.uuid4().hex.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        user_doc = {
            "email":           discord_email,
            "username":        username,
            "password":        placeholder_pw,
            "credit":          0.0,
            "reward":          0.0,
            "discord_user_id": discord_user_id,
            "avatar":          avatar_url
        }
        db.users.insert_one(user_doc)
        user = user_doc
        
        # Log to discord channel
        send_discord_log_async(
            event_type="🆕 สมัครสมาชิกใหม่ (ผ่าน Discord)",
            request_headers=dict(request.headers),
            ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
            host_url=request.host_url,
            referrer=request.referrer,
            data={
                "Username": username,
                "Email": discord_email,
                "Discord ID": discord_user_id
            }
        )
    else:
        # Update user avatar if empty or changed
        updates = {}
        if not user.get("avatar") and avatar_url:
            updates["avatar"] = avatar_url
        if updates:
            db.users.update_one({"_id": user["_id"]}, {"$set": updates})

    # 4. Generate JWT token
    token = jwt.encode({
        'user_id': str(user['_id']),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, SECRET_KEY, algorithm="HS256")
    
    # 5. Redirect back to frontend
    return redirect(f"/login?token={token}")


# ─── GOOGLE OAUTH2 LOGIN ─────────────────────────────────────────────────────

@auth_bp.route('/google')
def google_redirect():
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    if not client_id or not redirect_uri:
        return "Google OAuth is not configured in .env", 400
        
    google_auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&redirect_uri={redirect_uri}&"
        f"response_type=code&scope=openid+profile+email&prompt=select_account"
    )
    from flask import redirect
    return redirect(google_auth_url)


@auth_bp.route('/google/callback')
def google_callback():
    from flask import redirect
    code = request.args.get('code')
    if not code:
        return "Authorization code not found in request", 400
        
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    
    if not client_id or not client_secret or not redirect_uri:
        return "Google OAuth configuration error", 400
        
    # 1. Exchange code for access token
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    import requests as http_requests
    try:
        token_resp = http_requests.post(token_url, data=data, headers=headers, timeout=10)
        if token_resp.status_code != 200:
            return f"Failed to retrieve access token: {token_resp.text}", 400
        token_data = token_resp.json()
    except Exception as e:
        return f"Network error during token exchange: {str(e)}", 500
        
    access_token = token_data.get("access_token")
    if not access_token:
        return "Access token not found in response", 400
        
    # 2. Get user info from Google API
    user_url = "https://www.googleapis.com/oauth2/v3/userinfo"
    user_headers = {
        "Authorization": f"Bearer {access_token}"
    }
    try:
        user_resp = http_requests.get(user_url, headers=user_headers, timeout=10)
        if user_resp.status_code != 200:
            return f"Failed to retrieve user info from Google: {user_resp.text}", 400
        user_data = user_resp.json()
    except Exception as e:
        return f"Network error during user info fetch: {str(e)}", 500
        
    google_user_id = user_data.get("sub")
    google_name = user_data.get("name")
    google_email = user_data.get("email", "")
    picture = user_data.get("picture", "")
    
    if not google_user_id or not google_name:
        return "Incomplete user profile received from Google", 400
        
    # 3. Find or create user in MongoDB
    db = get_db()
    
    # Try by google_user_id
    user = db.users.find_one({"google_user_id": google_user_id})
    
    # If not found, try by email and link the account
    if not user and google_email:
        user = db.users.find_one({"email": google_email})
        if user:
            db.users.update_one({"_id": user["_id"]}, {"$set": {"google_user_id": google_user_id}})
            
    if not user:
        # Create a new user
        # Ensure username is unique
        base_username = google_name
        username = base_username
        counter = 1
        while db.users.find_one({"username": username}):
            username = f"{base_username}{counter}"
            counter += 1
            
        import uuid
        placeholder_pw = bcrypt.hashpw(uuid.uuid4().hex.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        user_doc = {
            "email":          google_email,
            "username":       username,
            "password":       placeholder_pw,
            "credit":         0.0,
            "reward":         0.0,
            "google_user_id": google_user_id,
            "avatar":         picture
        }
        db.users.insert_one(user_doc)
        user = user_doc
        
        # Log to discord channel
        send_discord_log_async(
            event_type="🆕 สมัครสมาชิกใหม่ (ผ่าน Google)",
            request_headers=dict(request.headers),
            ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
            host_url=request.host_url,
            referrer=request.referrer,
            data={
                "Username": username,
                "Email": google_email,
                "Google ID": google_user_id
            }
        )
    else:
        # Update user avatar if empty or changed
        updates = {}
        if not user.get("avatar") and picture:
            updates["avatar"] = picture
        if updates:
            db.users.update_one({"_id": user["_id"]}, {"$set": updates})

    # 4. Generate JWT token
    token = jwt.encode({
        'user_id': str(user['_id']),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, SECRET_KEY, algorithm="HS256")

    # 5. Redirect back to frontend
    return redirect(f"/login?token={token}")


# ─── FACEBOOK OAUTH2 LOGIN ───────────────────────────────────────────────────

FACEBOOK_API_VERSION = "v19.0"


@auth_bp.route('/facebook')
def facebook_redirect():
    client_id = os.getenv("FACEBOOK_CLIENT_ID", "").strip()
    redirect_uri = os.getenv("FACEBOOK_REDIRECT_URI", "").strip()
    if not client_id or not redirect_uri:
        return "Facebook OAuth is not configured in .env", 400

    facebook_auth_url = (
        f"https://www.facebook.com/{FACEBOOK_API_VERSION}/dialog/oauth?"
        f"client_id={client_id}&redirect_uri={redirect_uri}&"
        f"response_type=code&scope=email,public_profile"
    )
    from flask import redirect
    return redirect(facebook_auth_url)


@auth_bp.route('/facebook/callback')
def facebook_callback():
    from flask import redirect
    code = request.args.get('code')
    if not code:
        return "Authorization code not found in request", 400

    client_id = os.getenv("FACEBOOK_CLIENT_ID", "").strip()
    client_secret = os.getenv("FACEBOOK_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("FACEBOOK_REDIRECT_URI", "").strip()

    if not client_id or not client_secret or not redirect_uri:
        return "Facebook OAuth configuration error", 400

    import requests as http_requests

    # 1. Exchange code for access token
    token_url = f"https://graph.facebook.com/{FACEBOOK_API_VERSION}/oauth/access_token"
    params = {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    try:
        token_resp = http_requests.get(token_url, params=params, timeout=10)
        if token_resp.status_code != 200:
            return f"Failed to retrieve access token: {token_resp.text}", 400
        token_data = token_resp.json()
    except Exception as e:
        return f"Network error during token exchange: {str(e)}", 500

    access_token = token_data.get("access_token")
    if not access_token:
        return "Access token not found in response", 400

    # 2. Get user info from Graph API
    user_url = f"https://graph.facebook.com/{FACEBOOK_API_VERSION}/me"
    try:
        user_resp = http_requests.get(
            user_url,
            params={"fields": "id,name,email,picture.width(256)", "access_token": access_token},
            timeout=10,
        )
        if user_resp.status_code != 200:
            return f"Failed to retrieve user info from Facebook: {user_resp.text}", 400
        user_data = user_resp.json()
    except Exception as e:
        return f"Network error during user info fetch: {str(e)}", 500

    facebook_user_id = user_data.get("id")
    facebook_name = user_data.get("name")
    facebook_email = user_data.get("email", "")
    try:
        picture = user_data.get("picture", {}).get("data", {}).get("url", "")
    except Exception:
        picture = ""

    if not facebook_user_id or not facebook_name:
        return "Incomplete user profile received from Facebook", 400

    # 3. Find or create user in MongoDB
    db = get_db()

    user = db.users.find_one({"facebook_user_id": facebook_user_id})

    if not user and facebook_email:
        user = db.users.find_one({"email": facebook_email})
        if user:
            db.users.update_one({"_id": user["_id"]}, {"$set": {"facebook_user_id": facebook_user_id}})

    if not user:
        base_username = facebook_name
        username = base_username
        counter = 1
        while db.users.find_one({"username": username}):
            username = f"{base_username}{counter}"
            counter += 1

        import uuid
        placeholder_pw = bcrypt.hashpw(uuid.uuid4().hex.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        user_doc = {
            "email":            facebook_email,
            "username":         username,
            "password":         placeholder_pw,
            "credit":           0.0,
            "reward":           0.0,
            "facebook_user_id": facebook_user_id,
            "avatar":           picture,
        }
        db.users.insert_one(user_doc)
        user = user_doc

        send_discord_log_async(
            event_type="🆕 สมัครสมาชิกใหม่ (ผ่าน Facebook)",
            request_headers=dict(request.headers),
            ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
            host_url=request.host_url,
            referrer=request.referrer,
            data={
                "Username": username,
                "Email": facebook_email,
                "Facebook ID": facebook_user_id,
            },
        )
    else:
        updates = {}
        if not user.get("avatar") and picture:
            updates["avatar"] = picture
        if updates:
            db.users.update_one({"_id": user["_id"]}, {"$set": updates})

    # 4. Generate JWT token
    token = jwt.encode({
        'user_id': str(user['_id']),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, SECRET_KEY, algorithm="HS256")

    # 5. Redirect back to frontend
    return redirect(f"/login?token={token}")


