from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import sqlite3
import json
from contextlib import contextmanager

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# SQLite database path
DATABASE_PATH = os.getenv('DATABASE_URL', 'sqlite:///./anota_ganha.db').replace('sqlite:///', '')

# Database helper
@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
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
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Sheets table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sheets (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
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
                industries TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
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
                industries TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
            )
        """)
        
        conn.commit()
        logger.info("Database initialized successfully")

# JWT Configuration
SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

security = HTTPBearer()

# Models
class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str

class UserLogin(BaseModel):
    email: str
    password: str

class User(BaseModel):
    id: str
    email: str
    full_name: str
    is_active: bool = True

class SheetCreate(BaseModel):
    name: str

class Sheet(BaseModel):
    id: str
    user_id: str
    name: str
    created_at: str
    updated_at: str

class CampaignCreate(BaseModel):
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = "active"
    industries: List[Dict[str, Any]] = []

class Campaign(BaseModel):
    id: str
    sheet_id: str
    name: str
    start_date: Optional[str]
    end_date: Optional[str]
    status: str
    industries: List[Dict[str, Any]]
    created_at: str
    updated_at: str

class ClientCreate(BaseModel):
    name: str
    cnpj: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    notes: Optional[str] = None
    industries: Dict[str, Any] = {}

class Client(BaseModel):
    id: str
    campaign_id: str
    name: str
    cnpj: Optional[str]
    address: Optional[str]
    city: Optional[str]
    neighborhood: Optional[str]
    notes: Optional[str]
    industries: Dict[str, Any]
    created_at: str
    updated_at: str
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB on startup
@app.on_event("startup")
async def startup_event():
    init_db()
    logger.info("Application started")

# Routes
@app.post("/api/auth/register")
async def register(user_data: UserCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute("SELECT id FROM users WHERE email = ?", (user_data.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Hash password
        hashed = bcrypt.hashpw(user_data.password.encode(), bcrypt.gensalt())
        
        # Create user
        user_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO users (id, email, full_name, hashed_password) VALUES (?, ?, ?, ?)",
            (user_id, user_data.email, user_data.full_name, hashed.decode())
        )
        conn.commit()
        
        # Create token
        token = create_access_token({"sub": user_id})
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": user_data.email,
                "full_name": user_data.full_name
            }
        }

@app.post("/api/auth/login")
async def login(credentials: UserLogin):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (credentials.email,))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Verify password
        if not bcrypt.checkpw(credentials.password.encode(), user['hashed_password'].encode()):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Create token
        token = create_access_token({"sub": user['id']})
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user['id'],
                "email": user['email'],
                "full_name": user['full_name']
            }
        }

@app.get("/api/auth/me")
async def get_current_user(user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, full_name, is_active FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return dict(user)

# Sheets endpoints
@app.get("/api/sheets")
async def get_sheets(user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sheets WHERE user_id = ? ORDER BY updated_at DESC", (user_id,))
        sheets = [dict(row) for row in cursor.fetchall()]
        return sheets

@app.post("/api/sheets")
async def create_sheet(sheet_data: SheetCreate, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        sheet_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        cursor.execute(
            "INSERT INTO sheets (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (sheet_id, user_id, sheet_data.name, now, now)
        )
        conn.commit()
        
        return {
            "id": sheet_id,
            "user_id": user_id,
            "name": sheet_data.name,
            "created_at": now,
            "updated_at": now
        }

@app.get("/api/sheets/{sheet_id}")
async def get_sheet(sheet_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sheets WHERE id = ? AND user_id = ?", (sheet_id, user_id))
        sheet = cursor.fetchone()
        
        if not sheet:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        return dict(sheet)

@app.put("/api/sheets/{sheet_id}")
async def update_sheet(sheet_id: str, sheet_data: SheetCreate, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        
        cursor.execute(
            "UPDATE sheets SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (sheet_data.name, now, sheet_id, user_id)
        )
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        conn.commit()
        
        cursor.execute("SELECT * FROM sheets WHERE id = ?", (sheet_id,))
        return dict(cursor.fetchone())

@app.delete("/api/sheets/{sheet_id}")
async def delete_sheet(sheet_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Delete associated campaigns and clients
        cursor.execute("SELECT id FROM campaigns WHERE sheet_id = ?", (sheet_id,))
        campaign_ids = [row['id'] for row in cursor.fetchall()]
        
        for campaign_id in campaign_ids:
            cursor.execute("DELETE FROM clients WHERE campaign_id = ?", (campaign_id,))
        
        cursor.execute("DELETE FROM campaigns WHERE sheet_id = ?", (sheet_id,))
        cursor.execute("DELETE FROM sheets WHERE id = ? AND user_id = ?", (sheet_id, user_id))
        
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
        cursor.execute("SELECT id FROM sheets WHERE id = ? AND user_id = ?", (sheet_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        cursor.execute("SELECT * FROM campaigns WHERE sheet_id = ? ORDER BY created_at DESC", (sheet_id,))
        campaigns = []
        for row in cursor.fetchall():
            campaign = dict(row)
            campaign['industries'] = json.loads(campaign['industries']) if campaign['industries'] else []
            campaigns.append(campaign)
        
        return campaigns

@app.post("/api/sheets/{sheet_id}/campaigns")
async def create_campaign(sheet_id: str, campaign_data: CampaignCreate, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify sheet ownership
        cursor.execute("SELECT id FROM sheets WHERE id = ? AND user_id = ?", (sheet_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Sheet not found")
        
        campaign_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        cursor.execute(
            """INSERT INTO campaigns (id, sheet_id, name, start_date, end_date, status, industries, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (campaign_id, sheet_id, campaign_data.name, campaign_data.start_date, campaign_data.end_date,
             campaign_data.status, json.dumps(campaign_data.industries), now, now)
        )
        conn.commit()
        
        return {
            "id": campaign_id,
            "sheet_id": sheet_id,
            "name": campaign_data.name,
            "start_date": campaign_data.start_date,
            "end_date": campaign_data.end_date,
            "status": campaign_data.status,
            "industries": campaign_data.industries,
            "created_at": now,
            "updated_at": now
        }

@app.get("/api/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.* FROM campaigns c
            JOIN sheets s ON c.sheet_id = s.id
            WHERE c.id = ? AND s.user_id = ?
        """, (campaign_id, user_id))
        
        campaign = cursor.fetchone()
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        result = dict(campaign)
        result['industries'] = json.loads(result['industries']) if result['industries'] else []
        return result

@app.put("/api/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, campaign_data: CampaignCreate, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        
        cursor.execute("""
            UPDATE campaigns
            SET name = ?, start_date = ?, end_date = ?, status = ?, industries = ?, updated_at = ?
            WHERE id = ? AND sheet_id IN (SELECT id FROM sheets WHERE user_id = ?)
        """, (campaign_data.name, campaign_data.start_date, campaign_data.end_date, campaign_data.status,
              json.dumps(campaign_data.industries), now, campaign_id, user_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        conn.commit()
        
        cursor.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,))
        result = dict(cursor.fetchone())
        result['industries'] = json.loads(result['industries']) if result['industries'] else []
        return result

@app.delete("/api/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Delete associated clients
        cursor.execute("DELETE FROM clients WHERE campaign_id = ?", (campaign_id,))
        
        cursor.execute("""
            DELETE FROM campaigns
            WHERE id = ? AND sheet_id IN (SELECT id FROM sheets WHERE user_id = ?)
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
            WHERE c.id = ? AND s.user_id = ?
        """, (campaign_id, user_id))
        
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        cursor.execute("SELECT * FROM clients WHERE campaign_id = ? ORDER BY created_at DESC", (campaign_id,))
        clients = []
        for row in cursor.fetchall():
            client = dict(row)
            client['industries'] = json.loads(client['industries']) if client['industries'] else {}
            clients.append(client)
        
        return clients

@app.post("/api/campaigns/{campaign_id}/clients")
async def create_client(campaign_id: str, client_data: ClientCreate, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify campaign access
        cursor.execute("""
            SELECT c.id FROM campaigns c
            JOIN sheets s ON c.sheet_id = s.id
            WHERE c.id = ? AND s.user_id = ?
        """, (campaign_id, user_id))
        
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        client_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        cursor.execute("""
            INSERT INTO clients (id, campaign_id, name, cnpj, address, city, neighborhood, notes, industries, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (client_id, campaign_id, client_data.name, client_data.cnpj, client_data.address,
              client_data.city, client_data.neighborhood, client_data.notes,
              json.dumps(client_data.industries), now, now))
        
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
            "industries": client_data.industries,
            "created_at": now,
            "updated_at": now
        }

@app.put("/api/clients/{client_id}")
async def update_client(client_id: str, client_data: ClientCreate, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()
        
        cursor.execute("""
            UPDATE clients
            SET name = ?, cnpj = ?, address = ?, city = ?, neighborhood = ?, notes = ?, industries = ?, updated_at = ?
            WHERE id = ? AND campaign_id IN (
                SELECT c.id FROM campaigns c
                JOIN sheets s ON c.sheet_id = s.id
                WHERE s.user_id = ?
            )
        """, (client_data.name, client_data.cnpj, client_data.address, client_data.city,
              client_data.neighborhood, client_data.notes, json.dumps(client_data.industries),
              now, client_id, user_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Client not found")
        
        conn.commit()
        
        cursor.execute("SELECT * FROM clients WHERE id = ?", (client_id,))
        result = dict(cursor.fetchone())
        result['industries'] = json.loads(result['industries']) if result['industries'] else {}
        return result

@app.delete("/api/clients/{client_id}")
async def delete_client(client_id: str, user_id: str = Depends(verify_token)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM clients
            WHERE id = ? AND campaign_id IN (
                SELECT c.id FROM campaigns c
                JOIN sheets s ON c.sheet_id = s.id
                WHERE s.user_id = ?
            )
        """, (client_id, user_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Client not found")
        
        conn.commit()
        return {"message": "Client deleted successfully"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
