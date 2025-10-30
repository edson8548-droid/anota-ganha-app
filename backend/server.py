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
import traceback

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
MERCADO_PAGO_ACCESS_TOKEN = os.getenv("MERCADO_PAGO_ACCESS_TOKEN", "APP_USR-1820866618844609-102715-50d2e55c2a84b9f8c36a037937cca826-1359819318")
MERCADO_PAGO_WEBHOOK_SECRET = os.getenv("MERCADO_PAGO_WEBHOOK_SECRET", "webhook-secret-key")

# FastAPI app
app = FastAPI(title="Anota Ganha API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Pydantic models
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

# Database helper
@contextmanager
def get_db():
    """Context manager for database connections"""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error: {str(e)}")
        raise
    finally:
        conn.close()

# Authentication helpers
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify JWT token"""
    token = credentials.credentials
    try:
        secret_key = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_id": user_id, "email": payload.get("email")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def verify_license_middleware(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Verify token and check license - CORRIGIDO"""
    user_data = await verify_token(credentials)
    
    # Check license
    with get_db() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            SELECT u.id, l.status, l.plan_type 
            FROM users u 
            LEFT JOIN licenses l ON u.id = l.user_id 
            WHERE u.id = %s
            """,
            (user_data["user_id"],)
        )
        result = cursor.fetchone()
        
        if not result:
            raise HTTPException(status_code=401, detail="User not found")
        
        # ✅ CORRIGIDO: Verificar se status existe E se é ativo
        if not result.get("status") or result.get("status") != "active":
            raise HTTPException(status_code=403, detail="License inactive or not found")
    
    return user_data["user_id"]

async def check_license(user_id: str) -> tuple:
    """Check if user has valid license"""
    try:
        with get_db() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                "SELECT status, plan_type FROM licenses WHERE user_id = %s",
                (user_id,)
            )
            license_data = cursor.fetchone()
            
            if not license_data or license_data["status"] != "active":
                return False, "License not active"
            
            return True, "License valid"
    except Exception as e:
        logger.error(f"Error checking license: {str(e)}")
        return False, f"Error checking license: {str(e)}"

# Health check endpoint
@app.get("/health")
@app.head("/health")
async def health_check():
    """Health check endpoint - Supports GET and HEAD"""
    return {"status": "healthy", "database": "PostgreSQL connected"}
# ==================== CAMPAIGNS ROUTES ====================

@app.post("/api/campaigns")
async def create_campaign_direct(campaign_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Create campaign with auto-sheet creation"""
    try:
        logger.info(f"📥 Recebendo dados da campanha: {campaign_data}")
        
        # Verificar se tem sheet_id
        sheet_id = campaign_data.get('sheet_id') or campaign_data.get('sheetId')
        
        # ✅ SE NÃO TIVER SHEET_ID, CRIAR AUTOMATICAMENTE
        if not sheet_id:
            logger.info("📝 Criando sheet 'Geral' automaticamente...")
            
            with get_db() as conn:
                cursor = conn.cursor()
                
                # Criar sheet padrão
                new_sheet_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc)
                
                cursor.execute(
                    "INSERT INTO sheets (id, user_id, name, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
                    (new_sheet_id, user_id, "Geral", now, now)
                )
                conn.commit()
                
                sheet_id = new_sheet_id
                logger.info(f"✅ Sheet criada automaticamente: {sheet_id}")
        
        # Verificar se a sheet existe e pertence ao usuário
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
            if not cursor.fetchone():
                logger.error(f"❌ Sheet {sheet_id} não encontrada para usuário {user_id}")
                raise HTTPException(status_code=404, detail="Sheet not found")
        
        # Criar campanha
        campaign_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        name = campaign_data.get('name', '')
        if not name:
            raise HTTPException(status_code=400, detail="Campaign name is required")
        
        start_date = campaign_data.get('start_date') or campaign_data.get('startDate')
        end_date = campaign_data.get('end_date') or campaign_data.get('endDate')
        status = campaign_data.get('status', 'active')
        industries = campaign_data.get('industries', [])
        
        # Converter datas se necessário
        if start_date and isinstance(start_date, str):
            try:
                start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except:
                start_date = None
        
        if end_date and isinstance(end_date, str):
            try:
                end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except:
                end_date = None
        
        # Converter industries para JSON
        industries_json = json.dumps(industries) if industries else '[]'
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO campaigns (id, user_id, sheet_id, name, start_date, end_date, status, industries, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (campaign_id, user_id, sheet_id, name, start_date, end_date, status, industries_json, now, now)
            )
            conn.commit()
        
        logger.info(f"✅ Campanha criada com sucesso: {campaign_id}")
        
        return {
            "id": campaign_id,
            "user_id": user_id,
            "sheet_id": sheet_id,
            "name": name,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "status": status,
            "industries": industries,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao criar campanha: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error creating campaign: {str(e)}")

@app.get("/api/campaigns")
async def get_campaigns_direct(user_id: str = Depends(verify_license_middleware)):
    """Get all campaigns for user"""
    try:
        with get_db() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                "SELECT * FROM campaigns WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,)
            )
            campaigns = cursor.fetchall()
            
            result = []
            for campaign in campaigns:
                # Parse industries JSON
                if campaign['industries']:
                    if isinstance(campaign['industries'], str):
                        campaign['industries'] = json.loads(campaign['industries'])
                else:
                    campaign['industries'] = []
                
                # Convert datetime to ISO format
                if campaign.get('start_date'):
                    campaign['start_date'] = campaign['start_date'].isoformat()
                if campaign.get('end_date'):
                    campaign['end_date'] = campaign['end_date'].isoformat()
                if campaign.get('created_at'):
                    campaign['created_at'] = campaign['created_at'].isoformat()
                if campaign.get('updated_at'):
                    campaign['updated_at'] = campaign['updated_at'].isoformat()
                
                result.append(dict(campaign))
            
            return result
            
    except Exception as e:
        logger.error(f"Error getting campaigns: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting campaigns: {str(e)}")

@app.get("/api/campaigns/{campaign_id}")
async def get_campaign_direct(campaign_id: str, user_id: str = Depends(verify_license_middleware)):
    """Get campaign by ID"""
    try:
        with get_db() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                "SELECT * FROM campaigns WHERE id = %s AND user_id = %s",
                (campaign_id, user_id)
            )
            campaign = cursor.fetchone()
            
            if not campaign:
                raise HTTPException(status_code=404, detail="Campaign not found")
            
            # Parse industries JSON
            if campaign['industries']:
                if isinstance(campaign['industries'], str):
                    campaign['industries'] = json.loads(campaign['industries'])
            else:
                campaign['industries'] = []
            
            # Convert datetime to ISO format
            if campaign.get('start_date'):
                campaign['start_date'] = campaign['start_date'].isoformat()
            if campaign.get('end_date'):
                campaign['end_date'] = campaign['end_date'].isoformat()
            if campaign.get('created_at'):
                campaign['created_at'] = campaign['created_at'].isoformat()
            if campaign.get('updated_at'):
                campaign['updated_at'] = campaign['updated_at'].isoformat()
            
            return dict(campaign)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting campaign: {str(e)}")

@app.put("/api/campaigns/{campaign_id}")
async def update_campaign_direct(campaign_id: str, campaign_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Update campaign"""
    try:
        # Verificar se a campanha existe e pertence ao usuário
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM campaigns WHERE id = %s AND user_id = %s", (campaign_id, user_id))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Campaign not found")
        
        now = datetime.now(timezone.utc)
        
        # Campos a atualizar
        update_fields = []
        update_values = []
        
        if 'name' in campaign_data:
            update_fields.append("name = %s")
            update_values.append(campaign_data['name'])
        
        if 'start_date' in campaign_data:
            start_date = campaign_data['start_date']
            if isinstance(start_date, str):
                try:
                    start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                except:
                    start_date = None
            update_fields.append("start_date = %s")
            update_values.append(start_date)
        
        if 'end_date' in campaign_data:
            end_date = campaign_data['end_date']
            if isinstance(end_date, str):
                try:
                    end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                except:
                    end_date = None
            update_fields.append("end_date = %s")
            update_values.append(end_date)
        
        if 'status' in campaign_data:
            update_fields.append("status = %s")
            update_values.append(campaign_data['status'])
        
        if 'industries' in campaign_data:
            industries_json = json.dumps(campaign_data['industries'])
            update_fields.append("industries = %s")
            update_values.append(industries_json)
        
        update_fields.append("updated_at = %s")
        update_values.append(now)
        
        # Add campaign_id and user_id for WHERE clause
        update_values.extend([campaign_id, user_id])
        
        update_query = f"UPDATE campaigns SET {', '.join(update_fields)} WHERE id = %s AND user_id = %s"
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(update_query, update_values)
            conn.commit()
        
        logger.info(f"✅ Campanha atualizada: {campaign_id}")
        
        # Buscar campanha atualizada
        return await get_campaign_direct(campaign_id, user_id)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating campaign: {str(e)}")

@app.delete("/api/campaigns/{campaign_id}")
async def delete_campaign_direct(campaign_id: str, user_id: str = Depends(verify_license_middleware)):
    """Delete campaign"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Verificar se existe
            cursor.execute("SELECT id FROM campaigns WHERE id = %s AND user_id = %s", (campaign_id, user_id))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Campaign not found")
            
            # Deletar clientes da campanha
            cursor.execute("DELETE FROM clients WHERE campaign_id = %s", (campaign_id,))
            
            # Deletar campanha
            cursor.execute("DELETE FROM campaigns WHERE id = %s AND user_id = %s", (campaign_id, user_id))
            conn.commit()
        
        logger.info(f"✅ Campanha deletada: {campaign_id}")
        return {"message": "Campaign deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting campaign: {str(e)}")
# ==================== SHEETS ROUTES ====================

@app.get("/api/sheets")
async def get_sheets_direct(campaign_id: str = None, user_id: str = Depends(verify_license_middleware)):
    """Get sheets for campaign or all sheets for user"""
    try:
        with get_db() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            if campaign_id:
                cursor.execute(
                    """
                    SELECT s.* FROM sheets s
                    WHERE s.user_id = %s AND s.id IN (
                        SELECT sheet_id FROM campaigns WHERE id = %s AND user_id = %s
                    )
                    ORDER BY s.created_at DESC
                    """,
                    (user_id, campaign_id, user_id)
                )
            else:
                cursor.execute(
                    "SELECT * FROM sheets WHERE user_id = %s ORDER BY created_at DESC",
                    (user_id,)
                )
            
            sheets = cursor.fetchall()
            result = []
            
            for sheet in sheets:
                if sheet.get('created_at'):
                    sheet['created_at'] = sheet['created_at'].isoformat()
                if sheet.get('updated_at'):
                    sheet['updated_at'] = sheet['updated_at'].isoformat()
                result.append(dict(sheet))
            
            return result
            
    except Exception as e:
        logger.error(f"Error getting sheets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting sheets: {str(e)}")

@app.post("/api/sheets")
async def create_sheet_direct(sheet_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Create new sheet"""
    try:
        sheet_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        name = sheet_data.get('name', 'Nova Planilha')
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO sheets (id, user_id, name, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
                (sheet_id, user_id, name, now, now)
            )
            conn.commit()
        
        logger.info(f"✅ Sheet criada: {sheet_id}")
        
        return {
            "id": sheet_id,
            "user_id": user_id,
            "name": name,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error creating sheet: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating sheet: {str(e)}")

@app.put("/api/sheets/{sheet_id}")
async def update_sheet_direct(sheet_id: str, sheet_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Update sheet"""
    try:
        now = datetime.now(timezone.utc)
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE sheets SET name = %s, updated_at = %s WHERE id = %s AND user_id = %s",
                (sheet_data.get('name', ''), now, sheet_id, user_id)
            )
            conn.commit()
        
        logger.info(f"✅ Sheet atualizada: {sheet_id}")
        return {"message": "Sheet updated successfully"}
        
    except Exception as e:
        logger.error(f"Error updating sheet: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating sheet: {str(e)}")

@app.delete("/api/sheets/{sheet_id}")
async def delete_sheet_direct(sheet_id: str, user_id: str = Depends(verify_license_middleware)):
    """Delete sheet"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Deletar clientes da sheet
            cursor.execute("DELETE FROM clients WHERE sheet_id = %s", (sheet_id,))
            
            # Deletar sheet
            cursor.execute("DELETE FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
            conn.commit()
        
        logger.info(f"✅ Sheet deletada: {sheet_id}")
        return {"message": "Sheet deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting sheet: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting sheet: {str(e)}")

# ==================== CLIENTS ROUTES ====================

@app.get("/api/clients")
async def get_clients_direct(campaign_id: str = None, sheet_id: str = None, user_id: str = Depends(verify_license_middleware)):
    """Get clients for campaign or sheet"""
    try:
        with get_db() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            if sheet_id:
                cursor.execute(
                    "SELECT * FROM clients WHERE sheet_id = %s AND campaign_id = %s ORDER BY CLIENTE DESC",
                    (sheet_id, campaign_id)
                )
            else:
                cursor.execute(
                    "SELECT * FROM clients WHERE campaign_id = %s ORDER BY CLIENTE DESC",
                    (campaign_id,)
                )
            
            clients = cursor.fetchall()
            result = []
            
            for client in clients:
                if client.get('created_at'):
                    client['created_at'] = client['created_at'].isoformat()
                if client.get('updated_at'):
                    client['updated_at'] = client['updated_at'].isoformat()
                result.append(dict(client))
            
            return result
            
    except Exception as e:
        logger.error(f"Error getting clients: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting clients: {str(e)}")

@app.post("/api/clients")
async def create_client_direct(client_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Create new client"""
    try:
        client_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        campaign_id = client_data.get('campaign_id')
        sheet_id = client_data.get('sheet_id')
        
        if not campaign_id or not sheet_id:
            raise HTTPException(status_code=400, detail="campaign_id and sheet_id required")
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO clients (id, campaign_id, sheet_id, user_id, CLIENTE, CIDADE, BAIRRO, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (client_id, campaign_id, sheet_id, user_id, client_data.get('CLIENTE', ''), 
                 client_data.get('CIDADE', ''), client_data.get('BAIRRO', ''), now, now)
            )
            conn.commit()
        
        logger.info(f"✅ Client criado: {client_id}")
        return {"id": client_id, "message": "Client created successfully"}
        
    except Exception as e:
        logger.error(f"Error creating client: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating client: {str(e)}")

@app.put("/api/clients/{client_id}")
async def update_client_direct(client_id: str, client_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Update client"""
    try:
        now = datetime.now(timezone.utc)
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE clients 
                SET CLIENTE = %s, CIDADE = %s, BAIRRO = %s, updated_at = %s
                WHERE id = %s
                """,
                (client_data.get('CLIENTE', ''), client_data.get('CIDADE', ''), 
                 client_data.get('BAIRRO', ''), now, client_id)
            )
            conn.commit()
        
        logger.info(f"✅ Client atualizado: {client_id}")
        return {"message": "Client updated successfully"}
        
    except Exception as e:
        logger.error(f"Error updating client: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating client: {str(e)}")

@app.delete("/api/clients/{client_id}")
async def delete_client_direct(client_id: str, user_id: str = Depends(verify_license_middleware)):
    """Delete client"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM clients WHERE id = %s", (client_id,))
            conn.commit()
        
        logger.info(f"✅ Client deletado: {client_id}")
        return {"message": "Client deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting client: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting client: {str(e)}")
# ==================== STATS ROUTES ====================

@app.get("/api/campaigns/{campaign_id}/stats")
async def get_campaign_stats(campaign_id: str, user_id: str = Depends(verify_license_middleware)):
    """Get campaign statistics"""
    try:
        with get_db() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute(
                "SELECT COUNT(*) as total_clients FROM clients WHERE campaign_id = %s",
                (campaign_id,)
            )
            result = cursor.fetchone()
            
            return {
                "campaign_id": campaign_id,
                "total_clients": result['total_clients'] if result else 0
            }
            
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting stats: {str(e)}")

@app.get("/api/campaigns/{campaign_id}/stats/city")
async def get_campaign_stats_by_city(campaign_id: str, user_id: str = Depends(verify_license_middleware)):
    """Get campaign statistics by city"""
    try:
        with get_db() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute(
                """
                SELECT CIDADE, COUNT(*) as total
                FROM clients
                WHERE campaign_id = %s
                GROUP BY CIDADE
                ORDER BY total DESC
                """,
                (campaign_id,)
            )
            results = cursor.fetchall()
            
            return [dict(row) for row in results]
            
    except Exception as e:
        logger.error(f"Error getting city stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting city stats: {str(e)}")

# ==================== AUTH ROUTES ====================

@app.post("/api/auth/login")
async def login(user_data: UserLogin):
    """Login user"""
    try:
        with get_db() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                "SELECT * FROM users WHERE email = %s",
                (user_data.email,)
            )
            user = cursor.fetchone()
            
            if not user:
                raise HTTPException(status_code=401, detail="Invalid credentials")
            
            # Verify password
            if not bcrypt.checkpw(user_data.password.encode('utf-8'), user['password'].encode('utf-8')):
                raise HTTPException(status_code=401, detail="Invalid credentials")
            
            # Generate JWT token
            secret_key = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
            token = jwt.encode(
                {
                    "user_id": user['id'],
                    "email": user['email'],
                    "exp": datetime.utcnow() + timedelta(days=30)
                },
                secret_key,
                algorithm="HS256"
            )
            
            logger.info(f"✅ User logged in: {user['email']}")
            
            return {
                "access_token": token,
                "token_type": "bearer",
                "user": {
                    "id": user['id'],
                    "email": user['email'],
                    "full_name": user.get('full_name', '')
                }
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error logging in: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error logging in: {str(e)}")

@app.post("/api/auth/register")
async def register(user_data: UserCreate):
    """Register new user"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Check if user exists
            cursor.execute("SELECT id FROM users WHERE email = %s", (user_data.email,))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered")
            
            # Hash password
            hashed_password = bcrypt.hashpw(user_data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            
            # Create user
            user_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            
            cursor.execute(
                """
                INSERT INTO users (id, email, full_name, password, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_id, user_data.email, user_data.full_name, hashed_password, now, now)
            )
            conn.commit()
            
            logger.info(f"✅ User registered: {user_data.email}")
            
            return {
                "id": user_id,
                "email": user_data.email,
                "full_name": user_data.full_name,
                "message": "User registered successfully"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error registering user: {str(e)}")

# ==================== ERROR HANDLERS ====================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

# ==================== MAIN ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
