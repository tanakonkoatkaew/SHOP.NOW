# Online Shopping CPE

A fully functional Online Shopping application built with Python (Flask) for the backend and React (Vite + Tailwind CSS) for the frontend. The project features a modern e-commerce platform with authentication, product browsing, ordering system, an admin panel, Discord webhook integration, and a robust payment/top-up mechanism utilizing OCR (Optical Character Recognition) technologies.

## 🚀 Features

- **Modern Responsive Frontend**: Rebuilt completely using React, Vite, and Tailwind CSS for a seamless, fast, and beautiful user experience.
- **User Authentication**: Secure user registration and login using JWT (Flask-JWT-Extended) and password hashing (bcrypt).
- **Product Catalog & Ordering**: Browse products, view details, and manage inventory with real-time stock updates.
- **Admin Panel**: A comprehensive dashboard for administrators to manage users, add/edit products, and approve/reject top-up slips.
- **Discord Webhook Logs**: Real-time notifications sent to your Discord server for important events (e.g., successful logins, new product orders, successful top-ups).
- **Payment & Top-Up System**: 
  - Supports TrueMoney Wallet / Bank Transfer top-ups.
  - Integrates OCR features (using PyTesseract and Google Cloud Vision) to verify payment slips automatically.
- **User Profile Management**: Users can update their personal information, profile picture (URL), Discord ID, and LINE ID.

## 🛠 Tech Stack

- **Frontend Framework**: React 18 (Vite), Tailwind CSS, Framer Motion, Lucide React
- **Backend Framework**: Python 3, Flask
- **Database**: MongoDB (PyMongo)
- **Authentication**: Flask-JWT-Extended, PyOTP
- **Image Processing & OCR**: Pillow, PyTesseract, Google Cloud Vision API
- **Other Utilities**: python-dotenv, Requests, Device-detector, Werkzeug

## ⚙️ Prerequisites

Before running this project, ensure you have the following installed:
- Node.js (for the frontend React app)
- Python 3.9+
- MongoDB (running locally on port `27017` or configured via `MONGO_URI`)
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) (Must be installed on the system for PyTesseract to work)
- Google Cloud Service Account credentials (for Google Cloud Vision)

## 📦 Installation & Running

1. **Clone the repository**
   ```bash
   git clone https://github.com/tanakonkoatkaew/SHOP.NOW.git
   cd SHOP.NOW
   ```

2. **Backend Setup (Python)**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   pip install -r requirements.txt
   ```
   Create a `.env` file in the root directory:
   ```env
   MONGO_URI=mongodb://localhost:27017/
   MONGO_DB_NAME=ultimate_market_db
   # Add your JWT_SECRET_KEY, DISCORD_WEBHOOK_URL, etc.
   ```
   Run the backend:
   ```bash
   python run.py
   ```

3. **Frontend Setup (React)**
   Open a new terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
   *(Note: The Flask app serves the React production build from the `app/static/dist` folder automatically.)*

The application will be accessible at: `http://localhost:8080`

## 🔒 Security Notes

- Sensitive files such as `.env`, `__pycache__`, and service account JSON credentials (`ocr-payment.json`) are intentionally ignored via `.gitignore` to prevent accidental leaks. Always keep your keys secure.
