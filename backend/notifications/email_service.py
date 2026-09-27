import os
import smtplib
import ssl
from email.message import EmailMessage


class EmailConfigurationError(RuntimeError):
    pass


def _smtp_config() -> dict[str, str | int]:
    """讀取並檢查 SMTP 設定。由各寄信函式共用，避免重複與設定漏檢。"""
    config = {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com").strip(),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "username": os.getenv("SMTP_USERNAME", "").strip(),
        "app_password": os.getenv("SMTP_APP_PASSWORD", "").replace(" ", ""),
        "from_name": os.getenv("SMTP_FROM_NAME", "RentMate").strip(),
    }
    config["from_email"] = os.getenv("SMTP_FROM_EMAIL", str(config["username"])).strip()

    if not config["username"] or not config["app_password"] or not config["from_email"]:
        raise EmailConfigurationError(
            "尚未設定 Gmail SMTP，請檢查 SMTP_USERNAME、SMTP_APP_PASSWORD 與 SMTP_FROM_EMAIL。"
        )
    return config


def _send(message: EmailMessage, config: dict[str, str | int]) -> None:
    """實際寄出。STARTTLS 加密後認證，避免帳密以明文經過網路。"""
    context = ssl.create_default_context()
    with smtplib.SMTP(str(config["host"]), int(config["port"]), timeout=15) as smtp:
        smtp.ehlo()
        smtp.starttls(context=context)
        smtp.ehlo()
        smtp.login(str(config["username"]), str(config["app_password"]))
        smtp.send_message(message)


def send_verification_email(recipient: str, code: str, expires_minutes: int = 2) -> None:
    config = _smtp_config()
    from_name, from_email = config["from_name"], config["from_email"]

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

    _send(message, config)


def send_admin_login_code(
    recipient: str,
    code: str,
    expires_minutes: int = 5,
    request_ip: str | None = None,
) -> None:
    """寄送管理員登入的第二階段驗證碼。

    與註冊驗證信分開的理由：
      1. 措辭需明確指出這是「後台登入」，收件者才能判斷是否為本人操作
      2. 附上發起登入的來源 IP —— 若非本人所為，這是唯一的線索
      3. 明確提示「若非本人，代表密碼可能已外洩」並要求採取行動，
         而非如註冊信般僅寫「請忽略這封信」

    此信本身即是一種入侵偵測：帳密外洩時，真正的管理員會先收到這封信。
    """
    config = _smtp_config()
    source = f"\n發起登入的來源 IP：{request_ip}" if request_ip else ""

    message = EmailMessage()
    message["Subject"] = f"RentMate 後台登入驗證碼：{code}"
    message["From"] = f"{config['from_name']} <{config['from_email']}>"
    message["To"] = recipient
    message.set_content(
        f"您好：\n\n有人正在使用您的管理員帳號登入 RentMate 後台。\n\n"
        f"驗證碼：{code}\n"
        f"有效時間：{expires_minutes} 分鐘{source}\n\n"
        "若這不是您本人的操作，代表您的密碼可能已外洩，\n"
        "請立即變更密碼並通知其他管理員。"
    )
    message.add_alternative(
        f"""
        <html>
          <body style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">
            <h2>RentMate 後台登入驗證</h2>
            <p>有人正在使用您的管理員帳號登入後台。您的驗證碼是：</p>
            <p style="font-size:32px;font-weight:700;letter-spacing:8px">{code}</p>
            <p>有效時間 {expires_minutes} 分鐘。{f"<br>發起登入的來源 IP：{request_ip}" if request_ip else ""}</p>
            <p style="color:#b91c1c;font-weight:600">
              若這不是您本人的操作，代表您的密碼可能已外洩，請立即變更密碼並通知其他管理員。
            </p>
          </body>
        </html>
        """,
        subtype="html",
    )
    _send(message, config)
