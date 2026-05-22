# Agenda Operacional Venpro

Use este arquivo como checklist recorrente quando for trabalhar no projeto.

Status:
- [ ] Pendente
- [x] Concluido

## Todo Dia Antes de Mexer no Projeto

- [ ] Conferir se `https://venpro.com.br` abre normalmente.
- [ ] Conferir se `https://api.venpro.com.br/health` esta `healthy` e `database: connected`.
- [ ] Verificar no GitHub Actions se o workflow `Uptime Monitor` nao falhou.
- [ ] Verificar no Render se o backend esta `Live/Deployed`.
- [ ] Anotar qualquer erro de usuario/assinante antes de fazer alteracao nova.

## Todo Dia Depois de Mexer no Projeto

- [ ] Rodar testes relevantes antes de publicar.
- [ ] Fazer deploy somente depois dos testes passarem.
- [ ] Conferir `https://api.venpro.com.br/health` depois do deploy.
- [ ] Conferir uma pagina principal do site depois do deploy.
- [ ] Se mexeu em pagamento, testar checkout/assinatura em ambiente controlado.
- [ ] Se mexeu em cotacao, testar uma cotacao pequena.

## Toda Semana

- [ ] Fazer backup manual do Mongo enquanto o Atlas estiver no plano Free.
- [ ] Copiar o backup para Google Drive, OneDrive, HD externo ou outro lugar seguro.
- [ ] Conferir se o arquivo de backup tem tamanho maior que zero.
- [ ] Conferir se nao entrou arquivo sensivel no Git.
- [ ] Revisar logs principais do Render.
- [ ] Revisar uso do Render e do Mongo Atlas.

Comando base do backup manual:

```powershell
& "C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe" --uri $uri --archive="C:\Users\edson\backups-venpro\venpro-backup-AAAA-MM-DD.gz" --gzip
```

Observacao:
Antes de rodar, a variavel `$uri` precisa estar definida no PowerShell com a `MONGO_URL` atual. Nao salvar nem enviar a `MONGO_URL` no chat ou no Git.

## Marcos de Crescimento

## Validacao Comercial Antes de Vender Para Mais Gente

### 1. Assinatura Asaas

- [ ] Criar conta teste como cliente novo.
- [ ] Fazer login com a conta teste.
- [ ] Fazer checkout pelo Asaas.
- [ ] Confirmar se o pagamento volta para o site corretamente.
- [ ] Confirmar se a assinatura ativa o acesso.
- [ ] Confirmar se o painel libera as ferramentas apos assinatura.
- [ ] Testar cancelamento de assinatura.
- [ ] Confirmar se o cancelamento mantem acesso ate o fim do periodo pago, quando aplicavel.

### 2. Cotacao Pronta

- [ ] Subir tabela real de precos.
- [ ] Subir uma cotacao pequena.
- [ ] Conferir se os precos encontrados batem com a tabela.
- [ ] Testar desconto/aumento por item.
- [ ] Baixar Excel final preenchido.
- [ ] Abrir o Excel final e conferir as linhas.
- [ ] Conferir mensagem de erro quando arquivo estiver errado.

### 3. Vitrine Inteligente

- [ ] Criar vitrine com pelo menos 3 produtos.
- [ ] Conferir nome, preco e foto dos produtos.
- [ ] Abrir link publico da vitrine no celular.
- [ ] Simular pedido como cliente.
- [ ] Confirmar se o pedido volta organizado para o WhatsApp do representante.
- [ ] Testar edicao de produto.
- [ ] Testar exclusao de produto.

### 4. Extensao Cotatudo

- [ ] Instalar extensao versao 1.0.16 pelo ZIP publicado no site.
- [ ] Testar em cotacao real.
- [ ] Conferir seletor Empresa A/B/C/D/E.
- [ ] Confirmar que nao preenche coluna errada.
- [ ] Testar quando alguns produtos nao tem preco.
- [ ] Escrever instrucao curta de instalacao para novos assinantes.

### 5. Suporte

- [ ] Configurar WhatsApp Business com nome Venpro.
- [ ] Colocar logo/foto oficial no WhatsApp Business.
- [ ] Criar mensagem automatica de saudacao.
- [ ] Criar mensagem de ausencia.
- [ ] Criar resposta rapida para instalacao do Cotatudo.
- [ ] Criar resposta rapida para problema de pagamento/assinatura.
- [ ] Criar resposta rapida para duvida de cotacao.

### 6. Campanha

- [ ] Criar Instagram oficial Venpro.
- [ ] Criar Facebook oficial Venpro.
- [ ] Configurar bio/perfil com link `https://venpro.com.br`.
- [ ] Publicar primeiro post fixado: o que e o Venpro e para quem serve.
- [ ] Conferir se o Reel 1 final esta pronto para trafego/anuncio.
- [ ] Finalizar ou refazer Reel 2 com voz natural e texto correto.
- [ ] Revisar carrossel final antes de publicar.
- [ ] Criar anuncios pagos do Dia 5.
- [ ] Definir primeiro publico de teste.
- [ ] Enviar material para 5 a 10 representantes conhecidos.
- [ ] Anotar duvidas frequentes para melhorar site e suporte.
- [ ] 2026-05-22: Verificar retorno da Higgsfield sobre devolucao de 202.5 creditos do Marketing Studio Video.
- [ ] 2026-05-22: Se nao houver resposta/devolucao, responder Higgsfield confirmando que CLI `account transactions --size 100 --json` nao mostra refund e `generate list --video --size 100 --json` nao mostra os videos.

### 7. Checklist de Lancamento

- [ ] Revisar a home no desktop.
- [ ] Revisar a home no celular.
- [ ] Decidir e aplicar ordem da home: ferramentas principais mais cedo na pagina.
- [ ] Confirmar que a home nao fala mais em assistente de IA integrado.
- [ ] Confirmar preco de lancamento `R$ 69,90`.
- [ ] Confirmar que o plano final aparece como `R$ 139,90` quando usado como referencia de preco cheio.
- [ ] Testar ZIP da extensao Carteira no WhatsApp 1.1.19 baixado pelo site.
- [ ] Testar ZIP da extensao Cotatudo baixado pelo site.
- [ ] Testar WhatsApp oficial de suporte no celular.
- [ ] Fazer backup manual do Mongo antes de divulgar para mais pessoas.

### Ao Chegar em 10 Assinantes

- [ ] Fazer teste real completo de assinatura.
- [ ] Testar recuperacao de senha.
- [ ] Testar cotacao com tabela real.
- [ ] Testar vitrine no celular.
- [ ] Testar suporte pelo WhatsApp oficial.

### Ao Chegar em 20 Assinantes

- [ ] Revisar uso de CPU/memoria no Render.
- [ ] Conferir se o limite de cotacoes simultaneas esta segurando bem.
- [ ] Revisar erros frequentes nos logs.
- [ ] Decidir se precisa melhorar plano do Render antes de campanhas maiores.

### Ao Chegar em 30 Assinantes

- [ ] Migrar MongoDB Atlas do plano Free para plano com backup automatico/snapshots.
- [ ] Ativar snapshot diario com retencao minima de 7 dias.
- [ ] Testar restore em ambiente separado.
- [ ] Manter backup manual por mais 2 semanas ate confiar nos snapshots.

### Ao Chegar em 50 Assinantes

- [ ] Fazer teste de carga simples na cotacao.
- [ ] Revisar plano do Render.
- [ ] Revisar limites do Mongo Atlas.
- [ ] Criar rotina de suporte e respostas rapidas.

### Ao Chegar em 100 Assinantes

- [ ] Separar processamento pesado de cotacao em worker/fila, se necessario.
- [ ] Melhorar alertas de erro e monitoramento.
- [ ] Revisar politica de backup e restore.
- [ ] Revisar custos mensais.

## Historico

- [x] 2026-05-21: Primeiro backup manual do Mongo criado em `C:\Users\edson\backups-venpro\venpro-backup.gz` com cerca de 3.6 MB.
- [x] 2026-05-21: Mercado Pago desativado; API passou a anunciar somente Asaas.
- [x] 2026-05-21: Senha do Mongo trocada e usuario deixou de usar permissao `atlasAdmin`.
- [x] 2026-05-21: Monitoramento `Uptime Monitor` criado no GitHub Actions.
- [x] 2026-05-21: Email da Higgsfield revisado; suporte ainda nao confirmou devolucao, pediu checagem no Dashboard/CLI.
- [x] 2026-05-21: CLI Higgsfield conferido com `account transactions --size 100 --json`; nao apareceu refund dos 202.5 creditos.
- [x] 2026-05-21: CLI Higgsfield conferido com `generate list --video --size 100 --json`; nao apareceram os tres videos do Marketing Studio Video.
