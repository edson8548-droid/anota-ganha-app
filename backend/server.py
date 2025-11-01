# server.py

from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

import os
import logging
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt  # PyJWT
import asyncio

# Opcional: SendGrid (deixe se já usa)
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

# ==================== Env & Logging ====================

load_dotenv()

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

# ========== Middleware de LOG do preflight (colocar ANTES do CORS) ==========
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

# ==================== CORS ====================

origins = [
    "https://anota-ganha-app.vercel.app",  # produção (Vercel)
    "http://localhost:3000",               # dev
    "http://localhost:5173",               # Vite
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,      # usar origens explícitas quando allow_credentials=True
    allow_credentials=True,     # cookies/Authorization
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== Health ====================

@app.get("/")
async def root():
    return {"message": "Anota Ganha API", "status": "running", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    try:
        await db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

@app.head("/health")
async def health_head():
    return {"status": "healthy"}

# ==================== MongoDB ====================

mongo_url = os.environ.get("MONGO_URL")
if not mongo_url:
    logger.error("MONGO_URL não configurada!")
    raise ValueError("MONGO_URL não configurada no ambiente.")

client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=50,
    minPoolSize=10,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=10000,
    socketTimeoutMS=30000,
    retryWrites=True,
    retryReads=True,
)
db = client[os.environ.get("DB_NAME", "anota_ganha_db")]

async def safe_db_operation(operation, timeout=30):
    try:
        return await asyncio.wait_for(operation, timeout=timeout)
    except asyncio.TimeoutError:
        logger.error(f"Database operation timed out after {timeout}s")
        raise HTTPException(status_code=504, detail="Database operation timed out")
    except Exception as e:
        logger.error(f"Database operation failed: {e}")
        raise HTTPException(status_code=500, detail="Database error")

# ==================== Auth Config ====================

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 dias

security = HTTPBearer()

# ==================== Models ====================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: Optional[str] = ""
    cpf: Optional[str] = ""
    phone: Optional[str] = ""
    role: str = "user"  # user, admin
    license_type: str = "trial"  # trial, monthly, annual, expired
    license_plan: Optional[str] = None
    license_expiry: Optional[datetime] = None
    trial_started: Optional[datetime] = None
    payment_method: Optional[str] = None
    last_payment_date: Optional[datetime] = None
    subscription_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: str
    name: Optional[str] = ""
    password: str
    cpf: Optional[str] = ""
    phone: Optional[str] = ""

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class Industry(BaseModel):
    name: str
    goal: float = 0.0
    products: List[str] = []

class Campaign(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    start_date: datetime
    end_date: Optional[datetime] = None
    status: str = "active"
    industries: List[Industry] = []
    product_goals: Optional[Dict[str, float]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CampaignCreate(BaseModel):
    name: str
    start_date: datetime
    end_date: Optional[datetime] = None
    industries: List[Industry] = []
    product_goals: Optional[Dict[str, float]] = None

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    industries: Optional[List[Industry]] = None
    product_goals: Optional[Dict[str, float]] = None

class Sheet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    campaign_id: str
    name: str
    icon: str = "Building"
    headers: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SheetCreate(BaseModel):
    campaign_id: str
    name: str
    icon: str = "Building"
    headers: List[str] = []

class SheetUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    headers: Optional[List[str]] = None

class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    sheet_id: str
    campaign_id: str
    CLIENTE: str
    CNPJ: Optional[str] = ""
    ENDERECO: Optional[str] = ""
    CIDADE: Optional[str] = ""
    BAIRRO: Optional[str] = ""
    industries: Dict[str, Dict[str, Any]] = {}
    products: Optional[Dict[str, Dict[str, Any]]] = None
    notes: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ClientCreate(BaseModel):
    sheet_id: str
    campaign_id: str
    CLIENTE: str
    CNPJ: Optional[str] = ""
    ENDERECO: Optional[str] = ""
    CIDADE: Optional[str] = ""
    BAIRRO: Optional[str] = ""
    industries: Dict[str, Dict[str, Any]] = {}
    products: Optional[Dict[str, Dict[str, Any]]] = None
    notes: Optional[str] = ""

class ClientUpdate(BaseModel):
    CLIENTE: Optional[str] = None
    CNPJ: Optional[str] = None
    ENDERECO: Optional[str] = None
    CIDADE: Optional[str] = None
    BAIRRO: Optional[str] = None
    industries: Optional[Dict[str, Dict[str, Any]]] = None
    products: Optional[Dict[str, Dict[str, Any]]] = None
    notes: Optional[str] = None

# ==================== Auth Helpers ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        # Corrigido para PyJWT (InvalidTokenError em vez de JWTError)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# ==================== Email (Reset Password) ====================

def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    try:
        api_key = os.environ.get("SENDGRID_API_KEY")
        sender = os.environ.get("SENDER_EMAIL")
        if not api_key or not sender:
            logger.warning("SendGrid not configured; skipping email")
            return False
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
        reset_link = f"{frontend_url}/reset-password?token={reset_token}"
        html_content = f"""
        <h2>Recuperação de Senha</h2>
        <p>Clique no botão abaixo para redefinir sua senha:</p>
        <p><a href="{reset_link}">Redefinir Senha</a></p>
        <p>Este link é válido por 1 hora.</p>
        """
        sg = SendGridAPIClient(api_key)
        message = Mail(from_email=sender, to_emails=to_email,
                       subject="Recuperação de Senha - Anota & Ganha Incentivos",
                       html_content=html_content)
        resp = sg.send(message)
        return resp.status_code in (200, 202)
    except Exception as e:
        logger.error(f"Erro ao enviar email de recuperação: {e}")
        return False

# ==================== Routes: Auth ====================

api_router = APIRouter(prefix="/api")

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já está em uso")

    is_admin = user_data.email == os.environ.get("ADMIN_EMAIL", "edson854_8@hotmail.com")

    trial_start = datetime.now(timezone.utc)
    trial_end = trial_start + timedelta(days=15)

    user_obj = User(
        email=user_data.email,
        name=user_data.name or user_data.email.split("@")[0],
        cpf="",
        phone="",
        role="admin" if is_admin else "user",
        license_type="annual" if is_admin else "trial",
        trial_started=None if is_admin else trial_start,
        license_expiry=None if is_admin else trial_end,
    )

    user_dict = user_obj.model_dump()
    user_dict["password_hash"] = hash_password(user_data.password)
    # Persistir datetimes como ISO strings
    for k in ("created_at", "trial_started", "license_expiry"):
        if user_dict.get(k):
            user_dict[k] = user_dict[k].isoformat()

    await db.users.insert_one(user_dict)

    access_token = create_access_token({"sub": user_obj.id})
    return Token(access_token=access_token, token_type="bearer", user=user_obj)

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    user = await db.users.find_one({"email": user_data.email})
    if not user or not verify_password(user_data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")

    if user.get("role") != "admin":
        license_expiry = user.get("license_expiry")
        if isinstance(license_expiry, str):
            license_expiry = datetime.fromisoformat(license_expiry)
        if license_expiry and datetime.now(timezone.utc) > license_expiry:
            if user.get("license_type") not in ["monthly", "annual"]:
                await db.users.update_one({"email": user_data.email}, {"$set": {"license_type": "expired"}})
                raise HTTPException(status_code=403, detail="Seu período de teste expirou. Escolha um plano para continuar usando.")

    # Convert back for response model
    for k in ("created_at", "trial_started", "license_expiry", "last_payment_date"):
        if isinstance(user.get(k), str):
            user[k] = datetime.fromisoformat(user[k])

    user_obj = User(**user)
    access_token = create_access_token({"sub": user_obj.id})
    return Token(access_token=access_token, token_type="bearer", user=user_obj)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    for k in ("created_at", "trial_started", "license_expiry", "last_payment_date"):
        if isinstance(current_user.get(k), str):
            current_user[k] = datetime.fromisoformat(current_user[k])
    return User(**current_user)

@api_router.post("/auth/forgot-password")
async def forgot_password(email: str):
    user = await db.users.find_one({"email": email})
    if not user:
        return {"message": "Se o email existir, você receberá um link de recuperação"}

    reset_token = str(uuid.uuid4())
    reset_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.users.update_one(
        {"email": email},
        {"$set": {"reset_token": reset_token, "reset_token_expiry": reset_expiry.isoformat()}},
    )
    send_password_reset_email(email, reset_token)
    return {"message": "Se o email existir, você receberá um link de recuperação"}

@api_router.post("/auth/reset-password")
async def reset_password(reset_token: str, new_password: str):
    user = await db.users.find_one({"reset_token": reset_token})
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido")
    expiry = user.get("reset_token_expiry")
    if isinstance(expiry, str):
        expiry = datetime.fromisoformat(expiry)
    if not expiry or datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo link")

    new_hash = hash_password(new_password)
    await db.users.update_one(
        {"reset_token": reset_token},
        {"$set": {"password_hash": new_hash, "reset_token": None, "reset_token_expiry": None}},
    )
    return {"message": "Senha alterada com sucesso!"}

# ==================== License ====================

@api_router.get("/plans")
async def get_plans():
    return {
        "plans": [
            {
                "id": "monthly_30",
                "name": "Mensal",
                "price": 30.00,
                "currency": "BRL",
                "interval": "month",
                "interval_count": 1,
                "features": [
                    "Campanhas ilimitadas",
                    "Clientes ilimitados",
                    "Relatórios por cidade",
                    "Suporte via email",
                ],
            },
            {
                "id": "annual_300",
                "name": "Anual",
                "price": 300.00,
                "original_price": 360.00,
                "discount": 60.00,
                "discount_percent": 16.67,
                "currency": "BRL",
                "interval": "year",
                "interval_count": 1,
                "features": [
                    "Campanhas ilimitadas",
                    "Clientes ilimitados",
                    "Relatórios por cidade",
                    "Suporte prioritário",
                    "Economia de R$ 60,00/ano",
                ],
                "highlight": True,
            },
        ]
    }

@api_router.post("/license/activate")
async def activate_license(license_key: str, current_user: dict = Depends(get_current_user)):
    is_monthly = license_key.startswith("MONTHLY-")
    is_annual = license_key.startswith("ANNUAL-")
    if not (is_monthly or is_annual):
        raise HTTPException(status_code=400, detail="Chave de licença inválida")

    existing = await db.users.find_one({"license_key": license_key})
    if existing and existing["id"] != current_user["id"]:
        raise HTTPException(status_code=400, detail="Esta chave já foi utilizada")

    if is_monthly:
        expiry = datetime.now(timezone.utc) + timedelta(days=30)
        license_type = "monthly"
        license_plan = "monthly_30"
    else:
        expiry = datetime.now(timezone.utc) + timedelta(days=365)
        license_type = "annual"
        license_plan = "annual_300"

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "license_type": license_type,
            "license_plan": license_plan,
            "license_key": license_key,
            "license_expiry": expiry.isoformat(),
            "last_payment_date": datetime.now(timezone.utc).isoformat(),
            "payment_method": "manual",
        }},
    )
    return {"message": f"Licença {license_type} ativada com sucesso!", "expiry_date": expiry.isoformat(), "license_type": license_type, "plan": license_plan}

@api_router.get("/license/status")
async def get_license_status(current_user: dict = Depends(get_current_user)):
    expiry = current_user.get("license_expiry")
    if isinstance(expiry, str):
        expiry = datetime.fromisoformat(expiry)
    days_remaining = (expiry - datetime.now(timezone.utc)).days if expiry else 0
    return {
        "license_type": current_user.get("license_type", "trial"),
        "license_plan": current_user.get("license_plan"),
        "expiry_date": expiry.isoformat() if expiry else None,
        "days_remaining": max(0, days_remaining),
        "is_expired": days_remaining <= 0 if expiry else False,
        "email": current_user.get("email"),
        "role": current_user.get("role", "user"),
    }

# ==================== Admin (exemplos) ====================

async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    return current_user

@api_router.get("/admin/users")
async def admin_get_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "reset_token": 0}).to_list(1000)
    for u in users:
        for k in ("created_at", "trial_started", "license_expiry", "last_payment_date"):
            if isinstance(u.get(k), str):
                u[k] = datetime.fromisoformat(u[k])
    return {"users": users, "total": len(users)}

@api_router.get("/admin/stats")
async def admin_get_stats(admin: dict = Depends(require_admin)):
    all_users = await db.users.find({}, {"_id": 0}).to_list(1000)
    stats = {
        "total_users": len(all_users),
        "trial_users": len([u for u in all_users if u.get("license_type") == "trial"]),
        "monthly_users": len([u for u in all_users if u.get("license_type") == "monthly"]),
        "annual_users": len([u for u in all_users if u.get("license_type") == "annual"]),
        "expired_users": len([u for u in all_users if u.get("license_type") == "expired"]),
        "admin_users": len([u for u in all_users if u.get("role") == "admin"]),
    }
    monthly_revenue = stats["monthly_users"] * 30
    annual_revenue = stats["annual_users"] * 300
    stats["monthly_revenue"] = monthly_revenue
    stats["annual_revenue"] = annual_revenue
    stats["total_monthly_revenue"] = round(monthly_revenue + (annual_revenue / 12), 2)
    stats["total_annual_revenue"] = round(monthly_revenue * 12 + annual_revenue, 2)
    return stats

# ==================== Migração (exemplo) ====================

@api_router.post("/migrate/campaigns-to-industries")
async def migrate_campaigns_to_industries(current_user: dict = Depends(get_current_user)):
    campaigns = await db.campaigns.find(
        {"user_id": current_user["id"], "product_goals": {"$exists": True, "$ne": None}}, {"_id": 0}
    ).to_list(1000)

    migrated_count = 0
    for campaign in campaigns:
        if campaign.get("industries"):
            continue
        product_goals = campaign.get("product_goals", {})
        if not product_goals:
            continue
        general_industry = {
            "name": "Geral",
            "goal": sum(product_goals.values()),
            "products": list(product_goals.keys()),
        }
        await db.campaigns.update_one(
            {"id": campaign["id"]},
            {"$set": {"industries": [general_industry], "product_goals": None}},
        )
        migrated_count += 1

    clients_migrated = 0
    for campaign in campaigns:
        clients = await db.clients.find(
            {"campaign_id": campaign["id"], "products": {"$exists": True, "$ne": None}}, {"_id": 0}
        ).to_list(10000)
        for client in clients:
            if client.get("industries"):
                continue
            old_products = client.get("products", {})
            if not old_products:
                continue
            general_industry_data = {"products": old_products, "industry_status": ""}
            has_positivado = any(
                (p.get("status", "").lower() == "positivado") for p in old_products.values()
            )
            general_industry_data["industry_status"] = "positivado" if has_positivado else ""
            await db.clients.update_one(
                {"id": client["id"]},
                {"$set": {"industries": {"Geral": general_industry_data}, "products": None}},
            )
            clients_migrated += 1

    return {"message": "Migração concluída com sucesso!", "campaigns_migrated": migrated_count, "clients_migrated": clients_migrated}

# ==================== Mount Router & Lifecycle ====================

app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    logger.info("App started")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Mongo client closed")
