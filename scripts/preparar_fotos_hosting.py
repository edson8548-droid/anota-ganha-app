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
    mapa[ean] = f"{URL_BASE}/{ean}.webp"

os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
with open(SAIDA, "w", encoding="utf-8") as f:
    json.dump(mapa, f, indent=0, sort_keys=True)

print(f"fotos aprovadas: {len(itens)} | copiadas agora: {copiadas} | ja estavam: {puladas}")
print(f"mapa: {SAIDA} ({len(mapa)} EANs)")
print("Proximos passos: npm run build no frontend, firebase deploy --only hosting,")
print("commit do produtos_fotos.json e push (Render deploya o backend).")
