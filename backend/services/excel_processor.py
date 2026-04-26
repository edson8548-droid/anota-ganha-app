"""
Processador de Excel — leitura de tabelas mestre e cotações, geração de resultado.
"""

import pandas as pd
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment
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


def _ler_excel_base(caminho_arquivo):
    """Lê Excel base do atacadista. Retorna lista de {"nome", "ean", "preco_base"}."""
    wb_in = openpyxl.load_workbook(caminho_arquivo, data_only=True)
    ws_in = wb_in.active

    header_row_idx = 1
    col_nome = 0
    col_ean = None
    col_preco = None

    for row_idx in range(1, min(12, ws_in.max_row + 1)):
        for cell in ws_in[row_idx]:
            val = str(cell.value).upper().strip() if cell.value else ""
            if val in ("PRODUTO", "DESCRIÇÃO", "DESCRICAO", "ITEM", "MERCADORIA", "DESC",
                       "DESCRIÇÃO DO PRODUTO", "DESCRICAO DO PRODUTO"):
                col_nome = cell.column - 1
                header_row_idx = row_idx
            elif val in ("EAN", "COD.BARRAS", "COD BARRAS", "CODIGO DE BARRAS",
                         "COD BARRA", "CÓDIGO DE BARRAS"):
                col_ean = cell.column - 1
                header_row_idx = row_idx
            elif val in ("PREÇO", "PRECO", "VALOR", "R$", "VALOR UNITÁRIO",
                         "VALOR UNIT", "PRECO UNIT", "PREÇO UNIT.", "VALOR UNITARIO"):
                col_preco = cell.column - 1
                header_row_idx = row_idx

    if col_ean is None:
        col_ean = 1 if col_nome != 1 else 0
    if col_preco is None:
        col_preco = ws_in.max_column - 1

    rows_data = []
    for row_idx in range(header_row_idx + 1, ws_in.max_row + 1):
        row = ws_in[row_idx]
        nome = row[col_nome].value if col_nome < len(row) else None
        ean_raw = row[col_ean].value if col_ean < len(row) else None
        preco_raw = row[col_preco].value if col_preco < len(row) else None

        if not nome or not str(nome).strip() or str(nome).strip().upper() in ("NONE", "NAN"):
            continue
        try:
            preco = float(str(preco_raw).replace(",", ".").replace("R$", "").strip())
        except (ValueError, TypeError):
            continue

        rows_data.append({
            "nome": str(nome).strip(),
            "ean": str(int(float(str(ean_raw)))) if ean_raw and str(ean_raw).strip() not in ("", "None") else "",
            "preco_base": preco,
        })

    wb_in.close()
    return rows_data


def _extrair_pdf_com_gemini(caminho_pdf):
    """Fallback: usa Gemini para extrair tabela de preços de PDF escaneado/complexo."""
    import json
    import google.generativeai as genai

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY não configurada — não é possível processar este PDF")

    genai.configure(api_key=api_key)
    uploaded = genai.upload_file(caminho_pdf, mime_type="application/pdf")

    model = genai.GenerativeModel("gemini-2.0-flash")
    prompt = """Este PDF contém uma tabela de preços de atacadista.

Extraia TODOS os produtos com seus preços. Retorne APENAS JSON válido:
{"produtos": [{"nome": "PRODUTO X 1KG", "ean": "7891234567890", "preco": 4.50}, ...]}

Regras:
- nome: descrição completa do produto (com marca, gramagem, embalagem)
- ean: código de barras EAN (13 dígitos). Se não existir, use ""
- preco: preço como número decimal (use ponto como separador). Se houver colunas de prazo (7d, 14d, 21d, 28d), use o de MENOR prazo (geralmente 7 dias ou à vista)
- Ignore cabeçalhos, totais, rodapés
- Não inclua produtos sem nome ou sem preço"""

    response = model.generate_content([uploaded, prompt])
    text = response.text.strip()

    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    data = json.loads(text)
    rows_data = []
    for p in data.get("produtos", []):
        try:
            preco = float(str(p.get("preco", 0)).replace(",", "."))
        except (ValueError, TypeError):
            continue
        if not p.get("nome") or preco <= 0:
            continue
        rows_data.append({
            "nome": str(p["nome"]).strip(),
            "ean": str(p.get("ean", "")).strip(),
            "preco_base": preco,
        })

    return rows_data


def _ler_pdf_base(caminho_pdf):
    """Lê PDF de tabela do atacadista. Tenta pdfplumber, fallback para Gemini."""
    import logging
    logger_local = logging.getLogger(__name__)

    rows_data = []
    try:
        import pdfplumber

        with pdfplumber.open(caminho_pdf) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    if not table or len(table) < 2:
                        continue

                    headers = [str(c).upper().strip() if c else "" for c in table[0]]
                    col_nome = 0
                    col_ean = None
                    col_preco = len(headers) - 1

                    for i, h in enumerate(headers):
                        if any(k in h for k in ("PRODUTO", "DESCRI", "ITEM", "MERCADORIA")):
                            col_nome = i
                        elif any(k in h for k in ("EAN", "COD", "BARRAS", "CODIGO")):
                            col_ean = i
                        elif any(k in h for k in ("PRECO", "PREÇO", "VALOR", "R$", "UNIT")):
                            col_preco = i

                    for row in table[1:]:
                        if not row or len(row) <= col_preco:
                            continue
                        nome = str(row[col_nome]).strip() if row[col_nome] else ""
                        if not nome or nome.upper() in ("NONE", ""):
                            continue
                        ean_raw = str(row[col_ean]).strip() if col_ean is not None and col_ean < len(row) and row[col_ean] else ""
                        preco_raw = str(row[col_preco]).strip() if row[col_preco] else ""
                        try:
                            preco = float(preco_raw.replace(",", ".").replace("R$", "").replace(" ", "").strip())
                        except (ValueError, TypeError):
                            continue
                        rows_data.append({
                            "nome": nome,
                            "ean": ean_raw,
                            "preco_base": preco,
                        })
    except Exception as e:
        logger_local.warning(f"pdfplumber falhou: {e}")

    if not rows_data:
        logger_local.info("Nenhuma tabela extraída pelo pdfplumber — usando Gemini")
        rows_data = _extrair_pdf_com_gemini(caminho_pdf)

    return rows_data


def _gerar_excel_de_dados(rows_data, percentuais):
    """Gera Excel com colunas por prazo a partir de dados já extraídos."""
    wb_out = Workbook()
    ws_out = wb_out.active
    ws_out.title = "Tabela de Preços"

    ws_out.cell(1, 1).value = "Tabela de Preços com Prazos — gerada pelo Venpro"
    ws_out.cell(1, 1).font = Font(bold=True, size=11, color="2D2926")

    prazos = [7, 14, 21, 28]
    headers = ["PRODUTO", "EAN"] + [f"{p} dias" for p in prazos]
    header_fill = PatternFill(start_color="B35C44", end_color="B35C44", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)

    for col_idx, h in enumerate(headers, 1):
        cell = ws_out.cell(3, col_idx)
        cell.value = h
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    for row_idx, item in enumerate(rows_data, 4):
        ws_out.cell(row_idx, 1).value = item["nome"]
        ws_out.cell(row_idx, 2).value = item["ean"]
        for col_offset, prazo in enumerate(prazos, 3):
            pct = percentuais.get(prazo, 0.0)
            preco_final = round(item["preco_base"] * (1 + pct / 100), 2)
            cell = ws_out.cell(row_idx, col_offset)
            cell.value = preco_final
            cell.number_format = '#,##0.00'

    ws_out.column_dimensions['A'].width = 48
    ws_out.column_dimensions['B'].width = 16
    for letra in ['C', 'D', 'E', 'F']:
        ws_out.column_dimensions[letra].width = 11

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    wb_out.save(tmp.name)
    tmp.close()
    return tmp.name


def gerar_excel_multiprazos(caminho_base, percentuais):
    """
    Orquestrador: aceita Excel (.xlsx/.xls) ou PDF e gera tabela com colunas por prazo.
    percentuais: {7: 0.0, 14: 2.5, 21: 4.0, 28: 5.5}
    """
    if caminho_base.lower().endswith('.pdf'):
        rows_data = _ler_pdf_base(caminho_base)
    else:
        rows_data = _ler_excel_base(caminho_base)

    if not rows_data:
        raise ValueError("Nenhum produto encontrado no arquivo enviado")

    return _gerar_excel_de_dados(rows_data, percentuais)
