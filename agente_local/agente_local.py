#!/usr/bin/env python3
"""
Agente Local - Robô de Ofertas WhatsApp
Versão: 1.0.0

Instalação:
  pip install playwright pandas requests
  playwright install chromium

Uso:
  python agente_local.py          # configura e inicia
  python agente_local.py --reset  # redefine a chave de licença
"""

import asyncio
import configparser
import hashlib
import logging
import os
import platform
import random
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path

import requests
import pandas as pd
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    datefmt="[%H:%M:%S]",
    handlers=[logging.StreamHandler()],
)

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


# ─── Caminhos ─────────────────────────────────────────────────────────────────

BASE_DIR         = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE      = os.path.join(BASE_DIR, "agente.cfg")
ARQUIVO_CONTATOS = os.path.join(BASE_DIR, "contacts.csv")
PASTA_FOTOS      = os.path.join(BASE_DIR, "fotos_ofertas")
ARQUIVO_MENSAGEM = os.path.join(BASE_DIR, "mensagem.txt")
PASTA_SESSAO     = os.path.join(BASE_DIR, "sessao_whatsapp")
PASTA_DEBUG      = os.path.join(BASE_DIR, "debug")
PASTA_RELATORIOS = os.path.join(BASE_DIR, "relatorios")

PAUSA_MIN = 60
PAUSA_MAX = 90
MAX_FOTOS = 50
INTERVALO_REVALIDACAO = 3600   # 1 hora

TIMEOUT_CURTO  = 4_000
TIMEOUT_MEDIO  = 15_000
TENTATIVAS     = 2
HEADLESS       = False


# ══════════════════════════════════════════════════════════════════════════════
# 1. LICENÇA
# ══════════════════════════════════════════════════════════════════════════════

def hardware_id() -> str:
    """ID único da máquina baseado em MAC + hostname."""
    dados = f"{platform.node()}-{platform.machine()}-{uuid.getnode()}"
    return hashlib.sha256(dados.encode()).hexdigest()[:32]


def carregar_config() -> configparser.ConfigParser:
    config = configparser.ConfigParser()

    if "--reset" in sys.argv or not os.path.exists(CONFIG_FILE):
        print("\n" + "=" * 60)
        print("  CONFIGURAÇÃO DO AGENTE LOCAL")
        print("=" * 60)
        print("\nAcesse o painel web e copie sua Chave de Licença.")
        chave = input("Chave de Licença (XXXX-XXXX-XXXX-XXXX): ").strip().upper()
        servidor = input("URL do servidor [https://api.representantes.app]: ").strip()
        if not servidor:
            servidor = "https://api.representantes.app"

        config["licenca"] = {"chave": chave, "servidor": servidor.rstrip("/")}
        with open(CONFIG_FILE, "w") as f:
            config.write(f)
        print(f"\nConfiguração salva em: {CONFIG_FILE}\n")
    else:
        config.read(CONFIG_FILE, encoding="utf-8")

    return config


def validar_licenca_servidor(chave: str, servidor: str) -> dict:
    try:
        resp = requests.post(
            f"{servidor}/api/license/validate",
            json={"license_key": chave, "hardware_id": hardware_id()},
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()
        return {"active": False, "message": f"Servidor retornou erro {resp.status_code}."}
    except requests.exceptions.ConnectionError:
        return {"active": False, "message": "Sem conexão com o servidor. Verifique a internet."}
    except Exception as e:
        return {"active": False, "message": f"Erro ao validar: {e}"}


def verificar_licenca_ou_sair(chave: str, servidor: str):
    """Valida a licença. Encerra o processo se inativa."""
    log("🔑 Verificando licença...")
    r = validar_licenca_servidor(chave, servidor)

    if r.get("active"):
        nome  = r.get("user_name", "Assinante")
        plano = r.get("plan", "")
        log(f"✅ Licença ativa — Bem-vindo, {nome}! (Plano: {plano})")
        log(r.get("message", ""))
        return True

    print("\n" + "═" * 60)
    print("  ❌ ACESSO NEGADO — ASSINATURA INATIVA")
    print("═" * 60)
    print(f"\n  {r.get('message', 'Licença inativa.')}")
    print("\n  Acesse o painel para renovar:")
    print("  → https://representantes.app/planos")
    print("═" * 60 + "\n")
    sys.exit(1)


# ══════════════════════════════════════════════════════════════════════════════
# 2. REVALIDAÇÃO PERIÓDICA (roda em background)
# ══════════════════════════════════════════════════════════════════════════════

async def loop_revalidacao(chave: str, servidor: str):
    """Revalida a licença a cada hora. Encerra o agente se a assinatura vencer."""
    while True:
        await asyncio.sleep(INTERVALO_REVALIDACAO)
        log("🔄 Revalidando licença (verificação periódica)...")
        r = validar_licenca_servidor(chave, servidor)
        if not r.get("active"):
            print("\n" + "═" * 60)
            print("  ❌ LICENÇA EXPIROU — ENCERRANDO AGENTE")
            print("═" * 60)
            print(f"  {r.get('message', 'Assinatura inativa.')}")
            print("  Renove em: https://representantes.app/planos\n")
            os._exit(1)   # força saída mesmo dentro de coroutine
        log(f"✅ Licença revalidada: {r.get('message', 'OK')}")


# ══════════════════════════════════════════════════════════════════════════════
# 3. UTILITÁRIOS WHATSAPP (idênticos ao meu_robo.py original)
# ══════════════════════════════════════════════════════════════════════════════

def garantir_pastas():
    for p in [PASTA_DEBUG, PASTA_RELATORIOS, PASTA_FOTOS,
              os.path.dirname(ARQUIVO_CONTATOS)]:
        Path(p).mkdir(parents=True, exist_ok=True)


def saudacao():
    h = datetime.now().hour
    if 5 <= h < 12:  return "Bom dia"
    if 12 <= h < 18: return "Boa tarde"
    return "Boa noite"


def limpar_numero(texto):
    if pd.isna(texto): return None
    num = re.sub(r"\D", "", str(texto).split(":::")[-1])
    if not num: return None
    if num.startswith("0"): num = num[1:]
    if len(num) <= 11: num = "55" + num
    return num


def listar_fotos():
    if not os.path.exists(PASTA_FOTOS): return []
    return sorted(
        os.path.abspath(os.path.join(PASTA_FOTOS, n))
        for n in os.listdir(PASTA_FOTOS)
        if n.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
    )


def carregar_mensagem():
    padrao = "Olá, [SAUDACAO], [NOME]!\n\nTemos ofertas especiais para você hoje."
    if not os.path.exists(ARQUIVO_MENSAGEM):
        Path(ARQUIVO_MENSAGEM).write_text(padrao, encoding="utf-8")
    return Path(ARQUIVO_MENSAGEM).read_text(encoding="utf-8")


def montar_mensagem(nome):
    primeiro = str(nome).strip().split()[0].capitalize() if str(nome).strip() else "Cliente"
    return (carregar_mensagem()
            .replace("[NOME]", primeiro)
            .replace("[SAUDACAO]", saudacao()))


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def nome_seguro(t):
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", str(t).strip())[:80] or "arquivo"


def carregar_csv():
    for enc in ["utf-8-sig", "utf-8", "latin1"]:
        try:
            df = pd.read_csv(ARQUIVO_CONTATOS, encoding=enc, sep=None, engine="python")
            log(f"📄 CSV carregado ({enc}): {len(df)} contatos")
            return df
        except Exception:
            pass
    raise RuntimeError("Não foi possível ler o CSV de contatos.")


def detectar_col_nome(df):
    candidatas = ["First Name", "Nome", "nome", "Name", "Full Name", "Nome Completo"]
    for c in candidatas:
        if c in df.columns: return c
    for c in df.columns:
        if "name" in c.lower() or "nome" in c.lower(): return c
    return None


def detectar_col_telefone(df):
    candidatas = ["Phone 1 - Value", "telefone", "Telefone", "phone", "Phone",
                  "celular", "Celular", "WhatsApp", "whatsapp", "numero"]
    for c in candidatas:
        if c in df.columns: return c
    for c in df.columns:
        lc = c.lower()
        if "phone" in lc or "telefone" in lc or "celular" in lc or "whatsapp" in lc:
            return c
    return None


def arq_enviados():
    return os.path.join(PASTA_RELATORIOS, "enviados.txt")


def carregar_enviados():
    p = arq_enviados()
    if not os.path.exists(p): return set()
    return {l.strip() for l in open(p, encoding="utf-8") if l.strip()}


def registrar_enviado(num):
    with open(arq_enviados(), "a", encoding="utf-8") as f:
        f.write(num + "\n")


def salvar_relatorio(nome, linhas):
    p = os.path.join(PASTA_RELATORIOS, nome)
    Path(p).write_text("\n".join(linhas), encoding="utf-8")
    return p


async def debug_screenshot(page, prefixo):
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    p = os.path.join(PASTA_DEBUG, f"{nome_seguro(prefixo)}_{stamp}.png")
    try:
        await page.screenshot(path=p, full_page=True)
    except Exception:
        pass


# ─── Seletores Playwright ─────────────────────────────────────────────────────

def ready_candidates(page):
    return [
        page.locator("[data-testid='chat-list-search']").first,
        page.locator("[aria-label*='Pesquisar']").first,
        page.locator("[aria-label*='Search']").first,
        page.get_by_role("textbox", name=re.compile(r"pesquisar|search", re.I)).first,
        page.get_by_role("button", name=re.compile(r"nova conversa|new chat", re.I)).first,
    ]

def chat_inputs(page):
    return [
        page.locator("footer").get_by_role("textbox").first,
        page.locator("footer [contenteditable='true']").first,
        page.get_by_role("textbox", name=re.compile(r"mensagem|message", re.I)).first,
    ]

def attach_buttons(page):
    return [
        page.get_by_role("button", name=re.compile(r"anexar|attach", re.I)).first,
        page.locator("[aria-label*='Anexar']").first,
        page.locator("[aria-label*='Attach']").first,
        page.locator("footer span[data-icon='plus-rounded']").first,
        page.locator("span[data-testid='clip']").first,
        page.locator("span[data-icon='attach-menu-plus']").first,
    ]

def file_inputs(page):
    return [
        page.locator("input[type='file'][accept*='image']").first,
        page.locator("input[type='file'][multiple]").first,
        page.locator("input[type='file']").first,
    ]

def caption_boxes(page):
    return [
        page.locator("div[role='dialog']").get_by_role("textbox").last,
        page.locator("[aria-label*='legenda']").first,
        page.locator("[aria-label*='caption']").first,
        page.locator("div[contenteditable='true'][data-tab='10']").first,
    ]

def send_buttons(page):
    return [
        page.get_by_role("button", name=re.compile(r"enviar|send", re.I)).first,
        page.locator("button[aria-label='Enviar']").first,
        page.locator("[data-testid='compose-btn-send']").first,
        page.locator("span[data-icon='send']").first,
    ]

INVALID_PATTERNS = [
    r"número de telefone inválido",
    r"phone number shared via url is invalid",
    r"este número de telefone não está no whatsapp",
    r"this phone number isn.t on whatsapp",
]


async def primeiro_visivel(candidatos, timeout=15000):
    for _ in range(max(1, timeout // 1000)):
        for loc in candidatos:
            try:
                if await loc.count() > 0 and await loc.is_visible():
                    return loc
            except Exception:
                pass
        await asyncio.sleep(1)
    return None


async def numero_invalido(page):
    for p in INVALID_PATTERNS:
        try:
            loc = page.get_by_text(re.compile(p, re.I)).first
            if await loc.count() > 0 and await loc.is_visible():
                return True
        except Exception:
            pass
    return False


async def fechar_dialogos(page):
    for _ in range(2):
        try:
            await page.keyboard.press("Escape")
            await asyncio.sleep(0.3)
        except Exception:
            pass


async def esperar_whatsapp(page):
    await page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")
    log("⏳ Aguardando WhatsApp Web...")
    avisou_qr = False
    for _ in range(120):
        for loc in ready_candidates(page):
            try:
                if await loc.count() > 0 and await loc.is_visible():
                    log("✅ WhatsApp Web pronto.")
                    return
            except Exception:
                pass
        try:
            qr = page.get_by_text(re.compile(r"escaneie o código qr|scan the qr code", re.I)).first
            if await qr.count() > 0 and await qr.is_visible() and not avisou_qr:
                log("📱 Escaneie o QR Code com seu celular para entrar no WhatsApp Web.")
                avisou_qr = True
        except Exception:
            pass
        await asyncio.sleep(1)
    raise RuntimeError("WhatsApp Web não ficou pronto. Tente novamente.")


async def abrir_chat(page, telefone):
    await page.goto(
        f"https://web.whatsapp.com/send?phone={telefone}&app_absent=0",
        wait_until="load", timeout=60_000,
    )
    await asyncio.sleep(2)
    for _ in range(40):
        if await numero_invalido(page):
            return False, "numero_invalido"
        caixa = await primeiro_visivel(chat_inputs(page), timeout=1000)
        if caixa:
            return True, "ok"
        await asyncio.sleep(1)
    return False, "timeout"


async def digitar(loc, page, texto):
    if not texto: return
    try:   await loc.click()
    except Exception: await loc.click(force=True)
    await asyncio.sleep(0.2)
    try:
        await loc.fill(texto)
        return
    except Exception:
        pass
    for i, linha in enumerate(texto.split("\n")):
        if linha: await page.keyboard.type(linha, delay=20)
        if i < len(texto.split("\n")) - 1:
            await page.keyboard.press("Shift+Enter")


async def aguardar_envio(page):
    for _ in range(45):
        dlg = page.locator("div[role='dialog']").first
        try:
            if await dlg.count() == 0:
                if await primeiro_visivel(chat_inputs(page), timeout=500):
                    return
            elif not await dlg.is_visible():
                return
        except Exception:
            if await primeiro_visivel(chat_inputs(page), timeout=500):
                return
        await asyncio.sleep(1)
    await asyncio.sleep(2)


async def enviar_para_cliente(page, nome, telefone, fotos):
    ok, motivo = await abrir_chat(page, telefone)
    if not ok:
        log(f"{'🚫 Número inválido' if motivo == 'numero_invalido' else '❌ Timeout'}: {nome} ({telefone})")
        return False

    await asyncio.sleep(2)

    # 1. Envia texto
    mensagem = montar_mensagem(nome)
    caixa = await primeiro_visivel(chat_inputs(page), timeout=TIMEOUT_MEDIO)
    if not caixa:
        log(f"❌ Sem caixa de texto para {nome}")
        return False

    await digitar(caixa, page, mensagem)
    await asyncio.sleep(0.5)
    botao = await primeiro_visivel(send_buttons(page), timeout=1500)
    if botao:
        try:    await botao.click()
        except Exception: await botao.click(force=True)
    else:
        await page.keyboard.press("Enter")
    await aguardar_envio(page)

    # 2. Aguarda 15s e envia fotos
    log("⏳ Aguardando 15s antes das imagens...")
    await asyncio.sleep(15)

    for i, lote in enumerate(chunks(fotos, MAX_FOTOS), 1):
        log(f"📤 Lote {i}: {len(lote)} foto(s)...")
        # Abre menu de anexo
        caixa2 = await primeiro_visivel(chat_inputs(page), timeout=TIMEOUT_MEDIO)
        if caixa2: await caixa2.click()
        await asyncio.sleep(0.4)
        btn_anexo = await primeiro_visivel(attach_buttons(page), timeout=1800)
        if not btn_anexo:
            log("⚠️ Botão de anexar não encontrado")
            continue
        await btn_anexo.click()
        await asyncio.sleep(0.8)

        # Seleciona arquivos
        for inp in file_inputs(page):
            try:
                if await inp.count() == 0: continue
                await inp.set_input_files(lote, timeout=TIMEOUT_MEDIO)
                await asyncio.sleep(1.5)
                break
            except Exception:
                pass

        # Envia sem legenda
        botao_enviar = await primeiro_visivel(send_buttons(page), timeout=1500)
        if botao_enviar:
            try:    await botao_enviar.click()
            except Exception: await botao_enviar.click(force=True)
        else:
            await page.keyboard.press("Enter")
        await aguardar_envio(page)
        await asyncio.sleep(2)

    log(f"✅ Enviado para {nome} ({telefone})")
    return True


# ══════════════════════════════════════════════════════════════════════════════
# 4. LOOP PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

async def executar_envios(chave: str, servidor: str):
    garantir_pastas()
    fotos = listar_fotos()
    if not fotos:
        log(f"❌ Sem fotos em: {PASTA_FOTOS}")
        return

    log(f"📸 {len(fotos)} foto(s) encontrada(s).")

    try:
        df = carregar_csv()
    except Exception as e:
        log(f"❌ {e}")
        return

    col_nome = detectar_col_nome(df)
    col_tel  = detectar_col_telefone(df)
    if not col_nome or not col_tel:
        log("❌ Colunas de nome/telefone não detectadas no CSV.")
        return

    enviados = carregar_enviados()
    log(f"♻️ {len(enviados)} contato(s) já enviado(s) serão ignorados.")

    sucessos, falhas, ignorados = [], [], []

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=PASTA_SESSAO,
            headless=HEADLESS,
            no_viewport=True,
            args=["--start-maximized"],
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()

        try:
            await esperar_whatsapp(page)
        except Exception as e:
            log(f"❌ {e}")
            await debug_screenshot(page, "whatsapp_erro")
            await ctx.close()
            return

        for _, linha in df.iterrows():
            nome = str(linha.get(col_nome, "Cliente")).strip() or "Cliente"
            tel  = limpar_numero(linha.get(col_tel))

            if not tel:
                ignorados.append(f"{nome} | sem_telefone")
                continue
            if tel in enviados:
                ignorados.append(f"{nome} | {tel} | ja_enviado")
                log(f"⏭️ Já enviado: {nome}")
                continue

            log("─" * 50)
            log(f"➡️  {nome} ({tel})")

            enviado = False
            for tentativa in range(1, TENTATIVAS + 1):
                try:
                    log(f"🔁 Tentativa {tentativa}/{TENTATIVAS}")
                    await fechar_dialogos(page)
                    enviado = await enviar_para_cliente(page, nome, tel, fotos)
                    if enviado: break
                except PlaywrightTimeoutError as e:
                    log(f"⚠️ Timeout (tentativa {tentativa}): {e}")
                    await debug_screenshot(page, f"timeout_{nome}")
                    try: await page.reload(wait_until="domcontentloaded")
                    except Exception: pass
                    await asyncio.sleep(3)
                except Exception as e:
                    log(f"⚠️ Erro (tentativa {tentativa}): {e}")
                    await debug_screenshot(page, f"erro_{nome}")
                    await fechar_dialogos(page)
                    await asyncio.sleep(3)

            if enviado:
                sucessos.append(f"{nome} | {tel}")
                registrar_enviado(tel)
                enviados.add(tel)
                pausa = random.randint(PAUSA_MIN, PAUSA_MAX)
                log(f"💤 Pausa {pausa}s...")
                await asyncio.sleep(pausa)
            else:
                falhas.append(f"{nome} | {tel}")
                log(f"❌ Falha definitiva: {nome}")

        await ctx.close()

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    salvar_relatorio(f"sucessos_{stamp}.txt", sucessos)
    salvar_relatorio(f"falhas_{stamp}.txt", falhas)
    salvar_relatorio(f"ignorados_{stamp}.txt", ignorados)

    log("=" * 50)
    log(f"🏁 FIM! ✅ {len(sucessos)} enviados | ❌ {len(falhas)} falhas | ⏭️ {len(ignorados)} ignorados")


async def main():
    print("\n" + "═" * 60)
    print("  AGENTE LOCAL — ROBÔ DE OFERTAS WHATSAPP v1.0.0")
    print("═" * 60 + "\n")

    config  = carregar_config()
    chave   = config.get("licenca", "chave", fallback="").strip().upper()
    servidor = config.get("licenca", "servidor", fallback="").strip().rstrip("/")

    if not chave or not servidor:
        print("❌ Configuração inválida. Execute com --reset para reconfigurar.")
        sys.exit(1)

    # Valida licença ANTES de qualquer ação
    verificar_licenca_ou_sair(chave, servidor)

    # Inicia revalidação periódica em background
    asyncio.create_task(loop_revalidacao(chave, servidor))

    # Executa o envio de ofertas
    await executar_envios(chave, servidor)


if __name__ == "__main__":
    asyncio.run(main())
