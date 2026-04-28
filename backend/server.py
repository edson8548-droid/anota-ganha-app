# Venpro API — backend/server.py

import os
import logging
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
# ... (restante dos imports) ...
from routes.mercadopago import router as mercadopago_router
from routes.mercadopago import setup_mercadopago, initialize_firebase
from routes.license import router as license_router
from routes.ia import router as ia_router
from routes.cotacao import router as cotacao_router, init_cotacao
from routes.whatsapp import router as whatsapp_router, init_whatsapp
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import asyncio
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)

# ==================== App ====================
app = FastAPI(
    title="Venpro API",
    description="API para ferramentas de representantes comerciais.",
    version="1.0.0",
)

# ========== Middleware de LOG do preflight ==========
class LogCorsPreflightMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method == "OPTIONS":
            logger.info(f"[CORS] Preflight received from {request.headers.get('origin')}")
        response = await call_next(request)
        return response

app.add_middleware(LogCorsPreflightMiddleware)

# ==================== CORS (Correção Final) ====================

# ⭐️ URLs PERMITIDAS HARDCODED ⭐️
origins = [
    "https://venpro.com.br",               # Domínio principal
    "https://www.venpro.com.br",           # Com www
    "https://anota-ganha-app.web.app",     # Firebase Hosting (backup)
    "https://anota-ganha-app.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,                  # Usamos a lista de origens específica
    allow_credentials=True,                 
    allow_methods=["*"],
    allow_headers=["*"],
)

# ... (Todo o código do servidor continua inalterado) ...

# ==================== Health ====================
@app.get("/")
async def root():
    return { "message": "Venpro API", "status": "running", "version": "1.0.0", "mercadopago": "enabled" }

@app.get("/health")
async def health_check():
    try:
        await db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

# ==================== MongoDB ====================
mongo_url = os.environ.get("MONGO_URL") or os.environ.get("DATABASE_URL")
if not mongo_url:
    logger.warning("MONGO_URL não configurada — rotas que usam MongoDB estarão indisponíveis")
    mongo_url = "mongodb://localhost:27017/dummy"

client = AsyncIOMotorClient(mongo_url, maxPoolSize=10, serverSelectionTimeoutMS=3000, connectTimeoutMS=5000, socketTimeoutMS=10000)
db = client[os.environ.get("DB_NAME", "anota_ganha_db")]

# (Restante do código omitido por brevidade, mas deve ser mantido)

# ==================== Routes Setup ====================
api_router = APIRouter(prefix="/api")

# ... (Todas as rotas de Auth, License, Admin, etc. são mantidas) ...

# ⭐⭐⭐ ADICIONAR ROTAS DO MERCADO PAGO ⭐⭐⭐
app.include_router(mercadopago_router, prefix="/api/mercadopago", tags=["Mercado Pago"])
app.include_router(license_router, prefix="/api/license", tags=["Licença"])
app.include_router(ia_router, prefix="/api/ia", tags=["Assistente IA"])
app.include_router(cotacao_router, prefix="/api/cotacao", tags=["Cotação"])
app.include_router(whatsapp_router, prefix="/api/whatsapp", tags=["WhatsApp"])

# ==================== Mount Router & Lifecycle ====================
app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    logger.info("App started")
    try:
        initialize_firebase()
        logger.info("✅ Firebase inicializado")
    except Exception as e:
        logger.error(f"⚠️  Firebase falhou ao inicializar: {e}")
    setup_mercadopago()
    init_cotacao(db)
    init_whatsapp(db)
    try:
        await db.cotacao_aprendizado.create_index(
            [("user_id", 1), ("produto_cotacao_norm", 1)],
            unique=True
        )
        await db.cotacao_sessoes.create_index(
            "created_at",
            expireAfterSeconds=86400
        )
        logger.info("✅ Índices MongoDB criados")
    except Exception as e:
        logger.warning(f"⚠️  Índices MongoDB: {e}")
    # Limpar jobs travados de restarts anteriores
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=30)
        result = await db.cotacao_jobs.update_many(
            {"status": "processing", "created_at": {"$lt": cutoff}},
            {"$set": {"status": "error", "error": "Servidor reiniciou durante o processamento. Tente novamente."}}
        )
        if result.modified_count:
            logger.info(f"✅ {result.modified_count} job(s) órfão(s) marcados como erro")
    except Exception as e:
        logger.warning(f"⚠️  Cleanup de jobs orphaned: {e}")
    logger.info("✅ Mercado Pago integrado em /api/mercadopago")
    logger.info("✅ Cotação integrado em /api/cotacao")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Mongo client closed")

# (Uvicorn Runner omitido)