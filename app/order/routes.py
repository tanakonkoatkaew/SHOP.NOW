from flask import Blueprint, jsonify, g
from app.extensions import get_db
from app.middlewares import auth_required

order_bp = Blueprint('order', __name__)


@order_bp.route('/logs', methods=['GET'])
@auth_required
def get_purchase_logs():
    db = get_db()
    orders = db.orders.find({"user_id": g.user_id}).sort("dt_purchased", -1)

    logs = []
    for o in orders:
        purchased_at = o.get("dt_purchased")
        if purchased_at and hasattr(purchased_at, 'strftime'):
            purchased_at = purchased_at.strftime('%Y-%m-%d %H:%M:%S')
        elif purchased_at:
            purchased_at = str(purchased_at)
        else:
            purchased_at = ""

        logs.append({
            "product": {
                "name":  o.get("product_name", ""),
                "image": o.get("product_image", ""),
                "price": o.get("product_price", 0),
            },
            "dt_purchased": purchased_at,
            "refund": o.get("refund", False),
        })

    return jsonify({"status": True, "results": logs})
