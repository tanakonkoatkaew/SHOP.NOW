import os
from pymongo import MongoClient
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# In-memory storage is per-gunicorn-worker (Procfile runs 2 workers → effective
# limits are up to 2×). Acceptable here; switch storage_uri to Redis if scaling.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["300 per minute"],
    storage_uri="memory://",
)

client = None
db = None

def init_db():
    global client, db
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "ultimate_market_db")

    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB_NAME]
    ensure_indexes(db)
    print("MongoDB connected successfully!")


def ensure_indexes(database):
    """Idempotent index creation — safe to run on every boot."""
    try:
        database.reviews.create_index(
            [("product_id", 1), ("user_id", 1)], unique=True, name="uniq_product_user"
        )
        database.reviews.create_index(
            [("product_id", 1), ("created_at", -1)], name="product_created"
        )
        database.orders.create_index(
            [("user_id", 1), ("product_id", 1)], name="user_product"
        )
    except Exception as e:
        print(f"[extensions] ensure_indexes failed: {e}")

def get_db():
    global db
    if db is None:
        raise Exception("Database not initialized! Call init_db() first.")
    return db


def get_jwt_secret():
    """Single source of truth for the JWT signing secret.

    Fails loudly if unset instead of silently falling back to a weak default,
    which previously risked auth (sign) and middleware (verify) using
    different keys.
    """
    secret = os.getenv("FLASK_SECRET_KEY")
    if not secret:
        raise RuntimeError(
            "FLASK_SECRET_KEY environment variable is not set. "
            "Refusing to start with an insecure default."
        )
    return secret
