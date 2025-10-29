from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
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

ROOT_DIR = Path(__file__).parent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# PostgreSQL database URL - HARDCODED
DATABASE_URL = 'postgresql://anota_ganha_user:ZJ9wbemhq9szq1llTSl55rRtPbmfxote@dpg-d41887ili9vc739grorg-a/anota_ganha'

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

# Create default admin
def create_default_admin():
    ADMIN_EMAIL = "admin@anotaganha.com"
    ADMIN_PASSWORD = "Admin@123456"
    ADMIN_NAME = "Administrador"
    
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT id FROM users WHERE email = %s", (ADMIN_EMAIL,))
            if cursor.fetchone():
                logger.info("Admin already exists")
                return
            
            hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt())
            admin_id = str(uuid.uuid4())
            
            cursor.execute(
                "INSERT INTO users (id, email, full_name, hashed_password, is_active) VALUES (%s, %s, %s, %s, TRUE)",
                (admin_id, ADMIN_EMAIL, ADMIN_NAME, hashed.decode())
            )
            conn.commit()
            logger.info(f"✅ Admin created: {ADMIN_EMAIL} / Password: {ADMIN_PASSWORD}")
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
        conn.commit()
        
        token = create_access_token({"sub": user_id})
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {"id": user_id, "email": user_data.email, "full_name": user_data.full_name}
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
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {"id": user['id'], "email": user['email'], "full_name": user['full_name']}
        }

@app.get("/api/auth/me")
async def get_current_user(user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, full_name, is_active FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return dict(user)

# Sheets endpoints
@app.get("/api/sheets")
async def get_sheets(user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sheets WHERE user_id = %s ORDER BY updated_at DESC", (user_id,))
        sheets = [dict(row) for row in cursor.fetchall()]
        return sheets

@app.post("/api/sheets")
async def create_sheet(sheet_data: SheetCreate, user_id: str = Depends(verify_token)):
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
async def get_sheet(sheet_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
        sheet = cursor.fetchone()
        
        if not sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        return dict(sheet)

@app.put("/api/sheets/{sheet_id}")
async def update_sheet(sheet_id: str, sheet_data: SheetCreate, user_id: str = Depends(verify_token)):
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
async def delete_sheet(sheet_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Delete associated campaigns and clients
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

# Campaigns endpoints
@app.get("/api/sheets/{sheet_id}/campaigns")
async def get_campaigns(sheet_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify sheet ownership
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
async def create_campaign(sheet_id: str, campaign_data: CampaignCreate, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify sheet ownership
        cursor.execute("SELECT id FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        campaign_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        # Fix: Garantir que industries é sempre um JSON válido
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

# Rotas alternativas para compatibilidade com frontend
@app.post("/api/campaigns")
async def create_campaign_direct(campaign_data: dict, user_id: str = Depends(verify_token)):
    """Rota alternativa para criar campanha"""
    if 'sheet_id' not in campaign_data:
        raise HTTPException(status_code=400, detail="sheet_id is required")
    
    sheet_id = campaign_data.pop('sheet_id')
    
    campaign_create = CampaignCreate(
        name=campaign_data.get('name', ''),
        start_date=campaign_data.get('start_date'),
        end_date=campaign_data.get('end_date'),
        status=campaign_data.get('status', 'active'),
        industries=campaign_data.get('industries', [])
    )
    
    return await create_campaign(sheet_id, campaign_create, user_id)
@app.get("/api/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, user_id: str = Depends(verify_token)):
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
async def update_campaign(campaign_id: str, campaign_data: CampaignCreate, user_id: str = Depends(verify_token)):
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
            raise HTTPException(status_code=500, detail=f"Erro ao atualizar campanha: {str(e)}")

@app.put("/api/campaigns")
async def update_campaign_direct(campaign_data: dict, user_id: str = Depends(verify_token)):
    """Rota alternativa para atualizar campanha"""
    if 'id' not in campaign_data:
        raise HTTPException(status_code=400, detail="campaign id is required")
    
    campaign_id = campaign_data.pop('id')
    
    campaign_create = CampaignCreate(
        name=campaign_data.get('name', ''),
        start_date=campaign_data.get('start_date'),
        end_date=campaign_data.get('end_date'),
        status=campaign_data.get('status', 'active'),
        industries=campaign_data.get('industries', [])
    )
    
    return await update_campaign(campaign_id, campaign_create, user_id)

@app.delete("/api/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Delete associated clients
        cursor.execute("DELETE FROM clients WHERE campaign_id = %s", (campaign_id,))
        
        cursor.execute("""
            DELETE FROM campaigns
            WHERE id = %s AND sheet_id IN (SELECT id FROM sheets WHERE user_id = %s)
        """, (campaign_id, user_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        conn.commit()
        return {"message": "Campaign deleted successfully"}

# Clients endpoints
@app.get("/api/campaigns/{campaign_id}/clients")
async def get_clients(campaign_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify campaign access
        cursor.execute("""
            SELECT c.id FROM campaigns c
            JOIN sheets s ON c.sheet_id = s.id
            WHERE c.id = %s AND s.user_id = %s
        """, (campaign_id, user_id))
        
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Campaign not found")
