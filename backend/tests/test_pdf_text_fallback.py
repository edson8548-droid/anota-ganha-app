import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.excel_processor import _ler_pdf_base


class FakePage:
    def __init__(self, text):
        self._text = text

    def extract_tables(self):
        return []

    def extract_text(self):
        return self._text


class FakePdf:
    def __init__(self):
        self.pages = [
            FakePage(
                "\n".join(
                    [
                        "Código Produto EAN Emb. Qtde Qtd. R$ R$ R$",
                        "3511-18 ABS ALWAYS BASICO 7500435127226 CX-18 1 18 3.121 56.180 56.180",
                        "C/8 C/ABA PQ SC",
                        "3531-16 ABS INTIMUS 7896007550906 CX-16 1 16 18.675 298.800 298.800",
                        "NOTURNO C/30 SECO",
                    ]
                )
            )
        ]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_ler_pdf_base_fallback_por_texto(monkeypatch):
    import pdfplumber

    monkeypatch.setattr(pdfplumber, "open", lambda _path: FakePdf())

    rows = _ler_pdf_base("arquivo-sem-tabela.pdf")

    assert rows == [
        {
            "nome": "ABS ALWAYS BASICO C/8 C/ABA PQ SC",
            "ean": "7500435127226",
            "preco_base": 3.121,
        },
        {
            "nome": "ABS INTIMUS NOTURNO C/30 SECO",
            "ean": "7896007550906",
            "preco_base": 18.675,
        },
    ]
