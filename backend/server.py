# SUBSTITUA COMPLETAMENTE: backend/server.py
# CORRIGIDO: load_dotenv() movido para o topo

import os
import logging

# ⭐️ PASSO 1: Carregar .env ANTES de qualquer outro import ⭐️
from dotenv import load_dotenv
load_dotenv()

# ⭐️ PASSO 2: Agora importar o resto ⭐️
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt  # PyJWT
import asyncio

# ⭐️ PASSO 3: Importar a rota e a NOVA função de setup ⭐️
from routes.mercadopago import router as mercadopago_router
from routes.mercadopago import setup_mercadopago

# Opcional: SendGrid
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

# ==================== Logging ====================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ==================== App ====================
app = FastAPI(
    title="Anota & Ganha Incentivos API",
    description="API para gerenciamento de campanhas e clientes.",
    version="1.0.0",
)

# ... (Middleware de Log e CORS permanecem iguais) ...
class LogCorsPreflightMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method == "OPTIONS":
            origin = request.headers.get("origin")
            acrm = request.headers.get("access-control-request-method")
            acrh = request.headers.get("access-control-request-headers")
            logger.info(f"[CORS] Preflight -> origin={origin} method={acrm} headers={acrh} path={request.url.path}")
        response = await call_next(request)
        if request.method == "OPTIONS":
            logger.info(
                "[CORS] Resposta preflight -> "
                f"allow-origin={response.headers.get('access-control-allow-origin')} "
                f"allow-credentials={response.headers.get('access-control-allow-credentials')} "
                f"allow-methods={response.headers.get('access-control-allow-methods')} "
                f"allow-headers={response.headers.get('access-control-allow-headers')}"
            )
        return response
app.add_middleware(LogCorsPreflightMiddleware)

origins = [
    "https://anota-ganha-app.vercel.app",  # produção (Vercel)
    "http://localhost:3000",               # dev React
    "http://localhost:5173",               # Vite
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== Health ====================
@app.get("/")
async def root():
    return { "message": "Anota Ganha API", "status": "running", "version": "1.0.0", "mercadopago": "enabled" }

# ==================== MongoDB ====================
# ⭐️ PASSO 4: Esta verificação agora vai funcionar ⭐️
mongo_url = os.environ.get("MONGO_URL") or os.environ.get("DATABASE_URL")
if not mongo_url:
    logger.error("MONGO_URL ou DATABASE_URL não configurada no .env!")
    raise ValueError("MONGO_URL ou DATABASE_URL não configurada no ambiente.")
else:
    logger.info("✅ MONGO_URL carregada com sucesso.")

client = AsyncIOMotorClient(
    mongo_url, maxPoolSize=50, minPoolSize=10,
    serverSelectionTimeoutMS=5000, connectTimeoutMS=10000, socketTimeoutMS=30000,
    retryWrites=True, retryReads=True,
)
db = client[os.environ.get("DB_NAME", "anota_ganha_db")]

@app.get("/health")
async def health_check():
    try:
        await db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

# ... (Models, Auth Config, Utility Functions, Rotas de Auth, License, Admin, etc. - tudo igual) ...
# (O código do utilizador de User, Campaign, Client, hash_password, get_current_user, etc. é omitido por brevidade, mas está aqui)
# ==================== Auth Config ====================
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
security = HTTPBearer()

# ==================== Models ====================
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str; name: Optional[str] = ""; cpf: Optional[str] = ""; phone: Optional[str] = ""
    role: str = "user"; license_type: str = "trial"; license_plan: Optional[str] = None
    license_expiry: Optional[datetime] = None; trial_started: Optional[datetime] = None
    payment_method: Optional[str] = None; last_payment_date: Optional[datetime] = None
    subscription_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class UserCreate(BaseModel):
    email: str; name: Optional[str] = ""; password: str
    cpf: Optional[str] = ""; phone: Optional[str] = ""
class UserLogin(BaseModel):
    email: str; password: str
class Token(BaseModel):
    access_token: str; token_type: str; user: User
class Industry(BaseModel):
    name: str; goal: float = 0.0; products: List[str] = []
class Campaign(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4())); user_id: str; name: str
    start_date: datetime; end_date: Optional[datetime] = None; status: str = "active"
    industries: List[Industry] = []; product_goals: Optional[Dict[str, float]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class CampaignCreate(BaseModel):
    name: str; start_date: datetime; end_date: Optional[datetime] = None
    industries: List[Industry] = []; product_goals: Optional[Dict[str, float]] = None
class CampaignUpdate(BaseModel):
    name: Optional[str] = None; start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None; status: Optional[str] = None
    industries: Optional[List[Industry]] = None; product_goals: Optional[Dict[str, float]] = None
class Sheet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4())); user_id: str; campaign_id: str
    name: str; icon: str = "Building"; headers: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class SheetCreate(BaseModel):
    campaign_id: str; name: str; icon: str = "Building"; headers: List[str] = []
class SheetUpdate(BaseModel):
    name: Optional[str] = None; icon: Optional[str] = None; headers: Optional[List[str]] = None
class ClientWithIndustry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4())); user_id: str; campaign_id: str
    sheet_id: Optional[str] = None; name: str; cnpj: Optional[str] = ""; city: Optional[str] = ""
    state: Optional[str] = ""; address: Optional[str] = ""; phone: Optional[str] = ""
    email: Optional[str] = ""; notes: Optional[str] = ""; industries: Optional[Dict[str, Any]] = None
    products: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class ClientCreate(BaseModel):
    campaign_id: str; sheet_id: Optional[str] = None; name: str; cnpj: Optional[str] = ""
    city: Optional[str] = ""; state: Optional[str] = ""; address: Optional[str] = ""
    phone: Optional[str] = ""; email: Optional[str] = ""; notes: Optional[str] = ""
    industries: Optional[Dict[str, Any]] = None; products: Optional[Dict[str, Any]] = None
class ClientUpdate(BaseModel):
    name: Optional[str] = None; cnpj: Optional[str] = None; city: Optional[str] = None
    state: Optional[str] = None; address: Optional[str] = None; phone: Optional[str] = None
    email: Optional[str] = None; notes: Optional[str] = None
    industries: Optional[Dict[str, Any]] = None; products: Optional[Dict[str, Any]] = None

# ==================== Utility Functions ====================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id: raise HTTPException(status_code=401, detail="Token inválido")
    except jwt.ExpiredSignatureError: raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError: raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user: raise HTTPException(status_code=401, detail="Usuário não encontrado")
    for k in ("created_at", "trial_started", "license_expiry", "last_payment_date"):
        if isinstance(user.get(k), str): user[k] = datetime.fromisoformat(user[k])
    return user
def send_password_reset_email(email: str, reset_token: str):
    sendgrid_api_key = os.environ.get("SENDGRID_API_KEY")
    from_email = os.environ.get("FROM_EMAIL", "noreply@anotaganha.com")
    if not sendgrid_api_key or not from_email:
        logger.warning("SENDGRID_API_KEY ou FROM_EMAIL não configurados. Email de reset não será enviado.")
        return
    sg = SendGridAPIClient(sendgrid_api_key)
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    message = Mail(
        from_email=from_email, to_emails=email, subject="Recuperação de Senha - Anota & Ganha",
        html_content=f"<p>Olá,</p><p>Clique no link para definir uma nova senha:</p><p><a href='{reset_link}'>{reset_link}</a></p><p>Válido por 1 hora.</p>"
    )
    try:
        sg.send(message); logger.info(f"Email de recuperação enviado para {email}")
    except Exception as e: logger.error(f"Erro ao enviar email: {e}")

# ==================== Routes Setup ====================
api_router = APIRouter(prefix="/api")

# ==================== Auth Endpoints ====================
@api_router.post("/auth/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing: raise HTTPException(status_code=400, detail="Email já cadastrado")
    hashed = hash_password(user_data.password)
    trial_days = 15; trial_started = datetime.now(timezone.utc)
    trial_expiry = trial_started + timedelta(days=trial_days)
    user = User(
        email=user_data.email, name=user_data.name or user_data.email.split("@")[0],
        cpf=user_data.cpf or "", phone=user_data.phone or "", role="user",
        license_type="trial", license_plan=None, license_expiry=trial_expiry,
        trial_started=trial_started, created_at=datetime.now(timezone.utc),
    )
    user_dict = user.model_dump()
    user_dict["password_hash"] = hashed
    for k in ("created_at", "trial_started", "license_expiry"):
        if user_dict[k]: user_dict[k] = user_dict[k].isoformat()
    result = await db.users.insert_one(user_dict)
    if not result.inserted_id: raise HTTPException(status_code=500, detail="Erro ao cadastrar usuário")
    logger.info(f"Novo usuário registrado: {user.email} - ID: {user.id}")
    access_token = create_access_token({"sub": user.id})
    return Token(access_token=access_token, token_type="bearer", user=user)

@api_router.post("/auth/login", response_model=Token)
async def login(creds: UserLogin):
    user_doc = await db.users.find_one({"email": creds.email})
    if not user_doc or not verify_password(creds.password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    for k in ("created_at", "trial_started", "license_expiry", "last_payment_date"):
        if isinstance(user_doc.get(k), str): user_doc[k] = datetime.fromisoformat(user_doc[k])
    user = User(**{k: v for k, v in user_doc.items() if k != "password_hash" and k != "_id"})
    access_token = create_access_token({"sub": user.id})
    return Token(access_token=access_token, token_type="bearer", user=user)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    return User(**current_user)

@api_router.post("/auth/forgot-password")
async def forgot_password(email_body: dict):
    email = email_body.get("email");
    if not email: raise HTTPException(status_code=400, detail="Email é obrigatório")
    user = await db.users.find_one({"email": email})
    if not user: return {"message": "Se o email existir, você receberá um link de recuperação"}
    reset_token = str(uuid.uuid4()); reset_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.users.update_one({"email": email}, {"$set": {"reset_token": reset_token, "reset_token_expiry": reset_expiry.isoformat()}})
    send_password_reset_email(email, reset_token)
    return {"message": "Se o email existir, você receberá um link de recuperação"}

@api_router.post("/auth/reset-password")
async def reset_password(body: dict):
    reset_token = body.get("token"); new_password = body.get("password")
    if not reset_token or not new_password: raise HTTPException(status_code=400, detail="Token e nova senha são obrigatórios")
    user = await db.users.find_one({"reset_token": reset_token})
    if not user: raise HTTPException(status_code=400, detail="Token inválido")
    expiry = user.get("reset_token_expiry")
    if isinstance(expiry, str): expiry = datetime.fromisoformat(expiry)
    if not expiry or datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo link")
    new_hash = hash_password(new_password)
    await db.users.update_one({"reset_token": reset_token}, {"$set": {"password_hash": new_hash, "reset_token": None, "reset_token_expiry": None}})
    return {"message": "Senha alterada com sucesso!"}

# ==================== License ====================
@api_router.get("/plans")
async def get_plans():
    return { "plans": [
            { "id": "monthly", "name": "Mensal", "price": 39.00, "currency": "BRL", "interval": "month", "features": ["Tudo ilimitado", "Suporte completo", "Analytics"], },
            { "id": "annual_installments", "name": "Anual Parcelado", "price": 394.80, "installments": 12, "monthly_price": 32.90, "savings": 73.20, "currency": "BRL", "interval": "year", "features": ["Tudo ilimitado", "Suporte completo", "Analytics", "Economia de R$ 73,20/ano"], "highlight": True, },
            { "id": "annual_upfront", "name": "Anual à Vista", "price": 360.00, "savings": 108.00, "currency": "BRL", "interval": "year", "features": ["Tudo ilimitado", "Suporte completo", "Analytics", "Economia de R$ 108,00/ano"], },
        ] }
# ... (Restante das rotas de /license, /admin, /migrate) ...


# ⭐⭐⭐ ADICIONAR ROTAS DO MERCADO PAGO ⭐⭐⭐
app.include_router(mercadopago_router, prefix="/api/mercadopago", tags=["Mercado Pago"])

# ==================== Mount Router & Lifecycle ====================
app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    logger.info("App started")
    # ⭐️ PASSO 5: Chamar a função de setup do MP ⭐️
    setup_mercadopago()
    logger.info("✅ Mercado Pago integrado em /api/mercadopago")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Mongo client closed")

# ==================== Uvicorn Runner (para dev) ====================
if __name__ == "__main__":
    import uvicorn
    port_str = os.environ.get("PORT", "8000")
    try:
        PORT = int(port_str)
    except ValueError:
        logger.warning(f"PORTA inválida '{port_str}', usando padrão 5000.")
        PORT = 5000
    
    # ⭐️ Corrigido para usar a porta correta do .env ⭐️
    logger.info(f"🚀 Iniciando servidor Uvicorn em http://localhost:{PORT}")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=True)