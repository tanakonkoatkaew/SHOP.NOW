"""
Seed ~20 digital products across categories (game / software / topup / other).

Idempotent: skips any product whose name already exists, and removes obvious
junk test rows. Run:  python seed_products.py

Images use placehold.co (always renders); ProductCard also has an onError
fallback, so broken image URLs degrade gracefully.
"""
import os
from urllib.parse import quote_plus
from pymongo import MongoClient

# category -> (background, foreground) hex for the placeholder tile
CATE_COLORS = {
    "game":     ("7c3aed", "ffffff"),
    "software": ("2563eb", "ffffff"),
    "topup":    ("059669", "ffffff"),
    "other":    ("db2777", "ffffff"),
}


def img(label, cate):
    bg, fg = CATE_COLORS.get(cate, ("1e293b", "ffffff"))
    return f"https://placehold.co/600x600/{bg}/{fg}?text={quote_plus(label)}"


# (name, price, cate, stock, warranty, description, image label)
PRODUCTS = [
    # ── GAMES ────────────────────────────────────────────────
    ("Valorant Points 1000 VP",        320,  "game", 500, True,  "เติม Valorant Points 1000 VP เข้าบัญชีทันที",                     "VALORANT\\n1000 VP"),
    ("Genshin Impact 3280 Genesis",    1290, "game", 300, True,  "Genesis Crystals 3280 สำหรับ Genshin Impact",                     "GENSHIN\\n3280"),
    ("PUBG Mobile 600 UC",             290,  "game", 800, True,  "เติม 600 UC สำหรับ PUBG Mobile ราคาถูกที่สุด",                    "PUBGM\\n600 UC"),
    ("Mobile Legends 500 Diamonds",    260,  "game", 600, True,  "เพชร Mobile Legends 500 Diamonds เติมไว",                          "MLBB\\n500"),
    ("Free Fire 1060 Diamonds",        299,  "game", 700, True,  "เพชร Free Fire 1060 Diamonds เข้าเกมทันที",                       "FREE FIRE\\n1060"),
    ("Roblox Gift Card 800 Robux",     350,  "game", 400, False, "บัตรของขวัญ Roblox มูลค่า 800 Robux",                             "ROBLOX\\n800 R$"),
    ("Steam Wallet Code 500 THB",      510,  "game", 999, False, "โค้ดเติมเงิน Steam Wallet มูลค่า 500 บาท",                        "STEAM\\n500"),

    # ── SOFTWARE ─────────────────────────────────────────────
    ("Microsoft Office 2021 Pro Plus", 990,  "software", 200, True,  "ลิขสิทธิ์แท้ Office 2021 Pro Plus ผูกบัญชีถาวร",              "OFFICE\\n2021"),
    ("Windows 10 Pro (Retail)",        450,  "software", 300, True,  "คีย์ Windows 10 Pro Retail ใช้งานถาวร",                       "WIN 10\\nPRO"),
    ("Adobe Photoshop 2024 (1 Year)",  1590, "software", 150, True,  "Adobe Photoshop 2024 สมาชิก 1 ปี พร้อมอัปเดต",               "PHOTOSHOP\\n2024"),
    ("Canva Pro (1 Year)",             690,  "software", 250, True,  "Canva Pro สมาชิก 1 ปี ใช้ฟีเจอร์พรีเมียมครบ",                "CANVA\\nPRO"),
    ("Autodesk AutoCAD 2024",          2490, "software", 80,  True,  "AutoCAD 2024 ลิขสิทธิ์ 1 ปี สำหรับงานออกแบบ",                "AUTOCAD\\n2024"),
    ("Malwarebytes Premium (1 Device)",590,  "software", 300, True,  "โปรแกรมป้องกันมัลแวร์ Malwarebytes Premium 1 เครื่อง",       "MALWARE\\nBYTES"),

    # ── TOPUP / SUBSCRIPTIONS ────────────────────────────────
    ("Netflix Premium 1 Month",        349,  "topup", 400, True,  "Netflix Premium 4K 1 เดือน ดูได้ทุกอุปกรณ์",                    "NETFLIX\\n1 MONTH"),
    ("Spotify Premium 3 Months",       399,  "topup", 350, True,  "Spotify Premium 3 เดือน ฟังเพลงไม่มีโฆษณา",                     "SPOTIFY\\n3 MO"),
    ("YouTube Premium 1 Month",        159,  "topup", 500, True,  "YouTube Premium 1 เดือน ไม่มีโฆษณา + เพลง",                     "YOUTUBE\\nPREMIUM"),
    ("Discord Nitro 1 Month",          199,  "topup", 450, True,  "Discord Nitro 1 เดือน อัปเกรดบัญชีเต็มรูปแบบ",                  "DISCORD\\nNITRO"),
    ("ChatGPT Plus 1 Month",           790,  "topup", 200, True,  "ChatGPT Plus (GPT-4) สมาชิก 1 เดือน",                          "CHATGPT\\nPLUS"),
    ("Google Play Gift Card 300 THB",  305,  "topup", 999, False, "บัตรของขวัญ Google Play มูลค่า 300 บาท",                        "GOOGLE\\nPLAY 300"),
    ("Apple iTunes Gift Card 500 THB", 510,  "topup", 999, False, "บัตร Apple iTunes มูลค่า 500 บาท เติม App Store",               "iTUNES\\n500"),

    # ── OTHER ────────────────────────────────────────────────
    ("NordVPN Premium (1 Year)",       990,  "other", 180, True,  "NordVPN สมาชิก 1 ปี ปลอดภัย เร็ว ใช้ได้หลายอุปกรณ์",           "NORD VPN\\n1 YEAR"),
]


def main():
    db = MongoClient(
        os.getenv("MONGO_URI", "mongodb://localhost:27017/")
    )[os.getenv("MONGO_DB_NAME", "ultimate_market_db")]

    # Remove obvious junk test rows (e.g. name is only digits / empty image)
    junk = db.products.delete_many({"name": {"$regex": r"^\s*\d+\s*$"}})
    if junk.deleted_count:
        print(f"Removed {junk.deleted_count} junk product(s)")

    inserted, skipped = 0, 0
    for name, price, cate, stock, warranty, desc, label in PRODUCTS:
        if db.products.find_one({"name": name}):
            skipped += 1
            continue
        db.products.insert_one({
            "name":        name,
            "price":       price,
            "image":       img(label.replace("\\n", "\n"), cate),
            "cate":        cate,
            "stock":       stock,
            "warranty":    warranty,
            "description": desc,
        })
        inserted += 1

    total = db.products.count_documents({})
    print(f"Inserted {inserted}, skipped {skipped} (already existed). Total products now: {total}")


if __name__ == "__main__":
    main()
