from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
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

# Configure paths and environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================
# 1. CREATE FASTAPI APP
# ============================================
app = FastAPI(title="Anota Ganha API")

# ============================================
# 2. CONFIGURE CORS (MUST BE FIRST!)
# ============================================
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

# ============================================
# 3. DATABASE CONNECTION - FIXED!
# ============================================
# CORREÇÃO: Pegar a URL corretamente do ambiente
mongo_url = os.environ.get('MONGO_URL') or os.environ.get('MONGODB_URI')
if not mongo_url:
    logger.error("MONGO_URL ou MONGODB_URI não encontrado nas variáveis de ambiente!")
    # Usar URL padrão para desenvolvimento local
    mongo_url = "mongodb://localhost:27017"

client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=50,
    minPoolSize=10,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=10000,
    socketTimeoutMS=30000,
    retryWrites=True,
    retryReads=True
)

db = client[os.environ.get('DB_NAME', 'anota_ganha')]

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

# ============================================
# 4. CONFIGURATION
# ============================================
# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# License Configuration
TRIAL_PERIOD_DAYS = 15
MONTHLY_SIMPLE_PRICE = 35.00
MONTHLY_PRICE = 29.90
ANNUAL_PRICE = 300.00

# Mercado Pago Configuration
MP_ACCESS_TOKEN = os.environ.get('MP_ACCESS_TOKEN', '')
MP_PUBLIC_KEY = os.environ.get('MP_PUBLIC_KEY', '')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:8001')

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'edson854_8@hotmail.com')

security = HTTPBearer()

# ============================================
# 5. PYDANTIC MODELS
# ============================================
class User(BaseModel):
    model_config = ConfigDict(
        json_encoders={datetime: lambda dt: dt.isoformat() if dt else None},
        populate_by_name=True
    )
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    email: str
    name: str
    cpf: Optional[str] = ""
    phone: Optional[str] = ""
    role: str = "user"
    license_type: str = "trial"
    trial_started: Optional[datetime] = None
    license_expiry: Optional[datetime] = None
    last_payment_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserRegister(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    cpf: Optional[str] = None
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

# ============================================
# 6. HELPER FUNCTIONS
# ============================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except:
        return False

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
    
    user = await db.users.find_one({"_id": user_id})
    if user is None:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    
    return user

def send_password_reset_email(email: str, reset_token: str) -> bool:
    """Send password reset email via SendGrid"""
    if not SENDGRID_API_KEY:
        logger.warning("SendGrid not configured")
        return False
    
    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail
        
        sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
        reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"
        
        html_content = f"""
        <h2>Recuperação de Senha</h2>
        <p>Você solicitou a recuperação de senha para sua conta no Anota & Ganha Incentivos.</p>
        <p>Clique no link abaixo para redefinir sua senha (válido por 1 hora):</p>
        <p><a href="{reset_link}" style="background:#3B82F6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Redefinir Senha</a></p>
        <p>Se você não solicitou esta recuperação, ignore este email.</p>
        """
        
        message = Mail(
            from_email=SENDER_EMAIL,
            to_emails=email,
            subject="Recuperação de Senha - Anota & Ganha",
            html_content=html_content
        )
        
        response = sg.send(message)
        logger.info(f"Reset email sent to {email} (status: {response.status_code})")
        return True
    except Exception as e:
        logger.error(f"Failed to send reset email: {str(e)}")
        return False

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
                        {"_id": user['_id']},
                        {"$set": {email_sent_field: True}}
                    )
        except Exception as e:
            logger.error(f"Error in trial checker: {str(e)}")

# ============================================
# 7. HEALTH CHECK ENDPOINTS
# ============================================
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Anota Ganha API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Health check for Render"""
    return {"status": "healthy"}

@app.head("/health")
async def health_check_head():
    """Health check HEAD method for Render"""
    return {"status": "healthy"}

# ============================================
# 8. API ROUTER
# ============================================
api_router = APIRouter(prefix="/api")

# ============================================
# 9. AUTHENTICATION ROUTES
# ============================================
@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    # Check if this is the first user (admin)
    user_count = await db.users.count_documents({})
    is_admin = user_count == 0
    
    # Create trial period
    trial_start = datetime.now(timezone.utc)
    trial_end = trial_start + timedelta(days=TRIAL_PERIOD_DAYS)
    
    # Create user object
    user_obj = User(
        email=user_data.email,
        name=user_data.name or user_data.email.split('@')[0],
        cpf=user_data.cpf or "",
        phone=user_data.phone or "",
        role="admin" if is_admin else "user",
        license_type="annual" if is_admin else "trial",
        trial_started=trial_start if not is_admin else None,
        license_expiry=None if is_admin else trial_end
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
    """Login endpoint - FIXED"""
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

# ============================================
# 10. PLANS ENDPOINT
# ============================================
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

# ============================================
# 11. LIFECYCLE EVENTS
# ============================================
@app.on_event("startup")
async def startup_event():
    """Start background tasks on application startup"""
    logger.info("Starting Anota Ganha API...")
    logger.info(f"MongoDB URL configured: {bool(mongo_url)}")
    logger.info("Starting background tasks...")
    asyncio.create_task(check_expiring_trials())
    logger.info("Trial expiration checker started")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Close database connection on shutdown"""
    logger.info("Shutting down database connection...")
    client.close()

# ============================================
# 12. INCLUDE ROUTER
# ============================================
app.include_router(api_router)

# ============================================
# 13. RUN SERVER (for local development)
# ============================================
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
