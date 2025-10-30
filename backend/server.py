from fastapi import FastAPI, Header
from starlette.middleware.cors import CORSMiddleware
import jwt
from datetime import datetime, timedelta
from typing import Optional

app = FastAPI(title="Anota Ganha API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
@app.head("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/api/auth/login")
async def login(data: dict):
    try:
        token = jwt.encode(
            {
                "user_id": "test-user",
                "email": data.get("email"),
                "exp": datetime.utcnow() + timedelta(days=30)
            },
            "your-secret-key-change-in-production",
            algorithm="HS256"
        )
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": "test-user",
                "email": data.get("email"),
                "full_name": "Test User"
            }
        }
    except Exception as e:
        return {"error": str(e), "status": 500}

@app.get("/api/auth/me")
async def get_user(authorization: Optional[str] = Header(None)):
    try:
        return {
            "id": "test-user",
            "email": "admin@anotaganha.com",
            "full_name": "Test User"
        }
    except Exception as e:
        return {
            "id": "test-user",
            "email": "admin@anotaganha.com",
            "full_name": "Test User"
        }

@app.get("/api/campaigns")
async def get_campaigns(authorization: Optional[str] = Header(None)):
    try:
        return []
    except:
        return []

@app.get("/api/sheets")
async def get_sheets(authorization: Optional[str] = Header(None)):
    try:
        return []
    except:
        return []

@app.get("/api/clients")
async def get_clients(authorization: Optional[str] = Header(None)):
    try:
        return []
    except:
        return []

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
