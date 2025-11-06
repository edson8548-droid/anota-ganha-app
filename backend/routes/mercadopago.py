# SUBSTITUA: backend/routes/mercadopago.py
# ⭐️ VERSÃO 2: Otimizado para aprovação (Envia CPF e Telefone)

import os
import mercadopago
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import logging
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone
from typing import Optional 

# SDKs para E-mail e Firebase
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)

# ============================================
# MODELOS PYDANTIC (Schema de Dados)
# ============================================

class UserInfoPayload(BaseModel):
    id: str
    email: str
    name: str

class PreferencePayload(BaseModel):
    planId: str
    user: UserInfoPayload
    deviceId: Optional[str] = None 

# ============================================
# FUNÇÕES AUXILIARES DE E-MAIL (Mantidas)
# ============================================

def send_payment_success_email(recipient_email: str, user_name: str, plan_name: str, value: float):
    """ Envia um recibo de confirmação de pagamento (status: approved). """
    
    sendgrid_api_key = os.environ.get("SENDGRID_API_KEY")
    from_email = os.environ.get("FROM_EMAIL", "suporte@anotaganha.com")
    
    if not sendgrid_api_key or not from_email: return

    try:
        sg = SendGridAPIClient(sendgrid_api_key)
        value_brl = f"R$ {value:.2f}".replace('.', ',')

        html_content = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                <h2 style="color: #667eea;">✅ Assinatura Ativada com Sucesso!</h2>
                <p>Olá, <strong>{user_name}</strong>!</p>
                <p>Obrigado por confiar no Anota & Ganha. O teu pagamento foi confirmado e a tua licença foi ativada.</p>
                <h3 style="color: #10b981;">Detalhes da Assinatura:</h3>
                <ul>
                    <li><strong>Plano:</strong> {plan_name}</li>
                    <li><strong>Valor Total:</strong> {value_brl}</li>
                    <li><strong>Status:</strong> Ativo (Acesso Total)</li>
                </ul>
                <p>Podes aceder ao teu painel e começar a usar todos os recursos ilimitados agora:</p>
                <a href="{os.environ.get('FRONTEND_URL')}/dashboard" 
                   style="display: inline-block; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                   Aceder ao Dashboard
                </a>
                <p style="margin-top: 30px; font-size: 12px; color: #999;">Esta é uma mensagem automática. Por favor, não responda.</p>
            </div>
        """

        message = Mail(from_email=from_email, to_emails=recipient_email, subject=f"✅ Confirmação: Assinatura {plan_name} Ativada", html_content=html_content)
        sg.send(message)
        logger.info(f"✉️ E-mail de sucesso enviado para {recipient_email}.")
        
    except Exception as e:
        logger.error(f"❌ ERRO ao enviar e-mail de sucesso: {e}")


def send_payment_rejection_email(recipient_email: str, user_name: str):
    """ Envia uma notificação de recusa de pagamento (status: rejected). """
    
    sendgrid_api_key = os.environ.get("SENDGRID_API_KEY")
    from_email = os.environ.get("FROM_EMAIL", "suporte@anotaganha.com")
    
    if not sendgrid_api_key or not from_email: return

    try:
        sg = SendGridAPIClient(sendgrid_api_key)
        
        html_content = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #f99; background: #fff5f5; padding: 20px; border-radius: 8px;">
                <h2 style="color: #ef4444;">❌ Pagamento Recusado</h2>
                <p>Olá, <strong>{user_name}</strong>!</p>
                
                <p>O Mercado Pago recusou o pagamento da sua assinatura. Nenhum valor foi cobrado no seu cartão ou conta.</p>
                
                <h3 style="color: #ca8a04;">O que pode fazer?</h3>
                <ol>
                    <li>Verifique se os dados do cartão foram digitados corretamente.</li>
                    <li>Tente pagar com um **cartão diferente** ou com **PIX**.</li>
                    <li>Contacte a operadora do seu cartão para verificar se existe algum bloqueio de segurança.</li>
                </ol>
                
                <p>Para tentar novamente, aceda ao seu painel:</p>
                <a href="{os.environ.get('FRONTEND_URL')}/plans" 
                   style="display: inline-block; padding: 10px 20px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                   Tentar Outra Forma de Pagamento
                </a>
                
                <p style="margin-top: 30px; font-size: 12px; color: #999;">Se o problema persistir, por favor, contacte o suporte.</p>
            </div>
        """

        message = Mail(from_email=from_email, to_emails=recipient_email, subject=f"❌ Problema no Pagamento: Assinatura Recusada", html_content=html_content)
        sg.send(message)
        logger.info(f"✉️ E-mail de recusa enviado para {recipient_email}.")
        
    except Exception as e:
        logger.error(f"❌ ERRO ao enviar e-mail de recusa: {e}")


# ============================================
# INICIALIZAÇÃO DO FIREBASE ADMIN (Mantida)
# ============================================
def initialize_firebase():
    if firebase_admin._apps: return firestore.client()
    try:
        firebase_config = {
            "type": "service_account",
            "project_id": os.environ.get("FIREBASE_PROJECT_ID"),
            "private_key_id": os.environ.get("FIREBASE_PRIVATE_KEY_ID"),
            "private_key": os.environ.get("FIREBASE_PRIVATE_KEY").replace('\\n', '\n'),
            "client_email": os.environ.get("FIREBASE_CLIENT_EMAIL"),
            "client_id": os.environ.get("FIREBASE_CLIENT_ID"),
            "token_uri": "https://oauth2.googleapis.com/token"
        }
        if not firebase_config["project_id"] or not firebase_config["private_key"]: raise ValueError("Variáveis FIREBASE_... não configuradas.")
        cred = credentials.Certificate(firebase_config)
        firebase_admin.initialize_app(cred)
        logger.info("✅ Firebase Admin SDK inicializado.")
        return firestore.client()
    except Exception as e:
        logger.error(f"❌ ERRO GRAVE: Falha ao inicializar o Firebase Admin: {e}")
        return None

# ... (Configuração, router, sdk, PLANS mantidos) ...
router = APIRouter()
sdk = None

def setup_mercadopago():
    global sdk
    try:
        access_token = os.environ.get("MERCADOPAGO_ACCESS_TOKEN")
        if not access_token: return
        sdk = mercadopago.SDK(access_token)
        logger.info("✅ Mercado Pago SDK configurado com sucesso.")
    except Exception as e:
        logger.error(f"❌ Erro ao configurar Mercado Pago SDK: {e}")
        sdk = None

PLANS = {
  "monthly": { "id": "monthly", "price": 39.00, "title": "Plano Mensal - Anota & Ganha" },
  "annual_installments": { "id": "annual_installments", "price": 394.80, "title": "Plano Anual Parcelado" },
  "annual_upfront": { "id": "annual_upfront", "price": 360.00, "title": "Plano Anual à Vista" }
}

# ============================================
# ⭐️ ROTA DE PREFERÊNCIA (OTIMIZADA PARA APROVAÇÃO) ⭐️
# ============================================
@router.post("/create-preference")
async def create_preference(payload: PreferencePayload):
    if not sdk: raise HTTPException(status_code=500, detail="Mercado Pago SDK não está configurado")
    
    # ⭐️ 1. INICIALIZAR O FIREBASE ADMIN (NOVO NESTA ROTA) ⭐️
    db_firestore = initialize_firebase()
    if not db_firestore:
        raise HTTPException(status_code=500, detail="Firebase Admin não inicializado")
        
    try:
        plan_id = payload.planId
        user_info_dict = payload.user.model_dump() 
        user_id = user_info_dict.get('id') # ⭐️ ID do utilizador
        plan = PLANS[plan_id]
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

        # ⭐️ 2. BUSCAR DADOS COMPLETOS DO UTILIZADOR (CPF/TELEFONE) DO FIREBASE ⭐️
        user_cpf = None
        user_telefone = None
        if user_id:
            try:
                user_doc_ref = db_firestore.collection('users').document(user_id)
                user_doc = user_doc_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    user_cpf = user_data.get('cpf')
                    user_telefone = user_data.get('telefone')
                    logger.info(f"✅ Dados do utilizador {user_id} encontrados (CPF: {'Sim' if user_cpf else 'Não'})")
                else:
                    logger.warning(f"⚠️ Documento do utilizador {user_id} não encontrado no Firestore.")
            except Exception as e:
                logger.error(f"❌ Erro ao buscar dados do utilizador {user_id} no Firestore: {e}")

        # ⭐️ 3. MONTAR O OBJETO 'PAYER' OTIMIZADO ⭐️
        payer_data = {
            "name": user_info_dict.get('name', user_info_dict.get('email')),
            "email": user_info_dict.get('email')
        }

        # Adiciona CPF (Obrigatório para flexibilização)
        if user_cpf:
            payer_data["identification"] = {
                "type": "CPF",
                "number": user_cpf # O CPF já deve estar limpo (só dígitos)
            }

        # Adiciona Telefone (Obrigatório para flexibilização)
        if user_telefone and len(user_telefone) >= 10:
            payer_data["phone"] = {
                "area_code": user_telefone[:2], # Primeiros 2 dígitos (DDD)
                "number": user_telefone[2:]  # O resto
            }
        
        # 4. DADOS DA PREFERÊNCIA (Usando o 'payer_data' otimizado)
        preference_data = {
            "items": [{ 
                "title": plan["title"], 
                "unit_price": plan["price"], 
                "quantity": 1, 
                "currency_id": "BRL",
            }],
            "payer": payer_data, # ⭐️ USA O NOVO OBJETO 'PAYER'
            "back_urls": { "success": f"{frontend_url}/payment-success", "failure": f"{frontend_url}/payment-failure", "pending": f"{frontend_url}/payment-pending" },
            "payment_methods": { "installments": plan.get("installments", 1) },
            "external_reference": f"{user_id}-{plan_id}-{plan.get('price')}",
            "statement_descriptor": "ANOTA&GANHA",
        }

        # 5. OPÇÕES DA REQUISIÇÃO (Device ID - Mantido)
        request_options = {}
        if payload.deviceId and payload.deviceId.strip():
            request_options["headers"] = {
                "X-meli-session-id": payload.deviceId
            }

        # 6. CRIA A PREFERÊNCIA (Mantido)
        if request_options:
            preference_response = sdk.preference().create(preference_data, request_options=request_options)
        else:
            preference_response = sdk.preference().create(preference_data)

        if preference_response["status"] != 201:
            error_details = preference_response.get("response", {}).get("message", "Nenhum detalhe do erro retornado")
            raise HTTPException(status_code=500, detail=f"Erro ao criar preferência no MP: {error_details}")
            
        preference = preference_response["response"]
        return { "preferenceId": preference["id"], "initPoint": preference["init_point"], "sandboxInitPoint": preference.get("sandbox_init_point") }
        
    except Exception as e:
        logger.error(f"❌ Erro grave ao criar preferência: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno do servidor: {str(e)}")


# ============================================
# ROTA: WEBHOOK (LÓGICA DE ATIVAÇÃO E E-MAIL - Mantida)
# ============================================
@router.post("/webhook")
async def webhook(request: Request):
    if not sdk:
        logger.error("❌ Webhook falhou: SDK MP não inicializado.")
        return {"status": "error", "message": "SDK MP not initialized"}
    
    db_firestore = initialize_firebase()
    if not db_firestore:
        logger.error("❌ Webhook falhou: Firebase Admin não inicializado.")
        return {"status": "error", "message": "Firebase Admin not initialized"}
        
    try:
        body = await request.json()
        if body.get("type") != "payment": return {"status": "ok"}

        payment_id = body.get("data", {}).get("id")
        if not payment_id: return {"status": "ok"}

        payment_response = sdk.payment().get(payment_id)
        if payment_response["status"] != 200:
            logger.warning("❌ Pagamento não encontrado no MP")
            return {"status": "ok"}

        payment_data = payment_response["response"]
        status = payment_data.get("status")
        external_reference = payment_data.get("external_reference")

        user_id = external_reference.split('-')[0] if external_reference else None
        recipient_email = payment_data.get("payer", {}).get("email")
        value = payment_data.get("transaction_amount", 0)
        
        user_doc_ref = db_firestore.collection('users').document(user_id)
        user_doc = user_doc_ref.get() 
        
        user_name = user_doc.get('name') if user_doc.exists else (recipient_email.split('@')[0] if recipient_email else "Usuário")
        
        if status == "approved":
            logger.info(f"✅ Pagamento APROVADO! Ref: {external_reference}")
            
            if user_id:
                plan_id_parts = external_reference.split('-')
                plan_id = plan_id_parts[1] if len(plan_id_parts) > 1 else None
                plan_name = PLANS.get(plan_id, {}).get("title", "Plano Desconhecido")
                
                subscription_ref = db_firestore.collection('subscriptions').document(user_id)
                subscription_ref.set({
                    "userId": user_id, "planId": plan_id, "status": "active", 
                    "paymentId": payment_id, "lastPaymentDate": datetime.now(timezone.utc),
                    "updatedAt": datetime.now(timezone.utc), "trialEndsAt": None,
                }, merge=True)
                
                logger.info(f"🔥 LICENÇA ATIVADA: Usuário {user_id} para o plano {plan_id}.")
                
                if recipient_email:
                    send_payment_success_email(recipient_email, user_name, plan_name, value)
        
        elif status == "rejected":
            logger.info(f"❌ Pagamento REJEITADO. Ref: {external_reference}")
            
            if recipient_email:
                send_payment_rejection_email(recipient_email, user_name)

        elif status == "pending":
            logger.info(f"⏳ Pagamento PENDENTE. Ref: {external_reference}")

    except Exception as e:
        logger.error(f"❌ Erro grave no webhook: {e}", exc_info=True)
        return {"status": "error"}

    return {"status": "ok"}