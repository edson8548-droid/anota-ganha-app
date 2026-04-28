"""Tests for whatsapp routes — CSV parsing and phone normalization."""
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routes.whatsapp import parse_csv_contacts, normalize_phone


def test_normalize_phone_adds_country_code():
    assert normalize_phone("13999001234") == "5513999001234"

def test_normalize_phone_strips_non_digits():
    assert normalize_phone("(13) 99900-1234") == "5513999001234"

def test_normalize_phone_keeps_full_number():
    assert normalize_phone("5513999001234") == "5513999001234"

def test_normalize_phone_rejects_empty():
    assert normalize_phone("") is None

def test_normalize_phone_rejects_short():
    assert normalize_phone("123") is None

def test_parse_csv_simple():
    csv = b"Nome,Telefone\nJoao Silva,13999001234\nMaria,13988887777\n"
    contacts, invalidos = parse_csv_contacts(csv)
    assert len(contacts) == 2
    assert invalidos == 0
    assert contacts[0] == {"nome": "Joao Silva", "telefone": "5513999001234"}

def test_parse_csv_skips_empty_phone():
    csv = b"Nome,Telefone\nJoao,13999001234\nSem Fone,\n"
    contacts, invalidos = parse_csv_contacts(csv)
    assert len(contacts) == 1
    assert invalidos == 1

def test_parse_csv_detects_english_columns():
    csv = b"First Name,Phone 1 - Value\nJohn,5513999001234\n"
    contacts, invalidos = parse_csv_contacts(csv)
    assert len(contacts) == 1
    assert contacts[0]["nome"] == "John"
