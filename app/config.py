import os

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
    DB_NAME = os.getenv("MONGO_DB_NAME", "ultimate_market_db")
