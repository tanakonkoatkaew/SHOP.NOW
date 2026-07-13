"""Seed sample physical (shipped) products — a small fashion line.

Also backfills `delivery_type: "digital"` on the existing key/top-up catalogue so
every product states its delivery mode explicitly.

Run:  python seed_fashion.py
Idempotent — re-running updates the same products by name instead of duplicating.
"""
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv()

from app import create_app  # noqa: E402
from app.extensions import get_db  # noqa: E402


def img(text, bg):
    return f"https://placehold.co/600x600/{bg}/ffffff?text={text}"


FASHION = [
    {
        "name": "เสื้อยืด Oversize SHOP.NOW (สีดำ)",
        "price": 390.0,
        "stock": 40,
        "image": img("OVERSIZE%0ATEE", "1f2937"),
        "description": "เสื้อยืดคอกลม ผ้าคอตตอน 100% ทรง Oversize ใส่สบาย มีไซซ์ S / M / L / XL",
    },
    {
        "name": "เสื้อฮู้ดดี้ Essential Hoodie",
        "price": 890.0,
        "sale_price": 690.0,          # flash sale showcase
        "sale_days": 7,
        "stock": 25,
        "image": img("ESSENTIAL%0AHOODIE", "334155"),
        "description": "ฮู้ดดี้ผ้าสำลีหนานุ่ม มีกระเป๋าหน้า เชือกปรับได้ ไซซ์ M / L / XL",
    },
    {
        "name": "กางเกงยีนส์ Slim Fit",
        "price": 1290.0,
        "stock": 18,
        "image": img("SLIM%0AJEANS", "1e3a8a"),
        "description": "ยีนส์ทรง Slim Fit ผ้ายืดใส่สบาย ไม่อึดอัด ไซซ์ 28-36",
    },
    {
        "name": "เสื้อเชิ้ต Oxford สีขาว",
        "price": 690.0,
        "stock": 30,
        "image": img("OXFORD%0ASHIRT", "0f172a"),
        "description": "เชิ้ตผ้า Oxford แขนยาว ใส่ทำงานหรือลำลองได้ ไซซ์ S / M / L / XL",
    },
    {
        "name": "เสื้อโปโล Pique Classic",
        "price": 590.0,
        "stock": 35,
        "image": img("POLO%0APIQUE", "065f46"),
        "description": "เสื้อโปโลผ้า Pique ระบายอากาศดี ทรงคลาสสิก ไซซ์ M / L / XL",
    },
    {
        "name": "หมวกแก๊ป Classic Cap",
        "price": 350.0,
        "stock": 50,
        "image": img("CLASSIC%0ACAP", "7c2d12"),
        "description": "หมวกแก๊ปผ้าคอตตอน ปรับสายด้านหลังได้ ฟรีไซซ์",
    },
    {
        "name": "กระเป๋าผ้า Canvas Tote",
        "price": 290.0,
        "stock": 60,
        "image": img("CANVAS%0ATOTE", "6d28d9"),
        "description": "กระเป๋าผ้าแคนวาสหนา ใส่ของได้เยอะ ซักได้ ขนาด 38x42 ซม.",
    },
]


def main():
    app = create_app()
    with app.app_context():
        db = get_db()
        now = datetime.now(timezone.utc)

        for item in FASHION:
            doc = {
                "name": item["name"],
                "price": item["price"],
                "image": item["image"],
                "cate": "fashion",
                "stock": item["stock"],
                "description": item["description"],
                "warranty": False,
                "delivery_type": "physical",   # ต้องจัดส่งพัสดุ -> ลูกค้าต้องระบุที่อยู่
                "sale_price": item.get("sale_price", 0),
                "sale_start": now if item.get("sale_price") else None,
                "sale_end": (now + timedelta(days=item["sale_days"])) if item.get("sale_price") else None,
            }
            db.products.update_one({"name": doc["name"]}, {"$set": doc}, upsert=True)
            tag = f"  (ลด {doc['sale_price']:.0f}฿)" if doc["sale_price"] else ""
            print(f"[+] {doc['name']} — {doc['price']:.0f} THB, stock {doc['stock']}{tag}")

        # Everything already in the catalogue is a key/code product
        res = db.products.update_many(
            {"delivery_type": {"$exists": False}},
            {"$set": {"delivery_type": "digital"}},
        )
        print(f"\n[=] backfilled delivery_type=digital on {res.modified_count} existing products")

        physical = db.products.count_documents({"delivery_type": "physical"})
        digital = db.products.count_documents({"delivery_type": "digital"})
        print(f"[=] catalogue: {physical} physical / {digital} digital")


if __name__ == "__main__":
    main()
