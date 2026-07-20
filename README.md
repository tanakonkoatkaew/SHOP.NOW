# SHOP.NOW — Online Shopping (CPE Project)

เว็บขายสินค้าออนไลน์ครบวงจร — ขายทั้ง**สินค้าดิจิทัล** (เกม คีย์ซอฟต์แวร์ บัตรเติมเงิน — ส่งคีย์อัตโนมัติทางอีเมลและหน้าประวัติการซื้อ) และ**สินค้าจริง**ที่จัดส่งตามที่อยู่ สร้างด้วย Flask + React (Vite) + MongoDB และ deploy บน Railway

## 🚀 Features

- **ชำระเงินผ่าน Stripe Checkout** — บัตรเครดิต/เดบิต พร้อม webhook ยืนยันการชำระ, ใช้ Store Credit และแต้มสะสมเป็นส่วนลดร่วมได้ (ถ้าครอบคลุมยอดทั้งหมด ไม่ต้องใช้บัตรเลย)
- **Store Credit + โค้ดของขวัญ** — ลูกค้าเติมเครดิตด้วยโค้ด, แอดมินสร้าง/แจกโค้ด (`SN-XXXX-XXXX`) และปรับเครดิตผู้ใช้ได้จากหลังบ้าน พร้อม audit log
- **ระบบสมาชิก** — สมัคร/ล็อกอินผ่าน OAuth (Google / Discord / Facebook) + JWT, ล็อกกันเดารหัสผ่าน
- **AI Chat Assistant (Google Gemini)** — ผู้ช่วยตอบคำถามลูกค้าแบบ agent: ค้นหาสินค้า เช็คราคา/สต็อก เช็คเครดิต ดูออเดอร์ของลูกค้าได้จริงผ่าน function calling พร้อมตัวกรองคำถามนอกเรื่อง และแท็บแชทตรงถึงแอดมิน (ไม่มี AI แทรก)
- **รีวิวสินค้าจากผู้ซื้อจริง** — ให้ดาว 1-5 + คอมเมนต์ได้เฉพาะคนที่ซื้อสินค้าแล้ว, คะแนนเฉลี่ยจริงแสดงทุกหน้า, แอดมินลบรีวิวไม่เหมาะสมได้
- **Flash Sale / คูปอง / แต้มสะสม** — ตั้งเวลาลดราคา, โค้ดส่วนลดจำกัดสิทธิ์, ได้ reward points ทุกการซื้อ
- **Admin Panel** — ภาพรวมยอดขาย (กราฟรายวัน/หมวดหมู่), จัดการสินค้า+อัปโหลดรูป, คำสั่งซื้อ+สถานะจัดส่ง (แจ้งอีเมลอัตโนมัติ), คูปอง, Store Credit, ผู้ใช้, แชทลูกค้า
- **ความปลอดภัย** — rate limiting (login / แชท / redeem code), CORS allowlist, ตรวจไฟล์อัปโหลดด้วย Pillow + จำกัดขนาด, bcrypt password hashing

## 🛠 Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS, Framer Motion, Lucide Icons |
| Backend | Python 3.11, Flask (blueprints), gunicorn |
| Database | MongoDB (PyMongo) |
| Auth | JWT (PyJWT) + bcrypt, OAuth 2.0 (Google/Discord/Facebook) |
| Payment | Stripe Checkout + Webhook |
| AI | Google Gemini API (REST + function calling) |
| อื่น ๆ | Flask-Limiter, Pillow, python-dotenv |

Frontend ถูก build ลง `app/static/dist` แล้วเสิร์ฟโดย Flask แบบ same-origin (SPA catch-all)

## 📁 โครงสร้างโปรเจกต์

```
project-root/
├── run.py              # entry point (dev: python run.py / prod: gunicorn run:app)
├── Procfile            # Railway/Heroku: gunicorn --workers 2
├── requirements.txt
├── create_admin.py     # สร้าง/โปรโมท admin จาก CLI
├── seed_products.py    # seed สินค้าตัวอย่าง (+ seed_fashion.py)
├── app/
│   ├── __init__.py     # app factory: CORS, limiter, blueprints, error handlers
│   ├── extensions.py   # MongoDB client, indexes, rate limiter
│   ├── middlewares.py  # auth_required / admin_required (JWT)
│   ├── auth/  product/  order/  payment/  admin/  chat/   # API blueprints
│   ├── services/       # order, stripe, gemini (AI agent), ...
│   ├── utils/          # pricing, coupons, receipt/email, notify, logger
│   ├── frontend/       # เสิร์ฟ SPA build
│   └── static/dist/    # ผลลัพธ์ npm run build
└── frontend/           # React source (Vite)
```

## ⚙️ Environment Variables

คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่า — ตัวหลักที่ต้องมี:

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `FLASK_SECRET_KEY` | เซ็น JWT (บังคับ — ไม่ตั้งแอปไม่ยอมสตาร์ท) |
| `MONGO_URI`, `MONGO_DB_NAME` | MongoDB connection |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | ระบบชำระเงิน |
| `GOOGLE_/DISCORD_/FACEBOOK_CLIENT_ID/SECRET/REDIRECT_URI` | OAuth login |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FILTER_MODEL` | AI chat (ไม่ใส่ key = ใช้ keyword bot แทนอัตโนมัติ) |
| `SMTP_*` | ส่งคีย์สินค้า/ใบเสร็จทางอีเมล (ไม่ตั้ง = mock mode พิมพ์ลง console) |
| `ALLOWED_ORIGINS` | CORS allowlist — เว้นว่างใน production (same-origin) |
| `FLASK_DEBUG`, `MAX_UPLOAD_MB` | dev debug / เพดานขนาดไฟล์อัปโหลด |

## 📦 รันในเครื่อง (Local Development)

```bash
git clone https://github.com/tanakonkoatkaew/SHOP.NOW.git
cd SHOP.NOW

# 1. Backend
pip install -r requirements.txt
cp .env.example .env        # แล้วกรอกค่าจริง

# 2. Frontend (build ลง app/static/dist)
cd frontend && npm install && npm run build && cd ..

# 3. สร้างแอดมิน + seed สินค้า (ครั้งแรก)
python create_admin.py
python seed_products.py

# 4. รัน
python run.py               # → http://127.0.0.1:8080
```

แก้โค้ด frontend แล้วรัน `npm run build` ใหม่ทุกครั้ง (Flask เสิร์ฟไฟล์ build ไม่ใช่ dev server)

## ☁️ Deploy (Railway)

- ใช้ `Procfile`: `gunicorn run:app --bind 0.0.0.0:$PORT --workers 2` และ `runtime.txt` (Python 3.11)
- ตั้ง environment variables ทั้งหมดใน Railway dashboard (อย่า commit `.env`)
- ไฟล์ build ของ frontend (`app/static/dist`) ถูก commit ในรีโปแล้ว — build ใหม่ก่อน push เมื่อแก้ frontend
- หมายเหตุ: rate limiter ใช้ in-memory storage แบบ per-worker (2 workers ≈ เพดาน ×2) — ถ้า scale เพิ่มให้เปลี่ยนไปใช้ Redis

## 🔒 Security Notes

- `.env` และไฟล์ credential ถูก ignore ใน `.gitignore` — ห้าม commit คีย์ทุกชนิด
- Password login ถูกล็อกหลังพยายามผิด 5 ครั้ง/15 นาที + rate limit ซ้อนอีกชั้น
- ไฟล์อัปโหลดถูกตรวจทั้งนามสกุลและเนื้อไฟล์จริง (Pillow) พร้อมจำกัดขนาด
