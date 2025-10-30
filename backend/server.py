from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
import jwt
from datetime import datetime, timedelta

app = FastAPI()

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

@app.get("/api/auth/me")
async def get_me():
    return {
        "id": "test-user",
        "email": "admin@anotaganha.com",
        "full_name": "Test User"
    }

@app.get("/api/campaigns")
async def get_campaigns():
    return []

@app.post("/api/campaigns")
async def create_campaign():
    return {"id": "1", "name": "Campaign"}

@app.get("/api/sheets")
async def get_sheets():
    return []

@app.post("/api/sheets")
async def create_sheet():
    return {"id": "1", "name": "Sheet"}

@app.get("/api/clients")
async def get_clients():
    return []

@app.post("/api/clients")
async def create_client():
    return {"id": "1", "name": "Client"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
