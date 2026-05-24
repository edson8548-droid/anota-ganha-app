# Onboarding do trial Venpro

Objetivo: aumentar a chance de o RCA criar valor nos primeiros dias de teste, sem transformar o onboarding em propaganda genérica.

## Implementado

### Dia 0 — Boas-vindas

Quando a conta é criada, o front-end chama `POST /api/users/welcome-email`.

O envio é não bloqueante:

- se `SENDGRID_API_KEY` e `SENDER_EMAIL` estiverem configurados, envia o email;
- se o email ainda não estiver configurado, o cadastro continua normal;
- se o envio falhar, o erro é registrado e o usuário continua no dashboard;
- se já enviou antes, não reenvia.

Email atual:

- assunto: `Bem-vindo ao Venpro`
- foco: 15 dias grátis e primeira ação prática na Cotação Pronta
- CTA: acessar `https://venpro.com.br`
- suporte: WhatsApp do Venpro

## Sequência recomendada para 15 dias

### Dia 2 — Vitrine Inteligente

Tema: depois da primeira cotação, transformar produtos em link de pedido.

Mensagem principal: o cliente recebe os itens com foto, preço e link pronto; o pedido volta pelo WhatsApp.

### Dia 5 — Carteira no WhatsApp

Tema: avisar a carteira sem copiar e colar contato por contato.

Mensagem principal: montar a oferta uma vez e enviar para os clientes certos.

### Dia 10 — Prova real

Tema: depoimento do Renato.

Mensagem principal: cotação que levava mais de 1 hora passou para cerca de 5 minutos.

### Dia 12 — Trial vencendo

Tema: faltam 3 dias para terminar o teste.

Mensagem principal: revisar o que já economizou de tempo e lembrar o plano de lançamento.

### Dia 14 — Último dia

Tema: encerrar teste com CTA claro.

Mensagem principal: assinar para continuar usando Cotação Pronta, Carteira no WhatsApp e Vitrine Inteligente.

## Próximos incrementos

1. Automatizar os emails dos dias 2, 5, 10, 12 e 14.
2. Criar email de pagamento recusado/vencido usando webhook do Asaas.
3. Medir Core Web Vitals no PageSpeed antes e depois do lançamento.
4. Avaliar cadastro com menos campos quando a operação estiver estável.
5. Criar 3 páginas/artigos de SEO:
   - Como fazer cotação de preços para representante comercial
   - Vitrine de produtos para representante: como enviar por WhatsApp
   - Tabela de preços para clientes: como montar e compartilhar

## Base de decisão

- Appcues recomenda onboarding curto, contextual e acionado por comportamento, não só por datas fixas.
  Fonte: https://www.appcues.com/user-onboarding
- Intercom recomenda mensagem de ativação quando o usuário cria conta mas não completa a primeira ação importante.
  Fonte: https://www.intercom.com/help/en/articles/425-the-activation-message
- Baremetrics trata pagamento falho como churn involuntário e recomenda sequência clara de dunning com CTA único.
  Fonte: https://baremetrics.com/blog/dunning-process
- web.dev define Core Web Vitals por LCP, INP e CLS no percentil 75; usar PageSpeed para medir antes de mexer.
  Fonte: https://web.dev/articles/defining-core-web-vitals-thresholds
- CXL e Baymard reforçam que campos demais aumentam fricção em formulários; reduzir CPF no cadastro deve ser testado depois porque hoje o CPF também protege contra duplicidade.
  Fontes: https://cxl.com/blog/form-design-best-practices/ e https://baymard.com/blog/checkout-flow-average-form-fields
