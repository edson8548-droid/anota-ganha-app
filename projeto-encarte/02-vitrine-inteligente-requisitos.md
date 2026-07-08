# Vitrine Inteligente — requisitos (Edson, 07/07/2026)

## A vitrine JÁ EXISTE no projeto (analisada em 07/07/2026)

- Backend: `backend/routes/vitrine.py` (~1.600 linhas). Frontend: `frontend/src/pages/Vitrine.jsx` + `VitrineEditar.jsx`.
- O que faz hoje: RCA cria oferta → adiciona produtos → gera link público (slug) →
  cliente abre o catálogo, monta pedido e finaliza via WhatsApp. Máx. 4 vitrines por conta.
- Entrada de produtos hoje é MANUAL: item a item ou colando lista de texto
  (`/parse-lista` aceita vários formatos). É o gap apontado pelo Edson: não puxa da tabela.
- Imagens hoje: upload manual + busca Google (Serper, com pontuação/filtros) +
  memória "aprender-imagem" por nome; armazenadas em GridFS (Mongo); logo do RCA.
- Tabelas enviadas pelo RCA ficam no Mongo, coleção `tabelas_mestre` (por user_id) —
  a ponte tabela→vitrine é viável direto.

## Integração tabela→vitrine — FEITA em 08/07/2026

1. Backend (`routes/vitrine.py`): `GET /api/vitrine/tabelas` (tabelas do RCA) +
   `GET /api/vitrine/tabelas/{id}/itens?prazo=7|14|21|28` — baixa o xlsx do GridFS
   e lê com `ler_tabela_mestre` (nome, EAN, preço do prazo, qtd caixa).
   Em `excel_processor.py` cada item da lista agora carrega o EAN (mudança aditiva).
2. Frontend: componente compartilhado `components/TabelaPickerModal.jsx` —
   escolhe tabela → prazo (default 7 dias) → busca + checkbox (mostra até 200,
   "Marcar filtrados") → adiciona ao estado local da tela. Botão "Puxar da tabela"
   nas DUAS telas: `Vitrine.jsx` (criar) e `VitrineEditar.jsx` (editar).
   Itens entram com preço unitário do prazo + qtd caixa e caem no fluxo existente
   de busca automática de foto (Serper + memória aprender-imagem); salvar continua
   pelo bulk existente. Validado: build vite OK, 250 testes backend + 30 frontend passando;
   leitor testado com a planilha Goiás real (6.494 itens, 100% com EAN, preço 7d confere).

## Fotos por EAN — integração PRONTA em 08/07/2026, aguarda upload

- Backend integrado: `backend/data/produtos_fotos.json` (ean→url) carregado em vitrine.py;
  `/tabelas/{id}/itens` devolve `foto_url`; `sugerir-imagem`/`sugerir-imagens` aceitam `ean`
  e devolvem a foto do banco antes da internet; itens puxados da tabela já entram com a foto.
- Hospedagem escolhida (08/07): **Firebase Hosting** (grátis; projeto está no plano Spark
  sem billing — Storage/GCS exigiria Blaze). `scripts/preparar_fotos_hosting.py` copia as
  APROVADO_EDSON para `frontend/public/fotos-produtos/<EAN>.webp` (pasta no .gitignore;
  o vite copia public/ no build, então todo deploy desta máquina inclui as fotos) e gera
  o json com URLs `https://venpro.com.br/fotos-produtos/<EAN>.webp` (cache 1 ano no
  firebase.json). ATENÇÃO: deploy de hosting feito de outra máquina sem essa pasta
  derruba as fotos do ar — rodar o script antes.
  (`scripts/subir_banco_fotos.py` é a variante Firebase Storage, guardada para se um dia
  ativar o Blaze.)
- Vila Nova (1.020 OK_AUTO) e Goiás (2.203 OK_AUTO, só 134 com arquivo) NÃO sobem até
  Edson revisar — regra: só APROVADO_EDSON. EANs repetem entre atacados, então o banco
  Destro já cobre parte das outras tabelas.

## Público e objetivo

Ferramenta para os **RCAs** montarem cartazes/vitrines de oferta com os preços das
tabelas capturadas e enviarem no WhatsApp para **compradores de supermercados**
(o comprador vê a oferta do atacado e compra para a loja dele).

## Fluxo principal (pedido do Edson)

1. RCA abre a vitrine e **escolhe a tabela que ele subiu** no site (Destro, Spani,
   Vila Nova, Goiás, Bate Forte...).
2. **Escolhe o prazo** de preço (coluna 7 / 14 / 21 / 28 dias) — exclusivo Venpro.
3. **Clica nos produtos** que quer ofertar (busca por nome/EAN).
4. Os itens **sobem direto para a vitrine inteligente**: foto (banco por EAN),
   preço do prazo escolhido e quantidade da caixa entram sozinhos, sem digitação.
5. Identidade do RCA no rodapé: nome/logo/WhatsApp + validade da oferta.
6. Saída: imagem vertical para WhatsApp + PDF A4 para imprimir; um clique para compartilhar.

## Dados já disponíveis

- **Tabelas**: importadas no site (backend `services/excel_processor.py` escolhe colunas
  por pontuação de cabeçalho). Desde o APK 0.9.22 as planilhas trazem colunas extras
  **"Embalagem"** (texto do card, ex. "CX24", "12X750GR") e **"Qtd caixa"** (número
  extraído com regra conservadora — ambíguo fica vazio). O importador atual ignora
  essas colunas ao buscar preço (sem risco de regressão).
- **Fotos**: banco local por EAN — ver `03-banco-de-imagens.md`.
- **Prazos por atacado**: já saem prontos nas planilhas do app.

## Visual: lição aprendida (NÃO repetir)

- Cards 100% programáticos (grade uniforme de retângulos) foram **reprovados** —
  visual mecânico. Exemplos do que evitar:
  `C:\Users\edson\Downloads\venpro-cards-ofertas-modelos-real`,
  `...\venpro-cards-ofertas-premium-v2`, `...\venpro-cards-ofertas-premium-v3`.
- Melhor resultado aprovado (referência de estilo):
  `C:\Users\edson\Downloads\venpro-cards-ofertas-ia\final-de-mes-arrasador-ia.png`
  (título em tipografia-arte, luz/textura, profundidade, produto grande, hierarquia).

## Arquitetura definida: híbrida em camadas

1. **Palco por IA, uma vez por tema**: fundo texturizado + título-arte + selo WhatsApp +
   barra CTA + etiquetas de preço vazias, com áreas reservadas para produtos.
   Cada tema aprovado vira template PNG reutilizável.
2. **Dados por código, sempre exatos**: fotos reais do banco nos slots + preços
   carimbados da tabela (preço NUNCA passa pela IA — nunca vem inventado).
3. **Anti-mecânico no compositor**: slots de tamanhos variados (produto herói maior),
   leve rotação nos cards, sombra sob produto, etiqueta glossy pré-renderizada.

## Status

- Projeto **pausado em 07/07/2026** ("vamos deixar esse projeto para depois").
- Próximo passo quando retomar: gerar o palco do primeiro tema (estilo da arte
  aprovada) + compositor (Python/PIL ou render no backend) lendo manifest + lista
  de EANs; validar visual com Edson antes de plugar no site.
- Pendências: subir banco de imagens para storage do site (decidir Firebase Storage
  vs estático no backend); coluna de quantidade no Excel da extensão Bate Forte.
