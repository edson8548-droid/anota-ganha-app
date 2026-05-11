# Checklist de Testes Manuais

## Extensão Disparador WhatsApp

1. Instalar `frontend/public/venpro-whatsapp-extension.zip` no Chrome.
2. Abrir uma aba do Venpro logado e manter a aba aberta.
3. Abrir `https://web.whatsapp.com/` e confirmar que a conta está conectada.
4. Abrir o painel lateral da extensão.
5. Confirmar que a campanha carrega contatos, fotos e mensagem.
6. Iniciar disparo com uma carteira pequena de teste.
7. Cancelar com `Cancelar e continuar depois`.
8. Iniciar novamente e confirmar que contatos já enviados são pulados.
9. Cancelar com `Cancelar e começar do zero`.
10. Iniciar novamente e confirmar que a campanha recomeça pelo primeiro contato.

## Extensão Cotatudo

1. Instalar `frontend/public/venpro-cotatudo-extension.zip` no Chrome.
2. Abrir uma cotação no Cotatudo.
3. Abrir uma aba do Venpro logado.
4. Confirmar que a extensão reconhece o token.
5. Processar uma cotação pequena e revisar preenchidos/não encontrados.

## Produção

1. Publicar backend antes de usar recursos que dependem de rotas novas.
2. Publicar frontend/ZIPs depois de recriar os pacotes das extensões.
3. Baixar a extensão pelo site publicado e repetir os testes acima.
