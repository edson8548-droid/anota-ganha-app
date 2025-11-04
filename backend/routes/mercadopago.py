# SUBSTITUA: backend/routes/mercadopago.py
# CORRIGIDO: auto_return foi comentado para testes em localhost

import os
import mercadopago
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

# Modelos
class PreferencePayload(BaseModel):
    planId: str
    user: dict

# Configuração
router = APIRouter()
sdk = None

def setup_mercadopago():
    global sdk
    try:
        access_token = os.environ.get("MERCADOPAGO_ACCESS_TOKEN")
        if not access_token:
            logger.error("❌ MERCADOPAGO_ACCESS_TOKEN não encontrado no .env")
            return
        sdk = mercadopago.SDK(access_token)
        logger.info("✅ Mercado Pago SDK configurado com sucesso.")
    except Exception as e:
        logger.error(f"❌ Erro ao configurar Mercado Pago SDK: {e}")
        sdk = None

# Planos
PLANS = {
  "monthly": { "id": "monthly", "price": 39.00, "title": "Plano Mensal - Anota & Ganha", "description": "Acesso ilimitado por 1 mês" },
  "annual_installments": { "id": "annual_installments", "price": 394.80, "installments": 12, "title": "Plano Anual Parcelado", "description": "Acesso ilimitado por 1 ano - 12x" },
  "annual_upfront": { "id": "annual_upfront", "price": 360.00, "title": "Plano Anual à Vista", "description": "Acesso ilimitado por 1 ano" }
}

# Rotas
@router.get("/health")
def health_check():
    return { "status": "ok", "message": "API MP (FastAPI) OK", "hasToken": (sdk is not None) }

@router.post("/create-preference")
async def create_preference(payload: PreferencePayload):
    if not sdk:
        logger.error("❌ Tentativa de criar preferência falhou: SDK não inicializado.")
        raise HTTPException(status_code=500, detail="Mercado Pago SDK não está configurado")

    try:
        plan_id = payload.planId
        user_info = payload.user

        if plan_id not in PLANS: raise HTTPException(status_code=400, detail="Plano inválido")
        if not user_info or not user_info.get('email'): raise HTTPException(status_code=400, detail="Dados do usuário inválidos")

        plan = PLANS[plan_id]
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

        preference_data = {
            "items": [
                {
                    "title": plan["title"],
                    "description": plan["description"],
                    "unit_price": plan["price"],
                    "quantity": 1,
                    "currency_id": "BRL"
                }
            ],
            "payer": {
                "name": user_info.get('name', user_info.get('email')),
                "email": user_info.get('email')
            },
            "back_urls": {
                "success": f"{frontend_url}/payment-success",
                "failure": f"{frontend_url}/payment-failure",
                "pending": f"{frontend_url}/payment-pending"
            },
            
            # ⭐️ CORREÇÃO AQUI ⭐️
            # Desativado para testes em localhost, pois o MP não consegue aceder a 'localhost'
            # "auto_return": "approved",
            
            "payment_methods": { "installments": plan.get("installments", 1) },
            "external_reference": f"{user_info.get('id')}-{plan_id}-{plan.get('price')}",
            "statement_descriptor": "ANOTA&GANHA",
        }

        logger.info("📤 Enviando preferência ao Mercado Pago...")
        preference_response = sdk.preference().create(preference_data)
        logger.info(f"Resposta completa do MP: {preference_response}")

        if preference_response["status"] != 201:
            error_details = preference_response.get("response", {}).get("message", "Nenhum detalhe do erro retornado")
            logger.error(f"❌ Falha ao criar preferência! Status: {preference_response['status']}. Detalhes: {error_details}")
            raise HTTPException(status_code=500, detail=f"Erro ao criar preferência no MP: {error_details}")

        preference = preference_response["response"]
        logger.info(f"✅ Preferência criada: {preference['id']}")

        return {
            "preferenceId": preference["id"],
            "initPoint": preference["init_point"],
            "sandboxInitPoint": preference.get("sandbox_init_point")
        }

    except Exception as e:
        logger.error(f"❌ Erro grave ao criar preferência: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno do servidor: {str(e)}")

# (O Webhook permanece o mesmo por agora)
@router.post("/webhook")
async def webhook(request: Request):
    return {"status": "ok"}