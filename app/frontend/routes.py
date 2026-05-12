from flask import Blueprint, render_template
from app.extensions import get_db

frontend_bp = Blueprint('frontend', __name__)

# ✅ Dashboard
@frontend_bp.route('/', endpoint='dashboard')
def dashboard():
    db = get_db()
    products_data = db.products.find().limit(3)

    products = []
    for product in products_data:
        products.append({
            'id': str(product['_id']),  # << ใส่ str() ด้วยเวลาเอา _id จาก MongoDB ไปใช้
            'name': product['name'],
            'image': product['image'],
            'price': product['price'],
            'category': product['cate']
        })

    return render_template('dashboard.html', products=products)


# ✅ Home
@frontend_bp.route('/home', endpoint='home')
def home():
    db = get_db()
    products_data = db.products.find().limit(3)

    products = []
    for product in products_data:
        products.append({
            'id': product['_id'],
            'name': product['name'],
            'image': product['image'],
            'price': product['price'],
            'category': product['cate']
        })

    return render_template('home.html', products=products)

# ✅ Products
@frontend_bp.route('/products', endpoint='products')
def products():
    db = get_db()
    products_data = db.products.find()

    products = []
    for product in products_data:
        products.append({
            'id': product['_id'],
            'name': product['name'],
            'image': product['image'],
            'price': product['price'],
            'category': product['cate']
        })

    return render_template('products.html', products=products)

# ✅ Register/Login/Topup/Contact
@frontend_bp.route('/login', endpoint='login')
def login():
    return render_template('login.html')

@frontend_bp.route('/register', endpoint='register')
def register():
    return render_template('register.html')

@frontend_bp.route('/topup', endpoint='topup')
def topup():
    return render_template('topup.html')

@frontend_bp.route('/contact', endpoint='contact')
def contact():
    return render_template('contact.html')

@frontend_bp.route('/product/<category_id>/<product_id>', endpoint='product_detail')
def product_detail(category_id, product_id):
    return render_template("product_detail.html", category_id=category_id, product_id=product_id)

@frontend_bp.route('/purchase_logs', endpoint='purchase_logs')
def purchase_logs():
    return render_template('purchase_logs.html')

@frontend_bp.route('/profile', endpoint='profile')
def profile():
    return render_template('profile.html')

@frontend_bp.route('/topup/logs', endpoint='topup_logs')
def topup_logs():
    return render_template('topup_logs.html')

@frontend_bp.route('/redeem')
def redeem():
    return render_template("redeem.html")
