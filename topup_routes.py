from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

payment_api = Blueprint("payment_api", __name__, url_prefix="/api/topup")

@payment_api.route("/request", methods=["POST"])
@jwt_required()
def create_topup_request():
    data = request.get_json()
    amount = data.get("amount")
    if not amount or float(amount) <= 0:
        return jsonify({"error": "จำนวนเงินไม่ถูกต้อง"}), 400

    # mock ref + qr
    return jsonify({
        "ref": "TOPUP123456",
        "qr": "https://via.placeholder.com/250x250.png?text=QR+Code"
    })

@payment_api.route("/check/<ref>", methods=["GET"])
@jwt_required()
def check_topup(ref):
    return jsonify({ "credited": False })

@payment_api.route("/cancel/<ref>", methods=["DELETE"])
@jwt_required()
def cancel_topup(ref):
    return jsonify({ "message": f"ยกเลิก {ref} แล้ว" })
