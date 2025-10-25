## 💡 EXCELENTE IDEIA! Vou Colar o Código Aqui!

Vou te mostrar o código completo do `server.py` para você copiar!
Action: file_editor view /app/backend/server.py
Observation: /app/backend/server.py:
1|from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
2|from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
3|from dotenv import load_dotenv
4|from starlette.middleware.cors import CORSMiddleware
5|from motor.motor_asyncio import AsyncIOMotorClient
6|import os
7|import logging
8|from pathlib import Path
9|from pydantic import BaseModel, Field, ConfigDict
10|from typing import List, Optional, Dict, Any
11|import uuid
12|from datetime import datetime, timezone, timedelta
13|import bcrypt
14|import jwt
15|
16|ROOT_DIR = Path(__file__).parent
17|load_dotenv(ROOT_DIR / '.env')
18|
19|# MongoDB connection
20|mongo_url = os.environ['MONGO_URL']
21|client = AsyncIOMotorClient(mongo_url)
22|db = client[os.environ['DB_NAME']]
23|
24|# JWT Configuration
25|SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
26|ALGORITHM = "HS256"
27|ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
28|
29|# License Configuration
30|TRIAL_PERIOD_DAYS = 15  # Período de teste gratuito
31|MONTHLY_SIMPLE_PRICE = 35.00  # Preço mensal simples (sem compromisso)
32|MONTHLY_PRICE = 29.90  # Preço mensal (12 meses)
33|ANNUAL_PRICE = 300.00  # Preço anual à vista
34|
35|# Mercado Pago Configuration
36|MP_ACCESS_TOKEN = os.environ.get('MP_ACCESS_TOKEN', '')
37|MP_PUBLIC_KEY = os.environ.get('MP_PUBLIC_KEY', '')
38|FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
39|BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:8001')
40|
41|security = HTTPBearer()
42|
43|# Create the main app without a prefix
44|app = FastAPI()
45|
46|# Create a router with the /api prefix
47|api_router = APIRouter(prefix="/api")
48|
49|
50|# ==================== Models ====================
51|
52|class User(BaseModel):
53|    model_config = ConfigDict(extra="ignore")
54|    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
55|    email: str
56|    name: Optional[str] = ""
57|    cpf: Optional[str] = ""
58|    phone: Optional[str] = ""
59|    role: str = "user"  # user, admin
60|    license_type: str = "trial"  # trial, monthly, annual, expired
61|    license_plan: Optional[str] = None  # monthly_30, annual_300
62|    license_expiry: Optional[datetime] = None
63|    trial_started: Optional[datetime] = None
64|    payment_method: Optional[str] = None  # mercadopago, stripe, manual
65|    last_payment_date: Optional[datetime] = None
66|    subscription_id: Optional[str] = None  # ID do gateway de pagamento
67|    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
68|
69|class UserCreate(BaseModel):
70|    email: str
71|    name: Optional[str] = ""
72|    password: str
73|    cpf: Optional[str] = ""
74|    phone: Optional[str] = ""
75|
76|class UserLogin(BaseModel):
77|    email: str
78|    password: str
79|
80|class Token(BaseModel):
81|    access_token: str
82|    token_type: str
83|    user: User
84|
85|class Industry(BaseModel):
86|    """Indústria com seus produtos"""
87|    name: str  # Nome da indústria (ex: "Camil", "JDE Café Turbinado")
88|    goal: float = 0.0  # Meta de valor da indústria
89|    products: List[str] = []  # Lista de produtos da indústria
90|
91|class Campaign(BaseModel):
92|    model_config = ConfigDict(extra="ignore")
93|    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
94|    user_id: str
95|    name: str
96|    start_date: datetime
97|    end_date: Optional[datetime] = None
98|    status: str = "active"  # active, paused, completed
99|    industries: List[Industry] = []  # Lista de indústrias com produtos
100|    # Manter product_goals para compatibilidade com dados antigos
101|    product_goals: Optional[Dict[str, float]] = None
102|    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
103|
104|class CampaignCreate(BaseModel):
105|    name: str
106|    start_date: datetime
107|    end_date: Optional[datetime] = None
108|    industries: List[Industry] = []
109|    # Manter product_goals para compatibilidade
110|    product_goals: Optional[Dict[str, float]] = None
111|
112|class CampaignUpdate(BaseModel):
113|    name: Optional[str] = None
114|    start_date: Optional[datetime] = None
115|    end_date: Optional[datetime] = None
116|    status: Optional[str] = None
117|    industries: Optional[List[Industry]] = None
118|    # Manter product_goals para compatibilidade
119|    product_goals: Optional[Dict[str, float]] = None
120|
121|class Sheet(BaseModel):
122|    model_config = ConfigDict(extra="ignore")
123|    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
124|    user_id: str
125|    campaign_id: str
126|    name: str
127|    icon: str = "Building"
128|    headers: List[str] = []
129|    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
130|
131|class SheetCreate(BaseModel):
132|    campaign_id: str
133|    name: str
134|    icon: str = "Building"
135|    headers: List[str] = []
136|
137|class SheetUpdate(BaseModel):
138|    name: Optional[str] = None
139|    icon: Optional[str] = None
140|    headers: Optional[List[str]] = None
141|
142|class Client(BaseModel):
143|    model_config = ConfigDict(extra="ignore")
144|    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
145|    user_id: str
146|    sheet_id: str
147|    campaign_id: str
148|    CLIENTE: str
149|    CNPJ: Optional[str] = ""
150|    ENDERECO: Optional[str] = ""
151|    CIDADE: Optional[str] = ""
152|    BAIRRO: Optional[str] = ""  # Novo campo
153|    # Nova estrutura: produtos agrupados por indústria
154|    # {"Camil": {"products": {"Sardinha Coqueiro": {"status": "positivado", "value": 150}, ...}, "industry_status": "positivado"}}
155|    industries: Dict[str, Dict[str, Any]] = {}
156|    # Manter products para compatibilidade com dados antigos
157|    products: Optional[Dict[str, Dict[str, Any]]] = None
158|    notes: Optional[str] = ""
159|    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
160|    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
161|
162|class ClientCreate(BaseModel):
163|    sheet_id: str
164|    campaign_id: str
165|    CLIENTE: str
166|    CNPJ: Optional[str] = ""
167|    ENDERECO: Optional[str] = ""
168|    CIDADE: Optional[str] = ""
169|    BAIRRO: Optional[str] = ""  # Novo campo
170|    industries: Dict[str, Dict[str, Any]] = {}
171|    # Manter products para compatibilidade
172|    products: Optional[Dict[str, Dict[str, Any]]] = None
173|    notes: Optional[str] = ""
174|
175|class ClientUpdate(BaseModel):
176|    CLIENTE: Optional[str] = None
177|    CNPJ: Optional[str] = None
178|    ENDERECO: Optional[str] = None
179|    CIDADE: Optional[str] = None
180|    BAIRRO: Optional[str] = None  # Novo campo
181|    industries: Optional[Dict[str, Dict[str, Any]]] = None
182|    # Manter products para compatibilidade
183|    products: Optional[Dict[str, Dict[str, Any]]] = None
184|    notes: Optional[str] = None
185|    notes: Optional[str] = None
186|
187|
188|# ==================== Auth Helpers ====================
189|
190|def hash_password(password: str) -> str:
191|    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
192|
193|def verify_password(plain_password: str, hashed_password: str) -> bool:
194|    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
195|
196|def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
197|    to_encode = data.copy()
198|    if expires_delta:
199|        expire = datetime.now(timezone.utc) + expires_delta
200|    else:
201|        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
202|    to_encode.update({"exp": expire})
203|    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
204|    return encoded_jwt
205|
206|async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
207|    try:
208|        token = credentials.credentials
209|        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
210|        user_id: str = payload.get("sub")
211|        if user_id is None:
212|            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
213|        
214|        user = await db.users.find_one({"id": user_id}, {"_id": 0})
215|        if user is None:
216|            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
217|        return user
218|    except jwt.ExpiredSignatureError:
219|        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
220|    except jwt.JWTError:
221|        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
222|
223|# ==================== Email Functions ====================
224|
225|from sendgrid import SendGridAPIClient
226|from sendgrid.helpers.mail import Mail
227|
228|def send_password_reset_email(to_email: str, reset_token: str) -> bool:
229|    """
230|    Envia email de recuperação de senha usando SendGrid
231|    """
232|    try:
233|        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
234|        reset_link = f"{frontend_url}/reset-password?token={reset_token}"
235|        
236|        html_content = f"""
237|        <html>
238|            <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
239|                <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
240|                    <h2 style="color: #2563eb; text-align: center;">Recuperação de Senha</h2>
241|                    <p>Olá,</p>
242|                    <p>Você solicitou a recuperação de senha para sua conta no <strong>Anota & Ganha Incentivos</strong>.</p>
243|                    <p>Clique no botão abaixo para redefinir sua senha:</p>
244|                    <div style="text-align: center; margin: 30px 0;">
245|                        <a href="{reset_link}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Redefinir Senha</a>
246|                    </div>
247|                    <p style="color: #666; font-size: 14px;">Ou copie e cole este link no seu navegador:</p>
248|                    <p style="color: #2563eb; font-size: 12px; word-break: break-all;">{reset_link}</p>
249|                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
250|                    <p style="color: #999; font-size: 12px;">Este link é válido por 1 hora.</p>
251|                    <p style="color: #999; font-size: 12px;">Se você não solicitou esta recuperação, ignore este email.</p>
252|                </div>
253|            </body>
254|        </html>
255|        """
256|        
257|        message = Mail(
258|            from_email=os.environ.get('SENDER_EMAIL'),
259|            to_emails=to_email,
260|            subject='Recuperação de Senha - Anota & Ganha Incentivos',
261|            html_content=html_content
262|        )
263|        
264|        sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
265|        response = sg.send(message)
266|        
267|        return response.status_code in [200, 202]
268|    except Exception as e:
269|        logging.error(f"Erro ao enviar email: {str(e)}")
270|        return False
271|
272|
273|# ==================== Auth Routes ====================
274|
275|@api_router.post("/auth/register", response_model=Token)
276|async def register(user_data: UserCreate):
277|    # Check if user exists
278|    existing_user = await db.users.find_one({"email": user_data.email})
279|    if existing_user:
280|        raise HTTPException(status_code=400, detail="Email já está em uso")
281|    
282|    # Check if this is the admin email
283|    is_admin = user_data.email == "edson854_8@hotmail.com"
284|    
285|    # Create user with 15 day trial (or admin access)
286|    trial_start = datetime.now(timezone.utc)
287|    trial_end = trial_start + timedelta(days=15)
288|    
289|    user_obj = User(
290|        email=user_data.email,
291|        name=user_data.name or user_data.email.split('@')[0],
292|        cpf=user_data.cpf or "",
293|        phone=user_data.phone or "",
294|        role="admin" if is_admin else "user",
295|        license_type="annual" if is_admin else "trial",  # Admin nunca expira
296|        trial_started=trial_start if not is_admin else None,
297|        license_expiry=None if is_admin else trial_end  # Admin sem expiração
298|    )
299|    
300|    user_dict = user_obj.model_dump()
301|    user_dict['password_hash'] = hash_password(user_data.password)
302|    user_dict['created_at'] = user_dict['created_at'].isoformat()
303|    if user_dict['trial_started']:
304|        user_dict['trial_started'] = user_dict['trial_started'].isoformat()
305|    if user_dict['license_expiry']:
306|        user_dict['license_expiry'] = user_dict['license_expiry'].isoformat()
307|    
308|    await db.users.insert_one(user_dict)
309|    
310|    # Create token
311|    access_token = create_access_token(data={"sub": user_obj.id})
312|    
313|    return Token(
314|        access_token=access_token,
315|        token_type="bearer",
316|        user=user_obj
317|    )
318|
319|@api_router.post("/auth/login", response_model=Token)
320|async def login(user_data: UserLogin):
321|    user = await db.users.find_one({"email": user_data.email})
322|    if not user or not verify_password(user_data.password, user.get('password_hash', '')):
323|        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
324|    
325|    # Admin nunca expira
326|    if user.get('role') != 'admin':
327|        # Check license status for regular users
328|        if isinstance(user.get('license_expiry'), str):
329|            license_expiry = datetime.fromisoformat(user['license_expiry'])
330|        else:
331|            license_expiry = user.get('license_expiry')
332|        
333|        if license_expiry and datetime.now(timezone.utc) > license_expiry:
334|            if user.get('license_type') not in ['monthly', 'annual']:
335|                # Update to expired
336|                await db.users.update_one(
337|                    {"email": user_data.email},
338|                    {"$set": {"license_type": "expired"}}
339|                )
340|                raise HTTPException(
341|                    status_code=403, 
342|                    detail="Seu período de teste expirou. Escolha um plano para continuar usando."
343|                )
344|    
345|    # Convert datetime fields
346|    if isinstance(user.get('created_at'), str):
347|        user['created_at'] = datetime.fromisoformat(user['created_at'])
348|    if user.get('trial_started') and isinstance(user.get('trial_started'), str):
349|        user['trial_started'] = datetime.fromisoformat(user['trial_started'])
350|    if user.get('license_expiry') and isinstance(user.get('license_expiry'), str):
351|        user['license_expiry'] = datetime.fromisoformat(user['license_expiry'])
352|    if user.get('last_payment_date') and isinstance(user.get('last_payment_date'), str):
353|        user['last_payment_date'] = datetime.fromisoformat(user['last_payment_date'])
354|    
355|    user_obj = User(**user)
356|    access_token = create_access_token(data={"sub": user_obj.id})
357|    
358|    return Token(
359|        access_token=access_token,
360|        token_type="bearer",
361|        user=user_obj
362|    )
363|
364|@api_router.get("/auth/me", response_model=User)
365|async def get_me(current_user: dict = Depends(get_current_user)):
366|    if isinstance(current_user.get('created_at'), str):
367|        current_user['created_at'] = datetime.fromisoformat(current_user['created_at'])
368|    if isinstance(current_user.get('trial_started'), str):
369|        current_user['trial_started'] = datetime.fromisoformat(current_user['trial_started'])
370|    if isinstance(current_user.get('license_expiry'), str):
371|        current_user['license_expiry'] = datetime.fromisoformat(current_user['license_expiry'])
372|    if current_user.get('last_payment_date') and isinstance(current_user.get('last_payment_date'), str):
373|        current_user['last_payment_date'] = datetime.fromisoformat(current_user['last_payment_date'])
374|    return User(**current_user)
375|
376|
377|# Password Recovery
378|@api_router.post("/auth/forgot-password")
379|async def forgot_password(email: str):
380|    user = await db.users.find_one({"email": email})
381|    if not user:
382|        # Don't reveal if email exists
383|        return {"message": "Se o email existir, você receberá um link de recuperação"}
384|    
385|    # Generate reset token (valid for 1 hour)
386|    reset_token = str(uuid.uuid4())
387|    reset_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
388|    
389|    await db.users.update_one(
390|        {"email": email},
391|        {"$set": {
392|            "reset_token": reset_token,
393|            "reset_token_expiry": reset_expiry.isoformat()
394|        }}
395|    )
396|    
397|    # Send email via SendGrid
398|    email_sent = send_password_reset_email(email, reset_token)
399|    
400|    if not email_sent:
401|        logging.warning(f"Falha ao enviar email de recuperação para {email}")
402|    
403|    return {
404|        "message": "Se o email existir, você receberá um link de recuperação"
405|    }
406|
407|@api_router.post("/auth/reset-password")
408|async def reset_password(reset_token: str, new_password: str):
409|    user = await db.users.find_one({"reset_token": reset_token})
410|    if not user:
411|        raise HTTPException(status_code=400, detail="Token inválido")
412|    
413|    # Check if token expired
414|    if isinstance(user.get('reset_token_expiry'), str):
415|        expiry = datetime.fromisoformat(user['reset_token_expiry'])
416|    else:
417|        expiry = user.get('reset_token_expiry')
418|    
419|    if not expiry or datetime.now(timezone.utc) > expiry:
420|        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo link")
421|    
422|    # Update password
423|    new_hash = hash_password(new_password)
424|    await db.users.update_one(
425|        {"reset_token": reset_token},
426|        {"$set": {
427|            "password_hash": new_hash,
428|            "reset_token": None,
429|            "reset_token_expiry": None
430|        }}
431|    )
432|    
433|    return {"message": "Senha alterada com sucesso!"}
434|
435|
436|# License Management
437|@api_router.get("/plans")
438|async def get_plans():
439|    """Retorna os planos disponíveis"""
440|    return {
441|        "plans": [
442|            {
443|                "id": "monthly_30",
444|                "name": "Mensal",
445|                "price": 30.00,
446|                "currency": "BRL",
447|                "interval": "month",
448|                "interval_count": 1,
449|                "features": [
450|                    "Campanhas ilimitadas",
451|                    "Clientes ilimitados",
452|                    "Relatórios por cidade",
453|                    "Suporte via email"
454|                ]
455|            },
456|            {
457|                "id": "annual_300",
458|                "name": "Anual",
459|                "price": 300.00,
460|                "original_price": 360.00,
461|                "discount": 60.00,
462|                "discount_percent": 16.67,
463|                "currency": "BRL",
464|                "interval": "year",
465|                "interval_count": 1,
466|                "features": [
467|                    "Campanhas ilimitadas",
468|                    "Clientes ilimitados",
469|                    "Relatórios por cidade",
470|                    "Suporte prioritário",
471|                    "Economia de R$ 60,00/ano"
472|                ],
473|                "highlight": True
474|            }
475|        ]
476|    }
477|
478|@api_router.post("/license/activate")
479|async def activate_license(license_key: str, current_user: dict = Depends(get_current_user)):
480|    # Simple license key validation
481|    # Monthly: MONTHLY-XXXX-XXXX-XXXX
482|    # Annual: ANNUAL-XXXX-XXXX-XXXX
483|    
484|    is_monthly = license_key.startswith("MONTHLY-")
485|    is_annual = license_key.startswith("ANNUAL-")
486|    
487|    if not is_monthly and not is_annual:
488|        raise HTTPException(status_code=400, detail="Chave de licença inválida")
489|    
490|    # Check if license key already used
491|    existing = await db.users.find_one({"license_key": license_key})
492|    if existing and existing['id'] != current_user['id']:
493|        raise HTTPException(status_code=400, detail="Esta chave já foi utilizada")
494|    
495|    # Activate license
496|    if is_monthly:
497|        expiry = datetime.now(timezone.utc) + timedelta(days=30)
498|        license_type = "monthly"
499|        license_plan = "monthly_30"
500|    else:
501|        expiry = datetime.now(timezone.utc) + timedelta(days=365)
502|        license_type = "annual"
503|        license_plan = "annual_300"
504|    
505|    await db.users.update_one(
506|        {"id": current_user['id']},
507|        {"$set": {
508|            "license_type": license_type,
509|            "license_plan": license_plan,
510|            "license_key": license_key,
511|            "license_expiry": expiry.isoformat(),
512|            "last_payment_date": datetime.now(timezone.utc).isoformat(),
513|            "payment_method": "manual"
514|        }}
515|    )
516|    
517|    return {
518|        "message": f"Licença {license_type} ativada com sucesso!",
519|        "expiry_date": expiry.isoformat(),
520|        "license_type": license_type,
521|        "plan": license_plan
522|    }
523|
524|@api_router.get("/license/status")
525|async def get_license_status(current_user: dict = Depends(get_current_user)):
526|    if isinstance(current_user.get('license_expiry'), str):
527|        expiry = datetime.fromisoformat(current_user['license_expiry'])
528|    else:
529|        expiry = current_user.get('license_expiry')
530|    
531|    days_remaining = 0
532|    if expiry:
533|        days_remaining = (expiry - datetime.now(timezone.utc)).days
534|    
535|    return {
536|        "license_type": current_user.get('license_type', 'trial'),
537|        "license_plan": current_user.get('license_plan'),
538|        "expiry_date": expiry.isoformat() if expiry else None,
539|        "days_remaining": max(0, days_remaining),
540|        "is_expired": days_remaining <= 0 if expiry else False,
541|        "email": current_user.get('email'),
542|        "role": current_user.get('role', 'user')
543|    }
544|
545|
546|# ==================== ADMIN ROUTES ====================
547|
548|async def require_admin(current_user: dict = Depends(get_current_user)):
549|    """Middleware para verificar se é admin"""
550|    if current_user.get('role') != 'admin':
551|        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
552|    return current_user
553|
554|@api_router.get("/admin/users")
555|async def admin_get_users(admin: dict = Depends(require_admin)):
556|    """Lista todos os usuários (apenas admin)"""
557|    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "reset_token": 0}).to_list(1000)
558|    
559|    # Convert datetime fields
560|    for user in users:
561|        if isinstance(user.get('created_at'), str):
562|            user['created_at'] = datetime.fromisoformat(user['created_at'])
563|        if user.get('trial_started') and isinstance(user.get('trial_started'), str):
564|            user['trial_started'] = datetime.fromisoformat(user['trial_started'])
565|        if user.get('license_expiry') and isinstance(user.get('license_expiry'), str):
566|            user['license_expiry'] = datetime.fromisoformat(user['license_expiry'])
567|        if user.get('last_payment_date') and isinstance(user.get('last_payment_date'), str):
568|            user['last_payment_date'] = datetime.fromisoformat(user['last_payment_date'])
569|    
570|    return {"users": users, "total": len(users)}
571|
572|@api_router.get("/admin/stats")
573|async def admin_get_stats(admin: dict = Depends(require_admin)):
574|    """Estatísticas gerais (apenas admin)"""
575|    all_users = await db.users.find({}, {"_id": 0}).to_list(1000)
576|    
577|    stats = {
578|        "total_users": len(all_users),
579|        "trial_users": len([u for u in all_users if u.get('license_type') == 'trial']),
580|        "monthly_users": len([u for u in all_users if u.get('license_type') == 'monthly']),
581|        "annual_users": len([u for u in all_users if u.get('license_type') == 'annual']),
582|        "expired_users": len([u for u in all_users if u.get('license_type') == 'expired']),
583|        "admin_users": len([u for u in all_users if u.get('role') == 'admin'])
584|    }
585|    
586|    # Calculate revenue
587|    monthly_revenue = stats['monthly_users'] * 30
588|    annual_revenue = stats['annual_users'] * 300
589|    total_monthly_revenue = monthly_revenue + (annual_revenue / 12)
590|    
591|    stats['monthly_revenue'] = monthly_revenue
592|    stats['annual_revenue'] = annual_revenue
593|    stats['total_monthly_revenue'] = round(total_monthly_revenue, 2)
594|    stats['total_annual_revenue'] = round(monthly_revenue * 12 + annual_revenue, 2)
595|    
596|    return stats
597|
598|@api_router.post("/admin/activate-user")
599|async def admin_activate_user(
600|    user_email: str,
601|    plan: str,  # monthly_30 or annual_300
602|    admin: dict = Depends(require_admin)
603|):
604|    """Ativa manualmente a licença de um usuário (apenas admin)"""
605|    user = await db.users.find_one({"email": user_email})
606|    if not user:
607|        raise HTTPException(status_code=404, detail="Usuário não encontrado")
608|    
609|    # Set expiry based on plan
610|    if plan == "monthly_30":
611|        expiry = datetime.now(timezone.utc) + timedelta(days=30)
612|        license_type = "monthly"
613|    elif plan == "annual_300":
614|        expiry = datetime.now(timezone.utc) + timedelta(days=365)
615|        license_type = "annual"
616|    else:
617|        raise HTTPException(status_code=400, detail="Plano inválido")
618|    
619|    await db.users.update_one(
620|        {"email": user_email},
621|        {"$set": {
622|            "license_type": license_type,
623|            "license_plan": plan,
624|            "license_expiry": expiry.isoformat(),
625|            "last_payment_date": datetime.now(timezone.utc).isoformat(),
626|            "payment_method": "manual"
627|        }}
628|    )
629|    
630|    return {
631|        "message": f"Usuário {user_email} ativado com plano {plan}",
632|        "expiry_date": expiry.isoformat()
633|    }
634|
635|
636|# ==================== Migration Routes ====================
637|
638|@api_router.post("/migrate/campaigns-to-industries")
639|async def migrate_campaigns_to_industries(current_user: dict = Depends(get_current_user)):
640|    """
641|    Migra campanhas antigas (product_goals) para nova estrutura (industries)
642|    Cria uma indústria "Geral" com todos os produtos antigos
643|    """
644|    # Buscar todas as campanhas do usuário que ainda usam product_goals
645|    campaigns = await db.campaigns.find(
646|        {"user_id": current_user['id'], "product_goals": {"$exists": True, "$ne": None}},
647|        {"_id": 0}
648|    ).to_list(1000)
649|    
650|    migrated_count = 0
651|    
652|    for campaign in campaigns:
653|        # Se já tem industries, pular
654|        if campaign.get('industries'):
655|            continue
656|        
657|        product_goals = campaign.get('product_goals', {})
658|        if not product_goals:
659|            continue
660|        
661|        # Criar indústria "Geral" com todos os produtos
662|        general_industry = {
663|            "name": "Geral",
664|            "goal": sum(product_goals.values()),  # Soma de todas as metas
665|            "products": list(product_goals.keys())
666|        }
667|        
668|        # Atualizar campanha
669|        await db.campaigns.update_one(
670|            {"id": campaign['id']},
671|            {"$set": {
672|                "industries": [general_industry],
673|                "product_goals": None  # Remover product_goals antigo
674|            }}
675|        )
676|        
677|        migrated_count += 1
678|    
679|    # Migrar clientes dessa campanha também
680|    clients_migrated = 0
681|    for campaign in campaigns:
682|        clients = await db.clients.find(
683|            {"campaign_id": campaign['id'], "products": {"$exists": True, "$ne": None}},
684|            {"_id": 0}
685|        ).to_list(10000)
686|        
687|        for client in clients:
688|            # Se já tem industries, pular
689|            if client.get('industries'):
690|                continue
691|            
692|            old_products = client.get('products', {})
693|            if not old_products:
694|                continue
695|            
696|            # Criar estrutura de indústria "Geral" para o cliente
697|            general_industry_data = {
698|                "products": old_products,  # Manter mesma estrutura de produtos
699|                "industry_status": ""  # Será calculado
700|            }
701|            
702|            # Calcular status da indústria (positivado se pelo menos 1 produto positivado)
703|            has_positivado = False
704|            for product_data in old_products.values():
705|                if product_data.get('status', '').lower() == 'positivado':
706|                    has_positivado = True
707|                    break
708|            
709|            general_industry_data["industry_status"] = "positivado" if has_positivado else ""
710|            
711|            # Atualizar cliente
712|            await db.clients.update_one(
713|                {"id": client['id']},
714|                {"$set": {
715|                    "industries": {"Geral": general_industry_data},
716|                    "products": None  # Remover products antigo
717|                }}
718|            )
719|            
720|            clients_migrated += 1
721|    
722|    return {
723|        "message": "Migração concluída com sucesso!",
724|        "campaigns_migrated": migrated_count,
725|        "clients_migrated": clients_migrated
726|    }
727|
728|
729|# ==================== Campaign Routes ====================
730|
731|@api_router.post("/campaigns", response_model=Campaign)
732|async def create_campaign(campaign_data: CampaignCreate, current_user: dict = Depends(get_current_user)):
733|    campaign = Campaign(
734|        user_id=current_user['id'],
735|        name=campaign_data.name,
736|        start_date=campaign_data.start_date,
737|        end_date=campaign_data.end_date,
738|        industries=campaign_data.industries,
739|        product_goals=campaign_data.product_goals  # Compatibilidade
740|    )
741|    
742|    doc = campaign.model_dump()
743|    doc['created_at'] = doc['created_at'].isoformat()
744|    doc['start_date'] = doc['start_date'].isoformat()
745|    if doc['end_date']:
746|        doc['end_date'] = doc['end_date'].isoformat()
747|    
748|    # Converter industries para dict antes de salvar
749|    if doc.get('industries'):
750|        doc['industries'] = [ind.dict() if hasattr(ind, 'dict') else ind for ind in doc['industries']]
751|    
752|    await db.campaigns.insert_one(doc)
753|    return campaign
754|
755|@api_router.get("/campaigns", response_model=List[Campaign])
756|async def get_campaigns(current_user: dict = Depends(get_current_user)):
757|    campaigns = await db.campaigns.find({"user_id": current_user['id']}, {"_id": 0}).to_list(1000)
758|    
759|    for camp in campaigns:
760|        if isinstance(camp.get('created_at'), str):
761|            camp['created_at'] = datetime.fromisoformat(camp['created_at'])
762|        if isinstance(camp.get('start_date'), str):
763|            camp['start_date'] = datetime.fromisoformat(camp['start_date'])
764|        if camp.get('end_date') and isinstance(camp['end_date'], str):
765|            camp['end_date'] = datetime.fromisoformat(camp['end_date'])
766|    
767|    return campaigns
768|
769|@api_router.get("/campaigns/{campaign_id}", response_model=Campaign)
770|async def get_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
771|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
772|    if not campaign:
773|        raise HTTPException(status_code=404, detail="Campaign not found")
774|    
775|    if isinstance(campaign.get('created_at'), str):
776|        campaign['created_at'] = datetime.fromisoformat(campaign['created_at'])
777|    if isinstance(campaign.get('start_date'), str):
778|        campaign['start_date'] = datetime.fromisoformat(campaign['start_date'])
779|    if campaign.get('end_date') and isinstance(campaign['end_date'], str):
780|        campaign['end_date'] = datetime.fromisoformat(campaign['end_date'])
781|    
782|    return Campaign(**campaign)
783|
784|@api_router.put("/campaigns/{campaign_id}", response_model=Campaign)
785|async def update_campaign(campaign_id: str, update_data: CampaignUpdate, current_user: dict = Depends(get_current_user)):
786|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']})
787|    if not campaign:
788|        raise HTTPException(status_code=404, detail="Campaign not found")
789|    
790|    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
791|    
792|    if 'start_date' in update_dict:
793|        update_dict['start_date'] = update_dict['start_date'].isoformat()
794|    if 'end_date' in update_dict and update_dict['end_date']:
795|        update_dict['end_date'] = update_dict['end_date'].isoformat()
796|    
797|    # Converter industries para dict antes de salvar
798|    if 'industries' in update_dict and update_dict['industries']:
799|        update_dict['industries'] = [ind.dict() if hasattr(ind, 'dict') else ind for ind in update_dict['industries']]
800|    
801|    if update_dict:
802|        await db.campaigns.update_one({"id": campaign_id}, {"$set": update_dict})
803|    
804|    updated_campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
805|    if isinstance(updated_campaign.get('created_at'), str):
806|        updated_campaign['created_at'] = datetime.fromisoformat(updated_campaign['created_at'])
807|    if isinstance(updated_campaign.get('start_date'), str):
808|        updated_campaign['start_date'] = datetime.fromisoformat(updated_campaign['start_date'])
809|    if updated_campaign.get('end_date') and isinstance(updated_campaign['end_date'], str):
810|        updated_campaign['end_date'] = datetime.fromisoformat(updated_campaign['end_date'])
811|    
812|    return Campaign(**updated_campaign)
813|
814|@api_router.post("/campaigns/{campaign_id}/reset")
815|async def reset_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
816|    """Reset all clients in campaign - set all products to not positivado and value to 0"""
817|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']})
818|    if not campaign:
819|        raise HTTPException(status_code=404, detail="Campaign not found")
820|    
821|    # Get all clients in this campaign
822|    clients = await db.clients.find({
823|        "user_id": current_user['id'],
824|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
825|    }).to_list(10000)
826|    
827|    # Reset each client's products
828|    for client in clients:
829|        reset_products = {}
830|        for product_name, product_data in client.get('products', {}).items():
831|            reset_products[product_name] = {"status": "", "value": 0}
832|        
833|        await db.clients.update_one(
834|            {"id": client['id']},
835|            {"$set": {"products": reset_products, "updated_at": datetime.now(timezone.utc).isoformat()}}
836|        )
837|    
838|    return {"message": "Campaign reset successfully", "clients_updated": len(clients)}
839|
840|@api_router.delete("/campaigns/{campaign_id}")
841|async def delete_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
842|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']})
843|    if not campaign:
844|        raise HTTPException(status_code=404, detail="Campaign not found")
845|    
846|    # Delete sheets only
847|    await db.sheets.delete_many({"campaign_id": campaign_id})
848|    
849|    # PRESERVE CLIENTS - Remove campaign_id to make them available for next campaign
850|    await db.clients.update_many(
851|        {"campaign_id": campaign_id, "user_id": current_user['id']},
852|        {"$set": {"campaign_id": None}}
853|    )
854|    
855|    # Delete campaign
856|    await db.campaigns.delete_one({"id": campaign_id})
857|    
858|    return {"message": "Campaign deleted successfully. Clients were preserved."}
859|
860|
861|
862|# ==================== Sheet Routes ====================
863|
864|@api_router.post("/sheets", response_model=Sheet)
865|async def create_sheet(sheet_data: SheetCreate, current_user: dict = Depends(get_current_user)):
866|    # Verify campaign belongs to user
867|    campaign = await db.campaigns.find_one({"id": sheet_data.campaign_id, "user_id": current_user['id']})
868|    if not campaign:
869|        raise HTTPException(status_code=404, detail="Campaign not found")
870|    
871|    sheet = Sheet(
872|        user_id=current_user['id'],
873|        campaign_id=sheet_data.campaign_id,
874|        name=sheet_data.name,
875|        icon=sheet_data.icon,
876|        headers=sheet_data.headers
877|    )
878|    
879|    doc = sheet.model_dump()
880|    doc['created_at'] = doc['created_at'].isoformat()
881|    
882|    await db.sheets.insert_one(doc)
883|    return sheet
884|
885|@api_router.get("/sheets", response_model=List[Sheet])
886|async def get_sheets(campaign_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
887|    query = {"user_id": current_user['id']}
888|    if campaign_id:
889|        query["campaign_id"] = campaign_id
890|    
891|    sheets = await db.sheets.find(query, {"_id": 0}).to_list(1000)
892|    
893|    for sheet in sheets:
894|        if isinstance(sheet.get('created_at'), str):
895|            sheet['created_at'] = datetime.fromisoformat(sheet['created_at'])
896|    
897|    return sheets
898|
899|@api_router.get("/sheets/{sheet_id}", response_model=Sheet)
900|async def get_sheet(sheet_id: str, current_user: dict = Depends(get_current_user)):
901|    sheet = await db.sheets.find_one({"id": sheet_id, "user_id": current_user['id']}, {"_id": 0})
902|    if not sheet:
903|        raise HTTPException(status_code=404, detail="Sheet not found")
904|    
905|    if isinstance(sheet.get('created_at'), str):
906|        sheet['created_at'] = datetime.fromisoformat(sheet['created_at'])
907|    
908|    return Sheet(**sheet)
909|
910|@api_router.put("/sheets/{sheet_id}", response_model=Sheet)
911|async def update_sheet(sheet_id: str, update_data: SheetUpdate, current_user: dict = Depends(get_current_user)):
912|    sheet = await db.sheets.find_one({"id": sheet_id, "user_id": current_user['id']})
913|    if not sheet:
914|        raise HTTPException(status_code=404, detail="Sheet not found")
915|    
916|    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
917|    
918|    if update_dict:
919|        await db.sheets.update_one({"id": sheet_id}, {"$set": update_dict})
920|    
921|    updated_sheet = await db.sheets.find_one({"id": sheet_id}, {"_id": 0})
922|    if isinstance(updated_sheet.get('created_at'), str):
923|        updated_sheet['created_at'] = datetime.fromisoformat(updated_sheet['created_at'])
924|    
925|    return Sheet(**updated_sheet)
926|
927|@api_router.delete("/sheets/{sheet_id}")
928|async def delete_sheet(sheet_id: str, current_user: dict = Depends(get_current_user)):
929|    sheet = await db.sheets.find_one({"id": sheet_id, "user_id": current_user['id']})
930|    if not sheet:
931|        raise HTTPException(status_code=404, detail="Sheet not found")
932|    
933|    # Delete all clients in this sheet
934|    await db.clients.delete_many({"sheet_id": sheet_id})
935|    await db.sheets.delete_one({"id": sheet_id})
936|    
937|    return {"message": "Sheet deleted successfully"}
938|
939|
940|# ==================== Client Routes ====================
941|
942|@api_router.post("/clients", response_model=Client)
943|async def create_client(client_data: ClientCreate, current_user: dict = Depends(get_current_user)):
944|    # Verify sheet and campaign belong to user
945|    sheet = await db.sheets.find_one({"id": client_data.sheet_id, "user_id": current_user['id']})
946|    if not sheet:
947|        raise HTTPException(status_code=404, detail="Sheet not found")
948|    
949|    campaign = await db.campaigns.find_one({"id": client_data.campaign_id, "user_id": current_user['id']})
950|    if not campaign:
951|        raise HTTPException(status_code=404, detail="Campaign not found")
952|    
953|    # Inicializar estrutura de indústrias baseado na campanha
954|    industries_data = {}
955|    campaign_industries = campaign.get('industries', [])
956|    
957|    for industry in campaign_industries:
958|        industry_name = industry.get('name', '')
959|        products = industry.get('products', [])
960|        
961|        # Criar estrutura vazia para cada produto da indústria
962|        industry_products = {}
963|        for product in products:
964|            industry_products[product] = {"status": "", "value": 0}
965|        
966|        industries_data[industry_name] = {
967|            "products": industry_products,
968|            "industry_status": ""  # Será "" inicialmente
969|        }
970|    
971|    client = Client(
972|        user_id=current_user['id'],
973|        sheet_id=client_data.sheet_id,
974|        campaign_id=client_data.campaign_id,
975|        CLIENTE=client_data.CLIENTE,
976|        CNPJ=client_data.CNPJ,
977|        ENDERECO=client_data.ENDERECO,
978|        CIDADE=client_data.CIDADE,
979|        industries=industries_data,
980|        products=client_data.products,  # Compatibilidade
981|        notes=client_data.notes
982|    )
983|    
984|    doc = client.model_dump()
985|    doc['created_at'] = doc['created_at'].isoformat()
986|    doc['updated_at'] = doc['updated_at'].isoformat()
987|    
988|    await db.clients.insert_one(doc)
989|    return client
990|
991|@api_router.get("/clients", response_model=List[Client])
992|async def get_clients(sheet_id: Optional[str] = None, campaign_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
993|    query = {"user_id": current_user['id']}
994|    if sheet_id:
995|        query["sheet_id"] = sheet_id
996|    if campaign_id:
997|        # Include clients from this campaign OR clients without campaign (campaign_id=None)
998|        query["$or"] = [
999|            {"campaign_id": campaign_id},
1000|            {"campaign_id": None}
1001|        ]
1002|    
1003|    clients = await db.clients.find(query, {"_id": 0}).to_list(10000)
1004|    
1005|    for client in clients:
1006|        if isinstance(client.get('created_at'), str):
1007|            client['created_at'] = datetime.fromisoformat(client['created_at'])
1008|        if isinstance(client.get('updated_at'), str):
1009|            client['updated_at'] = datetime.fromisoformat(client['updated_at'])
1010|    
1011|    return clients
1012|
1013|@api_router.get("/clients/{client_id}", response_model=Client)
1014|async def get_client(client_id: str, current_user: dict = Depends(get_current_user)):
1015|    client = await db.clients.find_one({"id": client_id, "user_id": current_user['id']}, {"_id": 0})
1016|    if not client:
1017|        raise HTTPException(status_code=404, detail="Client not found")
1018|    
1019|    if isinstance(client.get('created_at'), str):
1020|        client['created_at'] = datetime.fromisoformat(client['created_at'])
1021|    if isinstance(client.get('updated_at'), str):
1022|        client['updated_at'] = datetime.fromisoformat(client['updated_at'])
1023|    
1024|    return Client(**client)
1025|
1026|@api_router.put("/clients/{client_id}", response_model=Client)
1027|async def update_client(client_id: str, update_data: ClientUpdate, current_user: dict = Depends(get_current_user)):
1028|    client = await db.clients.find_one({"id": client_id, "user_id": current_user['id']})
1029|    if not client:
1030|        raise HTTPException(status_code=404, detail="Client not found")
1031|    
1032|    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
1033|    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
1034|    
1035|    if update_dict:
1036|        await db.clients.update_one({"id": client_id}, {"$set": update_dict})
1037|    
1038|    updated_client = await db.clients.find_one({"id": client_id}, {"_id": 0})
1039|    if isinstance(updated_client.get('created_at'), str):
1040|        updated_client['created_at'] = datetime.fromisoformat(updated_client['created_at'])
1041|    if isinstance(updated_client.get('updated_at'), str):
1042|        updated_client['updated_at'] = datetime.fromisoformat(updated_client['updated_at'])
1043|    
1044|    return Client(**updated_client)
1045|
1046|@api_router.delete("/clients/{client_id}")
1047|async def delete_client(client_id: str, current_user: dict = Depends(get_current_user)):
1048|    client = await db.clients.find_one({"id": client_id, "user_id": current_user['id']})
1049|    if not client:
1050|        raise HTTPException(status_code=404, detail="Client not found")
1051|    
1052|    await db.clients.delete_one({"id": client_id})
1053|    return {"message": "Client deleted successfully"}
1054|
1055|
1056|# ==================== Dashboard/Stats Routes ====================
1057|
1058|@api_router.get("/stats/{campaign_id}")
1059|async def get_campaign_stats(campaign_id: str, current_user: dict = Depends(get_current_user)):
1060|    """Get comprehensive stats for a campaign"""
1061|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
1062|    if not campaign:
1063|        raise HTTPException(status_code=404, detail="Campaign not found")
1064|    
1065|    # Get all clients in campaign
1066|    clients = await db.clients.find({
1067|        "user_id": current_user['id'],
1068|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
1069|    }).to_list(10000)
1070|    
1071|    total_clients = len(clients)
1072|    product_stats = {}
1073|    
1074|    # Calculate stats per product
1075|    for client in clients:
1076|        for product_name, product_data in client.get('products', {}).items():
1077|            if product_name not in product_stats:
1078|                product_stats[product_name] = {
1079|                    "positivados": 0,
1080|                    "total_value": 0,
1081|                    "goal": campaign.get('product_goals', {}).get(product_name, 0)
1082|                }
1083|            
1084|            if product_data.get('status', '').lower() == 'positivado':
1085|                product_stats[product_name]['positivados'] += 1
1086|            
1087|            product_stats[product_name]['total_value'] += product_data.get('value', 0)
1088|    
1089|    # Calculate percentages
1090|    for product_name, stats in product_stats.items():
1091|        stats['percentage'] = (stats['positivados'] / total_clients * 100) if total_clients > 0 else 0
1092|        stats['goal_percentage'] = (stats['total_value'] / stats['goal'] * 100) if stats['goal'] > 0 else 0
1093|    
1094|    return {
1095|        "campaign": campaign,
1096|        "total_clients": total_clients,
1097|        "product_stats": product_stats
1098|    }
1099|
1100|@api_router.get("/stats/{campaign_id}/cities")
1101|async def get_campaign_stats_by_city(campaign_id: str, current_user: dict = Depends(get_current_user)):
1102|    """Get comprehensive stats for a campaign grouped by city"""
1103|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
1104|    if not campaign:
1105|        raise HTTPException(status_code=404, detail="Campaign not found")
1106|    
1107|    # Get all clients in campaign (including clients without campaign_id)
1108|    clients = await db.clients.find({
1109|        "user_id": current_user['id'],
1110|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
1111|    }).to_list(10000)
1112|    
1113|    # Group by city
1114|    city_stats = {}
1115|    
1116|    for client in clients:
1117|        city = client.get('CIDADE', 'Sem Cidade')
1118|        
1119|        if city not in city_stats:
1120|            city_stats[city] = {
1121|                "total_clients": 0,
1122|                "positivated_clients": 0,
1123|                "products": {}
1124|            }
1125|        
1126|        city_stats[city]["total_clients"] += 1
1127|        
1128|        # Check if client has any positivation
1129|        client_has_positivation = False
1130|        
1131|        # Process industries and products
1132|        industries_obj = client.get('industries', {})
1133|        if isinstance(industries_obj, dict):
1134|            for industry_name, industry in industries_obj.items():
1135|                if isinstance(industry, dict):
1136|                    products_dict = industry.get('products', {})
1137|                    # Products is a dict, not a list!
1138|                    if isinstance(products_dict, dict):
1139|                        for product_name, product in products_dict.items():
1140|                            if isinstance(product, dict):
1141|                                status = product.get('status', '').strip().lower()
1142|                                
1143|                                if product_name:
1144|                                    if product_name not in city_stats[city]["products"]:
1145|                                        city_stats[city]["products"][product_name] = {
1146|                                            "positivados": 0,
1147|                                            "total_clients": 0
1148|                                        }
1149|                                    
1150|                                    city_stats[city]["products"][product_name]["total_clients"] += 1
1151|                                    
1152|                                    if status == 'positivado':
1153|                                        city_stats[city]["products"][product_name]['positivados'] += 1
1154|                                        client_has_positivation = True
1155|        
1156|        if client_has_positivation:
1157|            city_stats[city]["positivated_clients"] += 1
1158|    
1159|    # Calculate percentages
1160|    for city, data in city_stats.items():
1161|        data["positivation_percentage"] = (data["positivated_clients"] / data["total_clients"] * 100) if data["total_clients"] > 0 else 0
1162|        
1163|        for product_name, stats in data["products"].items():
1164|            stats['percentage'] = (stats['positivados'] / stats['total_clients'] * 100) if stats['total_clients'] > 0 else 0
1165|    
1166|    return {
1167|        "campaign": campaign,
1168|        "city_stats": city_stats,
1169|        "total_cities": len(city_stats)
1170|    }
1171|
1172|
1173|# ==================== ADVANCED ANALYTICS ENDPOINTS ====================
1174|
1175|@api_router.get("/analytics/metrics/{campaign_id}")
1176|async def get_analytics_metrics(campaign_id: str, current_user: dict = Depends(get_current_user)):
1177|    """Get general metrics for analytics dashboard"""
1178|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
1179|    if not campaign:
1180|        raise HTTPException(status_code=404, detail="Campaign not found")
1181|    
1182|    # Get all clients
1183|    clients = await db.clients.find({
1184|        "user_id": current_user['id'],
1185|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
1186|    }).to_list(10000)
1187|    
1188|    total_clients = len(clients)
1189|    clients_positivados = 0
1190|    total_industries = len(campaign.get('industries', []))
1191|    
1192|    # Count total products in campaign
1193|    total_products = 0
1194|    for industry in campaign.get('industries', []):
1195|        if isinstance(industry, dict):
1196|            products = industry.get('products', [])
1197|            total_products += len(products)
1198|    
1199|    # Count clients with at least one positivation
1200|    for client in clients:
1201|        has_positivation = False
1202|        industries_obj = client.get('industries', {})
1203|        
1204|        # Industries is an object/dict, not a list
1205|        if isinstance(industries_obj, dict):
1206|            for industry_name, industry in industries_obj.items():
1207|                if isinstance(industry, dict):
1208|                    products_dict = industry.get('products', {})
1209|                    # Products is a dict, not a list!
1210|                    if isinstance(products_dict, dict):
1211|                        for product_name, product in products_dict.items():
1212|                            if isinstance(product, dict):
1213|                                status = product.get('status', '').strip().lower()
1214|                                if status == 'positivado':
1215|                                    has_positivation = True
1216|                                    break
1217|                if has_positivation:
1218|                    break
1219|        
1220|        if has_positivation:
1221|            clients_positivados += 1
1222|    
1223|    percentage_positivados = (clients_positivados / total_clients * 100) if total_clients > 0 else 0
1224|    
1225|    return {
1226|        "total_clients": total_clients,
1227|        "clients_positivados": clients_positivados,
1228|        "percentage_positivados": round(percentage_positivados, 2),
1229|        "total_industries": total_industries,
1230|        "total_products": total_products
1231|    }
1232|
1233|@api_router.get("/analytics/industries/{campaign_id}")
1234|async def get_industries_stats(campaign_id: str, current_user: dict = Depends(get_current_user)):
1235|    """Get positivation stats grouped by industry"""
1236|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
1237|    if not campaign:
1238|        raise HTTPException(status_code=404, detail="Campaign not found")
1239|    
1240|    clients = await db.clients.find({
1241|        "user_id": current_user['id'],
1242|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
1243|    }).to_list(10000)
1244|    
1245|    industry_stats = {}
1246|    
1247|    # Initialize industries from campaign
1248|    for industry in campaign.get('industries', []):
1249|        if isinstance(industry, dict):
1250|            industry_name = industry.get('name')
1251|            industry_stats[industry_name.lower()] = {  # Use lowercase as key
1252|                "name": industry_name,
1253|                "total_positivados": 0,
1254|                "total_clients": 0,
1255|                "percentage": 0
1256|            }
1257|    
1258|    # Count clients per industry and positivations
1259|    for client in clients:
1260|        industries_obj = client.get('industries', {})
1261|        
1262|        # Industries is an object/dict, not a list
1263|        if isinstance(industries_obj, dict):
1264|            for industry_name, industry in industries_obj.items():
1265|                industry_name_lower = industry_name.lower()  # Compare in lowercase
1266|                if industry_name_lower in industry_stats:
1267|                    # Count this client as having this industry
1268|                    industry_stats[industry_name_lower]['total_clients'] += 1
1269|                    
1270|                    # Check if any product in this industry is positivado
1271|                    has_positivation = False
1272|                    if isinstance(industry, dict):
1273|                        products_dict = industry.get('products', {})
1274|                        # Products is a dict, not a list!
1275|                        if isinstance(products_dict, dict):
1276|                            for product_name, product in products_dict.items():
1277|                                if isinstance(product, dict):
1278|                                    status = product.get('status', '').strip().lower()
1279|                                    if status == 'positivado':
1280|                                        has_positivation = True
1281|                                        break
1282|                    
1283|                    if has_positivation:
1284|                        industry_stats[industry_name_lower]['total_positivados'] += 1
1285|    
1286|    # Calculate percentages
1287|    for industry_name, stats in industry_stats.items():
1288|        if stats['total_clients'] > 0:
1289|            stats['percentage'] = round((stats['total_positivados'] / stats['total_clients']) * 100, 2)
1290|    
1291|    # Convert to list and sort by positivados
1292|    result = list(industry_stats.values())
1293|    result.sort(key=lambda x: x['total_positivados'], reverse=True)
1294|    
1295|    return result
1296|
1297|
1298|@api_router.get("/analytics/debug-industries/{campaign_id}")
1299|async def debug_industries(campaign_id: str, current_user: dict = Depends(get_current_user)):
1300|    """Debug industries matching"""
1301|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
1302|    if not campaign:
1303|        return {"error": "Campaign not found"}
1304|    
1305|    clients = await db.clients.find({
1306|        "user_id": current_user['id'],
1307|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
1308|    }).to_list(10000)
1309|    
1310|    # Get campaign industry names
1311|    campaign_industries = []
1312|    for ind in campaign.get('industries', []):
1313|        if isinstance(ind, dict):
1314|            campaign_industries.append(ind.get('name'))
1315|    
1316|    # Get client industry names
1317|    client_industries = set()
1318|    for client in clients:
1319|        industries_obj = client.get('industries', {})
1320|        if isinstance(industries_obj, dict):
1321|            for ind_name in industries_obj.keys():
1322|                client_industries.add(ind_name)
1323|    
1324|    return {
1325|        "campaign_industries": campaign_industries,
1326|        "client_industries": list(client_industries),
1327|        "match": [c for c in campaign_industries if c in client_industries]
1328|    }
1329|
1330|
1331|@api_router.get("/analytics/products/{campaign_id}")
1332|async def get_products_stats(campaign_id: str, current_user: dict = Depends(get_current_user)):
1333|    """Get positivation stats grouped by product"""
1334|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
1335|    if not campaign:
1336|        raise HTTPException(status_code=404, detail="Campaign not found")
1337|    
1338|    clients = await db.clients.find({
1339|        "user_id": current_user['id'],
1340|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
1341|    }).to_list(10000)
1342|    
1343|    product_stats = {}
1344|    
1345|    # Initialize products from campaign
1346|    for industry in campaign.get('industries', []):
1347|        if isinstance(industry, dict):
1348|            industry_name = industry.get('name')
1349|            for product_name in industry.get('products', []):
1350|                if isinstance(product_name, str) and product_name not in product_stats:
1351|                    product_stats[product_name] = {
1352|                        "name": product_name,
1353|                        "industry": industry_name,
1354|                        "total_positivados": 0,
1355|                        "total_clients": len(clients)
1356|                    }
1357|    
1358|    # Count positivations per product
1359|    for client in clients:
1360|        industries_obj = client.get('industries', {})
1361|        
1362|        # Industries is an object/dict, not a list
1363|        if isinstance(industries_obj, dict):
1364|            for industry_name, industry in industries_obj.items():
1365|                if isinstance(industry, dict):
1366|                    products_dict = industry.get('products', {})
1367|                    # Products is a dict, not a list!
1368|                    if isinstance(products_dict, dict):
1369|                        for product_name, product in products_dict.items():
1370|                            if isinstance(product, dict):
1371|                                status = product.get('status', '').strip().lower()
1372|                                if product_name in product_stats and status == 'positivado':
1373|                                    product_stats[product_name]['total_positivados'] += 1
1374|    
1375|    # Convert to list and sort by positivados
1376|    result = list(product_stats.values())
1377|    result.sort(key=lambda x: x['total_positivados'], reverse=True)
1378|    
1379|    return result
1380|
1381|@api_router.get("/analytics/top-clients/{campaign_id}")
1382|async def get_top_clients(campaign_id: str, limit: int = 10, current_user: dict = Depends(get_current_user)):
1383|    """Get top clients by number of positivations"""
1384|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
1385|    if not campaign:
1386|        raise HTTPException(status_code=404, detail="Campaign not found")
1387|    
1388|    clients = await db.clients.find({
1389|        "user_id": current_user['id'],
1390|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
1391|    }).to_list(10000)
1392|    
1393|    client_stats = []
1394|    
1395|    for client in clients:
1396|        positivations_count = 0
1397|        
1398|        # Count total positivations for this client
1399|        industries_obj = client.get('industries', {})
1400|        
1401|        # Industries is an object/dict, not a list
1402|        if isinstance(industries_obj, dict):
1403|            for industry_name, industry in industries_obj.items():
1404|                if isinstance(industry, dict):
1405|                    products_dict = industry.get('products', {})
1406|                    # Products is a dict, not a list!
1407|                    if isinstance(products_dict, dict):
1408|                        for product_name, product in products_dict.items():
1409|                            if isinstance(product, dict):
1410|                                status = product.get('status', '').strip().lower()
1411|                                if status == 'positivado':
1412|                                    positivations_count += 1
1413|        
1414|        if positivations_count > 0:
1415|            client_stats.append({
1416|                "name": client.get('CLIENTE', 'Sem nome'),
1417|                "city": client.get('CIDADE', 'Sem cidade'),
1418|                "neighborhood": client.get('BAIRRO', 'Sem bairro'),
1419|                "positivations": positivations_count
1420|            })
1421|    
1422|    # Sort by positivations and get top N
1423|    client_stats.sort(key=lambda x: x['positivations'], reverse=True)
1424|    
1425|    return client_stats[:limit]
1426|
1427|
1428|@api_router.get("/analytics/debug/{campaign_id}")
1429|async def debug_analytics(campaign_id: str, current_user: dict = Depends(get_current_user)):
1430|    """Debug endpoint to see raw data structure"""
1431|    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user['id']}, {"_id": 0})
1432|    if not campaign:
1433|        raise HTTPException(status_code=404, detail="Campaign not found")
1434|    
1435|    clients = await db.clients.find({
1436|        "user_id": current_user['id'],
1437|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
1438|    }).to_list(10000)
1439|    
1440|    # Get campaign industries names
1441|    campaign_industries = []
1442|    for ind in campaign.get('industries', []):
1443|        if isinstance(ind, dict):
1444|            campaign_industries.append(ind.get('name'))
1445|    
1446|    # Get first client industries
1447|    client_industries = []
1448|    if clients:
1449|        first_client = clients[0]
1450|        for ind in first_client.get('industries', []):
1451|            if isinstance(ind, dict):
1452|                client_industries.append({
1453|                    "name": ind.get('name'),
1454|                    "products_count": len(ind.get('products', [])),
1455|                    "first_product": ind.get('products', [{}])[0] if ind.get('products') else None
1456|                })
1457|    
1458|    return {
1459|        "campaign_industries": campaign_industries,
1460|        "total_clients": len(clients),
1461|        "first_client_industries": client_industries,
1462|        "first_client_name": clients[0].get('name') if clients else None
1463|    }
1464|
1465|
1466|@api_router.get("/analytics/debug-auto")
1467|async def debug_analytics_auto(current_user: dict = Depends(get_current_user)):
1468|    """Debug endpoint - automatically uses user's first campaign"""
1469|    
1470|    # Get user's first campaign
1471|    campaign = await db.campaigns.find_one({"user_id": current_user['id']}, {"_id": 0})
1472|    if not campaign:
1473|        return {"error": "No campaign found"}
1474|    
1475|    campaign_id = campaign.get('id')
1476|    clients = await db.clients.find({
1477|        "user_id": current_user['id'],
1478|        "$or": [{"campaign_id": campaign_id}, {"campaign_id": None}]
1479|    }).to_list(10000)
1480|    
1481|    # Get campaign industries names
1482|    campaign_industries = []
1483|    for ind in campaign.get('industries', []):
1484|        if isinstance(ind, dict):
1485|            campaign_industries.append(ind.get('name'))
1486|    
1487|    # Get ALL client industries to see patterns
1488|    all_client_industries = {}
1489|    clients_with_positivation = 0
1490|    
1491|    for client in clients:
1492|        client_has_positivation = False
1493|        industries_obj = client.get('industries', {})
1494|        
1495|        # Industries is an object/dict, not a list
1496|        if isinstance(industries_obj, dict):
1497|            for ind_name, ind in industries_obj.items():
1498|                if ind_name not in all_client_industries:
1499|                    all_client_industries[ind_name] = {
1500|                        "count": 0,
1501|                        "positivated": 0,
1502|                        "example_products": []
1503|                    }
1504|                all_client_industries[ind_name]["count"] += 1
1505|                
1506|                # Check for positivation
1507|                has_positivation_in_industry = False
1508|                if isinstance(ind, dict):
1509|                    for prod in ind.get('products', [])[:2]:
1510|                        if isinstance(prod, dict):
1511|                            status = prod.get('status', '').strip()
1512|                            all_client_industries[ind_name]["example_products"].append({
1513|                                "name": prod.get('name'),
1514|                                "status": status,
1515|                                "status_lower": status.lower()
1516|                            })
1517|                            if status.lower() == 'positivado':
1518|                                has_positivation_in_industry = True
1519|                                client_has_positivation = True
1520|                    
1521|                    if has_positivation_in_industry:
1522|                        all_client_industries[ind_name]["positivated"] += 1
1523|        
1524|        if client_has_positivation:
1525|            clients_with_positivation += 1
1526|    
1527|    return {
1528|        "campaign_name": campaign.get('name'),
1529|        "campaign_industries": campaign_industries,
1530|        "total_clients": len(clients),
1531|        "clients_with_positivation": clients_with_positivation,
1532|        "client_industries_found": all_client_industries
1533|    }
1534|
1535|
1536|
1537|
1538|
1539|@api_router.get("/analytics/test-client/{client_id}")
1540|async def test_client_structure(client_id: str, current_user: dict = Depends(get_current_user)):
1541|    """Test endpoint to see exact client structure"""
1542|    client = await db.clients.find_one({"id": client_id, "user_id": current_user['id']}, {"_id": 0})
1543|    if not client:
1544|        return {"error": "Client not found"}
1545|    
1546|    # Get industries structure
1547|    industries_obj = client.get('industries', {})
1548|    result = {
1549|        "client_name": client.get('name'),
1550|        "industries_type": str(type(industries_obj)),
1551|        "industries_keys": list(industries_obj.keys()) if isinstance(industries_obj, dict) else None,
1552|        "first_industry_data": None
1553|    }
1554|    
1555|    # Get first industry details
1556|    if isinstance(industries_obj, dict) and industries_obj:
1557|        first_ind_name = list(industries_obj.keys())[0]
1558|        first_ind = industries_obj[first_ind_name]
1559|        result["first_industry_data"] = {
1560|            "name": first_ind_name,
1561|            "type": str(type(first_ind)),
1562|            "keys": list(first_ind.keys()) if isinstance(first_ind, dict) else None,
1563|            "products_type": str(type(first_ind.get('products'))) if isinstance(first_ind, dict) else None,
1564|            "products_length": len(first_ind.get('produ<response clipped><NOTE>To save on context only part of this file has been shown to you. You should retry this tool after you have searched inside the file with `grep -n` in order to find the line numbers of what you are looking for.</NOTE>
@api_router.get("/analytics/test-by-name")
async def test_by_name(name: str, current_user: dict = Depends(get_current_user)):
    """Test endpoint to see exact client structure by name"""
    client = await db.clients.find_one({"name": {"$regex": name, "$options": "i"}, "user_id": current_user['id']}, {"_id": 0})
    if not client:
        return {"error": f"Client not found with name containing: {name}"}
    
    # Get industries structure
    industries_obj = client.get('industries', {})
    result = {
        "client_name": client.get('name'),
        "industries_type": str(type(industries_obj)),
        "industries_keys": list(industries_obj.keys()) if isinstance(industries_obj, dict) else None,
        "industries_raw": industries_obj
    }
    
    return result

@api_router.get("/analytics/debug-raw")


@api_router.get("/analytics/list-all-clients")
async def list_all_clients(current_user: dict = Depends(get_current_user)):
    """List all clients in database"""
    clients = await db.clients.find({"user_id": current_user['id']}).to_list(100)
    
    result = {
        "total_clients": len(clients),
        "clients": []
    }
    
    for client in clients:
        industries_obj = client.get('industries', {})
        result["clients"].append({
            "name": client.get('name'),
            "city": client.get('CIDADE'),
            "has_industries": isinstance(industries_obj, dict) and len(industries_obj) > 0,
            "industries_count": len(industries_obj) if isinstance(industries_obj, dict) else 0,
            "industries_names": list(industries_obj.keys()) if isinstance(industries_obj, dict) else []
        })
    
    return result



@api_router.get("/analytics/test-by-city")
async def test_by_city(city: str, current_user: dict = Depends(get_current_user)):
    """Get full client structure by city"""
    client = await db.clients.find_one({"CIDADE": city, "user_id": current_user['id']}, {"_id": 0})
    if not client:
        return {"error": f"Client not found in city: {city}"}
    
    # Return full structure
    return {
        "client": client
    }

@api_router.delete("/analytics/reset-all-data")
async def reset_all_data(current_user: dict = Depends(get_current_user)):
    """Delete all campaigns and clients for current user - DANGER!"""
    
    # Delete all clients
    clients_result = await db.clients.delete_many({"user_id": current_user['id']})
    
    # Delete all campaigns
    campaigns_result = await db.campaigns.delete_many({"user_id": current_user['id']})
    
    # Delete all sheets
    sheets_result = await db.sheets.delete_many({"user_id": current_user['id']})
    
    return {
        "success": True,
        "deleted_clients": clients_result.deleted_count,
        "deleted_campaigns": campaigns_result.deleted_count,
        "deleted_sheets": sheets_result.deleted_count,
        "message": "Todos os dados foram excluídos. Você pode começar do zero!"
    }

@api_router.get("/analytics/debug-raw")
async def debug_raw_data(current_user: dict = Depends(get_current_user)):
    """Show raw structure of first client"""
    campaign = await db.campaigns.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not campaign:
        return {"error": "No campaign found"}
    
    campaign_id = campaign.get('id')
    clients = await db.clients.find({"campaign_id": campaign_id, "user_id": current_user['id']}).to_list(10)
    
    if not clients:
        return {"error": "No clients found"}
    
    # Get raw structure of first client
    first_client = clients[0]
    
    return {
        "campaign_industries_raw": [ind for ind in campaign.get('industries', [])],
        "first_client_raw": {
            "name": first_client.get('name'),
            "industries": first_client.get('industries', [])
        }
    }


# ==================== MERCADO PAGO ROUTES ====================

import mercadopago
import hmac
import hashlib

# Initialize Mercado Pago SDK
mp_access_token = os.environ.get('MP_ACCESS_TOKEN', '')
mp_sdk = mercadopago.SDK(mp_access_token) if mp_access_token else None

class PaymentPreferenceCreate(BaseModel):
    plan: str  # "monthly_30" or "annual_300"
    payer_email: str
    payer_name: Optional[str] = None

class WebhookNotification(BaseModel):
    action: str
    api_version: str
    data: Dict[str, Any]
    date_created: str
    id: int
    live_mode: bool
    type: str
    user_id: str

# ==================== Subscription Models ====================
class SubscriptionPlanCreate(BaseModel):
    plan_type: str  # "monthly" or "annual"

class SubscriptionCreate(BaseModel):
    card_token: str
    plan_type: str  # "monthly" or "annual"
    payer_email: str

class SubscriptionResponse(BaseModel):
    subscription_id: str
    status: str
    init_point: str
    next_payment_date: Optional[str] = None
    auto_recurring: Optional[Dict] = None

@api_router.get("/payments/config")
async def get_payment_config():
    """Retorna a Public Key para o frontend"""
    return {
        "public_key": os.environ.get('MP_PUBLIC_KEY', ''),
        "plans": [
            {
                "id": "monthly_30",
                "name": "Mensal",
                "price": 30.00,
                "currency": "BRL",
                "interval": "month"
            },
            {
                "id": "annual_300",
                "name": "Anual",
                "price": 300.00,
                "currency": "BRL",
                "interval": "year",
                "discount": "Economia de R$ 60,00/ano"
            }
        ]
    }

@api_router.post("/payments/create-preference")
async def create_payment_preference(
    preference_data: PaymentPreferenceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Cria uma preferência de pagamento no Mercado Pago"""
    if not mp_sdk:
        raise HTTPException(status_code=500, detail="Mercado Pago não configurado")
    
    # Determinar valor baseado no plano
    plan_prices = {
        "monthly_30": 30.00,
        "monthly_simple": 35.00,
        "monthly": 29.90,
        "annual_300": 300.00,
        "annual": 300.00
    }
    
    if preference_data.plan not in plan_prices:
        raise HTTPException(status_code=400, detail="Plano inválido")
    
    amount = plan_prices[preference_data.plan]
    
    # Nome do plano para exibição
    plan_names = {
        "monthly_30": "Plano Mensal",
        "monthly_simple": "Plano Mensal Flexível",
        "monthly": "Plano Mensal 12 meses",
        "annual_300": "Plano Anual",
        "annual": "Plano Anual"
    }
    
    # Criar preferência de pagamento com Pix habilitado
    preference_payload = {
        "items": [
            {
                "title": f"{plan_names.get(preference_data.plan, 'Assinatura')} - Anota & Ganha",
                "description": "Assinatura mensal do sistema de incentivos",
                "quantity": 1,
                "unit_price": amount,
                "currency_id": "BRL"
            }
        ],
        "payer": {
            "email": preference_data.payer_email,
            "name": preference_data.payer_name or current_user.get('name', '')
        },
        "back_urls": {
            "success": f"{FRONTEND_URL}/payment/success",
            "failure": f"{FRONTEND_URL}/payment/failure",
            "pending": f"{FRONTEND_URL}/payment/pending"
        },
        "auto_return": "approved",
        "external_reference": f"{current_user['id']}:{preference_data.plan}",
        "notification_url": f"{BACKEND_URL}/api/payments/webhook",
        "statement_descriptor": "ANOTA & GANHA",
        "payment_methods": {
            "excluded_payment_types": [],
            "installments": 1  # Sem parcelamento
        }
    }
    
    try:
        preference_response = mp_sdk.preference().create(preference_payload)
        preference = preference_response["response"]
        
        # Salvar referência no banco
        payment_ref = {
            "id": str(uuid.uuid4()),
            "user_id": current_user['id'],
            "preference_id": preference["id"],
            "plan": preference_data.plan,
            "amount": amount,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.payment_references.insert_one(payment_ref)
        
        return {
            "preference_id": preference["id"],
            "init_point": preference["init_point"],
            "sandbox_init_point": preference.get("sandbox_init_point"),
            "payment_ref_id": payment_ref["id"]
        }
    except Exception as e:
        logger.error(f"Erro ao criar preferência: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao criar pagamento: {str(e)}")

@api_router.post("/payments/webhook")
async def mercadopago_webhook(request: dict):
    """Recebe notificações do Mercado Pago (pagamentos e assinaturas)"""
    logger.info(f"Webhook recebido: {request}")
    
    # Verificar tipo de notificação
    notification_type = request.get("type")
    
    # ===== ASSINATURAS =====
    if notification_type in ["subscription_authorized", "subscription_payment", "subscription_preapproval"]:
        subscription_id = request.get("data", {}).get("id")
        
        if not subscription_id:
            return {"status": "ok"}
        
        try:
            # Buscar informações da assinatura
            subscription_info = mp_sdk.preapproval().get(subscription_id)
            subscription = subscription_info["response"]
            
            logger.info(f"Assinatura info: {subscription}")
            
            external_ref = subscription.get("external_reference", "")
            subscription_status = subscription.get("status")
            
            # Extrair user_id do external_reference
            if ":" in external_ref:
                user_id = external_ref.split(":")[0]
                
                # Atualizar status da assinatura no banco
                await db.subscriptions.update_one(
                    {"subscription_id": subscription_id},
                    {"$set": {
                        "status": subscription_status,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                # Se assinatura foi autorizada, ativar licença
                if subscription_status == "authorized":
                    logger.info(f"Assinatura autorizada! Ativando licença para user {user_id}")
                    
                    # Buscar dados da assinatura no banco para saber o tipo
                    sub_ref = await db.subscriptions.find_one({"subscription_id": subscription_id})
                    
                    if sub_ref:
                        plan_type = sub_ref.get("plan_type")
                        
                        # Determinar tipo e duração da licença
                        if plan_type in ["monthly", "monthly_simple"]:
                            license_type = "monthly"
                            expiry = datetime.now(timezone.utc) + timedelta(days=30)
                        else:  # annual
                            license_type = "annual"
                            expiry = datetime.now(timezone.utc) + timedelta(days=365)
                        
                        # Atualizar usuário
                        await db.users.update_one(
                            {"id": user_id},
                            {"$set": {
                                "license_type": license_type,
                                "license_expiry": expiry.isoformat(),
                                "last_payment_date": datetime.now(timezone.utc).isoformat(),
                                "payment_method": "mercadopago_subscription",
                                "subscription_id": subscription_id
                            }}
                        )
                        
                        logger.info(f"Licença {license_type} ativada via assinatura!")
                
                # Se pagamento recorrente foi processado, renovar licença
                elif notification_type == "subscription_payment":
                    logger.info(f"Pagamento recorrente processado para user {user_id}")
                    
                    sub_ref = await db.subscriptions.find_one({"subscription_id": subscription_id})
                    
                    if sub_ref:
                        plan_type = sub_ref.get("plan_type")
                        
                        # Renovar licença
                        if plan_type in ["monthly", "monthly_simple"]:
                            expiry = datetime.now(timezone.utc) + timedelta(days=30)
                        else:  # annual
                            expiry = datetime.now(timezone.utc) + timedelta(days=365)
                        
                        await db.users.update_one(
                            {"id": user_id},
                            {"$set": {
                                "license_expiry": expiry.isoformat(),
                                "last_payment_date": datetime.now(timezone.utc).isoformat()
                            }}
                        )
                        
                        logger.info("Licença renovada via pagamento recorrente!")
            
            return {"status": "ok"}
            
        except Exception as e:
            logger.error(f"Erro ao processar webhook de assinatura: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    # ===== PAGAMENTOS ÚNICOS (ANTIGO) =====
    elif notification_type == "payment":
        payment_id = request.get("data", {}).get("id")
        
        if not payment_id:
            return {"status": "ok"}
        
        try:
            # Buscar informações do pagamento
            payment_info = mp_sdk.payment().get(payment_id)
            payment = payment_info["response"]
            
            logger.info(f"Pagamento info: {payment}")
            
            # Extrair external_reference (user_id:plan)
            external_ref = payment.get("external_reference", "")
            if ":" not in external_ref:
                logger.warning(f"External reference inválido: {external_ref}")
                return {"status": "ok"}
            
            user_id, plan = external_ref.split(":", 1)
            payment_status = payment.get("status")
            
            # Atualizar referência de pagamento
            await db.payment_references.update_one(
                {"user_id": user_id, "plan": plan, "status": "pending"},
                {"$set": {
                    "payment_id": str(payment_id),
                    "status": payment_status,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "payment_data": {
                        "transaction_amount": payment.get("transaction_amount"),
                        "status_detail": payment.get("status_detail"),
                        "payment_method_id": payment.get("payment_method_id")
                    }
                }}
            )
            
            # Se pagamento aprovado, ativar licença
            if payment_status == "approved":
                logger.info(f"Pagamento aprovado! Ativando licença para user {user_id}")
                
                # Determinar tipo e duração da licença
                if plan == "monthly_30":
                    license_type = "monthly"
                    license_plan = "monthly_30"
                    expiry = datetime.now(timezone.utc) + timedelta(days=30)
                elif plan == "annual_300":
                    license_type = "annual"
                    license_plan = "annual_300"
                    expiry = datetime.now(timezone.utc) + timedelta(days=365)
                else:
                    logger.warning(f"Plano desconhecido: {plan}")
                    return {"status": "ok"}
                
                # Atualizar usuário
                update_result = await db.users.update_one(
                    {"id": user_id},
                    {"$set": {
                        "license_type": license_type,
                        "license_plan": license_plan,
                        "license_expiry": expiry.isoformat(),
                        "last_payment_date": datetime.now(timezone.utc).isoformat(),
                        "payment_method": "mercadopago"
                    }}
                )
                
                logger.info(f"Licença ativada! Documentos modificados: {update_result.modified_count}")
            
            return {"status": "ok"}
            
        except Exception as e:
            logger.error(f"Erro ao processar webhook: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    return {"status": "ok"}

@api_router.get("/payments/status/{payment_ref_id}")
async def get_payment_status(
    payment_ref_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Consulta o status de um pagamento"""
    payment_ref = await db.payment_references.find_one(
        {"id": payment_ref_id, "user_id": current_user['id']},
        {"_id": 0}
    )
    
    if not payment_ref:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    
    # Se tem payment_id, buscar status atualizado no Mercado Pago
    if payment_ref.get("payment_id") and mp_sdk:
        try:
            payment_info = mp_sdk.payment().get(payment_ref["payment_id"])
            payment = payment_info["response"]
            
            # Atualizar status no banco
            current_status = payment.get("status")
            await db.payment_references.update_one(
                {"id": payment_ref_id},
                {"$set": {"status": current_status}}
            )
            
            payment_ref["status"] = current_status
        except Exception as e:
            logger.error(f"Erro ao buscar status do pagamento: {str(e)}")
    
    return payment_ref


# ==================== Subscription Endpoints ====================

@api_router.post("/subscriptions/create")
async def create_subscription(
    subscription_data: SubscriptionCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Cria uma assinatura recorrente no Mercado Pago.
    Planos disponíveis: monthly (12x R$ 29,00) ou annual (R$ 300,00)
    """
    try:
        if not mp_sdk:
            raise HTTPException(
                status_code=500,
                detail="Mercado Pago não configurado"
            )
        
        # Determinar configuração do plano
        if subscription_data.plan_type == "monthly_simple":
            reason = "Assinatura Mensal - Anota & Ganha Incentivos"
            amount = MONTHLY_SIMPLE_PRICE
            frequency = 1
            frequency_type = "months"
        elif subscription_data.plan_type == "monthly":
            reason = "Assinatura Mensal (12 meses) - Anota & Ganha Incentivos"
            amount = MONTHLY_PRICE
            frequency = 1
            frequency_type = "months"
        elif subscription_data.plan_type == "annual":
            reason = "Assinatura Anual - Anota & Ganha Incentivos"
            amount = ANNUAL_PRICE
            frequency = 1
            frequency_type = "years"
        else:
            raise HTTPException(
                status_code=400,
                detail="Tipo de plano inválido. Use 'monthly_simple', 'monthly' ou 'annual'"
            )
        
        # Criar dados da assinatura SEM repetitions (assinatura contínua)
        # O Mercado Pago cobra automaticamente até ser cancelado
        preapproval_data = {
            "reason": reason,
            "auto_recurring": {
                "frequency": frequency,
                "frequency_type": frequency_type,
                "transaction_amount": amount,
                "currency_id": "BRL"
            },
            "payer_email": subscription_data.payer_email,
            "back_url": f"{FRONTEND_URL}/payment/success",
            "external_reference": f"{current_user['id']}:subscription:{subscription_data.plan_type}",
            "status": "pending",
            # Adicionar informações adicionais para reduzir "high risk"
            "collector_id": 54275427,  # Seu collector ID
            "application_id": 6279807309571506  # Seu application ID
        }
        
        # Se tiver card_token, incluir (mas na prática não funciona com CardPayment)
        # Melhor abordagem é redirecionar para init_point
        # if subscription_data.card_token:
        #     preapproval_data["card_token_id"] = subscription_data.card_token
        
        logger.info(f"Criando assinatura para usuário {current_user['id']}: {subscription_data.plan_type}")
        logger.info(f"Email do pagador: {subscription_data.payer_email}")
        logger.info(f"Dados da assinatura: {preapproval_data}")
        
        # Criar assinatura no Mercado Pago
        result = mp_sdk.preapproval().create(preapproval_data)
        
        logger.info(f"Resposta do Mercado Pago - Status: {result.get('status')}")
        
        if result["status"] not in [200, 201]:
            logger.error(f"Erro ao criar assinatura: {result}")
            error_msg = result.get('response', {}).get('message', 'Erro desconhecido')
            logger.error(f"Mensagem de erro: {error_msg}")
            raise HTTPException(
                status_code=400,
                detail=f"Erro ao criar assinatura: {error_msg}"
            )
        
        response = result["response"]
        subscription_id = response.get("id")
        
        logger.info(f"Assinatura criada com sucesso: {subscription_id}")
        
        # Salvar referência da assinatura no banco
        subscription_ref = {
            "id": str(uuid.uuid4()),
            "user_id": current_user['id'],
            "subscription_id": subscription_id,
            "plan_type": subscription_data.plan_type,
            "status": response.get("status", "pending"),
            "amount": amount,
            "frequency": f"{frequency} {frequency_type}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.subscriptions.insert_one(subscription_ref)
        
        return {
            "subscription_id": subscription_id,
            "status": response.get("status"),
            "init_point": response.get("init_point"),
            "next_payment_date": response.get("next_payment_date"),
            "auto_recurring": response.get("auto_recurring")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao criar assinatura: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro interno ao criar assinatura: {str(e)}"
        )

@api_router.get("/subscriptions/status")
async def get_subscription_status(
    current_user: dict = Depends(get_current_user)
):
    """Consulta o status da assinatura do usuário"""
    subscription_ref = await db.subscriptions.find_one(
        {"user_id": current_user['id']},
        {"_id": 0},
        sort=[("created_at", -1)]  # Pegar a mais recente
    )
    
    if not subscription_ref:
        return {"has_subscription": False}
    
    # Se tem subscription_id, buscar status atualizado no Mercado Pago
    if subscription_ref.get("subscription_id") and mp_sdk:
        try:
            result = mp_sdk.preapproval().get(subscription_ref["subscription_id"])
            
            if result["status"] == 200:
                subscription = result["response"]
                current_status = subscription.get("status")
                
                # Atualizar status no banco
                await db.subscriptions.update_one(
                    {"id": subscription_ref["id"]},
                    {"$set": {
                        "status": current_status,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                subscription_ref["status"] = current_status
                subscription_ref["next_payment_date"] = subscription.get("next_payment_date")
                subscription_ref["summarized"] = subscription.get("summarized")
                
        except Exception as e:
            logger.error(f"Erro ao buscar status da assinatura: {str(e)}")
    
    return {
        "has_subscription": True,
        "subscription": subscription_ref
    }

@api_router.delete("/subscriptions/cancel")
async def cancel_subscription(
    current_user: dict = Depends(get_current_user)
):
    """Cancela a assinatura ativa do usuário"""
    try:
        # Buscar assinatura ativa
        subscription_ref = await db.subscriptions.find_one(
            {"user_id": current_user['id'], "status": {"$in": ["authorized", "pending"]}},
            sort=[("created_at", -1)]
        )
        
        if not subscription_ref:
            raise HTTPException(
                status_code=404,
                detail="Nenhuma assinatura ativa encontrada"
            )
        
        if not mp_sdk:
            raise HTTPException(
                status_code=500,
                detail="Mercado Pago não configurado"
            )
        
        # Cancelar no Mercado Pago
        subscription_id = subscription_ref["subscription_id"]
        update_data = {"status": "cancelled"}
        
        result = mp_sdk.preapproval().update(subscription_id, update_data)
        
        if result["status"] != 200:
            raise HTTPException(
                status_code=400,
                detail="Erro ao cancelar assinatura no Mercado Pago"
            )
        
        # Atualizar no banco
        await db.subscriptions.update_one(
            {"id": subscription_ref["id"]},
            {"$set": {
                "status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        logger.info(f"Assinatura cancelada: {subscription_id}")
        
        return {"message": "Assinatura cancelada com sucesso"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao cancelar assinatura: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro interno ao cancelar assinatura: {str(e)}"
        )


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
