# Copia as fotos APROVADO_EDSON do banco local para frontend/public/fotos-produtos/
# (servidas pelo Firebase Hosting em https://venpro.com.br/fotos-produtos/<EAN>.webp)
# e gera backend/data/produtos_fotos.json (ean -> url) usado pela vitrine.
#
# A pasta fotos-produtos esta no .gitignore (266MB fora do git); o vite copia
# public/ para build/ em todo build, entao qualquer deploy desta maquina inclui
# as fotos automaticamente.
#
# Uso: python scripts/preparar_fotos_hosting.py
import os
import csv
import glob
import json
import shutil
import hashlib

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "frontend", "public", "fotos-produtos")
SAIDA = os.path.join(RAIZ, "backend", "data", "produtos_fotos.json")
MANIFESTS = os.path.join(RAIZ, "projeto-encarte", "manifests")
BASE_IMGS = r"C:\Users\edson\Downloads\venpro-banco-imagens"
DIRS = {"destro": "destro", "vila_nova": "vila_nova", "goias": "goias_atacado"}
URL_BASE = "https://venpro.com.br/fotos-produtos"

itens = {}
for m in sorted(glob.glob(os.path.join(MANIFESTS, "*.csv"))):
    nome = os.path.basename(m).lower()
    atac = "destro" if "destro" in nome else ("vila_nova" if "vila" in nome else "goias")
    with open(m, encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            if (row.get("revisao_visual") or "").strip() != "APROVADO_EDSON":
                continue
            ean = (row.get("ean") or "").strip()
            if not ean:
                continue
            caminho = os.path.join(BASE_IMGS, DIRS[atac], "imagens", ean + ".webp")
            if os.path.exists(caminho):
                itens.setdefault(ean, caminho)

# Fotos salvas à mão pelo Edson (Downloads\venpro-banco-imagens\manuais\<EAN>.jpg/png/webp)
# têm prioridade sobre as do manifest e são convertidas para webp 900x900.
MANUAIS = os.path.join(BASE_IMGS, "manuais")
manuais = 0
if os.path.isdir(MANUAIS):
    from PIL import Image
    for arq in sorted(glob.glob(os.path.join(MANUAIS, "*.*"))):
        base, ext = os.path.splitext(os.path.basename(arq))
        ean = "".join(ch for ch in base if ch.isdigit())
        if not (8 <= len(ean) <= 14) or ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
            continue
        webp = os.path.join(MANUAIS, ean + ".otimizada.webp")
        if not os.path.exists(webp) or os.path.getmtime(webp) < os.path.getmtime(arq):
            img = Image.open(arq).convert("RGB")
            img.thumbnail((900, 900))
            fundo = Image.new("RGB", (900, 900), (255, 255, 255))
            fundo.paste(img, ((900 - img.width) // 2, (900 - img.height) // 2))
            fundo.save(webp, "WEBP", quality=85)
        itens[ean] = webp
        manuais += 1
if manuais:
    print(f"fotos manuais incluidas: {manuais}")

os.makedirs(DESTINO, exist_ok=True)
mapa = {}
copiadas = puladas = 0
for ean, origem in itens.items():
    destino = os.path.join(DESTINO, ean + ".webp")
    if not os.path.exists(destino) or os.path.getsize(destino) != os.path.getsize(origem):
        shutil.copy2(origem, destino)
        copiadas += 1
    else:
        puladas += 1
    # ?v= muda quando a foto muda — fura o cache de 1 ano em correções
    versao = hashlib.md5(open(destino, "rb").read()).hexdigest()[:8]
    # chave na forma canônica (sem zero à esquerda) = mesma do limpar_ean do site;
    # a URL/arquivo mantém o EAN original (o nome do .webp não muda)
    chave = ean.lstrip("0") or ean
    mapa.setdefault(chave, f"{URL_BASE}/{ean}.webp?v={versao}")

os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
with open(SAIDA, "w", encoding="utf-8") as f:
    json.dump(mapa, f, indent=0, sort_keys=True)

print(f"fotos aprovadas: {len(itens)} | copiadas agora: {copiadas} | ja estavam: {puladas}")
print(f"mapa: {SAIDA} ({len(mapa)} EANs)")
print("Proximos passos: npm run build no frontend, firebase deploy --only hosting,")
print("commit do produtos_fotos.json e push (Render deploya o backend).")
