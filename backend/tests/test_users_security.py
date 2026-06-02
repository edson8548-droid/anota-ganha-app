import inspect
import os
import sys

import pytest
from fastapi import HTTPException

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


class _ExistingDoc:
    id = "outro-uid"

    def to_dict(self):
        return {"email": "cliente@example.com", "name": "Cliente Teste"}


class _ExistingStream:
    def stream(self):
        return [_ExistingDoc()]


class _ExistingCollection:
    def where(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return _ExistingStream()


class _ExistingDb:
    def collection(self, *_args, **_kwargs):
        return _ExistingCollection()


def test_cpf_duplicate_check_does_not_expose_existing_user_data():
    duplicado, mensagem = users._verificar_duplicidade_cpf("52998224725", _ExistingDb())

    assert duplicado is True
    assert "cliente@example.com" not in mensagem
    assert "Cliente Teste" not in mensagem
    assert mensagem == "CPF já cadastrado. Faça login ou entre em contato com o suporte."


def test_cpf_duplicate_check_ignores_current_user():
    duplicado, mensagem = users._verificar_duplicidade_cpf(
        "52998224725",
        _ExistingDb(),
        current_uid="outro-uid",
    )

    assert duplicado is False
    assert mensagem == "CPF disponível"


def test_validar_dados_pagador_normalizes_valid_data():
    dados = users._validar_dados_pagador(" Cliente Teste ", "529.982.247-25", "(13) 99900-1234")

    assert dados == {
        "nome": "Cliente Teste",
        "cpf": "52998224725",
        "cnpj": None,
        "cpfCnpj": "52998224725",
        "documentoTipo": "cpf",
        "telefone": "13999001234",
    }


def test_validar_dados_pagador_accepts_cnpj():
    dados = users._validar_dados_pagador(" Empresa Teste ", "04.252.011/0001-10", "(13) 99900-1234")

    assert dados == {
        "nome": "Empresa Teste",
        "cpf": None,
        "cnpj": "04252011000110",
        "cpfCnpj": "04252011000110",
        "documentoTipo": "cnpj",
        "telefone": "13999001234",
    }


def test_register_endpoint_requires_cpf_even_when_billing_accepts_cnpj():
    signature = inspect.signature(users.register)

    assert "payload" in signature.parameters
    with pytest.raises(HTTPException):
        if users._validar_dados_pagador("Empresa", "04.252.011/0001-10", "(13) 99900-1234")["documentoTipo"] != "cpf":
            raise HTTPException(400, "Cadastro inicial exige CPF. O CNPJ pode ser informado no checkout de pagamento.")
