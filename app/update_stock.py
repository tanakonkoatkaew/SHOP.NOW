from pymongo import MongoClient
from bson import ObjectId

client = MongoClient("mongodb://localhost:27017")
db = client.ultimate_market_db

# ✅ ใส่ ObjectId ของสินค้าที่ต้องการแก้ไข
product_id = ObjectId("685c9320f862567530a0f6e1")

# ✅ ทำการอัปเดต stock เป็น 99
db.products.update_one(
    {"_id": product_id},
    {"$set": {"stock": 99}}
)

print("🎉 อัปเดต stock สำเร็จ!")
