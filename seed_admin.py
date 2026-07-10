"""
Seed / reset the Master Admin account.

Ensures a user `admin` with password `admin1234` and is_admin=True exists.
Run once:  python seed_admin.py
Honors MONGO_URI / MONGO_DB_NAME env vars (same defaults as the app).
"""
import os
import bcrypt
from pymongo import MongoClient

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin1234"
ADMIN_EMAIL = "admin@shop.now"


def main():
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
    db_name = os.getenv("MONGO_DB_NAME", "ultimate_market_db")

    db = MongoClient(mongo_uri)[db_name]

    hashed_pw = bcrypt.hashpw(ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    result = db.users.update_one(
        {"username": ADMIN_USERNAME},
        {
            "$set": {
                "email": ADMIN_EMAIL,
                "username": ADMIN_USERNAME,
                "password": hashed_pw,
                "is_admin": True,
            },
            "$setOnInsert": {
                "credit": 0.0,
                "reward": 0.0,
            },
        },
        upsert=True,
    )

    if result.upserted_id:
        print(f"Created Master Admin '{ADMIN_USERNAME}' (password: {ADMIN_PASSWORD})")
    else:
        print(f"Updated Master Admin '{ADMIN_USERNAME}' (password reset to: {ADMIN_PASSWORD})")


if __name__ == "__main__":
    main()
