# Funcionalidades mapeadas (referência: QROfertas, analisado em 07/07/2026)

Mapa das funcionalidades do gerador de encartes concorrente (qrofertas.com/criar-jornal/builder-v2),
levantado pela análise do HTML/endpoints da ferramenta. **Clonamos funcionalidades, não artes nem
código** — temas e visual têm que ser próprios da Venpro.

## Núcleo do produto

1. **Biblioteca de temas prontos por ocasião** (recurso central)
   - Centenas de templates segmentados por rotina do varejo: "Quarta da Carne",
     "Sexta do Açougue", "Quarta do Hortifruti", "Dia da Cerveja", datas comemorativas,
     campanhas genéricas ("Mega Oferta", "Oferta Relâmpago").
   - Usuário pode favoritar temas; existe seção "Novos Temas".
   - O lojista não cria arte: escolhe o tema do dia e preenche com produtos.

2. **Etiquetas de preço** (o item mais referenciado no código da ferramenta)
   - Modelos de splash/etiqueta que formatam o preço automaticamente sobre a arte.

3. **Banco e cadastro de produtos**
   - API própria de produtos (criar/gerenciar/buscar).
   - Upload de foto do produto.
   - **Busca em banco de imagens** (digita o nome e acha a foto pronta).
   - Menção a remoção de fundo de imagem.

4. **Multi-formato da mesma arte**
   - Encarte A4/PDF (impressão), cartaz, post de feed, stories.
   - **TV indoor** ("Publicar na TV"): URL de slideshow para smart TV da loja.
   - Vídeo das ofertas.

5. **Render no servidor** (job assíncrono de geração de arte/vídeo).

6. **Narração por IA com sistema de créditos** (locução estilo "carro de som"
   para vídeo/TV).

7. **Publicação assistida**
   - "Publicação Turbo" (publicar em canais).
   - **Sugestão de texto do post** gerada automaticamente.
   - Integração WhatsApp / Instagram / Facebook.
   - Impressão e download direto.
   - QR code no encarte levando ao jornal digital de ofertas.

8. **Conta/assinatura** com planos; push notifications (Firebase).

## Endpoints observados (dimensão do escopo, não copiar)

- produtos: criar / gerenciar / campos / busca
- temas: campos de tema
- render: job assíncrono v2 (arte e vídeo)
- narração: modal + geração com créditos
- busca de imagens de produto + upload de imagem
- sugestão de post (texto pronto para publicação)

## Prioridade para a Venpro (decidida com Edson em 07/07/2026)

- **Fase 1**: vitrine inteligente / cartaz a partir da tabela capturada (ver `02-vitrine-inteligente-requisitos.md`).
- **Fase 2**: formatos sociais (feed/stories) + sugestão de texto + envio WhatsApp.
- **Fase 3**: TV indoor (slideshow por URL); vídeo/narração só se os clientes pedirem.

Diferencial Venpro sobre o QROfertas: lá o lojista digita produto e preço um por um;
aqui a tabela capturada já entrega nome + EAN + preço + prazo + qtd caixa, e o banco
de fotos por EAN preenche a imagem sozinho.
