import os
from flask import Flask, jsonify
from flask_cors import CORS

# Import Blueprints
from app.auth.routes import auth_bp
from app.product.routes import product_bp
from app.order.routes import order_bp
from app.frontend.routes import frontend_bp
from app.payment.routes import payment_bp
from app.admin.routes import admin_bp
from app.chat.routes import chat_bp, admin_chat_bp

# DB + rate limiter
from app.extensions import init_db, limiter


def create_app():
    app = Flask(
        __name__,
        static_folder=os.path.join(os.path.dirname(__file__), 'static')
    )

    # CORS: allowlist via env. Empty (default) = no cross-origin access at all —
    # the SPA is served same-origin by frontend_bp, so nothing is needed in prod.
    allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if allowed_origins:
        CORS(app, origins=allowed_origins)

    # Rate limiting (429) + upload size cap (413)
    limiter.init_app(app)
    app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_UPLOAD_MB", "5")) * 1024 * 1024

    # Initialize MongoDB
    init_db()

    # Register Blueprints
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(product_bp, url_prefix='/api/products')
    app.register_blueprint(order_bp, url_prefix='/api/orders')     # 👈 prefix ให้ชัดเจน
    app.register_blueprint(payment_bp, url_prefix='/api/payment')
    app.register_blueprint(admin_bp,   url_prefix='/api/admin')
    app.register_blueprint(chat_bp,    url_prefix='/api/chat')
    app.register_blueprint(admin_chat_bp, url_prefix='/api/admin/chat')
    app.register_blueprint(frontend_bp)

    # API 404 — non-API paths are handled by the SPA catch-all in frontend_bp
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"status": False, "message": "Not Found"}), 404

    @app.errorhandler(429)
    def too_many_requests(e):
        return jsonify({"status": False, "message": "คำขอถี่เกินไป กรุณาลองใหม่ภายหลัง"}), 429

    @app.errorhandler(413)
    def payload_too_large(e):
        max_mb = os.getenv("MAX_UPLOAD_MB", "5")
        return jsonify({"status": False, "message": f"ไฟล์ใหญ่เกินไป (สูงสุด {max_mb}MB)"}), 413

    return app
