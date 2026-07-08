# Sobe as fotos aprovadas do banco local para o Firebase Storage e gera
# backend/data/produtos_fotos.json (ean -> url) usado pela vitrine.
#
# Requisitos:
#   1. Chave de conta de servico do Firebase salva em backend/serviceAccount.json
#      (Console Firebase > Configuracoes do projeto > Contas de servico >
#       Gerar nova chave privada). O arquivo esta no .gitignore.
#   2. Fotos em C:\Users\edson\Downloads\venpro-banco-imagens\<atacado>\imagens\<EAN>.webp
#   3. Manifests em projeto-encarte/manifests com revisao_visual = APROVADO_EDSON
#
# Uso: python scripts/subir_banco_fotos.py [--limite N]
# Pode rodar de novo com seguranca: pula o que ja esta no produtos_fotos.json.
import os
import sys
import csv
import glob
import json
import uuid
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRED = os.path.join(RAIZ, "backend", "serviceAccount.json")
SAIDA = os.path.join(RAIZ, "backend", "data", "produtos_fotos.json")
MANIFESTS = os.path.join(RAIZ, "projeto-encarte", "manifests")
BASE_IMGS = r"C:\Users\edson\Downloads\venpro-banco-imagens"
DIRS = {"destro": "destro", "vila_nova": "vila_nova", "goias": "goias_atacado"}

if not os.path.exists(CRED):
    print(f"FALTA A CHAVE: salve a conta de servico do Firebase em {CRED}")
    print("Console Firebase > Configuracoes do projeto > Contas de servico > Gerar nova chave privada")
    sys.exit(1)

import firebase_admin
from firebase_admin import credentials, storage

cred = credentials.Certificate(CRED)
projeto = json.load(open(CRED, encoding="utf-8"))["project_id"]
bucket_name = os.environ.get("FIREBASE_STORAGE_BUCKET", f"{projeto}.firebasestorage.app").strip()
firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})
bucket = storage.bucket()

# 1. Coletar aprovadas com arquivo local (EAN unico; Destro tem prioridade por cobertura)
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

# 2. Retomar de onde parou
mapa = {}
if os.path.exists(SAIDA):
    mapa = json.load(open(SAIDA, encoding="utf-8"))
fila = [(ean, c) for ean, c in itens.items() if ean not in mapa]
if "--limite" in sys.argv:
    fila = fila[: int(sys.argv[sys.argv.index("--limite") + 1])]
print(f"aprovadas: {len(itens)} | ja subidas: {len(mapa)} | a subir: {len(fila)}", flush=True)

def subir(ean, caminho):
    token = str(uuid.uuid4())
    blob = bucket.blob(f"produtos/{ean}.webp")
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.cache_control = "public, max-age=31536000"
    blob.upload_from_filename(caminho, content_type="image/webp")
    return ean, (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}"
        f"/o/produtos%2F{ean}.webp?alt=media&token={token}"
    )

def salvar():
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(mapa, f, indent=0, sort_keys=True)

inicio = time.time()
ok = erros = 0
with ThreadPoolExecutor(max_workers=8) as ex:
    futs = {ex.submit(subir, e, c): e for e, c in fila}
    for fut in as_completed(futs):
        try:
            ean, url = fut.result()
            mapa[ean] = url
            ok += 1
        except Exception as exc:
            erros += 1
            print(f"ERRO {futs[fut]}: {exc}", flush=True)
        if ok % 200 == 0:
            salvar()
        if (ok + erros) % 500 == 0:
            print(f"{ok + erros}/{len(fila)} ({time.time() - inicio:.0f}s)", flush=True)
salvar()
print(f"FIM: {ok} subidas, {erros} erros, {time.time() - inicio:.0f}s | total no mapa: {len(mapa)}", flush=True)
print(f"Mapa salvo em {SAIDA} — commitar e fazer deploy do backend.")
