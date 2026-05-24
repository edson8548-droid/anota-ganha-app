"""
Email helpers for transactional Venpro messages.
"""
import logging
import os

import requests
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Email, Mail, ReplyTo

logger = logging.getLogger(__name__)
SENDER_NAME = "Venpro"
ZEPTO_DEFAULT_API_URL = "https://api.zeptomail.com/v1.1/email"


def _clean_env(name: str) -> str | None:
    value = (os.environ.get(name) or "").strip().strip("\"'")
    return value or None


def _email_config() -> dict:
    zeptomail_token = _clean_env("ZEPTOMAIL_SEND_MAIL_TOKEN")
    provider = (_clean_env("EMAIL_PROVIDER") or ("zeptomail" if zeptomail_token else "sendgrid")).lower()
    return {
        "provider": provider,
        "sender": _clean_env("SENDER_EMAIL") or _clean_env("ZEPTOMAIL_FROM_EMAIL"),
        "sendgrid_api_key": _clean_env("SENDGRID_API_KEY"),
        "zeptomail_token": zeptomail_token,
        "zeptomail_api_url": _clean_env("ZEPTOMAIL_API_URL") or ZEPTO_DEFAULT_API_URL,
    }


def transactional_email_enabled() -> bool:
    config = _email_config()
    if not config["sender"]:
        return False
    if config["provider"] == "zeptomail":
        return bool(config["zeptomail_token"])
    return bool(config["sendgrid_api_key"])


def _zeptomail_authorization(token: str) -> str:
    if token.lower().startswith("zoho-enczapikey "):
        return token
    return f"Zoho-enczapikey {token}"


def _send_via_zeptomail(
    *,
    token: str,
    api_url: str,
    sender: str,
    to_email: str,
    subject: str,
    text_content: str,
    html_content: str | None,
) -> dict:
    payload = {
        "from": {"address": sender, "name": SENDER_NAME},
        "to": [{"email_address": {"address": to_email}}],
        "reply_to": [{"address": sender, "name": SENDER_NAME}],
        "subject": subject,
        "track_clicks": False,
        "track_opens": False,
    }
    if html_content:
        payload["htmlbody"] = html_content
    else:
        payload["textbody"] = text_content

    try:
        response = requests.post(
            api_url,
            json=payload,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": _zeptomail_authorization(token),
            },
            timeout=20,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)
        body = getattr(response, "text", "") if response is not None else str(exc)
        logger.exception(
            "[EMAIL] Falha ao enviar email transacional provider=zeptomail status_code=%s body=%s",
            status_code,
            str(body or "")[:1000],
        )
        result = {"sent": False, "reason": "send_failed", "provider": "zeptomail"}
        if status_code:
            result["status_code"] = status_code
        return result

    return {"sent": True, "status_code": response.status_code, "provider": "zeptomail"}


def _send_via_sendgrid(
    *,
    api_key: str,
    sender: str,
    to_email: str,
    subject: str,
    text_content: str,
    html_content: str | None,
) -> dict:
    message = Mail(
        from_email=Email(sender, SENDER_NAME),
        to_emails=to_email,
        subject=subject,
        plain_text_content=text_content,
        html_content=html_content,
    )
    message.reply_to = ReplyTo(sender, SENDER_NAME)

    try:
        response = SendGridAPIClient(api_key).send(message)
    except Exception as exc:
        status_code = getattr(exc, "status_code", None)
        body = getattr(exc, "body", None)
        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="replace")
        logger.exception(
            "[EMAIL] Falha ao enviar email transacional provider=sendgrid status_code=%s body=%s",
            status_code,
            str(body or "")[:1000],
        )
        result = {"sent": False, "reason": "send_failed", "provider": "sendgrid"}
        if status_code:
            result["status_code"] = status_code
        return result

    return {"sent": True, "status_code": response.status_code, "provider": "sendgrid"}


def send_transactional_email(
    *,
    to_email: str,
    subject: str,
    text_content: str,
    html_content: str | None = None,
) -> dict:
    config = _email_config()
    sender = config["sender"]
    if not transactional_email_enabled() or not sender:
        return {"sent": False, "reason": "email_not_configured"}

    if config["provider"] == "zeptomail":
        return _send_via_zeptomail(
            token=config["zeptomail_token"],
            api_url=config["zeptomail_api_url"],
            sender=sender,
            to_email=to_email,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
        )

    return _send_via_sendgrid(
        api_key=config["sendgrid_api_key"],
        sender=sender,
        to_email=to_email,
        subject=subject,
        text_content=text_content,
        html_content=html_content,
    )


def build_welcome_email(name: str) -> tuple[str, str, str]:
    first_name = (name or "").strip().split(" ")[0] or "tudo bem"
    subject = "Bem-vindo ao Venpro"
    text_content = f"""Olá, {first_name}.

Sua conta no Venpro foi criada com sucesso.

Você tem 15 dias grátis para testar:
- Cotação Pronta
- Carteira no WhatsApp
- Vitrine Inteligente
- Prompts Prontos para RCA

Acesse:
https://venpro.com.br

Minha sugestão: comece pela Cotação Pronta com uma tabela pequena. Se precisar de ajuda, fale com o suporte pelo WhatsApp:
https://wa.me/5513996382430

Equipe Venpro
"""
    html_content = f"""
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5; max-width: 620px;">
      <p>Olá, {first_name}.</p>
      <p>Sua conta no <strong>Venpro</strong> foi criada com sucesso.</p>
      <p>Você tem <strong>15 dias grátis</strong> para testar:</p>
      <ul>
        <li>Cotação Pronta</li>
        <li>Carteira no WhatsApp</li>
        <li>Vitrine Inteligente</li>
        <li>Prompts Prontos para RCA</li>
      </ul>
      <p>
        <a href="https://venpro.com.br" style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
          Acessar o Venpro
        </a>
      </p>
      <p>Minha sugestão: comece pela Cotação Pronta com uma tabela pequena.</p>
      <p>Se precisar de ajuda, fale com o suporte pelo WhatsApp:<br>
        <a href="https://wa.me/5513996382430">https://wa.me/5513996382430</a>
      </p>
      <p>Equipe Venpro</p>
    </div>
    """
    return subject, text_content, html_content
