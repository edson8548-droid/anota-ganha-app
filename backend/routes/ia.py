from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()


class Message(BaseModel):
    role: str   # "user" ou "model"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Message]] = []


class ChatResponse(BaseModel):
    response: str


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    raise HTTPException(
        status_code=410,
        detail="Chat integrado desativado. Use a Central de Prompts para copiar prompts e usar na IA da sua conta.",
    )
