"""
Email helpers for transactional Venpro messages.
"""
import logging
import os

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Email, Mail, ReplyTo

logger = logging.getLogger(__name__)
SENDER_NAME = "Venpro"


def _email_config() -> tuple[str | None, str | None]:
    return os.environ.get("SENDGRID_API_KEY"), os.environ.get("SENDER_EMAIL")


def transactional_email_enabled() -> bool:
    api_key, sender = _email_config()
    return bool(api_key and sender)


def send_transactional_email(
    *,
    to_email: str,
    subject: str,
    text_content: str,
    html_content: str | None = None,
) -> dict:
    api_key, sender = _email_config()
    if not api_key or not sender:
        return {"sent": False, "reason": "email_not_configured"}

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
    except Exception:
        logger.exception("[EMAIL] Falha ao enviar email transacional")
        return {"sent": False, "reason": "send_failed"}

    return {"sent": True, "status_code": response.status_code}


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
