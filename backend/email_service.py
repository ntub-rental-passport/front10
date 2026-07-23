import os
import smtplib
import ssl
from email.message import EmailMessage


class EmailConfigurationError(RuntimeError):
    pass


def send_verification_email(recipient: str, code: str, expires_minutes: int = 2) -> None:
    host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "").strip()
    app_password = os.getenv("SMTP_APP_PASSWORD", "").replace(" ", "")
    from_email = os.getenv("SMTP_FROM_EMAIL", username).strip()
    from_name = os.getenv("SMTP_FROM_NAME", "RentMate").strip()

    if not username or not app_password or not from_email:
        raise EmailConfigurationError(
            "尚未設定 Gmail SMTP，請檢查 SMTP_USERNAME、SMTP_APP_PASSWORD 與 SMTP_FROM_EMAIL。"
        )

    message = EmailMessage()
    message["Subject"] = f"RentMate 電子信箱驗證碼：{code}"
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = recipient
    message.set_content(
        f"您好：\n\n您的 RentMate 驗證碼是 {code}。\n"
        f"驗證碼將在 {expires_minutes} 分鐘後失效，請勿將驗證碼提供給其他人。\n\n"
        "若不是您本人提出註冊，請忽略這封信。"
    )
    message.add_alternative(
        f"""
        <html>
          <body style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">
            <h2>RentMate 電子信箱驗證</h2>
            <p>您的六碼驗證碼是：</p>
            <p style="font-size:32px;font-weight:700;letter-spacing:8px">{code}</p>
            <p>驗證碼將在 {expires_minutes} 分鐘後失效，請勿提供給其他人。</p>
            <p style="color:#6b7280">若不是您本人提出註冊，請忽略這封信。</p>
          </body>
        </html>
        """,
        subtype="html",
    )

    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.ehlo()
        smtp.starttls(context=context)
        smtp.ehlo()
        smtp.login(username, app_password)
        smtp.send_message(message)
