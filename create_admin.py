"""
Usage:
  python create_admin.py                    # แสดง users ทั้งหมด
  python create_admin.py <username>         # set is_admin=True ให้ user ที่มีอยู่
  python create_admin.py <username> <pass>  # สร้าง admin user ใหม่
"""
import sys
from dotenv import load_dotenv
load_dotenv()

from app.extensions import init_db, get_db

def main():
    init_db()
    db = get_db()

    # แสดง users ทั้งหมดถ้าไม่ระบุ argument
    if len(sys.argv) == 1:
        users = list(db.users.find({}, {"username": 1, "email": 1, "is_admin": 1}))
        if not users:
            print("ยังไม่มี user ใน database")
        else:
            print(f"Users ทั้งหมด ({len(users)} คน):")
            for u in users:
                admin_tag = " [ADMIN]" if u.get("is_admin") else ""
                print(f"  - {u['username']} ({u.get('email','')}) {admin_tag}")
        print("\nวิธีใช้:")
        print("  python create_admin.py <username>          # set admin ให้ user ที่มีอยู่")
        print("  python create_admin.py <username> <pass>   # สร้าง admin user ใหม่")
        return

    username = sys.argv[1]

    # สร้าง admin user ใหม่ถ้าระบุ password ด้วย
    if len(sys.argv) >= 3:
        import bcrypt
        password = sys.argv[2]
        if db.users.find_one({"username": username}):
            print(f"❌ username '{username}' มีอยู่แล้ว ใช้คำสั่งแรกเพื่อ set admin แทน")
            return
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        db.users.insert_one({
            "username": username,
            "email":    f"{username}@admin.local",
            "password": hashed,
            "credit":   0.0,
            "reward":   0.0,
            "is_admin": True,
        })
        print(f"✅ สร้าง admin user '{username}' สำเร็จ (password: {password})")
        return

    # set is_admin ให้ user ที่มีอยู่แล้ว
    result = db.users.update_one(
        {"username": username},
        {"$set": {"is_admin": True}}
    )
    if result.matched_count == 0:
        print(f"❌ ไม่พบ user '{username}'")
        print("\nUsers ที่มีอยู่:")
        for u in db.users.find({}, {"username": 1}):
            print(f"  - {u['username']}")
    else:
        print(f"✅ ตั้งค่า '{username}' เป็น admin สำเร็จ")

if __name__ == "__main__":
    main()
