from dotenv import load_dotenv
import os

load_dotenv()

from app import create_app

app = create_app()

if __name__ == '__main__':
    # Dev only — gunicorn (Procfile) imports run:app and never hits this branch
    debug = os.getenv("FLASK_DEBUG", "").lower() in ("1", "true", "yes")
    app.run(debug=debug, port=8080)
