# SUBSTITUA: backend/routes/mercadopago.py
# FINALIZADO: Adicionada lógica de Webhook para ativar licença no Firebase Firestore

import os
import mercadopago
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import logging
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ============================================
# ⭐️ INICIALIZAÇÃO DO FIREBASE ADMIN ⭐️
# ============================================
def initialize_firebase():
    """
    Tenta inicializar o Firebase Admin SDK usando variáveis de ambiente do Railway.
    """
    if firebase_admin._apps:
        return firestore.client()

    try:
        # A Vercel/Railway precisa da private key numa string JSON/Base64
        # Assumimos que o utilizador vai adicionar as variáveis FIREBASE_...
        
        # ⚠️ IMPORTANTE: TU TENS DE CONFIGURAR ESTAS CHAVES NO RAILWAY
        firebase_config = {
            "type": "service_account",
            "project_id": os.environ.get("FIREBASE_PROJECT_ID"),
            "private_key_id": os.environ.get("FIREBASE_PRIVATE_KEY_ID"),
            "private_key": os.environ.get("FIREBASE_PRIVATE_KEY").replace('\\n', '\n'), # Converte o \n
            "client_email": os.environ.get("FIREBASE_CLIENT_EMAIL"),
            "client_id": os.environ.get("FIREBASE_CLIENT_ID"),
            "token_uri": "https://oauth2.googleapis.com/token"
        }
        
        if not firebase_config["project_id"] or not firebase_config["private_key"]:
             raise ValueError("Variáveis FIREBASE_PROJECT_ID ou FIREBASE_PRIVATE_KEY não configuradas.")

        cred = credentials.Certificate(firebase_config)
        firebase_admin.initialize_app(cred)
        logger.info("✅ Firebase Admin SDK inicializado.")
        return firestore.client()
        
    except Exception as e:
        logger.error(f"❌ ERRO GRAVE: Falha ao inicializar o Firebase Admin: {e}")
        return None


# ============================================
# MODELOS E CONFIGURAÇÃO
# ============================================
class PreferencePayload(BaseModel):
    planId: str
    user: dict

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

PLANS = {
  "monthly": { "id": "monthly", "price": 39.00, "title": "Plano Mensal - Anota & Ganha", "description": "Acesso ilimitado por 1 mês" },
  "annual_installments": { "id": "annual_installments", "price": 394.80, "installments": 12, "title": "Plano Anual Parcelado", "description": "Acesso ilimitado por 1 ano - 12x" },
  "annual_upfront": { "id": "annual_upfront", "price": 360.00, "title": "Plano Anual à Vista", "description": "Acesso ilimitado por 1 ano" }
}

# ============================================
# ROTAS DE PREFERÊNCIA (Mantidas)
# ============================================
@router.post("/create-preference")
async def create_preference(payload: PreferencePayload):
    if not sdk:
        raise HTTPException(status_code=500, detail="Mercado Pago SDK não está configurado")

    try:
        plan_id = payload.planId
        user_info = payload.user
        plan = PLANS[plan_id]
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

        preference_data = {
            "items": [
                { "title": plan["title"], "description": plan["description"], "unit_price": plan["price"], "quantity": 1, "currency_id": "BRL" }
            ],
            "payer": { "name": user_info.get('name', user_info.get('email')), "email": user_info.get('email') },
            "back_urls": {
                "success": f"{frontend_url}/payment-success",
                "failure": f"{frontend_url}/payment-failure",
                "pending": f"{frontend_url}/payment-pending"
            },
            "payment_methods": { "installments": plan.get("installments", 1) },
            "external_reference": f"{user_info.get('id')}-{plan_id}-{plan.get('price')}",
            "statement_descriptor": "ANOTA&GANHA",
        }

        preference_response = sdk.preference().create(preference_data)
        
        if preference_response["status"] != 201:
            error_details = preference_response.get("response", {}).get("message", "Nenhum detalhe do erro retornado")
            logger.error(f"❌ Falha ao criar preferência! Detalhes: {error_details}")
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

# ============================================
# ⭐️ ROTA: WEBHOOK (LÓGICA DE ATIVAÇÃO) ⭐️
# ============================================
@router.post("/webhook")
async def webhook(request: Request):
    if not sdk:
        logger.error("❌ Webhook falhou: SDK não inicializado.")
        return {"status": "error", "message": "SDK not initialized"}
    
    db_firestore = initialize_firebase()
    if not db_firestore:
        logger.error("❌ Webhook falhou: Firebase Admin não inicializado.")
        return {"status": "error", "message": "Firebase Admin not initialized"}
        
    try:
        # Pega o body e verifica se é uma notificação do tipo 'payment'
        body = await request.json()
        if body.get("type") != "payment":
            return {"status": "ok", "message": "Tipo de evento ignorado"}

        payment_id = body.get("data", {}).get("id")
        if not payment_id:
            return {"status": "ok", "message": "Ignorado (sem ID de pagamento)"}

        # 1. Busca os detalhes do pagamento no Mercado Pago
        payment_response = sdk.payment().get(payment_id)
        if payment_response["status"] != 200:
            logger.warning("❌ Pagamento não encontrado no MP")
            return {"status": "ok", "message": "Pagamento não encontrado"}

        payment_data = payment_response["response"]
        status = payment_data.get("status")
        external_reference = payment_data.get("external_reference") # ex: "user456-monthly-39.00"

        # 2. Processa se o status for APROVADO
        if status == "approved":
            logger.info(f"✅ Pagamento APROVADO! Ref: {external_reference}")
            
            # Descodifica a referência externa para obter o user_id e plan_id
            if external_reference:
                parts = external_reference.split('-')
                user_id = parts[0]
                plan_id = parts[1]
                
                # 3. Atualiza o Firestore (Coleção 'subscriptions')
                subscription_ref = db_firestore.collection('subscriptions').document(user_id)
                await subscription_ref.set({
                    "userId": user_id,
                    "planId": plan_id,
                    "status": "active", # Ativa a licença
                    "paymentId": payment_id,
                    "lastPaymentDate": datetime.now(timezone.utc),
                    "updatedAt": datetime.now(timezone.utc),
                    "trialEndsAt": None, # Remove o trial
                }, merge=True)
                
                logger.info(f"🔥 LICENÇA ATIVADA: Usuário {user_id} para o plano {plan_id}.")
                
            else:
                logger.warning("⚠️ Pagamento aprovado, mas sem external_reference para ativar a licença.")
        
        elif status == "pending":
            logger.info(f"⏳ Pagamento PENDENTE. Ref: {external_reference}")
            # Tu podes adicionar lógica aqui para notificar o cliente
        
        elif status == "rejected":
            logger.info(f"❌ Pagamento REJEITADO. Ref: {external_reference}")

    except Exception as e:
        logger.error(f"❌ Erro grave no webhook: {e}", exc_info=True)
        return {"status": "error"}

    return {"status": "ok"}