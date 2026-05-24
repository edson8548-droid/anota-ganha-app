from services.email_service import build_welcome_email, send_transactional_email, transactional_email_enabled


def test_email_service_disabled_without_env(monkeypatch):
    monkeypatch.delenv("EMAIL_PROVIDER", raising=False)
    monkeypatch.delenv("SENDGRID_API_KEY", raising=False)
    monkeypatch.delenv("ZEPTOMAIL_SEND_MAIL_TOKEN", raising=False)
    monkeypatch.delenv("SENDER_EMAIL", raising=False)

    assert transactional_email_enabled() is False
    result = send_transactional_email(
        to_email="teste@venpro.com.br",
        subject="Teste",
        text_content="Teste",
    )
    assert result == {"sent": False, "reason": "email_not_configured"}


def test_email_config_trims_accidental_quotes_and_spaces(monkeypatch):
    sent_messages = []

    class FakeResponse:
        status_code = 202

    class FakeSendGridClient:
        def __init__(self, api_key):
            assert api_key == "SG.fake"

        def send(self, message):
            sent_messages.append(message.get())
            return FakeResponse()

    monkeypatch.setenv("SENDGRID_API_KEY", ' "SG.fake" ')
    monkeypatch.setenv("SENDER_EMAIL", " 'suporte@venpro.com.br' ")
    monkeypatch.setattr("services.email_service.SendGridAPIClient", FakeSendGridClient)

    result = send_transactional_email(
        to_email="cliente@example.com",
        subject="Teste",
        text_content="Texto",
    )

    assert result == {"sent": True, "status_code": 202, "provider": "sendgrid"}
    assert sent_messages[0]["from"]["email"] == "suporte@venpro.com.br"


def test_send_transactional_email_uses_zeptomail_when_configured(monkeypatch):
    requests = []

    class FakeResponse:
        status_code = 201
        text = '{"data":[{"code":"EM_104","message":"Mail sent successfully"}]}'

        def raise_for_status(self):
            return None

    def fake_post(url, *, json, headers, timeout):
        requests.append(
            {
                "url": url,
                "json": json,
                "headers": headers,
                "timeout": timeout,
            }
        )
        return FakeResponse()

    monkeypatch.setenv("EMAIL_PROVIDER", "zeptomail")
    monkeypatch.setenv("ZEPTOMAIL_SEND_MAIL_TOKEN", "token-123")
    monkeypatch.setenv("SENDER_EMAIL", "suporte@venpro.com.br")
    monkeypatch.setattr("services.email_service.requests.post", fake_post)

    result = send_transactional_email(
        to_email="cliente@example.com",
        subject="Teste",
        text_content="Texto",
        html_content="<p>Texto</p>",
    )

    assert result == {"sent": True, "status_code": 201, "provider": "zeptomail"}
    assert requests[0]["url"] == "https://api.zeptomail.com/v1.1/email"
    assert requests[0]["headers"]["Authorization"] == "Zoho-enczapikey token-123"
    assert requests[0]["json"]["from"] == {
        "address": "suporte@venpro.com.br",
        "name": "Venpro",
    }
    assert requests[0]["json"]["reply_to"] == [
        {"address": "suporte@venpro.com.br", "name": "Venpro"}
    ]
    assert requests[0]["json"]["to"] == [
        {"email_address": {"address": "cliente@example.com"}}
    ]
    assert requests[0]["json"]["htmlbody"] == "<p>Texto</p>"


def test_build_welcome_email_mentions_trial_and_core_cta():
    subject, text_content, html_content = build_welcome_email("Renato Silva")

    assert subject == "Bem-vindo ao Venpro"
    assert "Olá, Renato." in text_content
    assert "15 dias grátis" in text_content
    assert "Cotação Pronta" in text_content
    assert "https://venpro.com.br" in text_content
    assert "Acessar o Venpro" in html_content


def test_send_transactional_email_uses_named_sender_and_reply_to(monkeypatch):
    sent_messages = []

    class FakeResponse:
        status_code = 202

    class FakeSendGridClient:
        def __init__(self, api_key):
            assert api_key == "SG.fake"

        def send(self, message):
            sent_messages.append(message.get())
            return FakeResponse()

    monkeypatch.setenv("SENDGRID_API_KEY", "SG.fake")
    monkeypatch.setenv("SENDER_EMAIL", "suporte@venpro.com.br")
    monkeypatch.setattr("services.email_service.SendGridAPIClient", FakeSendGridClient)

    result = send_transactional_email(
        to_email="cliente@example.com",
        subject="Teste",
        text_content="Texto",
        html_content="<p>Texto</p>",
    )

    assert result == {"sent": True, "status_code": 202, "provider": "sendgrid"}
    assert sent_messages[0]["from"] == {
        "email": "suporte@venpro.com.br",
        "name": "Venpro",
    }
    assert sent_messages[0]["reply_to"] == {
        "email": "suporte@venpro.com.br",
        "name": "Venpro",
    }
