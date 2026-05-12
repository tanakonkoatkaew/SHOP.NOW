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

# DB
from app.extensions import init_db


def create_app():
    app = Flask(
        __name__,
        static_folder=os.path.join(os.path.dirname(__file__), 'static')
    )

    # Enable CORS (สำหรับ frontend JS)
    CORS(app)

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

    return app
