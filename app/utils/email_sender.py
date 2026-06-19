import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import threading

def send_email_async(to_email, subject, body_html, body_text=""):
    threading.Thread(target=send_email, args=(to_email, subject, body_html, body_text)).start()

def send_email(to_email, subject, body_html, body_text=""):
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    smtp_port_str = os.getenv("SMTP_PORT", "587").strip()
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_sender = os.getenv("SMTP_SENDER", smtp_user).strip()

    if not smtp_user or not smtp_password:
        print(f"\n[!] Email Mock Mode: SMTP credentials not configured in .env.")
        print(f"Would have sent email to: {to_email}")
        print(f"Subject: [Thai Unicode Subject]")
        print("--------------------------------------------------")
        print("Email body content ready. (Mock: skipped printing to console to prevent Windows encoding crash)")
        print("--------------------------------------------------\n")
        return

    try:
        smtp_port = int(smtp_port_str)
    except ValueError:
        smtp_port = 587

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = smtp_sender
    msg['To'] = to_email

    if body_text:
        msg.attach(MIMEText(body_text, 'plain', 'utf-8'))
    if body_html:
        msg.attach(MIMEText(body_html, 'html', 'utf-8'))

    try:
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            server.starttls()
            
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_sender, [to_email], msg.as_string())
        server.quit()
        print(f"[OK] Email sent successfully to {to_email}")
    except Exception as e:
        print(f"[FAIL] Failed to send email to {to_email}: {str(e)}")
