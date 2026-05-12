import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from utils.logger import send_discord_log  # ✅ หลังจากเพิ่ม path แล้วใช้ได้เลย

send_discord_log(
    event_type="🧪 ทดสอบการส่ง Log",
    request_headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
    ip_address="8.8.8.8",
    data={"message": "Hello from test script!"}
)
