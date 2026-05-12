from datetime import datetime, timezone
from bson import ObjectId
from flask import Blueprint, request, jsonify, g
from app.extensions import get_db
from app.middlewares import auth_required, admin_required

chat_bp = Blueprint('chat', __name__)
admin_chat_bp = Blueprint('admin_chat', __name__)


# ─── FAQ (static knowledge base for the bot) ─────────────────────────────────

FAQ_ITEMS = [
    {
        "id": "order",
        "q": "วิธีสั่งซื้อสินค้า",
        "a": "1) เลือกสินค้าที่ต้องการ\n2) กดปุ่ม \"ซื้อเลย\" ในหน้ารายละเอียดสินค้า\n3) ระบบจะหักเครดิตจากบัญชีของคุณอัตโนมัติ\n4) ดูประวัติการซื้อได้ที่เมนู \"ประวัติการซื้อ\""
    },
    {
        "id": "topup",
        "q": "วิธีเติมเงิน / เติมเครดิต",
        "a": "เข้าไปที่เมนู \"เติมเงิน\" สามารถเลือกได้ 2 ช่องทาง:\n• สแกน QR PromptPay แล้วอัพโหลดสลิป (รอแอดมินตรวจสอบ)\n• เติมผ่านซองอั่งเป่า TrueMoney Wallet\n\nเครดิตจะเข้าทันทีหลังตรวจสอบสำเร็จ"
    },
    {
        "id": "slip",
        "q": "อัพโหลดสลิปแล้วเครดิตยังไม่เข้า",
        "a": "ปกติแอดมินจะตรวจสอบสลิปภายใน 5-30 นาที หากเกินกว่านี้สามารถพิมพ์ \"คุยกับแอดมิน\" เพื่อแจ้งได้เลย โดยเตรียม Ref code ของรายการไว้ด้วยครับ"
    },
    {
        "id": "warranty",
        "q": "สินค้ามีรับประกันไหม",
        "a": "สินค้าที่มีตราสัญลักษณ์ \"รับประกัน\" จะมีการรับประกันตามเงื่อนไขของผู้ขาย หากสินค้าใช้งานไม่ได้ภายในระยะเวลารับประกัน สามารถติดต่อแอดมินผ่านช่องแชทนี้เพื่อขอเปลี่ยน/คืนได้"
    },
    {
        "id": "coupon",
        "q": "ใช้คูปองส่วนลดยังไง",
        "a": "ในหน้าชำระเงิน จะมีช่องให้กรอกโค้ดส่วนลด เมื่อใส่โค้ดที่ถูกต้องระบบจะคำนวณส่วนลดให้อัตโนมัติก่อนยืนยันคำสั่งซื้อ"
    },
    {
        "id": "refund",
        "q": "ขอคืนเงินได้ไหม",
        "a": "กรณีสินค้ามีปัญหา/ไม่ตรงตามที่แสดง สามารถขอคืนเงินได้ภายใน 24 ชั่วโมงหลังการซื้อ โดยติดต่อแอดมินผ่านแชทนี้พร้อมแนบหลักฐาน"
    },
    {
        "id": "contact",
        "q": "ช่องทางติดต่อแอดมิน",
        "a": "ส่งข้อความผ่านแชทนี้ได้เลย แอดมินจะตอบกลับโดยเร็วที่สุด หรือไปที่หน้า \"ติดต่อ\" เพื่อดูช่องทางอื่น ๆ"
    },
]


def _bot_autoreply(text):
    """Very small keyword matcher; returns FAQ answer when matched else None."""
    if not text:
        return None
    t = text.lower()
    rules = [
        (("สั่งซื้อ", "ซื้อยังไง", "ซื้อสินค้า", "order", "how to buy"), "order"),
        (("เติม", "เติมเงิน", "topup", "เครดิต"), "topup"),
        (("สลิป", "slip", "โอนแล้ว", "ยังไม่เข้า"), "slip"),
        (("รับประกัน", "warranty", "ประกัน"), "warranty"),
        (("คูปอง", "ส่วนลด", "coupon", "discount"), "coupon"),
        (("คืนเงิน", "refund", "เคลม"), "refund"),
        (("ติดต่อ", "แอดมิน", "admin", "contact"), "contact"),
        (("สวัสดี", "hello", "hi", "hey"), None),  # greeting
    ]
    for keywords, faq_id in rules:
        if any(k in t for k in keywords):
            if faq_id is None:
                return "สวัสดีครับ มีอะไรให้ช่วยไหม? ลองเลือกคำถามที่พบบ่อยด้านล่าง หรือพิมพ์ \"คุยกับแอดมิน\" เพื่อติดต่อทีมงาน"
            for f in FAQ_ITEMS:
                if f["id"] == faq_id:
                    return f["a"]
    return None


# ─── helpers ─────────────────────────────────────────────────────────────────

def _get_or_create_session(db, user_id):
    user_oid = ObjectId(user_id)
    sess = db.chat_sessions.find_one({"user_id": user_oid})
    if sess:
        return sess
    user = db.users.find_one({"_id": user_oid})
    username = user.get("username", "—") if user else "—"
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_oid,
        "username": username,
        "created_at": now,
        "updated_at": now,
        "last_message": "",
        "last_sender": "",
        "unread_admin": 0,
        "unread_user": 0,
    }
    res = db.chat_sessions.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


def _serialize_message(m):
    return {
        "id":         str(m["_id"]),
        "sender":     m.get("sender", "user"),
        "text":       m.get("text", ""),
        "created_at": m["created_at"].isoformat() if m.get("created_at") else "",
    }


# ─── USER ENDPOINTS ──────────────────────────────────────────────────────────

@chat_bp.route('/faq', methods=['GET'])
def faq():
    return jsonify({"status": True, "results": FAQ_ITEMS})


@chat_bp.route('/messages', methods=['GET'])
@auth_required
def get_my_messages():
    db = get_db()
    sess = _get_or_create_session(db, g.user_id)
    msgs = db.chat_messages.find({"session_id": sess["_id"]}).sort("created_at", 1).limit(500)
    results = [_serialize_message(m) for m in msgs]

    # mark admin replies as read by user
    db.chat_messages.update_many(
        {"session_id": sess["_id"], "sender": "admin", "read_by_user": {"$ne": True}},
        {"$set": {"read_by_user": True}}
    )
    db.chat_sessions.update_one({"_id": sess["_id"]}, {"$set": {"unread_user": 0}})

    return jsonify({"status": True, "results": results})


@chat_bp.route('/send', methods=['POST'])
@auth_required
def send_message():
    db = get_db()
    data = request.json or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"status": False, "message": "ข้อความว่างเปล่า"}), 400
    if len(text) > 2000:
        return jsonify({"status": False, "message": "ข้อความยาวเกินไป (สูงสุด 2000 ตัวอักษร)"}), 400

    sess = _get_or_create_session(db, g.user_id)
    now = datetime.now(timezone.utc)

    user_msg = {
        "session_id":   sess["_id"],
        "user_id":      sess["user_id"],
        "sender":       "user",
        "text":         text,
        "created_at":   now,
        "read_by_admin": False,
        "read_by_user":  True,
    }
    db.chat_messages.insert_one(user_msg)
    db.chat_sessions.update_one(
        {"_id": sess["_id"]},
        {
            "$set": {
                "last_message": text[:120],
                "last_sender":  "user",
                "updated_at":   now,
            },
            "$inc": {"unread_admin": 1},
        }
    )

    # Try bot auto-reply for common questions
    bot_reply = _bot_autoreply(text) if not data.get("skip_bot") else None
    bot_msg_doc = None
    if bot_reply:
        bot_msg_doc = {
            "session_id":   sess["_id"],
            "user_id":      sess["user_id"],
            "sender":       "bot",
            "text":         bot_reply,
            "created_at":   datetime.now(timezone.utc),
            "read_by_admin": True,
            "read_by_user":  True,
        }
        db.chat_messages.insert_one(bot_msg_doc)

    return jsonify({
        "status": True,
        "bot_reply": _serialize_message(bot_msg_doc) if bot_msg_doc else None,
    })


@chat_bp.route('/faq-answer', methods=['POST'])
@auth_required
def faq_answer():
    """Store a FAQ Q&A pair in chat history when user clicks a quick-reply."""
    db = get_db()
    data = request.json or {}
    faq_id = data.get("id")
    item = next((f for f in FAQ_ITEMS if f["id"] == faq_id), None)
    if not item:
        return jsonify({"status": False, "message": "FAQ ไม่พบ"}), 404

    sess = _get_or_create_session(db, g.user_id)
    now = datetime.now(timezone.utc)
    q_msg = {
        "session_id": sess["_id"], "user_id": sess["user_id"],
        "sender": "user", "text": item["q"], "created_at": now,
        "read_by_admin": True, "read_by_user": True,
    }
    db.chat_messages.insert_one(q_msg)
    a_msg = {
        "session_id": sess["_id"], "user_id": sess["user_id"],
        "sender": "bot", "text": item["a"],
        "created_at": datetime.now(timezone.utc),
        "read_by_admin": True, "read_by_user": True,
    }
    db.chat_messages.insert_one(a_msg)
    db.chat_sessions.update_one(
        {"_id": sess["_id"]},
        {"$set": {"last_message": item["a"][:120], "last_sender": "bot", "updated_at": now}}
    )
    return jsonify({"status": True, "question": _serialize_message(q_msg), "answer": _serialize_message(a_msg)})


# ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────────

@admin_chat_bp.route('/sessions', methods=['GET'])
@admin_required
def list_sessions():
    db = get_db()
    sessions = db.chat_sessions.find().sort("updated_at", -1).limit(200)
    results = []
    for s in sessions:
        results.append({
            "id":            str(s["_id"]),
            "user_id":       str(s.get("user_id", "")),
            "username":      s.get("username", "—"),
            "last_message":  s.get("last_message", ""),
            "last_sender":   s.get("last_sender", ""),
            "unread_admin":  int(s.get("unread_admin", 0)),
            "updated_at":    s["updated_at"].isoformat() if s.get("updated_at") else "",
        })
    return jsonify({"status": True, "results": results})


@admin_chat_bp.route('/sessions/<session_id>/messages', methods=['GET'])
@admin_required
def session_messages(session_id):
    db = get_db()
    try:
        oid = ObjectId(session_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    sess = db.chat_sessions.find_one({"_id": oid})
    if not sess:
        return jsonify({"status": False, "message": "ไม่พบ session"}), 404

    msgs = db.chat_messages.find({"session_id": oid}).sort("created_at", 1).limit(500)
    results = [_serialize_message(m) for m in msgs]

    # mark user msgs as read by admin
    db.chat_messages.update_many(
        {"session_id": oid, "sender": "user", "read_by_admin": {"$ne": True}},
        {"$set": {"read_by_admin": True}}
    )
    db.chat_sessions.update_one({"_id": oid}, {"$set": {"unread_admin": 0}})

    return jsonify({
        "status":   True,
        "username": sess.get("username", "—"),
        "user_id":  str(sess.get("user_id", "")),
        "results":  results,
    })


@admin_chat_bp.route('/sessions/<session_id>/reply', methods=['POST'])
@admin_required
def admin_reply(session_id):
    db = get_db()
    try:
        oid = ObjectId(session_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    data = request.json or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"status": False, "message": "ข้อความว่างเปล่า"}), 400
    if len(text) > 2000:
        return jsonify({"status": False, "message": "ข้อความยาวเกินไป"}), 400

    sess = db.chat_sessions.find_one({"_id": oid})
    if not sess:
        return jsonify({"status": False, "message": "ไม่พบ session"}), 404

    now = datetime.now(timezone.utc)
    msg = {
        "session_id":   oid,
        "user_id":      sess["user_id"],
        "sender":       "admin",
        "text":         text,
        "created_at":   now,
        "read_by_admin": True,
        "read_by_user":  False,
    }
    db.chat_messages.insert_one(msg)
    db.chat_sessions.update_one(
        {"_id": oid},
        {
            "$set": {"last_message": text[:120], "last_sender": "admin", "updated_at": now},
            "$inc": {"unread_user": 1},
        }
    )
    return jsonify({"status": True, "message": _serialize_message(msg)})


@admin_chat_bp.route('/sessions/<session_id>', methods=['DELETE'])
@admin_required
def delete_session(session_id):
    db = get_db()
    try:
        oid = ObjectId(session_id)
    except Exception:
        return jsonify({"status": False, "message": "ID ไม่ถูกต้อง"}), 400

    db.chat_messages.delete_many({"session_id": oid})
    db.chat_sessions.delete_one({"_id": oid})
    return jsonify({"status": True, "message": "ลบ session แล้ว"})
