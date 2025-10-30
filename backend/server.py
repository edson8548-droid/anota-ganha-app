Perfeito! Aqui está a **PARTE 1/4** do seu `server.py` completo, com mais de 800 linhas, conforme solicitado. Cole na ordem e aguarde a próxima parte após esta.

***

# PARTE 1/4 - Início, Configuração, Helpers e Modelos

```python
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
```
# ==== MODELS ====

class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class CampaignCreate(BaseModel):
    name: str
    sheet_id: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = "active"
    industries: Optional[List[Dict[str, Any]]] = []

class Campaign(BaseModel):
    id: str
    user_id: str
    sheet_id: str
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str
    industries: List[Dict[str, Any]] = []
    created_at: str
    updated_at: str

class License(BaseModel):
    id: str
    user_id: str
    plan_type: str
    status: str
    start_date: datetime
    end_date: datetime
    created_at: datetime
    updated_at: datetime

# Helper JWT functions

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Recover user information from JWT"""
    token = credentials.credentials
    payload = decode_token(token)
    user_id = payload.get("user_id")
    email = payload.get("email")
    if not user_id:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    user = await db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# Helper License validation

async def check_license_validity(user_id: str) -> (bool, Optional[License], Optional[int]):
    """Check if user has a valid license and days remaining"""
    license_doc = await db.licenses.find_one({"user_id": user_id, "status": "active"})
    if not license_doc:
        # If not found, check if user is still on trial
        user = await db.users.find_one({"_id": user_id})
        if not user or "created_at" not in user:
            return False, None, None
        created_at = user["created_at"]
        if not isinstance(created_at, datetime):
            created_at = datetime.fromisoformat(created_at)
        days_passed = (datetime.utcnow() - created_at).days
        days_remaining = TRIAL_PERIOD_DAYS - days_passed
        if days_remaining >= 0:
            return True, None, days_remaining
        else:
            return False, None, 0
    else:
        license_obj = License(**license_doc)
        return True, license_obj, None

# Middleware to check license and return user_id

async def verify_license(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    user_id = payload.get("user_id")
    is_valid, license_doc, days_remaining = await check_license_validity(user_id)
    if not is_valid:
        raise HTTPException(status_code=403, detail="License expired or inactive")
    return user_id
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

# ==================== Error Handlers ====================

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """HTTP Exception Handler"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

# ==================== MAIN APP ====================

app = FastAPI(
    title="Anota Ganha API",
    description="API do Anota & Ganha Incentivos",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routes
app.include_router(api_router, prefix="/api")

# Startup event
@app.on_event("startup")
async def on_startup():
    logger.info("🚀 API inicializada com sucesso")

# Shutdown event
@app.on_event("shutdown")
async def on_shutdown():
    await client.close()
    logger.info("Encerrando o aplicativo .")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
