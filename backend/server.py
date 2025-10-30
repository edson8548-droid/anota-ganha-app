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
        logging.error(f\"Database operation timed out after {timeout} seconds\")
        raise HTTPException(status_code=504, detail=\"Database operation timed out\")
    except Exception as e:
        logging.error(f\"Database operation failed: {str(e)}\")
        raise

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = \"HS256\"
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
    \"\"\"Send trial expiration warning email via SendGrid\"\"\"
    if not SENDGRID_API_KEY:
        logger.warning(\"SendGrid not configured, skipping email\")
        return
    
    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail
        
        sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
        
        if days_remaining == 5:
            subject = \"⚡ Seu teste grátis expira em 5 dias!\"
            html_content = f\"\"\"
            <h2>Olá! 👋</h2>
            <p>Seu período de teste gratuito do <strong>Anota & Ganha Incentivos</strong> expira em <strong>5 dias</strong>!</p>
            <p>Não perca o acesso a todas as funcionalidades:</p>
            <ul>
                <li>✅ Campanhas ilimitadas</li>
                <li>✅ Clientes ilimitados</li>
                <li>✅ Analytics completo</li>
            </ul>
            <p><a href=\"{FRONTEND_URL}/pricing\" style=\"background:#3B82F6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:16px;\">Ver Planos</a></p>
            <p>A partir de <strong>R$ 29,90/mês</strong> ou <strong>R$ 300/ano</strong>!</p>
            \"\"\"
        elif days_remaining == 1:
            subject = \"🚨 ÚLTIMO DIA de teste grátis!\"
            html_content = f\"\"\"
            <h2 style=\"color:#DC2626;\">ATENÇÃO: Último Dia! 🚨</h2>
            <p>Seu teste grátis do <strong>Anota & Ganha Incentivos</strong> expira <strong>HOJE</strong>!</p>
            <p><strong>Assine agora</strong> para não perder o acesso amanhã:</p>
            <ul>
                <li>💳 <strong>Mensal:</strong> 12x de R$ 29,90</li>
                <li>💰 <strong>Anual:</strong> R$ 300 (economize R$ 120!)</li>
            </ul>
            <p><a href=\"{FRONTEND_URL}/pricing\" style=\"background:#DC2626;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:16px;font-size:18px;font-weight:bold;\">ASSINAR AGORA</a></p>
            \"\"\"
        elif days_remaining == 0:
            subject = \"❌ Seu teste expirou - Escolha um plano\"
            html_content = f\"\"\"
            <h2>Seu teste expirou 😔</h2>
            <p>Seu período de teste gratuito do <strong>Anota & Ganha Incentivos</strong> terminou.</p>
            <p>Para continuar usando o app e não perder suas campanhas e clientes, escolha um plano:</p>
            <ul>
                <li>💳 <strong>Mensal Flexível:</strong> R$ 35/mês (cancele quando quiser)</li>
                <li>💰 <strong>12 meses:</strong> 12x R$ 29,90</li>
                <li>🎁 <strong>Anual:</strong> R$ 300 (2 meses grátis!)</li>
            </ul>
            <p><a href=\"{FRONTEND_URL}/pricing\" style=\"background:#F59E0B;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;margin-top:16px;font-size:18px;font-weight:bold;\">ESCOLHER PLANO</a></p>
            <p style=\"margin-top:24px;color:#666;\">Precisa de ajuda? Entre em contato: <a href=\"https://wa.me/5517996040954\">WhatsApp</a></p>
            \"\"\"
        else:
            return
        
        message = Mail(
            from_email=SENDER_EMAIL,
            to_emails=user_email,
            subject=subject,
            html_content=html_content
        )
        
        response = sg.send(message)
        logger.info(f\"Email sent to {user_email}: {subject} (status: {response.status_code})\")
    except Exception as e:
        logger.error(f\"Failed to send email to {user_email}: {str(e)}\")

# Background task to check and notify expiring trials
async def check_expiring_trials():
    \"\"\"Check for expiring trials and send notification emails\"\"\"
    while True:
        try:
            await asyncio.sleep(3600)  # Check every hour
            
            now = datetime.now(timezone.utc)
            
            # Find users with expiring trials
            users = await db.users.find({
                \"license_type\": \"trial\",
                \"license_expiry\": {\"$exists\": True}
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
                email_sent_field = f\"notification_sent_{days_remaining}d\"
                
                if days_remaining in [5, 1, 0] and not user.get(email_sent_field):
                    await send_trial_expiration_email(user['email'], days_remaining)
                    
                    # Mark as sent
                    await db.users.update_one(
                        {\"email\": user['email']},
                        {\"$set\": {email_sent_field: True}}
                    )
                    
        except Exception as e:
            logger.error(f\"Error checking expiring trials: {str(e)}\")
            await asyncio.sleep(300)  # Wait 5 minutes on error

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix=\"/api\")


# Health check endpoint (sem prefixo /api para monitoramento)
@app.get(\"/health\")
async def health_check():
    try:
        # Testar conexão com MongoDB
        await db.command('ping')
        return {
            \"status\": \"healthy\",
            \"database\": \"connected\",
            \"service\": \"running\"
        }
    except Exception as e:
        return {
            \"status\": \"unhealthy\",
            \"database\": \"disconnected\",
            \"error\": str(e)
        }


# ==================== Models ====================

class User(BaseModel):
    model_config = ConfigDict(extra=\"ignore\")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: Optional[str] = \"\"
    cpf: Optional[str] = \"\"
    phone: Optional[str] = \"\"
    role: str = \"user\"  # user, admin
    license_type: str = \"trial\"  # trial, monthly, annual, expired
    license_plan: Optional[str] = None  # monthly_30, annual_300
    license_expiry: Optional[datetime] = None
    trial_started: Optional[datetime] = None
    payment_method: Optional[str] = None  # mercadopago, stripe, manual
    last_payment_date: Optional[datetime] = None
    subscription_id: Optional[str] = None  # ID do gateway de pagamento
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: str
    name: Optional[str] = \"\"
    password: str
    cpf: Optional[str] = \"\"
    phone: Optional[str] = \"\"

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class Industry(BaseModel):
    \"\"\"Indústria com seus produtos\"\"\"
    name: str  # Nome da indústria (ex: \"Camil\", \"JDE Café Turbinado\")
    goal: float = 0.0  # Meta de valor da indústria
    products: List[str] = []  # Lista de produtos da indústria

class Campaign(BaseModel):
    model_config = ConfigDict(extra=\"ignore\")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    start_date: datetime
    end_date: Optional[datetime] = None
    status: str = \"active\"  # active, paused, completed
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
    model_config = ConfigDict(extra=\"ignore\")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    campaign_id: str
    name: str
    icon: str = \"Building\"
    headers: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SheetCreate(BaseModel):
    campaign_id: str
    name: str
    icon: str = \"Building\"
    headers: List[str] = []

class SheetUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    headers: Optional[List[str]] = None

class Client(BaseModel):
    model_config = ConfigDict(extra=\"ignore\")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    sheet_id: str
    campaign_id: str
    CLIENTE: str
    CNPJ: Optional[str] = \"\"
    ENDERECO: Optional[str] = \"\"
    CIDADE: Optional[str] = \"\"
    BAIRRO: Optional[str] = \"\"  # Novo campo
    # Nova estrutura: produtos agrupados por indústria
    # {\"Camil\": {\"products\": {\"Sardinha Coqueiro\": {\"status\": \"positivado\", \"value\": 150}, ...}, \"industry_status\": \"positivado\"}}
    industries: Dict[str, Dict[str, Any]] = {}
    # Manter products para compatibilidade com dados antigos
    products: Optional[Dict[str, Dict[str, Any]]] = None
    notes: Optional[str] = \"\"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ClientCreate(BaseModel):
    sheet_id: str
    campaign_id: str
    CLIENTE: str
    CNPJ: Optional[str] = \"\"
    ENDERECO: Optional[str] = \"\"
    CIDADE: Optional[str] = \"\"
    BAIRRO: Optional[str] = \"\"  # Novo campo
    industries: Dict[str, Dict[str, Any]] = {}
    # Manter products para compatibilidade
    products: Optional[Dict[str, Dict[str, Any]]] = None
    notes: Optional[str] = \"\"

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
    to_encode.update({\"exp\": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get(\"sub\")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=\"Invalid token\")
        
        user = await db.users.find_one({\"id\": user_id}, {\"_id\": 0})
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=\"User not found\")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=\"Token expired\")
    except jwt.JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=\"Invalid token\")

# ==================== Email Functions ====================

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    \"\"\"
    Envia email de recuperação de senha usando SendGrid
    \"\"\"
    try:
        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        reset_link = f\"{frontend_url}/reset-password?token={reset_token}\"
        
        html_content = f\"\"\"
        <html>
            <body style=\"font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;\">
                <div style=\"max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);\">
                    <h2 style=\"color: #2563eb; text-align: center;\">Recuperação de Senha</h2>
                    <p>Olá,</p>
                    <p>Você solicitou a recuperação de senha para sua conta no <strong>Anota & Ganha Incentivos</strong>.</p>
                    <p>Clique no botão abaixo para redefinir sua senha:</p>
                    <div style=\"text-align: center; margin: 30px 0;\">
                        <a href=\"{reset_link}\" style=\"background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;\">Redefinir Senha</a>
                    </div>
                    <p style=\"color: #666; font-size: 14px;\">Ou copie e cole este link no seu navegador:</p>
                    <p style=\"color: #2563eb; font-size: 12px; word-break: break-all;\">{reset_link}</p>
                    <hr style=\"border: none; border-top: 1px solid #ddd; margin: 20px 0;\">
                    <p style=\"color: #999; font-size: 12px;\">Este link é válido por 1 hora.</p>
                    <p style=\"color: #999; font-size: 12px;\">Se você não solicitou esta recuperação, ignore este email.</p>
                </div>
            </body>
        </html>
        \"\"\"
        
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
        logging.error(f\"Erro ao enviar email: {str(e)}\")
        return False


# ==================== Auth Routes ====================

@api_router.post(\"/auth/register\", response_model=Token)
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({\"email\": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail=\"Email já está em uso\")
    
    # Check if this is the admin email
    is_admin = user_data.email == \"edson854_8@hotmail.com\"
    
    # Create user with 15 day trial (or admin access)
    trial_start = datetime.now(timezone.utc)
    trial_end = trial_start + timedelta(days=15)
    
    user_obj = User(
        email=user_data.email,
        name=user_data.name or user_data.email.split('@')[0],
        cpf=user_data.cpf or \"\",
        phone=user_data.phone or \"\",
        role=\"admin\" if is_admin else \"user\",
        license_type=\"annual\" if is_admin else \"trial\",  # Admin nunca expira
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
    access_token = create_access_token(data={\"sub\": user_obj.id})
    
    return Token(
        access_token=access_token,
        token_type=\"bearer\",
        user=user_obj
    )

@api_router.post(\"/auth/login\", response_model=Token)
async def login(user_data: UserLogin):
    user = await db.users.find_one({\"email\": user_data.email})
    if not user or not verify_password(user_data.password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail=\"Email ou senha inválidos\")
    
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
                    {\"email\": user_data.email},
                    {\"$set\": {\"license_type\": \"expired\"}}
                )
                raise HTTPException(
                    status_code=403, 
                    detail=\"Seu período de teste expirou. Escolha um plano para continuar usando.\"
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
    access_token = create_access_token(data={\"sub\": user_obj.id})
    
    return Token(
        access_token=access_token,
        token_type=\"bearer\",
        user=user_obj
    )

@api_router.get(\"/auth/me\", response_model=User)
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
@api_router.post(\"/auth/forgot-password\")
async def forgot_password(email: str):
    user = await db.users.find_one({\"email\": email})
    if not user:
        # Don't reveal if email exists
        return {\"message\": \"Se o email existir, você receberá um link de recuperação\"}
    
    # Generate reset token (valid for 1 hour)
    reset_token = str(uuid.uuid4())
    reset_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    
    await db.users.update_one(
        {\"email\": email},
        {\"$set\": {
            \"reset_token\": reset_token,
            \"reset_token_expiry\": reset_expiry.isoformat()
        }}
    )
    
    # Send email via SendGrid
    email_sent = send_password_reset_email(email, reset_token)
    
    if not email_sent:
        logging.warning(f\"Falha ao enviar email de recuperação para {email}\")
    
    return {
        \"message\": \"Se o email existir, você receberá um link de recuperação\"
    }

@api_router.post(\"/auth/reset-password\")
async def reset_password(reset_token: str, new_password: str):
    user = await db.users.find_one({\"reset_token\": reset_token})
    if not user:
        raise HTTPException(status_code=400, detail=\"Token inválido\")
    
    # Check if token expired
    if isinstance(user.get('reset_token_expiry'), str):
        expiry = datetime.fromisoformat(user['reset_token_expiry'])
    else:
        expiry = user.get('reset_token_expiry')
    
    if not expiry or datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=400, detail=\"Token expirado. Solicite um novo link\")
    
    # Update password
    new_hash = hash_password(new_password)
    await db.users.update_one(
        {\"reset_token\": reset_token},
        {\"$set\": {
            \"password_hash\": new_hash,
            \"reset_token\": None,
            \"reset_token_expiry\": None
        }}
    )
    
    return {\"message\": \"Senha alterada com sucesso!\"}


# License Management
@api_router.get(\"/plans\")
async def get_plans():
    \"\"\"Retorna os planos disponíveis\"\"\"
    return {
        \"plans\": [
            {
                \"id\": \"monthly_30\",
                \"name\": \"Mensal\",
                \"price\": 30.00,
                \"currency\": \"BRL\",
                \"interval\": \"month\",
                \"interval_count\": 1,
                \"features\": [
                    \"Campanhas ilimitadas\",
                    \"Clientes ilimitados\",
                    \"Relatórios por cidade\",
                    \"Suporte via email\"
                ]
            },
            {
                \"id\": \"annual_300\",
                \"name\": \"Anual\",
                \"price\": 300.00,
                \"original_price\": 360.00,
                \"discount\": 60.00,
                \"discount_percent\": 16.67,
                \"currency\": \"BRL\",
                \"interval\": \"year\",
                \"interval_count\": 1,
                \"features\": [
                    \"Campanhas ilimitadas\",
                    \"Clientes ilimitados\",
                    \"Relatórios por cidade\",
                    \"Suporte prioritário\",
                    \"Economia de R$ 60,00/ano\"
                ],
                \"highlight\": True
            }
        ]
    }

@api_router.post(\"/license/activate\")
async def activate_license(license_key: str, current_user: dict = Depends(get_current_user)):
    # Simple license key validation
    # Monthly: MONTHLY-XXXX-XXXX-XXXX
    # Annual: ANNUAL-XXXX-XXXX-XXXX
    
    is_monthly = license_key.startswith(\"MONTHLY-\")
    is_annual = license_key.startswith(\"ANNUAL-\")
    
    if not is_monthly and not is_annual:
        raise HTTPException(status_code=400, detail=\"Chave de licença inválida\")
    
    # Check if license key already used
    existing = await db.users.find_one({\"license_key\": license_key})
    if existing and existing['id'] != current_user['id']:
        raise HTTPException(status_code=400, detail=\"Esta chave já foi utilizada\")
    
    # Activate license
    if is_monthly:
        expiry = datetime.now(timezone.utc) + timedelta(days=30)
        license_type = \"monthly\"
        license_plan = \"monthly_30\"
    else:
        expiry = datetime.now(timezone.utc) + timedelta(days=365)
        license_type = \"annual\"
        license_plan = \"annual_300\"
    
    await db.users.update_one(
        {\"id\": current_user['id']},
        {\"$set\": {
            \"license_type\": license_type,
            \"license_plan\": license_plan,
            \"license_key\": license_key,
            \"license_expiry\": expiry.isoformat(),
            \"last_payment_date\": datetime.now(timezone.utc).isoformat(),
            \"payment_method\": \"manual\"
        }}
    )
    
    return {
        \"message\": f\"Licença {license_type} ativada com sucesso!\",
        \"expiry_date\": expiry.isoformat(),
        \"license_type\": license_type,
        \"plan\": license_plan
    }

@api_router.get(\"/license/status\")
async def get_license_status(current_user: dict = Depends(get_current_user)):
    if isinstance(current_user.get('license_expiry'), str):
        expiry = datetime.fromisoformat(current_user['license_expiry'])
    else:
        expiry = current_user.get('license_expiry')
    
    days_remaining = 0
    if expiry:
        days_remaining = (expiry - datetime.now(timezone.utc)).days
    
    return {
        \"license_type\": current_user.get('license_type', 'trial'),
        \"license_plan\": current_user.get('license_plan'),
        \"expiry_date\": expiry.isoformat() if expiry else None,
        \"days_remaining\": max(0, days_remaining),
        \"is_expired\": days_remaining <= 0 if expiry else False,
        \"email\": current_user.get('email'),
        \"role\": current_user.get('role', 'user')
    }


# ==================== ADMIN ROUTES ====================

async def require_admin(current_user: dict = Depends(get_current_user)):
    \"\"\"Middleware para verificar se é admin\"\"\"
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail=\"Acesso negado. Apenas administradores.\")
    return current_user

@api_router.get(\"/admin/users\")
async def admin_get_users(admin: dict = Depends(require_admin)):
    \"\"\"Lista todos os usuários (apenas admin)\"\"\"
    users = await db.users.find({}, {\"_id\": 0, \"password_hash\": 0, \"reset_token\": 0}).to_list(1000)
    
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
    
    return {\"users\": users, \"total\": len(users)}

@api_router.get(\"/admin/stats\")
async def admin_get_stats(admin: dict = Depends(require_admin)):
    \"\"\"Estatísticas gerais (apenas admin)\"\"\"
    all_users = await db.users.find({}, {\"_id\": 0}).to_list(1000)
    
    stats = {
        \"total_users\": len(all_users),
        \"trial_users\": len([u for u in all_users if u.get('license_type') == 'trial']),
        \"monthly_users\": len([u for u in all_users if u.get('license_type') == 'monthly']),
        \"annual_users\": len([u for u in all_users if u.get('license_type') == 'annual']),
        \"expired_users\": len([u for u in all_users if u.get('license_type') == 'expired']),
        \"admin_users\": len([u for u in all_users if u.get('role') == 'admin'])
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

@api_router.post(\"/admin/activate-user\")
async def admin_activate_user(
    user_email: str,
    plan: str,  # monthly_30 or annual_300
    admin: dict = Depends(require_admin)
):
    \"\"\"Ativa manualmente a licença de um usuário (apenas admin)\"\"\"
    user = await db.users.find_one({\"email\": user_email})
    if not user:
        raise HTTPException(status_code=404, detail=\"Usuário não encontrado\")
    
    # Set expiry based on plan
    if plan == \"monthly_30\":
        expiry = datetime.now(timezone.utc) + timedelta(days=30)
        license_type = \"monthly\"
    elif plan == \"annual_300\":
        expiry = datetime.now(timezone.utc) + timedelta(days=365)
        license_type = \"annual\"
    else:
        raise HTTPException(status_code=400, detail=\"Plano inválido\")
    
    await db.users.update_one(
        {\"email\": user_email},
        {\"$set\": {
            \"license_type\": license_type,
            \"license_plan\": plan,
            \"license_expiry\": expiry.isoformat(),
            \"last_payment_date\": datetime.now(timezone.utc).isoformat(),
            \"payment_method\": \"manual\"
        }}
    )
    
    return {
        \"message\": f\"Usuário {user_email} ativado com plano {plan}\",
        \"expiry_date\": expiry.isoformat()
    }


# ==================== Migration Routes ====================

@api_router.post(\"/migrate/campaigns-to-industries\")
async def migrate_campaigns_to_industries(current_user: dict = Depends(get_current_user)):
    \"\"\"
    Migra campanhas antigas (product_goals) para nova estrutura (industries)
    Cria uma indústria \"Geral\" com todos os produtos antigos
    \"\"\"
    # Buscar todas as campanhas do usuário que ainda usam product_goals
    campaigns = await db.campaigns.find(
        {\"user_id\": current_user['id'], \"product_goals\": {\"$exists\": True, \"$ne\": None}},
        {\"_id\": 0}
    ).to_list(1000)
    
    migrated_count = 0
    
    for campaign in campaigns:
        # Se já tem industries, pular
        if campaign.get('industries'):
            continue
        
        product_goals = campaign.get('product_goals', {})
        if not product_goals:
            continue
        
        # Criar indústria \"Geral\" com todos os produtos
        general_industry = {
            \"name\": \"Geral\",
            \"goal\": sum(product_goals.values()),  # Soma de todas as metas
            \"products\": list(product_goals.keys())
        }
        
        # Atualizar campanha
        await db.campaigns.update_one(
            {\"id\": campaign['id']},
            {\"$set\": {
                \"industries\": [general_industry],
                \"product_goals\": None  # Remover product_goals antigo
            }}
        )
        
        migrated_count += 1
    
    # Migrar clientes dessa campanha também
    clients_migrated = 0
    for campaign in campaigns:
        clients = await db.clients.find(
            {\"campaign_id\": campaign['id'], \"products\": {\"$exists\": True, \"$ne\": None}},
            {\"_id\": 0}
        ).to_list(10000)
        
        for client in clients:
            # Se já tem industries, pular
            if client.get('industries'):
                continue
            
            old_products = client.get('products', {})
            if not old_products:
                continue
            
            # Criar estrutura de indústria \"Geral\" para o cliente
            general_industry_data = {
                \"products\": old_products,  # Manter mesma estrutura de produtos
                \"industry_status\": \"\"  # Será calculado
            }
            
            # Calcular status da indústria (positivado se pelo menos 1 produto positivado)
            has_positivado = False
            for product_data in old_products.values():
                if product_data.get('status', '').lower() == 'positivado':
                    has_positivado = True
                    break
            
            general_industry_data[\"industry_status\"] = \"positivado\" if has_positivado else \"\"
            
            # Atualizar cliente
            await db.clients.update_one(
                {\"id\": client['id']},
                {\"$set\": {
                    \"industries\": {\"Geral\": general_industry_data},
                    \"products\": None  # Remover products antigo
                }}
            )
            
            clients_migrated += 1
    
    return {
        \"message\": \"Migração concluída com sucesso!\",
        \"campaigns_migrated\": migrated_count,
        \"clients_migrated\": clients_migrated
    }


# Include the router in the main app
app.include_router(api_router)

# Startup event to start background tasks
@app.on_event(\"startup\")
async def startup_event():
    \"\"\"Start background tasks on application startup\"\"\"
    logger.info(\"Starting background tasks...\")
    asyncio.create_task(check_expiring_trials())
    logger.info(\"Trial expiration checker started\")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=[\"*\"],
    allow_headers=[\"*\"],
)

@app.on_event(\"shutdown\")
async def shutdown_db_client():
    client.close()
