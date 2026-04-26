from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import google.generativeai as genai

router = APIRouter()

SYSTEM_PROMPT = """Você é o Assistente Venpro, especializado em representação comercial autônoma no Brasil (RCA).

Você ajuda representantes comerciais que trabalham com alimentos, higiene e limpeza a:
- Escrever textos de oferta persuasivos para WhatsApp
- Criar scripts de negociação e respostas a objeções de preço
- Redigir e-mails profissionais para indústrias e clientes
- Sugerir mix ideal de produtos por perfil de cliente (mercadinho, padaria, bar, supermercado)
- Reativar clientes inativos com mensagens personalizadas
- Dar dicas de roteiro de visitas e abordagem comercial
- Interpretar tabelas de preços, calcular margens e prazos

REGRAS IMPORTANTES:
- Textos para WhatsApp: NUNCA inclua saudação (Bom dia/Boa tarde/Olá/nome do cliente). O robô de envio já adiciona automaticamente. Comece direto no conteúdo da oferta.
- Seja direto e prático. O RCA está sempre em movimento, sem tempo para enrolação.
- Use emojis com moderação nos textos de WhatsApp para torná-los mais atraentes.
- Quando gerar ofertas, destaque produto, preço e prazo de pagamento (7, 14, 21 ou 28 dias).
- Para textos que vão para vários clientes, gere versão genérica sem nome específico.
- Fale português brasileiro informal, como um parceiro de negócios experiente no setor.
- Se não souber o preço de um produto, peça ao usuário ou use [PREÇO] como placeholder.

Você conhece bem o mercado de representação comercial brasileiro: positivação, mix de produtos, incentivos de indústria, tabela de preços por prazo, campanhas de sell-out, e o dia a dia do representante na rua."""


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
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada no servidor.")

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=SYSTEM_PROMPT
        )

        history = [
            {"role": msg.role, "parts": [msg.content]}
            for msg in request.history
        ]

        session = model.start_chat(history=history)
        result = session.send_message(request.message)

        return ChatResponse(response=result.text)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao chamar Gemini: {str(e)}")
