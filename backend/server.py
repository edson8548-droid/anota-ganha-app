# SUBSTITUA: backend/server.py
# CORRIGIDO: CORS hardcoded para garantir que o Railway o aplica

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
from routes.mercadopago import setup_mercadopago
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
    title="Anota & Ganha Incentivos API",
    description="API para gerenciamento de campanhas e clientes.",
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
    "https://anota-ganha-app.web.app",      # Produção (Firebase Hosting)
    "https://anota-ganha-app.firebaseapp.com", # Domínio de backup do Firebase
    "http://localhost:3000",                # Desenvolvimento local
    "http://localhost:5173",                # Vite
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
    return { "message": "Anota Ganha API", "status": "running", "version": "1.0.0", "mercadopago": "enabled" }

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
    logger.error("MONGO_URL ou DATABASE_URL não configurada no ambiente.")
    raise ValueError("MONGO_URL ou DATABASE_URL não configurada no ambiente.")

client = AsyncIOMotorClient(mongo_url, maxPoolSize=50, minPoolSize=10, serverSelectionTimeoutMS=5000, connectTimeoutMS=10000, socketTimeoutMS=30000, retryWrites=True, retryReads=True)
db = client[os.environ.get("DB_NAME", "anota_ganha_db")]

# (Restante do código omitido por brevidade, mas deve ser mantido)

# ==================== Routes Setup ====================
api_router = APIRouter(prefix="/api")

# ... (Todas as rotas de Auth, License, Admin, etc. são mantidas) ...

# ⭐⭐⭐ ADICIONAR ROTAS DO MERCADO PAGO ⭐⭐⭐
app.include_router(mercadopago_router, prefix="/api/mercadopago", tags=["Mercado Pago"])

# ==================== Mount Router & Lifecycle ====================
app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    logger.info("App started")
    setup_mercadopago()
    logger.info("✅ Mercado Pago integrado em /api/mercadopago")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Mongo client closed")

# (Uvicorn Runner omitido)