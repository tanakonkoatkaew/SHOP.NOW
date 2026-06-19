import os
import re
from google.cloud import vision
from app.extensions import get_db

def extract_amounts(ocr_text):
    # Normalize: remove spaces around dots
    cleaned_text = re.sub(r'\s*\.\s*', '.', ocr_text)
    # Normalize: remove commas between digits (e.g. 1,250.00 -> 1250.00)
    cleaned_text = re.sub(r'(?<=\d),(?=\d)', '', cleaned_text)
    # Match decimals
    pattern = r'\b\d+\.\d{2}\b'
    matches = re.findall(pattern, cleaned_text)
    
    amounts = []
    for m in matches:
        try:
            val = float(m)
            amounts.append(val)
        except ValueError:
            continue
    return list(set(amounts))

def extract_transaction_id(ocr_text):
    lines = ocr_text.split('\n')
    keywords = ["อ้างอิง", "รายการ", "ref", "txn", "trans", "เลขที่"]
    
    # Pass 1: check same line as keywords
    for line in lines:
        line_lower = line.lower()
        if any(kw in line_lower for kw in keywords):
            candidates = re.findall(r'[a-zA-Z0-9]{10,25}', line)
            for cand in candidates:
                if any(c.isdigit() for c in cand) and len(cand) >= 12:
                    return cand
                    
    # Pass 2: check next line
    for i, line in enumerate(lines):
        line_lower = line.lower()
        if any(kw in line_lower for kw in keywords):
            if i + 1 < len(lines):
                next_line = lines[i+1]
                candidates = re.findall(r'[a-zA-Z0-9]{10,25}', next_line)
                for cand in candidates:
                    if any(c.isdigit() for c in cand) and len(cand) >= 12:
                        return cand

    # Pass 3: search globally for alphanumeric string of length 15-22 with at least one digit
    all_cands = re.findall(r'\b[a-zA-Z0-9]{15,22}\b', ocr_text)
    for cand in all_cands:
        if any(c.isdigit() for c in cand):
            return cand
            
    return None

def check_bank_keywords(ocr_text):
    keywords = [
        "โอน", "สำเร็จ", "ธนาคาร", "promptpay", "พร้อมเพย์",
        "kasikorbank", "kbank", "scb", "krungthai", "krungsri", "bangkok bank", "ttb", "uob", "aomsin", "baac",
        "transfer", "successful", "transaction", "payment"
    ]
    ocr_lower = ocr_text.lower()
    return any(kw in ocr_lower for kw in keywords)

def check_receiver_name(ocr_text):
    # Receiver name keywords matching 'ธนกร โกฎิแก้ว' or English transliterations (tanakon koatkaew)
    keywords = ["ธนกร", "โกฎิแก้ว", "tanakon", "tanakor", "koatkaew", "kotkaew"]
    ocr_lower = ocr_text.lower()
    return any(kw in ocr_lower for kw in keywords)

def verify_slip_ocr(image_path, target_amount):
    """
    Verifies a Thai bank transfer slip using Google Cloud Vision OCR.
    
    Returns:
        dict: {
            "success": bool,
            "message": str,
            "transaction_id": str or None,
            "is_duplicate": bool
        }
    """
    # 1. Try SlipOK API if configured
    slipok_api_key = os.getenv("SLIPOK_API_KEY", "").strip()
    slipok_branch_id = os.getenv("SLIPOK_BRANCH_ID", "").strip()
    
    if slipok_api_key and slipok_branch_id:
        print("[ℹ️] Verifying slip using SlipOK API...")
        try:
            import requests as http_requests
            url = f"https://api.slipok.com/api/line/apikey/{slipok_branch_id}"
            headers = {
                "x-authorization": slipok_api_key
            }
            with open(image_path, 'rb') as f:
                files = {'files': f}
                data = {
                    'log': 'true',
                    'amount': str(target_amount)
                }
                
                resp = http_requests.post(url, headers=headers, files=files, data=data, timeout=15)
                
                if resp.status_code == 200:
                    resp_json = resp.json()
                    if resp_json.get("success") and resp_json.get("data"):
                        slip_data = resp_json["data"]
                        trans_ref = slip_data.get("transRef")
                        amount = float(slip_data.get("amount", 0))
                        
                        if abs(amount - target_amount) >= 0.01:
                            return {
                                "success": False,
                                "message": f"ยอดเงินในสลิปไม่ตรงกับยอดเติมเงิน (ต้องการ: {target_amount:.2f} ฿, ตรวจพบ: {amount:.2f} ฿)",
                                "transaction_id": trans_ref,
                                "is_duplicate": False
                            }
                            
                        return {
                            "success": True,
                            "message": "ตรวจสอบสลิปผ่าน SlipOK สำเร็จ",
                            "transaction_id": trans_ref,
                            "is_duplicate": False
                        }
                    else:
                        msg = resp_json.get("message", "สลิปไม่ถูกต้อง")
                        is_duplicate = resp_json.get("code") == 1012 or "duplicate" in msg.lower()
                        return {
                            "success": False,
                            "message": f"SlipOK: {msg}",
                            "transaction_id": None,
                            "is_duplicate": is_duplicate
                        }
                else:
                    try:
                        err_json = resp.json()
                        msg = err_json.get("message", resp.text)
                        is_duplicate = err_json.get("code") == 1012 or "duplicate" in msg.lower()
                    except Exception:
                        msg = resp.text
                        is_duplicate = False
                        
                    return {
                        "success": False,
                        "message": f"SlipOK Error (HTTP {resp.status_code}): {msg}",
                        "transaction_id": None,
                        "is_duplicate": is_duplicate
                    }
        except Exception as e:
            print(f"[❌] SlipOK API integration error: {str(e)}. Falling back to OCR/Mock...")

    # Check if MOCK_OCR=true is set in environment (useful for testing/demo without Google Cloud billing)
    if os.getenv("MOCK_OCR", "").lower() == "true":
        import time
        dummy_id = f"MOCK{int(time.time() * 1000)}"
        return {
            "success": True,
            "message": "ตรวจสอบสลิปสำเร็จ (Mock Mode)",
            "transaction_id": dummy_id,
            "is_duplicate": False
        }

    # Initialize Google Cloud Vision Client credentials
    credential_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "./ocr-payment.json")
    if not os.path.isabs(credential_path):
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        credential_path = os.path.join(project_root, credential_path)

    
    if os.path.exists(credential_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credential_path

    try:
        client = vision.ImageAnnotatorClient()
        with open(image_path, 'rb') as image_file:
            content = image_file.read()
        
        image = vision.Image(content=content)
        response = client.text_detection(image=image)
        texts = response.text_annotations
        
        if response.error.message:
            return {
                "success": False,
                "message": f"Vision API error: {response.error.message}",
                "transaction_id": None,
                "is_duplicate": False
            }
        
        if not texts:
            return {
                "success": False,
                "message": "ไม่พบตัวอักษรใดๆ บนรูปภาพ",
                "transaction_id": None,
                "is_duplicate": False
            }
            
        ocr_text = texts[0].description
        
        # 1. Check bank/PromptPay keywords
        if not check_bank_keywords(ocr_text):
            return {
                "success": False,
                "message": "รูปภาพนี้ไม่ใช่สลิปธนาคารที่ถูกต้อง",
                "transaction_id": None,
                "is_duplicate": False
            }

        # 2. Check receiver name (to ensure transfer is made to Tanakon Koatkaew)
        if not check_receiver_name(ocr_text):
            return {
                "success": False,
                "message": "ไม่พบชื่อผู้รับโอน 'ธนกร โกฎิแก้ว' บนสลิปนี้",
                "transaction_id": None,
                "is_duplicate": False
            }


        # 2. Extract transaction ID (critical for duplicate detection)
        transaction_id = extract_transaction_id(ocr_text)
        if not transaction_id:
            return {
                "success": False,
                "message": "ไม่พบเลขที่อ้างอิงของรายการโอนเงิน",
                "transaction_id": None,
                "is_duplicate": False
            }
        
        # 3. Check for duplicates in the DB to prevent double spending
        db = get_db()
        existing = db.pending_qr_payments.find_one({
            "transaction_id": transaction_id,
            "status": {"$in": ["approved", "pending_review"]}
        })
        if existing:
            return {
                "success": False,
                "message": "สลิปรายการโอนเงินนี้ถูกใช้ยืนยันชำระเงินไปแล้ว",
                "transaction_id": transaction_id,
                "is_duplicate": True
            }
            
        # 4. Verify amount
        amounts = extract_amounts(ocr_text)
        amount_matched = False
        for amt in amounts:
            if abs(amt - target_amount) < 0.01:
                amount_matched = True
                break
                
        if not amount_matched:
            detected_str = ", ".join(f"{a:.2f}" for a in amounts) if amounts else "ไม่พบตัวเลขยอดเงิน"
            return {
                "success": False,
                "message": f"ยอดเงินในสลิปไม่ตรงกับยอดเติมเงิน (ต้องการ: {target_amount:.2f} ฿, ตรวจพบ: {detected_str})",
                "transaction_id": transaction_id,
                "is_duplicate": False
            }
            
        return {
            "success": True,
            "message": "ตรวจสอบสลิปสำเร็จ",
            "transaction_id": transaction_id,
            "is_duplicate": False
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"การประมวลผล OCR เกิดข้อผิดพลาด: {str(e)}",
            "transaction_id": None,
            "is_duplicate": False
        }
