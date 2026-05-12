import os
from flask import Blueprint, send_from_directory

frontend_bp = Blueprint('frontend', __name__)

DIST_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'dist')

@frontend_bp.route('/', defaults={'path': ''})
@frontend_bp.route('/<path:path>')
def spa(path):
    file_path = os.path.join(DIST_DIR, path)
    if path and os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, 'index.html')
