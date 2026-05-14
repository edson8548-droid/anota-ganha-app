# Venpro API — backend/server.py

import os
import logging
import time
from collections import defaultdict, deque
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from services.security_audit import audit_event
from services.security_config import PRODUCTION_CORS_ORIGINS, parse_cors_origins
from services.security_headers import SecurityHeadersMiddleware
# ... (restante dos imports) ...
from routes.mercadopago import router as mercadopago_router
from routes.mercadopago import setup_mercadopago, initialize_firebase
from routes.asaas import router as asaas_router
from routes.license import router as license_router
from routes.ia import router as ia_router
from routes.cotacao import router as cotacao_router, init_cotacao, resume_cotacao_jobs
from routes.whatsapp import router as whatsapp_router, init_whatsapp
from routes.users import router as users_router, init_users
from routes.vitrine import router as vitrine_router, init_vitrine
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import uuid
from datetime import datetime, timezone
import bcrypt
import jwt
import asyncio
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)
BUILD_VERSION = "pdf-text-first-1fd20db"
BUILD_COMMIT = os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("GIT_COMMIT") or "local"

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

app.add_middleware(SecurityHeadersMiddleware)


class SecurityAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/") and response.status_code in {401, 403, 429}:
            await audit_event(
                "api_request_blocked",
                status="blocked",
                metadata={"statusCode": response.status_code},
                request=request,
            )
        return response


app.add_middleware(SecurityAuditMiddleware)

# ========== Rate limit simples por IP ==========
class SimpleRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, enabled=True):
        super().__init__(app)
        self.enabled = enabled
        self.requests = defaultdict(deque)

    def _client_ip(self, request):
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"

    def _rate_config_for_path(self, path):
        if path in {"/", "/health"}:
            return None
        if path == "/api/mercadopago/webhook":
            return (300, 60, "/api/mercadopago/webhook")
        if path == "/api/asaas/webhook":
            return (300, 60, "/api/asaas/webhook")
        if path == "/api/license/validate":
            return (30, 60, "/api/license/validate")
        if path.startswith("/api/vitrine/publica/"):
            return (180, 60, "/api/vitrine/publica")
        if path.startswith("/api/vitrine/imagens/") or path.startswith("/api/whatsapp/fotos/") or path.startswith("/api/users/avatars/"):
            return (300, 60, "/api/public-images")
        if path.startswith("/api/"):
            return (900, 60, "/api")
        return None

    async def dispatch(self, request, call_next):
        if not self.enabled or request.method == "OPTIONS":
            return await call_next(request)

        limit_config = self._rate_config_for_path(request.url.path)
        if not limit_config:
            return await call_next(request)

        max_requests, window_seconds, bucket = limit_config
        now = time.monotonic()
        key = f"{self._client_ip(request)}:{bucket}"
        timestamps = self.requests[key]

        while timestamps and now - timestamps[0] > window_seconds:
            timestamps.popleft()

        if len(timestamps) >= max_requests:
            retry_after = max(1, int(window_seconds - (now - timestamps[0])))
            logger.warning(
                "[SECURITY] rate_limit_exceeded ip=%s bucket=%s path=%s limit=%s/%ss retry_after=%ss",
                self._client_ip(request),
                bucket,
                request.url.path,
                max_requests,
                window_seconds,
                retry_after,
            )
            return JSONResponse(
                status_code=429,
                content={"detail": "Muitas tentativas. Aguarde um pouco e tente novamente."},
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)
        return await call_next(request)


rate_limit_enabled = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() != "false"
app.add_middleware(SimpleRateLimitMiddleware, enabled=rate_limit_enabled)

# ==================== CORS ====================
origins = parse_cors_origins()

logger.info("[CORS] Origens permitidas: %s", ", ".join(origins))

# Origens esperadas para produção. Se faltar alguma, o log avisa antes de quebrar fluxo.
for expected_origin in PRODUCTION_CORS_ORIGINS:
    if expected_origin not in origins:
        logger.warning("[CORS] Origem de produção ausente em CORS_ORIGINS: %s", expected_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,                 
    allow_methods=["*"],
    allow_headers=["*"],
)

# ... (Todo o código do servidor continua inalterado) ...

# ==================== Health ====================
@app.get("/")
async def root():
    return {
        "message": "Venpro API",
        "status": "running",
        "version": "1.0.0",
        "build": BUILD_VERSION,
        "commit": BUILD_COMMIT[:12],
        "payments": ["asaas", "mercadopago"],
    }

@app.get("/health")
async def health_check():
    try:
        await db.command("ping")
        return {
            "status": "healthy",
            "database": "connected",
            "build": BUILD_VERSION,
            "commit": BUILD_COMMIT[:12],
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "build": BUILD_VERSION,
            "commit": BUILD_COMMIT[:12],
            "error": str(e),
        }

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
app.include_router(asaas_router, prefix="/api/asaas", tags=["Asaas"])
app.include_router(license_router, prefix="/api/license", tags=["Licença"])
app.include_router(ia_router, prefix="/api/ia", tags=["Assistente IA"])
app.include_router(cotacao_router, prefix="/api/cotacao", tags=["Cotação"])
app.include_router(whatsapp_router, prefix="/api/whatsapp", tags=["WhatsApp"])
app.include_router(users_router, prefix="/api/users", tags=["Usuários"])
app.include_router(vitrine_router, prefix="/api/vitrine", tags=["Vitrine"])

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
    init_users(db)
    init_vitrine(db)
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
    # Retomar jobs de tabela de prazos após restart do servidor
    try:
        await resume_cotacao_jobs()
    except Exception as e:
        logger.warning(f"⚠️  Retomada de jobs de cotação: {e}")
    logger.info("✅ Mercado Pago integrado em /api/mercadopago")
    logger.info("✅ Asaas integrado em /api/asaas")
    logger.info("✅ Cotação integrado em /api/cotacao")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Mongo client closed")

# (Uvicorn Runner omitido)
