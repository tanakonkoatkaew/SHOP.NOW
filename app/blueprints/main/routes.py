import os, json
from flask import Blueprint, render_template, url_for, redirect, session

main_bp = Blueprint('main', __name__)

def load_products():
    data_path = os.path.join(os.getcwd(), 'app', 'static', 'data', 'products.json')
    with open(data_path, 'r', encoding='utf-8') as f:
        return json.load(f)

@main_bp.app_context_processor
def inject_user():
    return dict(current_user=session.get('user'))

@main_bp.route('/')
def index():
    return redirect(url_for('main.dashboard'))

@main_bp.route('/dashboard')
def dashboard():
    products = load_products()
    return render_template("dashboard.html", products=products)

@main_bp.route('/home')
def home():
    products = load_products()
    return render_template("home.html", products=products)

@main_bp.route('/topup')
def topup():
    return render_template("topup.html")

@main_bp.route('/products')
def products():
    products = load_products()
    return render_template("products.html", products=products)
