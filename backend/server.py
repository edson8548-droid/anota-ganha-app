from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import psycopg2
from psycopg2.extras import RealDictCursor
import json
from contextlib import contextmanager
import requests

ROOT_DIR = Path(__file__).parent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# PostgreSQL database URL
DATABASE_URL = 'postgresql://anota_ganha_user:ZJ9wbemhq9szq1llTSl55rRtPbmfxote@dpg-d41887ili9vc739grorg-a/anota_ganha'

# Mercado Pago Configuration
MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-6279807309571506-102117-f33e754b9f5b91b7bce0c79c3327d3dd-54275427'

# Plans Configuration (including lifetime for admin)
PLANS = {
    "monthly": {
        "name": "Plano Mensal",
        "price": 35.00,
        "duration_days": 30,
        "frequency": 1,
        "frequency_type": "months",
        "auto_recurring": True
    },
    "yearly_12x": {
        "name": "Plano 12 Meses",
        "price": 29.90,
        "duration_days": 365,
        "frequency": 1,
        "frequency_type": "months",
        "auto_recurring": True,
        "repetitions": 12
    },
    "yearly": {
        "name": "Plano Anual",
        "price": 300.00,
        "duration_days": 365,
        "frequency": 1,
        "frequency_type": "years",
        "auto_recurring": True
    },
    "lifetime": {
        "name": "Licença Vitalícia",
        "price": 0.00,
        "duration_days": 36500,
        "frequency": 0,
        "frequency_type": "none",
        "auto_recurring": False
    }
}

logger.info(f"🔍 DATABASE_URL configured")

# Database helper
@contextmanager
def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()

# Initialize database
def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                hashed_password TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Licenses table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS licenses (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                plan_type TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                starts_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                subscription_id TEXT,
                payment_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # Sheets table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sheets (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # Campaigns table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS campaigns (
                id TEXT PRIMARY KEY,
                sheet_id TEXT NOT NULL,
                name TEXT NOT NULL,
                start_date TEXT,
                end_date TEXT,
                status TEXT DEFAULT 'active',
                industries JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sheet_id) REFERENCES sheets(id)
            )
        """)
        
        # Clients table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                campaign_id TEXT NOT NULL,
                name TEXT NOT NULL,
                cnpj TEXT,
                address TEXT,
                city TEXT,
                neighborhood TEXT,
                notes TEXT,
                industries JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
            )
        """)
        
        conn.commit()
        logger.info("✅ Database initialized successfully")

# Create default admin with LIFETIME license
def create_default_admin():
    ADMIN_EMAIL = "admin@anotaganha.com"
    ADMIN_PASSWORD = "Admin@123456"
    ADMIN_NAME = "Administrador"
    
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT id FROM users WHERE email = %s", (ADMIN_EMAIL,))
            existing = cursor.fetchone()
            
            if existing:
                # Check if admin has lifetime license
                admin_id = existing['id']
                cursor.execute("""
                    SELECT id FROM licenses 
                    WHERE user_id = %s AND plan_type = 'lifetime' AND status = 'active'
                """, (admin_id,))
                
                if not cursor.fetchone():
                    # Give lifetime license to existing admin
                    license_id = str(uuid.uuid4())
                    now = datetime.now(timezone.utc)
                    expires = datetime(2099, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
                    
                    cursor.execute(
                        """INSERT INTO licenses (id, user_id, plan_type, status, starts_at, expires_at)
                           VALUES (%s, %s, 'lifetime', 'active', %s, %s)""",
                        (license_id, admin_id, now, expires)
                    )
                    conn.commit()
                    logger.info(f"✅ Lifetime license granted to existing admin")
                else:
                    logger.info("Admin already has lifetime license")
                
                return
            
            # Create new admin with lifetime license
            hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt())
            admin_id = str(uuid.uuid4())
            
            cursor.execute(
                "INSERT INTO users (id, email, full_name, hashed_password, is_active) VALUES (%s, %s, %s, %s, TRUE)",
                (admin_id, ADMIN_EMAIL, ADMIN_NAME, hashed.decode())
            )
            
            # Create LIFETIME license (expires year 2099!)
            license_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            expires = datetime(2099, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
            
            cursor.execute(
                """INSERT INTO licenses (id, user_id, plan_type, status, starts_at, expires_at)
                   VALUES (%s, %s, 'lifetime', 'active', %s, %s)""",
                (license_id, admin_id, now, expires)
            )
            
            conn.commit()
            logger.info(f"✅ Admin created with LIFETIME license: {ADMIN_EMAIL} / Password: {ADMIN_PASSWORD}")
            logger.info(f"✅ License expires: {expires.isoformat()}")
    except Exception as e:
        logger.error(f"Error creating admin: {e}")

# JWT Configuration
SECRET_KEY = 'your-super-secret-key-change-this-in-production-12345'
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

security = HTTPBearer()
# Models
class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str

class UserLogin(BaseModel):
    email: str
    password: str

class SheetCreate(BaseModel):
    name: str

class CampaignCreate(BaseModel):
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = "active"
    industries: List[Dict[str, Any]] = []

class ClientCreate(BaseModel):
    name: str
    cnpj: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    notes: Optional[str] = None
    industries: Dict[str, Any] = {}

# Auth helpers
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# License verification
def check_license(user_id: str):
    """Check if user has active license"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM licenses 
            WHERE user_id = %s AND status = 'active' 
            ORDER BY expires_at DESC LIMIT 1
        """, (user_id,))
        license = cursor.fetchone()
        
        if not license:
            return False, "No active license found"
        
        # Check expiration
        expires_at = license['expires_at']
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        
        if now > expires_at:
            # Expire license
            cursor.execute(
                "UPDATE licenses SET status = 'expired', updated_at = %s WHERE id = %s",
                (now, license['id'])
            )
            conn.commit()
            return False, "License expired"
        
        return True, license

def verify_license_middleware(user_id: str = Depends(verify_token)):
    """Middleware to check license for protected routes"""
    is_valid, result = check_license(user_id)
    if not is_valid:
        raise HTTPException(status_code=403, detail=result)
    return user_id

# FastAPI app
app = FastAPI(title="Anota Ganha API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://anota-ganha-app-da46.vercel.app",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB on startup
@app.on_event("startup")
async def startup_event():
    init_db()
    create_default_admin()
    logger.info("✅ Application started")

# Auth routes
@app.post("/api/auth/register")
async def register(user_data: UserCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM users WHERE email = %s", (user_data.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered")
        
        hashed = bcrypt.hashpw(user_data.password.encode(), bcrypt.gensalt())
        user_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO users (id, email, full_name, hashed_password) VALUES (%s, %s, %s, %s)",
            (user_id, user_data.email, user_data.full_name, hashed.decode())
        )
        
        # Create 7-day trial license
        license_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        expires = now + timedelta(days=7)
        
        cursor.execute(
            """INSERT INTO licenses (id, user_id, plan_type, status, starts_at, expires_at)
               VALUES (%s, %s, 'trial', 'active', %s, %s)""",
            (license_id, user_id, now, expires)
        )
        
        conn.commit()
        
        token = create_access_token({"sub": user_id})
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {"id": user_id, "email": user_data.email, "full_name": user_data.full_name},
            "license": {"plan_type": "trial", "expires_at": expires.isoformat()}
        }

@app.post("/api/auth/login")
async def login(credentials: UserLogin):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = %s", (credentials.email,))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if not bcrypt.checkpw(credentials.password.encode(), user['hashed_password'].encode()):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        token = create_access_token({"sub": user['id']})
        
        # Get license info
        cursor.execute("""
            SELECT * FROM licenses 
            WHERE user_id = %s AND status = 'active' 
            ORDER BY expires_at DESC LIMIT 1
        """, (user['id'],))
        license = cursor.fetchone()
        
        license_info = None
        if license:
            license_info = {
                "plan_type": license['plan_type'],
                "status": license['status'],
                "expires_at": license['expires_at'].isoformat()
            }
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {"id": user['id'], "email": user['email'], "full_name": user['full_name']},
            "license": license_info
        }

@app.get("/api/auth/me")
async def get_current_user(user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, full_name, is_active FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get license
        cursor.execute("""
            SELECT * FROM licenses 
            WHERE user_id = %s AND status = 'active' 
            ORDER BY expires_at DESC LIMIT 1
        """, (user_id,))
        license = cursor.fetchone()
        
        result = dict(user)
        if license:
            result['license'] = {
                "plan_type": license['plan_type'],
                "status": license['status'],
                "expires_at": license['expires_at'].isoformat()
            }
        else:
            result['license'] = None
        
        return result

# License and Plans routes
@app.get("/api/plans")
async def get_plans():
    """Get available subscription plans"""
    return PLANS

@app.get("/api/licenses/status")
async def get_license_status(user_id: str = Depends(verify_token)):
    """Get current license status"""
    is_valid, result = check_license(user_id)
    
    if not is_valid:
        return {"status": "inactive", "message": result}
    
    license = result
    return {
        "status": "active",
        "plan_type": license['plan_type'],
        "starts_at": license['starts_at'].isoformat(),
        "expires_at": license['expires_at'].isoformat(),
        "subscription_id": license.get('subscription_id')
    }
# Mercado Pago integration
@app.post("/api/subscriptions/create")
async def create_subscription(request: Request, user_id: str = Depends(verify_token)):
    """Create Mercado Pago subscription"""
    try:
        body = await request.json()
        plan_type = body.get('plan_type')
        
        if plan_type not in PLANS:
            raise HTTPException(status_code=400, detail="Invalid plan type")
        
        plan = PLANS[plan_type]
        
        # Create subscription preference
        subscription_data = {
            "reason": plan['name'],
            "auto_recurring": {
                "frequency": plan['frequency'],
                "frequency_type": plan['frequency_type'],
                "transaction_amount": plan['price'],
                "currency_id": "BRL"
            },
            "back_url": "https://anota-ganha-app-da46.vercel.app/dashboard"
        }
        
        # Add repetitions if exists (12 months plan)
        if 'repetitions' in plan:
            subscription_data['auto_recurring']['repetitions'] = plan['repetitions']
        
        headers = {
            "Authorization": f"Bearer {MERCADO_PAGO_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(
            "https://api.mercadopago.com/preapproval",
            json=subscription_data,
            headers=headers
        )
        
        if response.status_code not in [200, 201]:
            logger.error(f"Mercado Pago error: {response.text}")
            raise HTTPException(status_code=500, detail="Error creating subscription")
        
        result = response.json()
        
        return {
            "subscription_id": result.get('id'),
            "init_point": result.get('init_point'),
            "sandbox_init_point": result.get('sandbox_init_point')
        }
        
    except Exception as e:
        logger.error(f"Error creating subscription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/webhooks/mercadopago")
async def mercadopago_webhook(request: Request):
    """Handle Mercado Pago webhooks"""
    try:
        body = await request.json()
        logger.info(f"Webhook received: {body}")
        
        # Get payment/subscription info
        topic = body.get('topic') or body.get('type')
        resource_id = body.get('data', {}).get('id') or body.get('id')
        
        if not resource_id:
            return {"status": "ok"}
        
        headers = {"Authorization": f"Bearer {MERCADO_PAGO_ACCESS_TOKEN}"}
        
        if topic == "subscription" or topic == "preapproval":
            # Get subscription details
            response = requests.get(
                f"https://api.mercadopago.com/preapproval/{resource_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                subscription = response.json()
                status = subscription.get('status')
                payer_email = subscription.get('payer_email')
                
                if status == 'authorized':
                    # Find user and activate license
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT id FROM users WHERE email = %s", (payer_email,))
                        user = cursor.fetchone()
                        
                        if user:
                            plan_type = "monthly"
                            plan = PLANS[plan_type]
                            license_id = str(uuid.uuid4())
                            now = datetime.now(timezone.utc)
                            expires = now + timedelta(days=plan['duration_days'])
                            
                            cursor.execute(
                                """INSERT INTO licenses (id, user_id, plan_type, status, starts_at, expires_at, subscription_id)
                                   VALUES (%s, %s, %s, 'active', %s, %s, %s)""",
                                (license_id, user['id'], plan_type, now, expires, resource_id)
                            )
                            conn.commit()
                            logger.info(f"License activated for user {user['id']}")
        
        return {"status": "ok"}
        
    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        return {"status": "error", "message": str(e)}

# Sheets endpoints (with license check)
@app.get("/api/sheets")
async def get_sheets(user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sheets WHERE user_id = %s ORDER BY updated_at DESC", (user_id,))
        sheets = [dict(row) for row in cursor.fetchall()]
        return sheets

@app.post("/api/sheets")
async def create_sheet(sheet_data: SheetCreate, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        sheet_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        cursor.execute(
            "INSERT INTO sheets (id, user_id, name, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
            (sheet_id, user_id, sheet_data.name, now, now)
        )
        conn.commit()
        
        return {
            "id": sheet_id,
            "user_id": user_id,
            "name": sheet_data.name,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }

@app.get("/api/sheets/{sheet_id}")
async def get_sheet(sheet_id: str, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
        sheet = cursor.fetchone()
        
        if not sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        return dict(sheet)

@app.put("/api/sheets/{sheet_id}")
async def update_sheet(sheet_id: str, sheet_data: SheetCreate, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now(timezone.utc)
        
        cursor.execute(
            "UPDATE sheets SET name = %s, updated_at = %s WHERE id = %s AND user_id = %s",
            (sheet_data.name, now, sheet_id, user_id)
        )
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        conn.commit()
        
        cursor.execute("SELECT * FROM sheets WHERE id = %s", (sheet_id,))
        return dict(cursor.fetchone())

@app.delete("/api/sheets/{sheet_id}")
async def delete_sheet(sheet_id: str, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM campaigns WHERE sheet_id = %s", (sheet_id,))
        campaign_ids = [row['id'] for row in cursor.fetchall()]
        
        for campaign_id in campaign_ids:
            cursor.execute("DELETE FROM clients WHERE campaign_id = %s", (campaign_id,))
        
        cursor.execute("DELETE FROM campaigns WHERE sheet_id = %s", (sheet_id,))
        cursor.execute("DELETE FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        conn.commit()
        return {"message": "Sheet deleted successfully"}

# Campaigns endpoints (with license check)
@app.get("/api/sheets/{sheet_id}/campaigns")
async def get_campaigns(sheet_id: str, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        cursor.execute("SELECT * FROM campaigns WHERE sheet_id = %s ORDER BY created_at DESC", (sheet_id,))
        campaigns = []
        for row in cursor.fetchall():
            campaign = dict(row)
            campaign['industries'] = campaign['industries'] if campaign['industries'] else []
            campaigns.append(campaign)
        
        return campaigns

@app.post("/api/sheets/{sheet_id}/campaigns")
async def create_campaign(sheet_id: str, campaign_data: CampaignCreate, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        campaign_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        try:
            industries_data = campaign_data.industries if campaign_data.industries else []
            industries_json = json.dumps(industries_data)
        except Exception as e:
            logger.error(f"Error serializing industries: {str(e)}")
            industries_json = json.dumps([])
        
        start_date = campaign_data.start_date if campaign_data.start_date else None
        end_date = campaign_data.end_date if campaign_data.end_date else None
        status = campaign_data.status if campaign_data.status else "active"
        
        try:
            cursor.execute(
                """INSERT INTO campaigns (id, sheet_id, name, start_date, end_date, status, industries, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)""",
                (campaign_id, sheet_id, campaign_data.name, start_date, end_date,
                 status, industries_json, now, now)
            )
            conn.commit()
            
            logger.info(f"Campaign created successfully: {campaign_id}")
            
            return {
                "id": campaign_id,
                "sheet_id": sheet_id,
                "name": campaign_data.name,
                "start_date": start_date,
                "end_date": end_date,
                "status": status,
                "industries": industries_data,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
        except Exception as e:
            conn.rollback()
            error_msg = str(e)
            logger.error(f"Error creating campaign: {error_msg}")
            raise HTTPException(status_code=500, detail=f"Erro ao criar campanha: {error_msg}")

# Alternative campaign routes (frontend compatibility)
@app.post("/api/campaigns")
async def create_campaign_direct(campaign_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Alternative route to create campaign"""
    try:
        if 'sheet_id' not in campaign_data and 'sheetId' not in campaign_data:
            raise HTTPException(status_code=400, detail="sheet_id or sheetId is required")
        
        sheet_id = campaign_data.get('sheet_id') or campaign_data.get('sheetId')
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Sheet not found")
        
        campaign_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        name = campaign_data.get('name', '')
        if not name:
            raise HTTPException(status_code=400, detail="Campaign name is required")
        
        start_date = campaign_data.get('start_date') or campaign_data.get('startDate')
        end_date = campaign_data.get('end_date') or campaign_data.get('endDate')
        status = campaign_data.get('status', 'active')
        industries = campaign_data.get('industries', [])
        
        try:
            industries_json = json.dumps(industries if industries else [])
        except:
            industries_json = json.dumps([])
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """INSERT INTO campaigns (id, sheet_id, name, start_date, end_date, status, industries, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)""",
                (campaign_id, sheet_id, name, start_date, end_date, status, industries_json, now, now)
            )
            conn.commit()
        
        logger.info(f"Campaign created successfully: {campaign_id}")
        
        return {
            "id": campaign_id,
            "sheet_id": sheet_id,
            "name": name,
            "start_date": start_date,
            "end_date": end_date,
            "status": status,
            "industries": industries,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating campaign: {str(e)}")
@app.get("/api/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.* FROM campaigns c
            JOIN sheets s ON c.sheet_id = s.id
            WHERE c.id = %s AND s.user_id = %s
        """, (campaign_id, user_id))
        
        campaign = cursor.fetchone()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        result = dict(campaign)
        result['industries'] = result['industries'] if result['industries'] else []
        return result

@app.put("/api/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, campaign_data: CampaignCreate, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now(timezone.utc)
        
        try:
            industries_data = campaign_data.industries if campaign_data.industries else []
            industries_json = json.dumps(industries_data)
        except:
            industries_json = json.dumps([])
        
        start_date = campaign_data.start_date if campaign_data.start_date else None
        end_date = campaign_data.end_date if campaign_data.end_date else None
        status = campaign_data.status if campaign_data.status else "active"
        
        try:
            cursor.execute("""
                UPDATE campaigns
                SET name = %s, start_date = %s, end_date = %s, status = %s, industries = %s::jsonb, updated_at = %s
                WHERE id = %s AND sheet_id IN (SELECT id FROM sheets WHERE user_id = %s)
            """, (campaign_data.name, start_date, end_date, status,
                  industries_json, now, campaign_id, user_id))
            
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Campaign not found")
            
            conn.commit()
            
            cursor.execute("SELECT * FROM campaigns WHERE id = %s", (campaign_id,))
            result = dict(cursor.fetchone())
            result['industries'] = result['industries'] if result['industries'] else []
            return result
        except HTTPException:
            raise
        except Exception as e:
            conn.rollback()
            logger.error(f"Error updating campaign: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error updating campaign: {str(e)}")

@app.put("/api/campaigns")
async def update_campaign_direct(campaign_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Alternative route to update campaign"""
    try:
        campaign_id = campaign_data.get('id') or campaign_data.get('_id') or campaign_data.get('campaignId')
        if not campaign_id:
            raise HTTPException(status_code=400, detail="campaign id is required")
        
        name = campaign_data.get('name', '')
        if not name:
            raise HTTPException(status_code=400, detail="Campaign name is required")
        
        start_date = campaign_data.get('start_date') or campaign_data.get('startDate')
        end_date = campaign_data.get('end_date') or campaign_data.get('endDate')
        status = campaign_data.get('status', 'active')
        industries = campaign_data.get('industries', [])
        
        try:
            industries_json = json.dumps(industries if industries else [])
        except:
            industries_json = json.dumps([])
        
        now = datetime.now(timezone.utc)
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE campaigns
                SET name = %s, start_date = %s, end_date = %s, status = %s, industries = %s::jsonb, updated_at = %s
                WHERE id = %s AND sheet_id IN (SELECT id FROM sheets WHERE user_id = %s)
            """, (name, start_date, end_date, status, industries_json, now, campaign_id, user_id))
            
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Campaign not found")
            
            conn.commit()
            
            cursor.execute("SELECT * FROM campaigns WHERE id = %s", (campaign_id,))
            result = dict(cursor.fetchone())
            result['industries'] = result['industries'] if result['industries'] else []
            return result
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating campaign: {str(e)}")

@app.delete("/api/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM clients WHERE campaign_id = %s", (campaign_id,))
        
        cursor.execute("""
            DELETE FROM campaigns
            WHERE id = %s AND sheet_id IN (SELECT id FROM sheets WHERE user_id = %s)
        """, (campaign_id, user_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        conn.commit()
        return {"message": "Campaign deleted successfully"}

# Clients endpoints (with license check)
@app.get("/api/campaigns/{campaign_id}/clients")
async def get_clients(campaign_id: str, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.id FROM campaigns c
            JOIN sheets s ON c.sheet_id = s.id
            WHERE c.id = %s AND s.user_id = %s
        """, (campaign_id, user_id))
        
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        cursor.execute("SELECT * FROM clients WHERE campaign_id = %s ORDER BY created_at DESC", (campaign_id,))
        clients = []
        for row in cursor.fetchall():
            client = dict(row)
            client['industries'] = client['industries'] if client['industries'] else {}
            clients.append(client)
        
        return clients

@app.post("/api/campaigns/{campaign_id}/clients")
async def create_client(campaign_id: str, client_data: ClientCreate, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.id FROM campaigns c
            JOIN sheets s ON c.sheet_id = s.id
            WHERE c.id = %s AND s.user_id = %s
        """, (campaign_id, user_id))
        
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        client_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        try:
            industries_json = json.dumps(client_data.industries if client_data.industries else {})
        except:
            industries_json = json.dumps({})
        
        cursor.execute("""
            INSERT INTO clients (id, campaign_id, name, cnpj, address, city, neighborhood, notes, industries, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
        """, (client_id, campaign_id, client_data.name, client_data.cnpj, client_data.address,
              client_data.city, client_data.neighborhood, client_data.notes,
              industries_json, now, now))
        
        conn.commit()
        
        return {
            "id": client_id,
            "campaign_id": campaign_id,
            "name": client_data.name,
            "cnpj": client_data.cnpj,
            "address": client_data.address,
            "city": client_data.city,
            "neighborhood": client_data.neighborhood,
            "notes": client_data.notes,
            "industries": client_data.industries if client_data.industries else {},
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }

@app.put("/api/clients/{client_id}")
async def update_client(client_id: str, client_data: ClientCreate, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now(timezone.utc)
        
        try:
            industries_json = json.dumps(client_data.industries if client_data.industries else {})
        except:
            industries_json = json.dumps({})
        
        cursor.execute("""
            UPDATE clients
            SET name = %s, cnpj = %s, address = %s, city = %s, neighborhood = %s, notes = %s, industries = %s::jsonb, updated_at = %s
            WHERE id = %s AND campaign_id IN (
                SELECT c.id FROM campaigns c
                JOIN sheets s ON c.sheet_id = s.id
                WHERE s.user_id = %s
            )
        """, (client_data.name, client_data.cnpj, client_data.address, client_data.city,
              client_data.neighborhood, client_data.notes, industries_json,
              now, client_id, user_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Client not found")
        
        conn.commit()
        
        cursor.execute("SELECT * FROM clients WHERE id = %s", (client_id,))
        result = dict(cursor.fetchone())
        result['industries'] = result['industries'] if result['industries'] else {}
        return result

@app.delete("/api/clients/{client_id}")
async def delete_client(client_id: str, user_id: str = Depends(verify_license_middleware)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM clients
            WHERE id = %s AND campaign_id IN (
                SELECT c.id FROM campaigns c
                JOIN sheets s ON c.sheet_id = s.id
                WHERE s.user_id = %s
            )
        """, (client_id, user_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Client not found")
        
        conn.commit()
        return {"message": "Client deleted successfully"}

# Health check with HEAD support (UptimeRobot fix)
@app.get("/health")
@app.head("/health")
async def health_check():
    return {"status": "healthy", "database": "PostgreSQL connected"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
