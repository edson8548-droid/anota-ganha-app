from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt  # CORRIGIDO: Import no topo
import jwt
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import asyncio

# Carregando variáveis de ambiente
load_dotenv()

# Configuração de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Inicializando o FastAPI
app = FastAPI(
    title="Anota & Ganha Incentivos API",
    description="API para gerenciamento de campanhas e clientes.",
    version="1.0.0"
)

# CORRIGIDO: CORS com origins específicos
origins = [
    "https://anota-ganha-app.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoints
@app.get("/")
async def root():
    return {
        "message": "Anota Ganha API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.head("/health")
async def health_check_head():
    return {"status": "healthy"}

# Configuração do MongoDB
mongo_url = os.environ.get("MONGO_URL")
if not mongo_url:
    logger.error("MONGO_URL não configurada!")
    raise ValueError("MONGO_URL não configurada no ambiente.")

client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=50,
    minPoolSize=10,
    connectTimeoutMS=5000,
    serverSelectionTimeoutMS=5000,
    socketTimeoutMS=5000,
    retryWrites=True,
    retryReads=True,
)

db = client[os.environ.get("DB_NAME", "anota_ganha")]

# Função helper para operações no banco de dados com timeout
async def safe_db_operation(operation, timeout=30):
    try:
        return await asyncio.wait_for(operation, timeout)
    except asyncio.TimeoutError:
        logger.error("Operação no banco de dados excedeu o tempo limite.")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Tempo limite da operação no banco de dados."
        )
    except Exception as e:
        logger.error(f"Erro na operação do banco de dados: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro no banco de dados: {str(e)}"
        )

# Configurações de autenticação
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 dias

# Configuração de Licença
TRIAL_PERIOD_DAYS = 15
MONTHLY_SIMPLE_PRICE = 35.00

security = HTTPBearer()

# Modelos Pydantic
class UserBase(BaseModel):
    email: str
    name: Optional[str] = None
    role: str = "user"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class User(UserBase):
    id: str
    created_at: datetime
    trial_started: Optional[datetime] = None
    license_type: Optional[str] = None
    license_plan: Optional[str] = None
    license_expiry: Optional[datetime] = None
    last_payment_date: Optional[datetime] = None
    payment_method: Optional[str] = None
    subscription_id: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

# Funções de Autenticação
def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user_from_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido"
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado"
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido"
        )

# Funções de Email
def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    try:
        if not os.environ.get('SENDGRID_API_KEY'):
            logger.warning("SendGrid not configured")
            return False

        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        reset_link = f"{frontend_url}/reset-password?token={reset_token}"

        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
                <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px;">
                    <h2 style="color: #2563eb;">Recuperação de Senha</h2>
                    <p>Clique no botão abaixo para redefinir sua senha:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{reset_link}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">Redefinir Senha</a>
                    </div>
                    <p style="color: #999; font-size: 12px;">Este link é válido por 1 hora.</p>
                </div>
            </body>
        </html>
        """

        message = Mail(
            from_email=os.environ.get('SENDER_EMAIL'),
            to_emails=to_email,
            subject='Recuperação de Senha - Anota & Ganha',
            html_content=html_content
        )

        sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
        response = sg.send(message)
        return response.status_code in [200, 202]
    except Exception as e:
        logger.error(f"Erro ao enviar email: {str(e)}")
        return False

# Rotas de Autenticação
api_router = APIRouter(prefix="/api")

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    """Registro de novo usuário"""
    # Verificar se email já existe
    existing_user = await safe_db_operation(
        db.users.find_one({"email": user_data.email})
    )
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    # CORRIGIDO: Hash da senha
    hashed_password = bcrypt.hashpw(
        user_data.password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

    # Criar ID único
    user_id = str(uuid.uuid4())

    # CORRIGIDO: Criar documento do usuário
    user_doc = {
        "id": user_id,  # Usar 'id' como string, não '_id'
        "email": user_data.email,
        "name": user_data.name or user_data.email.split('@')[0],
        "role": user_data.role,
        "password_hash": hashed_password,
        "created_at": datetime.now(timezone.utc),
        "trial_started": datetime.now(timezone.utc),
        "license_type": "trial",
        "license_expiry": datetime.now(timezone.utc) + timedelta(days=TRIAL_PERIOD_DAYS)
    }

    # Inserir no banco
    try:
        await safe_db_operation(db.users.insert_one(user_doc))
    except Exception as e:
        logger.error(f"Erro ao inserir usuário: {e}")
        raise HTTPException(status_code=500, detail="Erro ao criar usuário")

    # Criar token
    access_token = create_access_token(
        data={"sub": user_id, "email": user_doc["email"], "role": user_doc["role"]}
    )

    # CORRIGIDO: Criar objeto User para resposta
    user_response = User(
        id=user_id,
        email=user_doc["email"],
        name=user_doc["name"],
        role=user_doc["role"],
        created_at=user_doc["created_at"],
        trial_started=user_doc.get("trial_started"),
        license_type=user_doc.get("license_type"),
        license_expiry=user_doc.get("license_expiry")
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    """Login de usuário"""
    # CORRIGIDO: Buscar por campo 'id' ou 'email'
    user = await safe_db_operation(
        db.users.find_one({"email": user_data.email})
    )
    
    if not user:
        raise HTTPException(
            status_code=400,
            detail="Email ou senha incorretos"
        )

    # Verificar senha
    if not user.get('password_hash'):
        raise HTTPException(
            status_code=400,
            detail="Email ou senha incorretos"
        )

    if not bcrypt.checkpw(
        user_data.password.encode('utf-8'),
        user['password_hash'].encode('utf-8')
    ):
        raise HTTPException(
            status_code=400,
            detail="Email ou senha incorretos"
        )

    # CORRIGIDO: Pegar user_id - pode ser 'id' ou '_id'
    user_id = user.get('id') or str(user.get('_id'))

    # Criar token
    access_token = create_access_token(
        data={
            "sub": user_id,
            "email": user["email"],
            "role": user.get("role", "user")
        }
    )

    # CORRIGIDO: Criar objeto User para resposta
    user_response = User(
        id=user_id,
        email=user["email"],
        name=user.get("name", ""),
        role=user.get("role", "user"),
        created_at=user.get("created_at", datetime.now(timezone.utc)),
        trial_started=user.get("trial_started"),
        license_type=user.get("license_type"),
        license_plan=user.get("license_plan"),
        license_expiry=user.get("license_expiry"),
        last_payment_date=user.get("last_payment_date"),
        payment_method=user.get("payment_method"),
        subscription_id=user.get("subscription_id")
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user_from_token)):
    """Buscar usuário atual"""
    # Buscar por campo 'id'
    user = await safe_db_operation(
        db.users.find_one(
            {"id": current_user["sub"]},
            {"password_hash": 0, "reset_token": 0}
        )
    )
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # Criar objeto User
    user_id = user.get('id') or str(user.get('_id'))
    
    return User(
        id=user_id,
        email=user["email"],
        name=user.get("name", ""),
        role=user.get("role", "user"),
        created_at=user.get("created_at", datetime.now(timezone.utc)),
        trial_started=user.get("trial_started"),
        license_type=user.get("license_type"),
        license_plan=user.get("license_plan"),
        license_expiry=user.get("license_expiry"),
        last_payment_date=user.get("last_payment_date"),
        payment_method=user.get("payment_method"),
        subscription_id=user.get("subscription_id")
    )

@api_router.post("/auth/forgot-password")
async def forgot_password(email: str):
    """Recuperação de senha"""
    user = await safe_db_operation(db.users.find_one({"email": email}))
    if not user:
        # Não revelar se email existe
        return {"message": "Se o email existir, você receberá um link de recuperação"}

    reset_token = str(uuid.uuid4())
    reset_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    
    await safe_db_operation(
        db.users.update_one(
            {"email": email},
            {"$set": {
                "reset_token": reset_token,
                "reset_token_expiry": reset_expiry
            }}
        )
    )

    send_password_reset_email(email, reset_token)
    return {"message": "Se o email existir, você receberá um link de recuperação"}

@api_router.post("/auth/reset-password")
async def reset_password(reset_token: str, new_password: str):
    """Reset de senha"""
    user = await safe_db_operation(
        db.users.find_one({"reset_token": reset_token})
    )
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido")

    # Verificar se token expirou
    if user.get('reset_token_expiry'):
        expiry = user['reset_token_expiry']
        if isinstance(expiry, str):
            expiry = datetime.fromisoformat(expiry)
        if datetime.now(timezone.utc) > expiry:
            raise HTTPException(status_code=400, detail="Token expirado")

    # Hash da nova senha
    hashed_password = bcrypt.hashpw(
        new_password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

    await safe_db_operation(
        db.users.update_one(
            {"reset_token": reset_token},
            {"$set": {
                "password_hash": hashed_password,
                "reset_token": None,
                "reset_token_expiry": None
            }}
        )
    )

    return {"message": "Senha alterada com sucesso!"}

# Rotas de Licença
@api_router.get("/plans")
async def get_plans():
    """Retorna os planos disponíveis"""
    return {
        "plans": [
            {
                "id": "trial",
                "name": "Teste Gratuito",
                "price": 0.00,
                "currency": "BRL",
                "interval": "day",
                "duration": TRIAL_PERIOD_DAYS
            },
            {
                "id": "monthly_30",
                "name": "Mensal",
                "price": 30.00,
                "currency": "BRL",
                "interval": "month"
            },
            {
                "id": "annual_300",
                "name": "Anual",
                "price": 300.00,
                "currency": "BRL",
                "interval": "year"
            }
        ]
    }

@api_router.get("/license/status")
async def get_license_status(current_user: dict = Depends(get_current_user_from_token)):
    """Status da licença do usuário"""
    user = await safe_db_operation(
        db.users.find_one({"id": current_user["sub"]})
    )
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    expiry = user.get('license_expiry')
    if expiry and isinstance(expiry, str):
        expiry = datetime.fromisoformat(expiry)

    days_remaining = 0
    if expiry:
        days_remaining = (expiry - datetime.now(timezone.utc)).days

    return {
        "license_type": user.get('license_type', 'trial'),
        "license_plan": user.get('license_plan'),
        "expiry_date": expiry.isoformat() if expiry else None,
        "days_remaining": max(0, days_remaining),
        "is_expired": days_remaining <= 0 if expiry else False,
        "email": user.get('email'),
        "role": user.get('role', 'user')
    }

# Incluir router
app.include_router(api_router)

# Lifecycle events
@app.on_event("startup")
async def startup_event():
    logger.info("Starting Anota Ganha API...")
    logger.info(f"MongoDB URL configured: {bool(mongo_url)}")

@app.on_event("shutdown")
async def shutdown_db_client():
    logger.info("Shutting down database connection...")
    client.close()

# Run server
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
