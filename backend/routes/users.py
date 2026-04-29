"""
Rotas de perfil de usuário — avatar via MongoDB GridFS.
"""
import io
import re
import asyncio
import logging
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from firebase_admin import auth as firebase_auth, firestore
from bson import ObjectId

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

_db = None


def init_users(database):
    global _db
    _db = database


def _gridfs():
    return AsyncIOMotorGridFSBucket(_db, bucket_name="user_avatars")


async def get_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials:
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, credentials.credentials)
        return decoded['uid']
    except Exception:
        raise HTTPException(401, "Token inválido")


def _fs():
    return firestore.client()


@router.get("/avatars/{grid_id}")
async def servir_avatar(grid_id: str):
    """Serve avatar público via GridFS."""
    try:
        grid_out = await _gridfs().open_download_stream(ObjectId(grid_id))
        content_type = (grid_out.metadata or {}).get("content_type", "image/jpeg")
        return StreamingResponse(grid_out, media_type=content_type)
    except Exception:
        raise HTTPException(404, "Avatar não encontrado")


@router.post("/avatar")
async def upload_avatar(
    arquivo: UploadFile = File(...),
    uid: str = Depends(get_user_id),
):
    """Upload de foto de perfil — substitui a anterior automaticamente."""
    allowed = ('image/jpeg', 'image/png', 'image/webp')
    if arquivo.content_type not in allowed:
        raise HTTPException(400, f"Tipo não permitido: {arquivo.content_type}")

    content = await arquivo.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Imagem muito grande. Máximo 5 MB")

    # Apaga avatar antigo se estava no nosso GridFS
    def _get_old():
        doc = _fs().collection('users').document(uid).get()
        return doc.to_dict() if doc.exists else {}

    user_data = await asyncio.to_thread(_get_old)
    old_url = user_data.get('photoURL', '')
    if old_url and '/api/users/avatars/' in old_url:
        try:
            old_grid_id = old_url.split('/avatars/')[-1].split('?')[0]
            await _gridfs().delete(ObjectId(old_grid_id))
        except Exception:
            pass

    safe = re.sub(r'[^a-zA-Z0-9._-]', '_', arquivo.filename or 'avatar.jpg')
    grid_id = await _gridfs().upload_from_stream(
        f"avatar_{uid}_{safe}",
        io.BytesIO(content),
        metadata={"content_type": arquivo.content_type, "uid": uid},
    )

    photo_url = f"https://api.venpro.com.br/api/users/avatars/{grid_id}"

    def _save():
        _fs().collection('users').document(uid).set(
            {'photoURL': photo_url, 'updated_at': firestore.SERVER_TIMESTAMP},
            merge=True,
        )
    await asyncio.to_thread(_save)

    return {"photoURL": photo_url}
