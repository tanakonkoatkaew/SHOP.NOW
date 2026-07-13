"""Order receipt & status notifications.

Chooses the right channel per user (Gmail for Google users, personal Discord
webhook otherwise) and renders a branded HTML receipt for a multi-item order,
plus lightweight status-change messages. All sending is best-effort and never
raises into the request path.
"""
import threading
from datetime import datetime, timezone

from app.utils.email_sender import send_email_async

# 4-step delivery lifecycle + terminal states
ORDER_STATUSES = ["pending", "processing", "shipped", "completed"]

STATUS_LABEL = {
    "pending":    "รอดำเนินการ",
    "processing": "กำลังจัดส่ง",
    "shipped":    "จัดส่งแล้ว",
    "completed":  "สำเร็จ",
    "refunded":   "คืนเงินแล้ว",
    "cancelled":  "ยกเลิก",
}

STATUS_EMOJI = {
    "pending":    "🕒",
    "processing": "📦",
    "shipped":    "🚚",
    "completed":  "✅",
    "refunded":   "↩️",
    "cancelled":  "❌",
}


def _is_discord_webhook(url):
    return bool(url) and (
        url.startswith("https://discord.com/api/webhooks/")
        or url.startswith("https://discordapp.com/api/webhooks/")
    )


def _post_discord(webhook_url, payload):
    def _run():
        try:
            import requests as http_requests
            http_requests.post(webhook_url, json=payload, timeout=5)
        except Exception as e:
            print("[receipt] Discord webhook failed:", e)
    threading.Thread(target=_run).start()


def _rows_html(items):
    rows = ""
    for it in items:
        key = it.get("key_code", "")
        key_html = (
            f'<div style="font-family:monospace;font-size:12px;color:#78350f;'
            f'background:#fef3c7;border-radius:6px;padding:4px 8px;margin-top:4px;'
            f'display:inline-block;">🔑 {key}</div>'
            if key else ""
        )
        rows += f"""
        <tr>
            <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                <div style="font-weight:700;color:#0f172a;">{it['name']}</div>
                <div style="font-size:12px;color:#94a3b8;">x{it['qty']} × {it['unit_price']:.2f} ฿</div>
                {key_html}
            </td>
            <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#0f172a;white-space:nowrap;">
                {it['line_total']:.2f} ฿
            </td>
        </tr>"""
    return rows


def _summary_html(summary):
    def line(label, value, strong=False, color="#0f172a"):
        return f"""
        <tr>
            <td style="padding:4px 0;color:#64748b;font-size:14px;">{label}</td>
            <td style="padding:4px 0;text-align:right;font-size:14px;font-weight:{'800' if strong else '600'};color:{color};">{value}</td>
        </tr>"""
    html = line("ยอดสินค้า", f"{summary['subtotal']:.2f} ฿")
    if summary.get("flash_discount", 0) > 0:
        html += line("ส่วนลด Flash Sale", f"-{summary['flash_discount']:.2f} ฿", color="#ef4444")
    if summary.get("coupon_discount", 0) > 0:
        html += line("ส่วนลดคูปอง", f"-{summary['coupon_discount']:.2f} ฿", color="#ef4444")
    if summary.get("points_used", 0) > 0:
        html += line("ใช้แต้มสะสม", f"-{summary['points_used']:.2f} ฿", color="#ef4444")
    html += line("ยอดชำระสุทธิ", f"{summary['total']:.2f} ฿", strong=True, color="#f59e0b")
    if summary.get("points_earned", 0) > 0:
        html += line("แต้มที่ได้รับ", f"+{summary['points_earned']:.2f} ⭐", color="#16a34a")
    return html


def format_address(addr):
    """One-line Thai address string, or '' if there is nothing to show."""
    if not addr:
        return ""
    parts = [
        addr.get("address", ""),
        f"ต.{addr['subdistrict']}" if addr.get("subdistrict") else "",
        f"อ.{addr['district']}" if addr.get("district") else "",
        f"จ.{addr['province']}" if addr.get("province") else "",
        addr.get("postal_code", ""),
    ]
    return " ".join(p for p in parts if p)


def _shipping_html(addr):
    if not addr:
        return ""
    phone = f"<br>โทร. {addr['phone']}" if addr.get("phone") else ""
    return f"""
    <div style="margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;">
      <div style="font-size:12px;color:#b45309;font-weight:700;text-transform:uppercase;margin-bottom:6px;">📦 ที่อยู่จัดส่ง</div>
      <div style="font-size:14px;color:#78350f;line-height:1.6;">
        <strong>{addr.get('recipient', '')}</strong><br>{format_address(addr)}{phone}
      </div>
    </div>"""


def build_receipt(receipt_id, username, items, summary, shipping_address=None):
    """Return (subject, html, text) for an order receipt."""
    now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")
    subject = f"🧾 ใบเสร็จคำสั่งซื้อ #{receipt_id[:8].upper()} - ShopNow"

    html = f"""
    <html><body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f8fafc;padding:20px;color:#1e293b;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:30px;">
        <div style="text-align:center;margin-bottom:20px;">
          <span style="font-size:40px;">🎉</span>
          <h2 style="color:#f59e0b;margin-top:8px;font-weight:800;">ขอบคุณสำหรับคำสั่งซื้อ!</h2>
          <p style="color:#64748b;font-size:13px;">เลขที่ใบเสร็จ #{receipt_id[:8].upper()}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">{_rows_html(items)}</table>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;border-top:2px solid #e2e8f0;padding-top:8px;">{_summary_html(summary)}</table>
        {_shipping_html(shipping_address)}
        <div style="margin-top:24px;font-size:12px;color:#94a3b8;text-align:center;">
          ผู้สั่งซื้อ: {username}<br>เลขที่ใบเสร็จ: <code>{receipt_id}</code><br>วันเวลา: {now}
        </div>
        <div style="margin-top:24px;text-align:center;font-size:13px;color:#64748b;font-weight:600;">ShopNow ❤️</div>
      </div>
    </body></html>"""

    lines = [f"ใบเสร็จคำสั่งซื้อ #{receipt_id[:8].upper()} (ShopNow)", "=" * 30]
    for it in items:
        lines.append(f"- {it['name']} x{it['qty']} = {it['line_total']:.2f} ฿" + (f"  🔑 {it['key_code']}" if it.get("key_code") else ""))
    lines.append("-" * 30)
    lines.append(f"ยอดสินค้า: {summary['subtotal']:.2f} ฿")
    if summary.get("flash_discount", 0) > 0:
        lines.append(f"ส่วนลด Flash Sale: -{summary['flash_discount']:.2f} ฿")
    if summary.get("coupon_discount", 0) > 0:
        lines.append(f"ส่วนลดคูปอง: -{summary['coupon_discount']:.2f} ฿")
    if summary.get("points_used", 0) > 0:
        lines.append(f"ใช้แต้มสะสม: -{summary['points_used']:.2f} ฿")
    lines.append(f"ยอดชำระสุทธิ: {summary['total']:.2f} ฿")
    if summary.get("points_earned", 0) > 0:
        lines.append(f"แต้มที่ได้รับ: +{summary['points_earned']:.2f}")
    if shipping_address:
        lines.append(f"\nที่อยู่จัดส่ง: {shipping_address.get('recipient', '')} — {format_address(shipping_address)}")
    lines.append(f"\nเลขที่ใบเสร็จ: {receipt_id}\nวันเวลา: {now}")
    text = "\n".join(lines)
    return subject, html, text


def send_order_receipt(user, receipt_id, items, summary, shipping_address=None):
    """Deliver a receipt to the buyer over their preferred channel."""
    try:
        email = (user.get("email") or "").strip()
        webhook = (user.get("discord_id") or "").strip()
        is_google = bool(user.get("google_user_id"))
        subject, html, text = build_receipt(receipt_id, user.get("username", ""), items, summary, shipping_address)

        if is_google and email:
            send_email_async(email, subject, html, text)
        elif _is_discord_webhook(webhook):
            fields = [{
                "name": it["name"],
                "value": f"x{it['qty']} • {it['line_total']:.2f} ฿" + (f"\n🔑 `{it['key_code']}`" if it.get("key_code") else ""),
                "inline": False,
            } for it in items]
            fields.append({"name": "💰 ยอดชำระสุทธิ", "value": f"{summary['total']:.2f} ฿", "inline": True})
            if summary.get("points_earned", 0) > 0:
                fields.append({"name": "⭐ แต้มที่ได้รับ", "value": f"+{summary['points_earned']:.2f}", "inline": True})
            if shipping_address:
                fields.append({
                    "name": "📦 ที่อยู่จัดส่ง",
                    "value": f"{shipping_address.get('recipient', '')}\n{format_address(shipping_address)}",
                    "inline": False,
                })
            _post_discord(webhook, {"embeds": [{
                "title": f"🧾 ใบเสร็จคำสั่งซื้อ #{receipt_id[:8].upper()} (ShopNow)",
                "color": 0xFFB900,
                "fields": fields,
                "footer": {"text": "ขอบคุณที่ใช้บริการ ShopNow! ❤️"},
            }]})
        elif email:
            # Fallback: still email non-Google users if we have an address
            send_email_async(email, subject, html, text)
    except Exception as e:
        print("[receipt] failed to send receipt:", e)


def send_status_update(user, receipt_id, status, item_names=None):
    """Notify the buyer that their order status changed."""
    try:
        label = STATUS_LABEL.get(status, status)
        emoji = STATUS_EMOJI.get(status, "📦")
        email = (user.get("email") or "").strip()
        webhook = (user.get("discord_id") or "").strip()
        is_google = bool(user.get("google_user_id"))
        products = ", ".join(item_names) if item_names else ""

        if is_google and email:
            subject = f"{emoji} อัปเดตคำสั่งซื้อ #{receipt_id[:8].upper()}: {label}"
            html = f"""
            <html><body style="font-family:sans-serif;background:#f8fafc;padding:20px;color:#1e293b;">
              <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;text-align:center;">
                <div style="font-size:44px;">{emoji}</div>
                <h2 style="color:#f59e0b;font-weight:800;margin:8px 0;">สถานะคำสั่งซื้อ: {label}</h2>
                <p style="color:#64748b;font-size:14px;">เลขที่ใบเสร็จ #{receipt_id[:8].upper()}</p>
                {f'<p style="color:#334155;font-size:14px;">{products}</p>' if products else ''}
                <div style="margin-top:20px;font-size:12px;color:#94a3b8;">ShopNow ❤️</div>
              </div>
            </body></html>"""
            send_email_async(email, subject, html, f"สถานะคำสั่งซื้อ #{receipt_id[:8].upper()}: {label}")
        elif _is_discord_webhook(webhook):
            _post_discord(webhook, {"embeds": [{
                "title": f"{emoji} อัปเดตคำสั่งซื้อ #{receipt_id[:8].upper()}",
                "description": f"สถานะล่าสุด: **{label}**" + (f"\n{products}" if products else ""),
                "color": 0xFFB900,
                "footer": {"text": "ShopNow"},
            }]})
    except Exception as e:
        print("[receipt] failed to send status update:", e)
