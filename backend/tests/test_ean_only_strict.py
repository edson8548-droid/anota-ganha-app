import os
import sys
import tempfile

from openpyxl import Workbook

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.excel_processor import gerar_excel_resultado, ler_cotacao, ler_tabela_mestre
from services.matching_engine import processar_cotacao


def _xlsx(rows):
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    wb.save(tmp.name)
    wb.close()
    tmp.close()
    return tmp.name


def test_modo_ean_nao_usa_descricao_quando_ean_nao_bate():
    itens = [{"linha": 2, "ean": "", "nome": "ARROZ CAMIL 5KG"}]
    precos = {"7891234567890": 25.9}
    precos_nome = [{"norm": "ARROZ CAMIL 5KG", "ord": "5KG ARROZ CAMIL", "preco": 25.9, "orig": "ARROZ CAMIL 5KG"}]

    resultado = processar_cotacao(itens, precos, precos_nome, modo="EAN")

    assert resultado == [{"linha": 2, "preco": None, "tipo": None}]


def test_coluna_codigo_na_cotacao_nao_e_tratada_como_ean():
    path = _xlsx([
        ["PRODUTO", "CODIGO", "PRECO"],
        ["ARROZ CAMIL 5KG", "12345678", ""],
    ])
    try:
        itens, _ = ler_cotacao(path)
    finally:
        os.unlink(path)

    assert itens[0]["nome"] == "ARROZ CAMIL 5KG"
    assert itens[0]["ean"] == ""


def test_coluna_cod_produto_nao_e_tratada_como_descricao():
    path = _xlsx([
        ["Cód. Produto", "Ean", "Descrição", "Emb."],
        [68009, "7896369615077", "ABACAXI CALDA MARIZA LT 400G", 12],
    ])
    try:
        itens, _ = ler_cotacao(path)
    finally:
        os.unlink(path)

    assert itens[0]["nome"] == "ABACAXI CALDA MARIZA LT 400G"
    assert itens[0]["ean"] == "7896369615077"


def test_coluna_codigo_na_tabela_mestre_nao_entra_no_dict_de_ean():
    path = _xlsx([
        ["PRODUTO", "CODIGO", "28"],
        ["ARROZ CAMIL 5KG", "12345678", 25.9],
    ])
    try:
        precos, precos_nome = ler_tabela_mestre(path, prazo=28)
    finally:
        os.unlink(path)

    assert "12345678" not in precos
    assert precos_nome[0]["preco"] == 25.9


def test_resultado_nao_sobrescreve_coluna_embalagem_quando_nao_ha_preco():
    path = _xlsx([
        ["Cód. Produto", "Ean", "Descrição", "Emb."],
        [68009, "7896369615077", "ABACAXI CALDA MARIZA LT 400G", 12],
    ])
    output = None
    try:
        itens, _ = ler_cotacao(path)
        output = gerar_excel_resultado(
            path,
            itens,
            [{"linha": 2, "preco": 14.87, "tipo": "EAN"}],
        )

        from openpyxl import load_workbook

        wb = load_workbook(output, data_only=True)
        ws = wb.active
        try:
            assert ws.cell(1, 4).value == "Emb."
            assert ws.cell(2, 4).value == 12
            assert ws.cell(1, 5).value == "PRECO"
            assert ws.cell(2, 5).value == 14.87
        finally:
            wb.close()
    finally:
        os.unlink(path)
        if output:
            os.unlink(output)
