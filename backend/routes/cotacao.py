"""
Rotas do Robo de Cotacao — CRUD de tabelas mestre + processamento.
"""

import os
import json
import tempfile
import logging
import uuid
import asyncio
import multiprocessing
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel
from pymongo import UpdateOne
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
from services.subscription_access import ensure_subscription_access
from services.upload_validation import PDF_CONTENT_TYPES, XLSX_CONTENT_TYPES, validate_upload

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

db = None

# Keep strong references to background tasks so Python's GC doesn't collect them
_background_tasks: set = set()
_running_job_ids: set = set()

MAX_TABELAS = 5
MAX_EXCEL_BYTES = 20 * 1024 * 1024
MAX_COTACAO_PREVIEW_BYTES = 14 * 1024 * 1024
MAX_TABELA_PRAZOS_BYTES = 25 * 1024 * 1024


def _gerar_excel_multiprazos_worker(caminho_base, prazos, queue):
    try:
        resultado_path = gerar_excel_multiprazos(caminho_base, prazos)
        queue.put({"ok": True, "path": resultado_path})
    except Exception as e:
        queue.put({"ok": False, "error": str(e), "type": type(e).__name__})


def _gerar_excel_multiprazos_pdf_isolado(caminho_base, prazos, timeout_seconds=150):
    """Gera tabela de PDF em processo separado para poder encerrar parser travado."""
    metodo = "fork" if "fork" in multiprocessing.get_all_start_methods() else "spawn"
    ctx = multiprocessing.get_context(metodo)
    queue = ctx.Queue()
    process = ctx.Process(
        target=_gerar_excel_multiprazos_worker,
        args=(caminho_base, prazos, queue),
    )
    process.start()
    process.join(timeout_seconds)

    if process.is_alive():
        process.terminate()
        process.join(5)
        raise TimeoutError(
            "Processamento demorou demais. Esse PDF travou a leitura no servidor; converta para Excel (.xlsx) ou use um PDF menor."
        )

    if queue.empty():
        raise RuntimeError("Processo de leitura do PDF terminou sem retornar resultado.")

    result = queue.get()
    if not result.get("ok"):
        raise ValueError(result.get("error") or "Erro ao ler PDF")
    return result["path"]


def init_cotacao(database):
    global db
    db = database


def _aprendizado_query(user_id: str, tabela_id: str, nomes_norm):
    return {
        "user_id": user_id,
        "tabela_id": str(tabela_id),
        "produto_cotacao_norm": {"$in": nomes_norm},
        "confirmado": True,
    }


def _aprendizado_key(user_id: str, tabela_id: str, nome_norm: str):
    return {
        "user_id": user_id,
        "tabela_id": str(tabela_id),
        "produto_cotacao_norm": nome_norm,
    }


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


def _track_background_task(task, job_id=None):
    _background_tasks.add(task)

    def _cleanup(done_task):
        _background_tasks.discard(done_task)
        if job_id:
            _running_job_ids.discard(job_id)

    task.add_done_callback(_cleanup)


def _start_tabela_prazos_job(job_id):
    if job_id in _running_job_ids:
        return None
    _running_job_ids.add(job_id)
    task = asyncio.create_task(_processar_tabela_prazos(job_id))
    _track_background_task(task, job_id=job_id)
    return task


def _start_preview_job(job_id):
    if job_id in _running_job_ids:
        return None
    _running_job_ids.add(job_id)
    task = asyncio.create_task(_processar_preview_job(job_id))
    _track_background_task(task, job_id=job_id)
    return task


async def resume_cotacao_jobs():
    """Devolve jobs incompletos para a fila após restart."""
    now = datetime.now(timezone.utc)
    async for job in db.cotacao_jobs.find({"status": {"$in": ["queued", "processing"]}}):
        job_id = job["_id"]
        age = (now - job.get("created_at", now)).total_seconds()
        if age > 15 * 60:
            await db.cotacao_jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "error", "error": "Processamento demorou demais. Tente novamente — para PDF grande, converta para Excel antes."}},
            )
            continue
        if not job.get("input_grid_id"):
            await db.cotacao_jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "error", "error": "Servidor reiniciou durante o processamento. Tente novamente."}},
            )
            continue
        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "queued"}, "$unset": {"started_at": ""}},
        )
        logger.info("[Job %s] Recolocado na fila após restart", job_id)


async def get_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials:
        logger.warning("[SECURITY] auth_missing route=cotacao")
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        uid = decoded['uid']
        await ensure_subscription_access(uid)
        return uid
    except HTTPException:
        raise
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=cotacao")
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
    validate_upload(
        arquivo,
        conteudo,
        label="Tabela mestre",
        allowed_extensions={".xlsx"},
        allowed_kinds={"xlsx"},
        allowed_content_types=XLSX_CONTENT_TYPES,
        max_bytes=MAX_EXCEL_BYTES,
    )
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
    modo = str(modo or "completo").strip().lower()

    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela mestre não encontrada")

    conteudo_cotacao = await arquivo.read()
    validate_upload(
        arquivo,
        conteudo_cotacao,
        label="Arquivo de cotação",
        allowed_extensions={".xlsx"},
        allowed_kinds={"xlsx"},
        allowed_content_types=XLSX_CONTENT_TYPES,
        max_bytes=MAX_EXCEL_BYTES,
    )

    # Baixar tabela mestre do GridFS
    grid_out = await _bucket().open_download_stream(doc["grid_id"])
    conteudo_mestre = await grid_out.read()

    tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_mestre.write(conteudo_mestre)
    tmp_mestre.close()

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
    modo = str(modo or "completo").strip().lower()

    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela mestre não encontrada")

    conteudo_cotacao = await arquivo.read()
    validate_upload(
        arquivo,
        conteudo_cotacao,
        label="Arquivo de cotação",
        allowed_extensions={".xlsx"},
        allowed_kinds={"xlsx"},
        allowed_content_types=XLSX_CONTENT_TYPES,
        max_bytes=MAX_COTACAO_PREVIEW_BYTES,
    )

    grid_out = await _bucket().open_download_stream(doc["grid_id"])
    conteudo_mestre = await grid_out.read()

    tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_mestre.write(conteudo_mestre)
    tmp_mestre.close()

    tmp_cotacao = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_cotacao.write(conteudo_cotacao)
    tmp_cotacao.close()

    try:
        prazo_efetivo = prazo if prazo > 0 else doc.get("prazo", 28)

        def _processar_sync():
            pd, pl = ler_tabela_mestre(tmp_mestre.name, prazo=prazo_efetivo)
            its, _ = ler_cotacao(tmp_cotacao.name)
            res = processar_cotacao_com_ia(its, pd, pl, modo=modo)
            return pd, pl, its, res

        precos_dict, precos_lista, itens, resultados = await asyncio.to_thread(_processar_sync)

        if modo != "ean":
            # Sobrescrever matches com dados aprendidos do usuário (uma query batched)
            nomes_norm = [normalizar_nome(item["nome"]) for item in itens]
            cursor = db.cotacao_aprendizado.find(_aprendizado_query(uid, tabela_id, nomes_norm))
            aprendizado_map = {doc["produto_cotacao_norm"]: doc async for doc in cursor}

            for i, item in enumerate(itens):
                learned = aprendizado_map.get(normalizar_nome(item["nome"]))
                if learned:
                    resultados[i]["preco"] = learned["preco"]
                    resultados[i]["tipo"] = "APRENDIDO"

        preview_items = _resultados_para_preview(itens, resultados)

        # Salvar sessão para uso pelo /confirmar
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


@router.post("/preview-async")
async def preview_cotacao_async(
    arquivo: UploadFile = File(...),
    tabela_id: str = Form(...),
    modo: str = Form("completo"),
    prazo: int = Form(0),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Cria um job para o preview da Cotação Pronta sem segurar a requisição aberta."""
    from bson import ObjectId

    uid = await get_user_id(credentials)
    modo = str(modo or "completo").strip().lower()

    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela mestre não encontrada")

    conteudo_cotacao = await arquivo.read()
    validate_upload(
        arquivo,
        conteudo_cotacao,
        label="Arquivo de cotação",
        allowed_extensions={".xlsx"},
        allowed_kinds={"xlsx"},
        allowed_content_types=XLSX_CONTENT_TYPES,
        max_bytes=MAX_COTACAO_PREVIEW_BYTES,
    )

    cotacao_grid_id = await _bucket().upload_from_stream(
        arquivo.filename or "cotacao.xlsx",
        BytesIO(conteudo_cotacao),
        metadata={"content_type": arquivo.content_type or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    )

    job_id = str(uuid.uuid4())
    await db.cotacao_jobs.insert_one({
        "_id": job_id,
        "type": "preview",
        "user_id": uid,
        "status": "queued",
        "created_at": datetime.now(timezone.utc),
        "tabela_id": tabela_id,
        "input_grid_id": cotacao_grid_id,
        "modo": modo,
        "prazo": prazo,
    })

    _start_preview_job(job_id)
    return {"job_id": job_id}


async def _cleanup_job_input(job):
    input_grid_id = job.get("input_grid_id")
    if input_grid_id:
        try:
            await _bucket().delete(input_grid_id)
        except Exception:
            pass


async def _cleanup_job_output(job):
    grid_id = job.get("grid_id")
    if grid_id:
        try:
            await _bucket().delete(grid_id)
        except Exception:
            pass


async def _preview_job_foi_cancelado(job_id):
    job = await db.cotacao_jobs.find_one({"_id": job_id, "type": "preview"})
    return not job or job.get("status") == "canceled"


async def _processar_preview_job(job_id):
    from bson import ObjectId
    from services.excel_processor import ler_cotacao
    from services.matching_engine import processar_cotacao_com_ia

    tmp_mestre = None
    tmp_cotacao = None
    try:
        job = await db.cotacao_jobs.find_one({"_id": job_id})
        if not job or job.get("type") != "preview":
            return

        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "processing", "started_at": datetime.now(timezone.utc)}},
        )

        doc = await db.tabelas_mestre.find_one({
            "_id": ObjectId(job["tabela_id"]),
            "user_id": job["user_id"],
        })
        if not doc:
            raise ValueError("Tabela mestre não encontrada")

        grid_out = await _bucket().open_download_stream(doc["grid_id"])
        conteudo_mestre = await grid_out.read()

        cotacao_out = await _bucket().open_download_stream(job["input_grid_id"])
        conteudo_cotacao = await cotacao_out.read()

        tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
        tmp_mestre.write(conteudo_mestre)
        tmp_mestre.close()

        tmp_cotacao = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
        tmp_cotacao.write(conteudo_cotacao)
        tmp_cotacao.close()

        prazo_efetivo = job.get("prazo") if job.get("prazo", 0) > 0 else doc.get("prazo", 28)
        modo = str(job.get("modo", "completo") or "completo").strip().lower()

        def _processar_sync():
            pd, pl = ler_tabela_mestre(tmp_mestre.name, prazo=prazo_efetivo)
            its, _ = ler_cotacao(tmp_cotacao.name)
            res = processar_cotacao_com_ia(its, pd, pl, modo=modo)
            return its, res

        itens, resultados = await asyncio.wait_for(
            asyncio.to_thread(_processar_sync),
            timeout=540,
        )

        if await _preview_job_foi_cancelado(job_id):
            await _cleanup_job_input(job)
            await db.cotacao_jobs.delete_one({"_id": job_id})
            return

        if modo != "ean":
            nomes_norm = [normalizar_nome(item["nome"]) for item in itens]
            cursor = db.cotacao_aprendizado.find(_aprendizado_query(job["user_id"], job["tabela_id"], nomes_norm))
            aprendizado_map = {doc["produto_cotacao_norm"]: doc async for doc in cursor}

            for i, item in enumerate(itens):
                learned = aprendizado_map.get(normalizar_nome(item["nome"]))
                if learned:
                    resultados[i]["preco"] = learned["preco"]
                    resultados[i]["tipo"] = "APRENDIDO"

        if await _preview_job_foi_cancelado(job_id):
            await _cleanup_job_input(job)
            await db.cotacao_jobs.delete_one({"_id": job_id})
            return

        preview_items = _resultados_para_preview(itens, resultados)
        session_id = str(uuid.uuid4())
        await db.cotacao_sessoes.insert_one({
            "_id": session_id,
            "user_id": job["user_id"],
            "tabela_id": job["tabela_id"],
            "prazo": prazo_efetivo,
            "cotacao_bytes": conteudo_cotacao,
            "itens": itens,
            "resultados": resultados,
            "created_at": datetime.now(timezone.utc),
        })

        await _cleanup_job_input(job)
        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "done", "session_id": session_id, "itens": preview_items}},
        )
    except asyncio.TimeoutError:
        if await _preview_job_foi_cancelado(job_id):
            return
        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "error", "error": "Processamento demorou demais. Tente novamente com uma cotação menor ou em modo rápido."}},
        )
    except Exception as e:
        if await _preview_job_foi_cancelado(job_id):
            return
        logger.error(f"Erro no preview async (job {job_id}): {e}")
        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "error", "error": f"Erro ao processar: {str(e)}"}},
        )
    finally:
        for tmp in [tmp_mestre, tmp_cotacao]:
            if not tmp:
                continue
            try:
                os.unlink(tmp.name)
            except OSError:
                pass


@router.get("/preview-jobs/{job_id}")
async def get_preview_job_status(
    job_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    uid = await get_user_id(credentials)
    job = await db.cotacao_jobs.find_one({"_id": job_id, "user_id": uid, "type": "preview"})
    if not job:
        raise HTTPException(404, "Job não encontrado")

    if job["status"] == "queued":
        _start_preview_job(job_id)
        return {"status": "processing"}

    if job["status"] == "processing":
        started_at = job.get("started_at") or job.get("created_at")
        age = (datetime.now(timezone.utc) - started_at).total_seconds()
        if job_id not in _running_job_ids and age > 15:
            await db.cotacao_jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "queued"}, "$unset": {"started_at": ""}},
            )
            _start_preview_job(job_id)
        elif age > 540:
            await db.cotacao_jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "error", "error": "Processamento demorou demais. Tente novamente com uma cotação menor ou em modo rápido."}},
            )
            raise HTTPException(500, "Processamento demorou demais. Tente novamente com uma cotação menor ou em modo rápido.")
        return {"status": "processing"}

    if job["status"] == "error":
        await _cleanup_job_input(job)
        await db.cotacao_jobs.delete_one({"_id": job_id})
        raise HTTPException(500, job.get("error", "Erro ao processar cotação"))

    if job["status"] == "canceled":
        await _cleanup_job_input(job)
        await db.cotacao_jobs.delete_one({"_id": job_id})
        raise HTTPException(499, "Processamento cancelado")

    result = {"session_id": job["session_id"], "itens": job["itens"]}
    await db.cotacao_jobs.delete_one({"_id": job_id})
    return result


@router.delete("/preview-jobs/{job_id}")
async def cancelar_preview_job(
    job_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    uid = await get_user_id(credentials)
    job = await db.cotacao_jobs.find_one({"_id": job_id, "user_id": uid, "type": "preview"})
    if not job:
        return {"status": "canceled"}

    await _cleanup_job_input(job)
    await _cleanup_job_output(job)

    if job.get("status") == "processing":
        await db.cotacao_jobs.update_one(
            {"_id": job_id, "user_id": uid, "type": "preview"},
            {"$set": {"status": "canceled", "canceled_at": datetime.now(timezone.utc)}},
        )
    else:
        await db.cotacao_jobs.delete_one({"_id": job_id, "user_id": uid, "type": "preview"})

    _running_job_ids.discard(job_id)
    return {"status": "canceled"}


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
    validate_upload(
        arquivo,
        conteudo,
        label="Tabela para prazos",
        allowed_extensions={".xlsx"},
        allowed_kinds={"xlsx"},
        allowed_content_types=XLSX_CONTENT_TYPES,
        max_bytes=MAX_TABELA_PRAZOS_BYTES,
    )
    ext = ".xlsx"

    job_id = str(uuid.uuid4())
    bucket = _bucket()
    input_grid_id = await bucket.upload_from_stream(
        arquivo.filename or f"tabela_base{ext}",
        BytesIO(conteudo),
        metadata={"content_type": arquivo.content_type or "application/octet-stream"},
    )
    await db.cotacao_jobs.insert_one({
        "_id": job_id,
        "user_id": uid,
        "status": "queued",
        "created_at": datetime.now(timezone.utc),
        "input_grid_id": input_grid_id,
        "ext": ext,
        "prazos": {
            "7": pct_7,
            "14": pct_14,
            "21": pct_21,
            "28": pct_28,
        },
    })

    _start_tabela_prazos_job(job_id)
    return {"job_id": job_id}


async def _processar_tabela_prazos(job_id):
    try:
        job = await db.cotacao_jobs.find_one({"_id": job_id})
        if not job:
            logger.warning("[Job %s] Job não encontrado para processamento", job_id)
            return

        grid_out = await _bucket().open_download_stream(job["input_grid_id"])
        conteudo = await grid_out.read()
        ext = job.get("ext", ".xlsx")
        prazos_raw = job.get("prazos") or {}
        prazos = {int(k): float(v or 0) for k, v in prazos_raw.items()}

        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "processing", "started_at": datetime.now(timezone.utc)}},
        )

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        tmp.write(conteudo)
        tmp.close()

        logger.info(f"[Job {job_id}] Iniciando processamento ({ext}, {len(conteudo)} bytes)")

        loop = asyncio.get_running_loop()

        def _progress_threadsafe(update):
            async def _write_progress():
                await db.cotacao_jobs.update_one(
                    {"_id": job_id},
                    {"$set": {
                        "progress": update,
                        "progress_updated_at": datetime.now(timezone.utc),
                    }},
                )

            try:
                loop.call_soon_threadsafe(lambda: asyncio.create_task(_write_progress()))
            except RuntimeError as e:
                logger.warning("[Job %s] Falha ao agendar progresso: %s", job_id, e)

        if ext == ".pdf":
            _progress_threadsafe({"stage": "extracting_pdf_text", "rows": 0})
            resultado_path = await asyncio.to_thread(
                _gerar_excel_multiprazos_pdf_isolado,
                tmp.name,
                prazos,
                150,
            )
        else:
            resultado_path = await asyncio.wait_for(
                asyncio.to_thread(gerar_excel_multiprazos, tmp.name, prazos, _progress_threadsafe),
                timeout=540,
            )

        latest_job = await db.cotacao_jobs.find_one({"_id": job_id})
        if not latest_job or latest_job.get("status") == "canceled":
            try:
                os.unlink(resultado_path)
            except OSError:
                pass
            if latest_job:
                await _cleanup_job_input(latest_job)
                await db.cotacao_jobs.delete_one({"_id": job_id})
            logger.info("[Job %s] Cancelado antes de salvar resultado", job_id)
            return

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
        logger.error(f"[Job {job_id}] Timeout ao gerar tabela de prazos")
        await db.cotacao_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "error", "error": "Processamento demorou demais. Esse PDF travou a leitura no servidor; converta para Excel (.xlsx) ou use um PDF menor."}},
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

    if job["status"] == "queued":
        _start_tabela_prazos_job(job_id)
        return {"status": "processing"}

    if job["status"] == "processing":
        age_base = job.get("started_at") or job["created_at"]
        age = (datetime.now(timezone.utc) - age_base).total_seconds()
        if job_id not in _running_job_ids and age > 15:
            await db.cotacao_jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "queued"}, "$unset": {"started_at": ""}},
            )
            _start_tabela_prazos_job(job_id)
            return {"status": "processing"}
        max_age = 210 if job.get("ext") == ".pdf" else 480
        if age > max_age:  # fires before client's 10-min timeout; catches orphaned jobs
            await db.cotacao_jobs.update_one(
                {"_id": job_id},
                {"$set": {"status": "error", "error": "Processamento demorou demais. Esse PDF travou a leitura no servidor; converta para Excel (.xlsx) ou use um PDF menor."}},
            )
            raise HTTPException(500, "Processamento demorou demais. Esse PDF travou a leitura no servidor; converta para Excel (.xlsx) ou use um PDF menor.")
        return {"status": "processing", "progress": job.get("progress")}

    if job["status"] == "error":
        input_grid_id = job.get("input_grid_id")
        if input_grid_id:
            try:
                await _bucket().delete(input_grid_id)
            except Exception:
                pass
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
    input_grid_id = job.get("input_grid_id")
    if input_grid_id:
        try:
            await _bucket().delete(input_grid_id)
        except Exception:
            pass
    await db.cotacao_jobs.delete_one({"_id": job_id})

    return Response(
        content=resultado_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=tabela_com_prazos.xlsx"},
    )


@router.delete("/jobs/{job_id}")
async def cancelar_job_tabela_prazos(
    job_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    uid = await get_user_id(credentials)
    job = await db.cotacao_jobs.find_one({"_id": job_id, "user_id": uid})
    if not job:
        return {"status": "canceled"}

    await _cleanup_job_input(job)
    await _cleanup_job_output(job)

    if job.get("status") == "processing":
        await db.cotacao_jobs.update_one(
            {"_id": job_id, "user_id": uid},
            {"$set": {"status": "canceled", "canceled_at": datetime.now(timezone.utc)}},
        )
    else:
        await db.cotacao_jobs.delete_one({"_id": job_id, "user_id": uid})

    _running_job_ids.discard(job_id)
    return {"status": "canceled"}


class ConfirmarPayload(BaseModel):
    session_id: str
    aprovacoes: List[bool]  # um bool por item, na mesma ordem do preview
    precos_editados: List[float | None] | None = None


def _resultados_com_precos_editados(resultados, precos_editados):
    if not precos_editados:
        return [dict(res) for res in resultados]

    atualizados = []
    for res, preco_editado in zip(resultados, precos_editados):
        novo = dict(res)
        if preco_editado is not None and preco_editado > 0:
            novo["preco"] = float(preco_editado)
            if novo.get("tipo") is None:
                novo["tipo"] = "MANUAL"
        atualizados.append(novo)
    return atualizados


def _build_aprendizado_ops(uid, tabela_id, itens, resultados, aprovacoes, agora):
    ops = []
    for i, aprovado in enumerate(aprovacoes):
        item = itens[i]
        res = resultados[i]
        if res.get("preco") is None:
            continue
        if res.get("tipo") == "EAN":
            continue

        nome_norm = normalizar_nome(item["nome"])

        if aprovado:
            ops.append(UpdateOne(
                _aprendizado_key(uid, tabela_id, nome_norm),
                {"$set": {
                    "tabela_id": str(tabela_id),
                    "preco": res["preco"],
                    "confirmado": True,
                    "updated_at": agora,
                }},
                upsert=True,
            ))
        else:
            ops.append(UpdateOne(
                _aprendizado_key(uid, tabela_id, nome_norm),
                {"$set": {
                    "tabela_id": str(tabela_id),
                    "confirmado": False,
                    "updated_at": agora,
                }},
                upsert=True,
            ))
    return ops


async def _salvar_aprendizado_confirmacao(uid, tabela_id, itens, resultados, aprovacoes):
    try:
        ops = _build_aprendizado_ops(
            uid,
            tabela_id,
            itens,
            resultados,
            aprovacoes,
            datetime.now(timezone.utc),
        )
        if ops:
            await db.cotacao_aprendizado.bulk_write(ops, ordered=False)
    except Exception as e:
        logger.error(f"Erro ao salvar aprendizado em segundo plano: {e}")


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
    if payload.precos_editados is not None and len(payload.precos_editados) != len(itens):
        raise HTTPException(400, "Número de preços editados não corresponde ao número de itens.")

    resultados_confirmados = _resultados_com_precos_editados(
        resultados,
        payload.precos_editados,
    )

    # Gerar Excel com apenas items aprovados preenchidos
    resultados_filtrados = []
    for i, res in enumerate(resultados_confirmados):
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

    # Stats apenas dos aprovados
    stats = {"ean": 0, "descricao": 0, "ia": 0, "aprendido": 0, "sem_match": 0, "total": len(itens)}
    sem_match = []
    for item, res, aprovado in zip(itens, resultados_confirmados, payload.aprovacoes):
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

    task = asyncio.create_task(_salvar_aprendizado_confirmacao(
        uid,
        sessao["tabela_id"],
        itens,
        resultados_confirmados,
        payload.aprovacoes,
    ))
    _track_background_task(task)

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
    modo: str = "completo"
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
    modo = str(payload.modo or "completo").strip().lower()

    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(payload.tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela mestre não encontrada")

    grid_out = await _bucket().open_download_stream(doc["grid_id"])
    conteudo_mestre = await grid_out.read()

    tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_mestre.write(conteudo_mestre)
    tmp_mestre.close()

    try:
        prazo_efetivo = payload.prazo if payload.prazo > 0 else doc.get("prazo", 28)

        itens_para_match = [
            {"nome": it.nome, "ean": it.ean or "", "linha": it.idx}
            for it in payload.itens
            if not it.filled and it.nome
        ]

        if not itens_para_match:
            return {"precos": [], "stats": {"preenchidos": 0, "total": 0, "nao_encontrados": 0}}

        def _match_sync():
            pd, pl = ler_tabela_mestre(tmp_mestre.name, prazo=prazo_efetivo)
            return pd, pl, processar_cotacao_com_ia(itens_para_match, pd, pl, modo=modo)

        precos_dict, precos_lista, resultados = await asyncio.to_thread(_match_sync)

        aprendizado_map = {}
        if modo != "ean":
            nomes_norm = [normalizar_nome(it["nome"]) for it in itens_para_match]
            cursor = db.cotacao_aprendizado.find(_aprendizado_query(uid, payload.tabela_id, nomes_norm))
            aprendizado_map = {d["produto_cotacao_norm"]: d async for d in cursor}

        precos = []
        preenchidos = 0
        nao_encontrados = 0

        for i, item in enumerate(itens_para_match):
            res = resultados[i]
            if modo != "ean":
                learned = aprendizado_map.get(normalizar_nome(item["nome"]))
                if learned:
                    res["preco"] = learned["preco"]
                    res["tipo"] = "APRENDIDO"

            if res.get("preco") is not None:
                preco_str = f"{res['preco']:.2f}".replace(".", ",")
                precos.append({"idx": item["linha"], "price": preco_str})
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
