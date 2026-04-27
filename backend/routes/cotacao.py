"""
Rotas do Robo de Cotacao — CRUD de tabelas mestre + processamento.
"""

import os
import json
import tempfile
import logging
import uuid
import asyncio
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel
from typing import List
import firebase_admin
from firebase_admin import auth as firebase_auth

from services.excel_processor import (
    ler_tabela_mestre,
    gerar_excel_resultado,
    processar_arquivo_cotacao,
    gerar_excel_multiprazos,
    detectar_prazos_disponiveis,
)
from services.matching_engine import normalizar_nome

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

db = None

# Keep strong references to background tasks so Python's GC doesn't collect them
_background_tasks: set = set()

MAX_TABELAS = 5


def init_cotacao(database):
    global db
    db = database


def _resultados_para_preview(itens, resultados):
    """Converte itens + resultados do matching para formato de preview da UI."""
    preview = []
    for item, res in zip(itens, resultados):
        tipo = res.get("tipo")
        if tipo is None:
            status = "sem_match"
            score = None
        elif tipo == "EAN" or tipo == "APRENDIDO":
            status = "aprovado"
            score = 1.0
        else:
            # "SIMILAR 80%", "APROX 64%", ou "IA 75%" (camada Gemini)
            try:
                score = float(tipo.split()[-1].rstrip('%')) / 100
            except (ValueError, IndexError):
                score = 0.0
            status = "pendente"

        preview.append({
            "nome_cotacao": item["nome"],
            "preco": res.get("preco"),
            "tipo": tipo,
            "score": score,
            "status": status,
        })
    return preview


def _bucket():
    return AsyncIOMotorGridFSBucket(db)


async def get_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials:
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        return decoded['uid']
    except Exception:
        raise HTTPException(401, "Token inválido")


@router.post("/tabelas")
async def upload_tabela(
    arquivo: UploadFile = File(...),
    nome: str = Form(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    uid = await get_user_id(credentials)
    collection = db.tabelas_mestre

    count = await collection.count_documents({"user_id": uid})
    if count >= MAX_TABELAS:
        raise HTTPException(400, f"Máximo de {MAX_TABELAS} tabelas permitidas")

    conteudo = await arquivo.read()
    bucket = _bucket()
    grid_id = await bucket.upload_from_stream(
        arquivo.filename,
        BytesIO(conteudo),
        metadata={"content_type": arquivo.content_type},
    )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp.write(conteudo)
    tmp.close()

    try:
        prazos_disponiveis = detectar_prazos_disponiveis(tmp.name)
        prazo_padrao = prazos_disponiveis[-1]  # maior prazo como padrão
        precos_dict, precos_lista = ler_tabela_mestre(tmp.name, prazo=prazo_padrao)
        qtd = len(precos_lista)
    except Exception as e:
        os.unlink(tmp.name)
        await bucket.delete(grid_id)
        raise HTTPException(400, f"Erro ao ler tabela: {str(e)}")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    doc = {
        "user_id": uid,
        "nome": nome,
        "filename": arquivo.filename,
        "grid_id": grid_id,
        "prazo": prazo_padrao,
        "prazos_disponiveis": prazos_disponiveis,
        "qtd_produtos": qtd,
        "data_upload": datetime.now(timezone.utc),
    }
    result = await collection.insert_one(doc)

    return {
        "id": str(result.inserted_id),
        "nome": nome,
        "qtd_produtos": qtd,
        "prazo": prazo_padrao,
        "prazos_disponiveis": prazos_disponiveis,
        "data_upload": doc["data_upload"].isoformat(),
    }


@router.get("/tabelas")
async def listar_tabelas(credentials: HTTPAuthorizationCredentials = Depends(security)):
    uid = await get_user_id(credentials)
    collection = db.tabelas_mestre
    tabelas = []
    async for doc in collection.find({"user_id": uid}).sort("data_upload", -1):
        prazo = doc.get("prazo", 28)
        prazos_disponiveis = doc.get("prazos_disponiveis")

        # Tabelas antigas não têm prazos_disponiveis — detectar e gravar agora
        if not prazos_disponiveis:
            try:
                grid_out = await _bucket().open_download_stream(doc["grid_id"])
                conteudo = await grid_out.read()
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
                tmp.write(conteudo)
                tmp.close()
                prazos_disponiveis = await asyncio.to_thread(detectar_prazos_disponiveis, tmp.name)
                os.unlink(tmp.name)
                await collection.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"prazos_disponiveis": prazos_disponiveis}},
                )
            except Exception:
                prazos_disponiveis = [prazo]

        tabelas.append({
            "id": str(doc["_id"]),
            "nome": doc["nome"],
            "filename": doc["filename"],
            "qtd_produtos": doc["qtd_produtos"],
            "prazo": prazo,
            "prazos_disponiveis": prazos_disponiveis,
            "data_upload": doc["data_upload"].isoformat(),
        })
    return tabelas


@router.put("/tabelas/{tabela_id}")
async def renomear_tabela(
    tabela_id: str,
    nome: str = Form(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    from bson import ObjectId
    uid = await get_user_id(credentials)
    result = await db.tabelas_mestre.update_one(
        {"_id": ObjectId(tabela_id), "user_id": uid},
        {"$set": {"nome": nome}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Tabela não encontrada")
    return {"ok": True}


@router.delete("/tabelas/{tabela_id}")
async def excluir_tabela(
    tabela_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    from bson import ObjectId
    uid = await get_user_id(credentials)
    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela não encontrada")
    try:
        await _bucket().delete(doc["grid_id"])
    except Exception:
        pass
    await db.tabelas_mestre.delete_one({"_id": ObjectId(tabela_id)})
    return {"ok": True}


@router.post("/processar")
async def processar_cotacao(
    arquivo: UploadFile = File(...),
    tabela_id: str = Form(...),
    modo: str = Form("completo"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    from bson import ObjectId

    uid = await get_user_id(credentials)

    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela mestre não encontrada")

    # Baixar tabela mestre do GridFS
    grid_out = await _bucket().open_download_stream(doc["grid_id"])
    conteudo_mestre = await grid_out.read()

    tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_mestre.write(conteudo_mestre)
    tmp_mestre.close()

    conteudo_cotacao = await arquivo.read()
    tmp_cotacao = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_cotacao.write(conteudo_cotacao)
    tmp_cotacao.close()

    try:
        caminho_resultado, stats, sem_match = processar_arquivo_cotacao(
            tmp_cotacao.name, tmp_mestre.name,
            prazo=doc.get("prazo", 28),
            modo=modo,
        )

        with open(caminho_resultado, "rb") as f:
            resultado_bytes = f.read()

        os.unlink(caminho_resultado)

    except Exception as e:
        logger.error(f"Erro ao processar cotação: {e}")
        raise HTTPException(500, f"Erro ao processar: {str(e)}")
    finally:
        for p in [tmp_mestre.name, tmp_cotacao.name]:
            try:
                os.unlink(p)
            except OSError:
                pass

    return Response(
        content=resultado_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=cotacao_preenchida.xlsx",
            "X-Stats": json.dumps(stats),
            "X-Sem-Match": json.dumps(sem_match[:50]),
        }
    )


@router.post("/preview")
async def preview_cotacao(
    arquivo: UploadFile = File(...),
    tabela_id: str = Form(...),
    modo: str = Form("completo"),
    prazo: int = Form(0),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Executa matching e retorna JSON com resultados para revisão.
    Não gera Excel — salva sessão no MongoDB para uso posterior pelo /confirmar.
    """
    from bson import ObjectId
    from services.excel_processor import ler_cotacao
    from services.matching_engine import processar_cotacao_com_ia

    uid = await get_user_id(credentials)

    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela mestre não encontrada")

    grid_out = await _bucket().open_download_stream(doc["grid_id"])
    conteudo_mestre = await grid_out.read()

    tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_mestre.write(conteudo_mestre)
    tmp_mestre.close()

    conteudo_cotacao = await arquivo.read()
    tmp_cotacao = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_cotacao.write(conteudo_cotacao)
    tmp_cotacao.close()

    try:
        prazo_efetivo = prazo if prazo > 0 else doc.get("prazo", 28)
        precos_dict, precos_lista = ler_tabela_mestre(tmp_mestre.name, prazo=prazo_efetivo)
        itens, _ = ler_cotacao(tmp_cotacao.name)
        resultados = processar_cotacao_com_ia(itens, precos_dict, precos_lista, modo=modo)

        # Sobrescrever matches com dados aprendidos do usuário (uma query batched)
        nomes_norm = [normalizar_nome(item["nome"]) for item in itens]
        cursor = db.cotacao_aprendizado.find(
            {"user_id": uid, "produto_cotacao_norm": {"$in": nomes_norm}, "confirmado": True}
        )
        aprendizado_map = {doc["produto_cotacao_norm"]: doc async for doc in cursor}

        for i, item in enumerate(itens):
            learned = aprendizado_map.get(normalizar_nome(item["nome"]))
            if learned:
                resultados[i]["preco"] = learned["preco"]
                resultados[i]["tipo"] = "APRENDIDO"

        preview_items = _resultados_para_preview(itens, resultados)

        # Salvar sessão para uso pelo /confirmar
        if len(conteudo_cotacao) > 14_000_000:
            raise HTTPException(400, "Arquivo de cotação muito grande (máx 14MB)")

        session_id = str(uuid.uuid4())
        await db.cotacao_sessoes.insert_one({
            "_id": session_id,
            "user_id": uid,
            "tabela_id": tabela_id,
            "prazo": prazo_efetivo,
            "cotacao_bytes": conteudo_cotacao,
            "itens": itens,
            "resultados": resultados,
            "created_at": datetime.now(timezone.utc),
        })

    except Exception as e:
        logger.error(f"Erro no preview: {e}")
        raise HTTPException(500, f"Erro ao processar: {str(e)}")
    finally:
        for p in [tmp_mestre.name, tmp_cotacao.name]:
            try:
                os.unlink(p)
            except OSError:
                pass

    return {"session_id": session_id, "itens": preview_items}


@router.post("/gerar-tabela-prazos")
async def gerar_tabela_prazos(
    arquivo: UploadFile = File(...),
    pct_7: float = Form(0.0),
    pct_14: float = Form(0.0),
    pct_21: float = Form(0.0),
    pct_28: float = Form(0.0),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    uid = await get_user_id(credentials)

    conteudo = await arquivo.read()
    ext = ".pdf" if arquivo.filename.lower().endswith(".pdf") else ".xlsx"

    job_id = str(uuid.uuid4())
    await db.cotacao_jobs.insert_one({
        "_id": job_id,
        "user_id": uid,
        "status": "processing",
        "created_at": datetime.now(timezone.utc),
    })

    task = asyncio.create_task(_processar_tabela_prazos(job_id, conteudo, ext, {
        7: pct_7, 14: pct_14, 21: pct_21, 28: pct_28,
    }))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return {"job_id": job_id}


async def _processar_tabela_prazos(job_id, conteudo, ext, prazos):
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        tmp.write(conteudo)
        tmp.close()

        logger.info(f"[Job {job_id}] Iniciando processamento ({ext}, {len(conteudo)} bytes)")

        resultado_path = await asyncio.wait_for(
            asyncio.to_thread(gerar_excel_multiprazos, tmp.name, prazos),
            timeout=540,  # 9 minutes max
        )

        with open(resultado_path, "rb") as f:
            resultado_bytes = f.read()
        os.unlink(resultado_path)

        bucket = _bucket()
        grid_id = await bucket.upload_from_stream(
            "tabela_com_prazos.xlsx",
            BytesIO(resultado_bytes),
            metadata={"content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
        )

        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "done", "grid_id": grid_id}},
        )
    except asyncio.TimeoutError:
        logger.error(f"[Job {job_id}] Timeout (9 min)")
        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "error", "error": "Processamento demorou demais. Para PDFs grandes, converta para Excel (.xlsx) antes de enviar."}},
        )
    except Exception as e:
        logger.error(f"Erro ao gerar tabela (job {job_id}): {e}")
        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "error", "error": str(e)}},
        )
    finally:
        try:
            os.unlink(tmp.name)
        except (OSError, NameError):
            pass


@router.get("/jobs/{job_id}")
async def get_job_status(
    job_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    uid = await get_user_id(credentials)
    job = await db.cotacao_jobs.find_one({"_id": job_id, "user_id": uid})
    if not job:
        raise HTTPException(404, "Job não encontrado")

    if job["status"] == "processing":
        age = (datetime.now(timezone.utc) - job["created_at"]).total_seconds()
        if age > 480:  # 8 min — fires before client's 10-min timeout; catches orphaned jobs
            await db.cotacao_jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "error", "error": "Processamento demorou demais. Tente novamente — para PDF grande, converta para Excel antes."}},
            )
            raise HTTPException(500, "Processamento demorou demais. Tente novamente — para PDF grande, converta para Excel antes.")
        return {"status": "processing"}

    if job["status"] == "error":
        await db.cotacao_jobs.delete_one({"_id": job_id})
        raise HTTPException(500, job.get("error", "Erro ao processar tabela"))

    # Done — stream result from GridFS
    grid_id = job["grid_id"]
    grid_out = await _bucket().open_download_stream(grid_id)
    resultado_bytes = await grid_out.read()

    # Clean up
    try:
        await _bucket().delete(grid_id)
    except Exception:
        pass
    await db.cotacao_jobs.delete_one({"_id": job_id})

    return Response(
        content=resultado_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=tabela_com_prazos.xlsx"},
    )


class ConfirmarPayload(BaseModel):
    session_id: str
    aprovacoes: List[bool]  # um bool por item, na mesma ordem do preview


@router.post("/confirmar")
async def confirmar_cotacao(
    payload: ConfirmarPayload,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Recebe aprovações do usuário, salva aprendizado e gera Excel.
    """
    uid = await get_user_id(credentials)

    sessao = await db.cotacao_sessoes.find_one({"_id": payload.session_id, "user_id": uid})
    if not sessao:
        raise HTTPException(404, "Sessão expirada ou não encontrada. Processe a cotação novamente.")

    itens = sessao["itens"]
    resultados = sessao["resultados"]
    cotacao_bytes = sessao["cotacao_bytes"]

    if len(payload.aprovacoes) != len(itens):
        raise HTTPException(400, "Número de aprovações não corresponde ao número de itens.")

    # Salvar aprendizado para itens com preço (aprovados ou rejeitados)
    agora = datetime.now(timezone.utc)
    for i, aprovado in enumerate(payload.aprovacoes):
        item = itens[i]
        res = resultados[i]
        if res.get("preco") is None:
            continue

        nome_norm = normalizar_nome(item["nome"])

        if aprovado:
            await db.cotacao_aprendizado.update_one(
                {"user_id": uid, "produto_cotacao_norm": nome_norm},
                {"$set": {
                    "preco": res["preco"],
                    "confirmado": True,
                    "updated_at": agora,
                }},
                upsert=True,
            )
        else:
            await db.cotacao_aprendizado.update_one(
                {"user_id": uid, "produto_cotacao_norm": nome_norm},
                {"$set": {"confirmado": False, "updated_at": agora}},
                upsert=True,
            )

    # Gerar Excel com apenas items aprovados preenchidos
    resultados_filtrados = []
    for i, res in enumerate(resultados):
        if payload.aprovacoes[i] and res.get("preco") is not None:
            resultados_filtrados.append(res)
        else:
            resultados_filtrados.append({"linha": res.get("linha", 0), "preco": None, "tipo": None})

    try:
        tmp_cotacao = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
        tmp_cotacao.write(cotacao_bytes)
        tmp_cotacao.close()

        caminho_resultado = gerar_excel_resultado(tmp_cotacao.name, itens, resultados_filtrados)
        with open(caminho_resultado, "rb") as f:
            resultado_bytes = f.read()
        os.unlink(caminho_resultado)
    except Exception as e:
        logger.error(f"Erro ao gerar Excel no confirmar: {e}")
        raise HTTPException(500, f"Erro ao gerar Excel: {str(e)}")
    finally:
        try:
            os.unlink(tmp_cotacao.name)
        except OSError:
            pass
        # Limpar sessão após uso
        await db.cotacao_sessoes.delete_one({"_id": payload.session_id})

    # Stats apenas dos aprovados
    stats = {"ean": 0, "descricao": 0, "ia": 0, "aprendido": 0, "sem_match": 0, "total": len(itens)}
    sem_match = []
    for item, res, aprovado in zip(itens, resultados, payload.aprovacoes):
        tipo = res.get("tipo")
        if not aprovado or res.get("preco") is None:
            stats["sem_match"] += 1
            sem_match.append(item["nome"])
        elif tipo == "EAN":
            stats["ean"] += 1
        elif tipo == "APRENDIDO":
            stats["aprendido"] += 1
        elif tipo and "IA" in tipo:
            stats["ia"] += 1
        else:
            stats["descricao"] += 1

    return Response(
        content=resultado_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=cotacao_preenchida.xlsx",
            "X-Stats": json.dumps(stats),
            "X-Sem-Match": json.dumps(sem_match[:50]),
        }
    )


# ==================== Cotatudo Chrome Extension ====================

class CotatudoItem(BaseModel):
    idx: int
    ean: str | None = None
    nome: str = ""
    filled: bool = False


class CotatudoPayload(BaseModel):
    tabela_id: str
    prazo: int = 28
    itens: List[CotatudoItem]


@router.post("/match-cotatudo")
async def match_cotatudo(
    payload: CotatudoPayload,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Recebe itens extraídos do Cotatudo pela extensão Chrome,
    faz matching com a tabela mestre e retorna preços para preencher.
    """
    from bson import ObjectId
    from services.matching_engine import processar_cotacao_com_ia

    uid = await get_user_id(credentials)

    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(payload.tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela mestre não encontrada")

    grid_out = await _bucket().open_download_stream(doc["grid_id"])
    conteudo_mestre = await grid_out.read()

    tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_mestre.write(conteudo_mestre)
    tmp_mestre.close()

    try:
        prazo = payload.prazo
        precos_dict, precos_lista = ler_tabela_mestre(tmp_mestre.name, prazo=prazo)

        itens_para_match = [
            {"nome": it.nome, "ean": it.ean or "", "linha": it.idx}
            for it in payload.itens
            if not it.filled and it.nome
        ]

        if not itens_para_match:
            return {"precos": [], "stats": {"preenchidos": 0, "total": 0, "nao_encontrados": 0}}

        resultados = processar_cotacao_com_ia(itens_para_match, precos_dict, precos_lista, modo="completo")

        nomes_norm = [normalizar_nome(it["nome"]) for it in itens_para_match]
        cursor = db.cotacao_aprendizado.find(
            {"user_id": uid, "produto_cotacao_norm": {"$in": nomes_norm}, "confirmado": True}
        )
        aprendizado_map = {d["produto_cotacao_norm"]: d async for d in cursor}

        precos = []
        preenchidos = 0
        nao_encontrados = 0

        for i, item in enumerate(itens_para_match):
            res = resultados[i]
            learned = aprendizado_map.get(normalizar_nome(item["nome"]))
            if learned:
                res["preco"] = learned["preco"]
                res["tipo"] = "APRENDIDO"

            if res.get("preco") is not None:
                preco_str = f"{res['preco']:.2f}".replace(".", ",")
                precos.append({"idx": item["idx"], "price": preco_str})
                preenchidos += 1
            else:
                nao_encontrados += 1

        return {
            "precos": precos,
            "stats": {
                "preenchidos": preenchidos,
                "total": len(itens_para_match),
                "nao_encontrados": nao_encontrados,
            }
        }

    except Exception as e:
        logger.error(f"Erro no match-cotatudo: {e}")
        raise HTTPException(500, f"Erro ao processar: {str(e)}")
    finally:
        try:
            os.unlink(tmp_mestre.name)
        except OSError:
            pass
