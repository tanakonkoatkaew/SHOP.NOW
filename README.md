# Online Shopping CPE

A fully functional Online Shopping application built with Python and Flask. The project features an e-commerce platform with authentication, product browsing, shopping cart, ordering system, and a robust payment/top-up mechanism utilizing OCR (Optical Character Recognition) technologies.

## 🚀 Features

- **User Authentication**: Secure user registration and login using JWT (Flask-JWT-Extended) and password hashing (bcrypt).
- **Product Catalog**: Browse products, view details, and manage inventory.
- **Order Management**: Users can create and track their orders.
- **Payment & Top-Up System**: 
  - Supports wallet top-ups.
  - Integrates OCR features (using PyTesseract and Google Cloud Vision) to verify payment slips automatically.
- **Responsive Frontend**: User interfaces built with HTML, CSS, and Vanilla JavaScript.

## 🛠 Tech Stack

- **Backend Framework**: Python 3, Flask
- **Database**: MongoDB (PyMongo)
- **Authentication**: Flask-JWT-Extended, PyOTP
- **Image Processing & OCR**: Pillow, PyTesseract, Google Cloud Vision API
- **Other Utilities**: python-dotenv, Requests, Device-detector, Werkzeug

## ⚙️ Prerequisites

Before running this project, ensure you have the following installed:
- Python 3.9+
- MongoDB (running locally on port `27017` or configured via `MONGO_URI`)
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) (Must be installed on the system for PyTesseract to work)
- Google Cloud Service Account credentials (for Google Cloud Vision)

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/tanakonkoatkaew/OnlineShoppingCPE.git
   cd OnlineShoppingCPE
   ```

2. **Create a Virtual Environment (Optional but recommended)**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```

3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables**
   Create a `.env` file in the root directory and add the necessary environment variables:
   ```env
   MONGO_URI=mongodb://localhost:27017/
   MONGO_DB_NAME=ultimate_market_db
   # Add other required secret keys such as JWT_SECRET_KEY, etc.
   ```

5. **Google Cloud Vision Setup**
   - Place your service account JSON file securely.
   - Update your configuration to point to this JSON file (Do NOT commit this file to version control).

## 🚀 Running the Application

To start the local development server:

```bash
python -m flask --app run run --host=0.0.0.0 --port=8080
```
Or you can use the provided batch script on Windows:
```bash
./run.bat
```

The application will be accessible at: `http://localhost:8080`

## 🔒 Security Notes

- Sensitive files such as `.env`, `__pycache__`, and service account JSON credentials (`ocr-payment.json`) are intentionally ignored via `.gitignore` to prevent accidental leaks. Always keep your keys secure.
