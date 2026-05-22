# Agenda de Liberacao dos Assinantes - Venpro

Status:
- [ ] Pendente
- [x] Concluido

## 1. Numero Oficial de Suporte

- [x] Comprar chip exclusivo para suporte.
- [x] Numero oficial definido: `+55 13 99638-2430` (`5513996382430` para links WhatsApp).
- [ ] Definir se o numero sera usado em WhatsApp Business.
- [ ] Criar perfil no WhatsApp Business com nome Venpro.
- [ ] Colocar foto/logo novo do Venpro.
- [ ] Escrever descricao curta do atendimento.
- [ ] Criar mensagem automatica de saudacao.
- [ ] Criar mensagem de ausencia.
- [x] Atualizar o numero no site e nos botoes de suporte.
- [ ] Atualizar o numero nas mensagens de divulgacao.
- [ ] Testar clique no botao de WhatsApp pelo celular.
- [x] Substituir numero antigo de suporte nos arquivos do frontend.
- [x] Substituir contatos antigos nas paginas legais.
- [x] Definir email oficial de suporte: `suportevenpro@gmail.com`.
- [ ] Configurar resposta rapida para instalacao da extensao Cotatudo.
- [ ] Configurar resposta rapida para problema de pagamento/assinatura.

Sugestao de descricao:
Ferramentas para representantes comerciais: cotacao, Cotatudo, vitrine de ofertas e WhatsApp.

Mensagem de saudacao sugerida:
Ola! Voce esta falando com o suporte Venpro. Me diga seu nome, empresa e qual ferramenta precisa de ajuda: Cotacao, Cotatudo, Vitrine ou WhatsApp.

## 1.1 Dados da Empresa / MEI

- [x] Confirmar nome empresarial da MEI.
- [ ] Alterar nome fantasia da MEI para Venpro, se ainda nao estiver assim.
- [x] Confirmar CNPJ da MEI para colocar nas politicas legais.
- [x] Salvar CCMEI completo em pasta privada do projeto.
- [ ] Decidir como exibir publicamente: `Venpro` como marca/nome fantasia e razao social apenas nas paginas legais.
- [ ] Validar com contador se a ocupacao/CNAE atual do MEI serve para assinatura Venpro ou se precisa alterar enquadramento/atividade.
- [x] Atualizar Politica de Privacidade com email e WhatsApp oficial.
- [x] Atualizar pagina de Exclusao de Conta com email e WhatsApp oficial.
- [ ] Atualizar dados do Asaas/checkout para aparecer Venpro para o cliente quando possivel.
- [x] Atualizar `ASAAS_WEBHOOK_TOKEN` no Render.
- [x] Confirmar se `ASAAS_API_KEY` da conta CNPJ esta atualizada no Render.
- [x] Criar ou atualizar webhook do Asaas usando o mesmo token configurado no Render.
- [ ] Conferir se boleto/cobranca mostra nome correto para o assinante.

## 2. Testes Antes de Liberar Assinantes

- [ ] Criar uma conta nova como se fosse cliente.
- [ ] Fazer login com essa conta.
- [ ] Verificar se os 15 dias gratis aparecem corretamente.
- [ ] Testar bloqueio quando nao tem assinatura ativa.
- [ ] Testar fluxo de checkout/assinatura.
- [ ] Confirmar se o pagamento ativa o acesso corretamente.
- [ ] Confirmar se o usuario consegue acessar o painel apos assinar.
- [ ] Testar recuperacao de senha.
- [ ] Testar logout e novo login.

## 3. Cotacao Pronta

- [ ] Cadastrar tabela de preco.
- [ ] Testar tabela com prazos 7, 14, 21 e 28 dias.
- [ ] Processar uma cotacao pequena.
- [ ] Conferir se os precos encontrados estao corretos.
- [ ] Testar modo EAN apenas.
- [ ] Testar modo completo.
- [ ] Verificar mensagem de erro quando arquivo estiver errado.
- [ ] Baixar resultado preenchido.
- [ ] Abrir o Excel final e conferir linhas preenchidas.

## 4. Extensao Cotatudo

- [x] Publicar ZIP 1.0.16 no site.
- [x] Confirmar que instala como versao 1.0.16.
- [ ] Testar em cotacao real com uma empresa.
- [ ] Testar em cotacao real com Empresa A.
- [ ] Testar em cotacao real com Empresa B.
- [ ] Testar se o seletor Empresa A/B/C/D/E aparece no popup.
- [ ] Confirmar que nao preenche coluna errada.
- [ ] Testar quando alguns produtos nao tem preco.
- [ ] Escrever instrucao curta de instalacao para novos assinantes.

## 5. Vitrine Inteligente

- [ ] Criar uma vitrine nova.
- [ ] Adicionar produtos com preco.
- [ ] Testar busca/uso de imagem do produto.
- [ ] Abrir link publico da vitrine no celular.
- [ ] Simular pedido pelo cliente.
- [ ] Confirmar se o pedido chega organizado no WhatsApp.
- [ ] Testar edicao de vitrine.
- [ ] Testar exclusao de produto.

## 6. WhatsApp / Carteira / Campanhas

- [ ] Criar campanha de teste.
- [ ] Importar ou selecionar clientes.
- [ ] Gerar mensagem.
- [ ] Testar envio com poucos contatos.
- [ ] Conferir se o progresso aparece corretamente.
- [ ] Conferir se pausou/retomou corretamente.
- [ ] Confirmar limites e orientacoes para evitar bloqueio no WhatsApp.

## 7. Pagina do Site

- [ ] Conferir home no desktop.
- [ ] Conferir home no celular.
- [ ] Conferir pagina de planos.
- [ ] Conferir botao de cadastro.
- [ ] Conferir botao de login.
- [ ] Conferir botao de WhatsApp/suporte.
- [ ] Conferir textos prometendo resultado sem exagero.
- [ ] Conferir se o video promocional abre corretamente.
- [ ] Conferir se o ZIP da extensao baixa corretamente.
- [ ] Trocar video da home para o novo video promocional, se for usar ele no site.
- [ ] Revisar Politica de Privacidade com dados da empresa.
- [ ] Revisar pagina de Exclusao de Conta com dados da empresa.
- [ ] Revisar `frontend/public/manifest.json` apos troca definitiva de logo/dominio.
- [ ] Decidir se app Android/TWA ainda sera usado; se sim, trocar nome antigo "Anota & Ganhe Incentivos".

## 8. Material de Divulgacao

- [x] Criar carrossel de 5 slides para WhatsApp.
- [x] Criar video promocional com slides, voz e musica.
- [ ] Criar perfil oficial Venpro no Instagram.
- [ ] Criar pagina oficial Venpro no Facebook.
- [ ] Usar o mesmo logo, nome e descricao curta nas duas redes.
- [ ] Colocar link `https://venpro.com.br` na bio/perfil.
- [ ] Criar destaques no Instagram: `Como funciona`, `Cotacao`, `Vitrine`, `WhatsApp`, `Planos`.
- [ ] Publicar primeiro post fixado explicando o que e o Venpro.
- [ ] Publicar Reel 1 como primeiro conteudo de alcance.
- [ ] Publicar carrossel com as ferramentas principais.
- [ ] Definir se sera usado Meta Business Suite para anuncios.
- [ ] Revisar texto final da mensagem de WhatsApp.
- [ ] Definir primeiro publico de teste.
- [ ] Enviar para 5 a 10 representantes conhecidos.
- [ ] Anotar duvidas mais frequentes.
- [ ] Ajustar pagina/mensagem com base nas duvidas.

Mensagem curta sugerida:
Representante, olha essa ferramenta que criei para ganhar tempo no dia a dia.

O Venpro ajuda com cotacao, preenchimento no Cotatudo, vitrine de ofertas e pedidos pelo WhatsApp.

Menos tempo digitando, menos erro e mais tempo vendendo.

Veja o video e teste aqui:
https://venpro.com.br

## 9. Liberacao Controlada

- [ ] Liberar primeiro para 5 usuarios.
- [ ] Acompanhar uso por 2 dias.
- [ ] Corrigir problemas encontrados.
- [ ] Liberar para mais 10 usuarios.
- [ ] Acompanhar duvidas de suporte.
- [ ] Ajustar tutorial/FAQ.
- [ ] So depois abrir divulgacao mais ampla.

## 10. Pendencias Para Decidir

- [ ] Valor final da assinatura.
- [ ] Se vai ter cupom de lancamento.
- [ ] Quantos dias gratis manter.
- [ ] Decidir ordem final da home: minha recomendacao e subir as ferramentas principais logo apos o hero, antes de depoimentos, planos e FAQ.
- [ ] Horario oficial de suporte.
- [ ] Politica de cancelamento/reembolso.
- [ ] Texto final dos termos comerciais.
- [ ] Se o Mercado Pago fica desativado de vez ou removemos telas/codigo antigo.
- [ ] Se a extensao Carteira no WhatsApp sera liberada no primeiro lote ou depois.

## 10.2 Checklist de Lancamento Publico

Prioridade alta antes de anunciar para mais gente:

- [ ] Testar fluxo completo com conta nova: cadastro, login, teste gratis, assinatura Asaas, acesso liberado.
- [ ] Testar recuperacao de senha com email real.
- [ ] Testar Cotacao Pronta com tabela real e uma cotacao pequena.
- [ ] Testar desconto/aumento por item na Cotacao Pronta.
- [ ] Testar extensao Cotatudo instalada pelo ZIP do site.
- [ ] Testar Vitrine Inteligente pelo celular como se fosse cliente comprando.
- [ ] Testar Carteira no WhatsApp versao 1.1.19 com poucos contatos.
- [ ] Confirmar se a Carteira no WhatsApp conta progresso corretamente e nao volta numero.
- [ ] Confirmar se cancelar e continuar depois funciona.
- [ ] Confirmar se comecar do zero zera enviados corretamente.
- [ ] Revisar home no desktop e celular.
- [ ] Revisar se a primeira dobra da home mostra claramente o que o Venpro faz.
- [ ] Revisar se as ferramentas principais aparecem cedo o suficiente na pagina.
- [ ] Revisar pagina de planos com preco de lancamento `R$ 69,90`.
- [ ] Conferir se nenhum texto promete IA integrada onde hoje usamos prompt copiavel.
- [ ] Conferir politica de privacidade, termos comerciais e exclusao de conta.
- [ ] Conferir botoes de WhatsApp e email de suporte.
- [ ] Criar Instagram oficial Venpro.
- [ ] Criar Facebook oficial Venpro.
- [ ] Publicar pelo menos 3 conteudos iniciais antes de rodar trafego: Reel 1, carrossel das ferramentas e post do preco de lancamento.
- [ ] Criar mensagem padrao para enviar a representantes conhecidos.
- [ ] Criar roteiro curto de atendimento para primeiras duvidas no WhatsApp Business.
- [ ] Fazer backup manual do Mongo antes da divulgacao.

Decisao recomendada sobre a home:
As ferramentas principais devem ficar mais em cima. O visitante precisa entender nos primeiros segundos que o Venpro resolve cotacao, vitrine, WhatsApp e acompanhamento de carteira. Minha sugestao e manter o hero curto e logo depois mostrar os cards/prints das ferramentas. Plano, depoimentos e FAQ podem vir depois.

## 10.1 Infraestrutura / Backup Mongo

- [x] Confirmado em 2026-05-21: cluster MongoDB Atlas atual esta no plano Free.
- [x] Confirmado em 2026-05-21: banco pequeno, cerca de 6.5 MB.
- [x] Confirmado em 2026-05-21: usuario do Mongo deixou de ser atlasAdmin e senha foi trocada.
- [x] Primeiro backup manual criado em 2026-05-21 em `C:\Users\edson\backups-venpro\venpro-backup.gz`.
- [ ] Fazer backup manual periodico enquanto estiver no plano Free.
- [ ] Quando chegar em 30 assinantes pagantes, migrar MongoDB Atlas para plano com backup automatico/snapshots.
- [ ] Ao migrar, ativar politica simples de backup: snapshot diario com retencao minima de 7 dias.
- [ ] Depois da migracao, testar restore em ambiente separado antes de depender do backup.

Decisao:
Manter MongoDB Atlas Free por enquanto e fazer backup manual. Ao atingir 30 assinantes, assinar/migrar para plano com backup automatico.

## 11. Achados da Varredura do Projeto

- [x] Numero antigo de suporte trocado para `5513996382430` em `Dashboard.js`, `Landing.js`, `Login.js` e `WhatsAppButton.js`.
- [x] Fallback antigo `suporte@anotaganha.com` trocado para `suportevenpro@gmail.com` no backend Mercado Pago.
- [x] Documento `DEPLOY_RENDER.md` atualizado para email Venpro.
- [ ] `android-app/twa-manifest.json` ainda usa nome antigo `Anota & Ganhe Incentivos`; decidir se esse app sera mantido.
- [ ] `backend/DEPLOY.md` ainda usa titulo antigo `Anota Ganha App`; ajustar quando revisar docs de deploy.
- [x] Contato pessoal antigo da politica de privacidade trocado por dados oficiais.
- [x] Contato pessoal antigo da pagina de exclusao de conta trocado por dados oficiais.
- [x] Dados da MEI confirmados via CCMEI e salvos em pasta privada; ainda precisam ser inseridos/ajustados nas paginas legais quando voce confirmar contato oficial.

## Baixas Recentes

- 2026-05-16: Testes tecnicos executados: API producao `/health` respondeu 200, webhook Asaas recusou chamada sem token com 401, 11 testes backend passaram, build frontend passou e 20 testes frontend passaram.
- 2026-05-16: Varredura ampla encontrou contatos antigos, docs antigas e pendencias legais para liberar assinantes.
- 2026-05-16: Numero oficial de suporte definido como `+55 13 99638-2430`; links WhatsApp atualizados para `5513996382430`.
- 2026-05-16: `ASAAS_WEBHOOK_TOKEN` atualizado no Render pelo usuario.
- 2026-05-16: `ASAAS_API_KEY` da conta CNPJ atualizada no Render pelo usuario.
- 2026-05-16: Webhook Asaas configurado com URL `https://api.venpro.com.br/api/asaas/webhook` e token proprio, separado da chave API.
- 2026-05-16: Contatos antigos das paginas legais trocados para `suportevenpro@gmail.com` e WhatsApp oficial.
- 2026-05-16: Fallback de email antigo do Mercado Pago trocado para `suportevenpro@gmail.com`.
- 2026-05-16: PDF do MEI salvo em `docs/private/mei/MEI.pdf`; dados principais salvos em `docs/private/mei/dados-mei.md` e memoria local do Codex.
- 2026-05-16: CCMEI salvo em `docs/private/mei/CCMEI-59560700000183.pdf`; dados cadastrais completos atualizados no resumo privado e memoria local.
- 2026-05-15: Extensao Cotatudo atualizada para 1.0.16 com seletor Empresa A/B/C/D/E.
- 2026-05-15: ZIP da extensao publicado no Firebase Hosting.
- 2026-05-15: Carrossel WhatsApp criado com logo novo.
- 2026-05-15: Video promocional criado com slides, voz, musica e movimento.
