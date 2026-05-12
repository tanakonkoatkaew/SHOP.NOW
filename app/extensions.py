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
