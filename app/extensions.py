import os
from pymongo import MongoClient

client = None
db = None

def init_db():
    global client, db
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "ultimate_market_db")

    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB_NAME]
    print("MongoDB connected successfully!")

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
