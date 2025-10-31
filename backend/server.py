from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection with proper timeout and pooling settings
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=50,  # Connection pool size
    minPoolSize=10,
    serverSelectionTimeoutMS=5000,  # 5 seconds timeout
    connectTimeoutMS=10000,  # 10 seconds connect timeout
    socketTimeoutMS=30000,  # 30 seconds socket timeout
    retryWrites=True,  # Retry failed writes
    retryReads=True,  # Retry failed reads
)
db = client[os.environ['DB_NAME']]

# Helper function to safely execute database operations with timeout
async def safe_db_operation(operation, timeout=30):
    """Execute database operation with timeout to prevent hanging"""
    try:
        return await asyncio.wait_for(operation, timeout=timeout)
    except asyncio.TimeoutError:
        logging.error(f"Database operation timed out after {timeout} seconds")
        raise HTTPException(status_code=504, detail="Database operation timed out")
    except Exception as e:
        logging.error(f"Database operation failed: {str(e)}")
        raise

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# License Configuration
TRIAL_PERIOD_DAYS = 15  # Período de teste gratuito
MONTHLY_SIMPLE_PRICE = 35.00  # Preço mensal simples (sem compromisso)
MONTHLY_PRICE = 29.90  # Preço mensal (12 meses)
ANNUAL_PRICE = 300.00  # Preço anual à vista

# Mercado Pago Configuration
MP_ACCESS_TOKEN = os.environ.get('MP_ACCESS_TOKEN', '')
MP_PUBLIC_KEY = os.environ.get('MP_PUBLIC_KEY', '')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:8001')

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'edson854_8@hotmail.com')

security = HTTPBearer()

# Helper function to send expiration warning emails
async def send_trial_expiration_email(user_email: str, days_remaining: int):
    """Send trial expiration warning email via SendGrid"""
    if not SENDGRID_API_KEY:
        logger.warning("SendGrid not configured, skipping email")
        return
    
    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail
        
        sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
        
        if days_remaining == 5:
            subject = "⚡ Seu teste grátis expira em 5 dias!"
            html_content = f"""
            <h2>Olá! 👋</h2>
            <p>Seu período de teste gratuito do <strong>Anota & Ganha Incentivos</strong> expira em <strong>5 dias</strong>!</p>
            <p>Não perca o acesso a todas as funcionalidades:</p>
            <ul>
                <li>✅ Campanhas ilimitadas</li>
                <li>✅ Clientes ilimitados</li>
                <li>✅ Analytics completo</li>
            </ul>
            <p><a href="{FRONTEND_URL}/pricing" style="background:#3B82F6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:16px;">Ver Planos</a></p>
            <p>A partir de <strong>R$ 29,90/mês</strong> ou <strong>R$ 300/ano</strong>!</p>
            """
        elif days_remaining == 1:
            subject = "🚨 ÚLTIMO DIA de teste grátis!"
            html_content = f"""
            <h2 style="color:#DC2626;">ATENÇÃO: Último Dia! 🚨</h2>
            <p>Seu teste grátis do <strong>Anota & Ganha Incentivos</strong> expira <strong>HOJE</strong>!</p>
            <p><strong>Assine agora</strong> para não perder o acesso amanhã:</p>
            <ul>
                <li>💳 <strong>Mensal:</strong> 12x de R$ 29,90</li>
                <li>💰 <strong>Anual:</strong> R$ 300 (economize R$ 120!)</li>
            </ul>
            <p><a href="{FRONTEND_URL}/pricing" style="background:#DC2626;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:16px;font-size:18px;font-weight:bold;">ASSINAR AGORA</a></p>
            """
        elif days_remaining == 0:
            subject = "❌ Seu teste expirou - Escolha um plano"
            html_content = f"""
            <h2>Seu teste expirou 😔</h2>
            <p>Seu período de teste gratuito do <strong>Anota & Ganha Incentivos</strong> terminou.</p>
            <p>Para continuar usando o app e não perder suas campanhas e clientes, escolha um plano:</p>
            <ul>
                <li>💳 <strong>Mensal Flexível:</strong> R$ 35/mês (cancele quando quiser)</li>
                <li>💰 <strong>12 meses:</strong> 12x R$ 29,90</li>
                <li>🎁 <strong>Anual:</strong> R$ 300 (2 meses grátis!)</li>
            </ul>
            <p><a href="{FRONTEND_URL}/pricing" style="background:#F59E0B;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:16px;font-size:18px;font-weight:bold;">ESCOLHER PLANO</a></p>
            <p style="margin-top:24px;color:#666;">Precisa de ajuda? Entre em contato: <a href="https://wa.me/5517996040954">WhatsApp</a></p>
            """
        else:
            return
        
        message = Mail(
            from_email=SENDER_EMAIL,
            to_emails=user_email,
            subject=subject,
            html_content=html_content
        )
        
        response = sg.send(message)
        logger.info(f"Email sent to {user_email}: {subject} (status: {response.status_code})")
    except Exception as e:
        logger.error(f"Failed to send email to {user_email}: {str(e)}")

# Background task to check and notify expiring trials
async def check_expiring_trials():
    """Check for expiring trials and send notification emails"""
    while True:
        try:
            await asyncio.sleep(3600)  # Check every hour
            
            now = datetime.now(timezone.utc)
            
            # Find users with expiring trials
            users = await db.users.find({
                "license_type": "trial",
                "license_expiry": {"$exists": True}
            }).to_list(1000)
            
            for user in users:
                if not user.get('license_expiry'):
                    continue
                
                expiry = user['license_expiry']
                if isinstance(expiry, str):
                    expiry = datetime.fromisoformat(expiry)
                
                # Calculate days remaining
                days_remaining = (expiry - now).days
                
                # Check if we need to send notification
                email_sent_field = f"notification_sent_{days_remaining}d"
                
                if days_remaining in [5, 1, 0] and not user.get(email_sent_field):
                    await send_trial_expiration_email(user['email'], days_remaining)
                    
                    # Mark as sent
                    await db.users.update_one(
                        {"email": user['email']},
                        {"$set": {email_sent_field: True}}
                    )
                    
        except Exception as e:
            logger.error(f"Error checking expiring trials: {str(e)}")
            await asyncio.sleep(300)  # Wait 5 minutes on error

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Health check endpoint (sem prefixo /api para monitoramento)
@app.get("/health")
@app.head("/health")
async def health_check():
    try:
        # Testar conexão com MongoDB
        await db.command('ping')
        return {
            "status": "healthy",
            "database": "connected",
            "service": "running"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }


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
    license_plan: Optional[str] = None  # monthly_30, annual_300
    license_expiry: Optional[datetime] = None
    trial_started: Optional[datetime] = None
    payment_method: Optional[str] = None  # mercadopago, stripe, manual
    last_payment_date: Optional[datetime] = None
    subscription_id: Optional[str] = None  # ID do gateway de pagamento
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
    """Indústria com seus produtos"""
    name: str  # Nome da indústria (ex: "Camil", "JDE Café Turbinado")
    goal: float = 0.0  # Meta de valor da indústria
    products: List[str] = []  # Lista de produtos da indústria

class Campaign(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    start_date: datetime
    end_date: Optional[datetime] = None
    status: str = "active"  # active, paused, completed
    industries: List[Industry] = []  # Lista de indústrias com produtos
    # Manter product_goals para compatibilidade com dados antigos
    product_goals: Optional[Dict[str, float]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CampaignCreate(BaseModel):
    name: str
    start_date: datetime
    end_date: Optional[datetime] = None
    industries: List[Industry] = []
    # Manter product_goals para compatibilidade
    product_goals: Optional[Dict[str, float]] = None

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    industries: Optional[List[Industry]] = None
    # Manter product_goals para compatibilidade
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
    BAIRRO: Optional[str] = ""  # Novo campo
    # Nova estrutura: produtos agrupados por indústria
    # {"Camil": {"products": {"Sardinha Coqueiro": {"status": "positivado", "value": 150}, ...}, "industry_status": "positivado"}}
    industries: Dict[str, Dict[str, Any]] = {}
    # Manter products para compatibilidade com dados antigos
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
    BAIRRO: Optional[str] = ""  # Novo campo
    industries: Dict[str, Dict[str, Any]] = {}
    # Manter products para compatibilidade
    products: Optional[Dict[str, Dict[str, Any]]] = None
    notes: Optional[str] = ""

class ClientUpdate(BaseModel):
    CLIENTE: Optional[str] = None
    CNPJ: Optional[str] = None
    ENDERECO: Optional[str] = None
    CIDADE: Optional[str] = None
    BAIRRO: Optional[str] = None  # Novo campo
    industries: Optional[Dict[str, Dict[str, Any]]] = None
    # Manter products para compatibilidade
    products: Optional[Dict[str, Dict[str, Any]]] = None
    notes: Optional[str] = None
    notes: Optional[str] = None


# ==================== Auth Helpers ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
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
    except jwt.JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# ==================== Email Functions ====================

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """
    Envia email de recuperação de senha usando SendGrid
    """
    try:
        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        reset_link = f"{frontend_url}/reset-password?token={reset_token}"
        
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
                <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h2 style="color: #2563eb; text-align: center;">Recuperação de Senha</h2>
                    <p>Olá,</p>
                    <p>Você solicitou a recuperação de senha para sua conta no <strong>Anota & Ganha Incentivos</strong>.</p>
                    <p>Clique no botão abaixo para redefinir sua senha:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{reset_link}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Redefinir Senha</a>
                    </div>
                    <p style="color: #666; font-size: 14px;">Ou copie e cole este link no seu navegador:</p>
                    <p style="color: #2563eb; font-size: 12px; word-break: break-all;">{reset_link}</p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p style="color: #999; font-size: 12px;">Este link é válido por 1 hora.</p>
                    <p style="color: #999; font-size: 12px;">Se você não solicitou esta recuperação, ignore este email.</p>
                </div>
            </body>
        </html>
        """
        
        message = Mail(
            from_email=os.environ.get('SENDER_EMAIL'),
            to_emails=to_email,
            subject='Recuperação de Senha - Anota & Ganha Incentivos',
            html_content=html_content
        )
        
        sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
        response = sg.send(message)
        
        return response.status_code in [200, 202]
    except Exception as e:
        logging.error(f"Erro ao enviar email: {str(e)}")
        return False


# ==================== Auth Routes ====================

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já está em uso")
    
    # Check if this is the admin email
    is_admin = user_data.email == "edson854_8@hotmail.com"
    
    # Create user with 15 day trial (or admin access)
    trial_start = datetime.now(timezone.utc)
    trial_end = trial_start + timedelta(days=15)
    
    user_obj = User(
        email=user_data.email,
        name=user_data.name or user_data.email.split('@')[0],
        cpf=user_data.cpf or "",
        phone=user_data.phone or "",
        role="admin" if is_admin else "user",
        license_type="annual" if is_admin else "trial",  # Admin nunca expira
        trial_started=trial_start if not is_admin else None,
        license_expiry=None if is_admin else trial_end  # Admin sem expiração
    )
    
    user_dict = user_obj.model_dump()
    user_dict['password_hash'] = hash_password(user_data.password)
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    if user_dict['trial_started']:
        user_dict['trial_started'] = user_dict['trial_started'].isoformat()
    if user_dict['license_expiry']:
        user_dict['license_expiry'] = user_dict['license_expiry'].isoformat()
    
    await db.users.insert_one(user_dict)
    
    # Create token
    access_token = create_access_token(data={"sub": user_obj.id})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user_obj
    )

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    user = await db.users.find_one({"email": user_data.email})
    if not user or not verify_password(user_data.password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
    
    # Admin nunca expira
    if user.get('role') != 'admin':
        # Check license status for regular users
        if isinstance(user.get('license_expiry'), str):
            license_expiry = datetime.fromisoformat(user['license_expiry'])
        else:
            license_expiry = user.get('license_expiry')
        
        if license_expiry and datetime.now(timezone.utc) > license_expiry:
            if user.get('license_type') not in ['monthly', 'annual']:
                # Update to expired
                await db.users.update_one(
                    {"email": user_data.email},
                    {"$set": {"license_type": "expired"}}
                )
                raise HTTPException(
                    status_code=403, 
                    detail="Seu período de teste expirou. Escolha um plano para continuar usando."
                )
    
    # Convert datetime fields
    if isinstance(user.get('created_at'), str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    if user.get('trial_started') and isinstance(user.get('trial_started'), str):
        user['trial_started'] = datetime.fromisoformat(user['trial_started'])
    if user.get('license_expiry') and isinstance(user.get('license_expiry'), str):
        user['license_expiry'] = datetime.fromisoformat(user['license_expiry'])
    if user.get('last_payment_date') and isinstance(user.get('last_payment_date'), str):
        user['last_payment_date'] = datetime.fromisoformat(user['last_payment_date'])
    
    user_obj = User(**user)
    access_token = create_access_token(data={"sub": user_obj.id})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user_obj
    )

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    if isinstance(current_user.get('created_at'), str):
        current_user['created_at'] = datetime.fromisoformat(current_user['created_at'])
    if isinstance(current_user.get('trial_started'), str):
        current_user['trial_started'] = datetime.fromisoformat(current_user['trial_started'])
    if isinstance(current_user.get('license_expiry'), str):
        current_user['license_expiry'] = datetime.fromisoformat(current_user['license_expiry'])
    if current_user.get('last_payment_date') and isinstance(current_user.get('last_payment_date'), str):
        current_user['last_payment_date'] = datetime.fromisoformat(current_user['last_payment_date'])
    return User(**current_user)


# Password Recovery
@api_router.post("/auth/forgot-password")
async def forgot_password(email: str):
    user = await db.users.find_one({"email": email})
    if not user:
        # Don't reveal if email exists
        return {"message": "Se o email existir, você receberá um link de recuperação"}
    
    # Generate reset token (valid for 1 hour)
    reset_token = str(uuid.uuid4())
    reset_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    
    await db.users.update_one(
        {"email": email},
        {"$set": {
            "reset_token": reset_token,
            "reset_token_expiry": reset_expiry.isoformat()
        }}
    )
    
    # Send email via SendGrid
    email_sent = send_password_reset_email(email, reset_token)
    
    if not email_sent:
        logging.warning(f"Falha ao enviar email de recuperação para {email}")
    
    return {
        "message": "Se o email existir, você receberá um link de recuperação"
    }

@api_router.post("/auth/reset-password")
async def reset_password(reset_token: str, new_password: str):
    user = await db.users.find_one({"reset_token": reset_token})
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido")
    
    # Check if token expired
    if isinstance(user.get('reset_token_expiry'), str):
        expiry = datetime.fromisoformat(user['reset_token_expiry'])
    else:
        expiry = user.get('reset_token_expiry')
    
    if not expiry or datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo link")
    
    # Update password
    new_hash = hash_password(new_password)
    await db.users.update_one(
        {"reset_token": reset_token},
        {"$set": {
            "password_hash": new_hash,
            "reset_token": None,
            "reset_token_expiry": None
        }}
    )
    
    return {"message": "Senha alterada com sucesso!"}


# License Management
@api_router.get("/plans")
async def get_plans():
    """Retorna os planos disponíveis"""
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
                    "Suporte via email"
                ]
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
                    "Economia de R$ 60,00/ano"
                ],
                "highlight": True
            }
        ]
    }

@api_router.post("/license/activate")
async def activate_license(license_key: str, current_user: dict = Depends(get_current_user)):
    # Simple license key validation
    # Monthly: MONTHLY-XXXX-XXXX-XXXX
    # Annual: ANNUAL-XXXX-XXXX-XXXX
    
    is_monthly = license_key.startswith("MONTHLY-")
    is_annual = license_key.startswith("ANNUAL-")
    
    if not is_monthly and not is_annual:
        raise HTTPException(status_code=400, detail="Chave de licença inválida")
    
    # Check if license key already used
    existing = await db.users.find_one({"license_key": license_key})
    if existing and existing['id'] != current_user['id']:
        raise HTTPException(status_code=400, detail="Esta chave já foi utilizada")
    
    # Activate license
    if is_monthly:
        expiry = datetime.now(timezone.utc) + timedelta(days=30)
        license_type = "monthly"
        license_plan = "monthly_30"
    else:
        expiry = datetime.now(timezone.utc) + timedelta(days=365)
        license_type = "annual"
        license_plan = "annual_300"
    
    await db.users.update_one(
        {"id": current_user['id']},
        {"$set": {
            "license_type": license_type,
            "license_plan": license_plan,
            "license_key": license_key,
            "license_expiry": expiry.isoformat(),
            "last_payment_date": datetime.now(timezone.utc).isoformat(),
            "payment_method": "manual"
        }}
    )
    
    return {
        "message": f"Licença {license_type} ativada com sucesso!",
        "expiry_date": expiry.isoformat(),
        "license_type": license_type,
        "plan": license_plan
    }

@api_router.get("/license/status")
async def get_license_status(current_user: dict = Depends(get_current_user)):
    if isinstance(current_user.get('license_expiry'), str):
        expiry = datetime.fromisoformat(current_user['license_expiry'])
    else:
        expiry = current_user.get('license_expiry')
    
    days_remaining = 0
    if expiry:
        days_remaining = (expiry - datetime.now(timezone.utc)).days
    
    return {
        "license_type": current_user.get('license_type', 'trial'),
        "license_plan": current_user.get('license_plan'),
        "expiry_date": expiry.isoformat() if expiry else None,
        "days_remaining": max(0, days_remaining),
        "is_expired": days_remaining <= 0 if expiry else False,
        "email": current_user.get('email'),
        "role": current_user.get('role', 'user')
    }


# ==================== ADMIN ROUTES ====================

async def require_admin(current_user: dict = Depends(get_current_user)):
    """Middleware para verificar se é admin"""
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    return current_user

@api_router.get("/admin/users")
async def admin_get_users(admin: dict = Depends(require_admin)):
    """Lista todos os usuários (apenas admin)"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "reset_token": 0}).to_list(1000)
    
    # Convert datetime fields
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
        if user.get('trial_started') and isinstance(user.get('trial_started'), str):
            user['trial_started'] = datetime.fromisoformat(user['trial_started'])
        if user.get('license_expiry') and isinstance(user.get('license_expiry'), str):
            user['license_expiry'] = datetime.fromisoformat(user['license_expiry'])
        if user.get('last_payment_date') and isinstance(user.get('last_payment_date'), str):
            user['last_payment_date'] = datetime.fromisoformat(user['last_payment_date'])
    
    return {"users": users, "total": len(users)}

@api_router.get("/admin/stats")
async def admin_get_stats(admin: dict = Depends(require_admin)):
    """Estatísticas gerais (apenas admin)"""
    all_users = await db.users.find({}, {"_id": 0}).to_list(1000)
    
    stats = {
        "total_users": len(all_users),
        "trial_users": len([u for u in all_users if u.get('license_type') == 'trial']),
        "monthly_users": len([u for u in all_users if u.get('license_type') == 'monthly']),
        "annual_users": len([u for u in all_users if u.get('license_type') == 'annual']),
        "expired_users": len([u for u in all_users if u.get('license_type') == 'expired']),
        "admin_users": len([u for u in all_users if u.get('role') == 'admin'])
    }
    
    # Calculate revenue
    monthly_revenue = stats['monthly_users'] * 30
    annual_revenue = stats['annual_users'] * 300
    total_monthly_revenue = monthly_revenue + (annual_revenue / 12)
    
    stats['monthly_revenue'] = monthly_revenue
    stats['annual_revenue'] = annual_revenue
    stats['total_monthly_revenue'] = round(total_monthly_revenue, 2)
    stats['total_annual_revenue'] = round(monthly_revenue * 12 + annual_revenue, 2)
    
    return stats

@api_router.post("/admin/activate-user")
async def admin_activate_user(
    user_email: str,
    plan: str,  # monthly_30 or annual_300
    admin: dict = Depends(require_admin)
):
    """Ativa manualmente a licença de um usuário (apenas admin)"""
    user = await db.users.find_one({"email": user_email})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Set expiry based on plan
    if plan == "monthly_30":
        expiry = datetime.now(timezone.utc) + timedelta(days=30)
        license_type = "monthly"
    elif plan == "annual_300":
        expiry = datetime.now(timezone.utc) + timedelta(days=365)
        license_type = "annual"
    else:
        raise HTTPException(status_code=400, detail="Plano inválido")
    
    await db.users.update_one(
        {"email": user_email},
        {"$set": {
            "license_type": license_type,
            "license_plan": plan,
            "license_expiry": expiry.isoformat(),
            "last_payment_date": datetime.now(timezone.utc).isoformat(),
            "payment_method": "manual"
        }}
    )
    
    return {
        "message": f"Usuário {user_email} ativado com plano {plan}",
        "expiry_date": expiry.isoformat()
    }


# ==================== Migration Routes ====================

@api_router.post("/migrate/campaigns-to-industries")
async def migrate_campaigns_to_industries(current_user: dict = Depends(get_current_user)):
    """
    Migra campanhas antigas (product_goals) para nova estrutura (industries)
    Cria uma indústria "Geral" com todos os produtos antigos
    """
    # Buscar todas as campanhas do usuário que ainda usam product_goals
    campaigns = await db.campaigns.find(
        {"user_id": current_user['id'], "product_goals": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(1000)
    
    migrated_count = 0
    
    for campaign in campaigns:
        # Se já tem industries, pular
        if campaign.get('industries'):
            continue
        
        product_goals = campaign.get('product_goals', {})
        if not product_goals:
            continue
        
        # Criar indústria "Geral" com todos os produtos
        general_industry = {
            "name": "Geral",
            "goal": sum(product_goals.values()),  # Soma de todas as metas
            "products": list(product_goals.keys())
        }
        
        # Atualizar campanha
        await db.campaigns.update_one(
            {"id": campaign['id']},
            {"$set": {
                "industries": [general_industry],
                "product_goals": None  # Remover product_goals antigo
            }}
        )
        
        migrated_count += 1
    
    # Migrar clientes dessa campanha também
    clients_migrated = 0
    for campaign in campaigns:
        clients = await db.clients.find(
            {"campaign_id": campaign['id'], "products": {"$exists": True, "$ne": None}},
            {"_id": 0}
        ).to_list(10000)
        
        for client in clients:
            # Se já tem industries, pular
            if client.get('industries'):
                continue
            
            old_products = client.get('products', {})
            if not old_products:
                continue
            
            # Criar estrutura de indústria "Geral" para o cliente
            general_industry_data = {
                "products": old_products,  # Manter mesma estrutura de produtos
                "industry_status": ""  # Será calculado
            }
            
            # Calcular status da indústria (positivado se pelo menos 1 produto positivado)
            has_positivado = False
            for product_data in old_products.values():
                if product_data.get('status', '').lower() == 'positivado':
                    has_positivado = True
                    break
            
            general_industry_data["industry_status"] = "positivado" if has_positivado else ""
            
            # Atualizar cliente
            await db.clients.update_one(
                {"id": client['id']},
                {"$set": {
                    "industries": {"Geral": general_industry_data},
                    "products": None  # Remover products antigo
                }}
            )
            
            clients_migrated += 1
    
    return {
        "message": "Migração concluída com sucesso!",
        "campaigns_migrated": migrated_count,
        "clients_migrated": clients_migrated
    }


# ==================== Campaign Routes ====================

@api_router.post("/campaigns", response_model=Campaign)
async def create_campaign(campaign_data: CampaignCreate, current_user: dict = Depends(get_current_user)):
    campaign = Campaign(
        user_id=current_user['id'],
        name=campaign_data.name,
        start_date=campaign_data.start_date,
        end_date=campaign_data.end_date,
        industries=campaign_data.industries,
        product_goals=campaign_data.product_goals  # Compatibilidade
    )
    
    doc = campaign.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['start_date'] = doc['start_date'].isoformat()
    if doc['end_date']:
        doc['end_date'] = doc['end_date'].isoformat()
    
    # Converter industries para dict antes de salvar
    if doc.get('industries'):
        doc['industries'] = [ind.dict() if hasattr(ind, 'dict') else ind for ind in doc['industries']]
    
    await db.campaigns.insert_one(doc)
    return campaign

@api_router.get("/campaigns", response_model=List[Campaign])
async def get_campaigns(current_user: dict = Depends(get_current_user)):
    campaigns = await db.campaigns.find({"user_id": current_user['id']}, {"_id": 0}).to_list(1000)
    
    for camp in campaigns:
        if isinstance(camp.get('created_at'), str):
            camp['created_at'] = datetime.fromisoformat(camp['created_at'])
        if isinstance(camp.get('start_date'), str):
            camp['start_date'] = datetime.fromisoformat(camp['start_date'])
        if camp.get('end_date') and isinstance(camp['end_date'], str):
            camp['end_date'] = datetime.fromisoformat(camp['end_date'])
    
    return campaigns

@api_router.get("/campaigns/{campaign_id}", response_model=Campaign)
async def get_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if isinstance(campaign.get('created_at'), str):
        campaign['created_at'] = datetime.fromisoformat(campaign['created_at'])
    if isinstance(campaign.get('start_date'), str):
        campaign['start_date'] = datetime.fromisoformat(campaign['start_date'])
    if campaign.get('end_date') and isinstance(campaign['end_date'], str):
        campaign['end_date'] = datetime.fromisoformat(campaign['end_date'])
    
    return Campaign(**campaign)

@api_router.put("/campaigns/{campaign_id}", response_model=Campaign)
async def update_campaign(campaign_id: str, update_data: CampaignUpdate, current_user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if 'start_date' in update_dict:
        update_dict['start_date'] = update_dict['start_date'].isoformat()
    if 'end_date' in update_dict and update_dict['end_date']:
        update_dict['end_date'] = update_dict['end_date'].isoformat()
    
    # Converter industries para dict antes de salvar
    if 'industries' in update_dict and update_dict['industries']:
        update_dict['industries'] = [ind.dict() if hasattr(ind, 'dict') else ind for ind in update_dict['industries']]
    
    if update_dict:
        await db.campaigns.update_one({"id": campaign_id}, {"$set": update_dict})
    
    updated_campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if isinstance(updated_campaign.get('created_at'), str):
        updated_campaign['created_at'] = datetime.fromisoformat(updated_campaign['created_at'])
    if isinstance(updated_campaign.get('start_date'), str):
        updated_campaign['start_date'] = datetime.fromisoformat(updated_campaign['start_date'])
    if updated_campaign.get('end_date') and isinstance(updated_campaign['end_date'], str):
        updated_campaign['end_date'] = datetime.fromisoformat(updated_campaign['end_date'])
    
    return Campaign(**updated_campaign)

@api_router.post("/campaigns/{campaign_id}/reset")
async def reset_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """Reset all clients in campaign - set all products to not positivado and value to 0"""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get all clients in this campaign
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    # Reset each client's products
    for client in clients:
        reset_products = {}
        for product_name, product_data in client.get('products', {}).items():
            reset_products[product_name] = {"status": "", "value": 0}
        
        await db.clients.update_one(
            {"id": client['id']},
            {"$set": {"products": reset_products, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return {"message": "Campaign reset successfully", "clients_updated": len(clients)}

@api_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Delete sheets only
    await db.sheets.delete_many({"campaign_id": campaign_id})
    
    # PRESERVE CLIENTS - Remove campaign_id to make them available for next campaign
    await db.clients.update_many(
        {"campaign_id": campaign_id, "user_id": current_user['id']},
        {"$set": {"campaign_id": None}}
    )
    
    # Delete campaign
    await db.campaigns.delete_one({"id": campaign_id})
    
    return {"message": "Campaign deleted successfully. Clients were preserved."}



# ==================== Sheet Routes ====================

@api_router.post("/sheets", response_model=Sheet)
async def create_sheet(sheet_data: SheetCreate, current_user: dict = Depends(get_current_user)):
    # Verify campaign belongs to user
    campaign = await db.campaigns.find_one({"id": sheet_data.campaign_id, "user_id": current_user['id']})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    sheet = Sheet(
        user_id=current_user['id'],
        campaign_id=sheet_data.campaign_id,
        name=sheet_data.name,
        icon=sheet_data.icon,
        headers=sheet_data.headers
    )
    
    doc = sheet.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.sheets.insert_one(doc)
    return sheet

@api_router.get("/sheets", response_model=List[Sheet])
async def get_sheets(campaign_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"user_id": current_user['id']}
    if campaign_id:
        query["campaign_id"] = campaign_id
    
    sheets = await db.sheets.find(query, {"_id": 0}).to_list(1000)
    
    for sheet in sheets:
        if isinstance(sheet.get('created_at'), str):
            sheet['created_at'] = datetime.fromisoformat(sheet['created_at'])
    
    return sheets

@api_router.get("/sheets/{sheet_id}", response_model=Sheet)
async def get_sheet(sheet_id: str, current_user: dict = Depends(get_current_user)):
    sheet = await db.sheets.find_one({"id": sheet_id, "user_id": current_user['id']}, {"_id": 0})
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    
    if isinstance(sheet.get('created_at'), str):
        sheet['created_at'] = datetime.fromisoformat(sheet['created_at'])
    
    return Sheet(**sheet)

@api_router.put("/sheets/{sheet_id}", response_model=Sheet)
async def update_sheet(sheet_id: str, update_data: SheetUpdate, current_user: dict = Depends(get_current_user)):
    sheet = await db.sheets.find_one({"id": sheet_id, "user_id": current_user['id']})
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.sheets.update_one({"id": sheet_id}, {"$set": update_dict})
    
    updated_sheet = await db.sheets.find_one({"id": sheet_id}, {"_id": 0})
    if isinstance(updated_sheet.get('created_at'), str):
        updated_sheet['created_at'] = datetime.fromisoformat(updated_sheet['created_at'])
    
    return Sheet(**updated_sheet)

@api_router.delete("/sheets/{sheet_id}")
async def delete_sheet(sheet_id: str, current_user: dict = Depends(get_current_user)):
    sheet = await db.sheets.find_one({"id": sheet_id, "user_id": current_user['id']})
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    
    # Delete all clients in this sheet
    await db.clients.delete_many({"sheet_id": sheet_id})
    await db.sheets.delete_one({"id": sheet_id})
    
    return {"message": "Sheet deleted successfully"}


# ==================== Client Routes ====================

@api_router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate, current_user: dict = Depends(get_current_user)):
    # Verify sheet and campaign belong to user
    sheet = await db.sheets.find_one({"id": client_data.sheet_id, "user_id": current_user['id']})
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    
    campaign = await db.campaigns.find_one({"id": client_data.campaign_id, "user_id": current_user['id']})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Inicializar estrutura de indústrias baseado na campanha
    industries_data = {}
    campaign_industries = campaign.get('industries', [])
    
    for industry in campaign_industries:
        industry_name = industry.get('name', '')
        products = industry.get('products', [])
        
        # Criar estrutura vazia para cada produto da indústria
        industry_products = {}
        for product in products:
            industry_products[product] = {"status": "", "value": 0}
        
        industries_data[industry_name] = {
            "products": industry_products,
            "industry_status": ""  # Será "" inicialmente
        }
    
    client = Client(
        user_id=current_user['id'],
        sheet_id=client_data.sheet_id,
        campaign_id=client_data.campaign_id,
        CLIENTE=client_data.CLIENTE,
        CNPJ=client_data.CNPJ,
        ENDERECO=client_data.ENDERECO,
        CIDADE=client_data.CIDADE,
        industries=industries_data,
        products=client_data.products,  # Compatibilidade
        notes=client_data.notes
    )
    
    doc = client.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.clients.insert_one(doc)
    return client

@api_router.get("/clients", response_model=List[Client])
async def get_clients(sheet_id: Optional[str] = None, campaign_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"user_id": current_user['id']}
    if sheet_id:
        query["sheet_id"] = sheet_id
    if campaign_id:
        # Include clients from this campaign OR clients without campaign (campaign_id=None)
        query["$or"] = [
            {"campaign_id": campaign_id},
            {"campaign_id": None}
        ]
    
    clients = await db.clients.find(query, {"_id": 0}).to_list(10000)
    
    for client in clients:
        if isinstance(client.get('created_at'), str):
            client['created_at'] = datetime.fromisoformat(client['created_at'])
        if isinstance(client.get('updated_at'), str):
            client['updated_at'] = datetime.fromisoformat(client['updated_at'])
    
    return clients

@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, current_user: dict = Depends(get_current_user)):
    client = await db.clients.find_one({"id": client_id, "user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if isinstance(client.get('created_at'), str):
        client['created_at'] = datetime.fromisoformat(client['created_at'])
    if isinstance(client.get('updated_at'), str):
        client['updated_at'] = datetime.fromisoformat(client['updated_at'])
    
    return Client(**client)

@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, update_data: ClientUpdate, current_user: dict = Depends(get_current_user)):
    client = await db.clients.find_one({"id": client_id, "user_id": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    if update_dict:
        await db.clients.update_one({"id": client_id}, {"$set": update_dict})
    
    updated_client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if isinstance(updated_client.get('created_at'), str):
        updated_client['created_at'] = datetime.fromisoformat(updated_client['created_at'])
    if isinstance(updated_client.get('updated_at'), str):
        updated_client['updated_at'] = datetime.fromisoformat(updated_client['updated_at'])
    
    return Client(**updated_client)

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: dict = Depends(get_current_user)):
    client = await db.clients.find_one({"id": client_id, "user_id": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.delete_one({"id": client_id})
    return {"message": "Client deleted successfully"}


# ==================== Dashboard/Stats Routes ====================

@api_router.get("/stats/{campaign_id}")
async def get_campaign_stats(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """Get comprehensive stats for a campaign"""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get all clients in campaign
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    total_clients = len(clients)
    product_stats = {}
    
    # Calculate stats per product
    for client in clients:
        for product_name, product_data in client.get('products', {}).items():
            if product_name not in product_stats:
                product_stats[product_name] = {
                    "positivados": 0,
                    "total_value": 0,
                    "goal": campaign.get('product_goals', {}).get(product_name, 0)
                }
            
            if product_data.get('status', '').lower() == 'positivado':
                product_stats[product_name]['positivados'] += 1
            
            product_stats[product_name]['total_value'] += product_data.get('value', 0)
    
    # Calculate percentages
    for product_name, stats in product_stats.items():
        stats['percentage'] = (stats['positivados'] / total_clients * 100) if total_clients > 0 else 0
        stats['goal_percentage'] = (stats['total_value'] / stats['goal'] * 100) if stats['goal'] > 0 else 0
    
    return {
        "campaign": campaign,
        "total_clients": total_clients,
        "product_stats": product_stats
    }

@api_router.get("/stats/{campaign_id}/cities")
async def get_campaign_stats_by_city(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """Get comprehensive stats for a campaign grouped by city"""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get all clients in campaign (including clients without campaign_id)
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    # Group by city
    city_stats = {}
    
    for client in clients:
        city = client.get('CIDADE', 'Sem Cidade')
        
        if city not in city_stats:
            city_stats[city] = {
                "total_clients": 0,
                "positivated_clients": 0,
                "products": {}
            }
        
        city_stats[city]["total_clients"] += 1
        
        # Check if client has any positivation
        client_has_positivation = False
        
        # Process industries and products
        industries_obj = client.get('industries', {})
        if isinstance(industries_obj, dict):
            for industry_name, industry in industries_obj.items():
                if isinstance(industry, dict):
                    products_dict = industry.get('products', {})
                    # Products is a dict, not a list!
                    if isinstance(products_dict, dict):
                        for product_name, product in products_dict.items():
                            if isinstance(product, dict):
                                status = product.get('status', '').strip().lower()
                                
                                if product_name:
                                    if product_name not in city_stats[city]["products"]:
                                        city_stats[city]["products"][product_name] = {
                                            "positivados": 0,
                                            "total_clients": 0
                                        }
                                    
                                    city_stats[city]["products"][product_name]["total_clients"] += 1
                                    
                                    if status == 'positivado':
                                        city_stats[city]["products"][product_name]['positivados'] += 1
                                        client_has_positivation = True
        
        if client_has_positivation:
            city_stats[city]["positivated_clients"] += 1
    
    # Calculate percentages
    for city, data in city_stats.items():
        data["positivation_percentage"] = (data["positivated_clients"] / data["total_clients"] * 100) if data["total_clients"] > 0 else 0
        
        for product_name, stats in data["products"].items():
            stats['percentage'] = (stats['positivados'] / stats['total_clients'] * 100) if stats['total_clients'] > 0 else 0
    
    return {
        "campaign": campaign,
        "city_stats": city_stats,
        "total_cities": len(city_stats)
    }


# ==================== ADVANCED ANALYTICS ENDPOINTS ====================

@api_router.get("/analytics/metrics/{campaign_id}")
async def get_analytics_metrics(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """Get general metrics for analytics dashboard"""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get all clients
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    total_clients = len(clients)
    clients_positivados = 0
    total_industries = len(campaign.get('industries', []))
    
    # Count total products in campaign
    total_products = 0
    for industry in campaign.get('industries', []):
        if isinstance(industry, dict):
            products = industry.get('products', [])
            total_products += len(products)
    
    # Count clients with at least one positivation
    for client in clients:
        has_positivation = False
        industries_obj = client.get('industries', {})
        
        # Industries is an object/dict, not a list
        if isinstance(industries_obj, dict):
            for industry_name, industry in industries_obj.items():
                if isinstance(industry, dict):
                    products_dict = industry.get('products', {})
                    # Products is a dict, not a list!
                    if isinstance(products_dict, dict):
                        for product_name, product in products_dict.items():
                            if isinstance(product, dict):
                                status = product.get('status', '').strip().lower()
                                if status == 'positivado':
                                    has_positivation = True
                                    break
                if has_positivation:
                    break
        
        if has_positivation:
            clients_positivados += 1
    
    percentage_positivados = (clients_positivados / total_clients * 100) if total_clients > 0 else 0
    
    return {
        "total_clients": total_clients,
        "clients_positivados": clients_positivados,
        "percentage_positivados": round(percentage_positivados, 2),
        "total_industries": total_industries,
        "total_products": total_products
    }

@api_router.get("/analytics/industries/{campaign_id}")
async def get_industries_stats(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """Get positivation stats grouped by industry"""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    industry_stats = {}
    
    # Initialize industries from campaign
    for industry in campaign.get('industries', []):
        if isinstance(industry, dict):
            industry_name = industry.get('name')
            industry_stats[industry_name.lower()] = {  # Use lowercase as key
                "name": industry_name,
                "total_positivados": 0,
                "total_clients": 0,
                "percentage": 0
            }
    
    # Count clients per industry and positivations
    for client in clients:
        industries_obj = client.get('industries', {})
        
        # Industries is an object/dict, not a list
        if isinstance(industries_obj, dict):
            for industry_name, industry in industries_obj.items():
                industry_name_lower = industry_name.lower()  # Compare in lowercase
                if industry_name_lower in industry_stats:
                    # Count this client as having this industry
                    industry_stats[industry_name_lower]['total_clients'] += 1
                    
                    # Check if any product in this industry is positivado
                    has_positivation = False
                    if isinstance(industry, dict):
                        products_dict = industry.get('products', {})
                        # Products is a dict, not a list!
                        if isinstance(products_dict, dict):
                            for product_name, product in products_dict.items():
                                if isinstance(product, dict):
                                    status = product.get('status', '').strip().lower()
                                    if status == 'positivado':
                                        has_positivation = True
                                        break
                    
                    if has_positivation:
                        industry_stats[industry_name_lower]['total_positivados'] += 1
    
    # Calculate percentages
    for industry_name, stats in industry_stats.items():
        if stats['total_clients'] > 0:
            stats['percentage'] = round((stats['total_positivados'] / stats['total_clients']) * 100, 2)
    
    # Convert to list and sort by positivados
    result = list(industry_stats.values())
    result.sort(key=lambda x: x['total_positivados'], reverse=True)
    
    return result


@api_router.get("/analytics/debug-industries/{campaign_id}")
async def debug_industries(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """Debug industries matching"""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        return {"error": "Campaign not found"}
    
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    # Get campaign industry names
    campaign_industries = []
    for ind in campaign.get('industries', []):
        if isinstance(ind, dict):
            campaign_industries.append(ind.get('name'))
    
    # Get client industry names
    client_industries = set()
    for client in clients:
        industries_obj = client.get('industries', {})
        if isinstance(industries_obj, dict):
            for ind_name in industries_obj.keys():
                client_industries.add(ind_name)
    
    return {
        "campaign_industries": campaign_industries,
        "client_industries": list(client_industries),
        "match": [c for c in campaign_industries if c in client_industries]
    }


@api_router.get("/analytics/products/{campaign_id}")
async def get_products_stats(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """Get positivation stats grouped by product"""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    product_stats = {}
    
    # Initialize products from campaign
    for industry in campaign.get('industries', []):
        if isinstance(industry, dict):
            industry_name = industry.get('name')
            for product_name in industry.get('products', []):
                if isinstance(product_name, str) and product_name not in product_stats:
                    product_stats[product_name] = {
                        "name": product_name,
                        "industry": industry_name,
                        "total_positivados": 0,
                        "total_clients": len(clients)
                    }
    
    # Count positivations per product
    for client in clients:
        industries_obj = client.get('industries', {})
        
        # Industries is an object/dict, not a list
        if isinstance(industries_obj, dict):
            for industry_name, industry in industries_obj.items():
                if isinstance(industry, dict):
                    products_dict = industry.get('products', {})
                    # Products is a dict, not a list!
                    if isinstance(products_dict, dict):
                        for product_name, product in products_dict.items():
                            if isinstance(product, dict):
                                status = product.get('status', '').strip().lower()
                                if product_name in product_stats and status == 'positivado':
                                    product_stats[product_name]['total_positivados'] += 1
    
    # Convert to list and sort by positivados
    result = list(product_stats.values())
    result.sort(key=lambda x: x['total_positivados'], reverse=True)
    
    return result

@api_router.get("/analytics/top-clients/{campaign_id}")
async def get_top_clients(campaign_id: str, limit: int = 10, current_user: dict = Depends(get_current_user)):
    """Get top clients by number of positivations"""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    client_stats = []
    
    for client in clients:
        positivations_count = 0
        
        # Count total positivations for this client
        industries_obj = client.get('industries', {})
        
        # Industries is an object/dict, not a list
        if isinstance(industries_obj, dict):
            for industry_name, industry in industries_obj.items():
                if isinstance(industry, dict):
                    products_dict = industry.get('products', {})
                    # Products is a dict, not a list!
                    if isinstance(products_dict, dict):
                        for product_name, product in products_dict.items():
                            if isinstance(product, dict):
                                status = product.get('status', '').strip().lower()
                                if status == 'positivado':
                                    positivations_count += 1
        
        if positivations_count > 0:
            client_stats.append({
                "name": client.get('CLIENTE', 'Sem nome'),
                "city": client.get('CIDADE', 'Sem cidade'),
                "neighborhood": client.get('BAIRRO', 'Sem bairro'),
                "positivations": positivations_count
            })
    
    # Sort by positivations and get top N
    client_stats.sort(key=lambda x: x['positivations'], reverse=True)
    
    return client_stats[:limit]


@api_router.get("/analytics/debug/{campaign_id}")
async def debug_analytics(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """Debug endpoint to see raw data structure"""
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    # Get campaign industries names
    campaign_industries = []
    for ind in campaign.get('industries', []):
        if isinstance(ind, dict):
            campaign_industries.append(ind.get('name'))
    
    # Get first client industries
    client_industries = []
    if clients:
        first_client = clients[0]
        for ind in first_client.get('industries', []):
            if isinstance(ind, dict):
                client_industries.append({
                    "name": ind.get('name'),
                    "products_count": len(ind.get('products', [])),
                    "first_product": ind.get('products', [{}])[0] if ind.get('products') else None
                })
    
    return {
        "campaign_industries": campaign_industries,
        "total_clients": len(clients),
        "first_client_industries": client_industries,
        "first_client_name": clients[0].get('name') if clients else None
    }


@api_router.get("/analytics/debug-auto")
async def debug_analytics_auto(current_user: dict = Depends(get_current_user)):
    """Debug endpoint - automatically uses user's first campaign"""
    
    # Get user's first campaign
    campaign = await db.campaigns.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        return {"error": "No campaign found"}
    
    campaign_id = campaign.get('id')
    clients = await db.clients.find({
        "user_id": current_user['id'],
        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
    }).to_list(10000)
    
    # Get campaign industries names
    campaign_industries = []
    for ind in campaign.get('industries', []):
        if isinstance(ind, dict):
            campaign_industries.append(ind.get('name'))
    
    # Get ALL client industries to see patterns
    all_client_industries = {}
    clients_with_positivation = 0
    
    for client in clients:
        client_has_positivation = False
        industries_obj = client.get('industries', {})
        
        # Industries is an object/dict, not a list
        if isinstance(industries_obj, dict):
            for ind_name, ind in industries_obj.items():
                if ind_name not in all_client_industries:
                    all_client_industries[ind_name] = {
                        "count": 0,
                        "positivated": 0,
                        "example_products": []
                    }
                all_client_industries[ind_name]["count"] += 1
                
                # Check for positivation
                has_positivation_in_industry = False
                if isinstance(ind, dict):
                    for prod in ind.get('products', [])[:2]:
                        if isinstance(prod, dict):
                            status = prod.get('status', '').strip()
                            all_client_industries[ind_name]["example_products"].append({
                                "name": prod.get('name'),
                                "status": status,
                                "status_lower": status.lower()
                            })
                            if status.lower() == 'positivado':
                                has_positivation_in_industry = True
                                client_has_positivation = True
                    
                    if has_positivation_in_industry:
                        all_client_industries[ind_name]["positivated"] += 1
        
        if client_has_positivation:
            clients_with_positivation += 1
    
    return {
        "campaign_name": campaign.get('name'),
        "campaign_industries": campaign_industries,
        "total_clients": len(clients),
        "clients_with_positivation": clients_with_positivation,
        "client_industries_found": all_client_industries
    }





@api_router.get("/analytics/test-client/{client_id}")
async def test_client_structure(client_id: str, current_user: dict = Depends(get_current_user)):
    """Test endpoint to see exact client structure"""
    client = await db.clients.find_one({"id": client_id, "user_id": current_user['id']}, {"_id": 0})
    if not client:
        return {"error": "Client not found"}
    
    # Get industries structure
    industries_obj = client.get('industries', {})
    result = {
        "client_name": client.get('name'),
        "industries_type": str(type(industries_obj)),
        "industries_keys": list(industries_obj.keys()) if isinstance(industries_obj, dict) else None,
        "first_industry_data": None
    }
    
    # Get first industry details
    if isinstance(industries_obj, dict) and industries_obj:
        first_ind_name = list(industries_obj.keys())[0]
        first_ind = industries_obj[first_ind_name]
        result["first_industry_data"] = {
            "name": first_ind_name,
            "type": str(type(first_ind)),
            "keys": list(first_ind.keys()) if isinstance(first_ind, dict) else None,
            "products_type": str(type(first_ind.get('products'))) if isinstance(first_ind, dict) else None,
            "products_length": len(first_ind.get('products', [])) if isinstance(first_ind, dict) else 0,
            "first_product": first_ind.get('products', [{}])[0] if isinstance(first_ind, dict) and first_ind.get('products') else None
        }
    
    return result



@api_router.get("/analytics/test-by-name")
async def test_by_name(name: str, current_user: dict = Depends(get_current_user)):
    """Test endpoint to see exact client structure by name"""
    client = await db.clients.find_one({"name": {"$regex": name, "$options": "i"}, "user_id": current_user['id']}, {"_id": 0})
    if not client:
        return {"error": f"Client not found with name containing: {name}"}
    
    # Get industries structure
    industries_obj = client.get('industries', {})
    result = {
        "client_name": client.get('name'),
        "industries_type": str(type(industries_obj)),
        "industries_keys": list(industries_obj.keys()) if isinstance(industries_obj, dict) else None,
        "industries_raw": industries_obj
    }
    
    return result

@api_router.get("/analytics/debug-raw")


@api_router.get("/analytics/list-all-clients")
async def list_all_clients(current_user: dict = Depends(get_current_user)):
    """List all clients in database"""
    clients = await db.clients.find({"user_id": current_user['id']}).to_list(100)
    
    result = {
        "total_clients": len(clients),
        "clients": []
    }
    
    for client in clients:
        industries_obj = client.get('industries', {})
        result["clients"].append({
            "name": client.get('name'),
            "city": client.get('CIDADE'),
            "has_industries": isinstance(industries_obj, dict) and len(industries_obj) > 0,
            "industries_count": len(industries_obj) if isinstance(industries_obj, dict) else 0,
            "industries_names": list(industries_obj.keys()) if isinstance(industries_obj, dict) else []
        })
    
    return result



@api_router.get("/analytics/test-by-city")
async def test_by_city(city: str, current_user: dict = Depends(get_current_user)):
    """Get full client structure by city"""
    client = await db.clients.find_one({"CIDADE": city, "user_id": current_user['id']}, {"_id": 0})
    if not client:
        return {"error": f"Client not found in city: {city}"}
    
    # Return full structure
    return {
        "client": client
    }

@api_router.delete("/analytics/reset-all-data")
async def reset_all_data(current_user: dict = Depends(get_current_user)):
    """Delete all campaigns and clients for current user - DANGER!"""
    
    # Delete all clients
    clients_result = await db.clients.delete_many({"user_id": current_user['id']})
    
    # Delete all campaigns
    campaigns_result = await db.campaigns.delete_many({"user_id": current_user['id']})
    
    # Delete all sheets
    sheets_result = await db.sheets.delete_many({"user_id": current_user['id']})
    
    return {
        "success": True,
        "deleted_clients": clients_result.deleted_count,
        "deleted_campaigns": campaigns_result.deleted_count,
        "deleted_sheets": sheets_result.deleted_count,
        "message": "Todos os dados foram excluídos. Você pode começar do zero!"
    }

@api_router.get("/analytics/debug-raw")
async def debug_raw_data(current_user: dict = Depends(get_current_user)):
    """Show raw structure of first client"""
    campaign = await db.campaigns.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        return {"error": "No campaign found"}
    
    campaign_id = campaign.get('id')
    clients = await db.clients.find({"campaign_id": campaign_id, "user_id": current_user['id']}).to_list(10)
    
    if not clients:
        return {"error": "No clients found"}
    
    # Get raw structure of first client
    first_client = clients[0]
    
    return {
        "campaign_industries_raw": [ind for ind in campaign.get('industries', [])],
        "first_client_raw": {
            "name": first_client.get('name'),
            "industries": first_client.get('industries', [])
        }
    }


# ==================== MERCADO PAGO ROUTES ====================

import mercadopago
import hmac
import hashlib

# Initialize Mercado Pago SDK
mp_access_token = os.environ.get('MP_ACCESS_TOKEN', '')
mp_sdk = mercadopago.SDK(mp_access_token) if mp_access_token else None

class PaymentPreferenceCreate(BaseModel):
    plan: str  # "monthly_30" or "annual_300"
    payer_email: str
    payer_name: Optional[str] = None

class WebhookNotification(BaseModel):
    action: str
    api_version: str
    data: Dict[str, Any]
    date_created: str
    id: int
    live_mode: bool
    type: str
    user_id: str

# ==================== Subscription Models ====================
class SubscriptionPlanCreate(BaseModel):
    plan_type: str  # "monthly" or "annual"

class SubscriptionCreate(BaseModel):
    card_token: str
    plan_type: str  # "monthly" or "annual"
    payer_email: str

class SubscriptionResponse(BaseModel):
    subscription_id: str
    status: str
    init_point: str
    next_payment_date: Optional[str] = None
    auto_recurring: Optional[Dict] = None

@api_router.get("/payments/config")
async def get_payment_config():
    """Retorna a Public Key para o frontend"""
    return {
        "public_key": os.environ.get('MP_PUBLIC_KEY', ''),
        "plans": [
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
                "interval": "year",
                "discount": "Economia de R$ 60,00/ano"
            }
        ]
    }

@api_router.post("/payments/create-preference")
async def create_payment_preference(
    preference_data: PaymentPreferenceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Cria uma preferência de pagamento no Mercado Pago"""
    if not mp_sdk:
        raise HTTPException(status_code=500, detail="Mercado Pago não configurado")
    
    # Determinar valor baseado no plano
    plan_prices = {
        "monthly_30": 30.00,
        "monthly_simple": 35.00,
        "monthly": 29.90,
        "annual_300": 300.00,
        "annual": 300.00
    }
    
    if preference_data.plan not in plan_prices:
        raise HTTPException(status_code=400, detail="Plano inválido")
    
    amount = plan_prices[preference_data.plan]
    
    # Nome do plano para exibição
    plan_names = {
        "monthly_30": "Plano Mensal",
        "monthly_simple": "Plano Mensal Flexível",
        "monthly": "Plano Mensal 12 meses",
        "annual_300": "Plano Anual",
        "annual": "Plano Anual"
    }
    
    # Criar preferência de pagamento com Pix habilitado
    preference_payload = {
        "items": [
            {
                "title": f"{plan_names.get(preference_data.plan, 'Assinatura')} - Anota & Ganha",
                "description": "Assinatura mensal do sistema de incentivos",
                "quantity": 1,
                "unit_price": amount,
                "currency_id": "BRL"
            }
        ],
        "payer": {
            "email": preference_data.payer_email,
            "name": preference_data.payer_name or current_user.get('name', '')
        },
        "back_urls": {
            "success": f"{FRONTEND_URL}/payment/success",
            "failure": f"{FRONTEND_URL}/payment/failure",
            "pending": f"{FRONTEND_URL}/payment/pending"
        },
        "auto_return": "approved",
        "external_reference": f"{current_user['id']}:{preference_data.plan}",
        "notification_url": f"{BACKEND_URL}/api/payments/webhook",
        "statement_descriptor": "ANOTA & GANHA",
        "payment_methods": {
            "excluded_payment_types": [],
            "installments": 1  # Sem parcelamento
        }
    }
    
    try:
        preference_response = mp_sdk.preference().create(preference_payload)
        preference = preference_response["response"]
        
        # Salvar referência no banco
        payment_ref = {
            "id": str(uuid.uuid4()),
            "user_id": current_user['id'],
            "preference_id": preference["id"],
            "plan": preference_data.plan,
            "amount": amount,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.payment_references.insert_one(payment_ref)
        
        return {
            "preference_id": preference["id"],
            "init_point": preference["init_point"],
            "sandbox_init_point": preference.get("sandbox_init_point"),
            "payment_ref_id": payment_ref["id"]
        }
    except Exception as e:
        logger.error(f"Erro ao criar preferência: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao criar pagamento: {str(e)}")

@api_router.post("/payments/webhook")
async def mercadopago_webhook(request: dict):
    """Recebe notificações do Mercado Pago (pagamentos e assinaturas)"""
    logger.info(f"Webhook recebido: {request}")
    
    # Verificar tipo de notificação
    notification_type = request.get("type")
    
    # ===== ASSINATURAS =====
    if notification_type in ["subscription_authorized", "subscription_payment", "subscription_preapproval"]:
        subscription_id = request.get("data", {}).get("id")
        
        if not subscription_id:
            return {"status": "ok"}
        
        try:
            # Buscar informações da assinatura
            subscription_info = mp_sdk.preapproval().get(subscription_id)
            subscription = subscription_info["response"]
            
            logger.info(f"Assinatura info: {subscription}")
            
            external_ref = subscription.get("external_reference", "")
            subscription_status = subscription.get("status")
            
            # Extrair user_id do external_reference
            if ":" in external_ref:
                user_id = external_ref.split(":")[0]
                
                # Atualizar status da assinatura no banco
                await db.subscriptions.update_one(
                    {"subscription_id": subscription_id},
                    {"$set": {
                        "status": subscription_status,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                # Se assinatura foi autorizada, ativar licença
                if subscription_status == "authorized":
                    logger.info(f"Assinatura autorizada! Ativando licença para user {user_id}")
                    
                    # Buscar dados da assinatura no banco para saber o tipo
                    sub_ref = await db.subscriptions.find_one({"subscription_id": subscription_id})
                    
                    if sub_ref:
                        plan_type = sub_ref.get("plan_type")
                        
                        # Determinar tipo e duração da licença
                        if plan_type in ["monthly", "monthly_simple"]:
                            license_type = "monthly"
                            expiry = datetime.now(timezone.utc) + timedelta(days=30)
                        else:  # annual
                            license_type = "annual"
                            expiry = datetime.now(timezone.utc) + timedelta(days=365)
                        
                        # Atualizar usuário
                        await db.users.update_one(
                            {"id": user_id},
                            {"$set": {
                                "license_type": license_type,
                                "license_expiry": expiry.isoformat(),
                                "last_payment_date": datetime.now(timezone.utc).isoformat(),
                                "payment_method": "mercadopago_subscription",
                                "subscription_id": subscription_id
                            }}
                        )
                        
                        logger.info(f"Licença {license_type} ativada via assinatura!")
                
                # Se pagamento recorrente foi processado, renovar licença
                elif notification_type == "subscription_payment":
                    logger.info(f"Pagamento recorrente processado para user {user_id}")
                    
                    sub_ref = await db.subscriptions.find_one({"subscription_id": subscription_id})
                    
                    if sub_ref:
                        plan_type = sub_ref.get("plan_type")
                        
                        # Renovar licença
                        if plan_type in ["monthly", "monthly_simple"]:
                            expiry = datetime.now(timezone.utc) + timedelta(days=30)
                        else:  # annual
                            expiry = datetime.now(timezone.utc) + timedelta(days=365)
                        
                        await db.users.update_one(
                            {"id": user_id},
                            {"$set": {
                                "license_expiry": expiry.isoformat(),
                                "last_payment_date": datetime.now(timezone.utc).isoformat()
                            }}
                        )
                        
                        logger.info("Licença renovada via pagamento recorrente!")
            
            return {"status": "ok"}
            
        except Exception as e:
            logger.error(f"Erro ao processar webhook de assinatura: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    # ===== PAGAMENTOS ÚNICOS (ANTIGO) =====
    elif notification_type == "payment":
        payment_id = request.get("data", {}).get("id")
        
        if not payment_id:
            return {"status": "ok"}
        
        try:
            # Buscar informações do pagamento
            payment_info = mp_sdk.payment().get(payment_id)
            payment = payment_info["response"]
            
            logger.info(f"Pagamento info: {payment}")
            
            # Extrair external_reference (user_id:plan)
            external_ref = payment.get("external_reference", "")
            if ":" not in external_ref:
                logger.warning(f"External reference inválido: {external_ref}")
                return {"status": "ok"}
            
            user_id, plan = external_ref.split(":", 1)
            payment_status = payment.get("status")
            
            # Atualizar referência de pagamento
            await db.payment_references.update_one(
                {"user_id": user_id, "plan": plan, "status": "pending"},
                {"$set": {
                    "payment_id": str(payment_id),
                    "status": payment_status,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "payment_data": {
                        "transaction_amount": payment.get("transaction_amount"),
                        "status_detail": payment.get("status_detail"),
                        "payment_method_id": payment.get("payment_method_id")
                    }
                }}
            )
            
            # Se pagamento aprovado, ativar licença
            if payment_status == "approved":
                logger.info(f"Pagamento aprovado! Ativando licença para user {user_id}")
                
                # Determinar tipo e duração da licença
                if plan == "monthly_30":
                    license_type = "monthly"
                    license_plan = "monthly_30"
                    expiry = datetime.now(timezone.utc) + timedelta(days=30)
                elif plan == "annual_300":
                    license_type = "annual"
                    license_plan = "annual_300"
                    expiry = datetime.now(timezone.utc) + timedelta(days=365)
                else:
                    logger.warning(f"Plano desconhecido: {plan}")
                    return {"status": "ok"}
                
                # Atualizar usuário
                update_result = await db.users.update_one(
                    {"id": user_id},
                    {"$set": {
                        "license_type": license_type,
                        "license_plan": license_plan,
                        "license_expiry": expiry.isoformat(),
                        "last_payment_date": datetime.now(timezone.utc).isoformat(),
                        "payment_method": "mercadopago"
                    }}
                )
                
                logger.info(f"Licença ativada! Documentos modificados: {update_result.modified_count}")
            
            return {"status": "ok"}
            
        except Exception as e:
            logger.error(f"Erro ao processar webhook: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    return {"status": "ok"}

@api_router.get("/payments/status/{payment_ref_id}")
async def get_payment_status(
    payment_ref_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Consulta o status de um pagamento"""
    payment_ref = await db.payment_references.find_one(
        {"id": payment_ref_id, "user_id": current_user['id']},
        {"_id": 0}
    )
    
    if not payment_ref:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    
    # Se tem payment_id, buscar status atualizado no Mercado Pago
    if payment_ref.get("payment_id") and mp_sdk:
        try:
            payment_info = mp_sdk.payment().get(payment_ref["payment_id"])
            payment = payment_info["response"]
            
            # Atualizar status no banco
            current_status = payment.get("status")
            await db.payment_references.update_one(
                {"id": payment_ref_id},
                {"$set": {"status": current_status}}
            )
            
            payment_ref["status"] = current_status
        except Exception as e:
            logger.error(f"Erro ao buscar status do pagamento: {str(e)}")
    
    return payment_ref


# ==================== Subscription Endpoints ====================

@api_router.post("/subscriptions/create")
async def create_subscription(
    subscription_data: SubscriptionCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Cria uma assinatura recorrente no Mercado Pago.
    Planos disponíveis: monthly (12x R$ 29,00) ou annual (R$ 300,00)
    """
    try:
        if not mp_sdk:
            raise HTTPException(
                status_code=500,
                detail="Mercado Pago não configurado"
            )
        
        # Determinar configuração do plano
        if subscription_data.plan_type == "monthly_simple":
            reason = "Assinatura Mensal - Anota & Ganha Incentivos"
            amount = MONTHLY_SIMPLE_PRICE
            frequency = 1
            frequency_type = "months"
        elif subscription_data.plan_type == "monthly":
            reason = "Assinatura Mensal (12 meses) - Anota & Ganha Incentivos"
            amount = MONTHLY_PRICE
            frequency = 1
            frequency_type = "months"
        elif subscription_data.plan_type == "annual":
            reason = "Assinatura Anual - Anota & Ganha Incentivos"
            amount = ANNUAL_PRICE
            frequency = 1
            frequency_type = "years"
        else:
            raise HTTPException(
                status_code=400,
                detail="Tipo de plano inválido. Use 'monthly_simple', 'monthly' ou 'annual'"
            )
        
        # Criar dados da assinatura SEM repetitions (assinatura contínua)
        # O Mercado Pago cobra automaticamente até ser cancelado
        preapproval_data = {
            "reason": reason,
            "auto_recurring": {
                "frequency": frequency,
                "frequency_type": frequency_type,
                "transaction_amount": amount,
                "currency_id": "BRL"
            },
            "payer_email": subscription_data.payer_email,
            "back_url": f"{FRONTEND_URL}/payment/success",
            "external_reference": f"{current_user['id']}:subscription:{subscription_data.plan_type}",
            "status": "pending",
            # Adicionar informações adicionais para reduzir "high risk"
            "collector_id": 54275427,  # Seu collector ID
            "application_id": 6279807309571506  # Seu application ID
        }
        
        # Se tiver card_token, incluir (mas na prática não funciona com CardPayment)
        # Melhor abordagem é redirecionar para init_point
        # if subscription_data.card_token:
        #     preapproval_data["card_token_id"] = subscription_data.card_token
        
        logger.info(f"Criando assinatura para usuário {current_user['id']}: {subscription_data.plan_type}")
        logger.info(f"Email do pagador: {subscription_data.payer_email}")
        logger.info(f"Dados da assinatura: {preapproval_data}")
        
        # Criar assinatura no Mercado Pago
        result = mp_sdk.preapproval().create(preapproval_data)
        
        logger.info(f"Resposta do Mercado Pago - Status: {result.get('status')}")
        
        if result["status"] not in [200, 201]:
            logger.error(f"Erro ao criar assinatura: {result}")
            error_msg = result.get('response', {}).get('message', 'Erro desconhecido')
            logger.error(f"Mensagem de erro: {error_msg}")
            raise HTTPException(
                status_code=400,
                detail=f"Erro ao criar assinatura: {error_msg}"
            )
        
        response = result["response"]
        subscription_id = response.get("id")
        
        logger.info(f"Assinatura criada com sucesso: {subscription_id}")
        
        # Salvar referência da assinatura no banco
        subscription_ref = {
            "id": str(uuid.uuid4()),
            "user_id": current_user['id'],
            "subscription_id": subscription_id,
            "plan_type": subscription_data.plan_type,
            "status": response.get("status", "pending"),
            "amount": amount,
            "frequency": f"{frequency} {frequency_type}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.subscriptions.insert_one(subscription_ref)
        
        return {
            "subscription_id": subscription_id,
            "status": response.get("status"),
            "init_point": response.get("init_point"),
            "next_payment_date": response.get("next_payment_date"),
            "auto_recurring": response.get("auto_recurring")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao criar assinatura: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro interno ao criar assinatura: {str(e)}"
        )

@api_router.get("/subscriptions/status")
async def get_subscription_status(
    current_user: dict = Depends(get_current_user)
):
    """Consulta o status da assinatura do usuário"""
    subscription_ref = await db.subscriptions.find_one(
        {"user_id": current_user['id']},
        {"_id": 0},
        sort=[("created_at", -1)]  # Pegar a mais recente
    )
    
    if not subscription_ref:
        return {"has_subscription": False}
    
    # Se tem subscription_id, buscar status atualizado no Mercado Pago
    if subscription_ref.get("subscription_id") and mp_sdk:
        try:
            result = mp_sdk.preapproval().get(subscription_ref["subscription_id"])
            
            if result["status"] == 200:
                subscription = result["response"]
                current_status = subscription.get("status")
                
                # Atualizar status no banco
                await db.subscriptions.update_one(
                    {"id": subscription_ref["id"]},
                    {"$set": {
                        "status": current_status,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                subscription_ref["status"] = current_status
                subscription_ref["next_payment_date"] = subscription.get("next_payment_date")
                subscription_ref["summarized"] = subscription.get("summarized")
                
        except Exception as e:
            logger.error(f"Erro ao buscar status da assinatura: {str(e)}")
    
    return {
        "has_subscription": True,
        "subscription": subscription_ref
    }

@api_router.delete("/subscriptions/cancel")
async def cancel_subscription(
    current_user: dict = Depends(get_current_user)
):
    """Cancela a assinatura ativa do usuário"""
    try:
        # Buscar assinatura ativa
        subscription_ref = await db.subscriptions.find_one(
            {"user_id": current_user['id'], "status": {"$in": ["authorized", "pending"]}},
            sort=[("created_at", -1)]
        )
        
        if not subscription_ref:
            raise HTTPException(
                status_code=404,
                detail="Nenhuma assinatura ativa encontrada"
            )
        
        if not mp_sdk:
            raise HTTPException(
                status_code=500,
                detail="Mercado Pago não configurado"
            )
        
        # Cancelar no Mercado Pago
        subscription_id = subscription_ref["subscription_id"]
        update_data = {"status": "cancelled"}
        
        result = mp_sdk.preapproval().update(subscription_id, update_data)
        
        if result["status"] != 200:
            raise HTTPException(
                status_code=400,
                detail="Erro ao cancelar assinatura no Mercado Pago"
            )
        
        # Atualizar no banco
        await db.subscriptions.update_one(
            {"id": subscription_ref["id"]},
            {"$set": {
                "status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        logger.info(f"Assinatura cancelada: {subscription_id}")
        
        return {"message": "Assinatura cancelada com sucesso"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao cancelar assinatura: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro interno ao cancelar assinatura: {str(e)}"
        )


# CORS MIDDLEWARE - MUST BE ADDED BEFORE INCLUDING ROUTES
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the router in the main app
app.include_router(api_router)

# Startup event to start background tasks
@app.on_event("startup")
async def startup_event():
    """Start background tasks on application startup"""
    logger.info("Starting background tasks...")
    asyncio.create_task(check_expiring_trials())
    logger.info("Trial expiration checker started")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()