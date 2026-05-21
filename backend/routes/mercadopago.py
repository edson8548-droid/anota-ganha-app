# SUBSTITUA: backend/routes/mercadopago.py
# ⭐️ VERSÃO 2: Otimizado para aprovação (Envia CPF e Telefone)

import os
import mercadopago
import requests
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import logging
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth
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
    paymentMethod: Optional[str] = None

# ============================================
# FUNÇÕES AUXILIARES DE E-MAIL (Mantidas)
# ============================================

def send_payment_success_email(recipient_email: str, user_name: str, plan_name: str, value: float):
    """ Envia um recibo de confirmação de pagamento (status: approved). """
    
    sendgrid_api_key = os.environ.get("SENDGRID_API_KEY")
    from_email = os.environ.get("FROM_EMAIL", "suportevenpro@gmail.com")
    
    if not sendgrid_api_key or not from_email: return

    try:
        sg = SendGridAPIClient(sendgrid_api_key)
        value_brl = f"R$ {value:.2f}".replace('.', ',')

        html_content = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                <h2 style="color: #667eea;">✅ Assinatura Ativada com Sucesso!</h2>
                <p>Olá, <strong>{user_name}</strong>!</p>
                <p>Obrigado por confiar na Venpro. O teu pagamento foi confirmado e a tua licença foi ativada.</p>
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
    from_email = os.environ.get("FROM_EMAIL", "suportevenpro@gmail.com")
    
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
            "private_key": (os.environ.get("FIREBASE_PRIVATE_KEY") or "").replace('\\n', '\n'),
            "client_email": os.environ.get("FIREBASE_CLIENT_EMAIL"),
            "client_id": os.environ.get("FIREBASE_CLIENT_ID"),
            "token_uri": "https://oauth2.googleapis.com/token"
        }
        if not firebase_config["project_id"] or not firebase_config["private_key"]: raise ValueError("Variáveis FIREBASE_... não configuradas.")
        cred = credentials.Certificate(firebase_config)
        storage_bucket = os.environ.get("FIREBASE_STORAGE_BUCKET", "anota-ganha-app.firebasestorage.app")
        firebase_admin.initialize_app(cred, {"storageBucket": storage_bucket})
        logger.info("✅ Firebase Admin SDK inicializado.")
        return firestore.client()
    except Exception as e:
        logger.error(f"❌ ERRO GRAVE: Falha ao inicializar o Firebase Admin: {e}")
        return None

# ... (Configuração, router, sdk, PLANS mantidos) ...
router = APIRouter()
sdk = None
security = HTTPBearer(auto_error=False)


def get_authenticated_uid(credentials_token: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials_token:
        logger.warning("[SECURITY] auth_missing route=mercadopago_create_preference")
        raise HTTPException(status_code=401, detail="Token obrigatório")
    try:
        decoded = firebase_auth.verify_id_token(credentials_token.credentials)
        return decoded.get("uid")
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=mercadopago_create_preference")
        raise HTTPException(status_code=401, detail="Token inválido")

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
  "monthly": { "id": "monthly", "price": 69.90, "title": "Plano Mensal - Venpro (preço de lançamento)" }
}


def get_mp_access_token() -> str:
    access_token = os.environ.get("MERCADOPAGO_ACCESS_TOKEN")
    if not access_token:
        logger.error("❌ MERCADOPAGO_ACCESS_TOKEN não configurado")
        raise HTTPException(status_code=500, detail="Mercado Pago não configurado")
    return access_token


def mp_headers() -> dict:
    return {
        "Authorization": f"Bearer {get_mp_access_token()}",
        "Content-Type": "application/json",
    }


def fetch_preapproval(preapproval_id: str) -> dict:
    response = requests.get(
        f"https://api.mercadopago.com/preapproval/{preapproval_id}",
        headers=mp_headers(),
        timeout=20,
    )
    if response.status_code >= 400:
        logger.warning("❌ Erro ao buscar assinatura MP %s: %s", preapproval_id, response.text)
        raise HTTPException(status_code=502, detail="Erro ao consultar assinatura no Mercado Pago")
    return response.json()

# ============================================
# ⭐️ ROTA DE PREFERÊNCIA (OTIMIZADA PARA APROVAÇÃO) ⭐️
# ============================================
@router.post("/create-preference")
async def create_preference(payload: PreferencePayload, authenticated_uid: str = Depends(get_authenticated_uid)):
    logger.warning("[SECURITY] mercado_pago_create_preference_disabled uid=%s", authenticated_uid)
    raise HTTPException(
        status_code=410,
        detail="Mercado Pago desativado para novas assinaturas. Use o checkout Asaas.",
    )

    # ⭐️ 1. INICIALIZAR O FIREBASE ADMIN (NOVO NESTA ROTA) ⭐️
    db_firestore = initialize_firebase()
    if not db_firestore:
        raise HTTPException(status_code=500, detail="Firebase Admin não inicializado")
        
    try:
        plan_id = payload.planId
        if plan_id not in PLANS:
            raise HTTPException(status_code=400, detail="Plano inválido")

        user_info_dict = payload.user.model_dump()
        user_id = authenticated_uid
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
                    user_info_dict["email"] = user_data.get("email") or user_info_dict.get("email")
                    user_info_dict["name"] = user_data.get("name") or user_data.get("displayName") or user_data.get("nome") or user_info_dict.get("name")
                    logger.info(f"✅ Dados do utilizador {user_id} encontrados (CPF: {'Sim' if user_cpf else 'Não'})")
                else:
                    logger.warning(f"⚠️ Documento do utilizador {user_id} não encontrado no Firestore.")
            except Exception as e:
                logger.error(f"❌ Erro ao buscar dados do utilizador {user_id} no Firestore: {e}")

        payer_email = user_info_dict.get("email")
        if not payer_email:
            raise HTTPException(status_code=400, detail="Usuário sem e-mail cadastrado")

        external_reference = f"{user_id}-{plan_id}-{plan.get('price')}"
        subscription_data = {
            "reason": plan["title"],
            "external_reference": external_reference,
            "payer_email": payer_email,
            "auto_recurring": {
                "frequency": 1,
                "frequency_type": "months",
                "transaction_amount": plan["price"],
                "currency_id": "BRL",
            },
            "back_url": f"{frontend_url}/payment-success",
            "status": "pending",
        }

        headers = mp_headers()
        if payload.deviceId and payload.deviceId.strip():
            headers["X-meli-session-id"] = payload.deviceId.strip()

        subscription_response = requests.post(
            "https://api.mercadopago.com/preapproval",
            headers=headers,
            json=subscription_data,
            timeout=25,
        )

        if subscription_response.status_code >= 400:
            logger.error("❌ Erro ao criar assinatura MP: %s", subscription_response.text)
            raise HTTPException(status_code=502, detail="Erro ao criar assinatura no Mercado Pago")

        subscription = subscription_response.json()
        preapproval_id = subscription.get("id")

        db_firestore.collection('subscriptions').document(user_id).set({
            "userId": user_id,
            "planId": plan_id,
            "status": "pending",
            "mercadoPagoPreapprovalId": preapproval_id,
            "mercadoPagoSubscriptionId": preapproval_id,
            "externalReference": external_reference,
            "amount": plan["price"],
            "currency": "BRL",
            "updatedAt": datetime.now(timezone.utc),
            "trialEndsAt": None,
        }, merge=True)

        return {
            "preferenceId": preapproval_id,
            "preapprovalId": preapproval_id,
            "initPoint": subscription.get("init_point"),
            "sandboxInitPoint": subscription.get("sandbox_init_point"),
            "status": subscription.get("status"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro grave ao criar preferência: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno do servidor: {str(e)}")


# ============================================
# ROTA: WEBHOOK (LÓGICA DE ATIVAÇÃO E E-MAIL - Mantida)
# ============================================
@router.post("/webhook")
async def webhook(request: Request):
    db_firestore = initialize_firebase()
    if not db_firestore:
        logger.error("❌ Webhook falhou: Firebase Admin não inicializado.")
        return {"status": "error", "message": "Firebase Admin not initialized"}
        
    try:
        body = await request.json()
        notification_type = body.get("type")

        if notification_type in {"subscription_preapproval", "preapproval"}:
            preapproval_id = body.get("data", {}).get("id")
            if not preapproval_id:
                return {"status": "ok"}

            preapproval_data = fetch_preapproval(preapproval_id)
            external_reference = str(preapproval_data.get("external_reference") or "")
            user_id = external_reference.split('-')[0] if external_reference else None
            plan_id = external_reference.split('-')[1] if len(external_reference.split('-')) > 1 else "monthly"
            status = preapproval_data.get("status")
            amount = preapproval_data.get("auto_recurring", {}).get("transaction_amount")

            if not user_id:
                logger.warning("⚠️ Assinatura MP sem external_reference: %s", preapproval_id)
                return {"status": "ok"}

            mapped_status = {
                "authorized": "active",
                "pending": "pending",
                "paused": "suspended",
                "cancelled": "canceled",
                "cancelled_process": "canceled",
            }.get(status, status or "pending")

            subscription_update = {
                "userId": user_id,
                "planId": plan_id,
                "status": mapped_status,
                "mercadoPagoPreapprovalId": preapproval_id,
                "mercadoPagoSubscriptionId": preapproval_id,
                "externalReference": external_reference,
                "amount": amount,
                "currency": preapproval_data.get("auto_recurring", {}).get("currency_id", "BRL"),
                "nextBillingDate": preapproval_data.get("next_payment_date"),
                "lastPaymentDate": datetime.now(timezone.utc) if mapped_status == "active" else None,
                "updatedAt": datetime.now(timezone.utc),
            }
            if mapped_status == "active":
                subscription_update["trialEndsAt"] = None

            db_firestore.collection('subscriptions').document(user_id).set(subscription_update, merge=True)

            logger.info("✅ Assinatura MP atualizada: user=%s preapproval=%s status=%s", user_id, preapproval_id, mapped_status)
            return {"status": "ok"}

        if notification_type != "payment": return {"status": "ok"}

        if not sdk:
            logger.error("❌ Webhook payment falhou: SDK MP não inicializado.")
            return {"status": "error", "message": "SDK MP not initialized"}

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
