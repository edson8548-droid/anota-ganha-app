"""
Processador de Excel — leitura de tabelas mestre e cotações, geração de resultado.
"""

import pandas as pd
import openpyxl
from openpyxl.styles import PatternFill
import tempfile
import os

from .matching_engine import limpar_ean, normalizar_nome, ordenar_palavras, processar_cotacao_com_ia


PREENCHIMENTO_IA = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")


def ler_tabela_mestre(caminho_arquivo, header_row=2, col_nome=0, col_ean=1, prazo=28):
    """
    Le Excel de tabela de precos mestre.
    Retorna: (precos_dict, precos_nome_lista)
    """
    df = pd.read_excel(caminho_arquivo, header=header_row)

    col_preco = None
    for col in df.columns:
        col_str = str(col).replace(" dias", "").replace(" DIAS", "").strip()
        if str(prazo) in col_str:
            col_preco = col
            break
    if col_preco is None:
        col_preco = df.columns[-1]

    precos = {}
    precos_nome_lista = []

    for _, row in df.iterrows():
        ean = limpar_ean(row.iloc[col_ean])
        nome_bruto = str(row.iloc[col_nome])
        try:
            preco = float(row[col_preco])
            if ean:
                precos[ean] = preco
            nome_norm = normalizar_nome(nome_bruto)
            precos_nome_lista.append({
                'norm': nome_norm,
                'ord': ordenar_palavras(nome_norm),
                'preco': preco,
                'orig': nome_bruto
            })
        except (ValueError, TypeError):
            continue

    return precos, precos_nome_lista


def ler_cotacao(caminho_arquivo):
    """
    Le Excel de cotacao (anexo 2) que o RCA sobe.
    Tenta openpyxl primeiro, fallback para pandas.
    Retorna: (itens, header_row)
    """
    itens = []
    header_row = 1

    # Tentar com openpyxl para preservar linhas
    try:
        wb = openpyxl.load_workbook(caminho_arquivo, data_only=True)
        ws = wb.active

        col_ean = None
        col_nome = None
        col_preco = None
        header_row = None

        for row_idx in range(1, min(16, ws.max_row + 1)):
            for cell in ws[row_idx]:
                val = str(cell.value).upper().strip() if cell.value else ""
                if not val:
                    continue
                if val in ("EAN", "COD.BARRAS", "COD BARRAS", "CODIGO DE BARRAS",
                           "COD. BARRAS", "CÓDIGO DE BARRAS", "COD BARRA"):
                    col_ean = cell.column - 1
                    header_row = row_idx
                elif val in ("PRODUTO", "DESCRIÇÃO", "DESCRICAO", "ITEM",
                             "DESCRIÇÃO DO PRODUTO", "DESCRICAO DO PRODUTO",
                             "MERCADORIA", "DESC"):
                    col_nome = cell.column - 1
                    header_row = row_idx
                elif val in ("PREÇO", "PRECO", "VALOR UNITÁRIO", "VALOR UNITARIO",
                             "VALOR", "R$", "PREÇO UNIT.", "PRECO UNIT"):
                    col_preco = cell.column - 1
                    header_row = row_idx

        if not header_row:
            header_row = 1
            col_nome = 0
            col_ean = 1
            col_preco = ws.max_column - 1

        if col_nome is None:
            col_nome = 0
        if col_ean is None:
            col_ean = 1
        if col_preco is None:
            col_preco = ws.max_column - 1

        for row_idx in range(header_row + 1, ws.max_row + 1):
            row = ws[row_idx]
            ean_val = row[col_ean].value if col_ean < len(row) else None
            nome_val = row[col_nome].value if col_nome < len(row) else None

            if nome_val and str(nome_val).strip():
                itens.append({
                    "ean": str(ean_val) if ean_val else "",
                    "nome": str(nome_val),
                    "linha": row_idx,
                    "col_preco": col_preco,
                })

        wb.close()
        return itens, header_row

    except Exception:
        pass  # Fallback para pandas

    # Fallback: ler com pandas (nao preserva linhas exatas mas funciona)
    try:
        for hdr in range(0, 5):
            try:
                df = pd.read_excel(caminho_arquivo, header=hdr)
                cols_upper = [str(c).upper().strip() for c in df.columns]

                col_nome = None
                col_ean = None
                col_preco = None

                for i, c in enumerate(cols_upper):
                    if c in ("PRODUTO", "DESCRIÇÃO", "DESCRICAO", "ITEM", "MERCADORIA", "DESC"):
                        col_nome = i
                    elif c in ("EAN", "COD.BARRAS", "COD BARRAS", "CODIGO"):
                        col_ean = i
                    elif c in ("PREÇO", "PRECO", "VALOR", "R$"):
                        col_preco = i

                if col_nome is not None:
                    header_row = hdr + 1
                    if col_ean is None:
                        col_ean = col_nome + 1
                    if col_preco is None:
                        col_preco = len(df.columns) - 1

                    for idx, row in df.iterrows():
                        nome_val = row.iloc[col_nome]
                        ean_val = row.iloc[col_ean] if col_ean < len(row) else ""
                        if nome_val and str(nome_val).strip() and str(nome_val).strip() != "nan":
                            itens.append({
                                "ean": str(ean_val) if ean_val and str(ean_val) != "nan" else "",
                                "nome": str(nome_val),
                                "linha": header_row + idx + 2,
                                "col_preco": col_preco,
                            })
                    break
            except Exception:
                continue
    except Exception:
        pass

    return itens, header_row


def gerar_excel_resultado(caminho_original, itens, resultados):
    """
    Gera Excel preenchido com os precos encontrados.
    Itens matched por IA ficam em amarelo.
    Fallback: recria com pandas se openpyxl nao conseguir ler.
    Retorna caminho do arquivo gerado.
    """
    try:
        wb = openpyxl.load_workbook(caminho_original)
        ws = wb.active

        for item, res in zip(itens, resultados):
            if res["preco"] is not None:
                col = item["col_preco"]
                cell = ws.cell(row=item["linha"], column=col + 1)
                cell.value = res["preco"]

                if res["tipo"] and "IA" in res["tipo"]:
                    cell.fill = PREENCHIMENTO_IA

        output = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
        wb.save(output.name)
        output.close()
        return output.name

    except Exception:
        # Fallback: gerar novo Excel com pandas
        df = pd.read_excel(caminho_original)
        preco_col = None
        for c in df.columns:
            cu = str(c).upper().strip()
            if cu in ("PREÇO", "PRECO", "VALOR", "R$"):
                preco_col = c
                break
        if preco_col is None:
            df["PRECO"] = None
            preco_col = "PRECO"

        for item, res in zip(itens, resultados):
            if res["preco"] is not None:
                row_idx = item["linha"] - 2  # ajuste header
                if 0 <= row_idx < len(df):
                    df.at[df.index[row_idx], preco_col] = res["preco"]

        output = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
        df.to_excel(output.name, index=False)
        output.close()
        return output.name


def processar_arquivo_cotacao(caminho_cotacao, caminho_mestre, prazo=28, modo="completo"):
    """
    Pipeline completo: le tabela + cotacao + matching + gera resultado.
    Retorna (caminho_resultado, stats, itens_sem_match)
    """
    precos_dict, precos_lista = ler_tabela_mestre(caminho_mestre, prazo=prazo)
    itens, header_row = ler_cotacao(caminho_cotacao)

    resultados = processar_cotacao_com_ia(itens, precos_dict, precos_lista, modo=modo)
    caminho_resultado = gerar_excel_resultado(caminho_cotacao, itens, resultados)

    stats = {"ean": 0, "descricao": 0, "ia": 0, "sem_match": 0, "total": len(resultados)}
    sem_match = []
    for item, res in zip(itens, resultados):
        if res["tipo"] is None:
            stats["sem_match"] += 1
            sem_match.append(item["nome"])
        elif res["tipo"] == "EAN":
            stats["ean"] += 1
        elif "IA" in res["tipo"]:
            stats["ia"] += 1
        else:
            stats["descricao"] += 1

    return caminho_resultado, stats, sem_match
