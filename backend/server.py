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

# PostgreSQL database URL - HARDCODED!
DATABASE_URL = 'postgresql://anota_ganha_user:ZJ9wbemhq9szq1llTSl55rRtPbmfxote@dpg-d41887ili9vc739grorg-a/anota_ganha'

logger.info(f"🔍 DATABASE_URL: {DATABASE_URL}")

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
        logger.info("Database initialized successfully")

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
    logger.info("Application started")

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

@app.get("/health")
async def health_check():
    return {"status": "healthy", "database": DATABASE_URL[:20] + "..."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
