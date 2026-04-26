"""
Rotas do Robo de Cotacao — CRUD de tabelas mestre + processamento.
"""

import os
import json
import tempfile
import logging
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
import firebase_admin
from firebase_admin import auth as firebase_auth
import gridfs  # vem com pymongo

from services.excel_processor import (
    ler_tabela_mestre,
    ler_cotacao,
    gerar_excel_resultado,
    processar_arquivo_cotacao,
    gerar_excel_multiprazos,
)

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

db = None
fs = None

MAX_TABELAS = 5


def init_cotacao(database):
    global db, fs
    db = database
    fs = gridfs.GridFS(db)


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
    prazo: int = Form(28),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    uid = await get_user_id(credentials)
    collection = db.tabelas_mestre

    count = await collection.count_documents({"user_id": uid})
    if count >= MAX_TABELAS:
        raise HTTPException(400, f"Máximo de {MAX_TABELAS} tabelas permitidas")

    conteudo = await arquivo.read()
    grid_id = fs.put(conteudo, filename=arquivo.filename, content_type=arquivo.content_type)

    # Contar produtos
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp.write(conteudo)
    tmp.close()

    try:
        precos_dict, precos_lista = ler_tabela_mestre(tmp.name, prazo=prazo)
        qtd = len(precos_lista)
    except Exception as e:
        os.unlink(tmp.name)
        fs.delete(grid_id)
        raise HTTPException(400, f"Erro ao ler tabela: {str(e)}")
    finally:
        os.unlink(tmp.name)

    doc = {
        "user_id": uid,
        "nome": nome,
        "filename": arquivo.filename,
        "grid_id": grid_id,
        "prazo": prazo,
        "qtd_produtos": qtd,
        "data_upload": datetime.now(timezone.utc),
    }
    result = await collection.insert_one(doc)

    return {
        "id": str(result.inserted_id),
        "nome": nome,
        "qtd_produtos": qtd,
        "data_upload": doc["data_upload"].isoformat(),
    }


@router.get("/tabelas")
async def listar_tabelas(credentials: HTTPAuthorizationCredentials = Depends(security)):
    uid = await get_user_id(credentials)
    collection = db.tabelas_mestre
    tabelas = []
    async for doc in collection.find({"user_id": uid}).sort("data_upload", -1):
        tabelas.append({
            "id": str(doc["_id"]),
            "nome": doc["nome"],
            "filename": doc["filename"],
            "qtd_produtos": doc["qtd_produtos"],
            "prazo": doc.get("prazo", 28),
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
    fs.delete(doc["grid_id"])
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
    grid_file = fs.get(doc["grid_id"])
    conteudo_mestre = grid_file.read()
    tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_mestre.write(conteudo_mestre)
    tmp_mestre.close()

    # Salvar cotacao
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

        os.unlink(tmp_mestre.name)
        os.unlink(tmp_cotacao.name)
        os.unlink(caminho_resultado)

    except Exception as e:
        for p in [tmp_mestre.name, tmp_cotacao.name]:
            try:
                os.unlink(p)
            except OSError:
                pass
        logger.error(f"Erro ao processar cotação: {e}")
        raise HTTPException(500, f"Erro ao processar: {str(e)}")

    return Response(
        content=resultado_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=cotacao_preenchida.xlsx",
            "X-Stats": json.dumps(stats),
            "X-Sem-Match": json.dumps(sem_match[:50]),
        }
    )


@router.post("/gerar-tabela-prazos")
async def gerar_tabela_prazos(
    arquivo: UploadFile = File(...),
    pct_7: float = Form(0.0),
    pct_14: float = Form(0.0),
    pct_21: float = Form(0.0),
    pct_28: float = Form(0.0),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    await get_user_id(credentials)

    conteudo = await arquivo.read()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp.write(conteudo)
    tmp.close()

    try:
        resultado_path = gerar_excel_multiprazos(tmp.name, {
            7: pct_7,
            14: pct_14,
            21: pct_21,
            28: pct_28,
        })
        with open(resultado_path, "rb") as f:
            resultado_bytes = f.read()
        os.unlink(resultado_path)
    except Exception as e:
        logger.error(f"Erro ao gerar tabela com prazos: {e}")
        raise HTTPException(500, f"Erro ao gerar tabela: {str(e)}")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    return Response(
        content=resultado_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=tabela_com_prazos.xlsx",
        }
    )
