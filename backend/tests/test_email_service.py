from services.email_service import build_welcome_email, send_transactional_email, transactional_email_enabled


def test_email_service_disabled_without_env(monkeypatch):
    monkeypatch.delenv("SENDGRID_API_KEY", raising=False)
    monkeypatch.delenv("SENDER_EMAIL", raising=False)

    assert transactional_email_enabled() is False
    result = send_transactional_email(
        to_email="teste@venpro.com.br",
        subject="Teste",
        text_content="Teste",
    )
    assert result == {"sent": False, "reason": "email_not_configured"}


def test_build_welcome_email_mentions_trial_and_core_cta():
    subject, text_content, html_content = build_welcome_email("Renato Silva")

    assert subject == "Bem-vindo ao Venpro"
    assert "Olá, Renato." in text_content
    assert "15 dias grátis" in text_content
    assert "Cotação Pronta" in text_content
    assert "https://venpro.com.br" in text_content
    assert "Acessar o Venpro" in html_content
