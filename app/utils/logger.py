# utils/logger.py

import requests
from datetime import datetime
from device_detector import DeviceDetector
import threading

# 🔧 ใส่ Webhook URL ของคุณตรงนี้
DISCORD_WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1476823638291251210/fq7Lhzn3LrBKWVqP-yPhl-2vr45kLFSc7Q0aeESa_rlLZTJZMZ0vFsHS4-p41kiiA4z_'
# ✅ เรียกจากภายนอกแบบ Async
def send_discord_log_async(event_type, request_headers, ip_address, host_url, referrer, data):
    thread = threading.Thread(
        target=send_discord_log,
        args=(event_type, request_headers, ip_address, host_url, referrer, data)
    )
    thread.start()

# ✅ ฟังก์ชันหลัก
def send_discord_log(event_type, request_headers, ip_address, host_url, referrer, data):
    ua_string = request_headers.get('User-Agent', 'Unknown')
    device = DeviceDetector(ua_string).parse()
    device_type = device.device_type() or "Unknown"
    os_name = device.os_name() or "Unknown"
    os_version = device.os_version() or ""
    browser_name = device.client_name() or "Unknown"
    browser_version = device.client_version() or ""

    location = get_location(ip_address)
    now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    embed = {
        "title": f"{event_type}",
        "color": 0x00FF99,
        "fields": [
            {"name": "📅 เวลา", "value": now, "inline": False},
            {"name": "🌐 IP Address", "value": f"`{ip_address}`", "inline": False},
            {"name": "📍 Location", "value": location, "inline": False},
            {"name": "📱 Device", "value": f"`{device_type} | {os_name} {os_version} | {browser_name} {browser_version}`", "inline": False},
            {"name": "🔗 URL", "value": host_url, "inline": False},
            {"name": "↩️ Referrer", "value": referrer or 'N/A', "inline": False},
        ],
        "footer": {
            "text": "🔔 ระบบแจ้งเตือนอัตโนมัติ | Cloud DB"
        }
    }

    for key, value in data.items():
        embed['fields'].append({
            "name": f"🔸 {key}",
            "value": str(value),
            "inline": False
        })

    payload = {"embeds": [embed]}
    try:
        requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=5)
    except Exception as e:
        print("[❌] Discord Webhook Failed:", e)

# ✅ ตรวจ Location จาก IP
def get_location(ip):
    try:
        if ip.startswith("127.") or ip == "::1":
            return "Localhost"
        response = requests.get(f"https://ipapi.co/{ip}/json/", timeout=3)
        data = response.json()
        return f"{data.get('city', '-')}, {data.get('country_name', '-')}"
    except:
        return "Unknown"
