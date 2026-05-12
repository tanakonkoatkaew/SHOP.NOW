from flask import Flask
from app.extensions import init_db
from app.auth.routes import auth_bp
# import blueprint อื่น ๆ ตามที่มี

app = Flask(__name__)

# initialize DB connection
init_db()

# register blueprint
app.register_blueprint(auth_bp)
# app.register_blueprint(product_bp)
# app.register_blueprint(payment_bp)

if __name__ == '__main__':
    app.run(debug=True, port=8080)
