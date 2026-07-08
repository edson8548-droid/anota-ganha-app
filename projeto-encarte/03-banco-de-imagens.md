# Banco de imagens de produtos (estado em 07/07/2026)

Fotos reais dos produtos, separadas por atacadista, nomeadas por **EAN** (.webp 900x900,
otimizadas). Origem: sites dos próprios atacados, com revisão manual do Edson
(coluna `revisao_visual = APROVADO_EDSON` nos manifests).

## Localização (original, no PC do Edson)

| Atacado | Imagens | Linhas no manifest | Cobertura |
|---|---|---|---|
| Destro | `C:\Users\edson\Downloads\venpro-banco-imagens\destro\imagens` | 6.132 fotos / 6.182 itens | ~99% |
| Vila Nova | `C:\Users\edson\Downloads\venpro-banco-imagens\vila_nova\imagens` | 1.203 fotos / 3.681 itens | ~33% |
| Goiás | `C:\Users\edson\Downloads\venpro-banco-imagens\goias_atacado\imagens` | 134 fotos / 6.494 itens | ~2% |

Cópias dos manifests nesta pasta: `manifests/`.

## Formato do manifest (CSV)

Colunas: `row, produto, ean, preco_7_dias, preco_14_dias, preco_21_dias, preco_28_dias,
status, revisao_visual, observacao, source, source_page, image_url, title_found,
optimized_path, optimized_bytes, original_width, original_height, processed_at`

- `optimized_path` aponta para o arquivo local `<EAN>.webp`.
- `status` indica a qualidade do match (ex.: `OK_DESTRO`, `REVISAR_MATCH_DESTRO`).

## Uso na vitrine

- Lookup direto por EAN: o item clicado na tabela acha a foto pelo EAN no nome do arquivo.
- **EANs repetem entre atacados** — a mesma foto serve para qualquer tabela; na falta
  da foto no atacado da tabela, buscar o mesmo EAN nos outros bancos.
- Gaps: Vila Nova e Goiás precisam completar fotos (rodar a mesma coleta usada na Destro),
  ou aceitar card sem foto com fallback de etiqueta maior.

## Plano de subida para o site (pendente)

1. Decidir storage: Firebase Storage (projeto já usa Firebase) ou pasta estática no backend.
2. Subir como `<EAN>.webp` mantendo o nome — o lookup continua por EAN.
3. Importar manifests para o banco do site (coleção/tabela `produtos_fotos`:
   ean, atacado, status, caminho/URL).
4. Só subir itens com `revisao_visual = APROVADO_EDSON`.
