import inspect
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import users


def test_cpf_check_digits_use_official_algorithm():
    assert users._calcular_digitos_verificadores("529.982.247-25") == (2, 5)
    assert users._calcular_digitos_verificadores("11144477735") == (3, 5)


def test_register_endpoint_uses_body_payload_not_query_password():
    signature = inspect.signature(users.register)

    assert "payload" in signature.parameters
    assert "password" not in signature.parameters
    assert "email" not in signature.parameters


class _EmptyStream:
    def stream(self):
        return []


class _EmptyCollection:
    def where(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return _EmptyStream()


class _FakeDb:
    def collection(self, *_args, **_kwargs):
        return _EmptyCollection()


def test_cpf_duplicate_check_returns_available_when_not_found():
    duplicado, mensagem = users._verificar_duplicidade_cpf("52998224725", _FakeDb())

    assert duplicado is False
    assert mensagem == "CPF disponível"
